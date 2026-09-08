// Portal de Documentos por Ruta · Combuses
// Habla unicamente con la edge function portal-rutas-documentos (nunca toca
// las tablas de flota/conductores directo), que resuelve la ruta permitida
// contra public.portal_coordinadores usando el usuario logueado.

const SUPABASE_URL = "https://cbplebkmxrkaafqdhiyi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DZCceNTENY4ViP17-eZrGg_bdMElZ9X";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/portal-rutas-documentos`;

// storageKey propio: este portal vive en el mismo dominio (desarrollocombuses.github.io)
// que el panel principal, y localStorage se comparte por dominio, no por carpeta. Sin esto,
// el portal reutiliza (por error) la sesion que el usuario ya tenga abierta en el panel principal.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: "portal-documentos-rutas-auth", persistSession: true, autoRefreshToken: true },
});

const authPanel = document.getElementById("authPanel");
const appWrap = document.getElementById("appWrap");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authStatus = document.getElementById("authStatus");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const btnRefresh = document.getElementById("btnRefresh");
const rutaLabel = document.getElementById("rutaLabel");
const summaryBar = document.getElementById("summaryBar");
const alertaPreventivo = document.getElementById("alertaPreventivo");
const alertaPreventivoBody = document.getElementById("alertaPreventivoBody");
const vehiculosGrid = document.getElementById("vehiculosGrid");
const conductoresGrid = document.getElementById("conductoresGrid");
const buscarVehiculo = document.getElementById("buscarVehiculo");
const buscarConductor = document.getElementById("buscarConductor");
const secVehiculos = document.getElementById("secVehiculos");
const secConductores = document.getElementById("secConductores");
const secEscaneo = document.getElementById("secEscaneo");
const docModal = document.getElementById("docModal");
const docModalTitle = document.getElementById("docModalTitle");
const docModalBody = document.getElementById("docModalBody");
const docModalClose = document.getElementById("docModalClose");
const toastEl = document.getElementById("toast");
const fechaEscaneo = document.getElementById("fechaEscaneo");
const inputEscanear = document.getElementById("inputEscanear");
const inputEscanearGaleria = document.getElementById("inputEscanearGaleria");
const btnElegirGaleria = document.getElementById("btnElegirGaleria");
const btnGenerarPdf = document.getElementById("btnGenerarPdf");
const escaneosGrid = document.getElementById("escaneosGrid");

let currentData = null;
let escaneosActuales = [];
let toastTimer = null;

function showToast(msg, kind){
  toastEl.textContent = msg;
  toastEl.className = `toast ${kind || ""}`;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 3200);
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

// La bimensual (Mantenimiento Preventivo) se registra con la fecha en que se
// hizo; la proxima queda programada automaticamente 2 meses despues.
function addMonthsISO(isoDate, months){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ""));
  if (!m) return isoDate;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function fmtFecha(iso){
  if (!iso) return "—";
  const [y,m,d] = String(iso).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function estadoLabel(estado){
  return { VIGENTE:"Vigente", POR_VENCER:"Por vencer", VENCIDO:"Vencido", SIN_FECHA:"Sin fecha" }[estado] || "Sin archivo";
}
function estadoClass(estado){
  return { VIGENTE:"st-vigente", POR_VENCER:"st-por_vencer", VENCIDO:"st-vencido" }[estado] || "st-sin_fecha";
}

async function getToken(){
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token || null;
}

async function callFn(action, extra){
  const token = await getToken();
  if (!token) throw new Error("Tu sesión expiró, vuelve a iniciar sesión.");
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

async function callFnUpload(action, formData){
  const token = await getToken();
  if (!token) throw new Error("Tu sesión expiró, vuelve a iniciar sesión.");
  formData.set("action", action);
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

// ---------------- Auth ----------------
authForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  authStatus.textContent = "Ingresando…";
  authStatus.className = "auth-status";
  btnLogin.disabled = true;
  const { error } = await sb.auth.signInWithPassword({
    email: authEmail.value.trim(),
    password: authPassword.value,
  });
  btnLogin.disabled = false;
  if (error) {
    authStatus.textContent = "Usuario o contraseña incorrectos.";
    authStatus.className = "auth-status err";
    return;
  }
  authStatus.textContent = "";
  await mostrarApp();
});

btnLogout.addEventListener("click", async () => {
  await sb.auth.signOut();
  appWrap.classList.add("hidden");
  authPanel.classList.remove("hidden");
  authEmail.value = "";
  authPassword.value = "";
});

btnRefresh.addEventListener("click", () => cargarListado());

async function mostrarApp(){
  authPanel.classList.add("hidden");
  appWrap.classList.remove("hidden");
  await cargarListado();
}

// ---------------- Carga de datos ----------------
async function cerrarPorNoAutorizado(mensaje){
  await sb.auth.signOut();
  appWrap.classList.add("hidden");
  authPanel.classList.remove("hidden");
  authStatus.textContent = mensaje;
  authStatus.className = "auth-status err";
}

async function cargarListado(){
  try {
    btnRefresh.disabled = true;
    const data = await callFn("listar", {});
    currentData = data;
    const { data: userData } = await sb.auth.getUser();
    const email = userData?.user?.email || "";
    const rutas = (data.rutas || []).join(" · ") || "—";
    rutaLabel.innerHTML = `Ruta ${escapeHtml(rutas)} <span class="topbar-user">· conectado como <b>${escapeHtml(data.nombre_coordinador || email)}</b>${data.nombre_coordinador ? ` (${escapeHtml(email)})` : ""}</span>`;
    renderResumen();
    renderAlertaPreventivo();
    renderVehiculos();
    renderConductores();
  } catch (err) {
    const msg = err.message || "No se pudo cargar la información.";
    if (/no autenticado|no tiene ninguna ruta asignada|sesión expiró/i.test(msg)) {
      await cerrarPorNoAutorizado("Esta cuenta no tiene acceso al portal. Inicia sesión con el usuario de tu ruta.");
    } else {
      showToast(msg, "err");
    }
  } finally {
    btnRefresh.disabled = false;
  }
}

function docFor(lista, matchFn){
  return (lista || []).find(matchFn) || null;
}

function docMetaHtml(d){
  if (!d) return "Sin documento registrado.";
  const vence = `Vence: ${fmtFecha(d.fecha_vencimiento)}`;
  if (!d.storage_path) {
    return `${vence} · <span class="doc-sin-archivo">sin archivo digitalizado todavía — sube el PDF o foto</span>`;
  }
  return `${vence} · ${escapeHtml(d.nombre_archivo_original || "archivo cargado")}`;
}

function estadoDeVehiculo(placa){
  const docs = (currentData?.documentos_flota || []).filter((d) => d.placa === placa);
  const tipos = currentData?.tipos_flota || [];
  return tipos.map((t) => docFor(docs, (d) => d.tipo === t.tipo)?.estado_vencimiento || null);
}
function peorEstado(estados){
  if (estados.includes("VENCIDO")) return "VENCIDO";
  if (estados.includes("POR_VENCER")) return "POR_VENCER";
  if (estados.every((e) => e === null)) return null;
  if (estados.includes("SIN_FECHA")) return "SIN_FECHA";
  return "VIGENTE";
}

function renderResumen(){
  const tiposF = currentData?.tipos_flota || [];
  const tiposC = currentData?.tipos_conductor || [];
  let vencidos = 0, porVencer = 0, vigentes = 0, sinArchivo = 0;

  (currentData?.vehiculos || []).forEach((v) => {
    tiposF.forEach((t) => {
      const d = docFor(currentData.documentos_flota, (x) => x.placa === v.placa && x.tipo === t.tipo);
      if (!d) sinArchivo++;
      else if (d.estado_vencimiento === "VENCIDO") vencidos++;
      else if (d.estado_vencimiento === "POR_VENCER") porVencer++;
      else vigentes++;
    });
  });
  (currentData?.conductores || []).forEach((c) => {
    tiposC.forEach((t) => {
      const d = docFor(currentData.documentos_conductor, (x) => x.cedula === c.cedula && x.tipo === t.tipo);
      if (!d) sinArchivo++;
      else if (d.estado_vencimiento === "VENCIDO") vencidos++;
      else if (d.estado_vencimiento === "POR_VENCER") porVencer++;
      else vigentes++;
    });
  });

  summaryBar.innerHTML = `
    <div class="summary-chip chip-err"><span class="n">${vencidos}</span> vencidos</div>
    <div class="summary-chip chip-warn"><span class="n">${porVencer}</span> por vencer</div>
    <div class="summary-chip chip-ok"><span class="n">${vigentes}</span> vigentes</div>
    <div class="summary-chip"><span class="n">${sinArchivo}</span> sin archivo</div>
  `;
}

// Alerta de programacion: vehiculos con Mantenimiento Preventivo (bimensual)
// vencido o por vencer, ordenados por fecha para saber quien va primero.
function diasRestantes(fechaISO){
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  return Math.round((fecha - hoy) / 86400000);
}

function textoDias(dias){
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  return `En ${dias} días`;
}

function renderAlertaPreventivo(){
  const filas = (currentData?.vehiculos || [])
    .map((v) => {
      const d = docFor(currentData?.documentos_flota, (x) => x.placa === v.placa && x.tipo === "MANTENIMIENTO_PREVENTIVO");
      if (!d?.fecha_vencimiento) return null;
      return { v, fecha: d.fecha_vencimiento, dias: diasRestantes(d.fecha_vencimiento) };
    })
    .filter(Boolean)
    .sort((a, b) => a.dias - b.dias);

  if (!filas.length) {
    alertaPreventivo.classList.add("hidden");
    return;
  }
  alertaPreventivo.classList.remove("hidden");
  alertaPreventivoBody.innerHTML = filas.map(({ v, fecha, dias }) => {
    const cls = dias < 0 ? "is-vencido" : dias <= 7 ? "is-pronto" : "";
    return `
      <div class="alert-row ${cls}" data-placa="${escapeHtml(v.placa)}">
        <span class="alert-row-veh">${escapeHtml(v.placa)} <span class="alert-row-sub">Interno ${escapeHtml(v.interno || "—")}</span></span>
        <span class="alert-row-fecha">
          <span>${fmtFecha(fecha)}</span>
          <span class="alert-row-dias" style="color:${dias < 0 ? "var(--err)" : dias <= 7 ? "var(--warn)" : "var(--fg-soft)"}">${textoDias(dias)}</span>
        </span>
      </div>`;
  }).join("");

  alertaPreventivoBody.querySelectorAll(".alert-row").forEach((row) => {
    row.addEventListener("click", () => abrirModalVehiculo(row.getAttribute("data-placa")));
  });
}

function renderVehiculos(){
  const term = (buscarVehiculo.value || "").trim().toLowerCase();
  const rows = (currentData?.vehiculos || []).filter((v) =>
    !term || v.placa.toLowerCase().includes(term) || String(v.interno || "").toLowerCase().includes(term)
  );
  if (!rows.length) {
    vehiculosGrid.innerHTML = `<div class="empty-state">No hay vehículos que coincidan.</div>`;
    return;
  }
  vehiculosGrid.innerHTML = rows.map((v) => {
    const estados = estadoDeVehiculo(v.placa).filter(Boolean);
    const peor = peorEstado(estados);
    return `
      <div class="entity-card" data-placa="${escapeHtml(v.placa)}">
        <div class="entity-card-head">
          <div>
            <div class="entity-card-title">${escapeHtml(v.placa)}</div>
            <div class="entity-card-sub">Interno ${escapeHtml(v.interno || "—")} · ${escapeHtml(v.marca || "")} ${escapeHtml(v.modelo || "")}</div>
          </div>
          ${peor ? `<span class="status-pill ${estadoClass(peor)}">${estadoLabel(peor)}</span>` : ""}
        </div>
        <div class="entity-card-docs">
          ${(currentData.tipos_flota || []).map((t) => {
            const d = docFor(currentData.documentos_flota, (x) => x.placa === v.placa && x.tipo === t.tipo);
            const est = d ? d.estado_vencimiento : null;
            return `<div class="mini-doc">
              <span class="mini-doc-label">${escapeHtml(t.label)}</span>
              <span class="status-pill ${estadoClass(est)}">${estadoLabel(est)}</span>
            </div>`;
          }).join("")}
        </div>
      </div>`;
  }).join("");

  vehiculosGrid.querySelectorAll(".entity-card").forEach((card) => {
    card.addEventListener("click", () => abrirModalVehiculo(card.getAttribute("data-placa")));
  });
}

function renderConductores(){
  const term = (buscarConductor.value || "").trim().toLowerCase();
  const rows = (currentData?.conductores || []).filter((c) =>
    !term || (c.nombre || "").toLowerCase().includes(term) || (c.cedula || "").toLowerCase().includes(term)
  );
  if (!rows.length) {
    conductoresGrid.innerHTML = `<div class="empty-state">No hay conductores que coincidan.</div>`;
    return;
  }
  conductoresGrid.innerHTML = rows.map((c) => {
    const d = docFor(currentData.documentos_conductor, (x) => x.cedula === c.cedula && x.tipo === "LICENCIA_CONDUCCION");
    const est = d ? d.estado_vencimiento : null;
    return `
      <div class="entity-card" data-cedula="${escapeHtml(c.cedula)}">
        <div class="entity-card-head">
          <div>
            <div class="entity-card-title">${escapeHtml(c.nombre || "—")}</div>
            <div class="entity-card-sub">Cédula ${escapeHtml(c.cedula || "—")}${c.numero_interno ? ` · Int. ${escapeHtml(c.numero_interno)}` : ""}</div>
          </div>
          <span class="status-pill ${estadoClass(est)}">${estadoLabel(est)}</span>
        </div>
        <div class="entity-card-docs">
          <div class="mini-doc">
            <span class="mini-doc-label">Licencia de Conducción</span>
            <span class="status-pill ${estadoClass(est)}">${estadoLabel(est)}</span>
          </div>
        </div>
      </div>`;
  }).join("");

  conductoresGrid.querySelectorAll(".entity-card").forEach((card) => {
    card.addEventListener("click", () => abrirModalConductor(card.getAttribute("data-cedula")));
  });
}

// ---------------- Modal de documentos ----------------
function cerrarModal(){ docModal.classList.add("hidden"); docModalBody.innerHTML = ""; }
docModalClose.addEventListener("click", cerrarModal);
docModal.addEventListener("click", (ev) => { if (ev.target === docModal) cerrarModal(); });

function abrirModalVehiculo(placa){
  const v = (currentData.vehiculos || []).find((x) => x.placa === placa);
  if (!v) return;
  docModalTitle.textContent = `${v.placa} · Interno ${v.interno || "—"}`;
  docModalBody.innerHTML = (currentData.tipos_flota || []).map((t) => {
    const d = docFor(currentData.documentos_flota, (x) => x.placa === placa && x.tipo === t.tipo);
    const est = d ? d.estado_vencimiento : null;
    const esPreventivo = t.tipo === "MANTENIMIENTO_PREVENTIVO";
    const metaHtml = esPreventivo
      ? (d?.fecha_vencimiento ? `Próxima bimensual programada: <b>${fmtFecha(d.fecha_vencimiento)}</b>` : "Todavía no hay bimensual registrada.")
      : docMetaHtml(d);
    const accionesHtml = esPreventivo
      ? `
        <div class="doc-row-hint">Indica el día en que se hizo la bimensual — la próxima se programa sola, 2 meses después.</div>
        <div class="doc-row-actions">
          ${d?.storage_path ? `<button class="btn btn-sm btn-ver ver-archivo" data-bucket="flota-documentos" data-path="${escapeHtml(d.storage_path)}">👁 Ver archivo</button>` : ""}
          <input type="date" class="fecha-venc" data-preventivo="1" title="Fecha en que se realizó" />
          <label class="doc-file-label">📎 <span class="file-txt">Foto (opcional)</span>
            <input type="file" class="file-input" accept="application/pdf,image/*" />
          </label>
          <button class="btn btn-primary btn-sm btn-subir">✅ Registrar bimensual</button>
        </div>`
      : `
        <div class="doc-row-actions">
          ${d?.storage_path ? `<button class="btn btn-sm btn-ver ver-archivo" data-bucket="flota-documentos" data-path="${escapeHtml(d.storage_path)}">👁 Ver archivo</button>` : ""}
          <input type="date" class="fecha-venc" value="${d?.fecha_vencimiento || ""}" />
          <label class="doc-file-label">📎 <span class="file-txt">Elegir archivo</span>
            <input type="file" class="file-input" accept="application/pdf,image/*" />
          </label>
          <button class="btn btn-primary btn-sm btn-subir">Subir</button>
        </div>`;
    return `
      <div class="doc-row" data-tipo="${escapeHtml(t.tipo)}">
        <div class="doc-row-head">
          <span class="doc-row-title">${escapeHtml(t.label)}</span>
          <span class="status-pill ${estadoClass(est)}">${estadoLabel(est)}</span>
        </div>
        <div class="doc-row-meta">${metaHtml}</div>
        ${accionesHtml}
      </div>`;
  }).join("");

  bindDocRowEvents(docModalBody, { kind: "flota", placa: v.placa });
  docModal.classList.remove("hidden");
}

function abrirModalConductor(cedula){
  const c = (currentData.conductores || []).find((x) => x.cedula === cedula);
  if (!c) return;
  docModalTitle.textContent = `${c.nombre || "—"} · CC ${c.cedula}`;
  docModalBody.innerHTML = (currentData.tipos_conductor || []).map((t) => {
    const d = docFor(currentData.documentos_conductor, (x) => x.cedula === cedula && x.tipo === t.tipo);
    const est = d ? d.estado_vencimiento : null;
    return `
      <div class="doc-row" data-tipo="${escapeHtml(t.tipo)}">
        <div class="doc-row-head">
          <span class="doc-row-title">${escapeHtml(t.label)}</span>
          <span class="status-pill ${estadoClass(est)}">${estadoLabel(est)}</span>
        </div>
        <div class="doc-row-meta">
          ${docMetaHtml(d)}
        </div>
        <div class="doc-row-actions">
          ${d?.storage_path ? `<button class="btn btn-sm btn-ver ver-archivo" data-bucket="conductor-documentos" data-path="${escapeHtml(d.storage_path)}">👁 Ver archivo</button>` : ""}
          <input type="text" class="categoria-lic" placeholder="Categoría (ej. C2)" value="${escapeHtml(d?.categoria_licencia || "")}" style="max-width:120px" />
          <input type="date" class="fecha-venc" value="${d?.fecha_vencimiento || ""}" />
          <label class="doc-file-label">📎 <span class="file-txt">Elegir archivo</span>
            <input type="file" class="file-input" accept="application/pdf,image/*" />
          </label>
          <button class="btn btn-primary btn-sm btn-subir">Subir</button>
        </div>
      </div>`;
  }).join("");

  bindDocRowEvents(docModalBody, { kind: "conductor", cedula: c.cedula });
  docModal.classList.remove("hidden");
}

function bindDocRowEvents(container, ctx){
  container.querySelectorAll(".file-input").forEach((input) => {
    input.addEventListener("change", () => {
      const txt = input.closest(".doc-file-label").querySelector(".file-txt");
      txt.textContent = input.files?.[0]?.name || "Elegir archivo";
    });
  });
  container.querySelectorAll(".ver-archivo").forEach((a) => {
    a.addEventListener("click", async (ev) => {
      ev.preventDefault();
      try {
        const { url } = await callFn("ver_documento", { bucket: a.getAttribute("data-bucket"), path: a.getAttribute("data-path") });
        if (url) window.open(url, "_blank", "noopener");
      } catch (err) {
        showToast(err.message || "No se pudo abrir el archivo.", "err");
      }
    });
  });
  container.querySelectorAll(".btn-subir").forEach((btn) => {
    const row0 = btn.closest(".doc-row");
    const textoOriginal = btn.textContent;
    btn.addEventListener("click", async () => {
      const row = row0;
      const tipo = row.getAttribute("data-tipo");
      const esPreventivo = tipo === "MANTENIMIENTO_PREVENTIVO";
      const file = row.querySelector(".file-input").files?.[0];
      let fecha = row.querySelector(".fecha-venc").value || "";
      if (esPreventivo) {
        if (!fecha) { showToast("Indica la fecha en que se hizo la bimensual.", "err"); return; }
        fecha = addMonthsISO(fecha, 2);
      } else if (!file) {
        showToast("Selecciona un archivo antes de subir.", "err");
        return;
      }
      btn.disabled = true;
      btn.textContent = esPreventivo ? "Registrando…" : "Subiendo…";
      try {
        const fd = new FormData();
        fd.set("tipo", tipo);
        fd.set("fecha_vencimiento", fecha);
        if (file) fd.set("file", file);
        if (ctx.kind === "flota") {
          fd.set("placa", ctx.placa);
          await callFnUpload("subir_flota", fd);
        } else {
          fd.set("cedula", ctx.cedula);
          const categoria = row.querySelector(".categoria-lic")?.value || "";
          fd.set("categoria_licencia", categoria);
          await callFnUpload("subir_conductor", fd);
        }
        showToast(esPreventivo ? "Bimensual registrada. Próxima programada automáticamente." : "Documento subido correctamente.", "ok");
        await cargarListado();
        if (ctx.kind === "flota") abrirModalVehiculo(ctx.placa); else abrirModalConductor(ctx.cedula);
      } catch (err) {
        showToast(err.message || "No se pudo guardar.", "err");
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    });
  });
}

// ---------------- Tabs / busqueda ----------------
document.querySelectorAll(".section-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".section-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.getAttribute("data-section");
    secVehiculos.classList.toggle("hidden", target !== "vehiculos");
    secConductores.classList.toggle("hidden", target !== "conductores");
    secEscaneo.classList.toggle("hidden", target !== "escaneo");
    if (target === "escaneo") cargarEscaneos();
  });
});
buscarVehiculo.addEventListener("input", renderVehiculos);
buscarConductor.addEventListener("input", renderConductores);

// ---------------- Escaneo de tarjetas de despacho ----------------
function hoyISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
fechaEscaneo.value = hoyISO();

async function cargarEscaneos(){
  try {
    const { escaneos } = await callFn("listar_escaneos", { fecha: fechaEscaneo.value });
    escaneosActuales = escaneos || [];
    renderEscaneos();
  } catch (err) {
    showToast(err.message || "No se pudieron cargar las tarjetas escaneadas.", "err");
  }
}

function renderEscaneos(){
  if (!escaneosActuales.length) {
    escaneosGrid.innerHTML = `<div class="empty-state">Sin tarjetas escaneadas este día todavía.</div>`;
    return;
  }
  escaneosGrid.innerHTML = escaneosActuales.map((e) => {
    const hora = e.created_at ? new Date(e.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "";
    return `
      <div class="scan-thumb" data-id="${escapeHtml(e.id)}">
        <img src="${escapeHtml(e.url || "")}" alt="Tarjeta de despacho" loading="lazy" />
        <button class="scan-remove" data-id="${escapeHtml(e.id)}" title="Eliminar">✕</button>
        ${hora ? `<div class="scan-thumb-time">${escapeHtml(hora)}</div>` : ""}
      </div>`;
  }).join("");

  escaneosGrid.querySelectorAll(".scan-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!window.confirm("¿Eliminar esta foto de tarjeta de despacho?")) return;
      try {
        await callFn("eliminar_escaneo", { id: btn.getAttribute("data-id") });
        await cargarEscaneos();
      } catch (err) {
        showToast(err.message || "No se pudo eliminar.", "err");
      }
    });
  });
}

async function subirFotoEscaneo(file){
  if (!file) return;
  try {
    showToast("Subiendo foto…", "ok");
    const fd = new FormData();
    fd.set("ruta", (currentData?.rutas || [])[0] || "");
    fd.set("fecha", fechaEscaneo.value);
    fd.set("file", file);
    await callFnUpload("subir_escaneo", fd);
    await cargarEscaneos();
    showToast("Tarjeta guardada.", "ok");
  } catch (err) {
    showToast(err.message || "No se pudo subir la foto.", "err");
  }
}

fechaEscaneo.addEventListener("change", cargarEscaneos);
inputEscanear.addEventListener("change", () => {
  const file = inputEscanear.files?.[0];
  inputEscanear.value = "";
  subirFotoEscaneo(file);
});
btnElegirGaleria.addEventListener("click", () => inputEscanearGaleria.click());
inputEscanearGaleria.addEventListener("change", async () => {
  const files = Array.from(inputEscanearGaleria.files || []);
  inputEscanearGaleria.value = "";
  for (const file of files) {
    await subirFotoEscaneo(file);
  }
});

function loadImage(url){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer una de las fotos."));
    img.src = url;
  });
}

function imagenAJpegDataUrl(img, maxDim, calidad){
  const escala = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/jpeg", calidad), w, h };
}

btnGenerarPdf.addEventListener("click", async () => {
  if (!escaneosActuales.length) { showToast("No hay tarjetas escaneadas este día para generar el PDF.", "warn"); return; }
  btnGenerarPdf.disabled = true;
  btnGenerarPdf.textContent = "Generando…";
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margen = 24;

    for (let i = 0; i < escaneosActuales.length; i++) {
      const img = await loadImage(escaneosActuales[i].url);
      const { dataUrl, w, h } = imagenAJpegDataUrl(img, 1600, 0.82);
      if (i > 0) doc.addPage();
      const maxW = pageW - margen * 2;
      const maxH = pageH - margen * 2;
      const ratio = Math.min(maxW / w, maxH / h);
      const outW = w * ratio;
      const outH = h * ratio;
      doc.addImage(dataUrl, "JPEG", (pageW - outW) / 2, (pageH - outH) / 2, outW, outH);
    }

    const ruta = ((currentData?.rutas || [])[0] || "ruta").replace(/[^\w-]+/g, "_");
    doc.save(`tarjetas_despacho_${ruta}_${fechaEscaneo.value}.pdf`);
  } catch (err) {
    showToast(err.message || "No se pudo generar el PDF.", "err");
  } finally {
    btnGenerarPdf.disabled = false;
    btnGenerarPdf.textContent = "📄 Generar PDF del día";
  }
});

// ---------------- Arranque ----------------
(async function init(){
  const { data } = await sb.auth.getSession();
  if (data?.session) {
    await mostrarApp();
  }
})();
