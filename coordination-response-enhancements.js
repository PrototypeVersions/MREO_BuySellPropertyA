(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const serviceKey = params.get("service") || "";
  const contextLabel = params.get("address") || params.get("title") || "MREO property record";
  const contextKey = params.get("auction") || contextLabel.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "unselected";
  const stateKey = `mreo:coordination:v3:${contextKey}`;
  const serviceNames = {title:"Title / Settlement",contractors:"Construction / Improvement",realtors:"Brokerage / Representation",rentals:"Rental / Property Management"};

  function state(){ try{return JSON.parse(localStorage.getItem(stateKey)||"null");}catch{return null;} }
  function role(){ const value=new URLSearchParams(location.search).get("role")||localStorage.getItem("mreo:coordination:role")||"buyer"; return ["buyer","seller","provider"].includes(value)?value:"buyer"; }
  function responseHref(nextRole=role(),key=serviceKey){ const out=new URLSearchParams(location.search); out.set("service",key); out.set("role",nextRole); return `coordination-response.html?${out.toString()}`; }
  function setText(element,value){ if(element && element.textContent !== value) element.textContent = value; }

  function enhanceServicePage(){
    if(!document.body.classList.contains("coordination-service-page")||!serviceKey)return;
    const data=state(); const request=data?.requests?.[serviceKey]; if(!request)return;
    const currentRole=role(); const label=serviceNames[serviceKey]||"Provider";
    if(currentRole==="provider"){
      const buttons=document.getElementById("provider-action-buttons"); const guidance=document.getElementById("provider-action-guidance"); if(!buttons||!guidance)return;
      if(request.status==="matched"){
        const proposalButton=buttons.querySelector('[data-provider-action="proposal"]');
        if(proposalButton){ const link=document.createElement("a"); link.className="primary-button button-blue provider-response-link-v2"; link.href=responseHref("provider"); link.textContent=request.proposal||request.revisionRequest?"Revise provider response →":"Prepare provider response →"; proposalButton.replaceWith(link); }
        else if(!buttons.querySelector(".provider-response-link-v2")){ const link=document.createElement("a"); link.className="primary-button button-blue provider-response-link-v2"; link.href=responseHref("provider"); link.textContent=request.proposal||request.revisionRequest?"Revise provider response →":"Prepare provider response →"; buttons.prepend(link); }
        setText(guidance,request.revisionRequest?`The client requested changes: ${request.revisionRequest.note} Open the response to revise and resend it.`:"The request is accepted. Prepare the detailed provider response the client will review before approval.");
      }else if(request.proposal&&["proposal","approved","in-progress","complete"].includes(request.status)&&!buttons.querySelector(".provider-response-link-v2")){
        const link=document.createElement("a"); link.className="secondary-button provider-response-link-v2"; link.href=responseHref("provider"); link.textContent=request.status==="proposal"?"View sent response →":"View provider response →"; buttons.prepend(link);
      }
      return;
    }

    const actions=document.getElementById("client-request-actions"); const copy=document.getElementById("client-status-copy"); const title=document.getElementById("client-status-title"); if(!actions||!copy||!title)return;
    if(request.status==="proposal"&&request.proposal){
      setText(title,"Provider response received");
      setText(copy,`${request.provider||label} sent a detailed response. Review the full terms, scope, requirements, and notes before approving it or requesting changes.`);
      if(!actions.querySelector(".client-response-link-v2")||actions.children.length!==1)actions.innerHTML=`<a class="primary-button button-blue client-response-link-v2" href="${responseHref(currentRole)}">Review provider response →</a>`;
    }else if(request.status==="matched"&&request.revisionRequest){
      setText(title,"Changes requested"); setText(copy,`Your requested changes were sent to ${request.provider||label}. The provider is revising the response.`); if(actions.childNodes.length)actions.innerHTML="";
    }else if(request.proposal&&["approved","in-progress","complete"].includes(request.status)&&!actions.querySelector(".client-response-link-v2")){
      const link=document.createElement("a"); link.className="secondary-button client-response-link-v2"; link.href=responseHref(currentRole); link.textContent="View provider response →"; actions.prepend(link);
    }
  }

  function enhanceHub(){
    if(!document.body.classList.contains("coordination-page"))return;
    const data=state(); if(!data?.requests||role()==="provider")return;
    document.querySelectorAll("#client-action-center .action-card a").forEach(anchor=>{ let url; try{url=new URL(anchor.href,location.href);}catch{return;} const key=url.searchParams.get("service"); const request=data.requests[key]; if(request?.status==="proposal"&&request.proposal){const href=responseHref(role(),key);if(anchor.getAttribute("href")!==href)anchor.href=href;setText(anchor,"Review provider response →");} });
  }

  let scheduled=false;
  function apply(){ if(scheduled)return; scheduled=true; requestAnimationFrame(()=>{scheduled=false;enhanceServicePage();enhanceHub();}); }
  apply();
  new MutationObserver(apply).observe(document.body,{childList:true,subtree:true,characterData:true});
  document.addEventListener("click",event=>{if(event.target.closest("[data-role]"))setTimeout(apply,0);});
})();
