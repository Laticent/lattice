---
origin: 2559
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/blob/main/engineering/gotchas/export.md
---

# A 4K deck's PDF changes bytes from run to run on a busy machine: pin it, or accept it?

status    — CAUSE FOUND (2026-10-06): the PDF writer's photo of a 4K slide is a Chrome
            screenshot at deviceScaleFactor 0.667 (the 2560 px cap), and that screenshot varies
            under CPU load. Content streams, fonts and vectors are identical; only the photo
            differs, and every differing pixel matches within 5% color tolerance. Named in
            engineering/gotchas/export.md, "A 4K deck's PDF changes bytes from run to run when the
            machine is busy", and pipeline.md § 4a now states the exception. What is left is the
            OWNER's choice below, because each fix changes the bytes of every 4K export.
why now   — Segno phase 3's pixel check found examples/system-design-foundations (234 pages, 4K)
            changing on unchanged code. A deck that renders differently each time makes every
            pixel gate on it noise, and a re-blessed 4K golden churns in git.
where     — lattice-emulator.js, the `__latticePdfPhoto` binding (setViewport with
            deviceScaleFactor: scale); lib/core/pdf-compose/compose.mjs (`cap`, the 2560 px rule).
options   — measured on this sandbox; each pinned six renders, three at a time, to one output:
            A. photo at deviceScaleFactor 1, kept at 3840 px: +10% to +18% render time, +73% to
               +83% file size (system-design-foundations 11.7 MB to 20.3 MB). Sharper photo.
            B. photo at deviceScaleFactor 1 with the fast PNG encoder, downsampled to 2560 px in
               the page (createImageBitmap, resizeQuality 'high'): today's file size, +63% to +73%
               render time (gallery-jargon 18.1 s to 31.4 s; system-design-foundations 80 s to
               130.5 s).
            C. leave it: the drift is invisible, and only 4K decks rendered under load show it.
               Run pixel gates on 4K decks on an idle machine (the gotcha says so).
done when — the owner picks. A or B: the change lands with a dark and a light 4K demo render for
            export sign-off, and two `pixel-check diff` runs of system-design-foundations under
            load come back clean. C: this file is deleted, and the gotcha is the record.
verify    — tier 1 maker-checker for A or B (export pipeline); none for C.
