import {all, batch, one, run} from "./db.js";
import {audit} from "./audit.js";
import {bodyJSON, clean, HttpError, id, now} from "./http.js";
import {participation} from "./transactions.js";
import {canSeeDocument, getDocument, signingRecipients} from "./documents.js";

const endpoint = "https://www.signwell.com/api/v1";
async function signwell(env, path, options = {}) {
  if (!env.SIGNWELL_API_KEY) throw new HttpError("Electronic signing is not configured.", 503, "esign_unavailable");
  let response;
  try {
    response = await fetch(endpoint + path, {method:options.method || "GET", headers:{"X-Api-Key":env.SIGNWELL_API_KEY, ...(options.body?{"Content-Type":"application/json"}:{})}, body:options.body ? JSON.stringify(options.body) : undefined, signal:AbortSignal.timeout(20000)});
  } catch { throw new HttpError("The signing service did not respond. Please try again shortly.", 502, "esign_unavailable"); }
  // Provider responses can identify the account owner or signers. Never forward them.
  if (!response.ok) {
    const code = response.status === 429 ? "esign_rate_limit" : "esign_provider_error";
    console.error("SignWell request failed", {status:response.status, code});
    throw new HttpError(response.status === 429 ? "The signing service is busy. Please try again in a minute." : "The signing service could not complete this request. Please ask MREO to check the signing setup.", response.status >= 500 ? 502 : 422, code);
  }
  const type = response.headers.get("Content-Type") || "";
  try { return type.includes("json") ? await response.json() : await response.arrayBuffer(); }
  catch { throw new HttpError("The signing service returned an unexpected response. Please try again shortly.", 502, "esign_provider_error"); }
}
const toBase64 = buffer => {
  const bytes = new Uint8Array(buffer); let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
};
const signed = recipient => ["signed","completed"].includes(String(recipient.status || "").toLowerCase()) || !!recipient.completed_at || !!recipient.signed_at;
const remoteComplete = document => document.status === "completed" || document.completed === true || !!document.completed_at;

export async function createSignatureRequest(request, env, user, transactionId, documentId) {
  const access = await participation(env, transactionId, user);
  if (!access.staff) throw new HttpError("Only an MREO agent can send documents for signature.", 403, "agent_required");
  const document = await getDocument(env, transactionId, documentId);
  if (document.esign_external_id || document.status !== "available") throw new HttpError("This document is already being prepared or has been sent for signature.", 409, "already_sent");
  const data = await bodyJSON(request), requested = Array.isArray(data.recipients) ? data.recipients : [];
  if (!requested.length || requested.length > 8) throw new HttpError("Choose between one and eight transaction participants to sign.", 400, "recipient_required");
  const participants = await all(env, `SELECT p.user_id, p.role, u.email, u.display_name,
    EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role IN ('agent','admin')) is_staff
    FROM transaction_participants p JOIN users u ON u.id = p.user_id WHERE p.transaction_id = ? AND p.status = 'active'`, transactionId);
  const unique = new Map();
  for (const selected of requested) {
    const person = participants.find(person => person.role === selected.role && (selected.userId ? person.user_id === selected.userId : person.email?.toLowerCase() === String(selected.email || "").toLowerCase()));
    if (!person?.email || !canSeeDocument(document,{role:person.role,staff:!!person.is_staff})) throw new HttpError("Choose an active participant who has access to this document.", 400, "invalid_signer");
    if (!unique.has(person.email.toLowerCase())) unique.set(person.email.toLowerCase(), person);
  }
  const recipients = [...unique.values()].map((person,index) => ({...person,id:String(index+1),name:person.display_name && !person.display_name.includes("@") ? person.display_name : "MREO " + person.role}));
  const stored = await env.DOCUMENTS?.get(document.object_key);
  if (!stored) throw new HttpError("The source document is unavailable.", 404, "file_missing");
  if (document.size_bytes > 10 * 1024 * 1024) throw new HttpError("Documents sent for signature must be 10 MB or smaller.", 413, "esign_file_too_large");
  const claimed = await run(env,"UPDATE documents SET status = 'uploading' WHERE id = ? AND status = 'available' AND esign_external_id IS NULL",documentId);
  if (!claimed.meta?.changes) throw new HttpError("A signing request is already being prepared for this document.",409,"already_sent");
  let remote;
  try {
    remote = await signwell(env, "/documents", {method:"POST", body:{
      test_mode:env.SIGNWELL_TEST_MODE !== "false", name:document.filename,
      files:[{name:document.filename, file_base64:toBase64(await stored.arrayBuffer())}],
      recipients:recipients.map(({id,name,email}) => ({id,name,email})),
      draft:false, with_signature_page:true, reminders:false, apply_signing_order:data.applySigningOrder === true,
      embedded_signing:true, embedded_signing_notifications:false, allow_reassign:false,
      custom_requester_name:"MREO", subject:clean(data.subject,180) || "MREO document signature request",
      message:"Please review and sign this transaction document through your MREO workspace.",
      metadata:{mreo_transaction_id:transactionId,mreo_document_id:documentId}
    }});
    if (!remote?.id) throw new HttpError("The signing request could not be confirmed. Please ask MREO to check its status.",502,"esign_provider_error");
  } catch(error) {
    await run(env,"UPDATE documents SET status = 'available' WHERE id = ? AND esign_external_id IS NULL",documentId);
    throw error;
  }
  const timestamp=now();
  await batch(env,[
    ["UPDATE documents SET status = 'signature_pending', esign_provider = 'signwell', esign_external_id = ?, updated_at = ? WHERE id = ?",[remote.id,timestamp,documentId]],
    ...recipients.map(person => ["INSERT INTO document_recipients (document_id, user_id, role, name, email, status) VALUES (?, ?, ?, ?, ?, 'pending')",[documentId,person.user_id,person.role,person.name,person.email]]),
    ...recipients.map(person => ["INSERT INTO tasks (id, transaction_id, assigned_role, assigned_user_id, type, title, status, document_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'esign_signature', ?, 'action', ?, ?, ?)",[id("task"),transactionId,person.role,person.user_id,`Review and sign ${document.filename}`,documentId,timestamp,timestamp]])
  ]);
  await audit(env,{transactionId,actorUserId:user.id,eventType:"esign.sent",entityType:"document",entityId:documentId,summary:`${document.filename} sent for signature.`,metadata:{provider:"signwell",testMode:env.SIGNWELL_TEST_MODE !== "false",signerCount:recipients.length}});
  return {documentId,status:"signature_pending",testMode:env.SIGNWELL_TEST_MODE !== "false"};
}

async function signingAccess(env,user,transactionId,documentId) {
  const access=await participation(env,transactionId,user),document=await getDocument(env,transactionId,documentId);
  if (!canSeeDocument(document,access)) throw new HttpError("Document not found.",404,"not_found");
  const recipient=(await signingRecipients(env,user,transactionId)).find(item=>item.document_id===documentId);
  return {access,document,recipient};
}
export async function signingSession(env,user,transactionId,documentId) {
  const {document,recipient}=await signingAccess(env,user,transactionId,documentId);
  if (!recipient) throw new HttpError("This signature request belongs to another participant. You can review the document in Files.",403,"signer_required");
  if (!document.esign_external_id) throw new HttpError("This document has not been sent for signature.",409,"not_sent");
  if (document.status==="complete" || recipient.status==="signed") throw new HttpError("Your signature is already recorded. Check signing status to retrieve the signed PDF.",409,"already_signed");
  const remote=await signwell(env,`/documents/${encodeURIComponent(document.esign_external_id)}`);
  const match=remote.recipients?.find(item=>item.email?.toLowerCase()===recipient.email.toLowerCase());
  if (match && signed(match)) throw new HttpError("Your signature is already recorded. Check signing status to retrieve the signed PDF.",409,"already_signed");
  if (match?.status==="declined" || ["cancelled","expired"].includes(remote.status)) throw new HttpError("This signature request is no longer open. Ask MREO for a new request.",409,"signing_closed");
  let url;try{url=new URL(match?.embedded_signing_url);}catch{}
  if (!url || url.protocol!=="https:" || !(url.hostname==="signwell.com" || url.hostname.endsWith(".signwell.com"))) throw new HttpError("Signing is not ready yet. Please check again shortly; an earlier signer may need to finish first.",409,"signing_unavailable");
  return {url:url.href,testMode:remote.test_mode ?? (env.SIGNWELL_TEST_MODE !== "false")};
}

export async function reconcileSignwell(env,externalId,actorUserId=null) {
  const local=await one(env,"SELECT * FROM documents WHERE esign_provider = 'signwell' AND esign_external_id = ?",externalId);
  if (!local) return {ignored:true};
  const remote=await signwell(env,`/documents/${encodeURIComponent(externalId)}`),timestamp=now();
  const recipients=await all(env,"SELECT * FROM document_recipients WHERE document_id = ?",local.id);
  let changed=false;
  for (const recipient of recipients) {
    const match=remote.recipients?.find(item=>item.email?.toLowerCase()===recipient.email.toLowerCase());
    if (!match) continue;
    const status=signed(match)?"signed":match.status==="declined"?"declined":match.status==="viewed"?"viewed":"pending";
    if (status===recipient.status || recipient.status==="signed") continue;
    changed=true;
    await run(env,"UPDATE document_recipients SET status = ?, signed_at = CASE WHEN ? = 'signed' THEN COALESCE(signed_at, ?) ELSE signed_at END WHERE document_id = ? AND role = ? AND email = ?",status,status,timestamp,local.id,recipient.role,recipient.email);
    if (status==="signed") await run(env,"UPDATE tasks SET status = 'complete', updated_at = ? WHERE document_id = ? AND type = 'esign_signature' AND assigned_user_id = ?",timestamp,local.id,recipient.user_id);
  }
  const complete=remoteComplete(remote);
  if (complete && !(local.status==="complete" && local.completed_object_key)) {
    const pdf=await signwell(env,`/documents/${encodeURIComponent(externalId)}/completed_pdf?file_format=pdf&audit_page=true&url_only=false`);
    if (!(pdf instanceof ArrayBuffer) || new TextDecoder().decode(new Uint8Array(pdf,0,Math.min(5,pdf.byteLength)))!=="%PDF-") throw new HttpError("The signed PDF is still being prepared. Check signing status again shortly.",409,"signed_pdf_pending");
    const key=`transactions/${local.transaction_id}/${local.id}/completed/executed.pdf`;
    await env.DOCUMENTS.put(key,pdf,{httpMetadata:{contentType:"application/pdf"},customMetadata:{transactionId:local.transaction_id,documentId:local.id,provider:"signwell"}});
    await batch(env,[
      ["UPDATE documents SET status = 'complete', completed_object_key = ?, updated_at = ? WHERE id = ?",[key,timestamp,local.id]],
      ["UPDATE tasks SET status = 'complete', updated_at = ? WHERE transaction_id = ? AND document_id = ? AND type = 'esign_signature'",[timestamp,local.transaction_id,local.id]]
    ]);
    await audit(env,{transactionId:local.transaction_id,actorUserId,eventType:"esign.completed",entityType:"document",entityId:local.id,summary:`Signing completed for ${local.filename}.`,metadata:{provider:"signwell"}});
  } else if(changed) await audit(env,{transactionId:local.transaction_id,actorUserId,eventType:"esign.updated",entityType:"document",entityId:local.id,summary:`Signature status updated for ${local.filename}.`,metadata:{provider:"signwell"}});
  return {ok:true,complete,transactionId:local.transaction_id};
}
export async function signatureStatus(env,user,transactionId,documentId) {
  const {access,document,recipient}=await signingAccess(env,user,transactionId,documentId);
  if (!access.staff && !recipient) throw new HttpError("This signature request belongs to another participant.",403,"signer_required");
  if (!document.esign_external_id) throw new HttpError("This document has not been sent for signature.",409,"not_sent");
  const result=await reconcileSignwell(env,document.esign_external_id,user.id);
  const own=(await signingRecipients(env,user,transactionId)).find(item=>item.document_id===documentId);
  return {complete:result.complete,signerStatus:own?.status || null};
}
export async function signwellWebhook(request,env) {
  const supplied=new URL(request.url).searchParams.get("token") || request.headers.get("X-MREO-Webhook-Token");
  if (!env.SIGNWELL_WEBHOOK_TOKEN || supplied!==env.SIGNWELL_WEBHOOK_TOKEN) throw new HttpError("Invalid webhook token.",401,"invalid_webhook");
  let payload;try{payload=await request.json();}catch{throw new HttpError("Invalid webhook payload.");}
  const externalId=payload?.data?.object?.id || payload?.document?.id || payload?.id;
  if (!externalId) throw new HttpError("Document identifier missing from webhook.");
  return reconcileSignwell(env,clean(externalId,100));
}
