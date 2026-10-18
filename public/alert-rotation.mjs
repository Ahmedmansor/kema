export function createAlertRotation({document:doc=globalThis.document,repeat=globalThis.setInterval,cancel=globalThis.clearInterval,reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false}={}){
 let timer=null;
 function destroy(){if(timer!==null)cancel(timer);timer=null;}
 function mount(){
  destroy();const root=doc.querySelector('[data-alert-carousel]');if(!root)return;
  const slides=[...root.querySelectorAll('[data-alert-slide]')];if(slides.length<2)return;
  const toggle=root.querySelector('[data-alert-play]'),counter=root.querySelector('[data-alert-count]'),window=root.querySelector('[data-alert-window]');
  let index=0,paused=reducedMotion(),hover=false,focus=false;
  function show(next){index=(next+slides.length)%slides.length;slides.forEach((slide,i)=>slide.hidden=i!==index);counter.textContent=`${index+1} / ${slides.length}`;if(window)window.scrollTop=0;}
  function sync(){toggle.textContent=paused?'تشغيل التبديل':'إيقاف التبديل';toggle.setAttribute('aria-pressed',String(!paused));}
  root.addEventListener('mouseenter',()=>hover=true);root.addEventListener('mouseleave',()=>hover=false);
  root.addEventListener('focusin',()=>focus=true);root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget))focus=false;});
  root.addEventListener('click',event=>{const button=event.target.closest('[data-alert-prev],[data-alert-next],[data-alert-play]');if(!button)return;if(button.hasAttribute('data-alert-play')){paused=!paused;sync();}else show(index+(button.hasAttribute('data-alert-prev')?-1:1));});
  show(0);sync();timer=repeat(()=>{if(root.isConnected===false){destroy();return;}if(!paused&&!hover&&!focus&&!doc.hidden)show(index+1);},12000);
 }
 return {mount,destroy};
}
