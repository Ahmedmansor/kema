export function createAlertRotation({document:doc=globalThis.document,repeat=globalThis.setInterval,cancel=globalThis.clearInterval,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false}={}){
 let timer=null,motion=null;
 function destroy(){if(timer!==null)cancel(timer);timer=null;motion?.cancel();motion=null;}
 function mount(){
  destroy();const root=doc.querySelector('[data-alert-carousel]');if(!root)return;
  const slides=[...root.querySelectorAll('[data-alert-slide]')];if(slides.length<2)return;
  const toggle=root.querySelector('[data-alert-play]'),counter=root.querySelector('[data-alert-count]'),window=root.querySelector('[data-alert-window]');
  let index=0,paused=reducedMotion(),hover=false,focus=false;
  function show(next,animate=true){const direction=next<index?-1:1;motion?.cancel();index=(next+slides.length)%slides.length;slides.forEach((slide,i)=>slide.hidden=i!==index);counter.textContent=`${index+1} / ${slides.length}`;root.querySelectorAll('[data-alert-dot]').forEach((dot,i)=>dot.toggleAttribute?.('data-current',i===index));if(window)window.scrollTop=0;if(animate&&!reducedMotion())motion=slides[index].animate?.([{opacity:0,transform:`translateX(${direction*18}px) scale(.985)`},{opacity:1,transform:'translateX(0) scale(1)'}],{duration:380,easing:'cubic-bezier(.22,1,.36,1)'});}
  function sync(){const label=toggle.querySelector?.('[data-play-label]');if(label)label.textContent=paused?'تشغيل':'إيقاف';else toggle.textContent=paused?'تشغيل التبديل':'إيقاف التبديل';toggle.setAttribute('aria-pressed',String(!paused));toggle.setAttribute('aria-label',paused?'تشغيل التبديل التلقائي':'إيقاف التبديل التلقائي');}
  root.addEventListener('mouseenter',()=>hover=true);root.addEventListener('mouseleave',()=>hover=false);
  root.addEventListener('focusin',()=>focus=true);root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget))focus=false;});
  root.addEventListener('click',event=>{const button=event.target.closest('[data-alert-prev],[data-alert-next],[data-alert-play]');if(!button)return;if(button.hasAttribute('data-alert-play')){paused=!paused;sync();}else show(index+(button.hasAttribute('data-alert-prev')?-1:1));});
  show(0,false);sync();timer=repeat(()=>{if(root.isConnected===false){destroy();return;}if(!paused&&!hover&&!focus&&!doc.hidden)show(index+1);},12000);
 }
 return {mount,destroy};
}
