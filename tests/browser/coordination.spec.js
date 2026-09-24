import {test,expect} from "@playwright/test";

test("property detail keeps Buyer on the interest pathway before Coordination",async({page})=>{
 await page.goto("/properties.html");
 const first=page.locator(".property-marketplace > .property-row").first();
 const thumbnail=await first.locator(".property-thumbnail img").getAttribute("src");
 await first.getByRole("link",{name:"View / Prepare Interest",exact:true}).click();
 await expect(page).toHaveURL(/property\.html\?/);
 await expect(page.locator("#property-detail-image")).toHaveAttribute("src",thumbnail);
 await expect(page.getByRole("heading",{name:"Prepare buyer interest",exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"Prepare Interest"})).toBeVisible();
 await expect(page.getByRole("link",{name:"Coordinate This Property"})).toHaveCount(0);
});

test("Turkey property uses the standard hero, gallery, video, and coordination layout",async({page})=>{
 await page.goto("/turkey-property.html");
 await expect(page.locator(".single-property-media img")).toHaveAttribute("src","assets/turkey/photos/videoframe_18959.webp");
 await expect(page.getByRole("heading",{name:"Additional images",exact:true})).toBeVisible();
 await expect(page.locator(".seller-media-grid figure")).toHaveCount(6);
 await expect(page.locator('.seller-media-grid img[src*="videoframe_18959"]')).toHaveCount(0);
 await expect(page.getByRole("heading",{name:"Property videos",exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"Watch the YouTube video"})).toHaveAttribute("href","https://www.youtube.com/watch?v=MUdBlpLWFEY");
 await expect(page.getByRole("heading",{name:"Prepare buyer interest",exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"Coordinate This Property"})).toHaveCount(0);
 await expect(page.getByRole("link",{name:"Prepare Interest",exact:true})).toBeVisible();
});

test("coordination request is the same object across buyer and service partner views",async({page})=>{
 const base="/coordination.html?type=property&auction=coord-cross-role&address=4218%20Maple%20Ridge%20Drive%2C%20Dallas%2C%20TX%2075229&price=385000";
 await page.goto(base);
 await page.evaluate(()=>localStorage.removeItem("mreo:coordination:v3:coord-cross-role"));
 await page.reload();
 await page.locator('[data-service="contractors"]').click();
 await expect(page).toHaveURL(/service=contractors/);
 await expect(page.locator("#service-record-title")).toContainText("4218 Maple Ridge Drive");
 await expect(page.locator("#service-submit")).toBeVisible();
 await page.locator("#service-submit").click();
 await expect(page.locator("#client-request-status")).toBeVisible();
 await expect.poll(async()=>Math.abs(await page.locator("#service-attention-v5").evaluate(el=>el.getBoundingClientRect().top)),{timeout:2500}).toBeLessThan(120);
 await expect(page.locator("#client-status-pill")).toHaveText("Submitted");
 await expect(page.locator("#client-request-summary")).toContainText("$30,000");

 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator("#provider-service-panel")).toBeVisible();
 await expect(page.locator("#provider-request-detail")).toBeVisible();
 await expect(page.locator("#provider-request-summary")).toContainText("$30,000");
 await page.getByRole("button",{name:"Accept request"}).click();
 await expect(page.locator("#provider-status-pill")).toHaveText("Provider reviewing");
 await page.getByRole("link",{name:"Prepare provider response →"}).click();
 await expect(page).toHaveURL(/coordination-response\.html\?/);
 await expect(page.locator("#response-attention-v6 .attention-state")).toHaveText("Action needed");
 await expect(page.locator("#response-attention-v6 .attention-title")).toContainText("Prepare the provider response");
 await expect(page.locator('input[name="totalPrice"]')).toHaveValue("$28,400");
 await expect(page.locator('textarea[name="lineItems"]')).toContainText("Flooring");
 await page.getByRole("button",{name:"Send response to client"}).click();
 await expect(page.locator("#response-attention-v6 .attention-state")).toHaveText("Waiting");
 await expect(page.locator("#response-attention-v6 .attention-title")).toContainText("Waiting for buyer review");
 await page.getByRole("button",{name:"Seller",exact:true}).click();
 await expect(page.locator("#response-attention-v6 .attention-state")).toHaveText("Waiting");
 await expect(page.getByRole("button",{name:"Approve response"})).toHaveCount(0);
 await page.getByRole("button",{name:"Buyer",exact:true}).click();
 await expect(page.locator("#response-attention-v6 .attention-state")).toHaveText("Action needed");
 await expect(page.locator("#response-attention-v6 .attention-title")).toContainText("Review the provider response");
 await expect(page.getByRole("heading",{name:"Review provider response"})).toBeVisible();
 await expect(page.locator("#client-response-details")).toContainText("$28,400");
 await expect(page.locator("#client-response-details")).toContainText("24 calendar days");
 await page.getByRole("button",{name:"Approve response"}).click();
 await expect(page).toHaveURL(/coordination-service\.html\?/);
 await expect(page.locator("#client-status-pill")).toHaveText("Approved");
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Waiting");

 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Action needed");
 await page.getByRole("button",{name:"Start work"}).click();
 await expect(page.locator("#provider-status-pill")).toHaveText("In progress");
 await page.getByRole("button",{name:"Mark complete"}).click();
 await expect(page.locator("#provider-status-pill")).toHaveText("Complete");
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Complete");
 await expect(page.locator("#service-document-library")).toContainText("Construction completion");
});


test("client can request provider-response changes and provider can revise the same response",async({page})=>{
 const base="/coordination.html?type=property&auction=coord-response-revision&address=4218%20Maple%20Ridge%20Drive%2C%20Dallas%2C%20TX%2075229&price=385000";
 await page.goto(base);
 await page.evaluate(()=>localStorage.removeItem("mreo:coordination:v3:coord-response-revision"));
 await page.reload();
 await page.locator('[data-service="rentals"]').click();
 await page.locator("#service-submit").click();
 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await page.getByRole("button",{name:"Accept request"}).click();
 await page.getByRole("link",{name:"Prepare provider response →"}).click();
 await expect(page.locator('input[name="managementFee"]')).toHaveValue(/8%/);
 await page.locator('input[name="managementFee"]').fill("7% of collected monthly rent — revised demonstration term");
 await page.getByRole("button",{name:"Send response to client"}).click();
 await page.getByRole("button",{name:"Buyer",exact:true}).click();
 await expect(page.locator("#client-response-details")).toContainText("7% of collected monthly rent");
 await page.getByRole("button",{name:"Request changes"}).click();
 await page.locator("#revision-request-note").fill("Please reduce the routine maintenance authority threshold.");
 await page.getByRole("button",{name:"Send change request"}).click();
 await expect(page).toHaveURL(/coordination-service\.html\?/);
 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.getByRole("link",{name:"Revise provider response →"})).toBeVisible();
 await page.getByRole("link",{name:"Revise provider response →"}).click();
 await expect(page.locator(".response-revision-banner")).toContainText("reduce the routine maintenance authority threshold");
 await page.locator('input[name="maintenanceAuthority"]').fill("Up to $250 per incident without additional owner approval — revised demonstration term");
 await page.getByRole("button",{name:"Send revised response to client"}).click();
 await page.getByRole("button",{name:"Buyer",exact:true}).click();
 await expect(page.locator("#response-version")).toHaveText("Revision 2");
 await expect(page.locator("#client-response-details")).toContainText("$250 per incident");
});

test("all four coordination pathways can be submitted and appear in the provider inbox",async({page})=>{
 const base="/coordination.html?type=property&auction=coord-all-paths&address=4218%20Maple%20Ridge%20Drive%2C%20Dallas%2C%20TX%2075229&price=385000";
 await page.goto(base);
 await page.evaluate(()=>localStorage.removeItem("mreo:coordination:v3:coord-all-paths"));
 await page.reload();
 for(const service of ["title","contractors","realtors","rentals"]){
  await page.locator(`[data-service="${service}"]`).click();
 await expect(page).toHaveURL(/coordination-service\.html\?/);
  await page.locator("#service-submit").click();
  await expect(page.locator("#client-request-status")).toBeVisible();
  await page.goto(base);
  await expect(page.locator(`[data-service="${service}"] .service-status`)).not.toHaveText("Not started");
 }
 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator('#provider-queue .provider-job[data-provider-source="live"]')).toHaveCount(4);
 await expect(page.locator("#provider-inbox-count")).toHaveText("4");
});

test("coordination keeps property records connected without unnecessary downloads",async({page})=>{
 await page.goto("/coordination.html?auction=coord-docs&address=4218%20Maple%20Ridge%20Drive%2C%20Dallas%2C%20TX%2075229&price=385000");
 await page.evaluate(()=>localStorage.removeItem("mreo:coordination:v3:coord-docs"));
 await page.reload();
 await expect(page.locator("#coord-document-library .document-item")).toHaveCount(3);
 await expect(page.locator("#coord-document-library")).toContainText("Connected");
 await expect(page.getByRole("button",{name:/Download acquisition package/i})).toHaveCount(0);
 await expect(page.getByRole("link",{name:"What comes next ↓"})).toBeVisible();
 await page.getByRole("button",{name:"Seller",exact:true}).click();
 await expect(page.locator("#role-workspace-title")).toContainText("Closing, transfer");
 await expect(page.locator("#acquisition-details")).toContainText("Winning buyer");
});

test("title workflow rotates action across buyer seller and service partner",async({page})=>{
 const base="/coordination.html?type=property&auction=coord-title-buyer&address=2605%20Preston%20Meadow%20Court%2C%20Plano%2C%20TX%2075093&price=2000000&stage=won";
 await page.goto(base);
 await page.evaluate(()=>localStorage.removeItem("mreo:coordination:v3:coord-title-buyer"));
 await page.reload();
 await expect(page.locator("#acquisition-heading")).toContainText("Seller acceptance and closing");
 await page.locator('[data-service="title"]').click();

 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Action needed");
 await page.locator("#service-submit").click();
 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Action needed");
 await page.getByRole("button",{name:"Accept request"}).click();
 await expect(page.locator("#provider-company-logo")).toBeVisible();
 await expect(page.locator("#provider-company-logo")).toHaveAttribute("src",/northstar-title-settlement\.png$/);
 await page.getByRole("link",{name:"Prepare provider response →"}).click();
 await expect(page.locator("#response-provider-logo")).toBeVisible();
 await expect(page.locator("#response-provider-logo")).toHaveAttribute("src",/northstar-title-settlement\.png$/);
 await expect(page.locator('input[name="totalCharges"]')).toHaveValue("$2,150");
 await expect(page.locator('textarea[name="requirements"]')).toContainText("Seller:");
 await page.getByRole("button",{name:"Send response to client"}).click();

 await page.getByRole("button",{name:"Buyer",exact:true}).click();
 await expect(page.locator("#response-attention-v6 .attention-state")).toHaveText("Action needed");
 await page.getByRole("button",{name:"Approve response"}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Waiting");

 await page.getByRole("button",{name:"Seller",exact:true}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Action needed");
 await expect(page.getByRole("button",{name:"Confirm seller title / payoff information"})).toBeVisible();
 await page.getByRole("button",{name:"Confirm seller title / payoff information"}).click();

 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Action needed");
 await page.getByRole("button",{name:"Begin closing preparation"}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Waiting");

 await page.getByRole("button",{name:"Buyer",exact:true}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Action needed");
 await page.getByRole("button",{name:"Confirm buyer closing / signing complete"}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Waiting");

 await page.getByRole("button",{name:"Seller",exact:true}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Action needed");
 await page.getByRole("button",{name:"Confirm seller closing / signing complete"}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Waiting");

 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Action needed");
 await page.getByRole("button",{name:"Finalize transfer / mark complete"}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Complete");

 await page.getByRole("button",{name:"Buyer",exact:true}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Complete");
 await page.getByRole("button",{name:"Seller",exact:true}).click();
 await expect(page.locator("#service-attention-v5 .attention-state")).toHaveText("Complete");
});

test("seller-created property listings are routed through the detail page",async({page})=>{
 await page.goto("/properties.html");
 await page.evaluate(()=>{
  const host=document.querySelector(".property-marketplace");
  const row=document.createElement("article");
  row.className="property-row";
  row.innerHTML=`<div class="property-thumbnail"><img src="assets/property-placeholder.svg" alt="Property awaiting seller photographs"></div><div class="property-main-info"><p class="property-location">Your test listing</p><h2>1 Seller Lane, Test City, TX 75000</h2><p>As-is property</p></div><div class="property-facts"><div><span class="property-fact-label">Required bid</span><strong>$101,000</strong></div></div><div class="property-action"><a class="primary-button" href="auction.html?id=seller-created-test">View auction</a></div>`;
  host.appendChild(row);
 });
 const row=page.locator('.property-row').last();
 const link=row.getByRole("link",{name:"View / Prepare Interest",exact:true});
 await expect(link).toHaveAttribute("href",/property\.html\?/);
 await link.click();
 await expect(page).toHaveURL(/property\.html\?/);
 const detailUrl=new URL(page.url());
 expect(detailUrl.searchParams.get("auction")).toBe("seller-created-test");
 expect(detailUrl.searchParams.get("address")).toBe("1 Seller Lane, Test City, TX 75000");
 expect(detailUrl.searchParams.get("price")).toBe("101000");
 await expect(page.locator("#property-detail-address")).toHaveText("1 Seller Lane, Test City, TX 75000");
 await expect(page.locator("#property-detail-price")).toHaveText("$101,000");
 const interest=page.getByRole("link",{name:"Prepare Interest"});
 await expect(interest).toHaveAttribute("href",/auction=seller-created-test/);
 await expect(page.getByRole("link",{name:"Coordinate This Property"})).toHaveCount(0);
 await expect(page.getByRole("heading",{name:"Prepare buyer interest",exact:true})).toBeVisible();
});

test("seller-created listing uses one fixed hero, remaining images, and videos",async({page})=>{
 await page.goto("/seller.html");
 const created=await page.evaluate(async()=>{
  const submission={title:"77 Seller Media Way, Dallas, TX 75201",kind:"property",minimum:200000,days:1,portfolio:[],details:{propertyCity:"Dallas",propertyState:"TX",propertySize:"1800",propertyBedrooms:"3",propertyBathrooms:"2",propertyType:"Single-family home"}};
  const account=await MreoService.register("seller",{name:"Media Seller",email:"media-seller@example.com"},submission);
  const png=new File([new Uint8Array([137,80,78,71,13,10,26,10])],"front.png",{type:"image/png"});
  const jpg=new File([new Uint8Array([255,216,255,217])],"back.jpg",{type:"image/jpeg"});
  const mp4=new File([new Uint8Array([0,0,0,24,102,116,121,112])],"walkthrough.mp4",{type:"video/mp4"});
  await MreoService.saveMedia(account.submission.draftId,[png,jpg,mp4]);
  await MreoService.checkout("seller",true);return await MreoService.activate("seller");
 });
 await page.goto("/properties.html");
 const row=page.locator("#new-listings .property-row").filter({hasText:"77 Seller Media Way"});
 await expect(row.getByRole("link",{name:"View / Prepare Interest"})).toBeVisible();
 await expect.poll(async()=>await row.locator(".property-thumbnail img").getAttribute("src")).toMatch(/^blob:/);
 await expect(row.locator(".property-thumbnail img")).toHaveAttribute("data-primary-media-name","front.png");
 await row.getByRole("link",{name:"View / Prepare Interest"}).click();
 expect(new URL(page.url()).searchParams.get("auction")).toBe(created.auctionId);
 await expect(page.locator("#property-detail-image")).toHaveAttribute("src",/^blob:/);
 await expect(page.locator("#property-detail-image")).toHaveAttribute("data-primary-media-name","front.png");
 await expect(page.locator("#seller-media-section")).toBeVisible();
 await expect(page.locator("#seller-media-gallery img")).toHaveCount(1);
 await expect(page.locator("#seller-media-gallery")).toContainText("back.jpg");
 await expect(page.locator("#seller-media-gallery")).not.toContainText("front.png");
 await expect(page.locator("#seller-media-gallery video")).toHaveCount(0);
 await expect(page.locator("#property-videos-section")).toBeVisible();
 await expect(page.locator("#property-video-gallery video")).toHaveCount(1);
 await expect(page.locator("#property-video-gallery")).toContainText("walkthrough.mp4");
 const interest=page.getByRole("link",{name:"Prepare Interest"});
 expect(new URL(await interest.getAttribute("href"),page.url()).searchParams.get("auction")).toBe(created.auctionId);
 await expect(page.getByRole("link",{name:"Coordinate This Property"})).toHaveCount(0);

 await interest.click();
 await page.locator("#buyer-name").fill("Media Property Buyer");
 await page.locator("#buyer-email").fill("media-property-buyer@example.com");
 await page.locator("#buyer-confirmation").check();
 await page.getByRole("button",{name:"Submit Buyer Interest",exact:true}).click();
 await expect(page).toHaveURL(/payment\.html\?role=buyer$/);
 await expect(page.getByRole("link",{name:"Coordinate →"})).toHaveCount(0);
 await page.locator("#payment-consent").check();
 await page.locator("#payment-submit").click();
 await expect(page).toHaveURL(new RegExp("auction\\.html\\?id="+created.auctionId+"&view=buyer"));
 await page.locator("#bid-amount").fill("250000");
 await page.locator("#bid-consent").check();
 await page.getByRole("button",{name:"Place bid",exact:true}).click();
 await page.locator("#test-controls summary").click();
 await page.locator("#finish-auction").click();
 await expect(page.locator("#auction-result")).toContainText("Your bid won");
 await page.getByRole("link",{name:"Begin closing & coordination →"}).click();
 await expect(page).toHaveURL(/coordination\.html\?/);
 await expect.poll(async()=>await page.locator("#coord-record-image").getAttribute("src")).toMatch(/^blob:/);
 await expect(page.locator("#coord-record-image")).toHaveAttribute("data-primary-media-name","front.png");
 await page.locator('[data-service="title"]').click();
 await expect.poll(async()=>await page.locator("#service-record-image").getAttribute("src")).toMatch(/^blob:/);
 await expect(page.locator("#service-record-image")).toHaveAttribute("data-primary-media-name","front.png");
 await page.locator("#service-submit").click();
 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await page.getByRole("button",{name:"Accept request"}).click();
 await page.getByRole("link",{name:"Prepare provider response →"}).click();
 await expect.poll(async()=>await page.locator("#response-record-image").getAttribute("src")).toMatch(/^blob:/);
 await expect(page.locator("#response-record-image")).toHaveAttribute("data-primary-media-name","front.png");
});


test("coordination hub scopes provider attention and demo work to the active property",async({page})=>{
 const base="/coordination.html?type=property&auction=coord-v5-hub&address=4218%20Maple%20Ridge%20Drive%2C%20Dallas%2C%20TX%2075229&price=385000";
 await page.goto(base);
 await page.evaluate(()=>{localStorage.removeItem("mreo:coordination:v3:coord-v5-hub");localStorage.removeItem("mreo:coordination:provider-demo:v2");});
 await page.reload();
 await expect(page.locator('[data-service="contractors"] h2')).toHaveText("Contractors");
 await expect(page.locator('[data-service="realtors"] h2')).toHaveText("Realtors");
 await expect(page.locator("#acquisition-primary-action")).toHaveText("What comes next ↓");
 await expect(page.locator("#acquisition-primary-action")).toHaveAttribute("href","#coordination-pathways");
 await expect(page.locator("#coord-attention-v5")).toBeVisible();
 await expect(page.locator("#coord-attention-v5 .attention-state")).toHaveText("Action needed");
 await expect(page.locator(".workspace-stats")).toBeHidden();
 await expect(page.locator("#coordination-timeline").locator("xpath=ancestor::article[1]")).toBeHidden();

 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator(".provider-summary-grid")).toBeHidden();
 await expect(page.locator("#coord-attention-v5 .attention-state")).toHaveText("Waiting");
 await expect(page.locator("#coord-attention-v5 .attention-copy")).toContainText("4218 Maple Ridge Drive");
 await expect(page.locator("#coord-attention-v5 .attention-copy")).not.toContainText("2605 Preston Meadow");
 await expect(page.locator("#provider-queue [data-v5-provider-row]")).toHaveCount(1);
 await expect(page.locator("#provider-queue")).toContainText("4218 Maple Ridge Drive");
 await expect(page.locator("#provider-queue")).not.toContainText("2605 Preston Meadow");
 await expect(page.locator("#provider-queue")).not.toContainText("940 Hickory Grove");
});

test("coordination reuses buyer information and offers service-specific provider choices",async({page})=>{
 const url="/coordination-service.html?type=property&auction=coord-v5-prefill&address=2605%20Preston%20Meadow%20Court%2C%20Plano%2C%20TX%2075093&price=2000000&service=title&role=buyer&accountName=Acquisition%20Buyer%20LLC&accountEmail=buyer%40example.com&accountPhone=214-555-0199&purchaseMethod=Cash";
 await page.goto(url);
 await page.evaluate(()=>localStorage.removeItem("mreo:coordination:v3:coord-v5-prefill"));
 await page.reload();
 await expect(page.locator(".carried-forward-panel")).toBeVisible();
 await expect(page.locator('input[name="clientAccountName"]')).toHaveValue("Acquisition Buyer LLC");
 await expect(page.locator('input[name="clientEmail"]')).toHaveValue("buyer@example.com");
 await expect(page.locator('input[name="legalName"]')).toHaveValue("Acquisition Buyer LLC");
 await expect(page.locator('select[name="funding"]')).toHaveValue("Cash purchase");
 const provider=page.locator('select[name="providerPreference"]');
 await expect(provider.locator("option")).toHaveCount(4);
 await expect(provider).toContainText("Match me with a participating provider");
 await expect(provider).toContainText("Meridian Closing Services");
 await expect(provider).toContainText("Lone Oak Title");
});

test("selected provider follows a submitted request into the Service Partner view",async({page})=>{
 const url="/coordination-service.html?type=property&auction=coord-v5-provider&address=940%20Hickory%20Grove%20Road%2C%20Denton%2C%20TX%2076209&price=354000&service=contractors&role=buyer&accountName=Hickory%20Grove%20Properties";
 await page.goto(url);
 await page.evaluate(()=>localStorage.removeItem("mreo:coordination:v3:coord-v5-provider"));
 await page.reload();
 const provider=page.locator('select[name="providerPreference"]');
 await expect(provider).toBeVisible();
 await expect(provider.locator("option")).toHaveCount(4);
 await provider.selectOption({label:"Redstone Restoration · demonstration"});
 await page.locator("#service-submit").click();
 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator("#provider-company-name")).toContainText("Redstone Restoration");
});

test("fictional provider queue jobs require an actual review before completing provider steps",async({page})=>{
 await page.goto("/coordination.html?role=provider&auction=coord-v5-demo-jobs&address=940%20Hickory%20Grove%20Road%2C%20Denton%2C%20TX%2076209");
 await page.evaluate(()=>{localStorage.removeItem("mreo:coordination:v3:coord-v5-demo-jobs");localStorage.removeItem("mreo:coordination:provider-demo:v2");});
 await page.reload();
 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator("#provider-queue [data-v5-provider-row]")).toHaveCount(1);
 const row=page.locator("#provider-queue [data-v5-provider-row]").filter({hasText:"940 Hickory Grove Road"});
 await expect(row).toContainText("Action needed");
 await row.getByRole("link",{name:"Open provider job →"}).click();
 await expect(page).toHaveURL(/coordination-provider-job\.html\?job=contractor-hickory/);
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Action needed");
 await expect(page.locator("#provider-job-fields")).toContainText("$42,000");
 await expect(page.getByRole("button",{name:"Buyer",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Seller",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Service Partner",exact:true})).toBeVisible();

 await page.getByRole("button",{name:"Review request packet"}).click();
 const dialog=page.locator("#provider-review-dialog");
 await expect(dialog).toBeVisible();
 await expect(page.getByRole("heading",{name:"Rehabilitation request review"})).toBeVisible();
 await expect(page.locator("#provider-review-fields")).toContainText("$42,000");
 await expect(page.locator("#provider-review-checklist li")).toHaveCount(6);
 await expect(page.locator("#provider-review-confirm")).toBeDisabled();
 await page.locator("#provider-review-confirmation").check();
 await expect(page.locator("#provider-review-confirm")).toBeEnabled();
 await page.getByRole("button",{name:"Mark estimate prepared"}).click();

 await expect(dialog).toBeHidden();
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Waiting");
 await expect(page.locator("#provider-job-status")).toContainText("Waiting for owner review");

 await page.getByRole("button",{name:"Buyer",exact:true}).click();
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Action needed");
 await expect(page.locator("#provider-job-attention .attention-title")).toContainText("Review contractor proposal");
 await page.getByRole("button",{name:"Review / respond"}).click();
 await expect(dialog).toBeVisible();
 await page.locator("#provider-review-confirmation").check();
 await page.getByRole("button",{name:"Review contractor proposal"}).click();

 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Waiting");
 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Action needed");
 await expect(page.locator("#provider-job-attention .attention-title")).toContainText("Review owner approval");
 await page.getByRole("button",{name:"Review request packet"}).click();
 await expect(dialog).toBeVisible();
 await page.locator("#provider-review-confirmation").check();
 await page.getByRole("button",{name:"Mark approval review complete"}).click();

 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Complete");
 await expect(page.locator("#provider-job-status")).toHaveText("Complete");
 await page.getByRole("button",{name:"Buyer",exact:true}).click();
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Complete");
 await page.getByRole("button",{name:"Seller",exact:true}).click();
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Complete");
});


test("provider-response attention states stay correct for every service pathway and perspective",async({page})=>{
 const services=["title","contractors","realtors","rentals"];
 for(const service of services){
   const auction="coord-attention-"+service;
   const key="mreo:coordination:v3:"+auction;
   await page.goto("/coordination.html");
   await page.evaluate(({key,service})=>{
     const requests={title:null,contractors:null,realtors:null,rentals:null};
     requests[service]={
       id:service+"-attention-test",
       service,
       ownerRole:"buyer",
       status:"proposal",
       createdAt:Date.now()-10000,
       updatedAt:Date.now(),
       lastTransitionAt:Date.now(),
       provider:"Test Participating Provider · demonstration",
       data:{},
       attachments:[],
       proposal:{revision:1,summary:"Test provider response",fields:{},sentAt:Date.now(),at:Date.now()}
     };
     localStorage.setItem(key,JSON.stringify({version:3,acquisition:{status:"complete"},requests,documents:[],activity:[]}));
   },{key,service});
   const url="/coordination-response.html?type=property&auction="+auction+"&address=4218%20Maple%20Ridge%20Drive%2C%20Dallas%2C%20TX%2075229&price=385000&service="+service+"&role=buyer";
   await page.goto(url);
   await expect(page.locator("#response-attention-v6 .attention-state")).toHaveText("Action needed");
   await page.getByRole("button",{name:"Service Partner",exact:true}).click();
   await expect(page.locator("#response-attention-v6 .attention-state")).toHaveText("Waiting");
   await page.getByRole("button",{name:"Seller",exact:true}).click();
   await expect(page.locator("#response-attention-v6 .attention-state")).toHaveText("Waiting");

   await page.evaluate(({key,service})=>{
     const state=JSON.parse(localStorage.getItem(key));
     state.requests[service].status="complete";
     state.requests[service].updatedAt=Date.now();
     localStorage.setItem(key,JSON.stringify(state));
   },{key,service});
   await page.reload();
   await expect(page.locator("#response-attention-v6 .attention-state")).toHaveText("Complete");
 }
});


test("completed provider work is separated from the active queue and labeled Complete",async({page})=>{
 const auction="coord-completed-provider-queue";
 const key="mreo:coordination:v3:"+auction;
 await page.goto("/coordination.html?type=property&auction="+auction+"&address=4218%20Maple%20Ridge%20Drive%2C%20Dallas%2C%20TX%2075229&price=385000&role=provider");
 await page.evaluate(({key})=>{
   localStorage.setItem(key,JSON.stringify({
     version:3,
     acquisition:{status:"complete"},
     requests:{
       title:{
         id:"title-complete-test",
         service:"title",
         ownerRole:"buyer",
         status:"complete",
         createdAt:Date.now()-20000,
         updatedAt:Date.now(),
         lastTransitionAt:Date.now(),
         provider:"Northstar Title & Settlement · demonstration",
         data:{providerPreference:"Northstar Title & Settlement · demonstration"},
         attachments:[],
         proposal:null,
         clientClosingConfirmed:true
       },
       contractors:null,
       realtors:null,
       rentals:null
     },
     documents:[],
     activity:[]
   }));
 },{key});
 await page.reload();
 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator('#provider-queue [data-provider-source="live"]')).toHaveCount(0);
 await expect(page.locator('#provider-queue .status-complete')).toHaveCount(0);
 await expect(page.locator('#provider-queue .provider-job').filter({hasText:"Title / Settlement · 4218 Maple Ridge Drive"})).toHaveCount(0);
 const completed=page.locator('#provider-completed-queue-v6 [data-provider-source="live"]');
 await expect(completed).toHaveCount(1);
 await expect(completed.locator(".provider-job-signal")).toHaveText("Complete");
 await expect(completed).toContainText("This request is complete.");
 await expect(completed.getByRole("link",{name:"View completed request →"})).toBeVisible();
});


test("payment Coordinate remains on Seller pathway and is removed from Buyer pathway",async({page})=>{
 await page.goto("/seller.html");
 await page.evaluate(async()=>{
   await MreoService.register("seller",
     {name:"Connected Seller LLC",email:"seller-connected@example.com"},
     {title:"88 Connected Seller Way, Dallas, TX 75201",kind:"property",minimum:455000,days:1,portfolio:[],details:{sellerPhone:"214-555-0188",saleTimeline:"30 days"}}
   );
 });
 await page.goto("/payment.html?role=seller");
 const sellerCoordinate=page.locator("#payment-coordinate");
 await expect(sellerCoordinate).toBeVisible();
 const sellerHref=new URL(await sellerCoordinate.getAttribute("href"),page.url());
 expect(sellerHref.searchParams.get("role")).toBe("seller");
 expect(sellerHref.searchParams.get("accountRole")).toBe("seller");
 expect(sellerHref.searchParams.get("accountName")).toBe("Connected Seller LLC");
 expect(sellerHref.searchParams.get("stage")).toBe("planning");
 expect(sellerHref.searchParams.get("address")).toBe("88 Connected Seller Way, Dallas, TX 75201");
 expect(sellerHref.searchParams.get("mediaKey")).toBeTruthy();
 await sellerCoordinate.click();
 await expect(page).toHaveURL(/payment\.html\?role=seller$/);
 await expect(page.locator("#payment-message")).toContainText(/confirm/i);
 await page.locator("#payment-consent").check();
 await sellerCoordinate.click();
 await expect(page.locator("#role-workspace-title")).toContainText("seller information is connected");
 await expect(page.locator("#coord-record-status")).toHaveText("Participation record connected");
 await page.locator('[data-service="title"]').click();
 await expect(page.locator('input[name="clientAccountName"]')).toHaveValue("Connected Seller LLC");

 await page.goto("/buyer.html");
 await page.evaluate(async()=>{
   await MreoService.register("buyer",
     {name:"Connected Buyer LLC",email:"buyer-connected@example.com"},
     {title:"99 Connected Buyer Road, Plano, TX 75093",auctionId:"",proposedOffer:"625000",details:{buyerPhone:"972-555-0199",buyerPurchaseMethod:"Cash",buyerTimeline:"Immediately"}}
   );
 });
 await page.goto("/payment.html?role=buyer");
 await expect(page.locator("#payment-coordinate-actions")).toBeHidden();
 await expect(page.locator("#payment-coordinate-note")).toBeHidden();
 await expect(page.getByRole("link",{name:"Coordinate →"})).toHaveCount(0);
 await expect(page.locator("#payment-submit")).toHaveText("Auction →");
});

test("branded fictional providers display their unique logos in provider work items",async({page})=>{
 const cases=[
   ["title-preston","northstar-title-settlement.png"],
   ["title-maple","meridian-closing-services.png"],
   ["contractor-hickory","summitcraft-contractors.png"],
   ["realtor-travis","metroline-realty-group.png"],
   ["rental-meridian","harborkey-property-management.png"]
 ];
 for(const [job,file] of cases){
   await page.goto("/coordination-provider-job.html?job="+job);
   const logo=page.locator("#provider-job-logo");
   await expect(logo).toBeVisible();
   await expect(logo).toHaveAttribute("src",new RegExp(file.replace(/[.*+?^$\{\}()|[\]\\]/g,"\\$&")+"$"));
   await expect(logo.locator("xpath=..")).toBeVisible();
 }
 await page.goto("/coordination-provider-job.html?job=contractor-brookfield");
 await expect(page.locator("#provider-job-logo")).toBeHidden();
 await expect(page.locator(".provider-logo-stage")).toBeHidden();
});


test("every action-needed fictional provider job opens a service-specific review packet",async({page})=>{
 const cases=[
   ["title-preston","Closing profile review","Vesting"],
   ["contractor-hickory","Rehabilitation request review","Target budget"],
   ["realtor-travis","Market-positioning request review","Service requested"]
 ];
 for(const [job,title,field] of cases){
   await page.goto("/coordination-provider-job.html?job="+job+"&role=provider");
   await page.evaluate(()=>localStorage.removeItem("mreo:coordination:provider-demo:v2"));
   await page.reload();
   await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Action needed");
   await page.getByRole("button",{name:"Review request packet"}).click();
   await expect(page.locator("#provider-review-dialog")).toBeVisible();
   await expect(page.getByRole("heading",{name:title})).toBeVisible();
   await expect(page.locator("#provider-review-fields")).toContainText(field);
   await expect(page.locator("#provider-review-checklist li")).not.toHaveCount(0);
   await page.locator("#provider-review-cancel").click();
 }
});

test("provider demo role switch identifies the correct client when the provider is waiting",async({page})=>{
 await page.goto("/coordination-provider-job.html?job=title-maple&role=provider");
 await page.evaluate(()=>localStorage.removeItem("mreo:coordination:provider-demo:v2"));
 await page.reload();
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Waiting");
 await page.getByRole("button",{name:"Seller",exact:true}).click();
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Action needed");
 await expect(page.locator("#provider-job-attention .attention-title")).toContainText("Submit seller payoff confirmation");
 await page.getByRole("button",{name:"Review / respond"}).click();
 const dialog=page.locator("#provider-review-dialog");
 await expect(dialog).toBeVisible();
 await expect(page.locator("#provider-review-intro")).toContainText("payoff");
 await page.locator("#provider-review-confirmation").check();
 await page.getByRole("button",{name:"Submit seller payoff confirmation"}).click();

 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Waiting");
 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Action needed");
 await expect(page.locator("#provider-job-attention .attention-title")).toContainText("Review seller payoff information");
 await page.getByRole("button",{name:"Review request packet"}).click();
 await expect(dialog).toBeVisible();
 await page.locator("#provider-review-confirmation").check();
 await page.getByRole("button",{name:"Mark payoff review complete"}).click();

 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Complete");
 await expect(page.locator("#provider-job-status")).toHaveText("Complete");
 await page.getByRole("button",{name:"Seller",exact:true}).click();
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Complete");
 await page.getByRole("button",{name:"Buyer",exact:true}).click();
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Complete");
});

test("completed fictional provider jobs move out of the active provider queue",async({page})=>{
 await page.goto("/coordination-provider-job.html?job=title-maple&role=seller");
 await page.evaluate(()=>localStorage.removeItem("mreo:coordination:provider-demo:v2"));
 await page.reload();

 await page.getByRole("button",{name:"Review / respond"}).click();
 await page.locator("#provider-review-confirmation").check();
 await page.getByRole("button",{name:"Submit seller payoff confirmation"}).click();
 await page.getByRole("button",{name:"Service Partner",exact:true}).click();
 await page.getByRole("button",{name:"Review request packet"}).click();
 await page.locator("#provider-review-confirmation").check();
 await page.getByRole("button",{name:"Mark payoff review complete"}).click();
 await expect(page.locator("#provider-job-attention .attention-state")).toHaveText("Complete");

 await page.getByRole("link",{name:"Back to work queue"}).click();
 await expect(page.locator('#provider-queue [data-provider-source="demo"]').filter({hasText:"4218 Maple Ridge Drive"})).toHaveCount(0);
 const completed=page.locator('#provider-completed-queue-v6 [data-provider-source="demo"]').filter({hasText:"4218 Maple Ridge Drive"});
 await expect(completed).toHaveCount(1);
 await expect(completed.locator(".provider-job-signal")).toHaveText("Complete");
});


test("Coordination Reset all test data clears cross-workspace browser state",async({page})=>{
 const auction="coord-reset-all-test";
 const coordKey="mreo:coordination:v3:"+auction;
 const createdTitle="901 Reset Test Lane, Dallas, TX 75201";
 await page.goto("/coordination.html?type=property&auction="+auction+"&address="+encodeURIComponent(createdTitle)+"&price=410000");
 await page.evaluate(async({coordKey,createdTitle})=>{
   await MreoService.register("seller",
     {name:"Reset Test Seller LLC",email:"reset-seller@example.com"},
     {title:createdTitle,kind:"property",minimum:410000,days:1,portfolio:[],details:{sellerPhone:"214-555-0101"}}
   );
   await MreoService.checkout("seller",true);
   await MreoService.activate("seller");
   localStorage.setItem(coordKey,JSON.stringify({
     version:3,
     acquisition:{status:"complete"},
     requests:{title:null,contractors:null,realtors:null,rentals:null},
     documents:[],
     activity:[]
   }));
   localStorage.setItem("mreo:coordination:provider-demo:v2",JSON.stringify({example:{status:"dirty"}}));
   const file=new File(["reset-media"],"reset-test.jpg",{type:"image/jpeg"});
   await MreoService.saveMedia("reset-all-media",[file]);
 },{coordKey,createdTitle});

 await expect(page.getByRole("button",{name:"Reset all test data"})).toBeVisible();
 page.once("dialog",async dialog=>{
   expect(dialog.message()).toContain("Clear all MREO test data");
   await dialog.accept();
 });
 await page.getByRole("button",{name:"Reset all test data"}).click();
 await expect(page).toHaveURL(/\/coordination\.html$/);

 const result=await page.evaluate(async({coordKey,createdTitle})=>({
   seller:await MreoService.me("seller"),
   leftoverCoord:localStorage.getItem(coordKey),
   providerDemo:localStorage.getItem("mreo:coordination:provider-demo:v2"),
   mediaCount:(await MreoService.getMedia("reset-all-media")).length,
   listingExists:(await MreoService.list()).some(item=>item.title===createdTitle)
 }),{coordKey,createdTitle});

 expect(result.seller).toBeNull();
 expect(result.leftoverCoord).toBeNull();
 expect(result.providerDemo).toBeNull();
 expect(result.mediaCount).toBe(0);
 expect(result.listingExists).toBe(false);
});


test("direct Coordinate opens an actionable network-level Service Partner inbox",async({page})=>{
 await page.goto("/index.html");
 const coordinate=page.getByRole("link",{name:"Coordinate",exact:true});
 await expect(coordinate).toHaveAttribute("href","coordination.html?role=provider");
 await coordinate.click();
 await expect(page).toHaveURL(/coordination\.html\?role=provider/);
 await page.evaluate(()=>localStorage.removeItem("mreo:coordination:provider-demo:v2"));
 await page.reload();

 await expect(page.locator("#coord-view-provider")).toHaveAttribute("aria-pressed","true");
 await expect(page.locator("#coord-view-buyer")).toBeHidden();
 await expect(page.locator("#coord-network-visual")).toBeVisible();
 await expect(page.locator("#coord-property-record-content")).toBeHidden();
 await expect(page.locator("#coord-network-visual .record-eyebrow")).toHaveText("Connected property network");
 const artwork=page.locator("#coord-network-illustration");
 await expect(artwork).toBeVisible();
 await expect(artwork).toHaveAttribute("src",/coordination-property-network\.svg\?v=20260919-portfolio-collage-v20/);
 await expect(artwork).toHaveAttribute("alt","Portfolio-style collage of connected residential properties");
 await expect(page.locator(".network-abstract-svg")).toHaveCount(0);
 await expect(page.locator("#coord-network-active")).toHaveText("7");
 await expect(page.locator("#coord-network-action")).toHaveText("3");
 await expect(page.locator("#coord-network-visual")).toContainText("7 active demonstration jobs");
 await expect(page.locator("#coord-network-visual")).toContainText("3 need provider action");
 const viewport=page.viewportSize();
 await expect(page.locator(".network-property-art-metrics")).toHaveCSS("text-align",viewport&&viewport.width<=620?"left":"right");
 await expect(page.locator("#role-workspace-title")).toHaveText("Work that needs your company, in one queue.");

 await expect(page.locator("#coord-attention-v5 .attention-state")).toHaveText("Action needed");
 await expect(page.locator("#coord-attention-v5 .attention-copy")).toContainText("2605 Preston Meadow Court");
 await expect(page.locator("#coord-attention-v5 .attention-title")).toContainText("Review closing profile");

 const rows=page.locator("#provider-queue [data-v5-provider-row]");
 await expect(rows).toHaveCount(7);
 await expect(rows.first()).toContainText("Action needed");
 await expect(rows.first()).toContainText("2605 Preston Meadow Court");
 await expect(page.locator("#provider-queue")).toContainText("940 Hickory Grove Road");
 await expect(page.locator("#provider-queue")).toContainText("3921 Travis Street Unit 204");
 await expect(page.locator("#provider-queue")).not.toContainText("5016 Meridian Place");
 await expect(page.locator("#provider-completed-queue-v6")).toContainText("5016 Meridian Place");
 await expect(page.locator("#provider-queue")).toContainText("Waiting for seller payoff statement");
});
