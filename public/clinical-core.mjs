const text=(v,max=2000)=>String(v??'').trim().slice(0,max);
const date=v=>!v||(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);
export const CLINICAL_KINDS={diagnosis:'تشخيص مسجل',test_request:'طلب فحص أو أشعة',warning:'تنبيه من الروشتة',medication_change:'تعديل دواء',followup:'موعد متابعة',note:'ملاحظة'};
export function validateClinical(input){
 if(input===undefined)return {version:1,doctors:[],visits:[],prescriptions:[],events:[]};
 if(!input||input.version!==1)throw Error('صيغة السجل الطبي غير صالحة.');
 const c={version:1};for(const key of ['doctors','visits','prescriptions','events']){if(!Array.isArray(input[key])||input[key].length>5000)throw Error('عدد أو صيغة عناصر السجل الطبي غير صالحة.');const ids=new Set();c[key]=input[key].map(r=>{if(!r||typeof r.id!=='string'||!r.id.trim()||r.id.length>100||ids.has(r.id))throw Error('معرّفات السجل الطبي غير صالحة أو مكررة.');ids.add(r.id);return r;});}
 c.doctors=c.doctors.map(r=>{if(!text(r.name))throw Error('اسم الطبيب مطلوب.');return {id:r.id,name:text(r.name,150),specialty:text(r.specialty,150)};});
 c.visits=c.visits.map(r=>{if(!c.doctors.some(d=>d.id===r.doctorId)||!date(r.date))throw Error('طبيب الزيارة أو تاريخها غير صالح.');return {id:r.id,doctorId:r.doctorId,date:r.date||'',source:text(r.source,500),reviewStatus:r.reviewStatus==='reviewed'?'reviewed':'unverified',notes:text(r.notes,4000)};});
 const visit=r=>{if(!c.visits.some(v=>v.id===r.visitId))throw Error('عنصر طبي غير مرتبط بزيارة داخل هذا الملف.');};
 c.prescriptions=c.prescriptions.map(r=>{visit(r);if(!text(r.name))throw Error('اسم الدواء في الروشتة مطلوب.');return {id:r.id,visitId:r.visitId,name:text(r.name,180),nameAR:text(r.nameAR,180),instructions:text(r.instructions,4000),durationText:text(r.durationText,1000),notes:text(r.notes,2000)};});
 c.events=c.events.map(r=>{visit(r);if(!Object.hasOwn(CLINICAL_KINDS,r.kind)||!text(r.text)||!date(r.dueDate))throw Error('نوع الملاحظة أو نصها أو تاريخها غير صالح.');return {id:r.id,visitId:r.visitId,kind:r.kind,text:text(r.text,4000),explanation:text(r.explanation,2000),dueDate:r.dueDate||'',dueText:text(r.dueText,500)};});return c;
}
// Merge references together; never attach a prescription to a coincidentally matching ID.
export function mergeClinical(current,incoming){
 const a=validateClinical(current),b=validateClinical(incoming),out=structuredClone(a),doctorIds=new Map(),visitIds=new Map();
 const add=(key,row,fingerprint)=>{const found=out[key].find(r=>fingerprint(r)===fingerprint(row));if(found)return found.id;const id=out[key].some(r=>r.id===row.id)?crypto.randomUUID():row.id;out[key].push({...row,id});return id;};
 for(const r of b.doctors)doctorIds.set(r.id,add('doctors',r,r=>JSON.stringify([r.name,r.specialty])));
 for(const r of b.visits){const v={...r,doctorId:doctorIds.get(r.doctorId)};visitIds.set(r.id,add('visits',v,r=>JSON.stringify([r.doctorId,r.date,r.source,r.notes])));}
 for(const key of ['prescriptions','events'])for(const r of b[key])add(key,{...r,visitId:visitIds.get(r.visitId)},r=>JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='id').sort())));
 return validateClinical(out);
}
