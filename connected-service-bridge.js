(() => {
  "use strict";
  const params = new URLSearchParams(location.search), transactionId = params.get("transaction"), serviceType = params.get("service");
  if (!transactionId || !serviceType || !globalThis.MreoIdentity?.connected()) return;
  const submit = document.getElementById("service-submit");
  if (!submit) return;
  submit.addEventListener("click", () => setTimeout(async () => {
    const host = submit.closest(".form-panel, section");
    try {
      await MreoIdentity.request(`/api/v1/transactions/${encodeURIComponent(transactionId)}/services`, {method:"POST", body:JSON.stringify({serviceType, request:{source:"connected-coordination-workflow"}})});
      const note = document.createElement("p"); note.className = "form-message success-message"; note.textContent = "Saved to the permanent MREO transaction record."; host?.append(note);
    } catch (error) {
      const note = document.createElement("p"); note.className = "form-message"; note.textContent = error.message; host?.append(note);
    }
  }, 100));
})();
