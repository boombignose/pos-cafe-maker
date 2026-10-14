import {chromium,expect} from '@playwright/test';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createApp} from '../server/app.ts';
import {migrate} from '../server/db.ts';
if(!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL required; use a disposable test database');
const schema=`pos_browser_${randomUUID().replaceAll('-','')}`;
const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await migrate(pool);
const server=createApp(pool,{setupToken:'BrowserTestOnlySetup!2026',storeEpoch:'browser-instance'}).listen(0,'0.0.0.0');await once(server,'listening');
const origin=`http://pos-shop.test:${server.address().port}`;
process.env.PUBLIC_ORIGIN=origin;
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--host-resolver-rules=MAP pos-shop.test 127.0.0.1','--no-proxy-server']});
const contexts=[];const checks=[];const password='BrowserTestOnly!2026';
const evidence=process.env.SHOP_EVIDENCE_DIR??'docs/evidence/shop';await mkdir(evidence,{recursive:true});
async function screen(){const context=await browser.newContext({viewport:{width:1024,height:600}});contexts.push(context);return context.newPage();}
async function login(page,username){await page.getByLabel('ชื่อผู้ใช้',{exact:true}).fill(username);await page.getByLabel('รหัสผ่าน',{exact:true}).fill(password);await page.getByRole('button',{name:'เข้าสู่ระบบร้าน',exact:true}).click();await expect(page.getByRole('button',{name:'ออกจากระบบ'})).toBeVisible();}
async function ownerApi(page,path,method='GET',data){
 return page.evaluate(async({path,method,data})=>{
  const session=await (await fetch('/api/session')).json();
  const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:data===undefined?undefined:JSON.stringify(data)});
  if(!r.ok)throw new Error(`${path}: ${r.status} ${await r.text()}`);return r.json();
 },{path,method,data});
}
try{
 const owner=await screen();await owner.goto(origin+'/#pos');
 await expect(owner.getByRole('heading',{name:'ตั้งร้านครั้งแรก'})).toBeVisible();
 assertInsecure: {if(await owner.evaluate(()=>window.isSecureContext))throw new Error('LAN test must use insecure HTTP context');}
 await owner.getByLabel('รหัสตั้งร้าน',{exact:true}).fill('BrowserTestOnlySetup!2026');await owner.getByLabel('ชื่อร้าน',{exact:true}).fill('ร้านทดสอบระดับ 1');
 await owner.getByLabel('ที่อยู่บนใบเสร็จ').fill('123 ถนนทดสอบ');await owner.getByLabel('โทรศัพท์ร้าน').fill('0123456789');
 await owner.getByLabel('ชื่อบัญชีเจ้าของร้าน').fill('shopowner');await owner.getByLabel('รหัสผ่านเจ้าของร้าน',{exact:true}).fill(password);await owner.getByLabel('ยืนยันรหัสผ่าน').fill(password);
 await owner.screenshot({path:`${evidence}/setup.png`,fullPage:true});await owner.getByRole('button',{name:'สร้างร้านและเริ่มใช้งาน'}).click();await expect(owner.getByRole('button',{name:'ออกจากระบบ'})).toBeVisible();
 checks.push('first-run protected shop setup through HTTP LAN UI');
 await ownerApi(owner,'/users','POST',{username:'counter',password,role:'cashier'});await ownerApi(owner,'/users','POST',{username:'maker',password,role:'bar'});
 const ingredient=await ownerApi(owner,'/ingredients','POST',{name:'เมล็ดจริงในฐานข้อมูลทดสอบ',unit:'g',lowStock:'10'});
 await ownerApi(owner,'/stock','POST',{ingredientId:ingredient.id,quantity:'100',reason:'Test opening stock'});
 const menu=await ownerApi(owner,'/menus','POST',{name:'กาแฟทดสอบ',category:'กาแฟ',priceSatang:6000,active:true,recipe:[{ingredientId:ingredient.id,quantity:'18'}],options:[]});
 const cashier=await screen(),bar=await screen();await cashier.goto(origin+'/#pos');await login(cashier,'counter');await cashier.waitForTimeout(200);await expect(cashier.locator('.shift-strip')).not.toContainText('Cannot read');await bar.goto(origin+'/#bar');await login(bar,'maker');
 await cashier.getByRole('button',{name:'เปิดกะ',exact:true}).click();await expect(cashier.getByText('กะเปิดอยู่',{exact:true})).toBeVisible();
 await cashier.getByRole('button',{name:/กาแฟทดสอบ.*60/}).click();await cashier.getByLabel('รับเงินสด (บาท)').fill('1');await cashier.getByRole('button',{name:'รับชำระและออกคิว →'}).click();await expect(cashier.getByRole('alert').filter({hasText:'เงินสดที่รับไม่พอ'})).toBeVisible();
 await cashier.getByLabel('รับเงินสด (บาท)').fill('100');
 // Let the real server commit, then discard the response to exercise an unknown payment outcome.
 await cashier.route('**/api/checkout',async route=>{const r=await route.fetch({url:`http://127.0.0.1:${server.address().port}/api/checkout`});if(!r.ok())throw new Error(await r.text());await route.abort('failed');});
 await cashier.getByRole('button',{name:'รับชำระและออกคิว →'}).click();await expect(cashier.getByRole('button',{name:'ตรวจผลรายการเดิม'})).toBeVisible();
 await expect(cashier.getByLabel('รับเงินสด (บาท)')).toBeDisabled();await expect(cashier.getByRole('button',{name:/กาแฟทดสอบ.*60/})).toBeDisabled();
 if((await pool.query('SELECT count(*) FROM orders')).rows[0].count!=='1')throw new Error('Expected one committed order');
 await cashier.unroute('**/api/checkout');
 const saved=await cashier.evaluate(()=>Object.entries(localStorage).find(([key])=>key.endsWith(':pending')));
 const second=await cashier.context().newPage();await second.goto(origin+'/#pos');await second.getByRole('button',{name:'ตรวจผลรายการเดิม'}).click();await expect(second.getByRole('dialog',{name:'รับชำระเรียบร้อย'})).toBeVisible();
 await second.getByRole('button',{name:'ขายรายการถัดไป'}).click();await second.getByRole('button',{name:/กาแฟทดสอบ.*60/}).click();await second.getByLabel('รับเงินสด (บาท)').fill('1');
 let releaseNew;const gate=new Promise(resolve=>releaseNew=resolve);let receivedNew;const incoming=new Promise(resolve=>receivedNew=resolve);
 await second.route('**/api/checkout',async route=>{receivedNew(route.request().postDataJSON().idempotencyKey);await gate;const response=await route.fetch({url:`http://127.0.0.1:${server.address().port}/api/checkout`});await route.fulfill({response});});
 await second.getByRole('button',{name:'รับชำระและออกคิว →'}).click();const newKey=await incoming;
 await cashier.getByRole('button',{name:'ตรวจผลรายการเดิม'}).click();await expect(cashier.getByRole('dialog',{name:'รับชำระเรียบร้อย'})).toBeVisible();
 const pendingKey=await cashier.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([key])=>key.endsWith(':pending'))[1]).idempotencyKey);
 if(pendingKey!==newKey)throw new Error('Late recovery erased a new checkout intent in another tab');
 releaseNew();await expect(second.getByRole('alert').filter({hasText:'เงินสดที่รับไม่พอ'})).toBeVisible();
 if((await pool.query('SELECT count(*) FROM orders')).rows[0].count!=='1')throw new Error('Two-tab recovery duplicated a paid sale');
 await second.close();await cashier.getByRole('button',{name:'ขายรายการถัดไป'}).click();
 // Replay the exact captured intent to also exercise reload and expired-session recovery.
 await cashier.evaluate(([key,value])=>localStorage.setItem(key,value),saved);await cashier.reload();await expect(cashier.getByRole('button',{name:'ตรวจผลรายการเดิม'})).toBeVisible();
 await pool.query("DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username='counter')");
 await expect(cashier.getByRole('button',{name:'เข้าสู่ระบบร้าน'})).toBeVisible({timeout:10000});await login(cashier,'counter');
 await cashier.getByRole('button',{name:'ตรวจผลรายการเดิม'}).click();await expect(cashier.getByRole('dialog',{name:'รับชำระเรียบร้อย'})).toBeVisible();
 if((await pool.query('SELECT count(*) FROM orders')).rows[0].count!=='1')throw new Error('Retry duplicated payment');
 if((await pool.query('SELECT stock FROM ingredients WHERE id=$1',[ingredient.id])).rows[0].stock!=='82.000000')throw new Error('Recovery deducted stock more than once');
 await cashier.screenshot({path:`${evidence}/recovered-payment.png`});
 await cashier.emulateMedia({media:'print'});await expect(cashier.locator('.receipt')).toContainText('ร้านทดสอบระดับ 1');await expect(cashier.locator('.receipt')).toContainText('123 ถนนทดสอบ');await cashier.screenshot({path:`${evidence}/receipt-print.png`});await cashier.emulateMedia({media:'screen'});
 checks.push('cash underpayment; lost committed response → reload → expired session → same-key recovery; two-tab retry stays one bill/one stock deduction');
 await cashier.getByRole('button',{name:'ขายรายการถัดไป'}).click();await expect(bar.getByRole('button',{name:'เริ่มทำ'})).toBeVisible({timeout:6000});await bar.getByRole('button',{name:'เริ่มทำ'}).click();await expect(bar.getByRole('button',{name:'พร้อมรับแล้ว'})).toBeVisible();await bar.getByRole('button',{name:'พร้อมรับแล้ว'}).click();
 await cashier.goto(origin+'/#bar');await expect(cashier.getByRole('button',{name:'ส่งมอบแล้ว'})).toBeEnabled({timeout:6000});await cashier.getByRole('button',{name:'ส่งมอบแล้ว'}).click();
 checks.push('independent cashier/bar sessions follow queued/preparing/ready/completed');
 await owner.goto(origin+'/#admin');await owner.getByRole('button',{name:'ตั้งค่าร้าน',exact:true}).click();await owner.getByLabel('ชื่อร้าน',{exact:true}).fill('ชื่อใหม่หลังขาย');await owner.getByRole('button',{name:'บันทึกข้อมูลร้าน'}).click();await expect(owner.getByRole('status').filter({hasText:'บันทึกข้อมูลร้านแล้ว'})).toBeVisible();
 await owner.getByRole('button',{name:'ประวัติบิล',exact:true}).click();await owner.getByRole('button',{name:'พิมพ์ซ้ำ'}).click();await owner.emulateMedia({media:'print'});await expect(owner.locator('.receipt')).toContainText('ร้านทดสอบระดับ 1');await expect(owner.locator('.receipt')).not.toContainText('ชื่อใหม่หลังขาย');await owner.emulateMedia({media:'screen'});
 await owner.getByRole('button',{name:'ทีมร้าน',exact:true}).click();await owner.getByRole('button',{name:'จัดการ counter'}).click();await owner.getByLabel('เปิดใช้งานบัญชี').uncheck();await owner.getByRole('button',{name:'บันทึกบัญชี'}).click();await expect(owner.getByText('counter · ปิดใช้งาน')).toBeVisible();
 await owner.screenshot({path:`${evidence}/team.png`,fullPage:true});
 await expect(cashier.getByRole('button',{name:'เข้าสู่ระบบร้าน'})).toBeVisible({timeout:10000});
 checks.push('shop settings, immutable receipt header/reprint and disabled user session enforcement');
 const counterId=(await pool.query("SELECT id FROM users WHERE username='counter'")).rows[0].id;
 await owner.evaluate(({counterId,menuId})=>localStorage.setItem(`pos-cafe-shop-cart:${counterId}:pending`,JSON.stringify({items:[{menuId,quantity:1,optionIds:[]}],paymentMethod:'cash',amountTenderedSatang:10000,transferConfirmed:false,idempotencyKey:'11111111-1111-4111-8111-111111111111',storeEpoch:'database-before-restore'})),{counterId,menuId:menu.id});
 await owner.getByRole('button',{name:'ตั้งค่าร้าน',exact:true}).click();await expect(owner.getByRole('heading',{name:'ตรวจบิลค้างหลังการกู้คืน'})).toBeVisible();await owner.getByLabel('ผลตรวจและเหตุผล').fill('Test only: reconciled original receipt');await owner.getByLabel('เจ้าของตรวจบิลเดิมและยอดเงินจริงแล้ว').check();await owner.getByRole('button',{name:'ยืนยันตรวจบิลและปลดรายการค้าง'}).click();await expect(owner.getByRole('heading',{name:'ตรวจบิลค้างหลังการกู้คืน'})).not.toBeVisible();
 if((await pool.query('SELECT count(*) FROM recovery_acknowledgements')).rows[0].count!=='1')throw new Error('Recovery acknowledgment was not audited');
 checks.push('owner reconciles stale browser intent after restore; audit persists without another sale');

 await owner.goto(origin+'/#pos');await owner.screenshot({path:`${evidence}/cashier.png`});
 await writeFile(`${evidence}/report.json`,JSON.stringify({time:new Date().toISOString(),mode:'server',postgresql:true,contexts:3,httpLan:true,checks},null,2));console.log('Shop browser smoke PASS:',checks);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
