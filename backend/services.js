import {all, one, parseJSON, run} from "./db.js";
import {audit} from "./audit.js";
import {bodyJSON, clean, HttpError, id, now} from "./http.js";
import {participation} from "./transactions.js";

const types = new Set(["title","contractors","realtors","rentals"]);
const expose = row => ({...row, request:parseJSON(row.request_json, {}), response:parseJSON(row.response_json, null), request_json:undefined, response_json:undefined});

export async function listServiceRequests(env, user, transactionId) {
  await participation(env, transactionId, user);
  return (await all(env, "SELECT * FROM service_requests WHERE transaction_id = ? ORDER BY created_at DESC", transactionId)).map(expose);
}

export async function createServiceRequest(request, env, user, transactionId) {
  const access = await participation(env, transactionId, user), data = await bodyJSON(request), type = clean(data.serviceType, 40);
  if (!types.has(type)) throw new HttpError("Choose a supported coordination service.");
  const existing = await one(env, "SELECT * FROM service_requests WHERE transaction_id = ? AND service_type = ? AND status <> 'complete' ORDER BY created_at DESC LIMIT 1", transactionId, type);
  if (existing) return expose(existing);
  const requestId = id("svc"), timestamp = now(), payload = typeof data.request === "object" && data.request ? data.request : {};
  await run(env, `INSERT INTO service_requests (id, transaction_id, service_type, status, request_json, created_at, updated_at)
    VALUES (?, ?, ?, 'submitted', ?, ?, ?)`, requestId, transactionId, type, JSON.stringify(payload), timestamp, timestamp);
  await audit(env, {transactionId, actorUserId:user.id, eventType:"service.requested", entityType:"service_request", entityId:requestId, summary:`${type} coordination requested.`, metadata:{type, role:access.role}});
  return {id:requestId, transaction_id:transactionId, service_type:type, status:"submitted", request:payload, created_at:timestamp, updated_at:timestamp};
}

export async function updateServiceRequest(request, env, user, transactionId, requestId) {
  const access = await participation(env, transactionId, user), record = await one(env, "SELECT * FROM service_requests WHERE id = ? AND transaction_id = ?", requestId, transactionId);
  if (!record) throw new HttpError("Service request not found.", 404, "not_found");
  const data = await bodyJSON(request), status = clean(data.status, 30), allowed = ["submitted","provider_reviewing","response_ready","approved","in_progress","waiting","complete","cancelled"];
  if (!allowed.includes(status)) throw new HttpError("Invalid service status.");
  if (!["agent","provider"].includes(access.role) && !["approved","cancelled"].includes(status)) throw new HttpError("This service update requires the MREO Agent or assigned provider.", 403, "service_forbidden");
  const response = typeof data.response === "object" && data.response ? JSON.stringify(data.response) : record.response_json;
  await run(env, "UPDATE service_requests SET status = ?, response_json = ?, updated_at = ? WHERE id = ?", status, response, now(), requestId);
  await audit(env, {transactionId, actorUserId:user.id, eventType:"service.updated", entityType:"service_request", entityId:requestId, summary:`${record.service_type} coordination marked ${status}.`, metadata:{from:record.status,to:status}});
  return {id:requestId, status};
}
