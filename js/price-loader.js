// Load the bundled spot prices JSON. Browser HTTP cache handles
// repeat-visit caching — no IndexedDB / localStorage needed.

export async function loadSpotPrices(url = "data/spot-prices.json") {
  const res = await fetch(url, { cache: "default" });
  if (!res.ok) {
    throw new Error(`Could not load ${url}: HTTP ${res.status}`);
  }
  const doc = await res.json();
  if (!Array.isArray(doc.prices)) {
    throw new Error("Invalid spot prices document.");
  }
  return doc;
}
