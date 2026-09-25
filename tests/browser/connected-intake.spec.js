import {test,expect} from "@playwright/test";

test("connected participation stays in Auction and explains when a listing is not active",async({page})=>{
 let paid=false;
 await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG=Object.freeze({mode:"connected",apiBase:"https://api.mreo.test"});'}));
 await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
  globalThis.MreoIdentity={
   connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"clerk-user"}),mountUserButton:async()=>true,openSignIn:async()=>{},liveUrl:path=>"wss://api.mreo.test"+path,
   request:async(path,options={})=>{
    if(path==="/api/v1/transactions"&&options.method==="POST")return {id:"tx-intake"};
    if(path==="/api/v1/transactions/tx-intake")return {id:"tx-intake",title:"2605 Preston Meadow Court",kind:"property",status:"active",viewerRole:"buyer",participants:[{id:"me",display_name:"Blake Buyer",role:"buyer",status:"active"}]};
    if(path.endsWith("/tasks"))return {tasks:[{id:"task-1",title:"Send MREO a message about your property interest",status:"action"}]};
    if(path.endsWith("/events"))return {events:[{created_at:Date.now(),summary:"MREO private conversation and intake workspace created."}]};
    if(path.endsWith("/services"))return {services:[]};
    if(path.endsWith("/documents"))return {documents:[]};
    if(path.includes("/messages"))return {thread:{kind:"buyer_agent"},messages:[]};
    if(path.endsWith("/live-ticket"))throw Error("Live connection omitted in browser test");
    throw Error("Unexpected identity request: "+path);
   }
  };`}));
 await page.route("https://api.mreo.test/**",async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==="/config")return route.fulfill({json:{connected:true,stripeConfigured:false,participationBypass:true,testPayments:true,defaultDays:1}});
  if(path==="/me")return route.fulfill({json:{id:"auction-account",role:"buyer",name:"Blake Buyer",email:"buyer@example.com",creditCents:paid?100:0,submission:{title:"2605 Preston Meadow Court",auctionId:"demo-plano"}}});
  if(path==="/checkout"){paid=true;return route.fulfill({json:{paid:true,testBypass:true}});}
  if(path==="/activate")return route.fulfill({json:{auctionId:null,handoffToken:"signed-intake-token"}});
  return route.fulfill({status:404,json:{error:"Not found"}});
 });
 await page.addInitScript(()=>sessionStorage.setItem("mreo:v3:/:connected:https://api.mreo.test:buyer",JSON.stringify({token:"auction-account.secret",id:"auction-account",role:"buyer"})));
 await page.goto("/payment.html?role=buyer");
 await expect(page.locator("[data-mode-label]")).toContainText("Payment deferred");
 await expect(page.locator("#payment-consent-row")).toBeHidden();
 await page.getByRole("button",{name:"Auction →"}).click();
 await expect(page).toHaveURL(/auction\.html\?pending=1&transaction=tx-intake$/);
 await expect(page.getByRole("heading",{name:"No active auction for this property"})).toBeVisible();
 await expect(page.locator("#auction-content")).toBeHidden();
 await expect(page.getByRole("textbox",{name:"Message",exact:true})).toHaveCount(0);
 await page.getByRole("link",{name:"Open Messages →"}).click();
 await expect(page).toHaveURL(/coordination\.html\?transaction=tx-intake&section=messages$/);
 await expect(page.getByRole("heading",{name:"Messages with MREO"})).toBeVisible();
 await expect(page.getByRole("textbox",{name:"Message"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Your private MREO thread is ready"})).toBeVisible();
});
