import {access,mkdir,readFile,writeFile,rename,unlink,open,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join,resolve,delimiter,basename} from 'node:path';
import {homedir,networkInterfaces} from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import pg from 'pg';
const exec=promisify(execFile);
const executable=name=>name+(process.platform==='win32'?'.exe':'');
const exists=path=>access(path).then(()=>true,()=>false);
export const dataDirectory=()=>resolve(process.env.POS_DATA_DIR??(process.platform==='win32'?join(process.env.LOCALAPPDATA??join(homedir(),'AppData','Local'),'pos-cafe-maker'):process.platform==='darwin'?join(homedir(),'Library','Application Support','pos-cafe-maker'):join(process.env.XDG_DATA_HOME??join(homedir(),'.local','share'),'pos-cafe-maker')));
export async function atomicJson(path,value){
 const temporary=path+'.'+randomBytes(6).toString('hex')+'.tmp';
 try{await writeFile(temporary,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});await rename(temporary,path);}finally{await unlink(temporary).catch(()=>{});}
}
const busy=()=>Object.assign(new Error('POS or maintenance is already running; wait for it to finish'),{code:'POS_LOCKED'});
export async function takeLock(directory,name='launcher.lock'){
 await mkdir(directory,{recursive:true,mode:0o700});const path=join(directory,name),reclaim=path+'.reclaim';
 const token=randomBytes(16).toString('hex');let file,guard;
 try{
  try{file=await open(path,'wx',0o600);}catch(error){
   if(error.code!=='EEXIST')throw error;
   try{guard=await open(reclaim,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw busy();throw e;}
   // Re-read under the exclusive reclaim guard; earlier stale-PID reads are no longer authoritative.
   let previous;try{previous=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw busy();}
   if(previous){
    if(!Number.isInteger(previous.pid)||previous.pid<1)throw new Error('Invalid process lock; verify POS stopped before repairing it');
    let alive=true;try{process.kill(previous.pid,0);}catch(e){alive=e.code!=='ESRCH';}
    if(alive)throw busy();await unlink(path);
   }
   try{file=await open(path,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw busy();throw e;}
  }
  await file.writeFile(JSON.stringify({pid:process.pid,token,startedAt:new Date().toISOString()}));await file.close();
 }finally{if(guard){await guard.close();await unlink(reclaim);}}
 return async()=>{const current=JSON.parse(await readFile(path,'utf8'));if(current.pid===process.pid&&current.token===token)await unlink(path);};
}
export async function waitLock(directory,name){
 const deadline=Date.now()+125000;
 for(;;){try{return await takeLock(directory,name);}catch(e){if(e.code!=='POS_LOCKED'||Date.now()>deadline)throw e;await new Promise(resolve=>setTimeout(resolve,100));}}
}
export async function postgresBin(major){
 const candidates=process.env.POS_PG_BIN?[process.env.POS_PG_BIN]:[
  ...[18,17].map(v=>join(process.env.ProgramFiles??'C:\\Program Files','PostgreSQL',String(v),'bin')),
  '/opt/homebrew/opt/postgresql@18/bin','/usr/local/opt/postgresql@18/bin','/usr/lib/postgresql/18/bin','/usr/lib/postgresql/17/bin','/opt/homebrew/opt/postgresql@17/bin',
  ...(process.env.PATH??'').split(delimiter)
 ];
 for(const directory of candidates){
  if(!await exists(join(directory,executable('pg_ctl'))))continue;
  const {stdout}=await exec(join(directory,executable('pg_ctl')),['--version'],{windowsHide:true});
  const version=Number(stdout.match(/PostgreSQL\) (\d+)\./)?.[1]);if(![17,18].includes(version)||(major&&version!==Number(major)))continue;
  for(const name of ['initdb','pg_dump','pg_restore'])if(!await exists(join(directory,executable(name))))throw new Error('PostgreSQL tools missing: '+name);
  return directory;
 }
 throw new Error('Install PostgreSQL 17 or 18 from postgresql.org/download/windows (or set POS_PG_BIN to its bin folder). Existing PostgreSQL databases will not be used.');
}
const numberPort=(value,fallback)=>{const port=Number(value??fallback);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('POS ports must be integers from 1024 to 65535');return port;};
export async function loadConfig(directory){
 const cfg=JSON.parse(await readFile(join(directory,'config.json'),'utf8'));
 if(cfg.version!==1||cfg.user!=='pos_app'||cfg.adminUser!=='pos_admin'||!/^pos_(cafe|restore_[a-z0-9_]+)$/.test(cfg.database)||![cfg.password,cfg.adminPassword,cfg.setupToken].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))throw new Error('Invalid POS config; original data was not changed');
 numberPort(cfg.pgPort,55432);numberPort(cfg.port,3001);return cfg;
}
export function connection(cfg,admin=false,database=cfg.database){return {host:'127.0.0.1',port:cfg.pgPort,database:admin?'postgres':database,user:admin?cfg.adminUser:cfg.user,password:admin?cfg.adminPassword:cfg.password};}
async function tool(bin,name,args,cfg,admin=false){
 return exec(join(bin,executable(name)),args,{windowsHide:true,timeout:120000,maxBuffer:4*1024*1024,env:{...process.env,PGPASSWORD:admin?cfg.adminPassword:cfg.password,PGCONNECT_TIMEOUT:'10'}});
}
const dbArgs=cfg=>['--host=127.0.0.1',`--port=${cfg.pgPort}`,`--username=${cfg.user}`];
export async function startCluster(directory,cfg,bin){
 const cluster=join(directory,'postgres');
 if(!await exists(join(cluster,'PG_VERSION'))){
  if(await exists(cluster)&&(await readdir(cluster)).length)throw new Error('An unfinished/non-POS database folder exists; preserve it and contact support. It was not overwritten.');
  const passwordFile=join(directory,'.init-password');
  await writeFile(passwordFile,cfg.adminPassword,{mode:0o600,flag:'wx'});
  try{await tool(bin,'initdb',['-D',cluster,'--encoding=UTF8','--locale=C',`--username=${cfg.adminUser}`,'--auth=scram-sha-256',`--pwfile=${passwordFile}`],cfg,true);}finally{await unlink(passwordFile).catch(()=>{});}
 }
 try{await tool(bin,'pg_ctl',['-D',cluster,'status'],cfg,true);return false;}catch{}
 await tool(bin,'pg_ctl',['-D',cluster,'-l',join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${cfg.pgPort}`,'-w','start'],cfg,true);return true;
}
export async function stopCluster(directory,cfg,bin){
 if(!await exists(join(directory,'postgres','PG_VERSION')))return;
 try{await tool(bin,'pg_ctl',['-D',join(directory,'postgres'),'status'],cfg,true);}catch{return;}
 await tool(bin,'pg_ctl',['-D',join(directory,'postgres'),'-m','fast','-w','stop'],cfg,true);
}
export async function initialize(directory){
 await mkdir(directory,{recursive:true,mode:0o700});const major=await readFile(join(directory,'postgres','PG_VERSION'),'utf8').catch(()=>undefined);const bin=await postgresBin(major);
 let cfg;if(await exists(join(directory,'config.json')))cfg=await loadConfig(directory);
 else{
  cfg={version:1,user:'pos_app',password:randomBytes(32).toString('hex'),adminUser:'pos_admin',adminPassword:randomBytes(32).toString('hex'),setupToken:randomBytes(32).toString('hex'),database:'pos_cafe',pgPort:numberPort(process.env.POS_PG_PORT,55432),port:numberPort(process.env.POS_PORT,3001),initialized:false};
  if(await exists(join(directory,'postgres')))throw new Error('Existing database folder found without config; nothing was overwritten');
  await atomicJson(join(directory,'config.json'),cfg);
 }
 const started=await startCluster(directory,cfg,bin);
 const admin=new pg.Pool(connection(cfg,true));
 try{
  if(!cfg.initialized){
   if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[cfg.user])).rowCount)await admin.query(`CREATE ROLE pos_app LOGIN PASSWORD '${cfg.password}'`);
   if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[cfg.database])).rowCount)await admin.query('CREATE DATABASE pos_cafe OWNER pos_app');
   cfg.initialized=true;await atomicJson(join(directory,'config.json'),cfg);
  }
 }finally{await admin.end();}
 return {cfg,bin,started};
}
async function sha256(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
export async function backup(directory,cfg,bin){
 const lifecycle=await waitLock(directory,'cluster.lock');let unlock,temporary,started=false;
 try{cfg=await loadConfig(directory);started=await startCluster(directory,cfg,bin);unlock=await takeLock(directory,'backup.lock');}catch(error){if(started)await stopCluster(directory,cfg,bin);await lifecycle();throw error;}
 try{
  const folder=join(directory,'backups');await mkdir(folder,{recursive:true,mode:0o700});
  const createdAt=new Date().toISOString(),file=`pos-${createdAt.replaceAll(/[:.]/g,'-')}-${randomBytes(3).toString('hex')}.dump`,path=join(folder,file);temporary=path+'.tmp';
  // Exclude live sessions so restored databases never revive authenticated cookies.
  await tool(bin,'pg_dump',[...dbArgs(cfg),`--dbname=${cfg.database}`,'--format=custom','--no-owner','--no-acl','--exclude-table-data=sessions','--exclude-table-data=login_limits',`--file=${temporary}`],cfg);
  const hash=await sha256(temporary);await rename(temporary,path);temporary=undefined;
  const postgresMajor=Number(await readFile(join(directory,'postgres','PG_VERSION'),'utf8'));
  const metadata={version:1,createdAt,file,sha256:hash,database:cfg.database,postgresMajor};await atomicJson(path+'.json',metadata);
  await atomicJson(join(directory,'backup-status.json'),{managed:true,lastBackup:createdAt,file,error:null,database:cfg.database});return metadata;
 }catch(error){await atomicJson(join(directory,'backup-status.json'),{managed:true,error:'สำรองไม่สำเร็จ ตรวจพื้นที่ว่างและ PostgreSQL tools',failedAt:new Date().toISOString()});throw error;}
 finally{try{if(temporary)await unlink(temporary).catch(()=>{});await unlock();if(started)await stopCluster(directory,cfg,bin);}finally{await lifecycle();}}
}
export async function backupStatus(directory,cfg){
 try{const status=JSON.parse(await readFile(join(directory,'backup-status.json'),'utf8'));if(cfg&&status.database!==cfg.database)return {managed:true,lastBackup:null,file:null,error:null};return {...status,managed:true};}
 catch(error){return {managed:true,lastBackup:null,file:null,error:error.code==='ENOENT'?null:'อ่านสถานะสำรองไม่ได้ ตรวจสิทธิ์และพื้นที่ว่าง'};}
}
export async function restore(directory,cfg,bin,path){
 const unlock=await takeLock(directory,'backup.lock');
 try{
  const meta=JSON.parse(await readFile(path+'.json','utf8'));
  const major=Number(await readFile(join(directory,'postgres','PG_VERSION'),'utf8'));
  if(meta.postgresMajor!==major)throw new Error('Backup requires the same PostgreSQL major version; original config unchanged');
  if(meta.version!==1||meta.file!==basename(path)||meta.sha256!==await sha256(path))throw new Error('Backup checksum/manifest invalid; original database and config unchanged');
  await tool(bin,'pg_restore',['--list',path],cfg);
  const database=`pos_restore_${Date.now()}_${randomBytes(3).toString('hex')}`;
  const admin=new pg.Pool(connection(cfg,true));
  try{await admin.query(`CREATE DATABASE ${database} OWNER pos_app`);}finally{await admin.end();}
  await tool(bin,'pg_restore',[...dbArgs(cfg),`--dbname=${database}`,'--exit-on-error','--single-transaction','--no-owner','--no-acl',path],cfg);
  const recovered=new pg.Pool(connection(cfg,false,database));
  try{
   const version=(await recovered.query('SELECT max(version) AS version FROM schema_migrations')).rows[0].version;
   if(version!==3)throw new Error('Backup schema version does not match this release; original config unchanged');
   await recovered.query('SELECT id FROM orders LIMIT 1');await recovered.query('SELECT name FROM shop_settings WHERE singleton=true');
   await recovered.query('DELETE FROM sessions');await recovered.query('DELETE FROM login_limits');
  }finally{await recovered.end();}
  await atomicJson(join(directory,'config.json'),{...cfg,database});
  // Config rename commits the restore; status metadata cannot turn a committed restore into a failure.
  try{await atomicJson(join(directory,'backup-status.json'),{managed:true,lastBackup:null,file:null,error:null,database,restoredAt:new Date().toISOString(),restoredFrom:basename(path)});}catch{console.warn('Warning: restore committed, but status metadata could not be written. Check permissions/disk space and make a fresh backup.');}
  return database;
 }finally{await unlock();}
}
export function openBrowser(port){
 if(process.env.POS_NO_BROWSER==='true')return;
 const url=`http://localhost:${port}/#pos`;
 const child=process.platform==='win32'?spawn('cmd.exe',['/c','start','',url],{stdio:'ignore',windowsHide:true}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'});child.on('error',()=>{});child.unref();
}
export function lanUrls(port){return Object.values(networkInterfaces()).flatMap(entries=>(entries??[]).filter(e=>e.family==='IPv4'&&!e.internal).map(e=>`http://${e.address}:${port}/#pos`));}
