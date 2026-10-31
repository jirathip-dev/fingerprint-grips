// Print settings the app tells you to use, and the section maths that goes with them.
//
// The hand-calc strength screens count only the solid shell a slicer prints: walls (perimeters)
// on faces that print upright, top/bottom layers on faces that print flat. Sparse infill is left
// out (at 15% gyroid it adds little), so a thick section is checked as the hollow box it really
// prints as, not as solid plastic. Thin sections come out solid on their own.

export const PRINT = {
  layer: 0.2, // mm
  walls: 5,
  lineW: 0.45, // mm per wall line (Bambu default for a 0.4 mm nozzle)
  topBottom: 10, // layers: the top and bottom skins carry most of a flat beam's bending
  infill: 15, // %
  pattern: "gyroid",
  temp: 250, // °C nozzle: layers bond best near the top of PETG's range
  flow: 0.95,
};
export const WALL = PRINT.walls * PRINT.lineW; // 2.25 mm of walls on an upright face
export const SKIN = PRINT.topBottom * PRINT.layer; // 2.0 mm of top/bottom on a flat face

/** Tie pins: thin blind holes (r 1) through a sparse-infill zone. The slicer walls each one, so
 *  each leaves a solid column 2 r + 2 WALL across. Used where a load enters (joint faces, a cord
 *  hole roof), so those zones print solid without any slicer modifiers. */
export const TIE = { r: 1, col: 2 * 1 + 2 * WALL, pitch: 2 * WALL + 1.5 }; // pitch: next column overlaps

/** One-line print settings for the instructions. */
export const printLine = () =>
  `PETG, ${PRINT.layer.toFixed(2)} mm layers, ${PRINT.walls} walls, ${PRINT.topBottom} top + ${PRINT.topBottom} bottom layers, ${PRINT.infill}% ${PRINT.pattern} infill, no supports`;

/**
 * A rectangle b wide and d deep, bent so the fibres furthest out are at +-d/2, printed as a shell:
 * tb thick on the two faces that close off b, td thick on the two faces that close off d.
 * Returns area A, second moment I, section modulus Z, and shear(V): the shear stress at the middle
 * (V Q / I t, where only the shell carries it).
 */
export function shell(b, d, tb, td) {
  const bi = Math.max(0, b - 2 * tb), di = Math.max(0, d - 2 * td);
  const hollow = bi > 0 && di > 0;
  const A = hollow ? b * d - bi * di : b * d;
  const I = hollow ? (b * d ** 3 - bi * di ** 3) / 12 : (b * d ** 3) / 12;
  const Q = hollow ? (b * d * d) / 8 - (bi * di * di) / 8 : (b * d * d) / 8;
  const t = hollow ? b - bi : b;
  return { A, I, Q, t, Z: I / (d / 2), hollow, shear: (V, tEff = t) => (V * Q) / (I * Math.min(b, tEff)) };
}

/**
 * Any section made of axis-aligned rectangles [u0, u1, v0, v1] (u across, v up as printed),
 * printed as a shell: material within `tw` of air across (walls) or `ts` of air up/down (top and
 * bottom layers), or anywhere inside a `solid` rectangle (tied with tie pins). Bent about a
 * horizontal axis. Returns area, centroid height vc, I about it, and
 * the distance from it to the furthest material (c). Raster, 0.1 mm.
 */
export function shellSection(rects, tw, ts, step = 0.1, solid = []) {
  const inside = (u, v) => rects.some(([u0, u1, v0, v1]) => u > u0 && u < u1 && v > v0 && v < v1);
  const U0 = Math.min(...rects.map((q) => q[0])), U1 = Math.max(...rects.map((q) => q[1]));
  const V0 = Math.min(...rects.map((q) => q[2])), V1 = Math.max(...rects.map((q) => q[3]));
  const near = (u, v, du, dv, t) => {
    for (let s = step; s <= t + 1e-9; s += step) if (!inside(u + du * s, v + dv * s)) return true;
    return false;
  };
  const cells = [];
  for (let u = U0 + step / 2; u < U1; u += step)
    for (let v = V0 + step / 2; v < V1; v += step)
      if (inside(u, v) && (solid.some(([u0, u1, v0, v1]) => u > u0 && u < u1 && v > v0 && v < v1) || near(u, v, 1, 0, tw) || near(u, v, -1, 0, tw) || near(u, v, 0, 1, ts) || near(u, v, 0, -1, ts))) cells.push(v);
  // plain loops: tens of thousands of cells, too many to spread into Math.max in a worker
  const a = step * step;
  const A = cells.length * a;
  let sum = 0;
  for (const v of cells) sum += v;
  const vc = sum / cells.length;
  let I = 0, c = 0;
  for (const v of cells) {
    I += (v - vc) ** 2 * a + (a * a) / 12;
    c = Math.max(c, Math.abs(v - vc));
  }
  return { A, vc, I, c: c + step / 2 };
}
