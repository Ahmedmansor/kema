import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import worker,{verifyAccess,boundedBody} from '../cloudflare/worker.mjs';
import {legacyProfileMigration} from '../cloudflare/migrate-profiles.mjs';
const origin='https://kema.example.test',owner='owner@example.test',dad='dad@example.test',other='other@example.test';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key'},config={ACCESS_TEAM:'test-team',ACCESS_AUD:'test-audience',OWNER_EMAIL:owner},certs=async()=>Response.json({keys:[jwk]});
const empty=name=>({schemaVersion:1,profile:{name},results:[],medications:[],documents:[],trash:[]});
async function token(overrides={}){
  const b64=data=>Buffer.from(JSON.stringify(data)).toString('base64url'),parts=[b64({alg:'RS256',kid:jwk.kid}),b64({iss:'https://test-team.cloudflareaccess.com',aud:['test-audience'],email:owner,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...overrides})];
  return parts.join('.')+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(parts.join('.')))).toString('base64url');
}
async function fixture(t){
  const db=new DatabaseSync(':memory:');for(const file of ['schema.sql','profiles-schema.sql'])db.exec(await readFile(new URL('../cloudflare/'+file,import.meta.url),'utf8'));
  const prepare=sql=>({sql,args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args);},async all(){return {results:db.prepare(sql).all(...this.args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};}});
  const files=new Map(),env={...config,DB:{prepare,async batch(queries){db.exec('BEGIN');try{const rows=queries.map(q=>({meta:{changes:Number(db.prepare(q.sql).run(...q.args).changes)}}));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}},PDFS:{async head(k){const b=files.get(k);return b?{size:b.length}:null;},async get(k){const b=files.get(k);return b?{body:b,size:b.length}:null;},async put(k,b){files.set(k,b);}}};
  const original=globalThis.fetch;globalThis.fetch=certs;t.after(()=>{globalThis.fetch=original;db.close();});
  const seed=(id,email,name)=>{db.prepare('INSERT INTO kema_profiles(id,name,owner_email,created_at) VALUES(?,?,?,?)').run(id,name,email,new Date().toISOString());db.prepare('INSERT INTO kema_profile_state(profile_id,data) VALUES(?,?)').run(id,JSON.stringify(empty(name)));};
  const tokens={owner:await token(),dad:await token({email:dad}),other:await token({email:other})};
  const call=(auth,path,method='GET',body,from=origin)=>worker.fetch(new Request(origin+path,{method,headers:{...(auth?{'Cf-Access-Jwt-Assertion':auth}:{}),Origin:from,'Content-Type':'application/json'},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),env);
  return {db,files,tokens,call,seed};
}
test('Access rejects invalid signatures, issuers, audiences, expiry and missing email',async()=>{
  assert.equal((await verifyAccess(await token(),config,certs)).email,owner);
  for(const c of [{email:''},{email:null},{aud:['other-app']},{exp:1},{iss:'https://fake.test'},{nbf:Date.now()/1000+1000}])await assert.rejects(async()=>verifyAccess(await token(c),config,certs),{status:401});
  const valid=await token();await assert.rejects(()=>verifyAccess(valid.slice(0,-8)+'abcdefgh',config,certs),{status:401});await assert.rejects(()=>verifyAccess(null,config,certs),{status:401});await assert.rejects(()=>verifyAccess(null,{},certs),{status:503});
});
test('profiles isolate discovery, sessions, records, shares and PDFs without an account-admin bypass',async t=>{
  const h=await fixture(t);h.seed('mother',owner,'Mother');h.seed('father',dad,'Father');
  assert.deepEqual((await (await h.call(h.tokens.owner,'/api/profiles')).json()).profiles.map(p=>p.id),['mother']);
  for(const r of ['state','session','roles','documents/pdf_'+'a'.repeat(64)])for(const m of ['GET','PUT'])assert.equal((await h.call(h.tokens.owner,'/api/profiles/father/'+r,m,m==='PUT'?{}:undefined)).status,404);
  assert.equal((await h.call(null,'/api/profiles/mother/state')).status,401);
  for(const p of ['/api/state','/api/documents/pdf_'+'a'.repeat(64)])assert.equal((await h.call(h.tokens.owner,p)).status,409);
  assert.equal((await h.call(h.tokens.owner,'/api/state','PUT',{})).status,409);
  const s=await (await h.call(h.tokens.dad,'/api/profiles/father/session')).json();assert.equal(s.role,'owner');assert.equal(s.email,dad);assert.ok(Date.parse(s.expiresAt)>Date.now());assert.ok(s.issuedAt);
});
test('a share applies to one profile only; viewer cannot escalate and revocation affects existing tokens',async t=>{
  const h=await fixture(t);h.seed('mother',owner,'Mother');h.seed('father',owner,'Father');const roles='/api/profiles/mother/roles',state='/api/profiles/mother/state';
  assert.equal((await h.call(h.tokens.owner,roles,'PUT',{email:other,role:'viewer'})).status,200);
  assert.deepEqual((await (await h.call(h.tokens.other,'/api/profiles')).json()).profiles.map(p=>p.id),['mother']);assert.equal((await h.call(h.tokens.other,'/api/profiles/father/state')).status,404);
  assert.equal((await h.call(h.tokens.other,state)).status,200);assert.equal((await h.call(h.tokens.other,state,'PUT',{})).status,403);
  assert.equal((await h.call(h.tokens.other,'/api/profiles/mother/documents/pdf_'+'a'.repeat(64),'PUT','%PDF-x')).status,403);
  assert.equal((await h.call(h.tokens.other,roles)).status,403);assert.equal((await h.call(h.tokens.other,roles,'PUT',{email:other,role:'editor'})).status,403);
  assert.equal((await h.call(h.tokens.owner,roles,'PUT',{email:owner,role:'viewer'})).status,400);
  assert.equal((await h.call(h.tokens.owner,roles,'PUT',{email:other,role:'editor'})).status,200);assert.equal((await h.call(h.tokens.other,state,'PUT',{revision:0,data:empty('Mother')})).status,200);
  await h.call(h.tokens.owner,roles,'PUT',{email:other,role:'viewer'});assert.equal((await h.call(h.tokens.other,state,'PUT',{revision:1,data:empty('Mother')})).status,403);
  assert.equal((await h.call(h.tokens.owner,roles,'DELETE',{email:other})).status,200);assert.equal((await h.call(h.tokens.other,state)).status,404);
});
test('concurrent new-account provisioning creates one private empty profile and cannot spoof its owner',async t=>{
  const h=await fixture(t);h.seed('mother',owner,'Mother');assert.deepEqual((await (await h.call(h.tokens.other,'/api/profiles')).json()).profiles,[]);
  const responses=await Promise.all([1,2].map(()=>h.call(h.tokens.other,'/api/profiles','POST',{name:'Mine',personal:true,owner_email:owner}))),ids=await Promise.all(responses.map(async r=>(await r.json()).id));assert.equal(ids[0],ids[1]);
  const list=(await (await h.call(h.tokens.other,'/api/profiles')).json()).profiles;assert.equal(list.length,1);assert.equal(list[0].role,'owner');
  const state=await (await h.call(h.tokens.other,`/api/profiles/${ids[0]}/state`)).json();assert.deepEqual(state.data.results,[]);assert.equal((await h.call(h.tokens.owner,`/api/profiles/${ids[0]}/state`)).status,404);
  assert.equal((await h.call(h.tokens.other,'/api/profiles','POST',{name:'x'},'https://attacker.test')).status,403);
});
test('PDF storage is profile-scoped and foreign file references cannot be saved',async t=>{
  const h=await fixture(t);h.seed('mother',owner,'Mother');h.seed('father',dad,'Father');const bytes=new TextEncoder().encode('%PDF-synthetic'),id='pdf_'+Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  assert.equal((await h.call(h.tokens.owner,`/api/profiles/mother/documents/${id}`,'PUT','%PDF-synthetic')).status,200);assert.ok(h.files.has('mother/'+id));
  assert.equal((await h.call(h.tokens.dad,`/api/profiles/father/documents/${id}`)).status,404);assert.equal((await h.call(h.tokens.dad,`/api/profiles/mother/documents/${id}`)).status,404);
  assert.equal((await h.call(h.tokens.dad,'/api/profiles/father/state','PUT',{revision:0,data:{...empty('Father'),documents:[{id,name:'synthetic.pdf',size:bytes.length}]}})).status,400);
});
test('writes validate data, origins, revisions and retain separate per-profile histories',async t=>{
  const h=await fixture(t);h.seed('mother',owner,'Mother');h.seed('father',dad,'Father');const p='/api/profiles/mother/state';
  assert.equal((await h.call(h.tokens.owner,p,'PUT',{revision:0,data:empty('Mother')},'https://attacker.test')).status,403);
  assert.equal((await h.call(h.tokens.owner,p,'PUT',{revision:0,data:empty('Mother')})).status,200);assert.equal((await h.call(h.tokens.owner,p,'PUT',{revision:0,data:empty('Mother')})).status,409);
  assert.equal((await h.call(h.tokens.owner,p,'PUT',{revision:1,data:{...empty('Mother'),results:[{date:'bad'}]}})).status,400);
  assert.equal((await h.call(h.tokens.dad,'/api/profiles/father/state','PUT',{revision:0,data:empty('Father')})).status,200);
  for(const id of ['mother','father'])assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM kema_profile_history WHERE profile_id=?').get(id).n,1);
});
test('legacy migration preserves records, history and viewers and is idempotent',async t=>{
  const h=await fixture(t),data=JSON.stringify(empty('Existing mother'));h.db.prepare("UPDATE kema_state SET data=?,revision=7 WHERE id='main'").run(data);h.db.prepare('INSERT INTO kema_history(revision,data) VALUES(?,?)').run(6,data);h.db.prepare('INSERT INTO kema_roles(email,role) VALUES(?,?)').run(other,'viewer');
  for(let i=0;i<2;i++)for(const q of legacyProfileMigration(owner))h.db.prepare(q.sql).run(...q.params);
  const r=h.db.prepare('SELECT * FROM kema_profile_state').get();assert.equal(r.data,data);assert.equal(r.revision,7);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM kema_profile_history').get().n,1);
  assert.equal((await (await h.call(h.tokens.other,'/api/profiles/family-main/session')).json()).role,'viewer');assert.equal((await h.call(h.tokens.dad,'/api/profiles/family-main/state')).status,404);
});
test('bounded reads enforce streaming limits',async()=>{await assert.rejects(()=>boundedBody(new Request(origin,{method:'POST',body:'123456'}),5),{status:413});assert.equal((await boundedBody(new Request(origin,{method:'POST',body:'123'}),5)).length,3);});
