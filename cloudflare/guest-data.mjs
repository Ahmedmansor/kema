import {activeClinical} from '../public/clinical-core.mjs';
export function completeGuestRecord(db){
 const c=activeClinical(db.clinical);
 return {schemaVersion:1,profile:{name:db.profile?.name||''},results:db.results.map(({id,testId,name,value,unit,refMin,refMax,date,lab,doctor,group,notes})=>({id,testId,name,value,unit,refMin,refMax,date,lab,doctor,group,notes})),medications:(db.medications||[]).map(({id,name,dose,start,end,group,notes})=>({id,name,dose,start,end,group,notes})),clinical:{version:2,doctors:c.doctors.map(({id,name,specialty})=>({id,name,specialty})),visits:c.visits.map(({id,doctorId,date,notes})=>({id,doctorId,date,notes})),prescriptions:c.prescriptions.map(({id,visitId,name,nameAR,instructions,durationText,notes})=>({id,visitId,name,nameAR,instructions,durationText,notes})),events:c.events.map(({id,visitId,kind,text,explanation,dueDate,dueText,pinned})=>({id,visitId,kind,text,explanation,dueDate,dueText,pinned}))}};
}
export function guestClinical(db,{from='',to='',latestOnly=false,latestDate='',medications=false,clinical=false,undated=false}={}){
 const c=activeClinical(db.clinical),within=v=>v.date?(!from||v.date>=from)&&(!to||v.date<=to)&&(!latestOnly||v.date===latestDate):undated&&!latestOnly;
 const selected=(medications||clinical)?c.visits.filter(within):[],ids=new Set(selected.map(v=>v.id));
 const doctors=c.doctors.filter(d=>selected.some(v=>v.doctorId===d.id)).map(({id,name,specialty})=>({id,name,specialty}));
 return {version:2,doctors,visits:selected.map(({id,doctorId,date,notes})=>({id,doctorId,date,notes:clinical?notes:'',source:'',reviewStatus:'unverified'})),prescriptions:medications?c.prescriptions.filter(p=>ids.has(p.visitId)).map(({id,visitId,name,nameAR,instructions,durationText})=>({id,visitId,name,nameAR,instructions,durationText,notes:''})):[],events:clinical?c.events.filter(n=>ids.has(n.visitId)).map(({id,visitId,kind,text,explanation,dueDate,dueText})=>({id,visitId,kind,text,explanation,dueDate,dueText,pinned:false})):[]};
}
