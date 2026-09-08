// Verificacion de conectividad, compartida por el portal de coordinadores y
// el checklist publico. navigator.onLine no alcanza (dice "true" con wifi
// sin internet real), asi que se hace ademas un ping real y periodico contra
// Supabase. Muestra un banner fijo mientras no haya conexion real, y expone
// window.hayConexion() / window.verificarConexionAhora() para que cualquier
// pantalla pueda preguntar antes de intentar guardar algo.

(function () {
  const HEALTH_URL = "https://cbplebkmxrkaafqdhiyi.supabase.co/auth/v1/health";
  const CHECK_INTERVAL_MS = 15000;
  const TIMEOUT_MS = 5000;

  let online = true;
  let banner = null;

  function crearBanner() {
    banner = document.createElement("div");
    banner.id = "conectividadBanner";
    banner.className = "conectividad-banner hidden";
    banner.textContent = "📡 Sin conexión a internet — no vas a poder guardar hasta que vuelva la señal.";
    document.body.prepend(banner);
  }

  function actualizarBanner(hayConexionReal) {
    online = hayConexionReal;
    if (banner) banner.classList.toggle("hidden", hayConexionReal);
  }

  async function verificarReal() {
    if (!navigator.onLine) return false;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      await fetch(HEALTH_URL, { method: "GET", cache: "no-store", signal: ctrl.signal });
      clearTimeout(timer);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function chequear() {
    actualizarBanner(await verificarReal());
  }

  window.addEventListener("online", chequear);
  window.addEventListener("offline", () => actualizarBanner(false));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") chequear();
  });

  function iniciar() {
    crearBanner();
    chequear();
    setInterval(chequear, CHECK_INTERVAL_MS);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  // Estado de la ultima verificacion (instantaneo, sin esperar red).
  window.hayConexion = () => online;
  // Verificacion fresca bajo demanda (por ejemplo, justo antes de guardar).
  window.verificarConexionAhora = async () => {
    const real = await verificarReal();
    actualizarBanner(real);
    return real;
  };
})();
