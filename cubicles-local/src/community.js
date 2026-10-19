import {zoneRect} from './grid.js';
// Shared scene and server contracts. Coordinates are in world metres.
export const PUBLIC_AREAS = [
  {id:'pond',kind:'pond',name:'荷风池塘',x:-34,z:35,radius:8,entry:{x:-34,z:42},hint:'开始钓鱼'},
  {id:'wall',kind:'wall',name:'共创贴纸墙',x:0,z:35,radius:7,entry:{x:0,z:39},hint:'查看与留下贴纸'},
  {id:'hall',kind:'hall',name:'排行榜殿堂',x:30,z:35,radius:8,entry:{x:30,z:40},hint:'查看社区荣誉'},
  {id:'lab',kind:'lab',name:'云端机房',x:0,z:-34,radius:8,entry:{x:0,z:-28},hint:'打开机房任务'},
];
export const BASE_PUBLIC_AREAS=structuredClone(PUBLIC_AREAS);
export const DEFAULT_ZONES=[{id:1,name:'创想一班',x:0,z:0,columns:6,rows:4,spacing:7,color:'#91ad83'}];
export const DEFAULT_SETTINGS={timeMode:'auto',hour:20};
export const ITEMS=[
  {id:'desk',name:'原木书桌',model:'HF_Desk_Classic',emoji:'🪵',surface:'floor',limit:1,radius:.85},
  {id:'chair',name:'学习椅',model:'HF_Chair_Task',emoji:'🪑',surface:'floor',limit:1,radius:.32},
  {id:'monitor',name:'宽屏电脑',model:'HF_Monitor_Ultrawide',emoji:'🖥️',surface:'desk',limit:1,radius:.28},
  {id:'laptop',name:'轻便笔记本',model:'HF_Laptop_Open',emoji:'💻',surface:'desk',limit:1,radius:.25},
  {id:'plant',name:'桌面绿植',model:'HF_Plant_Desk',emoji:'🪴',surface:'desk',limit:2,radius:.15},
  {id:'flowers',name:'花束花瓶',model:'HF_FlowerVase',emoji:'💐',surface:'desk',limit:2,radius:.15},
  {id:'lamp',name:'暖光落地灯',model:'HF_Lamp_Floor',emoji:'💡',surface:'floor',limit:2,radius:.2},
  {id:'cactus',name:'仙人掌',model:'HF_Plant_Cactus',emoji:'🌵',surface:'floor',limit:2,radius:.25},
  {id:'bonsai',name:'小小盆景',model:'HF_Bonsai',emoji:'🌳',surface:'desk',limit:1,radius:.18},
  {id:'cup',name:'随行水杯',model:'HF_WaterBottle',emoji:'🥤',surface:'desk',limit:2,radius:.09},
];
export function initialFurniture(){return [
 {id:'base-desk',itemId:'desk',x:0,z:-.65,rotation:0},
 {id:'base-chair',itemId:'chair',x:.05,z:.5,rotation:180},
 {id:'base-monitor',itemId:'monitor',x:0,z:-.83,rotation:0},
 {id:'base-plant',itemId:'plant',x:.6,z:-.6,rotation:0},
 {id:'base-lamp',itemId:'lamp',x:1.3,z:.8,rotation:0},
];}
export function generateOffices(zones,positions={}){return zones.flatMap(zone=>Array.from({length:zone.columns*zone.rows},(_,slot)=>({
 id:zone.id*1000+slot+1,zoneId:zone.id,name:`${zone.name} · ${String(slot+1).padStart(2,'0')}号`,tagline:'等待伙伴入住，一起装下大大梦想。',
 color:zone.color,monogram:'位',x:(positions[zone.id*1000+slot+1]?.gridX??Math.round(zoneRect(zone).gridX+(slot%zone.columns)*zone.spacing))+2.5,z:(positions[zone.id*1000+slot+1]?.gridZ??Math.round(zoneRect(zone).gridZ+Math.floor(slot/zone.columns)*zone.spacing))+2.5,
 neighborhood:zones.indexOf(zone),seed:slot+zone.id,owner:'待分配',ownerId:null,visits:0,furnished:true,furniture:initialFurniture(),
})));}
export const withinOffice=(position,office)=>Boolean(position&&office&&Math.abs(position.x-office.x)<1.65&&position.z-office.z>-.1&&position.z-office.z<2.7);
export const withinArea=(position,area)=>Boolean(position&&area&&Math.hypot(position.x-area.x,position.z-area.z)<=area.radius);
export function sceneHour(settings,now=Date.now()){return settings.timeMode==='manual'?settings.hour:Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(now));}
