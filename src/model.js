// Pure geometry: (replicad library, hand measurements) -> printable parts.
// No DOM here, so the same file runs in the browser worker and in Node (npm run check).
//
// Design follows Open Grips (CC0, github.com/opengrips/Open_Grips) and the fit
// maths published in the Jared-Is-Coding fork README. The idea of frictionless
// per-finger roller grippers comes from David Quinn (mobeta). Not affiliated.
//
// Assembled frame (right hand):
//   X  across the fingers, pinky at x = 0
//   Y  the hand side is negative, the back face is y = 0
//   Z  toward the cord. The cord pulls +Z, the fingers pull -Z.
//
// How a finger goes in (both devices, as in Open Grips): the hand is below and in
// front. Each finger runs up in front of its roller (first segment roughly parallel
// to the pull) and hooks over the top of the roller. Below and in front of every
// roller is open space for that.
//
// Construction (as in Open Grips): one printed slice per finger, stacked along X.
// Each slice = a divider wall + the solid that shapes that finger's slot
// (roof / blocker / ledge). Each roller spins on its own 3 mm steel pin held in
// blind holes in the two walls beside it. Three M4 threaded rods clamp the stack.
// The cord goes down into the top block near one end, along a tunnel, and back out near
// the other end (holes about 2/3 of the width apart, as on the HoG Micro). The two holes
// sit dead centre, the same distance from both ends; the wide stance stops it rolling.

export const FINGERS = ["pinky", "ring", "middle", "index"]; // x order for a right hand

export const DEVICES = {
  fdp: {
    label: "Claw gripper (FDP)",
    blurb: "Claw grip. Each finger comes up in front of its roller and hooks the tip over it; the pad sits half on the roller, half on a ledge behind it. A roof stops the end joint so the grip can't turn into a crimp, and the back is closed.",
  },
  fds: {
    label: "Pass-through gripper (FDS)",
    blurb: "Fingers drape over a roller about as big as your middle segment. The tips pass through to the back; a peaked roof over each finger stops the hand riding up.",
  },
};

export const MEASURES = {
  length: { label: "Finger length", short: "Length", min: 40, max: 110, help: "Crease where the finger meets the palm, to the tip." },
  pipDip: { label: "Middle segment", short: "Middle", min: 12, max: 40, help: "Middle knuckle crease to the end-joint crease." },
  dipTip: { label: "Tip segment", short: "Tip", min: 12, max: 40, help: "End-joint crease to the fingertip." },
  tipWidth: { label: "Fingertip width", short: "Width", min: 10, max: 26, help: "Widest point of the tip segment." },
};

// Example hand, from numbers posted in Open Grips issue #1 and the fork README.
export const DEFAULT_HAND = {
  index: { length: 71, pipDip: 24, dipTip: 24, tipWidth: 17 },
  middle: { length: 80, pipDip: 28, dipTip: 25, tipWidth: 18 },
  ring: { length: 75, pipDip: 26, dipTip: 24, tipWidth: 17 },
  pinky: { length: 60, pipDip: 18.5, dipTip: 21, tipWidth: 15 },
};

export const DIM = {
  wall: 5, // divider wall
  slotExtra: 4, // slot width = fingertip width + this
  pinkyExtra: 8, // the pinky rotates out; Open Grips gives it a much wider slot
  rollerSide: 0.5, // roller end clearance each side
  pinHoleR: 1.6, // blind hole for the 3 mm steel pin
  pinDepth: 3.5, // blind hole depth into each wall (5 mm wall leaves 1.5 mm skin)
  boreR: 1.75, // roller bore, spins on the pin
  rodR: 2.2, // M4 threaded rod
  cordHalf: 3.5, // tunnel half-width -> 7 mm, for 5-6 mm accessory cord
  cordBend: 7, // tunnel centreline bend radius at the two corners
  cordSpread: 0.65, // hole spacing as a share of the frame width
  cordEdge: 12, // hole centre at least this far from either end of the frame
  topBlock: 34, // solid block above the highest slot (cord tunnel + clamp rods)
  corner: 5,
  // every roller is a spool: raised rims at both ends, a concave waist that centres the finger
  roller: {
    rim: 2.5, // flat rim width each end
    chamfer: 0.8,
    dipK: 0.1, // waist depth = K x diameter ...
    dip: [1.5, 3], // ... clamped to this range (mm)
  },
  fdp: {
    rollerR: 9.5, // Open Grips VarSet: 19 mm rollers ...
    pinkyR: 15, // ... and 30 mm for the pinky
    angle: { index: 57, middle: 60, ring: 60, pinky: 55 }, // fork README "desired angles"
    spine: 10, // solid back behind the ledge: the finger can't go through
    ledgeDepth: 6, // ledge BEHIND the roller: "quarter of the pad on the roller, quarter on the ledge"
    ledgeGap: 0.8, // roller to ledge, and roller to the stem under it
    stem: 8, // solid under the lowest roller
  },
  fds: {
    // Roller diameter = middle segment: the ideal edge is about the length of the
    // second finger pad. Clamped to a printable range.
    rollerD: [16, 40],
    roofMin: 16, // roof gap over the roller top: about one roller radius, never under a finger's thickness
    roofExtra: 4, // roof gap = max(roofMin, radius + this)   PLACEHOLDER
    gableK: 0.35, // peak height of the roof pocket = K x slot width (V pockets over each finger)
    backGap: 10, // open space behind the roller: the fingertips pass through here
    frontMargin: 4,
    floorGap: 2, // roller to bottom rail
    rail: 9, // bottom rail under the back half of the rollers (carries a clamp rod)
  },
};

const RAD = Math.PI / 180;

/** Check measurements. Returns a list of human-readable problems (empty = fine). */
export function validate(hand) {
  const problems = [];
  for (const name of FINGERS) {
    const f = hand?.[name];
    if (!f) {
      problems.push(`Missing ${name} measurements.`);
      continue;
    }
    for (const [key, m] of Object.entries(MEASURES)) {
      const v = Number(f[key]);
      if (!Number.isFinite(v)) problems.push(`${cap(name)} ${m.label.toLowerCase()} is not a number.`);
      else if (v < m.min || v > m.max) problems.push(`${cap(name)} ${m.label.toLowerCase()} should be ${m.min}–${m.max} mm (got ${v}).`);
    }
  }
  if (problems.length) return problems;
  for (const name of FINGERS) {
    const f = hand[name];
    if (Number(f.pipDip) + Number(f.dipTip) > Number(f.length) - 15) {
      problems.push(`${cap(name)}: middle + tip segments are too long for that finger length. Check the boxes.`);
    }
  }
  if (Number(hand.pinky.length) > Math.max(...["ring", "middle", "index"].map((n) => Number(hand[n].length)))) {
    problems.push("Pinky is longer than every other finger. Check that the numbers are in the right boxes.");
  }
  return problems;
}

/** Every position and size, as plain numbers. Cheap; also drives the summary and the checks. */
export function layout(device, hand) {
  const h = Object.fromEntries(FINGERS.map((n) => [n, Object.fromEntries(Object.keys(MEASURES).map((k) => [k, Number(hand[n][k])]))]));
  const P = h.pinky;
  const t = DIM.wall;

  let x = 0;
  const slots = FINGERS.map((name) => {
    const f = h[name];
    const w = f.tipWidth + DIM.slotExtra + (name === "pinky" ? DIM.pinkyExtra : 0);
    const s = { name, f, wallX: x, xs: x + t, w };
    x += t + w;
    return s;
  });
  const endX = x;
  const width = endX + t;

  let yF;
  if (device === "fdp") {
    const D = DIM.fdp;
    for (const s of slots) {
      s.r = s.name === "pinky" ? D.pinkyR : D.rollerR;
      s.zTop = s.f.length - P.length; // fork: vertical offset = finger length - pinky length
      s.zc = s.zTop - s.r;
      s.depth = s.f.pipDip - P.pipDip; // fork: depth offset = middle segment - pinky's
      s.gap = s.f.dipTip / Math.tan(D.angle[s.name] * RAD); // fork: roof height = tip / tan(angle)
      s.zCavTop = s.zTop + s.gap; // roof underside
      s.dip = rollerDip(s.r);
      s.zLedge = s.zTop - s.dip; // ledge level with the roller waist, where the pad sits
    }
    const ref = -Math.max(...slots.map((s) => s.depth + 2 * s.r + D.ledgeGap + D.ledgeDepth + D.spine));
    for (const s of slots) {
      s.yFront = ref + s.depth;
      s.yc = s.yFront + s.r;
      s.yLedge = s.yc + s.r + D.ledgeGap; // ledge front face
      s.yCavBack = s.yLedge + D.ledgeDepth; // back wall: the fingertip stops here
      s.roofFront = s.yc - 0.9 * s.f.dipTip - 6; // roof must reach over the end joint
    }
    yF = Math.min(...slots.map((s) => s.roofFront)) - 2;
  } else {
    const D = DIM.fds;
    for (const s of slots) {
      s.r = clamp(s.f.pipDip, ...D.rollerD) / 2;
      s.dip = rollerDip(s.r);
      s.zApex = s.f.length - P.length; // same vertical offset rule as FDP
      s.zc = s.zApex - s.r;
      s.roofGap = Math.max(D.roofMin, s.r + D.roofExtra);
      s.zRoof = s.zApex + s.roofGap; // roof underside at the walls
      s.peak = D.gableK * s.w; // V pocket: higher in the middle of the slot
      s.zCavTop = s.zRoof + s.peak;
      s.zFloor = s.zc - s.r - D.floorGap;
    }
    const rMax = Math.max(...slots.map((s) => s.r));
    const yFront = -(2 * rMax + D.backGap); // Open Grips: front tangents in line
    for (const s of slots) {
      s.yFront = yFront;
      s.yc = yFront + s.r;
    }
    yF = yFront - D.frontMargin;
  }

  const zBottom =
    device === "fds"
      ? Math.min(...slots.map((s) => s.zFloor)) - DIM.fds.rail
      : Math.min(...slots.map((s) => s.zc - s.r)) - DIM.fdp.stem;
  const maxCav = Math.max(...slots.map((s) => s.zCavTop));
  const zTop = maxCav + DIM.topBlock;
  const ycMax = Math.max(...slots.map((s) => s.yc));
  const rods = [
    { y: yF + 8, z: zTop - 26 },
    { y: -8, z: zTop - 26 },
    device === "fds" ? { y: ycMax / 2, z: zBottom + DIM.fds.rail / 2 } : { y: -DIM.fdp.spine / 2, z: zBottom + 5 },
  ];
  // holes dead centre, the same distance from both ends (simple and predictable; under load
  // the index side, which pulls harder, dips a few degrees)
  const cx = width / 2;
  const spread = 2 * Math.min(DIM.cordSpread * width / 2, cx - DIM.cordEdge);
  const cord = { x: cx, xa: cx - spread / 2, xb: cx + spread / 2, spread, y: yF / 2, bend: DIM.cordBend, half: DIM.cordHalf };
  cord.zh = zTop - 16; // centreline of the run along the top block
  cord.bottom = cord.zh - cord.half;
  for (const s of slots) s.pinLength = round1(s.w + 2 * DIM.pinDepth - 0.5);

  return { device, slots, width, endX, yF, zBottom, zTop, maxCav, rods, cord };
}

/**
 * Build the solids. `r` is the replicad module (passed in so this file has no imports).
 * device: "fdp" | "fds", side: "right" | "left".
 * The layout is built with the pinky at x = 0. Seen from the hand side (looking +Y,
 * Z up) +X is on your right, so the unmirrored layout has the pinky on your left:
 * that is a LEFT hand (palm toward the gripper, fingers up). The right hand is the mirror.
 */
export function buildGripper(r, hand, { device = "fdp", side = "right" } = {}) {
  const L = layout(device, hand);
  const t = DIM.wall;

  const rect = (y0, y1, z0, z1) => r.drawRectangle(y1 - y0, z1 - z0).translate([(y0 + y1) / 2, (z0 + z1) / 2]);
  const prism = (drawing, x0, len) => drawing.sketchOnPlane("YZ", x0).extrude(len);
  const body = () =>
    r.drawRoundedRectangle(-L.yF, L.zTop - L.zBottom, DIM.corner).translate([L.yF / 2, (L.zBottom + L.zTop) / 2]);

  const cavity = (s) => {
    if (device === "fdp") {
      const D = DIM.fdp;
      // front: open from below up to the roof, so the finger can come up in front of the roller
      const front = rect(L.yF - 2, s.yc, L.zBottom - 2, s.zCavTop);
      // roller pocket: down to just above the stem the roller sits over
      const pocket = rect(s.yc - 0.5, s.yLedge, s.zc - s.r - D.ledgeGap, s.zCavTop);
      // over the ledge, up to the back wall
      const tip = rect(s.yLedge - 0.5, s.yCavBack, s.zLedge, s.zCavTop);
      return front.fuse(pocket).fuse(tip);
    }
    // open front to back (the fingertips go through), roof above,
    // open below in front of the roller (the finger comes up from there), rail under the back half
    const main = rect(L.yF - 2, 2, s.zFloor, s.zRoof);
    const below = rect(L.yF - 2, s.yc, L.zBottom - 2, s.zFloor + 0.5);
    return main.fuse(below);
  };

  // FDS roof pocket: a V that peaks over the middle of the finger (seen from the front)
  const gable = (s) => {
    const tri = r
      .draw([s.xs - 0.1, s.zRoof - 0.5])
      .lineTo([s.xs + s.w + 0.1, s.zRoof - 0.5])
      .lineTo([s.xs + s.w + 0.1, s.zRoof])
      .lineTo([s.xs + s.w / 2, s.zRoof + s.peak])
      .lineTo([s.xs - 0.1, s.zRoof])
      .close();
    const solid = tri.sketchOnPlane("XZ").extrude(-L.yF + 4);
    const [lo, hi] = solid.boundingBox.bounds;
    return solid.translate([0, L.yF / 2 - (lo[1] + hi[1]) / 2, 0]);
  };

  // cutting tools shared by every slice: cord tunnel, clamp rods, roller pin holes
  let tools = cordTunnel(r, L);
  for (const rod of L.rods) tools = tools.fuse(r.makeCylinder(DIM.rodR, L.width + 4, [-2, rod.y, rod.z], [1, 0, 0]));
  for (const s of L.slots) {
    tools = tools.fuse(r.makeCylinder(DIM.pinHoleR, s.w + 2 * DIM.pinDepth, [s.xs - DIM.pinDepth, s.yc, s.zc], [1, 0, 0]));
  }

  const parts = [];
  L.slots.forEach((s, i) => {
    const wall = prism(body(), s.wallX, t);
    let fill = prism(body().cut(cavity(s)), s.xs, s.w);
    if (device === "fds") fill = fill.cut(gable(s));
    parts.push({ name: `slice_${i + 1}_${s.name}`, kind: "frame", shape: wall.fuse(fill).cut(tools.clone()) });
  });
  parts.push({ name: "slice_5_end", kind: "frame", shape: prism(body(), L.endX, t).cut(tools.clone()) });
  for (const s of L.slots) parts.push({ name: `roller_${s.name}`, kind: "roller", shape: makeRoller(r, s) });
  tools.delete?.();

  let out = parts;
  if (mirrored(side)) out = parts.map((p) => ({ ...p, shape: p.shape.mirror("YZ", [L.width / 2, 0, 0]) }));
  return { parts: out, layout: L, info: summarize(L, side) };
}

/** True for the hand whose parts are the mirror image of the layout (pinky at x = 0 is the left hand). */
export const mirrored = (side) => side === "right";

function rollerDip(r) {
  const R = DIM.roller;
  return clamp(R.dipK * 2 * r, ...R.dip);
}

/** Spool roller turned from a profile: chamfered ends, raised rims, concave waist, bore for the pin. */
function makeRoller(r, s) {
  const len = s.w - 2 * DIM.rollerSide;
  const R = s.r;
  const { chamfer: c, rim: e } = DIM.roller;
  const profile = r
    .draw([0, 0])
    .lineTo([0, R - c])
    .lineTo([c, R])
    .lineTo([e, R])
    .threePointsArcTo([len - e, R], [len / 2, R - s.dip])
    .lineTo([len - c, R])
    .lineTo([len, R - c])
    .lineTo([len, 0])
    .close();
  const solid = profile.sketchOnPlane("XY").revolve([1, 0, 0], { origin: [0, 0, 0] });
  const bored = solid.cut(r.makeCylinder(DIM.boreR, len + 2, [-1, 0, 0], [1, 0, 0]));
  return bored.translate([s.xs + DIM.rollerSide, s.yc, s.zc]);
}

/** Cord tunnel inside the top block: down at xa, along the block, up at xb, rounded corners. */
function cordTunnel(r, L) {
  const { xa, xb, y, zh, bend, half } = L.cord;
  const top = L.zTop + 3 + bend + half; // top corners of both rectangles sit above the frame
  const rr = (x0, x1, z0, z1, rad) => r.drawRoundedRectangle(x1 - x0, z1 - z0, rad).translate([(x0 + x1) / 2, (z0 + z1) / 2]);
  const profile = rr(xa - half, xb + half, zh - half, top, bend + half).cut(rr(xa + half, xb - half, zh + half, top + 5, bend - half));
  const solid = profile.sketchOnPlane("XZ").extrude(2 * half);
  const [lo, hi] = solid.boundingBox.bounds;
  return solid.translate([0, y - (lo[1] + hi[1]) / 2, 0]);
}

/** Rotate a part so it prints flat with no supports, then drop it onto z = 0. */
export function printOrient(shape, kind, side) {
  // slices: wall face down, so the pull runs along the layers.
  // rollers: end face down. Both are a quarter turn about Y.
  const s = shape.rotate(mirrored(side) ? 90 : -90, [0, 0, 0], [0, 1, 0]);
  const [min] = s.boundingBox.bounds;
  return s.translate([-min[0], -min[1], -min[2]]);
}

function summarize(L, side) {
  const fdp = L.device === "fdp";
  return {
    device: L.device,
    side,
    width: L.width,
    depth: -L.yF,
    height: L.zTop - L.zBottom,
    cord: { x: mirrored(side) ? L.width - L.cord.x : L.cord.x, diameter: 2 * L.cord.half, spread: round1(L.cord.spread) },
    slots: L.slots.map((s) => ({
      name: s.name,
      rollerDiameter: round1(2 * s.r),
      slotWidth: round1(s.w),
      height: round1(fdp ? s.zTop : s.zApex),
      depth: fdp ? round1(s.depth) : 0,
      roofGap: round1(fdp ? s.gap : s.roofGap),
      waist: round1(2 * (s.r - s.dip)),
      pinLength: s.pinLength,
    })),
    hardware: {
      pins: L.slots.map((s) => ({ name: s.name, length: s.pinLength })),
      rods: L.rods.length,
      rodLength: Math.ceil(L.width + 14),
    },
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
function round1(v) {
  return Math.round(v * 10) / 10;
}
function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}
