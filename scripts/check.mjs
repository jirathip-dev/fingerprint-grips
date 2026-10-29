// Headless geometry gate. Builds FDP + FDS for both hands and checks what makes
// a gripper printable and usable. Run: npm run check   (exit 1 on any failure)
//
//  0. right hand has the pinky on the right as seen from the hand side (and vice versa)
//  1. every part is a valid closed solid (and its STL mesh is watertight)
//  2. rollers clear the frame and clear each other
//  3. slices don't overlap each other (they assemble)
//  4. each roller pin hole is blind: open toward its roller, closed to the outside
//  5. the cord tunnel is enclosed (open only at two top holes), holes >= 55% of the width apart, dead centre (same distance from both ends)
//  6. FDP: roof, ledge behind the roller, closed back. FDS: open back, V roof, roller = middle segment
//  7. the finger can get in: open from below, in front of the roller, up to the roof (both)
//  8. every roller is a spool: raised rims, concave waist
//  7. every printed part fits a 256 mm Bambu A1 bed
//  8. bad input is rejected
// Add-ons (platform + foot plate), for FDP + FDS, platform with 2 and 4 springs:
//  A1. every printed piece is a valid watertight solid that fits the bed (<= 236 mm)
//  A2. the gripper sits on the ledges between the rails: touching, not sinking in, not clashing;
//      FDS fingertips have room under it
//  A3. palm rest top is level with the middle finger's way in (+-6 mm); heel and fingers pull in line
//  A4. one straight cord line from the front of the rest (leg-push slot) through the gripper
//      position, the Tindeq bay, the wall window and the carriage: nothing printed in its way
//  A5. Tindeq: clears every printed part by >= 2 mm over its whole run (it moves with the springs),
//      never reaches the gripper's knot; side guides; window through the wall, bridge above it
//  A6. springs: clear the frame, stop posts end the travel before the wire's limit,
//      rate matches a hand calc, kg marks cut where the maths says
//  A7. foot plate: room for one foot between two lugs, both lug holes go through with a bridge
//      above, both cords run free from the holes to the Tindeq eye above the foot
//  A8. strength screen passes at the rating x design factor
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import opencascade from "replicad-opencascadejs";
import * as r from "replicad";
import { buildGripper, printOrient, validate, DEFAULT_HAND, DIM, mirrored } from "../src/model.js";
import {
  rigLayout, buildRig, rigGhosts, buildFoot, footLayout, footGhosts, placeInRig, printOrientAddon,
  springMath, validateSpring, SPRING_DEFAULT, ADDON_DIM, TINDEQ,
} from "../src/accessories.js";

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
const ADDONS_ONLY = !!process.env.CHECK_ADDONS_ONLY; // mutation runs: skip the gripper section
for (const device of ADDONS_ONLY ? [] : ["fdp", "fds"]) {
  for (const side of ["right", "left"]) {
    const tag = `${device}/${side}`;
    const { parts, layout: L, info } = buildGripper(r, DEFAULT_HAND, { device, side });
    const frames = parts.filter((p) => p.kind === "frame");
    const rollers = parts.filter((p) => p.kind === "roller");
    let frame = frames[0].shape.clone();
    for (const p of frames.slice(1)) frame = frame.fuse(p.shape.clone());
    const X = (x) => (mirrored(side) ? L.width - x : x); // layout x -> built x

    // 0. handedness (spec, not layout): the user stands on the hand side (-Y) looking +Y with
    //    Z up, so +X is on their right. Right hand, palm toward the gripper, fingers up:
    //    thumb/index on the LEFT, pinky on the RIGHT. Left hand is the opposite.
    const cx = (n) => { const [lo, hi] = rollers.find((q) => q.name === `roller_${n}`).shape.boundingBox.bounds; return (lo[0] + hi[0]) / 2; };
    const pinkyRight = cx("pinky") > cx("index");
    if (pinkyRight !== (side === "right")) fail(`${tag}: wrong hand: seen from the hand side the pinky is on the ${pinkyRight ? "right" : "left"}`);

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

    // 5. cord tunnel: enclosed shell all round, open only at the two top holes
    const c = L.cord;
    const shell = 3;
    const MX = X;
    const env = box(c.xa - c.half - shell, c.xb + c.half + shell, c.y - c.half - shell, c.y + c.half + shell, c.bottom - shell, L.zTop - 0.01);
    const envX = mirrored(side) ? env.clone().mirror("YZ", [L.width / 2, 0, 0]) : env;
    const tunnelVol = vol(envX.clone()) - common(frame, envX);
    // U profile area below the top face: outer rounded rect minus inner, bottom corners rounded
    const k = 2 * (1 - Math.PI / 4);
    const ro = c.bend + c.half, ri = c.bend - c.half;
    const area = (c.xb - c.xa + 2 * c.half) * (L.zTop - c.bottom) - k * ro ** 2 - ((c.xb - c.xa - 2 * c.half) * (L.zTop - c.zh - c.half) - k * ri ** 2);
    const tunnelExpected = area * 2 * c.half;
    if (Math.abs(tunnelVol - tunnelExpected) / tunnelExpected > 0.08)
      fail(`${tag} cord tunnel is not enclosed (air ${tunnelVol.toFixed(0)} mm3, expected ~${tunnelExpected.toFixed(0)})`);
    if (!solidAt(frame, [MX(c.x), c.y, c.bottom - 1.5], 0.5)) fail(`${tag} no solid floor under the cord run`);
    if (!solidAt(frame, [MX(c.x), c.y, c.zh + c.half + 1.5], 0.5)) fail(`${tag} no solid roof over the cord run`);
    for (const xh of [c.xa, c.xb]) if (!airAt(frame, [MX(xh), c.y, L.zTop - 1], 0.5)) fail(`${tag} cord hole at x=${xh.toFixed(0)} is not open at the top`);
    if (c.bottom - shell < L.maxCav) fail(`${tag} cord tunnel breaks into a finger slot`);
    // HoG-style wide stance, dead centre: measured from the real holes in the frame, not the layout
    if (c.xb - c.xa < 0.55 * L.width) fail(`${tag} cord holes only ${(c.xb - c.xa).toFixed(0)} mm apart (want >= 55% of the ${L.width.toFixed(0)} mm width)`);
    {
      // scan the top face for the two holes, then compare their gaps to each end
      const fb = frame.boundingBox.bounds, holes = [];
      let inHole = false, start = 0;
      for (let x = fb[0][0] + 0.25; x < fb[1][0]; x += 0.5) {
        const air = airAt(frame, [x, c.y, L.zTop - 1], 0.2);
        if (air && !inHole) start = x;
        if (!air && inHole) holes.push((start + x - 0.5) / 2);
        inHole = air;
      }
      if (holes.length !== 2) fail(`${tag} expected 2 cord holes in the top, found ${holes.length}`);
      else {
        const left = holes[0] - fb[0][0], right = fb[1][0] - holes[1];
        if (Math.abs(left - right) > 1) fail(`${tag} cord holes are off-centre: ${left.toFixed(1)} mm from one end, ${right.toFixed(1)} mm from the other`);
      }
    }
    if (c.xa - c.half < DIM.wall || c.xb + c.half > L.width - DIM.wall) fail(`${tag} cord hole breaks out of the end wall`);

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

// ------------------------------------------------------------------ add-ons
const BED = 236; // spec, not layout: Bambu A1 256 mm bed minus margins
const TIP_ROOM = 10; // spec: FDS fingertips come out of the open back, so they need this much air under the gripper
const KNOT_ROOM = 10; // spec: the cord knot behind the gripper needs this much before the Tindeq can reach it
const SLOT_MAX = 14; // spec: leg-push slot fits a 5-6 mm cord; wider leaves less rest for the heel
const FOOT_W = 110; // spec: a wide adult foot (about EU 46) fits between the lugs
const INSTEP = { w: 90, h: 80 }; // spec: across and above the sole at the arch, where the cords pass
const fuseAll = (list) => list.slice(1).reduce((a, p) => a.fuse(p.shape.clone()), list[0].shape.clone());
async function stlCheck(tag, p) {
  const o = printOrientAddon(p.shape.clone(), p.print);
  const buf = Buffer.from(await o.blobSTL({ tolerance: 0.05, angularTolerance: 0.2, binary: true }).arrayBuffer());
  writeFileSync(`out/addon_${tag.replace(/\W+/g, "_")}_${p.name}.stl`, buf);
  const w = watertight(buf);
  if (w.bad) fail(`${tag} ${p.name}: STL not watertight (${w.bad} open edges)`);
  const [lo, hi] = o.boundingBox.bounds;
  if (Math.max(hi[0] - lo[0], hi[1] - lo[1]) > BED + 0.01 || hi[2] - lo[2] > 250) fail(`${tag} ${p.name}: ${(hi[0] - lo[0]).toFixed(0)} x ${(hi[1] - lo[1]).toFixed(0)} mm does not fit the bed`);
}
for (const device of ["fdp", "fds"]) {
  const g = buildGripper(r, DEFAULT_HAND, { device, side: "right" });
  for (const SP of [SPRING_DEFAULT, { ...SPRING_DEFAULT, count: 4 }]) {
    const tag = `${device}+platform x${SP.count}`;
    const R = rigLayout(g.layout, g.info, SP);
    if (R.problems?.length) fail(`${tag}: layout refused a valid spring: ${R.problems[0]}`);
    const parts = buildRig(r, R);
    // A1
    for (const p of parts) await stlCheck(tag, p);
    const rig = fuseAll(parts.filter((p) => p.name.startsWith("platform_")));
    // A2: at both ends of the cord travel
    for (const x0 of [R.xPalm, R.xPalm + ADDON_DIM.travel]) {
      const gx = fuseAll(g.parts.filter((p) => p.kind === "frame").map((p) => ({ shape: placeInRig(p.shape.clone(), g.layout, R.zl, x0) })));
      const clash = common(rig, gx);
      if (clash > 1) fail(`${tag}: gripper clashes with the platform at ${x0 - R.xPalm} mm (${clash.toFixed(0)} mm3)`);
      if (common(rig, gx.clone().translate([0, 0, -0.6])) < 20) fail(`${tag}: gripper is not resting on the ledges at ${x0 - R.xPalm} mm`);
    }
    if (device === "fds") {
      for (const sl of g.layout.slots) {
        // right hand is built mirrored (x -> W - x); placeInRig maps built x -> platform y = W/2 - x
        const yRig = sl.xs + sl.w / 2 - R.Wg / 2;
        const xRig = R.gripperX0 - g.layout.zBottom + sl.zc; // under the roller
        if (common(rig, r.makeBox([xRig - 4, yRig - 3, 0.5], [xRig + 4, yRig + 3, TIP_ROOM])) > 0.5) fail(`${tag} ${sl.name}: no room under the gripper for the fingertips (needs ${TIP_ROOM} mm)`);
      }
      if (R.zl < TIP_ROOM) fail(`${tag}: gripper sits only ${R.zl} mm above the table; FDS tips need ${TIP_ROOM} mm`);
    }
    // A3
    const mid = g.layout.slots.find((s) => s.name === "middle");
    const entryZ = R.zl + (-mid.yFront - g.layout.yF) / 2;
    if (Math.abs(R.Zp - entryZ) > 6) fail(`${tag}: palm rest top ${R.Zp} mm vs finger entry ${entryZ.toFixed(0)} mm`);
    for (const y of [-R.outer + 8, R.outer - 8]) if (!solidAt(rig, [ADDON_DIM.palm.root - ADDON_DIM.palm.top / 2, y, R.Zp - 1.5], 0.5)) fail(`${tag}: palm rest top missing at y=${y.toFixed(0)}`);
    // A4: one cord line, front of the rest to behind the carriage. Leg push uses the front part.
    const ray = r.makeCylinder(2.5, R.xC1 + 2, [-1, R.Yc, R.Zc], [1, 0, 0]);
    const blocked = common(rig, ray);
    if (blocked > 0.5) fail(`${tag}: the cord line is blocked (${blocked.toFixed(0)} mm3 of printed part in the way)`);
    const xs = ADDON_DIM.palm.root - ADDON_DIM.palm.top / 2, zs = R.Zp - 2; // top of the rest, where the heel goes
    if (!airAt(rig, [xs, R.Yc, zs], 1)) fail(`${tag}: leg-push slot not open from the top of the rest (cord can't drop in)`);
    for (const k of [-1, 1]) if (!solidAt(rig, [xs, R.Yc + k * (SLOT_MAX / 2 + 1), zs], 0.5)) fail(`${tag}: leg-push slot is wider than ${SLOT_MAX} mm`);
    // A5: Tindeq envelope over its whole run (+2 mm all round). The run comes from the spring
    // maths, not the layout: it moves toward you by the spring travel at full squeeze.
    const T = TINDEQ;
    const m = springMath(SP);
    const run0 = R.xT0 - m.travel;
    if (run0 < R.xBayEnd + 3) fail(`${tag}: at full squeeze the Tindeq runs into the gripper bay (${(run0 - R.xBayEnd).toFixed(0)} mm)`);
    const env = r.makeBox([run0 - 2, R.Yc - T.width / 2 - 2, R.Zc - T.thick / 2 - 2], [R.tindeqRun[1] + 2, R.Yc + T.width / 2 + 2, R.Zc + T.thick / 2 + 2]);
    const touch = common(rig, env);
    if (touch > 0.5) fail(`${tag}: a printed part is within 2 mm of the Tindeq's path (${touch.toFixed(0)} mm3)`);
    // the cord between the gripper and the Tindeq is the same length while you pull, so the
    // shortest it can be is the gripper at its furthest to the Tindeq at rest
    if (R.xT0 - R.xBayEnd < KNOT_ROOM) fail(`${tag}: the Tindeq sits too close to the gripper for the knot (${(R.xT0 - R.xBayEnd).toFixed(0)} mm)`);
    for (const y0 of R.guideY) if (!solidAt(rig, [(R.tindeqRun[0] + R.tindeqRun[1]) / 2, y0 + ADDON_DIM.tindeq.guideT / 2, R.guideTop - 2], 0.5)) fail(`${tag}: side guide missing at y=${y0.toFixed(0)}`);
    if (!airAt(rig, [(R.xW0 + R.xW1) / 2, R.Yc, R.Zc], 1)) fail(`${tag}: no window through the anchor wall`);
    if (!solidAt(rig, [(R.xW0 + R.xW1) / 2, R.Yc, R.Zc + R.window.r * Math.SQRT2 + ADDON_DIM.wall.over / 2], 1)) fail(`${tag}: no bridge above the wall window`);
    // A6
    const sp = R.spring;
    for (const gh of rigGhosts(r, R, "both").filter((q) => q.kind === "spring")) {
      const c = common(rig, gh.shape);
      if (c > 0.5) fail(`${tag}: a spring clashes with the frame (${c.toFixed(0)} mm3)`);
    }
    const carriage = parts.find((p) => p.name === "spring_carriage").shape;
    if (common(rig, carriage) > 0.5) fail(`${tag}: the carriage clashes with the frame at rest`);
    if (R.carriageY[0] < -R.inner + 0.5 || R.carriageY[1] > R.inner - 0.5) fail(`${tag}: carriage is wider than the gap between the rails`);
    if (common(rig, carriage.clone().translate([-sp.travel, 0, 0])) > 0.5) fail(`${tag}: carriage runs into the frame before full travel`);
    if (common(rig, carriage.clone().translate([-sp.travel - 1, 0, 0])) < 5) fail(`${tag}: nothing stops the carriage at full travel (springs could be overloaded)`);
    const hand = (79300 * 2 ** 4) / (8 * 14 ** 3 * 6); // 2 mm wire, 16 OD, 8 coils: k by hand
    if (Math.abs(m.k - hand) > 0.01) fail(`${tag}: spring rate ${m.k.toFixed(3)} != hand calc ${hand.toFixed(3)} N/mm`);
    if (m.travel > m.L0 - 1 - m.solid - ADDON_DIM.spring.preload + 1e-9) fail(`${tag}: travel would take the spring solid`);
    {
      // independent wire check at full squeeze: Wahl shear <= 45% of tensile strength (music wire fit)
      const d = SP.wire, D = SP.od - d, C = D / d;
      const Kw = (4 * C - 1) / (4 * C - 4) + 0.615 / C;
      const tau = (Kw * 8 * m.k * (m.travel + ADDON_DIM.spring.preload) * D) / (Math.PI * d ** 3);
      const limit = (0.45 * 2211) / d ** 0.145;
      if (tau > limit) fail(`${tag}: spring wire overloaded at full squeeze (${tau.toFixed(0)} MPa > ${limit.toFixed(0)} MPa)`);
    }
    for (const mk of R.marks) {
      if (!airAt(rig, [mk.x, R.inner + ADDON_DIM.rail.w / 2, ADDON_DIM.rail.h - 0.5], 0.4)) fail(`${tag}: ${mk.kg} kg mark missing on the rail`);
      const dx = (mk.kg * 9.81) / (m.count * m.k) - ADDON_DIM.spring.preload;
      if (Math.abs(R.xC0 - mk.x - dx) > 0.05) fail(`${tag}: ${mk.kg} kg mark is in the wrong place`);
    }
    // A8
    for (const it of R.screen.items) if (!it.ok) fail(`${tag}: strength screen: ${it.part} ${it.value} > ${it.allow} ${it.unit}`);
    console.log(`ok?  ${tag}: ${parts.length} pieces, ${R.xEnd.toFixed(0)} x ${(2 * R.outer).toFixed(0)} mm, palm ${R.Zp} mm, cord z ${R.Zc.toFixed(0)}, ${sp.totalKg.toFixed(0)} kg over ${sp.travel.toFixed(0)} mm`);
  }
}
{
  // A7 foot plate
  const P = footLayout();
  const [foot] = buildFoot(r, P);
  await stlCheck("foot", foot);
  if (P.gap < FOOT_W) fail(`foot plate: only ${P.gap} mm between the lugs, a foot needs ${FOOT_W}`);
  if (common(foot.shape, r.makeBox([0.5, -FOOT_W / 2, P.t + 0.1], [P.len - 0.5, FOOT_W / 2, P.t + 40])) > 0.5) fail("foot plate: something sticks up where the foot goes (the top must be smooth)");
  for (const k of [-1, 1]) {
    const yl = k * P.yLug;
    for (const dy of [-P.lugT / 2 + 0.6, 0, P.lugT / 2 - 0.6]) if (!airAt(foot.shape, [P.len / 2, yl + dy, P.zHole], 1)) fail(`foot plate: lug hole blocked at y=${(yl + dy).toFixed(0)}`);
    const zb = P.zHole + (P.holeD / 2) * Math.SQRT2 + P.over / 2;
    if (!solidAt(foot.shape, [P.len / 2, yl, zb], 1)) fail(`foot plate: no bridge above the lug hole at y=${yl.toFixed(0)}`);
  }
  // both cords: clear of the plate, and clear of the instep (or they'd press on the foot)
  const instep = r.makeBox([P.len / 2 - P.lugL / 2, -INSTEP.w / 2, P.ribTop], [P.len / 2 + P.lugL / 2, INSTEP.w / 2, P.ribTop + INSTEP.h]);
  for (const gh of footGhosts(r, P).ghosts.filter((q) => q.kind === "cord")) {
    const c = common(foot.shape, gh.shape);
    if (c > 0.5) fail(`foot plate: a cord rubs on the plate on its way up (${c.toFixed(0)} mm3)`);
    const f = common(instep, gh.shape);
    if (f > 0.5) fail(`foot plate: a cord presses on the top of the foot (${f.toFixed(0)} mm3); raise the meeting point`);
  }
  for (const it of P.screen.items) if (!it.ok) fail(`foot plate: strength screen: ${it.part} ${it.value} > ${it.allow}`);
  console.log(`ok?  foot plate: ${P.len} x ${P.width} mm, ${P.gap} mm for the foot, lug holes ${P.holeD} mm`);
}
if (validateSpring({ ...SPRING_DEFAULT, od: 7 }).length === 0) fail("a spring too small for the guide rod was accepted");
if (validateSpring({ ...SPRING_DEFAULT, count: 3 }).length === 0) fail("3 springs (lopsided) were accepted");
{
  // springs that pass the shop-size validator but can't fit the platform must be refused, not built broken
  const g = buildGripper(r, DEFAULT_HAND, { device: "fds", side: "right" });
  // 4 x 22 mm: fits across the rails, but the 2 x 2 block doesn't fit under the FDS cord line
  const tall = rigLayout(g.layout, g.info, { wire: 2.5, od: 22, length: 60, coils: 10, count: 4 });
  if (!tall.problems.some((p) => p.includes("under the cord line"))) fail("4 x 22 mm springs were laid out even though they can't fit under the cord line");
  // the validator stops at 30 mm OD; the layout must still refuse a carriage wider than the rails
  // (2 x 48 mm: carriage about 2 x 61.5 mm vs 2 x 60 mm between the rails)
  const fat = rigLayout(g.layout, g.info, { wire: 5, od: 48, length: 80, coils: 10, count: 2 });
  if (!fat.problems.some((p) => p.includes("too fat"))) fail("2 x 48 mm springs were laid out even though the carriage can't fit between the rails");
}
if (validateSpring(SPRING_DEFAULT).length) fail("the default spring was rejected: " + validateSpring(SPRING_DEFAULT)[0]);

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
