import { mkdir, cp, readdir, readFile } from 'node:fs/promises';
import {versionAssets} from './version-assets.mjs';
await mkdir('dist', { recursive: true });
const allowlist=['index.html', 'styles.css', 'enhancements.css', 'app.mjs', 'core.mjs', 'enhancements.mjs', 'documents.mjs', 'pdf-viewer.mjs', 'cloud.mjs', 'profiles.mjs', 'report.mjs', 'report.css', 'medication-register.mjs', 'prescription-curve.mjs', 'timeline.mjs', 'clinical.mjs', 'clinical-core.mjs', 'clinical.css', 'vendor', 'mark.svg'];
const existing=await readdir('dist');
if(existing.some(f=>!allowlist.includes(f)))throw new Error('Unexpected files in dist. Move them out before building.');
// Explicit allowlist: personal seed records and design tooling are never packaged.
for (const name of allowlist) {
  await cp(`public/${name}`, `dist/${name}`,{recursive:true});
}
const files = await readdir('dist');
if (files.some(f => /data|results|csv|backup/i.test(f))) throw new Error('Unexpected data file in dist');
let privateName='';
try{privateName=JSON.parse((await readFile('data/initial-results.json','utf8')).replace(/^\uFEFF/,'')).profile?.name||'';}
catch(error){if(error.code!=='ENOENT')throw error;}
for (const name of files.filter(name=>name!=='vendor')) {
  if (privateName&&(await readFile(`dist/${name}`, 'utf8')).includes(privateName)) throw new Error('Personal data in build');
}
const version=await versionAssets('dist',allowlist);
console.log(`Built dist/ release ${version} — application only; no personal records or PDFs.`);
