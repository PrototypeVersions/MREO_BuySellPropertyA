import test from "node:test";
import assert from "node:assert/strict";
import {SERVICES,createScenario,act,conversation,visibleDocuments,saveScenario,loadScenario,namespace} from "../demo-store.js";

const memory=()=>{const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),entries};};

test("guided runs are isolated and leave connected account data untouched",()=>{
 const storage=memory(),prefix=namespace("/MREO_BuySellPropertyA/demo-case.html");
 storage.setItem("connected-account","keep-me");
 const buyer=createScenario("buyer"),seller=createScenario("seller");
 act(buyer,"message",{body:"Buyer only"});saveScenario(storage,prefix,buyer);saveScenario(storage,prefix,seller);
 assert.notEqual(buyer.id,seller.id);assert.notEqual(buyer.transaction.id,seller.transaction.id);
 assert.equal(loadScenario(storage,prefix).id,seller.id);
 assert.equal(loadScenario(storage,prefix,buyer.id).messages.at(-2).body,"Buyer only");
 assert.equal(storage.getItem("connected-account"),"keep-me");
 assert.equal(loadScenario(storage,namespace("/other/demo-case.html")),null);
});

test("auction, messaging and coordination actions do not advance one another",()=>{
 const state=createScenario();
 assert.throws(()=>act(state,"bid",{amount:429000}),/participation/);
 act(state,"message",{body:"Is a report available?"});
 act(state,"requestService",{service:"contractors"});
 assert.equal(state.auction.status,"open");assert.equal(state.auction.bids.length,0);
 act(state,"participate");act(state,"bid",{amount:429000});
 assert.equal(state.serviceRequests[0].status,"proposed");
 act(state,"closeAuction");assert.equal(state.transaction.status,"closing");
 assert.throws(()=>act(state,"complete"),/sample signature/);
});

test("document signatures reference one document and its original private thread",()=>{
 const state=createScenario("agent");
 act(state,"sampleDocument",{thread:"buyer",kind:"agreement"});
 const document=state.documents[0];
 act(state,"requestSignature",{thread:"seller",documentId:document.id});
 act(state,"sign",{thread:"seller",documentId:document.id,signatureName:"Alex Example",consent:true});
 assert.equal(state.documents.length,1);assert.equal(document.status,"complete");
 assert.equal(state.signatureRequests[0].documentId,document.id);
 assert.equal(state.signatureRequests[0].signerRole,"buyer");
 assert.equal(conversation(state,"buyer").filter(m=>m.documentId===document.id).length,3);
 assert.equal(conversation(state,"seller").filter(m=>m.documentId===document.id).length,0);
 assert.equal(visibleDocuments(state,"seller").length,0);
 assert.equal(visibleDocuments(state,"buyer")[0],document);
});

test("a service report is the same record in the service and conversation",()=>{
 const state=createScenario();act(state,"requestService",{service:"title",notes:"Review packet"});
 const service=state.serviceRequests[0];
 act(state,"advanceService",{serviceId:service.id});assert.equal(service.status,"scheduled");
 act(state,"advanceService",{serviceId:service.id});assert.equal(service.status,"complete");
 assert.equal(state.documents[0].id,service.documentId);
 assert.ok(conversation(state,"buyer").some(m=>m.serviceId===service.id&&m.documentId===service.documentId));
 act(state,"advanceService",{serviceId:service.id});assert.equal(state.documents.length,1);
});

test("sample result, signing and completed service allow a complete saved journey",()=>{
 const state=createScenario();act(state,"participate");act(state,"bid",{amount:429000});act(state,"closeAuction");
 act(state,"sampleDocument",{kind:"agreement"});act(state,"requestSignature",{documentId:state.documents[0].id});act(state,"sign",{documentId:state.documents[0].id,signatureName:"Alex Example",consent:true});
 act(state,"requestService",{service:"title"});act(state,"advanceService",{serviceId:state.serviceRequests[0].id});act(state,"advanceService",{serviceId:state.serviceRequests[0].id});
 act(state,"complete");assert.equal(state.transaction.status,"complete");
 const storage=memory();saveScenario(storage,"demo:",state);assert.deepEqual(loadScenario(storage,"demo:"),state);
});
test("sample signing requires a typed name and consent, including previously simulated runs",()=>{
 const state=createScenario();act(state,"sampleDocument",{kind:"agreement"});const documentId=state.documents[0].id;
 act(state,"requestSignature",{documentId});
 assert.throws(()=>act(state,"sign",{documentId}),/name/);
 assert.throws(()=>act(state,"sign",{documentId,signatureName:"Alex Example"}),/name/);
 assert.equal(state.documents[0].status,"signature_pending");
 // Preserve old snapshots while allowing their button-only simulation to acquire a sample signature.
 state.signatureRequests[0].status="complete";state.documents[0].status="complete";
 act(state,"sign",{documentId,signatureName:"Alex Example",consent:true});
 assert.equal(state.signatureRequests[0].signatureName,"Alex Example");
 assert.equal(state.signatureRequests[0].method,"typed");
 assert.throws(()=>act(state,"sign",{documentId,signatureName:"Someone Else",consent:true}),/Request/);
});


test("guided demo exposes the same four coordination service choices as the main Coordinate area",()=>{
 assert.deepEqual(Object.values(SERVICES),["Title / settlement","Contractors","Realtors","Rental / property management"]);
});

test("title service seeds buyer seller and provider conversations for the MREO Agent",()=>{
 const state=createScenario("agent");
 act(state,"requestService",{thread:"buyer",service:"title",notes:"Open title"});
 const service=state.serviceRequests[0];
 assert.deepEqual(service.threadRoles,["buyer","seller","provider"]);
 for(const role of ["buyer","seller","provider"]){
  const messages=conversation(state,role).filter(item=>item.serviceId===service.id);
  assert.ok(messages.length>=2,role+" should receive title coordination messages");
  assert.ok(messages.some(item=>item.author==="agent"));
 }
 assert.match(conversation(state,"buyer").filter(item=>item.serviceId===service.id).map(item=>item.body).join(" "),/vesting/i);
 assert.match(conversation(state,"seller").filter(item=>item.serviceId===service.id).map(item=>item.body).join(" "),/payoff/i);
 assert.match(conversation(state,"provider").filter(item=>item.serviceId===service.id).map(item=>item.body).join(" "),/ownership|title/i);
});

test("contractor and realtor services connect one participant thread with the provider while rentals connect all three",()=>{
 const contractor=createScenario("agent");act(contractor,"requestService",{thread:"seller",service:"contractors"});
 assert.deepEqual(contractor.serviceRequests[0].threadRoles,["seller","provider"]);
 assert.equal(conversation(contractor,"buyer").filter(item=>item.serviceId===contractor.serviceRequests[0].id).length,0);
 assert.ok(conversation(contractor,"seller").some(item=>item.serviceId===contractor.serviceRequests[0].id));
 assert.ok(conversation(contractor,"provider").some(item=>item.serviceId===contractor.serviceRequests[0].id));

 const realtor=createScenario("agent");act(realtor,"requestService",{thread:"buyer",service:"realtors"});
 assert.deepEqual(realtor.serviceRequests[0].threadRoles,["buyer","provider"]);
 assert.equal(conversation(realtor,"seller").filter(item=>item.serviceId===realtor.serviceRequests[0].id).length,0);

 const rental=createScenario("agent");act(rental,"requestService",{thread:"provider",service:"rentals"});
 assert.deepEqual(rental.serviceRequests[0].threadRoles,["buyer","seller","provider"]);
});

test("multi-thread service completion shares one report record with every involved thread",()=>{
 const state=createScenario("agent");act(state,"requestService",{thread:"buyer",service:"title"});
 const service=state.serviceRequests[0];act(state,"advanceService",{serviceId:service.id});act(state,"advanceService",{serviceId:service.id});
 const doc=state.documents.find(item=>item.id===service.documentId);
 assert.deepEqual(doc.sharedWith,["buyer","seller","provider"]);
 for(const role of ["buyer","seller","provider"])assert.ok(conversation(state,role).some(item=>item.documentId===doc.id&&item.serviceId===service.id));
});
