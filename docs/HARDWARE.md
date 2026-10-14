# บอร์ดพัดลม/ไฟสถานะ 5V — ต้นแบบที่ยังไม่ผลิตจริง

บอร์ดสองชั้น 80 × 50 × 1.6 mm นี้รับ **5V DC ที่แยกจากไฟบ้านแล้ว** ผ่าน J1 และจ่ายให้พัดลม brushless ผ่าน J2 มี PTC F1 ป้องกันกระแสเกินและ Schottky D1 ต่ออนุกรมป้องกันกลับขั้ว ส่วน R1 + D2 แสดงว่าฝั่งเอาต์พุตมีไฟ ไม่ได้แสดงสถานะ POS หรือควบคุมพัดลมด้วย GPIO

SBC และจอใช้ adapter ที่ผู้ผลิตแนะนำแยกต่างหาก บอร์ดนี้ไม่รองรับไฟบ้าน การชาร์จแบตเตอรี่ หรือมอเตอร์แปรงถ่านเปล่า

## ไฟล์ที่แก้ไขและผลิตได้

- เปิด `hardware/sources/accessory.kicad_pro` ด้วย KiCad 10: schematic, PCB, symbols และ footprints อยู่ในโครงการ ไม่ต้องดาวน์โหลดไลบรารีเพิ่มเติม
- `hardware/BOM.csv`: ชิ้นส่วนผู้ผลิต/MPN แน่นอน พร้อมลิงก์ datasheet ผู้ผลิต; พัดลมและ adapter ภายนอกไม่รวม BOM ของ PCB
- `hardware/wiring.svg` และ `hardware/wiring.json`: การต่อสายและหมายเลขขา
- `hardware/manufacturing/gerbers/`: F.Cu/B.Cu, solder mask, silkscreen, Edge.Cuts, แยก PTH/NPTH drill และ drill maps
- `hardware/manufacturing/accessory-schematic.pdf` และ `accessory-layout.svg`: ส่งออกจาก KiCad จริง
- `hardware/manufacturing/accessory-board.step`: PCB + รู + copper; **ไม่มีโมเดลรูปร่างชิ้นส่วนจริง** ใช้ envelope ใน board.json ตรวจพื้นที่เหนือบอร์ดแทน
- `hardware/reports/erc.json`, `drc.json`, `validation.json`, `commands.log`: ผลจาก KiCad 10.0.7 จริง; ERC/DRC ทุก severity รวม exclusion มี 0 violations, 0 unconnected และ 0 schematic parity issues

แนะนำโรงงาน: FR4 2 layers, 1.6 mm, 1 oz copper, plated component holes, 3.2 mm NPTH mounting holes, solder mask สองด้าน ตรวจ Gerber/drill กับโรงงานอีกครั้งก่อนสั่งผลิต ไม่ได้ทดสอบความคลาดเคลื่อนรู/ตัวเรือนจริง

## ขอบเขตทางไฟฟ้า

ใช้แหล่งจ่ายภายนอกแบบ isolated regulated 5V ที่จำกัดกระแสไม่เกิน 1A และสาย/ขั้วที่เหมาะสมกับกระแส ตั้งเป้า **โหลดรวมไม่เกิน 0.5A ที่อุณหภูมิรอบบอร์ดไม่เกิน 40°C** แนะนำพัดลมใช้กระแสขณะหมุน ≤0.3A เพื่อเหลือระยะเผื่อกระแสเริ่มหมุน ให้รวมกระแส LED และกระแสเริ่มหมุนในการวัดด้วย

เอาต์พุตต่ำกว่า 5V เนื่องจาก D1 และ F1: [Vishay 1N5822 datasheet](https://www.vishay.com/docs/88526/1n5820.pdf) ระบุ forward drop สูงสุด 0.525V ที่ 3A; ค่านั้นไม่ใช่ค่าที่รับประกันว่าบอร์ดนี้จะตกคร่อมเท่ากันทุกสภาวะ ส่วน [Littelfuse 60R datasheet](https://www.littelfuse.com/assetdocs/littelfuse-ptc-60r-datasheet?assetguid=4958c2df-9bef-4f0d-aef5-841b1564130c) ระบุ hold/trip 0.75/1.5A ที่ 20°C, hold ลดเหลือ 0.61A ที่ 40°C และ R1max 0.6Ω หลัง trip ตัวอย่างที่ 0.5A PTC อาจตกคร่อม 0.3V จึงต้องวัดแรงดันเมื่อมีโหลดและเลือกพัดลมที่เริ่มหมุนได้ในแรงดันจริง

PTC เป็นอุปกรณ์ความร้อน ไม่ใช่ตัวจำกัดกระแสทันทีที่ 0.5A และอาจร้อนมากเมื่อ trip ห้ามวางชิดพลาสติก/สาย โดยต้องประเมินระยะห่างและอุณหภูมิจากการทดสอบประกอบจริง ถ้า trip ให้ตัดไฟ รอเย็นและหาสาเหตุก่อนเริ่มใหม่

## ต่อและตรวจประกอบ

1. J1 pad1 รับ +5V; pad2 รับ 0V/GND ตาม silk `IN + -`
2. D1 **แถบ cathode อยู่ pad2 ฝั่ง J2** footprint ของโครงการนี้ใช้ A=1, K=2 อย่าแทนด้วย footprint ไดโอดมาตรฐานที่มี pin numbering ต่างกันโดยไม่ตรวจ net ใหม่
3. D2 ขายาว/anode อยู่ pad1; ขาสั้น/ขอบแบน cathode อยู่ pad2; R1 ไม่มีขั้ว
4. J2 pad1 ไปขั้วบวกพัดลม; pad2 ไปขั้วลบ ตรวจทิศการติดตั้ง terminal block กับ datasheet และฉลากก่อนจ่ายไฟ
5. ตัดไฟก่อนประกอบ ตรวจ short/continuity และ solder joints, ตัดปลายขาให้ไม่ชนตัวเรือน แล้วเริ่มด้วย bench supply 5V จำกัดกระแสต่ำ
6. วัดแรงดัน/กระแสเริ่มหมุนและ steady-state, ตรวจกลับขั้วด้วย bench supply ที่จำกัดกระแส, ทดสอบ fault อย่างควบคุม และตรวจอุณหภูมิ F1/D1/สายภายใต้โหลดในตัวเรือนจริงก่อนใช้ต่อเนื่อง

ยังไม่มีหลักฐานการผลิต PCB, การประกอบ, การทดสอบโหลด/กลับขั้ว/ความร้อน หรือการใส่ตัวเรือนที่พิมพ์จริง การผ่าน ERC/DRC ไม่พิสูจน์สิ่งเหล่านี้

## KiCad → ตัวเรือน และการตรวจไฟล์เก่า

```sh
python3 scripts/hardware/return_manifest.py hardware/sources/accessory.kicad_pcb hardware/board.json
python3 scripts/hardware/return_manifest.py hardware/sources/accessory.kicad_pcb hardware/board.json --check
python3 -m unittest discover -s tests -p 'hardware*_test.py'
python3 scripts/hardware/validate_export.py --check
# ต้องมี KiCad 10 ใน PATH หรือระบุ executable เต็ม:
KICAD_CLI=/path/to/kicad-cli python3 scripts/hardware/validate_export.py
```

`board.json` schemaVersion=1 ใช้ mm จุดกำเนิดมุมซ้ายล่าง; x/y component เป็นกึ่งกลาง envelope, depth คือความสูงเหนือ PCB, connector z=ความหนา PCB รูเกิดจาก NPTH pad และตำแหน่ง footprint จริง ไม่ได้ใช้ตำแหน่งรู hardcode ในตัวแปลง UI ใช้ข้อมูลนี้สร้าง mounting posts และตรวจ collision

แก้ตำแหน่ง/ขนาดใน KiCad แล้วส่ง manifest กลับ: `sourceHash` เป็น SHA-256 ของ PCB; `--check` ปฏิเสธ manifest เก่า ส่วน validation.json เก็บ hash ของ source และ manufacturing artifacts เพื่อป้องกันการใช้ Gerber/STEP/PDF ของ revision เก่า

Footprints มี properties `BBN_Width`, `BBN_Height`, `BBN_Depth` เป็น envelope เผื่อขา/ตัวถังและระยะติดตั้ง; ถ้าขาด property ตัวแปลงจะหยุดแทนการเดาขนาด `BBN_Connector` ระบุชนิดขั้วต่อ การหมุนเปลี่ยน envelope ตามแกนของตัวเรือน ตัวแปลงรองรับบอร์ดสี่เหลี่ยมแกนตรงและชิ้นส่วนด้านบนเท่านั้น ให้ขยายตัวแปลงก่อนใช้ outline โค้ง/ชิ้นส่วนด้านล่าง

`scripts/hardware/generate_sources.py` เป็นตัวสร้าง revision เริ่มต้นแบบ deterministic; **รันแล้วจะทับ source ที่แก้ด้วย KiCad** งานแก้ไขปกติให้ใช้ return_manifest/validate_export ตามข้างต้น

ขนาด envelope เป็นข้อมูลเชิงออกแบบแบบเผื่อ: terminal 10×8×12 mm, PTC 10.2×3.1×16.2 mm, D1 รวมขา 18.5×5.5×6.5 mm, resistor รวมขา 10.5×3.3×4 mm, LED 5.3×5.3×10 mm ต้องวัดชิ้นส่วนจริงก่อนตัดสิน fit
