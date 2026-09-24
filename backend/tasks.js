import {all, one, run} from "./db.js";
import {audit} from "./audit.js";
import {bodyJSON, clean, HttpError, id, now} from "./http.js";
import {participation} from "./transactions.js";

export async function listTasks(env, user, transactionId) {
  const access = await participation(env, transactionId, user);
  const rows = access.staff
    ? await all(env, "SELECT * FROM tasks WHERE transaction_id = ? ORDER BY CASE status WHEN 'action' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END, created_at", transactionId)
    : await all(env, `SELECT * FROM tasks WHERE transaction_id = ? AND (assigned_user_id = ? OR (assigned_user_id IS NULL AND assigned_role = ?))
        ORDER BY CASE status WHEN 'action' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END, created_at`, transactionId, user.id, access.role);
  return rows;
}

export async function createTask(request, env, user, transactionId) {
  const access = await participation(env, transactionId, user);
  if (!access.staff) throw new HttpError("Only an MREO agent can assign transaction tasks.", 403, "agent_required");
  const data = await bodyJSON(request), role = clean(data.assignedRole, 20), title = clean(data.title, 300), type = clean(data.type, 80) || "general";
  if (!["buyer","seller","agent","provider"].includes(role) || !title) throw new HttpError("Provide a task title and valid assigned role.");
  const taskId = id("task"), timestamp = now();
  await run(env, `INSERT INTO tasks (id, transaction_id, assigned_role, assigned_user_id, type, title, status, document_id, due_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'action', ?, ?, ?, ?)`, taskId, transactionId, role, data.assignedUserId || null, type, title, data.documentId || null, Number(data.dueAt) || null, timestamp, timestamp);
  await audit(env, {transactionId, actorUserId:user.id, eventType:"task.created", entityType:"task", entityId:taskId, summary:`Action assigned to ${role}: ${title}`, metadata:{role, type}});
  return {id:taskId, status:"action"};
}

export async function updateTask(request, env, user, transactionId, taskId) {
  const access = await participation(env, transactionId, user), task = await one(env, "SELECT * FROM tasks WHERE id = ? AND transaction_id = ?", taskId, transactionId);
  if (!task) throw new HttpError("Task not found.", 404, "not_found");
  if (!access.staff && task.assigned_user_id !== user.id && !(task.assigned_user_id == null && task.assigned_role === access.role)) throw new HttpError("This task is assigned to another participant.", 403, "task_forbidden");
  const data = await bodyJSON(request), status = clean(data.status, 20);
  if (!['action','waiting','complete','cancelled'].includes(status)) throw new HttpError("Invalid task status.");
  await run(env, "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?", status, now(), taskId);
  await audit(env, {transactionId, actorUserId:user.id, eventType:"task.updated", entityType:"task", entityId:taskId, summary:`Task marked ${status}: ${task.title}`, metadata:{from:task.status, to:status}});
  return {id:taskId, status};
}
