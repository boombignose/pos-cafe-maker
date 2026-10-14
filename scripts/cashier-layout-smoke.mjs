import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1024,height:600}});
 await page.goto((process.env.DEMO_URL??'http://127.0.0.1:5176/')+'#pos');
 await page.getByRole('heading',{name:'รับออเดอร์วันนี้'}).waitFor();
 await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).waitFor({state:'visible'});
 async function insideCart(locator,label){const r=await locator.boundingBox(),c=await page.locator('.cart').boundingBox();assert.ok(r&&c&&r.y>=Math.max(0,c.y)&&r.y+r.height<=Math.min(600,c.y+c.height-1),label+' must not be clipped by the cart');}
 const checkout=await page.getByRole('button',{name:'รับชำระและออกคิว →'}).boundingBox();
 assert.ok(checkout && checkout.y>=0 && checkout.y+checkout.height<=600,'checkout must remain visible on1024x600');
 await insideCart(page.getByRole('button',{name:'รับชำระและออกคิว →'}),'checkout');
 for(const menu of await page.locator('.menu-card').all()){
  const box=await menu.boundingBox();assert.ok(box.width>=44 && box.height>=44);
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
 await page.getByRole('button',{name:'เปิดกะ',exact:true}).click();
 await page.getByRole('button',{name:/อเมริกาโน่เย็น/}).click();
 await page.getByLabel('รับเงินสด (บาท)').fill('0');
 await page.getByRole('button',{name:'รับชำระและออกคิว →'}).click();
 await page.getByText('เงินสดไม่พอ',{exact:true}).waitFor();
 await insideCart(page.getByText('เงินสดไม่พอ',{exact:true}),'payment error');
 await insideCart(page.getByRole('button',{name:'รับชำระและออกคิว →'}),'checkout after failure');
 await page.screenshot({path:'docs/evidence/cashier-payment-error.png'});
 await page.getByRole('button',{name:'ลด อเมริกาโน่เย็น',exact:true}).click();
 await page.getByLabel('รับเงินสด (บาท)').fill('100');
 await page.getByRole('button',{name:/ลาเต้เย็น/}).click();
 await page.getByLabel('นมโอ๊ต').check();await page.getByRole('button',{name:'เพิ่มรายการ',exact:true}).click();
 await mkdir('docs/evidence',{recursive:true});await page.screenshot({path:'docs/evidence/cashier-1024.png'});
 await page.getByRole('button',{name:'รับชำระและออกคิว →'}).click();await page.getByRole('heading',{name:'คิว 001'}).waitFor();
 await page.screenshot({path:'docs/evidence/payment-receipt.png'});
 await page.getByRole('button',{name:'ขายรายการถัดไป',exact:true}).waitFor({state:'visible',timeout:1000});
 await page.getByRole('button',{name:'ขายรายการถัดไป',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile must remain usable without horizontal scrolling');
 await page.screenshot({path:'docs/evidence/cashier-mobile.png',fullPage:true});
 await page.setViewportSize({width:1024,height:600});
 await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).click({timeout:2000});
 await page.getByRole('heading',{name:'เปิดร้านจากเครื่องของคุณ'}).waitFor();
 console.log('PASS:1024x600 checkout visible, touch tiles, option selection, cash sale, mobile overflow');
}finally{await browser.close();}
