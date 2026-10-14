export type User={id:string;username:string;role:'owner'|'cashier'|'bar'};
export type Recipe={ingredientId:string;quantity:string};
export type Option={id:string;group:string;name:string;priceSatang:number;recipe:Recipe[]};
export type Menu={id:string;name:string;category:string;priceSatang:number;active:boolean;recipe:Recipe[];options:Option[]};
export type Ingredient={id:string;name:string;unit:string;stock:string;lowStock:string};
export type Catalog={menus:Menu[];ingredients:Ingredient[]};
export type Order={id:string;queueNumber:number;status:string;totalSatang:number;changeSatang:number;paymentMethod:string;createdAt:string;items:{name:string;quantity:number;unitPriceSatang:number;options:string[]}[]};
export type Shift={id:string;openingCashSatang:number;expectedCashSatang:number;countedCashSatang?:number;differenceSatang?:number};
export type Report={totalSatang:number;cashSatang:number;transferSatang:number;refundSatang:number;orderCount:number;bestSellers:{name:string;quantity:number;totalSatang:number}[];lowStock:Ingredient[]};
let csrfToken='';
export const demoMode=import.meta.env.VITE_APP_MODE!=='server';
let demo:Promise<ReturnType<typeof import('./demo').createDemoStore>>|undefined;
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
 if(demoMode){demo??=import('./demo').then(m=>m.createDemoStore(localStorage));return(await demo).request(path,method,body) as Promise<T>;}
 const response=await fetch(`/api${path}`,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(method==='GET'?{}:{'X-CSRF-Token':csrfToken})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json().catch(()=>({error:'เซิร์ฟเวอร์ไม่ตอบข้อมูล กรุณาตรวจการเชื่อมต่อ'}));
 if(!response.ok)throw new Error(data.error??'ทำรายการไม่สำเร็จ');
 if(data.csrfToken)csrfToken=data.csrfToken;return data as T;
}
export const money=(value:number)=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(value/100);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const statusText:Record<string,string>={queued:'รอทำ',preparing:'กำลังทำ',ready:'พร้อมรับ',completed:'ส่งมอบแล้ว',refunded:'คืนเงินแล้ว'};
