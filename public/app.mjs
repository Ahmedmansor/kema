import { TESTS, GROUPS, SCHEMA_VERSION, meta, validateResult, validateMedication, status, reference, series, parseCSV, toCSV, validateBackup, mergeRecords, fingerprint, timeDomain } from './core.mjs';
import { createEnhancements } from './enhancements.mjs';
import { createCloudSync } from './cloud.mjs';
import { prepareCloudAccount } from './profiles.mjs';
import { configureDocumentScope } from './documents.mjs';

const cloudMode=Boolean(document.querySelector('meta[name="kema-cloud"]'));
const account=cloudMode?await prepareCloudAccount().catch(error=>({error:error.message})):null;
const KEY = cloudMode?(account.scope?account.scope+'.health':'kema.cloud.locked'):'kema.health.v1';
if(cloudMode&&account.scope)configureDocumentScope(account.scope,account.base);
const $ = (s, root=document) => root.querySelector(s);
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  chart:'<path d="M4 3v17h17M7 14l4-5 4 3 6-7"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"/>',
  pill:'<path d="m10 4-6 6a6 6 0 0 0 8 8l6-6a6 6 0 0 0-8-8ZM8 8l8 8"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  arrow:'<path d="M19 12H5m6-6-6 6 6 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  edit:'<path d="m16 3 5 5-12 12-6 1 1-6zM14 5l5 5"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  drop:'<path d="M12 2s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13ZM8 15a4 4 0 0 0 4 4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  chevron:'<path d="m14 6-6 6 6 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.file}</svg>`;
const dateFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'});
const monthFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {month:'short', year:'2-digit', timeZone:'UTC'});
const date = d => d ? dateFmt.format(new Date(d+'T00:00:00Z')) : 'غير مسجل';
const num = value => new Intl.NumberFormat('en-US', {maximumFractionDigits:4,useGrouping:false}).format(value);
const badge = r => { const s = status(r); return `<span class="badge ${s.type}"><span aria-hidden="true">${s.symbol}</span> ${s.label}</span>`; };
let db = {schemaVersion:SCHEMA_VERSION, profile:{name:''}, results:[], medications:[]};
const ui = { test:'hba1c', group:'sugar', unit:'', range:'all', point:null, archive:{q:'',group:'all',state:'all',from:'',to:'',page:1}, storageError:'', pendingImport:null };
let toastTimer, returnFocus, lastStored = null, recoveryRequired = false, cloud=null;
const navItems = [['overview','grid','نظرة عامة'],['trends','chart','متابعة التحاليل'],['archive','file','سجل النتائج'],['medications','pill','الأدوية']];
const route = () => navItems.some(n=>n[0]===location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
const writeActions=new Set(['profile','add-result','edit-result','delete-result','add-med','edit-med','delete-med','confirm-delete','confirm-import','new-report','add-report-row','remove-report-row','attach-document','restore-item','undo-delete','import-enhanced']);
const writeForms=new Set(['result-form','med-form','profile-form','report-form','attach-form','review-form']);
const canWrite=()=>!cloudMode||Boolean(cloud?.canEdit());
function applyPermissions(){
  if(!cloudMode)return;
  const readonly=!canWrite();document.body.classList.toggle('read-only',readonly);
  document.querySelectorAll('[data-action]').forEach(node=>{if(writeActions.has(node.dataset.action))node.toggleAttribute('data-permission-hidden',readonly);});
  document.querySelectorAll('#import-file').forEach(node=>{node.disabled=readonly;node.closest('label')?.toggleAttribute('data-permission-hidden',readonly);});
  document.querySelectorAll('form').forEach(form=>{if(writeForms.has(form.id))form.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(node=>{if(readonly&&!node.disabled){node.disabled=true;node.dataset.roleDisabled='1';}else if(!readonly&&node.dataset.roleDisabled){node.disabled=false;delete node.dataset.roleDisabled;}});});
}
if(cloudMode){
  document.addEventListener('click',event=>{const node=event.target.closest('[data-action]');if(!canWrite()&&node&&writeActions.has(node.dataset.action)){event.preventDefault();event.stopImmediatePropagation();toast('حسابك للقراءة فقط.');}},true);
  document.addEventListener('submit',event=>{if(!canWrite()&&writeForms.has(event.target.id)){event.preventDefault();event.stopImmediatePropagation();toast('حسابك للقراءة فقط.');}},true);
  document.addEventListener('change',event=>{if(!canWrite()&&event.target.id==='import-file'){event.preventDefault();event.stopImmediatePropagation();}},true);
  new MutationObserver(applyPermissions).observe(document.body,{childList:true,subtree:true});
}
const additions=createEnhancements({getDB:()=>db,save,render,openModal,closeModal,toast,e,icon,date,num,download,testName,testsAvailable,details,ui,KEY,chartFor:(rows,testId)=>{const prior={test:ui.test,unit:ui.unit};try{ui.test=testId;ui.unit=rows[0]?.unit||'';return chartSVG(rows);}finally{Object.assign(ui,prior);}}});

function toast(message) {
  $('#toast').textContent=message; $('#toast').classList.add('toast-visible');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('toast-visible'),4500);
}
function save(next, {recover=false} = {}) {
  if(!canWrite()){ui.storageError='حسابك للقراءة فقط؛ لا يمكن تعديل السجل.';toast(ui.storageError);return false;}
  try {
    if(recoveryRequired&&!recover)throw new Error('استعد نسخة سليمة من شاشة النسخ الاحتياطي قبل تعديل السجل. البيانات الأصلية لم تُمس.');
    if(localStorage.getItem(KEY)!==lastStored)throw new Error('السجل تغيّر في نافذة أخرى. أعد تحميل الصفحة قبل الحفظ لحماية آخر التعديلات.');
    const serialized=JSON.stringify(next);localStorage.setItem(KEY, serialized);lastStored=serialized;db=next;recoveryRequired=false;ui.storageError='';$('#save-state').textContent='محفوظ على هذا المتصفح';cloud?.schedule();return true;
  }
  catch(error) { ui.storageError=error.message.includes('السجل')||error.message.includes('نسخة سليمة')?error.message:'تعذّر حفظ التغييرات في المتصفح. صدّر نسخة احتياطية وتأكد من وجود مساحة وأن الحفظ مسموح.';$('#save-state').textContent='تعذّر الحفظ';toast(ui.storageError);return false; }
}
function heading(title,subtitle,actions='') {
  return `<div class="page-heading"><div><div class="eyebrow" lang="en" dir="ltr">YOUR HEALTH, IN PERSPECTIVE</div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}
const addButton = `<button class="btn btn-primary" data-action="add-result">${icon('plus')} إضافة نتيجة</button>`;
const backupButton = `<button class="btn" data-action="backup">${icon('download')} نسخة احتياطية</button>`;
function testsAvailable() {
  return [...new Set([...Object.keys(TESTS),...db.results.map(r=>r.testId)])].map(id=>({id,...meta(id),name:db.results.find(r=>r.testId===id)?.name || meta(id).name,group:db.results.find(r=>r.testId===id)?.group || meta(id).group}));
}
function testName(id) { return testsAvailable().find(t=>t.id===id)?.name || id; }
function availableUnits(id) { return [...new Set(db.results.filter(r=>r.testId===id).map(r=>r.unit))]; }
function currentSeries() {
  const units=availableUnits(ui.test); if(!units.includes(ui.unit)) ui.unit=series(db.results,ui.test).at(-1)?.unit || meta(ui.test).unit;
  const all=series(db.results,ui.test,ui.unit);
  if(ui.range==='all'||!all.length) return all;
  const cutoff=new Date(all.at(-1).date+'T00:00:00Z');cutoff.setUTCMonth(cutoff.getUTCMonth()-Number(ui.range));
  return all.filter(r=>r.date>=cutoff.toISOString().slice(0,10));
}
function sparkline(rows, color='#147d70') {
  if(rows.length<2) return '<div class="sparkline"></div>';
  const values=rows.map(r=>r.value), min=Math.min(...values), max=Math.max(...values), domain=timeDomain(rows);
  const points=rows.map(r=>`${4+(Date.parse(r.date+'T00:00:00Z')-domain.min)/(domain.max-domain.min)*172},${27-(r.value-min)/(max-min||1)*23}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 180 31" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>`;
}
function statCard(testId) {
  const r=series(db.results,testId).at(-1), rows=r?series(db.results,testId,r.unit):[];
  if(!r) return `<button class="stat-card" data-action="trend" data-test="${e(testId)}"><div class="stat-top"><span class="stat-name">${e(meta(testId).name)}</span></div><div class="stat-value"><strong>—</strong></div><small>لم تُضف نتائج بعد</small></button>`;
  const s=status(r), prev=rows.at(-2), diff=prev?r.value-prev.value:null;
  return `<button class="stat-card" data-action="trend" data-test="${e(testId)}" aria-label="متابعة ${e(r.name)}، آخر نتيجة ${r.value} ${e(r.unit)} بتاريخ ${date(r.date)}"><div class="stat-top"><span class="stat-name">${e(meta(testId).name)}</span><span class="stat-icon ${s.type==='high'?'amber':''}">${icon(testId==='triglycerides'?'heart':'drop')}</span></div><div class="stat-date">${icon('calendar')} ${date(r.date)}</div><div class="stat-value"><strong>${num(r.value)}</strong><span class="unit">${e(r.unit)}</span></div>${sparkline(rows,s.type==='high'?'#ae7b35':'#147d70')}<div class="stat-bottom">${badge(r)}<span>${diff===null?'أول قياس':`${diff>0?'↑':diff<0?'↓':'—'} ${num(Math.abs(diff))} عن السابق`}</span></div></button>`;
}
function medicationsAside() {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const ongoing=db.medications.filter(m=>m.start<=today&&(!m.end||m.end>=today));
  return `<div class="aside-column"><section class="panel side-card"><h2>العلاج في الصورة</h2><p class="panel-subtitle">سجّل الأدوية بجانب نتائجك</p>${db.medications.length?`<div class="details-list" style="margin-top:20px">${(ongoing.length?ongoing:db.medications.slice(-2)).slice(0,3).map(m=>`<div><strong>${e(m.name)}</strong><span class="small-help">${e(m.dose)||'الجرعة غير مسجلة'}<br>${date(m.start)} — ${m.end?date(m.end):'مستمر'}</span></div>`).join('')}</div><a class="text-button" href="#medications">عرض سجل الأدوية ${icon('arrow')}</a>`:`<div class="empty-med"><div class="empty-icon">${icon('pill')}</div><strong>سجل الأدوية لسه فاضي</strong><p>أضف الدواء والجرعة وفترة الاستخدام، وشوفها مع منحنى التحاليل.</p><button class="btn btn-soft" data-action="add-med">${icon('plus')} إضافة أول دواء</button></div>`}</section><section class="info-card">${icon('shield')}<h3>بياناتك، على جهازك</h3><p>سجلّك محفوظ في هذا المتصفح. نزّل نسخة احتياطية قبل تغيير الجهاز أو مسح بيانات المتصفح.</p><button class="text-button" data-action="backup">إدارة النسخ الاحتياطي ${icon('arrow')}</button></section><div class="last-update"><span>أحدث نتيجة مسجلة</span><strong>${db.results.length?date([...db.results].sort((a,b)=>a.date.localeCompare(b.date)).at(-1).date):'—'}</strong></div></div>`;
}
function chartPanel() {
  const available=testsAvailable().filter(t=>ui.group==='all'||t.group===ui.group);
  if(!available.some(t=>t.id===ui.test)) ui.test=available[0]?.id || 'hba1c';
  const rows=currentSeries(), last=rows.at(-1), units=availableUnits(ui.test);
  return `<section class="panel" id="chart-panel"><div class="panel-header"><div><h2>كل نتيجة بتحكي جزء من الصورة</h2><p class="panel-subtitle">تابع التغيّر عبر الوقت، قياسًا بعد قياس</p></div><span class="badge">${rows.length} قياسات</span></div><div class="chart-tabs" role="group" aria-label="مجموعة التحاليل">${Object.entries(GROUPS).filter(([id])=>id!=='other'||db.results.some(r=>r.group==='other')).map(([id,name])=>`<button class="chip ${ui.group===id?'active':''}" aria-pressed="${ui.group===id}" data-action="chart-group" data-group="${id}">${name}</button>`).join('')}</div><div class="chart-controls"><label>التحليل <select class="select" id="chart-test">${available.map(t=>`<option value="${e(t.id)}" ${t.id===ui.test?'selected':''}>${e(t.name)} · ${e(t.short)}</option>`).join('')}</select></label><label>الفترة <select class="select" id="chart-range"><option value="all" ${ui.range==='all'?'selected':''}>كل الفترات</option><option value="12" ${ui.range==='12'?'selected':''}>آخر 12 شهرًا</option><option value="6" ${ui.range==='6'?'selected':''}>آخر 6 أشهر</option></select></label>${units.length>1?`<label>الوحدة <select class="select" id="chart-unit">${units.map(u=>`<option ${u===ui.unit?'selected':''}>${e(u)}</option>`).join('')}</select></label>`:''}</div><div class="chart-title"><div><strong>${e(testName(ui.test))}</strong><div class="chart-key">${e(meta(ui.test).short)}${units.length>1?' · كل وحدة في منحنى مستقل':''}</div></div><div class="chart-latest" dir="ltr">${last?num(last.value):'—'} <span class="unit">${e(ui.unit)}</span></div></div><div class="chart">${chartSVG(rows)}</div><div id="chart-details">${pointDetails(rows.find(r=>r.id===ui.point)||last)}</div>${medStrip(rows)}<div class="chart-foot"><div class="legend"><span><i></i> مرجع آخر تقرير${last?` <bdi>${reference(last)}</bdi>`:''}</span><span><i class="med-key"></i> فترة دواء</span></div><span>المس النقطة للتفاصيل</span></div></section>`;
}
function chartSVG(rows) {
  if(!rows.length) return '<div class="chart-empty">لا توجد نتائج في هذه الفترة.<br>أضف نتيجة أو اختر تحليلًا آخر.</div>';
  const compact=window.innerWidth<600;
  const domain=timeDomain(rows), W=compact?Math.max(280,window.innerWidth-62):800,H=compact?245:275,L=compact?36:49,R=compact?14:23,T=28,B=45;
  const last=rows.at(-1), values=rows.map(r=>r.value);
  if(last.refMin!==null) values.push(last.refMin);
  if(last.refMax!==null) values.push(last.refMax);
  const minVal=Math.min(...values),maxVal=Math.max(...values),pad=(maxVal-minVal)*.18||1;
  const yMin=Math.max(0,minVal-pad),yMax=maxVal+pad;
  const x=d=>L+(Date.parse(d+'T00:00:00Z')-domain.min)/(domain.max-domain.min)*(W-L-R);
  const y=v=>H-B-(v-yMin)/(yMax-yMin)*(H-T-B);
  const ticks=Array.from({length:5},(_,i)=>yMin+(yMax-yMin)*i/4);
  const minRef=last.refMin===null?yMin:Math.max(yMin,last.refMin),maxRef=last.refMax===null?yMax:Math.min(yMax,last.refMax);
  const group=db.results.find(r=>r.testId===ui.test)?.group||meta(ui.test).group;
  const meds=db.medications.filter(m=>(m.group==='all'||m.group===group)&&Date.parse(m.start+'T00:00:00Z')<=domain.max&&(!m.end||Date.parse(m.end+'T00:00:00Z')>=domain.min));
  const tickCount=compact?3:5;
  return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="منحنى ${e(testName(ui.test))}. ${rows.length} قياسات. القيم التفصيلية متاحة في جدول القياسات."><title>${e(testName(ui.test))}: ${rows.map(r=>`${r.date}: ${r.value}`).join('، ')}</title><defs><clipPath id="plot-clip"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs><g clip-path="url(#plot-clip)">${last.refMin!==null||last.refMax!==null?`<rect x="${L}" y="${y(maxRef)}" width="${W-L-R}" height="${Math.max(0,y(minRef)-y(maxRef))}" fill="#edf6f0"/>`:''}${meds.map(m=>{const mx=Math.max(L,x(m.start)),end=m.end?x(m.end):W-R;return `<rect x="${mx}" y="${T}" width="${Math.max(0,Math.min(W-R,end)-mx)}" height="${H-T-B}" fill="#bba2d5" opacity=".16"><title>${e(m.name)}: ${m.start} — ${m.end||'مستمر'}</title></rect>`;}).join('')}</g>${ticks.map(v=>`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="#e0e9e7" stroke-dasharray="3 5"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end" fill="#60737c" font-size="12" font-family="Segoe UI,Arial">${num(Math.round(v*10)/10)}</text>`).join('')}${Array.from({length:tickCount},(_,i)=>{const t=domain.min+(domain.max-domain.min)*i/(tickCount-1);const xx=L+(W-L-R)*i/(tickCount-1);return `<text x="${xx}" y="${H-14}" text-anchor="${i===0?'start':i===tickCount-1?'end':'middle'}" fill="#60737c" font-family="Segoe UI,Tahoma" font-size="12">${e(monthFmt.format(t))}</text>`;}).join('')}<polyline points="${rows.map(r=>`${x(r.date)},${y(r.value)}`).join(' ')}" fill="none" stroke="#147d70" stroke-width="2.8" stroke-linejoin="round"/>${rows.map(r=>`<circle class="point" data-action="chart-point" data-id="${e(r.id)}" tabindex="0" role="button" aria-label="${date(r.date)}، ${num(r.value)} ${e(r.unit)}، ${status(r).label}" cx="${x(r.date)}" cy="${y(r.value)}" r="5" fill="${status(r).type==='high'?'#bf8646':status(r).type==='low'?'#4b84bb':'#fff'}" stroke="${status(r).type==='high'?'#9a692b':status(r).type==='low'?'#376ea1':'#147d70'}"><title>${date(r.date)} · ${r.value} ${e(r.unit)} · ${e(r.lab)}</title></circle>`).join('')}</svg>`;
}
function pointDetails(r) {
  if(!r) return '';
  return `<div class="chart-details"><div><strong>${date(r.date)}</strong><small>${e(r.lab)||'المعمل غير مسجل'} · المرجع <bdi>${reference(r)}</bdi></small></div><div class="selected-value"><strong dir="ltr">${num(r.value)} <span class="unit">${e(r.unit)}</span></strong>${badge(r)}</div></div>`;
}
function medStrip(rows) {
  if(!rows.length)return '';
  const group=db.results.find(r=>r.testId===ui.test)?.group||meta(ui.test).group;
  const meds=db.medications.filter(m=>(m.group==='all'||m.group===group)&&m.start<=rows.at(-1).date&&(!m.end||m.end>=rows[0].date));
  return meds.length?`<div class="med-strip">${meds.map(m=>`<span>${e(m.name)} · ${e(m.dose)} · ${date(m.start)} — ${m.end?date(m.end):'مستمر'}</span>`).join('')}</div>`:'';
}
function renderOverview() {
  const dates=[...new Set(db.results.map(r=>r.date))].sort();
  return `${heading('صورة أوضح، لمتابعة أهدأ', 'أهلًا بيك في سجلّك الصحي. كل تحاليلك، في مكان واحد.',backupButton+addButton)}<section class="welcome"><div class="welcome-text"><h2 class="welcome-title">${icon('heart')} ${db.profile.name?`سجل ${e(db.profile.name)}`:'رحلة صحتك تبدأ من هنا'}</h2><p>${dates.length?`متابعة متصلة من ${date(dates[0])} إلى ${date(dates.at(-1))}. ارجع لأي نتيجة، وشوف الصورة على مدار الوقت.`:'أضف أول نتيجة أو استورد ملفك لتبدأ متابعة تحاليلك.'}</p></div><div class="welcome-stats"><div class="welcome-stat"><strong>${db.results.length}</strong><small>نتيجة مسجّلة</small></div><div class="welcome-stat"><strong>${dates.length}</strong><small>تاريخ تحليل</small></div><div class="welcome-stat"><strong>${new Set(db.results.map(r=>r.testId)).size}</strong><small>نوع تحليل</small></div></div></section><div class="section-label"><h2>آخر النتائج، بنظرة واحدة</h2><span>مقارنة بآخر قياس لنفس الوحدة</span></div><div class="stats-grid">${['glucose_fasting','glucose_2hr','hba1c','triglycerides'].map(statCard).join('')}</div><div class="content-grid"><div>${chartPanel()}${recentPanel()}</div>${medicationsAside()}</div>`;
}
function recentPanel() {
  const dates=[...new Set(db.results.map(r=>r.date))].sort().reverse().slice(0,4);
  return `<section class="panel"><div class="panel-header"><div><h2>آخر محطات المتابعة</h2><p class="panel-subtitle">نتائجك مرتبة من الأحدث</p></div><a class="text-button" href="#archive">السجل الكامل ${icon('arrow')}</a></div><div class="table-wrap" tabindex="0" role="region" aria-label="أحدث تواريخ التحاليل"><table class="recent-table"><thead><tr><th scope="col">التاريخ</th><th scope="col">المعمل</th><th scope="col">النتائج</th><th scope="col">خارج المرجع</th><th scope="col">التفاصيل</th></tr></thead><tbody>${dates.map(d=>{const rs=db.results.filter(r=>r.date===d);const flagged=rs.filter(r=>['high','low'].includes(status(r).type)).length;return `<tr><td class="date-cell"><strong>${date(d)}</strong></td><td>${e([...new Set(rs.map(r=>r.lab).filter(Boolean))].join('، '))}</td><td>${rs.length} نتائج</td><td><span class="badge ${flagged?'high':'normal'}">${flagged?`${flagged} نتائج`:'لا يوجد'}</span></td><td><button class="icon-btn" data-action="date-archive" data-date="${d}" aria-label="عرض نتائج ${date(d)}">${icon('arrow')}</button></td></tr>`;}).join('')||'<tr><td colspan="5">لا توجد نتائج بعد.</td></tr>'}</tbody></table></div></section>`;
}
function renderTrends() {
  const tiles=testsAvailable().filter(t=>db.results.some(r=>r.testId===t.id));
  return `${heading('تطوّر نتائجك عبر الوقت','اختار التحليل، واستكشف كل قياس مع تاريخه وفترة العلاج.',addButton)}<div class="content-grid"><div>${chartPanel()}<div class="screen-note">${icon('info')}<span>الخط يربط القياسات المسجلة فقط، ولا يعبّر عن قياسات بين التواريخ. الفترات المحددة محسوبة من أحدث نتيجة للتحليل. تزامن العلاج مع تغيّر النتائج لا يثبت السببية.</span></div><section class="panel" style="margin-top:22px"><div class="panel-header"><h2>القياسات في الفترة المختارة</h2><button class="text-button" data-action="test-archive">فتح في السجل ${icon('arrow')}</button></div><div id="chart-table">${chartTable()}</div></section></div>${medicationsAside()}</div><h2 class="tile-section-title">كل تحاليلك</h2><div class="test-grid">${tiles.map(t=>{const rows=series(db.results,t.id,availableUnits(t.id)[0]),r=rows.at(-1);return `<button class="panel test-tile" data-action="trend" data-test="${e(t.id)}"><div class="tile-top"><strong>${e(t.name)}</strong>${badge(r)}</div><div class="tile-value"><b>${num(r.value)}</b><span class="unit">${e(r.unit)}</span></div><small> · ${rows.length} قياسات · ${date(r.date)}</small></button>`;}).join('')}</div>`;
}
function chartTable() {
  const rows=currentSeries().slice().reverse();
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="القيم التفصيلية للمنحنى"><table class="recent-table"><thead><tr><th scope="col">التاريخ</th><th scope="col">النتيجة</th><th scope="col">مرجع التقرير</th><th scope="col">الحالة</th><th scope="col">المعمل</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${date(r.date)}</td><td><bdi class="result-number">${num(r.value)}</bdi> <span class="unit">${e(r.unit)}</span></td><td><bdi>${reference(r)}</bdi></td><td>${badge(r)}</td><td>${e(r.lab)||'—'}</td></tr>`).join('')||'<tr><td colspan="5">لا توجد قياسات.</td></tr>'}</tbody></table></div>`;
}
function filteredResults() {
  const f=ui.archive,q=f.q.trim().toLowerCase();
  return db.results.filter(r=>(f.group==='all'||r.group===f.group)&&(f.state==='all'||status(r).type===f.state)&&(!f.from||r.date>=f.from)&&(!f.to||r.date<=f.to)&&(!q||[r.name,r.testId,meta(r.testId).short,r.lab,r.doctor,r.date,r.source,r.notes].some(v=>String(v).toLowerCase().includes(q)))).sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'ar'));
}
function renderArchive() {
  const f=ui.archive;
  return `${heading('سجلّك، بكل التفاصيل','كل نتيجة بتاريخها ومرجعها. تقدر تضيف، تراجع، وتعدّل في أي وقت.',`<button class="btn" data-action="backup">${icon('upload')} استيراد وتصدير</button>`+addButton)}<section class="panel"><div class="toolbar"><label class="search-field">${icon('search')}<span class="visually-hidden">ابحث باسم التحليل أو المعمل أو التاريخ</span><input type="search" id="archive-search" placeholder="ابحث عن تحليل، معمل، أو تاريخ…" value="${e(f.q)}"></label><label><span class="visually-hidden">تصنيف التحليل</span><select class="select" id="archive-group">${Object.entries(GROUPS).map(([id,name])=>`<option value="${id}" ${f.group===id?'selected':''}>${name}</option>`).join('')}</select></label><label><span class="visually-hidden">حالة النتيجة</span><select class="select" id="archive-state"><option value="all">كل الحالات</option>${[['normal','ضمن المرجع'],['high','أعلى من المرجع'],['low','أقل من المرجع'],['unknown','بلا مرجع']].map(([id,n])=>`<option value="${id}" ${f.state===id?'selected':''}>${n}</option>`).join('')}</select></label><label class="date-filter">من <input type="date" id="archive-from" value="${e(f.from)}"></label><label class="date-filter">إلى <input type="date" id="archive-to" value="${e(f.to)}"></label><button class="text-button" data-action="clear-filters">مسح الفلاتر</button></div><div id="records">${archiveRows()}</div></section><div class="screen-note">${icon('info')}<span>ملفات الـPDF الأصلية غير مرفقة في هذه النسخة؛ اسم الملف محفوظ للرجوع إليه. النسخة الاحتياطية تشمل النتائج والأدوية، ولا تشمل ملفات PDF.</span></div>`;
}
function archiveRows() {
  const rows=filteredResults(), pages=Math.max(1,Math.ceil(rows.length/10));ui.archive.page=Math.min(pages,Math.max(1,ui.archive.page));
  const start=(ui.archive.page-1)*10, visible=rows.slice(start,start+10);
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="جدول جميع نتائج التحاليل"><table class="recent-table"><thead><tr><th scope="col">التاريخ</th><th scope="col">التحليل</th><th scope="col">النتيجة</th><th scope="col">مرجع التقرير</th><th scope="col">الحالة</th><th scope="col">المعمل</th><th scope="col">المصدر</th><th scope="col">الإجراءات</th></tr></thead><tbody>${visible.map(r=>`<tr><td>${date(r.date)}</td><td><span class="result-name">${e(r.name)}</span><span class="result-code">${e(meta(r.testId).short)}</span></td><td><bdi class="result-number">${num(r.value)}</bdi> <span class="unit">${e(r.unit)}</span></td><td><bdi>${reference(r)}</bdi></td><td>${badge(r)}</td><td>${e(r.lab)||'—'}</td><td><span class="source-name">${e(r.source)||'إدخال يدوي'}</span></td><td><div class="row-actions"><button class="icon-btn" data-action="details" data-id="${e(r.id)}" aria-label="تفاصيل ${e(r.name)} في ${r.date}">${icon('file')}</button><button class="icon-btn" data-action="edit-result" data-id="${e(r.id)}" aria-label="تعديل ${e(r.name)} في ${r.date}">${icon('edit')}</button><button class="icon-btn danger" data-action="delete-result" data-id="${e(r.id)}" aria-label="حذف ${e(r.name)} في ${r.date}">${icon('trash')}</button></div></td></tr>`).join('')||'<tr><td colspan="8"><div class="empty-state"><strong>مفيش نتائج مطابقة</strong><p>جرّب تغيير البحث أو مسح الفلاتر.</p><button class="btn" data-action="clear-filters">مسح الفلاتر</button></div></td></tr>'}</tbody></table></div><div class="table-footer"><span role="status">${rows.length?`${start+1}–${Math.min(start+10,rows.length)} من ${rows.length} نتيجة`:'0 نتائج'}${db.results.length!==rows.length?` · الإجمالي ${db.results.length}`:''}</span><div class="pager"><button class="icon-btn" data-action="prev-page" aria-label="الصفحة السابقة" ${ui.archive.page===1?'disabled':''}><span style="display:flex;transform:rotate(180deg)">${icon('chevron')}</span></button><span>صفحة ${ui.archive.page} من ${pages}</span><button class="icon-btn" data-action="next-page" aria-label="الصفحة التالية" ${ui.archive.page===pages?'disabled':''}>${icon('chevron')}</button></div></div>`;
}
function renderMedications() {
  return `${heading('العلاج، على خطّ الزمن','الأدوية والجرعات وفترات الاستخدام، كما تسجّلها بنفسك.',`<button class="btn btn-primary" data-action="add-med">${icon('plus')} إضافة دواء</button>`)}${!db.medications.length?`<section class="panel empty-state"><div class="empty-icon">${icon('pill')}</div><h2>كل فترة علاج، لها مكان هنا</h2><p>أضف اسم الدواء والجرعة وتاريخ البداية. لو الدواء مستمر، سيب تاريخ النهاية فاضي.</p><button class="btn btn-primary" data-action="add-med">${icon('plus')} إضافة أول دواء</button></section>`:`<div class="med-grid">${db.medications.slice().sort((a,b)=>b.start.localeCompare(a.start)).map(m=>`<section class="panel med-card"><div class="med-head"><div><h2>${e(m.name)}</h2><p>${e(m.dose)||'الجرعة غير مسجلة'}</p></div><span class="badge ${m.end?'':'normal'}">${m.end?'فترة محددة':'مستمر'}</span></div><div class="med-dates"><div><span>البداية</span><strong>${date(m.start)}</strong></div><div><span>النهاية</span><strong>${m.end?date(m.end):'غير محددة'}</strong></div><div><span>يظهر مع</span><strong>${e(GROUPS[m.group])}</strong></div></div>${m.notes?`<p>${e(m.notes)}</p>`:''}<div class="med-actions"><button class="btn btn-small" data-action="edit-med" data-id="${e(m.id)}">${icon('edit')} تعديل</button><button class="btn btn-small danger" data-action="delete-med" data-id="${e(m.id)}">${icon('trash')} حذف</button></div></section>`).join('')}</div>`}<div class="screen-note">${icon('info')}<span>الفترات التي تضيفها ستظهر تلقائيًا على الرسوم المطابقة للتصنيف والتاريخ. سجلّ العلاج للتوثيق والمتابعة؛ لا يقدّم توصية بتغيير الجرعات.</span></div>`;
}
function render() {
  const current=route();
  $('#navigation').innerHTML=navItems.map(([id,ic,label])=>`<a class="nav-link ${current===id?'active':''}" href="#${id}" ${current===id?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></a>`).join('');
  $('#breadcrumb').textContent=navItems.find(n=>n[0]===current)[2];
  document.title=`${$('#breadcrumb').textContent} — Kema · Blood Tests`;
  $('.avatar').textContent=db.profile.name?db.profile.name[0]:'K';
  const screen={overview:renderOverview,trends:renderTrends,archive:renderArchive,medications:renderMedications};
  $('#main').innerHTML=`${ui.storageError?`<div class="storage-warning" role="alert">${e(ui.storageError)}</div>`:''}${screen[current]()}`;
  additions.decorate(current);
  if(cloudMode){const card=$('.info-card');if(card)card.innerHTML=`${icon('shield')}<h3>سجلك، معاك على أجهزتك</h3><p>نتائجك وأدويتك تتزامن مع حسابك الخاص. راجع مؤشر المزامنة قبل الانتقال لجهاز تاني، واحتفظ بنسخة احتياطية.</p><button class="text-button" data-cloud-action="panel">حسابي والمزامنة ${icon('arrow')}</button>`;}
  cloud?.decorate();
}
function updateChart() {
  const panel=$('#chart-panel');if(panel)panel.outerHTML=chartPanel();
  if($('#chart-table'))$('#chart-table').innerHTML=chartTable();
}
function updateArchive() { if($('#records')) $('#records').innerHTML=archiveRows(); }
function openModal(title,body,footer='') {
  const dialog=$('#modal');if(!dialog.open)returnFocus=document.activeElement;
  $('#modal-content').innerHTML=`<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="إغلاق">${icon('close')}</button></div>${body}${footer}`;
  if(!dialog.open)dialog.showModal();
}
function closeModal() { $('#modal').close(); }
$('#modal').addEventListener('close',()=>{ui.pendingImport=null;if(returnFocus?.isConnected)returnFocus.focus();else $('#main').focus({preventScroll:true});});
function inputField(name,label,value='',type='text',extra='') {return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${e(value)}" ${extra}></div>`;}
function resultForm(id) {
  const r=db.results.find(r=>r.id===id), tests=testsAvailable();
  const selected=r?.testId || ui.test || 'hba1c';
  openModal(r?'تعديل نتيجة التحليل':'إضافة نتيجة جديدة',`<form id="result-form" data-id="${e(id||'')}"><div class="modal-body"><div class="form-error" role="alert" id="form-error"></div><div class="form-grid"><div class="field full"><label for="f-testId">نوع التحليل</label><select class="select" name="testId" id="f-testId">${tests.map(t=>`<option value="${e(t.id)}" ${selected===t.id?'selected':''}>${e(t.name)} · ${e(t.short)}</option>`).join('')}<option value="__custom">+ تحليل آخر</option></select></div><div id="custom-fields" class="full" hidden><div class="form-grid">${inputField('customId','كود التحليل بالإنجليزية','','text','pattern="[a-z][a-z0-9_]*" placeholder="vitamin_d"')}${inputField('customName','اسم التحليل','','text','maxlength="120"')}<div class="field full"><label for="f-customGroup">التصنيف</label><select name="customGroup" id="f-customGroup" class="select">${Object.entries(GROUPS).filter(([id])=>id!=='all').map(([id,n])=>`<option value="${id}" ${id==='other'?'selected':''}>${n}</option>`).join('')}</select></div></div></div>${inputField('date','تاريخ التحليل',r?.date||'','date','required')}${inputField('value','النتيجة',r?.value??'','text','required inputmode="decimal" placeholder="مثال: 6.07"')}${inputField('unit','وحدة القياس',r?.unit||meta(selected).unit,'text','required maxlength="40"')}${inputField('lab','المعمل والفرع',r?.lab||'','text','maxlength="150"')}<div class="field full"><label>مرجع التقرير</label><small>اكتب المرجع كما هو. اترك الحدود غير الموجودة فارغة.</small></div>${inputField('refMin','الحد الأدنى',r?.refMin??'','text','inputmode="decimal"')}${inputField('refMax','الحد الأعلى',r?.refMax??'','text','inputmode="decimal"')}${inputField('doctor','الطبيب المعالج',r?.doctor||'','text','maxlength="150"')}${inputField('source','اسم ملف المصدر (اختياري)',r?.source||'','text','maxlength="200"')}<div class="field full"><label for="f-notes">ملاحظات</label><textarea name="notes" id="f-notes" maxlength="500">${e(r?.notes||'')}</textarea></div></div></div><div class="modal-footer"><button class="btn btn-primary" type="submit">${icon('check')} حفظ النتيجة</button><button class="btn" type="button" data-action="close-modal">إلغاء</button></div></form>`);
}
function medForm(id) {
  const m=db.medications.find(m=>m.id===id);
  openModal(m?'تعديل الدواء':'إضافة دواء',`<form id="med-form" data-id="${e(id||'')}"><div class="modal-body"><div class="form-error" id="form-error" role="alert"></div><div class="form-grid">${inputField('name','اسم الدواء',m?.name||'','text','required maxlength="150"')}${inputField('dose','الجرعة وطريقة الاستخدام',m?.dose||'','text','maxlength="150" placeholder="كما وصفها الطبيب"')}${inputField('start','تاريخ البداية',m?.start||'','date','required')}${inputField('end','تاريخ النهاية (فارغ لو مستمر)',m?.end||'','date')}<div class="field full"><label for="f-group">اعرض فترة الدواء مع</label><select class="select" name="group" id="f-group">${Object.entries(GROUPS).map(([id,n])=>`<option value="${id}" ${m?.group===id?'selected':''}>${n}</option>`).join('')}</select></div><div class="field full"><label for="f-notes">ملاحظات</label><textarea name="notes" id="f-notes" maxlength="500">${e(m?.notes||'')}</textarea></div></div></div><div class="modal-footer"><button class="btn btn-primary" type="submit">${icon('check')} حفظ الدواء</button><button type="button" class="btn" data-action="close-modal">إلغاء</button></div></form>`);
}
function backupModal() {
  openModal('النسخ الاحتياطي والاستيراد',`<div class="modal-body"><p>الحفظ هنا محلي على هذا المتصفح. النسخة الكاملة تنقل النتائج والأدوية واسم صاحب السجل لجهاز آخر.</p><div class="backup-option"><h3>نزّل نسخة من سجلّك</h3><p>${db.results.length} نتيجة · ${db.medications.length} أدوية. احتفظ بالملف في مكان خاص.</p><div class="backup-buttons"><button class="btn btn-primary" data-action="export-json">${icon('download')} نسخة كاملة JSON</button><button class="btn" data-action="export-csv">${icon('download')} نتائج CSV</button></div></div><div class="backup-option"><h3>استيراد نتائج أو استعادة نسخة</h3><p>ملف CSV بنفس تنسيق بياناتك الأصلية، أو نسخة JSON من Kema. هنراجع عدد السجلات قبل الحفظ، ونتجاهل النسخ المتطابقة.</p><label class="field"><span>اختر الملف</span><input type="file" id="import-file" accept=".json,.csv,application/json,text/csv"></label><div id="import-error" class="form-error" role="alert"></div></div><p class="small-help">صيغة CSV المطلوبة: Date, Test_ID, Result, Unit. أعمدة مرجع التقرير اختيارية. ملف CSV يحتوي على النتائج فقط.</p>${ui.storageError?'<button class="btn" data-action="export-raw">تنزيل البيانات المحلية الأصلية لاستعادتها</button>':''}</div>`);
  additions.augmentBackup();
}
function download(content,name,type) {
  const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('تم تجهيز الملف للتنزيل.');
}
async function prepareImport(file) {
  if(!file)return;
  try {
    if(file.size>10*1024*1024)throw new Error('الحد الأقصى لحجم الملف 10 ميجابايت.');
    const text=await file.text();
    const incoming=file.name.toLowerCase().endsWith('.csv')?{schemaVersion:1,profile:{name:''},results:parseCSV(text),medications:[]}:validateBackup(JSON.parse(text.replace(/^\uFEFF/,'')));
    const merged=mergeRecords(db.results,incoming.results),meds=mergeRecords(db.medications,incoming.medications,medFingerprint);
    ui.pendingImport=incoming;
    openModal('مراجعة الاستيراد',`<div class="modal-body"><p>الملف: <bdi>${e(file.name)}</bdi></p><div class="import-preview"><strong>${merged.added} نتائج جديدة · ${meds.added} أدوية جديدة</strong><div class="preview-details">سيتم تجاهل ${merged.skipped} نتائج و${meds.skipped} أدوية متطابقة. السجلات الحالية ستظل محفوظة.</div></div>${incoming.profile.name?`<label class="checkbox-field"><input type="checkbox" id="import-profile"><span>تحديث اسم صاحب السجل إلى ${e(incoming.profile.name)}</span></label>`:''}<p>لو نتيجة موجودة بنفس التاريخ لكن برقم مختلف، هتتضاف كقياس مستقل عشان تراجعها بنفسك.</p><div class="form-error" role="alert" id="import-error"></div></div>`,`<div class="modal-footer"><button class="btn btn-primary" data-action="confirm-import">${icon('check')} تأكيد الاستيراد</button><button class="btn" data-action="close-modal">إلغاء</button></div>`);
  } catch(error) { const el=$('#import-error'); if(el)el.textContent=error.message;else toast(error.message); }
}
const medFingerprint=m=>JSON.stringify([m.name,m.dose,m.start,m.end,m.group,m.notes]);
function details(id) {
  const r=db.results.find(r=>r.id===id);if(!r)return;
  openModal('تفاصيل نتيجة التحليل',`<div class="modal-body"><dl class="details-list">${[['التحليل',e(r.name)],['التاريخ',date(r.date)],['النتيجة',`<bdi>${num(r.value)} ${e(r.unit)}</bdi>`],['مرجع التقرير',`<bdi>${reference(r)}</bdi>`],['الحالة',badge(r)],['المعمل',e(r.lab)||'—'],['الطبيب',e(r.doctor)||'—'],['ملف المصدر',e(r.source)||'إدخال يدوي'],['ملاحظات',e(r.notes)||'—']].map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl><p>المصدر محفوظ كاسم ملف؛ ملف PDF نفسه غير مرفق.</p></div>`,`<div class="modal-footer"><button class="btn btn-primary" data-action="edit-result" data-id="${e(r.id)}">${icon('edit')} تعديل النتيجة</button><button class="btn" data-action="close-modal">إغلاق</button></div>`);
}
function confirmDelete(id,med=false) {
  const item=(med?db.medications:db.results).find(r=>r.id===id);if(!item)return;
  openModal(med?'نقل الدواء للمحذوفات؟':'نقل النتيجة للمحذوفات؟',`<div class="modal-body"><p>سيتم نقل ${e(item.name)} ${med?'':`بتاريخ ${date(item.date)}`} للمحذوفات. تقدر تتراجع فورًا أو تستعيده لاحقًا، حتى بعد إغلاق الصفحة.</p></div>`,`<div class="modal-footer"><button class="btn danger" data-action="confirm-delete" data-id="${e(id)}" data-kind="${med?'med':'result'}">${icon('trash')} نقل للمحذوفات</button><button class="btn" data-action="close-modal">إلغاء</button></div>`);
}
function navigateTrend(test) {
  ui.test=test;ui.group=db.results.find(r=>r.testId===test)?.group||meta(test).group;ui.unit='';ui.range='all';ui.point=null;
  if(route()!=='trends') location.hash='trends';else {render();window.scrollTo({top:0});}
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const action=button.dataset.action,id=button.dataset.id;
  if(action==='close-modal')return closeModal();
  if(action==='add-result'||action==='edit-result')return resultForm(id);
  if(action==='add-med'||action==='edit-med')return medForm(id);
  if(action==='backup')return backupModal();
  if(action==='details')return details(id);
  if(action==='delete-result')return confirmDelete(id);
  if(action==='delete-med')return confirmDelete(id,true);
  if(action==='confirm-delete') {
    const field=button.dataset.kind==='med'?'medications':'results';
    if(save({...db,[field]:db[field].filter(r=>r.id!==id)})){closeModal();render();toast('تم الحذف من السجل.');}return;
  }
  if(action==='trend')return navigateTrend(button.dataset.test);
  if(action==='chart-group'){ui.group=button.dataset.group;ui.point=null;updateChart();return;}
  if(action==='chart-point'){selectPoint(id);return;}
  if(action==='date-archive'){ui.archive={q:'',group:'all',state:'all',from:button.dataset.date,to:button.dataset.date,page:1};location.hash='archive';return;}
  if(action==='test-archive'){ui.archive={q:ui.test,group:'all',state:'all',from:'',to:'',page:1};location.hash='archive';return;}
  if(action==='prev-page'||action==='next-page'){ui.archive.page+=action==='next-page'?1:-1;updateArchive();return;}
  if(action==='clear-filters'){ui.archive={q:'',group:'all',state:'all',from:'',to:'',page:1};render();return;}
  if(action==='export-json'){download(JSON.stringify({...db,exportedAt:new Date().toISOString()},null,2),`kema-backup-${new Date().toISOString().slice(0,10)}.json`,'application/json');return;}
  if(action==='export-csv'){download(toCSV(db.results),'kema-results.csv','text/csv;charset=utf-8');return;}
  if(action==='export-raw'){try{download(localStorage.getItem(KEY)||'','kema-recovery.json','application/json');}catch{toast('المتصفح يمنع الوصول للتخزين.');}return;}
  if(action==='confirm-import') {
    const incoming=ui.pendingImport;if(!incoming)return;
    const results=mergeRecords(db.results,incoming.results),meds=mergeRecords(db.medications,incoming.medications,medFingerprint);
    const next={...db,results:results.items,medications:meds.items,profile:$('#import-profile')?.checked?incoming.profile:db.profile};
    if(save(next,{recover:true})){closeModal();render();toast(`تمت إضافة ${results.added} نتائج و${meds.added} أدوية.`);}return;
  }
  if(action==='profile')openModal('اسم صاحب السجل',`<form id="profile-form"><div class="modal-body"><div class="form-error" id="form-error" role="alert"></div>${inputField('name','الاسم',db.profile.name,'text','maxlength="120"')}<p>نسخة البداية مخصصة لسجل شخص واحد.</p></div><div class="modal-footer"><button class="btn btn-primary" type="submit">حفظ الاسم</button><button type="button" class="btn" data-action="close-modal">إلغاء</button></div></form>`);
});
function selectPoint(id) {
  ui.point=id;const r=db.results.find(r=>r.id===id);if(!r)return;
  $('#chart-details').innerHTML=pointDetails(r);
  document.querySelectorAll('.chart .point').forEach(p=>{p.setAttribute('r',p.dataset.id===id?'7':'5');p.setAttribute('aria-pressed',String(p.dataset.id===id));});
}
document.addEventListener('focusin',event=>{if(event.target.matches('.chart .point'))selectPoint(event.target.dataset.id);});
document.addEventListener('keydown',event=>{if(event.target.matches('.chart .point')&&(event.key==='Enter'||event.key===' ')){event.preventDefault();selectPoint(event.target.dataset.id);}});
document.addEventListener('input',event=>{
  if(event.target.id==='archive-search'){ui.archive.q=event.target.value;ui.archive.page=1;updateArchive();}
});
document.addEventListener('change',event=>{
  const id=event.target.id,value=event.target.value;
  if(id==='chart-test'){ui.test=value;ui.point=null;ui.unit='';updateChart();}
  if(id==='chart-range'){ui.range=value;ui.point=null;updateChart();}
  if(id==='chart-unit'){ui.unit=value;ui.point=null;updateChart();}
  const archiveFields={'archive-group':'group','archive-state':'state','archive-from':'from','archive-to':'to'};
  if(archiveFields[id]){ui.archive[archiveFields[id]]=value;ui.archive.page=1;updateArchive();}
  if(id==='import-file')prepareImport(event.target.files[0]);
  if(id==='f-testId') {
    const custom=value==='__custom';$('#custom-fields').hidden=!custom;
    $('#f-customId').required=custom;$('#f-customName').required=custom;
    if(!custom) {
      const latest=series(db.results,value).at(-1);$('#f-unit').value=latest?.unit||meta(value).unit;
      // Only the unit is suggested; reference ranges must come from the new report.
    } else $('#f-unit').value='';
  }
});
document.addEventListener('submit',event=>{
  const form=event.target;if(!['result-form','med-form','profile-form'].includes(form.id))return;
  event.preventDefault();
  const fields=Object.fromEntries(new FormData(form)),id=form.dataset.id;
  try {
    if(form.id==='result-form') {
      const custom=fields.testId==='__custom',testId=custom?fields.customId.trim():fields.testId;
      const existing=db.results.find(r=>r.id===id);
      const r=validateResult({...fields,id,testId,name:custom?fields.customName:testName(testId),group:custom?fields.customGroup:(testsAvailable().find(t=>t.id===testId)?.group||meta(testId).group)});
      if(db.results.some(item=>item.id!==id&&fingerprint(item)===fingerprint(r)))throw new Error('هذه النتيجة موجودة بالفعل بنفس التفاصيل.');
      const results=existing?db.results.map(item=>item.id===id?r:item):[...db.results,r];
      if(!save({...db,results}))throw new Error(ui.storageError);
      closeModal();render();toast(existing?'تم تعديل النتيجة.':'تمت إضافة النتيجة وحفظها.');
    }
    if(form.id==='med-form') {
      const m=validateMedication({...fields,id});const medications=id?db.medications.map(item=>item.id===id?m:item):[...db.medications,m];
      if(!save({...db,medications}))throw new Error(ui.storageError);
      closeModal();render();toast('تم حفظ الدواء وفترة الاستخدام.');
    }
    if(form.id==='profile-form') {
      if(!save({...db,profile:{name:fields.name.trim().slice(0,120)}}))throw new Error(ui.storageError);
      closeModal();render();toast('تم حفظ الاسم.');
    }
  } catch(error) { $('#form-error').textContent=error.message;$('#form-error').setAttribute('tabindex','-1');$('#form-error').focus(); }
});
window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0});});
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(updateChart,120);});
window.addEventListener('storage',event=>{
  if(event.key===KEY){
    if($('#modal').open){toast('تم تغيير السجل في نافذة أخرى. أعد تحميل الصفحة قبل حفظ تعديلاتك.');return;}
    try {if(event.newValue){db=validateBackup(JSON.parse(event.newValue));lastStored=event.newValue;render();toast('تم تحديث السجل من نافذة أخرى.');}else{toast('تم مسح التخزين في نافذة أخرى. نزّل نسخة احتياطية قبل إعادة التحميل.');}}catch{toast('تعذّر قراءة تحديث النافذة الأخرى.');}
  }
});
async function init() {
  if(cloudMode&&account.error){ui.storageError=account.error;render();return;}
  let raw;
  try {raw=localStorage.getItem(KEY);lastStored=raw;}catch{ui.storageError='المتصفح يمنع التخزين المحلي. لن يتم اعتماد تغييرات قبل تفعيل الحفظ.';}
  if(raw) {
    try{db=validateBackup(JSON.parse(raw));}catch{recoveryRequired=true;ui.storageError='تعذّر قراءة السجل المحفوظ. البيانات الأصلية ما زالت محفوظة؛ نزّلها من النسخ الاحتياطي قبل استيراد نسخة سليمة.';}
  } else if(['127.0.0.1','localhost','[::1]'].includes(location.hostname)) {
    try {
      const response=await fetch('./api/initial-data');
      if(response.ok){const initial=validateBackup(await response.json());db=initial;if(!ui.storageError)save(initial);}
    }catch{/* Static deployment starts empty; user can import a private backup. */}
  }
  render();
  if(cloudMode&&!recoveryRequired){
    cloud=createCloudSync({account,getDB:()=>db,apply:next=>{const serialized=JSON.stringify(next);localStorage.setItem(KEY,serialized);lastStored=serialized;db=next;},sessionChanged:applyPermissions,render,openModal,closeModal,toast,e,download});
    document.body.inert=true;
    try{await cloud.init();}finally{document.body.inert=false;}
  }
}
init();
