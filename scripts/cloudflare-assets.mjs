// Public dist assets only. Upload-session tokens are short lived and kept in ignored artifacts/.
import { readFile,writeFile,readdir,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('../dist/',import.meta.url),sessionFile=new URL('../artifacts/cloudflare-assets-session.json',import.meta.url);
const account='3ccb794d60a7b0121c977ed935fd4fde';
const mime=path=>path.endsWith('.html')?'text/html; charset=utf-8':/\.(mjs|js)$/.test(path)?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.wasm')?'application/wasm':path.endsWith('.ttf')?'font/ttf':path.endsWith('.woff2')?'font/woff2':path.endsWith('.json')?'application/json':'application/octet-stream';
async function manifestAt(dir,prefix=''){
  const out={};for(const item of await readdir(dir,{withFileTypes:true})){
    const name=prefix+item.name;if(item.isSymbolicLink())throw new Error('Symlinks are not deployable');
    if(item.isDirectory())Object.assign(out,await manifestAt(new URL(item.name+'/',dir),name+'/'));
    else{const bytes=await readFile(new URL(item.name,dir));out['/'+name]={hash:createHash('sha256').update(bytes).digest('hex').slice(0,32),size:bytes.length};}
  }return out;
}
const manifest=await manifestAt(root);
if(process.argv[2]==='manifest'){console.log(JSON.stringify(manifest));}
else if(process.argv[2]==='upload'){
  const session=JSON.parse(await readFile(sessionFile,'utf8'));let jwt=session.jwt;
  for(const bucket of session.buckets){
    const form=new FormData();for(const hash of bucket){const file=Object.keys(manifest).find(path=>manifest[path].hash===hash);if(!file)throw new Error('Build changed during upload');form.set(hash,new Blob([(await readFile(new URL(file.slice(1),root))).toString('base64')],{type:mime(file)}));}
    const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/assets/upload?base64=true`,{method:'POST',headers:{Authorization:`Bearer ${session.jwt}`},body:form,signal:AbortSignal.timeout(60000)});
    const data=await res.json();if(!res.ok||!data.success)throw new Error(`Asset upload failed: ${res.status}`);
    if(data.result?.jwt)jwt=data.result.jwt;
  }
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await writeFile(sessionFile,JSON.stringify({jwt,buckets:[]}));console.log('Public assets uploaded; completion token saved privately.');
}else throw new Error('Use manifest or upload');
