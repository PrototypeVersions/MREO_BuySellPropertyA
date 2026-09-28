import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {apiFetch} from "../backend/api.js";

class Statement {
  constructor(db,sql,values=[]){Object.assign(this,{db,sql,values});}
  bind(...values){return new Statement(this.db,this.sql,values);}
  async first(){return this.db.prepare(this.sql).get(...this.values)||null;}
  async all(){return {results:this.db.prepare(this.sql).all(...this.values)};}
  async run(){return {meta:{changes:this.db.prepare(this.sql).run(...this.values).changes}};}
}
class Database {
  constructor(){this.sqlite=new DatabaseSync(":memory:");this.sqlite.exec(readFileSync(new URL("../migrations/0001_transaction_platform.sql",import.meta.url),"utf8"));}
  prepare(sql){return new Statement(this.sqlite,sql);}
  async batch(statements){this.sqlite.exec("BEGIN");try{const results=[];for(const s of statements)results.push(await s.run());this.sqlite.exec("COMMIT");return results;}catch(e){this.sqlite.exec("ROLLBACK");throw e;}}
}
const req=(path,user="alice",method="GET",body)=>new Request("https://mreo.test"+path,{method,headers:{"X-MREO-Test-User":user,"X-MREO-Test-Email":user+"@example.com",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
async function fixture(){
  const objects=new Map([["original",new TextEncoder().encode("%PDF-1.4 sample source").buffer]]);
  const e={DB:new Database(),AUTH_MODE:"test",SIGNWELL_API_KEY:"test-only",SIGNWELL_TEST_MODE:"true",SIGNWELL_WEBHOOK_TOKEN:"test-hook",DOCUMENTS:{
    get:async key=>objects.has(key)?{arrayBuffer:async()=>objects.get(key),body:objects.get(key),writeHttpMetadata:headers=>headers.set("Content-Type","application/pdf")}:null,
    put:async(key,body)=>{objects.set(key,await new Response(body).arrayBuffer());}
  }};
  const created=await apiFetch(req("/api/v1/transactions","alice","POST",{role:"buyer",title:"Private signing test",auctionId:"shared"}),e);
  const tx=(await created.json()).id;
  await apiFetch(req("/api/v1/transactions","bob","POST",{role:"seller",title:"Private signing test",auctionId:"shared"}),e);
  for(const user of ["agent","outsider"])await apiFetch(req("/api/v1/me",user),e);
  const uid=user=>e.DB.sqlite.prepare("SELECT id FROM users WHERE auth_subject = ?").get(user).id;
  e.DB.sqlite.prepare("INSERT INTO user_roles VALUES (?, 'agent', 1)").run(uid("agent"));
  e.DB.sqlite.prepare("INSERT INTO documents (id,transaction_id,uploaded_by,filename,object_key,content_type,size_bytes,status,visibility,created_at,updated_at) VALUES ('doc',?,?, 'Private agreement.pdf','original','application/pdf',100,'available','buyer_agent',1,1)").run(tx,uid("alice"));
  const base=`/api/v1/transactions/${tx}`;
  const call=async(path,user="alice",method="GET",body)=>{const response=await apiFetch(req(base+path,user,method,body),e);return {status:response.status,body:await response.json()};};
  return {e,tx,uid,base,call,objects,send:()=>call("/documents/doc/signatures","agent","POST",{recipients:[{userId:uid("alice"),role:"buyer"}]})};
}
const provider=(t,handler)=>t.mock.method(globalThis,"fetch",async(url,options)=>handler(String(url),options));
const remote=(status="sent")=>({id:"remote-doc",test_mode:true,status,recipients:[{email:"alice@example.com",status:status==="completed"?"signed":"pending",embedded_signing_url:"https://www.signwell.com/docs/only-alice"}]});

test("signing binds active recipients, deduplicates roles and lets a staff buyer sign only their own request",async t=>{
  const f=await fixture();let payload;
  f.e.DB.sqlite.prepare("INSERT INTO user_roles VALUES (?, 'agent', 1)").run(f.uid("alice"));
  f.e.DB.sqlite.prepare("INSERT INTO transaction_participants VALUES (?,?,'seller','active',1)").run(f.tx,f.uid("alice"));
  f.e.DB.sqlite.prepare("UPDATE documents SET visibility='participants' WHERE id='doc'").run();
  provider(t,(url,options)=>{if(options.method==="POST")payload=JSON.parse(options.body);return Response.json(remote());});
  const created=await f.call("/documents/doc/signatures","agent","POST",{recipients:[{userId:f.uid("alice"),role:"buyer"},{userId:f.uid("alice"),role:"seller"}]});
  assert.equal(created.status,201);assert.equal(payload.recipients.length,1);
  assert.equal(payload.with_signature_page,true);assert.equal(payload.embedded_signing,true);assert.equal(payload.embedded_signing_notifications,false);assert.equal(payload.reminders,false);assert.equal(payload.test_mode,true);
  const listing=await f.call("/documents");assert.equal(listing.body.documents[0].can_sign,true);
  assert.equal(listing.body.documents[0].esign_external_id,undefined);
  const session=await f.call("/documents/doc/signing-session","alice","POST",{});
  assert.equal(session.status,200);assert.equal(session.body.url,"https://www.signwell.com/docs/only-alice");
  assert.equal((await f.call("/documents/doc/signing-session","agent","POST",{})).status,403);
  assert.equal((await f.call("/documents/doc/signing-session","outsider","POST",{})).status,403);
  assert.equal((await f.call("/documents/doc/signing-session","bob","POST",{})).status,403);
  assert.equal((await f.send()).status,409);
});

test("signature requests cannot select an outsider or someone outside the document's sharing scope",async t=>{
  const f=await fixture();let calls=0;provider(t,()=>{calls++;return Response.json(remote());});
  for(const role of ["seller","buyer"]){
    const result=await f.call("/documents/doc/signatures","agent","POST",{recipients:[{userId:f.uid(role==="seller"?"bob":"outsider"),role}]});
    assert.equal(result.status,400);
  }
  assert.equal(calls,0);
});

test("provider errors never reveal owner or recipient email addresses and a failed request remains retryable",async t=>{
  const f=await fixture();provider(t,()=>Response.json({message:"Only private-owner@example.invalid may use this key",error:"private-owner@example.invalid"},{status:422}));
  const result=await f.send();assert.equal(result.status,422);
  assert.doesNotMatch(JSON.stringify(result.body),/@|private-owner/);
  assert.equal(f.e.DB.sqlite.prepare("SELECT status FROM documents WHERE id='doc'").get().status,"available");
});

test("private document activity and signing tasks stay private, including legacy email metadata",async t=>{
  const f=await fixture();provider(t,()=>Response.json(remote()));await f.send();
  f.e.DB.sqlite.prepare("INSERT INTO audit_events (id,transaction_id,event_type,entity_type,entity_id,summary,metadata_json,created_at) VALUES ('old',?,'esign.sent','document','doc','Private agreement for private-owner@example.invalid','{\"email\":\"private-owner@example.invalid\"}',1)").run(f.tx);
  const events=await f.call("/events","bob");assert.ok(events.body.events.every(event=>event.entity_id!=="doc"));
  assert.equal((await f.call("/documents","bob")).body.documents.length,0);
  assert.equal((await f.call("/tasks","bob")).body.tasks.filter(task=>task.type==="esign_signature").length,0);
  const staff=await f.call("/events","agent");assert.doesNotMatch(JSON.stringify(staff.body),/private-owner|@example/);
  const task=(await f.call("/tasks")).body.tasks.find(task=>task.type==="esign_signature");
  assert.equal((await f.call("/tasks/"+task.id,"alice","PATCH",{status:"complete"})).status,409);
});

test("only authoritative provider completion plus a valid signed PDF completes a document",async t=>{
  const f=await fixture();let status="sent",validPDF=false,downloads=0;
  provider(t,(url)=>{if(url.includes("completed_pdf")){downloads++;return validPDF?new Response("%PDF-1.4 signed original",{headers:{"Content-Type":"application/pdf"}}):Response.json({message:"PDF preparing"});}return Response.json(remote(status));});
  await f.send();
  const unsigned=await apiFetch(req(f.base+"/documents/doc/download?version=completed"),f.e);assert.equal(unsigned.status,409);
  assert.equal((await f.call("/documents/doc/signing-status","alice","POST",{})).body.complete,false);
  status="completed";
  assert.equal((await f.call("/documents/doc/signing-status","alice","POST",{})).status,409);
  assert.equal(f.e.DB.sqlite.prepare("SELECT status FROM documents WHERE id='doc'").get().status,"signature_pending");
  validPDF=true;
  const completed=await f.call("/documents/doc/signing-status","alice","POST",{});assert.equal(completed.body.complete,true);
  assert.equal(completed.body.signerStatus,"signed");
  assert.equal((await f.call("/documents")).body.documents[0].can_sign,false);
  const pdf=await apiFetch(req(f.base+"/documents/doc/download?version=completed"),f.e);assert.equal(await pdf.text(),"%PDF-1.4 signed original");
  await f.call("/documents/doc/signing-status","alice","POST",{});assert.equal(downloads,2);
  assert.equal(f.e.DB.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE event_type='esign.completed'").get().n,1);
  assert.equal((await f.call("/documents/doc/signing-session","alice","POST",{})).status,409);
});

test("webhook payloads cannot assert completion and legacy signers lose access when removed",async t=>{
  const f=await fixture();provider(t,()=>Response.json(remote()));await f.send();
  f.e.DB.sqlite.prepare("UPDATE document_recipients SET user_id=NULL WHERE document_id='doc'").run();
  assert.equal((await f.call("/documents/doc/signing-session","alice","POST",{})).status,200);
  const forged=new Request("https://mreo.test/webhooks/signwell?token=test-hook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({document:{id:"remote-doc",status:"completed"}})});
  assert.equal((await apiFetch(forged,f.e)).status,200);
  assert.equal(f.e.DB.sqlite.prepare("SELECT status FROM documents WHERE id='doc'").get().status,"signature_pending");
  f.e.DB.sqlite.prepare("INSERT INTO user_roles VALUES (?, 'agent', 1)").run(f.uid("alice"));
  f.e.DB.sqlite.prepare("UPDATE transaction_participants SET status='removed' WHERE user_id=?").run(f.uid("alice"));
  assert.equal((await f.call("/documents/doc/signing-session","alice","POST",{})).status,403);
});

test("participant uploads cannot silently broaden a private conversation's sharing",async()=>{
  const f=await fixture(),form=new FormData();form.append("file",new File(["sample"],"Buyer note.txt",{type:"text/plain"}));form.append("visibility","participants");
  const request=new Request("https://mreo.test"+f.base+"/documents",{method:"POST",headers:{"X-MREO-Test-User":"alice","X-MREO-Test-Email":"alice@example.com"},body:form});
  const result=await apiFetch(request,f.e);assert.equal(result.status,201);assert.equal((await result.json()).visibility,"buyer_agent");
  assert.equal((await f.call("/documents","bob")).body.documents.length,0);
});
