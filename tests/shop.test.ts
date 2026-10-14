import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import pg from 'pg';
import {createApp} from '../server/app.js';
import {migrate} from '../server/db.js';

test('shop setup cannot be stolen or repeated; settings and history obey permissions', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const schema=`pos_shop_${randomUUID().replaceAll('-','')}`;
 const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
 await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});
 await migrate(pool);
 const server=createApp(pool,{setupToken:'installation-only-test-token-abcdef'}).listen(0,'127.0.0.1');
 await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 function client(){let cookie='',csrf='';return async(path:string,method='GET',body?:unknown)=>{
  const r=await fetch(`${origin}/api${path}`,{method,headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie')!.split(';')[0];
  const data=await r.json();if(data.csrfToken)csrf=data.csrfToken;return {status:r.status,data};
 };}
 const a=client(),b=client(),cashier=client();const password='ShopTestOnly!2026';
 const setup={token:'installation-only-test-token-abcdef',username:'shopowner',password,shop:{name:'ร้านทดสอบ',address:'123 ถนนทดสอบ',phone:'0123456789',paper:'58'}};
 try{
  assert.equal((await a('/session')).data.setupRequired,true);
  await b('/session');
  assert.equal((await b('/setup','POST',{...setup,token:'wrong'})).status,403);
  const results=await Promise.all([a('/setup','POST',setup),b('/setup','POST',setup)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  assert.equal((await pool.query('SELECT count(*) FROM users')).rows[0].count,'1');
  await a('/session');assert.equal((await a('/login','POST',{username:'shopowner',password})).status,200);
  assert.equal((await a('/session')).data.setupRequired,false);
  assert.equal((await b('/setup','POST',setup)).status,409);
  assert.equal((await a('/settings')).data.name,'ร้านทดสอบ');
  assert.equal((await a('/settings','PUT',{...setup.shop,name:'ร้านใหม่',paper:'80'})).status,200);
  assert.equal((await a('/settings')).data.paper,'80');
  assert.equal((await a('/settings','PUT',{...setup.shop,paper:'42'})).status,400);
  assert.equal((await a('/users','POST',{username:'counter',password,role:'cashier'})).status,201);
  await cashier('/session');await cashier('/login','POST',{username:'counter',password});
  assert.equal((await cashier('/settings')).data.name,'ร้านใหม่');
  assert.equal((await cashier('/settings','PUT',setup.shop)).status,403);
  assert.deepEqual((await a('/orders?date=2020-01-01')).data,[]);
  assert.equal((await a('/orders?date=not-a-date')).status,400);
  await migrate(pool);assert.equal((await a('/settings')).data.name,'ร้านใหม่');
  assert.equal((await pool.query('SELECT max(version) AS version FROM schema_migrations')).rows[0].version,3);
 }finally{await new Promise<void>(r=>server.close(()=>r()));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
