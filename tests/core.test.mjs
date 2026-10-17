import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateResult, validateMedication, validateBackup, isDate, status, reference, parseCSV, toCSV, series, mergeRecords, timeDomain} from '../public/core.mjs';

const result = overrides => validateResult({date:'2026-10-15',testId:'hba1c',value:6.07,unit:'%',refMin:4,refMax:5.7,...overrides});
test('dates validate actual calendar days',()=>{
  assert.ok(isDate('2024-02-29'));assert.equal(isDate('2026-02-29'),false);assert.equal(isDate('2026-13-01'),false);assert.equal(isDate('15/10/2026'),false);
});
test('values remain numeric, including zero and Arabic numerals',()=>{
  assert.equal(result({value:0}).value,0);assert.equal(result({value:'٦٫٠٧'}).value,6.07);
  for(const value of ['',null,'abc','6.07%','Infinity',-1])assert.throws(()=>result({value}));
});
test('references can be absent or one-sided; boundaries and low values work',()=>{
  assert.equal(status(result()).type,'high');assert.equal(status(result({value:5.7})).type,'normal');
  assert.equal(status(result({value:3})).type,'low');assert.equal(status(result({refMin:null,refMax:null})).type,'unknown');
  assert.equal(reference(result({refMin:null})),'≤ 5.7');assert.throws(()=>result({refMin:8,refMax:5}));
});
test('medication dates are real and chronological; empty end remains ongoing',()=>{
  assert.equal(validateMedication({name:'اختبار',start:'2026-01-01'}).end,'');
  assert.throws(()=>validateMedication({name:'اختبار',start:'2026-01-02',end:'2026-01-01'}));
});
test('CSV roundtrip preserves quoted fields, Arabic and newlines',()=>{
  const original=result({name:'تحليل, خاص',lab:'معمل "أ"',notes:'سطر أول\nسطر ثان'});
  const parsed=parseCSV(toCSV([original]));
  for(const key of ['value','name','lab','notes','unit','refMin','refMax'])assert.deepEqual(parsed[0][key],original[key]);
  assert.throws(()=>parseCSV('Date,Test_ID,Result,Unit\n2026-10-15,hba1c,6.07'));
});
test('CSV rejects missing columns and invalid numeric values atomically',()=>{
  assert.throws(()=>parseCSV('Date,Test_ID\n2026-10-15,hba1c'));
  assert.throws(()=>parseCSV('Date,Test_ID,Result,Unit\n2026-10-15,hba1c,6.07,%\n2026-10-15,hba1c,wrong,%'));
});
test('merge ignores identical records without losing different results on the same date',()=>{
  const a=result({id:'a'}),duplicate={...a,id:'b'},different={...a,value:6.1};
  const merged=mergeRecords([a],[duplicate,different]);
  assert.equal(merged.added,1);assert.equal(merged.skipped,1);assert.equal(merged.items.length,2);
  assert.notEqual(merged.items[0].id,merged.items[1].id);
});
test('different units never mix when requesting a chart series',()=>{
  const records=[result({unit:'%'}),result({unit:'mmol/mol',value:43})];
  assert.equal(series(records,'hba1c','%').length,1);
});
test('time axis represents unequal real intervals and single-point domains',()=>{
  const rows=[result({date:'2024-01-01'}),result({date:'2024-01-02'}),result({date:'2024-10-01'})];
  const domain=timeDomain(rows);assert.ok(domain.max>domain.min);
  const ratio=(Date.parse(rows[1].date)-Date.parse(rows[0].date))/(Date.parse(rows[2].date)-Date.parse(rows[0].date));
  assert.ok(ratio<.01);assert.ok(timeDomain([rows[0]]).max>timeDomain([rows[0]]).min);
});
test('backup schema validates both result and medication arrays',()=>{
  assert.throws(()=>validateBackup({results:[],medications:[]}));
  assert.equal(validateBackup({schemaVersion:1,results:[result()],medications:[]}).results.length,1);
});
test('supplied dataset has 75 numeric results, 13 dates, and no invented medications',async(t)=>{
  let raw;
  try{raw=await readFile(new URL('../data/initial-results.json',import.meta.url),'utf8');}
  catch(error){if(error.code==='ENOENT'){t.skip('Private seed records are intentionally not included in the repository.');return;}throw error;}
  const data=validateBackup(JSON.parse(raw.replace(/^\uFEFF/,'')));
  assert.equal(data.results.length,75);assert.equal(new Set(data.results.map(r=>r.date)).size,13);assert.deepEqual(data.medications,[]);
  assert.ok(data.results.every(r=>Number.isFinite(r.value)&&r.date&&r.testId));
  assert.equal(new Set(data.results.map(r=>r.source)).size,14);
});
