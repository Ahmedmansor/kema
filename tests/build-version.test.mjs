import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {versionAssets} from '../scripts/version-assets.mjs';
test('release keys cover entry points and nested imports and change with schema code',async t=>{
 const root=await mkdtemp(join(tmpdir(),'kema-release-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const sources={'index.html':'<head><script src="./theme-init.js"></script></head><script src="./app.mjs"></script><link href="./style.css">','theme-init.js':'document.documentElement.dataset.theme="dark";','app.mjs':"import {validate} from './core.mjs'; fetch('/api/session'); new URL('./vendor/worker.mjs',import.meta.url);",'core.mjs':"export {validate} from './clinical.mjs';",'clinical.mjs':'export const validate = 1;','style.css':'body{color:black}'};
 const write=async()=>{for(const [name,body]of Object.entries(sources))await writeFile(join(root,name),body);};await write();const version=await versionAssets(root,Object.keys(sources));
 for(const [file,path] of [['index.html','theme-init.js'],['index.html','app.mjs'],['index.html','style.css'],['app.mjs','core.mjs'],['core.mjs','clinical.mjs']])assert.ok((await readFile(join(root,file),'utf8')).includes('./'+path+'?v='+version));
 const script=await readFile(join(root,'app.mjs'),'utf8');assert.ok(script.includes("fetch('/api/session')"));assert.ok(script.includes("'./vendor/worker.mjs'"));assert.match(await readFile(join(root,'index.html'),'utf8'),/name="kema-build"/);
 await write();assert.equal(await versionAssets(root,Object.keys(sources)),version);sources['clinical.mjs']='export const validate = 2;';await write();assert.notEqual(await versionAssets(root,Object.keys(sources)),version);
});
