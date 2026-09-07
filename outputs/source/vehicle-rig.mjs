import * as THREE from 'three';

export function applyRotorRig(root){
  root.updateMatrixWorld(true);
  for(const [index,name] of ['rotors_01','rotors_02'].entries()){
    const rotor=root.getObjectByName(name);
    if(!rotor)throw new Error('直升机旋翼缺失。');
    const pivot=new THREE.Group();pivot.name=`Rotor_pivot_${index}`;
    new THREE.Box3().setFromObject(rotor).getCenter(pivot.position);
    Object.assign(pivot.userData,{movingPart:true,spinAxis:'y',spinSpeed:index?-24:24});
    root.add(pivot);pivot.updateMatrixWorld(true);pivot.attach(rotor);
  }
}

export async function applyFleetRig(gltf){
  const rig=gltf.parser.json.asset.extras?.fleetRig;
  if(!rig)return;
  const root=gltf.scene,pivots=rig.parts.map((part,index)=>{
    const pivot=new THREE.Group();pivot.name=`Fleet_${part.type}_${index}`;
    pivot.position.fromArray(part.center);pivot.userData.movingPart=true;
    if(part.type==='wheel')Object.assign(pivot.userData,{wheelIndex:index,wheelRadius:part.radius,side:part.side,axleZ:part.axleZ});
    if(part.type==='drum')Object.assign(pivot.userData,{spinAxis:'x',spinSpeed:part.spinSpeed});
    return pivot;
  });
  rig.parts.forEach((part,index)=>{
    if(part.parent!==undefined){pivots[index].position.sub(new THREE.Vector3().fromArray(rig.parts[part.parent].center));pivots[part.parent].add(pivots[index]);}
    else root.add(pivots[index]);
  });
  root.updateMatrixWorld(true);
  for(const assignment of rig.assignments){
    const original=root.getObjectByName(assignment.mesh);
    if(!original?.isMesh)throw new Error('模型活动零件缺失。');
    const geometry=original.geometry.clone().applyMatrix4(original.matrixWorld);
    const ids=geometry.index.array,mask=new Uint8Array(await gltf.parser.getDependency('bufferView',assignment.bufferView));
    if(mask.length*3!==ids.length)throw new Error('模型活动零件数据不匹配。');
    const buckets=assignment.counts.map(count=>new Uint32Array(count*3)),offsets=assignment.counts.map(()=>0);
    for(let face=0;face<mask.length;face++){const target=buckets[mask[face]],offset=offsets[mask[face]];target[offset]=ids[face*3];target[offset+1]=ids[face*3+1];target[offset+2]=ids[face*3+2];offsets[mask[face]]+=3;}
    buckets.forEach((indices,index)=>{
      if(!indices.length)return;
      const partGeometry=new THREE.BufferGeometry();
      for(const [name,attribute] of Object.entries(geometry.attributes))partGeometry.setAttribute(name,attribute);
      partGeometry.setIndex(new THREE.BufferAttribute(indices,1));
      const bounds=new THREE.Box3(),point=new THREE.Vector3();
      for(const vertex of indices)bounds.expandByPoint(point.fromBufferAttribute(geometry.attributes.position,vertex));
      partGeometry.boundingBox=bounds;partGeometry.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
      const mesh=new THREE.Mesh(partGeometry,original.material);mesh.name=index?`${assignment.mesh}_part_${index}`:`${assignment.mesh}_body`;
      if(index){mesh.position.fromArray(rig.parts[index-1].center).negate();pivots[index-1].add(mesh);}else root.add(mesh);
    });
    original.removeFromParent();original.geometry.dispose();geometry.dispose();
  }
  rig.parts.forEach((part,index)=>{if(part.rotationX)pivots[index].rotation.x=part.rotationX;});
}
