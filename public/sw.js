// SpendSilo service worker — minimal offline shell.
// We intentionally do NOT cache API calls, authenticated HTML, or Supabase
// signed image URLs (private, per-tenant invoice data).
const CACHE = "spendsilo-v2";
const APP_SHELL = ["/offline.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch API responses or cross-origin (Supabase signed URLs, OpenAI).
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // Network-first for navigations, fall back to the offline shell. Page HTML is
  // never written to the cache — it may contain another tenant's data.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html")),
    );
    return;
  }

  // Cache-first ONLY for immutable static assets. Everything else passes
  // through untouched — in particular Next's RSC payload fetches (soft
  // navigation): they carry authenticated per-tenant data (same privacy rule
  // as page HTML above), and replaying them from cache breaks client-side
  // navigation (Next falls back to full page loads, losing client state such
  // as the upload-progress toasts).
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/offline.html" ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(png|jpe?g|webp|svg|ico|woff2?)$/.test(url.pathname);
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return res;
        }),
    ),
  );
});
