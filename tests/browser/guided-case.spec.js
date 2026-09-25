import {test,expect} from "@playwright/test";

const area=(page,name)=>page.getByRole("navigation",{name:"Property workspace"}).getByRole("link",{name,exact:true});
const noOverflow=async page=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);

test("guided buyer completes a saved story with no connected-service requests",async({page},info)=>{
 const errors=[],external=[];page.on("pageerror",error=>errors.push(error.message));
 page.on("request",request=>{if(!request.url().startsWith("http://127.0.0.1:4173")&&!request.url().startsWith("blob:"))external.push(request.url());});
 await page.goto("/experience.html");
 await page.screenshot({path:info.outputPath("explore.png"),fullPage:true});
 await page.getByRole("link",{name:/Experience as Buyer/}).click();
 await page.getByRole("button",{name:"Confirm test participation"}).click();
 await page.getByRole("button",{name:"Place demonstration bid"}).click();
 await page.getByRole("button",{name:"Advance to sample result"}).click();
 await expect(page.getByRole("textbox")).toHaveCount(0);
 await area(page,"Messages").click();
 await page.getByRole("textbox",{name:"Your message"}).fill("Please review this sample agreement.");
 await page.getByRole("button",{name:"Send demonstration message"}).click();
 await expect(page.locator(".case-message-list")).toContainText("Please review this sample agreement.");
 await page.getByRole("button",{name:"Add sample agreement"}).click();
 const id=await page.locator("[data-file]").first().getAttribute("data-file");
 await page.getByRole("button",{name:"Request sample signature"}).click();
 await page.getByRole("button",{name:"Review & simulate signing"}).last().click();
 await page.getByRole("button",{name:"Simulate my signature"}).click();
 await expect(page.locator("#document-review")).not.toBeVisible();
 await page.screenshot({path:info.outputPath("messages.png"),fullPage:true});await noOverflow(page);
 await area(page,"Files").click();
 await expect(page.locator("[data-file]")).toHaveCount(1);
 await expect(page.locator("[data-file]")).toHaveAttribute("data-file",id);
 await expect(page.locator("[data-file]")).toContainText("Simulated signing complete");
 const downloadPromise=page.waitForEvent("download");
 await page.getByRole("button",{name:"Download sample",exact:true}).click();
 expect((await downloadPromise).suggestedFilename()).toBe("Sample purchase agreement.pdf");
 await area(page,"Coordination").click();
 await expect(page.getByRole("textbox",{name:"Your message"})).toHaveCount(0);
 await page.getByRole("button",{name:"Request sample service"}).click();
 await page.getByRole("button",{name:"Approve sample proposal"}).click();
 await page.getByRole("button",{name:"Simulate report delivery"}).click();
 await area(page,"Files").click();await expect(page.locator("[data-file]")).toHaveCount(2);
 await page.getByRole("button",{name:"Finish demonstration"}).click();
 await expect(page.locator("#case-perspective")).toContainText("complete");
 const run=new URL(page.url()).searchParams.get("run");
 await page.reload();await expect(page.locator("[data-file]")).toHaveCount(2);
 await page.goto("/experience.html");await page.getByRole("link",{name:"Resume demonstration →"}).click();
 expect(new URL(page.url()).searchParams.get("run")).toBe(run);
 await expect(page.locator("#case-tabs [aria-current=page]")).toHaveText("Files");
 await page.getByRole("button",{name:"New demonstration"}).click();
 expect(new URL(page.url()).searchParams.get("run")).not.toBe(run);
 await expect(page.locator("#case-tabs [aria-current=page]")).toHaveText("Auction");
 expect(errors).toEqual([]);expect(external).toEqual([]);await noOverflow(page);
});

test("agent conversations keep sample files and signing events in their original thread",async({page})=>{
 await page.goto("/demo-case.html?perspective=agent&view=messages");
 await page.getByRole("button",{name:"Add sample agreement"}).click();
 await page.getByRole("button",{name:"Seller ↔ MREO"}).click();
 await expect(page.locator("[data-file]")).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole("button",{name:"Seller ↔ MREO"})).toHaveAttribute("aria-pressed","true");
 await area(page,"Files").click();
 await page.getByRole("button",{name:"Request sample signature"}).click();
 await page.getByRole("button",{name:"Review & simulate signing"}).click();
 await page.getByRole("button",{name:"Simulate my signature"}).click();
 await area(page,"Messages").click();await expect(page.locator("[data-file]")).toHaveCount(0);
 await page.getByRole("button",{name:"Buyer ↔ MREO"}).click();
 await expect(page.locator(".case-message-list")).toContainText("Demonstration signing complete");
});

test("Explore and Coordinate remain visible on the current page",async({page})=>{
 for(const path of ["experience.html","demo-case.html","coordination.html?role=provider","profile.html","auction.html"]){
  await page.goto("/"+path);
  const navigation=page.getByRole("navigation",{name:"Main navigation"});
  await expect(navigation.getByRole("link",{name:"Explore",exact:true})).toBeVisible();
  await expect(navigation.getByRole("link",{name:"Coordinate",exact:true})).toBeVisible();
  await noOverflow(page);
 }
});

test("connected Messages Files and Coordination share records without mixing participant threads",async({page},info)=>{
 await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG=Object.freeze({mode:"connected",apiBase:"https://api.mreo.test"});'}));
 await page.route("https://api.mreo.test/**",route=>route.fulfill({json:{connected:true,stripeConfigured:false,participationBypass:true,defaultDays:1}}));
 await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
  const docs=[{id:"buyer-file",filename:"Long_buyer_agreement_"+"details_".repeat(30)+".pdf",visibility:"buyer_agent",status:"available",created_at:1000,content_type:"application/pdf",kind:"agreement",size_bytes:1024},{id:"seller-file",filename:"Seller private.pdf",visibility:"seller_agent",status:"available",created_at:1000,content_type:"application/pdf",kind:"agreement",size_bytes:1024}];
  globalThis.MreoIdentity={connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"staff"}),request:async(path,options={})=>{
   if(path==="/api/v1/transactions/tx-test")return {id:"tx-test",title:"1147 Riverside Terrace",kind:"property",status:"active",viewerRole:"agent",participants:[]};
   if(path.endsWith("/tasks"))return {tasks:[]};
   if(path.endsWith("/services"))return {services:[]};
   if(path.endsWith("/events"))return {events:[{entity_id:"seller-file",entity_type:"document",event_type:"esign.complete",created_at:3000,summary:"Seller signing update"}]};
   if(path.endsWith("/documents")){if(options.method==="POST"){const form=options.body;docs.push({id:"new-file",filename:form.get("file").name,visibility:form.get("visibility"),status:"available",created_at:4000,content_type:"application/pdf",kind:"general",size_bytes:10});}return {documents:docs};}
   if(path.includes("/messages")){const seller=path.includes("seller_agent");return {messages:[{id:"m1",author_role:seller?"seller":"buyer",body:seller?"Seller private message":"Buyer private message",created_at:2000}]};}
   throw Error("Live connection omitted in browser test");
  }};`}));
 await page.goto("/coordination.html?transaction=tx-test");
 const feed=page.locator(".conversation-feed");
 await expect(feed).toContainText("Buyer private message");await expect(feed).not.toContainText("Seller private");
 await expect(feed).not.toContainText("Seller signing update");
 await page.getByRole("textbox",{name:"Message",exact:true}).fill("Unsent buyer draft");
 await page.getByText("Attach a document or PDF",{exact:true}).click();
 await page.locator('input[type="file"]').setInputFiles({name:"Buyer draft.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4 sample")});
 await page.getByRole("button",{name:"Seller ↔ MREO"}).click();
 await expect(page.getByRole("textbox",{name:"Message",exact:true})).toHaveValue("");
 await expect(page.locator('input[type="file"]')).toHaveValue("");
 await expect(feed).toContainText("Seller private message");await expect(feed).not.toContainText("Buyer private");
 await expect(feed).toContainText("Seller signing update");
 await page.locator('input[type="file"]').setInputFiles({name:"New seller document.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4 sample")});
 await page.getByRole("button",{name:"Add to conversation"}).click();
 await expect(feed).toContainText("New seller document.pdf");
 await page.getByRole("button",{name:"Buyer ↔ MREO"}).click();
 await expect(page.getByRole("textbox",{name:"Message",exact:true})).toHaveValue("Unsent buyer draft");
 await expect(feed).not.toContainText("New seller document.pdf");
 await page.screenshot({path:info.outputPath("connected-messages.png"),fullPage:true});await noOverflow(page);
 await area(page,"Files").click();await expect(page.locator("#file-index [data-document-id]")).toHaveCount(3);
 await area(page,"Coordination").click();await expect(page.getByRole("heading",{name:"No connected service requests yet"})).toBeVisible();
 await expect(page.getByRole("textbox",{name:"Message",exact:true})).toBeHidden();await noOverflow(page);
});
