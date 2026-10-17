export const TESTS = {
  glucose_fasting: { name: 'سكر صائم', short: 'FBS', group: 'sugar', unit: 'mg/dL' },
  glucose_2hr: { name: 'سكر بعد الأكل بساعتين', short: '2h Glucose', group: 'sugar', unit: 'mg/dL' },
  hba1c: { name: 'السكر التراكمي', short: 'HbA1c', group: 'sugar', unit: '%' },
  cholesterol_total: { name: 'الكوليسترول الكلي', short: 'Total Cholesterol', group: 'lipids', unit: 'mg/dL' },
  triglycerides: { name: 'الدهون الثلاثية', short: 'Triglycerides', group: 'lipids', unit: 'mg/dL' },
  hdl: { name: 'الكوليسترول النافع', short: 'HDL', group: 'lipids', unit: 'mg/dL' },
  ldl: { name: 'الكوليسترول الضار', short: 'LDL', group: 'lipids', unit: 'mg/dL' },
  vldl: { name: 'كوليسترول VLDL', short: 'VLDL', group: 'lipids', unit: 'mg/dL' },
  non_hdl: { name: 'الكوليسترول غير النافع', short: 'Non-HDL', group: 'lipids', unit: 'mg/dL' },
  hdl_risk: { name: 'نسبة الكوليسترول', short: 'HDL Risk', group: 'lipids', unit: 'Ratio' },
  tsh: { name: 'هرمون الغدة الدرقية', short: 'TSH', group: 'thyroid', unit: 'uIU/mL' },
  free_t3: { name: 'هرمون الغدة T3 الحر', short: 'Free T3', group: 'thyroid', unit: 'pg/mL' },
  free_t4: { name: 'هرمون الغدة T4 الحر', short: 'Free T4', group: 'thyroid', unit: 'ng/dL' }
};
export const GROUPS = { all: 'كل التحاليل', sugar: 'السكر', lipids: 'الدهون', thyroid: 'الغدة الدرقية', other: 'أخرى' };
export const SCHEMA_VERSION = 1;
export function meta(testId) { return Object.hasOwn(TESTS,testId) ? TESTS[testId] : { name: testId, short: testId, group: 'other', unit: '' }; }
export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value;
}
export function normalizeNumber(value) {
  return String(value ?? '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/٫/g, '.').trim();
}
function numeric(value, required = false) {
  const normalized = normalizeNumber(value);
  if (!normalized) { if (required) throw new Error('قيمة النتيجة مطلوبة.'); return null; }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) throw new Error('اكتب رقمًا صحيحًا للنتيجة والحدود المرجعية.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) throw new Error('الأرقام يجب أن تكون موجبة أو صفرًا.');
  return n;
}
function cleanText(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
export function validateResult(input) {
  if (!input || typeof input !== 'object') throw new Error('صيغة نتيجة غير صالحة.');
  if (!isDate(input.date)) throw new Error('تاريخ النتيجة غير صالح.');
  const testId = cleanText(input.testId, 80);
  if (!/^[a-z][a-z0-9_]*$/.test(testId)) throw new Error('كود التحليل يجب أن يكون بحروف إنجليزية وأرقام وشرطة سفلية.');
  const refMin = numeric(input.refMin), refMax = numeric(input.refMax);
  if (refMin !== null && refMax !== null && refMin > refMax) throw new Error('الحد الأدنى يجب ألا يتجاوز الحد الأعلى.');
  const unit = cleanText(input.unit, 40);
  if (!unit) throw new Error('وحدة القياس مطلوبة.');
  return { id: cleanText(input.id || crypto.randomUUID(), 100), date: input.date, testId,
    name: cleanText(input.name || meta(testId).name, 120), value: numeric(input.value, true), unit,
    refMin, refMax, lab: cleanText(input.lab, 150), doctor: cleanText(input.doctor, 150),
    source: cleanText(input.source, 200), notes: cleanText(input.notes),
    documentId: cleanText(input.documentId, 100), reportId: cleanText(input.reportId, 100),
    group: Object.hasOwn(GROUPS, input.group) && input.group !== 'all' ? input.group : meta(testId).group };
}
export function validateMedication(input) {
  if (!input || typeof input !== 'object' || !cleanText(input.name)) throw new Error('اسم الدواء مطلوب.');
  if (!isDate(input.start)) throw new Error('تاريخ بداية الدواء غير صالح.');
  if (input.end && (!isDate(input.end) || input.end < input.start)) throw new Error('تاريخ النهاية يجب أن يكون بعد البداية.');
  return { id: cleanText(input.id || crypto.randomUUID(), 100), name: cleanText(input.name, 150), dose: cleanText(input.dose, 150), start: input.start,
    end: input.end || '', group: Object.hasOwn(GROUPS, input.group) ? input.group : 'all', notes: cleanText(input.notes) };
}
export function status(r) {
  if (r.refMin !== null && r.value < r.refMin) return { type: 'low', label: 'أقل من المرجع', symbol: '↓' };
  if (r.refMax !== null && r.value > r.refMax) return { type: 'high', label: 'أعلى من المرجع', symbol: '↑' };
  if (r.refMin === null && r.refMax === null) return { type: 'unknown', label: 'بلا مرجع', symbol: '—' };
  return { type: 'normal', label: 'ضمن المرجع', symbol: '✓' };
}
export function reference(r) {
  if (r.refMin === null && r.refMax === null) return 'غير مسجل';
  if (r.refMin === null) return `≤ ${r.refMax}`;
  if (r.refMax === null) return `≥ ${r.refMin}`;
  return `${r.refMin} – ${r.refMax}`;
}
export function series(results, testId, unit) {
  return results.filter(r => r.testId === testId && (unit === undefined || r.unit === unit)).sort((a,b) => a.date.localeCompare(b.date));
}
export function fingerprint(r) { return JSON.stringify([r.date,r.testId,r.unit,r.value,r.refMin,r.refMax,r.lab,r.doctor,r.source,r.notes]); }
export function mergeRecords(current, incoming, key = fingerprint) {
  const seen = new Set(current.map(key));
  const ids = new Set(current.map(r => r.id));
  const added = [];
  for (const r of incoming) if (!seen.has(key(r))) {
    seen.add(key(r));
    const item = { ...r, id: ids.has(r.id) ? crypto.randomUUID() : r.id };
    ids.add(item.id); added.push(item);
  }
  return { items: [...current, ...added], added: added.length, skipped: incoming.length - added.length };
}
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i+1] === '"') { cell += '"'; i++; }
      else if (quoted) quoted = false;
      else if (!cell) quoted = true;
      else throw new Error('علامات اقتباس CSV غير صالحة.');
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(cell); if (row.some(x => x.trim())) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('علامة اقتباس CSV غير مغلقة.');
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('الملف لا يحتوي على نتائج.');
  const headers = rows.shift().map(x => x.trim());
  for (const h of ['Date','Test_ID','Result','Unit']) if (!headers.includes(h)) throw new Error(`عمود مطلوب: ${h}`);
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`عدد أعمدة غير صحيح في الصف ${index+2}.`);
    const r = Object.fromEntries(headers.map((h,i) => [h,cells[i]]));
    try { return validateResult({ date:r.Date, testId:r.Test_ID, name:r.Test_Name_AR, value:r.Result, unit:r.Unit, refMin:r.Ref_Min, refMax:r.Ref_Max, lab:r.Lab_Branch, doctor:r.Doctor, source:r.Source_File, notes:r.Notes, group:r.Group }); }
    catch (error) { throw new Error(`الصف ${index+2}: ${error.message}`); }
  });
}
const CSV_HEADERS = ['Date','Lab_Branch','Doctor','Category','Test_ID','Test_Name_AR','Result','Unit','Ref_Min','Ref_Max','Source_File','Notes','Group'];
export function toCSV(results) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '\uFEFF' + [CSV_HEADERS, ...results.map(r => [r.date,r.lab,r.doctor,GROUPS[r.group],r.testId,r.name,r.value,r.unit,r.refMin,r.refMax,r.source,r.notes,r.group])].map(row=>row.map(escape).join(',')).join('\r\n');
}
export function validateBackup(data) {
  if (!data || data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.results) || !Array.isArray(data.medications)) throw new Error('الملف ليس نسخة احتياطية متوافقة مع Kema.');
  if (data.results.length > 20000 || data.medications.length > 5000) throw new Error('عدد السجلات أكبر من الحد المدعوم.');
  const documents=(data.documents||[]).map(validateDocument);
  const trash=(data.trash||[]).map(entry=>{
    if(!entry||!['result','medication'].includes(entry.kind)||!entry.id||!Number.isFinite(Date.parse(entry.deletedAt)))throw new Error('سجل المحذوفات غير صالح.');
    return {id:cleanText(entry.id,100),kind:entry.kind,deletedAt:entry.deletedAt,record:entry.kind==='result'?validateResult(entry.record):validateMedication(entry.record)};
  });
  const files=(data.files||[]).map(file=>{
    if(!file||!documents.some(d=>d.id===file.id)||typeof file.data!=='string'||file.data.length>22*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))throw new Error('ملف PDF في النسخة الاحتياطية غير صالح.');
    return {id:file.id,data:file.data};
  });
  for(const list of [documents,files,trash])if(new Set(list.map(r=>r.id)).size!==list.length)throw new Error('معرّفات مكررة في المرفقات أو المحذوفات.');
  return { schemaVersion:SCHEMA_VERSION, profile:{ name:cleanText(data.profile?.name,120) }, results:data.results.map(validateResult), medications:data.medications.map(validateMedication),documents,trash,...(files.length?{files}:{}) };
}
export function validateDocument(input){
  if(!input||!/^pdf_[a-f0-9]{64}$/.test(input.id)||!input.name||!Number.isInteger(input.size)||input.size<5||input.size>15*1024*1024)throw new Error('بيانات مرفق PDF غير صالحة (الحد 15 ميجابايت للملف).');
  return {id:input.id,name:cleanText(input.name,200),size:input.size,type:'application/pdf'};
}
export function validateReport(shared,rows){
  const entered=rows.filter(r=>String(r.value??'').trim()!=='');
  if(!entered.length)throw new Error('اكتب نتيجة واحدة على الأقل. الصفوف الفارغة لا تُحفظ.');
  const results=entered.map((row,i)=>{
    try{return validateResult({...shared,...row,id:undefined});}catch(error){throw new Error(`التحليل ${row.name||row.testId||i+1}: ${error.message}`);}
  });
  const keys=results.map(r=>JSON.stringify([r.testId,r.unit]));
  if(new Set(keys).size!==keys.length)throw new Error('التحليل مكرر بنفس الوحدة داخل التقرير. احذف الصف المكرر.');
  return results;
}
export function visits(results){
  const groups=new Map();
  for(const r of results){
    const key=JSON.stringify([r.date,r.lab,r.doctor]);
    if(!groups.has(key))groups.set(key,{id:key,date:r.date,lab:r.lab,doctor:r.doctor,results:[]});
    groups.get(key).results.push(r);
  }
  return [...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function compareVisits(a,b){
  const buckets=new Map();
  for(const [side,visit]of [['a',a],['b',b]])for(const r of visit?.results||[]){
    const key=JSON.stringify([r.testId,r.unit]);
    if(!buckets.has(key))buckets.set(key,{testId:r.testId,name:r.name,unit:r.unit,a:[],b:[]});
    buckets.get(key)[side].push(r);
  }
  return [...buckets.values()].map(row=>{
    const comparable=row.a.length===1&&row.b.length===1;
    const delta=comparable?Number((row.b[0].value-row.a[0].value).toFixed(8)):null;
    const percent=comparable&&row.a[0].value!==0?Number((delta/row.a[0].value*100).toFixed(2)):null;
    return {...row,delta,percent,ambiguous:row.a.length>1||row.b.length>1};
  }).sort((a,b)=>a.name.localeCompare(b.name,'ar')||a.unit.localeCompare(b.unit));
}
export function comparisonTests(results){
  const groups=new Map();
  for(const r of results){
    const key=JSON.stringify([r.testId,r.unit]);
    if(!groups.has(key))groups.set(key,{key,testId:r.testId,unit:r.unit,name:r.name,results:[]});
    groups.get(key).results.push(r);
  }
  return [...groups.values()].filter(group=>group.results.length>=2).map(group=>({...group,results:group.results.slice().sort((a,b)=>b.date.localeCompare(a.date))}));
}
export function matchingVisits(results,visitId){
  const all=visits(results),base=all.find(v=>v.id===visitId);
  if(!base)return [];
  return all.filter(v=>v.id!==visitId).map(v=>({...v,common:compareVisits(base,v).filter(row=>row.delta!==null).length})).filter(v=>v.common>0);
}
export function backupSignature(data){
  function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
  const text=JSON.stringify(canonical({profile:data.profile,results:data.results,medications:data.medications,documents:data.documents||[],trash:data.trash||[]}));
  let hash=0xcbf29ce484222325n;
  for(let i=0;i<text.length;i++)hash=BigInt.asUintN(64,(hash^BigInt(text.charCodeAt(i)))*0x100000001b3n);
  return hash.toString(16);
}
export function softDelete(data,kind,id,now=new Date().toISOString()){
  const field=kind==='medication'?'medications':'results',record=data[field].find(r=>r.id===id);
  if(!record)throw new Error('السجل غير موجود.');
  const entry={id:crypto.randomUUID(),kind,record,deletedAt:now};
  return {data:{...data,[field]:data[field].filter(r=>r.id!==id),trash:[...(data.trash||[]),entry]},entry};
}
export function restoreDeleted(data,id){
  const entry=(data.trash||[]).find(r=>r.id===id);if(!entry)throw new Error('العنصر غير موجود في المحذوفات.');
  const field=entry.kind==='medication'?'medications':'results';
  if(data[field].some(r=>r.id===entry.record.id))throw new Error('يوجد سجل بنفس المعرّف بالفعل. راجعه قبل الاستعادة.');
  return {...data,[field]:[...data[field],entry.record],trash:data.trash.filter(r=>r.id!==id)};
}
export function timeDomain(records) {
  if (!records.length) return null;
  const timestamps = records.map(r => Date.parse(r.date + 'T00:00:00Z'));
  const min = Math.min(...timestamps), max = Math.max(...timestamps);
  const pad = min === max ? 86400000*15 : (max-min)*.045;
  return { min:min-pad, max:max+pad };
}
