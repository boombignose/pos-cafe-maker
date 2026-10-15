# ติดตั้ง Docker Desktop บน Windows

คู่มือเสริมสำหรับผู้ที่ต้องการเตรียม Docker บน Windows ตรวจเอกสารผู้ผลิตเมื่อ 15 ตุลาคม 2026 เมนูและข้อกำหนดอาจเปลี่ยนตามรุ่น

**ขอบเขต:** คู่มือนี้ติดตั้ง Docker Desktop และตรวจว่า Linux containers ทำงานได้ รุ่น POS 0.2.0 ยังไม่มี Dockerfile หรือ Compose สำหรับเปิดทั้งระบบด้วย Docker การลง Docker ไม่ได้ทำให้ `Start.cmd` เปลี่ยนไปใช้ container อ่าน [วิธีติดตั้งระบบร้าน](INSTALL.md) หากต้องการเริ่มใช้ POS รุ่นที่แจกอยู่

## 1. ตรวจเครื่องก่อนติดตั้ง

- ใช้ Windows 64-bit รุ่นที่ Docker Desktop ยังรองรับ ตรวจรุ่นด้วย `winver` แล้วเทียบ [ข้อกำหนดปัจจุบันของ Docker](https://docs.docker.com/desktop/setup/install/windows-install/#system-requirements) โดยเฉพาะ Windows 10 อย่าอาศัยเพียงว่าลง WSL ได้
- เครื่อง Intel/AMD เลือกตัวติดตั้ง **x86_64 / AMD64** ส่วน Windows on Arm ต้องเลือกตัวติดตั้ง Arm และตรวจสถานะการรองรับแยกกัน
- มี RAM อย่างน้อย 8 GB และเปิด hardware virtualization ใน BIOS/UEFI ตรวจ Task Manager → Performance → CPU → Virtualization ว่า Enabled หากปิดอยู่ให้ผู้ดูแลเปิดตามคู่มือผู้ผลิตเครื่อง
- ต้องมีอินเทอร์เน็ตสำหรับดาวน์โหลด WSL, Docker และ images เผื่อพื้นที่สำหรับ images, containers และข้อมูล volume ด้วย โครงการนี้แนะนำเริ่มต้นอย่างน้อย 15 GB และตรวจพื้นที่เป็นระยะ เป็นระยะเผื่อของโครงการ ไม่ใช่ข้อกำหนดขั้นต่ำจาก Docker
- Docker Desktop ไม่รองรับ Windows Server ผล CI ของ POS บน Windows Server จึงไม่ใช่ผลทดสอบติดตั้ง Docker Desktop

Docker Desktop มี license ของตัวเอง อ่าน [เงื่อนไขจาก Docker](https://docs.docker.com/desktop/setup/install/windows-install/#start-docker-desktop) ให้ตรงกับองค์กรของคุณ MIT ของ POS ไม่ได้เปลี่ยนเงื่อนไขนี้

## 2. ติดตั้งหรืออัปเดต WSL 2

อ้างอิง [วิธีติดตั้ง WSL ของ Microsoft](https://learn.microsoft.com/en-us/windows/wsl/install) เปิด **PowerShell → Run as administrator** สำหรับติดตั้งครั้งแรก:

```powershell
wsl --install
```

รีสตาร์ตเมื่อ Windows ขอ คำสั่งนี้ติดตั้ง Ubuntu ตามค่าเริ่มต้น หากเปิด Ubuntu ครั้งแรกแล้วให้ตั้งบัญชี Linux ตามหน้าจอ บัญชีนี้แยกจากบัญชีเจ้าของร้าน POS

หลังรีสตาร์ต เปิด PowerShell แล้วรัน:

```powershell
wsl --update
wsl --version
wsl --set-default-version 2
wsl --list --verbose
```

ตรวจว่า WSL เป็นอย่างน้อย 2.1.5 ตาม [ข้อกำหนด WSL backend ของ Docker](https://docs.docker.com/desktop/features/wsl/) และใช้รุ่นล่าสุดที่เครื่องรองรับ `wsl --version` คือรุ่นโปรแกรม WSL ส่วนคอลัมน์ VERSION ของ `wsl --list --verbose` คือโหมด 1/2 ของแต่ละ Linux distribution ซึ่งเป็นคนละค่า หาก Ubuntu เดิมเป็น VERSION 1 ให้สำรองงานก่อน แล้วใช้ชื่อที่ปรากฏจริง เช่น `wsl --set-version Ubuntu 2`

หากมี WSL อยู่แล้ว ไม่ต้องลงซ้ำ เริ่มจากอัปเดตและตรวจรุ่น ใช้ Docker จาก PowerShell ได้โดยไม่ต้องเปิด Ubuntu ค้างไว้ ไม่จำเป็นต้องติดตั้ง Docker Engine ซ้ำใน Ubuntu สำหรับเส้นทาง Docker Desktop นี้

## 3. ติดตั้ง Docker Desktop

1. ดาวน์โหลดจาก [หน้า Docker Desktop สำหรับ Windows ของผู้ผลิต](https://docs.docker.com/desktop/setup/install/windows-install/) เลือกสถาปัตยกรรมให้ตรงกับเครื่อง
2. เปิดตัวติดตั้ง ทำตามหน้าจอ และเลือก backend **WSL 2** หากมีตัวเลือก `Use WSL 2 instead of Hyper-V` สำหรับรุ่นที่มีตัวเลือก per-user ใช้ค่าที่ผู้ผลิตแนะนำ หรือให้ผู้ดูแลเลือกตามนโยบายเครื่อง
3. รีสตาร์ตหากระบบขอ แล้วเปิด **Docker Desktop** จาก Start menu อ่านและยอมรับข้อตกลงเมื่อคุณตกลงตามเงื่อนไข รอ engine พร้อม
4. ที่ Settings → General ตรวจ `Use WSL 2 based engine` หากมีให้เลือก บางรุ่นเปิดให้อยู่แล้วและซ่อนตัวเลือกนี้ ดู [วิธีตั้ง WSL backend](https://docs.docker.com/desktop/features/wsl/#turn-on-docker-desktop-wsl-2)
5. ใช้โหมด **Linux containers** หากอยู่ใน Windows containers ให้เปลี่ยนผ่านเมนู Docker Desktop ไม่ต้องเปิด Docker daemon ผ่าน TCP

Docker Desktop รวม [Docker Compose](https://docs.docker.com/compose/install/) มาแล้ว ใช้คำสั่ง `docker compose` ไม่ต้องดาวน์โหลด `docker-compose.exe` แยก

## 4. ตรวจว่าติดตั้งสำเร็จ

เปิด PowerShell หน้าต่างใหม่หลังติดตั้ง ไม่ต้องใช้สิทธิ์ administrator สำหรับการตรวจตามปกติ:

```powershell
docker --version
docker compose version
docker version
docker info --format '{{.OSType}}'
docker run --rm hello-world
```

ผลที่ควรได้:

- `docker version` แสดงทั้ง **Client** และ **Server** การเห็นแค่เลขรุ่น CLI ยังไม่ยืนยันว่า engine พร้อม
- `docker info --format '{{.OSType}}'` แสดง `linux`
- `docker run --rm hello-world` ดาวน์โหลด image ครั้งแรก แล้วแสดงข้อความ `Hello from Docker!` และจบโดยไม่มี error

`--rm` ลบเฉพาะ container ทดสอบนี้หลังจบ image ที่ดาวน์โหลดยังอยู่ได้ ผลนี้ยืนยันว่า Docker ของเครื่องคุณเปิด container ได้ ยังไม่ใช่ผลทดสอบ POS บน Docker

## 5. แก้ปัญหาที่พบบ่อย

| อาการ | ตรวจและแก้ |
|---|---|
| ไม่รู้จักคำสั่ง `docker` | ปิด PowerShell แล้วเปิดใหม่ ตรวจว่าลง Docker Desktop สำเร็จ หากยังไม่พบให้ตรวจ PATH/ตัวติดตั้งตามคู่มือผู้ผลิต |
| มี Client แต่ Server ต่อไม่ได้ หรือ `Cannot connect to the Docker daemon` | เปิด Docker Desktop รอ engine พร้อม ตรวจ WSL backend และข้อความ error ใน Docker Desktop |
| `WSL update required` | รัน `wsl --update` แล้วรีสตาร์ตตามที่ระบบขอ ตรวจ `wsl --version` อีกครั้ง |
| แจ้ง virtualization/WSL feature ไม่พร้อม | ตรวจ BIOS/UEFI และ Windows features ตาม [คู่มือ Microsoft](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting) ให้ผู้ดูแลช่วยหากนโยบายองค์กรจำกัด |
| `OSType` เป็น `windows` | เปลี่ยน Docker Desktop เป็น Linux containers แล้วตรวจใหม่ |
| ดึง image ไม่ได้ | ตรวจอินเทอร์เน็ต proxy/VPN และการอนุญาต registry ขององค์กร หากติด rate limit ให้ทำตามข้อความของ Docker อย่าปิด firewall ทั้งเครื่องหรือข้ามการตรวจ TLS |
| พื้นที่ไม่พอ | ตรวจ `docker system df` และพื้นที่ไดรฟ์ที่เก็บข้อมูล Docker สำรองข้อมูลก่อนจัดการ storage อย่าใช้คำสั่งล้างทั้งหมดหรือ factory reset เพื่อแก้แบบเดา |

`wsl --shutdown` จะหยุดทุก WSL distribution รวมงานอื่นที่เปิดอยู่ ให้บันทึกงานและหยุดบริการที่เกี่ยวข้องก่อนใช้ ไม่ใช่ขั้นตอนที่ต้องรันทุกครั้ง

## 6. ใช้กับ repo นี้อย่างไร

- ใช้ POS รุ่นพร้อมติดตั้ง: ทำตาม [INSTALL.md](INSTALL.md) ด้วย Node.js/PostgreSQL และ `Start.cmd` ได้ตามเดิม ไม่ต้องเปิด Docker Desktop ให้เส้นทางนี้
- ต้องการพัฒนาการติดตั้งด้วย Docker: อ่าน [BACKEND.md](BACKEND.md) เพื่อดู frontend server mode, environment และฐานข้อมูลภายนอกก่อน ขณะนี้ repo **ยังไม่มีชุด Docker สำหรับ POS** จึงยังไม่มีคำสั่ง `docker compose up` ของโครงการให้คัดลอกไปใช้
- การเพิ่ม Docker deployment ต้องแยกข้อมูล PostgreSQL ลง persistent volume, ตั้งรหัสเฉพาะร้าน, ไม่เผยพอร์ตฐานข้อมูลไป LAN และทดสอบ restart/backup/restore โดยไม่เขียนทับข้อมูลเดิมก่อนแจก ห้ามนำ volume หรือรหัสของร้านจริงใส่ repo

**สถานะตรวจ:** คู่มือตรวจเทียบเอกสาร Docker/Microsoft และโครงสร้าง repo แล้ว ยังไม่ได้ติดตั้ง Docker Desktop ตามขั้นตอนนี้บน Windows 10/11 จริง และไม่ได้เพิ่มหรือทดสอบ Docker deployment ของ POS ในงานเอกสารนี้
