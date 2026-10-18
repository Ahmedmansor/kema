import {validateBackup} from './core.mjs';
export const guestActions=new Set(['close-modal','details','trend','chart-group','chart-point','date-archive','test-archive','prev-page','next-page','clear-filters','compare','print-summary','do-print','close-print']);
export function createGuestSession({apply,render,lock,status,fetcher=fetch,location=globalThis.location}){
 const token=location.hash.slice(1).split('/')[0];let expires=0,active=false,poll,signature='';
 const href=screen=>'#'+token+'/'+screen;
 function stop(message){active=false;if(poll)clearInterval(poll);lock(message);}
 function valid(){if(active&&Date.now()<expires)return true;stop('انتهت صلاحية المشاركة أو أُلغيت. اطلب رابطًا جديدًا من صاحب السجل.');return false;}
 async function refresh(){
  const response=await fetcher('/view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)}),data=await response.json();
  if(!response.ok)throw Error(data.error||'الرابط غير متاح.');
  expires=Date.parse(data.expiresAt);if(!Number.isFinite(expires)||Date.now()>=expires)throw Error('انتهت صلاحية المشاركة.');
  const raw=data.snapshot,record=validateBackup({...raw,results:raw.results.map((r,i)=>({...r,id:r.id||'shared-result-'+i})),medications:(raw.medications||[]).map((m,i)=>({...m,id:m.id||'shared-med-'+i,group:m.group||'all'}))});
  // Older links carried their pinned warnings outside clinical history.
  if(raw.alerts?.length&&!record.clinical.events.some(n=>n.pinned))record.sharedAlerts=raw.alerts;
  const next=JSON.stringify(record);active=true;
  status(`${data.live?'سجل متجدد':'البيانات وقت إنشاء الرابط'} · ضيف للقراءة فقط · ينتهي ${new Date(expires).toLocaleString('ar-EG')}`);
  if(signature!==next){signature=next;apply(record);render();}
 }
 async function init(){try{if(!/^[a-f0-9]{64}$/.test(token))throw Error('الرابط غير مكتمل. اطلب رابط الطبيب من صاحب السجل.');await refresh();poll=setInterval(async()=>{if(!valid())return;try{await refresh();}catch(error){stop(error.message);}},45000);}catch(error){stop(error.message);}}
 return {init,valid,href,route:()=>location.hash.slice(1).split('/')[1]||'overview'};
}
