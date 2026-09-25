(() => {
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const auctionId=transaction=>transaction.property?.relatedAuctionId || (transaction.source_auction_id?.startsWith("intake-")?null:transaction.source_auction_id);
  function links(transaction,current) {
    const id=encodeURIComponent(transaction.id),source=auctionId(transaction);
    const auction=source&&!source.startsWith("demo-")?"auction.html?id="+encodeURIComponent(source)+"&transaction="+id:"auction.html?pending=1&transaction="+id;
    return '<nav class="case-tabs" aria-label="Property workspace">'+[["auction","Auction",auction],["messages","Messages","coordination.html?transaction="+id+"&section=messages"],["coordination","Coordination","coordination.html?transaction="+id+"&section=coordination"],["files","Files","coordination.html?transaction="+id+"&section=files"]].map(([section,label,href])=>'<a href="'+esc(href)+'" '+(section===current?'aria-current="page"':"")+'>'+label+'</a>').join("")+'</nav>';
  }
  globalThis.MreoCaseNavigation={links,auctionId};
  if(!document.getElementById("auction-select"))return;
  const query=new URLSearchParams(location.search),id=query.get("transaction");if(!id)return;
  const root=document.createElement("section");root.id="auction-case-context";
  document.querySelector(".auction-toolbar").before(root);
  (async()=>{
    try{
      const transaction=await MreoIdentity.request("/api/v1/transactions/"+encodeURIComponent(id));
      root.innerHTML='<header class="transaction-head-compact"><p class="section-label">Your property workspace</p><h2>'+esc(transaction.title)+'</h2></header>'+links(transaction,"auction")+(query.get("pending")==="1"?'<div class="case-panel"><h2>No active auction for this property</h2><p>Your interest is saved. You can ask MREO a question in Messages or review the next steps in Coordination. No bid has been placed.</p><a class="primary-button button-blue" href="coordination.html?transaction='+encodeURIComponent(id)+'&section=messages">Open Messages →</a></div>':"");
      if(query.get("pending")==="1"){
        document.querySelector(".auction-toolbar").hidden=true;
        document.getElementById("auction-message").hidden=true;
        document.getElementById("auction-content").hidden=true;
      }
      document.querySelector(".page-heading").hidden=true;
      document.getElementById("auction-select").addEventListener("change",()=>{root.hidden=true;});
    }catch(error){root.innerHTML='<p class="case-hint">'+esc(error.message)+' <a href="profile.html">Open My MREO</a></p>';}
  })();
})();
