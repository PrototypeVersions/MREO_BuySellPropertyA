(() => {
  "use strict";

  const S = globalThis.MreoService;
  const C = globalThis.MreoCore;
  const $ = (id) => document.getElementById(id);
  if (!S || !C || !$("auction-handoff")) return;

  let refreshToken = 0;
  const intakeTransactionId = new URLSearchParams(location.search).get("transaction");

  const cashNumber = (value) => {
    const n = Number(value || 0);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };

  function currentView() {
    return $("view-seller")?.getAttribute("aria-pressed") === "true" ? "seller" : "buyer";
  }

  async function buildWorkspaceUrl(auction, view, amount, account) {
    if (globalThis.MreoIdentity?.connected()) {
      await MreoIdentity.init();
      if (!await MreoIdentity.currentUser()) return {url:"#", requiresSignIn:true};
      const {handoffToken} = await S.handoff(auction.id, view);
      const transaction = await MreoIdentity.request("/api/v1/transactions", {method:"POST", body:JSON.stringify({handoffToken})});
      return {url:`coordination.html?transaction=${encodeURIComponent(transaction.id)}`, requiresSignIn:false};
    }
    const query = new URLSearchParams();
    query.set("type", auction.kind === "portfolio" ? "portfolio" : "property");
    query.set("auction", auction.id);
    query.set(auction.kind === "portfolio" ? "title" : "address", auction.title);
    if (amount) query.set("price", String(amount));
    if (auction.kind === "portfolio") query.set("count", String(auction.portfolioCount || auction.portfolio?.length || 0));
    const submission = account?.submission || {};
    const mediaKey = auction.mediaKey || submission.mediaKey || (view === "seller" ? submission.draftId : "");
    const image = submission.image || auction.image || "";
    if (mediaKey) query.set("mediaKey", mediaKey);
    if (/^(https?:\/\/|assets\/)/i.test(image)) query.set("image", image);
    query.set("role", view);
    query.set("demo", "1");
    query.set("perspective", view);
    query.set("stage", auction.saleCompleted ? "complete" : "won");
    if (account?.name) { query.set("accountName", account.name); query.set("accountRole", view); }
    if (account?.email) query.set("accountEmail", account.email);
    const details = submission.details || {};
    const phone = details[view === "seller" ? "sellerPhone" : "buyerPhone"];
    const purchaseMethod = details.buyerPurchaseMethod || "";
    const purchaseTimeline = details[view === "seller" ? "saleTimeline" : "buyerTimeline"] || "";
    if (phone) query.set("accountPhone", phone);
    if (purchaseMethod) query.set("purchaseMethod", purchaseMethod);
    if (purchaseTimeline) query.set("purchaseTimeline", purchaseTimeline);
    return {url:`coordination.html?${query.toString()}`, requiresSignIn:false};
  }

  function hideHandoff(container) {
    if (!container.hidden) container.hidden = true;
    if (container.childNodes.length) container.replaceChildren();
  }

  async function refreshHandoff() {
    const token = ++refreshToken;
    const container = $("auction-handoff");
    const select = $("auction-select");
    if (!container || !select?.value || $("auction-content")?.hidden) {
      if (container) hideHandoff(container);
      return;
    }

    /* Keep this helper out of the main auction-loading path. */
    if (($("auction-status")?.textContent || "").trim() !== "Closed") {
      if (intakeTransactionId) {
        container.innerHTML = `<section class="form-panel" aria-label="MREO conversation"><p class="section-label">Private workspace ready</p><h2>Your MREO conversation is open.</h2><p>Message the MREO Agent, review action items, upload documents, and keep this property’s activity together in one private record.</p><div class="form-actions"><a class="primary-button button-blue" href="coordination.html?transaction=${encodeURIComponent(intakeTransactionId)}">Open MREO conversation →</a><a class="secondary-button" href="profile.html">View My MREO</a></div></section>`;
        container.hidden = false;
        return;
      }
      hideHandoff(container);
      return;
    }

    const view = currentView();
    const actor = $("test-actor")?.value || undefined;
    try {
      const result = await S.auction(select.value, view, actor);
      if (token !== refreshToken) return;
      const auction = result.auction;
      const eligible = auction.status === "closed" && (
        view === "seller" ? result.isSeller : auction.viewerOutcome === "won"
      );
      if (!eligible) {
        hideHandoff(container);
        return;
      }

      const top = C.highest(auction);
      const amount = cashNumber(top?.amount);
      const destination = await buildWorkspaceUrl(auction, view, amount, result.account);
      const seller = view === "seller";
      const complete = !!auction.saleCompleted;

      const heading = seller
        ? (complete ? "Sale complete. Continue in the property workspace." : "Auction closed. Continue to the transaction workspace.")
        : (complete ? "Purchase complete. Continue in the property workspace." : "Winning bid selected. Continue to closing and coordination.");
      const copy = seller
        ? (complete
          ? "Follow the final transfer record and any remaining provider activity from the seller side."
          : "The winning buyer is selected. Open the shared workspace to follow acceptance, title requirements, seller obligations, and closing.")
        : (complete
          ? "The property is now in your MREO workspace for Title / Settlement, Contractors, Realtors, and Rent / Manage."
          : "Seller acceptance and closing are still required. Open the transaction workspace to begin title / settlement and see exactly what needs your attention next.");
      const label = destination.requiresSignIn ? "Sign in to continue →" : seller
        ? (complete ? "Open seller property workspace →" : "Continue seller closing →")
        : (complete ? "Open property workspace →" : "Begin closing & coordination →");

      const html = `<section class="form-panel" aria-label="Continue to property workspace"><p class="section-label">Next stage · MREO transaction workspace</p><h2>${heading}</h2><p>${copy}</p><div class="form-actions"><a class="primary-button button-blue" ${destination.requiresSignIn?'data-handoff-sign-in="true"':""} href="${destination.url}">${label}</a></div></section>`;
      if (container.innerHTML !== html) container.innerHTML = html;
      if (container.hidden) container.hidden = false;
      container.querySelector("[data-handoff-sign-in]")?.addEventListener("click", event => { event.preventDefault(); MreoIdentity.openSignIn(location.href); });
    } catch {
      if (token === refreshToken) hideHandoff(container);
    }
  }

  const observer = new MutationObserver(() => refreshHandoff());
  [$("auction-result"), $("seller-private")].filter(Boolean).forEach((element) => observer.observe(element, {subtree:true, childList:true, attributes:true, characterData:true}));
  [$("auction-select"), $("test-actor")].filter(Boolean).forEach((element) => element.addEventListener("change", refreshHandoff));
  [$("view-buyer"), $("view-seller"), $("finish-auction"), $("complete-sale")].filter(Boolean).forEach((element) => element.addEventListener("click", () => setTimeout(refreshHandoff, 80)));
  refreshHandoff();
})();
