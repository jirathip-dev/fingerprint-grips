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
and sit dead centre, the same distance from both ends. No
external loop to snap.

## Parts to buy

The app lists exactly what your build needs (sizes and lengths), with example shop searches for [Lazada TH](https://www.lazada.co.th) and [AliExpress](https://www.aliexpress.com). The same list goes in the zip's README. They're searches, not product links: check the size on the listing.

| Part | Example search (Lazada TH) | Notes |
|---|---|---|
| 3 mm steel rod (roller pins) | [เพลาสแตนเลส 3 มม](https://www.lazada.co.th/catalog/?q=%E0%B9%80%E0%B8%9E%E0%B8%A5%E0%B8%B2%E0%B8%AA%E0%B9%81%E0%B8%95%E0%B8%99%E0%B9%80%E0%B8%A5%E0%B8%AA%203%20%E0%B8%A1%E0%B8%A1) | cut to the lengths in the app |
| M4 threaded rod | [สตัด เกลียวตลอด M4](https://www.lazada.co.th/catalog/?q=%E0%B8%AA%E0%B8%95%E0%B8%B1%E0%B8%94%20%E0%B9%80%E0%B8%81%E0%B8%A5%E0%B8%B5%E0%B8%A2%E0%B8%A7%E0%B8%95%E0%B8%A5%E0%B8%AD%E0%B8%94%20M4) | 1 m, cut with a hacksaw |
| M4 nuts + washers | [น็อตตัวเมีย M4 สแตนเลส](https://www.lazada.co.th/catalog/?q=%E0%B8%99%E0%B9%87%E0%B8%AD%E0%B8%95%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B9%80%E0%B8%A1%E0%B8%B5%E0%B8%A2%20M4%20%E0%B8%AA%E0%B9%81%E0%B8%95%E0%B8%99%E0%B9%80%E0%B8%A5%E0%B8%AA) | |
| 5–6 mm cord | [เชือก prusik 6 มม](https://www.lazada.co.th/catalog/?q=%E0%B9%80%E0%B8%8A%E0%B8%B7%E0%B8%AD%E0%B8%81%20prusik%206%20%E0%B8%A1%E0%B8%A1) | climbing accessory cord is best |
| Compression springs | [สปริงกด ลวด 2 มิล วงนอก 16](https://www.lazada.co.th/catalog/?q=%E0%B8%AA%E0%B8%9B%E0%B8%A3%E0%B8%B4%E0%B8%87%E0%B8%81%E0%B8%94%20%E0%B8%A5%E0%B8%A7%E0%B8%94%202%20%E0%B8%A1%E0%B8%B4%E0%B8%A5%20%E0%B8%A7%E0%B8%87%E0%B8%99%E0%B8%AD%E0%B8%81%2016) | platform only; the app makes the search from your spring size |
| Climbing carabiner | [คาราบิเนอร์ ปีนเขา kN](https://www.lazada.co.th/catalog/?q=%E0%B8%84%E0%B8%B2%E0%B8%A3%E0%B8%B2%E0%B8%9A%E0%B8%B4%E0%B9%80%E0%B8%99%E0%B8%AD%E0%B8%A3%E0%B9%8C%20%E0%B8%9B%E0%B8%B5%E0%B8%99%E0%B9%80%E0%B8%82%E0%B8%B2%20kN) | Tindeq use; look for a kN rating |

Not endorsements, no affiliate links. Any hardware or climbing shop works too.

**Spring load:** the platform always has seats for 4 springs. Fit 2 (opposite corners) or 4 without reprinting; one rail is marked for 2 springs, the other for 4. For a harder start, wind the nuts behind the carriage in to pre-tension the springs. The top load stays the same (the stops set it) and the marks still read right.

## Add-ons

Pick one under **Add-on**. It's sized around the gripper you configured and goes in the same zip (`print/addon/`).

**Platform** (table or floor). One print, used every way, in the spirit of the [Crimpdeq platform](https://platform.crimpdeq.com/introduction) and [Crimpy](https://www.instagram.com/crimpy.official/). The gripper lies on its back between two rails and the cord runs straight down the middle: gripper → Tindeq bay → anchor wall → spring section.

| Load | How | You read |
|---|---|---|
| Tindeq | Tindeq in the bay, far eye clipped round the bridge in the anchor wall | Tindeq app |
| Springs | cord through the wall to the spring carriage, no Tindeq | 5 kg marks on the rails, from the spring maths |
| Both | Tindeq in the bay, then on through the wall to the springs | Tindeq app: real force, and a check on the rail marks |

| Push with | How |
|---|---|
| Palm | platform on a table, heel of the hand on the rounded rest |
| Legs | platform on the floor, sitting, soles against the front of the rest, cord through the slot in it |

Buy: 2 × M4 threaded rod + nuts; for springs, 2–4 compression springs (any shop size: enter wire / OD / length / coils) and 2–4 short M4 rods as spring guides; a carabiner for the Tindeq.

**Foot plate** (one foot). A lug each side of your foot (120 mm between them); a cord from each lug meets the other at the Tindeq's lower eye at least 250 mm up, so the pull stays centred under one foot. Hang the gripper from the Tindeq's top eye and pull up.

- The Tindeq Progressor 200 is about 100 × 55 × 25 mm (19 mm at the ends), eyes ~69 mm apart: measured from photos, ±2 mm. The platform never clamps it, so the exact size doesn't matter; it only needs clearance, including over the extra distance it moves when springs are fitted.
- Springs: rate `k = G d⁴ / (8 D³ nₐ)`. The travel stops before the wire would take a set (Wahl-corrected shear ≤ 40% of the wire's tensile strength) or the coils touch. Cheap springs vary about ±20%: check once with the Tindeq (load "both").
- Each add-on is paper-screened at its rating × 2 (platform: 60 kg or the full spring load, whichever is higher; foot plate: 100 kg) with **assumed** PETG limits (20 MPa along layers, 6 MPa across). That's a sanity check, not a load test.
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
- a cord tunnel that is not fully enclosed, has no floor or roof, is closed at the top, breaks into a finger slot, has holes closer than 55% of the width, or is off-centre
- a finger can't get in: no open path from below, in front of the roller, up over it to the roof
- a roller without raised rims or a waist, or a waist deeper than 3 mm
- FDP: no roof, roof gap closed, no ledge behind the roller or ledge above the roller top, back open
- FDS: blocked behind the roller, roof without a V peak or closer than one roller radius, roller not equal to the middle segment
- a part that does not fit a 256 mm bed or is not lying on it
- bad measurements that are accepted
- a right-hand gripper that has the pinky on the left (seen from the hand side), or the reverse

and for each add-on (FDP + FDS, platform with 2 and 4 springs):

- a printed piece that is not watertight or doesn't fit the bed
- the gripper clashing with the platform, or not resting on the ledges, at either end of its travel; no room under an FDS gripper for the fingertips
- a palm rest more than 6 mm off the middle finger's way in, or not full width
- anything printed in the straight cord line from the front of the rest (leg-push slot) to behind the spring carriage; a slot too wide for the rest
- a printed part within 2 mm of the Tindeq anywhere along its run (it moves when springs are fitted), the Tindeq reaching the gripper's knot, side guides missing, the wall window closed or with no bridge above it
- springs touching the frame; the carriage hitting the frame early, or nothing stopping it at full travel; a spring rate that disagrees with the hand calculation; the wire overloaded at full squeeze; kg marks in the wrong place
- foot plate: less than 110 mm for the foot, anything sticking up where the foot goes, either lug hole blocked or without a bridge, a cord rubbing the plate or pressing on the top of the foot
- any piece over its assumed limit in the strength screen; bad spring sizes that are accepted

## Layout

```
index.html          page + form
src/main.js         UI, three.js viewer, zip download
src/worker.js       CAD kernel in a Web Worker (page never freezes)
src/model.js        geometry + fit maths + validation (pure, also runs in Node)
src/accessories.js  add-ons: platform (Tindeq / springs / both), foot plate, spring maths, strength screen
scripts/check.mjs   geometry gate
```

## Download contents

A zip named `fingerprint-grips-<fdp|fds>-<side>[-<addon>].zip`: add-on parts in `print/addon/`; `print/slice_1..5_*.stl` (frame slices, already lying flat), `print/roller_<finger>.stl` × 4,
`assembled.step`, `measurements.json`, `PRINT-ME.txt` (Bambu Studio settings,
hardware list with pin and rod lengths, assembly, safety).

## Licence

MIT (see `LICENSE`). Third-party code and design credits: `THIRD_PARTY.md`.
