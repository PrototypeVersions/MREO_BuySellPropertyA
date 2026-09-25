import {ROLES,SERVICES,namespace,createScenario,loadScenario,saveScenario,act,conversation,visibleDocuments} from "./demo-store.js";
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const query=new URLSearchParams(location.search),prefix=namespace(location.pathname),views={auction:"Auction",messages:"Messages",coordination:"Coordination",files:"Files"};
let storage=null;try{storage=localStorage;}catch{}
let state=storage&&(!query.has("perspective")||query.has("run"))?loadScenario(storage,prefix,query.get("run")):null;
if(!state)state=createScenario(query.get("perspective")||"buyer");
let view=views[query.get("view")]?query.get("view"):views[state.lastView]?state.lastView:"auction",thread=state.perspective==="agent"?(["buyer","seller","provider"].includes(state.selectedThread)?state.selectedThread:"buyer"):state.perspective;
function href(section){return "demo-case.html?run="+encodeURIComponent(state.id)+"&view="+section;}
function save(){try{if(!storage)throw Error();saveScenario(storage,prefix,state);$("save-status").textContent="Demo saved in this browser";}catch{$("save-status").textContent="Storage unavailable · progress lasts only on this page";}}
function button(action,label,extra="",primary=false){return '<button type="button" class="small-button'+(primary?' primary':'')+'" data-action="'+action+'" '+extra+'>'+label+'</button>';}
function docCard(doc) {
  if(!doc)return "";
  const action=doc.status==="available"?button("requestSignature","Request sample signature",'data-document="'+esc(doc.id)+'"'):doc.status==="signature_pending"?button("review","Review &amp; simulate signing",'data-document="'+esc(doc.id)+'"',true):'<span class="attention-chip">Simulated signing complete</span>';
  return '<div class="case-file" data-file="'+esc(doc.id)+'"><small>SAMPLE PDF · version '+doc.version+'</small><strong>'+esc(doc.filename)+'</strong><small>'+esc(doc.status.replaceAll("_"," "))+' · Shared with '+esc(doc.sharedWith.map(role=>ROLES[role]).join(", "))+' and MREO</small><div class="document-actions">'+button("review","Preview PDF",'data-document="'+esc(doc.id)+'"')+button("download","Download sample",'data-document="'+esc(doc.id)+'"')+action+'</div></div>';
}
function auctionView() {
  const auction=state.auction,role=state.perspective;
  let content='<p class="section-label">Private offers / demonstration</p><h2>The auction</h2><p>Place a bid here. Keep questions and documents in Messages, and service work in Coordination.</p>';
  if(auction.status==="closed")content+='<div class="case-hint"><strong>Illustrative result: successful</strong><p>This controlled demonstration assumes a qualifying buyer and seller acceptance. Real auctions may produce a different result.</p></div><a class="primary-button button-blue" href="'+href("messages")+'">Continue to Messages →</a>';
  else if(!auction.participation)content+='<div class="case-hint">Test participation only. No card details, payment, or real listing will be created.</div>'+button("participate",role==="seller"?"Open sample listing":"Confirm test participation","",true);
  else {
    content+='<p><span class="status-chip">Open demonstration auction</span></p><p>Sample deadline: '+new Date(auction.deadline).toLocaleString()+'. Use the control below to advance the story; no real auction is affected.</p>';
    if(role==="buyer")content+='<form id="demo-bid" class="case-form"><label>Your private bid · USD<input name="amount" type="number" min="1" step="1" max="1000000000000" value="429000" required></label><button class="primary-button" type="submit">Place demonstration bid</button></form>';
    else content+='<p>'+esc(role==="seller"?"Your fictional property is listed. The demonstration supplies a qualifying buyer when you advance.":"Your role coordinates the transaction; you are not placing a buyer bid.")+'</p>';
    if(auction.bids.length)content+='<div class="case-hint">Your latest bid: $'+auction.bids.at(-1).amount.toLocaleString()+'. Other buyers’ offers remain private.</div>';
    if(role!=="buyer"||auction.bids.length)content+='<div class="case-actions">'+button("closeAuction","Advance to sample result")+'</div>';
  }
  return '<div class="case-panel">'+content+'</div>';
}
function messagesView() {
  const docs=visibleDocuments(state,thread),tabs=state.perspective==="agent"?'<div class="demo-thread-picker">'+["buyer","seller","provider"].map(role=>'<button class="small-button" data-thread="'+role+'" aria-pressed="'+(role===thread)+'">'+ROLES[role]+' ↔ MREO</button>').join("")+'</div>':"";
  const items=conversation(state,thread).map(item=>{
    const doc=docs.find(doc=>doc.id===item.documentId),service=state.serviceRequests.find(service=>service.id===item.serviceId);
    return '<article class="case-message '+(item.author===state.perspective?"mine":"")+'"><small>'+esc(item.author===state.perspective?"You · "+ROLES[item.author]:ROLES[item.author]+" · simulated")+' · '+new Date(item.at).toLocaleTimeString()+'</small><p>'+esc(item.body)+'</p>'+docCard(doc)+(service?'<a class="text-link" href="'+href("coordination")+'">'+esc(SERVICES[service.type])+' · '+esc(service.status)+' →</a>':"")+'</article>';
  }).join("");
  return '<section class="case-panel"><div class="conversation-heading"><div><p class="section-label">Conversation and shared documents</p><h2>Messages with MREO</h2></div><span class="private-chip">Demo thread</span></div><p>This '+esc(ROLES[thread].toLowerCase())+' conversation is separate from the other participant conversations. Replies are scripted examples, not a live representative.</p>'+tabs+'<div class="case-message-list" aria-live="polite">'+items+'</div><form id="demo-message" class="case-form"><label>Your message<textarea name="body" maxlength="8000" required placeholder="Ask about the property or the next step"></textarea></label><button class="primary-button button-blue" type="submit">Send demonstration message</button></form><div class="case-actions">'+button("sampleDocument","Add sample proof of funds",'data-kind="funds"')+button("sampleDocument","Add sample agreement",'data-kind="agreement"')+'</div><p class="upload-note">Use fictional sample PDFs here. Do not enter personal or confidential information.</p></section>';
}
function coordinationView() {
  const cards=state.serviceRequests.filter(service=>state.perspective==="agent"||service.ownerRole===state.perspective).map(service=>'<article class="case-service"><span class="status-chip">'+esc(service.status)+'</span><h3>'+esc(SERVICES[service.type])+'</h3><p>'+esc(service.notes||"Review the property packet and propose the next step.")+'</p><small>Fictional provider · '+(service.status==="proposed"?"Sample proposal ready":service.status==="scheduled"?"Approved and scheduled":"Report delivered")+'</small><div class="case-actions">'+(service.status!=="complete"?button("advanceService",service.status==="proposed"?"Approve sample proposal":"Simulate report delivery",'data-service-id="'+service.id+'"',true):'<a class="text-link" href="'+href("files")+'">View the sample report →</a>')+'</div></article>').join("");
  return '<div class="case-panel"><p class="section-label">Work, proposals, and next steps</p><h2>Coordination</h2><p>Use this area to request and track work. Messages can refer to a request, but its status is maintained here once.</p><form id="demo-service" class="case-form"><label>What does the property need?<select name="service">'+Object.entries(SERVICES).map(([id,label])=>'<option value="'+id+'">'+label+'</option>').join("")+'</select></label><label>Instructions for the fictional provider<textarea name="notes" maxlength="2000" placeholder="For example, review the title packet and flag outstanding items."></textarea></label><button class="primary-button button-blue" type="submit">Request sample service</button></form><div class="case-list">'+(cards||'<p>No work requested yet. Choose one service to see a complete illustrative workflow.</p>')+'</div></div>';
}
function filesView() {
  const docs=visibleDocuments(state);
  return '<div class="case-panel"><p class="section-label">One document record / multiple views</p><h2>Files</h2><p>These are the same document records shared in Messages—not duplicate uploads. Private participant files remain separate.</p><div class="case-list">'+(docs.length?docs.map(docCard).join(""):'<p>No sample files yet. Add a sample PDF in Messages or complete a service to receive a report.</p>')+'</div><a class="text-link" href="'+href("messages")+'">Return to Messages →</a></div>';
}
function guide() {
  const checks=[["Confirm test participation",state.auction.participation],["Review the auction result",state.auction.status==="closed"],["Exchange a message",state.events.some(e=>e.type==="message.sent")],["Simulate one document signing",state.signatureRequests.some(s=>s.status==="complete")],["Complete one service",state.serviceRequests.some(s=>s.status==="complete")]];
  const next=state.auction.status!=="closed"?"auction":!checks[3][1]?"messages":"coordination";
  $("case-guide").innerHTML='<section class="case-panel"><p class="section-label">Your illustrative journey</p><h2>'+ (state.transaction.status==="complete"?"Story complete":"A little guidance")+'</h2><ol>'+checks.map(([label,done])=>'<li class="'+(done?"done":"")+'">'+esc(label)+(done?" ✓":"")+'</li>').join("")+'</ol>'+(checks.every(item=>item[1])&&state.transaction.status!=="complete"?button("complete","Finish demonstration","",true):'<a class="text-link" href="'+href(next)+'">Next suggested area →</a>')+'</section><section class="case-panel"><h3>Separate, but connected</h3><p>Auction holds bids. Messages holds conversations. Coordination holds work. Files indexes the shared documents.</p><p><strong>Viewing as '+ROLES[state.perspective]+'.</strong> Your real account permissions do not change this demo role.</p></section>';
  const counts={Property:1,Auction:1,Case:1,Threads:state.threads.length,Messages:state.messages.length,Documents:state.documents.length,Signatures:state.signatureRequests.length,Services:state.serviceRequests.length};
  $("case-record-summary").innerHTML='<p>Run <code>'+esc(state.id)+'</code></p><div class="record-counts">'+Object.entries(counts).map(([name,count])=>'<span>'+name+': '+count+'</span>').join("")+'</div>';
  $("case-events").innerHTML=state.events.filter(event=>!event.threadRole||state.perspective==="agent"||event.threadRole===state.perspective).map(event=>'<li>'+new Date(event.at).toLocaleTimeString()+' · '+esc(event.summary)+'</li>').join("");
}
function render(persist=true) {
  if(persist){state.lastView=view;state.selectedThread=thread;save();}history.replaceState(null,"",href(view));
  $("case-title").textContent=state.property.title;
  $("case-perspective").textContent="Viewing as "+ROLES[state.perspective]+" · Fictional property story · "+state.transaction.status;
  $("case-tabs").innerHTML=Object.entries(views).map(([id,label])=>'<a href="'+href(id)+'" '+(view===id?'aria-current="page"':"")+'>'+label+'</a>').join("");
  $("case-view").innerHTML=({auction:auctionView,messages:messagesView,coordination:coordinationView,files:filesView})[view]();guide();
  const feed=document.querySelector(".case-message-list");if(feed)feed.scrollTop=feed.scrollHeight;
}
function perform(type,data={}){try{$("demo-error").hidden=true;act(state,type,{...data,thread});render();}catch(error){$("demo-error").textContent=error.message;$("demo-error").hidden=false;}}
function preview(id) {
  const doc=visibleDocuments(state).find(doc=>doc.id===id);if(!doc)return;
  $("review-title").textContent=doc.filename;
  $("review-actions").innerHTML=button("download","Download sample PDF",'data-document="'+id+'"')+(doc.status==="signature_pending"?button("sign","Simulate my signature",'data-document="'+id+'"',true):"");
  $("document-review").showModal();
}
// A generated sample PDF; contains no uploaded file, real contract, or signature.
function download(id) {
  const doc=visibleDocuments(state).find(doc=>doc.id===id);if(!doc)return;
  const content="BT /F1 18 Tf 50 740 Td (MREO - DEMONSTRATION COPY) Tj 0 -35 Td /F1 12 Tf (Sample property document. Not a legal agreement.) Tj 0 -24 Td (No real signature or payment has been collected.) Tj ET";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Length "+content.length+" >>\nstream\n"+content+"\nendstream"];
  let pdf="%PDF-1.4\n",offsets=[0];objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=(i+1)+" 0 obj\n"+object+"\nendobj\n";});
  const xref=pdf.length;pdf+="xref\n0 6\n0000000000 65535 f \n"+offsets.slice(1).map(offset=>String(offset).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  const url=URL.createObjectURL(new Blob([pdf],{type:"application/pdf"})),link=document.createElement("a");link.href=url;link.download=doc.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
document.addEventListener("click",event=>{
  const tab=event.target.closest("#case-tabs a");if(tab){event.preventDefault();view=new URL(tab.href).searchParams.get("view");render();return;}
  const choice=event.target.closest("[data-thread]");if(choice){thread=choice.dataset.thread;render();return;}
  const control=event.target.closest("[data-action]");if(!control)return;
  const type=control.dataset.action,id=control.dataset.document;
  if(type==="review"){preview(id);return;}if(type==="download"){download(id);return;}
  if(type==="sign")$("document-review").close();
  perform(type,{documentId:id,serviceId:control.dataset.serviceId,kind:control.dataset.kind});
});
document.addEventListener("submit",event=>{
  if(!["demo-message","demo-bid","demo-service"].includes(event.target.id))return;
  event.preventDefault();perform({"demo-message":"message","demo-bid":"bid","demo-service":"requestService"}[event.target.id],Object.fromEntries(new FormData(event.target)));
});
$("new-demo").onclick=()=>{state=createScenario(state.perspective);view="auction";thread=state.perspective==="agent"?"buyer":state.perspective;render();};
addEventListener("storage",event=>{if(event.key===prefix+"run:"+state.id){const updated=loadScenario(storage,prefix,state.id);if(updated){state=updated;render(false);}}});
render();
