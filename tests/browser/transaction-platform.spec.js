import {test,expect} from "@playwright/test";

test("public exploration chooses one perspective and hides public role switching",async({page})=>{
 await page.goto("/experience.html");
 await expect(page.getByRole("heading",{name:"Choose one perspective."})).toBeVisible();
 await page.getByRole("link",{name:/Experience as Buyer/}).click();
 await expect(page).toHaveURL(/perspective=buyer/);
 await expect(page.locator(".workspace-viewbar")).toBeHidden();
 await expect(page.locator("#demo-story-state")).toHaveText("Action needed");
 await expect(page.locator("#demo-story-title")).toContainText("winning transaction");
 await page.locator("#demo-story-action").click();
 await expect(page.locator("#demo-story-state")).toHaveText("Waiting");
 await expect(page.getByRole("button",{name:"Seller",exact:true})).toBeHidden();
});

test("My MREO explains deployment state without creating a fake account",async({page})=>{
 await page.goto("/profile.html");
 await expect(page.getByRole("heading",{name:"My MREO"})).toBeVisible();
 await expect(page.locator("#profile-status")).toContainText("Connected accounts are ready for deployment");
 await expect(page.getByRole("link",{name:"Explore MREO"})).toBeVisible();
});

test("home retains provider console and adds Explore and My MREO",async({page})=>{
 await page.goto("/index.html");
 await expect(page.getByRole("link",{name:"Coordinate",exact:true})).toHaveAttribute("href","coordination.html?role=provider");
 await expect(page.getByRole("link",{name:"Explore",exact:true})).toHaveAttribute("href","experience.html");
 await expect(page.getByRole("link",{name:"My MREO",exact:true})).toHaveAttribute("href","profile.html");
});
