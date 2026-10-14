import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApp } from '../server/app.js';
import { migrate, bootstrapOwner } from '../server/db.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL API: concurrent checkout, atomic stock, immutable refunds, roles, sessions and shifts', {skip: !databaseUrl}, async t => {
  const schema = `pos_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({connectionString:databaseUrl});
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({connectionString:databaseUrl, options:`-c search_path=${schema},public`, max:12});
  const server = createApp(pool).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as {port:number};
  const origin = `http://127.0.0.1:${address.port}`;
  function client() {
    let cookie = '', csrf = '';
    return async (path:string, method='GET', body?:unknown, overrides:Record<string,string>={}) => {
      const response = await fetch(origin + path, {method, headers:{'Content-Type':'application/json', Cookie:cookie, Origin:origin, 'X-CSRF-Token':csrf, ...overrides}, body:body === undefined ? undefined : JSON.stringify(body)});
      const next = response.headers.get('set-cookie');
      if (next) cookie = next.split(';')[0];
      const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
      if (result.csrfToken) csrf = result.csrfToken;
      return {status:response.status, body:result};
    };
  }
  const owner = client(), cashier = client(), bar = client();
  const password = 'CaféIntegration!2026';
  try {
    await migrate(pool);
    await bootstrapOwner(pool, 'owner', password);
    await owner('/api/session');
    assert.equal((await owner('/api/login','POST',{username:'owner',password})).status,200);
    const c = await owner('/api/users','POST',{username:'cashier',password,role:'cashier'});
    const b = await owner('/api/users','POST',{username:'bar',password,role:'bar'});
    assert.equal(c.status,201); assert.equal(b.status,201);
    for (const [api, username] of [[cashier,'cashier'],[bar,'bar']] as const) {
      await api('/api/session'); assert.equal((await api('/api/login','POST',{username,password})).status,200);
    }
    let menuId='', ingredientId='', shiftId='';
    await t.test('owner writes guarded by role, origin and CSRF; explicit seed only once', async () => {
      assert.equal((await cashier('/api/seed-demo','POST',{})).status,403);
      assert.equal((await owner('/api/seed-demo','POST',{}, {'Origin':'https://evil.example'})).status,403);
      assert.equal((await owner('/api/seed-demo','POST',{}, {'X-CSRF-Token':'invalid'})).status,403);
      assert.equal((await owner('/api/seed-demo','POST',{})).status,201);
      assert.equal((await owner('/api/seed-demo','POST',{})).status,409);
      const catalog = (await owner('/api/catalog')).body;
      ingredientId = catalog.ingredients[0].id;
      const result = await owner('/api/menus','POST',{name:'Exact Decimal',category:'Test',priceSatang:5000,active:true,recipe:[{ingredientId,quantity:'0.100001'}],options:[{id:'replace',group:'milk',name:'No milk',priceSatang:100,recipe:[{ingredientId,quantity:'-0.100001'}]}]});
      assert.equal(result.status,201); menuId=result.body.id;
      const shift = await cashier('/api/shifts/open','POST',{openingCashSatang:10000}); assert.equal(shift.status,201); shiftId=shift.body.id;
      assert.equal((await cashier('/api/shifts/open','POST',{openingCashSatang:0})).status,409);
    });
    const bill = (key:string, overrides:Record<string,unknown>={}) => ({items:[{menuId,quantity:1,optionIds:['replace']}],paymentMethod:'cash',amountTenderedSatang:6000,idempotencyKey:key,transferConfirmed:false,...overrides});
    let queuedId='', preparedId='';
    await t.test('simultaneous duplicate returns original order; changed key fails and money is server-calculated', async () => {
      const [a,b] = await Promise.all([cashier('/api/checkout','POST',bill('simultaneous-key')),cashier('/api/checkout','POST',bill('simultaneous-key'))]);
      assert.equal(a.status,200); assert.equal(b.status,200); assert.equal(a.body.id,b.body.id);
      assert.equal(a.body.totalSatang,5100); assert.equal(a.body.changeSatang,900); queuedId=a.body.id;
      assert.equal((await cashier('/api/checkout','POST',bill('simultaneous-key',{amountTenderedSatang:7000}))).status,409);
      assert.equal((await bar('/api/checkout','POST',bill('bar-denied'))).status,403);
      assert.equal((await cashier('/api/checkout','POST',bill('transfer-unconfirmed',{paymentMethod:'transfer',amountTenderedSatang:5100}))).status,400);
      assert.equal((await cashier('/api/checkout','POST',bill('missing-option',{items:[{menuId,quantity:1,optionIds:[]}]}))).status,400);
    });
    await t.test('exact SQL decimals, negative final consumption, oversell and queue uniqueness', async () => {
      const m = await owner('/api/menus','POST',{name:'Consume',category:'Test',priceSatang:5000,active:true,recipe:[{ingredientId,quantity:'0.100001'}],options:[]});
      assert.equal(m.status,201,JSON.stringify(m.body));
      const stock = (await pool.query('SELECT stock FROM ingredients WHERE id=$1',[ingredientId])).rows[0].stock;
      const cleared=await owner('/api/stock','POST',{ingredientId,quantity:`-${stock}`,reason:'Set exact test stock'});
      assert.equal(cleared.status,200,JSON.stringify(cleared.body));
      const stocked=await owner('/api/stock','POST',{ingredientId,quantity:'0.100001',reason:'One remaining'});
      assert.equal(stocked.status,200,JSON.stringify(stocked.body));
      const consume = (key:string) => bill(key,{items:[{menuId:m.body.id,quantity:1,optionIds:[]}]});
      const results = await Promise.all([cashier('/api/checkout','POST',consume('oversell-race-a')),cashier('/api/checkout','POST',consume('oversell-race-b'))]);
      assert.deepEqual(results.map(x=>x.status).sort(),[200,409],JSON.stringify(results));
      preparedId=results.find(x=>x.status===200)!.body.id;
      assert.equal((await pool.query('SELECT stock FROM ingredients WHERE id=$1',[ingredientId])).rows[0].stock,'0.000000');
      const ids=(await pool.query('SELECT queue_number FROM orders')).rows.map(x=>x.queue_number); assert.equal(new Set(ids).size,ids.length);
      const invalid=await owner('/api/menus','POST',{name:'Invalid delta',category:'Test',priceSatang:1,active:true,recipe:[],options:[{id:'negative',group:'g',name:'negative',priceSatang:0,recipe:[{ingredientId,quantity:'-1'}]}]});
      assert.equal((await cashier('/api/checkout','POST',bill('negative-consumption',{items:[{menuId:invalid.body.id,quantity:1,optionIds:['negative']}]}))).status,400);
      assert.equal((await pool.query('SELECT count(*) FROM orders')).rows[0].count,'2');
    });
    await t.test('only bar prepares/marks ready; cashier completes; queued refunds are once and snapshots immutable', async () => {
      assert.equal((await cashier(`/api/orders/${preparedId}/status`,'PATCH',{status:'preparing'})).status,403);
      assert.equal((await bar(`/api/orders/${preparedId}/status`,'PATCH',{status:'ready'})).status,409);
      assert.equal((await bar(`/api/orders/${preparedId}/status`,'PATCH',{status:'preparing'})).status,200);
      assert.equal((await owner(`/api/orders/${preparedId}/refund`,'POST',{reason:'Test prepared refund',idempotencyKey:'refund-prepared'})).status,200);
      assert.equal((await pool.query('SELECT stock FROM ingredients WHERE id=$1',[ingredientId])).rows[0].stock,'0.000000');
      assert.equal((await owner(`/api/orders/${queuedId}/refund`,'POST',{reason:'Queued refund',idempotencyKey:'refund-queued'})).status,200);
      assert.equal((await owner(`/api/orders/${queuedId}/refund`,'POST',{reason:'Queued refund',idempotencyKey:'refund-queued'})).status,200);
      assert.equal((await owner(`/api/orders/${queuedId}/refund`,'POST',{reason:'Again',idempotencyKey:'refund-other'})).status,409);
      const shift=(await cashier('/api/shift')).body; assert.equal(shift.expectedCashSatang,10000);
      await assert.rejects(pool.query('UPDATE orders SET items=$2 WHERE id=$1',[queuedId,'[]']));
    });
    await t.test('queued refunds restore original recipe after menu changes; completed transfer preserves stock', async () => {
      await owner('/api/stock','POST',{ingredientId,quantity:'0.200002',reason:'Two portions'});
      const created=await owner('/api/menus','POST',{name:'Snapshot restore',category:'Test',priceSatang:3000,active:true,recipe:[{ingredientId,quantity:'0.100001'}],options:[]});
      const cart={items:[{menuId:created.body.id,quantity:1,optionIds:[]}]};
      const queued=await cashier('/api/checkout','POST',bill('snapshot-original',cart));
      assert.equal(queued.status,200);
      assert.equal((await owner(`/api/menus/${created.body.id}`,'PATCH',{recipe:[{ingredientId,quantity:'0.000001'}]})).status,200);
      assert.equal((await owner(`/api/orders/${queued.body.id}/refund`,'POST',{reason:'Restore snapshot',idempotencyKey:'refund-snapshot'})).status,200);
      assert.equal((await pool.query('SELECT stock FROM ingredients WHERE id=$1',[ingredientId])).rows[0].stock,'0.200002');
      const transfer=await cashier('/api/checkout','POST',bill('transfer-complete',{...cart,paymentMethod:'transfer',amountTenderedSatang:3000,transferConfirmed:true}));
      assert.equal(transfer.status,200);
      for(const status of ['preparing','ready']) assert.equal((await bar(`/api/orders/${transfer.body.id}/status`,'PATCH',{status})).status,200);
      assert.equal((await bar(`/api/orders/${transfer.body.id}/status`,'PATCH',{status:'completed'})).status,403);
      assert.equal((await cashier(`/api/orders/${transfer.body.id}/status`,'PATCH',{status:'completed'})).status,200);
      const report=(await owner('/api/reports')).body;
      assert.equal(report.totalSatang,3000); assert.equal(report.cashSatang,0); assert.equal(report.transferSatang,3000); assert.equal(report.refundSatang,13100);
      assert.equal(report.bestSellers[0].quantity,1);
      assert.equal((await pool.query('SELECT stock FROM ingredients WHERE id=$1',[ingredientId])).rows[0].stock,'0.200001');
    });
    await t.test('closed shift rejects sales; report and CSV available only owner; credentials invalidate sessions', async () => {
      assert.equal((await bar('/api/reports')).status,403);
      assert.equal((await owner('/api/reports')).status,200);
      assert.equal((await owner('/api/reports.csv')).status,200);
      const closed=await cashier(`/api/shifts/${shiftId}/close`,'POST',{countedCashSatang:9900}); assert.equal(closed.status,200); assert.equal(closed.body.differenceSatang,-100);
      assert.equal((await cashier('/api/checkout','POST',bill('closed-shift'))).status,409);
      assert.equal((await owner(`/api/users/${c.body.id}`,'PATCH',{active:false})).status,200);
      assert.equal((await cashier('/api/orders')).status,401);
      assert.equal((await owner(`/api/users/${b.body.id}`,'PATCH',{role:'cashier'})).status,200);
      assert.equal((await bar('/api/orders')).status,401);
      const ownerId=(await owner('/api/users')).body.find((user:{username:string})=>user.username==='owner').id;
      assert.equal((await owner(`/api/users/${ownerId}`,'PATCH',{active:false})).status,409);
      const newPassword='ChangedUnique!2026';
      assert.equal((await owner(`/api/users/${ownerId}`,'PATCH',{password:newPassword})).status,200);
      assert.equal((await owner('/api/users')).status,401);
      await owner('/api/session');
      assert.equal((await owner('/api/login','POST',{username:'owner',password})).status,401);
      assert.equal((await owner('/api/login','POST',{username:'owner',password:newPassword})).status,200);
      assert.equal((await owner('/api/logout','POST',{})).status,200);
      assert.equal((await owner('/api/orders')).status,401);
    });
    await t.test('database-backed login throttling survives separate anonymous sessions', async () => {
      for(let attempt=0;attempt<6;attempt++) {
        const attacker=client(); await attacker('/api/session');
        const failed=await attacker('/api/login','POST',{username:'missing-user',password:'wrong-password'});
        assert.equal(failed.status,attempt<5?401:429);
      }
    });
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
