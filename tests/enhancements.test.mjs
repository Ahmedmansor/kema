import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResult,validateReport,validateBackup,visits,compareVisits,comparisonTests,matchingVisits,softDelete,restoreDeleted,backupSignature} from '../public/core.mjs';
import {inspectPDF,decodeDocuments} from '../public/documents.mjs';

const r=(extra={})=>validateResult({id:'a',date:'2026-10-15',testId:'hba1c',value:6.07,unit:'%',refMin:4,refMax:5.7,lab:'lab',...extra});
const db=()=>({schemaVersion:1,profile:{name:'test'},results:[r()],medications:[],documents:[],trash:[]});
test('bulk report ignores empty rows, retains zero, shares visit metadata and validates all entered rows',()=>{
  const shared={date:'2026-10-17',lab:'one lab',doctor:'one doctor',reportId:'report-1'};
  const rows=validateReport(shared,[{testId:'hba1c',value:'',unit:'%'},{testId:'glucose_fasting',value:'0',unit:'mg/dL'}]);
  assert.equal(rows.length,1);assert.equal(rows[0].value,0);assert.equal(rows[0].lab,shared.lab);assert.equal(rows[0].reportId,'report-1');
  assert.throws(()=>validateReport(shared,[{testId:'hba1c',value:'6',unit:'%'},{testId:'ldl',value:'bad',unit:'mg/dL'}]));
  assert.throws(()=>validateReport(shared,[{testId:'hba1c',value:'',unit:'%'}]));
});
test('bulk report rejects duplicate test/unit pairs',()=>{
  assert.throws(()=>validateReport({date:'2026-10-17'},[{testId:'hba1c',value:6,unit:'%'},{testId:'hba1c',value:6.2,unit:'%'}]));
});
test('visits distinguish labs and doctors on the same day',()=>{
  const grouped=visits([r(),r({id:'b',lab:'another lab'}),r({id:'c',testId:'ldl'})]);
  assert.equal(grouped.length,2);assert.equal(grouped.find(v=>v.lab==='lab').results.length,2);
});
test('comparison is neutral, only compares identical units, and preserves missing measurements',()=>{
  const a={results:[r({value:5}),r({id:'x',testId:'ldl',unit:'mg/dL',value:100})]};
  const b={results:[r({value:6}),r({id:'y',testId:'ldl',unit:'mmol/L',value:2.5})]};
  const rows=compareVisits(a,b),hba=rows.find(r=>r.testId==='hba1c');
  assert.equal(hba.delta,1);assert.equal(hba.percent,20);
  assert.equal(rows.filter(r=>r.testId==='ldl').length,2);assert.ok(rows.filter(r=>r.testId==='ldl').every(r=>r.delta===null));
});
test('comparison refuses ambiguous duplicates and division by zero',()=>{
  assert.equal(compareVisits({results:[r(),r({id:'b'})]},{results:[r()]} )[0].ambiguous,true);
  const zero=compareVisits({results:[r({value:0})]},{results:[r({value:5})]})[0];assert.equal(zero.delta,5);assert.equal(zero.percent,null);
});
test('smart comparison starts with repeated test/unit pairs, not unrelated dates',()=>{
  const unrelated=[r({id:'pp',date:'2026-01-01',testId:'glucose_2hr',unit:'mg/dL'}),r({id:'tg',date:'2026-02-01',testId:'triglycerides',unit:'mg/dL'}),r({id:'fbs',date:'2026-02-01',testId:'glucose_fasting',unit:'mg/dL'})];
  assert.deepEqual(comparisonTests(unrelated),[]);
  const base=visits(unrelated).find(v=>v.date==='2026-01-01');assert.deepEqual(matchingVisits(unrelated,base.id),[]);
  const withMatch=[...unrelated,r({id:'pp2',date:'2026-03-01',testId:'glucose_2hr',unit:'mg/dL'})];
  assert.deepEqual(comparisonTests(withMatch).map(t=>t.testId),['glucose_2hr']);
  assert.deepEqual(matchingVisits(withMatch,base.id).map(v=>v.date),['2026-03-01']);
});
test('smart visit choices exclude unit mismatches and ambiguous duplicate measurements',()=>{
  const records=[r({id:'a',date:'2026-01-01'}),r({id:'b',date:'2026-02-01',unit:'mmol/mol'}),r({id:'c',date:'2026-03-01'}),r({id:'d',date:'2026-03-01'})];
  const base=visits(records).find(v=>v.date==='2026-01-01');assert.deepEqual(matchingVisits(records,base.id),[]);
  const groups=comparisonTests(records);assert.equal(groups.length,1);assert.equal(groups[0].unit,'%');assert.equal(groups[0].results.length,3);
});
test('deletion survives backup validation and can be restored exactly, including attachment links',()=>{
  const original=db();original.results[0]=r({documentId:'pdf_example',reportId:'report1'});
  const {data,entry}=softDelete(original,'result','a','2026-10-17T00:00:00.000Z');
  assert.equal(original.results.length,1);assert.equal(data.results.length,0);
  const reloaded=validateBackup(JSON.parse(JSON.stringify(data)));assert.equal(reloaded.trash.length,1);
  const restored=restoreDeleted(reloaded,entry.id);assert.deepEqual(restored.results,original.results);assert.equal(restored.trash.length,0);
});
test('restoring an ID collision fails without silently overwriting active data',()=>{
  const {data,entry}=softDelete(db(),'result','a');data.results=[r({value:7})];
  assert.throws(()=>restoreDeleted(data,entry.id));assert.equal(data.results[0].value,7);
});
test('legacy backups migrate safely; backup signature reflects all meaningful changes',()=>{
  const original=db();delete original.documents;delete original.trash;
  const migrated=validateBackup(original);assert.deepEqual(migrated.documents,[]);assert.deepEqual(migrated.trash,[]);
  const signature=backupSignature(migrated);assert.equal(signature,backupSignature(JSON.parse(JSON.stringify(migrated))));
  assert.notEqual(signature,backupSignature({...migrated,results:[r({value:7})]}));
  assert.notEqual(signature,backupSignature(softDelete(migrated,'result','a').data));
  assert.equal(signature,backupSignature({...migrated,exportedAt:'unrelated metadata'}));
});
test('PDF import validates actual contents and verifies the content digest on backup restore',async()=>{
  const file=new File(['%PDF-1.4\nverification fixture\n%%EOF'],'test.pdf',{type:'application/pdf'});
  const inspected=await inspectPDF(file);assert.match(inspected.meta.id,/^pdf_[a-f0-9]{64}$/);
  const payload={documents:[inspected.meta],files:[{id:inspected.meta.id,data:Buffer.from(await file.arrayBuffer()).toString('base64')}]};
  assert.equal((await decodeDocuments(payload)).length,1);
  const changed=Buffer.from('%PDF-1.4\nverification changed\n%%EOF');payload.files[0].data=changed.toString('base64');payload.documents[0].size=changed.length;
  await assert.rejects(()=>decodeDocuments(payload));
  await assert.rejects(()=>inspectPDF(new File(['not a pdf'],'fake.pdf',{type:'application/pdf'})));
});
