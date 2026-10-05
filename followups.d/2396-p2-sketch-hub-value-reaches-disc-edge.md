---
origin: 2396
priority: P2
recorded: 2026-10-05
source: engineering/decisions/2026-10-05-trama-radial-layout.md
---

# Under `mode: sketch`, hub-spoke's text estimate runs short and the hub value reaches the disc edge

why now   — found while measuring hub-spoke for the Trama decision. `HS.textWidth` bills the hand face at 0.66 em, but bold digits and symbols paint wider: `8%` measures 1.233× the estimate and the hub's `$120M` 1.126× (10.5 user units over), measured in Chromium on `examples/hub-spoke.md` with `mode: sketch`. On the `sized` and 12-satellite slides the hub value reaches the edge of the hub disc. The default monospace face is exact (worst 1.003×).
where     — `lib/core/hub-spoke-model.js` `textWidth` (`ADVANCE_HAND`), and the hub text fit that uses it.
done when — under `mode: sketch` every label's real width is at or under its estimate on the demo deck and the gallery, and the hub value sits inside the disc with its margin.
evidence  — the real ÷ estimate ratio per label before and after (Chromium `getSubStringLength` against `textWidth`), plus the two slides rendered in sketch mode.
verify    — tier 0 gates plus a rendered look. It changes what a sketch deck draws, so it ships a demo deck per HARD RULE #9.
