import test from 'node:test';
import assert from 'node:assert/strict';
import {fork,spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('stale lock reclamation never admits multiple processes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pos-lock-test-'));
 const module=new URL('../scripts/shop/runtime.mjs',import.meta.url).href;
 const worker=join(directory,'worker.mjs');
 await writeFile(worker,`import {takeLock} from ${JSON.stringify(module)};process.send('ready');process.once('message',async directory=>{let release;try{release=await takeLock(directory);process.send('acquired');}catch{process.send('blocked');}process.once('message',async()=>{if(release)await release();process.exit(0);});});`);
 try{for(let trial=0;trial<5;trial++){
  const dead=spawn(process.execPath,['-e','process.exit(0)']);await once(dead,'exit');
  await writeFile(join(directory,'launcher.lock'),JSON.stringify({pid:dead.pid}));
  const children=Array.from({length:12},()=>fork(worker,{silent:true}));
  await Promise.all(children.map(child=>once(child,'message')));
  const replies=children.map(child=>once(child,'message'));children.forEach(child=>child.send(directory));
  const results=await Promise.all(replies);const exits=children.map(child=>once(child,'exit'));children.forEach(child=>child.send('finish'));await Promise.all(exits);
  assert.equal(results.filter(([result])=>result==='acquired').length,1,'Only one process may own the reclaimed lock');
 }}finally{await rm(directory,{recursive:true,force:true});}
});
