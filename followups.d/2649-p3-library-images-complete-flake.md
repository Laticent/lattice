---
origin: 2649
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-07-18-compose-prosemirror.md
source: https://github.com/Laticent/lattice/pull/2649
---

# library-images-complete.spec.ts:58 failed once in CI on a PR that did not touch it

```text
  P3 · [no ticket] Watch library-images-complete.spec.ts:58 for a repeat before calling it a flake
       why now   — studio-smoke failed on #2649's first run: after Enter on the image-completion menu the editor still read `<!-- _class: collage -->## Site walk- te- ` instead of the inserted `![Team shot](asset:team-shot)`. It passed 3 of 3 locally and on the single re-run, and was not shown red on main, so "likely a timing flake" is a judgment, not a measurement.
       where     — docs/e2e/library-images-complete.spec.ts line 58, the CodeMirror image completion from the Library Images work.
       done when — either the spec fails again on an unrelated PR and gets a root-cause fix (the menu option is asserted selected, then Enter races the apply), or a month passes with no repeat and this file is deleted.
       evidence  — the failing job log, or `npx playwright test e2e/library-images-complete.spec.ts --project=desktop --repeat-each=20 --retries=0` locally.
       verify    — tier 0 gates.
       repeat    — 2026-10-13, #2673's studio-smoke failed the same test (now line 67, "on a collage slide a list item offers whole photo lines") with the same symptom: Enter on the completion left `- te-` in the editor. #2673 did not touch the Markdown editor or the Library, it passed 4 of 4 locally, and the next run on a newer head passed. That is the repeat on an unrelated PR this file waits for, so it is ready for the root-cause fix.
       repeat    — 2026-10-18, #2746's studio-smoke failed the same test (line 67) on a199247 with the same symptom (`## Site walk- te- ` after Enter); 116 other tests passed and #2746 touches no Library or editor-completion code.
```
