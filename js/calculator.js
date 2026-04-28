// Pörssisähkölaskuri — core calculation.
//
// Inputs:
//   consumptionRows: [{ t: Date (UTC), kwh: number }]   // 15-min slots
//   spotPrices:      [{ t: "YYYY-MM-DDTHH:00:00Z", p: number }]
//                                                       // snt/kWh, ALV 0%
//   inputs: {
//     marginCentPerKwh:      number,  // verollisena
//     spotMonthlyFee:        number,  // €/kk, verollisena
//     fixedCentPerKwh:       number,  // verollisena
//     fixedMonthlyFee:       number,  // €/kk, verollisena
//     start: Date | null,             // optional UTC range bounds
//     end:   Date | null,
//   }
//
// Output: see `summarize()`.
//
// All calculation is done in UTC. Calendar-month grouping is done in
// Europe/Helsinki time so the user-facing buckets match their lived
// experience.

import { vatForDate } from "./vat-rates.js";

// Build a Map keyed by hourly UTC ISO string (YYYY-MM-DDTHH:00:00Z).
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

// Helsinki-local YYYY-MM and YYYY-MM-DD for a UTC Date.
// We use Intl.DateTimeFormat to get correct DST-aware values.
const HELSINKI = "Europe/Helsinki";
const monthFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: HELSINKI, year: "numeric", month: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: HELSINKI, year: "numeric", month: "2-digit", day: "2-digit",
});

function helsinkiMonthKey(d) {
  // en-CA gives "YYYY-MM"
  return monthFmt.format(d);
}
function helsinkiDayKey(d) {
  // en-CA gives "YYYY-MM-DD"
  return dayFmt.format(d);
}

export function calculate(consumptionRows, spotPrices, inputs) {
  const priceByHour = indexPrices(spotPrices);

  const start = inputs.start ? +inputs.start : null;
  const end   = inputs.end   ? +inputs.end   : null;

  // Per-month and per-day aggregates
  const monthly = new Map();   // key -> { kwh, spotCost, fixedCost, label }
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

    const key = hourKey(t);
    const spotExcl = priceByHour.get(key);
    if (spotExcl === undefined) {
      skippedNoPrice++;
      continue;
    }

    const vat = vatForDate(t);
    const spotIncl = spotExcl * (1 + vat);
    const spotTotal = spotIncl + margin; // snt/kWh

    const spotCost  = (row.kwh * spotTotal) / 100;     // €
    const fixedCost = (row.kwh * fixedC)    / 100;     // €

    totalKwh        += row.kwh;
    totalSpotCost   += spotCost;
    totalFixedCost  += fixedCost;
    included++;

    if (firstUsed === null || tms < +firstUsed) firstUsed = t;
    if (lastUsed  === null || tms > +lastUsed)  lastUsed  = t;

    const mKey = helsinkiMonthKey(t);
    const dKey = helsinkiDayKey(t);

    if (!monthly.has(mKey)) {
      monthly.set(mKey, { key: mKey, kwh: 0, spotCost: 0, fixedCost: 0 });
    }
    const m = monthly.get(mKey);
    m.kwh += row.kwh; m.spotCost += spotCost; m.fixedCost += fixedCost;

    if (!daily.has(dKey)) {
      daily.set(dKey, { key: dKey, kwh: 0, spotCost: 0, fixedCost: 0 });
    }
    const d = daily.get(dKey);
    d.kwh += row.kwh; d.spotCost += spotCost; d.fixedCost += fixedCost;
  }

  // Calendar-month billing: every unique calendar month that has data
  // gets a full monthly fee, even if partial.
  const monthFee  = inputs.spotMonthlyFee  ?? 0;
  const fixedFee  = inputs.fixedMonthlyFee ?? 0;
  const monthsCount = monthly.size;

  // Add per-month fee to the monthly chart entries (energy + fee).
  for (const m of monthly.values()) {
    m.spotCost  += monthFee;
    m.fixedCost += fixedFee;
  }

  totalSpotCost  += monthsCount * monthFee;
  totalFixedCost += monthsCount * fixedFee;

  const weightedAvgSpot = totalKwh > 0 ? (totalSpotCost / totalKwh) * 100 : 0;
  const difference = totalFixedCost - totalSpotCost; // > 0 = saved with spot

  return {
    summary: {
      totalKwh,
      totalSpotCost,
      totalFixedCost,
      weightedAvgSpot,
      difference,
      months: monthsCount,
      includedRows: included,
      skippedNoPriceRows: skippedNoPrice,
      firstUsed,
      lastUsed,
    },
    monthly: [...monthly.values()].sort((a, b) => a.key.localeCompare(b.key)),
    daily:   [...daily.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}
