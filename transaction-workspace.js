(() => {
  "use strict";
  const params=new URLSearchParams(location.search),transactionId=params.get("transaction");
  if(!transactionId)return;
  const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sections=["auction","messages","coordination","files"];
  let selected=sections.includes(params.get("section"))?params.get("section"):"messages",transaction,thread,vault,socket,refreshing=false,stopped=false;
  const main=document.querySelector("main");
  for(const child of [...main.children])child.hidden=true;
  const root=document.createElement("section");root.id="connected-transaction-shell";root.className="transaction-app";main.prepend(root);
  root.innerHTML='<div id="transaction-loading" class="setup-card">Opening secure property workspace…</div>';
  const base="/api/v1/transactions/"+encodeURIComponent(transactionId);
  const outcomeLabel=value=>({watching:"No bid submitted",submitted:"Bid submitted",won:"Winning bid",lost:"Bid did not win","reserve-not-met":"Reserve not met","not-participating":"No bid submitted"}[value]||"No bid activity");
  function updateAuctionSummary(result,role){
    const state=$("auction-summary-state"),activity=$("auction-summary-activity"),timing=$("auction-summary-timing"),note=$("auction-summary-note");
    if(!state||!activity||!timing)return;
    const auction=result?.auction;
    if(!auction){
      state.textContent="Not started";activity.textContent="No bid activity";timing.textContent="Open Auction to continue";
      if(result?.error&&note)note.textContent="The live auction summary is temporarily unavailable. Open the Auction page to try again.";
      return;
    }
    state.textContent=auction.status==="active"?"Open":"Closed";
    activity.textContent=role==="seller"?String(auction.bidCount||0)+" bid"+(Number(auction.bidCount)===1?"":"s")+" received":role==="buyer"?outcomeLabel(auction.viewerOutcome):String(auction.bidCount||0)+" private bid"+(Number(auction.bidCount)===1?"":"s");
    timing.textContent=auction.status==="active"&&auction.endsAt?"Closes "+new Date(auction.endsAt).toLocaleString():outcomeLabel(auction.viewerOutcome);
    if(note)note.textContent="This summary refreshes from the linked auction. Open Auction to bid, review timing, or see the permitted result details.";
  }
  function render(){
    const role=transaction.viewerRole,staff=role==="agent",source=MreoCaseNavigation.auctionId(transaction),auctionUrl=MreoCaseNavigation.auctionUrl(transaction),coordinationUrl=MreoCaseNavigation.coordinationUrl(transaction);
    const amount=Number(transaction.amount_cents)>0?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(transaction.amount_cents)/100):"Not recorded";
    root.innerHTML='<a class="back-link" href="my-properties.html">← My properties</a><header class="transaction-head transaction-head-compact"><div><p class="section-label">Connected property workspace · '+esc(role)+'</p><h1>'+esc(transaction.title)+'</h1><p>'+esc(transaction.kind)+' · '+esc(transaction.status)+'</p></div><span class="status-chip">'+esc(transaction.status)+'</span></header><div id="workspace-tabs">'+MreoCaseNavigation.links(transaction,selected)+'</div>'+
      '<section id="view-auction" class="case-view-live" hidden><div class="case-layout"><section class="workspace-card workspace-summary-card"><p class="section-label">Auction summary</p><h2>'+(source?'Linked auction':'No auction linked yet')+'</h2><p class="workspace-card-subtitle" id="auction-summary-note">'+(source?'Loading the current auction status…':'No auction has been linked to this property workspace yet.')+'</p><div class="workspace-summary-grid"><div><span>Auction status</span><strong id="auction-summary-state">'+(source?'Loading…':'Not started')+'</strong></div><div><span>'+(role==="seller"?'Bid activity':'Your activity')+'</span><strong id="auction-summary-activity">'+(source?'Loading…':'No bid activity')+'</strong></div><div><span>Timing / result</span><strong id="auction-summary-timing">'+(source?'Loading…':'Open Auction to continue')+'</strong></div></div><a class="primary-button button-blue" href="'+esc(auctionUrl)+'">Open full Auction page →</a></section><aside class="case-guide"><section class="workspace-card"><h2>Property record</h2><p>'+esc(transaction.status)+' · '+esc(amount)+'</p><p>Use Auction for bids and outcomes. Messages, documents, signatures, and service work stay in their own sections.</p></section></aside></div></section>'+
      '<section id="view-messages" class="case-view-live"><div class="case-layout"><section class="workspace-card conversation-card"><div class="conversation-heading"><div><p class="section-label">Conversation and shared documents</p><h2>Messages with MREO</h2></div><span class="private-chip">Private</span></div><p class="workspace-card-subtitle">'+(staff?"Choose a participant conversation. Documents follow their sharing permissions; other private threads stay separate.":"Your conversation with authorized MREO personnel. Other participant roles cannot read this thread.")+'</p><div id="transaction-thread"></div><div id="document-vault"></div></section><aside class="case-guide"><section class="workspace-card"><h2>Keep it together</h2><p>Ask a question or attach a document. PDFs and signature updates stay in chronological context here.</p><p>Use Coordination to track work and Files to find a document.</p></section><section id="workspace-attention" class="attention-board"></section></aside></div></section>'+
      '<section id="view-coordination" class="case-view-live" hidden><div class="case-layout"><section class="workspace-card workspace-summary-card"><p class="section-label">Coordination summary</p><h2>Services and next steps</h2><p class="workspace-card-subtitle">See the status of connected work here. Open the full Coordinate page to explore Title / Settlement, Contractors, Realtors, and Rent / Manage without mixing those workflows into Messages.</p><div class="workspace-summary-grid"><div><span>Open actions</span><strong id="coordination-action-count">0</strong></div><div><span>Service requests</span><strong id="coordination-service-count">0</strong></div><div><span>Workspace status</span><strong>'+esc(transaction.status)+'</strong></div></div><div id="service-list" class="task-list compact-service-list"></div><a class="primary-button button-blue" href="'+esc(coordinationUrl)+'">Open full Coordinate page →</a></section><aside class="case-guide"><section class="workspace-card"><h2>Your next actions</h2><div id="coordination-tasks"></div></section></aside></div></section>'+
      '<section id="view-files" class="case-view-live" hidden><section class="workspace-card"><p class="section-label">Your permitted documents</p><h2>Files</h2><p class="workspace-card-subtitle">An index of the same files shared in Messages—not separate copies. Existing shared documents retain their access settings.</p><div id="file-index" class="document-list"></div></section></section>'+
      '<details class="case-records"><summary>Activity and access</summary><p>Messages, files, tasks, and service requests are linked to this transaction. Connected data is saved on the server; the guided demonstration has separate browser-only records.</p><div id="event-list" class="event-list"></div>'+(staff?'<h3>Participants and access</h3><div id="participant-list" class="task-list"></div><form id="participant-form" class="upload-form participant-form"><label>Email<input name="email" type="email" required></label><label>Role<select name="role"><option>buyer</option><option>seller</option><option>provider</option><option>agent</option></select></label><button class="small-button" type="submit">Add existing MREO account</button></form>':"")+'</details>';
    thread=new TransactionThread($("transaction-thread"),transaction.id,role);
    const signingNotice=document.createElement("p");signingNotice.id="workspace-signing-notice";signingNotice.setAttribute("role","status");signingNotice.hidden=true;$("workspace-tabs").after(signingNotice);
    vault=new DocumentVault($("document-vault"),transaction,thread);
    vault.onUpdated=documents=>{
      $("file-index").innerHTML=documents.length?documents.map(document=>thread.documentCard(document)).join(""):'<div class="empty-card"><p>No documents yet. Add a file from Messages.</p></div>';
    };
    $("file-index").onclick=event=>vault.click(event);
    if(staff)$("participant-form").onsubmit=async event=>{
      event.preventDefault();const form=event.currentTarget;
      try{await MreoIdentity.request(base+"/participants",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(form)))});transaction=await MreoIdentity.request(base);vault.transaction=transaction;form.reset();await refresh();}
      catch(error){alert(error.message);}
    };
    root.addEventListener("click",event=>{
      const link=event.target.closest("#workspace-tabs a");if(!link)return;
      event.preventDefault();selected=new URL(link.href).searchParams.get("section");showSection();
    });
    showSection();refresh();connectLive();
  }
  function showSection(){
    sections.forEach(section=>$("view-"+section).hidden=section!==selected);
    $("workspace-tabs").innerHTML=MreoCaseNavigation.links(transaction,selected);
    history.replaceState(null,"","coordination.html?transaction="+encodeURIComponent(transaction.id)+"&section="+selected);
  }
  async function refresh(){
    if(!thread||refreshing)return;refreshing=true;
    try{
      const source=MreoCaseNavigation.auctionId(transaction),role=transaction.viewerRole;
      const auctionRequest=source&&globalThis.MreoService?.auctionSummary?MreoService.auctionSummary(source,["buyer","seller"].includes(role)?role:"buyer").catch(error=>({error:error.message})):Promise.resolve(null);
      const [{tasks},{events},{services},,,auctionSummary]=await Promise.all([MreoIdentity.request(base+"/tasks"),MreoIdentity.request(base+"/events"),MreoIdentity.request(base+"/services"),thread.refresh(),vault.refresh(),auctionRequest]);
      updateAuctionSummary(auctionSummary,role);
      const action=tasks.filter(task=>task.status==="action");
      const taskHTML=action.length?'<ul>'+action.map(task=>'<li><strong>'+esc(task.title)+'</strong> '+(task.type==="esign_signature"?'<a class="small-button" href="coordination.html?transaction='+encodeURIComponent(transaction.id)+'&section=files">View signing request</a>':'<button class="small-button" data-task="'+esc(task.id)+'">Mark complete</button>')+'</li>').join("")+'</ul>':'<p>No immediate action. Check back here for updates from MREO.</p>';
      $("workspace-attention").innerHTML='<p class="section-label">Next steps</p>'+taskHTML;
      $("coordination-tasks").innerHTML=taskHTML;
      $("coordination-action-count").textContent=String(action.length);
      $("coordination-service-count").textContent=String(services.length);
      root.querySelectorAll("[data-task]").forEach(button=>button.onclick=async()=>{
        button.disabled=true;try{await MreoIdentity.request(base+"/tasks/"+encodeURIComponent(button.dataset.task),{method:"PATCH",body:JSON.stringify({status:"complete"})});await refresh();}
        catch(error){alert(error.message);button.disabled=false;}
      });
      thread.events=events;thread.render();
      const docs=new Set((vault.documents||[]).map(doc=>doc.id));
      $("event-list").innerHTML=events.filter(event=>event.entity_type!=="document"||docs.has(event.entity_id)).map(event=>'<article class="event-item"><time>'+new Date(event.created_at).toLocaleString()+'</time><p>'+esc(event.summary)+'</p></article>').join("");
      if($("participant-list"))$("participant-list").innerHTML=transaction.participants.map(person=>'<div class="task-item"><strong>'+esc(person.display_name && !person.display_name.includes("@") ? person.display_name : "MREO participant")+'</strong><small>'+esc(person.role)+' · '+esc(person.status)+'</small></div>').join("");
      $("service-list").innerHTML=services.length?services.map(service=>'<article class="task-item"><strong>'+esc(service.service_type)+'</strong><small>'+esc(service.status)+'</small></article>').join(""):'<div class="empty-card"><h3>No connected service requests yet</h3><p>Ask your MREO representative in Messages to arrange the next step, or explore the separate illustrative walkthroughs below.</p></div>';
    }catch(error){$("workspace-attention").textContent=error.message;}
    finally{refreshing=false;}
  }
  async function connectLive(){
    if(stopped)return;
    try{const {ticket}=await MreoIdentity.request(base+"/live-ticket",{method:"POST",body:"{}"});if(stopped)return;
      socket=new WebSocket(MreoIdentity.liveUrl(base+"/live?ticket="+encodeURIComponent(ticket)));
      socket.onmessage=event=>{if(event.data!=="pong")refresh();};socket.onclose=()=>{if(!stopped)setTimeout(connectLive,5000);};
    }catch{if(!stopped)setTimeout(connectLive,15000);}
  }
  async function start(){
    if(!MreoIdentity.connected()){root.innerHTML='<div class="setup-card"><h3>Connected Mode is required</h3><a href="experience.html">Explore the separate demonstration</a></div>';return;}
    try{await MreoIdentity.init();if(!await MreoIdentity.currentUser()){root.innerHTML='<div class="setup-card"><h3>Sign in to open this transaction</h3><button class="primary-button" id="transaction-sign-in">Sign in or create account</button></div>';$("transaction-sign-in").onclick=()=>MreoIdentity.openSignIn();return;}
      transaction=await MreoIdentity.request(base);render();
    }catch(error){root.innerHTML='<div class="setup-card"><h3>Transaction unavailable</h3><p>'+esc(error.message)+'</p></div>';}
  }
  addEventListener("mreo:workspace-changed",refresh);
  addEventListener("pagehide",()=>{stopped=true;socket?.close();});
  start();
})();
