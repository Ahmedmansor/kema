import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { createCloudSync } from '../public/cloud.mjs';

const empty=()=>({schemaVersion:1,profile:{name:''},results:[],medications:[],documents:[],trash:[]});
const result={id:'synthetic',date:'2026-01-01',testId:'glucose_fasting',name:'Synthetic',value:90,unit:'mg/dL',refMin:null,refMax:null,group:'sugar'};
function harness(t){
  const saved=new Map(),events={},timers=[],nodes=new Map();let db=empty(),remote={revision:0,data:null,updatedAt:null},offline=false,reads=null,writes=0,role='editor',revoked=false;
  const fakeNode=()=>({dataset:{},open:false,append(){},prepend(){},setAttribute(){},remove(){}});
  for(const id of ['#save-state','.local-indicator','#cloud-button','#main','#modal'])nodes.set(id,fakeNode());
  const globals={document:{querySelector:s=>nodes.get(s)||null,createElement:fakeNode,addEventListener:(key,fn)=>events['doc:'+key]=fn,hidden:false},window:{addEventListener:(key,fn)=>events[key]=fn},navigator:{onLine:true},localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},fetch:async(path,options={})=>{
    if(path.startsWith('/api/profiles/test/'))path='/api/'+path.slice('/api/profiles/test/'.length);
    else if(path!=='/api/config')throw new Error('Unscoped request');
    if(offline)throw new Error('offline');
    if(path==='/api/config')return Response.json({cloud:true,ready:true});
    if(path==='/api/session')return revoked?Response.json({error:'Profile unavailable'},{status:404}):Response.json({profileId:'test',email:'family@example.test',role,issuedAt:null,expiresAt:new Date(Date.now()+3600000).toISOString()});
    if(!options.method){if(reads)return await reads;return Response.json(remote);}
    if(options.method==='PUT'){
      writes++;const body=JSON.parse(options.body);
      if(body.revision!==remote.revision)return Response.json({error:'conflict'},{status:409});
      remote={revision:remote.revision+1,data:body.data,updatedAt:new Date().toISOString()};return Response.json(remote);
    }
    throw new Error('Unexpected request');
  }};
  for(const [key,value]of Object.entries(globals)){const prior=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});t.after(()=>{if(prior)Object.defineProperty(globalThis,key,prior);else delete globalThis[key];});}
  const sync=createCloudSync({account:{base:'/api/profiles/test',scope:'testscope',selected:{id:'test',name:'Test'}},getDB:()=>db,apply:data=>{db=data;},render(){},openModal(){},closeModal(){},toast(){},e:String,download(){}});
  return {sync,events,saved,timers,nodes,set revoked(value){revoked=value;},set role(value){role=value;},get db(){return db;},set db(value){db=value;},get remote(){return remote;},set remote(value){remote=value;},get writes(){return writes;},set offline(value){offline=value;},set reads(value){reads=value;},async flush(){const fn=timers.shift();if(fn)fn();for(let i=0;i<8;i++)await tick();}};
}
test('cloud outbox survives failed upload and retries the same revision on reconnect',async t=>{
  const h=harness(t);await h.sync.init();h.db={...h.db,results:[result]};h.offline=true;h.sync.schedule();await h.flush();
  assert.equal(JSON.parse(h.saved.get('testscope.sync')).dirty,true);assert.equal(h.db.results.length,1);
  h.offline=false;h.events.online();for(let i=0;i<8;i++)await tick();
  assert.equal(h.remote.data.results.length,1);assert.equal(h.remote.revision,1);assert.equal(JSON.parse(h.saved.get('testscope.sync')).dirty,false);
});

test('revocation hides the record, preserves pending edits separately and never queues an empty replacement',async t=>{
  const h=harness(t);await h.sync.init();h.db={...h.db,results:[result]};h.sync.schedule();h.revoked=true;await h.flush();
  assert.equal(h.sync.canEdit(),false);assert.equal(h.db.results.length,0);assert.equal(h.writes,0);
  assert.equal(JSON.parse(h.saved.get('testscope.sync')).dirty,false);assert.equal(JSON.parse(h.saved.get('testscope.recovery')).data.results.length,1);
});

test('read-only sessions load the shared record without queuing writes',async t=>{
  const h=harness(t);h.role='viewer';h.remote={revision:1,data:{...empty(),results:[result]}};await h.sync.init();
  assert.equal(h.sync.canEdit(),false);assert.equal(h.db.results.length,1);h.sync.schedule();await h.flush();assert.equal(h.writes,0);
});

test('a pending upload rechecks permission and preserves edits after downgrade',async t=>{
  const h=harness(t);await h.sync.init();h.db={...h.db,results:[result]};h.sync.schedule();h.role='viewer';await h.flush();
  assert.equal(h.writes,0);assert.equal(h.db.results.length,1);assert.equal(JSON.parse(h.saved.get('testscope.sync')).dirty,true);
});
test('device conflict preserves local edits and stops automatic overwrites',async t=>{
  const h=harness(t);await h.sync.init();h.db={...h.db,results:[result]};h.remote={revision:2,data:empty()};h.sync.schedule();await h.flush();
  assert.equal(h.db.results.length,1);assert.equal(h.remote.revision,2);assert.equal(h.writes,1);
  h.sync.schedule();await h.flush();assert.equal(h.writes,1);assert.equal(JSON.parse(h.saved.get('testscope.sync')).dirty,true);
});
test('an in-flight refresh cannot erase edits made while its network request was pending',async t=>{
  const h=harness(t);await h.sync.init();let resolve;h.reads=new Promise(r=>{resolve=r;});
  h.events['doc:visibilitychange']();for(let i=0;i<8;i++)await tick();h.db={...h.db,results:[result]};h.sync.schedule();
  resolve(Response.json({revision:3,data:empty()}));for(let i=0;i<8;i++)await tick();await h.flush();
  assert.equal(h.db.results.length,1);assert.equal(h.writes,0);assert.equal(JSON.parse(h.saved.get('testscope.sync')).dirty,true);
});
