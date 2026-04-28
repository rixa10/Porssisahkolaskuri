// Chart.js wrappers for monthly and daily comparison charts.
// Chart.js itself is loaded via CDN <script> tag in index.html.

let monthlyChart = null;
let dailyChart   = null;

function destroy(c) { try { c?.destroy(); } catch {} }

function makeBarConfig(labels, spotData, fixedData, titleLabel) {
  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Pörssisähkö (€)",
          data: spotData,
          backgroundColor: "rgba(50, 130, 210, 0.75)",
        },
        {
          label: "Kiinteä hinta (€)",
          data: fixedData,
          backgroundColor: "rgba(220, 100, 80, 0.75)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
        title:  { display: !!titleLabel, text: titleLabel },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} €`,
          },
        },
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "€" } },
      },
    },
  };
}

export function renderMonthly(canvasId, monthly) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  destroy(monthlyChart);
  const labels = monthly.map((m) => m.key);
  const spot   = monthly.map((m) => m.spotCost);
  const fixed  = monthly.map((m) => m.fixedCost);
  monthlyChart = new Chart(ctx, makeBarConfig(labels, spot, fixed));
}

export function renderDaily(canvasId, daily) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  destroy(dailyChart);
  const labels = daily.map((d) => d.key);
  const spot   = daily.map((d) => d.spotCost);
  const fixed  = daily.map((d) => d.fixedCost);
  dailyChart = new Chart(ctx, makeBarConfig(labels, spot, fixed));
}
