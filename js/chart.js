// Chart.js wrapper. Single render function for all three drill-down
// levels (monthly / daily / hourly). Chart.js itself is loaded via CDN
// in index.html.

let chart = null;

export function destroyChart() {
  try { chart?.destroy(); } catch {}
  chart = null;
}

// Render comparison bars.
//
// items: array of { key, kwh, spotCost, fixedCost }
// opts:
//   labelFormatter:  (key) => string         display label per bar
//   yAxisLabel:      string                  e.g. "€"
//   onBarClick:      (item) => void | null   if set, bars become clickable
//
export function renderBars(canvasId, items, opts = {}) {
  const labelFmt = opts.labelFormatter ?? ((k) => k);
  const labels   = items.map((x) => labelFmt(x.key));
  const spot     = items.map((x) => x.spotCost);
  const fixed    = items.map((x) => x.fixedCost);

  destroyChart();
  const ctx = document.getElementById(canvasId).getContext("2d");

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Pörssisähkö (€)",
          data: spot,
          backgroundColor: "rgba(50, 130, 210, 0.75)",
          borderColor: "rgba(50, 130, 210, 1)",
        },
        {
          label: "Kiinteä hinta (€)",
          data: fixed,
          backgroundColor: "rgba(220, 100, 80, 0.75)",
          borderColor: "rgba(220, 100, 80, 1)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_e, elements) => {
        if (!opts.onBarClick || !elements.length) return;
        const idx = elements[0].index;
        opts.onBarClick(items[idx]);
      },
      onHover: (e, elements) => {
        if (!opts.onBarClick) return;
        e.native.target.style.cursor = elements.length ? "pointer" : "default";
      },
      plugins: {
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} €`,
          },
        },
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: opts.yAxisLabel ?? "€" } },
      },
    },
  });
}
