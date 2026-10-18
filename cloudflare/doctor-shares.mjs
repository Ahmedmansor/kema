import {selectReportData} from '../public/report.mjs';
export const hashShareToken=async token=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function createDoctorShares({json,checkOrigin,boundedBody}){
  const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
  return async function sharesAPI(request,env,session){
    if(session.role!=='owner')fail(403,'إنشاء روابط الطبيب وإلغاؤها متاح لصاحب الملف فقط.');
    if(request.method==='GET'){
      const rows=await env.DB.prepare('SELECT id,label,created_at,expires_at,revoked_at FROM kema_doctor_shares WHERE profile_id=? ORDER BY created_at DESC LIMIT 50').bind(session.profileId).all();return json({shares:rows.results});
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
    if(![24,72,168].includes(input.hours)||!['all','latest'].includes(input.mode)||input.consent!==true)fail(400,'اختَر مدة ونوع المشاركة وأكد موافقتك.');
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM kema_doctor_shares WHERE profile_id=? AND expires_at>? AND revoked_at IS NULL').bind(session.profileId,now).first();if(count.n>=20)fail(413,'ألغِ رابطًا قديمًا قبل إضافة رابط جديد.');
    const row=await env.DB.prepare('SELECT data FROM kema_profile_state WHERE profile_id=?').bind(session.profileId).first();
    let snapshot;try{snapshot=selectReportData(JSON.parse(row.data),{from:input.from||'',to:input.to||'',latestOnly:input.mode==='latest',medications:input.medications===true,alerts:input.alerts===true,includeName:input.includeName===true});}catch(error){fail(400,error.message);}
    const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join(''),hash=await hashShareToken(token),id=crypto.randomUUID(),expires=now+input.hours*3600,label=typeof input.label==='string'?input.label.trim().slice(0,80):'رابط للطبيب';
    await env.DB.prepare('INSERT INTO kema_doctor_shares(id,profile_id,token_hash,label,snapshot,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,session.profileId,hash,label||'رابط للطبيب',JSON.stringify(snapshot),now,expires).run();
    return json({id,url:env.SHARE_ORIGIN.replace(/\/$/,'')+'/#'+token,expiresAt:new Date(expires*1000).toISOString(),results:snapshot.results.length},201);
  };
}
