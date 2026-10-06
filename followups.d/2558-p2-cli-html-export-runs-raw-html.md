---
origin: 2558
priority: P2
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2558
---

# The CLI HTML export keeps a deck's raw HTML as written

why now   — a recipient of an exported .html runs the author's `<img onerror>`. The browser-side share
            export drops script and `on*` (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
            § 5); the CLI path does not.
where     — dist/lattice-emulator.js HTML output, lib/export/; the threat model in the note above, §§ 5, 9.
            Repro: a slide holding `<img src=x onerror="top.p=1">`, exported with or without `html: true`;
            open it in Chromium and `window.p` is 1.
done when — the call is made on whether this is by design (the author's own deck). If it is not, the
            export drops script and `on*` as share-export.ts does; that is an export change, so the owner
            signs off before merge.
evidence  — the repro before and after in real Chromium; a demo deck exported light and dark.
verify    — tier 2 trio, because it is a security boundary on exported bytes.
