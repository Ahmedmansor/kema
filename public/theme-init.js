// Run synchronously in <head>, before styles and content can paint.
(() => {
 let theme;
 try { theme=localStorage.getItem('kema.appearance.v1'); } catch {}
 if(theme!=='dark'&&theme!=='light')theme=globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';
 document.documentElement.setAttribute('data-theme',theme);
})();
