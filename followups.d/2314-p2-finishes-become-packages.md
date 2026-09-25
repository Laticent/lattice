---
origin: 2314
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2314
---

# Generate the shipped finish CSS from the packages' recipes (the rest of phase 2)

Spec: `engineering/decisions/2026-09-23-portable-packages.md` §3.6 and §10 (phase 2 entry).

```text
why now   — the packages and their recipes landed; the CSS is the last hand-kept copy of each preset.
where     — finish-generate.ts → lib/finishes/; lib/base/base.finish.css preset bodies; build-css.js.
decide    — the owner picks one, per §10's measured table:
            (a) grow the vocabulary: a thin `rule` mark, a `hairline` wash strip, a corner-anchored
                glyph placement, and a hand-tunable rich fold, then generate all nine exactly;
            (b) generate all nine as-is and sign off the changed exports (5 of 9 presets move);
            (c) generate the four that already match (halo, ledger, nimbus, loom) and keep the other
                five as a gated hand-CSS exception list.
            Recommendation: (a) for atrium, strata and the glyph anchor, which are real design details
            the Studio can't make today; ledger's rich fold is a rounding difference and can take (b).
            OWNER DECIDED (2026-09-25): (a) — teach the recipes the missing details, then generate
            all nine exactly. The export sign-off still applies to whatever bytes move.
done when — every shipped preset's CSS is generated from its recipe, or is on a gated exception list,
            and generated rules use the shipped one-class selector so deck overrides still win.
evidence  — the per-preset pixel-diff table (print + screen, light + dark, with glyphs), and dark + light PDFs.
verify    — tier 1 checker plus the owner's export sign-off (exported bytes change).
```
