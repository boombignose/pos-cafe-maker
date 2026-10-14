export type User={id:string;username:string;role:'owner'|'cashier'|'bar';active?:boolean};
export type Shop={name:string;address:string;phone:string;paper:'58'|'80'};
export type Session={user:User|null;setupRequired?:boolean;storeEpoch?:string};
export type Recipe={ingredientId:string;quantity:string};
export type Option={id:string;group:string;name:string;priceSatang:number;recipe:Recipe[]};
export type Menu={id:string;name:string;category:string;priceSatang:number;active:boolean;recipe:Recipe[];options:Option[]};
export type Ingredient={id:string;name:string;unit:string;stock:string;lowStock:string};
export type Catalog={menus:Menu[];ingredients:Ingredient[]};
export type Order={id:string;queueNumber:number;status:string;totalSatang:number;changeSatang:number;paymentMethod:string;createdAt:string;shop?:Shop|null;items:{name:string;quantity:number;unitPriceSatang:number;options:string[]}[]};
export type Shift={id:string;openingCashSatang:number;expectedCashSatang:number;countedCashSatang?:number;differenceSatang?:number};
export type Report={totalSatang:number;cashSatang:number;transferSatang:number;refundSatang:number;orderCount:number;bestSellers:{name:string;quantity:number;totalSatang:number}[];lowStock:Ingredient[]};
let csrfToken='',storeEpoch='';
export const currentStoreEpoch=()=>demoMode?'demo':storeEpoch;
export const demoMode=import.meta.env.VITE_APP_MODE!=='server';
let demo:Promise<ReturnType<typeof import('./demo').createDemoStore>>|undefined;
const messages:Record<string,string>={AUTH_REQUIRED:'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',INVALID_CSRF:'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',INVALID_CREDENTIALS:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',FORBIDDEN:'บัญชีนี้ไม่มีสิทธิ์ทำรายการ',LAST_OWNER:'ต้องเหลือเจ้าของร้านที่ใช้งานได้อย่างน้อยหนึ่งคน',LOGIN_RATE_LIMIT:'เข้าสู่ระบบบ่อยเกินไป กรุณารอ 10 นาที',UNDERPAID:'เงินสดที่รับไม่พอ กรุณาตรวจยอด',INSUFFICIENT_STOCK:'วัตถุดิบไม่พอ กรุณาตรวจสต็อก',NO_OPEN_SHIFT:'เปิดกะก่อนรับชำระ',UNCONFIRMED_TRANSFER:'ตรวจยอดโอนเข้าบัญชีให้ตรงกับยอดบิลก่อนยืนยัน',STORE_RESTORED:'ฐานข้อมูลกู้คืนแล้ว ให้เจ้าของตรวจบิลค้างก่อนขายต่อ',IDEMPOTENCY_CONFLICT:'รายการชำระค้างขัดแย้ง กรุณาให้เจ้าของตรวจประวัติบิล',MENU_UNAVAILABLE:'เมนูนี้หยุดขายแล้ว กรุณาตรวจตะกร้า',INVALID_OPTIONS:'ตัวเลือกเมนูเปลี่ยน กรุณาเลือกใหม่',INTERNAL_ERROR:'ระบบทำรายการไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองรายการเดิม',CONFLICT:'ข้อมูลซ้ำ หรือมีกะที่เปิดอยู่แล้ว'};
export class ApiFailure extends Error{
 constructor(public status:number,public code:string,message:string){super(messages[code]??message);}
}
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const {storeEpoch:paymentEpoch,...payment}=path==='/checkout'&&body&&typeof body==='object'?body as Record<string,unknown>:{};
 const requestBody=path==='/checkout'?payment:body;
 if(demoMode){demo??=import('./demo').then(m=>m.createDemoStore(localStorage));return(await demo).request(path,method,requestBody) as Promise<T>;}
 if(method!=='GET'&&!csrfToken)await api('/session');
 let response:Response;
 try{response=await fetch(`/api${path}`,{method,credentials:'same-origin',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(paymentEpoch?{'X-POS-Epoch':String(paymentEpoch)}:{}),...(method==='GET'?{}:{'X-CSRF-Token':csrfToken})},body:requestBody===undefined?undefined:JSON.stringify(requestBody)});}catch{throw new ApiFailure(0,'CONNECTION_LOST','ขาดการเชื่อมต่อ หากกำลังชำระให้ตรวจผลรายการเดิม อย่ารับเงินซ้ำ');}
 const data=await response.json().catch(()=>{throw new ApiFailure(0,'INVALID_RESPONSE','ยังไม่ทราบผลรายการ เซิร์ฟเวอร์ไม่ตอบข้อมูล กรุณาตรวจการเชื่อมต่อ');});
 if(!response.ok){if(path!=='/login'&&(response.status===401||data.code==='INVALID_CSRF')){csrfToken='';window.dispatchEvent(new Event('pos-auth-required'));}throw new ApiFailure(response.status,data.code??'API_ERROR',data.error??'ทำรายการไม่สำเร็จ');}
 if(data?.csrfToken)csrfToken=data.csrfToken;if(data?.storeEpoch)storeEpoch=data.storeEpoch;if(path==='/logout')csrfToken='';return data as T;
}
export const money=(value:number)=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(value/100);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const statusText:Record<string,string>={queued:'รอทำ',preparing:'กำลังทำ',ready:'พร้อมรับ',completed:'ส่งมอบแล้ว',refunded:'คืนเงินแล้ว'};
