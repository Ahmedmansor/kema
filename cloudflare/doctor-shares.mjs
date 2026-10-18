import {selectReportData} from '../public/report.mjs';
import {completeGuestRecord,guestClinical} from './guest-data.mjs';
export const hashShareToken=async token=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(b=>b.toString(16).padStart(2,'0')).join('');
// Recoverable for the owner without storing bearer tokens in the database.
export async function deriveShareToken(secret,id,profileId){
  if(typeof secret!=='string'||secret.length<32)throw Object.assign(new Error('خدمة استرجاع روابط الطبيب قيد التجهيز.'),{status:503});
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['kema-doctor-link-v1',profileId,id]))))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function createDoctorShares({json,checkOrigin,boundedBody}){
  const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
  return async function sharesAPI(request,env,session){
    if(session.role!=='owner')fail(403,'إنشاء روابط الطبيب وإلغاؤها متاح لصاحب الملف فقط.');
    if(request.method==='GET'){
      const rows=await env.DB.prepare('SELECT id,label,created_at,expires_at,revoked_at,token_hash FROM kema_doctor_shares WHERE profile_id=? ORDER BY created_at DESC LIMIT 50').bind(session.profileId).all();
      const now=Math.floor(Date.now()/1000),shares=await Promise.all(rows.results.map(async({token_hash,...row})=>{
        if(row.revoked_at||row.expires_at<=now)return row;
        if(!env.SHARE_LINK_KEY||!env.SHARE_ORIGIN)return {...row,linkUnavailable:'unavailable'};
        const token=await deriveShareToken(env.SHARE_LINK_KEY,row.id,session.profileId);
        return await hashShareToken(token)===token_hash?{...row,url:env.SHARE_ORIGIN.replace(/\/$/,'')+'/#'+token}:{...row,linkUnavailable:'legacy'};
      }));return json({shares});
    }
    if(!['POST','DELETE'].includes(request.method))return json({error:'طريقة غير مدعومة.'},405);
    checkOrigin(request);let input;try{input=JSON.parse(new TextDecoder().decode(await boundedBody(request,4096)));}catch(error){if(error.status)throw error;fail(400,'بيانات المشاركة غير صالحة.');}
    const now=Math.floor(Date.now()/1000);
    if(request.method==='DELETE'){
      if(typeof input.id!=='string'||input.id.length>80)fail(400,'الرابط غير صالح.');
      const result=await env.DB.prepare("UPDATE kema_doctor_shares SET revoked_at=?,snapshot='' WHERE id=? AND profile_id=?").bind(now,input.id,session.profileId).run();
      if(!result.meta.changes)fail(404,'الرابط غير متاح.');return json({ok:true});
    }
    if(!env.SHARE_ORIGIN)fail(503,'خدمة روابط الطبيب قيد التجهيز.');
    if(![24,72,168].includes(input.hours)||!['full','all','latest'].includes(input.mode)||input.consent!==true)fail(400,'اختَر مدة ونوع المشاركة وأكد موافقتك.');
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM kema_doctor_shares WHERE profile_id=? AND expires_at>? AND revoked_at IS NULL').bind(session.profileId,now).first();if(count.n>=20)fail(413,'ألغِ رابطًا قديمًا قبل إضافة رابط جديد.');
    const row=await env.DB.prepare('SELECT data FROM kema_profile_state WHERE profile_id=?').bind(session.profileId).first();
    let snapshot;try{const data=JSON.parse(row.data);if(input.mode==='full'){snapshot={...completeGuestRecord(data),guestScope:'full-live'};}else{snapshot=selectReportData(data,{from:input.from||'',to:input.to||'',latestOnly:input.mode==='latest',medications:input.medications===true,alerts:input.alerts===true,includeName:input.includeName===true});snapshot.clinical=guestClinical(data,{from:input.from||'',to:input.to||'',latestOnly:input.mode==='latest',latestDate:snapshot.results.map(r=>r.date).sort().at(-1),medications:input.medications===true,clinical:input.clinical===true,undated:input.undated===true});snapshot.guestVersion=1;}}catch(error){fail(400,error.message);}
    if(snapshot.alerts)snapshot.alerts=snapshot.alerts.map(({text,date,doctor})=>({text,date,doctor}));
    const id=crypto.randomUUID(),token=await deriveShareToken(env.SHARE_LINK_KEY,id,session.profileId),hash=await hashShareToken(token),expires=now+input.hours*3600,label=typeof input.label==='string'?input.label.trim().slice(0,80):'رابط للطبيب';
    await env.DB.prepare('INSERT INTO kema_doctor_shares(id,profile_id,token_hash,label,snapshot,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,session.profileId,hash,label||'رابط للطبيب',JSON.stringify(snapshot),now,expires).run();
    return json({id,url:env.SHARE_ORIGIN.replace(/\/$/,'')+'/#'+token,expiresAt:new Date(expires*1000).toISOString(),results:snapshot.results.length,live:input.mode==='full'},201);
  };
}
