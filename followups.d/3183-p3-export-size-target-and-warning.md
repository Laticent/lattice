---
origin: 3183
priority: P3
recorded: 2026-11-13
area: website
severity: medium
swimlane: engineering/decisions/2026-07-07-html-lattice-player.md
deferred: blocked — the owner wants to discuss the target before it is built (2026-11-13); the nightly gate stays nightly by the owner's 2026-11-03 ruling
source: https://github.com/Laticent/lattice/pull/3183
---

# No export ever says it is large, and no gate says what small is

why now   — The 2026-07-07 player note asked for a warning near 10 MB; it was never built. The size guards
            (docs/e2e/export-photo-size.spec.ts, pptx-export-photo-size.spec.ts) use one to three synthetic gradient photos and
            only catch a rise, so every check passed while the owner's photo decks exported at 10 to 16 MB.
where     — the Share sheet panels (docs/src/components/studio/ExportOptionsPanel.tsx, WebpageOptionsPanel.tsx), the CLI's export
            summary, the nightly size specs.
done when — an export past the threshold says so before or as it downloads, with what would shrink it; the nightly gate holds
            per-format targets measured on licensed real photos, not synthetic ones.
evidence  — the warning on the real Share sheet at three widths; the gate red on a seeded regression.
verify    — tier 1 checker.
