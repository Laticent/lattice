---
origin: 2400
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2400
---

# One definition of a finish's export face, shared by the CLI and the Studio download

Every backdrop edge bug on 2026-09-26/27 had to be fixed twice, once per export switch.

```text
  P2 · [no ticket] define each finish slot's export face ONCE; derive both export switches.
       why now   — the CLI switch (`@media print`) and the Studio download switch
                   (`.lattice-exporting`, html-to-image) restate the same finish rules by hand,
                   in base.finish.css and in finish-generate.js's generated Fabricate rules.
                   The hard clear edge and the hard spotlight arc were written into both, so
                   #2400 and #2404 each needed a fix per switch.
       where     — lib/base/base.finish.css (the opaque flip, the register's export flip, the
                   Studio clear mask); lib/finishes/finish-generate.js generateFinishCss;
                   docs/src/components/studio/export/deck-export.js (the capture). Start with a
                   decision note in engineering/decisions/: the two targets differ (vector PDF
                   vs pixels), so the kernel names per slot what each target needs.
       done when — one source per slot generates both switches; a check fails if they drift;
                   the Studio download and the CLI PDF of backdrop-register.md match the Studio.
       evidence  — html-to-image capture (Studio path) and the CLI PDF of
                   examples/backdrop-register.md, light and dark, beside the live Studio.
       verify    — tier 1 checker, because it rewrites the export face of every finish.
```
