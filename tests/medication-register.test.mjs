import test from 'node:test';import assert from 'node:assert/strict';
import {prescriptionRows,medicationSummary,renderMedicationRegister} from '../public/medication-register.mjs';
import {archiveClinical} from '../public/clinical-core.mjs';
test('prescription-only records populate medication summary and table without inventing intake periods',()=>{
 const db={medications:[],clinical:{version:1,doctors:[{id:'d',name:'Doctor',specialty:'Test'}],visits:[{id:'v',doctorId:'d',date:'2026-01-01',source:'Transcript'},{id:'undated',doctorId:'d',date:'',source:'Unknown date'}],prescriptions:[{id:'p',visitId:'v',name:'Medicine <test>',nameAR:'اسم منقول',instructions:'As written'},{id:'u',visitId:'undated',name:'Other medicine',instructions:'As written'}],events:[]}};
 assert.equal(prescriptionRows(db).length,2);const summary=medicationSummary(db),html=renderMedicationRegister(db);assert.ok(!summary.includes('لا توجد أدوية'));assert.ok(summary.includes('2 بنود دواء'));assert.ok(html.includes('Doctor'));assert.ok(html.includes('2026-01-01'));assert.ok(html.includes('غير معروف'));assert.ok(!html.includes('Medicine <test>'));assert.ok(!html.includes('data-clinical="delete-prescription"'));assert.ok(renderMedicationRegister(db,{canWrite:true}).includes('data-clinical="delete-prescription"'));assert.equal(db.medications.length,0);
 db.clinical=archiveClinical(db.clinical,'visits','v');assert.equal(prescriptionRows(db).length,1);assert.ok(!renderMedicationRegister(db).includes('Medicine &lt;test&gt;'));
});
