import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

// Every application module gets the same release key, including transitive imports.
// Personal records and API URLs never participate in this build fingerprint.
export async function versionAssets(directory,names){
 const files=names.filter(name=>/\.(m?js|css|html|svg)$/.test(name)),sources=new Map();
 const hash=createHash('sha256');
 for(const name of [...files].sort()){const source=await readFile(join(directory,name),'utf8');sources.set(name,source);hash.update(name+'\0'+source+'\0');}
 const version=hash.digest('hex').slice(0,16),allowed=new Set(files);
 for(const [name,source] of sources){
  if(!/\.(m?js|html)$/.test(name))continue;
  let output=source.replace(/(["'])(\.\/[^"'?#\s<>]+)\1/g,(original,quote,path)=>allowed.has(path.slice(2))?`${quote}${path}?v=${version}${quote}`:original);
  if(name.endsWith('.html'))output=output.replace('</head>',`<meta name="kema-build" content="${version}">\n</head>`);
  await writeFile(join(directory,name),output);
 }
 return version;
}
