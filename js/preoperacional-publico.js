// Checklist Preoperacional - link publico (SIN login) para conductores de
// Zamora y Aranjuez - Guadalupe. Reemplaza la vieja app de Google Apps Script.
// Habla solo con la edge function preoperacional-publico (verify_jwt=false),
// que valida todo del lado del servidor (no confia en nada del navegador).
//
// v2: 9 verificaciones consolidadas (antes 17) para llenarlo en menos de 3
// minutos, + kilometraje y cedula obligatorios, + decision final Apto/No apto.

const FUNCTION_URL = "https://cbplebkmxrkaafqdhiyi.supabase.co/functions/v1/preoperacional-publico";

const pubFiltroVehiculo = document.getElementById("pubFiltroVehiculo");
const pubPlaca = document.getElementById("pubPlaca");
const pubConductorWrap = document.getElementById("pubConductorWrap");
const pubConductor = document.getElementById("pubConductor");
const pubConductorConfirmado = document.getElementById("pubConductorConfirmado");
const pubConductorConfirmadoNombre = document.getElementById("pubConductorConfirmadoNombre");
const btnCambiarConductor = document.getElementById("btnCambiarConductor");
const pubCedula = document.getElementById("pubCedula");
const pubKilometraje = document.getElementById("pubKilometraje");
const btnAyuda = document.getElementById("btnAyuda");
const tutorialModal = document.getElementById("tutorialModal");
const tutorialClose = document.getElementById("tutorialClose");
const btnTutorialEntendido = document.getElementById("btnTutorialEntendido");
const pubErrorModal = document.getElementById("pubErrorModal");
const pubErrorTitulo = document.getElementById("pubErrorTitulo");
const pubErrorMensaje = document.getElementById("pubErrorMensaje");
const pubErrorClose = document.getElementById("pubErrorClose");
const pubErrorOk = document.getElementById("pubErrorOk");
const pubSecciones = document.getElementById("pubSecciones");
const pubCombustible = document.getElementById("pubCombustible");
const pubObservaciones = document.getElementById("pubObservaciones");
const pubFormMsg = document.getElementById("pubFormMsg");
const btnGuardarPublico = document.getElementById("btnGuardarPublico");
const publicFormWrap = document.getElementById("publicFormWrap");
const publicExito = document.getElementById("publicExito");
const publicExitoIcono = document.getElementById("publicExitoIcono");
const publicExitoTitulo = document.getElementById("publicExitoTitulo");
const publicExitoSub = document.getElementById("publicExitoSub");
const publicEvidenciasWrap = document.getElementById("publicEvidenciasWrap");
const btnOtroChecklist = document.getElementById("btnOtroChecklist");
const toastEl = document.getElementById("toast");

let vehiculos = [];
let conductores = [];
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

async function callFn(action, extra){
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

async function callFnUpload(action, formData){
  formData.set("action", action);
  const res = await fetch(FUNCTION_URL, { method: "POST", body: formData });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

// Checklist consolidado: 9 verificaciones (antes 17) para que llenarlo tome
// menos de 3 minutos. Mismo catalogo que usa el portal de coordinadores
// (js/app.js) -- se repite aqui porque esta pagina es publica y autocontenida.
const PREOP_SECCIONES = [
  { titulo: "🔧 Motor y Rodamiento", items: [
    { key: "fluidos", label: "Niveles de Fluidos (aceite, refrigerante, líquido de frenos)", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Alguno bajo", label: "⚠️ Alguno bajo" }, { value: "Falta alguno o requiere cambio", label: "❌ Falta alguno o requiere cambio" }] },
    { key: "llantas", label: "Llantas (presión y desgaste)", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Presión baja o desgaste visible", label: "⚠️ Presión baja o desgaste visible" }, { value: "Llanta lisa o desinflada", label: "❌ Llanta lisa o desinflada" }] },
    { key: "frenos", label: "Frenos (servicio y estacionamiento)", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Se sienten suaves o flojos", label: "⚠️ Se sienten suaves o flojos" }, { value: "No frenan bien", label: "❌ No frenan bien" }] },
  ]},
  { titulo: "💡 Visibilidad y Seguridad Interior", items: [
    { key: "luces", label: "Luces (delanteras, traseras, direccionales)", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Alguna no sirve", label: "⚠️ Alguna no sirve" }, { value: "Varias no encienden", label: "❌ Varias no encienden" }] },
    { key: "visibilidad", label: "Visibilidad (espejos y limpiaparabrisas)", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Requiere ajuste o no limpia bien", label: "⚠️ Requiere ajuste o no limpia bien" }, { value: "Dañado o no funciona", label: "❌ Dañado o no funciona" }] },
    { key: "cinturones", label: "Cinturones de Seguridad", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Alguno dañado", label: "⚠️ Alguno dañado" }, { value: "No funcionan", label: "❌ No funcionan" }] },
  ]},
  { titulo: "🚪 Emergencia, Puertas y Documentos", items: [
    { key: "emergencia", label: "Equipo de Emergencia (extintor, botiquín, triángulos, chaleco, linterna)", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Algo incompleto o vencido", label: "⚠️ Algo incompleto o vencido" }, { value: "Falta extintor o botiquín", label: "❌ Falta extintor o botiquín" }] },
    { key: "puertas", label: "Puertas, Salidas de Emergencia y Pasamanos", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Pasamanos flojo o puerta dura", label: "⚠️ Pasamanos flojo o puerta dura" }, { value: "No cierra bien o no hay salida de emergencia", label: "❌ No cierra bien o no hay salida de emergencia" }] },
    { key: "documentacion", label: "Documentos del Vehículo (SOAT, Tecnomecánica, Tarjeta de Operación)", opciones: [
      { value: "OK", label: "✅ OK" }, { value: "Alguno por vencer", label: "⚠️ Alguno por vencer" }, { value: "Alguno vencido o falta", label: "❌ Alguno vencido o falta" }] },
  ]},
];
const PREOP_COMBUSTIBLE_ITEM = { key: "combustible", label: "Nivel de Combustible", opciones: [
  { value: "Lleno", label: "⛽ Lleno" }, { value: "3/4", label: "⛽ 3/4" }, { value: "1/2", label: "⛽ 1/2" },
  { value: "1/4", label: "⛽ 1/4" }, { value: "Reserva", label: "⚠️ Reserva" }] };
const PREOP_LABELS = {};
PREOP_SECCIONES.forEach((s) => s.items.forEach((it) => { PREOP_LABELS[it.key] = it.label; }));

// Decision final que exige la practica estandar colombiana de inspeccion
// preoperacional (Apto / Apto con observaciones / No apto), calculada del
// estado_general que ya valido el servidor -- no se le pregunta al conductor,
// para no sumarle otro paso al formulario.
const DECISION = {
  OK: { icono: "✅", titulo: "Vehículo APTO para operar", kind: "ok" },
  ALERTA: { icono: "⚠️", titulo: "Vehículo APTO CON OBSERVACIONES", kind: "warn" },
  CRITICO: { icono: "❌", titulo: "Vehículo NO APTO — no debe salir a operar hasta corregir", kind: "err" },
};

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

pubSecciones.innerHTML = PREOP_SECCIONES.map((s) => `
  <div class="preop-section-title">${escapeHtml(s.titulo)}</div>
  ${s.items.map((it) => renderPreopRadioGroup(it)).join("")}
`).join("");
pubCombustible.innerHTML = renderPreopRadioGroup(PREOP_COMBUSTIBLE_ITEM);

document.querySelectorAll(".preop-radio-option input").forEach((input) => {
  input.addEventListener("change", () => {
    const grupo = input.closest(".preop-radio-group");
    grupo.querySelectorAll(".preop-radio-option").forEach((o) => o.classList.remove("checked"));
    input.closest(".preop-radio-option").classList.add("checked");
    input.closest(".preop-item")?.classList.remove("has-error");
  });
});

// ---------------- Catálogo (vehículos + conductores de Zamora/Aranjuez) ----------------
function renderVehiculoOptions(){
  const term = (pubFiltroVehiculo.value || "").trim().toLowerCase();
  const filtrados = vehiculos.filter((v) =>
    !term || v.placa.toLowerCase().includes(term) || String(v.interno || "").toLowerCase().includes(term)
  );
  const valorActual = pubPlaca.value;
  pubPlaca.innerHTML = `<option value="" disabled ${valorActual ? "" : "selected"}>Selecciona el vehículo…</option>` +
    filtrados.map((v) => `<option value="${escapeHtml(v.placa)}" ${v.placa === valorActual ? "selected" : ""}>${escapeHtml(v.placa)} — Interno ${escapeHtml(v.interno || "—")}</option>`).join("");
}
pubFiltroVehiculo.addEventListener("input", renderVehiculoOptions);

async function cargarCatalogo(){
  try {
    const { vehiculos: vs, conductores: cs } = await callFn("catalogo", {});
    vehiculos = (vs || []).slice().sort((a, b) => a.placa.localeCompare(b.placa));
    conductores = (cs || []).slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    renderVehiculoOptions();
  } catch (err) {
    pubFormMsg.textContent = "No se pudo cargar la lista de vehículos. Verifica tu conexión y recarga la página.";
  }
}
cargarCatalogo();

// ---------------- Modal de error/aviso ----------------
let pubErrorAlCerrar = null;
function mostrarError(titulo, mensaje, alCerrar){
  pubErrorTitulo.textContent = titulo;
  pubErrorMensaje.textContent = mensaje;
  pubErrorAlCerrar = alCerrar || null;
  pubErrorModal.classList.remove("hidden");
}
function cerrarError(){
  pubErrorModal.classList.add("hidden");
  const cb = pubErrorAlCerrar;
  pubErrorAlCerrar = null;
  if (cb) cb();
}
pubErrorClose.addEventListener("click", cerrarError);
pubErrorOk.addEventListener("click", cerrarError);

// El nombre del conductor NUNCA se escribe a mano: es de solo lectura y solo
// lo llena el sistema cuando la cédula coincide con un conductor real de
// Sonar (o de la tabla employees, si Sonar falla). Así evitamos nombres mal
// escritos o inventados en el checklist.
function bloquearConductor(nombre, cedula){
  pubConductor.value = nombre;
  if (cedula) pubCedula.value = cedula;
  pubConductorWrap.classList.add("hidden");
  pubConductorConfirmadoNombre.textContent = nombre;
  pubConductorConfirmado.classList.remove("hidden");
}
function desbloquearConductor(){
  pubConductorConfirmado.classList.add("hidden");
  pubConductorWrap.classList.remove("hidden");
  pubConductor.value = "";
  pubCedula.value = "";
  pubCedula.focus();
}
btnCambiarConductor.addEventListener("click", desbloquearConductor);

// Solo números en la cédula.
pubCedula.addEventListener("input", () => {
  const soloDigitos = pubCedula.value.replace(/\D+/g, "");
  if (soloDigitos !== pubCedula.value) pubCedula.value = soloDigitos;
});

// Único flujo para identificar al conductor: escriben la cédula y se busca
// en el catálogo. Si no existe, un modal se lo avisa (en vez de dejarlo
// escribir el nombre a mano).
pubCedula.addEventListener("change", () => {
  const cedula = pubCedula.value.trim();
  if (!cedula) return;
  const match = conductores.find((c) => (c.cedula || "").trim() === cedula);
  if (match?.nombre) {
    bloquearConductor(match.nombre, match.cedula);
    return;
  }
  mostrarError(
    "❌ Cédula no encontrada",
    `No encontramos ningún conductor registrado con la cédula ${cedula}. Verifica que esté bien escrita o contacta a tu coordinador de ruta.`,
    () => { pubCedula.value = ""; pubCedula.focus(); }
  );
});

// ---------------- Mini-tutorial ----------------
function abrirTutorial(){ tutorialModal.classList.remove("hidden"); }
function cerrarTutorial(){
  tutorialModal.classList.add("hidden");
  try { localStorage.setItem("preop_tutorial_visto", "1"); } catch (_) {}
}
btnAyuda.addEventListener("click", abrirTutorial);
tutorialClose.addEventListener("click", cerrarTutorial);
btnTutorialEntendido.addEventListener("click", cerrarTutorial);
let tutorialYaVisto = false;
try { tutorialYaVisto = localStorage.getItem("preop_tutorial_visto") === "1"; } catch (_) {}
if (!tutorialYaVisto) abrirTutorial();

// ---------------- Guardar ----------------
btnGuardarPublico.addEventListener("click", async () => {
  pubFormMsg.textContent = "";
  const placa = pubPlaca.value;
  const conductorNombre = pubConductor.value.trim();
  const conductorCedula = pubCedula.value.trim();
  const kilometraje = pubKilometraje.value;

  if (!placa) { pubFormMsg.textContent = "Selecciona el vehículo."; return; }
  if (!conductorNombre) { pubFormMsg.textContent = "Escribe tu nombre."; return; }
  if (!conductorCedula) { pubFormMsg.textContent = "Escribe tu cédula."; return; }
  if (kilometraje === "" || Number(kilometraje) < 0) { pubFormMsg.textContent = "Indica el kilometraje del vehículo."; return; }

  const payload = { placa, conductor_nombre: conductorNombre, conductor_cedula: conductorCedula, kilometraje: Number(kilometraje) };

  const todosLosItems = PREOP_SECCIONES.flatMap((s) => s.items).concat([PREOP_COMBUSTIBLE_ITEM]);
  let faltan = false;
  todosLosItems.forEach((it) => {
    const checked = document.querySelector(`input[name="preop_${it.key}"]:checked`);
    const itemEl = document.querySelector(`.preop-item[data-key="${it.key}"]`);
    if (!checked) {
      faltan = true;
      itemEl?.classList.add("has-error");
      return;
    }
    itemEl?.classList.remove("has-error");
    payload[it.key] = checked.value;
  });
  payload.observaciones = pubObservaciones.value.trim();

  if (faltan) {
    pubFormMsg.textContent = "Completa todas las verificaciones marcadas en rojo.";
    document.querySelector(".has-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  btnGuardarPublico.disabled = true;
  btnGuardarPublico.textContent = "Guardando…";
  try {
    const { preoperacional, alertas } = await callFn("guardar", payload);
    mostrarExito(preoperacional, alertas || []);
  } catch (err) {
    pubFormMsg.textContent = err.message || "No se pudo guardar el checklist.";
    window.scrollTo(0, 0);
  } finally {
    btnGuardarPublico.disabled = false;
    btnGuardarPublico.textContent = "💾 Guardar checklist";
  }
});

function mostrarExito(preoperacional, alertas){
  publicFormWrap.classList.add("hidden");
  publicExito.classList.remove("hidden");
  window.scrollTo(0, 0);

  const decision = DECISION[preoperacional.estado_general] || DECISION.OK;
  publicExitoIcono.textContent = decision.icono;
  publicExitoTitulo.textContent = decision.titulo;
  publicExitoTitulo.style.color = decision.kind === "err" ? "var(--err)" : decision.kind === "warn" ? "var(--warn)" : "var(--ok)";
  publicExitoSub.textContent = `${preoperacional.placa} · ${preoperacional.conductor_nombre} · Km ${preoperacional.kilometraje ?? "—"}`;

  if (!alertas.length) {
    publicEvidenciasWrap.innerHTML = "";
    return;
  }

  publicEvidenciasWrap.innerHTML = `
    <div class="preop-section-title" style="margin-top:14px">📷 Agrega una foto de cada novedad (opcional)</div>
    ${alertas.map((a) => `
      <div class="preop-evidencia-block" data-campo="${escapeHtml(a.campo)}">
        <div class="preop-evidencia-head">
          <b>${escapeHtml(PREOP_LABELS[a.campo] || a.campo)}: ${escapeHtml(a.valor)}</b>
          <label class="btn btn-sm btn-ghost" style="position:relative;cursor:pointer">
            📷 Tomar foto
            <input type="file" accept="image/*" capture="environment" class="pub-evid-input" style="position:absolute;inset:0;opacity:0;cursor:pointer" />
          </label>
        </div>
        <div class="preop-evidencia-fotos"></div>
      </div>`).join("")}
  `;

  publicEvidenciasWrap.querySelectorAll(".pub-evid-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      const block = input.closest(".preop-evidencia-block");
      const campo = block.getAttribute("data-campo");
      try {
        showToast("Subiendo foto…", "ok");
        const fd = new FormData();
        fd.set("preoperacional_id", preoperacional.id);
        fd.set("campo", campo);
        fd.set("file", file);
        await callFnUpload("subir_evidencia", fd);
        block.querySelector(".preop-evidencia-fotos").innerHTML += `<span style="font-size:12px;color:var(--ok)">✅ Foto guardada</span>`;
        showToast("Foto guardada.", "ok");
      } catch (err) {
        showToast(err.message || "No se pudo subir la foto.", "err");
      }
    });
  });
}

btnOtroChecklist.addEventListener("click", () => {
  publicExito.classList.add("hidden");
  publicFormWrap.classList.remove("hidden");
  pubPlaca.value = "";
  desbloquearConductor();
  pubKilometraje.value = "";
  pubFiltroVehiculo.value = "";
  pubObservaciones.value = "";
  renderVehiculoOptions();
  document.querySelectorAll('input[type="radio"]:checked').forEach((r) => { r.checked = false; });
  document.querySelectorAll(".preop-radio-option.checked").forEach((o) => o.classList.remove("checked"));
  document.querySelectorAll(".preop-item.has-error").forEach((el) => el.classList.remove("has-error"));
  pubFormMsg.textContent = "";
  window.scrollTo(0, 0);
});
