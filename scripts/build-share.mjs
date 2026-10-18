import {mkdir,copyFile} from 'node:fs/promises';
import {versionAssets} from './version-assets.mjs';
await mkdir('share-dist',{recursive:true});
for(const file of ['index.html','view.mjs'])await copyFile('doctor-view/'+file,'share-dist/'+file);
for(const file of ['report.mjs','report.css','core.mjs','clinical-core.mjs'])await copyFile('public/'+file,'share-dist/'+file);
const version=await versionAssets('share-dist',['index.html','view.mjs','report.mjs','report.css','core.mjs','clinical-core.mjs']);
console.log(`Built doctor viewer release ${version}; no medical records or tokens included.`);
