import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {selectReportData,buildClinicalReport} from '../public/report.mjs';
import {createDoctorShares} from '../cloudflare/doctor-shares.mjs';
import viewer from '../cloudflare/share-worker.mjs';
const row={testId:'hba1c',name:'<script>bad</script>',value:6,unit:'%',refMin:null,refMax:5.7,date:'2026-10-15',lab:'Lab',doctor:'Doctor',group:'sugar',notes:'PRIVATE',documentIds:['PRIVATE']};
const data={profile:{name:'Patient'},results:[row,{...row,testId:'ldl',unit:'mg/dL',group:'lipids'},{...row,date:'2025-01-01'}],medications:[{name:'Recorded medication',dose:'1',start:'2025-01-01',end:''}],trash:['PRIVATE']};

test('full guest links read current data only for their bound profile, with history and no write endpoints',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());for(const f of ['profiles-schema.sql','shares-schema.sql'])db.exec(await readFile(new URL('../cloudflare/'+f,import.meta.url),'utf8'));
 const clinical={version:2,doctors:[{id:'d',name:'Doctor',specialty:'Neuro'}],visits:[{id:'v',doctorId:'d',date:'',notes:'Visit note',source:'PRIVATE EXTRACTION'}],prescriptions:[{id:'rx',visitId:'v',name:'Medicine',instructions:'Instructions',notes:'Medicine note'}],events:[{id:'e',visitId:'v',kind:'warning',text:'Warning',pinned:true}]};
 for(const id of ['p','other']){db.prepare('INSERT INTO kema_profiles(id,name,owner_email,created_at) VALUES(?,?,?,?)').run(id,id,id+'@test','now');db.prepare('INSERT INTO kema_profile_state(profile_id,data) VALUES(?,?)').run(id,JSON.stringify(id==='p'?{...data,clinical}:{...data,profile:{name:'OTHER PATIENT'}}));}
 const env={SHARE_ORIGIN:'https://share.test',DB:{prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args);},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};}};}}};
 const api=createDoctorShares({json:(d,s=200)=>Response.json(d,{status:s}),checkOrigin:()=>{},boundedBody:async r=>new Uint8Array(await r.arrayBuffer())});
 const input={hours:24,mode:'full',consent:true,profileId:'other',from:'2099-01-01'};
 await assert.rejects(()=>api(new Request('https://main.test/api/shares',{method:'POST',body:JSON.stringify(input)}),env,{role:'editor',profileId:'p'}),{status:403});
 const created=await (await api(new Request('https://main.test/api/shares',{method:'POST',body:JSON.stringify(input)}),env,{role:'owner',profileId:'p'})).json();assert.equal(created.live,true);
 const request=()=>new Request('https://share.test/view',{method:'POST',headers:{Origin:'https://share.test'},body:JSON.stringify({token:created.url.split('#')[1],profileId:'other'})});
 let response=await (await viewer.fetch(request(),env)).json();assert.equal(response.live,true);assert.equal(response.snapshot.profile.name,'Patient');assert.equal(response.snapshot.clinical.prescriptions.length,1);assert.equal(response.snapshot.clinical.events[0].pinned,true);assert.equal(response.snapshot.clinical.visits[0].notes,'Visit note');assert.equal(response.snapshot.clinical.prescriptions[0].notes,'Medicine note');assert.ok(!JSON.stringify(response).includes('PRIVATE EXTRACTION'));assert.ok(!('trash' in response.snapshot));
 db.prepare('UPDATE kema_profile_state SET data=? WHERE profile_id=?').run(JSON.stringify({...data,clinical,results:[],profile:{name:'Updated patient'}}),'p');response=await (await viewer.fetch(request(),env)).json();assert.equal(response.snapshot.profile.name,'Updated patient');assert.equal(response.snapshot.results.length,0);
 for(const method of ['PUT','POST','DELETE'])for(const path of ['/api/state','/api/profiles/other/state','/api/shares'])assert.equal((await viewer.fetch(new Request('https://share.test'+path,{method}),env)).status,404);
 db.prepare('UPDATE kema_doctor_shares SET revoked_at=1').run();assert.equal((await viewer.fetch(request(),env)).status,404);
});
test('report includes latest visit and all series, escapes labels and strips private metadata',()=>{
 const selected=selectReportData(data);assert.equal(selected.results.length,3);assert.equal(selected.medications.length,0);assert.ok(!JSON.stringify(selected).includes('PRIVATE'));
 assert.equal(selectReportData(data,{latestOnly:true}).results.length,2);assert.equal(selectReportData(data,{includeName:false}).profile.name,'');
 const html=buildClinicalReport(selected);assert.equal((html.match(/class="report-chart"/g)||[]).length,2);assert.ok(html.includes('Glycated Hemoglobin'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('قياس واحد فقط'));
 assert.throws(()=>selectReportData(data,{from:'2027-01-01'}));
});
test('doctor links require owner consent, store hashes, freeze snapshots, expire and revoke without exposing other records',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());for(const f of ['profiles-schema.sql','shares-schema.sql'])db.exec(await readFile(new URL('../cloudflare/'+f,import.meta.url),'utf8'));
 db.prepare('INSERT INTO kema_profiles(id,name,owner_email,created_at) VALUES(?,?,?,?)').run('p','Patient','owner@test','now');db.prepare('INSERT INTO kema_profile_state(profile_id,data) VALUES(?,?)').run('p',JSON.stringify(data));
 const env={SHARE_ORIGIN:'https://share.test',DB:{prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return db.prepare(sql).get(...this.args);},async all(){return {results:db.prepare(sql).all(...this.args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};}};}}};
 const api=createDoctorShares({json:(d,s=200)=>Response.json(d,{status:s}),checkOrigin:()=>{},boundedBody:async r=>new Uint8Array(await r.arrayBuffer())});
 const request=body=>new Request('https://main.test/api/shares',{method:'POST',body:JSON.stringify(body)}),input={hours:24,mode:'all',consent:true};
 await assert.rejects(()=>api(request(input),env,{role:'viewer',profileId:'p'}),{status:403});await assert.rejects(()=>api(request({...input,consent:false}),env,{role:'owner',profileId:'p'}),{status:400});
 const created=await (await api(request(input),env,{role:'owner',profileId:'p'})).json(),token=created.url.split('#')[1];assert.match(token,/^[a-f0-9]{64}$/);assert.notEqual(db.prepare('SELECT token_hash FROM kema_doctor_shares').get().token_hash,token);
 db.prepare('UPDATE kema_profile_state SET data=?').run(JSON.stringify({...data,results:[]}));
 const view=(tok=token,origin='https://share.test')=>viewer.fetch(new Request('https://share.test/view',{method:'POST',headers:{Origin:origin},body:JSON.stringify({token:tok})}),env);
 assert.equal((await (await view()).json()).snapshot.results.length,3);assert.equal((await view('0'.repeat(64))).status,404);assert.equal((await view(token,'https://evil.test')).status,403);
 assert.equal((await viewer.fetch(new Request('https://share.test/api/profiles'),env)).status,404);
 await assert.rejects(()=>api(new Request('https://main.test/api/shares',{method:'DELETE',body:JSON.stringify({id:created.id})}),env,{role:'owner',profileId:'other'}),{status:404});
 db.prepare('UPDATE kema_doctor_shares SET expires_at=1').run();assert.equal((await view()).status,404);db.prepare('UPDATE kema_doctor_shares SET expires_at=?').run(Date.now()/1000+3600);
 await api(new Request('https://main.test/api/shares',{method:'DELETE',body:JSON.stringify({id:created.id})}),env,{role:'owner',profileId:'p'});assert.equal((await view()).status,404);assert.equal(db.prepare('SELECT snapshot FROM kema_doctor_shares').get().snapshot,'');
});
