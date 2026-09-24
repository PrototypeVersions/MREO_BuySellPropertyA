import {authenticate, hasRole, requireStaff} from "./auth.js";
import {all, one, run} from "./db.js";
import {audit} from "./audit.js";
import {bodyJSON, clean, errorResponse, HttpError, json, now} from "./http.js";
import {addParticipant, createTransaction, getTransaction, listTransactions, participation, transactionEvents} from "./transactions.js";
import {correctMessage, createMessage, listMessages} from "./messages.js";
import {createTask, listTasks, updateTask} from "./tasks.js";
import {downloadDocument, listDocuments, uploadDocument} from "./documents.js";
import {createSignatureRequest, signingSession, signwellWebhook} from "./esign.js";
import {createRoomTicket, notifyRoom} from "./rooms.js";
import {createServiceRequest, listServiceRequests, updateServiceRequest} from "./services.js";

const match = (path, pattern) => path.match(pattern);

export async function apiFetch(request, env) {
  try {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    if (path === "/webhooks/signwell" && method === "POST") return json(await signwellWebhook(request, env));
    if (path === "/api/v1/config" && method === "GET") return json({
      connected:!!env.DB, authConfigured:!!env.CLERK_PUBLISHABLE_KEY,
      clerkPublishableKey:env.CLERK_PUBLISHABLE_KEY || "", signwellConfigured:!!env.SIGNWELL_API_KEY,
      signwellTestMode:env.SIGNWELL_TEST_MODE !== "false", realtimeConfigured:!!env.ROOM_SIGNING_SECRET
    });
    let found;
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/live$/)) && request.headers.get("Upgrade") === "websocket") {
      if (!env.TRANSACTION_ROOMS) throw new HttpError("Real-time updates are not configured.", 503, "realtime_unavailable");
      const stub = env.TRANSACTION_ROOMS.get(env.TRANSACTION_ROOMS.idFromName(found[1]));
      const roomUrl = new URL("https://room.internal/"); roomUrl.searchParams.set("transaction", found[1]); roomUrl.searchParams.set("ticket", url.searchParams.get("ticket") || "");
      return stub.fetch(new Request(roomUrl, request));
    }
    const user = await authenticate(request, env);
    if (path === "/api/v1/me" && method === "GET") {
      const roles = (await all(env, "SELECT role FROM user_roles WHERE user_id = ?", user.id)).map(item => item.role);
      return json({id:user.id, email:user.email, displayName:user.display_name, phone:user.phone, roles});
    }
    if (path === "/api/v1/me" && method === "PATCH") {
      const data = await bodyJSON(request), displayName = clean(data.displayName, 120), phone = clean(data.phone, 40);
      if (!displayName) throw new HttpError("Provide your name.");
      await run(env, "UPDATE users SET display_name = ?, phone = ?, updated_at = ? WHERE id = ?", displayName, phone || null, now(), user.id);
      return json({ok:true});
    }
    if (path === "/api/v1/transactions" && method === "GET") return json({transactions:await listTransactions(env, user)});
    if (path === "/api/v1/transactions" && method === "POST") return json(await createTransaction(request, env, user), 201);
    if (path === "/api/v1/agent/transactions" && method === "GET") {
      await requireStaff(env, user, "agent", "admin");
      const transactions = await listTransactions(env, user);
      const actionCounts = await all(env, "SELECT transaction_id, count(*) count FROM tasks WHERE status = 'action' GROUP BY transaction_id");
      const counts = Object.fromEntries(actionCounts.map(item => [item.transaction_id, item.count]));
      return json({transactions:transactions.map(item => ({...item, actionCount:counts[item.id] || 0}))});
    }
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)$/))) {
      if (method === "GET") return json(await getTransaction(env, found[1], user));
    }
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/participants$/)) && method === "POST") return json(await addParticipant(request, env, user, found[1]), 201);
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/events$/)) && method === "GET") return json({events:await transactionEvents(env, found[1], user)});
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/messages$/))) {
      if (method === "GET") return json(await listMessages(request, env, user, found[1]));
      if (method === "POST") { const result = await createMessage(request, env, user, found[1]); await notifyRoom(env, found[1], {type:"message.created", id:result.id}); return json(result, 201); }
    }
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/messages\/([^/]+)\/corrections$/)) && method === "POST") {
      const result = await correctMessage(request, env, user, found[1], found[2]); await notifyRoom(env, found[1], {type:"message.corrected", id:result.id}); return json(result, 201);
    }
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/tasks$/))) {
      if (method === "GET") return json({tasks:await listTasks(env, user, found[1])});
      if (method === "POST") { const result = await createTask(request, env, user, found[1]); await notifyRoom(env, found[1], {type:"task.created", id:result.id}); return json(result, 201); }
    }
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/tasks\/([^/]+)$/)) && method === "PATCH") {
      const result = await updateTask(request, env, user, found[1], found[2]); await notifyRoom(env, found[1], {type:"task.updated", id:result.id}); return json(result);
    }
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/documents$/))) {
      if (method === "GET") return json({documents:await listDocuments(env, user, found[1])});
      if (method === "POST") { const result = await uploadDocument(request, env, user, found[1]); await notifyRoom(env, found[1], {type:"document.uploaded", id:result.id}); return json(result, 201); }
    }
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/documents\/([^/]+)\/download$/)) && method === "GET") return downloadDocument(request, env, user, found[1], found[2]);
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/documents\/([^/]+)\/signatures$/)) && method === "POST") {
      const result = await createSignatureRequest(request, env, user, found[1], found[2]); await notifyRoom(env, found[1], {type:"esign.sent", documentId:found[2]}); return json(result, 201);
    }
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/documents\/([^/]+)\/signing-session$/)) && method === "POST") return json(await signingSession(env, user, found[1], found[2]));
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/services$/))) {
      if (method === "GET") return json({services:await listServiceRequests(env, user, found[1])});
      if (method === "POST") { const result=await createServiceRequest(request, env, user, found[1]); await notifyRoom(env, found[1], {type:"service.requested",id:result.id}); return json(result,201); }
    }
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/services\/([^/]+)$/)) && method === "PATCH") {
      const result=await updateServiceRequest(request, env, user, found[1], found[2]); await notifyRoom(env, found[1], {type:"service.updated",id:result.id}); return json(result);
    }
    if ((found = match(path, /^\/api\/v1\/transactions\/([^/]+)\/live-ticket$/)) && method === "POST") {
      const access = await participation(env, found[1], user);
      return json({ticket:await createRoomTicket(env, found[1], user.id, access.role)});
    }
    throw new HttpError("Route not found.", 404, "not_found");
  } catch (error) { return errorResponse(error); }
}
