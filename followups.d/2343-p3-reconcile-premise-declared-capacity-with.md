---
origin: 2343
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2343
---

# Reconcile premise's declared capacity with what calibrate-capacity measures

why now   — `node tools/calibrate-capacity.js premise` measures ceilings of 6 (square),
            3 (portrait) and 5 (mobile) at the 14-words-a-row basis, against declared
            hard limits of 8 / 6 / 8. The manifest's capacity note still says square
            and mobile fit 9+ and portrait binds at 6. The output is byte-identical on
            `main` at the time #2343 was opened, so this drift predates that PR. #2343
            changed only the side-by-side (wide) layout, where the tool still measures 9+.
where     — lib/components/statement/premise/premise.manifest.json (`capacity`,
            `adapt.capacity.tall`, `capacity.note`); the stacked-family rules in
            premise.styles.css if the fix is layout rather than a lower number.
done when — calibrate-capacity reports no declared value above its measured ceiling for
            premise in any family, and the capacity note states the measured numbers.
evidence  — calibrate-capacity output quoted in #2343's Caveats section.
verify    — `node tools/calibrate-capacity.js premise` exits with no ✗ lines.
