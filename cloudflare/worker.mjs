import { validateBackup } from '../public/core.mjs';

const LIMIT=1024*1024;
const securityHeaders={
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'same-origin',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...securityHeaders,'Content-Type':'application/json; charset=utf-8'}});
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export async function boundedBody(request,limit){
  if(Number(request.headers.get('Content-Length'))>limit)throw new HttpError(413,'حجم البيانات أكبر من الحد المسموح.');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw new HttpError(413,'حجم البيانات أكبر من الحد المسموح.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
function decode(part){return Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export async function verifyAccess(token,env,fetcher=fetch){
  if(!env.ACCESS_TEAM||!env.ACCESS_AUD)throw new HttpError(503,'تسجيل الدخول الآمن قيد التجهيز.');
  if(!token||token.length>16384)throw new HttpError(401,'سجّل الدخول لفتح سجلك.');
  try{
    const parts=token.split('.');if(parts.length!==3)throw new Error();
    const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const issuer=`https://${env.ACCESS_TEAM}.cloudflareaccess.com`,now=Date.now()/1000;
    // Access authorizes identities through this application's policy. Only its
    // signed, unexpired application token is accepted; no second email list.
    if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256||claims.iss!==issuer||!Number.isFinite(claims.exp)||claims.exp<=now||(claims.nbf&&claims.nbf>now+30)||!Array.isArray(claims.aud)||!claims.aud.includes(env.ACCESS_AUD)||typeof claims.email!=='string'||!claims.email.trim())throw new Error();
    const response=await fetcher(`${issuer}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(5000),cf:{cacheTtl:3600,cacheEverything:true}});
    if(!response.ok)throw new Error();
    const {keys}=await response.json(),jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw new Error();
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts.slice(0,2).join('.'))))throw new Error();
    return claims.email;
  }catch{throw new HttpError(401,'انتهت جلسة الدخول. أعد فتح الموقع لتسجيل الدخول.');}
}
export function checkOrigin(request){
  const origin=request.headers.get('Origin');
  if(origin!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw new HttpError(403,'طلب الحفظ يجب أن يأتي من موقع Kema نفسه.');
}
async function stateAPI(request,env){
  if(request.method==='GET'){
    const row=await env.DB.prepare("SELECT revision,data,updated_at FROM kema_state WHERE id='main'").first();
    return json({revision:row.revision,data:row.data?JSON.parse(row.data):null,updatedAt:row.updated_at});
  }
  if(request.method!=='PUT')return json({error:'طريقة غير مدعومة.'},405);
  checkOrigin(request);
  let input;try{input=JSON.parse(new TextDecoder().decode(await boundedBody(request,LIMIT)));}catch(error){if(error.status)throw error;throw new HttpError(400,'صيغة البيانات غير صالحة.');}
  if(!Number.isSafeInteger(input.revision)||input.revision<0)throw new HttpError(400,'إصدار السجل غير صالح.');
  if(input.data?.files?.length)throw new HttpError(400,'ارفع المرفقات من مسار الملفات المخصص.');
  let data;try{data=validateBackup(input.data);}catch(error){throw new HttpError(400,error.message);}
  if(data.documents.length>500||data.trash.length>25000)throw new HttpError(413,'عدد المرفقات أو المحذوفات أكبر من الحد المسموح.');
  for(const list of [data.results,data.medications])if(new Set(list.map(r=>r.id)).size!==list.length)throw new HttpError(400,'معرّفات سجلات مكررة.');
  const old=await env.DB.prepare("SELECT data,revision FROM kema_state WHERE id='main'").first();
  if(old.revision!==input.revision)return json({error:'السجل اتغيّر من جهاز تاني. راجع النسختين قبل المزامنة.',conflict:true},409);
  const prior=new Set(old.data?JSON.parse(old.data).documents?.map(d=>d.id):[]);
  for(const doc of data.documents.filter(d=>!prior.has(d.id))){const file=await env.PDFS.head(doc.id);if(!file||file.size!==doc.size)throw new HttpError(400,'ارفع ملفات PDF المرفقة أولًا قبل حفظ السجل.');}
  const serialized=JSON.stringify(data);if(new TextEncoder().encode(serialized).length>LIMIT)throw new HttpError(413,'السجل أكبر من الحد المدعوم للمزامنة.');
  const at=new Date().toISOString();
  const result=await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO kema_history(revision,data,updated_at) SELECT revision,data,updated_at FROM kema_state WHERE id='main' AND revision=? AND data IS NOT NULL").bind(input.revision),
    env.DB.prepare("UPDATE kema_state SET data=?,revision=revision+1,updated_at=? WHERE id='main' AND revision=?").bind(serialized,at,input.revision),
    env.DB.prepare('DELETE FROM kema_history WHERE revision < ?').bind(Math.max(0,input.revision-29))
  ]);
  if(result[1].meta.changes!==1)return json({error:'السجل اتغيّر من جهاز تاني. راجع النسختين قبل المزامنة.',conflict:true},409);
  return json({revision:input.revision+1,updatedAt:at});
}
async function documentAPI(request,env,id){
  if(!/^pdf_[a-f0-9]{64}$/.test(id))throw new HttpError(400,'معرّف الملف غير صالح.');
  if(request.method==='PUT'){
    checkOrigin(request);const bytes=await boundedBody(request,15*1024*1024);
    if(bytes.length<5||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new HttpError(400,'محتوى الملف ليس PDF.');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(id!==`pdf_${hash}`)throw new HttpError(400,'بصمة الملف غير مطابقة.');
    await env.PDFS.put(id,bytes,{httpMetadata:{contentType:'application/pdf'}});return json({ok:true});
  }
  if(!['GET','HEAD'].includes(request.method))return json({error:'طريقة غير مدعومة.'},405);
  const file=await (request.method==='HEAD'?env.PDFS.head(id):env.PDFS.get(id));if(!file)return json({error:'الملف غير موجود.'},404);
  return new Response(request.method==='HEAD'?null:file.body,{headers:{...securityHeaders,'Content-Type':'application/pdf','Content-Length':String(file.size),'Content-Disposition':'inline; filename="report.pdf"'}});
}
export default {
  async fetch(request,env){
    try{
      const url=new URL(request.url),path=url.pathname;
      if(path==='/api/config')return json({cloud:true,ready:Boolean(env.ACCESS_TEAM&&env.ACCESS_AUD),login:'/cdn-cgi/access/login'});
      if(path.startsWith('/api/')){
        await verifyAccess(request.headers.get('Cf-Access-Jwt-Assertion'),env);
        if(path==='/api/state')return await stateAPI(request,env);
        if(path.startsWith('/api/documents/'))return await documentAPI(request,env,path.slice('/api/documents/'.length));
        return json({error:'المسار غير موجود.'},404);
      }
      if(!['GET','HEAD'].includes(request.method))return json({error:'طريقة غير مدعومة.'},405);
      let response=await env.ASSETS.fetch(request);
      if(response.headers.get('Content-Type')?.includes('text/html'))response=new HTMLRewriter().on('head',{element(head){head.append('<meta name="kema-cloud" content="1">',{html:true});}}).transform(response);
      const headers=new Headers(response.headers);for(const [k,v]of Object.entries(securityHeaders))headers.set(k,v);
      return new Response(response.body,{status:response.status,headers});
    }catch(error){if(!error.status)console.error(JSON.stringify({event:'request_error',message:'Internal request failure'}));return json({error:error.status?error.message:'تعذّر إتمام الطلب. حاول مرة تانية.'},error.status||500);}
  }
};
