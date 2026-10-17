import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import worker,{verifyAccess,boundedBody} from '../cloudflare/worker.mjs';

const origin='https://kema.example.test';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key'};
const config={ACCESS_TEAM:'test-team',ACCESS_AUD:'test-audience',OWNER_EMAIL:'owner@example.test'};
const certs=async()=>Response.json({keys:[jwk]});
async function token(overrides={}){
  const b64=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
  const parts=[b64({alg:'RS256',kid:jwk.kid}),b64({iss:'https://test-team.cloudflareaccess.com',aud:['test-audience'],email:'owner@example.test',exp:Math.floor(Date.now()/1000)+3600,...overrides})];
  return parts.join('.')+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(parts.join('.')))).toString('base64url');
}
test('Access checks signed identity, audience, issuer, expiry; rejects spoofing',async()=>{
  assert.equal((await verifyAccess(await token(),config,certs)).email,'owner@example.test');
  assert.equal((await verifyAccess(await token({email:'approved-family@example.test'}),config,certs)).email,'approved-family@example.test');
  for(const claims of [{email:''},{email:null},{aud:['another-app']},{exp:1},{iss:'https://fake.test'},{nbf:Date.now()/1000+1000}])await assert.rejects(async()=>verifyAccess(await token(claims),config,certs),{status:401});
  const valid=await token();await assert.rejects(()=>verifyAccess(valid.slice(0,-8)+'abcdefgh',config,certs),{status:401});
  await assert.rejects(()=>verifyAccess(null,config,certs),{status:401});
  await assert.rejects(()=>verifyAccess(null,{},certs),{status:503});
});

test('viewers can read but cannot write files, results or roles; owner role changes apply to the same token',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
  const prepare=sql=>({sql,args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args);},async all(){return {results:db.prepare(sql).all(...this.args)};},async run(){return {meta:{changes:db.prepare(sql).run(...this.args).changes}};}});
  const env={...config,DB:{prepare,async batch(queries){return queries.map(q=>({meta:{changes:db.prepare(q.sql).run(...q.args).changes}}));}},PDFS:{async head(){return null;}}};
  const iat=Math.floor(Date.now()/1000),viewer=await token({email:'family@example.test',iat}),owner=await token({iat}),originalFetch=globalThis.fetch;globalThis.fetch=certs;
  const call=(auth,path,method='GET',body)=>worker.fetch(new Request(origin+path,{method,headers:{'Cf-Access-Jwt-Assertion':auth,Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
  try{
    const session=await (await call(viewer,'/api/session')).json();assert.equal(session.role,'viewer');assert.equal(session.email,'family@example.test');assert.equal(session.issuedAt,new Date(iat*1000).toISOString());assert.ok(Date.parse(session.expiresAt)>Date.now());assert.equal(Object.keys(session).length,4);
    assert.equal((await call(viewer,'/api/state')).status,200);
    assert.equal((await call(viewer,'/api/documents/pdf_'+'a'.repeat(64),'HEAD')).status,404);
    assert.equal((await call(viewer,'/api/state','PUT',{revision:0,data:{}})).status,403);
    assert.equal((await call(viewer,'/api/documents/pdf_'+'a'.repeat(64),'PUT',{data:'fake'})).status,403);
    assert.equal((await call(viewer,'/api/roles')).status,403);
    assert.equal((await call(viewer,'/api/roles','PUT',{email:'family@example.test',role:'editor'})).status,403);
    assert.equal((await call(owner,'/api/roles')).status,200);
    assert.equal((await call(owner,'/api/roles','PUT',{email:config.OWNER_EMAIL,role:'viewer'})).status,400);
    assert.equal((await call(owner,'/api/roles','PUT',{email:'bad',role:'editor'})).status,400);
    assert.equal((await call(owner,'/api/roles','PUT',{email:'family@example.test',role:'editor'})).status,200);
    assert.equal((await (await call(viewer,'/api/session')).json()).role,'editor');
    const data={schemaVersion:1,profile:{name:''},results:[],medications:[]};assert.equal((await call(viewer,'/api/state','PUT',{revision:0,data})).status,200);
    assert.equal((await call(owner,'/api/roles','PUT',{email:'family@example.test',role:'viewer'})).status,200);
    assert.equal((await call(viewer,'/api/state','PUT',{revision:1,data})).status,403);
    assert.equal((await (await call(owner,'/api/session')).json()).role,'owner');
  }finally{globalThis.fetch=originalFetch;db.close();}
});
test('bounded reads enforce limits even without a Content-Length header',async()=>{
  await assert.rejects(()=>boundedBody(new Request(origin,{method:'POST',body:'123456'}),5),{status:413});
  assert.equal((await boundedBody(new Request(origin,{method:'POST',body:'123'}),5)).length,3);
});
test('authenticated record writes use real SQL compare-and-swap and retain prior versions',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
  const prepare=sql=>({sql,args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args);}});
  const env={...config,DB:{prepare,async batch(queries){db.exec('BEGIN');try{const out=queries.map(q=>({meta:{changes:Number(db.prepare(q.sql).run(...q.args).changes)}}));db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}},PDFS:{async head(){return null;}}};
  const auth=await token(),originalFetch=globalThis.fetch;globalThis.fetch=certs;
  const headers={'Cf-Access-Jwt-Assertion':auth,'Content-Type':'application/json',Origin:origin};
  const data={schemaVersion:1,profile:{name:'Synthetic test'},results:[],medications:[]};
  const put=(revision,originHeader=origin,payload=data)=>worker.fetch(new Request(origin+'/api/state',{method:'PUT',headers:{...headers,Origin:originHeader},body:JSON.stringify({revision,data:payload})}),env);
  try{
    assert.equal((await worker.fetch(new Request(origin+'/api/state'),env)).status,401);
    assert.equal((await put(0,'https://attacker.test')).status,403);
    const first=await put(0);assert.equal(first.status,200);assert.equal((await first.json()).revision,1);
    assert.equal((await put(0)).status,409);
    assert.equal((await put(1)).status,200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kema_history').get().n,1);
    assert.equal((await put(2,origin,{...data,documents:[{id:'pdf_'+'a'.repeat(64),name:'missing.pdf',size:12}]})).status,400);
    assert.equal((await put(2,origin,{...data,results:[{date:'bad'}]})).status,400);
    const current=await (await worker.fetch(new Request(origin+'/api/state',{headers}),env)).json();assert.equal(current.revision,2);assert.equal(current.data.profile.name,'Synthetic test');
  }finally{globalThis.fetch=originalFetch;db.close();}
});
