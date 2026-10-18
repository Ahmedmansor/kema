import test from 'node:test';import assert from 'node:assert/strict';
import {homeAlertRows,createClinical} from '../public/clinical.mjs';
const data=()=>({clinical:{version:2,doctors:[{id:'d',name:'Doctor',specialty:'ENT'}],visits:[{id:'v',doctorId:'d',date:'2026-01-01'},{id:'u',doctorId:'d',date:''}],prescriptions:[],events:[{id:'priority',visitId:'v',kind:'warning',text:'Gliptins warning',pinned:true},{id:'other',visitId:'v',kind:'warning',text:'Other <warning>',pinned:false},{id:'sleep',visitId:'v',kind:'note',text:'ممنوع النوم بعد الأكل مباشرة'},{id:'ordinary',visitId:'v',kind:'note',text:'Ordinary note'},{id:'unknown',visitId:'u',kind:'warning',text:'Undated warning'},{id:'deleted',visitId:'v',kind:'warning',text:'Deleted warning',deletedAt:'2026-01-01T00:00:00Z'}]}});
test('all active warnings and explicit precautions appear, with priority sorting and deletion respected',()=>{
 const db=data();assert.deepEqual(homeAlertRows(db).map(n=>n.id),['priority','other','sleep','unknown']);db.clinical.events[0].pinned=false;assert.equal(homeAlertRows(db).length,4);db.clinical.visits[0].deletedAt='2026-01-01T00:00:00Z';assert.deepEqual(homeAlertRows(db).map(n=>n.id),['unknown']);
});
test('home warnings form one accessible scrollable list with all entries and escaped content',t=>{
 const prior=globalThis.document;globalThis.document={addEventListener(){}};t.after(()=>globalThis.document=prior);
 const e=v=>String(v??'').replaceAll('<','&lt;').replaceAll('>','&gt;');const ui=createClinical({getDB:data,canWrite:()=>false,e,date:d=>d});const html=ui.renderHomeAlerts();assert.match(html,/home-alert-scroll/);assert.match(html,/tabindex="0" role="region"/);assert.equal((html.match(/<li>/g)||[]).length,4);assert.match(html,/Other &lt;warning&gt;/);assert.match(html,/ممنوع النوم/);assert.match(html,/التاريخ غير معروف/);assert.doesNotMatch(html,/Deleted warning|Ordinary note|data-clinical="pin-event"/);
});
