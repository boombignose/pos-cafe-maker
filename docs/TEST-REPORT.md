# ผลตรวจระบบร้าน 0.2.0 — 14 ตุลาคม 2026

**ระบบร้าน (shop)** ใช้ PostgreSQL จริงและบัญชีผู้ใช้ ส่วน Pages/demo ยังเป็นข้อมูลจำลอง ตัวเลขและภาพทดสอบเป็น fixtures ที่สร้างเพื่อทดสอบ ไม่ใช่ยอดขาย/เงินรับร้านจริง ฮาร์ดแวร์ไม่เปลี่ยนจากรุ่น0.1.2 และยังไม่ผลิตหรือพิมพ์จริง

| การตรวจรุ่น0.2.0 | ผล / หลักฐาน |
|---|---|
| TypeScript/geometry/demo/API/runtime บน macOS | `TEST_DATABASE_URL=... RUN_SHOP_RUNTIME=true POS_PG_BIN=... npm test`:50 PASS,0 SKIP ในการตรวจรอบแรก; ตรวจรอบสุดท้ายหลัง review แยกในบันทึก release |
| PostgreSQL18 จริง | ขายพร้อมกัน/สต็อก/บิลซ้ำ/สูตร/คืนเงิน/กะ/สิทธิ์/CSRF และ immutable snapshots ผ่าน |
| ตั้งร้านและ migrations | tokenผิดไม่สร้าง owner; setupพร้อมกันสร้างได้ครั้งเดียว; settingsสิทธิ์ owner; migrationรักษาข้อมูลเดิมผ่าน |
| หลาย browser บน HTTP LAN จำลอง | [รายงาน](evidence/shop/report.json):3 contextเชื่อม Express/PostgreSQL จริง; insecure originทดสอบUUID; ไม่มี payment gateway |
| ผลชำระหาย | ให้ server commit แล้วทิ้ง response:ล็อกตะกร้า→reload→หมด session→login→retry keyเดิม;1บิล/ตัดสต็อกครั้งเดียว |
| ใบเสร็จ/ทีม | ชื่อร้านที่อยู่จาก snapshot,แก้ชื่อแล้วพิมพ์ซ้ำยังเป็นชื่อเดิม;ปิดบัญชีแล้ว sessionใช้ต่อไม่ได้;58/80mm เป็น browser layout ไม่ใช่การพิมพ์จริง |
| launcher/restart/backup restore | private clusterใน temp directory; sentinelคงอยู่;เปิดซ้ำถูกปฏิเสธ;รีสตาร์ตบิล/กะอยู่;pg_dump/pg_restoreจริงเข้า DBใหม่และ DBเดิมยังอยู่;ไฟล์เสีย/schemaไม่ตรงไม่สลับconfig |
| กู้ข้อมูลกับรายการชำระค้าง | store epochเปลี่ยนหลังrestore;ห้าม POSTcheckoutด้วยepochเก่า;ownerบันทึกเหตุผลปลดเฉพาะ browser draft โดยไม่สร้างบิลเพิ่ม |
| Windows | CI `windows-shop` ใช้ Windows Server2025/PostgreSQL17/Node24 ตรวจ build/test/browser/runtime; สถานะต้องดู run ที่ตรง release ไม่อ้างว่าเครื่อง Windows10/11 หรือเครื่องร้านจริงถูกตรวจแล้ว |
| ZIP/CI/publication | ผลตรวจหลังสร้างชุดใหม่และเผยแพร่บันทึกใน release;CIและhashต้องตรง source ที่แจก |

ยังไม่ได้ทดลองขายกับร้านจริง เครื่องพิมพ์จริง หรือหลายอุปกรณ์ผ่าน router/firewall จริง การตรวจหลาย browser เป็นการจำลองหลายจอบนเครื่องเดียว HTTP LAN ไม่เข้ารหัส ต้องใช้เครือข่ายที่เชื่อถือได้หรือจัด HTTPS

## ผลตรวจพิมพ์เขียวและเดโมรุ่น0.1.2 (ประวัติ)

# ผลตรวจชุดพิมพ์เขียว 0.1.2 — 14 ตุลาคม 2026

รุ่นส่งมอบเป็น **พิมพ์เขียวต้นแบบพร้อมเดโม POS ไม่ใช้ Docker** ข้อมูล POS เป็นข้อมูลร้านตัวอย่างในเบราว์เซอร์ รุ่น0.1.2 เปลี่ยนเคสเป็นมุมมน/หลุมหัวสกรู เพิ่มแท่นด้านหลังขันยึดกับฝา ตัวประคองหลังจอและช่องรัดสาย จออ้างอิงขนาดWaveshare7inch HDMI LCD(C) หน้าขายเน้นเมนูข้อความและตะกร้าในจอ1024×600 พร้อมหน้าต่างผลชำระ ไม่อ้างว่าประกอบผ่านแล้ว

| การตรวจ | หลักฐาน / ผล |
|---|---|
| TypeScript + Vite production build | ผ่าน `npm run build`; Designer lazy chunk ดูขนาด chunk จาก build log; warning ขนาดchunkไม่ทำให้ build fail; dependency Zod มี annotation warning ที่ไม่ทำให้ build fail |
| Unit/geometry/demo/accounting | `npm test`: 37 PASS, 1 PostgreSQL integration SKIP เพราะไม่มี TEST_DATABASE_URL ในเครื่องนี้ |
| Hardware manifest/metadata/stale checks | Python unittest 6 PASS และ `validate_export.py --check` ผ่าน; ไม่รวมไฟล์ตั้งค่ามุมมองชั่วคราว `.kicad_prl` ใน hash ของชุดแจก |
| PostgreSQL integration บน GitHub Actions | 40/40 tests ผ่าน รวมการขายพร้อมกัน สต็อกไม่พอ ชำระซ้ำ สิทธิ์ สูตร คืนเงิน และกะ; [CI ฐานรุ่น 0.1.0 ที่ผ่านครบ](https://github.com/boombignose/pos-cafe-maker/actions/runs/38537299751) รวม build, hardware checks และ browser smoke |
| KiCad10.0.7 schematic/PCB | ERC0, DRC0, unconnected0, schematic parity0, excluded violations0; [รายงานจริง](../hardware/reports/) |
| หน้าขายจอเล็ก | cashier-layout-smoke:1024×600 ปุ่มชำระและข้อความเงินสดไม่พอไม่ถูกตะกร้าตัด เป้าสัมผัสอย่างน้อย44px เลือกนม/ชำระเงิน/ปิดผลรับเงิน และไม่มี horizontal overflow บนมือถือ; [ภาพ](evidence/cashier-1024.png) |
| Browser desktop/mobile | [browser-report.json](evidence/browser-report.json): เงินสด55/ทอน45, ลาเต้นมโอ๊ตโอนจำลอง80, คิวเริ่มทำ/พร้อมรับ/ส่งมอบ, รายงาน135/2บิล, WebGL, ปรับจอ, ดาวน์โหลด ZIP, ไม่มี pageerror |
| STL และ assembly | [report.json](../examples/models/report.json): 4ชิ้น, bed fits, no default collisions; tests ตรวจผิวปิด two-manifold ที่0.001มม. และจอ/บอร์ดไม่ชนเคส รวมแท่นใน assembled transform, ทางสกรูตรงกับฝาและพื้นที่สาย; แบบหลายขนาดตรวจการชน/เตียงด้วย tests |
| Slicer | PrusaSlicer2.9.6 จากผู้ผลิตตรวจ hash/signature ผ่าน แต่เริ่มค้างก่อน appmain บน macOS นี้ จึงยังไม่เปิด STL/slice; [รายงาน](../examples/models/slicer-validation.json) |
| Fresh compiled-demo ZIP | แตกไฟล์ใหม่ เสิร์ฟด้วย Python static server แล้วรัน browser smoke ชุดเดียวกันผ่าน |
| เดโมออนไลน์ GitHub Pages | [เปิดเดโม](https://boombignose.github.io/pos-cafe-maker/) ผ่าน browser smoke ชุดเดียวกัน รวมขาย คิว รายงาน WebGL และดาวน์โหลด STL; ผลตรวจอยู่ใน evidence |

## ขอบเขตหลักฐาน

พรีวิวและไฟล์พิมพ์ใช้ geometry JSCAD ชุดเดียวกัน ตรวจช่องหน้าจอ กล่องกลวง ช่องพอร์ตและรูยึดจริง ไม่ใช่ตรวจว่ามีชื่อไฟล์เท่านั้น การเปลี่ยนรู PCB ทำให้เสายึดจริงเปลี่ยน การหมุนบอร์ดจำกัดรอบแกนZ และการชนอุปกรณ์ใช้ envelope แบบ conservative

การ refund/ชำระซ้ำทดสอบทั้งกรณีย้อนหลังปิดกะ เปลี่ยนสูตรหลังขาย โอนยอดไม่ตรง และ keyคืนเงินซ้ำต่างบิล เดโมรักษาตะกร้าและประวัติข้าม reload ภายใน origin เดียว แต่ไม่ได้รับรอง concurrency ของหลายแท็บ/เครื่องหรือความปลอดภัยแบบระบบร้าน

ข้อจำกัด ณ รุ่น0.1.2: ยังไม่ตรวจ PostgreSQL runtime/backup restore ในเครื่องนี้, เครื่องพิมพ์ใบเสร็จจริง, เคสที่พิมพ์, การประกอบจอ, โหลด/ความร้อน/การป้องกันวงจรจริง ไม่มีการรับชำระเงินจริงหรือการตรวจยอดธนาคาร
