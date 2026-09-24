import {one, run} from "./db.js";
import {HttpError, id, now, clean} from "./http.js";

let cachedJwks = null;
let cachedAt = 0;

const decode = value => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
};
const decodeJSON = value => JSON.parse(new TextDecoder().decode(decode(value)));

async function jwks(env) {
  if (env.CLERK_JWKS_JSON) return JSON.parse(env.CLERK_JWKS_JSON);
  if (cachedJwks && now() - cachedAt < 60 * 60 * 1000) return cachedJwks;
  const url = env.CLERK_JWKS_URL || "https://api.clerk.com/v1/jwks";
  const headers = env.CLERK_SECRET_KEY ? {Authorization:`Bearer ${env.CLERK_SECRET_KEY}`} : {};
  const response = await fetch(url, {headers, signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new HttpError("Authentication verification is unavailable.", 503, "auth_unavailable");
  cachedJwks = await response.json(); cachedAt = now(); return cachedJwks;
}

async function verifyJwt(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError("Invalid session token.", 401, "invalid_session");
  const header = decodeJSON(parts[0]);
  const claims = decodeJSON(parts[1]);
  if (header.alg !== "RS256") throw new HttpError("Unsupported session token.", 401, "invalid_session");
  const set = await jwks(env), key = set.keys?.find(item => item.kid === header.kid && item.kty === "RSA");
  if (!key) throw new HttpError("Unknown session key.", 401, "invalid_session");
  const publicKey = await crypto.subtle.importKey("jwk", key, {name:"RSASSA-PKCS1-v1_5", hash:"SHA-256"}, false, ["verify"]);
  const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!verified) throw new HttpError("Invalid session signature.", 401, "invalid_session");
  const seconds = Math.floor(now() / 1000);
  if (!claims.sub || claims.exp < seconds || (claims.nbf && claims.nbf > seconds + 5)) throw new HttpError("Your session has expired.", 401, "expired_session");
  const allowed = [env.SITE_URL, env.AUTHORIZED_PARTIES].filter(Boolean).flatMap(value => String(value).split(",")).map(value => {
    try { return new URL(value.trim()).origin; } catch { return value.trim(); }
  });
  if (claims.azp && allowed.length && !allowed.includes(claims.azp)) throw new HttpError("This session was issued for another site.", 403, "invalid_authorized_party");
  return claims;
}

async function clerkProfile(subject, env) {
  if (!env.CLERK_SECRET_KEY) return {};
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(subject)}`, {headers:{Authorization:`Bearer ${env.CLERK_SECRET_KEY}`}, signal:AbortSignal.timeout(10000)});
  if (!response.ok) return {};
  const user = await response.json();
  const primary = user.email_addresses?.find(item => item.id === user.primary_email_address_id) || user.email_addresses?.[0];
  return {email:primary?.email_address || "", displayName:[user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || ""};
}

export async function authenticate(request, env, {optional = false} = {}) {
  if (env.AUTH_MODE === "test") {
    const subject = request.headers.get("X-MREO-Test-User");
    if (!subject) { if (optional) return null; throw new HttpError("Sign in to continue.", 401, "sign_in_required"); }
    return syncUser({sub:subject, email:request.headers.get("X-MREO-Test-Email") || `${subject}@example.com`, name:request.headers.get("X-MREO-Test-Name") || subject}, env);
  }
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) { if (optional) return null; throw new HttpError("Sign in to continue.", 401, "sign_in_required"); }
  return syncUser(await verifyJwt(token, env), env);
}

async function syncUser(claims, env) {
  let user = await one(env, "SELECT * FROM users WHERE auth_subject = ?", claims.sub);
  if (user) return user;
  const profile = await clerkProfile(claims.sub, env);
  const timestamp = now(), userId = id("usr");
  const email = clean(profile.email || claims.email, 254) || null;
  const name = clean(profile.displayName || claims.name, 120) || null;
  await run(env, "INSERT OR IGNORE INTO users (id, auth_subject, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", userId, claims.sub, email, name, timestamp, timestamp);
  user = await one(env, "SELECT * FROM users WHERE auth_subject = ?", claims.sub);
  const agents = String(env.MREO_AGENT_EMAILS || "").toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
  if (user?.email && agents.includes(user.email.toLowerCase())) await run(env, "INSERT OR IGNORE INTO user_roles (user_id, role, created_at) VALUES (?, 'agent', ?)", user.id, timestamp);
  return user;
}

export async function hasRole(env, userId, role) {
  return !!await one(env, "SELECT 1 ok FROM user_roles WHERE user_id = ? AND role = ?", userId, role);
}

export async function requireStaff(env, user, ...roles) {
  for (const role of roles) if (await hasRole(env, user.id, role)) return role;
  throw new HttpError("This workspace is restricted to authorized MREO personnel.", 403, "staff_required");
}
