(() => {
  "use strict";
  let loading, active;
  const safeError = error => {
    const message=String(error?.message || "");
    return !message || message.includes("@") ? "Signing could not be opened. Please try again or contact MREO." : message;
  };
  function loadEmbed() {
    if (globalThis.SignWellEmbed) return Promise.resolve();
    if (loading) return loading;
    loading=new Promise((resolve,reject)=>{
      const script=document.createElement("script");script.src="https://static.signwell.com/assets/embedded.js";script.async=true;
      const timeout=setTimeout(()=>{script.remove();loading=null;reject(Error("The signing window could not load. Please try again."));},15000);
      script.onload=()=>{clearTimeout(timeout);if(globalThis.SignWellEmbed)resolve();else{loading=null;reject(Error("The signing window could not load. Please try again."));}};
      script.onerror=()=>{clearTimeout(timeout);script.remove();loading=null;reject(Error("The signing window could not load. Please try again."));};
      document.head.append(script);
    });
    return loading;
  }
  async function check({base,documentId,onStatus,onRefresh}) {
    onStatus("Checking signing status…");
    try {
      const result=await MreoIdentity.request(`${base}/documents/${encodeURIComponent(documentId)}/signing-status`,{method:"POST",body:"{}"});
      await onRefresh();
      onStatus(result.complete ? "Signing is complete. The signed PDF is available in Files and Messages." : result.closed || result.signerStatus==="declined" ? "This signing request is closed. Please ask MREO for a new request." : result.signerStatus==="signed" ? "Your signature is recorded. Waiting for the remaining signatures or final PDF." : "Signing is not complete yet. Use Review & Sign to finish your request.");
      return result;
    } catch(error) {onStatus(safeError(error),true);return null;}
  }
  async function open(options) {
    const {base,documentId,onStatus,onRefresh}=options;
    onStatus("Opening your secure signing window…");
    try {
      const session=await MreoIdentity.request(`${base}/documents/${encodeURIComponent(documentId)}/signing-session`,{method:"POST",body:"{}"});
      const url=new URL(session.url);
      if(url.protocol!=="https:" || !(url.hostname==="signwell.com" || url.hostname.endsWith(".signwell.com")))throw Error("The signing service returned an invalid session. Please contact MREO.");
      await loadEmbed();active?.close();
      const embed=new SignWellEmbed({url:url.href,showHeader:false,allowRedirect:false,allowClose:true,signatureDefaultName:false,
        events:{
          completed:async()=>{embed.close();await check(options);},
          closed:async()=>{onStatus("Signing window closed. Check signing status if you finished signing.");await onRefresh();},
          declined:async()=>{embed.close();onStatus("The signing request was declined. Please contact MREO about the next step.");await check(options);},
          error:()=>{embed.close();onStatus("The signing window encountered a problem. Please try again or contact MREO.",true);}
        }
      });
      active=embed;embed.open();
      onStatus(session.testMode ? "SignWell test signing · Review the PDF and add your signature. This test document is not legally binding." : "Review the PDF and add your signature in the secure signing window.");
    } catch(error) {onStatus(safeError(error),true);}
  }
  addEventListener("pagehide",()=>active?.close());
  globalThis.MreoSigning={open,check,safeError};
})();
