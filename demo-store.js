// The guided demonstration owns only synthetic, run-scoped browser records.
// No connected identity, payment, auction, document, or signing API is used here.
export const ROLES = {buyer:"Buyer", seller:"Seller", agent:"MREO Agent", provider:"Service Partner"};
export const SERVICES = {title:"Title / settlement", inspection:"Inspection", contractors:"Repairs / improvements", realtors:"Representation", rentals:"Rent / manage"};
const uuid = prefix => prefix + "_" + crypto.randomUUID();
const stamp = () => Date.now();
export const namespace = path => "mreo:guided-demo:v1:" + path.replace(/[^/]*$/, "");

export function createScenario(perspective = "buyer") {
  if (!ROLES[perspective]) perspective = "buyer";
  const id = uuid("demo"), propertyId = uuid("property"), auctionId = uuid("auction"), transactionId = uuid("case");
  const state = {schemaVersion:1,id,perspective,createdAt:stamp(),updatedAt:stamp(),lastView:"auction",
    property:{id:propertyId,title:"1147 Riverside Terrace, Irving, TX 75062",referencePrice:429000,image:"assets/property-placeholder.svg"},
    auction:{id:auctionId,propertyId,status:"open",participation:false,bids:[],deadline:stamp()+86400000},
    transaction:{id:transactionId,propertyId,auctionId,status:"interest"},
    threads:["buyer","seller","provider"].map(role => ({id:uuid("thread"),transactionId,role})),
    messages:[],documents:[],signatureRequests:[],serviceRequests:[],events:[]};
  for (const thread of state.threads) message(state, thread.role, "agent", "Welcome. This is a fictional " + thread.role + " conversation. Ask a question, add a sample PDF, or explore a service in Coordination.");
  record(state,"scenario.created",id,"New isolated " + perspective + " demonstration");
  return state;
}
const threadFor = (state, role) => state.threads.find(thread => thread.role === role);
function record(state,type,entityId,summary,threadRole=null) {
  state.events.push({id:uuid("event"),type,entityId,summary,threadRole,at:stamp()});
  state.updatedAt=stamp();
}
function message(state,threadRole,author,body,extra={}) {
  const thread=threadFor(state,threadRole);
  state.messages.push({id:uuid("message"),threadId:thread.id,author,body,at:stamp(),...extra});
}
function addDocument(state,threadRole,kind) {
  const names={funds:"Sample proof of funds.pdf",agreement:"Sample purchase agreement.pdf",report:"Sample service report.pdf"};
  const document={id:uuid("document"),transactionId:state.transaction.id,filename:names[kind]||"Sample property information.pdf",kind,version:1,status:"available",sharedWith:[threadRole],createdAt:stamp(),updatedAt:stamp()};
  state.documents.push(document);
  message(state,threadRole,state.perspective,"Shared a sample document.",{documentId:document.id});
  record(state,"document.shared",document.id,document.filename,threadRole);
  return document;
}
export function visibleDocuments(state,role=state.perspective) {
  return state.documents.filter(doc => role==="agent" || doc.sharedWith.includes(role));
}
export function conversation(state,threadRole) {
  const thread=threadFor(state,threadRole);
  return state.messages.filter(item=>item.threadId===thread?.id);
}
export function act(state,type,payload={}) {
  const role=state.perspective, thread=role==="agent" ? payload.thread||"buyer" : role;
  if (!threadFor(state,thread)) throw Error("Choose a participant conversation.");
  if(type==="participate") {state.auction.participation=true;record(state,"participation.confirmed",state.auction.id,"Test participation confirmed. No money charged.");}
  else if(type==="bid") {
    if(role!=="buyer"||!state.auction.participation||state.auction.status!=="open") throw Error("Complete test participation before bidding in an open auction.");
    const amount=Number(payload.amount);
    if(!Number.isSafeInteger(amount)||amount<1||amount>1000000000000) throw Error("Enter a positive bid in whole dollars.");
    state.auction.bids.push({id:uuid("bid"),auctionId:state.auction.id,buyer:"demo-buyer",amount,at:stamp()});
    record(state,"bid.submitted",state.auction.id,"A private demonstration bid was submitted.");
  } else if(type==="closeAuction") {
    if(state.auction.status!=="open")return state;
    if(role==="buyer"&&!state.auction.bids.length)throw Error("Place your demonstration bid first.");
    state.auction.status="closed";state.transaction.status="closing";
    record(state,"auction.closed",state.auction.id,"Illustrative successful auction result. Acceptance and closing remain separate.");
    for(const target of ["buyer","seller"])message(state,target,"agent","The demonstration auction has ended with a successful result. Next, review the sample agreement here.");
  } else if(type==="message") {
    const body=String(payload.body||"").trim().slice(0,8000);if(!body)throw Error("Write a message first.");
    message(state,thread,role,body);record(state,"message.sent",threadFor(state,thread).id,"Message sent",thread);
    message(state,thread,role==="agent"?thread:"agent",role==="agent"?"Thanks. I can review the sample document and follow the next step.":"Thank you. This is a scripted demonstration reply. You can add a sample PDF here or use Coordination to request work.");
  } else if(type==="sampleDocument") {addDocument(state,thread,payload.kind==="agreement"?"agreement":"funds");}
  else if(type==="requestSignature") {
    const doc=visibleDocuments(state).find(item=>item.id===payload.documentId);
    if(!doc)throw Error("Document not found.");if(doc.status!=="available")return state;
    doc.status="signature_pending";doc.updatedAt=stamp();
    const documentThread=doc.sharedWith[0];
    const signature={id:uuid("signature"),documentId:doc.id,status:"pending",requestedAt:stamp(),signerRole:documentThread};
    state.signatureRequests.push(signature);
    message(state,documentThread,"agent","Simulated signature requested. No email has been sent.",{documentId:doc.id,event:"signature.requested"});
    record(state,"signature.requested",signature.id,"Sample signature requested",documentThread);
  } else if(type==="sign") {
    const doc=visibleDocuments(state).find(item=>item.id===payload.documentId);
    const signature=state.signatureRequests.find(item=>item.documentId===doc?.id&&item.status==="pending");
    if(!doc||!signature)throw Error("Request a sample signature first.");
    signature.status="complete";signature.completedAt=stamp();doc.status="complete";doc.updatedAt=stamp();
    message(state,signature.signerRole,"agent","Demonstration signing complete. This is not a legally executed agreement.",{documentId:doc.id,event:"signature.completed"});
    record(state,"signature.completed",signature.id,"Simulated signing completed",signature.signerRole);
  } else if(type==="requestService") {
    if(!SERVICES[payload.service])throw Error("Choose a service.");
    if(state.serviceRequests.some(item=>item.type===payload.service&&item.status!=="complete"))throw Error("This service already has an open request.");
    const service={id:uuid("service"),transactionId:state.transaction.id,propertyId:state.property.id,type:payload.service,status:"proposed",ownerRole:thread,notes:String(payload.notes||"").trim().slice(0,2000),createdAt:stamp(),updatedAt:stamp()};
    state.serviceRequests.push(service);message(state,thread,"agent","A fictional provider has proposed the next step. Review it in Coordination.",{serviceId:service.id});
    record(state,"service.proposed",service.id,SERVICES[service.type]+" proposal ready",thread);
  } else if(type==="advanceService") {
    const service=state.serviceRequests.find(item=>item.id===payload.serviceId);
    if(!service)throw Error("Service request not found.");
    if(service.status==="proposed") {service.status="scheduled";message(state,service.ownerRole,"agent","The sample proposal is approved. Work is scheduled.",{serviceId:service.id});}
    else if(service.status==="scheduled") {service.status="complete";const doc=addDocument(state,service.ownerRole,"report");service.documentId=doc.id;message(state,service.ownerRole,"agent","The provider's sample report is ready. Coordination and Files reference this same record.",{serviceId:service.id,documentId:doc.id});}
    else return state;
    service.updatedAt=stamp();record(state,"service."+service.status,service.id,SERVICES[service.type]+" "+service.status,service.ownerRole);
  } else if(type==="complete") {
    if(state.auction.status!=="closed"||!state.signatureRequests.some(item=>item.status==="complete")||!state.serviceRequests.some(item=>item.status==="complete"))throw Error("Finish the auction, one sample signature, and one service first.");
    state.transaction.status="complete";record(state,"case.completed",state.transaction.id,"Guided demonstration completed.");
  } else throw Error("Unknown demonstration action.");
  return state;
}
export function saveScenario(storage,prefix,state) {
  storage.setItem(prefix+"run:"+state.id,JSON.stringify(state));
  storage.setItem(prefix+"active",state.id);
}
export function loadScenario(storage,prefix,id=null) {
  try {
    const selected=id||storage.getItem(prefix+"active");if(!selected)return null;
    const state=JSON.parse(storage.getItem(prefix+"run:"+selected)||"null");
    return state?.schemaVersion===1&&state.id===selected&&ROLES[state.perspective]?state:null;
  } catch {return null;}
}
