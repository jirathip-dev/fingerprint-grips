# Fingerprint Grips (prototype)

**Live:** https://jirathip-dev.github.io/fingerprint-grips/

Pick a gripper (FDP or FDS), enter your finger measurements, preview it in 3D,
download STL files ready for a 3D printer. Everything runs in the browser
(OpenCascade CAD kernel via [replicad](https://github.com/sgenoud/replicad));
no server, measurements never leave the device.

## Credits

- **[The Hand of God](https://handofgod.shop)** by David Quinn (mobeta): the original custom-fit roller grippers this project is inspired by. Want a professionally made one? Buy his.
- **[Open Grips](https://github.com/opengrips/Open_Grips)** (CC0): the open-source design this geometry follows.
- **[Jared-Is-Coding/Open_Grips](https://github.com/Jared-Is-Coding/Open_Grips)**: the published fit maths.

This is an independent hobby project, not affiliated with or endorsed by The Hand of God. Full credits and third-party licences: [`THIRD_PARTY.md`](THIRD_PARTY.md).

| | Claw gripper (FDP) | Pass-through gripper (FDS) |
|---|---|---|
| Grip | claw: tip hooks over the roller, end joint bent | fingers drape over the roller |
| Roller | 19 mm (pinky 30 mm) | diameter = middle segment (16–40 mm) |
| Stops | roof over the end joint; pad half on the roller, half on a ledge behind it; **closed back** (finger can't go through) | V-peaked roof ≥ one roller radius above; **open back** (tips pass through) |
| Per-finger offsets | up = length − pinky length, in = middle seg − pinky's, roof gap = tip / tan(angle) | up = length − pinky length |

Both: every roller is a spool (raised rims both ends, concave waist that centres
the finger). The hand is below and in front: each finger comes up in front of its
roller and hooks over it, so everything below and in front of the rollers is open.
Both: the cord goes down into the top block, round a U-bend tunnel, and back
out, over the load centre so the gripper hangs level. No external loop to snap.

> Status: prototype. Fit rules come from the Open Grips project and have not
> been validated on printed parts. FDS roof gap, spool waist depth (10% of
> diameter, 1.5–3 mm) and the per-finger load split are placeholders.

## Run it locally

Needs Node 20+.

```bash
git clone https://github.com/jirathip-dev/fingerprint-grips
cd fingerprint-grips
npm install          # first time only
npm run dev          # http://localhost:5173
```

Stop with `Ctrl+C`.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with live reload on http://localhost:5173 |
| `npm run dev -- --host` | Same, also reachable from phone/LAN (and Tailscale IP) |
| `npm run check` | Headless geometry gate (below) |
| `npm run build` | Static production build into `dist/` |
| `npm run preview` | Serve `dist/` locally to test the production build |

`node scripts/browser-smoke.mjs` drives the running dev server in the
a headless Chrome started with `--remote-debugging-port=9333` (or set `CDP_URL`; `SMOKE_URL` picks the page): load, edit, FDS, flip hand, bad input, untested-checkbox gate, download zip.

## Geometry gate (`npm run check`)

Builds FDP and FDS, right and left, and fails on any of:

- a part that is not a closed solid, or an STL with open edges
- a roller touching the frame or another roller; slices overlapping
- a pin hole that is blocked or breaks through the outside of its wall
- a cord tunnel that is not fully enclosed, has no floor, is closed at the top, or breaks into a finger slot
- a finger can't get in: no open path from below, in front of the roller, up over it to the roof
- a roller without raised rims or a waist, or a waist deeper than 3 mm
- FDP: no roof, roof gap closed, no ledge behind the roller or ledge above the roller top, back open
- FDS: blocked behind the roller, roof without a V peak or closer than one roller radius, roller not equal to the middle segment
- a part that does not fit a 256 mm bed or is not lying on it
- bad measurements that are accepted

## Layout

```
index.html          page + form
src/main.js         UI, three.js viewer, zip download
src/worker.js       CAD kernel in a Web Worker (page never freezes)
src/model.js        geometry + fit maths + validation (pure, also runs in Node)
scripts/check.mjs   geometry gate
```

## Download contents

A zip named `fingerprint-grips-<fdp|fds>-<side>.zip`: `print/slice_1..5_*.stl` (frame slices, already lying flat), `print/roller_<finger>.stl` × 4,
`assembled.step`, `measurements.json`, `PRINT-ME.txt` (Bambu Studio settings,
hardware list with pin and rod lengths, assembly, safety).

## Licence

MIT (see `LICENSE`). Third-party code and design credits: `THIRD_PARTY.md`.
