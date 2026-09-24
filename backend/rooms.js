import {HttpError, json} from "./http.js";

const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const decode = value => {
  const text = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(text + "=".repeat((4 - text.length % 4) % 4)), char => char.charCodeAt(0));
};

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC", hash:"SHA-256"}, false, ["sign", "verify"]);
  return {key, signature:new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)))};
}

export async function createRoomTicket(env, transactionId, userId, role) {
  if (!env.ROOM_SIGNING_SECRET) throw new HttpError("Real-time updates are not configured.", 503, "realtime_unavailable");
  const payload = encode(new TextEncoder().encode(JSON.stringify({transactionId, userId, role, exp:Date.now() + 60_000})));
  const {signature} = await hmac(env.ROOM_SIGNING_SECRET, payload);
  return `${payload}.${encode(signature)}`;
}

async function verifyRoomTicket(secret, ticket, transactionId) {
  const [payload, signature] = String(ticket || "").split(".");
  if (!payload || !signature || !secret) return null;
  const {key} = await hmac(secret, payload);
  const valid = await crypto.subtle.verify("HMAC", key, decode(signature), new TextEncoder().encode(payload));
  if (!valid) return null;
  let claims; try { claims = JSON.parse(new TextDecoder().decode(decode(payload))); } catch { return null; }
  return claims.transactionId === transactionId && claims.exp > Date.now() ? claims : null;
}

export async function notifyRoom(env, transactionId, event) {
  if (!env.TRANSACTION_ROOMS) return;
  const stub = env.TRANSACTION_ROOMS.get(env.TRANSACTION_ROOMS.idFromName(transactionId));
  await stub.fetch("https://room.internal/broadcast", {method:"POST", headers:{"Content-Type":"application/json", "X-MREO-Room-Secret":env.ROOM_SIGNING_SECRET || ""}, body:JSON.stringify(event)});
}

export class TransactionRoom {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/broadcast" && request.method === "POST") {
      if (!this.env.ROOM_SIGNING_SECRET || request.headers.get("X-MREO-Room-Secret") !== this.env.ROOM_SIGNING_SECRET) return json({error:"Forbidden"}, 403);
      const message = await request.text();
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(message); } catch { try { socket.close(1011, "Delivery failed"); } catch {} }
      }
      return json({ok:true});
    }
    if (request.headers.get("Upgrade") !== "websocket") return json({error:"WebSocket required."}, 426);
    const transactionId = url.searchParams.get("transaction"), claims = await verifyRoomTicket(this.env.ROOM_SIGNING_SECRET, url.searchParams.get("ticket"), transactionId);
    if (!claims) return json({error:"Invalid or expired real-time ticket."}, 401);
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server, [claims.userId, claims.role]);
    server.send(JSON.stringify({type:"connected", transactionId}));
    return new Response(null, {status:101, webSocket:client});
  }

  async webSocketMessage(socket, message) {
    if (message === "ping") socket.send("pong");
  }
  async webSocketClose(socket, code, reason) { try { socket.close(code, reason); } catch {} }
}
