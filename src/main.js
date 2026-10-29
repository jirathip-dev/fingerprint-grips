import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { zipSync, strToU8 } from "fflate";
import { FINGERS, DEFAULT_HAND, MEASURES, DEVICES } from "./model.js";
import { SPRING_FIELDS, SPRING_DEFAULT, springMath, validateSpring, TINDEQ } from "./accessories.js";
import { partsFor, partsHtml, partsText } from "./parts.js";

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
  platform:
    "One platform in the spirit of the Crimpdeq platform and Crimpy. The gripper lies on its back between two rails; the cord runs straight down the middle to a Tindeq, to springs, or to both. The same printed parts do all three.",
  foot: "A plate for one foot. A cord from each side of your foot meets above it at the Tindeq, so the pull stays centred under that foot. Hang the gripper from the Tindeq's top eye and pull up.",
};
const LOAD_TXT = {
  tindeq: "Tindeq in the bay, its far eye clipped round the bridge in the anchor wall. You read the force in the Tindeq app.",
  springs: "No Tindeq: the cord goes through the wall to the spring carriage. Marks on the rails show roughly how many kg you're pulling.",
  both: "Tindeq in the bay, cord on through the wall to the springs. The springs give the resistance and the Tindeq shows the real force live, so you can also check the rail marks.",
};
const BRACE_TXT = {
  palm: "Platform on a table: heel of your hand on the rounded rest, fingers hooked in the gripper.",
  legs: "Platform on the floor, sitting: soles of your feet against the front of the rest, a strap over your feet through the two slots in the rest, cord out of the hole low in the rest to the gripper in your hands. The strap keeps the front down. Same printed parts.",
};

function readForm() {
  const hand = {};
  for (const name of FINGERS) hand[name] = Object.fromEntries(KEYS.map((k) => [k, Number(form.elements[`${name}.${k}`].value)]));
  const spring = Object.fromEntries(Object.keys(SPRING_FIELDS).map((k) => [k, Number(form.elements[`spring.${k}`].value)]));
  spring.count = Number(form.elements.springCount.value);
  return { hand, side: form.elements.side.value, axle: form.elements.axle.value, device: form.elements.device.value, addon: form.elements.addon.value, load: form.elements.load.value, brace: form.elements.brace.value, spring };
}
const kg = (v) => (v >= 10 ? Math.round(v) : v.toFixed(1));
const AXLE_TXT = {
  pin: "Rollers spin on smooth steel dowel pins. Best: no wear. Mostly sold online in packs.",
  bolt: "Rollers spin on M3 countersunk bolts, sold almost everywhere. The thread slowly wears the roller hole; a worn roller is a 5-minute reprint. Slots may be up to 3 mm wider to suit stock bolt lengths.",
};
function showBlurb() {
  document.querySelector("#axle-blurb").textContent = AXLE_TXT[form.elements.axle.value];
  blurbEl.textContent = DEVICES[form.elements.device.value].blurb;
  const addon = form.elements.addon.value;
  document.querySelector("#addon-blurb").textContent = ADDONS[addon];
  const load = form.elements.load.value;
  const springs = addon === "platform" && load !== "tindeq";
  document.querySelector("#platform-box").hidden = addon !== "platform";
  document.querySelector("#load-blurb").textContent = `${LOAD_TXT[load]} ${BRACE_TXT[form.elements.brace.value]}`;
  document.querySelector("#spring-box").hidden = !springs;
  if (springs) {
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
  cord: () => new THREE.MeshStandardMaterial({ color: 0x9acd32, roughness: 0.8 }),
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
    `<p>Cord goes in and out through two ${info.cord.diameter} mm holes in the top, ${info.cord.spread} mm apart and dead centre. Hardware: 4 × ${info.hardware.axle === "bolt" ? "M3 countersunk bolts" : "3 mm dowel pins"} and ${info.hardware.rods} × M5 × ${info.hardware.boltLength} mm bolts, all shop lengths: nothing to cut.</p>` +
    (info.addon ? addonSummary(info.addon) : "") +
    partsHtml(partsFor(info));
}

const ADDON_NAME = { platform: "Platform", foot: "Foot plate" };
const LOAD_NAME = { tindeq: "Tindeq", springs: "springs", both: "Tindeq + springs" };
function addonSummary(a) {
  const size = a.kind === "foot" ? `${a.size[0]} × ${a.size[1]} mm` : `${a.length} × ${a.width} mm`;
  const weak = a.screen.items.filter((i) => !i.ok);
  const how = a.kind === "platform" ? ` · ${LOAD_NAME[a.load]}, ${a.brace === "legs" ? "leg" : "palm"} push` : "";
  let html = `<p><strong>${ADDON_NAME[a.kind]}</strong>${how} · ${size} · ${a.pieces.length} printed part${a.pieces.length > 1 ? "s" : ""} · about ${a.grams} g of filament</p><ul>`;
  if (a.kind === "platform") {
    if (a.load !== "springs") html += `<li>Fits a Tindeq Progressor (about ${TINDEQ.length} × ${TINDEQ.width} × ${TINDEQ.thick} mm). It hangs in line on its eyes and never carries load through its case.</li>`;
    if (a.load !== "tindeq") {
      const s = a.spring;
      html += `<li>${s.count} × compression spring ${s.wire} × ${s.od} × ${s.length} mm: about <b>${kg(s.totalKg)} kg</b> at full squeeze over ${s.travel} mm. Stops end the travel before the springs are overloaded.</li>` +
        `<li>Same print takes 2 or 4 springs (about ${kg(s.kg2)} or ${kg(s.kg4)} kg); one rail is marked for each. Wind the nuts behind the carriage in to pre-tension: harder from the start, same top load, marks stay right.</li>`;
    }
    html += a.brace === "legs"
      ? `<li>Leg push: feet on the front of the rest, held by a ${a.strapW} mm strap through the slots in the rest. Cord out of the ${a.legHole} mm hole low in the rest. Platform flat on the floor.</li>`
      : `<li>Palm rest top ${a.palmHeight} mm high, lined up with your finger channel. Set the gap by cord length (0–${a.travel} mm).</li>`;
    html += `<li>Print once, use every way: Tindeq, springs or both, palm or legs.</li>`;
  }
  if (a.kind === "foot") html += `<li>One foot, ${a.gap} mm between the lugs (up to about EU 46 / US 12). A cord from each side meets at the Tindeq's lower eye, at least ${a.apex} mm above the plate.</li>`;
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
  return gripperNotes(info, pins) + (info.addon ? addonNotes(info.addon) : "") + partsText(partsFor(info));
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
FOOT PLATE (ONE FOOT)
${common}
Hardware
  2 cords (5-6 mm, about 40 cm each), 1 carabiner

Use
  1. Tie a cord to each lug. Stand on the plate with one foot between the lugs
     (${a.gap} mm of room), lugs beside your arch.
  2. Bring both cords up to one carabiner, at least ${a.apex} mm above the plate (shorter
     cords pull the lugs sideways). Clip it to the Tindeq's lower eye.
  3. Gripper cord to the Tindeq's top eye. Pull straight up. Swap feet between sets.
  Paper-screened for ${a.screen.kg} kg with a 2x factor. Not load-tested.
`;
  const s = a.spring;
  return `
==============================================================================
PLATFORM (TINDEQ / SPRINGS / BOTH, PALM OR LEG PUSH)
${common}
Hardware
  ${2 * a.joints} x M5 x 30 mm bolt, washer + nut (joins the parts: one per rail at each joint)
  Tindeq use: 1 carabiner (or a short loop of cord) from the Tindeq's far eye round the wall bridge
  Spring use: 2 or 4 x compression spring, wire ${s.wire} mm, OD ${s.od} mm, free length ${s.length} mm
              (all the same size)
              1 x M5 x ${a.guideBolt} mm bolt per spring, 2 washers + 2 nuts each (spring guides)
              About 1 m of 5-6 mm cord (the carriage loop), 1 carabiner (gripper cord to the loop)
  Every bolt is a stock shop length: nothing to cut.

Assembly
  1. Butt the parts together. At each joint, put a bolt through the hole low in each rail,
     head in the pocket on one side, washer + nut in the pocket on the other. Tighten firmly.
  2. Lay the gripper on its back on the two ledges, finger side toward the rest.
  3. Springs (if used): push a guide bolt through a spring hole of the wall from the Tindeq
     side, with a nut on the far side to lock it to the wall. Slide on the spring, then the
     carriage, then washer + nut behind it. 4 springs: all four holes. 2 springs: two opposite
     corners (top-left + bottom-right), so the pull stays centred.

Load: pick one, no reprint
  Tindeq only     cord from the gripper to the Tindeq's near eye; carabiner from its far eye
                  through the wall window, round the bridge above it.
  Springs only    the carriage loop (below) comes out of the wall window; clip the gripper
                  cord to it with a carabiner.
  Tindeq+springs  gripper -> Tindeq near eye; far eye -> the carriage loop. The springs give the
                  resistance, the Tindeq reads it.
  Carriage loop   no knot on the carriage. Tie a loop of cord (double fisherman's). Push one end
                  of the loop through the wall window, through one carriage hole, round the groove
                  on the back and back out of the other hole and the window: a U round the carriage.
                  Adjust where the knot sits so it stays in front of the wall, never in a hole.
  The Tindeq should hang clear of the floor and the side guides when you pull. Tare it unloaded.

Brace: pick one
  Palm push   platform on a table. Heel of your hand on the rounded rest, fingers in the gripper.
  Leg push    platform flat on the floor, sitting. Soles of your feet on the front of the rest,
              strap (25 mm webbing or a luggage strap) through the two slots, tight over your
              feet. Feed the gripper cord out of the hole low in the rest. Your hands are higher
              than the rest, so the cord pulls up: the strap and your feet hold the front down.
              Pull toward your belly, not up at your chin.

Springs
  About ${kg(s.totalKg)} kg at full squeeze over ${s.travel} mm (${s.kgPerMm} kg per mm) with ${s.count} springs.
  More load: fit 4 springs (about ${kg(s.kg4)} kg), no reprint. Lighter: 2 (about ${kg(s.kg2)} kg).
  The carriage hits the stop posts at full squeeze, before the springs are overloaded.
  Rail marks: seen from the palm rest, the LEFT rail is marked for 2 springs, the RIGHT rail
  for 4. They show where the carriage's front face sits at each 5 kg (${s.marks.join(", ")} kg
  with ${s.count}); the 10 kg marks are wider.

  Pre-tension (adjust): with the nuts behind the carriage at the end posts the springs are just
  touching. Wind every nut in by the same number of turns (M5: 0.8 mm per turn) to pre-squeeze
  them: the pull starts harder and reaches full squeeze sooner. The top load is the same (the
  stops decide it) and the marks still read right, because they go by carriage position.
  Calculated from the spring sizes; cheap springs vary about 20%. Check once with the Tindeq
  (Tindeq + springs) and trust its number.

  Paper-screened for ${a.screen.kg} kg with a 2x factor. Never load it past that.
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

Hardware (all stock shop lengths: nothing to cut)
${info.hardware.axle === "bolt" ? "  4 x M3 countersunk bolts (flat head, ISO 10642 / DIN 7991), the roller axles:" : "  4 x 3 mm steel dowel pins (the roller axles):"}
${pins}
  ${info.hardware.rods} x M5 x ${info.hardware.boltLength} mm bolt (socket head), with a washer each end + a nut
  About 60 cm of 5-6 mm accessory cord

Assembly
${info.hardware.axle === "bolt" ? `  1. Each roller's bolt goes in from the wall with the cone-shaped hole: push it through
     that wall, through the roller, and into the small hole in the next wall. No nut.
  2. Stack slice 1 (pinky) .. slice 4 (index) and the end plate in order, fitting each
     roller + bolt as you go. The head sits flat in its cone; the next slice covers it.` : `  1. Slide each pin through its roller.
  2. Stack slice 1 (pinky) .. slice 4 (index) and the end plate in order,
     dropping each roller + pin into the blind holes as you go.`}
  3. Push the bolts through and tighten the nuts until the slices are snug.
     Every roller must still spin freely.
     How the ${info.hardware.axle === "bolt" ? "roller bolts" : "pins"} stay put: ${info.hardware.axle === "bolt" ? "the head sits in its cone and the tip in a blind hole" : "each pin end sits in a blind hole (it doesn't go through)"} in the
     walls either side. Once the M5 bolts clamp the slices, they're trapped: no glue, and
     they come out again if you take it apart.
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
