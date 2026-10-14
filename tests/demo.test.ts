import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDemoStore} from '../src/pos/demo';
test('demo cash sale, queue, replay and immutable history survive catalog changes',async()=>{
 const store=createDemoStore(); const catalog=await store.request('/catalog'); const menu=catalog.menus[0];
 const input={items:[{menuId:menu.id,quantity:1,optionIds:menu.options.filter((o:any)=>o.name==='ปกติ').map((o:any)=>o.id)}],paymentMethod:'cash',amountTenderedSatang:10000,idempotencyKey:'one',transferConfirmed:false};
 await store.request('/shifts/open','POST',{openingCashSatang:0}); const before=await store.request('/catalog');
 const order=await store.request('/checkout','POST',input); assert.equal(order.totalSatang,menu.priceSatang);assert.equal(order.changeSatang,10000-menu.priceSatang);
 assert.deepEqual(await store.request('/checkout','POST',input),order);
 assert.equal((await store.request('/orders')).length,1);
 await store.request(`/menus/${menu.id}`,'PATCH',{...menu,name:'changed',priceSatang:9900,recipe:[{ingredientId:'coffee',quantity:'900'}]});
 const historical=(await store.request('/orders'))[0];assert.equal(historical.items[0].name,menu.name);assert.equal(historical.totalSatang,menu.priceSatang);
 await assert.rejects(store.request('/checkout','POST',{...input,amountTenderedSatang:11000}),/ซ้ำ/);
 await store.request(`/orders/${order.id}/refund`,'POST',{reason:'ทดสอบ',idempotencyKey:'r'});
 assert.deepEqual((await store.request('/catalog')).ingredients,before.ingredients);
});
test('checkout replay remains available after closing its shift',async()=>{
 const store=createDemoStore();const shift=await store.request('/shifts/open','POST',{openingCashSatang:0});
 const input={items:[{menuId:'americano',quantity:1,optionIds:[]}],paymentMethod:'cash',amountTenderedSatang:10000,idempotencyKey:'replay'};
 const order=await store.request('/checkout','POST',input);await store.request(`/shifts/${shift.id}/close`,'POST',{countedCashSatang:5500});
 assert.deepEqual(await store.request('/checkout','POST',input),order);
});
test('confirmed transfer with an incorrect amount cannot create a paid order',async()=>{
 const store=createDemoStore();await store.request('/shifts/open','POST',{openingCashSatang:0});
 const input={items:[{menuId:'americano',quantity:1,optionIds:[]}],paymentMethod:'transfer',amountTenderedSatang:0,transferConfirmed:true,idempotencyKey:'underpaid'};
 await assert.rejects(store.request('/checkout','POST',input),/ยอดโอน/);assert.deepEqual(await store.request('/orders'),[]);
});
test('refund reconciles its closed shift and retains reason and idempotency',async()=>{
 let saved:string|null=null;const store=createDemoStore({getItem:()=>saved,setItem:(_,v)=>{saved=v;}});
 const shift=await store.request('/shifts/open','POST',{openingCashSatang:1000});
 const order=await store.request('/checkout','POST',{items:[{menuId:'americano',quantity:1,optionIds:[]}],paymentMethod:'cash',amountTenderedSatang:10000,idempotencyKey:'closed'});
 await store.request(`/shifts/${shift.id}/close`,'POST',{countedCashSatang:6500});
 const refund={reason:'แก้วผิด',idempotencyKey:'refund-closed'};await store.request(`/orders/${order.id}/refund`,'POST',refund);
 const state=JSON.parse(saved!);assert.equal(state.closedShifts[0].expectedCashSatang,1000);assert.equal(state.closedShifts[0].differenceSatang,5500);assert.equal(state.orders[0].refundReason,'แก้วผิด');
 await assert.rejects(store.request(`/orders/${order.id}/refund`,'POST',{...refund,reason:'เปลี่ยน'}),/ซ้ำ/);
 const report=await store.request('/reports');assert.equal(report.orderCount,1);assert.equal(report.refundSatang,5500);assert.equal(report.totalSatang,0);
});
test('refund key identifies one operation across orders and cannot be missing',async()=>{
 const store=createDemoStore();await store.request('/shifts/open','POST',{openingCashSatang:0});
 const input={items:[{menuId:'americano',quantity:1,optionIds:[]}],paymentMethod:'cash',amountTenderedSatang:10000};
 const a=await store.request('/checkout','POST',{...input,idempotencyKey:'a'}),b=await store.request('/checkout','POST',{...input,idempotencyKey:'b'});
 await store.request(`/orders/${a.id}/refund`,'POST',{reason:'ยกเลิก',idempotencyKey:'global-refund'});
 await assert.rejects(store.request(`/orders/${b.id}/refund`,'POST',{reason:'ยกเลิก',idempotencyKey:'global-refund'}),/ซ้ำ/);
 await assert.rejects(store.request(`/orders/${b.id}/refund`,'POST',{reason:'ยกเลิก'}),/รหัส/);
});
test('demo transfer must be confirmed and insufficient ingredients roll back',async()=>{
 const store=createDemoStore();await store.request('/shifts/open','POST',{openingCashSatang:0});const before=await store.request('/catalog');
 const input={items:[{menuId:before.menus[0].id,quantity:999,optionIds:[]}],paymentMethod:'transfer',amountTenderedSatang:0,idempotencyKey:'bad',transferConfirmed:false};
 await assert.rejects(store.request('/checkout','POST',input));assert.deepEqual(await store.request('/catalog'),before);assert.deepEqual(await store.request('/orders'),[]);
});
test('prepared refunded drink does not restore stock and bar role cannot change menu',async()=>{
 const store=createDemoStore();await store.request('/shifts/open','POST',{openingCashSatang:0});const c=await store.request('/catalog');const menu=c.menus[0];
 const order=await store.request('/checkout','POST',{items:[{menuId:menu.id,quantity:1,optionIds:menu.options.filter((o:any)=>o.name==='ปกติ').map((o:any)=>o.id)}],paymentMethod:'cash',amountTenderedSatang:10000,idempotencyKey:'a'});
 await store.request(`/orders/${order.id}/status`,'PATCH',{status:'preparing'});const consumed=await store.request('/catalog');
 await store.request(`/orders/${order.id}/refund`,'POST',{reason:'ทดสอบ',idempotencyKey:'r'});assert.deepEqual((await store.request('/catalog')).ingredients,consumed.ingredients);
 await store.request('/login','POST',{username:'bar'});await assert.rejects(store.request('/menus','POST',{}),/สิทธิ์/);
});
