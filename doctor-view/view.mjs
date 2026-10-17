import {buildClinicalReport} from './report.mjs';
const status=document.querySelector('#share-status'),button=document.querySelector('#print-report');
button.addEventListener('click',()=>window.print());
try{
  const token=location.hash.slice(1);if(!/^[a-f0-9]{64}$/.test(token))throw Error('الرابط غير مكتمل. اطلب رابط التقرير من صاحبه.');
  const response=await fetch('/view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store',redirect:'error'}),data=await response.json();
  if(!response.ok)throw Error(data.error);
  document.querySelector('#report').innerHTML=buildClinicalReport(data.snapshot);button.hidden=false;
  status.textContent='نسخة ثابتة وقت المشاركة، تنتهي في '+new Date(data.expiresAt).toLocaleString('ar-EG')+'. لا تشمل نتائج أضيفت بعد إنشاء الرابط.';
}catch(error){status.textContent=error.message||'تعذّر فتح التقرير.';}
