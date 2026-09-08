// Service worker - Portal de Documentos por Ruta (Combuses)
// Mismo patron que la Planilla de Enturnamiento:
//   - Assets propios (HTML/JS/CSS/icons): Network-First con timeout, fallback a cache.
//   - Supabase (API, storage, funciones) y CDNs externos: pasan directo a la red, NUNCA se cachean.
//   - Auto-update: skipWaiting + clients.claim para que la nueva version reemplace a la anterior al instante.

const VERSION = "v1.9.0";
const CACHE_NAME = `portal-docs-rutas-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./js/app.js",
  "./css/styles.css",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./icons/icon-maskable.svg",
];

// Dominios cuyas respuestas NUNCA se cachean (datos vivos / auth).
const NO_CACHE_HOSTS = [
  "supabase.co",
  "supabase.in",
  "jsdelivr.net",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => c.postMessage({ type: "SW_ACTIVATED", version: VERSION }));
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "GET_VERSION") {
    if (event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
    else if (event.source) event.source.postMessage({ type: "SW_ACTIVATED", version: VERSION });
  }
});

function shouldBypass(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  if (NO_CACHE_HOSTS.some((host) => url.hostname.endsWith(host))) return true;
  return false;
}

function isSameOriginAsset(url) {
  return url.origin === self.location.origin;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fetchPromise = fetch(request);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("network-timeout")), NETWORK_TIMEOUT_MS)
    );
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    if (response && response.status === 200 && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (shouldBypass(url)) return;

  if (isSameOriginAsset(url)) {
    event.respondWith(networkFirst(request));
  }
});
