import test,{mock} from 'node:test';
import files from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,writeFile,readdir,rm,mkdir,symlink,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import net from 'node:net';
import pg from 'pg';
const cli=process.env.SHOP_PACKAGE_DIR?pathToFileURL(join(resolve(process.env.SHOP_PACKAGE_DIR),'scripts/shop/cli.mjs')):new URL('../scripts/shop/cli.mjs',import.meta.url);
async function port(){const server=net.createServer().listen(0,'127.0.0.1');await once(server,'listening');const n=(server.address() as net.AddressInfo).port;await new Promise<void>(r=>server.close(()=>r()));return n;}
test('shop launcher preserves data through restart and backup/restore; failed restore and duplicate starts are safe',{skip:process.env.RUN_SHOP_RUNTIME!=='true',timeout:120000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pos-shop-runtime-'));const httpPort=await port(),pgPort=await port();
 await writeFile(join(directory,'sentinel.txt'),'keep existing work');
 const env={...process.env,POS_DATA_DIR:directory,POS_PORT:String(httpPort),POS_PG_PORT:String(pgPort),POS_NO_BROWSER:'true'};
 let child:ReturnType<typeof spawn>|undefined;
 async function command(args:string[],overrides:Record<string,string>={}){const p=spawn(process.execPath,[fileURLToPath(cli),...args],{env:{...env,...overrides},stdio:['ignore','pipe','pipe']});let output='';p.stdout!.on('data',s=>{output+=s;});p.stderr!.on('data',s=>{output+=s;});const [code]=await once(p,'exit');return {code,output};}
 async function start(){
  child=spawn(process.execPath,[fileURLToPath(cli),'start'],{env,stdio:['ignore','pipe','pipe']});let output='';child.stdout!.on('data',s=>{output+=s;});child.stderr!.on('data',s=>{output+=s;});
  for(let attempt=0;attempt<150;attempt++){
   if(child.exitCode!==null)assert.fail(`Launcher stopped before readiness: ${output}`);
   try{if((await fetch(`http://127.0.0.1:${httpPort}/api/health`)).ok)return;}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  assert.fail(`Launcher not ready: ${output}`);
 }
 async function stop(){if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}child=undefined;}
 let cookie='',csrf='',epoch='';const origin=`http://127.0.0.1:${httpPort}`;
 async function api(path:string,method='GET',body?:unknown){const response=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json','X-POS-Epoch':epoch},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0];const result=await response.json();if(result.csrfToken)csrf=result.csrfToken;if(result.storeEpoch)epoch=result.storeEpoch;assert.ok(response.ok,JSON.stringify(result));return result;}
 try{
  await start();const cfg=JSON.parse(await readFile(join(directory,'config.json'),'utf8'));
  const firstSession=await api('/session');assert.equal(typeof firstSession.storeEpoch,'string');const originalEpoch=firstSession.storeEpoch;await api('/setup','POST',{token:cfg.setupToken,username:'runtimeowner',password:'RuntimeTestOnly!2026',shop:{name:'ร้านทดสอบ runtime',address:'',phone:'',paper:'80'}});
  await api('/login','POST',{username:'runtimeowner',password:'RuntimeTestOnly!2026'});
  const menu=await api('/menus','POST',{name:'ขนมทดสอบ',category:'ขนม',priceSatang:3500,active:true,recipe:[],options:[]});
  await api('/shifts/open','POST',{openingCashSatang:10000});
  const order=await api('/checkout','POST',{items:[{menuId:menu.id,quantity:1,optionIds:[]}],paymentMethod:'cash',amountTenderedSatang:5000,transferConfirmed:false,idempotencyKey:'runtime-original-sale'});
  const duplicate=await command(['start']);assert.notEqual(duplicate.code,0);assert.match(duplicate.output,/already running/i);
  let expectedBackups=1;
  if(process.platform!=='win32'&&process.env.SKIP_BACKUP_RACE!=='true'){
   await stop();const bin=join(directory,'slow-bin');await mkdir(bin);
   const {postgresBin}=await import('../scripts/shop/runtime.mjs');const realBin=await postgresBin();
   for(const name of ['pg_ctl','initdb','pg_restore'])await symlink(join(realBin,name),join(bin,name));
   const marker=join(directory,'dump-started');
   await writeFile(join(bin,'pg_dump'),`#!/bin/sh\ntouch '${marker.replaceAll("'","'\\''")}'\nsleep 2\nexec '${join(realBin,'pg_dump').replaceAll("'","'\\''")}' "$@"\n`);await chmod(join(bin,'pg_dump'),0o755);
   const backing=command(['backup'],{POS_PG_BIN:bin});
   for(let i=0;i<100;i++){try{await readFile(marker);break;}catch{await new Promise(r=>setTimeout(r,50));}}
   await start();const finished=await backing;assert.equal(finished.code,0,finished.output);
   assert.equal((await fetch(origin+'/api/health')).status,200,'Offline backup must not stop a newly started shop');expectedBackups=2;
  }
  const backed=await command(['backup']);assert.equal(backed.code,0,backed.output);
  const archives=(await readdir(join(directory,'backups'))).filter(f=>f.endsWith('.dump'));assert.equal(archives.length,expectedBackups);
  const archive=join(directory,'backups',archives[0]);
  const viaUi=await api('/backup','POST',{});assert.match(viaUi.file,/\.dump$/);
  assert.equal((await api('/operations')).file,viaUi.file);
  const fixture=new pg.Pool({host:'127.0.0.1',port:pgPort,database:cfg.database,user:cfg.user,password:cfg.password});
  await fixture.query('INSERT INTO schema_migrations(version) VALUES(99)');
  const incompatible=await command(['backup']);assert.equal(incompatible.code,0,incompatible.output);
  const invalidArchive=join(directory,'backups',JSON.parse(await readFile(join(directory,'backup-status.json'),'utf8')).file);
  await fixture.query('DELETE FROM schema_migrations WHERE version=99');await fixture.end();
  const whileRunning=await command(['restore',archive]);assert.notEqual(whileRunning.code,0);assert.match(whileRunning.output,/already running/i);
  await stop();await start();assert.equal((await api('/orders'))[0].id,order.id);assert.equal((await api('/reports')).totalSatang,3500);await stop();
  const before=JSON.parse(await readFile(join(directory,'config.json'),'utf8'));
  await writeFile(join(directory,'bad.dump'),'not a valid backup');const bad=await command(['restore',join(directory,'bad.dump')]);assert.notEqual(bad.code,0);
  assert.deepEqual(JSON.parse(await readFile(join(directory,'config.json'),'utf8')),before);
  const rejected=await command(['restore',invalidArchive]);assert.notEqual(rejected.code,0);assert.match(rejected.output,/schema version/);
  assert.deepEqual(JSON.parse(await readFile(join(directory,'config.json'),'utf8')),before);
  const restored=await command(['restore',archive]);assert.equal(restored.code,0,restored.output);
  const after=JSON.parse(await readFile(join(directory,'config.json'),'utf8'));assert.notEqual(after.database,before.database);
  // The original database stays intact and is retained for rollback.
  const original=new pg.Pool({host:'127.0.0.1',port:pgPort,database:before.database,user:before.user,password:before.password});
  await start();assert.equal((await original.query('SELECT count(*) FROM orders')).rows[0].count,'1');await original.end();
  const session=await api('/session');assert.equal(session.user,null);assert.notEqual(session.storeEpoch,originalEpoch);await api('/login','POST',{username:'runtimeowner',password:'RuntimeTestOnly!2026'});
  assert.equal((await api('/orders'))[0].id,order.id);assert.equal((await api('/shift')).expectedCashSatang,13500);
  const stale=await fetch(origin+'/api/checkout',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'X-POS-Epoch':originalEpoch,'Content-Type':'application/json'},body:JSON.stringify({items:[{menuId:menu.id,quantity:1,optionIds:[]}],paymentMethod:'cash',amountTenderedSatang:5000,transferConfirmed:false,idempotencyKey:'stale-after-restore'})});
  assert.equal(stale.status,409);assert.equal((await stale.json()).code,'STORE_RESTORED');assert.equal((await api('/orders')).length,1);

  assert.equal(await readFile(join(directory,'sentinel.txt'),'utf8'),'keep existing work');
  await stop();const beforeWarning=JSON.parse(await readFile(join(directory,'config.json'),'utf8'));
  await rm(join(directory,'backup-status.json'));await mkdir(join(directory,'backup-status.json'));
  const warning=await command(['restore',archive]);assert.equal(warning.code,0,'Committed restore must report success even when optional status write fails');assert.match(warning.output,/warning/i);
  assert.notEqual(JSON.parse(await readFile(join(directory,'config.json'),'utf8')).database,beforeWarning.database);
  const runtime=await import('../scripts/shop/runtime.mjs');const cleanupConfig=await runtime.loadConfig(directory),bin=await runtime.postgresBin();await runtime.startCluster(directory,cleanupConfig,bin);
  const originalUnlink=files.unlink;
  mock.method(files,'unlink',async(path:import('node:fs').PathLike)=>{if(String(path)===join(directory,'backup.lock'))throw Object.assign(new Error('Simulated lock cleanup I/O failure'),{code:'EIO'});return originalUnlink(path);});syncBuiltinESMExports();
  try{const selected=await runtime.restore(directory,cleanupConfig,bin,archive);assert.equal(JSON.parse(await readFile(join(directory,'config.json'),'utf8')).database,selected);assert.notEqual(selected,cleanupConfig.database);}finally{mock.restoreAll();syncBuiltinESMExports();await originalUnlink(join(directory,'backup.lock')).catch(()=>{});}


 }finally{await stop();await command(['stop-db']);await rm(directory,{recursive:true,force:true});}
});
