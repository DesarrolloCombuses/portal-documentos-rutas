// Checklist Preoperacional - link publico (SIN login) para conductores de
// Zamora y Aranjuez - Guadalupe. Reemplaza la vieja app de Google Apps Script.
// Habla solo con la edge function preoperacional-publico (verify_jwt=false),
// que valida todo del lado del servidor (no confia en nada del navegador).

const FUNCTION_URL = "https://cbplebkmxrkaafqdhiyi.supabase.co/functions/v1/preoperacional-publico";

const pubFiltroVehiculo = document.getElementById("pubFiltroVehiculo");
const pubPlaca = document.getElementById("pubPlaca");
const pubConductor = document.getElementById("pubConductor");
const pubConductoresList = document.getElementById("pubConductoresList");
const pubSecciones = document.getElementById("pubSecciones");
const pubCombustible = document.getElementById("pubCombustible");
const pubObservaciones = document.getElementById("pubObservaciones");
const pubFormMsg = document.getElementById("pubFormMsg");
const btnGuardarPublico = document.getElementById("btnGuardarPublico");
const publicFormWrap = document.getElementById("publicFormWrap");
const publicExito = document.getElementById("publicExito");
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

// Mismo catalogo de las 17 verificaciones + combustible que usa el portal de
// coordinadores (js/app.js) -- se repite aqui porque esta pagina es publica y
// autocontenida (no comparte sesion ni scripts con el panel con login).
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
const PREOP_LABELS = {};
PREOP_SECCIONES.forEach((s) => s.items.forEach((it) => { PREOP_LABELS[it.key] = it.label; }));

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
    pubConductoresList.innerHTML = conductores.map((c) => `<option value="${escapeHtml(c.nombre)}"></option>`).join("");
  } catch (err) {
    pubFormMsg.textContent = "No se pudo cargar la lista de vehículos. Verifica tu conexión y recarga la página.";
  }
}
cargarCatalogo();

// ---------------- Guardar ----------------
btnGuardarPublico.addEventListener("click", async () => {
  pubFormMsg.textContent = "";
  const placa = pubPlaca.value;
  const conductorNombre = pubConductor.value.trim();
  if (!placa) { pubFormMsg.textContent = "Selecciona el vehículo."; return; }
  if (!conductorNombre) { pubFormMsg.textContent = "Escribe tu nombre."; return; }

  const conductorMatch = conductores.find((c) => (c.nombre || "").trim().toLowerCase() === conductorNombre.toLowerCase());
  const payload = { placa, conductor_nombre: conductorNombre, conductor_cedula: conductorMatch?.cedula || null };

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
  publicExitoTitulo.textContent = alertas.length ? "Checklist guardado, con novedades" : "✅ Checklist guardado";
  publicExitoSub.textContent = `${preoperacional.placa} · ${preoperacional.conductor_nombre}`;

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
  pubConductor.value = "";
  pubFiltroVehiculo.value = "";
  pubObservaciones.value = "";
  renderVehiculoOptions();
  document.querySelectorAll('input[type="radio"]:checked').forEach((r) => { r.checked = false; });
  document.querySelectorAll(".preop-radio-option.checked").forEach((o) => o.classList.remove("checked"));
  document.querySelectorAll(".preop-item.has-error").forEach((el) => el.classList.remove("has-error"));
  pubFormMsg.textContent = "";
  window.scrollTo(0, 0);
});
