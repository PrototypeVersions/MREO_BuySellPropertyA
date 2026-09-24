import {all, one, run} from "./db.js";
import {audit} from "./audit.js";
import {bodyJSON, clean, HttpError, id, now} from "./http.js";
import {participation} from "./transactions.js";

const threadKind = role => role === "buyer" ? "buyer_agent" : role === "seller" ? "seller_agent" : role === "provider" ? "provider_agent" : null;

async function selectThread(env, transactionId, access, requestedKind = null) {
  let kind = threadKind(access.role);
  if (access.staff) {
    if (!["buyer_agent","seller_agent","provider_agent"].includes(requestedKind)) throw new HttpError("Choose the buyer, seller, or provider thread.", 400, "thread_required");
    kind = requestedKind;
  }
  const thread = await one(env, "SELECT * FROM threads WHERE transaction_id = ? AND kind = ?", transactionId, kind);
  if (!thread) throw new HttpError("Thread not found.", 404, "not_found");
  return thread;
}

export async function listMessages(request, env, user, transactionId) {
  const access = await participation(env, transactionId, user);
  const kind = new URL(request.url).searchParams.get("thread");
  const thread = await selectThread(env, transactionId, access, kind);
  const messages = await all(env, `SELECT m.id, m.thread_id, m.author_role, m.body, m.correction_of, m.created_at,
      u.display_name author_name FROM messages m JOIN users u ON u.id = m.author_user_id
    WHERE m.thread_id = ? ORDER BY m.created_at ASC LIMIT 500`, thread.id);
  return {thread:{id:thread.id, kind:thread.kind}, messages};
}

export async function createMessage(request, env, user, transactionId) {
  const access = await participation(env, transactionId, user), data = await bodyJSON(request);
  const thread = await selectThread(env, transactionId, access, data.thread);
  const body = clean(data.body, 8000);
  if (!body) throw new HttpError("Write a message before sending.", 400, "message_required");
  const messageId = id("msg"), timestamp = now(), role = access.staff ? "agent" : access.role;
  await run(env, "INSERT INTO messages (id, thread_id, author_user_id, author_role, body, correction_of, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", messageId, thread.id, user.id, role, body, null, timestamp);
  await audit(env, {transactionId, actorUserId:user.id, eventType:"message.created", entityType:"message", entityId:messageId, summary:`${role === "agent" ? "MREO Agent" : role} sent a message.`, metadata:{thread:thread.kind}});
  return {id:messageId, threadId:thread.id, authorRole:role, body, createdAt:timestamp};
}

export async function correctMessage(request, env, user, transactionId, messageId) {
  const access = await participation(env, transactionId, user), data = await bodyJSON(request);
  const original = await one(env, `SELECT m.*, t.kind FROM messages m JOIN threads t ON t.id = m.thread_id
    WHERE m.id = ? AND t.transaction_id = ?`, messageId, transactionId);
  if (!original || original.author_user_id !== user.id) throw new HttpError("Only the original author can add a correction.", 403, "correction_forbidden");
  await selectThread(env, transactionId, access, original.kind);
  const body = clean(data.body, 8000), reason = clean(data.reason, 500);
  if (!body || !reason) throw new HttpError("Provide the correction and the reason.");
  const correctionId = id("msg"), timestamp = now();
  await run(env, "INSERT INTO messages (id, thread_id, author_user_id, author_role, body, correction_of, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", correctionId, original.thread_id, user.id, original.author_role, body, original.id, timestamp);
  await audit(env, {transactionId, actorUserId:user.id, eventType:"message.corrected", entityType:"message", entityId:correctionId, summary:"A correction was added to an earlier message.", metadata:{originalId:original.id, reason}});
  return {id:correctionId, correctionOf:original.id, body, createdAt:timestamp};
}
