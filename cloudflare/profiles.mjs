// All authorization is per profile. Being the Cloudflare account owner is not
// a shortcut to another person's record.
export function createProfileAPI({json,boundedBody,checkOrigin}){
  const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
  const read=async request=>{try{return JSON.parse(new TextDecoder().decode(await boundedBody(request,4096)));}catch(error){if(error.status)throw error;fail(400,'البيانات غير صالحة.');}};
  const emailOf=value=>{
    const email=typeof value==='string'?value.trim().toLowerCase():'';
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'اكتب إيميلًا صحيحًا.');
    return email;
  };
  async function sessionFor(identity,env,id){
    const row=await env.DB.prepare(`SELECT p.id,p.name,p.owner_email,m.role
      FROM kema_profiles p LEFT JOIN kema_profile_members m ON m.profile_id=p.id AND m.email=?
      WHERE p.id=? AND (p.owner_email=? OR m.email IS NOT NULL)`)
      .bind(identity.email,id,identity.email).first();
    if(!row)fail(404,'الملف غير متاح لهذا الحساب.');
    return {...identity,profileId:row.id,profileName:row.name,role:row.owner_email===identity.email?'owner':row.role};
  }
  async function profilesAPI(request,env,identity){
    if(request.method==='GET'){
      const rows=await env.DB.prepare(`SELECT p.id,COALESCE(json_extract(s.data,'$.profile.name'),p.name) AS name,
        CASE WHEN p.owner_email=? THEN 'owner' ELSE m.role END AS role
        FROM kema_profiles p JOIN kema_profile_state s ON s.profile_id=p.id
        LEFT JOIN kema_profile_members m ON m.profile_id=p.id AND m.email=?
        WHERE p.owner_email=? OR m.email IS NOT NULL ORDER BY p.created_at,p.id`)
        .bind(identity.email,identity.email,identity.email).all();
      return json({profiles:rows.results});
    }
    if(request.method!=='POST')return json({error:'طريقة غير مدعومة.'},405);
    checkOrigin(request);const input=await read(request);
    const name=typeof input.name==='string'?input.name.trim().replace(/[\x00-\x1f]/g,'').slice(0,120):'';
    if(!name)fail(400,'اكتب اسم صاحب الملف.');
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM kema_profiles WHERE owner_email=?').bind(identity.email).first();
    if(count.n>=50)fail(413,'وصلت للحد المتاح من الملفات.');
    const id=crypto.randomUUID(),at=new Date().toISOString(),personal=input.personal===true?identity.email:null;
    const data=JSON.stringify({schemaVersion:1,profile:{name},results:[],medications:[],documents:[],trash:[]});
    if(personal){
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO kema_profiles(id,name,owner_email,personal_email,created_at) VALUES(?,?,?,?,?)').bind(id,name,identity.email,personal,at),
        env.DB.prepare('INSERT OR IGNORE INTO kema_profile_state(profile_id,data,updated_at) SELECT id,?,? FROM kema_profiles WHERE personal_email=?').bind(data,at,personal)
      ]);
      const row=await env.DB.prepare('SELECT id FROM kema_profiles WHERE personal_email=?').bind(personal).first();return json({id:row.id},201);
    }
    await env.DB.batch([
      env.DB.prepare('INSERT INTO kema_profiles(id,name,owner_email,created_at) VALUES(?,?,?,?)').bind(id,name,identity.email,at),
      env.DB.prepare('INSERT INTO kema_profile_state(profile_id,data,updated_at) VALUES(?,?,?)').bind(id,data,at)
    ]);
    return json({id},201);
  }
  async function rolesAPI(request,env,session){
    if(session.role!=='owner')fail(403,'مشاركة الملف متاحة لصاحب هذا الملف فقط.');
    if(request.method==='GET'){
      const rows=await env.DB.prepare('SELECT email,role FROM kema_profile_members WHERE profile_id=? ORDER BY email').bind(session.profileId).all();
      return json({roles:rows.results,owner:session.email});
    }
    if(!['PUT','DELETE'].includes(request.method))return json({error:'طريقة غير مدعومة.'},405);
    checkOrigin(request);const input=await read(request),email=emailOf(input.email);
    if(email===session.email)fail(400,'صلاحية صاحب الملف ثابتة.');
    if(request.method==='DELETE'){
      await env.DB.prepare('DELETE FROM kema_profile_members WHERE profile_id=? AND email=?').bind(session.profileId,email).run();return json({ok:true});
    }
    if(!['editor','viewer'].includes(input.role))fail(400,'اختَر صلاحية قراءة أو تعديل.');
    await env.DB.prepare('INSERT INTO kema_profile_members(profile_id,email,role) VALUES(?,?,?) ON CONFLICT(profile_id,email) DO UPDATE SET role=excluded.role').bind(session.profileId,email,input.role).run();
    return json({ok:true});
  }
  return {sessionFor,profilesAPI,rolesAPI};
}
