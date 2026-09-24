import {all, batch, one, run} from "./db.js";
import {audit} from "./audit.js";
import {bodyJSON, clean, HttpError, id, now, validEmail} from "./http.js";
import {participation} from "./transactions.js";
import {getDocument} from "./documents.js";

const endpoint = "https://www.signwell.com/api/v1";

async function signwell(env, path, options = {}) {
  if (!env.SIGNWELL_API_KEY) throw new HttpError("Electronic signing is not configured.", 503, "esign_unavailable");
  const response = await fetch(endpoint + path, {method:options.method || "GET", headers:{"X-Api-Key":env.SIGNWELL_API_KEY, ...(options.body?{"Content-Type":"application/json"}:{})}, body:options.body ? JSON.stringify(options.body) : undefined, signal:AbortSignal.timeout(20000)});
  const type = response.headers.get("Content-Type") || "";
  const data = type.includes("json") ? await response.json() : await response.arrayBuffer();
  if (!response.ok) throw new HttpError(data?.message || data?.error || "The electronic-signature provider could not complete the request.", response.status >= 500 ? 502 : 422, "esign_provider_error");
  return {data, headers:response.headers};
}

const toBase64 = buffer => {
  const bytes = new Uint8Array(buffer); let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
};

export async function createSignatureRequest(request, env, user, transactionId, documentId) {
  const access = await participation(env, transactionId, user);
  if (!access.staff) throw new HttpError("Only an MREO agent can send documents for signature.", 403, "agent_required");
  const document = await getDocument(env, transactionId, documentId);
  if (document.esign_external_id) throw new HttpError("This document has already been sent for signature.", 409, "already_sent");
  const data = await bodyJSON(request), recipients = Array.isArray(data.recipients) ? data.recipients.slice(0, 8) : [];
  if (!recipients.length) throw new HttpError("Add at least one signer.", 400, "recipient_required");
  const normalized = recipients.map((recipient, index) => {
    const email = clean(recipient.email, 254), name = clean(recipient.name, 120), role = clean(recipient.role, 20);
    if (!validEmail(email) || !name || !["buyer","seller","agent","provider"].includes(role)) throw new HttpError("Each signer needs a name, email, and transaction role.");
    return {id:String(index + 1), name, email, role};
  });
  const stored = await env.DOCUMENTS?.get(document.object_key);
  if (!stored) throw new HttpError("The source document is unavailable.", 404, "file_missing");
  if (document.size_bytes > 10 * 1024 * 1024) throw new HttpError("Documents sent for signature must be 10 MB or smaller.", 413, "esign_file_too_large");
  const response = (await signwell(env, "/documents", {method:"POST", body:{
    test_mode:env.SIGNWELL_TEST_MODE !== "false", name:document.filename,
    files:[{name:document.filename, file_base64:toBase64(await stored.arrayBuffer())}],
    recipients:normalized.map(({role, ...recipient}) => recipient),
    draft:false, with_signature_page:true, reminders:true, apply_signing_order:data.applySigningOrder !== false,
    embedded_signing:true, embedded_signing_notifications:true, allow_reassign:false,
    subject:clean(data.subject, 180) || `${document.filename} — signature requested by MREO`,
    message:clean(data.message, 1200) || "Please review and sign this transaction document through MREO.",
    metadata:{mreo_transaction_id:transactionId, mreo_document_id:documentId}
  }})).data;
  const timestamp = now();
  await run(env, "UPDATE documents SET status = 'signature_pending', esign_provider = 'signwell', esign_external_id = ?, updated_at = ? WHERE id = ?", response.id, timestamp, documentId);
  for (const recipient of normalized) await run(env, `INSERT INTO document_recipients (document_id, role, name, email, status)
    VALUES (?, ?, ?, ?, 'pending')`, documentId, recipient.role, recipient.name, recipient.email);
  for (const recipient of normalized) await run(env, `INSERT INTO tasks (id, transaction_id, assigned_role, type, title, status, document_id, created_at, updated_at)
    VALUES (?, ?, ?, 'esign_signature', ?, 'action', ?, ?, ?)`, id("task"), transactionId, recipient.role, `Review and sign ${document.filename}`, documentId, timestamp, timestamp);
  await audit(env, {transactionId, actorUserId:user.id, eventType:"esign.sent", entityType:"document", entityId:documentId, summary:`${document.filename} sent for signature.`, metadata:{provider:"signwell", testMode:env.SIGNWELL_TEST_MODE !== "false", recipients:normalized.map(({email,role})=>({email,role}))}});
  return {documentId, provider:"signwell", status:"signature_pending", testMode:env.SIGNWELL_TEST_MODE !== "false"};
}

export async function signingSession(env, user, transactionId, documentId) {
  const access = await participation(env, transactionId, user), document = await getDocument(env, transactionId, documentId);
  if (!document.esign_external_id) throw new HttpError("This document has not been sent for signature.", 409, "not_sent");
  const recipient = await one(env, "SELECT * FROM document_recipients WHERE document_id = ? AND role = ? AND lower(email) = lower(?)", documentId, access.role, user.email || "");
  if (!recipient && !access.staff) throw new HttpError("You are not a signer on this document.", 403, "signer_required");
  const remote = (await signwell(env, `/documents/${encodeURIComponent(document.esign_external_id)}`)).data;
  const match = remote.recipients?.find(item => item.email?.toLowerCase() === (recipient?.email || "").toLowerCase());
  if (!match?.embedded_signing_url) throw new HttpError("A signing session is not available for this recipient.", 409, "signing_unavailable");
  return {url:match.embedded_signing_url};
}

const signed = recipient => ["signed","completed"].includes(String(recipient.status || "").toLowerCase()) || !!recipient.completed_at || !!recipient.signed_at;
const remoteComplete = document => ["completed","signed"].includes(String(document.status || "").toLowerCase()) || !!document.completed || !!document.completed_at;

export async function reconcileSignwell(env, externalId, actorUserId = null) {
  const local = await one(env, "SELECT * FROM documents WHERE esign_provider = 'signwell' AND esign_external_id = ?", externalId);
  if (!local) return {ignored:true};
  const remote = (await signwell(env, `/documents/${encodeURIComponent(externalId)}`)).data;
  const timestamp = now();
  for (const recipient of remote.recipients || []) if (recipient.email) {
    await run(env, "UPDATE document_recipients SET status = ?, signed_at = ? WHERE document_id = ? AND lower(email) = lower(?)", signed(recipient) ? "signed" : (recipient.status === "viewed" ? "viewed" : "pending"), signed(recipient) ? timestamp : null, local.id, recipient.email);
  }
  if (remoteComplete(remote)) {
    const pdf = await signwell(env, `/documents/${encodeURIComponent(externalId)}/completed_pdf?file_format=pdf&audit_page=true`);
    const key = `transactions/${local.transaction_id}/${local.id}/completed/executed.pdf`;
    await env.DOCUMENTS.put(key, pdf.data, {httpMetadata:{contentType:"application/pdf", contentDisposition:`attachment; filename="Executed-${local.filename.replaceAll('"','')}"`}, customMetadata:{transactionId:local.transaction_id, documentId:local.id, provider:"signwell"}});
    await batch(env, [
      ["UPDATE documents SET status = 'complete', completed_object_key = ?, updated_at = ? WHERE id = ?", [key, timestamp, local.id]],
      ["UPDATE tasks SET status = 'complete', updated_at = ? WHERE transaction_id = ? AND document_id = ? AND type = 'esign_signature'", [timestamp, local.transaction_id, local.id]]
    ]);
    await audit(env, {transactionId:local.transaction_id, actorUserId, eventType:"esign.completed", entityType:"document", entityId:local.id, summary:`${local.filename} fully executed and stored.`, metadata:{provider:"signwell"}});
  } else {
    await audit(env, {transactionId:local.transaction_id, actorUserId, eventType:"esign.updated", entityType:"document", entityId:local.id, summary:`Signature status updated for ${local.filename}.`, metadata:{provider:"signwell"}});
  }
  return {ok:true, complete:remoteComplete(remote)};
}

export async function signwellWebhook(request, env) {
  const supplied = new URL(request.url).searchParams.get("token") || request.headers.get("X-MREO-Webhook-Token");
  if (!env.SIGNWELL_WEBHOOK_TOKEN || supplied !== env.SIGNWELL_WEBHOOK_TOKEN) throw new HttpError("Invalid webhook token.", 401, "invalid_webhook");
  let payload; try { payload = await request.json(); } catch { throw new HttpError("Invalid webhook payload."); }
  const externalId = payload?.data?.object?.id || payload?.document?.id || payload?.id;
  if (!externalId) throw new HttpError("Document identifier missing from webhook.");
  // The webhook body is never trusted. Reconciliation pulls the authoritative record using MREO's API key.
  return reconcileSignwell(env, clean(externalId, 100));
}
