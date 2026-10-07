---
origin: 2575
priority: P3
recorded: 2026-10-07
source: https://github.com/Laticent/lattice/pull/2575
---

# The Studio's in-browser Export to Marp drops `sample:` pictures

```text
why now   — #2575 made `sample:` the way every template and gallery names a picture. The CLI's
            Export to Marp copies those files into the bundle (tools/export-marp.js
            localizeOne), but the Studio's in-browser producer (deck-export.js exportMarp) has
            no filesystem. It passes `localAssets: false`, so a `logo: sample:…` is dropped and
            a body `![](sample:…)` ships as written. Marp cannot read it either way. This was
            already true for every relative picture before #2575.
where     — docs/src/components/studio/export/deck-export.js exportMarp;
            lib/core/deck-front-matter.js withoutLocalAssetRefs.
done when — the producer fetches each well-formed `sample:` file from the site's staged
            samples/ (docs/src/lib/samples-base.ts), writes it to the zip's assets/, and
            rewrites the reference, front-matter `logo:` included.
evidence  — a Studio Marp export of a deck with a `sample:` logo and photo, opened in marp-cli.
verify    — a unit test on exportMarp's zip contents.
```
