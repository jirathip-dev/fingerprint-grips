// Add-ons that turn a gripper into a trainer. Pure geometry + maths, shared by the
// browser worker and the Node checks (replicad is passed in, like model.js).
//
//   table  : palm-push rig for a Tindeq (like the Crimpdeq platform). The gripper lies
//            on its back between two rails, the cord runs to the Tindeq, the Tindeq
//            clips to an anchor wall. Push with the heel of the hand, pull with the fingers.
//   spring : the same rig, but the far end holds steel compression springs (Crimpy-style
//            portable trainer). Swap or add springs for light/heavy.
//   foot   : a plate to stand on. Clip the Tindeq's lower eye to the fin, pull up.
//
// Rig frame (table/spring): X along the pull, palm end at x = 0, anchor at the far end.
// Y across (+Y is the user's left when they sit at the palm end), Z up from the table.
// The gripper lies on its back: hand side up, finger entry facing the palm rest,
// cord holes facing the anchor.

/** Tindeq Progressor 200, measured from a photo against a tape (about ±2 mm).
 *  Used only for clearances: nothing clamps the Tindeq, it hangs on its two eyes. */
export const TINDEQ = { length: 100, width: 58, thick: 25, eyeD: 17, eyePitch: 69 };

export const ADDON_DIM = {
  ledge: 12, // the gripper's back rests on two ledges this high: room under it for FDS tips
  ledgeIn: 7, // how far each ledge reaches under the gripper's end walls
  sideGap: 2, // gripper to rail, each side
  rail: { w: 18, h: 28 },
  rod: { r: 2.25, z: 6 }, // M4 threaded rod along each rail clamps the printed pieces together
  palm: { root: 52, top: 18, arc: 7, wing: 14 }, // wing: the palm rest is two side cheeks + a bar, not a solid block // palm rest: base length, top length, rounding
  travel: 50, // the cord length sets where the gripper sits: 0-60 mm from the palm rest
  cordGap: 25, // gripper top (at its furthest) to the next part
  maxPiece: 236, // longest printed piece (A1 bed is 256 mm)
  tindeq: { floor: 6, guideH: 14, guideT: 4, clear: 4, bay: 112, clip: 34 }, // bay = Tindeq + its cord knot; clip = carabiner
  wall: { t: 20, window: 16, over: 14, buttress: 15 }, // anchor wall: carabiner window + bridge above it
  spring: { wall: 14, carriage: 18, preload: 1, cordHole: 12, post: 10, seat: 1.5, rodHole: 2.4 },
  foot: { len: 230, width: 120, t: 8, rib: { n: 4, h: 18, t: 8 }, finL: 70, finT: 20, holeD: 14, holeZ: 26, over: 18 },
};

/** Loads the printed add-ons are screened for. Paper check only, not a tested rating. */
export const RATING = { table: 60, foot: 100 }; // kg
export const DESIGN_FACTOR = 2;
/** Allowable stress for PETG prints (MPa). Assumptions: they need coupon tests. */
export const ALLOW = { inLayer: 20, acrossLayer: 6, compression: 25, rodN: 2000 /* M4 4.8, below proof */ };

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
  if (m.ID < 6) problems.push(`Inner diameter ${m.ID.toFixed(1)} mm is too small for the M4 guide rod (needs 6 mm or more).`);
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
/** gL = gripper layout, gInfo = gripper summary (built coords, already mirrored for the hand). */
export function rigLayout(kind, gL, gInfo, spring = SPRING_DEFAULT) {
  const A = ADDON_DIM;
  const Wg = gL.width, Dg = -gL.yF, Hg = gL.zTop - gL.zBottom;
  const inner = Wg / 2 + A.sideGap;
  const outer = inner + A.rail.w;
  const zl = A.ledge;
  const Zc = zl + Dg / 2; // cord holes: halfway through the gripper's depth
  const Yc = Wg / 2 - gInfo.cord.x; // cord centre across the rig
  const R = { kind, Wg, Dg, Hg, inner, outer, zl, Zc, Yc, Zp: palmHeight(gL, zl), xPalm: A.palm.root, rods: [] };
  R.xBayEnd = R.xPalm + A.travel + Hg; // gripper top at its furthest from the palm
  R.gripperX0 = R.xPalm + A.travel / 2; // preview position
  R.rods = [-1, 1].map((k) => ({ y: k * (inner + A.rail.w / 2), z: A.rod.z }));

  if (kind === "table") {
    const T = A.tindeq;
    R.xMod = R.xBayEnd + A.cordGap;
    R.xA = R.xMod + T.bay + T.clip;
    R.xEnd = R.xA + A.wall.t;
    R.guideY = [Yc - TINDEQ.width / 2 - T.clear - T.guideT, Yc + TINDEQ.width / 2 + T.clear];
    R.window = { y: Yc, z: Zc, r: A.wall.window / 2 };
    R.guideTop = Math.max(T.floor + T.guideH, Zc - 4);
    R.wallTop = Zc + R.window.r * Math.SQRT2 + A.wall.over;
    R.cuttable = [[R.xPalm + 5, R.xBayEnd - 5], [R.xMod + 8, R.xMod + T.bay - 8]];
  } else {
    const S = A.spring;
    const m = springMath(spring);
    // 2 springs either side of the cord; 4 springs as a 2 x 2 block around it (keeps the load centred)
    const off = S.cordHole / 2 + 3 + m.OD / 2;
    const dz = m.OD / 2 + 2;
    const ys = [Yc - off, Yc + off];
    const pos = m.count === 2 ? ys.map((y) => ({ y, z: Zc })) : ys.flatMap((y) => [{ y, z: Zc - dz }, { y, z: Zc + dz }]);
    R.spring = { ...m, ys, pos, rest: m.L0 - S.preload };
    R.cordGapUsed = Math.max(A.cordGap, m.travel + 14); // guide rods poke out of the wall toward the gripper
    R.xW0 = R.xBayEnd + R.cordGapUsed;
    R.xW1 = R.xW0 + S.wall;
    R.xC0 = R.xW1 + R.spring.rest;
    R.xC1 = R.xC0 + S.carriage;
    R.xEnd = R.xC1 + S.post + 3;
    // posts sit outside the springs (1.5 mm clear), inside the carriage's footprint
    R.carriageY = [Math.min(...ys) - m.OD / 2 - 1.5 - S.post, Math.max(...ys) + m.OD / 2 + 1.5 + S.post];
    const zs = pos.map((q) => q.z);
    R.carriageZ = [Math.min(...zs) - m.OD / 2 - 6, Math.max(...zs) + m.OD / 2 + 6];
    R.problems = [];
    if (R.carriageY[0] < -inner + 0.5 || R.carriageY[1] > inner - 0.5)
      R.problems.push(`Those springs are too fat for this rig (${m.OD} mm OD). Use a smaller outer diameter.`);
    if (R.carriageZ[0] < 7) R.problems.push(`${m.count} springs of ${m.OD} mm OD don't fit under the cord line. Use 2 springs or a smaller OD.`);
    R.postY = [[R.carriageY[0], R.carriageY[0] + S.post], [R.carriageY[1] - S.post, R.carriageY[1]]];
    R.stopLen = R.spring.rest - m.travel; // wall to the carriage at full squeeze
    R.wallTop = R.carriageZ[1] + 4;
    R.cuttable = [[R.xPalm + 5, R.xBayEnd - 5]];
    // 5 kg marks on the rail tops: where the carriage's front face sits at each load (sight across)
    R.marks = [];
    for (let kg = 5; ; kg += 5) {
      const dx = (kg * 9.81) / (m.count * m.k) - S.preload;
      if (dx > m.travel) break;
      if (dx > 0.5) R.marks.push({ kg, x: R.xC0 - dx });
    }
  }
  R.pieces = splitPieces(R.xEnd, R.cuttable, A.maxPiece);
  R.rodLength = Math.ceil(R.xEnd + 16);
  R.screen = screenRig(R);
  return R;
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

/** Hand-calc stress screen at the design load. Returns [{part, mpa, allow, ok}]. */
function screenRig(R) {
  const A = ADDON_DIM;
  // the spring rig hits its stops at full squeeze, after which the pull goes straight into the wall
  const kg = R.kind === "table" ? RATING.table : Math.max(RATING.table, R.spring.totalKg);
  const F = kg * 9.81 * DESIGN_FACTOR;
  const zLoad = Math.max(R.Zc, R.Zp);
  const out = [];
  const add = (part, mpa, allow, unit = "MPa") => out.push({ part, value: round1(mpa), allow, unit, ok: mpa <= allow });
  // rails: two rails carry the pull as a beam, plus the rods tie the butt joints
  const w = A.rail.w, h = A.rail.h;
  add("rails (bending)", (F * (zLoad - h / 2)) / ((2 * w * h * h) / 6) + F / (2 * w * h), ALLOW.inLayer);
  const zc = h - 4; // butt-joint compression centre, near the rail top
  const C = (F * (zLoad - A.rod.z)) / (zc - A.rod.z);
  add("rod tension (each)", (C - F) / 2, ALLOW.rodN, "N");
  add("butt joint (compression)", C / (2 * w * 8), ALLOW.compression);
  const b = 2 * R.outer;
  add("palm rest cheeks (root)", (6 * F * R.Zp) / (2 * (A.rail.w + 2) * A.palm.root ** 2), ALLOW.acrossLayer);
  if (R.kind === "table") {
    const t = A.wall.t + A.wall.buttress;
    add("anchor wall root", (6 * F * R.Zc) / (b * t * t), ALLOW.acrossLayer);
    add("bridge over the carabiner window", (6 * ((F * A.wall.window) / 8)) / (A.wall.over * A.wall.t ** 2), ALLOW.inLayer);
  } else {
    const t = A.spring.wall + 12;
    add("spring wall root", (6 * F * R.Zc) / (b * t * t), ALLOW.acrossLayer);
  }
  return { kg: round1(kg), forceN: round1(F), items: out };
}

export function footLayout() {
  const P = ADDON_DIM.foot;
  const F = RATING.foot * 9.81 * DESIGN_FACTOR;
  const a = (P.len / 2 - P.finL / 2) / 2 + P.finL / 2; // foot load centres from the fin
  const items = [];
  const add = (part, mpa, allow) => items.push({ part, value: round1(mpa), allow, unit: "MPa", ok: mpa <= allow });
  // plate + ribs as a T-section family: I about the neutral axis
  const Ap = P.width * P.t, Ar = P.rib.n * P.rib.t * P.rib.h;
  const zN = (Ap * P.t / 2 + Ar * (P.t + P.rib.h / 2)) / (Ap + Ar);
  const I = (P.width * P.t ** 3) / 12 + Ap * (zN - P.t / 2) ** 2 + (P.rib.n * P.rib.t * P.rib.h ** 3) / 12 + Ar * (P.t + P.rib.h / 2 - zN) ** 2;
  const cMax = Math.max(zN, P.t + P.rib.h - zN);
  add("plate bending", ((F / 2) * a * cMax) / I, ALLOW.inLayer);
  add("fin legs (across layers)", F / (2 * P.finT * (P.finL / 2 - P.holeD / 2)), ALLOW.acrossLayer);
  add("bridge over the hole (bending)", (6 * ((F * P.holeD) / 8)) / (P.finT * P.over ** 2), ALLOW.inLayer);
  add("bridge over the hole (layer shear)", (1.5 * (F / 2)) / (P.finT * P.over), ALLOW.acrossLayer);
  return { ...P, screen: { kg: RATING.foot, forceN: round1(F), items }, pieces: [[0, P.len]] };
}

// ---------------------------------------------------------------- solids
/** Rig pieces (table/spring), already split for the bed. Each prints as it lies (flat side down). */
export function buildRig(r, R) {
  const A = ADDON_DIM;
  const { inner, outer, zl } = R;
  let body = box(r, 0, R.xEnd, inner, outer, 0, A.rail.h).fuse(box(r, 0, R.xEnd, -outer, -inner, 0, A.rail.h));
  // ledges the gripper's back rests on
  const lIn = R.Wg / 2 - A.ledgeIn;
  body = body.fuse(box(r, R.xPalm, R.xBayEnd + 3, lIn, inner + 0.5, 0, zl)).fuse(box(r, R.xPalm, R.xBayEnd + 3, -inner - 0.5, -lIn, 0, zl));
  // palm rest: sloped face toward the user, rounded top, full width
  const P = A.palm;
  const zT = R.Zp;
  const palmProf = r.draw([0, 0]).lineTo([P.root, 0]).lineTo([P.root, zT - P.arc]).threePointsArcTo([P.root - P.top, zT - P.arc], [P.root - P.top / 2, zT]).close();
  // full-width rounded bar on top (where the heel pushes), carried by two cheeks over the rails
  const zBar = zT - P.wing - P.arc;
  const bar = prismY(palmProf, -outer, outer).intersect(box(r, -1, P.root + 1, -outer - 1, outer + 1, zBar, zT + 1));
  const cheeks = prismY(palmProf, -outer, -inner + 2).fuse(prismY(palmProf, inner - 2, outer));
  body = body.fuse(bar).fuse(cheeks);

  const tools = [];
  if (R.kind === "table") {
    const T = A.tindeq;
    body = body.fuse(box(r, R.xMod, R.xA - A.wall.buttress + 4, -inner - 0.5, inner + 0.5, 0, T.floor)); // overlaps the buttress: no hairline seams
    // the Tindeq hangs in line between the cord and the carabiner; the floor and side guides only catch it when slack
    for (const y0 of R.guideY) body = body.fuse(box(r, R.xMod + 4, R.xMod + T.bay - 4, y0, y0 + T.guideT, T.floor - 0.5, R.guideTop));
    body = body.fuse(box(r, R.xA, R.xEnd, -outer, outer, 0, R.wallTop));
    body = body.fuse(prismY(poly(r, [[R.xA - A.wall.buttress, 0], [R.xA + 0.5, 0], [R.xA + 0.5, A.wall.buttress]]), -outer, outer));
    tools.push(prismX(teardrop(r, R.window.y, R.window.z, R.window.r), R.xA - 1, R.xEnd + 1));
  } else {
    const S = A.spring, sp = R.spring;
    body = body.fuse(box(r, R.xW0 - 12, R.xEnd, -inner - 0.5, inner + 0.5, 0, 6)); // floor ties the rails
    body = body.fuse(box(r, R.xW0, R.xW1, -outer, outer, 0, R.wallTop));
    body = body.fuse(prismY(poly(r, [[R.xW0 - 12, 0], [R.xW0 + 0.5, 0], [R.xW0 + 0.5, 12]]), -outer, outer));
    // stop posts (full squeeze) and end posts (rest), standing on the floor
    for (const [y0, y1] of R.postY) {
      body = body.fuse(box(r, R.xW1 - 0.5, R.xW1 + R.stopLen, y0, y1, 5.5, R.Zc + 6));
      body = body.fuse(box(r, R.xC1, R.xC1 + S.post, y0, y1, 5.5, R.Zc + 6));
    }
    tools.push(prismX(teardrop(r, R.Yc, R.Zc, S.cordHole / 2), R.xW0 - 1, R.xW1 + 1));
    for (const { y, z } of sp.pos) {
      tools.push(prismX(teardrop(r, y, z, S.rodHole), R.xW0 - 1, R.xW1 + 1));
      tools.push(r.makeCylinder(sp.OD / 2 + 0.6, S.seat + 0.5, [R.xW1 - S.seat, y, z], [1, 0, 0])); // spring seat
    }
    for (const m of R.marks) {
      const w = m.kg % 10 === 0 ? 2.4 : 1.2;
      for (const k of [-1, 1]) tools.push(box(r, m.x - w / 2, m.x + w / 2, k > 0 ? inner : -outer, k > 0 ? outer : -inner, A.rail.h - 1.2, A.rail.h + 1));
    }
  }
  for (const rod of R.rods) tools.push(prismX(teardrop(r, rod.y, rod.z, A.rod.r), -1, R.xEnd + 1));
  for (const t of tools) body = body.cut(t);

  const parts = R.pieces.map(([x0, x1], i) => ({
    name: `${R.kind}_rig_${i + 1}`,
    kind: "addon",
    print: "flat",
    shape: body.clone().intersect(box(r, x0, x1, -outer - 1, outer + 1, -1, 500)),
  }));
  if (R.kind === "spring") parts.push({ name: "spring_carriage", kind: "addon", print: "standing", shape: buildCarriage(r, R) });
  return parts;
}

function buildCarriage(r, R) {
  const S = ADDON_DIM.spring, sp = R.spring;
  let c = box(r, R.xC0, R.xC1, R.carriageY[0], R.carriageY[1], R.carriageZ[0], R.carriageZ[1]);
  c = c.cut(r.makeCylinder(S.cordHole / 2, S.carriage + 2, [R.xC0 - 1, R.Yc, R.Zc], [1, 0, 0]));
  for (const { y, z } of sp.pos) {
    c = c.cut(r.makeCylinder(S.rodHole, S.carriage + 2, [R.xC0 - 1, y, z], [1, 0, 0]));
    c = c.cut(r.makeCylinder(sp.OD / 2 + 0.6, S.seat + 0.5, [R.xC0 - 0.5, y, z], [1, 0, 0]));
  }
  return c;
}

export function buildFoot(r, P = footLayout()) {
  let s = box(r, 0, P.len, -P.width / 2, P.width / 2, 0, P.t);
  // stiffening ribs on top of the plate, along its length (prints plate-down, no supports)
  for (let i = 0; i < P.rib.n; i++) {
    const y = -P.width / 2 + P.rib.t / 2 + (i * (P.width - P.rib.t)) / (P.rib.n - 1);
    s = s.fuse(box(r, 0, P.len, y - P.rib.t / 2, y + P.rib.t / 2, P.t - 0.5, P.t + P.rib.h));
  }
  const x0 = P.len / 2 - P.finL / 2, x1 = P.len / 2 + P.finL / 2;
  const rr = P.holeD / 2;
  const hTop = P.holeZ + rr * Math.SQRT2 + P.over;
  const fin = poly(r, [[x0, P.t - 0.5], [x1, P.t - 0.5], [x1, P.t + P.holeZ], [P.len / 2 + 14, P.t + hTop], [P.len / 2 - 14, P.t + hTop], [x0, P.t + P.holeZ]]);
  s = s.fuse(prismY(fin, -P.finT / 2, P.finT / 2));
  // the hole runs across the fin (along Y), point up
  const hole = teardrop(r, P.len / 2, P.t + P.holeZ, rr).sketchOnPlane("XZ", -(P.finT / 2 + 1)).extrude(P.finT + 2);
  s = s.cut(hole);
  return [{ name: "foot_plate", kind: "addon", print: "flat", shape: s }];
}

/** Reference-only solids (not printed): Tindeq, springs, guide rods. For the preview and the checks. */
export function rigGhosts(r, R) {
  const out = [];
  if (R.kind === "table") {
    const T = TINDEQ;
    const x0 = R.xMod + (ADDON_DIM.tindeq.bay - T.length) / 2;
    let t = box(r, x0, x0 + T.length, R.Yc - T.width / 2, R.Yc + T.width / 2, R.Zc - T.thick / 2, R.Zc + T.thick / 2);
    for (const k of [-1, 1]) t = t.cut(r.makeCylinder(T.eyeD / 2, T.thick + 2, [x0 + T.length / 2 + (k * T.eyePitch) / 2, R.Yc, R.Zc - T.thick / 2 - 1], [0, 0, 1]));
    out.push({ name: "tindeq", kind: "ghost", shape: t });
  } else {
    const sp = R.spring;
    for (const { y, z } of sp.pos) {
      const tube = r.makeCylinder(sp.OD / 2, sp.rest, [R.xW1, y, z], [1, 0, 0]).cut(r.makeCylinder(sp.ID / 2, sp.rest + 2, [R.xW1 - 1, y, z], [1, 0, 0]));
      out.push({ name: "spring", kind: "spring", shape: tube });
      out.push({ name: "guide_rod", kind: "steel", shape: r.makeCylinder(2, R.xEnd - R.xW0 + 4, [R.xW0 - 4, y, z], [1, 0, 0]) });
    }
  }
  return out;
}

/** Foot plate preview: Tindeq stood on end above the fin, gripper upside down above it
 *  (cord holes down), the way they hang when you pull up. */
export function footGhosts(r, P = footLayout()) {
  const T = TINDEQ;
  const z0 = P.t + P.holeZ + 55; // carabiner between the fin and the Tindeq
  let t = box(r, P.len / 2 - T.width / 2, P.len / 2 + T.width / 2, -T.thick / 2, T.thick / 2, z0, z0 + T.length);
  for (const k of [-1, 1]) {
    const ze = z0 + T.length / 2 + (k * T.eyePitch) / 2;
    t = t.cut(r.makeCylinder(T.eyeD / 2, T.thick + 2, [P.len / 2, -T.thick / 2 - 1, ze], [0, 1, 0]));
  }
  return { ghosts: [{ name: "tindeq", kind: "ghost", shape: t }], gripperTop: z0 + T.length + 45 };
}

/** Place a gripper part upside down above the foot plate, cord centre over the fin. */
export function placeOverFoot(shape, L, cordX, zTopAt, P = footLayout()) {
  return shape.rotate(180, [0, 0, 0], [1, 0, 0]).translate([P.len / 2 - cordX, L.yF / 2, zTopAt + L.zTop]);
}

/** Rough filament mass (g) for PETG at 5 walls / 40% infill: solid volume x 1.27 g/cm3 x 0.55. */
export const massG = (mm3) => Math.round((mm3 / 1000) * 1.27 * 0.55);

/** Rotate an add-on part to its print orientation and drop it onto z = 0. */
export function printOrientAddon(shape, print) {
  const s = print === "standing" ? shape.rotate(-90, [0, 0, 0], [0, 1, 0]) : shape;
  const [min] = s.boundingBox.bounds;
  return s.translate([-min[0], -min[1], -min[2]]);
}
