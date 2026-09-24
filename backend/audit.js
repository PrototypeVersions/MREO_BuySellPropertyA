import {run} from "./db.js";
import {id, now} from "./http.js";

export async function audit(env, {transactionId = null, actorUserId = null, eventType, entityType = null, entityId = null, summary, metadata = {}}) {
  await run(env, `INSERT INTO audit_events (id, transaction_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id("evt"), transactionId, actorUserId, eventType, entityType, entityId, summary, JSON.stringify(metadata), now());
}
