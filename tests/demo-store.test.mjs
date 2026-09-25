import test from "node:test";
import assert from "node:assert/strict";
import {createScenario,act,conversation,visibleDocuments,saveScenario,loadScenario,namespace} from "../demo-store.js";

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
 act(state,"requestService",{service:"inspection"});
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
 act(state,"sign",{thread:"seller",documentId:document.id});
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
 act(state,"sampleDocument",{kind:"agreement"});act(state,"requestSignature",{documentId:state.documents[0].id});act(state,"sign",{documentId:state.documents[0].id});
 act(state,"requestService",{service:"title"});act(state,"advanceService",{serviceId:state.serviceRequests[0].id});act(state,"advanceService",{serviceId:state.serviceRequests[0].id});
 act(state,"complete");assert.equal(state.transaction.status,"complete");
 const storage=memory();saveScenario(storage,"demo:",state);assert.deepEqual(loadScenario(storage,"demo:"),state);
});
