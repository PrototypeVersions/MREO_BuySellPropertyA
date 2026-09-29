import {loadScenario, ROLES} from "./demo-store.js";

export const VIEWS = {auction:"Auction", messages:"Messages", coordination:"Coordination", files:"Files"};
const label = value => typeof value === "string" ? value.trim() : "";
const normalized = value => label(value).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const timestamp = value => Number.isFinite(Number(value)) ? Number(value) : Date.parse(value) || 0;
const riversideImage = "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=500&q=80";

// Read only this site's guided runs. Listing never changes a run or its active pointer.
export function savedDemonstrations(storage, prefix) {
  const records = [];
  if (!storage) return records;
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix + "run:")) continue;
      const state = loadScenario(storage, prefix, key.slice((prefix + "run:").length));
      if (!label(state?.property?.title) || !state.auction || !state.transaction ||
          !["threads","messages","documents","signatureRequests","serviceRequests","events"].every(name => Array.isArray(state[name]))) continue;
      const view = Object.hasOwn(VIEWS, state.lastView) ? state.lastView : "auction";
      const savedImage=label(state.property.image),image=savedImage&&savedImage!=="assets/property-placeholder.svg"?savedImage:(normalized(state.property.title).startsWith("1147 riverside terrace")?riversideImage:savedImage);
      records.push({id:state.id, source:"demo", propertyKey:normalized(state.property.title),
        title:state.property.title, roles:[ROLES[state.perspective]], status:state.transaction.status,
        updatedAt:timestamp(state.updatedAt || state.createdAt), view:VIEWS[view], image,
        href:"demo-case.html?run=" + encodeURIComponent(state.id) + "&view=" + view});
    }
  } catch { /* Browser storage can be disabled; account records still work. */ }
  return records;
}

export function accountWorkspaces(transactions) {
  const records = new Map();
  for (const item of Array.isArray(transactions) ? transactions : []) {
    if (!label(item?.id) || !label(item.title)) continue;
    const role = ROLES[item.viewer_role] || "Participant";
    const property=item.property&&typeof item.property==="object"?item.property:{};
    const relatedAuctionId=label(property.relatedAuctionId),sourceAuctionId=label(item.source_auction_id);
    const media={mediaKey:label(property.mediaKey),image:label(property.image),auctionId:relatedAuctionId||(sourceAuctionId&&!sourceAuctionId.startsWith("intake-")?sourceAuctionId:"")};
    if (records.has(item.id)) {
      const existing = records.get(item.id);
      if (!existing.roles.includes(role)) existing.roles.push(role);
      if (!existing.mediaKey && media.mediaKey) existing.mediaKey=media.mediaKey;
      if (!existing.image && media.image) existing.image=media.image;
      if (!existing.auctionId && media.auctionId) existing.auctionId=media.auctionId;
      continue;
    }
    const propertyId = label(property.id);
    records.set(item.id, {id:item.id, source:"account",
      propertyKey:propertyId ? "id:" + propertyId : (item.kind || "property") + ":" + normalized(item.title),
      title:item.title, roles:[role], status:item.status, updatedAt:timestamp(item.updated_at || item.created_at),
      view:"Messages", ...media, href:"coordination.html?transaction=" + encodeURIComponent(item.id) + "&section=messages"});
  }
  return [...records.values()];
}

export function groupProperties(records, search = "") {
  const groups = new Map();
  for (const record of records) {
    // Source is part of the key: a sample can never absorb an account workspace.
    const key = record.source + ":" + record.propertyKey;
    if (!groups.has(key)) groups.set(key, {key, source:record.source, workspaces:[]});
    const group = groups.get(key);
    if (!group.workspaces.some(item => item.id === record.id)) group.workspaces.push(record);
  }
  const query = normalized(search);
  return [...groups.values()].map(group => {
    group.workspaces.sort((a,b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    return {...group, title:group.workspaces[0].title, latest:group.workspaces[0]};
  }).filter(group => !query || normalized(group.title).includes(query))
    .sort((a,b) => b.latest.updatedAt - a.latest.updatedAt || a.title.localeCompare(b.title));
}
