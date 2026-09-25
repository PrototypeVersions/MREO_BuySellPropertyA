(() => {
  "use strict";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

  class TransactionThread {
    constructor(root, transactionId, viewerRole) {
      this.root = root;
      this.transactionId = transactionId;
      this.viewerRole = viewerRole;
      this.thread = viewerRole === "agent" ? "buyer_agent" : null;
      this.messages = [];
      this.documents = [];
      this.events = [];
      this.drafts = {};
      this.documentHandler = null;
      this.root.innerHTML = `<div class="thread-tabs" hidden></div><div class="conversation-feed message-list" aria-live="polite"></div><form class="message-form"><textarea aria-label="Message" maxlength="8000" required placeholder="Write a message to the MREO Agent"></textarea><button class="small-button primary" type="submit">Send</button></form>`;
      this.tabs = root.querySelector(".thread-tabs");
      this.list = root.querySelector(".message-list");
      this.form = root.querySelector("form");
      if (viewerRole === "agent") this.addTabs();
      this.form.addEventListener("submit", event => this.send(event));
      this.root.addEventListener("click", event => {
        if (event.target.closest("[data-download],[data-sign],[data-send-signature]") && this.documentHandler) this.documentHandler(event);
      });
    }

    addTabs() {
      this.tabs.hidden = false;
      for (const [kind, label] of [["buyer_agent","Buyer ↔ MREO"],["seller_agent","Seller ↔ MREO"],["provider_agent","Provider ↔ MREO"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.setAttribute("aria-pressed", String(kind === this.thread));
        button.onclick = () => {
          if (this.thread === kind) return;
          const input = this.form.querySelector("textarea");
          this.drafts[this.thread] = input.value;
          this.thread = kind;
          input.value = this.drafts[kind] || "";
          this.messages = [];
          this.rendered = false;
          this.render();
          this.tabs.querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
          this.refresh();
          this.root.dispatchEvent(new CustomEvent("mreo:thread-selected", {bubbles:true, detail:{thread:kind}}));
        };
        this.tabs.append(button);
      }
    }

    endpoint() {
      return `/api/v1/transactions/${encodeURIComponent(this.transactionId)}/messages${this.thread ? `?thread=${encodeURIComponent(this.thread)}` : ""}`;
    }

    visibility() {
      if (this.thread === "buyer_agent" || this.viewerRole === "buyer") return "buyer_agent";
      if (this.thread === "seller_agent" || this.viewerRole === "seller") return "seller_agent";
      if (this.thread === "provider_agent" || this.viewerRole === "provider") return "agent_provider";
      return "participants";
    }

    setDocuments(documents, handler) {
      this.documents = Array.isArray(documents) ? documents : [];
      this.documentHandler = handler;
      this.render();
    }

    documentCard(document) {
      const size = `${Math.max(1, Math.round(Number(document.size_bytes || document.sizeBytes || 0) / 1024))} KB`;
      const completed = document.status === "complete";
      const pending = document.status === "signature_pending";
      return `<article class="message document-message" data-document-id="${esc(document.id)}">
        <span class="document-message-icon" aria-hidden="true">${document.content_type==="application/pdf"?"PDF":"FILE"}</span>
        <div class="document-message-body"><small>Document · ${new Date(document.created_at || document.createdAt).toLocaleString()}</small><strong class="document-message-title">${esc(document.filename)}</strong><span>${esc(document.kind)} · ${esc(document.status)} · ${size}</span>
        <div class="document-actions"><button class="small-button" data-download="${esc(document.id)}" data-version="${completed ? "completed" : "original"}">${completed ? "View executed PDF" : "Download"}</button>${pending ? `<button class="small-button primary" data-sign="${esc(document.id)}">Review &amp; Sign</button>` : ""}${this.viewerRole === "agent" && document.status === "available" ? `<button class="small-button primary" data-send-signature="${esc(document.id)}">Send for signatures</button>` : ""}</div></div>
      </article>`;
    }

    render() {
      const followLatest = !this.rendered || this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 200;
      const documents = this.documents.filter(document => document.visibility === "participants" || document.visibility === this.visibility());
      const documentIds = new Set(documents.map(document => document.id));
      const followups = this.events.filter(event => documentIds.has(event.entity_id) && event.event_type?.startsWith("esign."));
      const items = [
        ...this.messages.map(message => ({at:Number(message.created_at || 0), html:`<article class="message ${message.author_role === this.viewerRole ? "mine" : ""}"><small>${esc(message.author_name || message.author_role)} · ${new Date(message.created_at).toLocaleString()}</small><div>${esc(message.body).replace(/\n/g,"<br>")}</div>${message.correction_of ? '<small>Correction to an earlier message</small>' : ""}</article>`})),
        ...documents.map(document => ({at:Number(document.created_at || document.createdAt || 0), html:this.documentCard(document)})),
        ...followups.map(event => ({at:Number(event.created_at || 0),html:`<article class="message"><small>Signature update · ${new Date(event.created_at).toLocaleString()}</small><div>${esc(event.summary)}</div></article>`}))
      ].sort((a,b) => a.at - b.at);
      this.list.innerHTML = items.length ? items.map(item => item.html).join("") : `<div class="empty-card"><h3>Your private MREO thread is ready</h3><p>Write your first message or attach a document below. Messages, PDFs, and signature requests will stay together in this timeline.</p></div>`;
      if (followLatest) this.list.scrollTop = this.list.scrollHeight;
      this.rendered = true;
    }

    async refresh() {
      const endpoint = this.endpoint();
      try {
        const data = await MreoIdentity.request(endpoint);
        if (this.endpoint() !== endpoint) return;
        this.messages = data.messages || [];
        this.render();
      } catch (error) {
        if (this.endpoint() !== endpoint) return;
        this.list.innerHTML = `<div class="empty-card"><p>${esc(error.message)}</p></div>`;
      }
    }

    async send(event) {
      event.preventDefault();
      const input = this.form.querySelector("textarea"), body = input.value.trim(), button = this.form.querySelector("button");
      if (!body) return;
      button.disabled = true;
      input.disabled = true;
      this.tabs.querySelectorAll("button").forEach(item => item.disabled = true);
      try {
        await MreoIdentity.request(`/api/v1/transactions/${encodeURIComponent(this.transactionId)}/messages`, {method:"POST", body:JSON.stringify({body, thread:this.thread})});
        input.value = "";
        this.drafts[this.thread] = "";
        await this.refresh();
      } catch (error) { alert(error.message); }
      finally { button.disabled = false; input.disabled = false; this.tabs.querySelectorAll("button").forEach(item => item.disabled = false); }
    }
  }
  globalThis.TransactionThread = TransactionThread;
})();
