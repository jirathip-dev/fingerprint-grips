import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { zipSync, strToU8 } from "fflate";
import { FINGERS, DEFAULT_HAND, MEASURES, DEVICES } from "./model.js";
import { SPRING_FIELDS, SPRING_DEFAULT, springMath, validateSpring, TINDEQ } from "./accessories.js";

// ---------- form ----------
const form = document.querySelector("#hand-form");
const gridEl = document.querySelector("#finger-grid");
const statusEl = document.querySelector("#status");
const problemsEl = document.querySelector("#problems");
const summaryEl = document.querySelector("#summary");
const downloadBtn = document.querySelector("#download");
const blurbEl = document.querySelector("#device-blurb");
const ackEl = document.querySelector("#ack");
let hasProblems = false;
const syncDownload = () => (downloadBtn.disabled = hasProblems || !ackEl.checked);
ackEl.addEventListener("change", syncDownload);

const ORDER = ["index", "middle", "ring", "pinky"]; // how a climber reads their hand
const KEYS = Object.keys(MEASURES);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

gridEl.insertAdjacentHTML(
  "beforeend",
  `<span></span>${KEYS.map((k) => `<span class="colhead" title="${MEASURES[k].help}">${MEASURES[k].short}</span>`).join("")}`,
);
for (const name of ORDER) {
  gridEl.insertAdjacentHTML(
    "beforeend",
    `<span class="finger">${cap(name)}</span>` +
      KEYS.map((k) => {
        const m = MEASURES[k];
        return `<label><span class="sr">${name} ${m.label}</span><input type="number" name="${name}.${k}" value="${DEFAULT_HAND[name][k]}" min="${m.min}" max="${m.max}" step="0.5" inputmode="decimal" title="${m.help}"></label>`;
      }).join(""),
  );
}

// spring inputs
const springGrid = document.querySelector("#spring-grid");
for (const [k, f] of Object.entries(SPRING_FIELDS))
  springGrid.insertAdjacentHTML("beforeend", `<label title="${f.help}">${f.label}${k === "coils" ? "" : " (mm)"}<input type="number" name="spring.${k}" value="${SPRING_DEFAULT[k]}" min="${f.min}" max="${f.max}" step="${f.step}" inputmode="decimal"></label>`);

const ADDONS = {
  none: "",
  table:
    "A table rig like the Crimpdeq platform. The gripper lies on its back; your palm presses on the rest, your fingers pull, and the Tindeq sits in line between the cord and the anchor wall. No foot strap. Sits flat on a table.",
  spring:
    "A portable trainer in the style of Crimpy: steel compression springs push back instead of a Tindeq. Swap or add springs to change the load; the marks on the rails show roughly how many kg you're pulling.",
  foot: "A plate to stand on. Clip the Tindeq's lower eye to the fin with a carabiner, hang the gripper from the top eye and pull up.",
};

function readForm() {
  const hand = {};
  for (const name of FINGERS) hand[name] = Object.fromEntries(KEYS.map((k) => [k, Number(form.elements[`${name}.${k}`].value)]));
  const spring = Object.fromEntries(Object.keys(SPRING_FIELDS).map((k) => [k, Number(form.elements[`spring.${k}`].value)]));
  spring.count = Number(form.elements.springCount.value);
  return { hand, side: form.elements.side.value, device: form.elements.device.value, addon: form.elements.addon.value, spring };
}
const kg = (v) => (v >= 10 ? Math.round(v) : v.toFixed(1));
function showBlurb() {
  blurbEl.textContent = DEVICES[form.elements.device.value].blurb;
  const addon = form.elements.addon.value;
  document.querySelector("#addon-blurb").textContent = ADDONS[addon];
  document.querySelector("#spring-box").hidden = addon !== "spring";
  if (addon === "spring") {
    const sp = readForm().spring;
    const out = document.querySelector("#spring-out");
    const bad = validateSpring(sp);
    if (bad.length) {
      out.innerHTML = `<span class="screen-bad">${bad[0]}</span>`;
      return;
    }
    const m = springMath(sp);
    out.innerHTML = `Full squeeze: <b>about ${kg(m.totalKg)} kg</b> over ${m.travel.toFixed(0)} mm (${m.kgPerMm.toFixed(1)} kg per mm). ` +
      (m.limitedBy === "wire" ? "Stops are set so the wire doesn't get overloaded. " : "Stops are set just before the coils touch. ") +
      `Estimate for steel springs: cheap springs vary ±20%, so check against a scale once.`;
  }
}
showBlurb();

// ---------- viewer ----------
const viewport = document.querySelector("#viewport");
const xray = document.querySelector("#xray");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
viewport.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171c);
const camera = new THREE.PerspectiveCamera(32, 1, 1, 5000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x30343c, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(-150, -250, 300);
scene.add(sun);

const ROLLER = { pinky: 0xf28c38, ring: 0x4cbf72, middle: 0x5b8def, index: 0xe5566e };
const KIND_MAT = {
  addon: () => new THREE.MeshStandardMaterial({ color: 0x5d6675, roughness: 0.7 }),
  ghost: () => new THREE.MeshStandardMaterial({ color: 0xf5c400, roughness: 0.5, transparent: true, opacity: 0.75 }),
  spring: () => new THREE.MeshStandardMaterial({ color: 0xe3e7ee, roughness: 0.35, metalness: 0.35 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0x8b9099, roughness: 0.4, metalness: 0.7 }),
};
const frameMat = new THREE.MeshStandardMaterial({ color: 0xa7adb8, roughness: 0.6, metalness: 0.05, transparent: true, opacity: 0.45, depthWrite: false });
let modelGroup = null;
let lastKey = "";

function applyXray() {
  frameMat.opacity = xray.checked ? 0.45 : 1;
  frameMat.depthWrite = !xray.checked;
  frameMat.needsUpdate = true;
}
xray.addEventListener("change", applyXray);
applyXray();

function showMeshes(meshes, info) {
  if (modelGroup) {
    modelGroup.traverse((o) => o.geometry?.dispose());
    scene.remove(modelGroup);
  }
  modelGroup = new THREE.Group();
  for (const m of meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(m.vertices, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
    g.setIndex(new THREE.BufferAttribute(m.triangles, 1));
    const mat =
      m.kind === "frame"
        ? frameMat
        : KIND_MAT[m.kind]?.() ?? new THREE.MeshStandardMaterial({ color: ROLLER[m.name.replace("roller_", "")] ?? 0xcccccc, roughness: 0.5 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = m.kind === "frame" ? 1 : 0;
    modelGroup.add(mesh);
  }
  scene.add(modelGroup);
  // reframe when the device changes (sizes differ), keep the user's view otherwise
  const key = info.device + (info.addon?.kind ?? "");
  if (key !== lastKey) {
    const box = new THREE.Box3().setFromObject(modelGroup);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    controls.target.copy(c);
    // add-ons are big: back off until the whole thing fits, viewed from the user's seat, above
    const dist = (0.62 * size) / Math.tan((camera.fov * Math.PI) / 360);
    if (info.addon) camera.position.copy(c).add(new THREE.Vector3(-0.62, -0.55, 0.56).normalize().multiplyScalar(dist));
    else camera.position.set(c.x - 70, c.y - 260, c.z + 40); // from the hand side, slightly above
    lastKey = key;
  }
}

function resize() {
  const { clientWidth: w, clientHeight: h } = viewport;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// ---------- worker plumbing ----------
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
let nextId = 0;
const pending = new Map();
worker.onmessage = ({ data }) => {
  pending.get(data.id)?.(data);
  pending.delete(data.id);
};
function ask(msg) {
  const id = ++nextId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ id, ...msg });
  });
}

function showProblems(list) {
  problemsEl.innerHTML = list.map((p) => `<li>${p}</li>`).join("");
  problemsEl.hidden = !list.length;
  hasProblems = list.length > 0;
  syncDownload();
}

function slotLine(info, s) {
  if (info.device === "fdp")
    return `<li><b>${s.name}</b> roller ${s.rollerDiameter} mm · up ${s.height} mm · in ${s.depth} mm · roof gap ${s.roofGap} mm</li>`;
  return `<li><b>${s.name}</b> roller ${s.rollerDiameter} mm · up ${s.height} mm · roof ${s.roofGap} mm above</li>`;
}

function showSummary(info, ms) {
  const order = ORDER.map((n) => info.slots.find((s) => s.name === n));
  summaryEl.innerHTML =
    `<p><strong>${DEVICES[info.device].label}, ${info.side} hand</strong> · ${info.width.toFixed(0)} × ${info.depth.toFixed(0)} × ${info.height.toFixed(0)} mm · built in ${ms} ms</p>` +
    `<ul>${order.map((s) => slotLine(info, s)).join("")}</ul>` +
    `<p>All rollers are spools: raised rims, waist that centres the finger. Fingers go in from below, in front of the rollers.</p>` +
    `<p>Cord goes in and out through two ${info.cord.diameter} mm holes in the top, ${info.cord.spread} mm apart and centred on your finger load so it hangs level. Hardware: 4 × 3 mm steel pins, ${info.hardware.rods} × M4 threaded rod ${info.hardware.rodLength} mm.</p>` +
    (info.addon ? addonSummary(info.addon) : "");
}

const ADDON_NAME = { table: "Table rig", spring: "Spring trainer", foot: "Foot plate" };
function addonSummary(a) {
  const size = a.kind === "foot" ? `${a.size[0]} × ${a.size[1]} mm` : `${a.length} × ${a.width} mm`;
  const weak = a.screen.items.filter((i) => !i.ok);
  let html = `<p><strong>${ADDON_NAME[a.kind]}</strong> · ${size} · ${a.pieces.length} printed part${a.pieces.length > 1 ? "s" : ""} · about ${a.grams} g of filament</p><ul>`;
  if (a.kind === "table") html += `<li>Fits a Tindeq Progressor (about ${TINDEQ.length} × ${TINDEQ.width} mm). It hangs in line on its eyes and never carries load through its case.</li><li>Palm rest top ${a.palmHeight} mm high, lined up with your finger channel. Set the gap by cord length (0–${a.travel} mm).</li>`;
  if (a.kind === "spring") {
    const s = a.spring;
    html += `<li>${s.count} × compression spring ${s.wire} × ${s.od} × ${s.length} mm: about <b>${kg(s.totalKg)} kg</b> at full squeeze over ${s.travel} mm.</li><li>Rail marks every 5 kg (${s.marks.join(", ")}). Stops end the travel before the springs can be overloaded.</li>`;
  }
  if (a.kind === "foot") html += `<li>Carabiner hole 14 mm in the fin. Stand with both feet either side of the fin.</li>`;
  html += `<li>Strength screen at ${a.screen.kg} kg × ${2} safety factor: ${weak.length ? `<span class="screen-bad">over the limit: ${weak.map((w) => w.part).join(", ")}</span>` : "every part under its assumed limit"}. A paper check with guessed PETG limits, not a load test.</li></ul>`;
  return html;
}

// ---------- preview (debounced, latest request wins) ----------
let timer = null;
let latest = 0;
async function refresh() {
  const req = ++latest;
  statusEl.textContent = "Building model…";
  const res = await ask({ type: "preview", ...readForm() });
  if (req !== latest) return; // a newer edit is already on its way
  if (!res.ok) {
    statusEl.textContent = "Fix the highlighted measurements.";
    showProblems(res.problems);
    return;
  }
  showProblems([]);
  showMeshes(res.meshes, res.info);
  showSummary(res.info, res.ms);
  statusEl.textContent = "Ready. Drag to rotate, scroll to zoom.";
}
form.addEventListener("input", () => {
  showBlurb();
  clearTimeout(timer);
  timer = setTimeout(refresh, 350);
});
document.querySelector("#reset").addEventListener("click", () => {
  for (const name of FINGERS) for (const k of KEYS) form.elements[`${name}.${k}`].value = DEFAULT_HAND[name][k];
  refresh();
});

// ---------- download ----------
downloadBtn.addEventListener("click", async () => {
  downloadBtn.disabled = true;
  statusEl.textContent = "Preparing print files…";
  const input = readForm();
  const res = await ask({ type: "export", ...input });
  syncDownload();
  if (!res.ok) {
    showProblems(res.problems);
    return;
  }
  const entries = Object.fromEntries(res.files.map((f) => [f.name, f.data]));
  entries["measurements.json"] = strToU8(JSON.stringify(input, null, 2));
  entries["PRINT-ME.txt"] = strToU8(printNotes(res.info));
  const zip = zipSync(entries, { level: 6 });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
  a.download = `fingerprint-grips-${res.info.device}-${res.info.side}${res.info.addon ? `-${res.info.addon.kind}` : ""}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  statusEl.textContent = "Downloaded. Drag the print/ folder into Bambu Studio.";
});

function printNotes(info) {
  const pins = info.hardware.pins.map((p) => `    ${p.name.padEnd(7)} ${p.length} mm`).join("\n");
  return gripperNotes(info, pins) + (info.addon ? addonNotes(info.addon) : "");
}

function addonNotes(a) {
  const files = a.pieces.map((n) => `  print/addon/${n}.stl`).join("\n");
  const common = `
Print the add-on (Bambu Studio)
${files}
  PETG, 0.20 mm, 5 walls, 40% infill, no supports. Every part already lies the way it prints.
  About ${a.grams} g of filament.
`;
  if (a.kind === "foot")
    return `
==============================================================================
FOOT PLATE
${common}
Use
  Stand on the plate, one foot each side of the fin. Carabiner through the fin hole to the
  Tindeq's lower eye; gripper cord to the upper eye. Pull straight up.
  Paper-screened for ${a.screen.kg} kg with a 2x factor. Not load-tested.
`;
  const rods = `  2 x M4 threaded rod, ${a.rodLength} mm, with nuts + washers (clamps the rig parts together along the rails)`;
  if (a.kind === "table")
    return `
==============================================================================
TABLE RIG (TINDEQ)
${common}
Hardware
${rods}
  1 carabiner (anchor wall to the Tindeq's far eye)

Assembly
  1. Butt the rig parts together, push the two rods through the rails, tighten the nuts.
  2. Lay the gripper on its back on the two ledges, finger side toward the palm rest.
  3. Cord from the gripper to the Tindeq's near eye. Carabiner from the far eye through
     the window in the anchor wall, clipped round the bar above it.
  4. Adjust the cord length so your heel sits on the rest with your fingers hooked in.
     The Tindeq should hang clear of the floor and the side guides when you pull.
  Paper-screened for ${a.screen.kg} kg with a 2x factor. Never load it past that. Tare the Tindeq unloaded.
`;
  const s = a.spring;
  return `
==============================================================================
SPRING TRAINER
${common}
Hardware
${rods}
  ${s.count} x compression spring, wire ${s.wire} mm, OD ${s.od} mm, free length ${s.length} mm
  ${s.count} x M4 threaded rod, ${s.guideLength} mm, 4 nuts each (spring guides)
  About 40 cm of 5-6 mm cord

Assembly
  1. Butt the rig parts together, push the two long rods through the rails, tighten.
  2. Fix one guide rod in each spring hole of the wall with a nut each side.
  3. Slide a spring onto each guide rod, then the carriage, then a stop nut behind it so the
     carriage rests against the end posts.
  4. Cord: gripper -> through the hole in the wall -> through the carriage, knot behind it.
  5. Lay the gripper on its back on the ledges, finger side toward the palm rest.

Load
  About ${kg(s.totalKg)} kg at full squeeze over ${s.travel} mm (${s.kgPerMm} kg per mm).
  The carriage hits the stop posts at full squeeze, before the springs are overloaded.
  The marks on the rails show where the carriage's front face sits at ${s.marks.join(", ")} kg.
  This is calculated from the spring sizes; cheap springs vary about 20%. Check once with a
  luggage scale or a Tindeq and note the real value.
`;
}

function gripperNotes(info, pins) {
  return `FINGERPRINT GRIPS: ${DEVICES[info.device].label.toUpperCase()}, ${info.side.toUpperCase()} HAND
Prototype. Fit rules from the Open Grips project, not yet checked on printed parts.

Files
  print/slice_*.stl    frame, one slice per finger + end plate (already lying flat)
  print/roller_*.stl   one roller per finger
  assembled.step       everything in place, opens in any CAD tool
  measurements.json    what you typed in, so you can re-make it later

Print (Bambu Studio)
  Filament   PETG HF or PETG Basic, dried
  Layer      0.20 mm, 0.4 mm nozzle
  Walls      5 loops, infill 40% gyroid or cubic
  Supports   none needed: every part already lies flat on the plate

Hardware
  4 x 3 mm steel pins (cut from 3 mm rod, or nails with the head cut off):
${pins}
  ${info.hardware.rods} x M4 threaded rod, ${info.hardware.rodLength} mm, with 2 nuts + washers each
  About 60 cm of 5-6 mm accessory cord

Assembly
  1. Slide each pin through its roller.
  2. Stack slice 1 (pinky) .. slice 4 (index) and the end plate in order,
     dropping each roller + pin into the blind holes as you go.
  3. Push the rods through and tighten the nuts until the slices are snug.
     Every roller must still spin freely.
  4. Feed the cord down one top hole, along the tunnel inside the top block and up the
     other hole (${info.cord.diameter} mm holes, ${info.cord.spread} mm apart). Tie it into a loop
     and clip the loop to your Tindeq / carabiner. Let the knot sit off-centre so the
     cord can slide and level the gripper.

Safety
  Start light, check for cracks or whitening after each session, and train
  over padding in case it releases. Not tested to a rated load.
`;
}

refresh();
