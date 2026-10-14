# Backend ระบบร้าน 0.2.0

ชุดพร้อมใช้เลือก [shop ZIP และ Windows launcher](INSTALL.md) ซึ่งจัดการ PostgreSQL ส่วนตัวและตั้งร้านผ่าน browser โดยไม่ใช้ Docker ส่วนคำสั่งด้านล่างใช้สำหรับนักพัฒนาที่มีฐานข้อมูล PostgreSQL เอง ไม่ใช้ managed backup/restore ของ launcher ระบบร้านผ่าน PostgreSQL integration และ restart/backup/restore ในการตรวจดิจิทัล ดู [ผลตรวจ](TEST-REPORT.md) แยกจากการใช้งานร้าน/เครื่องพิมพ์จริง

Frontend เริ่มต้นใช้ข้อมูลจำลอง ต้อง build ใหม่ก่อนรัน backend เพื่อให้ UI เรียก API จริง:

```sh
VITE_APP_MODE=server npm run build
```

ถ้ารัน `npm run build` โดยไม่ตั้งค่านี้ ผลลัพธ์จะยังเป็นเดโม localStorage แม้ Express จะทำงานอยู่

# PostgreSQL ภายนอกสำหรับนักพัฒนา

**ตัวสาธิตเริ่มต้นทำงานในเบราว์เซอร์ ไม่ต้องใช้ Docker หรือ PostgreSQL** Backend นี้ใช้เป็นระบบกลางหลายเครื่องได้ ผลตรวจซอฟต์แวร์ยังไม่ยืนยันการใช้งานร้านหรือเครื่องพิมพ์ของคุณ การทดสอบ unit ผ่านได้โดยไม่เชื่อมฐานข้อมูล ส่วน concurrency/SQL/permission integration ต้องรันกับ PostgreSQL จริงตามด้านล่าง สถานะล่าสุดให้ดูรายงานทดสอบของ release

## เริ่ม backend เมื่อมี PostgreSQL

ต้องมี Node.js 22+ และ PostgreSQL 14+ ไม่ต้องใช้ Docker สร้างฐานข้อมูลและบัญชี PostgreSQL เฉพาะโครงการก่อน แล้วตั้ง environment ใน terminal:

```sh
export DATABASE_URL='postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/YOUR_DATABASE'
export OWNER_USERNAME='your-owner'
# ตั้ง OWNER_PASSWORD เป็นรหัสเฉพาะที่ยาวอย่างน้อย 12 ตัวอักษร อย่าใส่รหัสจริงลง git
npm run setup
npm run server
```

`setup` รัน migration แบบ transaction และสร้าง owner เฉพาะเมื่อยังไม่มีผู้ใช้แม้แต่คนเดียว จะไม่เขียนทับบัญชีเดิม รหัสผ่านสั้น รหัสยอดนิยม รหัสซ้ำตัวเดียว และรหัสตัวเลขล้วนถูกปฏิเสธ `server` รัน migration ที่ยังไม่เคยใช้ แล้วเริ่ม port `3001` (เปลี่ยนผ่าน `PORT`) พร้อมเสิร์ฟ frontend ที่ build ใน `dist/` ไม่มีการ seed เมนูอัตโนมัติ Owner กด seed หรือเรียก `POST /api/seed-demo` ได้เฉพาะเมื่อทั้งเมนูและวัตถุดิบว่าง

หากใช้ HTTPS ตั้ง `COOKIE_SECURE=true` และ `PUBLIC_ORIGIN=https://your.example` ให้ตรงเว็บไซต์จริง การทดสอบ HTTP ภายในเครื่องใช้ cookie ที่ไม่ตั้ง Secure เพื่อให้เบราว์เซอร์รับได้ ไม่มี CORS ข้าม origin ใน API หาก reverse proxy เปลี่ยน Host ให้ตั้ง `PUBLIC_ORIGIN` ชัดเจน

## Authentication และสิทธิ์

เรียก `GET /api/session` ก่อน login เพื่อรับ anonymous session cookie และ `csrfToken`; ทุก POST/PATCH ต้องส่ง `Origin` ของเว็บไซต์และ `X-CSRF-Token` หลัง login ได้ token ใหม่ ต้องใช้ token ใหม่นั้น Cookie เป็น HttpOnly, SameSite=Strict, อายุ 12 ชั่วโมง มีค่า opaque สุ่ม 256 bit; ฐานข้อมูลเก็บเฉพาะ SHA-256 digest ของค่า cookie Password ใช้ Node.js scrypt พร้อม salt แยกทุกคน ไม่มีรหัสเริ่มต้นใน source

Login limiter อยู่ใน PostgreSQL จึงแชร์ระหว่าง process: ไม่เกิน 5 ครั้งต่อ username+IP และ 30 ครั้งต่อ IP ใน 10 นาที (รวมสำเร็จ) เกินแล้วตอบ `429` ทั้งชื่อผิดและรหัสผิดตอบเหมือนกัน Password/role/active update ล้าง session ของบัญชีนั้นทั้งหมด Logout ล้าง session เดียว ต้องมี owner ที่ active อย่างน้อยหนึ่งคนเสมอ API error ยังคงมี `error` string และเพิ่ม `code`, `status` สำหรับ UI; route ไม่พบตอบ `404`

| งาน | Owner | Cashier | Bar |
|---|---|---|---|
| อ่าน catalog/orders | ได้ | ได้ | ได้ |
| เปิด/ปิดกะ, checkout | ได้ | ได้ | ไม่ได้ |
| queued → preparing → ready | ได้ | ไม่ได้ | ได้ |
| ready → completed | ได้ | ได้ | ไม่ได้ |
| ผู้ใช้, เมนู, ตัวเลือก, recipe, สต็อก, seed, refund, reports | ได้ | ไม่ได้ | ไม่ได้ |

หนึ่งร้านมีกะที่ยังเปิดได้หนึ่งกะ ผู้ใช้ cashier ที่ได้รับสิทธิ์หรือ owner เปิด/ปิดกะร้านร่วมกันได้ เปิดกะก่อน checkout เสมอ ยอดเงินทุกช่องเป็น integer สตางค์ API ไม่รับราคาใน cart และไม่เชื่อราคาจาก browser จำนวนสินค้าต่อรายการ 1–100; ไม่เกิน 100 รายการ/บิล และยอดบิลไม่เกิน 1,000,000,000 สตางค์

## Stock, payment และ idempotency

`NUMERIC(18,6)` ทำบัญชี stock ใน PostgreSQL API ใช้ decimal string เท่านั้น ไม่ใช้ JavaScript floating point คำนวณปริมาณ รองรับทศนิยมไม่เกิน 6 ตำแหน่ง Recipe หลักเป็นจำนวนไม่ติดลบ ส่วน option เป็น delta ติดลบเพื่อแทนวัตถุดิบได้ ทุก group ที่มี option ต้องเลือกหนึ่งรายการพอดี ผลรวม recipe ของแต่ละรายการหลัง option ต้องไม่ติดลบ

Checkout อยู่ใน transaction เดียว: ล็อก idempotency key → กะ → เมนู → วัตถุดิบเรียง UUID จากน้อยไปมาก; คิดราคาบน server; สร้าง snapshot recipe/item และ queue; ลด stock; เพิ่มยอดเงินสดกะ ความล้มเหลว rollback ทั้งชุด Stock ไม่มีทางติดลบผ่าน checkout เลข queue ไม่ซ้ำในวัน Bangkok เดียวกัน วันใหม่เริ่มที่ 1 รายการค้างจากวันก่อนยังอยู่ในหน้า orders พร้อมรายการทั้งหมดของวันปัจจุบัน

Cash ยอดรับต้องไม่น้อยกว่ายอดรวม คืน change; transfer ต้อง `transferConfirmed=true` และยอดรับเท่ากับยอดบิล **นี่คือการยืนยันมือของพนักงาน ไม่มีการตรวจสอบธนาคารอัตโนมัติ**

Idempotency scope เป็น operation+key ทั้งร้าน เก็บ user, canonical body hash และ response เดิมอย่างถาวร key เดิม+body เดิม+user เดิมคืน response เดิม แม้ order เปลี่ยน status ไปแล้ว key เดิมกับ payload/user อื่นตอบ `409` การเรียกพร้อมกันรอ transaction แรกจบ ไม่สร้าง order ซ้ำ key checkout และ key refund อยู่คนละ operation Client ควรสร้าง UUID ใหม่ต่อความตั้งใจขาย/คืนเงินหนึ่งครั้ง และใช้ค่าเดิมเมื่อ retry

Paid item/recipe/ยอดเงิน/กะ/queue snapshots แก้ไม่ได้ผ่าน DB trigger; status เปลี่ยนได้ตามลำดับที่ API กำหนด Owner refund ได้ทั้งบิลครั้งเดียว พร้อมเหตุผลและ idempotency key เฉพาะบิลที่ยัง queued เท่านั้นคืน stock โดยใช้ recipe snapshot เดิม บิล preparing/ready/completed ไม่คืน stock หากแก้สูตรเมนูหลังขาย ผลคืน stock ยังตรงกับตอนขาย เงินสดปรับกะต้นทางแม้กะนั้นปิดแล้ว และคำนวณ difference ใหม่ โดยไม่ย้ายคืนเงินไปกะปัจจุบัน

Reports ใช้วัน `Asia/Bangkok`: sales ของวันที่เลือก ลบ refunds ที่เกิดในวันที่เลือก `orderCount` นับบิลขายทั้งหมดในวันนั้น รวมบิลที่คืนแล้ว `bestSellers` นับบิลขายในวันนั้นที่ยังไม่ refunded (ชื่อจาก snapshot) `lowStock` เป็นยอดปัจจุบัน เงินคืนบิลเก่าอาจทำยอด net วันคืนติดลบ CSV มี UTF-8 BOM, quote/escape และป้องกัน spreadsheet formula injection

## ทดสอบโดยไม่ลบฐานข้อมูลเดิม

```sh
npm test
TEST_DATABASE_URL='postgresql://YOUR_TEST_USER:YOUR_TEST_PASSWORD@localhost:5432/YOUR_TEST_DATABASE' npm run test:db
```

DB tests สร้าง schema `pos_test_<random>` ในฐานข้อมูลทดสอบที่ระบุ ตั้ง connection search_path ให้ schema นั้น และลบ **เฉพาะ schema ที่ตัวทดสอบสร้าง** ตอนจบ ไม่ drop database และไม่แตะ public schema ห้ามใช้ production credentials สำหรับ TEST_DATABASE_URL ต้องให้ test user มีสิทธิ์ CREATE SCHEMA

Suite ครอบคลุม exact decimal, concurrent duplicate key, simultaneous oversell, rollback, owner/cashier/bar, CSRF/Origin, transfer confirmation, recipe replacement/negative consumption, unique queue, refunds, immutable snapshots, shift reconciliation และ invalidated sessions ถ้าไม่ตั้ง TEST_DATABASE_URL จะแสดง SKIP ชัดเจน การผ่าน unit test หรือ build ไม่ได้แปลว่า DB integration ผ่าน

ข้อจำกัด: ไม่มี payment gateway, fiscal receipt/tax engine, MFA, multi-café routing หรือ offline synchronization ไม่ได้ทดสอบเครื่องพิมพ์/ลิ้นชักจริง เซิร์ฟเวอร์ต้องมี backup และการจำกัดเครือข่ายก่อนใช้กับข้อมูลร้านจริง
