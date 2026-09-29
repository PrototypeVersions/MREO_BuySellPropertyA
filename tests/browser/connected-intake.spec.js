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
 expect(intakes[1]).toMatchObject({intake:true,reference:"draft-seller-12345678",role:"seller",kind:"property",mediaKey:"draft-seller-12345678",demo:false});
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
  if(path==="/me")return route.fulfill({json:{id:"auction-account",role:"buyer",name:"Blake Buyer",email:"buyer@example.com",creditCents:paid?100:0,submission:{title:"2605 Preston Meadow Court",auctionId:""}}});
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

test("a seller who activates a listing lands on the full auction rather than a workspace tab",async({page},info)=>{
 await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG=Object.freeze({mode:"connected",apiBase:"https://api.mreo.test"});'}));
 await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
  globalThis.MreoIdentity={connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"seller-user"}),request:async(path,options={})=>{
   if(path==="/api/v1/transactions"&&options.method==="POST")return {id:"tx-seller-live"};
   throw Error("Unexpected identity request: "+path);
  }};` }));
 await page.route("https://api.mreo.test/**",route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==="/config")return route.fulfill({json:{connected:true,stripeConfigured:false,participationBypass:true,testPayments:true}});
  if(path==="/me")return route.fulfill({json:{id:"exchange-seller",role:"seller",name:"Seller",email:"seller@example.com",creditCents:100,submission:{title:"5554 Richard Ave, Dallas, TX 75206",kind:"property",minimum:450000,draftId:"draft-seller-live",auctionId:"auction-seller-live"}}});
  if(path==="/activate")return route.fulfill({json:{auctionId:"auction-seller-live",handoffToken:"signed-intake-token"}});
  if(path==="/auctions")return route.fulfill({json:{auctions:[{id:"auction-seller-live",title:"5554 Richard Ave, Dallas, TX 75206",kind:"property",reserve:451000,status:"active",endsAt:Date.now()+86400000,example:false,mediaKey:"draft-seller-live",details:{propertyCity:"Dallas",propertyState:"TX"}}]}});
  if(path==="/auctions/auction-seller-live")return route.fulfill({json:{auction:{id:"auction-seller-live",title:"5554 Richard Ave, Dallas, TX 75206",kind:"property",minimum:450000,reserve:451000,fee:1000,status:"active",startsAt:Date.now()-1000,endsAt:Date.now()+86400000,days:1,bids:[],bidCount:0,viewerOutcome:"not-participating"},account:{id:"exchange-seller",role:"seller",name:"Seller"},isSeller:true,serverNow:Date.now()}});
  return route.fulfill({status:404,json:{error:"Not found"}});
 });
 await page.addInitScript(()=>sessionStorage.setItem("mreo:v3:/:connected:https://api.mreo.test:seller",JSON.stringify({token:"exchange-seller.secret",id:"exchange-seller",role:"seller"})));
 await page.goto("/payment.html?role=seller&transaction=tx-seller-live");
 await page.getByRole("button",{name:"Auction →"}).click();
 await expect(page).toHaveURL(/auction\.html\?id=auction-seller-live&view=seller&transaction=tx-seller-live$/);
 await expect(page.locator(".page-heading")).toBeVisible();
 await expect(page.getByRole("heading",{name:/A clearer view of every offer/})).toBeVisible();
 await expect(page.locator("#auction-case-context")).toHaveCount(0);
 await expect(page.locator("#auction-title")).toHaveText("5554 Richard Ave, Dallas, TX 75206");
 await page.screenshot({path:info.outputPath("seller-full-auction.png"),fullPage:true});
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
 await page.addInitScript(()=>localStorage.setItem("mreo:v3:/",JSON.stringify({accounts:{local:{id:"local",role:"buyer"}},auctions:{"auction-current":{id:"auction-current",title:"Stale browser auction",sellerId:"seller",kind:"property",minimum:1,reserve:1001,fee:1000,startsAt:1,endsAt:2,days:1,bids:[],status:"closed",demo:true,seeded:3,closedAt:2,winnerId:null,saleCompleted:false}}})));
 await page.goto("/coordination.html?transaction=tx-current&section=auction");
 await expect(page.getByRole("heading",{name:"Linked auction"})).toBeVisible();
 await expect(page.locator("#auction-summary-state")).toHaveText("Open");
 await expect(page.locator("#auction-summary-activity-label")).toHaveText("Your bids");
 await expect(page.locator("#auction-summary-activity")).toHaveText("1 bid submitted");
 await expect(page.locator("#auction-summary-timing")).toContainText("Closes");
 await expect(page.getByRole("link",{name:"Open full Auction page →"})).toHaveAttribute("href",/auction\.html\?transaction=tx-current&id=auction-current/);
 await page.getByRole("link",{name:"Coordination",exact:true}).click();
 await expect(page.locator("#coordination-action-count")).toHaveText("1");
 await expect(page.locator("#coordination-service-count")).toHaveText("1");
 await expect(page.locator("#service-list")).toContainText("Inspection");
 await expect(page.getByRole("textbox",{name:"Message",exact:true})).toBeHidden();
});

test("workspace demo auction summary counts the buyer's real bid and shows win or loss",async({page})=>{
 await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG=Object.freeze({mode:"connected",apiBase:"https://api.mreo.test"});'}));
 await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
  globalThis.MreoIdentity={connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"clerk-user"}),liveUrl:path=>"wss://api.mreo.test"+path,
   request:async(path)=>{
    if(path==="/api/v1/transactions/tx-demo-result")return {id:"tx-demo-result",title:"9014 Silver Creek Way, Frisco, TX 75035",kind:"property",status:"active",property:{id:"demo-frisco",relatedAuctionId:"demo-frisco",demo:true},viewerRole:"agent",participants:[]};
    if(path.endsWith("/tasks"))return {tasks:[]};
    if(path.endsWith("/events"))return {events:[]};
    if(path.endsWith("/services"))return {services:[]};
    if(path.endsWith("/documents"))return {documents:[]};
    if(path.includes("/messages"))return {thread:{kind:"buyer_agent"},messages:[]};
    if(path.endsWith("/live-ticket"))throw Error("Live connection omitted in browser test");
    throw Error("Unexpected identity request: "+path);
   }};` }));
 await page.route("https://api.mreo.test/**",route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==="/config")return route.fulfill({json:{connected:true,stripeConfigured:false,participationBypass:true,testPayments:true}});
  return route.fulfill({status:404,json:{error:"Not found"}});
 });
 await page.addInitScript(()=>{
  const at=Date.now()-60000;
  localStorage.setItem("mreo:v3:/",JSON.stringify({accounts:{
   "test-buyer-a":{id:"test-buyer-a",name:"Test Buyer A",role:"buyer",creditCents:100,test:true},
   "test-buyer-b":{id:"test-buyer-b",name:"Test Buyer B",role:"buyer",creditCents:100,test:true},
   "test-buyer-c":{id:"test-buyer-c",name:"Test Buyer C",role:"buyer",creditCents:100,test:true},
   "test-seller":{id:"test-seller",name:"Test Seller",role:"seller",creditCents:100,test:true}
  },auctions:{"demo-frisco":{id:"demo-frisco",title:"9014 Silver Creek Way, Frisco, TX 75035",sellerId:"test-seller",kind:"property",portfolio:[],portfolioCount:0,minimum:688000,reserve:689000,fee:1000,startsAt:at-60000,endsAt:at,days:1,status:"closed",demo:true,seeded:3,closedAt:at,winnerId:"test-buyer-a",saleCompleted:false,bids:[
   {id:"demo-frisco-seed-0",buyerId:"test-buyer-a",label:"Test Buyer A",amount:620100,at:at-50000},
   {id:"demo-frisco-seed-1",buyerId:"test-buyer-b",label:"Test Buyer B",amount:675300,at:at-40000},
   {id:"demo-frisco-seed-2",buyerId:"test-buyer-c",label:"Test Buyer C",amount:716600,at:at-30000},
   {id:"manual-bid",buyerId:"test-buyer-a",label:"Test Buyer A",amount:725000,at:at-10000}
  ]}}}));
 });
 await page.goto("/coordination.html?transaction=tx-demo-result&section=auction");
 await expect(page.locator("#auction-summary-state")).toHaveText("Closed");
 await expect(page.locator("#auction-summary-activity-label")).toHaveText("Your bids");
 await expect(page.locator("#auction-summary-activity")).toHaveText("1 bid submitted");
 await expect(page.locator("#auction-summary-timing")).toHaveText("You won");
 await page.evaluate(()=>{
  const key="mreo:v3:/",state=JSON.parse(localStorage.getItem(key));
  state.auctions["demo-frisco"].winnerId="test-buyer-c";
  localStorage.setItem(key,JSON.stringify(state));
  dispatchEvent(new Event("mreo:workspace-changed"));
 });
 await expect(page.locator("#auction-summary-timing")).toHaveText("You did not win");
});


test("portfolio buyer interest preserves the portfolio auction relationship",async({page})=>{
 const intakes=[];
 await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG=Object.freeze({mode:"connected",apiBase:"https://api.mreo.test"});'}));
 await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
  globalThis.MreoIdentity={connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"clerk-user"}),openSignIn:async()=>{},
   request:async(path,options={})=>{const response=await fetch("https://identity.mreo.test"+path,options);return response.json();}};
 `}));
 await page.route("https://identity.mreo.test/**",async route=>{
  const body=route.request().postDataJSON();intakes.push(body);
  await route.fulfill({json:{id:"tx-portfolio",title:body.title,status:"active"}});
 });
 await page.route("https://api.mreo.test/**",async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==="/config")return route.fulfill({json:{connected:true,stripeConfigured:false,participationBypass:true,testPayments:true,defaultDays:1}});
  if(path==="/register"){
   const body=request.postDataJSON();
   return route.fulfill({status:201,json:{id:"exchange-buyer",token:"exchange-buyer.secret",role:"buyer",name:body.details.name,email:body.details.email,creditCents:0,submission:{...body.submission,draftId:"draft-portfolio-12345678"}}});
  }
  return route.fulfill({status:404,json:{error:"Not found"}});
 });
 await page.goto("/buyer.html?auction=demo-portfolio&address=Illustrative+REO+portfolio+%C2%B7+150+properties&price=4804450&kind=portfolio&demo=1");
 await page.locator("#buyer-form").evaluate(form=>{
  for(const field of form.querySelectorAll("[required]")){
   if(field.type==="checkbox"||field.type==="radio")field.checked=true;
   else if(field.tagName==="SELECT")field.value=[...field.options].find(option=>option.value)?.value||"";
   else if(!field.value&&field.type==="email")field.value="buyer@example.com";
   else if(!field.value&&field.type==="number")field.value="4804450";
   else if(!field.value)field.value="Portfolio Buyer";
   field.dispatchEvent(new Event("input",{bubbles:true}));field.dispatchEvent(new Event("change",{bubbles:true}));
  }
  form.requestSubmit();
 });
 await expect(page).toHaveURL(/payment\.html\?role=buyer&demo=1&transaction=tx-portfolio$/);
 expect(intakes[0]).toMatchObject({intake:true,role:"buyer",kind:"portfolio",auctionId:"demo-portfolio",title:"Illustrative REO portfolio · 150 properties",demo:true});
});


test("connected buyer selecting the illustrative portfolio lands on its working auction",async({page})=>{
 let paid=false;
 await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG=Object.freeze({mode:"connected",apiBase:"https://api.mreo.test"});'}));
 await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
  globalThis.MreoIdentity={
   connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"clerk-user"}),mountUserButton:async()=>true,openSignIn:async()=>{},
   request:async(path,options={})=>{
    if(path==="/api/v1/transactions"&&options.method==="POST")return {id:"tx-portfolio"};
    throw Error("Unexpected identity request: "+path);
   }
  };
 `}));
 await page.route("https://api.mreo.test/**",async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==="/config")return route.fulfill({json:{connected:true,stripeConfigured:false,participationBypass:true,testPayments:true,defaultDays:1}});
  if(path==="/me")return route.fulfill({json:{id:"auction-account",role:"buyer",name:"Blake Buyer",email:"buyer@example.com",creditCents:paid?100:0,submission:{title:"Illustrative REO portfolio · 150 properties",auctionId:"demo-portfolio",kind:"portfolio",proposedOffer:"4804450"}}});
  if(path==="/checkout"){paid=true;return route.fulfill({json:{paid:true,testBypass:true}});}
  if(path==="/activate")return route.fulfill({json:{auctionId:null,handoffToken:"signed-intake-token"}});
  return route.fulfill({status:404,json:{error:"Not found"}});
 });
 await page.addInitScript(()=>sessionStorage.setItem("mreo:v3:/:connected:https://api.mreo.test:buyer",JSON.stringify({token:"auction-account.secret",id:"auction-account",role:"buyer"})));
 await page.goto("/payment.html?role=buyer&transaction=tx-portfolio");
 await page.getByRole("button",{name:"Auction →"}).click();
 await expect(page).toHaveURL(/auction\.html\?id=demo-portfolio&view=buyer&demo=1&transaction=tx-portfolio$/);
 await expect(page.locator("#auction-title")).toHaveText("Illustrative REO portfolio · 150 properties");
 await expect(page.locator("#auction-content")).toBeVisible();
 await expect(page.getByRole("heading",{name:"No active auction for this property"})).toHaveCount(0);
});


test("connected buyer on a seller-created test auction sees Test the auction controls",async({page})=>{
 await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG=Object.freeze({mode:"connected",apiBase:"https://api.mreo.test"});'}));
 await page.route("https://api.mreo.test/**",route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path==="/config")return route.fulfill({json:{connected:true,stripeConfigured:false,participationBypass:true,testPayments:true,auctionTestControls:true,defaultDays:1}});
  if(path==="/auctions")return route.fulfill({json:{auctions:[{id:"auction-richard",title:"5555 Richard Ave, Dallas, TX 75206",kind:"property",reserve:501000,status:"active",endsAt:Date.now()+86400000,example:false}]}});
  if(path==="/auctions/auction-richard")return route.fulfill({json:{
   auction:{id:"auction-richard",title:"5555 Richard Ave, Dallas, TX 75206",kind:"property",minimum:500000,reserve:501000,fee:1000,status:"active",startsAt:Date.now()-1000,endsAt:Date.now()+86400000,days:1,bids:[{id:"mine",buyerId:"buyer-richard",label:"Austin Myers",amount:10000000,at:Date.now()-500}],bidCount:1,viewerOutcome:"submitted"},
   account:{id:"buyer-richard",role:"buyer",name:"Austin Myers",email:"buyer@example.com",creditCents:100,submission:{title:"5555 Richard Ave, Dallas, TX 75206",auctionId:"auction-richard"}},
   isSeller:false,canTest:true,serverNow:Date.now()
  }});
  return route.fulfill({status:404,json:{error:"Not found"}});
 });
 await page.addInitScript(()=>{
  sessionStorage.setItem("mreo:v3:/:connected:https://api.mreo.test:buyer",JSON.stringify({token:"buyer-richard.secret",id:"buyer-richard",role:"buyer"}));
  sessionStorage.setItem("mreo:v3:/:role","buyer");
 });
 await page.goto("/auction.html?id=auction-richard&view=buyer");
 await expect(page.locator("#test-controls")).toBeVisible();
 await expect(page.locator("#buyer-identity")).toContainText("Austin Myers");
 await expect(page.locator("#bid-history")).toContainText("Austin Myers");
});
