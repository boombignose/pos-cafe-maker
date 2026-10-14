# Designer / กล่อง POS หน่วย mm

อ่าน [ที่มาข้อมูลและใบบันทึกอุปกรณ์](BLUEPRINT.md) ก่อนนำไปสร้าง ขนาดจอเริ่มต้นมาจาก Waveshare 7inch HDMI LCD (C); บอร์ดทั่วไป พัดลม และช่องพอร์ตเป็นแม่แบบสมมติ ไม่มี pinout ที่เดาให้ ต้องใช้ข้อมูลอุปกรณ์ที่เลือกเอง

เปิดหน้า **ออกแบบกล่อง** ปรับตัวเลข แล้วกด Enter หรือออกจากช่องเพื่อสร้างโมเดลใหม่ ตัวเลขต้องผ่าน validation ก่อนเปลี่ยนแบบ ค่ามาตรฐาน: ผนัง 2.4 mm, ระยะเผื่อ 0.3 mm, ฐาน 60°, เตียง 220 × 220 × 250 mm

## การใช้งาน

1. วัดขอบนอกจอ พื้นที่แสดงผล และความหนาจริง จอเริ่มต้น 164.90 × 106.96 × 8 mm และพื้นที่แสดงผล 154.21 × 85.92 mm เป็นค่าที่ผู้ผลิตเผยแพร่ ยังไม่ได้ยืนยันด้วยโมดูลจริง แบบถือว่า active area อยู่กลางกรอบ
2. เลือก SBC, accessory PCB หรือพัดลม แล้วปรับตำแหน่ง X / Y / Z และมุมหมุนในระนาบ PCB บอร์ดขนานฝาหลังเพื่อให้เสายึดต่อเนื่องถึงฝา
3. ระบุรูยึดแต่ละบรรทัด `x, y, diameter` หน่วย mm โดยเริ่มจากมุมซ้ายล่าง PCB หรืออัปโหลด `hardware/board.json` เสายึดบนฝาจะเปลี่ยนตามรูทันที รูต้องอยู่ภายในบอร์ด
4. ปรับช่องพอร์ต: ซ้าย/ขวาเลื่อนตาม Y, บน/ล่างเลื่อนตาม X, ค่า Z เริ่มจากหน้ากล่อง ความสูงช่องอยู่ตาม Z ช่องพอร์ตจะถูกตัดใน geometry จริง
5. เลือกประกอบ / แยกชิ้น / โปร่งใส เปิดสายเพื่อเห็น net ที่มีชื่อเดียวกัน และพื้นที่ว่างสำหรับเสียบหัวต่อ/งอสาย
6. ดาวน์โหลด ZIP (4 STL + design.json + BUILD-NOTES.txt) หรือแต่ละ STL; เก็บ JSON เพื่อโหลดและแก้ไขต่อ ไฟล์ JSON เป็นข้อมูลเท่านั้น ไม่รัน JavaScript

ทุก STL เป็น binary, หน่วย mm, เลื่อนตำแหน่งขั้นต่ำ X/Y/Z ไปที่ 0 และพลิกฝาหลังให้แผ่นฝาติดเตียง/เสายึดขึ้นด้านบน ชิ้นงานมีกรอบจอมุมมน (front opening + lip + screw recesses), ตัวกล่องกลวงมุมมน (side port cuts + corner bosses), ฝาหลัง (vents + PCB mounting bosses + rear screen stops + nut pockets + cable-tie slots) และแท่นด้านหลัง (mounting plate + pedestal spine + cable tunnel + table screw holes) อุปกรณ์อิเล็กทรอนิกส์และสายเป็นภาพอ้างอิงแยกจากชิ้นงานพิมพ์ ไม่มีใน STL

## ทิศทางและ PCB manifest

Designer ใช้ X ไปขวา, Y ขึ้นในระนาบจอ, Z จากหน้าจอไปฝาหลัง จุดวางบอร์ดคือกึ่งกลางบอร์ด; `rotation` เป็นองศารอบ Z รูใน manifest เป็นพิกัดมุมซ้ายล่าง และ component `x/y` เป็นกึ่งกลาง footprint ความสูง `depth` ขึ้นจากผิว PCB ตาม +Z ขั้วต่อมี `z` ตามพิกัด local ของบอร์ด การนำเข้า accessory รักษาตำแหน่งและมุมเดิมไว้ จึงต้องเลื่อนเมื่อเปลี่ยนขนาดบอร์ด

```json
{
  "schemaVersion": 1,
  "board": {
    "name": "Accessory prototype",
    "width": 80, "height": 50, "thickness": 1.6,
    "holes": [{ "x": 4, "y": 4, "diameter": 3.2 }],
    "components": [{ "reference": "J1", "name": "Terminal", "x": 40, "y": 25, "width": 14, "height": 10, "depth": 8 }],
    "connectors": [{ "id": "J1", "name": "Power", "x": 40, "y": 25, "z": 1.6, "type": "terminal", "pins": [{ "name": "1", "net": "+5V", "voltage": 5 }] }]
  }
}
```

รองรับ metadata `units`, `coordinateSystem`, `sourceFile`, `sourceHash` SHA-256 ที่ระดับบนจากตัว export KiCad; เก็บ sourceHash/sourceFile ใน module ของแบบเพื่ออ้างอิงเวอร์ชัน ตรวจไฟล์ก่อน parse: JSON ไม่เกิน 1 MB, รุ่น schema / หน่วยตรง, ไม่มีคีย์แปลก, ตัวเลข finite, รูและ footprint อยู่ในบอร์ด, id ไม่ซ้ำ, สูงสุด 16 modules และจำนวน component/holes/connectors รวม 240 รายการ ป้องกัน import ที่ทำให้ geometry โตเกินกำหนด

## Interface สำหรับผู้พัฒนา

- `src/designer/Designer.tsx`: default React export, ไม่มี required props; CSS อยู่ใน `.designer`
- `src/designer/model.ts`: `defaultDesign(): Design`, `parseDesign(unknown): Design`, `parseBoardManifest(unknown): Board`, `replaceAccessory(Design, Board): Design`
- `generateModel(Design): Model`: geometry JSCAD ชุดเดียวสำหรับ preview และ export, คืน `parts`, `electronics`, `cables`, `wires`, `mountingPosts`, `issues`
- `Model.assembly` เป็นตำแหน่งและมุมสำหรับวางกล่องบนฐานในภาพประกอบ; preview และการตรวจชนกับฐานใช้ค่าชุดเดียวกัน
- `exportPartStl(PrintPart): Uint8Array`, `exportDesignZip(Design): Uint8Array`, `triangles(Geom3): Float32Array`
- `Design.schemaVersion` เท่ากับ 1; เปลี่ยน schema ต้องมี migration ก่อนรับไฟล์รุ่นอื่น Validation errors throw และ UI แสดงโดยรักษาแบบที่ใช้ได้ล่าสุด
- `BOARD_CATALOG` คือบอร์ดอ้างอิง ไม่รับรองขนาด connector หรือ pinout ของสินค้าจริง

```sh
npm run models
npm run models -- --board hardware/board.json
npm run models -- --design examples/models/design.json --out examples/models
npm test
npm run build
```

คำสั่ง export เขียนแทนไฟล์ชื่อตรงกันใน output ที่ระบุ อ่าน `examples/models/report.json` เพื่อดูเตียงพิมพ์ เสายึด และคำเตือนทั้งหมด รวมการชนระหว่าง frame/body/lid เมื่อตั้งผนังหนาเกินพื้นที่ประกอบ ค่าในช่วงที่ฟอร์มยอมรับไม่ได้รับรองว่าจะประกอบได้ ต้องแก้คำเตือนก่อนพิมพ์ โปรแกรมยัง export เมื่อมีคำเตือนเพื่อให้ปรับชิ้นงานต่อใน slicer ได้

## สิ่งที่ตรวจแล้วและขอบเขต

Tests ตรวจ geometry ไม่ใช่ชื่อปุ่ม: front opening, hollow cavity, ports remove material, lid vents, screw passage, actual mounting-post volume changes after manifest hole changes, rotated hole positions, collision/clearance checks, bed limits, binary STL structure และ ZIP JSON round trip

เพิ่มการตรวจ solid intersection ของอุปกรณ์กับกรอบ/กล่อง/ฝาและของกล่องประกอบกับฐาน รวมถึงตรวจทุกขอบ triangle ใน STL ตัวอย่างว่ามีสองหน้าร่วมกันที่ความละเอียด 0.001 mm เพื่อจับผิวเปิดและ T-junction แม่แบบ SBC / MCU / พัดลมไม่มี connector หรือ net สมมติให้ ผังขาของ accessory มาจาก KiCad การแสดงเส้นเชื่อมจะเกิดเมื่อผู้ใช้ใส่ connector/net ของอุปกรณ์ที่เลือกผ่าน manifest

แท่นรองอยู่หลังฝาและมีรูM3ตรงกับฝา4จุด ลายรูเริ่มต้น80×50mm แบบจอเล็กจะลดระยะรูให้ยังอยู่ในฝา Tests ตรวจทางสกรู ตัวประคองหลังจอ และช่องรัดสาย รวมช่องว่างสัมผัสด้านหน้าลึก20mm และ view cone จากกล้องเริ่มต้นถึงขอบ active area เพื่อป้องกันแท่นบังจอ แม้ไม่มี solid collision แบบเริ่มต้นยังอยู่ในเตียง220mm

การชนใช้ axis-aligned envelope ของ PCB และ component จึงอาจเตือนเกินจริงเมื่อหมุนบอร์ดเฉียง `shortcut: AABB collision and straight net lines, upgrade to exact solids and routed cable envelopes when validating a measured assembled prototype.` พื้นที่สายเป็นกล่อง 8 mm บวก clearance และความลึกตามค่าที่ตั้ง ไม่ทราบขนาดปลั๊ก/รัศมีงอสายจริง

ฐานเป็นแท่นขันยึดด้านหลัง มีทางลอดสายและรูสำหรับยึดโต๊ะ ค่ามุมแก้ไขได้โดยสร้างSTLใหม่ ไม่ใช่บานพับ ต้องตรวจจุดศูนย์ถ่วง การเกาะฐาน แรงแตะจอ ความยาวสกรูและการกดจอจริงตาม PRINTING.md ฝา export โดยพลิกให้เสายึดขึ้นด้านบน ช่องพอร์ตที่สะพานยาวหรือ geometry ที่แก้ไขอาจต้องใช้ support; ให้ดูใน slicer ก่อนสั่งพิมพ์ การตรวจเตียงเปรียบเทียบ bounding box ในทิศ export และอนุญาตหมุน 90° ในระนาบเตียง ไม่จัดวางหลายชิ้นหรือหาทิศพิมพ์ที่ดีที่สุด

ยังไม่มีหลักฐานการพิมพ์จริง การประกอบ การวัดความร้อน/โหลด หรือการรับรองไฟฟ้า อ่าน `docs/HARDWARE.md` แยกจาก validation ฝั่งเว็บและ CAD

### การตรวจด้วย slicer — 2026-10-14

ทดลอง [PrusaSlicer 2.9.6 macOS ทางการ](https://github.com/prusa3d/PrusaSlicer/releases/tag/version_2.9.6) จาก DMG ขนาด 142,444,072 bytes; SHA-256 ตรงกับ official release และ macOS ตรวจลายเซ็นผ่าน `Notarized Developer ID: Prusa Research a.s.` ทั้ง CLI จาก DMG อ่านอย่างเดียวและสำเนาในพื้นที่ชั่วคราวหยุดที่ `dyld_start` ก่อนเข้าโปรแกรมบน macOS 26.4 / arm64 หน้าต่าง native เปิดไม่ได้ จึง **ยังไม่ได้ import STL หรือ slice ด้วย slicer** และไม่มี G-code ที่ผ่านการตรวจ รายละเอียดอยู่ใน `examples/models/slicer-validation.json` ปิด process/ถอน mount/ลบแพ็กเกจชั่วคราวแล้ว ไม่มีการติดตั้งทั่วระบบหรือปรับ security settings
