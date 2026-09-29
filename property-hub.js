import {namespace} from "./demo-store.js";
import {savedDemonstrations, accountWorkspaces, groupProperties} from "./property-hub-model.js?v=20260928";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const prefix = namespace(location.pathname);
let storage = null, accountRecords = [], accountId, generation = 0, accountAction = null, thumbnailGeneration = 0, thumbnailUrls = [];
try { storage = localStorage; } catch {}
if (!storage) $("hub-storage-note").textContent = "Browser storage is unavailable. Demonstrations cannot be remembered here; signed-in account workspaces are still available.";

const when = time => time ? new Date(time).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "";
const status = value => ({interest:"Getting started",active:"Active",closing:"In progress",complete:"Completed",cancelled:"Closed"}[value] || "In progress");
const context = record => record.roles.join(" / ") + " · " + status(record.status);
const safeImage = value => /^(https?:\/\/|assets\/)/i.test(String(value || "")) ? String(value) : "";
function releaseThumbnails() { thumbnailUrls.forEach(url => URL.revokeObjectURL(url)); thumbnailUrls=[]; }
async function hydrateThumbnails(renderGeneration) {
  if (!globalThis.MreoService?.getMedia) return;
  const images=[...document.querySelectorAll(".hub-property-image[data-media-key]")].filter(image=>image.dataset.mediaKey);
  await Promise.all(images.map(async image=>{
    try {
      const media=await MreoService.getMedia(image.dataset.mediaKey),photo=media.find(item=>(item.type||"").startsWith("image/")&&item.blob);
      if (!photo || renderGeneration!==thumbnailGeneration || !image.isConnected) return;
      const url=URL.createObjectURL(photo.blob);thumbnailUrls.push(url);image.src=url;image.alt="Seller-provided photograph for "+image.dataset.propertyTitle;image.dataset.primaryMediaName=photo.name||"";
    } catch { /* A workspace still remains usable when its browser-local photo is unavailable. */ }
  }));
}
function render() {
  const currentThumbnailGeneration=++thumbnailGeneration;releaseThumbnails();
  const records = [...accountRecords,...savedDemonstrations(storage,prefix)];
  const groups = groupProperties(records,$("hub-search").value);
  const total = groupProperties(records).length;
  $("hub-count").textContent = $("hub-search").value ? `(${groups.length} of ${total})` : `(${total})`;
  $("hub-list").innerHTML = groups.length ? groups.map(group => {
    const latest = group.latest, demo = group.source === "demo", others = group.workspaces.slice(1), visual=group.workspaces.find(record=>record.mediaKey||safeImage(record.image))||latest;
    const image=safeImage(visual.image)||"assets/property-placeholder.svg";
    return `<article class="hub-property" data-source="${group.source}">
      <a class="hub-property-link" href="${esc(latest.href)}">
        <img class="hub-property-image" src="${esc(image)}" data-media-key="${esc(visual.mediaKey||"")}" data-property-title="${esc(group.title)}" alt="Property thumbnail for ${esc(group.title)}" width="92" height="92">
        <div><span class="hub-badge ${demo ? "hub-badge-demo" : ""}">${demo ? "Demonstration · This browser" : "Account workspace"}</span><h3>${esc(group.title)}</h3><p>${esc(context(latest))}</p></div>
        <div class="hub-open"><strong>Open workspace →</strong><small>${demo ? "Return to " + esc(latest.view) : "Start with Messages"}</small>${latest.updatedAt ? `<small>Updated ${esc(when(latest.updatedAt))}</small>` : ""}</div>
      </a>
      ${others.length ? `<details class="hub-sessions"><summary>${others.length} other saved ${demo ? (others.length === 1 ? "demonstration" : "demonstrations") : (others.length === 1 ? "workspace" : "workspaces")}</summary><ul>${others.map(record => `<li><a href="${esc(record.href)}"><span>${esc(context(record))} · ${esc(record.view)}</span><small>${esc(when(record.updatedAt))} →</small></a></li>`).join("")}</ul></details>` : ""}
    </article>`;
  }).join("") : `<section class="hub-empty"><h3>${total ? "No matching properties" : "Your next chapter starts here."}</h3><p>${total ? "Try another property name or address." : "Your account workspaces and saved demonstrations will appear here. Find a property or start a demonstration below."}</p>${total ? '<button class="hub-text-button" id="hub-clear-search">Clear search</button>' : ""}</section>`;
  void hydrateThumbnails(currentThumbnailGeneration);
  $("hub-clear-search")?.addEventListener("click",() => {$("hub-search").value="";render();$("hub-search").focus();});
}
function accountStatus(message, action = null, button = "Sign in") {
  $("hub-account-status").textContent = message;
  accountAction = action;
  $("hub-account-action").hidden = !action;
  $("hub-account-action").textContent = button;
}
async function updateAccount(user, force = false) {
  const id = user?.id || null;
  if (!force && id === accountId) return;
  accountId = id;
  const requestGeneration = ++generation;
  // Clear before fetching, including sign-out and account switches. Never persist account rows.
  accountRecords = [];
  render();
  if (!id) {
    accountStatus("Sign in to include your account properties alongside your saved demonstrations.",() => MreoIdentity.openSignIn(location.href),"Sign in or create account");
    return;
  }
  accountStatus("Loading your account properties…");
  try {
    const result = await MreoIdentity.request("/api/v1/transactions");
    if (requestGeneration !== generation) return;
    accountRecords = accountWorkspaces(result.transactions);
    accountStatus("Account connected · Showing the property workspaces you have access to.");
    render();
    if (globalThis.MreoService?.list && accountRecords.some(record=>record.auctionId||(!record.mediaKey&&!safeImage(record.image)))) {
      try {
        const auctions=await MreoService.list();
        if (requestGeneration !== generation) return;
        const byId=new Map(auctions.map(auction=>[auction.id,auction]));
        accountRecords=accountRecords.map(record=>{
          const titleMatches=auctions.filter(auction=>auction.title===record.title),auction=byId.get(record.auctionId)||(titleMatches.length===1?titleMatches[0]:null);
          return auction?{...record,mediaKey:record.mediaKey||auction.mediaKey||"",image:record.image||auction.image||""}:record;
        });
        render();
      } catch { /* The transaction list remains available if auction metadata is temporarily unavailable. */ }
    }
  } catch {
    if (requestGeneration !== generation) return;
    accountStatus("Account properties could not load. Your saved demonstrations are still available.",() => location.reload(),"Reload");
  }
}
async function startAccount() {
  if (!globalThis.MreoIdentity?.connected()) {
    accountStatus("Demonstration mode · Saved sample properties from this browser appear below.");
    return;
  }
  try {
    const instance = await MreoIdentity.init();
    const user = await MreoIdentity.currentUser();
    // Clerk publishes account changes; generation checks discard an older user's pending response.
    void updateAccount(user);
    instance?.addListener?.(({user: nextUser}) => { void updateAccount(nextUser); });
  } catch {
    accountStatus("Account sign-in could not load. Your saved demonstrations are still available.",() => location.reload(),"Reload");
  }
}
$("hub-search").addEventListener("input",render);
$("hub-account-action").addEventListener("click",async () => {
  try { await accountAction?.(); }
  catch { accountStatus("Sign-in could not open. Please reload and try again.",() => location.reload(),"Reload"); }
});
addEventListener("storage",event => {if (!event.key || event.key.startsWith(prefix)) render();});
addEventListener("pageshow",event => {
  if (!event.persisted) return;
  ++generation;accountRecords=[];render();
  if(globalThis.MreoIdentity?.connected())void MreoIdentity.currentUser().then(user => updateAccount(user,true)).catch(() => {
    ++generation;accountStatus("Account properties could not refresh. Please reload to reconnect.",() => location.reload(),"Reload");
  });
});
render();
void startAccount();
