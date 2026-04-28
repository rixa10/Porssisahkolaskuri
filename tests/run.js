// Golden test runner for the calculator.
//
// Loads the same JS modules the browser uses, feeds them a known
// consumption CSV + spot-prices snapshot, and verifies the results
// against tests/golden/expected.json (computed by hand in Python).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseDatahubCsv } from "../js/csv-parser.js";
import { calculate } from "../js/calculator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(__dirname, "golden");

function approxEq(a, b, eps = 1e-4) {
  return Math.abs(a - b) <= eps;
}

let failures = 0;
function expect(label, actual, expected, eps) {
  const ok = eps !== undefined ? approxEq(actual, expected, eps) : actual === expected;
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}: got ${actual}, expected ${expected}`);
  } else {
    console.log(`  PASS  ${label}: ${actual}`);
  }
}

const csv = readFileSync(join(GOLDEN, "consumption.csv"), "utf-8");
const spot = JSON.parse(readFileSync(join(GOLDEN, "spot-prices.json"), "utf-8"));
const expected = JSON.parse(readFileSync(join(GOLDEN, "expected.json"), "utf-8"));

const { rows } = parseDatahubCsv(csv);
console.log(`Parsed ${rows.length} consumption rows.`);

const result = calculate(rows, spot.prices, {
  marginCentPerKwh: 0.5,
  spotMonthlyFee: 5.0,
  fixedCentPerKwh: 8.5,
  fixedMonthlyFee: 4.0,
});
const s = result.summary;

console.log("\nGolden test results:");
expect("totalKwh",            s.totalKwh,          expected.totalKwh,          1e-6);
expect("totalSpotCost",       s.totalSpotCost,     expected.totalSpotCost,     1e-4);
expect("totalFixedCost",      s.totalFixedCost,    expected.totalFixedCost,    1e-4);
expect("weightedAvgSpot",     s.weightedAvgSpot,   expected.weightedAvgSpot,   1e-3);
expect("difference",          s.difference,        expected.difference,        1e-4);
expect("months",              s.months,            expected.months);
expect("includedRows",        s.includedRows,      expected.includedRows);
expect("skippedNoPriceRows",  s.skippedNoPriceRows, expected.skippedNoPriceRows);

if (failures === 0) {
  console.log("\nALL GOLDEN TESTS PASS");
} else {
  console.log(`\n${failures} TEST(S) FAILED`);
  process.exit(1);
}
