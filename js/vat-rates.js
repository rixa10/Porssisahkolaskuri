// Finnish electricity VAT rates by date.
//
// Each entry: { from: "YYYY-MM-DD", rate: 0.255 }
// Sorted ascending by `from`. Lookup uses the latest entry whose `from`
// is on or before the queried date.
//
// Source: Suomen Verohallinto. Update this list when rates change.
const VAT_RATES = [
  { from: "1900-01-01", rate: 0.24 },   // baseline (long-standing 24%)
  { from: "2022-12-01", rate: 0.10 },   // sähkön väliaikainen alennus
  { from: "2023-05-01", rate: 0.24 },   // takaisin 24%
  { from: "2024-09-01", rate: 0.255 },  // yleinen ALV nostettu 25,5%:iin
];

// Returns the VAT rate (decimal, e.g. 0.255 for 25.5%) for a given Date.
export function vatForDate(date) {
  const iso = date.toISOString().slice(0, 10);
  let rate = VAT_RATES[0].rate;
  for (const r of VAT_RATES) {
    if (iso >= r.from) rate = r.rate;
    else break;
  }
  return rate;
}

// Exposed for tests.
export const _VAT_RATES = VAT_RATES;
