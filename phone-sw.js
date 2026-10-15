const CACHE = "aivh-audience-v3-oct13";
const PHONE = new URL("phone.html", self.location.href).href;
const FONTS = "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.add(PHONE);
    try {
      const css = await fetch(FONTS);
      await c.put(FONTS, css.clone());
      await c.addAll([...new Set((await css.text()).match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])]);
    } catch (err) {}
  }));
});
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  const isPhone = url.origin + url.pathname === PHONE;
  // Audience-only visits must never download the show's future answers.
  if (req.method !== "GET" || !(isPhone || req.url === FONTS || url.origin === "https://fonts.gstatic.com")) return;
  const key = isPhone ? PHONE : req;
  e.respondWith(caches.open(CACHE).then(async c => {
    try {
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") await c.put(key, res.clone());
      return res;
    } catch (err) {
      return await c.match(key, {ignoreVary:true}) || Response.error();
    }
  }));
});
