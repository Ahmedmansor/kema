const KEY='kema.appearance.v1';
export function preferredTheme(storage,systemDark=false){try{const saved=storage?.getItem(KEY);if(saved==='dark'||saved==='light')return saved;}catch{}return systemDark?'dark':'light';}
export function installTheme(doc=document,storage,systemDark=globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches||false){
 if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}
 let theme=preferredTheme(storage,systemDark);
 function apply(){doc.documentElement.dataset.theme=theme;doc.querySelectorAll('[data-theme-toggle]').forEach(button=>{button.textContent=theme==='dark'?'الوضع الفاتح':'الوضع الداكن';button.setAttribute('aria-label',theme==='dark'?'تفعيل الوضع الفاتح':'تفعيل الوضع الداكن');button.setAttribute('aria-pressed',String(theme==='dark'));});doc.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#101b23':'#147d70');}
 apply();doc.addEventListener('click',event=>{if(!event.target.closest('[data-theme-toggle]'))return;theme=theme==='dark'?'light':'dark';try{storage?.setItem(KEY,theme);}catch{}apply();});
 return ()=>theme;
}
if(typeof document!=='undefined')installTheme();
