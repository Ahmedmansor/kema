const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const CURVE_HEIGHT=440;
export function compactCurveHeight(model){return 238+prescriptionCurveGroups(model).reduce((height,g)=>height+52+Math.ceil(g.rows.length/2)*44,0);}
function compactLabels(groups,{base,L,W,R,x,y}){
 let out='',cursor=base+36;const gap=12,colWidth=(W-L-R-gap)/2;
 for(const g of groups){const color=specialtyColor(g.specialty),px=x(g.date),py=y(g.rows.length),center=Math.max(L+18,Math.min(W-R-18,px)),header=cursor,trunk=L-18+(groups.indexOf(g)%8)*1.5;
 out+=`<path class="rx-mobile-connector" d="M${px} ${py+9} V${base+16} H${trunk} V${header} H${center}" fill="none" stroke="${color}" stroke-opacity=".28" stroke-width="1.2"/><g class="rx-mobile-branch"><circle cx="${center}" cy="${header}" r="3" fill="${color}"/><text x="${W-R}" y="${header-5}" text-anchor="end" font-size="11" class="rx-mobile-date">${e(g.date)}</text>`;
 g.rows.forEach((p,i)=>{const left=L+(i%2)*(colWidth+gap),labelY=header+30+Math.floor(i/2)*44+(i%2?22:0),maxChars=Math.max(10,Math.floor((colWidth-14)/6.8)),name=p.name.length>maxChars?p.name.slice(0,maxChars-1)+'…':p.name;
 out+=`<path d="M${center} ${header+9} H${left-5} V${labelY-4} H${left+3}" fill="none" stroke="${color}" stroke-opacity=".25"/><g tabindex="0" role="button" class="timeline-point rx-mobile-drug" data-timeline-rx="${e(p.id)}" aria-label="${e(p.name)}، ${e(p.doctor.name)}، ${e(g.date)}"><rect x="${left}" y="${labelY-18}" width="${colWidth}" height="44" rx="5" fill="transparent"/><circle cx="${left+3}" cy="${labelY-4}" r="2.5" fill="${color}"/><text x="${left+10}" y="${labelY}" font-size="12" font-weight="600" fill="${color}">${e(name)}</text><title>${e(p.name)} · ${e(p.doctor.name)} · ${e(g.date)}</title></g>`;
 });out+='</g>';cursor+=52+Math.ceil(g.rows.length/2)*44;
 }return out;
}
export function specialtyGroup(name=''){
 if(/عظام|عمود فقري/.test(name))return 'العظام والعمود الفقري';
 if(/مخ|أعصاب/.test(name))return 'المخ والأعصاب';
 if(/قلب|أوعية/.test(name))return 'القلب والأوعية الدموية';
 if(/أنف|أذن|اذن|حنجرة/.test(name))return 'الأنف والأذن والحنجرة';
 if(/هضمي|كبد|باطنة/.test(name))return 'الجهاز الهضمي والباطنة';
 return name.trim()||'تخصص غير مسجل';
}
const colors={'العظام والعمود الفقري':'#a65c18','المخ والأعصاب':'#3269b1','القلب والأوعية الدموية':'#8050a4','الأنف والأذن والحنجرة':'#ad4257','الجهاز الهضمي والباطنة':'#147d70'};
export function specialtyColor(name){const group=specialtyGroup(name);if(colors[group])return colors[group];let hash=0;for(const c of group)hash=(hash*31+c.charCodeAt(0))>>>0;return `hsl(${hash%360} 55% 34%)`;}
export function prescriptionCurveGroups(model){
 const groups=new Map();for(const p of model.prescriptions){const specialty=specialtyGroup(p.doctor.specialty),key=JSON.stringify([specialty,p.visit.date]);if(!groups.has(key))groups.set(key,{key,specialty,date:p.visit.date,rows:[]});groups.get(key).rows.push(p);}
 return [...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.specialty.localeCompare(b.specialty));
}
export function prescriptionCurve(model,{top=0,L=90,W=1000,R=25,x,compact=false}){
 const groups=prescriptionCurveGroups(model);if(!groups.length)return '';
 const specialties=[...new Set(groups.map(g=>g.specialty))],max=Math.max(1,...groups.map(g=>g.rows.length)),plotTop=top+72,base=plotTop+130,y=n=>base-n/max*125;
 let out=`<text x="${L}" y="${top+14}" class="timeline-heading">${compact?'الروشتات · عدد بنود الدواء':'منحنيات الروشتات حسب تخصص الطبيب'}</text>${compact?'':`<text x="${L}" y="${top+35}">الارتفاع = عدد بنود الأدوية المختارة في التاريخ لكل تخصص، وليس الجرعة أو التأثير.</text>`}`;
 for(let i=0;i<=max;i++){const yy=y(i);out+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#e0e7e6" stroke-dasharray="3 5"/><text x="${L-12}" y="${yy+4}" text-anchor="end">${i}</text>`;}
 for(const name of specialties){const points=groups.filter(g=>g.specialty===name),color=specialtyColor(name);out+=`<polyline class="prescription-curve-line" points="${points.map(g=>`${x(g.date)},${y(g.rows.length)}`).join(' ')}" stroke="${color}" stroke-width="2.8" fill="none"/>`;}
 const labels=groups.flatMap(g=>g.rows.map(p=>({p,g,anchor:x(g.date)}))).sort((a,b)=>a.anchor-b.anchor||a.p.id.localeCompare(b.p.id));
 const focused=labels.length<=4,fontSize=focused?18:labels.length<=20?14:12,angle=focused?35:labels.length<=20?55:65,labelWidth=focused?300:labels.length<=20?220:205,maxChars=Math.floor((labelWidth-12)/(fontSize*.6));
 const left=L+5,right=W-R-labelWidth*Math.cos(angle*Math.PI/180)-8,gap=Math.min(focused?90:labels.length<=20?40:24,(right-left)/Math.max(1,labels.length-1));let last=left-gap;
 labels.forEach(row=>{row.labelX=Math.max(row.anchor,last+gap);last=row.labelX;});
 for(let i=labels.length-1;i>=0;i--)labels[i].labelX=Math.min(labels[i].labelX,i===labels.length-1?right:labels[i+1].labelX-gap);
 for(const g of groups){const px=x(g.date),py=y(g.rows.length),color=specialtyColor(g.specialty);out+=`<g tabindex="0" role="button" class="timeline-point" data-timeline-bundle="${e(g.key)}" aria-label="${e(g.specialty)}، ${e(g.date)}، ${g.rows.length} بنود دواء"><circle cx="${px}" cy="${py}" r="17" fill="transparent"/><circle cx="${px}" cy="${py}" r="5.5" stroke="${color}" stroke-width="2.5" fill="white"/><title>${e(g.specialty)} · ${e(g.date)} · ${e(g.rows.map(p=>p.name).join('، '))}</title></g>`;}
 if(compact)return out+compactLabels(groups,{base,L,W,R,x,y});
 for(const {p,g,labelX}of labels){const px=x(g.date),py=y(g.rows.length),color=specialtyColor(g.specialty),labelY=base+33,name=p.name.length>maxChars?p.name.slice(0,maxChars-1)+'…':p.name;out+=`<line x1="${px}" y1="${py+8}" x2="${labelX}" y2="${labelY-6}" stroke="${color}" stroke-opacity=".3"/><g tabindex="0" role="button" class="timeline-point medication-name-label" data-timeline-rx="${e(p.id)}" aria-label="${e(p.name)}، ${e(p.doctor.name)}، ${e(g.date)}" transform="translate(${labelX},${labelY}) rotate(${angle})"><rect x="-5" y="-${fontSize+3}" width="${Math.min(labelWidth,name.length*fontSize*.6+12)}" height="${fontSize+15}" fill="transparent"/><text fill="${color}" font-size="${fontSize}" font-weight="600">${e(name)}</text><title>${e(p.name)} · ${e(p.doctor.name)} · ${e(g.date)}</title></g>`;}
 return out;
}
export function prescriptionLegend(model){return [...new Set(model.prescriptions.map(p=>specialtyGroup(p.doctor.specialty)))].map(name=>`<span><svg class="timeline-swatch" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="${specialtyColor(name)}"/></svg>${e(name)}</span>`).join('');}
