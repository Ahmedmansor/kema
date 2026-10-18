import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClinical,mergeClinical} from '../public/clinical-core.mjs';
import {validateBackup,backupSignature} from '../public/core.mjs';
import {selectReportData} from '../public/report.mjs';
const sample=()=>({version:1,doctors:[{id:'doctor',name:'Test doctor',specialty:'Test specialty'}],visits:[{id:'visit',doctorId:'doctor',date:'',source:'User transcription',notes:'Uncertain',reviewStatus:'unverified'}],prescriptions:[{id:'rx',visitId:'visit',name:'As transcribed',instructions:'Dose text',durationText:'As written'}],events:[{id:'note',visitId:'visit',kind:'followup',text:'Follow up',dueText:'15/10',dueDate:''}]});
test('clinical validation preserves unknown dates and instructions without inventing medication periods',()=>{
 const c=validateClinical(sample());assert.equal(c.visits[0].date,'');assert.equal(c.events[0].dueDate,'');assert.equal(c.events[0].dueText,'15/10');assert.equal(c.visits[0].reviewStatus,'unverified');assert.ok(!('start' in c.prescriptions[0]));
 for(const mutate of [c=>c.visits[0].date='2026-02-30',c=>c.visits[0].doctorId='foreign',c=>c.prescriptions[0].visitId='foreign',c=>c.events[0].dueDate='2026-13-01',c=>c.events.push(c.events[0])]){const bad=sample();mutate(bad);assert.throws(()=>validateClinical(bad));}
});
test('backups include clinical records and signatures detect their changes; legacy backups migrate',()=>{
 const db={schemaVersion:1,profile:{name:'Test'},results:[],medications:[],clinical:sample()};const restored=validateBackup(JSON.parse(JSON.stringify(db)));assert.equal(restored.clinical.prescriptions[0].instructions,'Dose text');assert.equal(restored.medications.length,0);const signature=backupSignature(restored);restored.clinical.events[0].text='Changed';assert.notEqual(backupSignature(restored),signature);delete db.clinical;assert.equal(validateBackup(db).clinical.visits.length,0);
});
test('clinical merge is idempotent and remaps colliding doctor and visit identifiers together',()=>{
 const a=sample(),b=sample();b.doctors[0].name='Other doctor';b.prescriptions[0].name='Other prescription';const merged=mergeClinical(a,b);assert.equal(merged.visits.length,2);assert.equal(merged.prescriptions.length,2);const other=merged.prescriptions.find(p=>p.name==='Other prescription'),visit=merged.visits.find(v=>v.id===other.visitId);assert.equal(merged.doctors.find(d=>d.id===visit.doctorId).name,'Other doctor');assert.deepEqual(mergeClinical(merged,b),merged);
});
test('lab doctor snapshots do not silently include newly added clinical history',()=>{
 const db={profile:{name:'Test'},results:[{testId:'hba1c',name:'HbA1c',value:5,unit:'%',date:'2026-01-01',group:'sugar',refMin:null,refMax:5.7}],medications:[],clinical:sample()};assert.ok(!('clinical' in selectReportData(db)));
});
