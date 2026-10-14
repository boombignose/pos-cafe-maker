# ระบบร้านระดับ 1

ผู้ใช้อนุมัติให้ทำระดับ 1 และเลือก Windows เป็นเครื่องร้านหลัก: ติดตั้งแล้วขายจากหลาย browser ใน LAN โดยไม่แก้โค้ดและไม่ใช้ Docker ร้านเดียว เงินสด/โอนที่ตรวจเอง ไม่มี gateway/ใบกำกับภาษี/หลายสาขา/โต๊ะ ฮาร์ดแวร์คงสถานะต้นแบบ

ใช้ React และ Express/PostgreSQL เดิม ไม่เขียนแกนบัญชีใหม่ สร้างชุด release ที่มีเว็บโหมด server และ JS backend build แล้ว แยกจาก Pages/demo ที่ยังใช้ข้อมูลจำลอง ต้องติดตั้ง Node 24 LTS และ PostgreSQL 17/18 จากผู้ผลิตก่อน (ไม่เรียกชุดนี้ว่า installer ที่รวม dependencies)

Start.cmd เริ่ม launcher บน Windows; macOS/Linux มี start.sh Launcher สร้าง private PostgreSQL cluster เฉพาะ POS ใน user data directory ไม่แตะ cluster/database เดิม ฟัง DB เฉพาะ localhost สร้าง credentials สุ่ม ไม่มีรหัสเจ้าของร้านร่วมกัน Setup ครั้งแรกต้องใช้ token ของ installation นั้น และปิดถาวรเมื่อมีผู้ใช้ ตั้งร้าน/owner ใน browser หลังจากนั้น owner จัดการบัญชี ราคา สูตร สต็อกและ receipt ได้

Checkout บันทึก intent+idempotency key ลง browser ก่อนส่ง เมื่อไม่ทราบผลต้องล็อกการแก้ตะกร้าและ retry payload/key เดิม แม้ reload ห้ามสร้างบิลซ้ำ cart/pending แยกตาม user และโหมด Session หมดอายุให้ login ใหม่โดยคง pending เดิม ใช้ UUID บน HTTP LAN ได้

ข้อมูลร้านและราคา/สูตรจาก server เท่านั้น Receipt ตั้งชื่อร้าน ที่อยู่ โทรศัพท์ และ 58/80mm ได้ ประวัติบิลเลือกวันและพิมพ์ซ้ำได้ Owner เปลี่ยน role/password/active ได้แต่ปิด owner คนสุดท้ายไม่ได้

Launcher เก็บ config/DB/backups นอก source; รีสตาร์ตและอัปเดต source รักษาข้อมูล Backup custom pg_dump เป็นไฟล์ไม่ overwrite, SHA256, status และตั้งเวลาเมื่อระบบเปิด Restore เข้า database ใหม่ที่ว่างใน transaction ตรวจ schema แล้ว invalidate sessions; ไม่ล้าง database เดิมและสลับ config เมื่อสำเร็จเท่านั้น ล้มเหลวคง config เดิม Recovery ต้องเรียกตอน POS หยุด

หลักฐานต้องมี DB integration ไม่ SKIP, browser แยก context owner/cashier/bar, LAN UUID, response lost+reload retry, permission, receipts, insufficient stock/cash, manual transfer, shifts, restart+backup restore, ZIP fresh install. CI Windows รันทดสอบ launcher/backup และ server workflow ด้วย PostgreSQL จริง ส่วน Mac ตรวจได้ในเครื่องนี้ ไม่อ้าง Windows ผ่านก่อนเห็นผล CI ไม่อ้างร้านจริง/เครื่องพิมพ์จริงผ่านโดยไม่มีหลักฐาน

LAN รุ่นแรกใช้งานได้บน HTTP เครือข่ายร้านที่เชื่อถือได้; เอกสารบอกชัดว่าไม่ได้เข้ารหัสการส่งรหัส/session เมื่อใช้ HTTP และให้ตัวอย่าง HTTPS reverse proxy ก่อนใช้เครือข่ายร่วม/เปิดภายนอก ไม่เปิดฐานข้อมูลให้ LAN ไม่เปิด firewall อัตโนมัติ
