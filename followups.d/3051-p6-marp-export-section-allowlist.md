---
origin: 3051
priority: P6
recorded: 2026-11-10
area: engine
severity: low
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md §11
deferred: off-path — pre-existing in the Export-to-Marp bundle, which the engine's section rename does not reach; changing its allowlist changes that export's bytes
---

# Export to Marp still lets a raw `</section><section>` through

```text
  P6 · [no ticket] the Marp bundle's tag allowlist names `section`
       why now   — the independent checker on the 2026-11-10 section-tag rename: the engine now
                   renames a raw `<section>` in author HTML (lib/core/reserved-attrs.mjs), but
                   the Export-to-Marp bundle hands the deck's markdown to marp-core with its own
                   allowlist, and lib/export/marp-bundle-html.js:64 lists `section: []`, so a raw
                   `</section><section>` there still opens a new slide in the recipient's Marp.
       where     — lib/export/marp-bundle-html.js, the marp-cli `html` allowlist.
       done when — a raw section tag in a deck cannot add a slide to the Export-to-Marp bundle's
                   rendered output, with a test on the bundle.
       evidence  — a two-slide deck with `</section><section>` exported to Marp, slide count
                   before and after.
       verify    — tier 1 checker; it changes an export.
```
