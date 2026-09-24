(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const S = globalThis.MreoService;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const safeImage = (value) => /^(https?:\/\/|assets\/)/i.test(value || "") ? value : "";
  const money = (value) => {
    const n = Number(value || 0);
    return Number.isFinite(n) && n > 0 ? new Intl.NumberFormat("en-US", {style:"currency", currency:"USD", maximumFractionDigits:0}).format(n) : "";
  };
  const prettyDate = (value) => new Intl.DateTimeFormat("en-US", {month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit"}).format(new Date(value));
  const shortDate = (value) => new Intl.DateTimeFormat("en-US", {month:"short", day:"numeric", year:"numeric"}).format(new Date(value));

  const DEMO = {
    kind: "property",
    auction: "demo-property",
    address: "4218 Maple Ridge Drive, Dallas, TX 75229",
    title: "4218 Maple Ridge Drive",
    price: "385000",
    image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=84",
    count: ""
  };

  const hasIncomingContext = ["auction","address","title","price","image","count"].some((key) => params.get(key));
  const context = {
    kind: params.get("type") === "portfolio" ? "portfolio" : (hasIncomingContext ? "property" : DEMO.kind),
    auction: params.get("auction") || (hasIncomingContext ? "" : DEMO.auction),
    address: params.get("address") || (hasIncomingContext ? "" : DEMO.address),
    title: params.get("title") || (hasIncomingContext ? "" : DEMO.title),
    price: params.get("price") || (hasIncomingContext ? "" : DEMO.price),
    image: safeImage(params.get("image")) || (hasIncomingContext ? "" : DEMO.image),
    count: params.get("count") || (hasIncomingContext ? "" : DEMO.count),
    stage: params.get("stage") || "complete"
  };
  context.label = context.address || context.title || "MREO property record";
  context.hasSelection = !!(context.address || context.title || context.auction);
  context.key = context.auction || context.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unselected";
  context.isDefaultDemo = !hasIncomingContext;

  const incomingProfile = {
    role: params.get("accountRole") || "",
    name: params.get("accountName") || "",
    email: params.get("accountEmail") || "",
    phone: params.get("accountPhone") || "",
    purchaseMethod: params.get("purchaseMethod") || "",
    timeline: params.get("purchaseTimeline") || ""
  };
  const incomingBuyerName = incomingProfile.role === "buyer" && incomingProfile.name ? incomingProfile.name : "Demo Buyer";
  const incomingSellerName = incomingProfile.role === "seller" && incomingProfile.name ? incomingProfile.name : "Demo Seller";

  const services = {
    title: {
      eyebrow: "01 · Transfer",
      title: "Title Transfer",
      shortTitle: "Title / Settlement",
      provider: "Northstar Title & Settlement · demonstration",
      specialty: "Title / settlement",
      clientIntro: "Begin the closing process using the transaction information already attached to the property record. Confirm the buyer details a title / settlement company would ordinarily need, then review requirements, approve the provider response, and confirm signing before transfer is completed.",
      steps: ["Buyer or initiating party confirms the closing profile", "Title / settlement provider accepts and reviews the connected record", "Provider returns preliminary title / settlement requirements", "Initiating client reviews and approves the provider response", "Other transaction party confirms title, payoff, or buyer-side information", "Buyer and seller complete their respective closing / signing steps", "Provider finalizes transfer and publishes the closing record"],
      action: "Start title / settlement request",
      fields: `
        <div class="service-form-section"><h3>Buyer closing profile</h3>
          <label>Buyer legal name / entity<input name="legalName" type="text" value="Demo Buyer" required></label>
          <label>Preferred title / settlement provider<select name="providerPreference"><option value="Match me with a participating provider">Match me with a participating provider</option><option value="Northstar Title & Settlement">Northstar Title & Settlement · demonstration</option></select></label>
          <label>Target closing date<input name="closingTarget" type="date" value="2026-10-16" required></label>
          <label>Ownership / vesting<input name="vesting" type="text" value="Individual ownership" required></label>
          <label>Funding method<select name="funding"><option>Cash purchase</option><option>Financing</option><option>Other / to be confirmed</option></select></label>
          <label>Signing preference<select name="signingPreference"><option>Remote / electronic where permitted</option><option>In person</option><option>Coordinate with settlement provider</option></select></label>
        </div>
        <div class="service-form-section"><h3>Buyer notes</h3>
          <label>Closing or title information<textarea name="notes" placeholder="Special closing instructions, entity information, known title questions, or other details">Please coordinate the standard post-auction title and settlement process using the transaction information already attached to this MREO property record.</textarea></label>
        </div>`,
      sellerFields: `
        <div class="service-form-section"><h3>Seller closing profile</h3>
          <label>Seller legal name / entity<input name="sellerLegalName" type="text" value="Demo Seller" required></label>
          <label>Preferred title / settlement provider<select name="providerPreference"><option value="Match me with a participating provider">Match me with a participating provider</option><option value="Northstar Title & Settlement">Northstar Title & Settlement · demonstration</option></select></label>
          <label>Target closing date<input name="closingTarget" type="date" value="2026-10-16" required></label>
          <label>Payoff / lien status<select name="payoffStatus"><option>No known payoff or lien issue</option><option>Mortgage payoff required</option><option>Other lien / payoff information to provide</option></select></label>
          <label>Signing preference<select name="signingPreference"><option>Remote / electronic where permitted</option><option>In person</option><option>Coordinate with settlement provider</option></select></label>
        </div>
        <div class="service-form-section"><h3>Seller notes</h3>
          <label>Known title, payoff, entity, or closing information<textarea name="notes">No known title exceptions. Please coordinate seller-side requirements through the shared MREO transaction record.</textarea></label>
        </div>`,
      proposalTitle: "Preliminary title & settlement requirements",
      proposalAmount: 2150,
      proposalBody: "Demonstration preliminary title / settlement response: estimated title, escrow, settlement, and recording charges of $2,150. The initial review is ready for client approval before final closing preparation.",
      completionTitle: "Recorded transfer & final closing record"
    },
    contractors: {
      eyebrow: "02 · Contractors",
      title: "Contractors",
      shortTitle: "Contractors",
      provider: "SummitCraft Contractors · demonstration",
      specialty: "Contractors",
      clientIntro: "Create a structured work package with scope, budget, access information, and supporting files. A participating contractor can review the same packet, request information, send a proposal, and track the approved work through completion.",
      steps: ["Create the property work package and upload supporting material", "Contractor reviews scope, condition, access, and timing", "Contractor returns a written scope, price, and schedule", "Client approves the proposal and scheduling", "Work progresses through completion and closeout"],
      action: "Submit improvement request",
      fields: `
        <div class="service-form-section"><h3>Work package</h3>
          <label>Work category<select name="category"><option>Construction / rehabilitation</option><option>Plumbing</option><option>Electrical</option><option>Roofing</option><option>Cleaning / turnover</option><option>Landscaping</option><option>Inspection</option><option>Photography / videography</option><option>Other</option></select></label>
          <label>Target budget<input name="budget" type="text" inputmode="numeric" value="$30,000"></label>
          <label>Desired timing<select name="timing"><option>Within 30 days</option><option>As soon as possible</option><option>Within 60 days</option><option>Flexible</option></select></label>
        </div>
        <div class="service-form-section"><h3>Scope & access</h3>
          <label>Scope of work<textarea name="scope" required>Refresh flooring and interior paint, repair exterior trim, service HVAC, update two bathroom fixtures, and prepare the property for rental-ready condition.</textarea></label>
          <label>Access instructions<textarea name="access">Property is vacant. Coordinate access through the MREO property record before site visits.</textarea></label>
        </div>`,
      proposalTitle: "Renovation scope & proposal",
      proposalAmount: 28400,
      proposalBody: "Demonstration proposal: $28,400 total project price with a 24-day projected schedule. Scope includes flooring, interior paint, exterior trim repair, HVAC service, bathroom fixture updates, cleanup, and completion photography.",
      completionTitle: "Construction completion & closeout package"
    },
    realtors: {
      eyebrow: "03 · Realtors",
      title: "Realtors",
      shortTitle: "Realtors",
      provider: "MetroLine Realty Group · demonstration",
      specialty: "Realtors",
      clientIntro: "Share the property packet with a participating brokerage and coordinate the representation, valuation, marketing, showing, leasing, or transaction assistance needed for the next property objective.",
      steps: ["Select the representation objective and market", "Brokerage reviews the property packet and client goals", "Brokerage returns proposed services and market positioning", "Client approves the representation package", "Representation activity and resulting documents are tracked"],
      action: "Submit representation request",
      fields: `
        <div class="service-form-section"><h3>Representation objective</h3>
          <label>Service needed<select name="serviceNeed"><option>Rental market positioning and leasing representation</option><option>Seller representation / conventional listing</option><option>Buyer representation</option><option>Local showing assistance</option><option>Valuation / market assistance</option><option>Transaction support</option></select></label>
          <label>Market / area<input name="market" type="text" value="Dallas, Texas" required></label>
          <label>Target outcome<input name="targetOutcome" type="text" value="Prepare the property for a high-quality rental launch"></label>
        </div>
        <div class="service-form-section"><h3>Client notes</h3>
          <label>Representation notes<textarea name="notes">Please review the acquisition packet and renovation plan, recommend rental positioning, and prepare a representation package for leasing once improvements are complete.</textarea></label>
        </div>`,
      proposalTitle: "Representation & market positioning package",
      proposalAmount: 0,
      proposalBody: "Demonstration brokerage package: recommended post-improvement rental positioning at $2,850–$3,050 per month, professional photography after construction closeout, and leasing representation terms ready for client approval.",
      completionTitle: "Representation activity & market handoff record"
    },
    rentals: {
      eyebrow: "04 · Rent / Manage",
      title: "Rent / Manage",
      shortTitle: "Rental / Property Management",
      provider: "HarborKey Property Management · demonstration",
      specialty: "Rental / property management",
      clientIntro: "Move the property from acquisition or renovation into rental readiness, tenant placement, lease execution, move-in, and ongoing management while keeping every handoff attached to the same property record.",
      steps: ["Select rental and management objectives", "Manager reviews readiness, rent target, and property information", "Manager returns rent recommendation and management package", "Client approves leasing / management terms", "Tenant placement, lease, move-in, and management begin"],
      action: "Submit rental / management request",
      fields: `
        <div class="service-form-section"><h3>Rental objective</h3>
          <label>Rental pathway<select name="rentalPath"><option>Find tenant + ongoing property management</option><option>Prepare for rent</option><option>Find a tenant only</option><option>Lease coordination only</option><option>Ongoing property management only</option></select></label>
          <label>Target monthly rent<input name="targetRent" type="text" inputmode="numeric" value="$2,950"></label>
          <label>Availability target<input name="available" type="date" value="2026-11-15"></label>
        </div>
        <div class="service-form-section"><h3>Management information</h3>
          <label>Property / tenant preferences<textarea name="criteria">Long-term residential lease. Standard screening, documented income, property-care expectations, and electronic rent collection.</textarea></label>
          <label>Maintenance / management notes<textarea name="notes">Coordinate routine maintenance, emergency service, rent collection, lease administration, and owner reporting after move-in.</textarea></label>
        </div>`,
      proposalTitle: "Rental positioning & management proposal",
      proposalAmount: 0,
      proposalBody: "Demonstration proposal: recommended asking rent $2,950 per month, full tenant-placement workflow, electronic lease and rent collection, maintenance coordination, and an 8% demonstration monthly management fee after occupancy.",
      completionTitle: "Lease, move-in & management activation package"
    }
  };

  const statusOrder = ["submitted","matched","needs-info","proposal","counterparty-action","approved","in-progress","complete"];
  const statusLabels = {
    "submitted":"Submitted",
    "matched":"Provider reviewing",
    "needs-info":"Information requested",
    "proposal":"Proposal ready",
    "counterparty-action":"Counterparty action",
    "approved":"Approved",
    "in-progress":"In progress",
    "complete":"Complete"
  };
  const statusNotes = {
    "submitted":"The request is in the MREO network and is waiting for a participating company to accept it.",
    "matched":"A participating company has accepted the request and is reviewing the shared property packet.",
    "needs-info":"The participating company needs additional client information before it can proceed.",
    "proposal":"The provider has returned its fictional engagement terms, scope, or proposal for client review.",
    "counterparty-action":"The initiating client approved the title response. The other transaction party now needs to confirm its title / closing information.",
    "approved":"The required client-side response is approved. The company can now schedule or begin its work.",
    "in-progress":"The provider is performing the fictional service and posting progress to the shared property record.",
    "complete":"The service is complete and its closeout documents are attached to the property record."
  };

  function query(extra = {}) {
    const out = new URLSearchParams();
    if (context.kind) out.set("type", context.kind);
    if (context.auction) out.set("auction", context.auction);
    if (context.address) out.set("address", context.address);
    if (context.title) out.set("title", context.title);
    if (context.price) out.set("price", context.price);
    if (context.image) out.set("image", context.image);
    if (context.count) out.set("count", context.count);
    if (context.stage) out.set("stage", context.stage);
    ["accountName","accountEmail","accountPhone","purchaseMethod","purchaseTimeline","accountRole","mediaKey"].forEach((key) => { const value = params.get(key); if (value) out.set(key, value); });
    Object.entries(extra).forEach(([key, value]) => value !== undefined && value !== null && value !== "" && out.set(key, value));
    return out.toString();
  }

  const stateKey = `mreo:coordination:v3:${context.key}`;

  function documentRecord(id, name, category, audience, body, service = "") {
    return {id, name, category, audience, body, service, createdAt: Date.now()};
  }

  function baseDocuments() {
    const price = money(context.price) || "$385,000";
    const stage = context.stage === "planning" ? "Participation profile connected — pre-acquisition" : (context.stage === "won" ? "Winning bid selected — closing required" : "Acquisition complete");
    return [
      documentRecord("property-packet", "Connected property information", "Property record", ["buyer","seller","provider"], `MREO DEMONSTRATION — CONNECTED PROPERTY INFORMATION

Property: ${context.label}
Reference value: ${price}
Record ID: ${context.key}

This information remains inside MREO and is automatically available to participating workflows. The user does not need to download and re-upload it.`),
      documentRecord("transaction-record", "Connected transaction record", "Transaction", ["buyer","seller","provider"], `MREO DEMONSTRATION — TRANSACTION RECORD

Property: ${context.label}
Price / winning amount: ${price}
Buyer: ${incomingBuyerName}
Seller: ${incomingSellerName}
Auction: ${context.auction || "demonstration auction"}
Status: ${stage}

This record travels with the property into title and other coordination workflows.`),
      documentRecord("closing-checklist", "Connected closing requirements", "Closing", ["buyer","seller","provider"], `MREO DEMONSTRATION — CLOSING REQUIREMENTS

Property: ${context.label}

• Confirm buyer and seller information
• Open title / settlement request
• Resolve provider requirements
• Complete signing / closing steps
• Preserve the final closing record in MREO`)
    ];
  }

  function defaultState() {
    const now = Date.now();
    const planning = context.stage === "planning";
    const pendingClosing = context.stage === "won";
    return {
      version: 3,
      createdAt: now,
      acquisition: {
        status: planning ? "planning" : (pendingClosing ? "pending-closing" : "complete"),
        buyer: incomingBuyerName,
        seller: incomingSellerName,
        buyerProfile: incomingProfile.role === "buyer" ? {...incomingProfile} : null,
        sellerProfile: incomingProfile.role === "seller" ? {...incomingProfile} : null,
        price: Number(context.price || 385000),
        completedAt: planning || pendingClosing ? null : now - 86400000,
        auctionId: context.auction || "demo-property"
      },
      requests: {title:null, contractors:null, realtors:null, rentals:null},
      documents: baseDocuments(),
      activity: planning ? [
        {id:"plan-2", at:now - 60000, actor:params.get("accountRole")==="seller"?"Seller":"Buyer", important:true, text:`${params.get("accountName") || (params.get("accountRole")==="seller" ? "Demo Seller" : "Demo Buyer")} opened Coordination from the participation pathway.`},
        {id:"plan-1", at:now - 120000, actor:"MREO", important:false, text:"Existing Buy / Sell information was carried into the property workspace for planning and later coordination."}
      ] : pendingClosing ? [
        {id:"acq-2", at:now - 300000, actor:"Auction", important:true, text:`${incomingBuyerName} recorded the winning result at ${money(context.price) || "$385,000"}. Seller acceptance and closing are still required.`},
        {id:"acq-1", at:now - 360000, actor:"MREO", important:false, text:"The winning transaction entered the property workspace so title / settlement can begin."}
      ] : [
        {id:"acq-3", at:now - 86400000, actor:"MREO", important:true, text:"Acquisition completed and the property entered the coordination workspace."},
        {id:"acq-2", at:now - 90000000, actor:"Auction", important:false, text:`${incomingBuyerName} recorded the winning result at ${money(context.price) || "$385,000"}.`},
        {id:"acq-1", at:now - 93600000, actor:"Seller", important:false, text:"Demo Seller made the connected property record available to the winning buyer."}
      ]
    };
  }

  function loadState() {
    const demoResetMarker = "mreo:coordination:default-demo-clean-v1";
    if (context.isDefaultDemo && localStorage.getItem(demoResetMarker) !== "1") {
      localStorage.removeItem(stateKey);
      localStorage.setItem(demoResetMarker, "1");
    }
    try {
      const parsed = JSON.parse(localStorage.getItem(stateKey) || "null");
      if (parsed && parsed.version === 3 && parsed.requests && parsed.documents && parsed.activity) {
        parsed.acquisition = parsed.acquisition || {};
        if (context.price) parsed.acquisition.price = Number(context.price);
        if (context.auction) parsed.acquisition.auctionId = context.auction;
        if (incomingProfile.role === "buyer" && incomingProfile.name) {
          parsed.acquisition.buyer = incomingProfile.name;
          parsed.acquisition.buyerProfile = {...incomingProfile};
        }
        if (incomingProfile.role === "seller" && incomingProfile.name) {
          parsed.acquisition.seller = incomingProfile.name;
          parsed.acquisition.sellerProfile = {...incomingProfile};
        }
        const baseById = Object.fromEntries(baseDocuments().map(doc => [doc.id, doc]));
        parsed.documents = parsed.documents.map(doc => baseById[doc.id] ? {...doc, body:baseById[doc.id].body, name:baseById[doc.id].name, category:baseById[doc.id].category, audience:baseById[doc.id].audience} : doc);
        if (context.stage === "won" && parsed.acquisition?.status === "planning") {
          parsed.acquisition.status = "pending-closing";
          parsed.acquisition.completedAt = null;
          parsed.activity.unshift({id:`stage-${Date.now()}`,at:Date.now(),actor:"Auction",important:true,text:"The participation record advanced into the winning transaction. Closing is now required."});
          localStorage.setItem(stateKey, JSON.stringify(parsed));
        } else if (context.stage === "complete" && parsed.acquisition && parsed.acquisition.status !== "complete") {
          parsed.acquisition.status = "complete";
          parsed.acquisition.completedAt = Date.now();
          parsed.activity.unshift({id:`stage-${Date.now()}`,at:Date.now(),actor:"MREO",important:true,text:"The transaction advanced into the completed property record."});
          localStorage.setItem(stateKey, JSON.stringify(parsed));
        }
        return parsed;
      }
    } catch {}
    const fresh = defaultState();
    localStorage.setItem(stateKey, JSON.stringify(fresh));
    return fresh;
  }

  let state = loadState();
  const directCoordinationEntry = !hasIncomingContext;
  let role = params.get("role") || (directCoordinationEntry ? "provider" : (localStorage.getItem("mreo:coordination:role") || "buyer"));
  if (!/[^(buyer|seller|provider)]/.test("") && !["buyer","seller","provider"].includes(role)) role = "buyer";
  let currentServiceKey = params.get("service") || "";
  let selectedFiles = [];

  function saveState() {
    localStorage.setItem(stateKey, JSON.stringify(state));
  }

  function setRole(nextRole) {
    if (!["buyer","seller","provider"].includes(nextRole)) return;
    role = nextRole;
    localStorage.setItem("mreo:coordination:role", role);
    const url = new URL(location.href);
    url.searchParams.set("role", role);
    history.replaceState(null, "", url);
    renderAll();
  }

  function addActivity(text, actor = "MREO", important = false) {
    state.activity.unshift({id:`event-${Date.now()}-${Math.random().toString(16).slice(2)}`, at:Date.now(), actor, important, text});
    state.activity = state.activity.slice(0, 60);
  }

  function addDocument(doc) {
    if (state.documents.some((item) => item.id === doc.id)) return;
    state.documents.push(doc);
  }

  function addProviderDocuments(serviceKey, request) {
    const config = services[serviceKey];
    if (!config || !request) return;
    if (["proposal","counterparty-action","approved","in-progress","complete"].includes(request.status)) {
      addDocument(documentRecord(
        `${serviceKey}-proposal-${request.id}`,
        `${config.proposalTitle}.txt`,
        config.eyebrow.replace(/^\d+\s·\s/, ""),
        ["buyer","seller","provider"],
        `MREO DEMONSTRATION — ${config.proposalTitle.toUpperCase()}\n\nProperty: ${context.label}\nProvider: ${request.provider || config.provider}\nClient: ${request.ownerRole === "seller" ? "Demo Seller" : "Demo Buyer"}\n\n${config.proposalBody}\n\nStatus: ${statusLabels[request.status]}`,
        serviceKey
      ));
    }
    if (request.status === "complete") {
      addDocument(documentRecord(
        `${serviceKey}-completion-${request.id}`,
        `${config.completionTitle}.txt`,
        config.eyebrow.replace(/^\d+\s·\s/, ""),
        ["buyer","seller","provider"],
        `MREO DEMONSTRATION — ${config.completionTitle.toUpperCase()}\n\nProperty: ${context.label}\nProvider: ${request.provider || config.provider}\nCompleted: ${prettyDate(request.updatedAt)}\n\nThe fictional service is marked complete. This closeout record demonstrates the document that would remain attached to the property record after the provider finishes its work.`,
        serviceKey
      ));
    }
  }

  function transition(serviceKey, nextStatus, actor, text) {
    const request = state.requests[serviceKey];
    if (!request) return;
    request.status = nextStatus;
    request.updatedAt = Date.now();
    request.lastTransitionAt = request.updatedAt;
    if (["matched","needs-info","proposal","counterparty-action","approved","in-progress","complete"].includes(nextStatus) && !request.provider) request.provider = services[serviceKey].provider;
    if (nextStatus === "proposal") request.proposal = {title:services[serviceKey].proposalTitle, amount:services[serviceKey].proposalAmount, body:services[serviceKey].proposalBody, at:Date.now()};
    addActivity(text || `${services[serviceKey].shortTitle} moved to ${statusLabels[nextStatus]}.`, actor || "MREO", ["proposal","complete"].includes(nextStatus));
    addProviderDocuments(serviceKey, request);
    saveState();
  }

  function advanceRequest(serviceKey) {
    const request = state.requests[serviceKey];
    if (!request) { toast("Start this coordination pathway first, then the demo can advance it."); return false; }
    let next = {
      "submitted":"matched",
      "matched":"proposal",
      "needs-info":"matched",
      "proposal":"approved",
      "counterparty-action":"approved",
      "approved":"in-progress",
      "in-progress":"complete"
    }[request.status];
    if (serviceKey === "title" && request.status === "proposal") {
      request.counterpartyRole = request.ownerRole === "seller" ? "buyer" : "seller";
      next = "counterparty-action";
    }
    if (!next) { toast("This request is already complete."); return false; }
    if (serviceKey === "title" && request.status === "counterparty-action") {
      request.counterpartyInfoConfirmed = true;
    }
    if (serviceKey === "title" && request.status === "in-progress" && (!titleBuyerSigned(request) || !titleSellerSigned(request))) {
      toast(!titleBuyerSigned(request) ? "Switch to the Buyer view and confirm buyer closing / signing before final transfer." : "Switch to the Seller view and confirm seller closing / signing before final transfer.");
      return false;
    }
    const config = services[serviceKey];
    const messages = {
      matched:`${config.provider} accepted the request and opened the shared property packet.`,
      proposal:`${config.provider} returned ${config.proposalTitle.toLowerCase()} for client review.`,
      approved:`The client approved the ${config.shortTitle.toLowerCase()} response.`,
      "in-progress":`${config.provider} marked the service in progress.`,
      complete:`${config.provider} completed the service and uploaded its closeout record.`
    };
    transition(serviceKey, next, next === "approved" ? (request.ownerRole === "seller" ? "Seller" : "Buyer") : "Service Partner", messages[next]);
    renderAll();
    return true;
  }

  function autoProgress() {
    let changed = false;
    const now = Date.now();
    Object.entries(state.requests).forEach(([serviceKey, request]) => {
      if (!request) return;
      const elapsed = now - (request.lastTransitionAt || request.updatedAt || request.createdAt || now);
      if (request.status === "submitted" && elapsed > 12000) {
        transition(serviceKey, "matched", "Service Partner", `${services[serviceKey].provider} automatically accepted the demonstration request.`); changed = true;
      } else if (request.status === "matched" && elapsed > 18000) {
        // Wait for the Service Partner to prepare and send the provider response.
      } else if (request.status === "approved" && elapsed > 15000) {
        transition(serviceKey, "in-progress", "Service Partner", `${services[serviceKey].provider} began the approved demonstration work.`); changed = true;
      } else if (request.status === "in-progress" && elapsed > 25000 && serviceKey !== "title") {
        transition(serviceKey, "complete", "Service Partner", `${services[serviceKey].provider} completed the demonstration service.`); changed = true;
      }
    });
    if (changed) renderAll();
  }

  async function resetDemo() {
    if (!confirm("Clear all MREO test data in this browser, including buyer/seller accounts, uploaded property media and portfolio data, listings, bids, and Coordination activity?")) return;
    await S.clear();
    location.href = "coordination.html";
  }

  function fillRecord(prefix) {
    const title = $(`${prefix}-title`);
    if (!title) return;
    title.textContent = context.label;
    const meta = $(`${prefix}-meta`);
    const parts = [];
    if (context.kind === "portfolio" && context.count) parts.push(`${context.count} properties`);
    if (money(context.price)) parts.push(money(context.price));
    parts.push("MREO property record");
    if (meta) meta.textContent = parts.join(" · ");
    const img = $(`${prefix}-image`);
    if (img) {
      if (context.image) { img.src = context.image; img.alt = `Property record image for ${context.label}`; img.hidden = false; }
      else img.hidden = true;
    }
    const badge = $(`${prefix}-status`);
    if (badge) badge.textContent = context.hasSelection ? (state?.acquisition?.status === "complete" ? "MREO record connected" : state?.acquisition?.status === "planning" ? "Participation record connected" : "Winning bid · closing required") : "No property selected";
  }

  function statusClass(status) { return `status-${String(status || "submitted").replace(/[^a-z-]/g, "")}`; }
  function activeRequests() { return Object.values(state.requests).filter(Boolean); }
  function openRequests() { return activeRequests().filter((request) => request.status !== "complete"); }
  function completeRequests() { return activeRequests().filter((request) => request.status === "complete"); }

  function roleCopy() {
    const planning = state.acquisition.status === "planning";
    const pending = state.acquisition.status !== "complete";
    if (role === "seller") {
      if (planning) return {eyebrow:"Seller workspace",title:"Your seller information is connected before the transaction begins.",copy:"Review the property record and explore the coordination pathways without re-entering the information you already supplied.",acquisitionEyebrow:"Pre-sale coordination",acquisitionTitle:"Seller profile and property information are connected.",acquisitionCopy:"When the property enters an auction or sale, this same record can continue into title, contractor, realtor, rental, and management workflows."};
      return {
      eyebrow:"Seller workspace",
      title: pending ? "The auction is over. Closing is the next shared workflow." : "Closing, transfer, and seller handoff in one place.",
      copy: pending ? "Follow seller acceptance, title requirements, payoff or signing requests, and closing without moving the transaction packet between systems." : "Follow the final transfer record and any remaining provider activity from the seller side.",
      acquisitionEyebrow: pending ? "Winning transaction" : "Sale & closing handoff",
      acquisitionTitle: pending ? "The winning buyer is selected. Closing still needs to be completed." : "The completed transaction remains attached to this property record.",
      acquisitionCopy: pending ? "Start or follow Title / Settlement below. MREO automatically carries the auction and property information into that workflow; only supply information the provider actually needs from you." : "The final transaction information stays connected to the property record and can feed later coordination workflows."
    };
    }
    if (planning) return {eyebrow:"Buyer workspace",title:"Your buyer information is connected and ready for future coordination.",copy:"Explore the coordination pathways with the information you already supplied carried forward automatically.",acquisitionEyebrow:"Pre-acquisition coordination",acquisitionTitle:"Buyer participation information is connected.",acquisitionCopy:"When you select or acquire a property, the same buyer profile can flow into title, contractors, realtors, rental, and management workflows without being re-entered."};
    return {
      eyebrow:"Buyer workspace",
      title: pending ? "Your winning bid is selected. Complete the acquisition next." : "Your property record is ready for what comes next.",
      copy: pending ? "Begin title / settlement, respond to provider requirements, approve the closing response, and confirm signing. Existing auction and property information is passed automatically." : "Start any coordination pathway, review provider responses, approve work, and keep the resulting records attached to the property.",
      acquisitionEyebrow: pending ? "Next step · Complete the acquisition" : "Acquisition complete",
      acquisitionTitle: pending ? "Seller acceptance and closing are still required." : `${context.title || context.address || "This property"} is now in your MREO workspace.`,
      acquisitionCopy: pending ? "Use the Title / Settlement workflow to confirm your closing profile and move the transaction toward transfer. You do not need to download a packet and upload it again—the connected property record travels with the request." : "The acquisition information stays inside MREO and can automatically feed Transfer, Improve, Represent, and Rent / Manage."
    };
  }

  const roleDescriptions = {
    buyer: {
      title:"Coordinate settlement and transfer after acquisition, then preserve the final closing package.",
      contractors:"Create an improvement package, receive a contractor proposal, approve the work, and follow closeout.",
      realtors:"Request market positioning, brokerage representation, showings, listing, or leasing support.",
      rentals:"Prepare for rent, place a tenant, execute the lease, and connect ongoing property management."
    },
    seller: {
      title:"Supply seller-side documents, follow title requirements, and track the winning transaction through closing.",
      contractors:"Coordinate agreed pre-closing repairs, property preparation, inspections, cleanup, or other seller-side work.",
      realtors:"Coordinate local brokerage or transaction support if the property requires representation outside the auction pathway.",
      rentals:"Use the same property record for any lease, tenant, or management handoff that must be resolved before transfer."
    }
  };

  function renderDocumentLibrary(container, audience, serviceFilter = "") {
    if (!container) return;
    const docs = state.documents.filter((doc) => doc.audience.includes(audience) && (!serviceFilter || doc.service === serviceFilter || doc.id === "property-packet" || doc.id === "transaction-record"));
    if (!docs.length) { container.innerHTML = '<div class="document-empty">No workflow records are available yet.</div>'; return; }
    container.innerHTML = docs.slice().reverse().map((doc) => {
      const downloadable = /-completion-/.test(doc.id);
      return `
      <div class="document-item">
        <div class="document-main"><strong>${esc(doc.name)}</strong><span>${esc(doc.category)} · ${shortDate(doc.createdAt)}</span></div>
        ${downloadable ? `<button type="button" class="document-download" data-document-id="${esc(doc.id)}">Download final record</button>` : '<span class="document-state">Connected</span>'}
      </div>`;
    }).join("");
    container.querySelectorAll("[data-document-id]").forEach((button) => button.addEventListener("click", () => downloadDocument(button.dataset.documentId)));
  }

  function downloadDocument(id) {
    const doc = state.documents.find((item) => item.id === id);
    if (!doc) return;
    const blob = new Blob([doc.body || `MREO demonstration document\n\n${doc.name}`], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = doc.name.replace(/[^a-z0-9._ -]/gi, "-");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadPackage() {
    const audience = role === "seller" ? "seller" : "buyer";
    const docs = state.documents.filter((doc) => doc.audience.includes(audience));
    const body = docs.map((doc) => `========================================\n${doc.name}\n========================================\n${doc.body}`).join("\n\n");
    const blob = new Blob([body], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = role === "seller" ? "MREO-Seller-Closing-Package.txt" : "MREO-Acquisition-Package.txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderTimeline(container, serviceFilter = "") {
    if (!container) return;
    const items = state.activity.filter((item) => !serviceFilter || item.service === serviceFilter || item.text.toLowerCase().includes((services[serviceFilter]?.shortTitle || "").toLowerCase())).slice(0, 12);
    container.innerHTML = items.length ? items.map((item) => `
      <div class="timeline-event${item.important ? " is-important" : ""}">
        <span class="timeline-dot" aria-hidden="true"></span>
        <div class="timeline-content"><strong>${esc(item.actor)} · ${esc(item.text)}</strong><time>${prettyDate(item.at)}</time></div>
      </div>`).join("") : '<div class="document-empty">No activity yet.</div>';
  }

  function renderActionCenter() {
    const container = $("client-action-center");
    if (!container) return;
    const cards = [];
    Object.entries(state.requests).forEach(([key, request]) => {
      if (!request) return;
      const config = services[key];
      if (request.status === "proposal") cards.push({title:`${config.shortTitle}: proposal ready`, copy:"A provider response is waiting for client approval.", key});
      else if (request.status === "needs-info") cards.push({title:`${config.shortTitle}: information requested`, copy:"The participating company needs another client response before continuing.", key});
      else if (request.status === "submitted") cards.push({title:`${config.shortTitle}: waiting for provider`, copy:"The request has been submitted and is waiting to be accepted.", key});
      else if (request.status === "matched") cards.push({title:`${config.shortTitle}: provider reviewing`, copy:`${config.provider} is reviewing the property packet.`, key});
      else if (request.status === "approved") cards.push({title:`${config.shortTitle}: approved`, copy:"The provider can now schedule or begin the approved service.", key});
      else if (request.status === "in-progress") cards.push({title:`${config.shortTitle}: in progress`, copy:"Provider work is underway and will generate a closeout record when complete.", key});
    });
    if (!cards.length) {
      if (state.acquisition.status !== "complete" && !state.requests.title) {
        container.innerHTML = `<div class="action-card"><strong>Next step: Start Title / Settlement.</strong><p>The winning bid is selected, but closing is still required. Confirm the closing profile and send the connected transaction record to a participating provider.</p><a href="coordination-service.html?${query({service:"title", role})}">Start closing process →</a></div>`;
      } else {
        container.innerHTML = '<div class="action-card"><strong>No client actions are waiting.</strong><p>When a provider sends a response or requests information, it will appear here.</p></div>';
      }
      return;
    }
    container.innerHTML = cards.map((card) => `<div class="action-card"><strong>${esc(card.title)}</strong><p>${esc(card.copy)}</p><a href="coordination-service.html?${query({service:card.key, role})}">Open workflow →</a></div>`).join("");
  }

  function renderHub() {
    if (!$("coordination-grid")) return;
    fillRecord("coord-record");
    document.querySelectorAll("[data-role]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.role === role ? "true" : "false"));
    const client = $("client-workspace");
    const provider = $("provider-workspace");
    if (client) client.hidden = role === "provider";
    if (provider) provider.hidden = role !== "provider";

    if (role !== "provider") {
      const copy = roleCopy();
      $("role-workspace-eyebrow").textContent = copy.eyebrow;
      $("role-workspace-title").textContent = copy.title;
      $("role-workspace-copy").textContent = copy.copy;
      $("acquisition-eyebrow").textContent = copy.acquisitionEyebrow;
      $("acquisition-heading").textContent = copy.acquisitionTitle;
      $("acquisition-copy").textContent = copy.acquisitionCopy;
      const planning = state.acquisition.status === "planning";
      const pending = state.acquisition.status !== "complete";
      const details = planning ? (role === "seller" ? [
        ["Seller", state.acquisition.seller], ["Property", context.label], ["Participation status", "Profile connected"], ["Coordination status", "Available for planning"], ["Property record", context.key]
      ] : [
        ["Buyer", state.acquisition.buyer], ["Property", context.label], ["Participation status", "Profile connected"], ["Coordination status", "Available for planning"], ["Property record", context.key]
      ]) : role === "seller" ? [
        ["Seller", state.acquisition.seller], ["Winning buyer", state.acquisition.buyer], ["Winning amount", money(state.acquisition.price)], ["Transaction status", pending ? "Closing required" : "Complete"], ["Transfer status", state.requests.title ? statusLabels[state.requests.title.status] : "Not started"]
      ] : [
        ["Buyer", state.acquisition.buyer], ["Winning / purchase amount", money(state.acquisition.price)], ["Acquisition status", pending ? "Winning bid selected · closing required" : "Complete"], [pending ? "Next required workflow" : "Acquired", pending ? "Title / Settlement" : shortDate(state.acquisition.completedAt)], ["Property record", context.key]
      ];
      const primaryAction = $("acquisition-primary-action");
      if (primaryAction) {
        primaryAction.href = "#coordination-pathways";
        primaryAction.textContent = "What comes next ↓";
      }
      $("acquisition-details").innerHTML = details.map(([label,value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("");
      $("coord-stat-open").textContent = String(openRequests().length);
      $("coord-stat-docs").textContent = String(state.documents.filter((doc) => doc.audience.includes(role)).length);
      $("coord-stat-complete").textContent = String(completeRequests().length);
      renderDocumentLibrary($("coord-document-library"), role);
      renderActionCenter();
      renderTimeline($("coordination-timeline"));

      document.querySelectorAll("#coordination-grid [data-service]").forEach((card) => {
        const serviceKey = card.dataset.service;
        const request = state.requests[serviceKey];
        card.href = `coordination-service.html?${query({service:serviceKey, role})}`;
        const badge = card.querySelector(".service-status");
        if (badge) badge.textContent = request ? statusLabels[request.status] : "Not started";
        card.classList.toggle("is-active", !!request && request.status !== "complete");
        card.classList.toggle("is-complete", request?.status === "complete");
        const description = card.querySelector("[data-role-description]");
        if (description && roleDescriptions[role]?.[serviceKey]) description.textContent = roleDescriptions[role][serviceKey];
      });
    } else {
      $("role-workspace-eyebrow").textContent = "Service Partner workspace";
      $("role-workspace-title").textContent = "One provider inbox for work attached to the property record.";
      $("role-workspace-copy").textContent = "See requests exactly as they were submitted by the buyer or seller, open the shared property packet, respond, upload outputs, and advance each service through completion.";
      renderProviderHub();
    }
  }

  function renderProviderHub() {
    const specialty = $("provider-specialty")?.value || "all";
    const entries = Object.entries(state.requests).filter(([key, request]) => request && (specialty === "all" || specialty === key));
    const activeEntries = entries.filter(([, request]) => request.status !== "complete");
    const queue = $("provider-queue");
    if (queue) {
      if (!activeEntries.length) {
        const hasCompleted = entries.some(([,request]) => request.status === "complete");
        queue.innerHTML = hasCompleted
          ? '<div class="provider-empty-queue"><strong>No active requests.</strong><p>Completed work is shown separately under Completed requests.</p></div>'
          : '<div class="provider-empty-queue"><strong>No incoming requests yet.</strong><p>Switch to Buyer or Seller, open any coordination pathway, and submit it. The exact request will then appear in this provider queue.</p></div>';
      } else queue.innerHTML = activeEntries.map(([key, request]) => {
        const config = services[key];
        const attachments = request.attachments?.length || 0;
        return `<article class="provider-job">
          <div class="provider-job-main">
            <div class="provider-job-topline"><span class="status-pill ${statusClass(request.status)}">${esc(statusLabels[request.status])}</span><span class="coordination-number">${esc(config.eyebrow)}</span></div>
            <h3>${esc(config.shortTitle)} · ${esc(context.title || context.address)}</h3>
            <p>Submitted by ${request.ownerRole === "seller" ? "Demo Seller" : "Demo Buyer"}. ${esc(statusNotes[request.status])}</p>
            <div class="provider-job-meta"><span>${attachments} attachment${attachments === 1 ? "" : "s"}</span><span>${esc(request.provider || "Awaiting provider match")}</span><span>Updated ${esc(prettyDate(request.updatedAt))}</span></div>
          </div>
          <div class="provider-job-action"><a class="primary-button button-blue" href="coordination-service.html?${query({service:key, role:"provider"})}">Open request →</a></div>
        </article>`;
      }).join("");
    }
    const requests = entries.map(([,request]) => request);
    if ($("provider-inbox-count")) $("provider-inbox-count").textContent = String(activeEntries.length);
    if ($("provider-waiting-count")) $("provider-waiting-count").textContent = String(requests.filter((r) => ["needs-info","proposal"].includes(r.status)).length);
    if ($("provider-complete-count")) $("provider-complete-count").textContent = String(requests.filter((r) => r.status === "complete").length);
    renderDocumentLibrary($("provider-document-library"), "provider");
    renderTimeline($("provider-timeline"));
  }

  function humanize(key) {
    return String(key || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
  }

  function requestSummaryHtml(request) {
    if (!request) return "";
    const rows = [
      ["Submitted by", request.ownerRole === "seller" ? "Demo Seller" : "Demo Buyer"],
      ["Submitted", prettyDate(request.createdAt)],
      ...Object.entries(request.data || {}).filter(([,value]) => value).map(([key,value]) => [humanize(key), String(value)]),
      ["Supporting files", request.attachments?.length ? request.attachments.map((file) => file.name).join(", ") : "None"]
    ];
    return rows.map(([label,value]) => `<div class="request-summary-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
  }

  function workflowStepIndex(status, total, request, serviceKey) {
    if (!status) return 0;
    if (serviceKey === "title") {
      const buyerSigned = !!request?.buyerClosingConfirmed;
      const sellerSigned = !!request?.sellerClosingConfirmed;
      const map = {submitted:1, matched:2, "needs-info":2, proposal:3, "counterparty-action":4, approved:5, "in-progress":buyerSigned && sellerSigned ? 6 : 5, complete:total};
      return Math.min(total, map[status] ?? 0);
    }
    const map = {submitted:1, matched:2, "needs-info":2, proposal:3, approved:4, "in-progress":4, complete:total};
    return Math.min(total, map[status] ?? 0);
  }

  function renderWorkflow(config, request) {
    const list = $("service-workflow");
    if (!list) return;
    const index = workflowStepIndex(request?.status, config.steps.length, request, currentServiceKey);
    list.innerHTML = config.steps.map((step, i) => `<li class="${request?.status === "complete" || i < index ? "is-complete" : i === index ? "is-current" : ""}">${esc(step)}</li>`).join("");
    if ($("workflow-current-status")) $("workflow-current-status").textContent = request ? statusLabels[request.status] : "Not started";
    if ($("workflow-current-note")) $("workflow-current-note").textContent = request ? statusNotes[request.status] : "Create a request to begin this pathway.";
  }

  function renderSelectedFiles() {
    const container = $("service-selected-files");
    if (!container) return;
    container.innerHTML = selectedFiles.length ? selectedFiles.map((file) => `<span class="selected-file-chip">${esc(file.name)} · ${Math.max(1, Math.round(file.size / 1024))} KB</span>`).join("") : '<span class="field-help">No supporting files selected.</span>';
  }

  function titleBuyerSigned(request) {
    return !!(request?.buyerClosingConfirmed || (request?.ownerRole === "buyer" && request?.clientClosingConfirmed));
  }

  function titleSellerSigned(request) {
    return !!(request?.sellerClosingConfirmed || (request?.ownerRole === "seller" && request?.clientClosingConfirmed));
  }

  function titleCounterpartyRole(request) {
    return request?.counterpartyRole || (request?.ownerRole === "seller" ? "buyer" : "seller");
  }

  function renderClientRequest(config, request) {
    const form = $("service-request-form");
    const statusCard = $("client-request-status");
    if (!form || !statusCard) return;
    if (!request) {
      form.hidden = false;
      statusCard.hidden = true;
      $("service-form-fields").innerHTML = currentServiceKey === "title" && role === "seller" ? (config.sellerFields || config.fields) : config.fields;
      $("service-submit").textContent = config.action;
      $("request-title").textContent = role === "seller" ? `Submit seller-side ${config.shortTitle.toLowerCase()} request` : `Submit ${config.shortTitle.toLowerCase()} request`;
      $("request-intro").textContent = config.clientIntro;
      renderSelectedFiles();
      return;
    }
    form.hidden = true;
    statusCard.hidden = false;
    $("client-status-pill").className = `status-pill ${statusClass(request.status)}`;
    $("client-status-pill").textContent = statusLabels[request.status];
    $("client-status-title").textContent = request.status === "proposal" ? config.proposalTitle : `${config.shortTitle} · ${statusLabels[request.status]}`;
    $("client-status-copy").textContent = statusNotes[request.status];
    $("client-request-summary").innerHTML = requestSummaryHtml(request);
    const actions = $("client-request-actions");
    const isOwner = role === request.ownerRole;
    const ownerLabel = request.ownerRole === "seller" ? "seller" : "buyer";
    actions.innerHTML = "";
    if (request.status === "needs-info") {
      if (isOwner) actions.innerHTML = '<button type="button" class="primary-button button-blue" data-client-action="provide-info">Provide requested information</button>';
      else $("client-status-copy").textContent = `The provider requested additional information from the ${ownerLabel} who submitted this request.`;
    } else if (request.status === "proposal") {
      const amount = request.proposal?.amount ? ` · ${money(request.proposal.amount)}` : "";
      $("client-status-copy").textContent = `${request.proposal?.body || config.proposalBody}${amount}`;
      if (isOwner) actions.innerHTML = '<button type="button" class="primary-button button-blue" data-client-action="approve">Approve provider response</button><button type="button" class="secondary-button" data-client-action="request-change">Request a change</button>';
      else $("client-status-copy").textContent = `The provider response is ready and is waiting for the ${ownerLabel} who submitted this request to review it.`;
    } else if (currentServiceKey === "title" && request.status === "counterparty-action") {
      const counterparty = titleCounterpartyRole(request);
      if (role === counterparty) {
        const seller = counterparty === "seller";
        $("client-status-copy").textContent = seller
          ? "The buyer has approved the preliminary title response. Confirm the seller-side payoff, lien, title, and closing information so the settlement provider can prepare closing."
          : "The seller has approved the preliminary title response. Confirm the buyer-side legal name, vesting, funding, and closing information so the settlement provider can prepare closing.";
        actions.innerHTML = `<button type="button" class="primary-button button-blue" data-client-action="counterparty-confirm">${seller ? "Confirm seller title / payoff information" : "Confirm buyer closing information"}</button>`;
      } else {
        $("client-status-copy").textContent = `Waiting for the ${counterparty} to confirm the remaining title / closing information before the provider can begin final closing preparation.`;
      }
    } else if (currentServiceKey === "title" && request.status === "in-progress") {
      const buyerSigned = titleBuyerSigned(request);
      const sellerSigned = titleSellerSigned(request);
      if (!buyerSigned) {
        if (role === "buyer") {
          $("client-status-copy").textContent = "The settlement provider is preparing closing. Confirm the buyer closing / signing step once the required buyer signatures are complete.";
          actions.innerHTML = '<button type="button" class="primary-button button-blue" data-client-action="confirm-closing">Confirm buyer closing / signing complete</button>';
        } else {
          $("client-status-copy").textContent = "Waiting for the buyer to complete and confirm the buyer-side closing / signing step.";
        }
      } else if (!sellerSigned) {
        if (role === "seller") {
          $("client-status-copy").textContent = "Buyer signing is confirmed. Confirm the seller closing / signing step once the required seller signatures and payoff items are complete.";
          actions.innerHTML = '<button type="button" class="primary-button button-blue" data-client-action="confirm-closing">Confirm seller closing / signing complete</button>';
        } else {
          $("client-status-copy").textContent = "Buyer signing is confirmed. Waiting for the seller to complete and confirm the seller-side closing / signing step.";
        }
      } else {
        $("client-status-copy").textContent = "Buyer and seller closing / signing steps are confirmed. The settlement provider can now finalize transfer and publish the final closing record.";
      }
    } else if (request.status === "complete") {
      const completionDoc = state.documents.find((doc) => doc.id === `${currentServiceKey}-completion-${request.id}`);
      if (completionDoc) actions.innerHTML = `<button type="button" class="secondary-button" data-download-document="${esc(completionDoc.id)}">Download completion record</button>`;
    }
    actions.querySelectorAll("[data-client-action]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.clientAction === "provide-info") transition(currentServiceKey, "matched", role === "seller" ? "Seller" : "Buyer", `${role === "seller" ? "Demo Seller" : "Demo Buyer"} supplied the requested additional information.`);
      if (button.dataset.clientAction === "approve") {
        if (currentServiceKey === "title") {
          const active = state.requests[currentServiceKey];
          if (active) active.counterpartyRole = active.ownerRole === "seller" ? "buyer" : "seller";
          transition(currentServiceKey, "counterparty-action", role === "seller" ? "Seller" : "Buyer", `${role === "seller" ? "Demo Seller" : "Demo Buyer"} approved the provider response. The other transaction party now needs to confirm title / closing information.`);
        } else transition(currentServiceKey, "approved", role === "seller" ? "Seller" : "Buyer", `${role === "seller" ? "Demo Seller" : "Demo Buyer"} approved the provider response.`);
      }
      if (button.dataset.clientAction === "request-change") transition(currentServiceKey, "matched", role === "seller" ? "Seller" : "Buyer", `${role === "seller" ? "Demo Seller" : "Demo Buyer"} requested a revision to the provider response.`);
      if (button.dataset.clientAction === "counterparty-confirm") {
        const active = state.requests[currentServiceKey];
        if (active && role === titleCounterpartyRole(active)) {
          active.counterpartyInfoConfirmed = true;
          transition(currentServiceKey, "approved", role === "seller" ? "Seller" : "Buyer", `${role === "seller" ? "Demo Seller confirmed seller-side payoff and title information." : "Demo Buyer confirmed buyer-side closing information."}`);
        }
      }
      if (button.dataset.clientAction === "confirm-closing") {
        const active = state.requests[currentServiceKey];
        if (active) {
          if (role === "buyer") active.buyerClosingConfirmed = true;
          if (role === "seller") active.sellerClosingConfirmed = true;
          if (role === active.ownerRole) active.clientClosingConfirmed = true;
          active.updatedAt = Date.now();
          active.lastTransitionAt = active.updatedAt;
          addActivity(`${role === "seller" ? "Demo Seller" : "Demo Buyer"} confirmed the ${role}-side closing / signing step.`, role === "seller" ? "Seller" : "Buyer", true);
          saveState();
        }
      }
      renderAll();
    }));
    actions.querySelectorAll("[data-download-document]").forEach((button) => button.addEventListener("click", () => downloadDocument(button.dataset.downloadDocument)));
  }

  function renderProviderRequest(config, request) {
    const empty = $("provider-empty-state");
    const detail = $("provider-request-detail");
    if (!empty || !detail) return;
    if (!request) { empty.hidden = false; detail.hidden = true; return; }
    empty.hidden = true; detail.hidden = false;
    $("provider-status-pill").className = `status-pill ${statusClass(request.status)}`;
    $("provider-status-pill").textContent = statusLabels[request.status];
    $("provider-request-name").textContent = `${config.shortTitle} · ${context.title || context.address}`;
    $("provider-company-name").textContent = request.provider || "Awaiting provider match";
    globalThis.MREO_PROVIDER_BRANDING?.apply($("provider-company-logo"), request.provider || config.provider);
    $("provider-request-summary").innerHTML = requestSummaryHtml(request);
    const attachments = request.attachments || [];
    $("provider-attachment-list").innerHTML = attachments.length ? attachments.map((file) => `<div class="attachment-item">${esc(file.name)} · ${esc(file.type || "file")} · ${Math.max(1, Math.round(file.size / 1024))} KB</div>`).join("") : '<div class="document-empty">No client attachments were included. The core MREO property packet remains available below.</div>';
    const guidance = $("provider-action-guidance");
    const buttons = $("provider-action-buttons");
    buttons.innerHTML = "";
    const addButton = (label, action, primary = false, disabled = false) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = label; button.dataset.providerAction = action; button.classList.toggle("is-primary", primary); button.disabled = disabled; buttons.appendChild(button);
    };
    if (request.status === "submitted") {
      guidance.textContent = "Review the property packet, client answers, and attachments. Accept the job or request more information.";
      addButton("Accept request", "accept", true); addButton("Request information", "needs-info");
    } else if (request.status === "matched") {
      guidance.textContent = "The request is accepted. Return the demonstration proposal / engagement package when review is complete.";
      addButton("Send provider response", "proposal", true); addButton("Request information", "needs-info");
    } else if (request.status === "needs-info") {
      guidance.textContent = "Waiting for the buyer or seller to supply the requested information.";
      addButton("Waiting for client", "wait", false, true);
    } else if (request.status === "proposal") {
      guidance.textContent = "Provider response sent. Waiting for the client to approve or request a revision.";
      addButton("Waiting for approval", "wait", false, true);
    } else if (request.status === "counterparty-action") {
      const counterparty = titleCounterpartyRole(request);
      guidance.textContent = `The initiating client approved the title response. Waiting for the ${counterparty} to confirm the remaining title / closing information.`;
      addButton(`Waiting for ${counterparty} title information`, "wait", false, true);
    } else if (request.status === "approved") {
      guidance.textContent = currentServiceKey === "title" ? "Buyer / seller information is confirmed. Begin final closing preparation." : "The client approved the response. Begin or schedule the service.";
      addButton(currentServiceKey === "title" ? "Begin closing preparation" : "Start work", "in-progress", true);
    } else if (request.status === "in-progress") {
      if (currentServiceKey === "title") {
        const buyerSigned = titleBuyerSigned(request);
        const sellerSigned = titleSellerSigned(request);
        if (!buyerSigned) {
          guidance.textContent = "Closing preparation is in progress. Waiting for the buyer to complete and confirm buyer-side signing.";
          addButton("Waiting for buyer closing confirmation", "wait", false, true);
        } else if (!sellerSigned) {
          guidance.textContent = "Buyer signing is confirmed. Waiting for the seller to complete seller-side signing and payoff requirements.";
          addButton("Waiting for seller closing confirmation", "wait", false, true);
        } else {
          guidance.textContent = "Buyer and seller signing are confirmed. Finalize the transfer and publish the closing record.";
          addButton("Finalize transfer / mark complete", "complete", true);
        }
      } else {
        guidance.textContent = "Work is in progress. When finished, complete the job and publish the final record.";
        addButton("Mark complete", "complete", true); addButton("Request information", "needs-info");
      }
    } else {
      guidance.textContent = "This service is complete. The closeout package is attached to the shared property record.";
      addButton("Complete", "wait", false, true);
    }
    buttons.querySelectorAll("[data-provider-action]").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.providerAction;
      if (action === "wait") return;
      const actor = "Service Partner";
      if (action === "accept") transition(currentServiceKey, "matched", actor, `${config.provider} accepted the request and opened the shared property packet.`);
      if (action === "needs-info") transition(currentServiceKey, "needs-info", actor, `${config.provider} requested additional client information.`);
      if (action === "proposal") transition(currentServiceKey, "proposal", actor, `${config.provider} sent ${config.proposalTitle.toLowerCase()} to the client.`);
      if (action === "in-progress") transition(currentServiceKey, "in-progress", actor, `${config.provider} started the approved service.`);
      if (action === "complete") transition(currentServiceKey, "complete", actor, `${config.provider} completed the service and published its closeout record.`);
      renderAll();
    }));
  }

  function renderService() {
    const config = services[currentServiceKey];
    if (!config || !$("service-title")) return;
    fillRecord("service-record");
    document.querySelectorAll("[data-role]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.role === role ? "true" : "false"));
    $("service-eyebrow").textContent = config.eyebrow;
    $("service-title").textContent = config.title;
    $("service-intro").textContent = config.clientIntro;
    document.title = `${config.title} | MREO Coordination`;
    $("service-back").href = `coordination.html?${query({role})}`;
    const request = state.requests[currentServiceKey];
    renderWorkflow(config, request);

    const clientPanel = $("client-service-panel");
    const providerPanel = $("provider-service-panel");
    clientPanel.hidden = role === "provider";
    providerPanel.hidden = role !== "provider";
    if (role === "provider") renderProviderRequest(config, request);
    else renderClientRequest(config, request);

    renderDocumentLibrary($("service-document-library"), role === "provider" ? "provider" : role, currentServiceKey);
    renderServiceTimeline();
  }

  function renderServiceTimeline() {
    const container = $("service-timeline");
    if (!container) return;
    const config = services[currentServiceKey];
    const items = state.activity.filter((item) => {
      const text = item.text.toLowerCase();
      return text.includes(config.shortTitle.toLowerCase()) || text.includes((config.provider || "").split(" · ")[0].toLowerCase()) || text.includes(config.title.toLowerCase());
    }).slice(0, 12);
    container.innerHTML = items.length ? items.map((item) => `<div class="timeline-event${item.important ? " is-important" : ""}"><span class="timeline-dot"></span><div class="timeline-content"><strong>${esc(item.actor)} · ${esc(item.text)}</strong><time>${prettyDate(item.at)}</time></div></div>`).join("") : '<div class="document-empty">This pathway has no activity yet. Submit a request to begin.</div>';
  }

  function submitServiceRequest(event) {
    event.preventDefault();
    const config = services[currentServiceKey];
    const form = event.currentTarget;
    if (!config || !form.reportValidity()) return;
    if (state.requests[currentServiceKey]) { toast("This property already has an active request for this pathway."); return; }
    const raw = new FormData(form);
    const data = {};
    raw.forEach((value, key) => { if (key !== "attachments" && typeof value === "string") data[key] = value; });
    const request = {
      id:`${currentServiceKey}-${Date.now()}`,
      service:currentServiceKey,
      ownerRole: role === "seller" ? "seller" : "buyer",
      status:"submitted",
      createdAt:Date.now(),
      updatedAt:Date.now(),
      lastTransitionAt:Date.now(),
      provider:data.providerPreference && data.providerPreference !== "Match me with a participating provider" ? data.providerPreference : "",
      proposal:null,
      data,
      attachments:selectedFiles.map((file) => ({name:file.name, type:file.type || "file", size:file.size || 0, lastModified:file.lastModified || 0}))
    };
    state.requests[currentServiceKey] = request;
    addActivity(`${role === "seller" ? "Demo Seller" : "Demo Buyer"} submitted a ${config.shortTitle.toLowerCase()} request with ${request.attachments.length} supporting file${request.attachments.length === 1 ? "" : "s"}.`, role === "seller" ? "Seller" : "Buyer", true);
    saveState();
    selectedFiles = [];
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    renderAll();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.getElementById("service-attention-v5") || document.querySelector(".service-demo-strip");
      target?.scrollIntoView({behavior:"smooth", block:"start"});
    }));
    toast("Request submitted. Switch to Service Partner to see it arrive in the provider inbox.");
  }

  function toast(message) {
    let el = document.querySelector(".coord-toast");
    if (!el) { el = document.createElement("div"); el.className = "coord-toast"; document.body.appendChild(el); }
    el.textContent = message;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.remove(), 4200);
  }

  function wireOnce() {
    document.querySelectorAll("[data-role]").forEach((button) => {
      if (button.dataset.roleWired) return;
      button.dataset.roleWired = "1";
      button.addEventListener("click", () => setRole(button.dataset.role));
    });
    $("coord-reset-demo")?.addEventListener("click", resetDemo);
    $("coord-advance-demo")?.addEventListener("click", () => {
      const entry = Object.entries(state.requests).find(([,request]) => request && request.status !== "complete");
      if (!entry) { toast("Start a coordination pathway first. Then this control advances the active fictional workflow."); return; }
      advanceRequest(entry[0]);
    });
    $("download-acquisition-package")?.addEventListener("click", downloadPackage);
    $("provider-specialty")?.addEventListener("change", renderProviderHub);
    $("service-advance-demo")?.addEventListener("click", () => currentServiceKey && advanceRequest(currentServiceKey));
    const form = $("service-request-form");
    if (form && !form.dataset.wired) { form.dataset.wired = "1"; form.addEventListener("submit", submitServiceRequest); }
    const attachmentInput = $("service-attachments");
    if (attachmentInput && !attachmentInput.dataset.wired) {
      attachmentInput.dataset.wired = "1";
      attachmentInput.addEventListener("change", () => { selectedFiles = [...(attachmentInput.files || [])]; renderSelectedFiles(); });
    }
  }

  function renderAll() {
    renderHub();
    renderService();
    wireOnce();
  }

  renderAll();
  setInterval(autoProgress, 4000);
})();
