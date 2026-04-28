// Parse a Fingrid Datahub kulutus CSV.
//
// Datahub format (as of 2025):
//   - delimiter: ;
//   - decimal separator: , (comma)
//   - encoding: UTF-8 with BOM
//   - timestamps: ISO 8601 UTC (e.g. 2024-05-31T21:00:00Z)
//   - resolution: PT15M (15-minute intervals)
//   - columns of interest: "Alkuaika", "Määrä", and (informational) "Laatu"
//
// We identify columns by header name, not position, so the parser is
// resilient to column reordering or future column additions.

export class DatahubParseError extends Error {}

export function parseDatahubCsv(text) {
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) {
    throw new DatahubParseError("CSV is empty or has no data rows.");
  }

  const headers = lines[0].split(";").map((h) => h.trim());
  const idxAlkuaika = headers.indexOf("Alkuaika");
  const idxMaara = headers.indexOf("Määrä");
  const idxLaatu = headers.indexOf("Laatu"); // optional

  if (idxAlkuaika < 0 || idxMaara < 0) {
    throw new DatahubParseError(
      `Required columns not found. Got headers: ${headers.join(", ")}`
    );
  }

  const rows = [];
  let qualityWarnings = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(";");
    if (cells.length < headers.length) continue;

    const tStr = cells[idxAlkuaika].trim();
    const amountStr = cells[idxMaara].trim().replace(",", ".");
    const t = new Date(tStr);
    const kwh = parseFloat(amountStr);
    if (isNaN(t.getTime()) || isNaN(kwh)) continue;

    if (idxLaatu >= 0 && cells[idxLaatu].trim() !== "OK") {
      qualityWarnings++;
    }

    rows.push({ t, kwh });
  }

  if (rows.length === 0) {
    throw new DatahubParseError("No valid consumption rows parsed.");
  }

  rows.sort((a, b) => a.t - b.t);
  return { rows, qualityWarnings };
}
