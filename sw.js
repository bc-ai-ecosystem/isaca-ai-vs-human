/* Show-night fallback: every request goes to the network first, and a copy is kept, so a
   reload with no theatre Wi-Fi still gets the page, its fonts and the QR library. The first
   visit fills the cache on install, before the page's own requests have been seen. */
const CACHE = "aivh-chat-oct14";
const FONTS = "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";
const QR = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(async c => {
    await Promise.allSettled(["./", "./showpiece.css", "./opener.html", "./phone.html", "./briefing.html", "./slido.html", "./emergency.html", "./media/ai-provider-chatgpt.svg", "./media/ai-provider-claude.png", "./media/ai-provider-grok.svg", QR].map(url => c.add(url)));
    try {
      const css = await fetch(FONTS);
      await c.put(FONTS, css.clone());
      /* one font file can serve several weights, and addAll rejects duplicates */
      await c.addAll([...new Set((await css.text()).match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])]);
    } catch (err) {}
  }));
});
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith("http")) return;
  e.respondWith(fetch(req).then(res => {
    if ((res.status === 200 || res.type === "opaque") && !req.headers.has("range")) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, {ignoreSearch: req.mode === "navigate", ignoreVary: true}).then(hit => hit || Response.error())));
});
