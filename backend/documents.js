import {all, one, run} from "./db.js";
import {audit} from "./audit.js";
import {clean, HttpError, id, now} from "./http.js";
import {participation} from "./transactions.js";

const allowedTypes = new Set([
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

function canSee(document, access) {
  if (access.staff || document.visibility === "participants") return true;
  if (document.visibility === "buyer_agent") return access.role === "buyer";
  if (document.visibility === "seller_agent") return access.role === "seller";
  if (document.visibility === "agent_provider") return access.role === "provider";
  return false;
}

export async function listDocuments(env, user, transactionId) {
  const access = await participation(env, transactionId, user);
  const rows = await all(env, "SELECT * FROM documents WHERE transaction_id = ? ORDER BY created_at DESC", transactionId);
  return rows.filter(row => canSee(row, access)).map(({object_key, completed_object_key, ...row}) => row);
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
  const visibility = ["participants","buyer_agent","seller_agent","agent_provider","agent_only"].includes(form.get("visibility")) ? form.get("visibility") : "participants";
  const kind = clean(form.get("kind"), 80) || "general";
  await run(env, `INSERT INTO documents (id, transaction_id, uploaded_by, kind, filename, object_key, content_type, size_bytes, status, visibility, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)`, documentId, transactionId, user.id, kind, filename, key, contentType, file.size, visibility, timestamp, timestamp);
  await audit(env, {transactionId, actorUserId:user.id, eventType:"document.uploaded", entityType:"document", entityId:documentId, summary:`Document uploaded: ${filename}`, metadata:{kind, visibility, role:access.role}});
  return {id:documentId, filename, kind, status:"available", visibility, sizeBytes:file.size, createdAt:timestamp};
}

export async function downloadDocument(request, env, user, transactionId, documentId) {
  const access = await participation(env, transactionId, user);
  const document = await one(env, "SELECT * FROM documents WHERE id = ? AND transaction_id = ?", documentId, transactionId);
  if (!document || !canSee(document, access)) throw new HttpError("Document not found.", 404, "not_found");
  const completed = new URL(request.url).searchParams.get("version") === "completed";
  const key = completed && document.completed_object_key ? document.completed_object_key : document.object_key;
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
