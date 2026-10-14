export type CartItem = {menuId:string; quantity:number; optionIds:string[]};
export function satang(text:string):number {
 if(!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('กรอกจำนวนเงินเป็นบาท ทศนิยมไม่เกิน 2 ตำแหน่ง');
 const [whole,decimal='']=text.split('.'); const value=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(value)) throw new Error('จำนวนเงินมากเกินไป'); return value;
}
export function cartKey(id:string,options:string[]):string {return JSON.stringify([id,[...options].sort()]);}
export function restoreCart(text:string|null):CartItem[] {
 try {const value:unknown=JSON.parse(text??'[]');
  if(!Array.isArray(value)||value.length>100||value.some(item=>!item||typeof item.menuId!=='string'||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>1000||!Array.isArray(item.optionIds)||item.optionIds.some((id:unknown)=>typeof id!=='string'))) return [];
  return value.map(({menuId,quantity,optionIds})=>({menuId,quantity,optionIds}));
 }catch{return [];}
}
export function validateChoices(options:{id:string;group:string}[],selected:string[]):boolean {
 if(new Set(selected).size!==selected.length||selected.some(id=>!options.some(o=>o.id===id))) return false;
 return [...new Set(options.map(o=>o.group))].every(group=>options.filter(o=>o.group===group&&selected.includes(o.id)).length===1);
}
