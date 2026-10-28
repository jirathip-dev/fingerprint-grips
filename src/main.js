import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { zipSync, strToU8 } from "fflate";
import { FINGERS, DEFAULT_HAND, MEASURES, DEVICES } from "./model.js";

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

function readForm() {
  const hand = {};
  for (const name of FINGERS) hand[name] = Object.fromEntries(KEYS.map((k) => [k, Number(form.elements[`${name}.${k}`].value)]));
  return { hand, side: form.elements.side.value, device: form.elements.device.value };
}
function showBlurb() {
  blurbEl.textContent = DEVICES[form.elements.device.value].blurb;
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
        : new THREE.MeshStandardMaterial({ color: ROLLER[m.name.replace("roller_", "")] ?? 0xcccccc, roughness: 0.5 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = m.kind === "frame" ? 1 : 0;
    modelGroup.add(mesh);
  }
  scene.add(modelGroup);
  // reframe when the device changes (sizes differ), keep the user's view otherwise
  const key = info.device;
  if (key !== lastKey) {
    const box = new THREE.Box3().setFromObject(modelGroup);
    const c = box.getCenter(new THREE.Vector3());
    controls.target.copy(c);
    camera.position.set(c.x - 70, c.y - 260, c.z + 40); // from the hand side, slightly above
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
    `<p>Cord goes in and out through two ${info.cord.diameter} mm holes in the top. Hardware: 4 × 3 mm steel pins, ${info.hardware.rods} × M4 threaded rod ${info.hardware.rodLength} mm.</p>`;
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
  a.download = `fingerprint-grips-${res.info.device}-${res.info.side}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  statusEl.textContent = "Downloaded. Drag the print/ folder into Bambu Studio.";
});

function printNotes(info) {
  const pins = info.hardware.pins.map((p) => `    ${p.name.padEnd(7)} ${p.length} mm`).join("\n");
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
  4. Feed the cord down one top hole and up the other (${info.cord.diameter} mm, inside the
     top block), tie it into a loop, clip the loop to your Tindeq / carabiner.

Safety
  Start light, check for cracks or whitening after each session, and train
  over padding in case it releases. Not tested to a rated load.
`;
}

refresh();
