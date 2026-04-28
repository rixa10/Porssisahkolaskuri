// Bootstrap: wire the form to parser + calculator + charts.

import { parseDatahubCsv, DatahubParseError } from "./csv-parser.js";
import { loadSpotPrices } from "./price-loader.js";
import { calculate, computeHourlyForDay } from "./calculator.js";
import { renderBars, destroyChart } from "./chart.js";

const $ = (id) => document.getElementById(id);

const state = {
  consumption: null,           // { rows, qualityWarnings }
  spotDoc: null,
  fileName: null,
  result: null,                // last calculate() output
  inputs: null,                // last form inputs (for hourly drill-down)
  nav: { level: "monthly", monthKey: null, dayKey: null },
};

const FI_MONTH_NAMES = [
  "tammikuu", "helmikuu", "maaliskuu", "huhtikuu",
  "toukokuu", "kesäkuu", "heinäkuu", "elokuu",
  "syyskuu", "lokakuu", "marraskuu", "joulukuu",
];

function fiMonth(monthKey) {
  // monthKey is "YYYY-MM"
  const [y, m] = monthKey.split("-");
  const name = FI_MONTH_NAMES[parseInt(m, 10) - 1] ?? m;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

function fiDay(dayKey) {
  // dayKey is "YYYY-MM-DD"
  const [, m, d] = dayKey.split("-");
  return `${parseInt(d, 10)}.${parseInt(m, 10)}.`;
}

function fiDayLong(dayKey) {
  const [y, m, d] = dayKey.split("-");
  return `${parseInt(d, 10)}.${parseInt(m, 10)}.${y}`;
}

async function bootstrap() {
  const status = $("status");
  try {
    status.textContent = "Ladataan pörssihintoja...";
    state.spotDoc = await loadSpotPrices();
    const n = state.spotDoc.prices.length;
    const first = state.spotDoc.prices[0]?.t ?? "?";
    const last  = state.spotDoc.prices[n - 1]?.t ?? "?";
    const synthNote = state.spotDoc.synthetic ? " (HUOM: synteettistä testidataa, ei oikea hinta!)" : "";
    status.textContent =
      `Hintadata ladattu: ${n} tuntia, ${first.slice(0, 10)} – ${last.slice(0, 10)}.` +
      `${synthNote} Päivitetty ${state.spotDoc.updated ?? "?"}.`;
  } catch (e) {
    status.textContent = `Virhe ladattaessa pörssihintoja: ${e.message}`;
    status.classList.add("error");
  }

  $("file").addEventListener("change", onFileSelected);
  $("form").addEventListener("submit", onCalculate);
  $("breadcrumb").addEventListener("click", onBreadcrumbClick);
  setupDragDrop();
}

function setupDragDrop() {
  const dz = $("dropzone");

  // Block the browser's default behaviour of navigating to a dropped
  // file anywhere on the page (not just the dropzone).
  ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
    document.addEventListener(ev, (e) => e.preventDefault());
  });

  // Visual feedback only on the dropzone itself.
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, () => dz.classList.add("hover")));
  dz.addEventListener("dragleave", () => dz.classList.remove("hover"));

  dz.addEventListener("drop", (e) => {
    dz.classList.remove("hover");
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
    const last  = r[r.length - 1].t;
    $("file-info").textContent =
      `${file.name}: ${r.length} kpl 15-min mittausta, ` +
      `${first.toISOString().slice(0, 10)} – ${last.toISOString().slice(0, 10)}` +
      (state.consumption.qualityWarnings
        ? `, ${state.consumption.qualityWarnings} laatuvaroitusta`
        : "");
    $("file-info").classList.remove("error");
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
  const end = endDate ? new Date(+endDate + 24 * 3600 * 1000 - 1) : null;

  const inputs = {
    marginCentPerKwh: num("margin"),
    spotMonthlyFee:   num("spot-fee"),
    fixedCentPerKwh:  num("fixed-price"),
    fixedMonthlyFee:  num("fixed-fee"),
    start: startDate,
    end:   end,
  };
  state.inputs = inputs;
  state.result = calculate(state.consumption.rows, state.spotDoc.prices, inputs);
  state.nav = { level: "monthly", monthKey: null, dayKey: null };

  renderResult();

  if (new URLSearchParams(location.search).has("debug")) {
    const debug = await import("./debug.js");
    debug.renderDebug($("debug"), state.consumption.rows, state.spotDoc.prices, inputs);
  }
}

function renderResult() {
  const s = state.result.summary;
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
  const pct = s.totalFixedCost > 0 ? (diff / s.totalFixedCost) * 100 : 0;
  $("diff-pct").textContent = (diff >= 0 ? "+" : "") + pct.toFixed(1) + " %";

  const rangeStart = s.firstUsed?.toISOString().slice(0, 10) ?? "?";
  const rangeEnd   = s.lastUsed?.toISOString().slice(0, 10)  ?? "?";
  let coverage = `Aikaväli ${rangeStart} – ${rangeEnd}, mukana ${s.includedRows} kpl 15-min mittausta`;
  if (s.skippedNoPriceRows > 0) {
    coverage += `, sivuutettiin ${s.skippedNoPriceRows} kpl puuttuvan spot-hinnan vuoksi`;
  }
  $("coverage").textContent = coverage;

  renderChart();
}

function renderChart() {
  const r = state.result;
  const nav = state.nav;
  const bc  = $("breadcrumb");
  const hint = $("chart-hint");

  if (nav.level === "monthly") {
    bc.innerHTML = `<span class="bc-current">Kaikki kuukaudet</span>`;
    hint.textContent = "Klikkaa palkkia nähdäksesi kuukauden päiväkohtainen erittely.";
    renderBars("main-chart", r.monthly, {
      labelFormatter: (k) => fiMonth(k),
      onBarClick: (item) => {
        state.nav = { level: "daily", monthKey: item.key, dayKey: null };
        renderChart();
      },
    });
  } else if (nav.level === "daily") {
    const days = r.daily.filter((d) => d.key.startsWith(nav.monthKey));
    bc.innerHTML =
      `<a href="#" data-nav="monthly">Kaikki kuukaudet</a>` +
      ` <span class="bc-sep">›</span> ` +
      `<span class="bc-current">${fiMonth(nav.monthKey)}</span>`;
    hint.textContent = "Klikkaa palkkia nähdäksesi päivän tuntikohtainen erittely.";
    renderBars("main-chart", days, {
      labelFormatter: (k) => fiDay(k),
      onBarClick: (item) => {
        state.nav = { ...state.nav, level: "hourly", dayKey: item.key };
        renderChart();
      },
    });
  } else if (nav.level === "hourly") {
    const hours = computeHourlyForDay(
      state.consumption.rows, state.spotDoc.prices, state.inputs, nav.dayKey
    );
    bc.innerHTML =
      `<a href="#" data-nav="monthly">Kaikki kuukaudet</a>` +
      ` <span class="bc-sep">›</span> ` +
      `<a href="#" data-nav="daily">${fiMonth(nav.monthKey)}</a>` +
      ` <span class="bc-sep">›</span> ` +
      `<span class="bc-current">${fiDayLong(nav.dayKey)}</span>`;
    hint.textContent = "Tuntitasoinen erittely. Perusmaksu ei sisälly tuntiarvoihin.";
    renderBars("main-chart", hours, {
      labelFormatter: (k) => k, // "00".."23"
    });
  }
}

function onBreadcrumbClick(e) {
  const a = e.target.closest("a[data-nav]");
  if (!a) return;
  e.preventDefault();
  const target = a.dataset.nav;
  if (target === "monthly") {
    state.nav = { level: "monthly", monthKey: null, dayKey: null };
  } else if (target === "daily") {
    state.nav = { ...state.nav, level: "daily", dayKey: null };
  }
  renderChart();
}

document.addEventListener("DOMContentLoaded", bootstrap);
