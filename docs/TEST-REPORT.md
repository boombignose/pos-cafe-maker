# ผลตรวจรุ่นเดโม 0.1.0 — 14 ตุลาคม 2026

รุ่นส่งมอบตามการปรับขอบเขต **เดโมก่อน ไม่ใช้ Docker** ข้อมูล POS เป็นข้อมูลจำลองในเบราว์เซอร์

| การตรวจ | หลักฐาน / ผล |
|---|---|
| TypeScript + Vite production build | ผ่าน `npm run build`; Designer lazy chunk ~806KB /224KB gzip; dependency Zod มี annotation warning ที่ไม่ทำให้ build fail |
| Unit/geometry/demo/accounting | `npm test`: 32 PASS, 1 PostgreSQL integration SKIP เพราะไม่มี TEST_DATABASE_URL ในเครื่องนี้ |
| Hardware manifest/metadata/stale checks | Python unittest 5 PASS และ `validate_export.py --check` ผ่าน |
| KiCad10.0.7 schematic/PCB | ERC0, DRC0, unconnected0, schematic parity0, excluded violations0; [รายงานจริง](../hardware/reports/) |
| Browser desktop/mobile | [browser-report.json](evidence/browser-report.json): เงินสด55/ทอน45, ลาเต้นมโอ๊ตโอนจำลอง80, คิวเริ่มทำ/พร้อมรับ/ส่งมอบ, รายงาน135/2บิล, WebGL, ปรับจอ, ดาวน์โหลด ZIP, ไม่มี pageerror |
| STL และ assembly | [report.json](../examples/models/report.json): 4ชิ้น, bed fits, no default collisions; tests ตรวจผิวปิด two-manifold ที่0.001มม. และจอ/บอร์ดไม่ชนเคส รวมฐานใน assembled transform |
| Slicer | PrusaSlicer2.9.6 จากผู้ผลิตตรวจ hash/signature ผ่าน แต่เริ่มค้างก่อน appmain บน macOS นี้ จึงยังไม่เปิด STL/slice; [รายงาน](../examples/models/slicer-validation.json) |
| Fresh compiled-demo ZIP | แตกไฟล์ใหม่ เสิร์ฟด้วย Python static server แล้วรัน browser smoke ชุดเดียวกัน ผลตรวจอยู่ใน evidence |

## ขอบเขตหลักฐาน

พรีวิวและไฟล์พิมพ์ใช้ geometry JSCAD ชุดเดียวกัน ตรวจช่องหน้าจอ กล่องกลวง ช่องพอร์ตและรูยึดจริง ไม่ใช่ตรวจว่ามีชื่อไฟล์เท่านั้น การเปลี่ยนรู PCB ทำให้เสายึดจริงเปลี่ยน การหมุนบอร์ดจำกัดรอบแกนZ และการชนอุปกรณ์ใช้ envelope แบบ conservative

การ refund/ชำระซ้ำทดสอบทั้งกรณีย้อนหลังปิดกะ เปลี่ยนสูตรหลังขาย โอนยอดไม่ตรง และ keyคืนเงินซ้ำต่างบิล เดโมรักษาตะกร้าและประวัติข้าม reload ภายใน origin เดียว แต่ไม่ได้รับรอง concurrency ของหลายแท็บ/เครื่องหรือความปลอดภัยแบบระบบร้าน

ยังไม่ตรวจ PostgreSQL runtime ในเครื่องนี้, backup/restore ของฐานข้อมูลจริง, เครื่องพิมพ์ใบเสร็จจริง, เคสที่พิมพ์, การประกอบจอ, โหลด/ความร้อน/การป้องกันวงจรจริง ไม่มีการรับชำระเงินจริงหรือการตรวจยอดธนาคาร
