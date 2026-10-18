import {hashShareToken} from './doctor-shares.mjs';
import {completeGuestRecord} from './guest-data.mjs';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow, noarchive','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
export default {async fetch(request,env){
  try{
    const path=new URL(request.url).pathname;
    if(path==='/view'){
      if(request.method!=='POST')return json({error:'طريقة غير مدعومة.'},405);
      if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'طلب غير مسموح.'},403);
      const reader=request.body?.getReader();let body='',length=0;if(!reader)return json({error:'الرابط غير صالح.'},404);
      while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>512){await reader.cancel();return json({error:'طلب أكبر من المسموح.'},413);}body+=new TextDecoder().decode(value);}
      let token;try{token=JSON.parse(body).token;}catch{return json({error:'الرابط غير صالح.'},404);}
      if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return json({error:'الرابط غير صالح أو انتهى.'},404);
      const row=await env.DB.prepare('SELECT snapshot,expires_at,profile_id FROM kema_doctor_shares WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').bind(await hashShareToken(token),Math.floor(Date.now()/1000)).first();
      if(!row)return json({error:'الرابط غير صالح أو انتهى أو ألغاه صاحبه.'},404);
      let snapshot=JSON.parse(row.snapshot),live=false;
      if(snapshot.guestScope==='full-live'){
        const record=await env.DB.prepare('SELECT data FROM kema_profile_state WHERE profile_id=?').bind(row.profile_id).first();
        if(!record)return json({error:'السجل غير متاح.'},404);
        snapshot=completeGuestRecord(JSON.parse(record.data));live=true;
      }
      return json({snapshot,live,expiresAt:new Date(row.expires_at*1000).toISOString()});
    }
    if(!['GET','HEAD'].includes(request.method)||!['/','/index.html','/app.mjs','/chart-ranges.mjs','/theme.mjs','/theme-init.js','/themes.css','/guest-session.mjs','/enhancements.mjs','/enhancements.css','/chart-prescriptions.mjs','/documents.mjs','/pdf-viewer.mjs','/cloud.mjs','/profiles.mjs','/mark.svg','/styles.css','/clinical.css','/clinical.mjs','/clinical-presentation.mjs','/medication-register.mjs','/timeline.mjs','/prescription-curve.mjs','/report.mjs','/report.css','/core.mjs','/clinical-core.mjs'].includes(path))return json({error:'المسار غير موجود.'},404);
    const response=await env.ASSETS.fetch(request);const h=new Headers(response.headers);for(const [key,value]of Object.entries(headers))h.set(key,value);return new Response(response.body,{status:response.status,headers:h});
  }catch{return json({error:'تعذّر فتح التقرير الآن.'},500);}
}};
