import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash, csvCell, hashPassword, verifyPassword, passwordSchema, decimalSchema, checkoutSchema } from '../server/domain.js';

test('passwords use independent scrypt salts and reject common or short credentials', async () => {
  assert.equal(passwordSchema.safeParse('password1234').success, false);
  assert.equal(passwordSchema.safeParse('123456789012').success, false);
  const a = await hashPassword('CaféTest!Secure2026');
  const b = await hashPassword('CaféTest!Secure2026');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('CaféTest!Secure2026', a), true);
  assert.equal(await verifyPassword('incorrect', a), false);
});
test('canonical payload hashes ignore object key order but preserve changed quantities', () => {
  assert.equal(canonicalHash({b:2,a:1}), canonicalHash({a:1,b:2}));
  assert.notEqual(canonicalHash({items:[{quantity:1}]}), canonicalHash({items:[{quantity:2}]}));
});
test('numeric recipe inputs retain exact decimals and reject exponent, float and precision overflow', () => {
  assert.equal(decimalSchema.parse('0.123456'), '0.123456');
  for (const invalid of [0.1, '1e2', 'NaN', '0.1234567', '10000000000000']) assert.equal(decimalSchema.safeParse(invalid).success, false);
});
test('checkout validates integer money, nonempty carts, and bounded quantities', () => {
  const valid = {items:[{menuId:'a',quantity:1,optionIds:[]}],paymentMethod:'cash',amountTenderedSatang:5000,idempotencyKey:'unique-checkout-001',transferConfirmed:false};
  assert.equal(checkoutSchema.safeParse(valid).success, true);
  for (const invalid of [{...valid,items:[]},{...valid,amountTenderedSatang:1.5},{...valid,items:[{menuId:'a',quantity:-1,optionIds:[]}]}]) assert.equal(checkoutSchema.safeParse(invalid).success, false);
});
test('CSV cells quote commas/newlines/quotes and prevent spreadsheet formula execution', () => {
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(csvCell('=SUM(A1:A2)'), '"\'=SUM(A1:A2)"');
});
