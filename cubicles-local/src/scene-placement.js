import * as THREE from 'three';

export class ScenePlacement {
  constructor(world, options) {
    this.world=world;
    this.options=options;
    this.selection=new THREE.Box3Helper(new THREE.Box3(), '#d5aa53');
    this.selection.material.depthTest=false;
    this.selection.renderOrder=100;
    world.scene.add(this.selection);
    this.highlight();
  }
  point(event,height=0) {
    const rect=this.world.canvas.getBoundingClientRect();
    this.world.raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),this.world.camera);
    return this.world.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-height),new THREE.Vector3());
  }
  down(event) {
    if(this.drag)return true;
    if(event.button!==0||this.options.locked?.())return false;
    const ground=this.point(event);
    const targets=this.options.targets();
    for(const target of targets)target.updateWorldMatrix(true,true);
    const hits=this.world.raycaster.intersectObjects(targets,true);
    let id;
    let height=0;
    for(const hit of hits){
      if(hit.object.userData.placementIds?.[hit.instanceId]){id=hit.object.userData.placementIds[hit.instanceId];height=hit.point.y;break;}
      let object=hit.object;
      while(object&&!object.userData.placementId)object=object.parent;
      if(object){id=object.userData.placementId;height=hit.point.y;break;}
    }
    id ||= ground&&this.options.fallback?.(ground);
    if(!id)return false;
    this.world.canvas.focus?.({preventScroll:true});
    this.options.select(id);
    const point=this.point(event,height);
    if(!point)return false;
    this.drag={id,height,point,startX:event.clientX,startY:event.clientY,pointerId:event.pointerId,moved:false};
    this.world.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    this.highlight();
    return true;
  }
  move(event) {
    const drag=this.drag;
    if(!drag||drag.pointerId!==event.pointerId)return false;
    if(this.options.locked?.())return true;
    if(!drag.moved&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<4)return true;
    const point=this.point(event,drag.height);
    if(!point)return true;
    if(!drag.moved){this.options.begin(drag.id);drag.moved=true;}
    this.options.move(drag.id,point.x-drag.point.x,point.z-drag.point.z);
    this.highlight();
    return true;
  }
  up(event,cancel=false) {
    if(!this.drag||this.drag.pointerId!==event.pointerId)return false;
    const drag=this.drag;
    this.drag=null;
    if(this.world.canvas.hasPointerCapture(event.pointerId))this.world.canvas.releasePointerCapture(event.pointerId);
    if(drag.moved){if(cancel)this.options.cancel(drag.id);else this.options.end(drag.id);}
    this.highlight();
    return true;
  }
  highlight() {
    const box=this.options.box?.();
    this.selection.visible=Boolean(box&&!box.isEmpty());
    if(box)this.selection.box.copy(box);
    this.selection.material.color.set(this.options.invalid?.()?'#b9664f':'#d5aa53');
  }
  dispose() {
    if(this.drag)this.up({pointerId:this.drag.pointerId},true);
    this.world.scene.remove(this.selection);
    this.selection.geometry.dispose();
    this.selection.material.dispose();
  }
}
