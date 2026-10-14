import {spawnSync} from 'node:child_process';
import {mkdir,cp,writeFile} from 'node:fs/promises';
const npm=process.platform==='win32'?'npm.cmd':'npm';
for(const args of [['run','build'],['exec','tsc','--','-p','tsconfig.server.json']]){
 const result=spawnSync(npm,args,{stdio:'inherit',env:{...process.env,VITE_APP_MODE:'server'},shell:process.platform==='win32'});
 if(result.status!==0)process.exit(result.status??1);
}
await mkdir('runtime/migrations',{recursive:true});await cp('server/migration.sql','runtime/migration.sql');await cp('server/migrations','runtime/migrations',{recursive:true});
await writeFile('dist/SHOP-MODE.txt','Server mode: requires the Express shop launcher; not a browser-only demo.\n');
