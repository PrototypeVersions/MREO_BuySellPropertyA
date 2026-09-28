(() => {
  "use strict";
  const config = globalThis.MREO_CONFIG || {mode:"demo", apiBase:""};
  let serviceConfig = null, clerk = null, loading = null;

  const apiBase = () => String(config.apiBase || "").replace(/\/$/, "");
  const connected = () => config.mode === "connected" && /^https:\/\//.test(apiBase());
  const publicError = error => {
    const message = String(error?.message || error || "");
    return !message || message.includes("@") ? "The request could not be completed. Please try again or contact MREO." : message;
  };
  const getConfig = async () => {
    if (serviceConfig) return serviceConfig;
    if (!connected()) return serviceConfig = {connected:false, authConfigured:false};
    const response = await fetch(apiBase() + "/api/v1/config", {headers:{Accept:"application/json"}});
    if (!response.ok) throw Error("The MREO identity service is unavailable.");
    return serviceConfig = await response.json();
  };
  const loadScript = (src, attributes = {}) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { if (globalThis.Clerk) resolve(); else existing.addEventListener("load", resolve, {once:true}); return; }
    const script = document.createElement("script"); script.src = src; script.defer = true; script.crossOrigin = "anonymous";
    Object.entries(attributes).forEach(([key, value]) => script.dataset[key] = value);
    script.onload = resolve; script.onerror = () => reject(Error("MREO sign-in could not be loaded.")); document.head.appendChild(script);
  });
  async function init() {
    if (loading) return loading;
    loading = (async () => {
      const status = await getConfig();
      if (!status.authConfigured || !status.clerkPublishableKey) return null;
      const encoded = status.clerkPublishableKey.split("_")[2] || "";
      let domain; try { domain = atob(encoded).replace(/\$$/, ""); } catch { throw Error("The MREO sign-in configuration is invalid."); }
      await loadScript(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`);
      await loadScript(`https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, {clerkPublishableKey:status.clerkPublishableKey});
      clerk = globalThis.Clerk;
      if (!clerk) throw Error("MREO sign-in did not initialize.");
      // Clerk reads its post-sign-out destination when the instance is loaded.
      // Supplying it only to mountUserButton is ignored by current Clerk builds.
      await clerk.load({afterSignOutUrl:signOutReturn(),ui:{ClerkUI:globalThis.__internal_ClerkUICtor}});
      return clerk;
    })().catch(error => { loading=null;throw Error(publicError(error)); });
    return loading;
  }
  const getToken = async () => { const instance = await init(); return instance?.session ? instance.session.getToken() : null; };
  async function request(path, options = {}) {
    if (!connected()) throw Error("This feature becomes available when MREO Connected Mode is deployed.");
    const token = await getToken();
    if (!token) { await openSignIn(); throw Error("Sign in to continue."); }
    const headers = {...options.headers, Authorization:`Bearer ${token}`};
    if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const response = await fetch(apiBase() + path, {...options, headers});
    const type = response.headers.get("Content-Type") || "";
    const data = type.includes("json") ? await response.json() : response;
    if (!response.ok) { const error=Error(publicError(data?.error || "MREO could not complete that request."));error.code=data?.code;throw error; }
    return data;
  }
  async function openSignIn(afterSignInUrl = location.href) {
    const instance = await init();
    if (!instance) throw Error("MREO sign-in is not configured yet.");
    instance.openSignIn({forceRedirectUrl:afterSignInUrl, signUpForceRedirectUrl:afterSignInUrl});
  }
  const signOutReturn = () => new URL(location.pathname + location.search, location.origin).href;
  async function mountUserButton(element) { const instance = await init(); if (instance?.isSignedIn && element) instance.mountUserButton(element,{afterSignOutUrl:signOutReturn()}); return !!instance?.isSignedIn; }
  const currentUser = async () => (await init())?.user || null;
  const signOut = async () => (await init())?.signOut({redirectUrl:signOutReturn()});
  const liveUrl = path => apiBase().replace(/^http/, "ws") + path;

  globalThis.MreoIdentity = {connected, init, getConfig, getToken, request, openSignIn, mountUserButton, currentUser, signOut, liveUrl, publicError};
})();
