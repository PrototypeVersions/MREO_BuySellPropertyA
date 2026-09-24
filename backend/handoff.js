import {HttpError} from "./http.js";

const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const decode = value => {
  const text = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(text + "=".repeat((4 - text.length % 4) % 4)), char => char.charCodeAt(0));
};
async function key(secret, usage) { return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC", hash:"SHA-256"}, false, usage); }

export async function createHandoffToken(env, claims) {
  if (!env.HANDOFF_SIGNING_SECRET) throw new HttpError("Auction handoff is not configured.", 503, "handoff_unavailable");
  const payload = encode(new TextEncoder().encode(JSON.stringify({...claims, exp:Date.now() + 5 * 60_000})));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await key(env.HANDOFF_SIGNING_SECRET, ["sign"]), new TextEncoder().encode(payload)));
  return `${payload}.${encode(signature)}`;
}

export async function verifyHandoffToken(env, token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !env.HANDOFF_SIGNING_SECRET) throw new HttpError("A verified auction handoff is required.", 403, "handoff_required");
  const valid = await crypto.subtle.verify("HMAC", await key(env.HANDOFF_SIGNING_SECRET, ["verify"]), decode(signature), new TextEncoder().encode(payload));
  if (!valid) throw new HttpError("The auction handoff could not be verified.", 403, "invalid_handoff");
  let claims; try { claims = JSON.parse(new TextDecoder().decode(decode(payload))); } catch { throw new HttpError("The auction handoff is invalid.", 403, "invalid_handoff"); }
  if (claims.exp < Date.now() || !claims.auctionId || !["buyer","seller"].includes(claims.role)) throw new HttpError("The auction handoff has expired.", 403, "expired_handoff");
  return claims;
}
