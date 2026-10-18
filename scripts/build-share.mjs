import {mkdir,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {versionAssets} from './version-assets.mjs';
await mkdir('share-dist',{recursive:true});
// Remove the two retired generated viewer assets; index now comes from the main UI.
for(const name of ['view.mjs','guest.css'])await rm('share-dist/'+name,{force:true});
const local=['guest-session.mjs'],shared=['app.mjs','chart-ranges.mjs','themes.css','theme.mjs','theme-init.js','enhancements.mjs','enhancements.css','chart-prescriptions.mjs','documents.mjs','pdf-viewer.mjs','cloud.mjs','profiles.mjs','mark.svg','styles.css','clinical.css','clinical.mjs','alert-rotation.mjs','clinical-presentation.mjs','medication-register.mjs','timeline.mjs','prescription-curve.mjs','report.mjs','report.css','core.mjs','clinical-core.mjs'];
for(const file of local)await copyFile('doctor-view/'+file,'share-dist/'+file);
for(const file of shared)await copyFile('public/'+file,'share-dist/'+file);
const mainHTML=await readFile('public/index.html','utf8');
await writeFile('share-dist/index.html',mainHTML.replace('<head>','<head><meta name="kema-guest" content="1">').replace('<body>','<body class="guest-record">').replace('مساحتي <span>','ضيف · قراءة فقط <span>'));
const version=await versionAssets('share-dist',['index.html',...local,...shared]);
console.log(`Built doctor viewer release ${version}; no medical records or tokens included.`);
