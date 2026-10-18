import {mkdir,copyFile} from 'node:fs/promises';
import {versionAssets} from './version-assets.mjs';
await mkdir('share-dist',{recursive:true});
const local=['index.html','view.mjs','guest.css'],shared=['styles.css','clinical.css','clinical.mjs','clinical-presentation.mjs','medication-register.mjs','timeline.mjs','prescription-curve.mjs','report.mjs','report.css','core.mjs','clinical-core.mjs'];
for(const file of local)await copyFile('doctor-view/'+file,'share-dist/'+file);
for(const file of shared)await copyFile('public/'+file,'share-dist/'+file);
const version=await versionAssets('share-dist',[...local,...shared]);
console.log(`Built doctor viewer release ${version}; no medical records or tokens included.`);
