import {HttpError} from "./http.js";

export function database(env) {
  if (!env.DB) throw new HttpError("The transaction database is not configured.", 503, "database_unavailable");
  return env.DB;
}

export async function one(env, sql, ...values) {
  return database(env).prepare(sql).bind(...values).first();
}

export async function all(env, sql, ...values) {
  const result = await database(env).prepare(sql).bind(...values).all();
  return result.results || [];
}

export async function run(env, sql, ...values) {
  return database(env).prepare(sql).bind(...values).run();
}

export async function batch(env, statements) {
  return database(env).batch(statements.map(([sql, values = []]) => database(env).prepare(sql).bind(...values)));
}

export function parseJSON(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
