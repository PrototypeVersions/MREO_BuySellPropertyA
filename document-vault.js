(() => {
  "use strict";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

  class DocumentVault {
    constructor(root, transaction, timeline) {
      this.root = root;
      this.transaction = transaction;
      this.timeline = timeline;
      this.base = `/api/v1/transactions/${encodeURIComponent(transaction.id)}`;
      const agent = transaction.viewerRole === "agent";
      root.innerHTML = `<details class="document-composer"><summary>Attach a document or PDF</summary><form class="upload-form"><label>Choose a transaction document<input type="file" name="file" required accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.csv,.txt"></label>${agent ? `<label>Who may see it<select name="visibility"><option value="thread">This conversation</option><option value="participants">All transaction participants</option><option value="buyer_agent">Buyer and MREO Agent</option><option value="seller_agent">Seller and MREO Agent</option><option value="agent_provider">Provider and MREO Agent</option><option value="agent_only">MREO Agent only</option></select></label>` : `<input type="hidden" name="visibility" value="thread">`}<p class="upload-note">The file will appear at this point in the conversation, where it can be downloaded, reviewed, or sent for signature.</p><button class="small-button primary" type="submit">Add to conversation</button></form></details>`;
      this.form = root.querySelector("form");
      this.form.onsubmit = event => this.upload(event);
      timeline.root.addEventListener("mreo:thread-selected", () => this.form.reset());
    }

    updateVisibility(data = null) {
      const formData = data || new FormData(this.form);
      if (formData.get("visibility") === "thread") formData.set("visibility", this.timeline.visibility());
      return formData;
    }

    async refresh() {
      try {
        const {documents} = await MreoIdentity.request(this.base + "/documents");
        this.documents = documents || [];
        this.timeline.setDocuments(this.documents, event => this.click(event));
        this.root.querySelector(".upload-error")?.remove();
        this.onUpdated?.(this.documents);
      } catch (error) {
        this.documents = [];
        this.timeline.setDocuments([], null);
        this.onUpdated?.([]);
        let notice = this.root.querySelector(".upload-error");
        if (!notice) { notice = document.createElement("p"); notice.className = "upload-error"; this.root.append(notice); }
        notice.textContent = error.message;
      }
    }

    async upload(event) {
      event.preventDefault();
      const button = this.form.querySelector("button"), data = this.updateVisibility();
      button.disabled = true;
      try {
        await MreoIdentity.request(this.base + "/documents", {method:"POST", body:data});
        this.form.reset();
        await this.refresh();
        dispatchEvent(new CustomEvent("mreo:workspace-changed"));
      } catch (error) { alert(error.message); }
      finally { button.disabled = false; }
    }

    async click(event) {
      const download = event.target.closest("[data-download]"), sign = event.target.closest("[data-sign]"), send = event.target.closest("[data-send-signature]");
      try {
        if (download) {
          download.disabled = true;
          const response = await MreoIdentity.request(`${this.base}/documents/${encodeURIComponent(download.dataset.download)}/download?version=${download.dataset.version}`);
          const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement("a");
          const document = this.documents.find(item => item.id === download.dataset.download);
          link.href = url; link.download = document ? (download.dataset.version === "completed" ? "Executed-" + document.filename.replace(/\.[^.]+$/, "") + ".pdf" : document.filename) : "document";
          link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); download.disabled = false;
        }
        if (sign) {
          sign.disabled = true;
          const {url} = await MreoIdentity.request(`${this.base}/documents/${encodeURIComponent(sign.dataset.sign)}/signing-session`, {method:"POST", body:"{}"});
          open(url, "_blank", "noopener"); sign.disabled = false;
        }
        if (send) {
          send.disabled = true;
          const document = this.documents.find(item => item.id === send.dataset.sendSignature);
          const allowed = document?.visibility === "participants" ? ["buyer","seller"] : document?.visibility === "buyer_agent" ? ["buyer"] : document?.visibility === "seller_agent" ? ["seller"] : document?.visibility === "agent_provider" ? ["provider"] : [];
          const recipients = this.transaction.participants.filter(person => person.status === "active" && allowed.includes(person.role) && person.email).map(person => ({role:person.role, name:person.display_name || person.email, email:person.email}));
          if (!recipients.length) throw Error("Add an active participant with access to this document before sending a signature request.");
          if (!confirm("Send "+document.filename+" for signature to "+recipients.map(person=>person.name+" ("+person.email+")").join(", ")+"? The signing provider may send email notifications.")) { send.disabled = false; return; }
          await MreoIdentity.request(`${this.base}/documents/${encodeURIComponent(send.dataset.sendSignature)}/signatures`, {method:"POST", body:JSON.stringify({recipients, applySigningOrder:true})});
          await this.refresh(); dispatchEvent(new CustomEvent("mreo:workspace-changed"));
        }
      } catch (error) {
        if (download) download.disabled = false;
        if (sign) sign.disabled = false;
        if (send) send.disabled = false;
        alert(error.message);
      }
    }
  }
  globalThis.DocumentVault = DocumentVault;
})();
