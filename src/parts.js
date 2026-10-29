// What to buy, with example shop searches. Searches, not product links: listings come and go,
// and anyone can check the size on the page. Lazada (Thailand) + AliExpress (anywhere).
const lazada = (q) => `https://www.lazada.co.th/catalog/?q=${encodeURIComponent(q)}`;
const ali = (q) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`;

/** One line to buy. th / en = search words for Lazada TH / AliExpress. */
const item = (what, qty, note, th, en) => ({ what, qty, note, links: [{ shop: "Lazada TH", url: lazada(th), q: th }, { shop: "AliExpress", url: ali(en), q: en }] });

/** Parts for the gripper + chosen add-on. `info` is the worker's summary. */
export function partsFor(info) {
  const h = info.hardware;
  const pins = h.pins.map((p) => `${p.name} ${p.length}`).join(", ");
  const rodTotal = h.rods * h.rodLength;
  const out = [
    item("3 mm steel rod (roller pins)", `4 pins: ${pins} mm`, "Stainless round bar, cut with a hacksaw or rotary tool and file the ends. Nails with the head cut off also work.", "เพลาสแตนเลส 3 มม", "3mm stainless steel rod"),
    item("M4 threaded rod", `${h.rods} × ${h.rodLength} mm`, "Buy 1 m and cut it; one rod does the gripper and an add-on.", "สตัด เกลียวตลอด M4", "M4 threaded rod 1m"),
    item("M4 nuts + washers", "", "", "น็อตตัวเมีย M4 สแตนเลส", "M4 hex nut washer set"),
    item("Cord, 5–6 mm", "about 1 m per gripper", "Climbing accessory cord (6 mm prusik cord, rated in kN) from a climbing shop is best. Plain braided rope holds a light load but stretches.", "เชือก prusik 6 มม", "6mm prusik accessory cord"),
  ];
  const a = info.addon;
  if (a?.kind === "platform") {
    const s = a.spring;
    out[1].qty = `${h.rods} × ${h.rodLength} mm (gripper) + 2 × ${a.rodLength} mm (platform)` + (a.load !== "tindeq" ? ` + 1 per spring × ${s.guideLength} mm (guides)` : "");
    out[1].note = `About ${Math.ceil((rodTotal + 2 * a.rodLength + (a.load !== "tindeq" ? 4 * s.guideLength : 0)) / 1000)} m in total.`;
    if (a.load !== "tindeq")
      out.push(item("Compression springs", `2 or 4 × wire ${s.wire} mm, outer Ø ${s.od} mm, ${s.length} mm long`, "Pick a listing that gives wire, outer Ø and length, then type its numbers into the app. Long springs (e.g. 300 mm) can be cut to length: count the coils after. Small mixed boxes are usually too weak.", `สปริงกด ลวด ${s.wire} มิล วงนอก ${s.od}`, `compression spring ${s.wire}mm wire ${s.od}mm OD`));
    if (a.load !== "springs") out.push(item("Carabiner, climbing-rated", "1", "Look for a kN number on the spine. Keyring clips are not rated.", "คาราบิเนอร์ ปีนเขา kN", "climbing carabiner kN"));
  }
  if (a?.kind === "foot") {
    out[3].qty = "about 1 m per gripper + 2 × 40 cm for the plate";
    out.push(item("Carabiner, climbing-rated", "1", "Look for a kN number on the spine. Keyring clips are not rated.", "คาราบิเนอร์ ปีนเขา kN", "climbing carabiner kN"));
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function partsHtml(list) {
  return `<details class="parts" open><summary><strong>Parts to buy</strong></summary><ul>` +
    list.map((p) => `<li><b>${esc(p.what)}</b>${p.qty ? `: ${esc(p.qty)}` : ""}${p.note ? `<br><span class="parts-note">${esc(p.note)}</span>` : ""}<br>` +
      p.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.shop)}: “${esc(l.q)}”</a>`).join(" · ") + `</li>`).join("") +
    `</ul><p class="parts-note">Example searches, not endorsements. Check the size on the listing. Any hardware or climbing shop works too.</p></details>`;
}

export function partsText(list) {
  return `
==============================================================================
PARTS TO BUY (example searches; check the size on the listing; any hardware shop works too)
` + list.map((p) => `
- ${p.what}${p.qty ? `: ${p.qty}` : ""}${p.note ? `\n  ${p.note}` : ""}
${p.links.map((l) => `  ${l.shop} "${l.q}": ${l.url}`).join("\n")}`).join("\n") + "\n";
}
