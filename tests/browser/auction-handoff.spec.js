import {test,expect} from "@playwright/test";

test("closed auction hands the winning buyer into closing before sale completion",async({page})=>{
 await page.goto("/auction.html?id=demo-property&view=buyer&transaction=tx-demo-close");
 const controls=page.locator("#test-controls");
 await expect(controls).toBeVisible();
 if(!(await controls.getAttribute("open"))) await controls.locator("summary").click();
 await page.locator("#test-actor").selectOption("test-buyer-c");
 await page.getByRole("button",{name:"Advance to result"}).click();
 await expect(page.locator("#auction-result")).toContainText("Your bid won");
 const workspace=page.getByRole("link",{name:"Begin closing & coordination →"});
 await expect(workspace).toBeVisible();
 const href=new URL(await workspace.getAttribute("href"),page.url());
 expect(href.searchParams.get("auction")).toBe("demo-property");
 expect(href.searchParams.get("role")).toBe("buyer");
 expect(href.searchParams.get("stage")).toBe("won");
 expect(href.searchParams.get("entry")).toBe("auction");
 expect(href.searchParams.get("workspaceTransaction")).toBe("tx-demo-close");
 expect(href.searchParams.has("perspective")).toBe(false);
 expect(Number(href.searchParams.get("price"))).toBeGreaterThan(0);
 await workspace.click();
 await expect(page).toHaveURL(/coordination\.html\?/);
 await expect(page.locator(".coordination-hero")).toBeHidden();
 await expect(page.locator(".demo-control-strip")).toBeHidden();
 await expect(page.locator(".demo-story")).toHaveCount(0);
 await expect(page.locator("#auction-entry-toolbar")).toBeVisible();
 await expect(page.getByRole("link",{name:"Chat with an MREO agent →"})).toHaveAttribute("href","coordination.html?transaction=tx-demo-close&section=messages&role=buyer");
 await expect(page.locator("#coord-record-title")).toContainText("4218 Maple Ridge Drive");
 await expect(page.locator("#acquisition-heading")).toContainText("Seller acceptance and closing");
 await expect(page.getByRole("link",{name:"What comes next ↓"})).toBeVisible();
 await expect(page.locator('[data-service="title"]')).toBeVisible();
 await expect(page.getByRole("button",{name:/Download acquisition package/i})).toHaveCount(0);
});

test("an older winning-auction URL removes the demo wrapper and recovers its Messages workspace",async({page})=>{
 await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG=Object.freeze({mode:"connected",apiBase:"https://api.mreo.test"});'}));
 await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
  globalThis.MreoIdentity={connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"clerk-user"}),request:async(path)=>{
   if(path==="/api/v1/transactions")return {transactions:[{id:"tx-frisco",title:"9014 Silver Creek Way, Frisco, TX 75035",viewer_role:"agent",property:{id:"demo-frisco",relatedAuctionId:"demo-frisco",demo:true}}]};
   throw Error("Unexpected identity request: "+path);
  }};` }));
 await page.goto("/coordination.html?type=property&auction=demo-frisco&address=9014+Silver+Creek+Way%2C+Frisco%2C+TX+75035&role=buyer&demo=1&perspective=buyer&stage=won");
 await expect(page.locator(".coordination-hero")).toBeHidden();
 await expect(page.locator(".demo-story")).toHaveCount(0);
 await expect(page.locator("#auction-entry-toolbar")).toBeVisible();
 await expect(page.getByRole("link",{name:"Chat with an MREO agent →"})).toHaveAttribute("href","coordination.html?transaction=tx-frisco&section=messages&role=buyer");
 await expect.poll(()=>new URL(page.url()).searchParams.get("workspaceTransaction")).toBe("tx-frisco");
 expect(new URL(page.url()).searchParams.has("perspective")).toBe(false);
});

test("seller can enter closing and carry the seller role into the MREO conversation",async({page})=>{
 await page.goto("/auction.html?id=demo-property&view=seller&transaction=tx-seller-close");
 const controls=page.locator("#test-controls");
 await expect(controls).toBeVisible();
 if(!(await controls.getAttribute("open"))) await controls.locator("summary").click();
 await page.locator("#test-actor").selectOption("test-seller");
 await page.getByRole("button",{name:"Advance to result"}).click();
 const workspace=page.getByRole("link",{name:"Continue seller closing →"});
 await expect(workspace).toBeVisible();
 const href=new URL(await workspace.getAttribute("href"),page.url());
 expect(href.searchParams.get("stage")).toBe("won");
 expect(href.searchParams.get("role")).toBe("seller");
 expect(href.searchParams.get("workspaceTransaction")).toBe("tx-seller-close");
 await workspace.click();
 await expect(page.getByRole("link",{name:"Chat with an MREO agent →"})).toHaveAttribute("href","coordination.html?transaction=tx-seller-close&section=messages&role=seller");
});


test("Fort Worth auction carries the winning buyer profile and property image into Title",async({page})=>{
 const address="7812 Oak Hollow Lane, Fort Worth, TX 76137";
 const image="https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=500&q=80";
 const propertyUrl="/property.html?auction=demo-fort-worth&address="+encodeURIComponent(address)+"&price=319000&image="+encodeURIComponent(image);

 await page.goto(propertyUrl);
 await expect(page.locator("#property-detail-image")).toHaveAttribute("src",image);
 await page.getByRole("link",{name:"Prepare Interest",exact:true}).click();
 await page.locator("#buyer-name").fill("Oak Hollow Buyer LLC");
 await page.locator("#buyer-email").fill("oak-hollow@example.com");
 await page.locator("#buyer-phone").fill("214-555-0188");
 await page.locator("#buyer-purchase-method").selectOption("Cash");
 await page.locator("#buyer-timeline").selectOption("Within 30 days");
 await page.locator("#buyer-confirmation").check();
 await page.getByRole("button",{name:"Submit Buyer Interest",exact:true}).click();
 await expect(page).toHaveURL(/payment\.html\?role=buyer&demo=1$/);
 await page.locator("#payment-consent").check();

 // Create the pre-auction planning record directly to reproduce a stale Coordination state.
 const planning=new URLSearchParams({
   type:"property",auction:"demo-fort-worth",address,price:"319000",image,role:"buyer",stage:"planning",
   accountRole:"buyer",accountName:"Oak Hollow Buyer LLC",accountEmail:"oak-hollow@example.com",
   accountPhone:"214-555-0188",purchaseMethod:"Cash",purchaseTimeline:"Within 30 days"
 });
 await page.goto("/coordination.html?"+planning.toString());
 await expect(page.locator("#coord-record-title")).toHaveText(address);
 await expect(page.locator("#coord-record-image")).toHaveAttribute("src",image);
 await page.goto("/payment.html?role=buyer");
 await expect(page).toHaveURL(/payment\.html\?role=buyer$/);
 await page.locator("#payment-consent").check();

 await page.locator("#payment-submit").click();
 await expect(page).toHaveURL(/auction\.html\?id=demo-fort-worth&view=buyer$/);
 await expect(page.locator("#buyer-identity")).toContainText("Oak Hollow Buyer LLC");
 await page.locator("#bid-amount").fill("5000000");
 await page.locator("#bid-consent").check();
 await page.getByRole("button",{name:"Place bid",exact:true}).click();
 await page.locator("#test-controls summary").click();
 await page.locator("#finish-auction").click();
 await expect(page.locator("#auction-result")).toContainText("Your bid won");

 const workspace=page.getByRole("link",{name:"Begin closing & coordination →"});
 await expect(workspace).toBeVisible();
 const href=new URL(await workspace.getAttribute("href"),page.url());
 expect(href.searchParams.get("accountName")).toBe("Oak Hollow Buyer LLC");
 expect(href.searchParams.get("accountEmail")).toBe("oak-hollow@example.com");
 expect(href.searchParams.get("accountPhone")).toBe("214-555-0188");
 expect(href.searchParams.get("purchaseMethod")).toBe("Cash");
 expect(href.searchParams.get("purchaseTimeline")).toBe("Within 30 days");
 expect(href.searchParams.get("image")).toBe(image);
 expect(href.searchParams.get("price")).toBe("5000000");

 await workspace.click();
 await expect(page.locator("#coord-record-title")).toHaveText(address);
 await expect(page.locator("#coord-record-image")).toHaveAttribute("src",image);
 await expect(page.locator("#acquisition-details")).toContainText("Oak Hollow Buyer LLC");
 await expect(page.locator("#acquisition-details")).toContainText("$5,000,000");

 await page.locator('[data-service="title"]').click();
 await expect(page).toHaveURL(/coordination-service\.html\?/);
 await expect(page.locator("#service-record-title")).toHaveText(address);
 await expect(page.locator("#service-record-image")).toHaveAttribute("src",image);
 await expect(page.locator('input[name="clientAccountName"]')).toHaveValue("Oak Hollow Buyer LLC");
 await expect(page.locator('input[name="clientEmail"]')).toHaveValue("oak-hollow@example.com");
 await expect(page.locator('input[name="clientPhone"]')).toHaveValue("214-555-0188");
 await expect(page.locator('input[name="legalName"]')).toHaveValue("Oak Hollow Buyer LLC");
 await expect(page.locator('input[name="purchaseMethodSource"]')).toHaveValue("Cash");
 await expect(page.locator('select[name="funding"]')).toHaveValue("Cash purchase");
});


test("connected seller closing opens Coordination first with an MREO chat button",async({page})=>{
 await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG=Object.freeze({mode:"connected",apiBase:"https://api.mreo.test"});'}));
 await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
  globalThis.MreoIdentity={
   connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"seller-user"}),openSignIn:async()=>{},
   request:async(path,options={})=>{
    if(path==="/api/v1/transactions"&&options.method==="POST")return {id:"tx-connected-seller"};
    throw Error("Unexpected identity request: "+path);
   }
  };
 `}));
 await page.route("https://api.mreo.test/**",route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path==="/config")return route.fulfill({json:{connected:true,stripeConfigured:false,participationBypass:true,testPayments:true,auctionTestControls:true,defaultDays:1}});
  if(path==="/auctions")return route.fulfill({json:{auctions:[{id:"auction-connected-seller",title:"5555 Richard Ave, Dallas, TX 75206",kind:"property",reserve:501000,status:"closed",endsAt:Date.now()-1000,example:false}]}});
  if(path==="/auctions/auction-connected-seller/handoff"&&route.request().method()==="POST")return route.fulfill({json:{handoffToken:"signed-connected-seller"}});
  if(path==="/auctions/auction-connected-seller")return route.fulfill({json:{
   auction:{id:"auction-connected-seller",title:"5555 Richard Ave, Dallas, TX 75206",kind:"property",minimum:500000,reserve:501000,fee:1000,status:"closed",startsAt:Date.now()-86400000,endsAt:Date.now()-1000,closedAt:Date.now()-900,bidCount:3,winnerId:"test-buyer-c",viewerOutcome:"seller-result",saleCompleted:false,bids:[
    {id:"a",buyerId:"test-buyer-a",label:"Test Buyer A",amount:450900,at:Date.now()-3000},
    {id:"b",buyerId:"test-buyer-b",label:"Test Buyer B",amount:491000,at:Date.now()-2000},
    {id:"c",buyerId:"test-buyer-c",label:"Test Buyer C",amount:521100,at:Date.now()-1000}
   ]},
   account:{id:"exchange-seller",role:"seller",name:"Richard Seller",email:"seller@example.com",submission:{title:"5555 Richard Ave, Dallas, TX 75206",draftId:"draft-richard",details:{sellerPhone:"214-555-0100",saleTimeline:"Within 30 days"}}},
   isSeller:true,canTest:true,serverNow:Date.now()
  }});
  return route.fulfill({status:404,json:{error:"Not found"}});
 });
 await page.addInitScript(()=>{
  sessionStorage.setItem("mreo:v3:/:connected:https://api.mreo.test:seller",JSON.stringify({token:"exchange-seller.secret",id:"exchange-seller",role:"seller"}));
  sessionStorage.setItem("mreo:v3:/:role","seller");
 });
 await page.goto("/auction.html?id=auction-connected-seller&view=seller");
 const workspace=page.getByRole("link",{name:"Continue seller closing →"});
 await expect(workspace).toBeVisible();
 const href=new URL(await workspace.getAttribute("href"),page.url());
 expect(href.pathname).toMatch(/coordination\.html$/);
 expect(href.searchParams.get("auction")).toBe("auction-connected-seller");
 expect(href.searchParams.get("role")).toBe("seller");
 expect(href.searchParams.get("entry")).toBe("auction");
 expect(href.searchParams.get("stage")).toBe("won");
 expect(href.searchParams.get("workspaceTransaction")).toBe("tx-connected-seller");
 expect(href.searchParams.has("transaction")).toBe(false);
 await workspace.click();
 await expect(page.locator("#auction-entry-toolbar")).toBeVisible();
 await expect(page.getByRole("link",{name:"Chat with an MREO agent →"})).toHaveAttribute("href","coordination.html?transaction=tx-connected-seller&section=messages&role=seller");
 await expect(page.locator("#coord-record-title")).toHaveText("5555 Richard Ave, Dallas, TX 75206");
 await expect(page.locator("#acquisition-heading")).toContainText("Seller acceptance and closing");
 await expect(page.locator('[data-service="title"]')).toBeVisible();
});
