---
origin: 2248
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2248#issuecomment-5753967687
---

# Fix `buildReadingArticleDocument` the same way — IT IS BROKEN ON MAIN NOW

Backfilled verbatim from the continuation brief on #2248 (merged 2026-09-21).
Triaged 2026-09-24 against `main` at 6110a1e: still open. `buildReadingArticleDocument` (`lattice-emulator.js:5588`) still `require`s jsdom. This item also covers what remained of #2241 P1: #2248 already moved the captions path into the open browser.

```text
  P1 · [no ticket] Fix `buildReadingArticleDocument` the same way — IT IS BROKEN ON MAIN NOW
       why now   — #2246 landed it with the SAME three jsdom windows and the SAME
                   published-install break. jsdom is a devDependency, so it throws outside
                   this repo, returns '', and the caller "keeps the clean slide render" —
                   reader-mode article projection silently never appears for anyone who
                   npm-installed the package. It is a shipped regression, not a cleanup.
       where     — lattice-emulator.js `buildReadingArticleDocument`; mirror
                   projectDeckSpeechFromHtml exactly, including the `browser.connected`
                   classifier and the guarded scratch-page close. It needs
                   `projectDeckToProse` where captions use `projectDeckToScript`, so add a
                   sibling export to tools/build-speech-projection-bundle.js rather than a
                   second bundle. NOTE it must also be hoisted above the OUT_FORMAT branch:
                   every branch closes the browser before the tail of renderBody.
       done when — the reader article is byte-identical to the jsdom output across
                   test/integration/invariants/read-export.test.js's decks, AND it still
                   produces an article with node_modules/jsdom moved aside.
       evidence  — the byte comparison both ways + the jsdom-hidden repro (recipe in
                   2026-09-20-chromium-caption-projection.md § "broken in every published
                   install"). "Tests pass" is not evidence here.
       verify    — tier 1 checker: engine/export path, and this exact change hid a defect
                   that took two review rounds to find.
```
