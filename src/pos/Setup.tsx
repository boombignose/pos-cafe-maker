import React,{useState} from 'react';
import {api,type User} from './api';
export default function Setup({onReady}:{onReady:(user:User)=>void}){
 const[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const data=new FormData(event.currentTarget);
  if(data.get('password')!==data.get('repeat')){setError('รหัสผ่านสองช่องไม่ตรงกัน');return;}
  setBusy(true);setError('');
  try{const username=data.get('username'),password=data.get('password');await api('/setup','POST',{token:data.get('token'),username,password,shop:{name:data.get('name'),address:data.get('address'),phone:data.get('phone'),paper:data.get('paper')}});const result=await api<{user:User}>('/login','POST',{username,password});onReady(result.user);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel login"><h2>ตั้งร้านครั้งแรก</h2><p>สร้างบัญชีเจ้าของร้าน ไม่มีรหัสผ่านเริ่มต้น เปิด SETUP-TOKEN.txt จากเครื่องร้านเพื่อรับรหัสตั้งค่า</p><form onSubmit={submit}><label>รหัสตั้งร้าน<input name="token" required autoComplete="off"/></label><label>ชื่อร้าน<input name="name" required maxLength={120}/></label><label>ที่อยู่บนใบเสร็จ<textarea name="address" maxLength={500}/></label><label>โทรศัพท์ร้าน<input name="phone" maxLength={40}/></label><label>กระดาษใบเสร็จ<select name="paper"><option value="80">80 มม.</option><option value="58">58 มม.</option></select></label><label>ชื่อบัญชีเจ้าของร้าน<input name="username" required pattern="[a-zA-Z0-9_.-]{3,40}" autoComplete="username"/></label><label>รหัสผ่านเจ้าของร้าน<input name="password" required type="password" minLength={12} maxLength={128} autoComplete="new-password"/></label><label>ยืนยันรหัสผ่าน<input name="repeat" required type="password" minLength={12} autoComplete="new-password"/></label><small>อย่างน้อย 12 ตัวอักษร ใช้รหัสเฉพาะร้านที่เดายาก</small><button className="primary" disabled={busy}>{busy?'กำลังตั้งร้าน…':'สร้างร้านและเริ่มใช้งาน'}</button><p role="alert" className="error">{error}</p></form></section>;
}
