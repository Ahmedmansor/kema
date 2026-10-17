import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const url='http://127.0.0.1:5173';
async function ready(){
  try{const res=await fetch(url,{signal:AbortSignal.timeout(700)});return res.ok&&(await res.text()).includes('كِما');}catch{return false;}
}
function open(){
  if(process.platform==='win32') {
    const browser=spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'});
    browser.on('error',()=>console.log(`Open ${url} in your browser.`));
  } else console.log(`Open ${url} in your browser.`);
}
if(await ready()){console.log(`Kema is already running at ${url}`);open();}
else {
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,stdio:'inherit',windowsHide:true});
  child.on('error',error=>{console.error(error.message);process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code||0;});
  process.on('SIGINT',()=>child.kill());
  for(let attempt=0;attempt<25;attempt++) {
    if(await ready()){console.log('Keep this window open while using Kema. Close it or press Ctrl+C to stop.');open();break;}
    if(child.exitCode!==null)break;
    await new Promise(resolve=>setTimeout(resolve,200));
  }
}
