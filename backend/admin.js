import {batch} from "./db.js";
import {requireStaff} from "./auth.js";
import {bodyJSON, HttpError} from "./http.js";

const RESET_CONFIRMATION = "RESET ALL";
const RESET_TABLES = [
  "DELETE FROM document_recipients",
  "DELETE FROM tasks",
  "DELETE FROM messages",
  "DELETE FROM service_requests",
  "DELETE FROM audit_events",
  "DELETE FROM documents",
  "DELETE FROM threads",
  "DELETE FROM transaction_participants",
  "DELETE FROM transactions"
];

const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");

export async function internalResetToken(env) {
  if (!env.HANDOFF_SIGNING_SECRET) throw new HttpError("The reset service is not configured.", 503, "reset_unavailable");
  const input = new TextEncoder().encode(`mreo-platform-reset:${env.HANDOFF_SIGNING_SECRET}`);
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
}

async function clearDocuments(env) {
  if (!env.DOCUMENTS) return 0;
  let cursor, deleted = 0;
  do {
    const page = await env.DOCUMENTS.list(cursor ? {cursor} : {});
    const keys = (page.objects || []).map(item => item.key).filter(Boolean);
    if (keys.length) { await env.DOCUMENTS.delete(keys); deleted += keys.length; }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

// Preserve Clerk-linked identities and staff permissions while returning every
// participant workspace, file, message, task, service request, and auction to a
// clean test state.
export async function resetPlatformData(env) {
  const documentsDeleted = await clearDocuments(env);
  if (env.DB) await batch(env, RESET_TABLES.map(sql => [sql]));
  return {documentsDeleted};
}

export async function resetAllData(request, env, user) {
  await requireStaff(env, user, "admin", "agent");
  const data = await bodyJSON(request);
  if (data.confirmation !== RESET_CONFIRMATION) throw new HttpError(`Type ${RESET_CONFIRMATION} to confirm the reset.`, 400, "reset_confirmation_required");
  if (!env.EXCHANGE) throw new HttpError("The auction reset service is unavailable.", 503, "reset_unavailable");
  const result = await resetPlatformData(env);
  const stub = env.EXCHANGE.get(env.EXCHANGE.idFromName("mreo-exchange-v1"));
  const response = await stub.fetch(new Request("https://exchange.internal/internal/reset", {
    method:"POST", headers:{"X-MREO-Internal-Reset":await internalResetToken(env)}
  }));
  if (!response.ok) throw new HttpError("The auction reset did not complete.", 503, "reset_incomplete");
  return {ok:true, ...result};
}
