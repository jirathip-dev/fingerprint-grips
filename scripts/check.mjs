// Headless geometry gate. Builds FDP + FDS for both hands and checks what makes
// a gripper printable and usable. Run: npm run check   (exit 1 on any failure)
//
//  1. every part is a valid closed solid (and its STL mesh is watertight)
//  2. rollers clear the frame and clear each other
//  3. slices don't overlap each other (they assemble)
//  4. each roller pin hole is blind: open toward its roller, closed to the outside
//  5. the cord tunnel is enclosed: a solid shell all round, open only at the top
//  6. FDP: roof, ledge behind the roller, closed back. FDS: open back, V roof, roller = middle segment
//  7. the finger can get in: open from below, in front of the roller, up to the roof (both)
//  8. every roller is a spool: raised rims, concave waist
//  7. every printed part fits a 256 mm Bambu A1 bed
//  8. bad input is rejected
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import opencascade from "replicad-opencascadejs";
import * as r from "replicad";
import { buildGripper, printOrient, validate, DEFAULT_HAND, DIM } from "../src/model.js";

const require = createRequire(import.meta.url);
r.setOC(await opencascade({ wasmBinary: readFileSync(require.resolve("replicad-opencascadejs/wasm")) }));

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log("FAIL", msg);
};
const vol = (s) => r.measureVolume(s);
const common = (a, b) => vol(a.clone().intersect(b.clone()));
const box = (x0, x1, y0, y1, z0, z1) => r.makeBox([x0, y0, z0], [x1, y1, z1]);
const solidAt = (frame, [x, y, z], e = 0.4) => common(frame, box(x - e, x + e, y - e, y + e, z - e, z + e)) > 0.8 * (2 * e) ** 3;
const airAt = (frame, [x, y, z], e = 0.4) => common(frame, box(x - e, x + e, y - e, y + e, z - e, z + e)) < 0.02 * (2 * e) ** 3;

function watertight(stlBuf) {
  const n = stlBuf.readUInt32LE(80);
  const edges = new Map();
  const key = (o) => [0, 4, 8].map((k) => stlBuf.readFloatLE(o + k).toFixed(4)).join(",");
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    const v = [key(o), key(o + 12), key(o + 24)];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const k = v[a] < v[b] ? v[a] + "|" + v[b] : v[b] + "|" + v[a];
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const c of edges.values()) if (c !== 2) bad++;
  return { tris: n, bad };
}

mkdirSync("out", { recursive: true });
for (const device of ["fdp", "fds"]) {
  for (const side of ["right", "left"]) {
    const tag = `${device}/${side}`;
    const { parts, layout: L, info } = buildGripper(r, DEFAULT_HAND, { device, side });
    const frames = parts.filter((p) => p.kind === "frame");
    const rollers = parts.filter((p) => p.kind === "roller");
    let frame = frames[0].shape.clone();
    for (const p of frames.slice(1)) frame = frame.fuse(p.shape.clone());
    const X = (x) => (side === "left" ? L.width - x : x); // mirror x for the left hand

    // 1. valid solids, watertight meshes, fits the bed
    let triTotal = 0;
    for (const p of parts) {
      const oriented = printOrient(p.shape.clone(), p.kind, side);
      const buf = Buffer.from(await oriented.blobSTL({ tolerance: 0.05, angularTolerance: 0.2, binary: true }).arrayBuffer());
      writeFileSync(`out/${device}_${side}_${p.name}.stl`, buf);
      const w = watertight(buf);
      triTotal += w.tris;
      if (w.bad) fail(`${tag} ${p.name}: STL has ${w.bad} open edges`);
      const [lo, hi] = oriented.boundingBox.bounds;
      if (Math.max(hi[0] - lo[0], hi[1] - lo[1]) > 240 || hi[2] - lo[2] > 250) fail(`${tag} ${p.name}: does not fit a 256 mm bed`);
      if (Math.abs(lo[2]) > 0.01) fail(`${tag} ${p.name}: not sitting on the bed`);
    }

    // 2. rollers clear the frame and each other
    for (const p of rollers) {
      const o = common(frame, p.shape);
      if (o > 0.01) fail(`${tag} ${p.name} overlaps the frame by ${o.toFixed(3)} mm3`);
    }
    for (let i = 0; i < rollers.length; i++)
      for (let j = i + 1; j < rollers.length; j++)
        if (common(rollers[i].shape, rollers[j].shape) > 0.01) fail(`${tag} ${rollers[i].name} touches ${rollers[j].name}`);

    // 3. slices don't overlap
    for (let i = 0; i < frames.length - 1; i++) {
      const o = common(frames[i].shape, frames[i + 1].shape);
      if (o > 0.01) fail(`${tag} ${frames[i].name} overlaps ${frames[i + 1].name} by ${o.toFixed(2)} mm3`);
    }

    // 4. blind pin holes: hollow inside the hole, solid just past its end
    for (const s of L.slots) {
      const inner = [s.xs - DIM.pinDepth + 0.6, s.xs + s.w + DIM.pinDepth - 0.6];
      const outer = [s.xs - DIM.pinDepth - 0.7, s.xs + s.w + DIM.pinDepth + 0.7];
      for (const xi of inner) if (solidAt(frame, [X(xi), s.yc, s.zc], 0.3)) fail(`${tag} ${s.name} pin hole is blocked`);
      for (const xo of outer) if (!solidAt(frame, [X(xo), s.yc, s.zc], 0.3)) fail(`${tag} ${s.name} pin hole breaks through its wall`);
    }

    // 5. cord tunnel: enclosed shell all round, open only at the top
    const c = L.cord;
    const shell = 3;
    const env = box(c.x - c.bend - c.half - shell, c.x + c.bend + c.half + shell, c.y - c.half - shell, c.y + c.half + shell, c.bottom - shell, L.zTop - 0.01);
    const envX = side === "left" ? env.clone().mirror("YZ", [L.width / 2, 0, 0]) : env;
    const shellSolid = common(frame, envX);
    const envVol = vol(envX.clone());
    const tunnelVol = envVol - shellSolid;
    const tunnelExpected = 2 * c.half * (2 * c.half * (L.zTop - c.zc) * 2 + (Math.PI * ((c.bend + c.half) ** 2 - (c.bend - c.half) ** 2)) / 2);
    if (Math.abs(tunnelVol - tunnelExpected) / tunnelExpected > 0.12)
      fail(`${tag} cord tunnel is not enclosed (air ${tunnelVol.toFixed(0)} mm3, expected ~${tunnelExpected.toFixed(0)})`);
    if (!solidAt(frame, [X(c.x), c.y, c.bottom - 1.5], 0.5)) fail(`${tag} no solid floor under the cord bend`);
    if (solidAt(frame, [X(c.x - c.bend), c.y, L.zTop - 1], 0.5) || solidAt(frame, [X(c.x + c.bend), c.y, L.zTop - 1], 0.5))
      fail(`${tag} cord holes are not open at the top`);
    if (c.bottom - shell < L.maxCav) fail(`${tag} cord tunnel breaks into a finger slot`);

    // 6-8. finger features
    for (const s of L.slots) {
      const xm = X(s.xs + s.w / 2);
      // 7. entry path: a finger-thick column coming up from below in front of the roller,
      //    then over the roller top to the roof. Sampled across the slot width.
      const cols = [s.xs + 1.5, s.xs + s.w / 2, s.xs + s.w - 1.5].map(X);
      const roofZ = device === "fdp" ? s.zCavTop : s.zRoof;
      const topZ = device === "fdp" ? s.zTop : s.zApex;
      let blocked = null;
      for (const x of cols) {
        for (let z = L.zBottom + 1; z < roofZ - 1 && !blocked; z += 3)
          for (const y of [s.yFront - 10, s.yFront - 5, s.yFront - 1.5]) if (!airAt(frame, [x, y, z])) blocked = `y=${y.toFixed(0)} z=${z.toFixed(0)}`;
        for (let z = topZ + 1.5; z < roofZ - 1 && !blocked; z += 3) if (!airAt(frame, [x, s.yc, z])) blocked = `over the roller z=${z.toFixed(0)}`;
      }
      if (blocked) fail(`${tag} ${s.name}: finger entry path is blocked at ${blocked}`);
      // 8. spool: rim solid near each end, waist lower in the middle
      const roller = rollers.find((p) => p.name === `roller_${s.name}`).shape;
      for (const xe of [s.xs + 2, s.xs + s.w - 2]) if (!solidAt(roller, [X(xe), s.yc, s.zc + s.r - 0.6], 0.25)) fail(`${tag} ${s.name}: roller rim missing`);
      if (!airAt(roller, [xm, s.yc, s.zc + s.r - 0.6], 0.25)) fail(`${tag} ${s.name}: roller has no waist`);
      // spec, not layout: the waist dips at most 3 mm (deeper pinches the pad)
      if (!solidAt(roller, [xm, s.yc, s.zc + s.r - 3.3], 0.25)) fail(`${tag} ${s.name}: roller waist too deep`);
      if (device === "fdp") {
        if (!solidAt(frame, [xm, s.yc, s.zCavTop + 1.5])) fail(`${tag} ${s.name}: no roof above the roller`);
        if (solidAt(frame, [xm, s.yc, s.zCavTop - 1.5])) fail(`${tag} ${s.name}: roof gap is closed`);
        if (!solidAt(frame, [xm, s.yLedge + DIM.fdp.ledgeDepth / 2, s.zLedge - 1])) fail(`${tag} ${s.name}: no ledge behind the roller`);
        // spec, not layout: the pad rests on the ledge, so it can't stand above the roller top
        if (!airAt(frame, [xm, s.yLedge + DIM.fdp.ledgeDepth / 2, s.zTop + 0.3], 0.25)) fail(`${tag} ${s.name}: ledge is above the roller waist`);
        // claw gripper: the finger can't pass through; closed at the back where the fingertip is
        if (!solidAt(frame, [xm, s.yCavBack + 2, s.zTop + 2])) fail(`${tag} ${s.name}: FDP slot is open at the back`);
      } else {
        // pass-through gripper: open front to back, so the fingertips pass through
        for (const y of [s.yc + s.r + 2, -1.5]) if (solidAt(frame, [xm, y, s.zc])) fail(`${tag} ${s.name}: FDS slot is blocked behind the roller`);
        // roof: solid above the pocket, a V that peaks over the middle of the finger
        if (!solidAt(frame, [xm, s.yc, s.zCavTop + 1.5])) fail(`${tag} ${s.name}: no roof over the roller`);
        if (solidAt(frame, [xm, s.yc, s.zRoof + s.peak - 1.5])) fail(`${tag} ${s.name}: roof pocket has no peak`);
        if (!solidAt(frame, [X(s.xs + 1), s.yc, s.zRoof + s.peak / 2])) fail(`${tag} ${s.name}: roof pocket is flat, not a V`);
        // roof at least one roller radius above the roller top, measured on the solid itself
        if (solidAt(frame, [X(s.xs + 0.6), s.yc, s.zApex + s.r - 0.6], 0.3)) fail(`${tag} ${s.name}: roof is closer than one roller radius`);
        // roller as big as the middle segment (ideal edge ~ length of the second finger pad)
        const want = Math.min(40, Math.max(16, s.f.pipDip));
        if (Math.abs(2 * s.r - want) > 0.01) fail(`${tag} ${s.name}: roller ${2 * s.r} mm, expected ${want}`);
      }
    }

    const sl = info.slots.map((s) => `${s.name} ${s.rollerDiameter}`).join(", ");
    console.log(`ok?  ${tag}: ${parts.length} parts, ${info.width.toFixed(0)} x ${info.depth.toFixed(0)} x ${info.height.toFixed(0)} mm, ${triTotal} tris | rollers ${sl} | cord tunnel ${tunnelVol.toFixed(0)}/${tunnelExpected.toFixed(0)} mm3`);
  }
}

const bad = structuredClone(DEFAULT_HAND);
bad.middle.length = 300;
if (validate(bad).length === 0) fail("a 300 mm middle finger was accepted");
const swapped = structuredClone(DEFAULT_HAND);
swapped.ring.pipDip = 60;
if (validate(swapped).length === 0) fail("impossible segment lengths were accepted");
if (validate(DEFAULT_HAND).length) fail("the default hand was rejected: " + validate(DEFAULT_HAND)[0]);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed (STLs in ./out)");
