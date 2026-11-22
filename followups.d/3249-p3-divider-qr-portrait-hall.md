---
origin: 3249
priority: P3
recorded: 2026-11-16
area: anchor
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: off-path — a pre-existing overflow in the qr variant's layout, already counted in the fit baseline; the divider fix that found it is a copy fix to another slide, and this needs its own layout PR, demo deck and review (#17)
source: https://github.com/Laticent/lattice/pull/3249
---

# divider qr: the heading and the code overrun the bands at portrait@hall

why now   — found while closing 3226-p4: divider s5 (`divider qr`) is the one clip left at portrait@hall, 211px past the box.
where     — lib/components/anchor/divider/ (the qr variant's heading size and code cap at a hall venue on a tall box).
done when — divider s5 at portrait@hall keeps its heading clear of the running header and its code clear of the footer, and the cell scores clip 0.
evidence  — at portrait@hall the five-line heading starts under "LATTICE · DIVIDER", and the code card runs into the footer line; the export probe reports 211px of overflow.
verify    — `node tools/fit-harness.js --sizes square,portrait,story --venues laptop,hall --packs none --edits none --only divider/ --ratchet test/fit/baseline.json`
