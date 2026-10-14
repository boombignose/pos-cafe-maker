import {useState} from 'react';
import {api,currentStoreEpoch} from './api';
import {readIntent,type CheckoutIntent} from './checkout-intent';
export default function Recovery(){
 const[items,setItems]=useState<{key:string;intent:CheckoutIntent}[]>(()=>{
  const result=[];for(let index=0;index<localStorage.length;index++){
   const key=localStorage.key(index);if(!key||!/^pos-cafe-shop-cart:[a-f0-9-]{36}:pending$/.test(key))continue;
   try{const intent=readIntent(localStorage,key);if(intent&&intent.storeEpoch!==currentStoreEpoch())result.push({key,intent});}catch{}
  }return result;
 }),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function acknowledge(key:string,intent:CheckoutIntent){
  if(!confirmed||!reason.trim())return;setBusy(true);setError('');
  try{await api('/recovery/ack','POST',{checkoutKey:intent.idempotencyKey,sourceEpoch:intent.storeEpoch,reason});localStorage.removeItem(key.slice(0,-8));localStorage.removeItem(key);setItems(items.filter(item=>item.key!==key));setReason('');setConfirmed(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 if(!items.length)return null;
 return <section className="panel"><h3>ตรวจบิลค้างหลังการกู้คืน</h3><p>รายการในเบราว์เซอร์นี้มาจากฐานข้อมูลก่อนกู้คืน ห้ามรับเงินซ้ำ ตรวจใบเสร็จ ยอดรับเงิน และฐานข้อมูลเดิมก่อนยืนยัน การปลดรายการไม่ลบหรือคืนเงินบิลที่ขายแล้ว</p><p role="alert" className="error">{error}</p><label>ผลตรวจและเหตุผล<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={160}/></label><label className="check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>เจ้าของตรวจบิลเดิมและยอดเงินจริงแล้ว</label>{items.map(({key,intent})=><article key={key}><p>รายการอ้างอิง {intent.idempotencyKey} · {intent.items.reduce((n,i)=>n+i.quantity,0)} ชิ้น</p><button disabled={busy||!confirmed||!reason.trim()} onClick={()=>acknowledge(key,intent)}>ยืนยันตรวจบิลและปลดรายการค้าง</button></article>)}</section>;
}
