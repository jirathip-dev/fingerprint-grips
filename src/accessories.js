// Add-ons that turn a gripper into a trainer. Pure geometry + maths, shared by the
// browser worker and the Node checks (replicad is passed in, like model.js).
//
//   platform : one rig for a table or the floor (in the spirit of the Crimpdeq platform and
//              Crimpy). The gripper lies on its back between two rails and the cord runs
//              straight down the middle: gripper -> Tindeq bay -> spring carriage at the far end.
//              Compact: the springs sit beside the Tindeq, between a seat block on each rail and
//              the carriage just past the Tindeq. The carriage is always the anchor (a cord loop
//              round it, no knot); 4 sleeves on it stop it on the seat blocks at full squeeze.
//              Load it three ways, all with the same printed parts:
//                tindeq : Tindeq in the bay, its far eye to the carriage loop; no springs, so the
//                         carriage sits on its stops
//                springs: gripper cord straight to the carriage loop (no Tindeq)
//                both   : Tindeq in the bay AND springs: the Tindeq reads the spring force live
//              Brace it two ways: heel of the hand on the rest (palm push, on a table), or
//              feet flat against the rest's front face (leg push, on the floor; the cord
//              leaves through a closed hole low in the rest toward your hands; a strap
//              over your feet through two slots in the rest holds the front down).
//   foot     : a one-foot plate. A cord lug on each side of the foot; the two cords meet
//              above the foot at the Tindeq, so the pull stays centred under one foot.
//
// Platform frame: X along the pull, palm end at x = 0, anchor at the far end.
// Y across (+Y is the user's left when they sit at the palm end), Z up from the table.
// The gripper lies on its back: hand side up, finger entry facing the palm rest,
// cord holes facing the anchor.

/** Tindeq Progressor 200, measured from photos against a tape (about ±2 mm): 100 long,
 *  53-55 wide, 19 thick at the ends and 25 in the middle, eyes ~69 mm apart.
 *  Used only for clearances: nothing clamps the Tindeq, it hangs in line on its two eyes. */
export const TINDEQ = { length: 100, width: 55, thick: 25, eyeD: 17, eyePitch: 69 };

export const ADDON_DIM = {
  ledge: 12, // the gripper's back rests on two ledges this high: room under it for FDS tips
  ledgeIn: 7, // how far each ledge reaches under the gripper's end walls
  sideGap: 2, // gripper to rail, each side
  rail: { w: 18, h: 32 },
  // joints: one M5 x 30 bolt per rail across each cut, low down (the pull tries to open the joint
  // at the bottom). Head and nut sit in pockets open to the outside and the bed; wall = printed
  // material each side of the cut that the bolt clamps.
  joint: { z: 6, pocketW: 9.5, pocketH: 12, wall: 10, headPocket: 38, nutPocket: 12, bolt: 30 },
  palm: { root: 38, top: 18, arc: 7, hole: 12, drop: 3 }, // solid rest: base, top, rounding. hole = leg-push cord
  // tunnel (closed: the cord can't lift out), its centre `drop` below the cord line so the cord rides its roof on the line
  strap: { w: 27, h: 4.5, z: 14, edge: 3 }, // leg push: slots for a 25 mm strap over the feet (rowing-machine style)
  legAngle: 45, // leg push: design angle of the cord up to your hands (strength screen)
  legLift: 150, // preview only: hands this far above the cord line
  travel: 20, // the cord length sets where the gripper sits: 0-20 mm from the palm rest
  legReach: 260, // preview only: leg push, gripper this far in front of the rest (in your hands)
  cordGap: 12, // gripper top (at its furthest) to the Tindeq at its nearest (full squeeze, or on its stops): room for the knot
  maxPiece: 236, // longest printed piece (A1 bed is 256 mm)
  tindeq: { floor: 6, guideH: 14, guideT: 4, clear: 4 },
  // floor windows (weight): a ladder of cut-outs between cross ribs. A spine stays under the
  // cord and an edge strip along each side guide, so the Tindeq always rests on solid floor;
  // ribs keep the rails tied together; none within cutClear of a joint.
  windows: { len: 40, rib: 8, edge: 3, spine: 8, cutClear: 14 },
  // spring section beside the Tindeq. carriage cord: a loop through two holes and round a groove
  // on the back (a U, no knot on the carriage); uDy = hole offset from the cord line, uR = hole
  // radius. blockIn = seat blocks start this far from the cord line (clear of the Tindeq);
  // block + buttress = seat block thickness along the pull. endGap = Tindeq far end to the
  // carriage (the loop clips to its far eye). tail = guide bolt head + washer behind the carriage.
  // sleeveGap = stop sleeve to the spring's inside, all round.
  spring: { carriage: 18, preload: 1, uDy: 10, uR: 3.75, groove: 3.4, blockIn: 30.5, block: 12, buttress: 15, endGap: 10, tail: 7, sleeveGap: 0.5, seat: 1.5, rodHole: 2.75 }, // M5 guide bolts
  foot: { len: 230, width: 160, t: 11, lugL: 70, lugT: 20, holeD: 14, holeZ: 26, over: 18, apex: 250, footW: 110 },
};

export const LOADS = ["tindeq", "springs", "both"];

/** Loads the printed add-ons are screened for. Paper check only, not a tested rating. */
export const RATING = { platform: 60, foot: 100 }; // kg
export const DESIGN_FACTOR = 2;
/** Allowable stress for PETG prints (MPa). Assumptions: they need coupon tests. */
export const ALLOW = { inLayer: 20, acrossLayer: 6, compression: 25, boltN: 4000 /* M5 8.8, about half proof */ };

// ---------------------------------------------------------------- springs
export const SPRING_FIELDS = {
  wire: { label: "Wire", help: "Wire thickness (d)", min: 0.8, max: 4, step: 0.1 },
  od: { label: "Outer Ø", help: "Outside diameter of the coil (OD)", min: 8, max: 30, step: 0.5 },
  length: { label: "Length", help: "Free length, not squeezed", min: 25, max: 90, step: 1 },
  coils: { label: "Coils", help: "Total number of turns, counting the closed ends", min: 4, max: 30, step: 0.5 },
};
export const SPRING_DEFAULT = { wire: 2, od: 16, length: 50, coils: 8, count: 2 };

/**
 * Helical compression spring (closed and ground ends, carbon spring steel).
 * Rate: k = G d^4 / (8 D^3 n_active). Usable travel is the smaller of what the length
 * allows (down to solid) and what the wire allows (Wahl-corrected shear at 40% of the
 * wire's tensile strength, Shigley music-wire fit; cheap springs are weaker, so this is generous).
 */
export function springMath(sp) {
  const S = ADDON_DIM.spring;
  const d = +sp.wire, OD = +sp.od, L0 = +sp.length, nt = +sp.coils, count = +sp.count;
  const D = OD - d; // mean coil diameter
  const na = nt - 2;
  const k = (79300 * d ** 4) / (8 * D ** 3 * na); // N/mm
  const C = D / d;
  const Kw = (4 * C - 1) / (4 * C - 4) + 0.615 / C;
  const Sut = 2211 / d ** 0.145; // MPa
  const Fwire = (0.4 * Sut * Math.PI * d ** 3) / (8 * D * Kw); // N per spring before it takes a set
  const solid = nt * d;
  const byLength = L0 - S.preload - solid - 1; // keep 1 mm off solid
  const byWire = Fwire / k - S.preload;
  const travel = Math.max(0, Math.min(byLength, byWire));
  const perSpring = k * (travel + S.preload);
  const total = count * perSpring;
  return {
    d, OD, ID: OD - 2 * d, L0, count, k, C, solid, travel, limitedBy: byWire < byLength ? "wire" : "length",
    totalN: total, totalKg: total / 9.81, kgPerMm: (count * k) / 9.81,
  };
}

export function validateSpring(sp) {
  const problems = [];
  for (const [key, f] of Object.entries(SPRING_FIELDS)) {
    const v = Number(sp?.[key]);
    if (!Number.isFinite(v)) problems.push(`Spring ${f.label.toLowerCase()} is not a number.`);
    else if (v < f.min || v > f.max) problems.push(`Spring ${f.label.toLowerCase()} should be ${f.min}–${f.max} (got ${v}).`);
  }
  if (![2, 4].includes(Number(sp?.count))) problems.push("Use 2 or 4 springs.");
  if (problems.length) return problems;
  const m = springMath(sp);
  if (m.C < 4 || m.C > 14) problems.push(`That spring is too ${m.C < 4 ? "tight" : "loose"} a coil (OD ÷ wire should be about 5–15). Check the wire and OD.`);
  if (m.ID < 10) problems.push(`Inner diameter ${m.ID.toFixed(1)} mm is too small: an M5 guide bolt and a printed stop sleeve go inside (needs 10 mm or more).`);
  if (Number(sp.coils) - 2 < 2) problems.push("Too few coils: a spring needs at least 4 turns.");
  if (m.travel < 5) problems.push(`That spring only gives ${m.travel.toFixed(1)} mm of travel. Use a longer spring or fewer, thicker coils.`);
  return problems;
}

// ---------------------------------------------------------------- shared helpers
const SQ = Math.SQRT1_2;
const box = (r, x0, x1, y0, y1, z0, z1) => r.makeBox([x0, y0, z0], [x1, y1, z1]);
const prismY = (d, y0, y1) => d.sketchOnPlane("XZ", -y1).extrude(y1 - y0); // XZ drawing -> y in [y0, y1]
const prismX = (d, x0, x1) => d.sketchOnPlane("YZ", x0).extrude(x1 - x0); // YZ drawing -> x in [x0, x1]
/** Teardrop hole profile, point up, so a horizontal hole prints without support. */
const teardrop = (r, u, v, rad) =>
  r
    .drawCircle(rad)
    .fuse(r.draw([-rad * SQ, rad * SQ]).lineTo([0, rad * Math.SQRT2]).lineTo([rad * SQ, rad * SQ]).lineTo([0, 0]).close())
    .translate([u, v]);
const poly = (r, pts) => {
  let d = r.draw(pts[0]);
  for (const p of pts.slice(1)) d = d.lineTo(p);
  return d.close();
};
const round1 = (v) => Math.round(v * 10) / 10;

/** Lay a gripper part on its back in the rig: gripper (x, y, z) -> rig (z - zBottom + x0, W/2 - x, zl - y). */
export function placeInRig(shape, L, zl, x0) {
  return shape.rotate(-90, [0, 0, 0], [1, 0, 0]).rotate(-90, [0, 0, 0], [0, 0, 1]).translate([x0 - L.zBottom, L.width / 2, zl]);
}

// ---------------------------------------------------------------- layouts (plain numbers)
/** One platform for every load. gL = gripper layout, gInfo = gripper summary (built coords,
 *  already mirrored for the hand). The spring section is sized for `spring` (use the
 *  default if no springs are fitted yet: those sizes then fit later). */
export function rigLayout(gL, gInfo, spring = SPRING_DEFAULT) {
  const A = ADDON_DIM, T = A.tindeq, S = A.spring;
  const Wg = gL.width, Dg = -gL.yF, Hg = gL.zTop - gL.zBottom;
  const inner = Wg / 2 + A.sideGap;
  const outer = inner + A.rail.w;
  const zl = A.ledge;
  const Zc = zl + Dg / 2; // cord line: halfway through the gripper's depth
  const Yc = Wg / 2 - gInfo.cord.x; // cord centre across the platform
  const R = { kind: "platform", Wg, Dg, Hg, inner, outer, zl, Zc, Yc, Zp: palmHeight(gL, zl), xPalm: A.palm.root, problems: [] };
  R.xBayEnd = R.xPalm + A.travel + Hg; // gripper top at its furthest from the palm
  R.gripperX0 = R.xPalm + A.travel / 2; // preview position
  R.railY = [-1, 1].map((k) => k * (inner + A.rail.w / 2));
  const m = springMath(spring);

  // Tindeq bay. With springs fitted, everything in line moves toward you by the spring travel,
  // so the bay starts that much further out: the Tindeq's run never reaches the gripper bay.
  R.xT0 = R.xBayEnd + A.cordGap + m.travel; // Tindeq near end, at rest
  R.tindeqRun = [R.xT0 - m.travel, R.xT0 + TINDEQ.length];
  R.guideY = [Yc - TINDEQ.width / 2 - T.clear - T.guideT, Yc + TINDEQ.width / 2 + T.clear];
  R.guideTop = Math.max(T.floor + T.guideH, Zc - 4);

  // leg push: closed cord tunnel low in the rest + strap slots each side of it
  const P = A.palm, slope = (z) => (z * (P.root - P.top)) / (R.Zp - P.arc); // x of the rest's front face at height z
  const hz = Zc - P.drop, hr = P.hole / 2;
  R.legHole = { z: hz, r: hr, xMouth: slope(hz + hr), roof: round1(R.Zp - P.arc / 2 - (hz + hr * Math.SQRT2)) };
  R.legHole.len = P.root - R.legHole.xMouth;
  const St = A.strap;
  R.strap = { y: [inner - St.edge - St.w, inner - St.edge], z: [St.z, St.z + St.h], xFront: slope(St.z + St.h) };
  if (R.strap.z[1] > hz - hr - 3) R.problems.push("No room for the strap slots under the leg-push cord hole.");
  if (R.legHole.roof < 6) R.problems.push("The palm rest is too low over the leg-push cord hole.");

  // spring section, beside the Tindeq: the carriage sits just past the Tindeq's far end and
  // the springs run back from it, a pair each side of the Tindeq, to a seat block on each rail.
  // The Tindeq and the carriage move together, so the gap between them never changes.
  // Always a 2 x 2 set of seats, so the same print takes 2 or 4 springs; 2 go on a diagonal.
  const off = S.blockIn + 3 + m.OD / 2; // spring centre from the cord line
  const dz = m.OD / 2 + 2;
  const ys = [Yc - off, Yc + off];
  const pos = ys.flatMap((y) => [{ y, z: Zc - dz }, { y, z: Zc + dz }]);
  const used = m.count === 4 ? pos : [pos[0], pos[3]];
  R.spring = { ...m, ys, pos, used, rest: m.L0 - S.preload };
  R.xC0 = R.xT0 + TINDEQ.length + S.endGap;
  R.xC1 = R.xC0 + S.carriage;
  R.xEnd = R.xC1 + S.tail;
  // seat blocks' far face. Each spring sits in a seat recess in the block and in the carriage,
  // so seat bottom to seat bottom is the spring's preloaded length (rest)
  R.xS1 = R.xC0 - R.spring.rest + 2 * S.seat;
  R.xS0 = R.xS1 - S.block;
  R.uY = [Yc - S.uDy, Yc + S.uDy];
  // where the loop's end sits at rest: in the empty bay (springs only), at the Tindeq's far eye
  const eye = R.xT0 + TINDEQ.length / 2 + TINDEQ.eyePitch / 2;
  R.loopEnd = { springs: R.xT0 + 20, both: eye, tindeq: eye };
  R.carriageY = [Yc - off - m.OD / 2 - 3, Yc + off + m.OD / 2 + 3];
  const zs = pos.map((q) => q.z);
  R.carriageZ = [Math.min(...zs) - m.OD / 2 - 6, Math.max(...zs) + m.OD / 2 + 6];
  if (R.carriageY[0] < -inner + 0.5 || R.carriageY[1] > inner - 0.5)
    R.problems.push(`Those springs are too fat for this platform (${m.OD} mm OD). Use a smaller outer diameter.`);
  if (R.carriageZ[0] < 7) R.problems.push(`Springs of ${m.OD} mm OD don't fit under the cord line (the platform always has room for 4). Use a smaller OD.`);
  // stop sleeves: one inside each spring, on the carriage. At full squeeze (or with no springs,
  // Tindeq only) they land on the seat blocks, before the springs go solid.
  R.sleeve = { r: m.ID / 2 - S.sleeveGap, len: R.spring.rest - m.travel };
  if (R.sleeve.r < S.rodHole + 1.5) R.problems.push(`Springs need an inner Ø of at least ${2 * (S.rodHole + 1.5 + S.sleeveGap)} mm (a stop sleeve goes inside them).`);
  R.blockTop = Math.max(Zc + dz + m.OD / 2 + 4, A.rail.h);
  // 5 kg marks on the rail tops: where the carriage's front face sits at each load (sight across).
  // One rail is marked for 2 springs, the other for 4. Marks go by position, so they stay right
  // when the springs are pre-tensioned with the nuts.
  R.marks = [];
  for (const [n, rail] of [[2, 1], [4, -1]])
    for (let kg = 5; ; kg += 5) {
      const dx = (kg * 9.81) / (n * m.k) - S.preload;
      if (dx > m.travel) break;
      if (dx > 0.5) R.marks.push({ kg, x: R.xC0 - dx, n, rail });
    }
  R.spring.kg2 = springMath({ ...spring, count: 2 }).totalKg;
  R.spring.kg4 = springMath({ ...spring, count: 4 }).totalKg;
  // joints: the head pocket reaches past the cut, so keep the whole joint inside one open stretch
  const J = A.joint;
  const before = J.wall + J.headPocket + 2, after = J.wall + J.nutPocket + 2;
  R.cuttable = [[R.xPalm + 5, R.xBayEnd - 5], [R.tindeqRun[0] + 8, R.xS0 - S.buttress - 2]]
    .map(([a, b]) => [a + before, b - after]).filter(([a, b]) => b > a);
  R.pieces = splitPieces(R.xEnd, R.cuttable, A.maxPiece);
  R.cuts = R.pieces.slice(1).map(([x0]) => x0);
  R.boltY = [-1, 1].map((k) => k * (outer - J.pocketW / 2)); // bolt line, inside each rail
  R.windows = floorWindows(R);
  // spring guides: M5 bolt, head + washer behind the carriage (it holds the carriage at rest),
  // through carriage + sleeve + spring + seat block, washer + nut on the block's near face
  // (tighten it to preload). Shop length: carriage back to block front + washer, nut, 2 threads.
  R.guideBolt = [60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200].find((n) => n >= R.xC1 - R.xS0 + 8) ?? null;
  if (!R.guideBolt) R.problems.push(`Those springs are too long for a stock M5 bolt (needs ${Math.ceil(R.xC1 - R.xS0 + 8)} mm). Use shorter springs.`);
  R.screen = screenRig(R);
  return R;
}

/** Floor windows: a ladder along the floor (Tindeq bay + spring section), cross ribs between,
 *  a spine under the cord, kept off the side guides, the seat blocks and the joints. */
export function floorWindows(R) {
  const A = ADDON_DIM, W = A.windows, T = A.tindeq, S = A.spring;
  const gIn = A.tindeq.clear + TINDEQ.width / 2; // side guides' inner faces, from the cord line
  const gOut = gIn + T.guideT;
  // y bands (absolute): inside the guides each side of the spine, and outside the guides up to
  // the rails (the seat blocks sit on the floor there, so those stop short of the blocks)
  const bandsIn = [[R.Yc + W.spine / 2, R.Yc + gIn - W.edge], [R.Yc - gIn + W.edge, R.Yc - W.spine / 2]];
  const bandsOut = [[R.Yc + gOut + W.edge, R.inner - W.edge], [-R.inner + W.edge, R.Yc - gOut - W.edge]];
  const x0 = R.tindeqRun[0] - 4 + W.edge, xEnd = R.xC1 - W.edge;
  const xBlock0 = R.xS0 - S.buttress - W.edge, xBlock1 = R.xS1 + W.edge;
  const avoid = R.cuts.map((c) => [c - W.cutClear, c + W.cutClear]);
  const out = [];
  const lay = (a, b, bands) => {
    const n = Math.max(1, Math.ceil((b - a + W.rib) / (W.len + W.rib))); // windows at most W.len long
    const len = (b - a - (n - 1) * W.rib) / n;
    if (len < 12) return;
    for (let i = 0; i < n; i++) {
      const xa = a + i * (len + W.rib), xb = xa + len;
      for (const [y0, y1] of bands) if (y1 - y0 >= 8) out.push({ x0: xa, x1: xb, y0, y1 });
    }
  };
  // stretches of floor between the joints
  const spans = (a, b) => {
    let segs = [[a, b]];
    for (const [c0, c1] of avoid) segs = segs.flatMap(([s0, s1]) => (c1 <= s0 || c0 >= s1 ? [[s0, s1]] : [[s0, c0], [c1, s1]].filter(([p, q]) => q - p > 12)));
    return segs;
  };
  for (const [a, b] of spans(x0, xEnd)) lay(a, b, bandsIn); // inside the guides, the whole floor
  for (const [a, b] of spans(x0, xBlock0)) lay(a, b, bandsOut); // outside them, up to the seat blocks
  for (const [a, b] of spans(xBlock1, xEnd)) lay(a, b, bandsOut); // and between the blocks and the carriage end
  return out;
}

/** Palm rest height: the middle of the middle finger's way in (between the roller front and the
 *  gripper's hand-side face, which lies on top), so the heel and the fingers pull in line. */
export function palmHeight(gL, zl) {
  const mid = gL.slots.find((s) => s.name === "middle");
  return Math.round(zl + (-mid.yFront - gL.yF) / 2);
}

/** Split [0, xEnd] into the fewest pieces <= maxLen, cutting only inside the allowed ranges. */
function splitPieces(xEnd, cuttable, maxLen) {
  for (let n = 1; n <= 4; n++) {
    const cuts = [];
    let ok = true;
    for (let i = 1; i < n; i++) {
      const want = (xEnd * i) / n;
      let best = null;
      for (const [a, b] of cuttable) {
        const c = Math.min(b, Math.max(a, want));
        if (best === null || Math.abs(c - want) < Math.abs(best - want)) best = c;
      }
      cuts.push(best);
    }
    const edges = [0, ...cuts, xEnd];
    for (let i = 0; i < edges.length - 1; i++) if (edges[i + 1] - edges[i] > maxLen || edges[i + 1] <= edges[i]) ok = false;
    if (ok) return edges.slice(0, -1).map((x0, i) => [x0, edges[i + 1]]);
  }
  return null;
}

/** Hand-calc stress screen at the design load. Returns [{part, mpa, allow, ok}].
 *  Rated for the Tindeq rating or the full spring load, whichever is higher: once the carriage
 *  hits its stops, the rest of the pull goes through the stop sleeves into the seat blocks. Leg push loads the same
 *  path as palm push, but lower down, so the palm case covers it. */
function screenRig(R) {
  const A = ADDON_DIM;
  const kg = Math.max(RATING.platform, R.spring.kg4); // 4 springs can always be fitted
  const F = kg * 9.81 * DESIGN_FACTOR;
  const zLoad = Math.max(R.Zc, R.Zp);
  const out = [];
  const add = (part, mpa, allow, unit = "MPa") => out.push({ part, value: round1(mpa), allow, unit, ok: mpa <= allow });
  const w = A.rail.w, h = A.rail.h;
  add("rails (bending)", (F * (zLoad - h / 2)) / ((2 * w * h * h) / 6) + F / (2 * w * h), ALLOW.inLayer);
  // rail at a bolt pocket: the pocket takes a corner out of the section
  const J = A.joint, pw = J.pocketW, ph = J.pocketH;
  const Ap = (w - pw) * ph + w * (h - ph);
  const zp = ((w - pw) * ph * (ph / 2) + w * (h - ph) * ((h + ph) / 2)) / Ap;
  const Ip = ((w - pw) * ph ** 3) / 12 + (w - pw) * ph * (ph / 2 - zp) ** 2 + (w * (h - ph) ** 3) / 12 + w * (h - ph) * ((h + ph) / 2 - zp) ** 2;
  add("rails at the bolt pockets", ((F / 2) * (zLoad - zp) * zp) / Ip + F / 2 / Ap, ALLOW.inLayer);
  // joint: pressed together at the top, held by the bolt at the bottom
  const c = 0.6 * (h - J.z);
  const C = ((F / 2) * (zLoad - J.z)) / (h - c / 3 - J.z);
  add("joint bolt pull (each)", C - F / 2, ALLOW.boltN, "N");
  add("joint top (compression)", (2 * C) / (w * c), ALLOW.compression);
  const b = 2 * R.outer;
  add("palm rest root", (6 * F * R.Zp) / ((b - A.palm.hole) * A.palm.root ** 2), ALLOW.acrossLayer);
  // leg push: the cord rises to your hands and presses up on the tunnel roof. Roof = a beam
  // across the hole, as long as the tunnel, thickness at the middle of the rounded top.
  {
    const H = R.legHole, up = F * Math.sin((A.legAngle * Math.PI) / 180);
    add("leg-push hole roof (bending)", (6 * ((up * 2 * H.r) / 4)) / (H.len * H.roof ** 2), ALLOW.inLayer);
    add("leg-push hole roof (layer shear)", (1.5 * (up / 2)) / (H.len * H.roof), ALLOW.acrossLayer);
  }
  // carriage: the cord loop pulls the web between its two holes forward, a beam over the
  // holes; the carriage prints standing, so this bends along the layers
  {
    // web = the strip between the two holes; it spans the hole height (top and bottom are the
    // full carriage). The carriage prints standing (layers across the pull), so its shear runs
    // across the layers: the tightest item, kept under the across-layer limit.
    const S = A.spring, web = 2 * (S.uDy - S.uR), d = S.carriage - S.groove, span = 2 * S.uR;
    add("carriage web between the cord holes (bending)", (6 * ((F * span) / 8)) / (web * d ** 2), ALLOW.inLayer);
    add("carriage web (layer shear)", (1.5 * (F / 2)) / (web * d), ALLOW.acrossLayer);
    add("carriage web (cord pressing on it)", F / (web * 6), ALLOW.compression);
    // whole carriage: pulled in the middle, held by the springs out to each side
    const arm = Math.abs(R.spring.ys[1] - R.Yc), hC = R.carriageZ[1] - R.carriageZ[0];
    add("carriage bending between the springs", ((F / 2) * arm) / ((hC * d ** 2) / 6), ALLOW.inLayer);
  }
  // seat blocks: each takes half the pull at about cord height, pushing toward you. Root =
  // block + buttress, from the Tindeq side out to the outside of the rail; bends across layers.
  {
    const S = A.spring, bB = R.outer - S.blockIn - Math.abs(R.Yc), tB = S.block + S.buttress;
    add("spring seat blocks root", (6 * (F / 2) * R.Zc) / (bB * tB * tB), ALLOW.acrossLayer);
    // stops: the carriage lands on its 4 sleeves (printed upright: squeezed along the layers)
    const As = 4 * Math.PI * (R.sleeve.r ** 2 - S.rodHole ** 2);
    add("carriage stop sleeves (compression)", F / As, ALLOW.compression);
  }
  return { kg: round1(kg), forceN: round1(F), items: out };
}

/** One-foot plate: a lug on each long edge, the foot stands between them. A cord from each lug
 *  meets the other at the Tindeq's lower eye, `apex` mm above the plate (or higher). */
export function footLayout() {
  const P = ADDON_DIM.foot;
  const F = RATING.foot * 9.81 * DESIGN_FACTOR;
  const yLug = P.width / 2 - P.lugT / 2;
  const gap = P.width - 2 * P.lugT; // room for the foot between the lugs
  const ribTop = P.t; // smooth top: no ribs, the plate is just thicker
  const zHole = P.t + P.holeZ;
  const lugTop = zHole + (P.holeD / 2) * Math.SQRT2 + P.over; // the cord wraps this bridge and leaves from here
  const tanT = yLug / P.apex; // each cord's angle from vertical
  const Pv = F / 2; // per lug, up
  const Ph = Pv * tanT; // per lug, sideways toward the foot
  const Pc = Pv / Math.cos(Math.atan(tanT)); // per lug, along the cord
  const items = [];
  const add = (part, mpa, allow) => items.push({ part, value: round1(mpa), allow, unit: "MPa", ok: mpa <= allow });
  // plate bends across, between the lugs: foot load ~25 mm either side of the middle.
  // Smooth solid plate. Effective width: the lug plus a 45° spread.
  const lever = yLug - 25;
  const beff = Math.min(P.len, P.lugL + 2 * lever);
  const I = (beff * P.t ** 3) / 12;
  const cMax = P.t / 2;
  add("plate bending (between the lugs)", (Pv * lever * cMax) / I, ALLOW.inLayer);
  add("lug legs (across layers)", Pv / (2 * P.lugT * (P.lugL / 2 - P.holeD / 2)), ALLOW.acrossLayer);
  add("lug root (pull + sideways)", Pv / (P.lugL * P.lugT) + (6 * Ph * P.holeZ) / (P.lugL * P.lugT ** 2), ALLOW.acrossLayer);
  add("bridge over the hole (bending)", (6 * ((Pc * P.holeD) / 8)) / (P.lugT * P.over ** 2), ALLOW.inLayer);
  add("bridge over the hole (layer shear)", (1.5 * (Pc / 2)) / (P.lugT * P.over), ALLOW.acrossLayer);
  return { ...P, yLug, gap, ribTop, zHole, lugTop, screen: { kg: RATING.foot, forceN: round1(F), items }, pieces: [[0, P.len]] };
}

// ---------------------------------------------------------------- solids
/** Platform pieces, already split for the bed. Each prints as it lies (flat side down). */
export function buildRig(r, R) {
  const A = ADDON_DIM, T = A.tindeq, S = A.spring, sp = R.spring;
  const { inner, outer, zl } = R;
  let body = box(r, 0, R.xEnd, inner, outer, 0, A.rail.h).fuse(box(r, 0, R.xEnd, -outer, -inner, 0, A.rail.h));
  // ledges the gripper's back rests on
  const lIn = R.Wg / 2 - A.ledgeIn;
  body = body.fuse(box(r, R.xPalm, R.xBayEnd + 3, lIn, inner + 0.5, 0, zl)).fuse(box(r, R.xPalm, R.xBayEnd + 3, -inner - 0.5, -lIn, 0, zl));
  // palm rest: solid, full width. Heel of the hand on the sloped front (palm push) or the
  // soles of your feet (leg push); rounded top so the wrist can wrap over it.
  const P = A.palm;
  const zT = R.Zp;
  const palmProf = r.draw([0, 0]).lineTo([P.root, 0]).lineTo([P.root, zT - P.arc]).threePointsArcTo([P.root - P.top, zT - P.arc], [P.root - P.top / 2, zT]).close();
  body = body.fuse(prismY(palmProf, -outer, outer));
  // floor under the Tindeq bay and the spring section ties the rails together
  body = body.fuse(box(r, R.tindeqRun[0] - 4, R.xEnd, -inner - 0.5, inner + 0.5, 0, T.floor));
  // side guides: the Tindeq hangs in line on the cord; they only catch it when it's slack
  // (up to the seat blocks; past them the blocks' inner faces do the same job)
  for (const y0 of R.guideY) body = body.fuse(box(r, R.tindeqRun[0] - 4, R.xS0 + 0.5, y0, y0 + T.guideT, T.floor - 0.5, R.guideTop));
  // spring seat blocks, one on each rail beside the Tindeq, each with a buttress on its near side
  for (const [y0, y1] of [[-outer, R.Yc - S.blockIn], [R.Yc + S.blockIn, outer]]) {
    body = body.fuse(box(r, R.xS0, R.xS1, y0, y1, 0, R.blockTop));
    body = body.fuse(prismY(poly(r, [[R.xS0 - S.buttress, 0], [R.xS0 + 0.5, 0], [R.xS0 + 0.5, S.buttress]]), y0, y1));
  }

  const tools = [];
  // leg-push cord tunnel through the palm rest (closed: the cord can't lift out of it), with a
  // 45° flared mouth on the front so the cord bends round a smooth edge, not a sharp one
  const H = R.legHole;
  tools.push(prismX(teardrop(r, R.Yc, H.z, H.r), -1, P.root + 1));
  tools.push(coneX(r, H.xMouth - 2, H.r + 8, H.xMouth + 6, H.r, R.Yc, H.z));
  // strap slots, one each side, front face to back face
  for (const k of [-1, 1]) tools.push(box(r, -1, P.root + 1, k > 0 ? R.strap.y[0] : -R.strap.y[1], k > 0 ? R.strap.y[1] : -R.strap.y[0], R.strap.z[0], R.strap.z[1]));
  for (const { y, z } of sp.pos) {
    tools.push(prismX(teardrop(r, y, z, S.rodHole), R.xS0 - 1, R.xS1 + 1));
    tools.push(r.makeCylinder(sp.OD / 2 + 0.6, S.seat + 0.5, [R.xS1 - S.seat, y, z], [1, 0, 0])); // spring seat
  }
  for (const m of R.marks) {
    const w = m.kg % 10 === 0 ? 2.4 : 1.2;
    tools.push(box(r, m.x - w / 2, m.x + w / 2, m.rail > 0 ? inner : -outer, m.rail > 0 ? outer : -inner, A.rail.h - 1.2, A.rail.h + 1));
  }
  for (const w of R.windows) tools.push(box(r, w.x0, w.x1, w.y0, w.y1, -1, T.floor + 0.5));
  // joint bolts: hole across each cut, head pocket on the near piece, nut pocket on the far one
  const J = A.joint;
  for (const xc of R.cuts)
    for (const yb of R.boltY) {
      const k = Math.sign(yb), yo = k * outer, yi = yo - k * J.pocketW;
      tools.push(prismX(teardrop(r, yb, J.z, 2.75), xc - J.wall - 1, xc + J.wall + 1));
      tools.push(box(r, xc - J.wall - J.headPocket, xc - J.wall, Math.min(yo, yi) - (k < 0 ? 1 : 0), Math.max(yo, yi) + (k > 0 ? 1 : 0), -1, J.pocketH));
      tools.push(box(r, xc + J.wall, xc + J.wall + J.nutPocket, Math.min(yo, yi) - (k < 0 ? 1 : 0), Math.max(yo, yi) + (k > 0 ? 1 : 0), -1, J.pocketH));
    }
  for (const t of tools) body = body.cut(t);

  const parts = R.pieces.map(([x0, x1], i) => ({
    name: `platform_${i + 1}`,
    kind: "addon",
    print: "flat",
    shape: body.clone().intersect(box(r, x0, x1, -outer - 1, outer + 1, -1, 500)),
  }));
  parts.push({ name: "spring_carriage", kind: "addon", print: "standing", shape: buildCarriage(r, R) });
  return parts;
}

/** Cord between two points (a straight rod, r 2.5), for the preview and the checks. */
export function cordSeg(r, a, b, rad = 2.5) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], n = Math.hypot(...d);
  return r.makeCylinder(rad, n, a, d.map((v) => v / n));
}

/** The carriage loop: from its end (where the gripper cord or the Tindeq's far eye clips) into
 *  one carriage hole, round the groove on the back and out the other: a U.
 *  `dx` moves the carriage end toward the wall (spring squeeze). Returns cord solids. */
export function loopCord(r, R, load, dx = 0, rad = 2.5) {
  const xL = R.loopEnd[load] - dx, x0 = R.xC0 - dx, x1 = R.xC1 - dx, z = R.Zc;
  const out = [];
  for (const y of R.uY) {
    out.push(cordSeg(r, [xL, R.Yc, z], [x0, y, z], rad));
    out.push(cordSeg(r, [x0, y, z], [x1 + 0.5, y, z], rad));
  }
  out.push(cordSeg(r, [x1 + 0.5, R.uY[0] - rad, z], [x1 + 0.5, R.uY[1] + rad, z], rad));
  return out;
}

/** Solid cone along X from radius r0 at x0 to r1 at x1, on the line (y, z). */
function coneX(r, x0, r0, x1, r1, y, z) {
  const d = r.draw([x0, 0]).lineTo([x0, r0]).lineTo([x1, r1]).lineTo([x1, 0]).close();
  return d.sketchOnPlane("XY").revolve([1, 0, 0], { origin: [0, 0, 0] }).translate([0, y, z]);
}

function buildCarriage(r, R) {
  const S = ADDON_DIM.spring, sp = R.spring;
  let c = box(r, R.xC0, R.xC1, R.carriageY[0], R.carriageY[1], R.carriageZ[0], R.carriageZ[1]);
  // cord loop: in one hole, round the groove on the back, out the other (a U, no knot here).
  // Flared both ends so the cord never bends round a sharp edge.
  for (const y of R.uY) {
    c = c.cut(r.makeCylinder(S.uR, S.carriage + 2, [R.xC0 - 1, y, R.Zc], [1, 0, 0]));
    c = c.cut(coneX(r, R.xC0 - 0.5, S.uR + 1.5, R.xC0 + 1, S.uR, y, R.Zc));
    c = c.cut(coneX(r, R.xC1 - 3, S.uR, R.xC1 + 0.5, S.uR + 3.5, y, R.Zc));
  }
  c = c.cut(r.makeCylinder(S.groove, R.uY[1] - R.uY[0], [R.xC1, R.uY[0], R.Zc], [0, 1, 0]));
  // spring seats, a stop sleeve standing in each (inside the spring), guide bolt hole through
  const Sv = R.sleeve;
  for (const { y, z } of sp.pos) {
    c = c.cut(r.makeCylinder(sp.OD / 2 + 0.6, S.seat + 0.5, [R.xC0 - 0.5, y, z], [1, 0, 0]));
    c = c.fuse(r.makeCylinder(Sv.r, Sv.len + 0.2, [R.xC0 + S.seat - Sv.len, y, z], [1, 0, 0])); // tip lands on the block's seat
    c = c.cut(r.makeCylinder(S.rodHole, S.carriage + Sv.len + 2, [R.xC0 + S.seat - Sv.len - 1, y, z], [1, 0, 0]));
  }
  return c;
}

export function buildFoot(r, P = footLayout()) {
  let s = box(r, 0, P.len, -P.width / 2, P.width / 2, 0, P.t);
  // a lug on each long edge, mid-length (beside the arch / ankle), hole across it, point up
  const x0 = P.len / 2 - P.lugL / 2, x1 = P.len / 2 + P.lugL / 2;
  const rr = P.holeD / 2;
  const hTop = P.holeZ + rr * Math.SQRT2 + P.over;
  const lug = poly(r, [[x0, P.t - 0.5], [x1, P.t - 0.5], [x1, P.t + P.holeZ], [P.len / 2 + 14, P.t + hTop], [P.len / 2 - 14, P.t + hTop], [x0, P.t + P.holeZ]]);
  for (const k of [-1, 1]) {
    const y0 = k * P.yLug - P.lugT / 2, y1 = k * P.yLug + P.lugT / 2;
    s = s.fuse(prismY(lug, y0, y1));
    s = s.cut(prismY(teardrop(r, P.len / 2, P.zHole, rr), y0 - 1, y1 + 1));
  }
  return [{ name: "foot_plate", kind: "addon", print: "flat", shape: s }];
}

/** Reference-only solids (not printed) for the preview and the checks: the Tindeq and/or
 *  springs + guide rods, depending on how the platform is loaded. */
export function rigGhosts(r, R, load = "both") {
  const out = [], S = ADDON_DIM.spring;
  if (load !== "springs") {
    const T = TINDEQ;
    const x0 = R.xT0;
    let t = box(r, x0, x0 + T.length, R.Yc - T.width / 2, R.Yc + T.width / 2, R.Zc - T.thick / 2, R.Zc + T.thick / 2);
    for (const k of [-1, 1]) t = t.cut(r.makeCylinder(T.eyeD / 2, T.thick + 2, [x0 + T.length / 2 + (k * T.eyePitch) / 2, R.Yc, R.Zc - T.thick / 2 - 1], [0, 0, 1]));
    out.push({ name: "tindeq", kind: "ghost", shape: t });
  }
  // guide bolts always hold the carriage (Tindeq only: 2, no springs)
  const sp = R.spring;
  for (const { y, z } of sp.used) {
    if (load !== "tindeq") {
      const x0 = R.xS1 - S.seat; // seat bottom in the block
      const tube = r.makeCylinder(sp.OD / 2, sp.rest, [x0, y, z], [1, 0, 0]).cut(r.makeCylinder(sp.ID / 2, sp.rest + 2, [x0 - 1, y, z], [1, 0, 0]));
      out.push({ name: "spring", kind: "spring", shape: tube });
    }
    out.push({ name: "guide_rod", kind: "steel", shape: r.makeCylinder(2, R.guideBolt, [R.xC1 + 1 - R.guideBolt, y, z], [1, 0, 0]) });
  }
  return out;
}

/** Foot plate preview: the two cords from the lugs up to the Tindeq's lower eye, the Tindeq
 *  stood on end, and the gripper upside down above it (cord holes down). */
export function footGhosts(r, P = footLayout()) {
  const T = TINDEQ;
  const zEye = P.t + P.apex;
  const z0 = zEye - (T.length - T.eyePitch) / 2;
  let t = box(r, P.len / 2 - T.width / 2, P.len / 2 + T.width / 2, -T.thick / 2, T.thick / 2, z0, z0 + T.length);
  for (const k of [-1, 1]) {
    const ze = z0 + T.length / 2 + (k * T.eyePitch) / 2;
    t = t.cut(r.makeCylinder(T.eyeD / 2, T.thick + 2, [P.len / 2, -T.thick / 2 - 1, ze], [0, 1, 0]));
  }
  const ghosts = [{ name: "tindeq", kind: "ghost", shape: t }];
  for (const k of [-1, 1]) {
    // cord 5 mm thick, lying on the bridge over the hole, straight up to the Tindeq's lower eye
    const z0 = P.lugTop + 2.5;
    const dy = -k * P.yLug, dz = zEye - z0;
    const L = Math.hypot(dy, dz);
    ghosts.push({ name: "cord", kind: "cord", shape: r.makeCylinder(2.5, L, [P.len / 2, k * P.yLug, z0], [0, dy / L, dz / L]) });
  }
  // top eye -> gripper (preview only)
  const zTopEye = z0 + T.length / 2 + T.eyePitch / 2;
  ghosts.push({ name: "cord", kind: "cord", shape: r.makeCylinder(2.5, z0 + T.length + 45 - zTopEye, [P.len / 2, 0, zTopEye], [0, 0, 1]) });
  return { ghosts, gripperTop: z0 + T.length + 45 };
}

/** Place a gripper part upside down above the foot plate, cord centre over the fin. */
export function placeOverFoot(shape, L, cordX, zTopAt, P = footLayout()) {
  return shape.rotate(180, [0, 0, 0], [1, 0, 0]).translate([P.len / 2 - cordX, L.yF / 2, zTopAt + L.zTop]);
}

/** Rough filament mass (g), PETG at 5 walls / 40% infill: a solid skin over every surface
 *  (about 1.6 mm: 2.1 mm walls, 1 mm top and bottom) and 40% inside. Thin parts are mostly skin,
 *  so this counts cut-outs fairly (they add skin round their edges). */
export const massG = (mm3, mm2) => {
  const skin = Math.min(mm3, mm2 * 1.6);
  return Math.round(((skin + (mm3 - skin) * 0.4) / 1000) * 1.27);
};

/** Rotate an add-on part to its print orientation and drop it onto z = 0. */
export function printOrientAddon(shape, print) {
  // standing = the carriage on its back face, stop sleeves pointing up
  const s = print === "standing" ? shape.rotate(90, [0, 0, 0], [0, 1, 0]) : shape;
  const [min] = s.boundingBox.bounds;
  return s.translate([-min[0], -min[1], -min[2]]);
}
