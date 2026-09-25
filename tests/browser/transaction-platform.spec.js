import {test,expect} from "@playwright/test";

test("public exploration chooses one perspective with four separate case views",async({page})=>{
 await page.goto("/experience.html");
 await expect(page.getByRole("heading",{name:"Choose one perspective."})).toBeVisible();
 await page.getByRole("link",{name:/Experience as Buyer/}).click();
 await expect(page).toHaveURL(/demo-case\.html\?run=demo_/);
 await expect(page.locator("#case-perspective")).toContainText("Viewing as Buyer");
 await expect(page.locator("#case-tabs a")).toHaveText(["Auction","Messages","Coordination","Files"]);
 await expect(page.locator("#case-tabs [aria-current=page]")).toHaveText("Auction");
 await expect(page.getByRole("textbox")).toHaveCount(0);
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
