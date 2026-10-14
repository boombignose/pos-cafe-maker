import {readdir,readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out='dist/third-party-licenses';await mkdir(out,{recursive:true});
const packages=[];
for(const entry of await readdir('node_modules',{withFileTypes:true})){
 if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
 const children=entry.name.startsWith('@')?(await readdir(`node_modules/${entry.name}`)).map(n=>`${entry.name}/${n}`):[entry.name];
 for(const name of children){const dir=`node_modules/${name}`;let pkg;try{pkg=JSON.parse(await readFile(`${dir}/package.json`,'utf8'));}catch{continue;}
  const licenseFiles=(await readdir(dir)).filter(f=>/^(licen[sc]e|copying|notice)(\..*)?$/i.test(f));
  for(const file of licenseFiles)await copyFile(`${dir}/${file}`,`${out}/${name.replaceAll('/','__')}-${file}`);
  packages.push({name:pkg.name,version:pkg.version,license:pkg.license,files:licenseFiles});
 }
}
await writeFile(`${out}/packages.json`,JSON.stringify(packages,null,2));
