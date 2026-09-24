(() => {
  "use strict";

  const params=new URLSearchParams(location.search);
  const id=params.get("job")||"";
  const returnTarget=params.get("return")||"coordination.html";
  const jobs=globalThis.MREO_PROVIDER_DEMO_JOBS||[];
  const job=jobs.find(item=>item.id===id);
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const storeKey="mreo:coordination:provider-demo:v2";
  const labels={title:"01 · TITLE / SETTLEMENT",contractors:"02 · CONTRACTORS",realtors:"03 · REALTORS",rentals:"04 · RENT / MANAGE"};
  const roleNames={buyer:"Buyer",seller:"Seller",provider:"Service Partner"};
  let role=["buyer","seller","provider"].includes(params.get("role"))?params.get("role"):"provider";
  let reviewMode="provider";

  function read(){try{return JSON.parse(localStorage.getItem(storeKey)||"{}");}catch{return {};}}
  function write(value){localStorage.setItem(storeKey,JSON.stringify(value));}

  function current(){
    if(!job)return null;
    const saved=read()[job.id]||{};
    const merged={...job,...saved};
    if(!merged.phase){
      merged.phase=merged.complete?"complete":merged.actionNeeded?"initial":merged.waitingOnRole?"client":"waiting";
    }
    return merged;
  }

  function setSaved(data){
    const store=read();
    store[job.id]={...(store[job.id]||{}),...data};
    write(store);
  }

  function roleLabel(value){return roleNames[value]||"Client";}
  function workspaceHref(nextRole){
    try{
      const url=new URL(returnTarget,location.href);
      if(url.origin!==location.origin||!url.pathname.endsWith("/coordination.html"))throw Error();
      url.searchParams.set("role",nextRole);
      url.hash=nextRole==="provider"?"provider-queue-title":"";
      return url.href;
    }catch{
      return nextRole==="provider"?"coordination.html?role=provider#provider-queue-title":`coordination.html?role=${nextRole}`;
    }
  }

  function attentionFor(data){
    if(data.complete||data.phase==="complete"){
      return {on:false,state:"Complete",title:"Complete",copy:data.summary||"This demonstration work item is complete."};
    }

    if(role==="provider"){
      return data.actionNeeded
        ? {on:true,state:"Action needed",title:data.status,copy:data.summary}
        : {on:false,state:"Waiting",title:data.status,copy:data.summary};
    }

    const waitingOn=data.waitingOnRole||"";
    if(!data.actionNeeded&&waitingOn===role){
      return {
        on:true,
        state:"Action needed",
        title:data.clientButton||"Client action required",
        copy:data.clientTask||data.summary
      };
    }

    if(data.actionNeeded){
      return {
        on:false,
        state:"Waiting",
        title:`Waiting for ${data.provider.replace(/ · demonstration$/,"")}.`,
        copy:"The participating provider is responsible for the current review step."
      };
    }

    if(waitingOn){
      return {
        on:false,
        state:"Waiting",
        title:`Waiting for ${roleLabel(waitingOn).toLowerCase()} action.`,
        copy:`The current request is waiting for the ${roleLabel(waitingOn).toLowerCase()} to complete the next step.`
      };
    }

    return {on:false,state:"Waiting",title:data.status,copy:data.summary};
  }

  function setAttention(data){
    const card=$("provider-job-attention");
    const state=attentionFor(data);
    const complete=state.state==="Complete";
    card.classList.toggle("is-on",!!state.on&&!complete);
    card.classList.toggle("is-off",!state.on&&!complete);
    card.classList.toggle("is-complete",complete);
    card.querySelector(".attention-state").textContent=state.state;
    card.querySelector(".attention-title").textContent=state.title;
    card.querySelector(".attention-copy").textContent=state.copy;

    const link=$("provider-job-attention-link");
    if(complete){
      link.hidden=true;
      link.removeAttribute("href");
      link.textContent="";
      link.onclick=null;
    }else if(state.on){
      link.hidden=false;
      link.href="#";
      link.textContent=role==="provider"?"Review request →":"Review / respond →";
      link.onclick=(event)=>{event.preventDefault();openReview(data,role==="provider"?"provider":"client");};
    }else{
      link.hidden=false;
      link.href="#provider-job-request";
      link.textContent="View request details ↓";
      link.onclick=null;
    }
    return state;
  }

  function setRole(nextRole){
    role=nextRole;
    const next=new URL(location.href);
    next.searchParams.set("role",role);
    history.replaceState(null,"",next);
    render();
  }

  function updateRoleButtons(){
    document.querySelectorAll("[data-provider-job-role]").forEach(button=>{
      button.setAttribute("aria-pressed",button.dataset.providerJobRole===role?"true":"false");
    });
  }

  function genericProviderChecklist(){
    return [
      "Review the connected request details",
      "Confirm the property and client information is internally consistent",
      "Check that required timing, scope, or closing information is present",
      "Identify any missing information before completing this provider step"
    ];
  }

  function genericClientChecklist(){
    return [
      "Review the provider request or returned information",
      "Confirm the connected property and transaction details",
      "Complete the requested approval, confirmation, or information item"
    ];
  }

  function openReview(data,mode){
    reviewMode=mode;
    const dialog=$("provider-review-dialog");
    const providerMode=mode==="provider";
    $("provider-review-eyebrow").textContent=providerMode?"Provider review":"Client review";
    $("provider-review-title").textContent=providerMode?(data.reviewTitle||data.status):(data.clientButton||"Review requested item");
    $("provider-review-intro").textContent=providerMode?(data.reviewIntro||data.task||data.summary):(data.clientTask||data.summary);
    $("provider-review-fields").innerHTML=(data.details||[]).map(([label,value])=>`<div class="provider-review-field"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");

    const checklist=providerMode?(data.reviewChecklist||genericProviderChecklist()):(data.clientChecklist||genericClientChecklist());
    $("provider-review-checklist").innerHTML=checklist.map(item=>`<li>${esc(item)}</li>`).join("");

    const confirmation=$("provider-review-confirmation");
    confirmation.checked=false;
    const confirm=$("provider-review-confirm");
    confirm.disabled=true;
    confirm.textContent=providerMode?(data.button||"Confirm review complete"):(data.clientButton||"Confirm client step");
    dialog.showModal();
  }

  function finishProviderReview(data){
    if(data.phase==="followup"){
      setSaved({
        phase:"complete",
        complete:true,
        actionNeeded:false,
        waitingOnRole:"",
        status:"Complete",
        summary:data.completionSummary||"The final provider follow-up is complete. This demonstration work item is complete.",
        task:"No further action is required.",
        button:"",
        after:"",
        afterWaitingOnRole:""
      });
      return;
    }

    setSaved({
      phase:"client",
      complete:false,
      actionNeeded:false,
      status:data.after||"Waiting for client",
      summary:data.after||"The provider completed its current step and is waiting for the next party.",
      waitingOnRole:data.afterWaitingOnRole ?? data.ownerRole ?? "",
      task:data.clientTask||data.task,
      button:data.clientButton||"",
      reviewTitle:data.providerFollowUpTitle||data.reviewTitle,
      reviewIntro:data.providerFollowUpTask||data.reviewIntro
    });
  }

  function finishClientReview(data){
    setSaved({
      phase:"followup",
      complete:false,
      actionNeeded:true,
      waitingOnRole:"",
      status:data.providerFollowUpTitle||`${roleLabel(role)} information received`,
      summary:data.clientAfter||`${roleLabel(role)} completed the requested step. Provider follow-up is required.`,
      task:data.providerFollowUpTask||"Review the newly received client information and continue the provider workflow.",
      button:data.providerFollowUpButton||"Mark follow-up review complete",
      after:"",
      afterWaitingOnRole:"",
      reviewTitle:data.providerFollowUpTitle||"Review client follow-up",
      reviewIntro:data.clientAfter||"The client completed the requested item. Review the update before continuing."
    });
  }

  function renderActions(data,state){
    const actions=$("provider-job-actions");
    actions.innerHTML="";

    if(state.state!=="Complete"&&state.on){
      const button=document.createElement("button");
      button.type="button";
      button.className="primary-button button-blue";
      button.textContent=role==="provider"?"Review request packet":"Review / respond";
      button.addEventListener("click",()=>openReview(data,role==="provider"?"provider":"client"));
      actions.appendChild(button);
    }

    const back=document.createElement("a");
    back.className="secondary-button";
    back.href=workspaceHref(role);
    back.textContent=role==="provider"?"Back to work queue":`Back to ${roleLabel(role)} workspace`;
    actions.appendChild(back);
  }

  function render(){
    const data=current();
    if(!data){
      document.querySelector("main").innerHTML='<a class="back-link" href="coordination.html?role=provider">← Provider work queue</a><section class="workspace-panel"><p class="section-label">Provider work item</p><h1>Request not found</h1><p>Choose a fictional provider job from the Service Partner work queue.</p></section>';
      return;
    }

    updateRoleButtons();
    const topBack=document.querySelector("main > .back-link");
    if(topBack)topBack.href=workspaceHref(role);
    document.title=`${data.property} | ${roleLabel(role)} | MREO Coordination`;
    $("provider-job-service").textContent=labels[data.service]||"Service Partner";
    $("provider-job-property").textContent=data.property;
    $("provider-job-summary").textContent=data.summary;
    $("provider-job-company").textContent=data.provider;

    const logo=$("provider-job-logo");
    const branded=!!globalThis.MREO_PROVIDER_BRANDING?.apply(logo,data.provider);
    const logoStage=logo?.closest(".provider-logo-stage");
    if(logoStage)logoStage.hidden=!branded;

    $("provider-job-client").textContent=data.client;
    $("provider-job-status").textContent=data.status;
    $("provider-job-fields").innerHTML=(data.details||[]).map(([label,value])=>`<div class="provider-job-field"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");

    const state=setAttention(data);
    if(state.state==="Complete"){
      $("provider-job-task-title").textContent="Complete";
    }else if(role==="provider"){
      $("provider-job-task-title").textContent=state.on?"Provider action":"Provider waiting";
    }else{
      $("provider-job-task-title").textContent=state.on?`${roleLabel(role)} action`:`${roleLabel(role)} waiting`;
    }
    $("provider-job-task").textContent=state.copy;
    renderActions(data,state);
  }

  document.querySelectorAll("[data-provider-job-role]").forEach(button=>{
    button.addEventListener("click",()=>setRole(button.dataset.providerJobRole));
  });

  $("provider-review-confirmation")?.addEventListener("change",event=>{
    $("provider-review-confirm").disabled=!event.currentTarget.checked;
  });
  $("provider-review-cancel")?.addEventListener("click",()=>$("provider-review-dialog").close());
  $("provider-review-confirm")?.addEventListener("click",()=>{
    const data=current();
    if(!data)return;
    if(reviewMode==="provider")finishProviderReview(data);
    else finishClientReview(data);
    $("provider-review-dialog").close();
    render();
  });

  render();
})();