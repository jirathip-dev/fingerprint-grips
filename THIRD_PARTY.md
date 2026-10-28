# Credits and third-party code

## Inspiration and design sources

- **[The Hand of God](https://handofgod.shop)** by David Quinn (mobeta): the original custom-fit, frictionless roller grippers for FDP and FDS training. The ideas used here are rollers that spin so skin friction doesn't count, a wider pinky roller because the pinky twists under load, an FDS edge about the length of the second finger pad, an FDP that closes at the back, and an FDS that the fingertips pass through. If you want a professionally made, hand-measured gripper, buy one from him. This project is an independent hobby tool, **not affiliated with or endorsed by The Hand of God or David Quinn**, and does not copy its designs or files.
- **[Open Grips](https://github.com/opengrips/Open_Grips)** (CC0): the open-source FreeCAD version and its design notes (PDF v1.1). It gave the base layout (one slice per finger, rollers on steel pins), 19 mm / 30 mm rollers, the "pad half on the roller, half on the ledge" rule, a roof that stops the end joint, and an anchor over the load centre.
- **[Jared-Is-Coding/Open_Grips](https://github.com/Jared-Is-Coding/Open_Grips)**: STEP exports and the published fit maths: height = finger length − pinky length, depth = middle segment − pinky's, roof gap = tip ÷ tan(angle) at 57/60/60/55°.

## Code

| What | Licence | Used for |
|---|---|---|
| [replicad](https://github.com/sgenoud/replicad) | MIT | CAD modelling API |
| [replicad-opencascadejs](https://github.com/sgenoud/replicad) (OpenCascade compiled to WebAssembly) | LGPL-2.1-only | CAD kernel. Loaded unmodified as a separate `.wasm` file; you can swap in your own build. Source: https://github.com/Open-Cascade-SAS/OCCT |
| [three.js](https://github.com/mrdoob/three.js) | MIT | 3D preview |
| [fflate](https://github.com/101arrowz/fflate) | MIT | Zip download |
| [Vite](https://github.com/vitejs/vite) | MIT | Build tool (dev only) |

Files you download are generated from your own measurements and are yours to use.
