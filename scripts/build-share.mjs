import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('share-dist',{recursive:true});
for(const file of ['index.html','view.mjs'])await copyFile('doctor-view/'+file,'share-dist/'+file);
for(const file of ['report.mjs','report.css','core.mjs'])await copyFile('public/'+file,'share-dist/'+file);
console.log('Built doctor viewer; no medical records or tokens included.');
