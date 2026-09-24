/* Use "connected" only after deploying backend/worker.js and configuring Stripe. */
window.MREO_CONFIG = Object.freeze({
  mode: "connected",
  apiBase: "https://mreo-buysell-exchange.blakeaustinmyers01.workers.dev",
  defaultDays: 1,
  standardDays: 21,
  participationCents: 100,
  sellerSuccessFee: 1000
});
