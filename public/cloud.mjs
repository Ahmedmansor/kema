import { validateBackup } from './core.mjs';
import { readDocument } from './documents.mjs';

// Local outbox + server revisions. A conflict always needs an explicit choice.
export function createCloudSync(ctx){
  const metaKey='kema.cloud.sync.v1';
  let meta={revision:0,dirty:false},state='loading',message='جارٍ الاتصال بسجلك…',timer,busy=false,remoteConflict=null,stopped=false;
  let session=null;
  const canEdit=()=>['owner','editor'].includes(session?.role);
  async function loadSession(){session=await api('/api/session');ctx.sessionChanged?.(session);return session;}
  try{meta={...meta,...JSON.parse(localStorage.getItem(metaKey)||'{}')};}catch{meta.dirty=true;}
  const persist=()=>localStorage.setItem(metaKey,JSON.stringify(meta));
  const stamp=value=>value?new Date(value).toLocaleString('ar-EG',{numberingSystem:'latn'}):'—';
  const set=(next,text)=>{state=next;message=text;decorate();};
  async function api(path,options={}){
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(options.method==='PUT'?60000:10000),...options});
    let data;try{data=await response.json();}catch{throw new Error('سجّل الدخول مجددًا لفتح اتصال آمن بالسجل.');}
    if(!response.ok){const error=new Error(data.error||'تعذّر الاتصال بالسحابة.');error.status=response.status;throw error;}return data;
  }
  function decorate(){
    document.querySelector('#save-state').textContent=message;
    const indicator=document.querySelector('.local-indicator');if(indicator)indicator.innerHTML='<span></span> حساب خاص · Cloudflare';
    document.querySelector('#cloud-notice')?.remove();
    if(!['ready','loading'].includes(state)){
      const notice=document.createElement('div');notice.id='cloud-notice';notice.className='storage-warning cloud-notice';notice.setAttribute('role','status');
      const text=document.createElement('span');text.textContent=message;
      const button=document.createElement('button');button.className='btn btn-soft';button.dataset.cloudAction='panel';button.textContent='تفاصيل المزامنة';notice.append(text,button);document.querySelector('#main').prepend(notice);
    }
    const button=document.querySelector('#cloud-button');if(button)button.hidden=false;
  }
  function applyRemote(remote){
    ctx.apply(validateBackup(remote.data||{schemaVersion:1,profile:{name:''},results:[],medications:[],documents:[],trash:[]}));
    meta={revision:remote.revision,dirty:false,updatedAt:remote.updatedAt};persist();set('ready','متزامن مع حسابك');ctx.render();
  }
  async function uploadDocuments(snapshot){
    for(const doc of snapshot.documents||[]){
      const path=`/api/documents/${doc.id}`,head=await fetch(path,{method:'HEAD',redirect:'error',cache:'no-store'});
      if(head.ok)continue;
      if(head.status!==404)throw new Error('تعذّر التحقق من مرفقات السحابة. أعد تسجيل الدخول.');
      const blob=await readDocument(doc.id);if(!blob)throw new Error(`ملف ${doc.name} غير متاح على الجهاز. استعده من النسخة الكاملة أولًا.`);
      await api(path,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:blob});
    }
  }
  async function push(){
    if(busy||stopped||state==='conflict')return;
    busy=true;set('pending','جارٍ مزامنة التغييرات…');
    const snapshot=structuredClone(ctx.getDB()),signature=JSON.stringify(snapshot);
    try{
      await loadSession();
      if(!canEdit())throw new Error('حسابك للقراءة فقط؛ التغييرات المحلية لم تُرفع. يمكنك تنزيلها من حسابي.');
      await uploadDocuments(snapshot);
      const saved=await api('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:meta.revision,data:snapshot})});
      meta.revision=saved.revision;meta.updatedAt=saved.updatedAt;meta.dirty=JSON.stringify(ctx.getDB())!==signature;persist();
      set(meta.dirty?'pending':'ready',meta.dirty?'تغييرات جديدة في انتظار المزامنة':'متزامن مع حسابك');
    }catch(error){
      meta.dirty=true;persist();
      if(error.status===409){set('conflict','فيه تعديلات من جهاز تاني؛ راجع النسختين.');try{remoteConflict=await api('/api/state');}catch{/* Keep local changes until the cloud can be read. */}}
      else set('offline',navigator.onLine?error.message:'بدون إنترنت · التغييرات محفوظة على الجهاز، وفي انتظار المزامنة');
    }finally{busy=false;if(meta.dirty&&state==='pending')timer=setTimeout(()=>void push(),500);}
  }
  function schedule(){
    if(!canEdit()){set('readonly','حساب للقراءة فقط');return;}
    meta.dirty=true;persist();if(state==='conflict'||stopped)return;
    set('pending','محفوظ على الجهاز · في انتظار المزامنة');clearTimeout(timer);timer=setTimeout(()=>void push(),600);
  }
  async function refresh(){
    if(busy||stopped||state==='conflict'||document.querySelector('#modal')?.open)return;
    try{
      await loadSession();
      if(!canEdit()&&meta.dirty){set('readonly','حسابك للقراءة فقط؛ نزّل تغييرات هذا الجهاز قبل استعادة نسخة السحابة.');return;}
      if(meta.dirty){await push();return;}
      const before=JSON.stringify(ctx.getDB()),remote=await api('/api/state');
      // Editing can happen while a remote read is in flight. Never replace that edit.
      if(meta.dirty||JSON.stringify(ctx.getDB())!==before){if(remote.revision>meta.revision){remoteConflict=remote;set('conflict','فيه تعديلات من جهاز تاني؛ راجع النسختين.');}return;}
      if(remote.revision>meta.revision)applyRemote(remote);else set('ready','متزامن مع حسابك');
    }catch(error){set('offline',error.message);}
  }
  function panel(){
    const counts=data=>`${data?.results?.length||0} نتيجة · ${data?.medications?.length||0} أدوية`,conflict=state==='conflict';
    const body=`<div class="modal-body"><p>${ctx.e(message)}</p><div class="details-list"><div><strong>هذا الجهاز</strong><span>${counts(ctx.getDB())}</span></div><div><strong>آخر مزامنة</strong><span>${ctx.e(stamp(meta.updatedAt))}</span></div>${conflict?`<div><strong>نسخة السحابة</strong><span>${counts(remoteConflict?.data)}<br>${ctx.e(stamp(remoteConflict?.updatedAt))}</span></div>`:''}</div><p>النتائج والأدوية متاحة لأجهزتك بعد تسجيل الدخول. ملفات PDF تُرفع إلى مخزن خاص. يحتفظ الخادم بآخر 30 نسخة سابقة للسجل.</p>${conflict?'<p class="storage-warning">توقف الحفظ للسحابة لحماية تعديلات الجهازين. نزّل نسخة هذا الجهاز، ثم اختار النسخة التي تريد اعتمادها. اعتماد السحابة يحفظ أيضًا نسخة استرجاع محلية من تعديلاتك.</p>':''}${stopped?'<p>المشروع جاهز، وتفعيل حماية الدخول لم يكتمل بعد. السجل السحابي مقفول لحين إتمامه.</p>':''}</div>`;
    const footer=`<button class="btn" data-cloud-action="download">تنزيل بيانات هذا الجهاز</button>${conflict?'<button class="btn" data-cloud-action="use-cloud">اعتماد نسخة السحابة</button><button class="btn btn-primary" data-cloud-action="use-local">اعتماد نسخة هذا الجهاز</button>':'<button class="btn btn-primary" data-cloud-action="retry">مزامنة الآن</button>'}${localStorage.getItem('kema.cloud.recovery.v1')?'<button class="btn" data-cloud-action="recovery">نسخة ما قبل حل التعارض</button>':''}<a class="btn" href="/cdn-cgi/access/login">تجديد الدخول</a>`;
    const account=`<section class="account-session"><h3>حسابي</h3><dl class="details-list"><div><dt>الإيميل</dt><dd dir="ltr">${ctx.e(session?.email||'تعذّر قراءة الحساب')}</dd></div><div><dt>الصلاحية</dt><dd>${{owner:'صاحب الحساب',editor:'قراءة وتعديل',viewer:'قراءة فقط'}[session?.role]||'غير متاحة'}</dd></div><div><dt>بداية الجلسة</dt><dd>${ctx.e(stamp(session?.issuedAt))}</dd></div><div><dt>انتهاء الجلسة</dt><dd>${ctx.e(stamp(session?.expiresAt))}</dd></div></dl><p class="small-help">المواعيد بتوقيت جهازك. الموعد يخص الجلسة الحالية؛ تغيير مدة الجلسة لا يمدد رمزًا صدر سابقًا.</p>${session?.role==='viewer'?'<p>تقدر تشوف النتائج والمنحنيات والمرفقات وتصدّر نسخة، بدون تعديل أو رفع ملفات.</p>':''}${session?.role==='owner'?'<button class="btn" data-cloud-action="roles">إدارة صلاحيات الحسابات</button>':''}</section>`;
    ctx.openModal('حسابي والمزامنة',body.replace('<div class="modal-body">',`<div class="modal-body">${account}`),footer.replace('<button class="btn btn-primary" data-cloud-action="use-local">',`<button class="btn btn-primary" data-cloud-action="use-local" ${canEdit()?'':'disabled'}>`));
  }
  async function rolesPanel(){
    const data=await api('/api/roles');
    ctx.openModal('صلاحيات الحسابات',`<form id="cloud-role-form"><div class="modal-body"><p>السماح بالدخول يتم أولًا من قائمة الإيميلات في Cloudflare Access. الحسابات المسموح لها هناك تكون للقراءة فقط افتراضيًا. هذه الشاشة تحدد من يستطيع التعديل.</p><div class="details-list"><div><strong dir="ltr">${ctx.e(data.owner)}</strong><span>صاحب الحساب</span></div>${data.roles.filter(r=>r.email!==data.owner).map(r=>`<div><strong dir="ltr">${ctx.e(r.email)}</strong><span>${r.role==='editor'?'قراءة وتعديل':'قراءة فقط'}</span></div>`).join('')}</div><label class="field"><span>الإيميل</span><input name="email" type="email" required maxlength="254" dir="ltr" autocomplete="off"></label><label class="field"><span>الصلاحية</span><select name="role" class="select"><option value="viewer">قراءة فقط</option><option value="editor">قراءة وتعديل</option></select></label><p>كل الحسابات تشاهد نفس السجل. سحب التعديل يُطبّق على الطلب التالي للخادم، بدون انتظار انتهاء الجلسة.</p></div><div class="modal-footer"><button class="btn btn-primary" type="submit">حفظ الصلاحية</button><button class="btn" type="button" data-cloud-action="panel">رجوع لحسابي</button></div></form>`);
  }
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='cloud-role-form')return;
    event.preventDefault();const button=event.target.querySelector('[type="submit"]');button.disabled=true;
    try{await api('/api/roles',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});await rolesPanel();ctx.toast('تم حفظ الصلاحية.');}catch(error){ctx.toast(error.message);}finally{button.disabled=false;}
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-cloud-action]');if(!button)return;
    const action=button.dataset.cloudAction;
    if(action==='roles'){try{await rolesPanel();}catch(error){ctx.toast(error.message);}return;}
    if(action==='use-local'&&!canEdit()){ctx.toast('حسابك للقراءة فقط.');return;}
    if(action==='panel'){if(state==='conflict'&&!remoteConflict){try{remoteConflict=await api('/api/state');}catch{}}panel();return;}
    if(action==='download'){ctx.download(JSON.stringify(ctx.getDB(),null,2),`kema-device-${new Date().toISOString().slice(0,10)}.json`,'application/json');return;}
    if(action==='recovery'){const recovery=JSON.parse(localStorage.getItem('kema.cloud.recovery.v1')||'null');if(recovery)ctx.download(JSON.stringify(recovery.data,null,2),'kema-conflict-recovery.json','application/json');else ctx.toast('لا توجد نسخة استرجاع من تعارض سابق.');return;}
    if(action==='retry'){ctx.closeModal();if(stopped){location.reload();return;}await refresh();return;}
    if(action==='use-cloud'||action==='use-local'){
      if(!remoteConflict){ctx.toast('تعذّر قراءة نسخة السحابة. حاول الاتصال مجددًا.');return;}
      try{
        if(action==='use-cloud'){localStorage.setItem('kema.cloud.recovery.v1',JSON.stringify({at:new Date().toISOString(),data:ctx.getDB()}));applyRemote(remoteConflict);}
        else{meta.revision=remoteConflict.revision;meta.dirty=true;persist();set('pending','جارٍ اعتماد نسخة هذا الجهاز…');await push();}
        ctx.closeModal();
      }catch(error){ctx.toast(error.message);}
    }
  });
  window.addEventListener('online',()=>void refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!document.querySelector('#modal')?.open)void refresh();});
  const poll=setInterval(()=>{if(!document.hidden&&!document.querySelector('#modal')?.open)void refresh();},30000);
  window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
  return {decorate,schedule,canEdit,async init(){
    try{
      const config=await api('/api/config');if(!config.ready){stopped=true;set('setup','تفعيل الدخول الآمن قيد التجهيز');return;}
      await loadSession();
      const remote=await api('/api/state');
      if(!canEdit()){
        if(meta.dirty)localStorage.setItem('kema.cloud.recovery.v1',JSON.stringify({at:new Date().toISOString(),data:ctx.getDB()}));
        applyRemote(remote);return;
      }
      if(meta.dirty){if(remote.revision!==meta.revision){remoteConflict=remote;set('conflict','فيه تعديلات من جهاز تاني؛ راجع النسختين.');}else await push();}
      else if(!remote.data&&ctx.getDB().results.length){set('conflict','السحابة فارغة؛ راجع النسخة المحلية قبل رفعها.');remoteConflict=remote;}
      else applyRemote(remote);
    }catch(error){set('offline',error.message);}
  }};
}
