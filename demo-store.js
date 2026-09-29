// The guided demonstration owns only synthetic, run-scoped browser records.
// No connected identity, payment, auction, document, or signing API is used here.
export const ROLES = {buyer:"Buyer", seller:"Seller", agent:"MREO Agent", provider:"Service Partner"};
export const SERVICES = {title:"Title / settlement", contractors:"Contractors", realtors:"Realtors", rentals:"Rental / property management"};
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
function serviceParticipant(thread) {
  return thread==="buyer"||thread==="seller"?thread:"seller";
}
function serviceThreads(type,thread) {
  if(type==="title"||type==="rentals")return ["buyer","seller","provider"];
  if(type==="contractors"||type==="realtors")return [serviceParticipant(thread),"provider"];
  return [thread];
}
const serviceConversation={
  title:{
    buyer:[
      ["agent","Title / settlement has been opened with Northstar Title. Please confirm the vesting name for the buyer and be ready to review verified closing-fund instructions."],
      ["buyer","Vesting will be Alex Morgan. I will send closing funds only after the title company provides verified instructions through the closing process."]
    ],
    seller:[
      ["agent","Title / settlement is open. Please provide the fictional payoff authorization, lien information, and the seller details needed for the closing package."],
      ["seller","I received the title request. I will provide the sample payoff authorization and seller information for the closing file."]
    ],
    provider:[
      ["agent","MREO is sending the fictional property packet and winning transaction record. Please open title, review ownership and exceptions, and return preliminary closing requirements."],
      ["provider","Northstar Title opened the sample file. We will review ownership, taxes, recorded exceptions, and the settlement requirements, then report the next items through MREO."]
    ]
  },
  contractors:{
    buyer:[
      ["agent","A contractor estimate has been requested for the buyer. Please identify any repair items you want priced before the sample closing."],
      ["buyer","Please prioritize safety items, HVAC condition, and a separate estimate for cosmetic improvements."]
    ],
    seller:[
      ["agent","A contractor walkthrough has been requested for the seller. Please confirm access and identify any items you may want addressed before closing."],
      ["seller","Access is available. Please separate required repairs from optional improvements in the estimate."]
    ],
    provider:[
      ["agent","MREO is requesting a fictional contractor scope and estimate for the property. Please separate urgent repairs from optional improvements and propose an inspection time."],
      ["provider","Blue Oak Contractors can inspect Tuesday afternoon and return an itemized sample scope with labor, materials, and estimated timing."]
    ]
  },
  realtors:{
    buyer:[
      ["agent","MREO is coordinating a fictional local Realtor for the buyer. Please note any walkthrough, neighborhood, or closing-access questions you want the agent to handle."],
      ["buyer","I would like a final walkthrough and local access help before closing."]
    ],
    seller:[
      ["agent","MREO is coordinating a fictional Realtor for the seller. Please confirm any local access, property handoff, or closing-support needs."],
      ["seller","Please coordinate the final property handoff and confirm the lockbox can be removed after closing."]
    ],
    provider:[
      ["agent","A fictional Realtor assignment is ready. Please coordinate local access and the requested transaction support through MREO rather than contacting the other participant directly."],
      ["provider","Cedar Lane Realty can handle the walkthrough, local access, and closing-day handoff and will post updates here."]
    ]
  },
  rentals:{
    buyer:[
      ["agent","Rental / property management onboarding can begin after closing. Please confirm the buyer's preferred rent-collection, maintenance, and tenant-communication setup."],
      ["buyer","Please use online rent collection and route maintenance requests through the management team."]
    ],
    seller:[
      ["agent","For the fictional management transition, please provide the current lease, deposit record, rent ledger, keys, and any open maintenance items."],
      ["seller","I will provide the sample lease, deposit ledger, keys, and the current maintenance notes for transfer."]
    ],
    provider:[
      ["agent","MREO is opening a fictional rental / property management assignment. Please review the lease package, tenant transition, rent collection, and maintenance setup."],
      ["provider","Northline Property Management received the sample assignment and will prepare tenant onboarding, rent collection, and maintenance procedures."]
    ]
  }
};
function seedServiceConversation(state,service) {
  for(const threadRole of service.threadRoles){
    for(const [author,body] of serviceConversation[service.type]?.[threadRole]||[]){
      message(state,threadRole,author,body,{serviceId:service.id});
    }
  }
}
function addServiceReport(state,service) {
  const sharedWith=[...new Set(service.threadRoles)];
  const document={id:uuid("document"),transactionId:state.transaction.id,filename:"Sample "+SERVICES[service.type]+" report.pdf",kind:"report",version:1,status:"available",sharedWith,createdAt:stamp(),updatedAt:stamp()};
  state.documents.push(document);
  for(const threadRole of sharedWith)message(state,threadRole,"agent","The fictional "+SERVICES[service.type]+" report is ready. Coordination and Files reference this same record.",{serviceId:service.id,documentId:document.id});
  record(state,"document.shared",document.id,document.filename);
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
    const signature=state.signatureRequests.find(item=>item.documentId===doc?.id&&(item.status==="pending" || (item.status==="complete" && !item.signatureName)));
    if(!doc||!signature)throw Error("Request a sample signature first.");
    const signatureName=String(payload.signatureName||"").trim().slice(0,120);
    if(!signatureName || signatureName.includes("@") || payload.consent!==true)throw Error("Enter a sample signer name and confirm that this is a demonstration signature.");
    signature.signatureName=signatureName;signature.method="typed";signature.consent=true;
    signature.status="complete";signature.completedAt=stamp();doc.status="complete";doc.updatedAt=stamp();
    message(state,signature.signerRole,"agent","Demonstration signing complete. This is not a legally executed agreement.",{documentId:doc.id,event:"signature.completed"});
    record(state,"signature.completed",signature.id,"Simulated signing completed",signature.signerRole);
  } else if(type==="requestService") {
    if(!SERVICES[payload.service])throw Error("Choose a service.");
    if(state.serviceRequests.some(item=>item.type===payload.service&&item.status!=="complete"))throw Error("This service already has an open request.");
    const threadRoles=serviceThreads(payload.service,thread);
    const service={id:uuid("service"),transactionId:state.transaction.id,propertyId:state.property.id,type:payload.service,status:"proposed",ownerRole:thread,threadRoles,notes:String(payload.notes||"").trim().slice(0,2000),createdAt:stamp(),updatedAt:stamp()};
    state.serviceRequests.push(service);seedServiceConversation(state,service);
    record(state,"service.proposed",service.id,SERVICES[service.type]+" proposal ready",thread);
  } else if(type==="advanceService") {
    const service=state.serviceRequests.find(item=>item.id===payload.serviceId);
    if(!service)throw Error("Service request not found.");
    service.threadRoles=service.threadRoles||serviceThreads(service.type,service.ownerRole);
    if(service.status==="proposed") {
      service.status="scheduled";
      for(const threadRole of service.threadRoles)message(state,threadRole,"agent","The fictional "+SERVICES[service.type]+" proposal is approved and the next step is scheduled.",{serviceId:service.id});
    }
    else if(service.status==="scheduled") {
      service.status="complete";const doc=addServiceReport(state,service);service.documentId=doc.id;
    }
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
    if(state?.schemaVersion===1&&state.id===selected&&ROLES[state.perspective]){
      for(const service of state.serviceRequests||[]){
        if(service.type==="inspection")service.type="contractors";
        service.threadRoles=service.threadRoles||serviceThreads(service.type,service.ownerRole||state.perspective);
      }
      return state;
    }
    return null;
  } catch {return null;}
}
