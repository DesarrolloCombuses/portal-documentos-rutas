// PWA bootstrap: registra el service worker y maneja auto-actualizaciones.
// Cuando hay nueva version del SW, recarga la pagina automaticamente para
// que el usuario siempre vea la version vigente.

(function () {
  if (!("serviceWorker" in navigator)) return;

  let reloading = false;
  function triggerReload() {
    if (reloading) return;
    reloading = true;
    if (typeof showToast === "function") {
      try { showToast("Nueva versión disponible. Recargando…", "ok"); } catch (_) {}
    }
    setTimeout(() => window.location.reload(), 400);
  }

  function setVersion(v) {
    const el = document.getElementById("appVersion");
    if (el && v) el.textContent = String(v);
  }

  async function askVersion() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sw = navigator.serviceWorker.controller || reg.active;
      if (!sw) return;
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => { if (e.data && e.data.version) setVersion(e.data.version); };
      sw.postMessage({ type: "GET_VERSION" }, [ch.port2]);
    } catch (_) {}
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    triggerReload();
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event && event.data && event.data.type === "SW_ACTIVATED") {
      console.info("[PWA] Service worker activo:", event.data.version);
      setVersion(event.data.version);
    }
  });

  // Tocar la píldora de versión fuerza una búsqueda de actualización.
  document.addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("appVersion");
    if (el) el.addEventListener("click", async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) { await reg.update(); if (typeof showToast === "function") showToast("Buscando actualización…", "ok"); }
      } catch (_) {}
    });
  });

  function watchForUpdates(reg) {
    if (!reg) return;
    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          installing.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
  }

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js", { scope: "./" });
      watchForUpdates(reg);
      askVersion();
      try { await reg.update(); } catch (_) {}
      setInterval(() => { reg.update().catch(() => {}); }, 5 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          reg.update().catch(() => {});
        }
      });
    } catch (err) {
      console.warn("[PWA] No se pudo registrar el service worker:", err);
    }
  });
})();
