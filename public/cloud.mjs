import { validateBackup } from './core.mjs';
import { readDocument } from './documents.mjs';
import { cloudRequest } from './profiles.mjs';

// Local outbox + server revisions. A conflict always needs an explicit choice.
export function createCloudSync(ctx){
  const {account}=ctx,base=account.base,metaKey=account.scope+'.sync',recoveryKey=account.scope+'.recovery';
  let meta={revision:0,dirty:false},state='loading',message='جارٍ الاتصال بسجلك…',timer,busy=false,remoteConflict=null,stopped=false;
  let session=null;
  const canEdit=()=>['owner','editor'].includes(session?.role);
  async function loadSession(){
    try{session=await api('/api/session');if(session.profileId!==account.selected.id)throw new Error('الملف الصحي غير مطابق؛ أعد فتح الصفحة.');ctx.sessionChanged?.(session);return session;}
    catch(error){
      if([401,403,404].includes(error.status)){
        session=null;stopped=true;
        if(meta.dirty)localStorage.setItem(recoveryKey,JSON.stringify({at:new Date().toISOString(),data:ctx.getDB()}));
        meta.dirty=false;persist();ctx.apply({schemaVersion:1,profile:{name:''},results:[],medications:[],documents:[],trash:[]});ctx.sessionChanged?.(null);ctx.render();
      }
      throw error;
    }
  }
  try{meta={...meta,...JSON.parse(localStorage.getItem(metaKey)||'{}')};}catch{meta.dirty=true;}
  const persist=()=>localStorage.setItem(metaKey,JSON.stringify(meta));
  const stamp=value=>value?new Date(value).toLocaleString('ar-EG',{numberingSystem:'latn'}):'—';
  const set=(next,text)=>{state=next;message=text;decorate();};
  async function api(path,options={}){
    const scoped=path==='/api/config'?path:base+path.slice('/api'.length);
    const response=await fetch(scoped,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(options.method==='PUT'?60000:10000),...options});
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
    if(!document.querySelector('#profile-button')&&button?.insertAdjacentElement){const picker=document.createElement('button');picker.id='profile-button';picker.className='btn btn-small profile-switcher';picker.dataset.cloudAction='profiles';button.insertAdjacentElement('afterend',picker);}
    const picker=document.querySelector('#profile-button');if(picker)picker.textContent=`الملف: ${ctx.getDB().profile?.name||account.selected.name} ▾`;
    if(session?.role==='owner'&&!document.querySelector('#doctor-share-button')){const toolbar=document.querySelector('.feature-toolbar>div');if(toolbar){const share=document.createElement('button');share.id='doctor-share-button';share.className='btn btn-small';share.dataset.cloudAction='doctor-shares';share.textContent='مشاركة للطبيب';toolbar.append(share);}}
    if(session?.role!=='owner')document.querySelector('#doctor-share-button')?.remove();
  }
  function applyRemote(remote){
    ctx.apply(validateBackup(remote.data||{schemaVersion:1,profile:{name:''},results:[],medications:[],documents:[],trash:[]}));
    meta={revision:remote.revision,dirty:false,updatedAt:remote.updatedAt};persist();set('ready','متزامن مع حسابك');ctx.render();
  }
  async function uploadDocuments(snapshot){
    for(const doc of snapshot.documents||[]){
      const path=`/api/documents/${doc.id}`,head=await fetch(base+path.slice('/api'.length),{method:'HEAD',redirect:'error',cache:'no-store'});
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
      if(!stopped){meta.dirty=true;persist();}
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
    const body=`<div class="modal-body"><p>${ctx.e(message)}</p><div class="details-list"><div><strong>هذا الجهاز</strong><span>${counts(ctx.getDB())}</span></div><div><strong>آخر مزامنة</strong><span>${ctx.e(stamp(meta.updatedAt))}</span></div>${conflict?`<div><strong>نسخة السحابة</strong><span>${counts(remoteConflict?.data)}<br>${ctx.e(stamp(remoteConflict?.updatedAt))}</span></div>`:''}</div><p>النتائج والأدوية متاحة لأجهزتك بعد تسجيل الدخول. ملفات PDF تُرفع إلى مخزن خاص. يحتفظ الخادم بآخر 30 نسخة سابقة للسجل.</p>${conflict?'<p class="storage-warning">توقف الحفظ للسحابة لحماية تعديلات الجهازين. نزّل نسخة هذا الجهاز، ثم اختار النسخة التي تريد اعتمادها. اعتماد السحابة يحفظ أيضًا نسخة استرجاع محلية من تعديلاتك.</p>':''}${state==='setup'?'<p>المشروع جاهز، وتفعيل حماية الدخول لم يكتمل بعد. السجل السحابي مقفول لحين إتمامه.</p>':''}</div>`;
    const footer=`<button class="btn" data-cloud-action="download">تنزيل بيانات هذا الجهاز</button>${conflict?'<button class="btn" data-cloud-action="use-cloud">اعتماد نسخة السحابة</button><button class="btn btn-primary" data-cloud-action="use-local">اعتماد نسخة هذا الجهاز</button>':'<button class="btn btn-primary" data-cloud-action="retry">مزامنة الآن</button>'}${localStorage.getItem(recoveryKey)?'<button class="btn" data-cloud-action="recovery">نسخة ما قبل حل التعارض</button>':''}<a class="btn" href="/cdn-cgi/access/login">تجديد الدخول</a>`;
    const accountInfo=`<section class="account-session"><h3>حسابي</h3><dl class="details-list"><div><dt>الإيميل</dt><dd dir="ltr">${ctx.e(session?.email||'تعذّر قراءة الحساب')}</dd></div><div><dt>الملف الصحي</dt><dd>${ctx.e(ctx.getDB().profile?.name||account.selected.name)}</dd></div><div><dt>صلاحيتك في الملف</dt><dd>${{owner:'صاحب الملف',editor:'قراءة وتعديل',viewer:'قراءة فقط'}[session?.role]||'غير متاحة'}</dd></div><div><dt>بداية الجلسة</dt><dd>${ctx.e(stamp(session?.issuedAt))}</dd></div><div><dt>انتهاء الجلسة</dt><dd>${ctx.e(stamp(session?.expiresAt))}</dd></div></dl><p class="small-help">المواعيد بتوقيت جهازك. الموعد يخص الجلسة الحالية؛ تغيير مدة الجلسة لا يمدد رمزًا صدر سابقًا.</p>${session?.role==='viewer'?'<p>تقدر تشوف النتائج والمنحنيات والمرفقات وتصدّر نسخة، بدون تعديل أو رفع ملفات.</p>':''}<button class="btn" data-cloud-action="profiles">ملفاتي الصحية</button>${session?.role==='owner'?'<button class="btn" data-cloud-action="roles">مشاركة هذا الملف</button>':''}</section>`;
    ctx.openModal('حسابي والمزامنة',body.replace('<div class="modal-body">',`<div class="modal-body">${accountInfo}`),footer.replace('<button class="btn btn-primary" data-cloud-action="use-local">',`<button class="btn btn-primary" data-cloud-action="use-local" ${canEdit()?'':'disabled'}>`));
  }
  const canSwitch=()=>{if(busy||meta.dirty||state==='conflict'){ctx.toast('انتظر مزامنة التغييرات أو نزّل نسخة قبل تبديل الملف.');return false;}return true;};
  function switchProfile(id){
    if(!canSwitch())return;
    const url=new URL(location.href);url.searchParams.set('profile',id);url.hash='overview';location.assign(url.href);
  }
  async function profilesPanel(){
    const data=await cloudRequest('/api/profiles');account.profiles=data.profiles;
    const labels={owner:'ملفي · أستطيع المشاركة',editor:'مشارك معي · قراءة وتعديل',viewer:'مشارك معي · قراءة فقط'};
    ctx.openModal('ملفاتي الصحية',`<div class="modal-body"><p>كل ملف له نتائج وأدوية ومرفقات مستقلة. لا تظهر لك إلا ملفاتك والملفات التي شاركها أصحابها معك.</p><label class="field"><span>الملف الصحي</span><select class="select" id="cloud-profile-choice">${data.profiles.map(p=>`<option value="${ctx.e(p.id)}" ${p.id===account.selected.id?'selected':''}>${ctx.e(p.name||'ملف صحي')} — ${labels[p.role]}</option>`).join('')}</select></label><button class="btn btn-primary" data-cloud-action="switch-profile">فتح الملف المختار</button><hr><form id="cloud-profile-form"><label class="field"><span>إضافة ملف لشخص آخر أو لنفسك</span><input name="name" required maxlength="120" placeholder="اسم صاحب الملف"></label><p class="small-help">يبدأ الملف فاضيًا، ويكون خاصًا بك حتى تشاركه مع إيميل آخر.</p><button type="submit" class="btn">إنشاء ملف مستقل</button></form></div><div class="modal-footer"><button class="btn" data-cloud-action="panel">رجوع لحسابي</button></div>`);
  }
  async function rolesPanel(){
    const data=await api('/api/roles');
    ctx.openModal('مشاركة الملف الصحي',`<form id="cloud-role-form"><div class="modal-body"><p>هذا الملف خاص بك. شاركه بإيميل محدد بصلاحية قراءة أو تعديل. الإيميلات الأخرى لا تراه، والسماح بالدخول للموقع عبر Cloudflare وحده لا يشارك أي ملف. الإيميل المدعو يحتاج السماح له بالدخول في Cloudflare Access أيضًا.</p><div class="details-list"><div><strong dir="ltr">${ctx.e(data.owner)}</strong><span>صاحب الملف</span></div>${data.roles.filter(r=>r.email!==data.owner).map(r=>`<div><strong dir="ltr">${ctx.e(r.email)}</strong><span>${r.role==='editor'?'قراءة وتعديل':'قراءة فقط'}</span><button class="btn btn-small" type="button" data-cloud-action="unshare" data-email="${ctx.e(r.email)}">إلغاء المشاركة</button></div>`).join('')}</div><label class="field"><span>الإيميل</span><input name="email" type="email" required maxlength="254" dir="ltr" autocomplete="off"></label><label class="field"><span>الصلاحية</span><select name="role" class="select"><option value="viewer">قراءة فقط</option><option value="editor">قراءة وتعديل</option></select></label><p>الصلاحية تخص الملف المفتوح فقط. إلغاء المشاركة يمنع الوصول إليه في الطلب التالي للخادم.</p></div><div class="modal-footer"><button class="btn btn-primary" type="submit">حفظ الصلاحية</button><button class="btn" type="button" data-cloud-action="panel">رجوع لحسابي</button></div></form>`);
  }
  async function doctorSharesPanel(){
    if(meta.dirty||busy||remoteConflict||stopped)throw new Error('انتظر اكتمال المزامنة وحل أي تعارض قبل إنشاء رابط للطبيب.');
    const data=await api('/api/shares'),dates=ctx.getDB().results.map(r=>r.date).sort(),now=Date.now()/1000;
    ctx.openModal('دعوة الطبيب كضيف',`<div class="modal-body"><p>ملف: <strong>${ctx.e(ctx.getDB().profile.name)}</strong>. الرابط يفتح عرض ضيف تفاعلي للقراءة فقط، بفلاتر ورسوم وتفاصيل للبيانات المختارة وقت إنشاء الرابط. لا يحتاج الطبيب حسابًا، ولا يفتح ملفات أشخاص آخرين أو مرفقات PDF الأصلية.</p><form id="doctor-share-form"><label class="field"><span>وصف الرابط (اختياري)</span><input name="label" maxlength="80" placeholder="مثال: زيارة متابعة"></label><div class="form-grid"><label class="field"><span>من</span><input type="date" name="from" value="${dates[0]||''}" required></label><label class="field"><span>إلى</span><input type="date" name="to" value="${dates.at(-1)||''}" required></label><label class="field"><span>المحتوى</span><select class="select" name="mode"><option value="all">كل النتائج والمنحنيات في الفترة</option><option value="latest">أحدث زيارة داخل الفترة فقط</option></select></label><label class="field"><span>صلاحية الرابط</span><select class="select" name="hours"><option value="24">24 ساعة</option><option value="72" selected>3 أيام</option><option value="168">7 أيام</option></select></label></div><label class="checkbox-field"><input type="checkbox" name="includeName" checked><span>مشاركة اسم صاحب الملف</span></label><label class="checkbox-field"><input type="checkbox" name="alerts"><span>مشاركة التنبيهات المثبتة في الرئيسية (كل التواريخ، مع الطبيب والتاريخ)</span></label><label class="checkbox-field"><input type="checkbox" name="medications"><span>مشاركة أدوية الروشتات والطبيب وتاريخ الكتابة والتعليمات، وفترات التناول المسجلة</span></label><label class="checkbox-field"><input type="checkbox" name="clinical"><span>مشاركة تفاصيل الزيارات والتشخيصات وطلبات الفحوصات والملاحظات في الفترة</span></label><label class="checkbox-field"><input type="checkbox" name="undated"><span>تضمين الروشتات والزيارات غير المؤرخة ضمن الاختيارات السابقة</span></label><label class="checkbox-field"><input type="checkbox" name="consent" required><span>أوافق على إنشاء رابط للبيانات المختارة. أي شخص معه الرابط يستطيع قراءتها حتى انتهاء المدة أو إلغائه، وقد يحتفظ بنسخة PDF.</span></label><button type="submit" class="btn btn-primary" ${dates.length?'':'disabled'}>إنشاء الرابط للبيانات المختارة</button></form><h3>الروابط السابقة</h3>${data.shares.map(s=>`<div class="doctor-share-row"><strong>${ctx.e(s.label)}</strong><small>${s.revoked_at?'ملغي':s.expires_at<=now?'منتهي':'فعّال'} · ينتهي ${ctx.e(stamp(new Date(s.expires_at*1000).toISOString()))}</small>${!s.revoked_at&&s.expires_at>now?`<button class="btn btn-small" data-cloud-action="revoke-doctor-share" data-id="${ctx.e(s.id)}">إلغاء الرابط</button>`:''}</div>`).join('')||'<p>لا توجد روابط مشاركة.</p>'}</div><div class="modal-footer"><button class="btn" data-cloud-action="panel">رجوع لحسابي</button></div>`);
  }
  document.addEventListener('submit',async event=>{
    if(event.target.id==='doctor-share-form'){
      event.preventDefault();const button=event.target.querySelector('[type="submit"]');button.disabled=true;
      try{
        if(meta.dirty||busy||remoteConflict||stopped)throw new Error('انتظر اكتمال المزامنة قبل إنشاء الرابط.');
        const fields=Object.fromEntries(new FormData(event.target)),data=await api('/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,hours:Number(fields.hours),includeName:Boolean(fields.includeName),medications:Boolean(fields.medications),alerts:Boolean(fields.alerts),clinical:Boolean(fields.clinical),undated:Boolean(fields.undated),consent:Boolean(fields.consent)})});
        ctx.openModal('رابط الضيف جاهز',`<div class="modal-body"><p>تم إنشاء نسخة من ${data.results} نتيجة، تنتهي ${ctx.e(stamp(data.expiresAt))}.</p><label class="field"><span>انسخ الرابط وأرسله للطبيب</span><textarea id="doctor-share-url" readonly dir="ltr">${ctx.e(data.url)}</textarea></label><p>الرابط يظهر هنا مرة واحدة. لا تشاركه إلا مع الشخص المقصود. إلغاؤه يمنع فتحه لاحقًا، لكنه لا يسحب نسخة احتفظ بها الطبيب.</p><button class="btn btn-primary" data-cloud-action="copy-doctor-share">نسخ الرابط</button></div><div class="modal-footer"><button class="btn" data-cloud-action="doctor-shares">إدارة الروابط</button></div>`);
      }catch(error){ctx.toast(error.message);}finally{button.disabled=false;}return;
    }
    if(event.target.id==='cloud-profile-form'){
      event.preventDefault();if(!canSwitch())return;const button=event.target.querySelector('[type="submit"]');button.disabled=true;
      try{const created=await cloudRequest('/api/profiles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});switchProfile(created.id);}catch(error){ctx.toast(error.message);button.disabled=false;}return;
    }
    if(event.target.id!=='cloud-role-form')return;
    event.preventDefault();const button=event.target.querySelector('[type="submit"]');button.disabled=true;
    try{await api('/api/roles',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});await rolesPanel();ctx.toast('تم حفظ الصلاحية.');}catch(error){ctx.toast(error.message);}finally{button.disabled=false;}
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-cloud-action]');if(!button)return;
    const action=button.dataset.cloudAction;
    if(action==='doctor-shares'){try{await doctorSharesPanel();}catch(error){ctx.toast(error.message);}return;}
    if(action==='revoke-doctor-share'){try{await api('/api/shares',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:button.dataset.id})});await doctorSharesPanel();ctx.toast('تم إلغاء الرابط.');}catch(error){ctx.toast(error.message);}return;}
    if(action==='copy-doctor-share'){const field=document.querySelector('#doctor-share-url');try{await navigator.clipboard.writeText(field.value);ctx.toast('تم نسخ الرابط.');}catch{field.focus();field.select();ctx.toast('حدّد الرابط وانسخه يدويًا.');}return;}
    if(action==='profiles'){try{await profilesPanel();}catch(error){ctx.toast(error.message);}return;}
    if(action==='switch-profile'){const id=document.querySelector('#cloud-profile-choice')?.value;if(account.profiles.some(p=>p.id===id))switchProfile(id);return;}
    if(action==='unshare'){try{await api('/api/roles',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:button.dataset.email})});await rolesPanel();ctx.toast('تم إلغاء مشاركة هذا الملف.');}catch(error){ctx.toast(error.message);}return;}
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
