import test from 'node:test';import assert from 'node:assert/strict';
import {chartRanges,rangeAt,rangeLegend,rangeBackground} from '../public/chart-ranges.mjs';
import {installTheme,preferredTheme} from '../public/theme.mjs';
test('A1c bands use exact diagnostic boundaries only in percent, with context and an authoritative source',()=>{
 const row={testId:'hba1c',unit:'%',refMin:4,refMax:5.7},m=chartRanges(row);
 for(const [value,key]of [[5.6,'normal'],[5.7,'raised'],[6.49,'raised'],[6.5,'high'],[7.2,'high']])assert.equal(rangeAt(m,value).key,key);
 const legend=rangeLegend(row);assert.match(legend,/NIDDK/);assert.match(legend,/ليس هدف العلاج/);assert.doesNotMatch(legend,/الأخطر/);
 assert.equal(chartRanges({...row,unit:'mmol/mol',refMin:20,refMax:42}).clinical,false);
 const svg=rangeBackground(m,{L:40,W:800,R:20,y:v=>300-v*30,yMin:4,yMax:8});assert.match(svg,/range-normal/);assert.match(svg,/range-raised/);assert.match(svg,/range-high/);assert.ok(!svg.includes('NaN'));
});
test('other tests use actual inclusive report limits and do not invent escalating danger thresholds',()=>{
 const row={testId:'glucose_fasting',unit:'mg/dL',refMin:70,refMax:110},m=chartRanges(row);
 for(const [value,key]of [[68,'low'],[70,'normal'],[110,'normal'],[111,'high']])assert.equal(rangeAt(m,value).key,key);
 assert.deepEqual(m.thresholds,[70,110]);assert.equal(chartRanges({...row,refMin:null,refMax:null}).bands.length,0);
 const one=chartRanges({...row,refMin:null});assert.equal(rangeAt(one,110).key,'normal');assert.equal(rangeAt(one,111).key,'high');
});
test('theme respects saved choice, toggles accessibly and works without storage',()=>{
 let click,written;const button={setAttribute(k,v){this[k]=v;}};const doc={documentElement:{dataset:{}},querySelectorAll:()=>[button],querySelector:()=>null,addEventListener:(name,fn)=>click=fn};
 const current=installTheme(doc,{getItem:()=> 'dark',setItem:(key,value)=>written={key,value}},false);assert.equal(current(),'dark');assert.equal(button['aria-pressed'],'true');click({target:{closest:()=>button}});assert.equal(current(),'light');assert.deepEqual(written,{key:'kema.appearance.v1',value:'light'});assert.match(button.textContent,/الداكن/);
 assert.equal(preferredTheme({getItem(){throw Error();}},true),'dark');installTheme(doc,{getItem(){throw Error();},setItem(){throw Error();}},false);click({target:{closest:()=>button}});assert.equal(doc.documentElement.dataset.theme,'dark');
});
