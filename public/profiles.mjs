export const accountScope=(email,id)=>`kema.cloud.v2.${encodeURIComponent(email.toLowerCase())}.${id}`;
export async function cloudRequest(path,options={}){
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),...options});
  let data;try{data=await response.json();}catch{throw new Error('أعد فتح الموقع لتسجيل الدخول.');}
  if(!response.ok){const error=new Error(data.error||'تعذّر فتح الحساب.');error.status=response.status;throw error;}return data;
}
export async function prepareCloudAccount(){
  const identity=await cloudRequest('/api/session');
  let {profiles}=await cloudRequest('/api/profiles');
  if(!profiles.length){
    await cloudRequest('/api/profiles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'سجلي الصحي',personal:true})});
    ({profiles}=await cloudRequest('/api/profiles'));
  }
  const selectionKey=`kema.profile.selection.${encodeURIComponent(identity.email)}`;
  const requested=new URL(location.href).searchParams.get('profile');
  let prior;try{prior=localStorage.getItem(selectionKey);}catch{/* Selection is optional. */}
  const selected=profiles.find(p=>p.id===(requested||prior))||(!requested?profiles[0]:null);
  if(!selected)throw new Error('الملف المطلوب غير متاح لحسابك. افتح رابط Kema الأساسي لاختيار ملف مسموح.');
  try{localStorage.setItem(selectionKey,selected.id);}catch{/* Server authorization does not depend on this value. */}
  return {identity,profiles,selected,selectionKey,scope:accountScope(identity.email,selected.id),base:`/api/profiles/${encodeURIComponent(selected.id)}`};
}
