import test from "node:test";
import assert from "node:assert/strict";
import {createScenario,saveScenario,namespace} from "../demo-store.js";
import {savedDemonstrations,accountWorkspaces,groupProperties} from "../property-hub-model.js";

const memory = () => {
  const entries = new Map();
  return {entries,get length(){return entries.size;},key:index=>[...entries.keys()][index],getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
};
test("the hub discovers older runs without changing them or reading another site's data",()=>{
  const storage=memory(),prefix=namespace("/mreo/my-properties.html");
  const buyer=createScenario("buyer"),seller=createScenario("seller");
  buyer.lastView="files";buyer.updatedAt=100;seller.lastView="coordination";seller.updatedAt=200;
  saveScenario(storage,prefix,buyer);saveScenario(storage,prefix,seller);
  saveScenario(storage,namespace("/other/demo-case.html"),createScenario());
  storage.setItem(prefix+"run:broken","{");
  storage.setItem(prefix+"run:incomplete",JSON.stringify({id:"incomplete",schemaVersion:1,perspective:"buyer",property:{title:"Invalid"}}));
  const before=[...storage.entries];
  const groups=groupProperties(savedDemonstrations(storage,prefix));
  assert.equal(groups.length,1);assert.equal(groups[0].workspaces.length,2);
  assert.equal(groups[0].latest.id,seller.id);
  assert.equal(groups[0].workspaces[1].href,`demo-case.html?run=${buyer.id}&view=files`);
  assert.deepEqual([...storage.entries],before);
  assert.deepEqual(savedDemonstrations(null,prefix),[]);
});
test("account roles deduplicate by transaction while separate workspaces and sources remain reachable",()=>{
  const state=createScenario(),storage=memory();saveScenario(storage,"demo:",state);
  const base={id:"tx-one",title:state.property.title,kind:"property",status:"active",updated_at:100,viewer_role:"buyer"};
  const account=accountWorkspaces([base,{...base,viewer_role:"seller"},{...base,id:"tx-two",updated_at:200}]);
  assert.equal(account.length,2);assert.deepEqual(account[0].roles,["Buyer","Seller"]);
  const groups=groupProperties([...account,...savedDemonstrations(storage,"demo:")]);
  assert.equal(groups.length,2);
  const live=groups.find(group=>group.source==="account");
  assert.equal(live.workspaces.length,2);assert.match(live.latest.href,/transaction=tx-two&section=messages$/);
  assert.equal(groupProperties([...account],"RIVERSIDE, Terrace").length,1);
  assert.equal(groupProperties([...account],"Willow").length,0);
});
test("a stable account property ID keeps renamed workspaces together and safely encodes IDs",()=>{
  const records=accountWorkspaces([{id:"tx & 1",property:{id:"prop-a"},title:"Old title",updated_at:100},
    {id:"tx2",property:{id:"prop-a"},title:"New title",updated_at:200},
    {id:"tx3",property:{id:"prop-b"},title:"New title",updated_at:300},null,{}]);
  assert.equal(groupProperties(records).length,2);
  assert.equal(groupProperties(records).find(group=>group.latest.id==="tx2").workspaces.length,2);
  assert.ok(records[0].href.includes("transaction=tx%20%26%201"));
});
test("workspace records retain the best available property thumbnail references",()=>{
  const [record]=accountWorkspaces([{id:"tx-photo",title:"Photo property",viewer_role:"seller",source_auction_id:"intake-draft",property:{id:"property-photo",relatedAuctionId:"auction-photo",mediaKey:"draft-photo",image:"assets/property-placeholder.svg"}}]);
  assert.equal(record.auctionId,"auction-photo");assert.equal(record.mediaKey,"draft-photo");assert.equal(record.image,"assets/property-placeholder.svg");
  const storage=memory(),prefix="demo:";const demo=createScenario("buyer");saveScenario(storage,prefix,demo);
  assert.match(savedDemonstrations(storage,prefix)[0].image,/images\.unsplash\.com/);
});
