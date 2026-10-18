import {chartRanges,rangeAt,rangeBackground} from '../public/chart-ranges.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chartPrescriptionSelection,createChartPrescriptions} from '../public/chart-prescriptions.mjs';
import {validateClinical} from '../public/clinical-core.mjs';
import {timeDomain,meta,status} from '../public/core.mjs';
import {CURVE_HEIGHT,prescriptionCurve} from '../public/prescription-curve.mjs';
const rows=[{id:'r',testId:'triglycerides',date:'2026-10-15',value:152,unit:'mg/dL',refMin:0,refMax:150}];
const db={results:rows,clinical:validateClinical({version:2,doctors:[{id:'d',name:'Doctor',specialty:'عظام'}],visits:[{id:'v',doctorId:'d',date:'2026-05-01'},{id:'old',doctorId:'d',date:'2025-01-01'},{id:'unknown',doctorId:'d',date:''}],prescriptions:[{id:'p',visitId:'v',name:'Medicine',instructions:'Written instructions'},{id:'o',visitId:'old',name:'Medicine'},{id:'u',visitId:'unknown',name:'Medicine'}],events:[]}),medications:[]};
test('prescriptions follow the selected test unit and its existing relative period',()=>{
 const s=chartPrescriptionSelection(rows,{testId:'triglycerides',unit:'mg/dL',range:'6',medications:['Medicine'],enabled:true});
 assert.equal(s.from,'2026-04-15');assert.equal(s.to,'2026-10-15');assert.deepEqual(s.tests,['["triglycerides","mg/dL"]']);
 assert.equal(chartPrescriptionSelection(rows,{range:'all'}).from,'');
});
test('integrated controls default on, preserve filters and drive one shared chart model',t=>{
 const prev=globalThis.document,listeners={};globalThis.document={addEventListener:(n,f)=>listeners[n]=f,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>globalThis.document=prev);
 let selection,updates=0;const ui=createChartPrescriptions({getDB:()=>db,select:s=>selection=s,update:()=>updates++});
 const settings={testId:'triglycerides',unit:'mg/dL',range:'6'};
 assert.equal(ui.model(rows,settings).prescriptions.length,1);assert.equal(ui.enabled,true);assert.match(ui.controls(),/data-chart-rx-show checked/);
 const change=(attribute,value,checked)=>listeners.change({target:{value,checked,matches:s=>s===`[${attribute}]`,hasAttribute:a=>a===attribute}});
 change('data-chart-rx-show','on',false);assert.equal(ui.model(rows,settings).prescriptions.length,0);
 change('data-chart-rx-show','on',true);let model=ui.model(rows,settings);assert.equal(model.prescriptions.length,1);assert.equal(model.undated.length,1);assert.equal(model.results[0].testId,'triglycerides');assert.equal(selection.from,'2026-04-15');
 assert.match(ui.controls(),/data-chart-rx-med/);assert.doesNotMatch(ui.controls(),/chart-test|timeline-filters/);
 model=ui.model(rows,{...settings,range:'all'});assert.equal(model.prescriptions.length,2);
 change('data-chart-rx-med','Medicine',false);assert.equal(ui.model(rows,settings).prescriptions.length,0);assert.equal(updates,3);
});
test('the original test plot and optional prescription curves share date coordinates without a duplicate section',async()=>{
 const source=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');assert.ok(!source.includes('${timeline.render()}'));
 const body=source.split('function chartSVG(rows,rx) {')[1].split('\nfunction pointDetails')[0];
 const render=new Function('window','chartPrescriptions','timeDomain','db','ui','meta','e','testName','num','monthFmt','date','status','prescriptionCurve','CURVE_HEIGHT','chartRanges','rangeAt','rangeBackground',`return function(rows,rx){${body}`);
 const rx={prescriptions:[{...db.clinical.prescriptions[0],visit:db.clinical.visits[0],doctor:db.clinical.doctors[0]}],start:'2026-05-01',end:'2026-10-15'};
 const toggle={enabled:true};const svg=render({innerWidth:390},toggle,timeDomain,db,{test:'triglycerides'},meta,String,()=> 'Triglycerides',String,new Intl.DateTimeFormat('en'),String,status,prescriptionCurve,CURVE_HEIGHT,chartRanges,rangeAt,rangeBackground);
 const combined=svg(rows,rx);assert.match(combined,/data-timeline-rx="p"/);assert.match(combined,/data-action="chart-point"/);
 const domain=timeDomain([...rows,{date:rx.start},{date:rx.end}]),x=d=>90+(Date.parse(d+'T00:00:00Z')-domain.min)/(domain.max-domain.min)*885;
 assert.ok(combined.includes(`cx="${x(rows[0].date)}"`));assert.ok(combined.includes(`cx="${x(rx.start)}"`));assert.ok(!combined.includes('NaN'));assert.match(combined,/viewBox="0 0 1000 760"/);
 assert.doesNotMatch(svg(rows),/data-timeline-rx/); // Exported report charts have no overlay model.
 toggle.enabled=false;const plain=svg(rows,rx);assert.doesNotMatch(plain,/data-timeline-rx/);assert.match(plain,/viewBox="0 0 328 245"/);
});

test('specialty visibility is temporary, filters shared medicine names by prescriber and recomputes visible dates',t=>{
 const previous=globalThis.document,listeners={};globalThis.document={addEventListener:(name,fn)=>listeners[name]=fn,querySelector:()=>null,querySelectorAll:()=>[]};t.after(()=>globalThis.document=previous);
 const data=structuredClone(db);data.clinical.doctors.push({id:'gi',name:'Gastro doctor',specialty:'جهاز هضمي وباطنة'});data.clinical.visits.push({id:'gi-visit',doctorId:'gi',date:'2024-01-01'});data.clinical.prescriptions.push({id:'gi-rx',visitId:'gi-visit',name:'Medicine',instructions:'GI instructions'});
 const original=JSON.stringify(data),ui=createChartPrescriptions({getDB:()=>data,select(){},update(){}}),settings={testId:'triglycerides',unit:'mg/dL',range:'all'};
 const change=(attr,value,checked)=>listeners.change({target:{value,checked,matches:s=>s===`[${attr}]`,hasAttribute:a=>a===attr}});
 assert.equal(ui.model(rows,settings).start,'2024-01-01');assert.match(ui.specialties(),/data-chart-rx-specialty/);
 change('data-chart-rx-specialty','الجهاز الهضمي والباطنة',false);let model=ui.model(rows,settings);assert.equal(model.start,'2025-01-01');assert.equal(model.prescriptions.length,2);assert.ok(model.prescriptions.every(p=>p.doctor.id==='d'));assert.match(ui.specialties(),/is-muted/);
 change('data-chart-rx-specialty','العظام والعمود الفقري',false);model=ui.model(rows,settings);assert.equal(model.prescriptions.length,0);assert.equal(model.results.length,1);assert.equal(model.undated.length,0);
 change('data-chart-rx-focus','Medicine',true);model=ui.model(rows,settings);assert.equal(model.prescriptions.length,3);assert.equal(model.undated.length,1);assert.equal(JSON.stringify(data),original);
});
