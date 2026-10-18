import test from 'node:test';import assert from 'node:assert/strict';
import {prescriptionCurveGroups,specialtyGroup,specialtyColor,prescriptionCurve,compactCurveHeight,prescriptionMarkerPositions} from '../public/prescription-curve.mjs';
import {timelineSVG} from '../public/timeline.mjs';
const row=(id,specialty,date,name)=>({id,name,instructions:'Instructions',visit:{id:'v'+id,date},doctor:{id:'d'+id,name:'Doctor',specialty}});
test('nearby prescription markers remain independently selectable and keep their exact dated anchors',()=>{
 const groups=Array.from({length:8},(_,i)=>({key:String(i),date:'2026-01-01',rows:[{}]}));
 const positions=prescriptionMarkerPositions(groups,{x:()=>100,y:()=>90,L:36,W:258,R:38,minY:40,maxY:190,separation:40});
 for(const [i,p] of positions.entries()){assert.equal(p.ax,100);assert.equal(p.ay,90);assert.ok(p.px>=36&&p.px<=220);for(const q of positions.slice(0,i))assert.ok(Math.hypot(p.px-q.px,p.py-q.py)>=40);}
});
test('mobile prescription branches preserve every medicine within viewport and grow vertically for dense visits',()=>{
 const model={prescriptions:Array.from({length:37},(_,i)=>row(String(i),i<20?'عظام':'مخ وأعصاب',i<20?'2026-01-01':'2026-02-01','Medicine <'+i+'> with long name'))};
 for(const W of [250,328,368]){const height=compactCurveHeight(model),svg=prescriptionCurve(model,{compact:true,W,L:36,R:14,x:d=>d==='2026-01-01'?36:W-14});
 assert.equal((svg.match(/class="timeline-point rx-mobile-drug"/g)||[]).length,37);assert.equal((svg.match(/rx-mobile-connector/g)||[]).length,2);assert.doesNotMatch(svg,/NaN|Infinity|rotate\(/);assert.match(svg,/Medicine &lt;0&gt; with long name/);
 for(const rect of svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="32"/g)){assert.ok(+rect[1]>=0);assert.ok(+rect[1]+ +rect[3]<=W);assert.ok(+rect[2]+32<height);}
 }
 assert.ok(compactCurveHeight({prescriptions:model.prescriptions.slice(0,1)})<compactCurveHeight(model));
});
test('prescription curves count written items by specialty and actual date with stable specialty colors',()=>{
 const model={results:[],start:'2025-01-01',end:'2025-02-01',prescriptions:[row('a','عظام وعمود فقري','2025-01-01','Medicine A'),row('b','عظام','2025-01-01','Medicine B'),row('c','مخ وأعصاب','2025-02-01','Medicine <C>')]};
 const groups=prescriptionCurveGroups(model);assert.equal(groups.length,2);assert.equal(groups[0].rows.length,2);assert.equal(specialtyColor('عظام'),specialtyColor('عظام وعمود فقري'));assert.notEqual(specialtyColor('عظام'),specialtyColor('مخ وأعصاب'));assert.equal(specialtyGroup('أنف وأذن وحنجرة'),'الأنف والأذن والحنجرة');
 const layer=prescriptionCurve(model,{x:d=>d==='2025-01-01'?100:800});for(const p of model.prescriptions)assert.ok(layer.includes(`data-timeline-rx="${p.id}"`));assert.ok(!layer.includes('Medicine <C>'));assert.ok(layer.includes('rotate(35)'));assert.ok(layer.includes('font-size="18"'));assert.equal((layer.match(/class="prescription-curve-line"/g)||[]).length,2);assert.ok(!layer.includes('NaN'));
 const svg=timelineSVG(model,{curve:true});assert.match(svg,/عدد بنود الأدوية/);assert.ok(!svg.includes('NaN'));const height=+svg.match(/viewBox="0 0 1000 (\d+)"/)[1];assert.ok(height<=550);
});

test('filtered prescription labels grow and redistribute while the count axis rescales',()=>{
 const prescriptions=Array.from({length:24},(_,i)=>row(String(i),'عظام','2026-01-01','Medicine '+i)),model={prescriptions};
 const dense=prescriptionCurve(model,{x:()=>500}),focused=prescriptionCurve({prescriptions:prescriptions.slice(0,1)},{x:()=>500});
 assert.match(dense,/font-size="12"/);assert.match(focused,/font-size="18"/);assert.match(focused,/rotate\(35\)/);assert.equal((focused.match(/data-timeline-rx=/g)||[]).length,1);assert.equal((dense.match(/data-timeline-rx=/g)||[]).length,24);assert.doesNotMatch(focused,/NaN|Infinity/);
 assert.ok(!focused.includes('>24</text>'));assert.ok(dense.includes('>24</text>'));assert.match(prescriptionCurve({prescriptions:prescriptions.slice(0,16)},{x:()=>500}),/font-size="14"/);
});
