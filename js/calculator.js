// Pörssisähkölaskuri — core calculation.
//
// All calculation is done in UTC. Calendar-month grouping is done in
// Europe/Helsinki time so the user-facing buckets match their lived
// experience.

import { vatForDate } from "./vat-rates.js";

const HELSINKI = "Europe/Helsinki";

function indexPrices(spotPrices) {
  const m = new Map();
  for (const r of spotPrices) m.set(r.t, r.p);
  return m;
}

// Floor a Date to the start of its UTC hour and return the ISO key.
function hourKey(d) {
  const z = new Date(d);
  z.setUTCMinutes(0, 0, 0);
  return z.toISOString().replace(".000Z", "Z");
}

const monthFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: HELSINKI, year: "numeric", month: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: HELSINKI, year: "numeric", month: "2-digit", day: "2-digit",
});
const hourFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: HELSINKI, hour: "2-digit", hourCycle: "h23",
});

function helsinkiMonthKey(d) { return monthFmt.format(d); }
function helsinkiDayKey(d)   { return dayFmt.format(d); }
function helsinkiHourKey(d)  { return hourFmt.format(d); }  // "00".."23"

// Apply VAT + margin to a raw spot price (snt/kWh, ALV 0%).
function priceFor(spotExcl, t, marginIncl) {
  const vat = vatForDate(t);
  return spotExcl * (1 + vat) + marginIncl; // snt/kWh, with VAT and margin
}

export function calculate(consumptionRows, spotPrices, inputs) {
  const priceByHour = indexPrices(spotPrices);
  const start = inputs.start ? +inputs.start : null;
  const end   = inputs.end   ? +inputs.end   : null;

  const monthly = new Map();
  const daily   = new Map();

  let totalKwh = 0;
  let totalSpotCost = 0;
  let totalFixedCost = 0;
  let included = 0;
  let skippedNoPrice = 0;
  let firstUsed = null;
  let lastUsed = null;

  const margin = inputs.marginCentPerKwh ?? 0;
  const fixedC = inputs.fixedCentPerKwh ?? 0;

  for (const row of consumptionRows) {
    const t = row.t;
    const tms = +t;
    if (start !== null && tms < start) continue;
    if (end   !== null && tms > end)   continue;

    const spotExcl = priceByHour.get(hourKey(t));
    if (spotExcl === undefined) {
      skippedNoPrice++;
      continue;
    }

    const spotTotal = priceFor(spotExcl, t, margin);
    const spotCost  = (row.kwh * spotTotal) / 100;
    const fixedCost = (row.kwh * fixedC)    / 100;

    totalKwh        += row.kwh;
    totalSpotCost   += spotCost;
    totalFixedCost  += fixedCost;
    included++;
    if (firstUsed === null || tms < +firstUsed) firstUsed = t;
    if (lastUsed  === null || tms > +lastUsed)  lastUsed  = t;

    const mKey = helsinkiMonthKey(t);
    const dKey = helsinkiDayKey(t);

    if (!monthly.has(mKey)) monthly.set(mKey, { key: mKey, kwh: 0, spotCost: 0, fixedCost: 0 });
    const m = monthly.get(mKey);
    m.kwh += row.kwh; m.spotCost += spotCost; m.fixedCost += fixedCost;

    if (!daily.has(dKey)) daily.set(dKey, { key: dKey, kwh: 0, spotCost: 0, fixedCost: 0 });
    const d = daily.get(dKey);
    d.kwh += row.kwh; d.spotCost += spotCost; d.fixedCost += fixedCost;
  }

  // Calendar-month billing: full monthly fee per unique calendar month.
  const monthFee  = inputs.spotMonthlyFee  ?? 0;
  const fixedFee  = inputs.fixedMonthlyFee ?? 0;
  const monthsCount = monthly.size;

  for (const m of monthly.values()) {
    m.spotCost  += monthFee;
    m.fixedCost += fixedFee;
  }
  totalSpotCost  += monthsCount * monthFee;
  totalFixedCost += monthsCount * fixedFee;

  const weightedAvgSpot = totalKwh > 0 ? (totalSpotCost / totalKwh) * 100 : 0;
  const difference = totalFixedCost - totalSpotCost;

  return {
    summary: {
      totalKwh, totalSpotCost, totalFixedCost,
      weightedAvgSpot, difference,
      months: monthsCount, includedRows: included, skippedNoPriceRows: skippedNoPrice,
      firstUsed, lastUsed,
    },
    monthly: [...monthly.values()].sort((a, b) => a.key.localeCompare(b.key)),
    daily:   [...daily.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

// On-demand: hourly aggregates for a given Helsinki-local day "YYYY-MM-DD".
// Returns 24 entries (or fewer at DST transitions) sorted by hour.
// Note: monthly fees are NOT included here — drill-down shows only energy cost.
export function computeHourlyForDay(consumptionRows, spotPrices, inputs, dayKey) {
  const priceByHour = indexPrices(spotPrices);
  const margin = inputs.marginCentPerKwh ?? 0;
  const fixedC = inputs.fixedCentPerKwh ?? 0;

  const hours = new Map();
  for (const row of consumptionRows) {
    if (helsinkiDayKey(row.t) !== dayKey) continue;
    const spotExcl = priceByHour.get(hourKey(row.t));
    if (spotExcl === undefined) continue;

    const spotTotal = priceFor(spotExcl, row.t, margin);
    const spotCost  = (row.kwh * spotTotal) / 100;
    const fixedCost = (row.kwh * fixedC)    / 100;
    const hKey = helsinkiHourKey(row.t);

    if (!hours.has(hKey)) hours.set(hKey, { key: hKey, kwh: 0, spotCost: 0, fixedCost: 0 });
    const h = hours.get(hKey);
    h.kwh += row.kwh; h.spotCost += spotCost; h.fixedCost += fixedCost;
  }
  return [...hours.values()].sort((a, b) => a.key.localeCompare(b.key));
}
