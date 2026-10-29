// What to buy, with an example web search for each. Search words, not product links: listings
// come and go, and any shop that shows the size works.
const search = (q) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`;

/** One line to buy. q = example search words. */
const item = (what, qty, note, q) => ({ what, qty, note, q, url: search(q) });

/** Parts for the gripper + chosen add-on. `info` is the worker's summary. Stock sizes only. */
export function partsFor(info) {
  const h = info.hardware;
  const pins = h.pins.map((p) => `${p.name} ${p.length}`).join(", ");
  const out = [
    h.axle === "bolt"
      ? item("M3 countersunk bolts (roller axles)", `4: ${pins} mm`, "Flat (countersunk) head, hex socket, stainless. Often sold in mixed M3 boxes.", "M3 countersunk bolt assortment")
      : item("3 mm steel dowel pins (roller axles)", `4: ${pins} mm`, "Stainless or hardened, 3 mm diameter. Often sold as packs of one length; some listings say “M3” for the diameter.", "3mm dowel pin stainless"),
    item(`M5 × ${h.boltLength} mm bolts`, `${h.rods}, with a nut + 2 washers each`, "Socket head (Allen key), stainless or grade 8.8.", `M5 x ${h.boltLength} socket head bolt`),
    item("Cord, 5–6 mm", "about 1 m per gripper", "Climbing accessory cord (6 mm prusik cord, rated in kN) from a climbing shop is best. Plain braided rope holds a light load but stretches.", "6mm accessory cord climbing"),
  ];
  const a = info.addon;
  if (a?.kind === "platform") {
    out.push(item("M5 × 30 mm bolts", `${2 * a.joints}, with a nut + washer each (join the platform parts)`, "", "M5 x 30 socket head bolt"));
    if (a.load !== "tindeq") {
      const s = a.spring;
      out.push(item(`M5 × ${a.guideBolt} mm bolts`, "2 or 4 (one per spring), 2 nuts + 2 washers each (spring guides)", "", `M5 x ${a.guideBolt} socket head bolt`));
      out.push(item("Compression springs", `2 or 4 × wire ${s.wire} mm, outer Ø ${s.od} mm, ${s.length} mm long`, "Pick a listing that gives wire, outer Ø and length, then type its numbers into the app. Inner Ø must be over 6 mm (the M5 guide bolt). Small mixed boxes are usually too weak.", `compression spring ${s.wire}mm wire ${s.od}mm OD ${s.length}mm`));
    }
    if (a.load !== "springs") out.push(item("Carabiner, climbing-rated", "1", "Look for a kN number on the spine. Keyring clips are not rated.", "climbing carabiner kN rated"));
  }
  if (a?.kind === "foot") {
    out[2].qty = "about 1 m per gripper + 2 × 40 cm for the plate";
    out.push(item("Carabiner, climbing-rated", "1", "Look for a kN number on the spine. Keyring clips are not rated.", "climbing carabiner kN rated"));
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function partsHtml(list) {
  return `<details class="parts" open><summary><strong>Parts to buy</strong> (stock sizes, nothing to cut)</summary><ul>` +
    list.map((p) => `<li><b>${esc(p.what)}</b>${p.qty ? `: ${esc(p.qty)}` : ""}${p.note ? `<br><span class="parts-note">${esc(p.note)}</span>` : ""}<br>` +
      `<a href="${esc(p.url)}" target="_blank" rel="noopener">Search: “${esc(p.q)}”</a></li>`).join("") +
    `</ul><p class="parts-note">Example searches, not endorsements. Check the size on the listing. Any hardware or climbing shop works too.</p></details>`;
}

export function partsText(list) {
  return `
==============================================================================
PARTS TO BUY (stock sizes, nothing to cut; example searches, check the size on the listing)
` + list.map((p) => `
- ${p.what}${p.qty ? `: ${p.qty}` : ""}${p.note ? `\n  ${p.note}` : ""}
  Search: "${p.q}"`).join("\n") + "\n";
}
