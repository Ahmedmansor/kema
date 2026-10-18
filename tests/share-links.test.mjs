import test from 'node:test';import assert from 'node:assert/strict';
import {doctorShareRow} from '../public/cloud.mjs';
import {deriveShareToken} from '../cloudflare/doctor-shares.mjs';
const e=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
test('owner share rows display recopyable active links and explain legacy links without reviving expired shares',()=>{
 const ctx={e,stamp:()=> 'time',now:100},share={id:'id-1',label:'<Doctor>',expires_at:200,url:'https://share.test/#token'};
 let html=doctorShareRow(share,ctx);assert.match(html,/readonly/);assert.match(html,/data-field="doctor-share-url-id-1"/);assert.match(html,/https:\/\/share.test\/#token/);assert.doesNotMatch(html,/<Doctor>/);
 for(const patch of [{expires_at:50},{revoked_at:1}]){html=doctorShareRow({...share,...patch},ctx);assert.doesNotMatch(html,/copy-doctor-share|https:\/\/share/);}
 html=doctorShareRow({...share,url:undefined,linkUnavailable:'legacy'},ctx);assert.match(html,/رابط قديم/);assert.doesNotMatch(html,/copy-doctor-share/);
});
test('recoverable tokens are stable but bound to server secret, profile and share ID',async()=>{
 const key='test-only-secret-at-least-thirty-two-characters',token=await deriveShareToken(key,'id','profile');assert.match(token,/^[a-f0-9]{64}$/);assert.equal(await deriveShareToken(key,'id','profile'),token);
 for(const args of [[key,'id2','profile'],[key,'id','other'],[key+'2','id','profile']])assert.notEqual(await deriveShareToken(...args),token);
 await assert.rejects(()=>deriveShareToken(undefined,'id','profile'),{status:503});
});
