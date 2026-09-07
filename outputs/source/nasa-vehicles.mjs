import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {applyFleetRig,applyRotorRig} from './vehicle-rig.mjs';
import {VEHICLES} from './vehicle-catalog.mjs';
export {VEHICLES,VEHICLE_CATEGORIES} from './vehicle-catalog.mjs';

function decodeBase64(text){const binary=atob(text.trim()),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
class OfflineDracoLoader extends DRACOLoader {
  _loadLibrary(url,responseType){
    const embedded=document.getElementById('embedded-decoder-'+url);
    if(!embedded)return super._loadLibrary(url,responseType);
    const data=decodeBase64(embedded.textContent);
    return Promise.resolve(responseType==='arraybuffer'?data.buffer:new TextDecoder().decode(data));
  }
}
let sharedDecoder;
function getDecoder(){return sharedDecoder??=new OfflineDracoLoader().setDecoderPath('./assets/draco/').setWorkerLimit(2);}
export function disposeModelDecoder(){sharedDecoder?.dispose();sharedDecoder=null;}

function mergeStaticParts(root) {
  root.updateMatrixWorld(true);
  const batches=new Map();
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isSkinnedMesh)return;
    let parent=mesh;
    while(parent){if(Number.isInteger(parent.userData.wheelIndex)||parent.userData.movingPart)return;parent=parent.parent;}
    if(Array.isArray(mesh.material))return;
    const layout=Object.entries(mesh.geometry.attributes).map(([key,a])=>`${key}:${a.itemSize}:${a.normalized}`).sort().join('|');
    const key=mesh.material.uuid+'|'+layout+'|'+Boolean(mesh.geometry.index);
    if(!batches.has(key))batches.set(key,{material:mesh.material,parts:[]});
    batches.get(key).parts.push(mesh);
  });
  const combined=new THREE.Group();combined.name='NASA static instruments';
  for(const {material,parts} of batches.values()){
    if(parts.length<2)continue;
    const geometries=parts.map(mesh=>mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    const geometry=mergeGeometries(geometries);
    if(!geometry)throw new Error('Unable to preserve NASA geometry while batching.');
    const mesh=new THREE.Mesh(geometry,material);mesh.name=material.name;combined.add(mesh);
    geometries.forEach(g=>g.dispose());
    const originals=new Set(parts.map(m=>m.geometry));
    parts.forEach(mesh=>{for(const child of [...mesh.children])root.attach(child);mesh.removeFromParent();});
    originals.forEach(g=>g.dispose());
  }
  root.add(combined);
}

export async function loadNasaVehicle(id,onProgress=()=>{},options={}) {
  const definition=VEHICLES.find(v=>v.id===id);
  if(!definition?.url)throw new Error('Unknown NASA model.');
  const loader=new GLTFLoader().setDRACOLoader(options.dracoLoader||getDecoder());
  const embedded=document.getElementById('embedded-model-'+id);
  let gltf;
  if(embedded){
    const bytes=decodeBase64(embedded.textContent);
    onProgress('正在解码模型…');
    gltf=await loader.parseAsync(bytes.buffer,'');
  } else {
    gltf=await loader.loadAsync(definition.url,event=>{
      onProgress(event.total?`正在载入模型…${Math.round(event.loaded/event.total*100)}%`:'正在载入模型…');
    });
  }
  try {
    onProgress('正在准备模型细节…');
    await applyFleetRig(gltf);
    if(definition.rotors)applyRotorRig(gltf.scene);
    mergeStaticParts(gltf.scene);
    const group=new THREE.Group();group.name=definition.english;group.add(gltf.scene);
    let nativeBounds=new THREE.Box3().setFromObject(group);
    const nativeSize=nativeBounds.getSize(new THREE.Vector3());
    const scale=definition.displayExtent?definition.displayExtent/Math.max(nativeSize.x,nativeSize.y,nativeSize.z):1;
    gltf.scene.scale.multiplyScalar(scale);
    nativeBounds=new THREE.Box3().setFromObject(group);
    const center=nativeBounds.getCenter(new THREE.Vector3());
    group.position.set(-center.x,-1.92-nativeBounds.min.y,-center.z);
    const wheels=[],spinners=[];let triangles=0;
    group.traverse(object=>{
      if(object.isMesh){object.castShadow=true;object.receiveShadow=true;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;}
      if(Number.isInteger(object.userData.wheelIndex))wheels.push({node:object,radius:object.userData.wheelRadius*scale,base:object.position.clone(),side:object.userData.side,axleZ:object.userData.axleZ});
      if(object.userData.spinAxis)spinners.push({node:object,axis:object.userData.spinAxis,speed:object.userData.spinSpeed});
    });
    if(wheels.length!==(definition.wheelCount||0))throw new Error('Model wheel pivots are incomplete.');
    wheels.sort((a,b)=>a.node.userData.wheelIndex-b.node.userData.wheelIndex);
    const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
    return {id,group,wheels,spinners,bounds,size,scale,triangles,definition};
  } catch(error){disposeNasaVehicle({group:gltf.scene});throw error;}
}

export function disposeNasaVehicle(vehicle){
  if(!vehicle)return;
  const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();
  vehicle.group.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of [].concat(object.material||[])){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
  geometries.forEach(g=>g.dispose());
  textures.forEach(texture=>{if(texture.image)images.add(texture.image);texture.dispose();});
  images.forEach(image=>image.close?.());materials.forEach(m=>m.dispose());vehicle.group.removeFromParent();
}
