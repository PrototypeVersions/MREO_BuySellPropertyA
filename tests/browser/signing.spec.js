import {test,expect} from "@playwright/test";

async function connected(page,{error=false,canSign=true}={}) {
  await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG={mode:"connected",apiBase:"https://api.mreo.test"};'}));
  await page.route("https://api.mreo.test/**",route=>route.fulfill({json:{connected:true,stripeConfigured:false,participationBypass:true}}));
  await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
    window.providerComplete=false;window.signingCalls=[];
    const document={id:"doc",filename:"Agreement.pdf",visibility:"buyer_agent",status:"signature_pending",content_type:"application/pdf",size_bytes:100,created_at:1,can_sign:${canSign},can_check_signing:true,signing_test_mode:true};
    window.MreoIdentity={connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"buyer"}),request:async(path,options={})=>{
      if(path==="/api/v1/transactions/tx")return {id:"tx",title:"Riverside Terrace",viewerRole:"buyer",kind:"property",status:"active",participants:[]};
      if(path.endsWith("/documents"))return {documents:[{...document,status:providerComplete?"complete":"signature_pending",can_sign:${canSign}&&!providerComplete}]};
      if(path.endsWith("/messages")||path.includes("/messages?"))return {messages:[]};
      if(path.endsWith("/tasks"))return {tasks:providerComplete?[]:[{id:"signature-task",title:"Review and sign Agreement.pdf",type:"esign_signature",status:"action"}]};
      if(path.endsWith("/events"))return {events:[]};
      if(path.endsWith("/services"))return {services:[]};
      if(path.endsWith("/signing-session")){signingCalls.push("session");${error?'throw Error("Provider restricted to private-owner@example.invalid");':'return {url:"https://www.signwell.com/docs/private-test-session",testMode:true};'}}
      if(path.endsWith("/signing-status")){signingCalls.push("status");return {complete:providerComplete,signerStatus:providerComplete?"signed":"pending"};}
      throw Error("Unused test route");
    };window.open=()=>{throw Error("Signing must not use a popup");};`}));
  await page.route("https://static.signwell.com/assets/embedded.js",route=>route.fulfill({contentType:"application/javascript",body:`
    window.SignWellEmbed=class {
      constructor(options){window.signwellOptions=options;}
      open(){window.embedOpened=true;}
      close(){window.embedOpened=false;}
    };`}));
  await page.goto("/coordination.html?transaction=tx&section=files");
}

test("a sample signature requires a name and consent and remains attached after reload",async({page},info)=>{
  await page.goto("/demo-case.html?perspective=buyer&view=messages");
  await page.getByRole("button",{name:"Add sample agreement"}).click();
  await page.getByRole("button",{name:"Request sample signature"}).click();
  await page.getByRole("button",{name:"Review & sign sample"}).last().click();
  const dialog=page.locator("#document-review");
  await page.getByRole("button",{name:"Apply sample signature"}).click();await expect(dialog).toBeVisible();
  await page.getByRole("textbox",{name:"Sample signer name"}).fill("Alex Example");
  await page.getByRole("button",{name:"Apply sample signature"}).click();await expect(dialog).toBeVisible();
  await page.getByRole("checkbox",{name:/adding a sample signature/}).check();
  await page.screenshot({path:info.outputPath("sample-signature.png"),fullPage:true});
  await page.getByRole("button",{name:"Apply sample signature"}).click();await expect(dialog).toBeHidden();
  await page.getByRole("navigation",{name:"Property workspace"}).getByRole("link",{name:"Files",exact:true}).click();
  await page.reload();await expect(page.locator("#case-view")).toContainText("Sample signature saved");
  await page.getByRole("button",{name:"Preview PDF"}).click();
  await expect(dialog.locator(".sample-signature-preview")).toHaveText("Alex Example");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test("connected signing embeds SignWell and only a server confirmation completes the document",async({page})=>{
  const errors=[];page.on("pageerror",error=>errors.push(error.message));await connected(page);
  await page.getByRole("button",{name:"Review & Sign"}).click();
  await expect.poll(()=>page.evaluate(()=>window.embedOpened)).toBe(true);
  expect(await page.evaluate(()=>({showHeader:signwellOptions.showHeader,allowRedirect:signwellOptions.allowRedirect,signatureDefaultName:signwellOptions.signatureDefaultName}))).toEqual({showHeader:false,allowRedirect:false,signatureDefaultName:false});
  await expect(page.locator("#workspace-signing-notice")).toContainText("SignWell test signing");
  await page.evaluate(()=>signwellOptions.events.completed());
  await expect(page.locator("#workspace-signing-notice")).toContainText("not complete yet");
  await expect(page.getByRole("button",{name:"View signed test PDF"})).toHaveCount(0);
  await page.evaluate(()=>{providerComplete=true;});
  await page.getByRole("button",{name:"Check signing status"}).click();
  await expect(page.getByRole("button",{name:"View signed test PDF"})).toBeVisible();
  await expect(page.locator("#workspace-signing-notice")).toContainText("Signing is complete");
  expect(await page.evaluate(()=>signingCalls)).toEqual(["session","status","status"]);expect(errors).toEqual([]);
});

test("signing errors in Files show a useful message without exposing email addresses",async({page})=>{
  await connected(page,{error:true});await page.getByRole("button",{name:"Review & Sign"}).click();
  await expect(page.locator("#workspace-signing-notice")).toBeVisible();
  await expect(page.locator("#workspace-signing-notice")).toContainText("contact MREO");
  await expect(page.locator("body")).not.toContainText("private-owner@example.invalid");
  await expect(page.getByRole("button",{name:"Review & Sign"})).toBeEnabled();
});

test("non-signers cannot launch a signature and signature tasks cannot be manually marked complete",async({page})=>{
  await connected(page,{canSign:false});
  await expect(page.locator("#file-index")).toContainText("Waiting for the selected signers");
  await expect(page.getByRole("button",{name:"Review & Sign"})).toHaveCount(0);
  await page.getByRole("navigation",{name:"Property workspace"}).getByRole("link",{name:"Coordination",exact:true}).click();
  await expect(page.getByRole("button",{name:"Mark complete"})).toHaveCount(0);
  await expect(page.locator("#coordination-tasks").getByRole("link",{name:"View signing request"})).toBeVisible();
});

test("provider SDK failures are retryable without claiming a signature",async({page})=>{
  await connected(page);let count=0;
  await page.route("https://static.signwell.com/assets/embedded.js",route=>{count++;return count===1?route.abort():route.fulfill({contentType:"application/javascript",body:'window.SignWellEmbed=class {open(){window.embedOpened=true;}close(){}};'});});
  await page.getByRole("button",{name:"Review & Sign"}).click();
  await expect(page.locator("#workspace-signing-notice")).toContainText("could not load");
  await page.getByRole("button",{name:"Review & Sign"}).click();
  await expect.poll(()=>page.evaluate(()=>window.embedOpened)).toBe(true);
  await expect(page.getByRole("button",{name:"View signed test PDF"})).toHaveCount(0);
});
