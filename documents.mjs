const DB_NAME='kema.documents.v1';
const STORE='pdfs';
let connection;
async function database(){
  if(!globalThis.indexedDB)throw new Error('هذا المتصفح لا يدعم حفظ المرفقات. جرّب متصفحًا حديثًا.');
  if(!connection)connection=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('تعذّر فتح مخزن ملفات PDF. تأكد أن التخزين مسموح.'));
    request.onblocked=()=>reject(new Error('أغلق النوافذ القديمة للموقع وأعد المحاولة.'));
  }).catch(error=>{connection=null;throw error;});
  return connection;
}
export async function readDocument(id){
  const db=await database();
  return new Promise((resolve,reject)=>{const request=db.transaction(STORE,'readonly').objectStore(STORE).get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(new Error('تعذّر قراءة ملف PDF.'));});
}
export async function putDocuments(files){
  if(!files.length)return;
  const db=await database();
  await new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readwrite'),store=transaction.objectStore(STORE);
    for(const file of files)store.put(file.blob,file.id);
    transaction.oncomplete=resolve;
    transaction.onerror=()=>reject(new Error('تعذّر حفظ المرفقات. قد تكون مساحة المتصفح غير كافية.'));
    transaction.onabort=()=>reject(new Error('لم يكتمل حفظ المرفقات. لم تتغير النتائج.'));
  });
}
export async function inspectPDF(file){
  if(!file||file.size>15*1024*1024||file.size<5)throw new Error('اختار ملف PDF بحجم لا يتجاوز 15 ميجابايت.');
  const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
  if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Error('محتوى الملف ليس PDF صالحًا.');
  const hash=await crypto.subtle.digest('SHA-256',buffer),id='pdf_'+[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return {meta:{id,name:file.name||'report.pdf',size:file.size,type:'application/pdf'},blob:new Blob([buffer],{type:'application/pdf'})};
}
export async function exportDocuments(documents){
  const files=[],missing=[];
  for(const doc of documents){
    const blob=await readDocument(doc.id);if(!blob){missing.push(doc);continue;}
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    files.push({id:doc.id,data:btoa(binary)});
  }
  return {files,missing};
}
export async function decodeDocuments(data){
  const decoded=[];
  for(const file of data.files||[]){
    const binary=atob(file.data),buffer=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const meta=data.documents.find(d=>d.id===file.id);
    if(buffer.length!==meta.size)throw new Error('حجم مرفق PDF لا يطابق النسخة الاحتياطية.');
    const checked=await inspectPDF(new File([buffer],meta.name,{type:'application/pdf'}));
    if(checked.meta.id!==file.id)throw new Error('محتوى مرفق PDF لا يطابق بصمته.');
    decoded.push({id:file.id,blob:checked.blob});
  }
  return decoded;
}
