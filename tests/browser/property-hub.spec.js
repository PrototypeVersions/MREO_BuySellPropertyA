import {test,expect} from "@playwright/test";

async function seed(page) {
  return page.evaluate(async()=>{
    const {createScenario,act,saveScenario,namespace}=await import("/demo-store.js");
    const prefix=namespace(location.pathname),runs=[];
    for(const [index,role] of ["buyer","seller","provider"].entries()){
      const run=createScenario(role);
      if(index===2)run.property.title="820 Willow Lane, Austin, TX";
      if(index===0)act(run,"sampleDocument",{kind:"agreement"});
      run.updatedAt=Date.UTC(2026,8,26+index);run.lastView=index===0?"files":"coordination";
      saveScenario(localStorage,prefix,run);runs.push(run.id);
    }
    return runs;
  });
}
test("the empty property list explains how to begin without inventing a workspace",async({page})=>{
  await page.goto("/my-properties.html");
  await expect(page.getByRole("heading",{name:"Your next chapter starts here."})).toBeVisible();
  await expect(page.getByRole("link",{name:"Find a property"})).toHaveAttribute("href","properties.html");
  await expect(page.getByRole("link",{name:"Start a demonstration"})).toHaveAttribute("href","experience.html");
  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
});
test("saved property list preserves every run and returns to its original tab",async({page},info)=>{
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/my-properties.html");const runs=await seed(page);
  const before=await page.evaluate(()=>({...localStorage}));await page.reload();
  await expect(page.locator(".hub-property")).toHaveCount(2);
  expect(await page.evaluate(()=>({...localStorage}))).toEqual(before);
  const riverside=page.locator(".hub-property").filter({hasText:"1147 Riverside Terrace"});
  await expect(riverside.locator(".hub-property-link")).toHaveAttribute("href",`demo-case.html?run=${runs[1]}&view=coordination`);
  await expect(riverside).toContainText("1 other saved demonstration");
  await page.screenshot({path:info.outputPath("my-properties.png"),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByRole("searchbox",{name:"Search your properties"}).fill("willow");
  await expect(page.locator(".hub-property")).toHaveCount(1);
  await page.getByRole("searchbox").fill("missing address");
  await expect(page.getByRole("heading",{name:"No matching properties"})).toBeVisible();
  await page.getByRole("button",{name:"Clear search"}).click();
  await riverside.locator(".hub-property-link").click();
  expect(new URL(page.url()).searchParams.get("run")).toBe(runs[1]);
  await expect(page.locator("#case-tabs [aria-current=page]")).toHaveText("Coordination");
  await page.getByRole("link",{name:"← My properties",exact:true}).click();
  await riverside.locator("summary").click();
  await riverside.locator(".hub-sessions a").click();
  expect(new URL(page.url()).searchParams.get("run")).toBe(runs[0]);
  await expect(page.locator("#case-tabs [aria-current=page]")).toHaveText("Files");
  await expect(page.locator("[data-file]")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("account workspaces stay separate from samples and stale account responses cannot reappear",async({page},info)=>{
  await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
    let user={id:"a"},listener;
    window.hubRequests=[];window.hubPending=[];window.hubSignIns=0;
    window.changeHubUser=next=>{user=next;listener?.({user});};
    window.MreoIdentity={connected:()=>true,currentUser:async()=>user,init:async()=>({addListener:callback=>{listener=callback;}}),
      openSignIn:async()=>{window.hubSignIns++;},request:(path,options={})=>{
        window.hubRequests.push({path,method:options.method||"GET"});
        return new Promise(resolve=>window.hubPending.push(resolve));
      }};`}));
  await page.goto("/my-properties.html");await seed(page);await page.reload();
  await expect.poll(()=>page.evaluate(()=>hubPending.length)).toBe(1);
  await page.evaluate(()=>hubPending.shift()({transactions:[
    {id:"tx-a",title:"1147 Riverside Terrace, Irving, TX 75062",kind:"property",status:"active",viewer_role:"buyer",updated_at:Date.UTC(2026,8,28)},
    {id:"tx-a",title:"1147 Riverside Terrace, Irving, TX 75062",kind:"property",status:"active",viewer_role:"seller",updated_at:Date.UTC(2026,8,28)}
  ]}));
  await expect(page.locator('.hub-property[data-source="account"]')).toHaveCount(1);
  await expect(page.locator('.hub-property[data-source="demo"]')).toHaveCount(2);
  await expect(page.locator('[data-source="account"]')).toContainText("Buyer / Seller");
  await expect(page.locator('[data-source="account"] .hub-property-link')).toHaveAttribute("href","coordination.html?transaction=tx-a&section=messages");
  await page.screenshot({path:info.outputPath("my-properties-account.png"),fullPage:true});
  expect(await page.evaluate(()=>Object.values(localStorage).some(value=>value.includes('"tx-a"')))).toBe(false);
  await page.evaluate(()=>changeHubUser({id:"b"}));
  await expect(page.locator('[data-source="account"]')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>hubPending.length)).toBe(1);
  await page.evaluate(()=>{changeHubUser(null);hubPending.shift()({transactions:[{id:"tx-b",title:"Previous account property",updated_at:1}]});});
  await expect(page.getByRole("button",{name:"Sign in or create account"})).toBeVisible();
  await expect(page.locator('[data-source="account"]')).toHaveCount(0);
  await expect(page.locator('[data-source="demo"]')).toHaveCount(2);
  await page.getByRole("button",{name:"Sign in or create account"}).click();
  expect(await page.evaluate(()=>hubSignIns)).toBe(1);
  expect(await page.evaluate(()=>hubRequests)).toEqual([{path:"/api/v1/transactions",method:"GET"},{path:"/api/v1/transactions",method:"GET"}]);
});

test("account errors and corrupt saved records do not block healthy demonstrations",async({page})=>{
  await page.route("**/mreo-identity.js*",route=>route.fulfill({contentType:"application/javascript",body:`
    window.MreoIdentity={connected:()=>true,init:async()=>({}),currentUser:async()=>({id:"a"}),request:async()=>{throw Error("offline");}};`}));
  await page.goto("/my-properties.html");await seed(page);
  await page.evaluate(()=>localStorage.setItem("mreo:guided-demo:v1:/run:broken","{"));
  await page.reload();
  await expect(page.locator("#hub-account-status")).toContainText("could not load");
  await expect(page.locator(".hub-property")).toHaveCount(2);
  await page.locator(".hub-property-link").first().click();
  await expect(page.locator("#case-tabs a")).toHaveText(["Auction","Messages","Coordination","Files"]);
});
