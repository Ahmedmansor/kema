import {activeClinical} from '../public/clinical-core.mjs';
export function guestClinical(db,{from='',to='',latestOnly=false,latestDate='',medications=false,clinical=false,undated=false}={}){
 const c=activeClinical(db.clinical),within=v=>v.date?(!from||v.date>=from)&&(!to||v.date<=to)&&(!latestOnly||v.date===latestDate):undated&&!latestOnly;
 const selected=(medications||clinical)?c.visits.filter(within):[],ids=new Set(selected.map(v=>v.id));
 const doctors=c.doctors.filter(d=>selected.some(v=>v.doctorId===d.id)).map(({id,name,specialty})=>({id,name,specialty}));
 return {version:2,doctors,visits:selected.map(({id,doctorId,date,notes})=>({id,doctorId,date,notes:clinical?notes:'',source:'',reviewStatus:'unverified'})),prescriptions:medications?c.prescriptions.filter(p=>ids.has(p.visitId)).map(({id,visitId,name,nameAR,instructions,durationText})=>({id,visitId,name,nameAR,instructions,durationText,notes:''})):[],events:clinical?c.events.filter(n=>ids.has(n.visitId)).map(({id,visitId,kind,text,explanation,dueDate,dueText})=>({id,visitId,kind,text,explanation,dueDate,dueText,pinned:false})):[]};
}
