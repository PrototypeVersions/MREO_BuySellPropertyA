import {test,expect} from "@playwright/test";

test("buyer interest and seller submissions create My Properties workspaces immediately",async({page})=>{
 const intakes=[];
 await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG=Object.freeze({mode:"connected",apiBase:"https://api.mreo.test"});'}));
 await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
  globalThis.MreoIdentity={connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"clerk-user"}),openSignIn:async()=>{},
   request:async(path,options={})=>{const response=await fetch("https://identity.mreo.test"+path,options);return response.json();}};` }));
 await page.route("https://identity.mreo.test/**",async route=>{
  const request=route.request(),body=request.postDataJSON();intakes.push(body);
  await route.fulfill({json:{id:"tx-"+body.role,title:body.title,status:"active"}});
 });
 await page.route("https://api.mreo.test/**",async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==="/config")return route.fulfill({json:{connected:true,stripeConfigured:false,participationBypass:true,testPayments:true,defaultDays:1}});
  if(path==="/register"){
   const body=request.postDataJSON();
   return route.fulfill({status:201,json:{id:"exchange-"+body.role,token:"exchange-"+body.role+".secret",role:body.role,name:body.details.name,email:body.details.email,creditCents:0,submission:{...body.submission,draftId:"draft-"+body.role+"-12345678"}}});
  }
  return route.fulfill({status:404,json:{error:"Not found"}});
 });
 const completeRequired=async form=>{
  await form.evaluate(node=>{
   for(const field of node.querySelectorAll("[required]")){
    if(field.type==="file"||field.closest("fieldset[disabled]"))continue;
    if(field.type==="checkbox"||field.type==="radio")field.checked=true;
    else if(field.tagName==="SELECT")field.value=[...field.options].find(option=>option.value)?.value||"";
    else if(!field.value&&field.type==="email")field.value="owner@example.com";
    else if(!field.value&&field.type==="number")field.value=field.min&&Number(field.min)>0?field.min:"100";
    else if(!field.value)field.value=field.id.includes("zip")?"75001":"Test value";
    field.dispatchEvent(new Event("input",{bubbles:true}));field.dispatchEvent(new Event("change",{bubbles:true}));
   }
  });
 };
 await page.goto("/buyer.html?auction=demo-plano&address=2605+Preston+Meadow+Court&demo=1");
 await completeRequired(page.locator("#buyer-form"));
 await page.locator("#buyer-form").evaluate(form=>form.requestSubmit());
 await expect(page).toHaveURL(/payment\.html\?role=buyer&demo=1&transaction=tx-buyer$/);
 expect(intakes[0]).toMatchObject({intake:true,role:"buyer",title:"2605 Preston Meadow Court",auctionId:"demo-plano",demo:true});
 expect(intakes[0].reference).toMatch(/^draft-/);

 await page.goto("/seller.html");
 await completeRequired(page.locator("#seller-form"));
 await page.locator("#seller-form").evaluate(form=>form.requestSubmit());
 await expect(page).toHaveURL(/payment\.html\?role=seller&transaction=tx-seller$/);
 expect(intakes[1]).toMatchObject({intake:true,reference:"draft-seller-12345678",role:"seller",kind:"property",demo:false});
 expect(intakes[1].title).toContain("Test value");
});

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

test("workspace Auction and Coordination tabs show current summaries and link to the full tools",async({page})=>{
 await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG=Object.freeze({mode:"connected",apiBase:"https://api.mreo.test"});'}));
 await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
  globalThis.MreoIdentity={connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"clerk-user"}),liveUrl:path=>"wss://api.mreo.test"+path,
   request:async(path)=>{
    if(path==="/api/v1/transactions/tx-current")return {id:"tx-current",title:"2605 Preston Meadow Court",kind:"property",status:"active",amount_cents:55100000,source_auction_id:"intake-draft-current",property:{id:"auction-current",relatedAuctionId:"auction-current"},viewerRole:"buyer",participants:[]};
    if(path.endsWith("/tasks"))return {tasks:[{id:"task-1",title:"Review inspection proposal",status:"action"}]};
    if(path.endsWith("/events"))return {events:[]};
    if(path.endsWith("/services"))return {services:[{id:"service-1",service_type:"Inspection",status:"scheduled"}]};
    if(path.endsWith("/documents"))return {documents:[]};
    if(path.includes("/messages"))return {thread:{kind:"buyer_agent"},messages:[]};
    if(path.endsWith("/live-ticket"))throw Error("Live connection omitted in browser test");
    throw Error("Unexpected identity request: "+path);
   }};` }));
 await page.route("https://api.mreo.test/**",route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==="/config")return route.fulfill({json:{connected:true,stripeConfigured:false,participationBypass:true,testPayments:true}});
  if(path==="/auctions/auction-current")return route.fulfill({json:{auction:{id:"auction-current",title:"2605 Preston Meadow Court",status:"active",endsAt:Date.now()+86400000,bidCount:2,bids:[{buyerId:"exchange-buyer",amount:551000}],viewerOutcome:"submitted"},account:{id:"exchange-buyer",role:"buyer"},isSeller:false,serverNow:Date.now()}});
  return route.fulfill({status:404,json:{error:"Not found"}});
 });
 await page.goto("/coordination.html?transaction=tx-current&section=auction");
 await expect(page.getByRole("heading",{name:"Linked auction"})).toBeVisible();
 await expect(page.locator("#auction-summary-state")).toHaveText("Open");
 await expect(page.locator("#auction-summary-activity")).toHaveText("Bid submitted");
 await expect(page.locator("#auction-summary-timing")).toContainText("Closes");
 await expect(page.getByRole("link",{name:"Open full Auction page →"})).toHaveAttribute("href",/auction\.html\?transaction=tx-current&id=auction-current/);
 await page.getByRole("link",{name:"Coordination",exact:true}).click();
 await expect(page.locator("#coordination-action-count")).toHaveText("1");
 await expect(page.locator("#coordination-service-count")).toHaveText("1");
 await expect(page.locator("#service-list")).toContainText("Inspection");
 await expect(page.getByRole("textbox",{name:"Message",exact:true})).toBeHidden();
});
