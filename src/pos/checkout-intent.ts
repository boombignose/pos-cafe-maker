import {z} from 'zod';
import {newId} from '../id';
const schema=z.object({items:z.array(z.object({menuId:z.string(),quantity:z.number().int().min(1).max(100),optionIds:z.array(z.string())}).strict()).min(1).max(100),paymentMethod:z.enum(['cash','transfer']),amountTenderedSatang:z.number().int().min(0).max(1000000000),transferConfirmed:z.boolean(),idempotencyKey:z.string().uuid(),storeEpoch:z.string().min(1).max(128)}).strict();
export type CheckoutIntent=z.infer<typeof schema>;
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
export function readIntent(storage:Storage,key:string):CheckoutIntent|null{
 const text=storage.getItem(key);if(text===null)return null;
 try{return schema.parse(JSON.parse(text));}catch{throw new Error('ข้อมูลรายการชำระที่ค้างเสียหาย กรุณาให้เจ้าของตรวจประวัติบิลก่อนแก้ข้อมูลเบราว์เซอร์');}
}
export function beginIntent(storage:Storage,key:string,input:Omit<CheckoutIntent,'idempotencyKey'|'storeEpoch'>,storeEpoch='demo'):CheckoutIntent{
 const existing=readIntent(storage,key);if(existing)return existing;
 const intent=schema.parse({...input,idempotencyKey:newId(),storeEpoch});
 storage.setItem(key,JSON.stringify(intent));return intent;
}
export function clearIntent(storage:Storage,key:string,expectedKey?:string):void{
 if(expectedKey&&readIntent(storage,key)?.idempotencyKey!==expectedKey)return;
 storage.removeItem(key);
}
