import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {apiFetch} from "../backend/api.js";

class D1Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new D1Statement(this.db, this.sql, values); }
  async first() { return this.db.prepare(this.sql).get(...this.values) || null; }
  async all() { return {results:this.db.prepare(this.sql).all(...this.values)}; }
  async run() { const result = this.db.prepare(this.sql).run(...this.values); return {success:true, meta:{changes:result.changes}}; }
}
class D1Database {
  constructor() { this.sqlite = new DatabaseSync(":memory:"); this.sqlite.exec(readFileSync(new URL("../migrations/0001_transaction_platform.sql", import.meta.url), "utf8")); }
  prepare(sql) { return new D1Statement(this.sqlite, sql); }
  async batch(statements) { const results=[]; this.sqlite.exec("BEGIN"); try { for (const statement of statements) results.push(await statement.run()); this.sqlite.exec("COMMIT"); return results; } catch (error) { this.sqlite.exec("ROLLBACK"); throw error; } }
}

const env = () => ({DB:new D1Database(), AUTH_MODE:"test"});
const request = (path, {method="GET", user, email, body} = {}) => new Request("https://api.example.com" + path, {method, headers:{...(user?{"X-MREO-Test-User":user,"X-MREO-Test-Email":email || `${user}@example.com`}:{}), ...(body?{"Content-Type":"application/json"}:{})}, body:body?JSON.stringify(body):undefined});
const data = async response => ({status:response.status, body:await response.json()});

test("transaction access comes from server participation, never a requested URL role", async () => {
  const e=env();
  const created=await data(await apiFetch(request("/api/v1/transactions",{method:"POST",user:"alice",body:{role:"buyer",title:"4218 Maple Ridge Drive",auctionId:"auction-1",amount:385000}}),e));
  assert.equal(created.status,201); const id=created.body.id;
  assert.equal(created.body.viewerRole,"buyer");
  const intruder=await data(await apiFetch(request(`/api/v1/transactions/${id}?role=seller`,{user:"mallory"}),e));
  assert.equal(intruder.status,403);
  const message=await data(await apiFetch(request(`/api/v1/transactions/${id}/messages`,{method:"POST",user:"alice",body:{body:"Buyer-only message",thread:"seller_agent"}}),e));
  assert.equal(message.status,201);
  const thread=await data(await apiFetch(request(`/api/v1/transactions/${id}/messages`,{user:"alice"}),e));
  assert.equal(thread.body.thread.kind,"buyer_agent");
  assert.equal(thread.body.messages[0].body,"Buyer-only message");
});

test("one identity can be a buyer in one transaction and seller in another", async () => {
  const e=env();
  const buyer=await data(await apiFetch(request("/api/v1/transactions",{method:"POST",user:"blake",body:{role:"buyer",title:"Buyer transaction",auctionId:"auction-b"}}),e));
  const seller=await data(await apiFetch(request("/api/v1/transactions",{method:"POST",user:"blake",body:{role:"seller",title:"Seller transaction",auctionId:"auction-s"}}),e));
  const listed=await data(await apiFetch(request("/api/v1/transactions",{user:"blake"}),e));
  assert.equal(buyer.body.viewerRole,"buyer"); assert.equal(seller.body.viewerRole,"seller");
  assert.deepEqual(new Set(listed.body.transactions.map(item=>item.viewer_role)),new Set(["buyer","seller"]));
});

test("messages are corrected by appending a new audited record", async () => {
  const e=env();
  const created=(await data(await apiFetch(request("/api/v1/transactions",{method:"POST",user:"alice",body:{role:"buyer",title:"Correction test"}}),e))).body;
  const original=(await data(await apiFetch(request(`/api/v1/transactions/${created.id}/messages`,{method:"POST",user:"alice",body:{body:"Original"}}),e))).body;
  const correction=await data(await apiFetch(request(`/api/v1/transactions/${created.id}/messages/${original.id}/corrections`,{method:"POST",user:"alice",body:{body:"Corrected statement",reason:"Typographical error"}}),e));
  assert.equal(correction.status,201); assert.equal(correction.body.correctionOf,original.id);
  const messages=(await data(await apiFetch(request(`/api/v1/transactions/${created.id}/messages`,{user:"alice"}),e))).body.messages;
  assert.equal(messages.length,2); assert.equal(messages[0].body,"Original"); assert.equal(messages[1].correction_of,original.id);
  const events=(await data(await apiFetch(request(`/api/v1/transactions/${created.id}/events`,{user:"alice"}),e))).body.events;
  assert.ok(events.some(event=>event.event_type==="message.corrected"));
});

test("intake creates an active private conversation and hides other participant emails", async () => {
  const e=env();
  const alice=(await data(await apiFetch(request("/api/v1/transactions",{method:"POST",user:"alice",email:"alice@example.com",body:{role:"buyer",stage:"intake",title:"Private interest",auctionId:"intake-shared"}}),e))).body;
  await apiFetch(request("/api/v1/transactions",{method:"POST",user:"bob",email:"bob@example.com",body:{role:"seller",stage:"intake",title:"Private interest",auctionId:"intake-shared"}}),e);
  const view=(await data(await apiFetch(request(`/api/v1/transactions/${alice.id}`,{user:"alice",email:"alice@example.com"}),e))).body;
  assert.equal(view.status,"active");assert.equal(view.participants.find(person=>person.id.startsWith("usr_")&&person.email==="alice@example.com")?.email,"alice@example.com");
  assert.equal(view.participants.find(person=>person.email==="bob@example.com"),undefined);
  const tasks=(await data(await apiFetch(request(`/api/v1/transactions/${alice.id}/tasks`,{user:"alice",email:"alice@example.com"}),e))).body.tasks;
  assert.match(tasks[0].title,/message/i);
  const events=(await data(await apiFetch(request(`/api/v1/transactions/${alice.id}/events`,{user:"alice",email:"alice@example.com"}),e))).body.events;
  assert.ok(events.every(event=>event.metadata_json==="{}"));
});
