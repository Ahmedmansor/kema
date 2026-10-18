import test from 'node:test';import assert from 'node:assert/strict';
import {prescriptionCurveGroups,specialtyGroup,specialtyColor,prescriptionCurve} from '../public/prescription-curve.mjs';
import {timelineSVG} from '../public/timeline.mjs';
const row=(id,specialty,date,name)=>({id,name,instructions:'Instructions',visit:{id:'v'+id,date},doctor:{id:'d'+id,name:'Doctor',specialty}});
test('prescription curves count written items by specialty and actual date with stable specialty colors',()=>{
 const model={results:[],start:'2025-01-01',end:'2025-02-01',prescriptions:[row('a','عظام وعمود فقري','2025-01-01','Medicine A'),row('b','عظام','2025-01-01','Medicine B'),row('c','مخ وأعصاب','2025-02-01','Medicine <C>')]};
 const groups=prescriptionCurveGroups(model);assert.equal(groups.length,2);assert.equal(groups[0].rows.length,2);assert.equal(specialtyColor('عظام'),specialtyColor('عظام وعمود فقري'));assert.notEqual(specialtyColor('عظام'),specialtyColor('مخ وأعصاب'));assert.equal(specialtyGroup('أنف وأذن وحنجرة'),'الأنف والأذن والحنجرة');
 const layer=prescriptionCurve(model,{x:d=>d==='2025-01-01'?100:800});for(const p of model.prescriptions)assert.ok(layer.includes(`data-timeline-rx="${p.id}"`));assert.ok(!layer.includes('Medicine <C>'));assert.ok(layer.includes('rotate(65)'));assert.equal((layer.match(/class="prescription-curve-line"/g)||[]).length,2);assert.ok(!layer.includes('NaN'));
 const svg=timelineSVG(model,{curve:true});assert.match(svg,/عدد بنود الأدوية/);assert.ok(!svg.includes('NaN'));const height=+svg.match(/viewBox="0 0 1000 (\d+)"/)[1];assert.ok(height<=550);
});
