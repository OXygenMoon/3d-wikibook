export const GRID={cellSize:1,min:-140,max:140,size:280};
export const WORLD_PROPS={tree:{name:'树木',width:3,depth:3},streetlight:{name:'路灯',width:1,depth:1}};
export function defaultWorldProps(){
 const result=[];
 const add=(kind,x,z)=>{const definition=WORLD_PROPS[kind];result.push({id:`prop-legacy-${result.length}`,kind,name:definition.name,gridX:Math.round(x-definition.width/2),gridZ:Math.round(z-definition.depth/2),width:definition.width,depth:definition.depth,rotation:0,enabled:true,solid:false,assetId:null});};
 for(let index=-7;index<=7;index++)for(const side of [-1,1]){add('tree',index*8,side*61);if(Math.abs(index)>2)add('tree',side*61,index*8);}
 for(let index=-5;index<=5;index++)for(const side of [-1,1])add('streetlight',side*48.8,index*10);
 return result;
}
export const quarter=angle=>((Math.round(Number(angle||0)/90)*90)%360+360)%360;
export function footprint(b){const swap=quarter(b.rotation)%180!==0;return {x:b.gridX,z:b.gridZ,w:swap?b.depth:b.width,d:swap?b.width:b.depth};}
export function centerOf(b){const r=footprint(b);return {x:r.x+r.w/2,z:r.z+r.d/2};}
export function rotatePoint(x,z,rotation=0){const a=quarter(rotation)*Math.PI/180;return {x:x*Math.cos(a)+z*Math.sin(a),z:-x*Math.sin(a)+z*Math.cos(a)};}
export function transformPoint(x,z,b){const p=rotatePoint(x,z,b.rotation),c=centerOf(b);return {x:c.x+p.x,z:c.z+p.z};}
export function zoneRect(z){const w=Math.ceil((z.columns-1)*z.spacing+5),d=Math.ceil((z.rows-1)*z.spacing+5);return {gridX:Math.round(z.x-w/2),gridZ:Math.round(z.z-d/2),width:w,depth:d,rotation:0};}
export function zoneBuilding(z){return {id:`class-${z.id}`,kind:'class',zoneId:z.id,name:z.name,...zoneRect(z),enabled:true};}
export function officeBuilding(o){return {id:`office-${o.id}`,kind:'office',officeId:o.id,parentId:`class-${o.zoneId}`,name:o.name,gridX:Math.round(o.x-2.5),gridZ:Math.round(o.z-2.5),width:5,depth:5,rotation:0,enabled:true};}
export function defaultBuildings(areas){return areas.map(a=>{const width=16,depth=a.kind==='wall'?12:16;return {id:a.id,kind:a.kind,name:a.name,gridX:Math.round(a.x-width/2),gridZ:Math.round(a.z-depth/2),width,depth,rotation:0,enabled:true,solid:false,assetId:null};});}
export function areaForBuilding(b,template){const center=centerOf(b),local=rotatePoint(0,(template.entry.z-template.z)*b.depth/(b.kind==='wall'?12:16),b.rotation);return {...template,...center,name:b.name,rotation:b.rotation,assetId:b.assetId,width:b.width,depth:b.depth,radius:Math.max(footprint(b).w,footprint(b).d)/2,entry:{x:center.x+local.x,z:center.z+local.z}};}
export function rectanglesOverlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.z<b.z+b.d&&a.z+a.d>b.z;}
export function layoutErrors(buildings){const errors=[],ids=new Set(),active=buildings.filter(b=>b.enabled!==false),byId=new Map(buildings.map(b=>[b.id,b]));
 for(const b of buildings){if(ids.has(b.id))errors.push(`建筑编号 ${b.id} 重复。`);ids.add(b.id);if(![b.gridX,b.gridZ,b.width,b.depth,b.rotation].every(Number.isInteger)||b.width<1||b.depth<1||![0,90,180,270].includes(b.rotation)){errors.push(`${b.name} 的网格位置、占地或朝向不正确。`);continue;}if(b.enabled===false)continue;const r=footprint(b);if(r.x<GRID.min||r.z<GRID.min||r.x+r.w>GRID.max||r.z+r.d>GRID.max)errors.push(`${b.name} 超出世界边界。`);if(b.parentId){const p=byId.get(b.parentId);if(!p){errors.push(`${b.name} 缺少班级区域。`);continue;}const pr=footprint(p);if(r.x<pr.x||r.z<pr.z||r.x+r.w>pr.x+pr.w||r.z+r.d>pr.z+pr.d)errors.push(`${b.name} 必须位于所属班级区域内。`);}}
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){const a=active[i],b=active[j];if(a.parentId===b.id||b.parentId===a.id)continue;if(rectanglesOverlap(footprint(a),footprint(b)))errors.push(`${a.name} 与 ${b.name} 占地重叠。`);}
 return [...new Set(errors)];
}
export function firstFree(buildings,width,depth){const occupied=buildings.filter(building=>building.enabled!==false).map(footprint);for(let radius=0;radius<=GRID.max;radius+=2)for(let z=-radius;z<=radius;z+=2)for(let x=-radius;x<=radius;x+=2){if(Math.abs(x)!==radius&&Math.abs(z)!==radius)continue;const candidate={x,z,w:width,d:depth};if(x<GRID.min||z<GRID.min||x+width>GRID.max||z+depth>GRID.max)continue;if(!occupied.some(rect=>rectanglesOverlap(rect,candidate)))return {gridX:x,gridZ:z};}return null;}
