// CAD runs here, off the main thread, so the page never freezes while a model builds.
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import * as replicad from "replicad";
import { buildGripper, printOrient, validate } from "./model.js";
import { rigLayout, buildRig, rigGhosts, buildFoot, footLayout, footGhosts, placeInRig, placeOverFoot, printOrientAddon, validateSpring, massG, SPRING_DEFAULT, ADDON_DIM } from "./accessories.js";

const ready = (async () => {
  const OC = await opencascade({ locateFile: () => wasmUrl });
  replicad.setOC(OC);
})();

function free(shapes) {
  for (const s of shapes) s?.delete?.();
}
const toMesh = (p) => {
  const m = p.shape.mesh({ tolerance: 0.1, angularTolerance: 0.3 });
  return {
    name: p.name,
    kind: p.kind,
    vertices: new Float32Array(m.vertices),
    normals: new Float32Array(m.normals),
    triangles: new Uint32Array(m.triangles),
  };
};

/** Build the add-on (if any). Returns { parts (printed), ghosts, info, place(shape) }. */
function buildAddon(addon, gripper, spring, load, brace) {
  if (addon === "foot") {
    const P = footLayout();
    const parts = buildFoot(replicad, P);
    const g = footGhosts(replicad, P);
    return { parts, ghosts: g.ghosts, info: addonInfo("foot", P, parts), place: (s) => placeOverFoot(s, gripper.layout, gripper.info.cord.x, g.gripperTop, P) };
  }
  const R = rigLayout(gripper.layout, gripper.info, spring);
  if (R.problems?.length) throw Object.assign(new Error(R.problems[0]), { problems: R.problems });
  const parts = buildRig(replicad, R);
  const info = { ...addonInfo("platform", R, parts), load, brace, notch: ADDON_DIM.palm.notch };
  return { parts, ghosts: rigGhosts(replicad, R, load), info, place: (s) => placeInRig(s, gripper.layout, R.zl, R.gripperX0) };
}

function addonInfo(kind, R, parts) {
  const grams = parts.reduce((g, p) => g + massG(replicad.measureVolume(p.shape)), 0);
  const base = { kind, grams, pieces: parts.map((p) => p.name), screen: R.screen };
  if (kind === "foot") return { ...base, size: [R.len, R.width], gap: R.gap, apex: R.apex };
  const info = { ...base, length: Math.round(R.xEnd), width: Math.round(2 * R.outer), rodLength: R.rodLength, travel: 50, palmHeight: R.Zp };
  {
    const s = R.spring;
    info.spring = { count: s.count, k: +s.k.toFixed(2), travel: +s.travel.toFixed(1), totalKg: +s.totalKg.toFixed(1), kgPerMm: +s.kgPerMm.toFixed(2), limitedBy: s.limitedBy, od: s.OD, wire: s.d, length: s.L0, marks: R.marks.map((m) => m.kg), guideLength: Math.ceil(R.xEnd - R.xW0 + 10) };
  }
  return info;
}

self.onmessage = async ({ data }) => {
  const { id, type, hand, side, device, addon = "none", spring, load = "tindeq", brace = "palm" } = data;
  const usesSprings = addon === "platform" && load !== "tindeq";
  try {
    await ready;
    const problems = [...validate(hand), ...(usesSprings ? validateSpring(spring) : [])];
    if (problems.length) {
      self.postMessage({ id, ok: false, problems });
      return;
    }
    const t0 = performance.now();
    const gripper = buildGripper(replicad, hand, { device, side });
    const { parts, info } = gripper;
    // the spring section is always printed; without springs it is sized for the default spring
    const extra = addon === "none" ? null : buildAddon(addon, gripper, usesSprings ? spring : SPRING_DEFAULT, load, brace);
    if (extra) info.addon = extra.info;

    if (type === "preview") {
      const shown = extra ? parts.map((p) => ({ ...p, shape: extra.place(p.shape) })) : parts;
      const all = [...shown, ...(extra ? [...extra.parts, ...extra.ghosts] : [])];
      const meshes = all.map(toMesh);
      free(all.map((p) => p.shape));
      const transfer = meshes.flatMap((m) => [m.vertices.buffer, m.normals.buffer, m.triangles.buffer]);
      self.postMessage({ id, ok: true, type, meshes, info, ms: Math.round(performance.now() - t0) }, transfer);
      return;
    }

    if (type === "export") {
      const files = [];
      // print-ready STLs: each part already turned flat-side down on the bed
      for (const p of parts) {
        const oriented = printOrient(p.shape.clone(), p.kind, side);
        const stl = oriented.blobSTL({ tolerance: 0.05, angularTolerance: 0.2, binary: true });
        files.push({ name: `print/${p.name}.stl`, data: new Uint8Array(await stl.arrayBuffer()) });
        oriented.delete?.();
      }
      for (const p of extra?.parts ?? []) {
        const oriented = printOrientAddon(p.shape.clone(), p.print);
        const stl = oriented.blobSTL({ tolerance: 0.05, angularTolerance: 0.2, binary: true });
        files.push({ name: `print/addon/${p.name}.stl`, data: new Uint8Array(await stl.arrayBuffer()) });
        oriented.delete?.();
      }
      // assembled reference: every part in place, editable in any CAD tool
      let asm = parts[0].shape.clone();
      for (const p of parts.slice(1)) asm = asm.fuse(p.shape.clone(), { optimisation: "none" });
      files.push({ name: "assembled.step", data: new Uint8Array(await asm.blobSTEP().arrayBuffer()) });
      free([asm, ...parts.map((p) => p.shape), ...(extra ? [...extra.parts, ...extra.ghosts].map((p) => p.shape) : [])]);
      self.postMessage({ id, ok: true, type, files, info }, files.map((f) => f.data.buffer));
    }
  } catch (err) {
    self.postMessage({ id, ok: false, problems: err?.problems ?? [`The model could not be built: ${err?.message ?? err}`] });
  }
};
