
    import * as THREE from "three";
    import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
    import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";
    import { VEHICLES, VEHICLE_CATEGORIES, loadNasaVehicle, disposeNasaVehicle, disposeModelDecoder } from './nasa-vehicles.mjs';

    const detailGeometries = new Map();
    const texturePromises = [];
    let simulatedTime = 0, paused = false, follow = true, freeFlight = false;
    let speedFactor = 1, trackCursor = 0, lastTrackDistance = 0;
    const keys = new Set(), suspensionLinks = [], trackCapacity = 2600;
    let sunLight, trackMesh, terrainMaterial;
    let activeNasa = null, selectedVehicle = 'concept', vehicleRequest = 0;
    let focusCurrentVehicle = () => {};
    let vehicleLoadQueue = Promise.resolve();
    const modelAnchor = new THREE.Vector3();
    let modelArrivalTime = 0;
    const groundScratch = new THREE.Vector3();
    const motionScratch = new THREE.Vector3();
    const footScratch = new THREE.Vector3();
    const worldScratch = new THREE.Vector3();
    let readyForFrame = false;
    const TAU = Math.PI * 2;
    const clamp = THREE.MathUtils.clamp;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020308);

    const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.05, 2400);
    camera.position.set(13.8, 9.2, 17.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    document.body.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.minDistance = 2.6;
    controls.maxDistance = 195;
    controls.maxPolarAngle = Math.PI * 0.499;
    controls.screenSpacePanning = false;
    controls.update();

    const clock = new THREE.Clock();
    const rover = new THREE.Group();
    rover.name = "Lunar Surveyor L-03";
    scene.add(rover);

    const baseForward = new THREE.Vector3(0, 0, 1);
    const baseUp = new THREE.Vector3(0, 1, 0);

    const disposable = [];
    const wheelPivots = [];
    const dust = [];
    const loader = document.getElementById("loading");
    const distanceElement = document.getElementById("distance");
    const gradeElement = document.getElementById("grade");

    const rnd = mulberry32(9062026);
    const terrainSize = 540;
    const terrainResolution = 512;
    const craterField = buildCraters();

    const terrainTexture = makeRegolithTexture();
    const terrainDiffuse = loadTerrainTexture("./assets/gravel_stones_diff_2k.jpg", THREE.SRGBColorSpace);
    const terrainNormal = loadTerrainTexture("./assets/gravel_stones_nor_gl_2k.jpg");
    const terrainRoughness = loadTerrainTexture("./assets/gravel_stones_rough_2k.jpg");
    const terrain = makeTerrain();
    scene.add(terrain);
    scene.add(makeRockField());
    scene.add(makeStarfield());
    scene.add(makeDistantMountains());

    setupLighting();
    buildRover();
    consolidateStaticDetails(rover);
    const conceptRoot = new THREE.Group();
    conceptRoot.name = 'L-03 concept rover';
    for (const child of [...rover.children]) conceptRoot.add(child);
    rover.add(conceptRoot);
    const conceptBounds = new THREE.Box3().setFromObject(conceptRoot);
    setupTracks();
    const dustCloud = makeDustCloud();
    scene.add(dustCloud);

    const initialTraverse = traverseAt(0);
    const initialGroundY = heightAt(initialTraverse.x, initialTraverse.z);
    controls.target.set(initialTraverse.x, initialGroundY + 2.3, initialTraverse.z);
    camera.position.set(initialTraverse.x + 12.5, initialGroundY + 6.8, initialTraverse.z + 15.5);
    controls.update();
    let userNavigating = false;
    controls.addEventListener("start", () => { userNavigating = true; });

    const tempForward = new THREE.Vector3();
    const tempRight = new THREE.Vector3();
    const tempNormal = new THREE.Vector3();
    const tempMatrix = new THREE.Matrix4();
    let traverseDistance = 0;
    let previousRoverPosition = new THREE.Vector3();
    let previousTerrainPoint = new THREE.Vector3();

    setupInterface();
    if(camera.aspect < 0.85) camera.position.sub(controls.target).multiplyScalar(1.65).add(controls.target);
    controls.update();
    const firstVehicle = switchVehicle('perseverance');
    Promise.all([...texturePromises, firstVehicle]).then(() => {
      readyForFrame = true;
      clock.start();
      animate();
      requestAnimationFrame(() => loader.classList.add("done"));
    });

    function animate() {
      const delta = Math.min(clock.getDelta(), 0.05);
      const dt = paused ? 0 : delta * speedFactor;
      simulatedTime += dt;
      updateRover(simulatedTime, dt);
      updateDust(delta);
      updateFlight(delta);
      controls.update();
      const ground = heightAt(camera.position.x,camera.position.z);
      if(camera.position.y < ground + .3) camera.position.y = ground + .3;
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    function updateRover(time, delta) {
      const mode=activeNasa?.definition.mode||'rover',cruising=mode==='rover';
      const current=cruising?traverseAt(time):modelAnchor, next=cruising?traverseAt(time+.08):{x:current.x,z:current.z+1};
      const x=current.x,z=current.z,groundY=heightAt(x,z);
      tempForward.set(next.x-x,0,next.z-z).normalize();
      const footprint=activeNasa?Math.max(.65,activeNasa.size.x*.45):2.4;
      tempNormal.set(heightAt(x-footprint,z)-heightAt(x+footprint,z),footprint*2,heightAt(x,z-footprint)-heightAt(x,z+footprint)).normalize();
      if(mode==='hover')tempNormal.set(0,1,0);
      tempRight.crossVectors(tempNormal,tempForward).normalize();
      tempForward.crossVectors(tempRight,tempNormal).normalize();
      tempMatrix.makeBasis(tempRight,tempNormal,tempForward);
      rover.position.set(x,groundY+1.92,z);
      rover.quaternion.setFromRotationMatrix(tempMatrix);
      if(mode==='hover'){
        rover.position.y+=3.2+Math.max(activeNasa.size.x,activeNasa.size.z)*.12+Math.sin((time-modelArrivalTime)*.65)*.12;
        rover.rotateY((time-modelArrivalTime)*.035);
        rover.rotateX(Math.sin((time-modelArrivalTime)*.28)*.025);
      }
      if(mode==='lander'){
        rover.updateMatrixWorld(true);let clearance=-Infinity;
        const bounds=activeNasa.bounds;
        for(const px of [bounds.min.x,bounds.max.x])for(const pz of [bounds.min.z,bounds.max.z]){
          worldScratch.set(px,bounds.min.y,pz);rover.localToWorld(worldScratch);
          clearance=Math.max(clearance,heightAt(worldScratch.x,worldScratch.z)-worldScratch.y);
        }
        rover.position.y+=clearance+.01;
      }
      rover.updateMatrixWorld(true);
      motionScratch.copy(rover.position).sub(previousRoverPosition);
      const initialized=previousRoverPosition.lengthSq()>0;
      const moved=initialized&&cruising?motionScratch.length():0;
      traverseDistance+=moved;
      if(initialized && follow && !freeFlight) { controls.target.add(motionScratch);camera.position.add(motionScratch); }
      previousRoverPosition.copy(rover.position);
      if (activeNasa) updateNasaWheels(moved);
      else for(const wheel of wheelPivots) {
        wheel.userData.spin.rotation.x += moved/.94;
        wheel.position.y=-1.18;
        for(let iteration=0;iteration<4;iteration++) {
          wheel.getWorldPosition(worldScratch);
          const desired=heightAt(worldScratch.x,worldScratch.z)+.94;
          wheel.position.y+=(desired-worldScratch.y)/tempNormal.y;
        }
        if(wheel.userData.link) setRodEndpoints(wheel.userData.link,wheel.userData.anchor,wheel.position);
        if(wheel.userData.piston) setRodEndpoints(wheel.userData.piston,wheel.userData.upperAnchor,wheel.position);
      }
      if(activeNasa)for(const spinner of activeNasa.spinners)spinner.node.rotation[spinner.axis]+=delta*spinner.speed;
      if(moved>0 && traverseDistance-lastTrackDistance>.17) { stampTracks();lastTrackDistance=traverseDistance; }
      if(cruising && delta>0 && Math.floor(time*3)!==Math.floor((time-delta)*3)) emitDust();
      if(sunLight){ sunLight.target.position.copy(rover.position);sunLight.position.copy(rover.position).add(new THREE.Vector3(-65,77,58)); }
      distanceElement.textContent=traverseDistance.toFixed(1).padStart(5,'0')+'m';
      gradeElement.textContent=(Math.acos(clamp(tempNormal.y,-1,1))*THREE.MathUtils.RAD2DEG).toFixed(1)+'°';
      document.getElementById('status').textContent=paused?'已暂停':freeFlight?'自由飞行':!follow?'自由浏览':mode==='hover'?'悬浮展示':mode==='lander'?'驻留展示':'跟随探测车';
    }

    function traverseAt(time) {
      const progress = time * 0.00195;
      return {
        x: 53 * Math.sin(progress) + 16 * Math.sin(progress * 2.23 + 0.4),
        z: 47 * Math.cos(progress) + 11 * Math.cos(progress * 3.11 + 1.6),
      };
    }

    function setupLighting() {
      sunLight=new THREE.DirectionalLight(0xfffaf2,4.2);
      sunLight.position.set(-65,77,58);
      sunLight.castShadow=true;
      sunLight.shadow.mapSize.set(3072,3072);
      Object.assign(sunLight.shadow.camera,{left:-21,right:21,top:21,bottom:-21,near:.5,far:220});
      sunLight.shadow.bias=-.00008;
      sunLight.shadow.normalBias=.008;
      sunLight.shadow.radius=1.4;
      scene.add(sunLight,sunLight.target);
      scene.add(new THREE.HemisphereLight(0xaebbcf,0x68686b,.72));
      const fill=new THREE.DirectionalLight(0xbac5d8,.38);fill.position.set(55,18,-48);scene.add(fill);
      const envScene=new THREE.Scene();envScene.background=new THREE.Color(.1,.12,.16);
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshBasicMaterial({color:0x8b8e91,side:THREE.DoubleSide}));
      floor.rotation.x=-Math.PI/2;floor.position.y=-5;envScene.add(floor);
      const card=new THREE.Mesh(new THREE.PlaneGeometry(18,13),new THREE.MeshBasicMaterial({color:new THREE.Color(2.4,2.3,2.2)}));
      card.position.set(-10,14,10);card.lookAt(0,0,0);envScene.add(card);
      const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromScene(envScene,.04);
      scene.environment=env.texture;scene.environmentIntensity=.55;disposable.push(env);pmrem.dispose();
    }

    function makeTerrain() {
      const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainResolution, terrainResolution);
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position;
      const colors = new Float32Array(positions.count * 3);
      const color = new THREE.Color();

      for (let index = 0; index < positions.count; index++) {
        const x = positions.getX(index);
        const z = positions.getZ(index);
        const height = heightAt(x, z);
        positions.setY(index, height);

        const macro = fbm(x * 0.024 + 52.1, z * 0.024 - 19.2, 3);
        const dust = clamp(0.54 + macro * 0.16 + height * 0.028, 0.26, 0.76);
        color.setRGB(0.82 + dust * 0.18, 0.82 + dust * 0.18, 0.82 + dust * 0.18);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }

      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        map: terrainDiffuse,
        normalMap: terrainNormal || undefined,
        roughnessMap: terrainRoughness || undefined,
        color: 0xb5b8bd,
        vertexColors: true,
        roughness: 0.92,
        metalness: 0,
        normalScale: new THREE.Vector2(0.72, 0.72),
        displacementScale: 0,
      });
      terrainMaterial = material;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.name = "Procedural lunar terrain";
      return mesh;
    }

    function loadTerrainTexture(url, colorSpace) {
      let resolveTexture;
      texturePromises.push(new Promise(resolve => { resolveTexture = resolve; }));
      const texture = new THREE.TextureLoader().load(
        url,
        (loaded) => {
          loaded.wrapS = THREE.RepeatWrapping;
          loaded.wrapT = THREE.RepeatWrapping;
          loaded.repeat.set(108, 108);
          loaded.anisotropy = renderer.capabilities.getMaxAnisotropy();
          if (colorSpace) loaded.colorSpace = colorSpace;
          loaded.needsUpdate = true;
          resolveTexture();
        },
        undefined,
        () => {
          const canvas = document.createElement('canvas');
          canvas.width=canvas.height=2;
          const ctx=canvas.getContext('2d');
          ctx.fillStyle=url.includes('nor_gl')?'rgb(128,128,255)':url.includes('rough')?'white':'#85868a';
          ctx.fillRect(0,0,2,2);
          texture.image=canvas;
          texture.needsUpdate=true;
          document.getElementById('status').textContent='使用简化地表材质';
          resolveTexture();
        }
      );
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.repeat.set(108,108);
      if(colorSpace)texture.colorSpace=colorSpace;
      return texture;
    }

    function buildCraters() {
      const craters = [
        {x:-25,z:30,radius:14,depth:2.3,rim:.95,asymmetry:1.03},
        {x:34,z:77,radius:22,depth:3.1,rim:1.7,asymmetry:1.04},
        {x:-6,z:8,radius:6,depth:.85,rim:.31,asymmetry:.98},
        {x:41,z:20,radius:5.4,depth:.74,rim:.3,asymmetry:1.04}
      ];
      for (let index = 0; index < 104; index++) {
        const large = index < 22;
        const radius = large ? 6 + rnd() * 19 : 0.8 + Math.pow(rnd(), 1.7) * 6.5;
        craters.push({
          x: (rnd() - 0.5) * (terrainSize - 18),
          z: (rnd() - 0.5) * (terrainSize - 18),
          radius,
          depth: radius * (large ? 0.12 : 0.16),
          rim: radius * (large ? 0.047 : 0.065),
          asymmetry: 0.86 + rnd() * 0.27,
        });
      }
      return craters;
    }

    function heightAt(x, z) {
      let h = fbm(x * 0.018, z * 0.018, 5) * 3.15;
      h += fbm(x * 0.085 + 18.3, z * 0.085 - 44.2, 4) * 0.66;
      h += fbm(x * 0.31 - 12.7, z * 0.31 + 11.9, 2) * 0.13;

      for (const crater of craterField) {
        const dx = x - crater.x;
        const dz = z - crater.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance > crater.radius * 2.15) continue;
        const normalized = distance / crater.radius;
        const angular = 1 + Math.sin(Math.atan2(dz, dx) * 3.0 + crater.x * 0.17) * (crater.asymmetry - 1);
        const r = normalized / angular;
        if (r < 1.48) h -= crater.depth * Math.exp(-Math.pow(r / 0.79, 2));
        h += crater.rim * Math.exp(-Math.pow((r - 1.02) / 0.19, 2));
        if (r < 0.88) h += crater.depth * 0.11 * r * r;
      }
      return h;
    }

    function normalAt(x, z, target) {
      const epsilon = 0.35;
      const left = heightAt(x - epsilon, z);
      const right = heightAt(x + epsilon, z);
      const down = heightAt(x, z - epsilon);
      const up = heightAt(x, z + epsilon);
      target.set(left - right, epsilon * 2, down - up).normalize();
      return target;
    }

    function makeRegolithTexture() {
      const size = 1024;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { alpha: false });
      const image = context.createImageData(size, size);
      const pixels = image.data;
      const textureRandom = mulberry32(14447);

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const index = (y * size + x) * 4;
          const u = x / size;
          const v = y / size;
          const local =
            Math.sin(TAU * (u * 8.0 + v * 2.0)) * 0.015 +
            Math.sin(TAU * (u * 17.0 - v * 11.0)) * 0.011 +
            Math.sin(TAU * (u * 31.0 + v * 29.0)) * 0.007;
          const grain = (textureRandom() - 0.5) * 0.13;
          const value = clamp(0.56 + local + grain, 0, 1);
          pixels[index] = 104 + Math.round(value * 63);
          pixels[index + 1] = 101 + Math.round(value * 59);
          pixels[index + 2] = 94 + Math.round(value * 54);
          pixels[index + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);

      context.globalCompositeOperation = "multiply";
      for (let index = 0; index < 3200; index++) {
        const x = textureRandom() * size;
        const y = textureRandom() * size;
        const radius = 0.22 + textureRandom() * 1.55;
        context.fillStyle = `rgba(32, 29, 25, ${0.04 + textureRandom() * 0.13})`;
        drawWrappedDot(context, x, y, radius, size);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(54, 54);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return texture;
    }

    function drawWrappedDot(context, x, y, radius, size) {
      for (const offsetX of [-size, 0, size]) {
        for (const offsetY of [-size, 0, size]) {
          const drawX = x + offsetX;
          const drawY = y + offsetY;
          if (drawX + radius < 0 || drawX - radius > size || drawY + radius < 0 || drawY - radius > size) continue;
          context.beginPath();
          context.arc(drawX, drawY, radius, 0, TAU);
          context.fill();
        }
      }
    }

    function makeRockField() {
      const group=new THREE.Group();
      const material=new THREE.MeshStandardMaterial({color:0x91949a,map:terrainDiffuse,normalMap:terrainNormal,normalScale:new THREE.Vector2(.4,.4),roughness:1});
      const route=Array.from({length:180},(_,i)=>traverseAt(i*24));
      const object=new THREE.Object3D(),color=new THREE.Color();
      for(let variant=0;variant<4;variant++) {
        const geometry=new THREE.IcosahedronGeometry(1,variant===0?2:1);
        const p=geometry.attributes.position;
        for(let i=0;i<p.count;i++) { const vx=p.getX(i),vy=p.getY(i),vz=p.getZ(i);const f=1+smoothNoise(vx*3.4+variant*11,vz*3.1+vy*2.3)*.22;p.setXYZ(i,vx*f,vy*f*.72,vz*f); }
        geometry.computeVertexNormals();
        const count=variant===0?350:1450;
        const instances=new THREE.InstancedMesh(geometry,material,count);instances.castShadow=true;instances.receiveShadow=true;
        for(let i=0;i<count;i++) {
          let x,z,size;let tries=0;
          do {x=(rnd()-.5)*330;z=(rnd()-.5)*330;size=variant===0?.5+Math.pow(rnd(),3)*2.1:.035+Math.pow(rnd(),2.3)*.34;tries++;}
          while(size>.35&&tries<18&&route.some(p=>Math.hypot(x-p.x,z-p.z)<5.8));
          object.position.set(x,heightAt(x,z)+size*.1,z);
          object.rotation.set(rnd()*.5,rnd()*TAU,rnd()*.3);
          object.scale.set(size*(.8+rnd()*.5),size*(.65+rnd()*.35),size*(.8+rnd()*.4));
          object.updateMatrix();instances.setMatrixAt(i,object.matrix);
          color.setScalar(.66+rnd()*.34);instances.setColorAt(i,color);
        }
        group.add(instances);
      }
      return group;
    }

    function makeStarfield() {
      const count = 3600;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const color = new THREE.Color();
      for (let index = 0; index < count; index++) {
        const radius = 440 + rnd() * 680;
        const theta = rnd() * TAU;
        const u = rnd() * 2 - 1;
        const phi = Math.acos(u);
        positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[index * 3 + 1] = radius * Math.cos(phi);
        positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        const warmth = rnd();
        color.setRGB(0.72 + warmth * 0.28, 0.76 + warmth * 0.2, 0.86 + warmth * 0.14);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({ size: .78, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false });
      const stars = new THREE.Points(geometry, material);
      stars.name = "Deep star field";
      return stars;
    }

    function makeDistantMountains() {
      const geometry=new THREE.PlaneGeometry(2100,2100,240,240);geometry.rotateX(-Math.PI/2);
      const p=geometry.attributes.position;
      for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),r=Math.hypot(x,z);const base=heightAt(x,z)-1.8;const rim=Math.max(0,r-310)/600;p.setY(i,base+Math.pow(rim,1.2)*(fbm(x*.013,z*.013,4)+.45)*32);}
      const kept=[],index=geometry.index;
      for(let i=0;i<index.count;i+=3) {
        const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
        const x=(p.getX(a)+p.getX(b)+p.getX(c))/3,z=(p.getZ(a)+p.getZ(b)+p.getZ(c))/3;
        if(Math.abs(x)>260||Math.abs(z)>260)kept.push(a,b,c);
      }
      geometry.setIndex(kept);
      const uv=geometry.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*2100/540,uv.getY(i)*2100/540);
      geometry.computeVertexNormals();
      const material=terrainMaterial.clone();
      material.vertexColors=false;
      const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;return mesh;
    }

    function buildRover() {
      const metal = standard(0x8b929b, 0.37, 0.82);
      const paleMetal = standard(0xd2d6d9, 0.31, 0.8);
      const darkMetal = standard(0x29313a, 0.46, 0.64);
      const tireMaterial = standard(0x151716, 0.96, 0.18);
      const goldFoil = new THREE.MeshStandardMaterial({color:0xb98631,metalness:.83,roughness:.37,bumpMap:makeEngineeringTexture("foil"),bumpScale:.055});
      const solarMaterial = standard(0x0b1e29, 0.31, 0.43, 0x102b3d, 0.5);
      const sensorMaterial = standard(0x07151f, 0.18, 0.88, 0x10334a, 0.6);
      const whitePaint = new THREE.MeshStandardMaterial({color:0xd1d3d0,metalness:.18,roughness:.68,bumpMap:makeEngineeringTexture("fabric"),bumpScale:.006});

      const chassis = new THREE.Group();
      chassis.position.y = 0.2;
      rover.add(chassis);

      const belly = roundedBox(4.58, 0.36, 4.54, 0.055, metal);
      belly.position.y = 0.05;
      belly.castShadow = true;
      belly.receiveShadow = true;
      chassis.add(belly);

      const equipmentBay = roundedBox(3.95, 1.35, 3.06, 0.075, whitePaint);
      equipmentBay.position.set(0, 1.0, -0.15);
      equipmentBay.castShadow = true;
      chassis.add(equipmentBay);

      const lowerShield = new THREE.Mesh(new THREE.BoxGeometry(4.24, 0.24, 3.36), goldFoil);
      lowerShield.position.set(0, 0.38, -0.18);
      lowerShield.castShadow = true;
      chassis.add(lowerShield);

      addPanelSeams(equipmentBay, 3.95, 1.35, 3.06, darkMetal);
      addPrecisionDetails(chassis,paleMetal,darkMetal,goldFoil,whitePaint);
      addEquipmentDetails(chassis, darkMetal, paleMetal, sensorMaterial, goldFoil);
      addSolarArrays(chassis, solarMaterial, paleMetal);
      addMast(chassis, paleMetal, sensorMaterial, darkMetal);
      addAntenna(chassis, paleMetal, goldFoil, sensorMaterial);
      addRoboticArm(chassis, paleMetal, darkMetal, goldFoil);
      addWheelAssemblies(chassis, metal, darkMetal, tireMaterial, paleMetal);

      const frontBumper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.6, 10), paleMetal);
      frontBumper.rotation.z = Math.PI / 2;
      frontBumper.position.set(0, 0.15, 2.63);
      frontBumper.castShadow = true;
      chassis.add(frontBumper);

      const rearBumper = frontBumper.clone();
      rearBumper.position.z = -2.62;
      chassis.add(rearBumper);
    }

    function addEquipmentDetails(root, darkMetal, paleMetal, sensorMaterial, goldFoil) {
      const frontPanel = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.62, 0.12), darkMetal);
      frontPanel.position.set(0, 1.1, 1.43);
      frontPanel.castShadow = true;
      root.add(frontPanel);

      for (let x = -1.3; x <= 1.3; x += 0.65) {
        const fastener = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.08, 10), paleMetal);
        fastener.rotation.x = Math.PI / 2;
        fastener.position.set(x, 1.1, 1.51);
        root.add(fastener);
      }

      const battery = roundedBox(1.04, 0.76, 1.5, 0.08, goldFoil);
      battery.position.set(-1.88, 0.98, -0.82);
      battery.rotation.y = 0.04;
      battery.castShadow = true;
      root.add(battery);

      const battery2 = battery.clone();
      battery2.position.set(1.88, 0.98, -0.82);
      root.add(battery2);

      const radiator = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.68, 0.1), paleMetal);
      radiator.position.set(0, 1.2, -1.58);
      radiator.castShadow = true;
      root.add(radiator);
      for (let x = -0.82; x <= 0.82; x += 0.205) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.79, 0.11), darkMetal);
        fin.position.set(x, 1.2, -1.65);
        root.add(fin);
      }

      for (const side of [-1, 1]) {
        const instrument = roundedBox(0.74, 0.52, 0.75, 0.06, darkMetal);
        instrument.position.set(side * 2.05, 1.05, 0.98);
        instrument.rotation.y = side * 0.11;
        instrument.castShadow = true;
        root.add(instrument);

        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 18), sensorMaterial);
        lens.rotation.z = Math.PI / 2;
        lens.position.set(side * 2.45, 1.07, 1.03);
        root.add(lens);
      }
    }

    function addSolarArrays(root, solarMaterial, frameMaterial) {
      const panelGeometry = new THREE.BoxGeometry(2.95, 0.075, 2.02);
      const panelPositions = [
        { x: -3.68, z: -0.13, tilt: -0.035 },
        { x: 3.68, z: -0.13, tilt: 0.035 },
      ];
      for (const data of panelPositions) {
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.16, 12), frameMaterial);
        hinge.rotation.x = Math.PI / 2;
        hinge.position.set(data.x * 0.55, 1.88, data.z);
        hinge.castShadow = true;
        root.add(hinge);

        const panel = new THREE.Group();
        panel.position.set(data.x, 1.92, data.z);
        panel.rotation.z = data.tilt;
        const base = new THREE.Mesh(panelGeometry, solarMaterial);
        base.castShadow = true;
        base.receiveShadow = true;
        panel.add(base);

        const frame = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.1, 2.12), frameMaterial);
        frame.position.y = -0.02;
        panel.add(frame);

        const cellMaterial = standard(0x102f42, 0.34, 0.32, 0x0d2840, 0.22);
        for (let cx = -1.18; cx <= 1.18; cx += 0.395) {
          for (let cz = -0.74; cz <= 0.74; cz += 0.37) {
            const cell = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.018, 0.31), cellMaterial);
            cell.position.set(cx, 0.056, cz);
            panel.add(cell);
          }
        }
        root.add(panel);
      }
    }

    function addMast(root, metal, sensorMaterial, darkMetal) {
      const mast = new THREE.Group();
      mast.position.set(0, 1.58, 1.12);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.18, 14), metal);
      neck.position.y = 1.02;
      neck.castShadow = true;
      mast.add(neck);

      const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 12), darkMetal);
      gimbal.position.y = 2.08;
      gimbal.castShadow = true;
      mast.add(gimbal);

      const head = roundedBox(1.06, 0.54, 0.58, 0.08, metal);
      head.position.set(0, 2.22, 0.05);
      head.castShadow = true;
      mast.add(head);

      for (const x of [-0.27, 0.27]) {
        const camera = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.11, 20), sensorMaterial);
        camera.rotation.x = Math.PI / 2;
        camera.position.set(x, 2.22, 0.37);
        mast.add(camera);
      }
      const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.18, 16), sensorMaterial);
      lidar.position.set(0, 2.63, 0);
      mast.add(lidar);
      root.add(mast);
    }

    function addAntenna(root, metal, goldMaterial, sensorMaterial) {
      const antenna = new THREE.Group();
      antenna.position.set(1.28, 1.6, -1.18);
      antenna.rotation.z = -0.18;
      const support = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.1, 12), metal);
      support.position.y = 0.5;
      support.castShadow = true;
      antenna.add(support);

      const dish = createDish(0.82, 0.35, metal);
      dish.position.set(0, 0.94, 0.16);
      dish.rotation.x = -0.68;
      dish.castShadow = true;
      antenna.add(dish);

      const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 12), goldMaterial);
      feed.rotation.x = -0.68;
      feed.position.set(0, 1.15, 0.53);
      antenna.add(feed);

      const receiver = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), sensorMaterial);
      receiver.position.set(0, 1.32, 0.7);
      antenna.add(receiver);
      root.add(antenna);
    }

    function addRoboticArm(root, metal, darkMetal, goldMaterial) {
      const arm = new THREE.Group();
      arm.position.set(-1.82, 1.1, 1.15);
      arm.rotation.set(0.22, -0.74, 0.03);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), darkMetal);
      shoulder.castShadow = true;
      arm.add(shoulder);

      const upper = makeRod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.56, -0.16, 0.84), metal, 0.105);
      upper.castShadow = true;
      arm.add(upper);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), goldMaterial);
      elbow.position.set(0.56, -0.16, 0.84);
      elbow.castShadow = true;
      arm.add(elbow);
      const lower = makeRod(new THREE.Vector3(0.56, -0.16, 0.84), new THREE.Vector3(0.86, -0.65, 1.55), metal, 0.085);
      lower.castShadow = true;
      arm.add(lower);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.27, 12), darkMetal);
      wrist.rotation.x = 0.8;
      wrist.position.set(0.86, -0.65, 1.55);
      arm.add(wrist);
      const tool = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.33, 10), metal);
      tool.rotation.x = 2.4;
      tool.position.set(0.98, -0.76, 1.76);
      arm.add(tool);
      root.add(arm);
    }

    function addWheelAssemblies(root,metal,darkMetal,tireMaterial,rimMaterial) {
      for(const side of [-1,1]){
        const rocker=makeRod(new THREE.Vector3(side*1.7,-.12,-1.1),new THREE.Vector3(side*2.14,-.36,1.55),metal,.11);root.add(rocker);
        for(const z of [-2.05,0,2.05]) {
          const wheel=makeWheel(tireMaterial,rimMaterial,darkMetal);
          wheel.position.set(side*2.55,-1.18,z);
          wheel.userData.side=side;wheel.userData.anchor=new THREE.Vector3(side*1.82,-.13,z*.7);
          wheel.userData.upperAnchor=new THREE.Vector3(side*1.61,.28,z*.85);
          wheel.userData.link=makeRod(wheel.userData.anchor,wheel.position,metal,.095);
          wheel.userData.piston=makeRod(wheel.userData.upperAnchor,wheel.position,rimMaterial,.04);
          root.add(wheel.userData.link,wheel.userData.piston,wheel);
          const joint=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.32,24),darkMetal);joint.rotation.z=Math.PI/2;joint.position.copy(wheel.userData.anchor);root.add(joint);
          root.add(makeRod(new THREE.Vector3(side*1.82,-.19,z*.7+.17),new THREE.Vector3(side*2.5,-1.06,z+.15),darkMetal,.052));
          addCable(root,[new THREE.Vector3(side*1.55,-.01,z*.7),new THREE.Vector3(side*2.02,-.22,z+.14),new THREE.Vector3(side*2.4,-.75,z+.1),new THREE.Vector3(side*2.5,-1.1,z)],darkMetal,.032);
          wheelPivots.push(wheel);
        }
      }
    }

    function makeWheel(tireMaterial,rimMaterial,darkMaterial) {
      const wheel=new THREE.Group(),spin=new THREE.Group();wheel.add(spin);wheel.userData.spin=spin;
      const shellMaterial=new THREE.MeshStandardMaterial({color:0x7c8084,roughness:.62,metalness:.74,bumpMap:makeEngineeringTexture('metal'),bumpScale:.009,side:THREE.DoubleSide});
      const profile=[new THREE.Vector2(.72,-.24),new THREE.Vector2(.86,-.24),new THREE.Vector2(.91,-.2),new THREE.Vector2(.915,.2),new THREE.Vector2(.86,.24),new THREE.Vector2(.72,.24)];
      const shell=new THREE.Mesh(new THREE.LatheGeometry(profile,72),shellMaterial);shell.rotation.z=Math.PI/2;spin.add(shell);
      for(const side of [-1,1]) {
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.735,.027,8,64),rimMaterial);ring.rotation.y=Math.PI/2;ring.position.x=side*.232;spin.add(ring);
        const outerRing=new THREE.Mesh(new THREE.TorusGeometry(.875,.018,6,64),rimMaterial);outerRing.rotation.y=Math.PI/2;outerRing.position.x=side*.22;spin.add(outerRing);
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(.21,.21,.085,32),darkMaterial);hub.rotation.z=Math.PI/2;hub.position.x=side*.265;spin.add(hub);
        for(let n=0;n<12;n++) {
          const a=n/12*TAU;
          const p0=new THREE.Vector3(side*.23,Math.cos(a)*.21,Math.sin(a)*.21),p1=new THREE.Vector3(side*.23,Math.cos(a+.16)*.715,Math.sin(a+.16)*.715);
          spin.add(makeRod(p0,p1,rimMaterial,.025));
          const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.02,6),rimMaterial);bolt.rotation.z=Math.PI/2;bolt.position.set(side*.314,Math.cos(a)*.155,Math.sin(a)*.155);spin.add(bolt);
        }
      }
      const cleats=[];
      for(let i=0;i<40;i++){
        const a=i/40*TAU;
        for(const side of [-1,1]){
          const g=new THREE.BoxGeometry(.25,.045,.032);g.rotateY(side*.35);g.translate(side*.122,.922,0);g.rotateX(a);cleats.push(g);
        }
      }
      spin.add(new THREE.Mesh(mergeGeometries(cleats),rimMaterial));cleats.forEach(g=>g.dispose());
      spin.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      return wheel;
    }

    function makeSpring(start, end, material) {
      const group = new THREE.Group();
      const direction = end.clone().sub(start);
      const length = direction.length();
      const turns = 8;
      const points = [];
      for (let index = 0; index <= 90; index++) {
        const t = index / 90;
        const angle = t * turns * TAU;
        points.push(new THREE.Vector3(Math.cos(angle) * 0.12, t * length, Math.sin(angle) * 0.12));
      }
      const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 90, 0.026, 6, false), material);
      spring.quaternion.setFromUnitVectors(baseUp, direction.normalize());
      spring.position.copy(start);
      group.add(spring);
      return group;
    }

    function createDish(radius, depth, material) {
      const profile = [];
      for (let index = 0; index <= 20; index++) {
        const r = radius * index / 20;
        profile.push(new THREE.Vector2(r, (r * r / (radius * radius)) * depth));
      }
      const dish = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), material);
      dish.material=material.clone();dish.material.side=THREE.DoubleSide;
      return dish;
    }

    function makeDustCloud() {
      const count = 80;
      const positions = new Float32Array(count * 3);
      const alphas = new Float32Array(count);
      for (let index = 0; index < count; index++) {
        dust.push({ life: 0, maxLife: 1, velocity: new THREE.Vector3(), position: new THREE.Vector3() });
        positions[index * 3] = 9999;
        positions[index * 3 + 1] = 9999;
        positions[index * 3 + 2] = 9999;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: { color: { value: new THREE.Color(0xb1a99a) } },
        vertexShader: `
          attribute float alpha;
          varying float vAlpha;
          void main() {
            vAlpha = alpha;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = 14.0 * alpha * (150.0 / max(1.0, -mvPosition.z));
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          varying float vAlpha;
          void main() {
            vec2 p = gl_PointCoord - vec2(0.5);
            float edge = smoothstep(0.5, 0.0, length(p));
            gl_FragColor = vec4(color, edge * vAlpha * 0.13);
          }
        `,
      });
      return new THREE.Points(geometry, material);
    }

    function emitDust() {
      const tireOffset = [
        new THREE.Vector3(-2.5, -1.85, -1.9), new THREE.Vector3(2.5, -1.85, -1.9),
        new THREE.Vector3(-2.5, -1.85, 0), new THREE.Vector3(2.5, -1.85, 0),
        new THREE.Vector3(-2.5, -1.85, 1.9), new THREE.Vector3(2.5, -1.85, 1.9),
      ];
      for (let index = 0; index < 3; index++) {
        const particle = dust.find((candidate) => candidate.life <= 0);
        if (!particle) return;
        const source = new THREE.Vector3();
        if(activeNasa) activeNasa.wheels[Math.floor(rnd()*activeNasa.wheels.length)].node.getWorldPosition(source);
        else {source.copy(tireOffset[Math.floor(rnd() * tireOffset.length)]);rover.localToWorld(source);}
        particle.position.copy(source);
        particle.position.y = heightAt(source.x, source.z) + 0.1;
        particle.velocity.set((rnd() - 0.5) * 0.45, 0.12 + rnd() * 0.16, (rnd() - 0.5) * 0.45);
        particle.life = 1.1 + rnd() * .6;
        particle.maxLife = 1.1 + rnd() * 1.8;
      }
    }

    function updateDust(delta) {
      const attribute = dustCloud.geometry.attributes.position;
      const alphas = dustCloud.geometry.attributes.alpha;
      for (let index = 0; index < dust.length; index++) {
        const particle = dust[index];
        if (particle.life > 0) {
          particle.life -= delta;
          particle.position.addScaledVector(particle.velocity, delta);
          particle.velocity.y -= delta * 1.62;
          const y = heightAt(particle.position.x, particle.position.z) + 0.05;
          particle.position.y = Math.max(particle.position.y, y);
          const visibility = clamp(particle.life / particle.maxLife, 0, 1);
          attribute.setXYZ(index, particle.position.x, particle.position.y, particle.position.z);
          alphas.setX(index, visibility);
        } else {
          attribute.setXYZ(index, 9999, 9999, 9999);
          alphas.setX(index, 0);
        }
      }
      attribute.needsUpdate = true;
      alphas.needsUpdate = true;
    }

    function addPanelSeams(mesh, width, height, depth, material) {
      const seams = new THREE.Group();
      for (let x = -width / 2 + 0.5; x < width / 2; x += 0.5) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.026, height + 0.016, 0.02), material);
        line.position.set(x, 0, depth / 2 + 0.011);
        seams.add(line);
      }
      for (let y = -height / 2 + 0.45; y < height / 2; y += 0.45) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(width + 0.014, 0.022, 0.02), material);
        line.position.set(0, y, depth / 2 + 0.011);
        seams.add(line);
      }
      mesh.add(seams);
    }

    function roundedBox(width,height,depth,radius,material) {
      return new THREE.Mesh(new RoundedBoxGeometry(width,height,depth,2,radius),material);
    }

    function makeRod(start, end, material, radius) {
      const delta = end.clone().sub(start);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 12), material);
      rod.position.copy(start).add(end).multiplyScalar(0.5);
      rod.quaternion.setFromUnitVectors(baseUp, delta.normalize());
      return rod;
    }

    function standard(color, roughness, metalness, emissive = 0x000000, emissiveIntensity = 0) {
      return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
    }

    function mulberry32(seed) {
      return function random() {
        let value = seed += 0x6d2b79f5;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
      };
    }

    function hash(x, y) {
      const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
      return value - Math.floor(value);
    }

    function smoothNoise(x, y) {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const tx = x - x0;
      const ty = y - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = hash(x0, y0);
      const b = hash(x0 + 1, y0);
      const c = hash(x0, y0 + 1);
      const d = hash(x0 + 1, y0 + 1);
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, sx), THREE.MathUtils.lerp(c, d, sx), sy) * 2 - 1;
    }

    function fbm(x, y, octaves) {
      let value = 0;
      let amplitude = 0.5;
      let frequency = 1;
      let normalizer = 0;
      for (let index = 0; index < octaves; index++) {
        value += smoothNoise(x * frequency, y * frequency) * amplitude;
        normalizer += amplitude;
        frequency *= 2.03;
        amplitude *= 0.5;
      }
      return value / normalizer;
    }

    function seamlessNoise(u, v, frequency) {
      const a = smoothNoise(u * frequency, v * frequency);
      const b = smoothNoise((u - 1) * frequency, v * frequency);
      const c = smoothNoise(u * frequency, (v - 1) * frequency);
      const d = smoothNoise((u - 1) * frequency, (v - 1) * frequency);
      const wx = Math.cos(u * TAU) * 0.5 + 0.5;
      const wy = Math.cos(v * TAU) * 0.5 + 0.5;
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(d, c, wx), THREE.MathUtils.lerp(b, a, wx), wy);
    }

    function makeEngineeringTexture(kind) {
      if(detailGeometries.has(kind)) return detailGeometries.get(kind);
      const s=512,c=document.createElement('canvas');c.width=s;c.height=s;
      const ctx=c.getContext('2d'),img=ctx.createImageData(s,s),r=mulberry32(9912);
      for(let y=0;y<s;y++)for(let x=0;x<s;x++){
        let value=128;
        if(kind==='foil') value=128+55*Math.sin(x*.18+Math.sin(y*.041)*8)+28*Math.sin(y*.12+Math.cos(x*.051)*5)+20*smoothNoise(x*.18,y*.18);
        if(kind==='fabric') value=145+35*Math.sin(x*2.1)*Math.sin(y*2.1)+(r()-.5)*26;
        if(kind==='metal') value=128+20*Math.sin(x*1.5)+(r()-.5)*30;
        const i=(y*s+x)*4;img.data[i]=img.data[i+1]=img.data[i+2]=clamp(value,0,255);img.data[i+3]=255;
      }
      ctx.putImageData(img,0,0);const texture=new THREE.CanvasTexture(c);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.anisotropy=8;detailGeometries.set(kind,texture);return texture;
    }

    function addCable(root,points,material,radius=.02) {
      const path=new THREE.CatmullRomCurve3(points);const mesh=new THREE.Mesh(new THREE.TubeGeometry(path,36,radius,6,false),material);root.add(mesh);return mesh;
    }

    function addPrecisionDetails(root,metal,dark,gold,white) {
      const black=new THREE.MeshStandardMaterial({color:0x141b22,roughness:.85});
      const blue=new THREE.MeshPhysicalMaterial({color:0x143044,metalness:.48,roughness:.14,clearcoat:1,clearcoatRoughness:.15});
      const boltGeometry=new THREE.CylinderGeometry(.026,.026,.025,6);
      const bolt=(x,y,z,side=0)=>{
        const b=new THREE.Mesh(boltGeometry,metal);b.position.set(x,y,z);if(side)b.rotation.z=Math.PI/2;root.add(b);
      };
      const box=(w,h,d,x,y,z,mat=metal)=>{const m=roundedBox(w,h,d,Math.min(w,h,d)*.08,mat);m.position.set(x,y,z);root.add(m);return m;};
      // Perforated deck rails, foil-wrapped equipment bays and fastened access covers.
      for(const side of [-1,1]) {
        box(.075,.36,4.35,side*2.19,.11,0,dark);
        for(let z=-1.96;z<=2;z+=.2) bolt(side*2.24,.12,z,side);
        for(let z=-1.0;z<=1.1;z+=.7){
          box(.043,.78,.6,side*2.003,1.04,z,metal);
          box(.02,.67,.5,side*2.03,1.04,z,gold);
          for(const by of [.69,1.4])for(const bz of [z-.22,z+.22])bolt(side*2.05,by,bz,side);
        }
        for(let z=-1.62;z<1.7;z+=.27){
          box(.06,.045,.09,side*2.025,1.56,z,black);
        }
        box(.17,.19,3.98,side*1.98,.41,0,gold);
        for(let z=-1.95;z<2;z+=.21)bolt(side*1.99,.52,z);
        // Longitudinal truss and diagonal braces under the main deck.
        root.add(makeRod(new THREE.Vector3(side*1.68,-.08,-2),new THREE.Vector3(side*1.68,-.08,2),metal,.05));
        for(let z=-1.8;z<1.8;z+=.9)root.add(makeRod(new THREE.Vector3(side*1.68,-.05,z),new THREE.Vector3(side*1.35,-.58,z+.7),dark,.047));
        root.add(makeRod(new THREE.Vector3(side*1.35,-.58,-1.7),new THREE.Vector3(side*1.35,-.58,1.8),metal,.06));
        // Service harnesses; some run in parallel with different diameters.
        for(let i=0;i<3;i++)addCable(root,[new THREE.Vector3(side*1.65,1.72,-1.2),new THREE.Vector3(side*(1.72+i*.07),1.85,-.4),new THREE.Vector3(side*2.06,1.75,.85),new THREE.Vector3(side*2.21,1.34,1.02)],black,.022+i*.003);
        addCable(root,[new THREE.Vector3(side*1.6,.32,-1.76),new THREE.Vector3(side*1.83,-.23,-1.25),new THREE.Vector3(side*2.03,-.28,.45)],gold,.019);
        for(let z=-.9;z<.8;z+=.42){box(.24,.042,.06,side*1.86,1.765,z,metal);}
      }
      // Top deck: thermal blanket edges, two instruments, connectors and warning labels.
      box(3.92,.036,2.95,0,1.702,-.15,white);
      for(let x=-1.77;x<1.9;x+=.24)for(const z of [-1.58,1.28])bolt(x,1.739,z);
      for(let z=-1.4;z<1.25;z+=.24)for(const x of [-1.87,1.87])bolt(x,1.739,z);
      for(let i=0;i<3;i++) {
        const x=-1.13+i*.61;
        box(.5,.025,.68,x,1.738,-.38,metal);
        for(const dx of [-.21,.21])for(const dz of [-.29,.29])bolt(x+dx,1.762,-.38+dz);
      }
      box(.73,.27,.63,-1.17,1.9,-.99,gold);
      box(.79,.05,.7,-1.17,2.07,-.99,metal);
      box(.51,.43,.52,.65,1.94,.14,white);
      box(.55,.035,.55,.65,2.17,.14,metal);
      for(let x=.46;x<.86;x+=.057) box(.016,.007,.49,x,2.195,.14,dark);
      addCable(root,[new THREE.Vector3(-1.12,2,-.7),new THREE.Vector3(-.7,2.07,-.55),new THREE.Vector3(-.27,1.78,-.3)],black,.022);
      addCable(root,[new THREE.Vector3(.6,2,.45),new THREE.Vector3(.43,1.91,.76),new THREE.Vector3(0,1.78,1.03),new THREE.Vector3(-.13,3.8,1.08)],black,.025);
      for(let y=2.1;y<3.6;y+=.42)box(.19,.037,.19,0,y,1.12,dark);
      // Stereo navigation lenses with glass and concentric housing rings.
      for(const x of [-.83,.83]) {
        const body=new THREE.Mesh(new THREE.CylinderGeometry(.15,.17,.21,32),dark);body.rotation.x=Math.PI/2;body.position.set(x,.59,2.28);root.add(body);
        const lens=new THREE.Mesh(new THREE.CircleGeometry(.117,32),blue);lens.position.set(x,.59,2.39);root.add(lens);
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.141,.019,6,32),metal);ring.position.set(x,.59,2.385);root.add(ring);
      }
      // Smaller fittings and the mast's stereo-camera bezels.
      for(const x of [-.27,.27]) {
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.175,.027,8,36),dark);ring.position.set(x,3.8,1.48);root.add(ring);
        const lens=new THREE.Mesh(new THREE.CircleGeometry(.143,32),blue);lens.position.set(x,3.8,1.551);root.add(lens);
      }
      for(let i=0;i<4;i++) {
        const p=new THREE.Mesh(new THREE.CylinderGeometry(.058,.058,.11,12),metal);p.rotation.x=Math.PI/2;p.position.set(-.36+i*.24,1.13,1.63);root.add(p);
      }
      for(const side of [-1,1]) for(let i=0;i<4;i++){
        const x=side*(2.35+i*.66);
        box(.021,.017,1.97,x,2.009,-.13,metal);
      }
      // Printed mission identifier and serial plates are part of the model.
      const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=192;
      const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#d9ddd9';ctx.fillRect(0,0,512,192);
      ctx.fillStyle='#1c2630';ctx.font='bold 76px monospace';ctx.fillText('L-03',26,93);ctx.font='22px monospace';ctx.fillText('LUNAR SURVEYOR',27,139);
      ctx.fillStyle='#b8852d';ctx.fillRect(366,30,116,16);
      for(let x=364;x<480;x+=6)ctx.fillRect(x,82,2,65);
      const tex=new THREE.CanvasTexture(labelCanvas);tex.colorSpace=THREE.SRGBColorSpace;
      const label=new THREE.Mesh(new THREE.PlaneGeometry(1.02,.38),new THREE.MeshStandardMaterial({map:tex,roughness:.73,metalness:.15}));
      label.position.set(0,1.16,1.526);root.add(label);
      const backLabel=label.clone();backLabel.position.set(.4,.24,-2.283);backLabel.rotation.y=Math.PI;root.add(backLabel);
      root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    }

    function setRodEndpoints(rod,start,end) {
      const direction=end.clone().sub(start);rod.position.copy(start).add(end).multiplyScalar(.5);
      rod.quaternion.setFromUnitVectors(baseUp,direction.clone().normalize());
      rod.scale.y=direction.length()/rod.userData.baseLength;
    }

    function consolidateStaticDetails(root) {
      for(const wheel of wheelPivots) {
        wheel.userData.link.userData.dynamic=true;wheel.userData.link.userData.baseLength=wheel.userData.link.geometry.parameters.height;
        wheel.userData.piston.userData.dynamic=true;wheel.userData.piston.userData.baseLength=wheel.userData.piston.geometry.parameters.height;
      }
      const groups=new Map();root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert();
      const selected=[];
      root.traverse(o=>{
        if(!o.isMesh||o.isInstancedMesh||o.userData.dynamic||Array.isArray(o.material))return;
        let parent=o;while(parent&&parent!==root){if(wheelPivots.includes(parent))return;parent=parent.parent;}
        selected.push(o);const key=o.material.uuid;if(!groups.has(key))groups.set(key,{material:o.material,parts:[]});
        const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
        for(const name of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(name))geo.deleteAttribute(name);
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));groups.get(key).parts.push(geo);
      });
      for(const o of selected)o.removeFromParent();
      for(const batch of groups.values()){
        const geo=mergeGeometries(batch.parts);if(!geo)continue;
        const mesh=new THREE.Mesh(geo,batch.material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);batch.parts.forEach(g=>g.dispose());
      }
      // Each wheel still spins as a group, with its materials batched inside that group.
      for(const wheel of wheelPivots){
        const spin=wheel.userData.spin;spin.updateMatrixWorld(true);const inverse=spin.matrixWorld.clone().invert(),batches=new Map();
        const meshes=[...spin.children];
        for(const o of meshes){if(!o.isMesh)continue;const key=o.material.uuid;if(!batches.has(key))batches.set(key,{m:o.material,g:[]});const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));batches.get(key).g.push(g);o.removeFromParent();}
        for(const b of batches.values()){const m=new THREE.Mesh(mergeGeometries(b.g),b.m);m.castShadow=m.receiveShadow=true;spin.add(m);b.g.forEach(g=>g.dispose());}
      }
    }

    function setupTracks() {
      const material=new THREE.MeshBasicMaterial({color:0x191c20,transparent:true,opacity:.24,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
      const parts=[];
      for(const side of [-1,1]){const g=new THREE.PlaneGeometry(.28,.055);g.rotateZ(side*.32);g.translate(side*.132,0,0);g.rotateX(-Math.PI/2);parts.push(g);}
      trackMesh=new THREE.InstancedMesh(mergeGeometries(parts),material,trackCapacity);trackMesh.count=0;trackMesh.frustumCulled=false;scene.add(trackMesh);parts.forEach(g=>g.dispose());
    }

    function stampTracks() {
      const stamp=new THREE.Object3D();rover.updateMatrixWorld(true);
      for(const side of [-1,1]) {
        const rear=activeNasa
          ? activeNasa.wheels.filter(w=>w.side===side).sort((a,b)=>a.axleZ-b.axleZ)[0].node
          : wheelPivots.find(w=>w.userData.side===side&&w.position.z< -1);
        rear.getWorldPosition(footScratch);
        const back=tempForward.clone().multiplyScalar(-.19);footScratch.add(back);footScratch.y=heightAt(footScratch.x,footScratch.z)+.013;
        normalAt(footScratch.x,footScratch.z,groundScratch);
        const right=new THREE.Vector3().crossVectors(groundScratch,tempForward).normalize();const forward=new THREE.Vector3().crossVectors(right,groundScratch).normalize();
        stamp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,groundScratch,forward));stamp.position.copy(footScratch);
        const radius=activeNasa?.wheels[0].radius;
        stamp.scale.set(activeNasa?Math.min(1.7,radius/.43):1,1,activeNasa?Math.max(.28,radius*2.3):1);stamp.updateMatrix();
        trackMesh.setMatrixAt(trackCursor,stamp.matrix);trackCursor=(trackCursor+1)%trackCapacity;trackMesh.count=Math.min(trackCapacity,trackMesh.count+1);
      }
      trackMesh.instanceMatrix.needsUpdate=true;
    }

    function updateNasaWheels(moved) {
      for(const wheel of activeNasa.wheels){
        wheel.node.position.copy(wheel.base);
        wheel.node.rotation.x+=moved/wheel.radius;
        for(let iteration=0;iteration<4;iteration++){
          wheel.node.updateWorldMatrix(true,false);
          wheel.node.getWorldPosition(worldScratch);
          const desired=heightAt(worldScratch.x,worldScratch.z)+wheel.radius;
          wheel.node.position.y+=(desired-worldScratch.y)/(tempNormal.y*activeNasa.scale);
        }
      }
    }

    function updateVehicleInfo(definition) {
      document.getElementById('model-english').textContent=definition.english;
      document.getElementById('model-description').textContent=definition.description;
      document.getElementById('model-category').textContent=VEHICLE_CATEGORIES[definition.category];
      const index=VEHICLES.findIndex(vehicle=>vehicle.id===definition.id);
      document.getElementById('model-count').textContent=`${String(index+1).padStart(2,'0')} / ${VEHICLES.length}`;
      document.getElementById('model-mode').textContent=definition.mode==='rover'?'轮组行驶':definition.mode==='lander'?'月面驻留':'悬浮展示';
      const credit=document.getElementById('model-credit');
      credit.textContent=definition.credit;
      credit.hidden=!definition.source;
      if(definition.source)credit.href=definition.source;else credit.removeAttribute('href');
    }

    async function switchVehicle(id) {
      const definition=VEHICLES.find(vehicle=>vehicle.id===id);
      if(!definition)return;
      const request=++vehicleRequest;
      const notice=document.getElementById('model-notice');
      const selector=document.getElementById('model-select');
      const retry=document.getElementById('model-retry');
      selector.value=id;retry.hidden=true;notice.hidden=false;
      notice.textContent=id==='concept'?'正在切换…':`正在载入${definition.name}…`;
      document.getElementById('model-panel').setAttribute('aria-busy','true');
      let next=null;
      try {
        if(id!=='concept'){
          const pending=vehicleLoadQueue.then(()=>request!==vehicleRequest?null:loadNasaVehicle(id,message=>{
            if(request===vehicleRequest)notice.textContent=message;
          }));
          vehicleLoadQueue=pending.catch(()=>{});
          next=await pending;
          if(request!==vehicleRequest){disposeNasaVehicle(next);return;}
        }
        disposeNasaVehicle(activeNasa);activeNasa=next;
        conceptRoot.visible=id==='concept';
        if(next)rover.add(next.group);
        selectedVehicle=id;
        modelAnchor.copy(rover.position);modelArrivalTime=simulatedTime;
        previousRoverPosition.set(0,0,0);
        updateVehicleInfo(definition);
        controls.minDistance=next ? 0.55 : 2.6;
        trackMesh.count=0;trackCursor=0;lastTrackDistance=traverseDistance;dust.forEach(particle=>particle.life=0);
        updateRover(simulatedTime,0);focusCurrentVehicle();
        notice.hidden=true;
      }catch(error){
        if(request!==vehicleRequest){disposeNasaVehicle(next);return;}
        console.error('NASA model load failed:',error);
        selector.value=selectedVehicle;
        const current=VEHICLES.find(vehicle=>vehicle.id===selectedVehicle);
        updateVehicleInfo(current);
        notice.textContent=`${definition.name}载入失败，当前展示${current.name}。`;
        retry.dataset.modelId=id;retry.hidden=false;
        if(!readyForFrame)focusCurrentVehicle();
      }finally{
        if(request===vehicleRequest)document.getElementById('model-panel').setAttribute('aria-busy','false');
      }
    }

    function setupInterface() {
      const pauseButton=document.getElementById('pause');const focusButton=document.getElementById('focus');const flightButton=document.getElementById('flight');
      function togglePause(){paused=!paused;pauseButton.textContent=paused?'继续动画':'暂停动画';pauseButton.setAttribute('aria-pressed',String(paused));}
      function setFlight(value){freeFlight=value;follow=!value;controls.maxPolarAngle=value?Math.PI*.96:Math.PI*.499;flightButton.setAttribute('aria-pressed',String(value));document.getElementById('flight-help').hidden=!value;}
      function focusVehicle(){
        setFlight(false);follow=true;rover.updateMatrixWorld(true);
        const bounds=activeNasa?activeNasa.bounds:conceptBounds,size=bounds.getSize(new THREE.Vector3());
        const target=rover.localToWorld(bounds.getCenter(new THREE.Vector3()));
        const extent=Math.max(size.y*1.35,size.x*.82,size.z*.72);
        const distance=extent/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5)))*1.45*(camera.aspect<1?1/camera.aspect*.9:1);
        controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(1.05,.67,1.4).normalize().multiplyScalar(distance).applyQuaternion(rover.quaternion));controls.update();
      }
      focusCurrentVehicle=focusVehicle;
      document.getElementById('model-select').addEventListener('change',event=>switchVehicle(event.target.value));
      for(const [id,step] of [['model-prev',-1],['model-next',1]])document.getElementById(id).addEventListener('click',()=>{
        const index=VEHICLES.findIndex(vehicle=>vehicle.id===document.getElementById('model-select').value);
        switchVehicle(VEHICLES[(index+step+VEHICLES.length)%VEHICLES.length].id);
      });
      document.getElementById('model-retry').addEventListener('click',event=>switchVehicle(event.currentTarget.dataset.modelId));
      pauseButton.addEventListener('click',togglePause);focusButton.addEventListener('click',focusVehicle);
      flightButton.addEventListener('click',()=>setFlight(!freeFlight));
      document.getElementById('speed').addEventListener('input',e=>{speedFactor=Number(e.target.value);document.getElementById('speed-label').textContent=speedFactor.toFixed(1)+'×';});
      document.getElementById('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{document.getElementById('status').textContent='当前窗口不支持全屏';}});
      document.getElementById('help-toggle').addEventListener('click',()=>{const help=document.getElementById('help');help.hidden=!help.hidden;});
      renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===2){follow=false;}});
      window.addEventListener('keydown',e=>{
        if(['INPUT','SELECT','BUTTON'].includes(document.activeElement.tagName))return;
        if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
        keys.add(e.code);
        if(!e.repeat){if(e.code==='Space')togglePause();if(e.code==='KeyR')focusVehicle();if(e.code==='KeyF')setFlight(!freeFlight);}
      });
      window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
      document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();clock.getDelta();});
      renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();loader.textContent='图形上下文已暂停，请刷新页面恢复。';loader.classList.remove('done');});
    }

    function updateFlight(delta) {
      if(!freeFlight)return;
      const direction=new THREE.Vector3();camera.getWorldDirection(direction);
      const right=new THREE.Vector3().crossVectors(direction,baseUp).normalize();const move=new THREE.Vector3();
      if(keys.has('KeyW')||keys.has('ArrowUp'))move.add(direction);if(keys.has('KeyS')||keys.has('ArrowDown'))move.sub(direction);
      if(keys.has('KeyD')||keys.has('ArrowRight'))move.add(right);if(keys.has('KeyA')||keys.has('ArrowLeft'))move.sub(right);
      if(keys.has('KeyE'))move.y+=1;if(keys.has('KeyQ'))move.y-=1;
      if(move.lengthSq()){move.normalize().multiplyScalar(delta*(keys.has('ShiftLeft')?18:5));camera.position.add(move);controls.target.add(move);}
      camera.position.x=clamp(camera.position.x,-245,245);camera.position.z=clamp(camera.position.z,-245,245);
    }

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.85));
    });

    window.addEventListener("beforeunload", () => {
      vehicleRequest++;disposeNasaVehicle(activeNasa);
      disposeModelDecoder();
      terrainTexture.dispose();
      for (const item of disposable) item.dispose?.();
      renderer.dispose();
    });
  
