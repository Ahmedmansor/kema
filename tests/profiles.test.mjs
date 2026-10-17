import test from 'node:test';
import assert from 'node:assert/strict';
import {accountScope,prepareCloudAccount} from '../public/profiles.mjs';
function setup(t,{profiles=[],requested='',fail=false}={}){
  const calls=[],saved=new Map();let list=profiles;
  const values={location:{href:'https://kema.example.test/'+requested},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},fetch:async(path,options={})=>{
    calls.push({path,options});if(fail)return Response.json({error:'not authenticated'},{status:401});
    if(path==='/api/session')return Response.json({email:'me@example.test'});
    if(path==='/api/profiles'&&options.method==='POST'){assert.deepEqual(JSON.parse(options.body),{name:'سجلي الصحي',personal:true});list=[{id:'personal',name:'Mine',role:'owner'}];return Response.json({id:'personal'});}
    if(path==='/api/profiles')return Response.json({profiles:list});throw Error('Unexpected request');
  }};
  for(const [key,value]of Object.entries(values)){const prior=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,configurable:true});t.after(()=>{if(prior)Object.defineProperty(globalThis,key,prior);else delete globalThis[key];});}
  return {calls,saved};
}
test('cache and sync scope separate both identity and profile',()=>{
  assert.notEqual(accountScope('a@example.test','one'),accountScope('b@example.test','one'));
  assert.notEqual(accountScope('a@example.test','one'),accountScope('a@example.test','two'));
});
test('a requested foreign profile is rejected rather than opening another cached record',async t=>{
  setup(t,{profiles:[{id:'mine',name:'Mine',role:'owner'}],requested:'?profile=foreign'});
  await assert.rejects(()=>prepareCloudAccount(),/غير متاح/);
});
test('a new account provisions an empty personal profile before selecting its storage',async t=>{
  const h=setup(t);const result=await prepareCloudAccount();assert.equal(result.selected.id,'personal');assert.equal(result.base,'/api/profiles/personal');assert.equal(result.scope,accountScope('me@example.test','personal'));assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);
});
test('failed authentication cannot bootstrap or select a cached medical profile',async t=>{
  const h=setup(t,{fail:true});await assert.rejects(()=>prepareCloudAccount());assert.deepEqual(h.calls.map(c=>c.path),['/api/session']);assert.equal(h.saved.size,0);
});
