(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const serviceKey = params.get("service") || "";
  const providers = globalThis.MREO_COORDINATION_PROVIDERS || {};
  const demoJobs = globalThis.MREO_PROVIDER_DEMO_JOBS || [];
  const serviceLabels = {
    title:{title:"Title / Settlement",eyebrow:"01 · TITLE / SETTLEMENT",providerLabel:"Preferred title / settlement provider"},
    contractors:{title:"Contractors",eyebrow:"02 · CONTRACTORS",providerLabel:"Preferred contractor"},
    realtors:{title:"Realtors",eyebrow:"03 · REALTORS",providerLabel:"Preferred realtor / brokerage"},
    rentals:{title:"Rent / Manage",eyebrow:"04 · RENT / MANAGE",providerLabel:"Preferred rental / management provider"}
  };
  const stateKey = (() => {
    const hasIncomingContext=["auction","address","title","price","image","count"].some(key=>params.get(key));
    const label=params.get("address")||params.get("title")||(hasIncomingContext?"MREO property record":"4218 Maple Ridge Drive, Dallas, TX 75229");
    const key=params.get("auction")||(!hasIncomingContext?"demo-property":label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""))||"unselected";
    return `mreo:coordination:v3:${key}`;
  })();
  const demoJobStateKey="mreo:coordination:provider-demo:v2";
  const queryProfile = {
    role:params.get("accountRole")||"",
    name:params.get("accountName")||"",
    email:params.get("accountEmail")||"",
    phone:params.get("accountPhone")||"",
    purchaseMethod:params.get("purchaseMethod")||"",
    timeline:params.get("purchaseTimeline")||""
  };
  const contextLabel=params.get("address")||params.get("title")||"4218 Maple Ridge Drive, Dallas, TX 75229";
  const contextPrice=params.get("price")||"";
  let scheduled=false, applying=false;
  let primaryImageUrl="";
  let primaryImageLoading=false;
  const profilePromises={};

  function applyPrimaryPropertyImage(url){
    if(!url)return;
    ["coord-record-image","service-record-image"].forEach(id=>{
      const img=$(id);
      if(!img)return;
      if(img.src!==url)img.src=url;
      img.alt=`Primary seller-provided photograph for ${contextLabel}`;
      img.hidden=false;
    });
  }

  async function hydratePrimaryPropertyImage(){
    if(primaryImageUrl){applyPrimaryPropertyImage(primaryImageUrl);return;}
    const mediaKey=params.get("mediaKey")||"";
    if(mediaKey&&globalThis.MreoService?.getMedia&&!primaryImageLoading){
      primaryImageLoading=true;
      try{
        const media=await globalThis.MreoService.getMedia(mediaKey);
        const photo=media.find(item=>(item.type||"").startsWith("image/")&&item.blob);
        if(photo){
          primaryImageUrl=URL.createObjectURL(photo.blob);
          ["coord-record-image","service-record-image"].forEach(id=>{const img=$(id);if(img)img.dataset.primaryMediaName=photo.name||"";});
          applyPrimaryPropertyImage(primaryImageUrl);
          return;
        }
      }catch{}finally{primaryImageLoading=false;}
    }
    const fallback=params.get("image")||"";
    if(/^(https?:\/\/|assets\/)/i.test(fallback)){
      primaryImageUrl=fallback;
      applyPrimaryPropertyImage(primaryImageUrl);
    }
  }

  const directProviderContext = !["auction","address","title","price","image","count","mediaKey"].some(key=>params.get(key));
  function role(){
    const explicit=new URLSearchParams(location.search).get("role");
    const value=explicit||(directProviderContext?"provider":(localStorage.getItem("mreo:coordination:role")||"buyer"));
    return ["buyer","seller","provider"].includes(value)?value:"buyer";
  }
  function isDirectProviderInbox(){
    return document.body.classList.contains("coordination-page")&&directProviderContext&&role()==="provider";
  }
  function loadState(){try{return JSON.parse(localStorage.getItem(stateKey)||"null");}catch{return null;}}
  function saveState(state){if(state)localStorage.setItem(stateKey,JSON.stringify(state));}
  function money(value){
    const n=Number(value||0);
    return Number.isFinite(n)&&n>0?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n):"";
  }
  function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function responseHref(key,nextRole){
    const out=new URLSearchParams(location.search);
    out.set("service",key);
    out.set("role",nextRole||role());
    return `coordination-response.html?${out.toString()}`;
  }
  function serviceHref(key,nextRole){
    const out=new URLSearchParams(location.search);
    out.set("service",key);
    out.set("role",nextRole||role());
    return `coordination-service.html?${out.toString()}`;
  }
  function cityStateFromLabel(){
    const parts=contextLabel.split(",").map(s=>s.trim()).filter(Boolean);
    if(parts.length>=3){
      const state=parts[parts.length-1].replace(/\s+\d{5}(?:-\d{4})?$/,"");
      return `${parts[parts.length-2]}, ${state}`;
    }
    return "";
  }
  function demoJobState(){
    try{return JSON.parse(localStorage.getItem(demoJobStateKey)||"{}");}catch{return {};}
  }
  function currentDemoJob(job){
    const saved=demoJobState()[job.id];
    if(!saved)return job;
    return {...job,...saved};
  }
  function propertyIdentity(value){
    return String(value||"").split(",")[0].trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  }
  function demoJobsForCurrentProperty(){
    const current=demoJobs.map(currentDemoJob);
    if(isDirectProviderInbox())return current;
    const identity=propertyIdentity(contextLabel);
    if(!identity)return [];
    return current.filter(job=>propertyIdentity(job.property)===identity);
  }
  function providerJobHref(job){
    const out=new URLSearchParams();
    out.set("job",job.id);
    out.set("role","provider");
    out.set("return",location.pathname.split("/").pop()+"?"+location.search.replace(/^\?/,""));
    return `coordination-provider-job.html?${out.toString()}`;
  }

  async function profileFor(currentRole){
    if(currentRole==="provider")return null;
    if(profilePromises[currentRole])return profilePromises[currentRole];
    profilePromises[currentRole]=(async()=>{
      let account=null;
      try{if(globalThis.MreoService?.me)account=await globalThis.MreoService.me(currentRole);}catch{}
      const details=account?.submission?.details||{};
      const isBuyer=currentRole==="buyer";
      const useQuery=!queryProfile.role||queryProfile.role===currentRole;
      const state=loadState();
      const storedProfile=isBuyer?state?.acquisition?.buyerProfile:state?.acquisition?.sellerProfile;
      const merged={
        name:(useQuery?queryProfile.name:"")||account?.name||storedProfile?.name||state?.acquisition?.[isBuyer?"buyer":"seller"]||(isBuyer?"Demo Buyer":"Demo Seller"),
        email:(useQuery?queryProfile.email:"")||account?.email||storedProfile?.email||"",
        phone:(useQuery?queryProfile.phone:"")||details[isBuyer?"buyerPhone":"sellerPhone"]||storedProfile?.phone||"",
        purchaseMethod:(useQuery?queryProfile.purchaseMethod:"")||details.buyerPurchaseMethod||storedProfile?.purchaseMethod||"",
        timeline:(useQuery?queryProfile.timeline:"")||details[isBuyer?"buyerTimeline":"saleTimeline"]||storedProfile?.timeline||""
      };
      if(state?.acquisition&&merged.name){
        const key=isBuyer?"buyer":"seller";
        if(state.acquisition[key]!==merged.name){state.acquisition[key]=merged.name;saveState(state);}
      }
      return merged;
    })();
    return profilePromises[currentRole];
  }

  function renameVisibleServices(){
    const contractor=document.querySelector('[data-service="contractors"]');
    if(contractor){
      const n=contractor.querySelector(".coordination-number"),h=contractor.querySelector("h2");
      if(n&&n.textContent!=="02 · CONTRACTORS")n.textContent="02 · CONTRACTORS";
      if(h&&h.textContent!=="Contractors")h.textContent="Contractors";
    }
    const realtor=document.querySelector('[data-service="realtors"]');
    if(realtor){
      const n=realtor.querySelector(".coordination-number"),h=realtor.querySelector("h2");
      if(n&&n.textContent!=="03 · REALTORS")n.textContent="03 · REALTORS";
      if(h&&h.textContent!=="Realtors")h.textContent="Realtors";
    }
    if(document.body.classList.contains("coordination-service-page")&&serviceKey&&serviceLabels[serviceKey]){
      const info=serviceLabels[serviceKey];
      if($("service-title")&&$("service-title").textContent!==info.title)$("service-title").textContent=info.title;
      if($("service-eyebrow")&&$("service-eyebrow").textContent!==info.eyebrow)$("service-eyebrow").textContent=info.eyebrow;
    }
    const specialty=$("provider-specialty");
    if(specialty){
      [...specialty.options].forEach(option=>{
        if(option.value==="contractors"&&option.textContent!=="Contractors")option.textContent="Contractors";
        if(option.value==="realtors"&&option.textContent!=="Realtors")option.textContent="Realtors";
      });
    }
  }

  function ensureWhatComesNext(){
    const button=$("acquisition-primary-action");
    if(!button)return;
    if(button.getAttribute("href")!=="#coordination-pathways")button.setAttribute("href","#coordination-pathways");
    if(button.textContent!=="What comes next ↓")button.textContent="What comes next ↓";
    const section=document.querySelector(".coordination-pathways-section");
    if(section&&!section.id)section.id="coordination-pathways";
  }

  function setTextIfChanged(element,value){if(element&&element.textContent!==value)element.textContent=value;}
  function setAttention(card,data){
    if(!card)return;
    const stateLabel=data.stateLabel||(data.on?"Action needed":"Waiting");
    const isComplete=stateLabel==="Complete";
    card.classList.toggle("is-on",!!data.on&&!isComplete);
    card.classList.toggle("is-off",!data.on&&!isComplete);
    card.classList.toggle("is-complete",isComplete);
    const light=card.querySelector(".attention-light");
    if(light&&light.getAttribute("aria-label")!==stateLabel)light.setAttribute("aria-label",stateLabel);
    const state=card.querySelector(".attention-state");
    setTextIfChanged(state,stateLabel);
    const title=card.querySelector(".attention-title");
    setTextIfChanged(title,data.title);
    const copy=card.querySelector(".attention-copy");
    setTextIfChanged(copy,data.copy);
    const link=card.querySelector(".attention-link");
    if(link){
      if(data.href){link.hidden=false;link.href=data.href;link.textContent=data.link||"Open →";}
      else link.hidden=true;
    }
  }

  function attentionForClient(state,currentRole){
    const entries=Object.entries(state?.requests||{}).filter(([,request])=>request);
    for(const [key,request] of entries){
      const label=serviceLabels[key]?.title||key;
      const isOwner=request.ownerRole===currentRole;
      if(request.status==="complete")continue;
      if(request.status==="proposal"){
        if(isOwner)return {on:true,title:`Review the ${label.toLowerCase()} provider response.`,copy:"A detailed provider response is ready. Review the terms, scope, requirements, and notes before approving or requesting changes.",href:responseHref(key,currentRole),link:"Review provider response →"};
        return {on:false,title:`Waiting for ${request.ownerRole==="seller"?"seller":"buyer"} review.`,copy:`The provider response is ready, but the ${request.ownerRole==="seller"?"seller":"buyer"} who submitted this request must approve it or request changes.`,href:responseHref(key,currentRole),link:"View provider response →"};
      }
      if(request.status==="needs-info"){
        if(isOwner)return {on:true,title:`Provide information for ${label}.`,copy:"The service provider needs additional information before it can continue.",href:serviceHref(key,currentRole),link:"Open request →"};
        return {on:false,title:`Waiting for ${request.ownerRole==="seller"?"seller":"buyer"} information.`,copy:"The provider requested additional information from the client who submitted this request.",href:serviceHref(key,currentRole),link:"View request →"};
      }
      if(key==="title"&&request.status==="counterparty-action"){
        const counterparty=request.counterpartyRole||(request.ownerRole==="seller"?"buyer":"seller");
        if(currentRole===counterparty)return {on:true,title:counterparty==="seller"?"Confirm seller title / payoff information.":"Confirm buyer closing information.",copy:"The initiating client approved the title response. Confirm the remaining transaction-party information so the provider can prepare closing.",href:serviceHref(key,currentRole),link:"Open Title / Settlement →"};
        return {on:false,title:`Waiting for ${counterparty} title information.`,copy:`The title response is approved. The ${counterparty} must confirm the remaining title / closing information before the provider can continue.`,href:serviceHref(key,currentRole),link:"View request →"};
      }
      if(key==="title"&&request.status==="in-progress"){
        const buyerSigned=!!(request.buyerClosingConfirmed||(request.ownerRole==="buyer"&&request.clientClosingConfirmed));
        const sellerSigned=!!(request.sellerClosingConfirmed||(request.ownerRole==="seller"&&request.clientClosingConfirmed));
        if(!buyerSigned){
          if(currentRole==="buyer")return {on:true,title:"Confirm buyer closing / signing.",copy:"The settlement provider is waiting for the buyer-side signing confirmation.",href:serviceHref(key,currentRole),link:"Open Title / Settlement →"};
          return {on:false,title:"Waiting for buyer closing confirmation.",copy:"Buyer-side signing must be confirmed before the title workflow can move to the seller closing step.",href:serviceHref(key,currentRole),link:"View request →"};
        }
        if(!sellerSigned){
          if(currentRole==="seller")return {on:true,title:"Confirm seller closing / signing.",copy:"Buyer signing is complete. The settlement provider is waiting for seller-side signing and payoff confirmation.",href:serviceHref(key,currentRole),link:"Open Title / Settlement →"};
          return {on:false,title:"Waiting for seller closing confirmation.",copy:"Buyer signing is confirmed. The seller must now complete the seller-side closing step.",href:serviceHref(key,currentRole),link:"View request →"};
        }
        return {on:false,title:"Waiting for the title provider to finalize transfer.",copy:"Buyer and seller closing confirmations are complete. The title / settlement provider can now publish the final closing record.",href:serviceHref(key,currentRole),link:"View request →"};
      }
      if(request.status==="submitted")return {on:false,title:`Waiting for a ${label.toLowerCase()} provider.`,copy:"The request has been submitted. MREO is waiting for a participating provider to accept it.",href:serviceHref(key,currentRole),link:"View request →"};
      if(request.status==="matched")return {on:false,title:`${label} is under provider review.`,copy:request.revisionRequest?"The client requested changes and the participating provider is revising the response.":"The participating provider is reviewing the connected property record and request.",href:serviceHref(key,currentRole),link:"View request →"};
      if(request.status==="approved"||request.status==="in-progress")return {on:false,title:`Waiting on the ${label.toLowerCase()} provider.`,copy:"The client-side step is complete. The participating provider is now responsible for the next workflow action.",href:serviceHref(key,currentRole),link:"View request →"};
    }
    if(state?.acquisition?.status==="planning")return {on:true,title:"Choose what you want to coordinate.",copy:"Your Buyer or Seller participation information is already connected. Explore any service pathway without re-entering that profile.",href:"#coordination-pathways",link:"See service paths ↓"};
    if(state?.acquisition?.status!=="complete")return {on:true,title:"Choose the next closing step.",copy:"The winning transaction is recorded, but closing is still required. Title / Settlement is the recommended next pathway.",href:"#coordination-pathways",link:"See service paths ↓"};
    return {on:true,title:"Choose what this property needs next.",copy:"There is no active request waiting on someone else. Select one of the four coordination pathways below.",href:"#coordination-pathways",link:"See service paths ↓"};
  }

  function providerActionForRequest(key,request){
    const label=serviceLabels[key]?.title||key;
    if(request.status==="submitted")return {on:true,title:`Review incoming ${label.toLowerCase()} request.`,copy:"Check the client answers and connected property information, then accept the request or ask for more information.",href:serviceHref(key,"provider"),link:"Open request →"};
    if(request.status==="matched")return {on:true,title:`Prepare the ${label.toLowerCase()} provider response.`,copy:"The request has been accepted. Prepare the detailed response the client will review.",href:responseHref(key,"provider"),link:"Prepare response →"};
    if(request.status==="counterparty-action"){
      const counterparty=request.counterpartyRole||(request.ownerRole==="seller"?"buyer":"seller");
      return {on:false,title:`Waiting for ${counterparty} title information.`,copy:`The initiating client approved the title response. The ${counterparty} must confirm the remaining title / closing information before provider work continues.`,href:serviceHref(key,"provider"),link:"View request →"};
    }
    if(request.status==="approved")return {on:true,title:`Start the approved ${label.toLowerCase()} service.`,copy:"The required client-side information is confirmed. Scheduling or work can now begin.",href:serviceHref(key,"provider"),link:"Open request →"};
    if(request.status==="in-progress"){
      if(key==="title"){
        const buyerSigned=!!(request.buyerClosingConfirmed||(request.ownerRole==="buyer"&&request.clientClosingConfirmed));
        const sellerSigned=!!(request.sellerClosingConfirmed||(request.ownerRole==="seller"&&request.clientClosingConfirmed));
        if(!buyerSigned)return {on:false,title:"Waiting for buyer closing confirmation.",copy:"The title file is in progress, but the provider is waiting for buyer-side signing confirmation.",href:serviceHref(key,"provider"),link:"View request →"};
        if(!sellerSigned)return {on:false,title:"Waiting for seller closing confirmation.",copy:"Buyer signing is confirmed. The provider is waiting for seller-side signing and payoff confirmation.",href:serviceHref(key,"provider"),link:"View request →"};
        return {on:true,title:"Finalize the title transfer.",copy:"Buyer and seller closing steps are confirmed. Finalize transfer and publish the closing record.",href:serviceHref(key,"provider"),link:"Open request →"};
      }
      return {on:true,title:`Update the ${label.toLowerCase()} job.`,copy:"Work is in progress. Review the file and complete or update the next provider step.",href:serviceHref(key,"provider"),link:"Open request →"};
    }
    if(request.status==="needs-info")return {on:false,title:"Waiting for client information.",copy:"The provider requested information and is waiting for the buyer or seller to respond.",href:serviceHref(key,"provider"),link:"View request →"};
    if(request.status==="proposal")return {on:false,title:"Waiting for client review.",copy:"The provider response has been sent. The client must approve it or request changes.",href:responseHref(key,"provider"),link:"View sent response →"};
    return null;
  }

  function attentionForProvider(state){
    for(const [key,request] of Object.entries(state?.requests||{})){
      if(!request)continue;
      const item=providerActionForRequest(key,request);
      if(item?.on)return item;
    }
    const scopedDemoJobs=demoJobsForCurrentProperty();
    const demo=scopedDemoJobs.find(job=>job.actionNeeded);
    if(demo)return {on:true,title:demo.status+".",copy:`${demo.property} · ${demo.summary}`,href:providerJobHref(demo),link:"Open provider job →"};
    for(const [key,request] of Object.entries(state?.requests||{})){
      if(!request)continue;
      const item=providerActionForRequest(key,request);
      if(item)return item;
    }
    const scopedWaiting=scopedDemoJobs.find(job=>!job.complete);
    if(scopedWaiting)return {on:false,title:scopedWaiting.status+".",copy:`${scopedWaiting.property} · ${scopedWaiting.summary}`,href:providerJobHref(scopedWaiting),link:"View provider job →"};
    return {on:false,title:"Waiting for new provider work.",copy:`There is nothing attached to ${contextLabel} that currently requires provider action.`,href:"#provider-queue-title",link:"View work queue ↓"};
  }

  function ensureHubAttention(){
    if(!document.body.classList.contains("coordination-page"))return;
    let card=$("coord-attention-v5");
    if(!card){
      card=document.createElement("div");
      card.id="coord-attention-v5";
      card.className="attention-card";
      card.innerHTML='<span class="attention-light" aria-hidden="true"></span><div class="attention-body"><span class="attention-state"></span><strong class="attention-title"></strong><p class="attention-copy"></p></div><a class="attention-link" href="#"></a>';
      const intro=document.querySelector(".role-intro");
      intro?.appendChild(card);
    }
    const currentRole=role(),state=loadState();
    setAttention(card,currentRole==="provider"?attentionForProvider(state):attentionForClient(state,currentRole));
    const workspaceStats=document.querySelector(".workspace-stats"); if(workspaceStats&&!workspaceStats.hidden)workspaceStats.hidden=true;
    const providerSummary=document.querySelector(".provider-summary-grid"); if(providerSummary&&!providerSummary.hidden)providerSummary.hidden=true;
    const actionCenter=$("client-action-center")?.closest("article"); if(actionCenter)actionCenter.hidden=true;
    const timeline=$("coordination-timeline")?.closest("article"); if(timeline)timeline.hidden=true;
    const providerTimeline=$("provider-timeline")?.closest("article"); if(providerTimeline)providerTimeline.hidden=true;
    const providerDocs=$("provider-document-library")?.closest(".lower-workspace-grid");
    if(providerDocs)providerDocs.classList.add("v5-single-column");
  }

  function serviceAttentionData(state,currentRole){
    const request=state?.requests?.[serviceKey]||null;
    const label=serviceLabels[serviceKey]?.title||"service";
    if(request?.status==="complete"){
      return {
        on:false,
        stateLabel:"Complete",
        title:`${label} service complete.`,
        copy:"This workflow is complete. No further action is required.",
        href:"",
        link:""
      };
    }
    if(currentRole==="provider"){
      if(!request)return {on:false,title:"Waiting for a client request.",copy:"No buyer or seller request has been submitted for this property and service.",href:"",link:""};
      return providerActionForRequest(serviceKey,request)||{on:false,title:"Waiting.",copy:"No provider action is required right now.",href:"",link:""};
    }
    if(!request)return {on:true,title:`Complete the ${label} request.`,copy:"Review the information carried forward from the property record, add anything still needed, and submit it to a provider.",href:"#request-title",link:"Go to request form ↓"};
    return attentionForClient({requests:{[serviceKey]:request},acquisition:{status:"complete"}},currentRole);
  }

  function ensureServiceAttention(){
    if(!document.body.classList.contains("coordination-service-page")||!serviceKey)return;
    let card=$("service-attention-v5");
    if(!card){
      card=document.createElement("section");
      card.id="service-attention-v5";
      card.className="attention-card service-attention-card";
      card.innerHTML='<span class="attention-light" aria-hidden="true"></span><div class="attention-body"><span class="attention-state"></span><strong class="attention-title"></strong><p class="attention-copy"></p></div><a class="attention-link" href="#"></a>';
      const strip=document.querySelector(".service-demo-strip");
      strip?.insertAdjacentElement("afterend",card);
    }
    setAttention(card,serviceAttentionData(loadState(),role()));
    const timeline=$("service-timeline")?.closest("article"); if(timeline)timeline.hidden=true;
    const lower=document.querySelector(".service-lower-grid"); if(lower)lower.classList.add("v5-single-column");
  }

  function providerOptionsFor(key){
    return providers[key]||["Match me with a participating provider"];
  }

  function ensureProviderDropdown(){
    if(!document.body.classList.contains("coordination-service-page")||!serviceKey||role()==="provider")return;
    const state=loadState();
    if(state?.requests?.[serviceKey])return;
    const container=$("service-form-fields");
    if(!container)return;
    let select=container.querySelector('select[name="providerPreference"]');
    if(!select){
      const firstSection=container.querySelector(".service-form-section");
      if(!firstSection)return;
      const label=document.createElement("label");
      label.className="provider-choice-field";
      label.innerHTML=`${esc(serviceLabels[serviceKey]?.providerLabel||"Preferred provider")}<select name="providerPreference"></select><span class="field-source">Choose a fictional provider or let MREO match the request.</span>`;
      const h=firstSection.querySelector("h3");
      h?.insertAdjacentElement("afterend",label);
      select=label.querySelector("select");
    }else{
      const label=select.closest("label");
      if(label&&serviceLabels[serviceKey]?.providerLabel){
        const textNode=[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);
        if(textNode)textNode.textContent=serviceLabels[serviceKey].providerLabel;
      }
    }
    const options=providerOptionsFor(serviceKey);
    const current=select.value;
    const desired=options.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join("");
    if(select.innerHTML!==desired){
      select.innerHTML=desired;
      if(options.includes(current))select.value=current;
    }
  }

  function prefillKnownInformation(){
    if(!document.body.classList.contains("coordination-service-page")||!serviceKey||role()==="provider")return;
    const state=loadState();
    if(state?.requests?.[serviceKey])return;
    const container=$("service-form-fields");
    if(!container||container.dataset.v5PrefillPending==="1"||container.querySelector(".carried-forward-panel"))return;
    container.dataset.v5PrefillPending="1";
    profileFor(role()).then(profile=>{
      container.dataset.v5PrefillPending="";
      if(!document.body.contains(container)||loadState()?.requests?.[serviceKey])return;
      let panel=container.querySelector(".carried-forward-panel");
      if(!panel){
        panel=document.createElement("section");
        panel.className="carried-forward-panel";
        container.prepend(panel);
      }
      const amount=money(contextPrice);
      const method=profile?.purchaseMethod||"";
      panel.innerHTML=`
        <div class="carried-forward-heading"><span>Carried forward from Buy / Auction</span><strong>Known information</strong><p>MREO reuses information already in the property and transaction record. Update contact fields if something has changed.</p></div>
        <div class="carried-forward-grid">
          <label>Client / account name<input name="clientAccountName" type="text" value="${esc(profile?.name||"")}"></label>
          <label>Email<input name="clientEmail" type="email" value="${esc(profile?.email||"")}"></label>
          <label>Phone<input name="clientPhone" type="tel" value="${esc(profile?.phone||"")}"></label>
          <label>Property<input type="text" value="${esc(contextLabel)}" readonly><span class="field-source">From property record</span></label>
          <label>Winning / purchase amount<input type="text" value="${esc(amount||"Not recorded")}" readonly><span class="field-source">From auction / acquisition record</span></label>
          <label>Purchase method<input name="purchaseMethodSource" type="text" value="${esc(method)}" placeholder="Not previously supplied"><span class="field-source">From Buy section when available</span></label>
        </div>`;
      const legal=container.querySelector('input[name="legalName"],input[name="sellerLegalName"]');
      if(legal&&profile?.name&&(legal.value==="Demo Buyer"||legal.value==="Demo Seller"||!legal.value))legal.value=profile.name;
      const funding=container.querySelector('select[name="funding"]');
      if(funding&&method){
        const lower=method.toLowerCase();
        funding.value=lower.includes("cash")?"Cash purchase":lower.includes("financ")?"Financing":"Other / to be confirmed";
      }
      const market=container.querySelector('input[name="market"]');
      const parsedMarket=cityStateFromLabel();
      if(market&&parsedMarket&&(market.value==="Dallas, Texas"||!market.value))market.value=parsedMarket;
      ensureProviderDropdown();
    });
  }

  function wireProviderSelection(){
    const form=$("service-request-form");
    if(!form||form.dataset.v5ProviderWired==="1")return;
    form.dataset.v5ProviderWired="1";
    form.addEventListener("submit",()=>{
      const selected=form.querySelector('select[name="providerPreference"]')?.value||"";
      const clientName=form.querySelector('input[name="clientAccountName"]')?.value||"";
      const clientEmail=form.querySelector('input[name="clientEmail"]')?.value||"";
      const clientPhone=form.querySelector('input[name="clientPhone"]')?.value||"";
      setTimeout(()=>{
        const state=loadState(),request=state?.requests?.[serviceKey];
        if(!request)return;
        request.data=request.data||{};
        request.data.providerPreference=selected;
        request.data.clientAccountName=clientName||request.data.clientAccountName||"";
        request.data.clientEmail=clientEmail||request.data.clientEmail||"";
        request.data.clientPhone=clientPhone||request.data.clientPhone||"";
        request.provider=selected&&selected!=="Match me with a participating provider"?selected:"";
        saveState(state);
        schedule();
      },0);
    },true);
  }

  function actualProviderRows(state,specialty){
    return Object.entries(state?.requests||{}).filter(([key,request])=>request&&(specialty==="all"||specialty===key)).map(([key,request])=>{
      const label=serviceLabels[key]?.title||key;
      const complete=request.status==="complete";
      const action=complete
        ? {on:false,stateLabel:"Complete",title:"Complete",copy:"This request is complete."}
        : (providerActionForRequest(key,request)||{on:false,stateLabel:"Waiting",title:"Waiting",copy:"No provider action is required right now."});
      return {
        id:`actual-${key}`,service:key,property:contextLabel,client:request.data?.clientAccountName||(request.ownerRole==="seller"?"Demo Seller":"Demo Buyer"),
        provider:request.provider||"Awaiting provider match",actionNeeded:!!action.on,stateLabel:action.stateLabel||(action.on?"Action needed":"Waiting"),complete,
        status:action.title,summary:action.copy,
        meta:[request.data?.providerPreference||"Provider preference not specified",request.attachments?.length?`${request.attachments.length} supporting file(s)`:"Connected records only",request.status.replace(/-/g," ")],
        href:serviceHref(key,"provider"),actual:true,label
      };
    });
  }

  function renderProviderQueue(){
    if(!document.body.classList.contains("coordination-page")||role()!=="provider")return;
    const queue=$("provider-queue"),specialty=$("provider-specialty")?.value||"all";
    if(!queue)return;
    const state=loadState();
    const actual=actualProviderRows(state,specialty);
    const examples=demoJobsForCurrentProperty().filter(job=>specialty==="all"||specialty===job.service).map(job=>({
      ...job,
      stateLabel:job.complete?"Complete":job.actionNeeded?"Action needed":"Waiting",
      complete:!!job.complete,
      label:serviceLabels[job.service]?.title||job.service,
      href:providerJobHref(job)
    }));
    const rows=[...actual,...examples];
    const activeRows=rows.filter(row=>!row.complete).sort((a,b)=>Number(!!b.actionNeeded)-Number(!!a.actionNeeded)||String(a.property).localeCompare(String(b.property)));
    const completedRows=rows.filter(row=>row.complete).sort((a,b)=>String(a.property).localeCompare(String(b.property)));
    const key=JSON.stringify(rows.map(row=>[row.id,row.stateLabel,row.status,row.provider,row.meta]));
    if(queue.dataset.v5Key===key&&(queue.querySelector("[data-v5-provider-row]")||document.querySelector("#provider-completed-queue-v6 [data-v5-provider-row]")))return;
    queue.dataset.v5Key=key;

    const rowHtml=(row,completed=false)=>`
      <article class="provider-job provider-job-v5${completed?" provider-job-complete":""}" data-v5-provider-row data-provider-source="${row.actual?"live":"demo"}" data-provider-state="${completed?"complete":row.actionNeeded?"action":"waiting"}">
        <div class="provider-job-signal${completed?" is-complete":""}"><strong>${esc(row.stateLabel||(row.actionNeeded?"Action needed":"Waiting"))}</strong></div>
        <div class="provider-job-main">
          <div class="provider-job-topline"><span class="coordination-number">${esc(serviceLabels[row.service]?.eyebrow||row.label)}</span><span>${esc(row.provider)}</span></div>
          <h3>${esc(row.property)}</h3>
          <p><strong>${esc(row.status)}</strong> · ${esc(row.summary)}</p>
          <div class="provider-job-meta">${(row.meta||[]).map(item=>`<span>${esc(item)}</span>`).join("")}</div>
        </div>
        <div class="provider-job-action"><a class="${completed?"secondary-button":"primary-button button-blue"}" href="${row.href}">${completed?"View completed request →":row.actual?"Open request →":"Open provider job →"}</a></div>
      </article>`;

    queue.innerHTML=activeRows.length
      ? activeRows.map(row=>rowHtml(row,false)).join("")
      : '<div class="provider-empty-queue"><strong>No active provider work</strong><p>There are no requests currently requiring provider action or waiting on another party.</p></div>';

    let completedSection=$("provider-completed-section-v6");
    if(!completedSection){
      completedSection=document.createElement("section");
      completedSection.id="provider-completed-section-v6";
      completedSection.className="provider-queue-section provider-completed-section";
      completedSection.innerHTML='<p class="section-label">Completed</p><h2>Completed requests</h2><div class="provider-queue" id="provider-completed-queue-v6"></div>';
      queue.closest(".provider-queue-section")?.insertAdjacentElement("afterend",completedSection);
    }
    const completedQueue=$("provider-completed-queue-v6");
    if(completedRows.length){
      completedSection.hidden=false;
      completedQueue.innerHTML=completedRows.map(row=>rowHtml(row,true)).join("");
    }else{
      completedSection.hidden=true;
      completedQueue.innerHTML="";
    }

    const heading=$("provider-queue-title");
    setTextIfChanged(heading,"Provider work queue");
    const intro=$("provider-inbox-heading")?.nextElementSibling;
    setTextIfChanged(intro,isDirectProviderInbox()
      ?"Action-needed work is shown first, followed by requests waiting on a buyer, seller, or owner. Open any job to work that exact property and switch perspectives inside the job."
      :`Live requests and fictional demonstration work shown here are scoped to ${contextLabel}, so every provider item stays attached to the shared property record above.`);
  }

  function customizeDirectProviderInbox(){
    if(!document.body.classList.contains("coordination-page"))return;
    const direct=isDirectProviderInbox();
    const hero=document.querySelector(".coordination-workspace-hero");
    const label=hero?.querySelector(":scope > div > .section-label");
    const heading=hero?.querySelector(":scope > div > h1");
    const copy=hero?.querySelector(":scope > div > p:not(.section-label)");
    const viewbar=hero?.querySelector(".workspace-viewbar");
    const card=hero?.querySelector(".record-card");
    const networkVisual=$("coord-network-visual");
    const propertyRecord=$("coord-property-record-content");
    if(direct){
      setTextIfChanged(label,"MREO · Service Partner Network");
      if(heading&&heading.innerHTML!=="One inbox.<br>Every property handoff.")heading.innerHTML="One inbox.<br>Every property handoff.";
      setTextIfChanged(copy,"Review incoming title, contractor, brokerage, rental, and management work across connected property records. Open a job to work it, then switch Buyer / Seller / Service Partner perspectives inside that exact job.");
      if(viewbar)viewbar.hidden=true;
      if(networkVisual)networkVisual.hidden=false;
      if(propertyRecord)propertyRecord.hidden=true;
      const networkJobs=demoJobsForCurrentProperty();
      const activeJobs=networkJobs.filter(job=>!job.complete);
      setTextIfChanged($("coord-network-active"),String(activeJobs.length));
      setTextIfChanged($("coord-network-action"),String(activeJobs.filter(job=>job.actionNeeded).length));

      setTextIfChanged($("role-workspace-eyebrow"),"Service Partner workspace");
      setTextIfChanged($("role-workspace-title"),"Work that needs your company, in one queue.");
      setTextIfChanged($("role-workspace-copy"),"Start with the action-needed item above, then move through the queue below. Waiting items remain visible so the provider can see what is blocked and which party owns the next step.");
      if(card)card.setAttribute("aria-label","Connected property network");
    }else{
      if(viewbar)viewbar.hidden=false;
      if(networkVisual)networkVisual.hidden=true;
      if(propertyRecord)propertyRecord.hidden=false;
      if(card)card.setAttribute("aria-label","Selected property record");
    }
  }

  function hideDeprecatedAreas(){
    const workspaceStats=document.querySelector(".workspace-stats"); if(workspaceStats&&!workspaceStats.hidden)workspaceStats.hidden=true;
    const providerSummary=document.querySelector(".provider-summary-grid"); if(providerSummary&&!providerSummary.hidden)providerSummary.hidden=true;
    const action=$("client-action-center")?.closest("article"); if(action)action.hidden=true;
    const timeline=$("coordination-timeline")?.closest("article"); if(timeline)timeline.hidden=true;
    const clientLower=action?.closest(".lower-workspace-grid"); if(clientLower&&[...clientLower.children].every(child=>child.hidden))clientLower.hidden=true;
    const providerTimeline=$("provider-timeline")?.closest("article"); if(providerTimeline)providerTimeline.hidden=true;
    const serviceTimeline=$("service-timeline")?.closest("article"); if(serviceTimeline)serviceTimeline.hidden=true;
  }

  function apply(){
    if(applying)return;
    applying=true;
    try{
      renameVisibleServices();
      ensureWhatComesNext();
      hideDeprecatedAreas();
      ensureHubAttention();
      ensureServiceAttention();
      ensureProviderDropdown();
      prefillKnownInformation();
      wireProviderSelection();
      renderProviderQueue();
      customizeDirectProviderInbox();
      hydratePrimaryPropertyImage();
    }finally{applying=false;}
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;apply();});
  }

  schedule();
  new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["hidden","aria-pressed"]});
  document.addEventListener("change",event=>{if(event.target?.id==="provider-specialty")setTimeout(schedule,0);});
  document.addEventListener("click",event=>{if(event.target.closest("[data-role]"))setTimeout(schedule,0);});
  setInterval(schedule,3500);
})();