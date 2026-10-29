// Add-ons that turn a gripper into a trainer. Pure geometry + maths, shared by the
// browser worker and the Node checks (replicad is passed in, like model.js).
//
//   platform : one rig for a table or the floor (in the spirit of the Crimpdeq platform and
//              Crimpy). The gripper lies on its back between two rails and the cord runs
//              straight down the middle: gripper -> Tindeq bay -> anchor wall -> spring section.
//              Load it three ways, all with the same printed parts:
//                tindeq : Tindeq in the bay, its far eye clipped round the bridge in the wall
//                springs: cord through the wall to the spring carriage (no Tindeq)
//                both   : Tindeq in the bay AND springs: the Tindeq reads the spring force live
//              Brace it two ways: heel of the hand on the rest (palm push, on a table), or
//              feet flat against the rest's front face (leg push, on the floor; the cord
//              leaves through a notch in the rest toward your hands).
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
  rail: { w: 18, h: 28 },
  rod: { r: 2.25, z: 6 }, // M4 threaded rod along each rail clamps the printed pieces together
  palm: { root: 52, top: 18, arc: 7, notch: 10 }, // solid rest: base, top, rounding; notch = cord slot for leg push
  travel: 50, // the cord length sets where the gripper sits: 0-50 mm from the palm rest
  cordGap: 14, // gripper top (at its furthest) to the Tindeq: room for the knot
  maxPiece: 236, // longest printed piece (A1 bed is 256 mm)
  tindeq: { floor: 6, guideH: 14, guideT: 4, clear: 4, clip: 34 }, // clip = carabiner / short cord to the wall
  wall: { t: 20, window: 16, over: 14, buttress: 15 }, // anchor wall: carabiner/cord window + bridge above it
  spring: { carriage: 18, preload: 1, cordHole: 12, post: 10, seat: 1.5, rodHole: 2.4 },
  foot: { len: 230, width: 160, t: 8, rib: { n: 5, h: 14, t: 8 }, lugL: 70, lugT: 20, holeD: 14, holeZ: 26, over: 18, apex: 250, footW: 110 },
};

export const LOADS = ["tindeq", "springs", "both"];

/** Loads the printed add-ons are screened for. Paper check only, not a tested rating. */
export const RATING = { platform: 60, foot: 100 }; // kg
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
  R.rods = [-1, 1].map((k) => ({ y: k * (inner + A.rail.w / 2), z: A.rod.z }));
  const m = springMath(spring);

  // Tindeq bay. With springs fitted, everything in line moves toward you by the spring travel,
  // so the bay starts that much further out: the Tindeq's run never reaches the gripper bay.
  R.xT0 = R.xBayEnd + A.cordGap + m.travel; // Tindeq near end, at rest
  R.tindeqRun = [R.xT0 - m.travel, R.xT0 + TINDEQ.length];
  R.guideY = [Yc - TINDEQ.width / 2 - T.clear - T.guideT, Yc + TINDEQ.width / 2 + T.clear];
  R.guideTop = Math.max(T.floor + T.guideH, Zc - 4);

  // anchor wall: the window takes the carabiner (Tindeq only) or the cord (springs)
  R.xW0 = R.xT0 + TINDEQ.length + T.clip;
  R.xW1 = R.xW0 + A.wall.t;
  R.window = { y: Yc, z: Zc, r: A.wall.window / 2 };

  // spring section: 2 springs either side of the window, or a 2 x 2 block (load stays centred)
  const off = R.window.r + 3 + m.OD / 2;
  const dz = m.OD / 2 + 2;
  const ys = [Yc - off, Yc + off];
  const pos = m.count === 2 ? ys.map((y) => ({ y, z: Zc })) : ys.flatMap((y) => [{ y, z: Zc - dz }, { y, z: Zc + dz }]);
  R.spring = { ...m, ys, pos, rest: m.L0 - S.preload };
  R.xC0 = R.xW1 + R.spring.rest;
  R.xC1 = R.xC0 + S.carriage;
  R.xEnd = R.xC1 + S.post + 3;
  // posts sit outside the springs (1.5 mm clear), inside the carriage's footprint
  R.carriageY = [Math.min(...ys) - m.OD / 2 - 1.5 - S.post, Math.max(...ys) + m.OD / 2 + 1.5 + S.post];
  const zs = pos.map((q) => q.z);
  R.carriageZ = [Math.min(...zs) - m.OD / 2 - 6, Math.max(...zs) + m.OD / 2 + 6];
  if (R.carriageY[0] < -inner + 0.5 || R.carriageY[1] > inner - 0.5)
    R.problems.push(`Those springs are too fat for this platform (${m.OD} mm OD). Use a smaller outer diameter.`);
  if (R.carriageZ[0] < 7) R.problems.push(`${m.count} springs of ${m.OD} mm OD don't fit under the cord line. Use 2 springs or a smaller OD.`);
  R.postY = [[R.carriageY[0], R.carriageY[0] + S.post], [R.carriageY[1] - S.post, R.carriageY[1]]];
  R.stopLen = R.spring.rest - m.travel; // wall to the carriage at full squeeze
  R.wallTop = Math.max(Zc + R.window.r * Math.SQRT2 + A.wall.over, R.carriageZ[1] + 4);
  // 5 kg marks on the rail tops: where the carriage's front face sits at each load (sight across)
  R.marks = [];
  for (let kg = 5; ; kg += 5) {
    const dx = (kg * 9.81) / (m.count * m.k) - S.preload;
    if (dx > m.travel) break;
    if (dx > 0.5) R.marks.push({ kg, x: R.xC0 - dx });
  }
  R.cuttable = [[R.xPalm + 5, R.xBayEnd - 5], [R.tindeqRun[0] + 8, R.tindeqRun[1] - 8], [R.xW1 + R.stopLen + 2, R.xC0 - 2]];
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

/** Hand-calc stress screen at the design load. Returns [{part, mpa, allow, ok}].
 *  Rated for the Tindeq rating or the full spring load, whichever is higher: once the carriage
 *  hits its stops, the rest of the pull goes straight into the wall. Leg push loads the same
 *  path as palm push, but lower down, so the palm case covers it. */
function screenRig(R) {
  const A = ADDON_DIM;
  const kg = Math.max(RATING.platform, R.spring.totalKg);
  const F = kg * 9.81 * DESIGN_FACTOR;
  const zLoad = Math.max(R.Zc, R.Zp);
  const out = [];
  const add = (part, mpa, allow, unit = "MPa") => out.push({ part, value: round1(mpa), allow, unit, ok: mpa <= allow });
  const w = A.rail.w, h = A.rail.h;
  add("rails (bending)", (F * (zLoad - h / 2)) / ((2 * w * h * h) / 6) + F / (2 * w * h), ALLOW.inLayer);
  const zc = h - 4; // butt-joint compression centre, near the rail top
  const C = (F * (zLoad - A.rod.z)) / (zc - A.rod.z);
  add("rod tension (each)", (C - F) / 2, ALLOW.rodN, "N");
  add("butt joint (compression)", C / (2 * w * 8), ALLOW.compression);
  const b = 2 * R.outer;
  add("palm rest root", (6 * F * R.Zp) / ((b - A.palm.notch) * A.palm.root ** 2), ALLOW.acrossLayer);
  const t = A.wall.t + A.wall.buttress;
  add("anchor wall root", (6 * F * R.Zc) / (b * t * t), ALLOW.acrossLayer);
  add("bridge over the window", (6 * ((F * A.wall.window) / 8)) / (A.wall.over * A.wall.t ** 2), ALLOW.inLayer);
  return { kg: round1(kg), forceN: round1(F), items: out };
}

/** One-foot plate: a lug on each long edge, the foot stands between them. A cord from each lug
 *  meets the other at the Tindeq's lower eye, `apex` mm above the plate (or higher). */
export function footLayout() {
  const P = ADDON_DIM.foot;
  const F = RATING.foot * 9.81 * DESIGN_FACTOR;
  const yLug = P.width / 2 - P.lugT / 2;
  const gap = P.width - 2 * P.lugT; // room for the foot between the lugs
  const ribTop = P.t + P.rib.h;
  const zHole = P.t + P.holeZ;
  const lugTop = zHole + (P.holeD / 2) * Math.SQRT2 + P.over; // the cord wraps this bridge and leaves from here
  const ribX = Array.from({ length: P.rib.n }, (_, i) => P.rib.t / 2 + (i * (P.len - P.rib.t)) / (P.rib.n - 1));
  const tanT = yLug / P.apex; // each cord's angle from vertical
  const Pv = F / 2; // per lug, up
  const Ph = Pv * tanT; // per lug, sideways toward the foot
  const Pc = Pv / Math.cos(Math.atan(tanT)); // per lug, along the cord
  const items = [];
  const add = (part, mpa, allow) => items.push({ part, value: round1(mpa), allow, unit: "MPa", ok: mpa <= allow });
  // plate bends across, between the lugs: foot load ~25 mm either side of the middle.
  // Ribs run across too, so they stiffen exactly this. Effective width: the lug plus a 45° spread.
  const lever = yLug - 25;
  const beff = Math.min(P.len, P.lugL + 2 * lever);
  const nEff = ribX.filter((x) => Math.abs(x - P.len / 2) <= beff / 2).length;
  const Ap = beff * P.t, Ar = nEff * P.rib.t * P.rib.h;
  const zN = (Ap * P.t / 2 + Ar * (P.t + P.rib.h / 2)) / (Ap + Ar);
  const I = (beff * P.t ** 3) / 12 + Ap * (zN - P.t / 2) ** 2 + (nEff * P.rib.t * P.rib.h ** 3) / 12 + Ar * (P.t + P.rib.h / 2 - zN) ** 2;
  const cMax = Math.max(zN, ribTop - zN);
  add("plate bending (between the lugs)", (Pv * lever * cMax) / I, ALLOW.inLayer);
  add("lug legs (across layers)", Pv / (2 * P.lugT * (P.lugL / 2 - P.holeD / 2)), ALLOW.acrossLayer);
  add("lug root (pull + sideways)", Pv / (P.lugL * P.lugT) + (6 * Ph * P.holeZ) / (P.lugL * P.lugT ** 2), ALLOW.acrossLayer);
  add("bridge over the hole (bending)", (6 * ((Pc * P.holeD) / 8)) / (P.lugT * P.over ** 2), ALLOW.inLayer);
  add("bridge over the hole (layer shear)", (1.5 * (Pc / 2)) / (P.lugT * P.over), ALLOW.acrossLayer);
  return { ...P, yLug, gap, ribTop, zHole, lugTop, ribX, screen: { kg: RATING.foot, forceN: round1(F), items }, pieces: [[0, P.len]] };
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
  for (const y0 of R.guideY) body = body.fuse(box(r, R.tindeqRun[0] - 4, R.tindeqRun[1] + 4, y0, y0 + T.guideT, T.floor - 0.5, R.guideTop));
  // anchor wall + buttress in front of it
  body = body.fuse(box(r, R.xW0, R.xW1, -outer, outer, 0, R.wallTop));
  body = body.fuse(prismY(poly(r, [[R.xW0 - A.wall.buttress, 0], [R.xW0 + 0.5, 0], [R.xW0 + 0.5, A.wall.buttress]]), -outer, outer));
  // stop posts (full squeeze) and end posts (rest), standing on the floor
  for (const [y0, y1] of R.postY) {
    body = body.fuse(box(r, R.xW1 - 0.5, R.xW1 + R.stopLen, y0, y1, T.floor - 0.5, R.Zc + 6));
    body = body.fuse(box(r, R.xC1, R.xC1 + S.post, y0, y1, T.floor - 0.5, R.Zc + 6));
  }

  const tools = [];
  // leg-push cord notch through the palm rest, round-bottomed at the cord line
  tools.push(box(r, -1, P.root + 1, R.Yc - P.notch / 2, R.Yc + P.notch / 2, R.Zc, zT + 1));
  tools.push(r.makeCylinder(P.notch / 2, P.root + 2, [-1, R.Yc, R.Zc], [1, 0, 0]));
  tools.push(prismX(teardrop(r, R.window.y, R.window.z, R.window.r), R.xW0 - 1, R.xW1 + 1));
  for (const { y, z } of sp.pos) {
    tools.push(prismX(teardrop(r, y, z, S.rodHole), R.xW0 - 1, R.xW1 + 1));
    tools.push(r.makeCylinder(sp.OD / 2 + 0.6, S.seat + 0.5, [R.xW1 - S.seat, y, z], [1, 0, 0])); // spring seat
  }
  for (const m of R.marks) {
    const w = m.kg % 10 === 0 ? 2.4 : 1.2;
    for (const k of [-1, 1]) tools.push(box(r, m.x - w / 2, m.x + w / 2, k > 0 ? inner : -outer, k > 0 ? outer : -inner, A.rail.h - 1.2, A.rail.h + 1));
  }
  for (const rod of R.rods) tools.push(prismX(teardrop(r, rod.y, rod.z, A.rod.r), -1, R.xEnd + 1));
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
  // ribs across the plate (prints plate-down, no supports): they stiffen the span between the
  // lugs and give the sole some grip
  for (const x of P.ribX) s = s.fuse(box(r, x - P.rib.t / 2, x + P.rib.t / 2, -P.width / 2, P.width / 2, P.t - 0.5, P.ribTop));
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
  const out = [];
  if (load !== "springs") {
    const T = TINDEQ;
    const x0 = R.xT0;
    let t = box(r, x0, x0 + T.length, R.Yc - T.width / 2, R.Yc + T.width / 2, R.Zc - T.thick / 2, R.Zc + T.thick / 2);
    for (const k of [-1, 1]) t = t.cut(r.makeCylinder(T.eyeD / 2, T.thick + 2, [x0 + T.length / 2 + (k * T.eyePitch) / 2, R.Yc, R.Zc - T.thick / 2 - 1], [0, 0, 1]));
    out.push({ name: "tindeq", kind: "ghost", shape: t });
  }
  if (load !== "tindeq") {
    const sp = R.spring;
    for (const { y, z } of sp.pos) {
      const tube = r.makeCylinder(sp.OD / 2, sp.rest, [R.xW1, y, z], [1, 0, 0]).cut(r.makeCylinder(sp.ID / 2, sp.rest + 2, [R.xW1 - 1, y, z], [1, 0, 0]));
      out.push({ name: "spring", kind: "spring", shape: tube });
      out.push({ name: "guide_rod", kind: "steel", shape: r.makeCylinder(2, R.xEnd - R.xW0 + 4, [R.xW0 - 4, y, z], [1, 0, 0]) });
    }
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
  return { ghosts, gripperTop: z0 + T.length + 45 };
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
