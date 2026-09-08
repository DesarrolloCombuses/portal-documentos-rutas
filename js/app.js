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
const secProgramacion = document.getElementById("secProgramacion");
const secEscaneo = document.getElementById("secEscaneo");
const secPreoperacional = document.getElementById("secPreoperacional");
const progFiltros = document.getElementById("progFiltros");
const progList = document.getElementById("progList");
const btnExportarProgPdf = document.getElementById("btnExportarProgPdf");
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
const btnNuevoPreop = document.getElementById("btnNuevoPreop");
const buscarPreop = document.getElementById("buscarPreop");
const btnExportarPreopPdf = document.getElementById("btnExportarPreopPdf");
const preopList = document.getElementById("preopList");
const preopModal = document.getElementById("preopModal");
const preopModalTitle = document.getElementById("preopModalTitle");
const preopModalBody = document.getElementById("preopModalBody");
const preopModalClose = document.getElementById("preopModalClose");

let currentData = null;
let escaneosActuales = [];
let progFiltroActivo = "todas";
let preopActuales = [];
let preopEvidencias = [];
let preopRangoActivo = "hoy";
let preopEstadoActivo = "todas";
let toastTimer = null;

// ---------------- Checklist preoperacional: catálogo de items ----------------
// Mismas 17 verificaciones + combustible del formulario original (AppScript),
// ahora sobre Supabase. campo (camelCase) <-> columna real en public.preoperacionales.
const PREOP_COLUMNA = {
  aceite: "aceite", refrigerante: "refrigerante", frenos: "frenos",
  neumaticos: "neumaticos", desgaste: "desgaste",
  lucesDelanteras: "luces_delanteras", lucesTraseras: "luces_traseras", direccionales: "direccionales",
  frenosServicio: "frenos_servicio", frenoEstacionamiento: "freno_estacionamiento",
  espejos: "espejos", limpiaparabrisas: "limpiaparabrisas", cinturones: "cinturones",
  extintor: "extintor", botiquin: "botiquin", triangulos: "triangulos", documentacion: "documentacion",
};
// Nivel de severidad por valor: 0=OK, 1=alerta (amarillo), 2=crítico (rojo). Solo para
// pintar el semáforo en el portal — el servidor recalcula esto de forma independiente.
const PREOP_NIVELES = {
  aceite: { OK: 0, "Bajo": 1, "Requiere Cambio": 2 },
  refrigerante: { OK: 0, "Bajo": 1, "Falta": 2 },
  frenos: { OK: 0, "Bajo": 1, "Requiere Cambio": 2 },
  neumaticos: { OK: 0, "Baja": 1, "Desinflado": 2 },
  desgaste: { OK: 0, "Desgastado": 1, "Peligroso": 2 },
  lucesDelanteras: { OK: 0, "Una No Sirve": 1, "No Encienden": 2 },
  lucesTraseras: { OK: 0, "Una No Sirve": 1, "No Encienden": 2 },
  direccionales: { OK: 0, "Alguna Fallando": 1, "No Funcionan": 2 },
  frenosServicio: { OK: 0, "Suaves": 1, "No Funcionan": 2 },
  frenoEstacionamiento: { OK: 0, "Flojo": 1, "No Funciona": 2 },
  espejos: { OK: 0, "Ajustar": 1, "Dañado": 2 },
  limpiaparabrisas: { OK: 0, "No Limpian Bien": 1, "No Funcionan": 2 },
  cinturones: { OK: 0, "Alguno Dañado": 1, "No Funcionan": 2 },
  extintor: { OK: 0, "Vencido": 1, "Falta": 2 },
  botiquin: { OK: 0, "Incompleto": 1, "Falta": 2 },
  triangulos: { OK: 0, "Falta Uno": 1, "Faltan": 2 },
  documentacion: { OK: 0, "Falta Alguna": 1, "Vencida": 2 },
};
const PREOP_SECCIONES = [
  { titulo: "⚗️ Niveles de Fluidos", items: [
    { key: "aceite", label: "Nivel de Aceite del Motor", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Bajo", label: "⚠️ Bajo" }, { value: "Requiere Cambio", label: "❌ Requiere Cambio" }] },
    { key: "refrigerante", label: "Nivel de Refrigerante", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Bajo", label: "⚠️ Bajo" }, { value: "Falta", label: "❌ Falta" }] },
    { key: "frenos", label: "Nivel de Líquido de Frenos", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Bajo", label: "⚠️ Bajo" }, { value: "Requiere Cambio", label: "❌ Requiere Cambio" }] },
  ]},
  { titulo: "🌀 Neumáticos", items: [
    { key: "neumaticos", label: "Presión de Neumáticos", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Baja", label: "⚠️ Baja" }, { value: "Desinflado", label: "❌ Desinflado" }] },
    { key: "desgaste", label: "Desgaste de Neumáticos", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Desgastado", label: "⚠️ Desgastado" }, { value: "Peligroso", label: "❌ Peligroso" }] },
  ]},
  { titulo: "💡 Sistema de Iluminación", items: [
    { key: "lucesDelanteras", label: "Luces Delanteras", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Una No Sirve", label: "⚠️ Una No Sirve" }, { value: "No Encienden", label: "❌ No Encienden" }] },
    { key: "lucesTraseras", label: "Luces Traseras y Stop", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Una No Sirve", label: "⚠️ Una No Sirve" }, { value: "No Encienden", label: "❌ No Encienden" }] },
    { key: "direccionales", label: "Direccionales e Intermitentes", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Alguna Fallando", label: "⚠️ Alguna Fallando" }, { value: "No Funcionan", label: "❌ No Funcionan" }] },
  ]},
  { titulo: "🛑 Sistema de Frenos", items: [
    { key: "frenosServicio", label: "Frenos de Servicio", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Suaves", label: "⚠️ Suaves" }, { value: "No Funcionan", label: "❌ No Funcionan" }] },
    { key: "frenoEstacionamiento", label: "Freno de Estacionamiento", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Flojo", label: "⚠️ Flojo" }, { value: "No Funciona", label: "❌ No Funciona" }] },
  ]},
  { titulo: "🛡️ Elementos de Seguridad", items: [
    { key: "espejos", label: "Espejos Retrovisores", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Ajustar", label: "⚠️ Requiere Ajuste" }, { value: "Dañado", label: "❌ Dañado" }] },
    { key: "limpiaparabrisas", label: "Limpiaparabrisas", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "No Limpian Bien", label: "⚠️ No Limpian Bien" }, { value: "No Funcionan", label: "❌ No Funcionan" }] },
    { key: "cinturones", label: "Cinturones de Seguridad", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Alguno Dañado", label: "⚠️ Alguno Dañado" }, { value: "No Funcionan", label: "❌ No Funcionan" }] },
    { key: "extintor", label: "Extintor", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Vencido", label: "⚠️ Vencido" }, { value: "Falta", label: "❌ Falta" }] },
    { key: "botiquin", label: "Botiquín de Primeros Auxilios", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Incompleto", label: "⚠️ Incompleto" }, { value: "Falta", label: "❌ Falta" }] },
    { key: "triangulos", label: "Triángulos de Emergencia", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Falta Uno", label: "⚠️ Falta Uno" }, { value: "Faltan", label: "❌ Faltan" }] },
    { key: "documentacion", label: "Documentación en Orden", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Falta Alguna", label: "⚠️ Falta Alguna" }, { value: "Vencida", label: "❌ Vencida" }] },
  ]},
];
const PREOP_COMBUSTIBLE_ITEM = { key: "combustible", label: "Nivel de Combustible", opciones: [
  { value: "Lleno", label: "⛽ Lleno" }, { value: "3/4", label: "⛽ 3/4" }, { value: "1/2", label: "⛽ 1/2" },
  { value: "1/4", label: "⛽ 1/4" }, { value: "Reserva", label: "⚠️ Reserva" }] };

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
    renderProgramacion();
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

function filasProgramacion(){
  return (currentData?.vehiculos || [])
    .map((v) => {
      const d = docFor(currentData?.documentos_flota, (x) => x.placa === v.placa && x.tipo === "MANTENIMIENTO_PREVENTIVO");
      if (!d?.fecha_vencimiento) return null;
      return { v, fecha: d.fecha_vencimiento, dias: diasRestantes(d.fecha_vencimiento) };
    })
    .filter(Boolean)
    .sort((a, b) => a.dias - b.dias);
}

function aplicarFiltroProgramacion(filas){
  if (progFiltroActivo === "vencidas") return filas.filter((f) => f.dias < 0);
  if (progFiltroActivo === "7") return filas.filter((f) => f.dias <= 7);
  if (progFiltroActivo === "30") return filas.filter((f) => f.dias <= 30);
  return filas;
}

function renderProgramacion(){
  const todas = filasProgramacion();
  const filas = aplicarFiltroProgramacion(todas);

  if (!todas.length) {
    progList.innerHTML = `<div class="empty-state">Todavía no hay bimensuales programadas.</div>`;
    return;
  }
  if (!filas.length) {
    progList.innerHTML = `<div class="empty-state">No hay vehículos en este filtro.</div>`;
    return;
  }

  progList.innerHTML = filas.map(({ v, fecha, dias }) => {
    const cls = dias < 0 ? "is-vencido" : dias <= 7 ? "is-pronto" : "";
    const colorDias = dias < 0 ? "var(--err)" : dias <= 7 ? "var(--warn)" : "var(--fg-soft)";
    return `
      <div class="prog-row ${cls}" data-placa="${escapeHtml(v.placa)}">
        <div class="prog-row-main">
          <span class="prog-row-veh">${escapeHtml(v.placa)} <span class="alert-row-sub">Interno ${escapeHtml(v.interno || "—")}</span></span>
          <span class="alert-row-fecha">
            <span>${fmtFecha(fecha)}</span>
            <span class="alert-row-dias" style="color:${colorDias}">${textoDias(dias)}</span>
          </span>
          <button class="btn btn-sm btn-ghost prog-btn-registrar">✅ Registrar</button>
        </div>
        <div class="prog-row-inline hidden">
          <input type="date" class="prog-fecha-hecha" value="${hoyISO()}" title="Fecha en que se hizo" />
          <button class="btn btn-primary btn-sm prog-btn-confirmar">Guardar</button>
          <button class="btn btn-ghost btn-sm prog-btn-cancelar">Cancelar</button>
        </div>
      </div>`;
  }).join("");

  progList.querySelectorAll(".prog-row-veh").forEach((el) => {
    el.addEventListener("click", () => abrirModalVehiculo(el.closest(".prog-row").getAttribute("data-placa")));
  });
  progList.querySelectorAll(".prog-btn-registrar").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".prog-row").querySelector(".prog-row-inline").classList.toggle("hidden");
    });
  });
  progList.querySelectorAll(".prog-btn-cancelar").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".prog-row-inline").classList.add("hidden");
    });
  });
  progList.querySelectorAll(".prog-btn-confirmar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".prog-row");
      const placa = row.getAttribute("data-placa");
      const fechaHecha = row.querySelector(".prog-fecha-hecha").value;
      if (!fechaHecha) { showToast("Indica la fecha en que se hizo.", "err"); return; }
      const proxima = addMonthsISO(fechaHecha, 2);
      btn.disabled = true;
      btn.textContent = "Guardando…";
      try {
        const fd = new FormData();
        fd.set("placa", placa);
        fd.set("tipo", "MANTENIMIENTO_PREVENTIVO");
        fd.set("fecha_vencimiento", proxima);
        await callFnUpload("subir_flota", fd);
        showToast("Bimensual registrada. Próxima programada automáticamente.", "ok");
        await cargarListado();
        renderProgramacion();
      } catch (err) {
        showToast(err.message || "No se pudo registrar.", "err");
        btn.disabled = false;
        btn.textContent = "Guardar";
      }
    });
  });
}

progFiltros.querySelectorAll(".prog-filtro").forEach((btn) => {
  btn.addEventListener("click", () => {
    progFiltros.querySelectorAll(".prog-filtro").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    progFiltroActivo = btn.getAttribute("data-filtro");
    renderProgramacion();
  });
});

btnExportarProgPdf.addEventListener("click", () => {
  const filas = aplicarFiltroProgramacion(filasProgramacion());
  if (!filas.length) { showToast("No hay filas para exportar con este filtro.", "warn"); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = margin;

  doc.setFontSize(14);
  doc.text(`Programación de Mantenimiento Preventivo · ${(currentData?.rutas || []).join(", ")}`, margin, y);
  y += 18;
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, margin, y);
  y += 24;

  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("Placa", margin, y);
  doc.text("Interno", margin + 90, y);
  doc.text("Fecha", margin + 170, y);
  doc.text("Estado", margin + 260, y);
  doc.setFont(undefined, "normal");
  y += 6;
  doc.line(margin, y, pageWidth - margin, y);
  y += 14;

  filas.forEach(({ v, fecha, dias }) => {
    if (y > pageHeight - margin) { doc.addPage(); y = margin; }
    doc.text(String(v.placa || "—"), margin, y);
    doc.text(String(v.interno || "—"), margin + 90, y);
    doc.text(fmtFecha(fecha), margin + 170, y);
    doc.text(textoDias(dias), margin + 260, y);
    y += 16;
  });

  const ruta = ((currentData?.rutas || [])[0] || "ruta").replace(/[^\w-]+/g, "_");
  doc.save(`programacion_preventivo_${ruta}_${hoyISO()}.pdf`);
});

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
    secProgramacion.classList.toggle("hidden", target !== "programacion");
    secEscaneo.classList.toggle("hidden", target !== "escaneo");
    secPreoperacional.classList.toggle("hidden", target !== "preoperacional");
    if (target === "programacion") renderProgramacion();
    if (target === "escaneo") cargarEscaneos();
    if (target === "preoperacional") cargarPreoperacionales();
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

// ---------------- Checklist preoperacional ----------------
function isoOffsetDias(dias){
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function cargarPreoperacionales(){
  try {
    const extra = {};
    if (preopRangoActivo === "hoy") { extra.desde = hoyISO(); extra.hasta = hoyISO(); }
    else if (preopRangoActivo === "7") { extra.desde = isoOffsetDias(6); extra.hasta = hoyISO(); }
    else if (preopRangoActivo === "30") { extra.desde = isoOffsetDias(29); extra.hasta = hoyISO(); }
    const { preoperacionales, evidencias } = await callFn("listar_preoperacionales", extra);
    preopActuales = preoperacionales || [];
    preopEvidencias = evidencias || [];
    renderPreopList();
  } catch (err) {
    showToast(err.message || "No se pudieron cargar los preoperacionales.", "err");
  }
}

function badgeEstado(estado){
  return { OK: "🟢 OK", ALERTA: "🟡 Alerta", CRITICO: "🔴 Crítico" }[estado] || (estado || "—");
}
function claseEstado(estado){
  return { OK: "st-ok", ALERTA: "st-alerta", CRITICO: "st-critico" }[estado] || "";
}

function fallasDe(p){
  return PREOP_SECCIONES.flatMap((s) => s.items)
    .map((item) => {
      const valor = p[PREOP_COLUMNA[item.key]];
      const nivel = (PREOP_NIVELES[item.key] || {})[valor] ?? 0;
      return { item, valor, nivel };
    })
    .filter((x) => x.nivel > 0);
}

function preopFilasFiltradas(){
  const term = (buscarPreop.value || "").trim().toLowerCase();
  return preopActuales.filter((p) => {
    if (preopEstadoActivo !== "todas" && p.estado_general !== preopEstadoActivo) return false;
    if (!term) return true;
    return (p.placa || "").toLowerCase().includes(term)
      || (p.interno || "").toLowerCase().includes(term)
      || (p.conductor_nombre || "").toLowerCase().includes(term);
  });
}

function renderPreopList(){
  const filas = preopFilasFiltradas();
  if (!preopActuales.length) {
    preopList.innerHTML = `<div class="empty-state">Todavía no hay checklists preoperacionales en este período.</div>`;
    return;
  }
  if (!filas.length) {
    preopList.innerHTML = `<div class="empty-state">No hay checklists que coincidan con este filtro.</div>`;
    return;
  }
  preopList.innerHTML = filas.map((p) => {
    const fallas = fallasDe(p);
    const hora = p.created_at ? new Date(p.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "";
    return `
      <div class="preop-row ${claseEstado(p.estado_general)}" data-id="${escapeHtml(p.id)}">
        <div class="preop-row-main">
          <span class="preop-row-veh">${escapeHtml(p.placa)} <span class="preop-row-sub">Interno ${escapeHtml(p.interno || "—")} · ${escapeHtml(p.conductor_nombre || "—")}</span></span>
          <span class="preop-row-fecha">${fmtFecha(p.fecha)}${hora ? ` · ${escapeHtml(hora)}` : ""}</span>
          <span class="preop-badge ${claseEstado(p.estado_general)}">${badgeEstado(p.estado_general)}</span>
        </div>
        ${fallas.length ? `<div class="preop-row-fallas">⚠ ${fallas.map((f) => `${escapeHtml(f.item.label)}: ${escapeHtml(f.valor)}`).join(" · ")}</div>` : ""}
      </div>`;
  }).join("");

  preopList.querySelectorAll(".preop-row").forEach((row) => {
    row.addEventListener("click", () => abrirPreopDetalle(row.getAttribute("data-id")));
  });
}

function renderPreopRadioGroup(item){
  return `
    <div class="preop-item" data-key="${escapeHtml(item.key)}">
      <span class="preop-item-label">${escapeHtml(item.label)}</span>
      <div class="preop-radio-group">
        ${item.opciones.map((o) => `
          <label class="preop-radio-option">
            <input type="radio" name="preop_${escapeHtml(item.key)}" value="${escapeHtml(o.value)}" />
            ${escapeHtml(o.label)}
          </label>`).join("")}
      </div>
    </div>`;
}

function cerrarPreopModal(){
  preopModal.classList.add("hidden");
  preopModalBody.innerHTML = "";
}
preopModalClose.addEventListener("click", cerrarPreopModal);
preopModal.addEventListener("click", (ev) => { if (ev.target === preopModal) cerrarPreopModal(); });

function abrirPreopForm(){
  preopModalTitle.textContent = "Nuevo checklist preoperacional";
  const vehiculos = (currentData?.vehiculos || []).slice().sort((a, b) => a.placa.localeCompare(b.placa));
  const conductores = (currentData?.conductores || []).slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

  const seccionesHtml = PREOP_SECCIONES.map((s) => `
    <div class="preop-section-title">${escapeHtml(s.titulo)}</div>
    ${s.items.map((it) => renderPreopRadioGroup(it)).join("")}
  `).join("");

  preopModalBody.innerHTML = `
    <div class="preop-form-grid">
      <div class="preop-form-field">
        <label>Vehículo (placa) *</label>
        <select id="preopPlaca" required>
          <option value="" disabled selected>Selecciona el vehículo…</option>
          ${vehiculos.map((v) => `<option value="${escapeHtml(v.placa)}">${escapeHtml(v.placa)} — Interno ${escapeHtml(v.interno || "—")}</option>`).join("")}
        </select>
      </div>
      <div class="preop-form-field">
        <label>Conductor *</label>
        <select id="preopConductor" required>
          <option value="" disabled selected>Selecciona el conductor…</option>
          ${conductores.map((c) => `<option value="${escapeHtml(c.cedula)}">${escapeHtml(c.nombre)} — CC ${escapeHtml(c.cedula)}</option>`).join("")}
        </select>
      </div>
    </div>
    ${seccionesHtml}
    <div class="preop-section-title">⛽ Combustible y Observaciones</div>
    ${renderPreopRadioGroup(PREOP_COMBUSTIBLE_ITEM)}
    <div class="preop-form-field" style="margin-bottom:14px">
      <label>Observaciones</label>
      <textarea id="preopObservaciones" rows="3" placeholder="Falla, comentario u observación adicional…" style="width:100%;padding:9px 11px;border:1px solid var(--line-strong);border-radius:8px;font-family:inherit"></textarea>
    </div>
    <div id="preopFormMsg" class="auth-status err"></div>
    <button class="btn btn-primary btn-block" id="btnGuardarPreop">💾 Guardar checklist</button>
  `;

  preopModalBody.querySelectorAll(".preop-radio-option input").forEach((input) => {
    input.addEventListener("change", () => {
      const grupo = input.closest(".preop-radio-group");
      grupo.querySelectorAll(".preop-radio-option").forEach((o) => o.classList.remove("checked"));
      input.closest(".preop-radio-option").classList.add("checked");
      input.closest(".preop-item")?.classList.remove("has-error");
    });
  });

  document.getElementById("btnGuardarPreop").addEventListener("click", guardarPreopDesdeForm);
  preopModal.classList.remove("hidden");
}

async function guardarPreopDesdeForm(){
  const btn = document.getElementById("btnGuardarPreop");
  const msg = document.getElementById("preopFormMsg");
  msg.textContent = "";

  const placa = document.getElementById("preopPlaca").value;
  const cedula = document.getElementById("preopConductor").value;
  if (!placa || !cedula) {
    msg.textContent = "Selecciona el vehículo y el conductor.";
    return;
  }
  const conductor = (currentData.conductores || []).find((c) => c.cedula === cedula);

  const payload = { placa, conductor_cedula: cedula, conductor_nombre: conductor?.nombre || "" };
  const todosLosItems = PREOP_SECCIONES.flatMap((s) => s.items).concat([PREOP_COMBUSTIBLE_ITEM]);
  let faltan = false;
  todosLosItems.forEach((it) => {
    const checked = preopModalBody.querySelector(`input[name="preop_${it.key}"]:checked`);
    const itemEl = preopModalBody.querySelector(`.preop-item[data-key="${it.key}"]`);
    if (!checked) {
      faltan = true;
      itemEl?.classList.add("has-error");
      return;
    }
    itemEl?.classList.remove("has-error");
    payload[it.key] = checked.value;
  });
  payload.observaciones = document.getElementById("preopObservaciones").value.trim();

  if (faltan) {
    msg.textContent = "Completa todas las verificaciones marcadas en rojo.";
    preopModalBody.querySelector(".has-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const { preoperacional, alertas } = await callFn("guardar_preoperacional", payload);
    showToast("Checklist guardado.", "ok");
    await cargarPreoperacionales();
    if (alertas && alertas.length) {
      abrirPreopDetalle(preoperacional.id);
    } else {
      cerrarPreopModal();
    }
  } catch (err) {
    msg.textContent = err.message || "No se pudo guardar el checklist.";
    btn.disabled = false;
    btn.textContent = "💾 Guardar checklist";
  }
}

function abrirPreopDetalle(id){
  const p = preopActuales.find((x) => x.id === id);
  if (!p) return;
  preopModalTitle.textContent = `${p.placa} · ${fmtFecha(p.fecha)}`;

  const todosLosItems = PREOP_SECCIONES.flatMap((s) => s.items);
  const detalleHtml = todosLosItems.map((it) => {
    const valor = p[PREOP_COLUMNA[it.key]];
    const nivel = (PREOP_NIVELES[it.key] || {})[valor] ?? 0;
    return `<div class="preop-detalle-item nivel-${nivel}">
      <span class="preop-detalle-item-label">${escapeHtml(it.label)}</span>
      <b>${escapeHtml(valor || "—")}</b>
    </div>`;
  }).join("");

  const fallas = fallasDe(p);
  const evidenciasPorCampo = {};
  preopEvidencias.filter((e) => e.preoperacional_id === p.id).forEach((e) => {
    (evidenciasPorCampo[e.campo] = evidenciasPorCampo[e.campo] || []).push(e);
  });

  const evidenciasHtml = fallas.map(({ item }) => {
    const fotos = evidenciasPorCampo[item.key] || [];
    return `
      <div class="preop-evidencia-block" data-campo="${escapeHtml(item.key)}">
        <div class="preop-evidencia-head">
          <b>${escapeHtml(item.label)}</b>
          <label class="btn btn-sm btn-ghost" style="position:relative;cursor:pointer">
            📷 Agregar foto
            <input type="file" accept="image/*" capture="environment" class="preop-evid-input" style="position:absolute;inset:0;opacity:0;cursor:pointer" />
          </label>
        </div>
        <div class="preop-evidencia-fotos">
          ${fotos.map((f) => `<img src="${escapeHtml(f.url || "")}" alt="Evidencia" loading="lazy" />`).join("") || `<span class="muted" style="font-size:12px">Sin foto todavía.</span>`}
        </div>
      </div>`;
  }).join("");

  preopModalBody.innerHTML = `
    <div style="margin-bottom:10px;font-size:13px;color:var(--fg-soft)">
      Conductor: <b>${escapeHtml(p.conductor_nombre || "—")}</b> · Interno ${escapeHtml(p.interno || "—")}
      ${p.observaciones ? `<div style="margin-top:6px">📝 ${escapeHtml(p.observaciones)}</div>` : ""}
    </div>
    <div class="preop-detalle-grid">${detalleHtml}</div>
    ${fallas.length ? `<div class="preop-section-title">📷 Evidencia de fallas</div>${evidenciasHtml}` : ""}
  `;

  preopModalBody.querySelectorAll(".preop-evid-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      const campo = input.closest(".preop-evidencia-block").getAttribute("data-campo");
      try {
        showToast("Subiendo foto…", "ok");
        const fd = new FormData();
        fd.set("preoperacional_id", p.id);
        fd.set("campo", campo);
        fd.set("file", file);
        await callFnUpload("subir_evidencia_preoperacional", fd);
        await cargarPreoperacionales();
        abrirPreopDetalle(p.id);
        showToast("Foto guardada.", "ok");
      } catch (err) {
        showToast(err.message || "No se pudo subir la foto.", "err");
      }
    });
  });

  preopModal.classList.remove("hidden");
}

btnNuevoPreop.addEventListener("click", abrirPreopForm);
buscarPreop.addEventListener("input", renderPreopList);
document.getElementById("preopFiltrosFecha").querySelectorAll(".preop-filtro").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("preopFiltrosFecha").querySelectorAll(".preop-filtro").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    preopRangoActivo = btn.getAttribute("data-rango");
    cargarPreoperacionales();
  });
});
document.getElementById("preopFiltrosEstado").querySelectorAll(".preop-filtro").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("preopFiltrosEstado").querySelectorAll(".preop-filtro").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    preopEstadoActivo = btn.getAttribute("data-estado");
    renderPreopList();
  });
});

btnExportarPreopPdf.addEventListener("click", () => {
  const filas = preopFilasFiltradas();
  if (!filas.length) { showToast("No hay filas para exportar con este filtro.", "warn"); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const colFallas = margin + 340;
  let y = margin;

  doc.setFontSize(14);
  doc.text(`Checklist Preoperacional · ${(currentData?.rutas || []).join(", ")}`, margin, y);
  y += 18;
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, margin, y);
  y += 24;

  doc.setFontSize(9.5);
  doc.setFont(undefined, "bold");
  doc.text("Fecha", margin, y);
  doc.text("Placa", margin + 60, y);
  doc.text("Interno", margin + 115, y);
  doc.text("Conductor", margin + 170, y);
  doc.text("Estado", margin + 280, y);
  doc.text("Fallas", colFallas, y);
  doc.setFont(undefined, "normal");
  y += 6;
  doc.line(margin, y, pageWidth - margin, y);
  y += 14;

  filas.forEach((p) => {
    const textoFallas = fallasDe(p).map((f) => `${f.item.label}: ${f.valor}`).join("; ") || "—";
    const lineasFallas = doc.splitTextToSize(textoFallas, pageWidth - margin - colFallas);
    const alturaFila = Math.max(14, lineasFallas.length * 11);
    if (y + alturaFila > pageHeight - margin) { doc.addPage(); y = margin; }
    doc.text(fmtFecha(p.fecha), margin, y);
    doc.text(String(p.placa || "—"), margin + 60, y);
    doc.text(String(p.interno || "—"), margin + 115, y);
    doc.text(String(p.conductor_nombre || "—").slice(0, 22), margin + 170, y);
    doc.text(badgeEstado(p.estado_general), margin + 280, y);
    doc.text(lineasFallas, colFallas, y);
    y += alturaFila + 6;
  });

  const ruta = ((currentData?.rutas || [])[0] || "ruta").replace(/[^\w-]+/g, "_");
  doc.save(`preoperacional_${ruta}_${hoyISO()}.pdf`);
});

// ---------------- Arranque ----------------
(async function init(){
  const { data } = await sb.auth.getSession();
  if (data?.session) {
    await mostrarApp();
  }
})();
