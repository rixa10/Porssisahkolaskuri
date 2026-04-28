// ?debug=1 — render a per-row breakdown of the calculation.
// Only loaded and called when the URL flag is set.

import { vatForDate } from "./vat-rates.js";

export function renderDebug(rootEl, consumptionRows, spotPrices, inputs) {
  const idx = new Map();
  for (const r of spotPrices) idx.set(r.t, r.p);

  const margin = inputs.marginCentPerKwh ?? 0;
  const fixedC = inputs.fixedCentPerKwh ?? 0;

  const lines = [
    "<h2>Debug-näkymä (?debug=1)</h2>",
    "<p>Per 15-min mittausrivi: spot, ALV, lopullinen hinta, kustannus.</p>",
    "<table><thead><tr>",
    "<th>Aika (UTC)</th><th>kWh</th><th>Spot (snt/kWh, ALV 0%)</th>",
    "<th>ALV %</th><th>Spot+ALV+marg.</th><th>Kust. (€)</th>",
    "<th>Kiinteä (€)</th></tr></thead><tbody>",
  ];

  let shown = 0;
  for (const row of consumptionRows) {
    if (shown >= 200) break;
    const z = new Date(row.t); z.setUTCMinutes(0, 0, 0);
    const key = z.toISOString().replace(".000Z", "Z");
    const spotExcl = idx.get(key);
    if (spotExcl === undefined) continue;
    const vat = vatForDate(row.t);
    const spotIncl = spotExcl * (1 + vat);
    const total = spotIncl + margin;
    const cost  = (row.kwh * total) / 100;
    const fxCost = (row.kwh * fixedC) / 100;
    lines.push(
      `<tr><td>${row.t.toISOString()}</td>` +
      `<td>${row.kwh.toFixed(3)}</td>` +
      `<td>${spotExcl.toFixed(3)}</td>` +
      `<td>${(vat*100).toFixed(1)}</td>` +
      `<td>${total.toFixed(3)}</td>` +
      `<td>${cost.toFixed(5)}</td>` +
      `<td>${fxCost.toFixed(5)}</td></tr>`
    );
    shown++;
  }
  lines.push("</tbody></table>");
  lines.push(`<p>Näytetään ensimmäiset ${shown} riviä.</p>`);
  rootEl.innerHTML = lines.join("");
}
