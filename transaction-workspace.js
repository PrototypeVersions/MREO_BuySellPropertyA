(() => {
  "use strict";
  const params = new URLSearchParams(location.search), transactionId = params.get("transaction");
  if (!transactionId) return;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  let transaction, thread, vault, socket;

  function shell() {
    const main = document.querySelector("main");
    for (const child of [...main.children]) child.hidden = true;
    let root = $("connected-transaction-shell");
    if (!root) { root = document.createElement("section"); root.id = "connected-transaction-shell"; main.prepend(root); }
    root.hidden = false; root.className = "transaction-app";
    root.innerHTML = `<a class="back-link" href="profile.html">← My MREO</a><div id="transaction-loading" class="setup-card">Opening secure transaction workspace…</div>`;
    return root;
  }

  async function render() {
    const root = shell(), role = transaction.viewerRole;
    const serviceCards = [["title","Title / Settlement"],["contractors","Contractors"],["realtors","Realtors"],["rentals","Rent / Manage"]]
      .map(([service,label]) => `<a class="transaction-row" href="coordination-service.html?transaction=${encodeURIComponent(transaction.id)}&service=${service}&auction=${encodeURIComponent(transaction.source_auction_id || transaction.id)}&address=${encodeURIComponent(transaction.title)}&role=${encodeURIComponent(role)}"><div><h3>${label}</h3><p>Open the connected ${label.toLowerCase()} workflow</p></div><span aria-hidden="true">→</span></a>`).join("");
    root.innerHTML = `<a class="back-link" href="${role === "agent" ? "agent.html" : "profile.html"}">← ${role === "agent" ? "Agent Console" : "My MREO"}</a>
      <header class="transaction-head"><div><p class="section-label">Transaction workspace · ${esc(role)}</p><h1>${esc(transaction.title)}</h1><p>${esc(transaction.kind)} · ${esc(transaction.status)}${transaction.amount_cents ? ` · $${(transaction.amount_cents/100).toLocaleString()}` : ""}</p></div><span class="status-chip">${esc(transaction.status)}</span></header>
      <section id="workspace-attention" class="attention-board"></section>
      <div class="workspace-columns"><div class="transaction-app">
        <section class="workspace-card"><h2>${role === "agent" ? "Participant threads" : "MREO Agent thread"}</h2><p class="workspace-card-subtitle">Buyer and seller conversations are never combined into a group chat.</p><div id="transaction-thread"></div></section>
        <section class="workspace-card"><h2>Coordination pathways</h2><p class="workspace-card-subtitle">Relevant property and transaction records remain connected across each independent provider workflow.</p><div class="transaction-list">${serviceCards}</div></section>
        <section class="workspace-card"><h2>Chronological transaction history</h2><p class="workspace-card-subtitle">Messages remain conversational; system events form the permanent audit history.</p><div id="event-list" class="event-list"></div></section>
      </div><aside class="transaction-app">
        <section class="workspace-card"><h2>Documents</h2><p class="workspace-card-subtitle">Files stay inside the private transaction vault.</p><div id="document-vault"></div></section>
        <section class="workspace-card"><h2>Participants</h2><div id="participant-list" class="task-list"></div>${role === "agent" ? `<form id="participant-form" class="upload-form participant-form"><label>Email<input name="email" type="email" required></label><label>Role<select name="role"><option>buyer</option><option>seller</option><option>provider</option><option>agent</option></select></label><button class="small-button" type="submit">Add existing MREO account</button></form>` : ""}</section>
        <section class="workspace-card"><h2>Service requests</h2><div id="service-list" class="task-list"></div></section>
      </aside></div>`;
    thread = new TransactionThread($("transaction-thread"), transaction.id, role);
    vault = new DocumentVault($("document-vault"), transaction);
    if (role === "agent") $("participant-form").onsubmit = addParticipant;
    await refresh(); connectLive();
  }

  async function refresh() {
    const base = `/api/v1/transactions/${encodeURIComponent(transaction.id)}`;
    const [{tasks},{events},{services}] = await Promise.all([
      MreoIdentity.request(base + "/tasks"), MreoIdentity.request(base + "/events"), MreoIdentity.request(base + "/services"), thread.refresh(), vault.refresh()
    ]);
    const action = tasks.filter(task => task.status === "action");
    $("workspace-attention").innerHTML = `<p class="section-label">What needs attention</p><h2>${action.length ? `${action.length} action${action.length === 1 ? "" : "s"} needed` : "No immediate action"}</h2>${action.length ? `<ul>${action.map(task => `<li><strong>${esc(task.title)}</strong> <button class="small-button" data-task-complete="${task.id}">Mark complete</button></li>`).join("")}</ul>` : "<p>MREO will notify you when the transaction requires another step.</p>"}`;
    $("workspace-attention").querySelectorAll("[data-task-complete]").forEach(button => button.onclick = async () => {
      button.disabled = true;
      try { await MreoIdentity.request(`${base}/tasks/${encodeURIComponent(button.dataset.taskComplete)}`, {method:"PATCH", body:JSON.stringify({status:"complete"})}); await refresh(); }
      catch (error) { alert(error.message); button.disabled = false; }
    });
    $("event-list").innerHTML = events.length ? events.map(event => `<article class="event-item"><time>${new Date(event.created_at).toLocaleString()}</time><p>${esc(event.summary)}</p></article>`).join("") : `<div class="empty-card"><p>The transaction history begins here.</p></div>`;
    $("participant-list").innerHTML = transaction.participants.map(person => `<div class="task-item"><strong>${esc(person.display_name || person.email || "MREO participant")}</strong><small>${esc(person.role)} · ${esc(person.status)}</small></div>`).join("");
    $("service-list").innerHTML = services.length ? services.map(service => `<div class="task-item"><strong>${esc(service.service_type)}</strong><small>${esc(service.status)}</small></div>`).join("") : `<div class="empty-card"><p>No provider requests yet.</p></div>`;
  }

  async function addParticipant(event) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    try { await MreoIdentity.request(`/api/v1/transactions/${encodeURIComponent(transaction.id)}/participants`, {method:"POST", body:JSON.stringify(data)}); transaction = await MreoIdentity.request(`/api/v1/transactions/${encodeURIComponent(transaction.id)}`); event.currentTarget.reset(); await refresh(); }
    catch (error) { alert(error.message); }
  }

  async function connectLive() {
    try {
      const base = `/api/v1/transactions/${encodeURIComponent(transaction.id)}`, {ticket} = await MreoIdentity.request(base + "/live-ticket", {method:"POST", body:"{}"});
      socket = new WebSocket(MreoIdentity.liveUrl(`${base}/live?ticket=${encodeURIComponent(ticket)}`));
      socket.onmessage = event => { if (event.data !== "pong") setTimeout(refresh, 100); };
      socket.onclose = () => setTimeout(connectLive, 5000);
    } catch { setTimeout(connectLive, 15000); }
  }

  async function start() {
    const root = shell();
    if (!MreoIdentity.connected()) { root.querySelector("#transaction-loading").innerHTML = `<h3>Connected Mode is required</h3><p>This secure transaction URL becomes active after the Cloudflare deployment.</p><a class="primary-button button-blue" href="experience.html">Explore the demonstration</a>`; return; }
    try {
      await MreoIdentity.init();
      if (!await MreoIdentity.currentUser()) { root.querySelector("#transaction-loading").innerHTML = `<h3>Sign in to open this transaction</h3><button class="primary-button button-blue" id="transaction-sign-in">Sign in or create account</button>`; $("transaction-sign-in").onclick = () => MreoIdentity.openSignIn(); return; }
      transaction = await MreoIdentity.request(`/api/v1/transactions/${encodeURIComponent(transactionId)}`); await render();
    } catch (error) { root.querySelector("#transaction-loading").innerHTML = `<h3>Transaction unavailable</h3><p>${esc(error.message)}</p>`; }
  }
  addEventListener("mreo:workspace-changed", () => refresh()); start();
})();
