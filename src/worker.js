// CAD runs here, off the main thread, so the page never freezes while a model builds.
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import * as replicad from "replicad";
import { buildGripper, printOrient, validate } from "./model.js";

const ready = (async () => {
  const OC = await opencascade({ locateFile: () => wasmUrl });
  replicad.setOC(OC);
})();

function free(shapes) {
  for (const s of shapes) s?.delete?.();
}

self.onmessage = async ({ data }) => {
  const { id, type, hand, side, device } = data;
  try {
    await ready;
    const problems = validate(hand);
    if (problems.length) {
      self.postMessage({ id, ok: false, problems });
      return;
    }
    const t0 = performance.now();
    const { parts, info } = buildGripper(replicad, hand, { device, side });

    if (type === "preview") {
      const meshes = parts.map((p) => {
        const m = p.shape.mesh({ tolerance: 0.1, angularTolerance: 0.3 });
        return {
          name: p.name,
          kind: p.kind,
          vertices: new Float32Array(m.vertices),
          normals: new Float32Array(m.normals),
          triangles: new Uint32Array(m.triangles),
        };
      });
      free(parts.map((p) => p.shape));
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
      // assembled reference: every part in place, editable in any CAD tool
      let asm = parts[0].shape.clone();
      for (const p of parts.slice(1)) asm = asm.fuse(p.shape.clone(), { optimisation: "none" });
      files.push({ name: "assembled.step", data: new Uint8Array(await asm.blobSTEP().arrayBuffer()) });
      free([asm, ...parts.map((p) => p.shape)]);
      self.postMessage({ id, ok: true, type, files, info }, files.map((f) => f.data.buffer));
    }
  } catch (err) {
    self.postMessage({ id, ok: false, problems: [`The model could not be built: ${err?.message ?? err}`] });
  }
};
