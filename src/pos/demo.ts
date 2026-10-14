import {newId} from '../id';
import { cartKey,validateChoices } from './logic';
import type { Catalog,Order,User,Shift,Menu,Ingredient } from './api';
const KEY='pos-cafe-maker-demo-v1';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
const units=(value:string)=>{if(!/^-?\d+(\.\d{1,3})?$/.test(value))throw new Error('จำนวนต้องมีทศนิยมไม่เกิน 3 ตำแหน่ง');return Math.round(Number(value)*1000);};
const number=(value:unknown)=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('จำนวนเงินไม่ถูกต้อง');return value;};
type SavedOrder=Order&{recipe:Record<string,number>;day:string;shiftId:string;refundReason?:string;refundedAt?:string;refundDay?:string;refundKey?:string;refundBody?:string};
type State=Catalog&{orders:SavedOrder[];shift:Shift|null;closedShifts:Shift[];users:User[];replays:Record<string,{body:string;order:Order}>;stockLog:unknown[]};
function seed():State{
 const ingredients:Ingredient[]=[{id:'coffee',name:'เมล็ดกาแฟ',unit:'กรัม',stock:'2000',lowStock:'300'},{id:'milk',name:'นมสด',unit:'มล.',stock:'5000',lowStock:'1000'},{id:'oat',name:'นมโอ๊ต',unit:'มล.',stock:'2000',lowStock:'500'}];
 const normal={id:'normal',group:'ขนาด',name:'ปกติ',priceSatang:0,recipe:[]};
 const menus:Menu[]=[{id:'latte',name:'ลาเต้เย็น',category:'กาแฟ',priceSatang:6500,active:true,recipe:[{ingredientId:'coffee',quantity:'18'},{ingredientId:'milk',quantity:'150'}],options:[normal,{id:'large',group:'ขนาด',name:'เพิ่มช็อต',priceSatang:1500,recipe:[{ingredientId:'coffee',quantity:'18'}]},{id:'dairy',group:'นม',name:'ปกติ',priceSatang:0,recipe:[]},{id:'oatmilk',group:'นม',name:'นมโอ๊ต',priceSatang:1500,recipe:[{ingredientId:'milk',quantity:'-150'},{ingredientId:'oat',quantity:'150'}]}]},
 {id:'americano',name:'อเมริกาโน่เย็น',category:'กาแฟ',priceSatang:5500,active:true,recipe:[{ingredientId:'coffee',quantity:'18'}],options:[]},
 {id:'espresso',name:'เอสเปรสโซ่',category:'กาแฟร้อน',priceSatang:5000,active:true,recipe:[{ingredientId:'coffee',quantity:'18'}],options:[]},
 {id:'flatwhite',name:'แฟลตไวท์',category:'กาแฟร้อน',priceSatang:7000,active:true,recipe:[{ingredientId:'coffee',quantity:'20'},{ingredientId:'milk',quantity:'120'}],options:[]}];
 return{menus,ingredients,orders:[],shift:null,closedShifts:[],users:[{id:'owner',username:'owner',role:'owner'},{id:'cashier',username:'cashier',role:'cashier'},{id:'bar',username:'bar',role:'bar'}],replays:{},stockLog:[]};
}
export function createDemoStore(storage?:{getItem(k:string):string|null;setItem(k:string,v:string):void}){
 let memory=seed(),user:User|null=memory.users[0];
 function load(){if(storage){const raw=storage.getItem(KEY);if(raw){try{const saved=JSON.parse(raw);if(!Array.isArray(saved.menus)||!Array.isArray(saved.orders)||!saved.replays)throw new Error();return saved as State;}catch{throw new Error('ข้อมูลเดโมเสียหาย กรุณารีเซ็ตเดโม');}}}return clone(memory);}
 function save(state:State){storage?.setItem(KEY,JSON.stringify(state));memory=clone(state);}
 function guard(roles:User['role'][]){if(!user||!roles.includes(user.role))throw new Error('ไม่มีสิทธิ์ทำรายการนี้');}
 async function request(path:string,method='GET',body:any={}):Promise<any>{
  const state=load();const pathname=path.split('?')[0];const id=pathname.split('/')[2];
  if(pathname==='/session')return{user,csrfToken:'demo-only'};
  if(pathname==='/login'){user=state.users.find(u=>u.username===body.username)??null;if(!user)throw new Error('เดโมใช้ชื่อ owner, cashier หรือ bar');return{user,csrfToken:'demo-only'};}
  if(pathname==='/logout'){user=null;return{ok:true};}
  if(pathname==='/health')return{ok:true};
  if(pathname==='/demo/reset'){guard(['owner']);save(seed());return{ok:true};}
  if(pathname==='/catalog')return{menus:state.menus,ingredients:state.ingredients};
  guard(['owner','cashier','bar']);
  let result:any={ok:true};
  if(pathname==='/checkout'){
   guard(['owner','cashier']);
   if(typeof body.idempotencyKey!=='string'||body.idempotencyKey.length<1)throw new Error('รหัสรายการหาย');
   const bodyText=JSON.stringify({...body,items:body.items?.map((i:any)=>({...i,optionIds:[...(i.optionIds??[])].sort()}))});
   const replay=state.replays[body.idempotencyKey];if(replay){if(replay.body!==bodyText)throw new Error('รหัสซ้ำกับรายการที่เปลี่ยนไป');return clone(replay.order);}
   if(!state.shift)throw new Error('เปิดกะก่อนรับเงิน');
   if(!Array.isArray(body.items)||!body.items.length||body.items.length>100)throw new Error('เลือกเมนูก่อนชำระ');
   const recipe:Record<string,number>={};let total=0;
   const items=body.items.map((item:any)=>{
    const menu=state.menus.find(m=>m.id===item.menuId&&m.active);if(!menu)throw new Error('เมนูไม่มีหรือหยุดขาย');
    if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>1000)throw new Error('จำนวนเมนูไม่ถูกต้อง');
    if(!Array.isArray(item.optionIds)||!validateChoices(menu.options,item.optionIds))throw new Error('เลือกตัวเลือกให้ครบ');
    const chosen=menu.options.filter(o=>item.optionIds.includes(o.id));const unitPriceSatang=menu.priceSatang+chosen.reduce((n,o)=>n+o.priceSatang,0);number(unitPriceSatang);
    const perItem:Record<string,number>={};for(const r of [...menu.recipe,...chosen.flatMap(o=>o.recipe)])perItem[r.ingredientId]=(perItem[r.ingredientId]??0)+units(String(r.quantity));
    for(const [ingredient,amount] of Object.entries(perItem)){if(amount<0)throw new Error('สูตรรวมติดลบ');recipe[ingredient]=(recipe[ingredient]??0)+amount*item.quantity;}
    total+=unitPriceSatang*item.quantity;return{name:menu.name,quantity:item.quantity,unitPriceSatang,options:chosen.map(o=>o.name)};
   });number(total);
   if(!['cash','transfer'].includes(body.paymentMethod))throw new Error('วิธีชำระไม่ถูกต้อง');
   const tendered=number(body.amountTenderedSatang);if(body.paymentMethod==='cash'&&tendered<total)throw new Error('เงินสดไม่พอ');
   if(body.paymentMethod==='transfer'&&!body.transferConfirmed)throw new Error('ตรวจและยืนยันยอดโอนก่อน');
   if(body.paymentMethod==='transfer'&&tendered!==total)throw new Error('ยอดโอนไม่ตรงกับยอดบิล');
   for(const [ingredient,amount] of Object.entries(recipe)){const row=state.ingredients.find(i=>i.id===ingredient);if(!row||units(row.stock)<amount)throw new Error(`วัตถุดิบไม่พอ: ${row?.name??ingredient}`);row.stock=String((units(row.stock)-amount)/1000);}
   const order:SavedOrder={id:newId(),queueNumber:state.orders.filter(o=>o.day===day()).length+1,status:'queued',totalSatang:total,changeSatang:body.paymentMethod==='cash'?tendered-total:0,paymentMethod:body.paymentMethod,createdAt:new Date().toISOString(),items,recipe,day:day(),shiftId:state.shift.id};
   state.orders.push(order);if(order.paymentMethod==='cash')state.shift.expectedCashSatang+=total;
   state.replays[body.idempotencyKey]={body:bodyText,order:clone(order)};result=order;
  }else if(pathname==='/orders'&&method==='GET')return state.orders.filter(o=>o.day===day()||['queued','preparing','ready'].includes(o.status));
  else if(pathname.startsWith('/orders/')&&pathname.endsWith('/status')){
   const order=state.orders.find(o=>o.id===id);if(!order)throw new Error('ไม่พบบิล');
   if(body.status==='completed')guard(['owner','cashier']);else guard(['owner','bar']);
   const next:Record<string,string>={queued:'preparing',preparing:'ready',ready:'completed'};if(next[order.status]!==body.status)throw new Error('สถานะเปลี่ยนแล้ว กรุณาเปิดคิวใหม่');order.status=body.status;result=order;
  }else if(pathname.startsWith('/orders/')&&pathname.endsWith('/refund')){
   guard(['owner']);if(typeof body.idempotencyKey!=='string'||!body.idempotencyKey.trim()||body.idempotencyKey.length>128)throw new Error('รหัสคืนเงินไม่ถูกต้อง');if(state.orders.some(o=>o.refundKey===body.idempotencyKey&&o.id!==id))throw new Error('รหัสคืนเงินซ้ำกับบิลอื่น');if(!body.reason?.trim())throw new Error('ระบุเหตุผลคืนเงิน');const order=state.orders.find(o=>o.id===id);if(!order)throw new Error('ไม่พบบิล');
   const refundBody=JSON.stringify({reason:body.reason,idempotencyKey:body.idempotencyKey});
   if(order.status==='refunded'){if(order.refundKey!==body.idempotencyKey||order.refundBody!==refundBody)throw new Error('รหัสคืนเงินซ้ำหรือบิลคืนแล้ว');return order;}
   if(order.status==='queued')for(const [ingredient,amount]of Object.entries(order.recipe)){const row=state.ingredients.find(i=>i.id===ingredient)!;row.stock=String((units(row.stock)+amount)/1000);}
   const originatingShift=state.shift?.id===order.shiftId?state.shift:state.closedShifts.find(s=>s.id===order.shiftId);
   if(order.paymentMethod==='cash'&&originatingShift){originatingShift.expectedCashSatang-=order.totalSatang;if(originatingShift.countedCashSatang!==undefined)originatingShift.differenceSatang=originatingShift.countedCashSatang-originatingShift.expectedCashSatang;}
   Object.assign(order,{status:'refunded',refundReason:body.reason,refundedAt:new Date().toISOString(),refundDay:day(),refundKey:body.idempotencyKey,refundBody});result=order;
  }else if(pathname==='/shift')return state.shift;
  else if(pathname==='/shifts/open'){guard(['owner','cashier']);if(state.shift)throw new Error('มีกะเปิดอยู่แล้ว');const opening=number(body.openingCashSatang);state.shift={id:newId(),openingCashSatang:opening,expectedCashSatang:opening};result=state.shift;}
  else if(pathname.startsWith('/shifts/')&&pathname.endsWith('/close')){guard(['owner','cashier']);if(state.shift?.id!==id)throw new Error('ไม่พบกะ');const counted=number(body.countedCashSatang);result={...state.shift,countedCashSatang:counted,differenceSatang:counted-state.shift.expectedCashSatang};state.closedShifts.push(result);state.shift=null;}
  else if(pathname==='/reports'){
   guard(['owner']);const date=new URLSearchParams(path.split('?')[1]).get('date')??day();const orders=state.orders.filter(o=>o.day===date),paid=orders.filter(o=>o.status!=='refunded'),refunds=state.orders.filter(o=>o.refundDay===date);const refundTotal=refunds.reduce((n,o)=>n+o.totalSatang,0);
   const best:Record<string,{name:string;quantity:number;totalSatang:number}>={};for(const o of paid)for(const item of o.items){best[item.name]??={name:item.name,quantity:0,totalSatang:0};best[item.name].quantity+=item.quantity;best[item.name].totalSatang+=item.quantity*item.unitPriceSatang;}
   return{totalSatang:orders.reduce((n,o)=>n+o.totalSatang,0)-refundTotal,cashSatang:orders.filter(o=>o.paymentMethod==='cash').reduce((n,o)=>n+o.totalSatang,0)-refunds.filter(o=>o.paymentMethod==='cash').reduce((n,o)=>n+o.totalSatang,0),transferSatang:orders.filter(o=>o.paymentMethod==='transfer').reduce((n,o)=>n+o.totalSatang,0)-refunds.filter(o=>o.paymentMethod==='transfer').reduce((n,o)=>n+o.totalSatang,0),refundSatang:refundTotal,orderCount:orders.length,bestSellers:Object.values(best).sort((a,b)=>b.quantity-a.quantity),lowStock:state.ingredients.filter(i=>units(i.stock)<=units(i.lowStock))};
  }else if(pathname==='/stock'){guard(['owner']);const row=state.ingredients.find(i=>i.id===body.ingredientId);if(!row||!body.reason?.trim())throw new Error('เลือกวัตถุดิบและระบุเหตุผล');const amount=units(body.quantity),remaining=units(row.stock)+amount;if(remaining<0)throw new Error('ยอดคงเหลือติดลบ');row.stock=String(remaining/1000);state.stockLog.push({...body,createdAt:new Date().toISOString()});result=row;}
  else if(pathname==='/users'&&method==='GET'){guard(['owner']);return state.users;}
  else if(pathname==='/users'){guard(['owner']);if(!body.username?.trim()||!['owner','cashier','bar'].includes(body.role)||state.users.some(u=>u.username===body.username))throw new Error('ชื่อผู้ใช้หรือสิทธิ์ไม่ถูกต้อง');result={id:newId(),username:body.username,role:body.role};state.users.push(result);}
  else if(pathname.startsWith('/users/')){guard(['owner']);const row=state.users.find(u=>u.id===id);if(!row)throw new Error('ไม่พบผู้ใช้');if(body.role&&!['owner','cashier','bar'].includes(body.role))throw new Error('สิทธิ์ไม่ถูกต้อง');Object.assign(row,body.role?{role:body.role}:{});result=row;}
  else if(pathname==='/ingredients'){guard(['owner']);if(!body.name?.trim()||!body.unit?.trim()||units(body.lowStock)<0)throw new Error('กรอกชื่อ หน่วย และขั้นต่ำ');result={id:newId(),...body,stock:'0'};state.ingredients.push(result);}
  else if(pathname.startsWith('/ingredients/')){guard(['owner']);const row=state.ingredients.find(i=>i.id===id);if(!row)throw new Error('ไม่พบวัตถุดิบ');if(body.lowStock!==undefined&&units(body.lowStock)<0)throw new Error('ขั้นต่ำติดลบ');Object.assign(row,body);result=row;}
  else if(pathname==='/menus'||pathname.startsWith('/menus/')){guard(['owner']);if(!body.name?.trim()||!body.category?.trim())throw new Error('กรอกชื่อเมนูและหมวด');number(body.priceSatang);
   for(const r of [...(body.recipe??[]),...(body.options??[]).flatMap((o:any)=>o.recipe??[])]){if(!state.ingredients.some(i=>i.id===r.ingredientId))throw new Error('วัตถุดิบไม่อยู่ในรายการ');units(String(r.quantity));}
   const row=state.menus.find(m=>m.id===id);if(method==='PATCH'&&!row)throw new Error('ไม่พบเมนู');result={...body,id:row?.id??newId()};if(row)Object.assign(row,result);else state.menus.push(result);
  }else if(pathname==='/seed-demo'){guard(['owner']);throw new Error('เดโมมีข้อมูลตัวอย่างแล้ว');}
  else throw new Error('ไม่พบรายการที่ร้องขอ');
  save(state);return clone(result);
 }
 return{request};
}
