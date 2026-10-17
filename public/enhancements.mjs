import {GROUPS,meta,validateResult,validateReport,validateBackup,visits,compareVisits,comparisonTests,matchingVisits,backupSignature,softDelete,restoreDeleted,mergeRecords,fingerprint,status,reference,series,parseCSV} from './core.mjs';
import {inspectPDF,putDocuments,readDocument,exportDocuments,decodeDocuments} from './documents.mjs';
import {mountPDFViewer} from './pdf-viewer.mjs';

export function createEnhancements(ctx){
  const {e,icon,date,num,openModal,closeModal,toast}=ctx;
  const $=(selector,root=document)=>root.querySelector(selector);
  const META_KEY=ctx.KEY+'.backup';
  let undoId=null,pdfURL=null,reviewId=null,pdfViewer=null,backupBusy=false,rowIndex=0,importData=null;
  const stamp=value=>value?new Intl.DateTimeFormat('ar-EG-u-nu-latn',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(value)):'لم تُنزّل نسخة بعد';
  const footer=buttons=>`<div class="modal-footer">${buttons}<button class="btn" type="button" data-action="close-modal">إغلاق</button></div>`;
  const field=(name,label,value='',type='text',extra='')=>`<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${e(value)}" ${extra}></label>`;
  const failed=(error,selector='#feature-error')=>{const el=$(selector);if(el){el.textContent=error.message;el.tabIndex=-1;el.focus();}else toast(error.message);};
  function backupInfo(){try{return JSON.parse(localStorage.getItem(META_KEY)||'null');}catch{return null;}}
  function isBackedUp(){const info=backupInfo();return info?.signature===backupSignature(ctx.getDB());}
  function documentMeta(id){return (ctx.getDB().documents||[]).find(d=>d.id===id);}
  function errorBox(){return '<div class="form-error" id="feature-error" role="alert"></div>';}
  function resetPDF(){pdfViewer?.destroy();pdfViewer=null;if(pdfURL){URL.revokeObjectURL(pdfURL);pdfURL=null;}reviewId=null;}
  $('#modal').addEventListener('close',()=>{$('#modal').classList.remove('wide-modal','review-modal');resetPDF();importData=null;});
  function wide(){ $('#modal').classList.add('wide-modal'); }
  function decorate(route){
    const db=ctx.getDB(),trash=db.trash||[],info=backupInfo();
    if(route!=='medications')$('.heading-actions')?.insertAdjacentHTML('afterbegin',`<button class="btn btn-primary" data-action="new-report">${icon('plus')} إضافة تقرير كامل</button>`);
    const single=$('.heading-actions [data-action="add-result"]');if(single){single.classList.remove('btn-primary');single.textContent='نتيجة واحدة';}
    $('.page-heading')?.insertAdjacentHTML('afterend',`<div class="feature-toolbar" aria-label="أدوات السجل"><div><button class="btn btn-small" data-action="compare">${icon('chart')} مقارنة التحاليل</button><button class="btn btn-small" data-action="print-summary">${icon('file')} ملخص للطبيب</button><button class="btn btn-small" data-action="documents">${icon('file')} مرفقات PDF <span class="tool-count">${(db.documents||[]).length}</span></button></div><button class="text-button" data-action="trash">${icon('trash')} المحذوفات${trash.length?` (${trash.length})`:''}</button></div>`);
    if(route==='overview'&&(!isBackedUp())&&(db.results.length||db.medications.length||trash.length))$('.welcome')?.insertAdjacentHTML('afterend',`<div class="backup-reminder"><div>${icon('shield')}<span><strong>${info?'عندك تغييرات بعد آخر نسخة احتياطية':'احفظ أول نسخة من سجلّك'}</strong><small>آخر تنزيل كامل: ${stamp(info?.at)}. الحفظ الحالي على هذا المتصفح فقط.</small></span></div><button class="btn btn-small" data-action="export-json">${icon('download')} تنزيل نسخة كاملة</button></div>`);
    if(route==='archive'){
      const note=$('.screen-note span');if(note)note.textContent='اربط ملفات PDF من «مرفقات PDF» أو تفاصيل النتيجة، وراجع الأرقام بجانب التقرير. CSV للنتائج فقط؛ النسخة الكاملة تشمل المرفقات والمحذوفات.';
    }
    const action=$('.sidebar-backup');if(action)action.setAttribute('title',`آخر نسخة احتياطية: ${stamp(info?.at)}`);
    if(!$('#undo-bar'))document.body.insertAdjacentHTML('beforeend','<div id="undo-bar" class="undo-bar" role="status" aria-live="polite" hidden></div>');
  }
  function showUndo(id){undoId=id;$('#undo-bar').hidden=false;$('#undo-bar').innerHTML=`<span>تم النقل للمحذوفات.</span><button class="btn btn-small" data-action="undo-delete">تراجع</button><button class="icon-btn" data-action="dismiss-undo" aria-label="إخفاء إشعار الحذف">${icon('close')}</button>`;}
  function restore(id){try{const next=restoreDeleted(ctx.getDB(),id);if(ctx.save(next)){if(undoId===id){undoId=null;$('#undo-bar').hidden=true;}ctx.render();if($('#modal').open)showTrash();toast('تمت استعادة السجل.');}}catch(error){toast(error.message);}}
  function showTrash(){
    const entries=(ctx.getDB().trash||[]).slice().reverse();
    openModal('المحذوفات القابلة للاسترجاع',`<div class="modal-body"><p>العناصر هنا محفوظة حتى بعد إغلاق الصفحة، وتدخل في النسخة الاحتياطية الكاملة.</p>${entries.length?`<div class="trash-list">${entries.map(entry=>`<div class="trash-item"><div><strong>${e(entry.record.name)}</strong><small>${entry.kind==='result'?`نتيجة ${date(entry.record.date)} · ${num(entry.record.value)} ${e(entry.record.unit)}`:'دواء'} · نُقل ${stamp(entry.deletedAt)}</small></div><button class="btn btn-small" data-action="restore-item" data-id="${e(entry.id)}">استعادة</button></div>`).join('')}</div>`:'<div class="empty-med">المحذوفات فاضية.</div>'}</div>`,footer(''));
  }
  function reportRow(testId=''){
    const idx=rowIndex++,tests=ctx.testsAvailable(),unit=series(ctx.getDB().results,testId).at(-1)?.unit||meta(testId).unit;
    return `<div class="report-row" data-row="${idx}"><label class="field"><span>التحليل</span><select class="select row-test" aria-label="نوع التحليل في الصف ${idx+1}"><option value="">اختار التحليل</option>${tests.map(t=>`<option value="${e(t.id)}" ${t.id===testId?'selected':''}>${e(t.name)} · ${e(t.short)}</option>`).join('')}</select></label><label class="field"><span>النتيجة</span><input class="row-value" inputmode="decimal" aria-label="النتيجة في الصف ${idx+1}" placeholder="—"></label><label class="field"><span>الوحدة</span><input class="row-unit" value="${e(unit)}" maxlength="40" aria-label="الوحدة في الصف ${idx+1}"></label><label class="field"><span>أدنى مرجع</span><input class="row-min" inputmode="decimal" aria-label="الحد الأدنى في الصف ${idx+1}"></label><label class="field"><span>أعلى مرجع</span><input class="row-max" inputmode="decimal" aria-label="الحد الأعلى في الصف ${idx+1}"></label><button class="icon-btn danger" type="button" data-action="remove-report-row" aria-label="إزالة الصف ${idx+1}">${icon('close')}</button><div class="row-error" aria-live="polite"></div></div>`;
  }
  function newReport(){
    rowIndex=0;
    openModal('تقرير واحد، وكل نتائجه',`<form id="report-form"><div class="modal-body">${errorBox()}<p>سجّل التاريخ والمعمل مرة واحدة، واكتب النتائج الموجودة فقط. الصفوف الفارغة لن تُحفظ.</p><div class="form-grid">${field('date','تاريخ التحليل','','date','required')}${field('lab','المعمل والفرع','','text','maxlength="150"')}${field('doctor','الطبيب المعالج','','text','maxlength="150"')}${field('source','اسم ملف المصدر (اختياري)','','text','maxlength="200"')}<label class="field full"><span>ملف PDF الأصلي (اختياري، حتى 15 ميجابايت)</span><input type="file" name="pdf" accept="application/pdf,.pdf"></label></div><div class="report-entry" id="report-rows">${['glucose_fasting','glucose_2hr','hba1c'].map(reportRow).join('')}</div><button class="btn btn-small" type="button" data-action="add-report-row">${icon('plus')} إضافة تحليل للتقرير</button><p class="small-help">الحدود المرجعية من التقرير نفسه. لإنشاء نوع تحليل جديد استخدم «نتيجة واحدة» أولًا.</p></div><div class="modal-footer"><button type="submit" class="btn btn-primary">${icon('check')} حفظ التقرير كله</button><button class="btn" type="button" data-action="close-modal">إلغاء</button></div></form>`);wide();
  }
  function readRows(){return [...document.querySelectorAll('#report-rows .report-row')].map(row=>{const testId=$('.row-test',row).value;return {testId,name:ctx.testName(testId),group:ctx.testsAvailable().find(t=>t.id===testId)?.group||meta(testId).group,value:$('.row-value',row).value,unit:$('.row-unit',row).value,refMin:$('.row-min',row).value,refMax:$('.row-max',row).value};});}
  async function saveReport(form){
    const button=$('button[type="submit"]',form);button.disabled=true;
    try{
      const fields=Object.fromEntries(new FormData(form)),db=ctx.getDB(),reportId=crypto.randomUUID();
      const file=$('input[name="pdf"]',form).files[0];
      let results=validateReport({date:fields.date,lab:fields.lab,doctor:fields.doctor,source:file?.name||fields.source,reportId},readRows());
      const merged=mergeRecords(db.results,results);if(!merged.added)throw new Error('كل النتائج المدخلة موجودة بالفعل. لم يتم حفظ تقرير مكرر.');
      let documents=db.documents||[];
      if(file){const checked=await inspectPDF(file);await putDocuments([{id:checked.meta.id,blob:checked.blob}]);if(!documents.some(d=>d.id===checked.meta.id))documents=[...documents,checked.meta];const newIds=new Set(results.map(r=>r.id));merged.items=merged.items.map(r=>newIds.has(r.id)?{...r,documentId:checked.meta.id,source:file.name}:r);}
      if(!ctx.save({...db,results:merged.items,documents}))throw new Error(ctx.ui.storageError);
      closeModal();ctx.render();toast(`تم حفظ ${merged.added} نتائج${merged.skipped?` وتجاهل ${merged.skipped} نتائج مكررة`:''}.`);
    }catch(error){failed(error);}finally{button.disabled=false;}
  }
  function visitLabel(v){return `${date(v.date)} · ${v.lab||'معمل غير مسجل'}${v.doctor&&v.doctor!=='-'?` · ${v.doctor}`:''}`;}
  function comparison(){
    const tests=comparisonTests(ctx.getDB().results);
    if(!tests.length){openModal('مقارنة التحاليل','<div class="modal-body"><p>المقارنة تحتاج قياسين على الأقل لنفس التحليل ونفس الوحدة. وجود نتائج في تاريخين مختلفين وحده لا يكفي.</p></div>',footer(''));return;}
    const preferred=tests.find(t=>t.testId===ctx.ui.test)||tests[0];
    openModal('قارن التحليل نفسه، بقياساته الفعلية',`<div class="modal-body"><p>ابدأ بالتحليل. القوائم تعرض قياساته الموجودة فقط، بنفس النوع والوحدة؛ الصائم منفصل عن الفاطر. الفروق أرقام محايدة وليست حكمًا بالتحسّن أو التراجع.</p><div class="form-grid"><label class="field"><span>طريقة المقارنة</span><select id="compare-mode" class="select"><option value="test">تحليل واحد بين قياسين</option><option value="visits">التحاليل المشتركة بين زيارتين</option></select></label><label class="field" id="compare-test-field"><span>التحليل والوحدة</span><select id="compare-test" class="select">${tests.map(t=>`<option value="${e(t.key)}" ${t.key===preferred.key?'selected':''}>${e(t.name)} · ${e(t.unit)} (${t.results.length} قياسات)</option>`).join('')}</select></label><label class="field"><span id="compare-a-label">القياس الأول (الأساس)</span><select id="compare-a" class="select"></select></label><label class="field"><span id="compare-b-label">القياس الثاني</span><select id="compare-b" class="select"></select></label></div><div id="comparison-results" aria-live="polite"></div></div>`,footer(''));wide();populateComparison();
  }
  function populateComparison(keepFirst=false){
    const results=ctx.getDB().results,mode=$('#compare-mode').value;
    $('#compare-test-field').hidden=mode==='visits';
    $('#compare-a-label').textContent=mode==='test'?'القياس الأول (الأساس)':'الزيارة الأولى (الأساس)';
    $('#compare-b-label').textContent=mode==='test'?'القياس الثاني':'زيارة بها تحاليل مشتركة';
    const previousA=$('#compare-a').value,previousB=$('#compare-b').value;
    const tests=comparisonTests(results),group=tests.find(t=>t.key===$('#compare-test').value);
    const all=mode==='test'?(group?.results||[]):visits(results).reverse().filter(v=>matchingVisits(results,v.id).length>0);
    const label=item=>mode==='test'?`${date(item.date)} · ${item.lab||'معمل غير مسجل'} · ${num(item.value)} ${item.unit}${item.doctor&&item.doctor!=='-'?` · ${item.doctor}`:''}`:visitLabel(item);
    const first=keepFirst&&all.some(item=>item.id===previousA)?previousA:all[Math.min(1,all.length-1)]?.id;
    $('#compare-a').innerHTML=all.map(item=>`<option value="${e(item.id)}" ${item.id===first?'selected':''}>${e(label(item))}</option>`).join('');
    const candidates=mode==='test'?all.filter(item=>item.id!==first):matchingVisits(results,first).reverse();
    const second=keepFirst&&candidates.some(item=>item.id===previousB)?previousB:candidates[0]?.id;
    $('#compare-b').innerHTML=candidates.map(item=>`<option value="${e(item.id)}" ${item.id===second?'selected':''}>${e(label(item))}${mode==='visits'?` · ${item.common} مشتركة`:''}</option>`).join('');
    $('#compare-a').disabled=!all.length;$('#compare-b').disabled=!candidates.length;renderComparison();
  }
  function comparisonValue(records){return records.length?records.map(r=>`<bdi>${num(r.value)}</bdi>`).join(' / '):'<span class="small-help">لم يُقَس</span>';}
  function renderComparison(){
    const results=ctx.getDB().results,mode=$('#compare-mode').value;
    const all=mode==='test'?results.map(r=>({...r,results:[r]})):visits(results),a=all.find(v=>v.id===$('#compare-a').value),b=all.find(v=>v.id===$('#compare-b').value);
    if(!a||!b||a.id===b.id){$('#comparison-results').innerHTML='<div class="screen-note">لا توجد اختيارات متوافقة للمقارنة. اختار تحليلًا له قياسان فعليان على الأقل.</div>';return;}
    const rows=compareVisits(a,b).filter(r=>r.delta!==null),common=rows.length;
    $('#comparison-results').innerHTML=`<div class="comparison-summary"><strong>${common}</strong> ${common===1?'تحليل قابل للمقارنة':'تحاليل قابلة للمقارنة'} <span>نفس نوع التحليل ونفس الوحدة فقط؛ النتائج غير المشتركة لا تظهر.</span></div><div class="table-wrap" tabindex="0" role="region" aria-label="مقارنة النتائج"><table class="recent-table"><thead><tr><th scope="col">التحليل / الوحدة</th><th scope="col">الأولى<br>${date(a.date)}</th><th scope="col">الثانية<br>${date(b.date)}</th><th scope="col">الفرق (الثانية − الأولى)</th><th scope="col">التغيّر النسبي</th></tr></thead><tbody>${rows.map(r=>`<tr><th scope="row">${e(r.name)}<small class="result-code">${e(r.unit)}</small></th><td>${comparisonValue(r.a)}</td><td>${comparisonValue(r.b)}</td><td><span class="delta-neutral" dir="${r.delta===null?'rtl':'ltr'}">${r.ambiguous?'أكثر من قياس؛ راجع السجل':r.delta===null?'—':`${r.delta>0?'↑ +':r.delta<0?'↓ −':'= '}${num(Math.abs(r.delta))}`}</span></td><td><bdi>${r.percent===null?'—':`${r.percent>0?'+':''}${num(r.percent)}%`}</bdi></td></tr>`).join('')}</tbody></table></div><p class="small-help">عند تكرار التحليل بنفس الوحدة في الزيارة لا نختار قياسًا عشوائيًا. ولا تُحسب نسبة تغيّر من قيمة أساس صفر.</p>`;
  }
  function documentLibrary(){
    const db=ctx.getDB();
    openModal('تقاريرك الأصلية، جنب نتائجك',`<div class="modal-body"><p>ملفاتك محفوظة في هذا المتصفح فقط. النسخة الاحتياطية الكاملة تشمل PDF؛ لا يتم إرسالها لأي خدمة خارجية.</p><button class="btn btn-primary" data-action="attach-document">${icon('plus')} إرفاق PDF وربطه بنتائج</button><div class="document-list">${(db.documents||[]).map(doc=>`<div class="document-item"><div class="document-file-icon">${icon('file')}</div><div><strong>${e(doc.name)}</strong><small>${num(Math.round(doc.size/1024))} KB · ${db.results.filter(r=>r.documentId===doc.id).length} نتائج مرتبطة</small></div><button class="btn btn-small" data-action="review-document" data-id="${e(doc.id)}">فتح ومراجعة</button></div>`).join('')||'<div class="empty-med">لسه مفيش ملفات مرفقة. الأرقام الحالية محفوظة كما هي.</div>'}</div></div>`,footer(''));wide();
  }
  function attachDocument(resultId){
    const db=ctx.getDB(),target=db.results.find(r=>r.id===resultId),dates=[...new Set(db.results.map(r=>r.date))].sort().reverse();
    if(!dates.length){newReport();return;}
    openModal('ربط ملف PDF بنتائج موجودة',`<form id="attach-form" data-target="${e(resultId||'')}"><div class="modal-body">${errorBox()}<div class="form-grid"><label class="field full"><span>ملف PDF (حتى 15 ميجابايت)</span><input type="file" name="pdf" accept="application/pdf,.pdf" required></label><label class="field full"><span>تاريخ النتائج التي تخص الملف</span><select id="attach-date" class="select">${dates.map(d=>`<option value="${d}" ${d===(target?.date||dates[0])?'selected':''}>${date(d)}</option>`).join('')}</select></label></div><p>اختار النتائج الموجودة في الملف. النتائج التي تختارها سيتم ربطها بهذا الـPDF بدل أي مرفق سابق.</p><div id="link-result-list"></div></div><div class="modal-footer"><button type="submit" class="btn btn-primary">إرفاق وفتح للمراجعة</button><button type="button" class="btn" data-action="close-modal">إلغاء</button></div></form>`);renderAttachmentChoices();
  }
  function renderAttachmentChoices(){
    const selected=$('#attach-date').value,target=$('#attach-form').dataset.target;
    $('#link-result-list').innerHTML=ctx.getDB().results.filter(r=>r.date===selected).map(r=>`<label class="checkbox-field link-choice"><input type="checkbox" name="resultIds" value="${e(r.id)}" ${!target||r.id===target?'checked':''}><span><strong>${e(r.name)}</strong> <bdi>${num(r.value)} ${e(r.unit)}</bdi><small>${e(r.source)||'بدون ملف مصدر'}${r.documentId?' · مرتبط بمرفق':''}</small></span></label>`).join('');
  }
  async function attachFile(form){
    const button=$('button[type="submit"]',form);button.disabled=true;
    try{
      const ids=[...form.querySelectorAll('input[name="resultIds"]:checked')].map(el=>el.value);if(!ids.length)throw new Error('اختار نتيجة واحدة على الأقل لربط الملف.');
      const checked=await inspectPDF($('input[type="file"]',form).files[0]),db=ctx.getDB();
      await putDocuments([{id:checked.meta.id,blob:checked.blob}]);
      const documents=(db.documents||[]).some(d=>d.id===checked.meta.id)?db.documents:[...(db.documents||[]),checked.meta];
      if(!ctx.save({...db,documents,results:db.results.map(r=>ids.includes(r.id)?{...r,documentId:checked.meta.id,source:checked.meta.name}:r)}))throw new Error(ctx.ui.storageError);
      ctx.render();await reviewDocument(checked.meta.id);toast(`تم ربط الملف بـ${ids.length} نتائج.`);
    }catch(error){failed(error);}finally{button.disabled=false;}
  }
  async function reviewDocument(id){
    try{
      const doc=documentMeta(id);if(!doc)throw new Error('بيانات المرفق غير موجودة. أرفق الملف من جديد.');
      const blob=await readDocument(id);if(!blob)throw new Error('ملف PDF غير موجود على هذا المتصفح. استورد نسخة كاملة بالمرفقات أو أعد إرفاقه.');
      resetPDF();pdfURL=URL.createObjectURL(blob);reviewId=id;
      const records=ctx.getDB().results.filter(r=>r.documentId===id);
      openModal(`مراجعة ${e(doc.name)}`,`<div class="review-layout"><div class="pdf-pane"><a class="btn btn-small" href="${pdfURL}" target="_blank" rel="noopener">فتح PDF في تبويب منفصل</a><div class="pdf-viewer" id="pdf-viewer"></div><small>عارض محلي؛ الصفحات لا تُرسل لأي خدمة خارجية.</small></div><form id="review-form" data-document="${e(id)}"><div class="review-fields">${errorBox()}<p>راجع الأرقام جنب الأصل، وعدّل النتيجة والوحدة والمرجع. الحفظ يحدّث السجل والمنحنيات.</p>${records.map(r=>`<fieldset class="review-result" data-id="${e(r.id)}"><legend>${e(r.name)}</legend><small>${date(r.date)} · ${e(r.lab)}</small><div class="form-grid">${field('value','النتيجة',r.value,'text','inputmode="decimal" required')}${field('unit','الوحدة',r.unit,'text','maxlength="40" required')}${field('refMin','أدنى مرجع',r.refMin??'','text','inputmode="decimal"')}${field('refMax','أعلى مرجع',r.refMax??'','text','inputmode="decimal"')}</div></fieldset>`).join('')||'<p>لا توجد نتائج نشطة مرتبطة بهذا الملف؛ قد تكون في المحذوفات.</p>'}</div><div class="review-actions"><button class="btn btn-primary" type="submit" ${records.length?'':'disabled'}>حفظ المراجعة</button><button class="btn" type="button" data-action="documents">كل المرفقات</button></div></form></div>`);wide();$('#modal').classList.add('review-modal');pdfViewer=mountPDFViewer($('#pdf-viewer'),blob);
    }catch(error){toast(error.message);}
  }
  function saveReview(form){
    try{
      const db=ctx.getDB(),changes=new Map();
      for(const fieldset of form.querySelectorAll('.review-result')){
        const old=db.results.find(r=>r.id===fieldset.dataset.id);if(!old)throw new Error('إحدى النتائج تغيّرت. أعد فتح المراجعة.');
        const fields=Object.fromEntries([...fieldset.querySelectorAll('input')].map(el=>[el.name,el.value]));
        changes.set(old.id,validateResult({...old,...fields}));
      }
      if(!ctx.save({...db,results:db.results.map(r=>changes.get(r.id)||r)}))throw new Error(ctx.ui.storageError);
      ctx.render();toast('تم حفظ المراجعة وتحديث المنحنيات.');
    }catch(error){failed(error);}
  }
  function detailWithAttachment(id){
    const r=ctx.getDB().results.find(r=>r.id===id);if(!r)return;
    ctx.details(id);
    const p=$('.modal-body>p');if(p)p.textContent=r.documentId?'الملف الأصلي مرتبط بهذه النتيجة ومحفوظ في المتصفح.':'اسم المصدر محفوظ؛ تقدر ترفق الـPDF الأصلي الآن.';
    $('.modal-footer')?.insertAdjacentHTML('afterbegin',r.documentId?`<button class="btn btn-soft" data-action="review-document" data-id="${e(r.documentId)}">${icon('file')} الأصل والمراجعة</button>`:`<button class="btn btn-soft" data-action="attach-document" data-id="${e(id)}">${icon('upload')} إرفاق PDF</button>`);
  }
  function printSummary(){
    const dates=ctx.getDB().results.map(r=>r.date).sort();
    openModal('تجهيز ملخص للطبيب',`<form id="print-options"><div class="modal-body">${errorBox()}<p>اختار الفترة. هنجهّز معاينة فيها النتائج والأدوية والمنحنيات، وبعدها تقدر تطبع أو تحفظ PDF من المتصفح.</p><div class="form-grid">${field('from','من تاريخ',dates[0]||'','date','required')}${field('to','إلى تاريخ',dates.at(-1)||'','date','required')}<label class="field full"><span>التصنيف</span><select name="group" class="select">${Object.entries(GROUPS).map(([id,n])=>`<option value="${id}">${n}</option>`).join('')}</select></label></div><label class="checkbox-field"><input type="checkbox" name="charts" checked><span>إضافة منحنى لكل تحليل متكرر في الفترة</span></label><label class="checkbox-field"><input type="checkbox" name="medications" checked><span>إضافة الأدوية المتقاطعة مع الفترة</span></label></div><div class="modal-footer"><button type="submit" class="btn btn-primary">معاينة الملخص</button><button type="button" class="btn" data-action="close-modal">إلغاء</button></div></form>`);
  }
  function buildPrint(form){
    try{
      const fields=Object.fromEntries(new FormData(form)),db=ctx.getDB();
      if(fields.from>fields.to)throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
      const rows=db.results.filter(r=>r.date>=fields.from&&r.date<=fields.to&&(fields.group==='all'||r.group===fields.group)).sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'ar'));
      if(!rows.length)throw new Error('لا توجد نتائج في الفترة والتصنيف المختارين.');
      const meds=fields.medications?db.medications.filter(m=>m.start<=fields.to&&(!m.end||m.end>=fields.from)&&(fields.group==='all'||m.group==='all'||m.group===fields.group)):[];
      const seriesKeys=[...new Set(rows.map(r=>JSON.stringify([r.testId,r.unit])))];
      const charts=fields.charts?seriesKeys.map((key,i)=>{const [testId,unit]=JSON.parse(key),rs=series(rows,testId,unit);if(rs.length<2)return '';const svg=ctx.chartFor(rs,testId).replaceAll('plot-clip',`print-plot-${i}`).replace(/tabindex="0"/g,'');return `<section class="print-chart"><h3>${e(rs[0].name)} <small>${e(unit)}</small></h3>${svg}<p>المرجع المظلل من آخر تقرير في الفترة: <bdi>${reference(rs.at(-1))}</bdi>. الخط يربط القياسات المسجلة فقط.</p></section>`;}).join(''):'';
      $('#print-content')?.remove();
      document.body.insertAdjacentHTML('beforeend',`<section id="print-content"><div class="print-heading"><div><h1>ملخص متابعة التحاليل</h1><h2>${e(db.profile.name)||'سجل شخصي'}</h2><p>${date(fields.from)} — ${date(fields.to)} · ${e(GROUPS[fields.group])}</p></div><div>Kema · Blood Tests<br><small>${rows.length} نتيجة · ${new Set(rows.map(r=>r.date)).size} تاريخ تحليل</small></div></div><p class="print-note">الأرقام والحدود المرجعية كما هي مسجلة. هذا ملخص للمتابعة؛ لا يستنتج تشخيصًا أو هدفًا علاجيًا.</p><table class="print-table"><thead><tr><th>التاريخ</th><th>التحليل</th><th>النتيجة / الوحدة</th><th>مرجع التقرير</th><th>الحالة</th><th>المعمل / الطبيب</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${date(r.date)}</td><td>${e(r.name)}</td><td><bdi>${num(r.value)} ${e(r.unit)}</bdi></td><td><bdi>${reference(r)}</bdi></td><td>${status(r).label}</td><td>${e(r.lab)||'—'}<small>${e(r.doctor)||'—'}</small></td></tr>`).join('')}</tbody></table>${fields.medications?`<h2>فترات العلاج المسجّلة</h2>${meds.length?`<table class="print-table"><thead><tr><th>الدواء</th><th>الجرعة</th><th>البداية</th><th>النهاية</th><th>ملاحظات</th></tr></thead><tbody>${meds.map(m=>`<tr><td>${e(m.name)}</td><td>${e(m.dose)||'—'}</td><td>${date(m.start)}</td><td>${m.end?date(m.end):'مستمر'}</td><td>${e(m.notes)||'—'}</td></tr>`).join('')}</tbody></table>`:'<p>لا توجد أدوية مسجّلة متقاطعة مع هذه الفترة.</p>'}`:''}${charts?`<h2>المنحنيات الزمنية</h2><div class="print-charts">${charts}</div>`:''}<div class="print-end">أُعدّ من السجل الشخصي بتاريخ ${stamp(new Date().toISOString())}. لا تُطبع ملفات PDF الأصلية ضمن هذا الملخص.</div></section>`);
      closeModal();document.body.classList.add('print-preview');
      $('#print-controls')?.remove();document.body.insertAdjacentHTML('beforeend',`<div id="print-controls"><span>معاينة ملخص الطبيب · ${rows.length} نتيجة</span><button class="btn btn-primary" data-action="do-print">طباعة / حفظ PDF</button><button class="btn" data-action="close-print">رجوع للموقع</button></div>`);window.scrollTo({top:0});
    }catch(error){failed(error);}
  }
  async function fullBackup(metadataOnly=false){
    if(backupBusy)return;backupBusy=true;
    try{
      const snapshot=structuredClone(ctx.getDB());let files=[],missing=[];
      if(!metadataOnly&&snapshot.documents?.length)({files,missing}=await exportDocuments(snapshot.documents));
      if(missing.length){openModal('بعض المرفقات غير موجودة على هذا المتصفح',`<div class="modal-body"><p>لم ننزّل نسخة كاملة؛ الملفات التالية تحتاج إعادة إرفاق:</p><ul>${missing.map(d=>`<li>${e(d.name)}</li>`).join('')}</ul><p>يمكنك تنزيل البيانات دون ملفات PDF الآن، لكن ذلك لا يُعتبر نسخة كاملة بالمرفقات.</p></div>`,footer('<button class="btn" data-action="export-data-only">تنزيل البيانات فقط</button>'));return;}
      const at=new Date().toISOString(),json=JSON.stringify({...snapshot,files,exportedAt:at,backupKind:metadataOnly?'records-only':'complete'},null,2);
      if(new Blob([json]).size>100*1024*1024)throw new Error('النسخة تتجاوز حد الاستيراد 100 ميجابايت. نزّل البيانات فقط واحتفظ بملفات PDF الأصلية بشكل منفصل.');
      ctx.download(json,`kema-${metadataOnly?'records':'backup'}-${at.slice(0,10)}.json`,'application/json');
      if(!metadataOnly){try{localStorage.setItem(META_KEY,JSON.stringify({at,signature:backupSignature(snapshot)}));}catch{toast('تم تجهيز النسخة، لكن تعذّر تسجيل وقتها محليًا.');}}
      ctx.render();if($('#modal').open)augmentBackup();
    }catch(error){toast(error.message);}finally{backupBusy=false;}
  }
  function augmentBackup(){
    if($('#modal-title')?.textContent!=='النسخ الاحتياطي والاستيراد')return;
    const info=backupInfo(),db=ctx.getDB();
    const intro=$('.modal-body>p');if(intro)intro.textContent=document.querySelector('meta[name="kema-cloud"]')?'النسخة الكاملة تشمل النتائج والأدوية والاسم والمحذوفات وملفات PDF. استيرادها هنا يضيفها إلى حسابك الخاص ويرفع المرفقات إلى Cloudflare.':'النسخة الكاملة تنقل النتائج والأدوية والاسم والمحذوفات وملفات PDF المرفقة. الملفات تظل محلية ولا تُرسل لخادم.';
    $('.backup-status')?.remove();$('.modal-body')?.insertAdjacentHTML('afterbegin',`<div class="backup-status"><strong>${isBackedUp()?'النسخة المنزّلة تطابق السجل الحالي':'السجل الحالي يحتاج نسخة جديدة'}</strong><small>آخر تنزيل كامل: ${stamp(info?.at)} · ${(db.documents||[]).length} مرفقات PDF</small></div>`);
    if(!$('.backup-buttons [data-action="export-data-only"]'))$('.backup-buttons')?.insertAdjacentHTML('beforeend','<button class="btn" data-action="export-data-only">JSON بدون ملفات PDF</button>');
  }
  async function prepareImport(file){
    if(!file)return;
    try{
      if(file.size>100*1024*1024)throw new Error('حجم النسخة أكبر من 100 ميجابايت.');
      const text=await file.text();
      const incoming=file.name.toLowerCase().endsWith('.csv')?validateBackup({schemaVersion:1,results:parseCSV(text),medications:[]}):validateBackup(JSON.parse(text.replace(/^\uFEFF/,'')));
      const decoded=await decodeDocuments(incoming),db=ctx.getDB();
      const resultMerge=mergeRecords(db.results,incoming.results),medMerge=mergeRecords(db.medications,incoming.medications,m=>JSON.stringify([m.name,m.dose,m.start,m.end,m.group,m.notes]));
      const missing=(incoming.documents||[]).filter(d=>!decoded.some(f=>f.id===d.id));
      const absent=[];for(const doc of missing)if(!await readDocument(doc.id))absent.push(doc);
      importData={incoming,decoded};
      openModal('مراجعة الاستيراد',`<div class="modal-body">${errorBox()}<p>الملف: <bdi>${e(file.name)}</bdi></p><div class="import-preview"><strong>${resultMerge.added} نتائج جديدة · ${medMerge.added} أدوية جديدة</strong><div>${decoded.length} ملفات PDF مضمنة · ${(incoming.trash||[]).length} عناصر في المحذوفات</div><small>سيتم تجاهل ${resultMerge.skipped} نتائج و${medMerge.skipped} أدوية متطابقة. السجل الحالي لن يُمسح.</small></div>${absent.length?`<div class="screen-note">${absent.length} مرفقات مسجّلة بالاسم فقط؛ ملفاتها غير موجودة في هذه النسخة أو هذا المتصفح.</div>`:''}${incoming.profile.name?`<label class="checkbox-field"><input id="enhance-import-profile" type="checkbox"><span>تحديث اسم صاحب السجل إلى ${e(incoming.profile.name)}</span></label>`:''}<p class="small-help">الأرقام المختلفة لنفس التاريخ تُضاف كقياسات مستقلة للمراجعة. الملفات تُفحص ببصمة المحتوى قبل الحفظ.</p></div>`,footer('<button class="btn btn-primary" data-action="import-enhanced">تأكيد الاستيراد</button>'));
    }catch(error){failed(error,'#import-error');}
  }
  async function confirmImport(button){
    if(!importData)return;button.disabled=true;
    try{
      const {incoming,decoded}=importData,db=ctx.getDB();
      await putDocuments(decoded);
      const results=mergeRecords(db.results,incoming.results),medications=mergeRecords(db.medications,incoming.medications,m=>JSON.stringify([m.name,m.dose,m.start,m.end,m.group,m.notes]));
      // Keep attachment links when an older matching result had no document attached.
      results.items=results.items.map(r=>{const linked=incoming.results.find(n=>n.documentId&&fingerprint(n)===fingerprint(r));return !r.documentId&&linked?{...r,documentId:linked.documentId}:r;});
      const documents=[...(db.documents||[])];for(const doc of incoming.documents||[])if(!documents.some(d=>d.id===doc.id))documents.push(doc);
      const trash=[...(db.trash||[])];for(const item of incoming.trash||[])if(!trash.some(t=>t.id===item.id)&&!db[item.kind==='result'?'results':'medications'].some(r=>r.id===item.record.id))trash.push(item);
      const next={...db,results:results.items,medications:medications.items,documents,trash,profile:$('#enhance-import-profile')?.checked?incoming.profile:db.profile};
      if(!ctx.save(next,{recover:true}))throw new Error(ctx.ui.storageError);
      closeModal();ctx.render();toast(`تمت إضافة ${results.added} نتائج و${medications.added} أدوية واستيراد المرفقات.`);
    }catch(error){failed(error);}finally{button.disabled=false;}
  }
  const handlers={
    'new-report':()=>newReport(),'add-report-row':()=>$('#report-rows').insertAdjacentHTML('beforeend',reportRow()),
    'remove-report-row':button=>{if(document.querySelectorAll('.report-row').length>1)button.closest('.report-row').remove();else toast('احتفظ بصف واحد على الأقل.');},
    compare:comparison,'print-summary':printSummary,'do-print':()=>window.print(),
    'close-print':()=>{document.body.classList.remove('print-preview');$('#print-controls')?.remove();$('#print-content')?.remove();$('#main').focus();},
    documents:()=>{resetPDF();$('#modal').classList.remove('review-modal');documentLibrary();},'attach-document':button=>attachDocument(button.dataset.id),
    'review-document':button=>reviewDocument(button.dataset.id),
    details:button=>detailWithAttachment(button.dataset.id),
    trash:showTrash,'restore-item':button=>restore(button.dataset.id),'undo-delete':()=>restore(undoId),'dismiss-undo':()=>{$('#undo-bar').hidden=true;},
    'confirm-delete':button=>{try{const deleted=softDelete(ctx.getDB(),button.dataset.kind==='med'?'medication':'result',button.dataset.id);if(ctx.save(deleted.data)){closeModal();ctx.render();showUndo(deleted.entry.id);}}catch(error){toast(error.message);}},
    'export-json':()=>fullBackup(),'export-data-only':()=>fullBackup(true),'import-enhanced':button=>confirmImport(button)
  };
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');if(!button)return;
    const handler=handlers[button.dataset.action];
    if(handler){event.preventDefault();event.stopImmediatePropagation();handler(button);}
  },true);
  document.addEventListener('change',event=>{
    if(event.target.id==='import-file'){event.stopImmediatePropagation();prepareImport(event.target.files[0]);}
    if(event.target.id==='attach-date')renderAttachmentChoices();
    if(['compare-mode','compare-test'].includes(event.target.id))populateComparison();
    if(event.target.id==='compare-a')populateComparison(true);
    if(event.target.id==='compare-b')renderComparison();
    if(event.target.matches('.row-test')){const row=event.target.closest('.report-row');$('.row-unit',row).value=series(ctx.getDB().results,event.target.value).at(-1)?.unit||meta(event.target.value).unit;}
  },true);
  document.addEventListener('focusout',event=>{
    const row=event.target.closest('.report-row');if(!row||!$('.row-value',row).value.trim())return;
    try{const testId=$('.row-test',row).value;validateResult({date:'2000-01-01',testId,value:$('.row-value',row).value,unit:$('.row-unit',row).value,refMin:$('.row-min',row).value,refMax:$('.row-max',row).value});$('.row-error',row).textContent='';row.removeAttribute('aria-invalid');}catch(error){$('.row-error',row).textContent=error.message;row.setAttribute('aria-invalid','true');}
  });
  document.addEventListener('submit',event=>{
    const actions={'report-form':saveReport,'attach-form':attachFile,'review-form':saveReview,'print-options':buildPrint};
    if(actions[event.target.id]){event.preventDefault();event.stopImmediatePropagation();actions[event.target.id](event.target);}
  },true);
  return {decorate,augmentBackup};
}
