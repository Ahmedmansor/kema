export function clinicalText(value){
 return String(value??'').replace(/الوظيفة الدوائية كما وردت بالملخص، غير متحقق منها:\s*/g,'وظيفة الدواء: ').replace(/\s*\(كما ورد؛ حالة التناول الحالية غير معلومة\)/g,'').replace(/(?:،|؛)?\s*(?:ويحتاج|وتحتاج|يحتاج|تحتاج) مراجعة الأصل(?: مع الطبيب)?/g,'').trim();
}
export function clinicalExplanation(event){
 const text=String(event.explanation||'');
 if(event.kind==='warning'&&/تنبيه منقول|تعليمات عامة مطبوعة|بحسب الملخص|بحسب النص المرسل/.test(text))return '';
 return clinicalText(text);
}
