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
Both: the cord goes down one hole in the top block, along a tunnel and up the
other hole. The holes sit about 65% of the width apart (a wide, stable stance)
and are centred on the finger load centre, so the gripper hangs level. No
external loop to snap.

## Add-ons

Pick one under **Add-on**. It's sized around the gripper you configured and goes in the same zip.

| | Table rig (Tindeq) | Spring trainer (portable) | Foot plate (Tindeq) |
|---|---|---|---|
| Like | the [Crimpdeq platform](https://platform.crimpdeq.com/introduction) | [Crimpy](https://www.instagram.com/crimpy.official/) | a strap anchor |
| How | gripper lies on its back; palm pushes the rest, fingers pull; Tindeq hangs in line on its eyes between the cord and the anchor wall | same rig, but steel compression springs push back; swap or add springs for more load | stand on the plate, carabiner from the fin to the Tindeq, pull up |
| Buy | 2 × M4 rod + nuts, 1 carabiner | 2 × M4 rod, 2–4 compression springs (any shop size, enter wire / OD / length / coils), 2–4 short M4 rods as spring guides | 1 carabiner |
| Load shown | Tindeq app | kg marks on the rails every 5 kg, from the spring maths | Tindeq app |

- The Tindeq Progressor 200 is about 100 × 58 × 25 mm with 17 mm eyes ~69 mm apart (measured from a photo, ±2 mm). The rig never clamps it, so the exact size doesn't matter; it only needs clearance.
- Springs: rate `k = G d⁴ / (8 D³ nₐ)`. The travel stops before the wire would take a set (Wahl-corrected shear ≤ 40% of the wire's tensile strength) or the coils touch. Cheap springs vary about ±20%, so check once against a scale.
- Each add-on is paper-screened at its rating × 2 (table and spring: 60 kg, foot plate: 100 kg) with **assumed** PETG limits (20 MPa along layers, 6 MPa across). That's a sanity check, not a load test.
- Not affiliated with Crimpdeq or Crimpy; their designs aren't copied, only the idea of a palm-push rig and a spring trainer.

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
- a cord tunnel that is not fully enclosed, has no floor or roof, is closed at the top, breaks into a finger slot, has holes closer than 55% of the width, or is off the load centre
- a finger can't get in: no open path from below, in front of the roller, up over it to the roof
- a roller without raised rims or a waist, or a waist deeper than 3 mm
- FDP: no roof, roof gap closed, no ledge behind the roller or ledge above the roller top, back open
- FDS: blocked behind the roller, roof without a V peak or closer than one roller radius, roller not equal to the middle segment
- a part that does not fit a 256 mm bed or is not lying on it
- bad measurements that are accepted
- a right-hand gripper that has the pinky on the left (seen from the hand side), or the reverse

and for each add-on (FDP + FDS):

- a printed piece that is not watertight or doesn't fit the bed
- the gripper clashing with the rig, or not resting on the ledges, at either end of its travel
- a palm rest more than 6 mm off the middle finger's way in, or with no bar in the middle
- anything printed in the straight cord line from the gripper to the anchor
- table rig: a printed part within 2 mm of the Tindeq, side guides missing, the carabiner window closed or with no bridge above it
- spring trainer: springs touching the frame; the carriage hitting the frame early, or nothing stopping it at full travel; a spring rate that disagrees with the hand calculation; kg marks in the wrong place
- foot plate: carabiner hole blocked, no bridge above it
- any piece over its assumed limit in the strength screen; bad spring sizes that are accepted

## Layout

```
index.html          page + form
src/main.js         UI, three.js viewer, zip download
src/worker.js       CAD kernel in a Web Worker (page never freezes)
src/model.js        geometry + fit maths + validation (pure, also runs in Node)
src/accessories.js  add-ons: table rig, spring trainer, foot plate, spring maths, strength screen
scripts/check.mjs   geometry gate
```

## Download contents

A zip named `fingerprint-grips-<fdp|fds>-<side>[-<addon>].zip`: add-on parts in `print/addon/`; `print/slice_1..5_*.stl` (frame slices, already lying flat), `print/roller_<finger>.stl` × 4,
`assembled.step`, `measurements.json`, `PRINT-ME.txt` (Bambu Studio settings,
hardware list with pin and rod lengths, assembly, safety).

## Licence

MIT (see `LICENSE`). Third-party code and design credits: `THIRD_PARTY.md`.
