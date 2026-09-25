(() => {
  "use strict";
  const params=new URLSearchParams(location.search),transactionId=params.get("transaction");
  if(!transactionId)return;
  const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sections=["messages","coordination","files"];
  let selected=sections.includes(params.get("section"))?params.get("section"):"messages",transaction,thread,vault,socket,refreshing=false,stopped=false;
  const main=document.querySelector("main");
  for(const child of [...main.children])child.hidden=true;
  const root=document.createElement("section");root.id="connected-transaction-shell";root.className="transaction-app";main.prepend(root);
  root.innerHTML='<div id="transaction-loading" class="setup-card">Opening secure property workspace…</div>';
  const base="/api/v1/transactions/"+encodeURIComponent(transactionId);
  function render(){
    const role=transaction.viewerRole,staff=role==="agent";
    root.innerHTML='<a class="back-link" href="'+(staff?"agent.html":"profile.html")+'">← '+(staff?"Agent Console":"My MREO")+'</a><header class="transaction-head transaction-head-compact"><div><p class="section-label">Connected property workspace · '+esc(role)+'</p><h1>'+esc(transaction.title)+'</h1><p>'+esc(transaction.kind)+' · '+esc(transaction.status)+'</p></div><span class="status-chip">'+esc(transaction.status)+'</span></header><div id="workspace-tabs">'+MreoCaseNavigation.links(transaction,selected)+'</div>'+
      '<section id="view-messages" class="case-view-live"><div class="case-layout"><section class="workspace-card conversation-card"><div class="conversation-heading"><div><p class="section-label">Conversation and shared documents</p><h2>Messages with MREO</h2></div><span class="private-chip">Private</span></div><p class="workspace-card-subtitle">'+(staff?"Choose a participant conversation. Documents follow their sharing permissions; other private threads stay separate.":"Your conversation with authorized MREO personnel. Other participant roles cannot read this thread.")+'</p><div id="transaction-thread"></div><div id="document-vault"></div></section><aside class="case-guide"><section class="workspace-card"><h2>Keep it together</h2><p>Ask a question or attach a document. PDFs and signature updates stay in chronological context here.</p><p>Use Coordination to track work and Files to find a document.</p></section><section id="workspace-attention" class="attention-board"></section></aside></div></section>'+
      '<section id="view-coordination" class="case-view-live" hidden><div class="case-layout"><section class="workspace-card"><p class="section-label">Work and next steps</p><h2>Coordination</h2><p class="workspace-card-subtitle">Track requests in this area. Messages and document sharing remain in their own tabs.</p><div id="service-list" class="task-list"></div><details class="workspace-details-card"><summary>Explore service pathways</summary><p>These detailed provider walkthroughs are illustrative. They do not dispatch a live provider or update this connected transaction.</p><div id="service-pathways" class="compact-pathways"></div></details></section><aside class="case-guide"><section class="workspace-card"><h2>Your next actions</h2><div id="coordination-tasks"></div></section></aside></div></section>'+
      '<section id="view-files" class="case-view-live" hidden><section class="workspace-card"><p class="section-label">Your permitted documents</p><h2>Files</h2><p class="workspace-card-subtitle">An index of the same files shared in Messages—not separate copies. Existing shared documents retain their access settings.</p><div id="file-index" class="document-list"></div></section></section>'+
      '<details class="case-records"><summary>Activity and access</summary><p>Messages, files, tasks, and service requests are linked to this transaction. Connected data is saved on the server; the guided demonstration has separate browser-only records.</p><div id="event-list" class="event-list"></div>'+(staff?'<h3>Participants and access</h3><div id="participant-list" class="task-list"></div><form id="participant-form" class="upload-form participant-form"><label>Email<input name="email" type="email" required></label><label>Role<select name="role"><option>buyer</option><option>seller</option><option>provider</option><option>agent</option></select></label><button class="small-button" type="submit">Add existing MREO account</button></form>':"")+'</details>';
    thread=new TransactionThread($("transaction-thread"),transaction.id,role);
    vault=new DocumentVault($("document-vault"),transaction,thread);
    vault.onUpdated=documents=>{
      $("file-index").innerHTML=documents.length?documents.map(document=>thread.documentCard(document)).join(""):'<div class="empty-card"><p>No documents yet. Add a file from Messages.</p></div>';
    };
    $("file-index").onclick=event=>vault.click(event);
    $("service-pathways").innerHTML=[["title","Title / settlement"],["contractors","Repairs / improvements"],["realtors","Representation"],["rentals","Rent / manage"]].map(([service,label])=>'<a class="transaction-row" href="coordination-service.html?demo=1&service='+service+'"><h3>'+label+'</h3><span>→</span></a>').join("");
    if(staff)$("participant-form").onsubmit=async event=>{
      event.preventDefault();const form=event.currentTarget;
      try{await MreoIdentity.request(base+"/participants",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(form)))});transaction=await MreoIdentity.request(base);vault.transaction=transaction;form.reset();await refresh();}
      catch(error){alert(error.message);}
    };
    root.addEventListener("click",event=>{
      const link=event.target.closest("#workspace-tabs a");if(!link||link.textContent==="Auction")return;
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
      const [{tasks},{events},{services}]=await Promise.all([MreoIdentity.request(base+"/tasks"),MreoIdentity.request(base+"/events"),MreoIdentity.request(base+"/services"),thread.refresh(),vault.refresh()]);
      const action=tasks.filter(task=>task.status==="action");
      const taskHTML=action.length?'<ul>'+action.map(task=>'<li><strong>'+esc(task.title)+'</strong> <button class="small-button" data-task="'+esc(task.id)+'">Mark complete</button></li>').join("")+'</ul>':'<p>No immediate action. Check back here for updates from MREO.</p>';
      $("workspace-attention").innerHTML='<p class="section-label">Next steps</p>'+taskHTML;
      $("coordination-tasks").innerHTML=taskHTML;
      root.querySelectorAll("[data-task]").forEach(button=>button.onclick=async()=>{
        button.disabled=true;try{await MreoIdentity.request(base+"/tasks/"+encodeURIComponent(button.dataset.task),{method:"PATCH",body:JSON.stringify({status:"complete"})});await refresh();}
        catch(error){alert(error.message);button.disabled=false;}
      });
      thread.events=events;thread.render();
      const docs=new Set((vault.documents||[]).map(doc=>doc.id));
      $("event-list").innerHTML=events.filter(event=>event.entity_type!=="document"||docs.has(event.entity_id)).map(event=>'<article class="event-item"><time>'+new Date(event.created_at).toLocaleString()+'</time><p>'+esc(event.summary)+'</p></article>').join("");
      if($("participant-list"))$("participant-list").innerHTML=transaction.participants.map(person=>'<div class="task-item"><strong>'+esc(person.display_name||person.email||"Participant")+'</strong><small>'+esc(person.role)+' · '+esc(person.status)+'</small></div>').join("");
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
