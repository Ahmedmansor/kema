import {mkdir,writeFile} from 'node:fs/promises';
const content='BT /F1 18 Tf 50 760 Td (Kema interface verification only) Tj 0 -30 Td (No patient records in this PDF fixture.) Tj ET';
const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
];
let pdf='%PDF-1.4\n',offsets=[0];
objects.forEach((value,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${value}\nendobj\n`;});
const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
for(const offset of offsets.slice(1))pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;
pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/qa-report.pdf',pdf);
console.log('Created artifacts/qa-report.pdf (synthetic UI fixture).');
