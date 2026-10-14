import {useEffect,useState} from 'react';
import {api} from './api';
type Status={managed:boolean;lastBackup?:string|null;file?:string|null;error?:string|null;restoredAt?:string};
export default function Backups(){
 const[status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){try{setStatus(await api<Status>('/operations'));}catch(e){setError((e as Error).message);}}
 useEffect(()=>{refresh();},[]);
 async function backup(){setBusy(true);setError('');try{await api('/backup','POST',{});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="panel"><h3>สำรองข้อมูลร้าน</h3><button onClick={refresh}>อัปเดตสถานะสำรอง</button><p role="alert" className="error">{error||status?.error}</p>{status?.managed?<><p>สำรองล่าสุด: {status.lastBackup?new Date(status.lastBackup).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'ยังไม่มีไฟล์สำรอง'}</p>{status.file&&<p>{status.file}</p>}<button disabled={busy} onClick={backup}>{busy?'กำลังสำรอง…':'สำรองข้อมูลตอนนี้'}</button><p>ระบบสำรองวันละครั้งขณะที่เปิดอยู่ เก็บในโฟลเดอร์ข้อมูลร้าน คัดลอกไฟล์ .dump และ .dump.json ไปเก็บอีกเครื่องหรือไดรฟ์ด้วย</p><p>การกู้คืนต้องปิด POS ก่อน ดู INSTALL.md ระบบจะเก็บฐานข้อมูลเดิมไว้</p></>:<p>การสำรองผ่านหน้านี้ใช้ได้เมื่อเปิดด้วยชุดระบบร้าน ดู INSTALL.md</p>}</section>;
}
