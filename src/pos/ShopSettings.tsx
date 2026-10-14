import React,{useEffect,useState} from 'react';
import {api,type Shop} from './api';
import Backups from './Backups';
import Recovery from './Recovery';
export default function ShopSettings(){
 const[shop,setShop]=useState<Shop|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{api<Shop>('/settings').then(setShop).catch(e=>setError(e.message));},[]);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{setShop(await api<Shop>('/settings','PUT',shop));setMessage('บันทึกข้อมูลร้านแล้ว');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><section className="panel"><h3>ข้อมูลร้านและใบเสร็จ</h3><p role="alert" className="error">{error}</p><p role="status">{message}</p>{shop&&<form onSubmit={save}><label>ชื่อร้าน<input required maxLength={120} value={shop.name} onChange={e=>setShop({...shop,name:e.target.value})}/></label><label>ที่อยู่บนใบเสร็จ<textarea maxLength={500} value={shop.address} onChange={e=>setShop({...shop,address:e.target.value})}/></label><label>โทรศัพท์ร้าน<input maxLength={40} value={shop.phone} onChange={e=>setShop({...shop,phone:e.target.value})}/></label><label>กระดาษใบเสร็จ<select value={shop.paper} onChange={e=>setShop({...shop,paper:e.target.value as Shop['paper']})}><option value="80">80 มม.</option><option value="58">58 มม.</option></select></label><button className="primary" disabled={busy}>บันทึกข้อมูลร้าน</button><p>บิลที่ขายไปแล้วเก็บข้อมูลร้าน ณ เวลาขาย การแก้ชื่อร้านจะมีผลกับบิลใหม่</p></form>}</section><Backups/><Recovery/></>;
}
