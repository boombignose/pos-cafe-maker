import {readFile,writeFile,unlink,access} from 'node:fs/promises';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {dataDirectory,takeLock,waitLock,initialize,loadConfig,postgresBin,startCluster,stopCluster,connection,backup,restore,backupStatus,openBrowser,lanUrls} from './runtime.mjs';
const directory=dataDirectory();const command=process.argv[2]??'start';
let release,lifecycle,cluster,pool,server,timer,backupInFlight,closing=false,restoreCommitted=false;
async function close(){
 if(closing)return;closing=true;if(timer)clearInterval(timer);
 if(server)await new Promise(resolve=>server.close(resolve));
 if(backupInFlight)await backupInFlight.catch(()=>{});
 if(pool)await pool.end();
 if(cluster){lifecycle??=await waitLock(directory,'cluster.lock');await stopCluster(directory,cluster.cfg,cluster.bin);}
 if(lifecycle){await lifecycle();lifecycle=undefined;}
 if(release)await release();
}
try{
 if(!['start','backup','restore','stop-db'].includes(command))throw new Error('Usage: node scripts/shop/cli.mjs start | backup | restore <trusted-backup.dump>');
 const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||major===22&&minor<12)throw new Error('Install Node.js 24 LTS (minimum 22.12) first');
 if(command==='start'){
  try{await access(new URL('../../runtime/app.js',import.meta.url));}catch{throw new Error('Compiled shop missing. Use shop ZIP, or run npm ci and npm run build:shop from source first.');}
  release=await takeLock(directory);lifecycle=await waitLock(directory,'cluster.lock');cluster=await initialize(directory);
  const {cfg}=cluster;pool=new pg.Pool({...connection(cfg),max:10});pool.on('error',()=>console.error('Database connection lost; check PostgreSQL and disk space.'));
  const {migrate}=await import('../../runtime/db.js');await migrate(pool);
  const firstRun=!(await pool.query('SELECT 1 FROM users LIMIT 1')).rowCount;
  const tokenFile=join(directory,'SETUP-TOKEN.txt');
  if(firstRun){await writeFile(tokenFile,cfg.setupToken,{mode:0o600});console.log('First setup: open '+tokenFile+' and enter the token in the shop page.');}
  else await unlink(tokenFile).catch(()=>{});
  const makeBackup=()=>backupInFlight??=(async()=>{try{return await backup(directory,cfg,cluster.bin);}finally{backupInFlight=undefined;}})();
  const dailyBackup=async()=>{
   if(!(await pool.query('SELECT 1 FROM users LIMIT 1')).rowCount)return;
   const status=await backupStatus(directory,cfg);const day=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
   if(!status.lastBackup||day(new Date(status.lastBackup))!==day(new Date()))await makeBackup();
  };
  const {createApp}=await import('../../runtime/app.js');
  server=createApp(pool,{setupToken:cfg.setupToken,storeEpoch:createHash('sha256').update(cfg.setupToken+cfg.database).digest('hex'),operations:{status:()=>backupStatus(directory,cfg),backup:makeBackup}}).listen(cfg.port,'0.0.0.0');await once(server,'listening');await lifecycle();lifecycle=undefined;
  for(const signal of ['SIGINT','SIGTERM','SIGBREAK'])process.on(signal,()=>{close().then(()=>process.exit(0)).catch(()=>process.exit(1));});
  console.log(`Shop ready: http://localhost:${cfg.port}/#pos\nData: ${directory}\nLAN: ${lanUrls(cfg.port).join(' | ')}\nKeep this window open. Ctrl+C stops POS. HTTP LAN traffic is not encrypted; use only a trusted shop network.`);
  openBrowser(cfg.port);
  const scheduled=()=>dailyBackup().catch(()=>console.error('Scheduled backup failed; check shop backup status and disk space.'));
  await scheduled();timer=setInterval(scheduled,300000);
 }else{
  if(command!=='backup'){release=await takeLock(directory);lifecycle=await waitLock(directory,'cluster.lock');}
  const cfg=await loadConfig(directory),bin=await postgresBin(await readFile(join(directory,'postgres','PG_VERSION'),'utf8'));
  if(command==='stop-db'){await stopCluster(directory,cfg,bin);await close();}
  else{
   if(command!=='backup')cluster={cfg,bin,started:await startCluster(directory,cfg,bin)};
   if(command==='backup'){const result=await backup(directory,cfg,bin);console.log('Backup complete: '+join(directory,'backups',result.file));}
   else{if(!process.argv[3])throw new Error('Specify a trusted backup created by this POS');const database=await restore(directory,cfg,bin,process.argv[3]);restoreCommitted=true;console.log('Restore complete. Original database retained; recovered database: '+database);}
   await close();
  }
 }
}catch(error){console.error(restoreCommitted?'Warning: restore committed; cleanup needs attention:':'POS could not complete action:',error.message);await close().catch(()=>{});process.exitCode=restoreCommitted?0:1;}
