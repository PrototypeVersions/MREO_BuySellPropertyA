import {test,expect} from "@playwright/test";

test("connected deployment still exposes the working illustrative auction",async({page})=>{
  let apiCalls=0;
  await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG={mode:"connected",apiBase:"https://api.mreo.test"};'}));
  await page.route("https://api.mreo.test/**",route=>{apiCalls++;return route.fulfill({status:500,json:{error:"The demo must not call the connected auction API"}});});
  await page.goto("/auction.html");
  await expect(page.locator("[data-mode-label]")).toContainText("Test mode");
  await expect(page.locator("#auction-select option")).toHaveCount(21);
  await expect(page.locator("#auction-title")).toContainText("Maple Ridge Drive");
  await expect(page.locator("#test-controls")).toBeVisible();
  expect(apiCalls).toBe(0);
});

test("My MREO gives Clerk a valid return page for sign-out",async({page})=>{
  await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG={mode:"connected",apiBase:"https://api.mreo.test"};'}));
  await page.route("https://api.mreo.test/**",route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==="/api/v1/config")return route.fulfill({json:{connected:true,authConfigured:true,clerkPublishableKey:"pk_test_Y2xlcmsudGVzdCQ="}});
    if(path==="/api/v1/me")return route.fulfill({json:{id:"user",displayName:"Account User"}});
    if(path==="/api/v1/transactions")return route.fulfill({json:{transactions:[]}});
    return route.fulfill({status:404,json:{error:"Not found"}});
  });
  await page.route("https://clerk.test/**",route=>route.fulfill({contentType:"application/javascript",body:`
    window.__internal_ClerkUICtor=class {};
    window.Clerk={isSignedIn:true,user:{id:"user"},session:{getToken:async()=>"token"},load:async options=>{window.clerkLoadOptions=options;},
      mountUserButton:(element,options)=>{window.userButtonOptions=options;element.innerHTML="<button>Sign out</button>";},
      signOut:async options=>{window.directSignOutOptions=options;}};` }));
  await page.goto("/profile.html?from=account");
  await expect(page.locator("#profile-app")).toBeVisible();
  const accountSections=page.getByRole("navigation",{name:"My MREO sections"});
  await expect(accountSections.getByRole("button")).toHaveText(["Active workspaces","Action needed","Messages","Documents","Past workspaces"]);
  await expect(accountSections.getByRole("link")).toHaveCount(0);
  const current=page.url();
  expect(await page.evaluate(()=>window.clerkLoadOptions.afterSignOutUrl)).toBe(current);
  expect(await page.evaluate(()=>window.userButtonOptions.afterSignOutUrl)).toBe(current);
  await page.evaluate(()=>MreoIdentity.signOut());
  expect(await page.evaluate(()=>window.directSignOutOptions.redirectUrl)).toBe(current);
});

test("the full Coordinate page carries a workspace transaction into its service workflow",async({page})=>{
  await page.route("**/mreo-config.js",route=>route.fulfill({contentType:"application/javascript",body:'window.MREO_CONFIG={mode:"connected",apiBase:"https://api.mreo.test"};'}));
  await page.goto("/coordination.html?workspaceTransaction=tx-42&type=property&address=Riverside+Terrace&stage=planning&demo=1");
  const title=page.locator('#coordination-grid [data-service="title"]');
  await expect(title).toHaveAttribute("href",/workspaceTransaction=tx-42/);
  await expect(title).toHaveAttribute("href",/transaction=tx-42/);
  await expect(title).toHaveAttribute("href",/service=title/);
});
