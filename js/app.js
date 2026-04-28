// Bootstrap: wire the form to parser + calculator + charts.

import { parseDatahubCsv, DatahubParseError } from "./csv-parser.js";
import { loadSpotPrices } from "./price-loader.js";
import { calculate } from "./calculator.js";
import { renderMonthly, renderDaily } from "./chart.js";

const $ = (id) => document.getElementById(id);

const state = {
  consumption: null,           // { rows, qualityWarnings }
  spotDoc: null,               // loaded spot prices document
  fileName: null,
};

async function bootstrap() {
  const status = $("status");
  try {
    status.textContent = "Ladataan pörssihintoja...";
    state.spotDoc = await loadSpotPrices();
    const n = state.spotDoc.prices.length;
    const first = state.spotDoc.prices[0]?.t ?? "?";
    const last  = state.spotDoc.prices[n-1]?.t ?? "?";
    const synthNote = state.spotDoc.synthetic ? " (HUOM: synteettistä testidataa, ei oikea hinta!)" : "";
    status.textContent =
      `Hintadata ladattu: ${n} tuntia, ${first.slice(0,10)} – ${last.slice(0,10)}.` +
      `${synthNote} Päivitetty ${state.spotDoc.updated ?? "?"}.`;
  } catch (e) {
    status.textContent = `Virhe ladattaessa pörssihintoja: ${e.message}`;
    status.classList.add("error");
  }

  $("file").addEventListener("change", onFileSelected);
  $("form").addEventListener("submit", onCalculate);
  setupDragDrop();
}

function setupDragDrop() {
  const dz = $("dropzone");
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("hover"); }));
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("hover"); }));
  dz.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });
  dz.addEventListener("click", () => $("file").click());
}

async function onFileSelected(e) {
  const f = e.target.files?.[0];
  if (f) await loadFile(f);
}

async function loadFile(file) {
  state.fileName = file.name;
  const text = await file.text();
  try {
    state.consumption = parseDatahubCsv(text);
    const r = state.consumption.rows;
    const first = r[0].t;
    const last  = r[r.length-1].t;
    $("file-info").textContent =
      `${file.name}: ${r.length} kpl 15-min mittausta, ` +
      `${first.toISOString().slice(0,10)} – ${last.toISOString().slice(0,10)}` +
      (state.consumption.qualityWarnings
        ? `, ${state.consumption.qualityWarnings} laatuvaroitusta`
        : "");
    $("file-info").classList.remove("error");
    // Pre-fill date range to file's range.
    $("start-date").valueAsDate = first;
    $("end-date").valueAsDate   = last;
  } catch (e) {
    $("file-info").textContent = e instanceof DatahubParseError
      ? `CSV-virhe: ${e.message}`
      : `Virhe: ${e.message}`;
    $("file-info").classList.add("error");
    state.consumption = null;
  }
}

function num(id, fallback = 0) {
  const v = parseFloat(($(id).value || "").replace(",", "."));
  return Number.isFinite(v) ? v : fallback;
}

async function onCalculate(e) {
  e.preventDefault();
  if (!state.consumption) {
    alert("Lataa ensin Datahub-CSV.");
    return;
  }
  if (!state.spotDoc) {
    alert("Pörssihintoja ei ole ladattu.");
    return;
  }
  const startDate = $("start-date").valueAsDate;
  const endDate   = $("end-date").valueAsDate;
  // valueAsDate gives midnight UTC. Convert end to end-of-day:
  const end = endDate ? new Date(+endDate + 24*3600*1000 - 1) : null;

  const inputs = {
    marginCentPerKwh: num("margin"),
    spotMonthlyFee:   num("spot-fee"),
    fixedCentPerKwh:  num("fixed-price"),
    fixedMonthlyFee:  num("fixed-fee"),
    start: startDate,
    end:   end,
  };

  const result = calculate(state.consumption.rows, state.spotDoc.prices, inputs);
  renderResult(result);

  if (new URLSearchParams(location.search).has("debug")) {
    const debug = await import("./debug.js");
    debug.renderDebug($("debug"), state.consumption.rows, state.spotDoc.prices, inputs);
  }
}

function renderResult(result) {
  const s = result.summary;
  const out = $("results");
  out.classList.remove("hidden");

  const eurFmt = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" });
  const numFmt = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 2 });
  const sntFmt = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 2 });

  const diff = s.difference;
  const headlineEl = $("headline");
  if (Math.abs(diff) < 0.005) {
    headlineEl.textContent = "Kustannukset olisivat olleet käytännössä samat.";
    headlineEl.className = "headline neutral";
  } else if (diff > 0) {
    headlineEl.textContent = `Olisit säästänyt ${eurFmt.format(diff)} pörssisähköllä.`;
    headlineEl.className = "headline saved";
  } else {
    headlineEl.textContent = `Olisit maksanut ${eurFmt.format(-diff)} enemmän pörssisähköllä.`;
    headlineEl.className = "headline lost";
  }

  $("total-spot").textContent  = eurFmt.format(s.totalSpotCost);
  $("total-fixed").textContent = eurFmt.format(s.totalFixedCost);
  $("avg-spot").textContent    = `${sntFmt.format(s.weightedAvgSpot)} snt/kWh`;
  $("total-kwh").textContent   = `${numFmt.format(s.totalKwh)} kWh`;
  $("months-count").textContent = `${s.months} kk`;
  const pct = (s.totalFixedCost > 0)
    ? (diff / s.totalFixedCost) * 100
    : 0;
  $("diff-pct").textContent = (diff >= 0 ? "+" : "") + pct.toFixed(1) + " %";

  const rangeStart = s.firstUsed?.toISOString().slice(0,10) ?? "?";
  const rangeEnd   = s.lastUsed?.toISOString().slice(0,10)  ?? "?";
  let coverage = `Aikaväli ${rangeStart} – ${rangeEnd}, mukana ${s.includedRows} kpl 15-min mittausta`;
  if (s.skippedNoPriceRows > 0) {
    coverage += `, sivuutettiin ${s.skippedNoPriceRows} kpl puuttuvan spot-hinnan vuoksi`;
  }
  $("coverage").textContent = coverage;

  renderMonthly("monthly-chart", result.monthly);
  renderDaily("daily-chart",     result.daily);
}

// Tab toggle for monthly / daily chart.
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.target;
      document.querySelectorAll(".tab-pane").forEach((p) => {
        p.classList.toggle("hidden", p.id !== target);
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  bootstrap();
});
