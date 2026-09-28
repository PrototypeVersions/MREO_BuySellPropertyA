// Exercise the real provider with a new, fictional test document only.
// No notification emails, signatures, account details, or signing URLs enter logs.
import assert from "node:assert/strict";
const key=process.env.SIGNWELL_API_KEY;
if(!key)throw Error("The SignWell API secret is missing.");
const endpoint="https://www.signwell.com/api/v1";
async function request(path,method="GET",body){
  const response=await fetch(endpoint+path,{method,headers:{"X-Api-Key":key,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`SignWell integration check returned HTTP ${response.status}. Provider response withheld to protect account information.`);
  if(response.status===204)return null;
  const text=await response.text();return text?JSON.parse(text):null;
}
const content="BT /F1 18 Tf 50 740 Td (MREO INTEGRATION TEST - NOT A CONTRACT) Tj 0 -35 Td /F1 12 Tf (Fictional document. No legal effect. No notifications.) Tj ET";
const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
let pdf="%PDF-1.4\n",offsets=[0];objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});
const xref=pdf.length;pdf+="xref\n0 6\n0000000000 65535 f \n"+offsets.slice(1).map(offset=>String(offset).padStart(10,"0")+" 00000 n \n").join("")+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
let createdId;
try{
  const created=await request("/documents","POST",{test_mode:true,name:"MREO automated integration test",files:[{name:"mreo-integration-test.pdf",file_base64:Buffer.from(pdf).toString("base64")}],recipients:[{id:"test-signer",name:"Fictional MREO Test Signer",email:"mreo-signing-test@example.com"}],draft:false,with_signature_page:true,embedded_signing:true,embedded_signing_notifications:false,reminders:false,allow_reassign:false,apply_signing_order:false,custom_requester_name:"MREO",metadata:{purpose:"automated-nonbinding-integration-check"}});
  createdId=created.id;assert.ok(createdId,"SignWell did not return a test document identifier.");
  const saved=await request("/documents/"+encodeURIComponent(createdId));
  assert.equal(saved.test_mode,true,"Integration checks must remain in SignWell test mode.");
  const signer=saved.recipients?.find(item=>item.email==="mreo-signing-test@example.com");
  assert.ok(signer?.embedded_signing_url,"SignWell did not provide a recipient signing session.");
  const url=new URL(signer.embedded_signing_url);assert.equal(url.protocol,"https:");assert.ok(url.hostname==="signwell.com"||url.hostname.endsWith(".signwell.com"));
  console.log("SignWell test document creation and recipient signing session verified. No document was signed; notifications were disabled.");
}finally{
  if(createdId){await request("/documents/"+encodeURIComponent(createdId),"DELETE");console.log("The temporary SignWell test document was removed.");}
}
