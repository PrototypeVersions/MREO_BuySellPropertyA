import {ROLES,SERVICES,namespace,createScenario,loadScenario,saveScenario,act,conversation,visibleDocuments} from "./demo-store.js?v=20260928-signing";
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
  const signature=state.signatureRequests.find(item=>item.documentId===doc.id);
  const action=doc.status==="available"?button("requestSignature","Request sample signature",'data-document="'+esc(doc.id)+'"'):doc.status==="signature_pending" || (signature && !signature.signatureName)?button("review","Review &amp; sign sample",'data-document="'+esc(doc.id)+'"',true):'<span class="attention-chip">Sample signature saved</span>';
  return '<article class="case-file document-item" data-file="'+esc(doc.id)+'"><small>SAMPLE PDF · version '+doc.version+'</small><strong>'+esc(doc.filename)+'</strong><span>'+esc(doc.kind==="agreement"?"Agreement":doc.kind==="funds"?"Proof of funds":doc.kind==="report"?"Service report":"Property document")+'</span><small>'+esc(doc.status.replaceAll("_"," "))+' · Shared with '+esc(doc.sharedWith.map(role=>ROLES[role]).join(", "))+' and MREO</small><div class="document-actions">'+button("review","Preview PDF",'data-document="'+esc(doc.id)+'"')+button("download","Download sample",'data-document="'+esc(doc.id)+'"')+action+'</div></article>';
}
function auctionView() {
  const auction=state.auction,role=state.perspective,own=auction.bids.length;
  const illustrativeOtherBids=auction.status==="open"?2:2,total=own+illustrativeOtherBids;
  const status=auction.status==="open"?"Open":"Closed";
  const activity=role==="buyer"?(own?own+" bid"+(own===1?"":"s")+" submitted":"No bids submitted"):role==="seller"?total+" private bids received":total+" private bids";
  const timing=auction.status==="open"?"Closes "+new Date(auction.deadline).toLocaleString():"Successful sample result";
  let controls="";
  if(auction.status==="closed"){
    controls='<div class="case-hint"><strong>Illustrative result: successful</strong><p>This controlled demonstration assumes a qualifying buyer and seller acceptance. Real auctions may produce a different result.</p></div><a class="primary-button button-blue" href="'+href("messages")+'">Continue to Messages →</a>';
  }else if(!auction.participation){
    const label=role==="buyer"?"Confirm test participation":role==="seller"?"Open sample listing":"Open demonstration auction";
    controls='<div class="case-hint">Test participation only. No card details, payment, or real listing will be created.</div>'+button("participate",label,"",true);
  }else{
    controls='<div class="demo-auction-controls"><p><span class="status-chip">Open demonstration auction</span></p>';
    if(role==="buyer")controls+='<form id="demo-bid" class="case-form"><label>Your private bid · USD<input name="amount" type="number" min="1" step="1" max="1000000000000" value="429000" required></label><button class="primary-button" type="submit">Place demonstration bid</button></form>';
    else controls+='<p>'+esc(role==="seller"?"Your fictional property is listed. Other bid amounts remain private while the auction is open.":"This perspective can review the auction summary without placing a buyer bid.")+'</p>';
    if(own)controls+='<div class="case-hint">Your latest demonstration bid: $'+auction.bids.at(-1).amount.toLocaleString()+'. Other buyers’ offers remain private.</div>';
    if(role!=="buyer"||own)controls+='<div class="case-actions">'+button("closeAuction","Advance to sample result")+'</div>';
    controls+='</div>';
  }
  return '<section class="workspace-card workspace-summary-card demo-workspace-card"><p class="section-label">Auction summary</p><h2>Linked demonstration auction</h2><p class="workspace-card-subtitle">A fictional live-style auction summary for this property. Use the controls below to advance the story without affecting any connected account.</p><div class="workspace-summary-grid"><div><span>Auction status</span><strong>'+status+'</strong></div><div><span>'+(role==="buyer"?"Your bids":"Bid activity")+'</span><strong>'+esc(activity)+'</strong></div><div><span>Timing / result</span><strong>'+esc(timing)+'</strong></div></div>'+controls+'</section>';
}
function messagesView() {
  const docs=visibleDocuments(state,thread),tabs=state.perspective==="agent"?'<div class="thread-tabs demo-thread-picker">'+["buyer","seller","provider"].map(role=>'<button class="small-button" data-thread="'+role+'" aria-pressed="'+(role===thread)+'">'+ROLES[role]+' ↔ MREO</button>').join("")+'</div>':"";
  const items=conversation(state,thread).map(item=>{
    const doc=docs.find(doc=>doc.id===item.documentId),service=state.serviceRequests.find(service=>service.id===item.serviceId);
    return '<article class="case-message message '+(item.author===state.perspective?"mine":"")+'"><small>'+esc(item.author===state.perspective?"You · "+ROLES[item.author]:ROLES[item.author]+" · simulated")+' · '+new Date(item.at).toLocaleTimeString()+'</small><p>'+esc(item.body)+'</p>'+docCard(doc)+(service?'<a class="text-link" href="'+href("coordination")+'">'+esc(SERVICES[service.type])+' · '+esc(service.status)+' →</a>':"")+'</article>';
  }).join("");
  const subtitle=state.perspective==="agent"?"Choose a participant conversation. The buyer, seller, and provider threads remain separate from one another.":"Your private fictional conversation with MREO. Other participant roles cannot read this thread.";
  return '<section class="workspace-card conversation-card demo-workspace-card"><div class="conversation-heading"><div><p class="section-label">Conversation and shared documents</p><h2>Messages with MREO</h2></div><span class="private-chip">Fictional / private</span></div><p class="workspace-card-subtitle">'+esc(subtitle)+'</p>'+tabs+'<div class="case-message-list message-list" aria-live="polite">'+items+'</div><form id="demo-message" class="message-form demo-message-form"><textarea name="body" maxlength="8000" required aria-label="Your message" placeholder="Ask about the property or the next step"></textarea><button class="primary-button button-blue" type="submit">Send demonstration message</button></form><div class="document-composer demo-document-composer"><div><p class="section-label">Documents in this conversation</p><h3>Add a fictional PDF or document</h3><p class="upload-note">These sample records stay in this browser and follow the selected thread’s access.</p></div><div class="case-actions">'+button("sampleDocument","Add sample proof of funds",'data-kind="funds"')+button("sampleDocument","Add sample agreement",'data-kind="agreement"')+'</div></div></section>';
}
function coordinationView() {
  const services=state.serviceRequests.filter(service=>state.perspective==="agent"||service.ownerRole===state.perspective);
  const open=services.filter(service=>service.status!=="complete");
  const cards=services.map(service=>'<article class="case-service task-item"><span class="status-chip">'+esc(service.status)+'</span><h3>'+esc(SERVICES[service.type])+'</h3><p>'+esc(service.notes||"Review the property packet and propose the next step.")+'</p><small>Fictional provider · '+(service.status==="proposed"?"Sample proposal ready":service.status==="scheduled"?"Approved and scheduled":"Report delivered")+'</small><div class="task-actions">'+(service.status!=="complete"?button("advanceService",service.status==="proposed"?"Approve sample proposal":"Simulate report delivery",'data-service-id="'+service.id+'"',true):'<a class="text-link" href="'+href("files")+'">View the sample report →</a>')+'</div></article>').join("");
  const nextAction=state.auction.status!=="closed"?"Review the auction result":open.length?SERVICES[open[0].type]+" · "+open[0].status:"Request or review one property service";
  return '<div class="case-stack"><section class="workspace-card workspace-summary-card demo-workspace-card"><p class="section-label">Coordination summary</p><h2>Services and next steps</h2><p class="workspace-card-subtitle">A fictional version of the same coordination summary used by connected property workspaces. Service work remains separate from Messages while sharing the same property record.</p><div class="workspace-summary-grid"><div><span>Open actions</span><strong>'+(state.transaction.status==="complete"?"0":"1")+'</strong></div><div><span>Service requests</span><strong>'+services.length+'</strong></div><div><span>Workspace status</span><strong>'+esc(state.transaction.status)+'</strong></div></div><div class="task-list compact-service-list demo-coordination-list">'+(cards||'<div class="empty-card"><h3>No fictional service requests yet</h3><p>Use the request panel below to add Title / Settlement, inspection, repairs, representation, or property management.</p></div>')+'</div></section><section class="workspace-card demo-request-card"><p class="section-label">Add fictional work</p><h2>Request a sample service</h2><p class="workspace-card-subtitle">This mirrors the full Coordinate area while keeping the public demonstration self-contained.</p><form id="demo-service" class="case-form"><label>What does the property need?<select name="service">'+Object.entries(SERVICES).map(([id,label])=>'<option value="'+id+'">'+label+'</option>').join("")+'</select></label><label>Instructions for the fictional provider<textarea name="notes" maxlength="2000" placeholder="For example, review the title packet and flag outstanding items."></textarea></label><button class="primary-button button-blue" type="submit">Request sample service</button></form><p class="demo-next-action"><strong>Current next step:</strong> '+esc(nextAction)+'</p></section></div>';
}
function filesView() {
  const docs=visibleDocuments(state);
  return '<section class="workspace-card demo-workspace-card"><p class="section-label">Your permitted documents</p><h2>Files</h2><p class="workspace-card-subtitle">An index of the same fictional files shared in Messages and created by Coordination—not duplicate uploads. Access follows the selected demonstration perspective.</p><div class="workspace-summary-grid demo-file-summary"><div><span>Visible files</span><strong>'+docs.length+'</strong></div><div><span>Pending signatures</span><strong>'+state.signatureRequests.filter(item=>item.status!=="complete"&&(state.perspective==="agent"||item.signerRole===state.perspective)).length+'</strong></div><div><span>Workspace status</span><strong>'+esc(state.transaction.status)+'</strong></div></div><div class="document-list demo-file-index">'+(docs.length?docs.map(docCard).join(""):'<div class="empty-card"><h3>No sample files yet</h3><p>Add a fictional PDF from Messages or complete a service in Coordination to see it indexed here.</p></div>')+'</div><a class="text-link" href="'+href("messages")+'">Return to Messages →</a></section>';
}
function guide() {
  const checks=[["Confirm test participation",state.auction.participation],["Review the auction result",state.auction.status==="closed"],["Exchange a message",state.events.some(e=>e.type==="message.sent")],["Simulate one document signing",state.signatureRequests.some(s=>s.status==="complete")],["Complete one service",state.serviceRequests.some(s=>s.status==="complete")]];
  const next=state.auction.status!=="closed"?"auction":!checks[3][1]?"messages":"coordination";
  const visibleServices=state.serviceRequests.filter(service=>state.perspective==="agent"||service.ownerRole===state.perspective);
  const visibleDocs=visibleDocuments(state);
  let contextual="";
  if(view==="auction")contextual='<section class="workspace-card"><h2>Property record</h2><p><strong>'+esc(state.property.title)+'</strong></p><p>Reference value · $'+state.property.referencePrice.toLocaleString()+'</p><p>Use Auction for bids and outcomes. Messages, documents, signatures, and service work stay in their own sections.</p></section>';
  else if(view==="messages")contextual='<section class="workspace-card"><h2>Keep it together</h2><p>Ask a question or add a fictional document. PDFs and signature updates stay in chronological context here.</p><p>'+(state.perspective==="agent"?"As the MREO Agent, you can switch among Buyer ↔ MREO, Seller ↔ MREO, and Service Partner ↔ MREO without mixing the threads.":"Use Coordination to track work and Files to find a document.")+'</p></section>';
  else if(view==="coordination")contextual='<section class="workspace-card"><h2>Your next actions</h2><div class="task-list"><div class="task-item"><strong>'+(state.auction.status!=="closed"?"Review auction result":visibleServices.some(item=>item.status!=="complete")?"Review open service work":"Choose a sample service")+'</strong><p>'+(state.auction.status!=="closed"?"Advance the fictional auction before closing work begins.":"Coordination tracks the work status while Messages holds the conversation.")+'</p></div></div></section>';
  else contextual='<section class="workspace-card"><h2>File access</h2><p>'+visibleDocs.length+' fictional document'+(visibleDocs.length===1?"":"s")+' visible to this perspective.</p><p>Files indexes records created in Messages and Coordination. The MREO Agent can review permitted records across all demonstration threads.</p></section>';
  const progress='<section class="workspace-card demo-progress-card"><p class="section-label">Demonstration progress</p><h2>'+(state.transaction.status==="complete"?"Story complete":"Your illustrative journey")+'</h2><ol>'+checks.map(([label,done])=>'<li class="'+(done?"done":"")+'">'+esc(label)+(done?" ✓":"")+'</li>').join("")+'</ol>'+(checks.every(item=>item[1])&&state.transaction.status!=="complete"?button("complete","Finish demonstration","",true):'<a class="text-link" href="'+href(next)+'">Next suggested area →</a>')+'</section>';
  $("case-guide").innerHTML=contextual+progress;
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
  const signature=state.signatureRequests.find(item=>item.documentId===id);
  const needsSignature=signature && !signature.signatureName;
  $("review-actions").innerHTML=button("download","Download sample PDF",'data-document="'+id+'"')+(needsSignature?'<form id="demo-signature" class="case-form sample-signature-form" data-document="'+esc(id)+'"><label>Sample signer name<input name="signatureName" type="text" maxlength="120" autocomplete="off" placeholder="For example, Alex Example" required></label><div id="sample-signature-preview" class="sample-signature-preview" aria-hidden="true">Your sample signature</div><label class="sample-signature-consent"><input type="checkbox" name="consent" required> I am adding a sample signature for this demonstration only.</label><p id="sample-signature-error" role="alert" hidden></p><button class="small-button primary" type="submit">Apply sample signature</button></form>':signature?.signatureName?'<div class="sample-signature-record"><p>Sample signature</p><div class="sample-signature-preview">'+esc(signature.signatureName)+'</div><small>Saved '+new Date(signature.completedAt).toLocaleString()+' · Demonstration only</small></div>':"");
  const nameInput=$("demo-signature")?.elements.signatureName;
  if(nameInput)nameInput.oninput=()=>{$("sample-signature-preview").textContent=nameInput.value.trim()||"Your sample signature";};
  $("document-review").showModal();
}
// A generated sample PDF. A typed sample signature never becomes a legal execution.
function download(id) {
  const doc=visibleDocuments(state).find(doc=>doc.id===id);if(!doc)return;
  const signature=state.signatureRequests.find(item=>item.documentId===id && item.signatureName);
  const pdfText=value=>String(value).normalize("NFKD").replace(/[^\x20-\x7e]/g,"").replace(/[\\()]/g,"\\$&");
  const content="BT /F1 18 Tf 50 740 Td (MREO - DEMONSTRATION COPY) Tj 0 -35 Td /F1 12 Tf (Sample property document. Not a legal agreement.) Tj 0 -24 Td (No legally binding signature or payment is collected.) Tj"+(signature?" 0 -40 Td (Sample signature: "+pdfText(signature.signatureName)+") Tj 0 -24 Td (Recorded: "+pdfText(new Date(signature.completedAt).toISOString())+") Tj":"")+" ET";
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
  if(type==="sign")return;
  perform(type,{documentId:id,serviceId:control.dataset.serviceId,kind:control.dataset.kind});
});
document.addEventListener("submit",event=>{
  if(event.target.id==="demo-signature"){
    event.preventDefault();const form=event.target;
    try{act(state,"sign",{documentId:form.dataset.document,signatureName:form.elements.signatureName.value,consent:form.elements.consent.checked,thread});$("document-review").close();render();}
    catch(error){$("sample-signature-error").textContent=error.message;$("sample-signature-error").hidden=false;}
    return;
  }
  if(!["demo-message","demo-bid","demo-service"].includes(event.target.id))return;
  event.preventDefault();perform({"demo-message":"message","demo-bid":"bid","demo-service":"requestService"}[event.target.id],Object.fromEntries(new FormData(event.target)));
});
$("new-demo").onclick=()=>{state=createScenario(state.perspective);view="auction";thread=state.perspective==="agent"?"buyer":state.perspective;render();};
addEventListener("storage",event=>{if(event.key===prefix+"run:"+state.id){const updated=loadScenario(storage,prefix,state.id);if(updated){state=updated;render(false);}}});
render();
