import {all, batch, one, parseJSON, run, database} from "./db.js";
import {audit} from "./audit.js";
import {bodyJSON, clean, HttpError, id, now} from "./http.js";
import {hasRole} from "./auth.js";
import {verifyHandoffToken} from "./handoff.js";

export async function participation(env, transactionId, user) {
  const staff = await hasRole(env, user.id, "agent") || await hasRole(env, user.id, "admin");
  if (staff) return {transaction_id:transactionId, user_id:user.id, role:"agent", staff:true};
  const row = await one(env, `SELECT * FROM transaction_participants
    WHERE transaction_id = ? AND user_id = ? AND status = 'active'
    ORDER BY CASE role WHEN 'buyer' THEN 1 WHEN 'seller' THEN 2 ELSE 3 END LIMIT 1`, transactionId, user.id);
  if (!row) throw new HttpError("You do not have access to this transaction.", 403, "transaction_forbidden");
  return row;
}

const viewTransaction = row => ({...row, property:parseJSON(row.property_json, {}), property_json:undefined});

export async function listTransactions(env, user) {
  const staff = await hasRole(env, user.id, "agent") || await hasRole(env, user.id, "admin");
  const rows = staff
    ? await all(env, `SELECT t.*, 'agent' viewer_role FROM transactions t ORDER BY t.updated_at DESC LIMIT 200`)
    : await all(env, `SELECT t.*, p.role viewer_role FROM transactions t
        JOIN transaction_participants p ON p.transaction_id = t.id
        WHERE p.user_id = ? AND p.status = 'active' ORDER BY t.updated_at DESC LIMIT 200`, user.id);
  return rows.map(viewTransaction);
}

export async function getTransaction(env, transactionId, user) {
  const access = await participation(env, transactionId, user);
  const transaction = await one(env, "SELECT * FROM transactions WHERE id = ?", transactionId);
  if (!transaction) throw new HttpError("Transaction not found.", 404, "not_found");
  const participants = await all(env, `SELECT p.role, p.status, u.id, u.display_name, u.email
    FROM transaction_participants p JOIN users u ON u.id = p.user_id
    WHERE p.transaction_id = ? AND p.status <> 'removed' ORDER BY p.created_at`, transactionId);
  return {...viewTransaction(transaction), viewerRole:access.role, participants};
}

export async function createTransaction(request, env, user) {
  const data = await bodyJSON(request);
  const claims = env.AUTH_MODE === "test" ? data : await verifyHandoffToken(env, data.handoffToken);
  const role = ["buyer","seller"].includes(claims.role) ? claims.role : null;
  if (!role) throw new HttpError("Choose buyer or seller participation.", 400, "invalid_role");
  const sourceAuctionId = clean(claims.auctionId, 120) || null;
  if (sourceAuctionId) {
    const existing = await one(env, "SELECT id FROM transactions WHERE source_auction_id = ?", sourceAuctionId);
    if (existing) {
      await run(env, "INSERT OR IGNORE INTO transaction_participants (transaction_id, user_id, role, status, created_at) VALUES (?, ?, ?, 'active', ?)", existing.id, user.id, role, now());
      return getTransaction(env, existing.id, user);
    }
  }
  const title = clean(claims.title, 300);
  if (!title) throw new HttpError("Provide the property or portfolio title.", 400, "title_required");
  const transactionId = id("tx"), timestamp = now(), kind = claims.kind === "portfolio" ? "portfolio" : "property";
  const amount = Number.isFinite(Number(claims.amount)) && Number(claims.amount) > 0 ? Math.round(Number(claims.amount) * 100) : null;
  const property = typeof claims.property === "object" && claims.property ? claims.property : {};
  await batch(env, [
    ["INSERT INTO transactions (id, source_auction_id, kind, title, status, amount_cents, property_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'closing', ?, ?, ?, ?, ?)", [transactionId, sourceAuctionId, kind, title, amount, JSON.stringify(property), user.id, timestamp, timestamp]],
    ["INSERT INTO transaction_participants (transaction_id, user_id, role, status, created_at) VALUES (?, ?, ?, 'active', ?)", [transactionId, user.id, role, timestamp]],
    ["INSERT INTO threads (id, transaction_id, kind, created_at) VALUES (?, ?, 'buyer_agent', ?)", [id("thr"), transactionId, timestamp]],
    ["INSERT INTO threads (id, transaction_id, kind, created_at) VALUES (?, ?, 'seller_agent', ?)", [id("thr"), transactionId, timestamp]],
    ["INSERT INTO threads (id, transaction_id, kind, created_at) VALUES (?, ?, 'provider_agent', ?)", [id("thr"), transactionId, timestamp]],
    ["INSERT INTO tasks (id, transaction_id, assigned_role, assigned_user_id, type, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'transaction_onboarding', ?, 'action', ?, ?)", [id("task"), transactionId, role, user.id, role === "buyer" ? "Review winning transaction and await agent instructions" : "Review auction result and await agent instructions", timestamp, timestamp]]
  ]);
  await audit(env, {transactionId, actorUserId:user.id, eventType:"transaction.created", entityType:"transaction", entityId:transactionId, summary:"MREO transaction workspace created.", metadata:{role, sourceAuctionId}});
  return getTransaction(env, transactionId, user);
}

export async function addParticipant(request, env, user, transactionId) {
  await participation(env, transactionId, user);
  if (!(await hasRole(env, user.id, "agent") || await hasRole(env, user.id, "admin"))) throw new HttpError("Only an MREO agent can add participants.", 403, "agent_required");
  const data = await bodyJSON(request), role = clean(data.role, 20), email = clean(data.email, 254).toLowerCase();
  if (!["buyer","seller","agent","provider"].includes(role) || !email) throw new HttpError("Provide a participant role and email.");
  const target = await one(env, "SELECT * FROM users WHERE lower(email) = ?", email);
  if (!target) throw new HttpError("That person must create an MREO account before being added.", 409, "account_required");
  await run(env, "INSERT OR REPLACE INTO transaction_participants (transaction_id, user_id, role, status, created_at) VALUES (?, ?, ?, 'active', ?)", transactionId, target.id, role, now());
  await audit(env, {transactionId, actorUserId:user.id, eventType:"participant.added", entityType:"user", entityId:target.id, summary:`${role} participant added to the transaction.`, metadata:{role}});
  return {ok:true};
}

export async function transactionEvents(env, transactionId, user) {
  await participation(env, transactionId, user);
  return all(env, `SELECT a.*, u.display_name actor_name FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE a.transaction_id = ? ORDER BY a.created_at ASC LIMIT 500`, transactionId);
}
