import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satang, cartKey, restoreCart, validateChoices } from '../src/pos/logic.js';
test('money parses decimal text exactly and rejects rounding or exponent input',()=>{
 assert.equal(satang('12.35'),1235); assert.equal(satang('0.10'),10);
 for(const bad of ['-1','1.001','1e3','NaN','', '9999999999999999']) assert.throws(()=>satang(bad));
});
test('cart options order is irrelevant but distinct choices remain separate',()=>{
 assert.equal(cartKey('a',['b','c']),cartKey('a',['c','b'])); assert.notEqual(cartKey('a',['b']),cartKey('a',['c']));
});
test('corrupt stored cart is rejected and valid draft remains recoverable',()=>{
 assert.deepEqual(restoreCart('bad'),[]); assert.deepEqual(restoreCart('[{"menuId":"m","quantity":0,"optionIds":[]}]'),[]);
 const draft=[{menuId:'m',quantity:2,optionIds:['o']}]; assert.deepEqual(restoreCart(JSON.stringify(draft)),draft);
});
test('one choice required in every group and foreign options rejected',()=>{
 const options=[{id:'s',group:'ขนาด'},{id:'l',group:'ขนาด'},{id:'m',group:'นม'}];
 assert.equal(validateChoices(options,['s','m']),true);
 for(const choice of [[],['s'],['s','l','m'],['s','m','x'],['s','m','m']]) assert.equal(validateChoices(options,choice),false);
});
