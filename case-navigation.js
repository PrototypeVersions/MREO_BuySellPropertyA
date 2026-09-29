(() => {
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const auctionId=transaction=>transaction.property?.relatedAuctionId || (transaction.source_auction_id?.startsWith("intake-")?null:transaction.source_auction_id);
  function auctionUrl(transaction) {
    const source=auctionId(transaction);
    const query=new URLSearchParams({transaction:transaction.id});
    if(source)query.set("id",source);
    else query.set("pending","1");
    if(!source||source.startsWith("demo-"))query.set("demo","1");
    return "auction.html?"+query.toString();
  }
  function coordinationUrl(transaction) {
    const source=auctionId(transaction),query=new URLSearchParams({workspaceTransaction:transaction.id,type:transaction.kind==="portfolio"?"portfolio":"property",stage:transaction.status==="active"?"planning":transaction.status==="closing"?"won":"complete",demo:"1"});
    if(source)query.set("auction",source);
    if(transaction.kind==="portfolio")query.set("title",transaction.title||"");else query.set("address",transaction.title||"");
    if(Number(transaction.amount_cents)>0)query.set("price",String(Math.round(Number(transaction.amount_cents)/100)));
    if(["buyer","seller","provider"].includes(transaction.viewerRole))query.set("role",transaction.viewerRole);
    return "coordination.html?"+query.toString();
  }
  function links(transaction,current,scope="workspace") {
    const id=encodeURIComponent(transaction.id);
    const auction=scope==="auction"?auctionUrl(transaction):"coordination.html?transaction="+id+"&section=auction";
    return '<nav class="case-tabs" aria-label="Property workspace">'+[["auction","Auction",auction],["messages","Messages","coordination.html?transaction="+id+"&section=messages"],["coordination","Coordination","coordination.html?transaction="+id+"&section=coordination"],["files","Files","coordination.html?transaction="+id+"&section=files"]].map(([section,label,href])=>'<a href="'+esc(href)+'" '+(section===current?'aria-current="page"':"")+'>'+label+'</a>').join("")+'</nav>';
  }
  globalThis.MreoCaseNavigation={links,auctionId,auctionUrl,coordinationUrl};
  if(!document.getElementById("auction-select"))return;
  const query=new URLSearchParams(location.search),id=query.get("transaction");
  // An active auction is a full tool, not another copy of the property workspace.
  // Keep the compact workspace context only for the useful "no auction yet" state.
  if(!id||query.get("pending")!=="1")return;
  const root=document.createElement("section");root.id="auction-case-context";
  document.querySelector(".auction-toolbar").before(root);
  (async()=>{
    try{
      const transaction=await MreoIdentity.request("/api/v1/transactions/"+encodeURIComponent(id));
      root.innerHTML='<header class="transaction-head-compact"><p class="section-label">Your property workspace</p><h2>'+esc(transaction.title)+'</h2></header>'+links(transaction,"auction","auction")+(query.get("pending")==="1"?'<div class="case-panel"><h2>No active auction for this property</h2><p>Your interest is saved. You can ask MREO a question in Messages or review the next steps in Coordination. No bid has been placed.</p><a class="primary-button button-blue" href="coordination.html?transaction='+encodeURIComponent(id)+'&section=messages">Open Messages →</a></div>':"");
      if(query.get("pending")==="1"){
        document.querySelector(".auction-toolbar").hidden=true;
        document.getElementById("auction-message").hidden=true;
        document.getElementById("auction-content").hidden=true;
      }
      document.querySelector(".page-heading").hidden=true;
      const back=document.querySelector(".page-shell > .back-link");
      if(back){back.href="my-properties.html";back.textContent="← My properties";}
      document.getElementById("auction-select").addEventListener("change",()=>{root.hidden=true;});
    }catch(error){root.innerHTML='<p class="case-hint">'+esc(error.message)+' <a href="profile.html">Open My MREO</a></p>';}
  })();
})();
