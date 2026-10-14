import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {newId} from '../src/id.js';
import {beginIntent,readIntent,clearIntent} from '../src/pos/checkout-intent.js';
const payload={items:[{menuId:'drink',quantity:1,optionIds:['oat']}],paymentMethod:'cash' as const,amountTenderedSatang:8000,transferConfirmed:false};
test('LAN UUID works without crypto.randomUUID',()=>{
 const crypto={getRandomValues:webcrypto.getRandomValues.bind(webcrypto)};
 const ids=Array.from({length:50},()=>newId(crypto));
 assert.equal(new Set(ids).size,50);
 assert.ok(ids.every(id=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)));
});
test('reload and changed input reuse persisted checkout exactly; users stay separate',()=>{
 const map=new Map<string,string>();const storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);},removeItem:(key:string)=>{map.delete(key);}};
 const first=beginIntent(storage,'cashier-a',payload);
 payload.items[0].quantity=2;
 assert.equal(first.items[0].quantity,1);
 assert.deepEqual(readIntent(storage,'cashier-a'),first);
 assert.deepEqual(beginIntent(storage,'cashier-a',{...payload,amountTenderedSatang:9000}),first);
 assert.equal(readIntent(storage,'cashier-b'),null);
 clearIntent(storage,'cashier-a');assert.equal(readIntent(storage,'cashier-a'),null);
 const next=beginIntent(storage,'cashier-a',payload);assert.notEqual(next.idempotencyKey,first.idempotencyKey);
 clearIntent(storage,'cashier-a',first.idempotencyKey);assert.deepEqual(readIntent(storage,'cashier-a'),next,'Late completion cannot erase another intent');
 storage.setItem('broken','{}');assert.throws(()=>readIntent(storage,'broken'));
});
