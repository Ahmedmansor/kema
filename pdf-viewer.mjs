// Mozilla PDF.js 6.4.299 is bundled locally under vendor/pdfjs (Apache-2.0).
export function mountPDFViewer(host,blob){
  let destroyed=false,loading=null,pdf=null,pageNumber=1,zoom=1,task=null,renderNumber=0,resizeTimer;
  host.innerHTML='<div class="pdf-viewer-toolbar"><button type="button" class="icon-btn" data-pdf="prev" aria-label="صفحة PDF السابقة">‹</button><span class="pdf-page-label" aria-live="polite">جارٍ فتح التقرير…</span><button type="button" class="icon-btn" data-pdf="next" aria-label="صفحة PDF التالية">›</button><button type="button" class="icon-btn" data-pdf="out" aria-label="تصغير PDF">−</button><button type="button" class="icon-btn" data-pdf="in" aria-label="تكبير PDF">+</button><button type="button" class="btn btn-small" data-pdf="fit">ملاءمة العرض</button></div><div class="pdf-password" hidden><label class="field"><span>كلمة مرور ملف PDF</span><input type="password" autocomplete="off"></label><button type="button" class="btn btn-small" data-pdf="password">فتح الملف</button></div><div class="pdf-message" role="status">جارٍ عرض الصفحة…</div><div class="pdf-canvas-scroll"><canvas aria-label="صفحة من التقرير الأصلي" role="img"></canvas></div>';
  const q=s=>host.querySelector(s),canvas=q('canvas'),scroller=q('.pdf-canvas-scroll');
  const controls=()=>{
    q('[data-pdf="prev"]').disabled=!pdf||pageNumber===1;q('[data-pdf="next"]').disabled=!pdf||pageNumber===pdf.numPages;
    q('[data-pdf="in"]').disabled=!pdf||zoom>=3;q('[data-pdf="out"]').disabled=!pdf||zoom<=.5;
  };
  async function renderPage(){
    if(!pdf||destroyed)return;
    const version=++renderNumber;if(task){task.cancel();try{await task.promise;}catch{}task=null;}
    try{
      const page=await pdf.getPage(pageNumber);if(destroyed||version!==renderNumber)return;
      const base=page.getViewport({scale:1}),width=Math.max(180,scroller.clientWidth-20),scale=width/base.width*zoom,viewport=page.getViewport({scale});
      const pixels=Math.min(window.devicePixelRatio||1,2);
      canvas.width=Math.floor(viewport.width*pixels);canvas.height=Math.floor(viewport.height*pixels);
      canvas.style.width=`${Math.floor(viewport.width)}px`;canvas.style.height=`${Math.floor(viewport.height)}px`;
      canvas.setAttribute('aria-label',`صفحة ${pageNumber} من ${pdf.numPages} في التقرير الأصلي`);
      q('.pdf-message').textContent='جارٍ عرض الصفحة…';q('.pdf-message').hidden=false;
      task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:pixels===1?null:[pixels,0,0,pixels,0,0]});
      await task.promise;if(destroyed||version!==renderNumber)return;
      q('.pdf-message').hidden=true;q('.pdf-page-label').textContent=`${pageNumber} / ${pdf.numPages}`;controls();
    }catch(error){if(!destroyed&&error.name!=='RenderingCancelledException'){q('.pdf-message').hidden=false;q('.pdf-message').textContent='تعذّر عرض الصفحة. استخدم الفتح في تبويب منفصل أو تأكد أن الملف سليم.';}}
  }
  let setPassword;
  host.addEventListener('click',event=>{
    const action=event.target.closest('[data-pdf]')?.dataset.pdf;if(!action)return;
    if(action==='password'){const value=q('.pdf-password input').value;q('.pdf-password input').value='';q('.pdf-password').hidden=true;setPassword?.(value);return;}
    if(!pdf)return;
    if(action==='prev'&&pageNumber>1)pageNumber--;
    if(action==='next'&&pageNumber<pdf.numPages)pageNumber++;
    if(action==='in')zoom=Math.min(3,zoom+.25);
    if(action==='out')zoom=Math.max(.5,zoom-.25);
    if(action==='fit')zoom=1;
    controls();renderPage();
  });
  let lastWidth=0;
  const observer=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width||0;if(Math.abs(width-lastWidth)>5){lastWidth=width;clearTimeout(resizeTimer);resizeTimer=setTimeout(renderPage,120);}});observer.observe(host);
  (async()=>{
    try{
      const pdfjs=await import('./vendor/pdfjs/pdf.min.mjs');if(destroyed)return;
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.mjs',import.meta.url).href;
      loading=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,enableXfa:false,
        cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
        standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,
        wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href,iccUrl:new URL('./vendor/pdfjs/iccs/',import.meta.url).href});
      loading.onPassword=(update,reason)=>{if(destroyed)return;setPassword=update;q('.pdf-password').hidden=false;q('.pdf-message').textContent=reason===2?'كلمة المرور غير صحيحة. جرّب مرة أخرى.':'الملف محمي بكلمة مرور.';};
      pdf=await loading.promise;if(destroyed)return;controls();await renderPage();
    }catch(error){if(!destroyed){q('.pdf-message').textContent='تعذّر فتح PDF. تأكد من سلامة الملف أو افتحه في تبويب منفصل.';q('.pdf-page-label').textContent='لم يفتح الملف';}}
  })();controls();
  return {destroy(){destroyed=true;renderNumber++;observer.disconnect();clearTimeout(resizeTimer);task?.cancel();loading?.destroy()?.catch(()=>{});}};
}
