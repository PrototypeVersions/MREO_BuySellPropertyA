import {all, one, run} from "./db.js";
import {audit} from "./audit.js";
import {clean, HttpError, id, now} from "./http.js";
import {participation} from "./transactions.js";

const allowedTypes = new Set([
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

export function canSeeDocument(document, access) {
  if (access.staff || document.visibility === "participants") return true;
  if (document.visibility === "buyer_agent") return access.role === "buyer";
  if (document.visibility === "seller_agent") return access.role === "seller";
  if (document.visibility === "agent_provider") return access.role === "provider";
  return false;
}

export async function listDocuments(env, user, transactionId) {
  const access = await participation(env, transactionId, user);
  const rows = await all(env, "SELECT * FROM documents WHERE transaction_id = ? ORDER BY created_at DESC", transactionId);
  const recipients = await signingRecipients(env, user, transactionId);
  // A staff member can also participate as a buyer or seller. Keep those
  // participant roles separate from their staff-wide read access so that a
  // document can only be self-signed in a role that was actually granted.
  const participantRoles = await all(env, `SELECT role FROM transaction_participants
    WHERE transaction_id = ? AND user_id = ? AND status = 'active'
    ORDER BY CASE role WHEN 'buyer' THEN 1 WHEN 'seller' THEN 2 WHEN 'provider' THEN 3 ELSE 4 END`, transactionId, user.id);
  return rows.filter(row => canSeeDocument(row, access)).map(({object_key, completed_object_key, esign_external_id, ...row}) => {
    const signer = recipients.find(recipient => recipient.document_id === row.id);
    const signatureRole = participantRoles.find(person => canSeeDocument(row, {role:person.role, staff:false}))?.role || null;
    return {...row, can_sign:row.status === "signature_pending" && !!signer && !["signed","declined"].includes(signer.status),
      signer_status:signer?.status || null, can_check_signing:!!esign_external_id && (access.staff || !!signer),
      can_request_signature:row.status === "available" && row.content_type === "application/pdf" && row.uploaded_by === user.id && !!signatureRole,
      request_signature_role:signatureRole, signing_test_mode:env.SIGNWELL_TEST_MODE !== "false"};
  });
}

// Signing belongs to an individual, active participant, even if they also have a staff role.
export async function signingRecipients(env, user, transactionId) {
  return all(env, `SELECT r.* FROM document_recipients r
    JOIN documents d ON d.id = r.document_id
    JOIN transaction_participants p ON p.transaction_id = d.transaction_id AND p.user_id = ? AND p.role = r.role AND p.status = 'active'
    WHERE d.transaction_id = ? AND (r.user_id = ? OR (r.user_id IS NULL AND lower(r.email) = lower(?)))`, user.id, transactionId, user.id, user.email || "");
}

export async function uploadDocument(request, env, user, transactionId) {
  const access = await participation(env, transactionId, user);
  if (!env.DOCUMENTS) throw new HttpError("Document storage is not configured.", 503, "storage_unavailable");
  const form = await request.formData(), file = form.get("file");
  if (!(file instanceof File)) throw new HttpError("Choose a document to upload.", 400, "file_required");
  if (!file.size || file.size > 25 * 1024 * 1024) throw new HttpError("Documents must be smaller than 25 MB.", 413, "file_too_large");
  const contentType = clean(file.type, 120) || "application/octet-stream";
  if (!allowedTypes.has(contentType)) throw new HttpError("That document type is not supported.", 415, "file_type");
  const filename = clean(file.name, 240).replace(/[\\/\0]/g, "-") || "document";
  const documentId = id("doc"), timestamp = now(), key = `transactions/${transactionId}/${documentId}/original/${filename}`;
  await env.DOCUMENTS.put(key, file.stream(), {httpMetadata:{contentType, contentDisposition:`attachment; filename="${filename.replaceAll('"','')}"`}, customMetadata:{transactionId, documentId}});
  const requestedVisibility = form.get("visibility");
  const visibility = access.staff && ["participants","buyer_agent","seller_agent","agent_provider","agent_only"].includes(requestedVisibility)
    ? requestedVisibility : ({buyer:"buyer_agent",seller:"seller_agent",provider:"agent_provider"}[access.role] || "agent_only");
  const kind = clean(form.get("kind"), 80) || "general";
  await run(env, `INSERT INTO documents (id, transaction_id, uploaded_by, kind, filename, object_key, content_type, size_bytes, status, visibility, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)`, documentId, transactionId, user.id, kind, filename, key, contentType, file.size, visibility, timestamp, timestamp);
  await audit(env, {transactionId, actorUserId:user.id, eventType:"document.uploaded", entityType:"document", entityId:documentId, summary:`Document uploaded: ${filename}`, metadata:{kind, visibility, role:access.role}});
  return {id:documentId, filename, kind, status:"available", visibility, sizeBytes:file.size, createdAt:timestamp};
}

export async function downloadDocument(request, env, user, transactionId, documentId) {
  const access = await participation(env, transactionId, user);
  const document = await one(env, "SELECT * FROM documents WHERE id = ? AND transaction_id = ?", documentId, transactionId);
  if (!document || !canSeeDocument(document, access)) throw new HttpError("Document not found.", 404, "not_found");
  const completed = new URL(request.url).searchParams.get("version") === "completed";
  if (completed && !document.completed_object_key) throw new HttpError("The signed PDF is not ready yet. Check signing status and try again.", 409, "signed_pdf_pending");
  const key = completed ? document.completed_object_key : document.object_key;
  const object = await env.DOCUMENTS?.get(key);
  if (!object) throw new HttpError("The stored file is unavailable.", 404, "file_missing");
  const headers = new Headers(); object.writeHttpMetadata(headers);
  headers.set("Content-Type", completed ? "application/pdf" : document.content_type);
  headers.set("Content-Disposition", `attachment; filename="${(completed ? `Executed-${document.filename.replace(/\.[^.]+$/, '')}.pdf` : document.filename).replaceAll('"','')}"`);
  headers.set("Cache-Control", "private, no-store"); headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, {headers});
}

export async function getDocument(env, transactionId, documentId) {
  const document = await one(env, "SELECT * FROM documents WHERE id = ? AND transaction_id = ?", documentId, transactionId);
  if (!document) throw new HttpError("Document not found.", 404, "not_found");
  return document;
}
