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
const vehiculosGrid = document.getElementById("vehiculosGrid");
const conductoresGrid = document.getElementById("conductoresGrid");
const buscarVehiculo = document.getElementById("buscarVehiculo");
const buscarConductor = document.getElementById("buscarConductor");
const secVehiculos = document.getElementById("secVehiculos");
const secConductores = document.getElementById("secConductores");
const docModal = document.getElementById("docModal");
const docModalTitle = document.getElementById("docModalTitle");
const docModalBody = document.getElementById("docModalBody");
const docModalClose = document.getElementById("docModalClose");
const toastEl = document.getElementById("toast");

let currentData = null;
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
          ${d?.storage_path ? `<button class="btn btn-sm btn-ver ver-archivo" data-bucket="flota-documentos" data-path="${escapeHtml(d.storage_path)}">👁 Ver archivo</button>` : ""}
          <input type="date" class="fecha-venc" value="${d?.fecha_vencimiento || ""}" />
          <label class="doc-file-label">📎 <span class="file-txt">Elegir archivo</span>
            <input type="file" class="file-input" accept="application/pdf,image/*" />
          </label>
          <button class="btn btn-primary btn-sm btn-subir">Subir</button>
        </div>
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
    btn.addEventListener("click", async () => {
      const row = btn.closest(".doc-row");
      const tipo = row.getAttribute("data-tipo");
      const file = row.querySelector(".file-input").files?.[0];
      const fecha = row.querySelector(".fecha-venc").value || "";
      if (!file) { showToast("Selecciona un archivo antes de subir.", "err"); return; }
      btn.disabled = true;
      btn.textContent = "Subiendo…";
      try {
        const fd = new FormData();
        fd.set("tipo", tipo);
        fd.set("fecha_vencimiento", fecha);
        fd.set("file", file);
        if (ctx.kind === "flota") {
          fd.set("placa", ctx.placa);
          await callFnUpload("subir_flota", fd);
        } else {
          fd.set("cedula", ctx.cedula);
          const categoria = row.querySelector(".categoria-lic")?.value || "";
          fd.set("categoria_licencia", categoria);
          await callFnUpload("subir_conductor", fd);
        }
        showToast("Documento subido correctamente.", "ok");
        await cargarListado();
        if (ctx.kind === "flota") abrirModalVehiculo(ctx.placa); else abrirModalConductor(ctx.cedula);
      } catch (err) {
        showToast(err.message || "No se pudo subir el documento.", "err");
        btn.disabled = false;
        btn.textContent = "Subir";
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
  });
});
buscarVehiculo.addEventListener("input", renderVehiculos);
buscarConductor.addEventListener("input", renderConductores);

// ---------------- Arranque ----------------
(async function init(){
  const { data } = await sb.auth.getSession();
  if (data?.session) {
    await mostrarApp();
  }
})();
