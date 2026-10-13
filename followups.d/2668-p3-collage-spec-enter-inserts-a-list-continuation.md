---
origin: 2668
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2668
---

# Collage spec: Enter inserts a list continuation instead of accepting the completion

`docs/e2e/library-images-complete.spec.ts:67` failed on CI during #2668 and is not
a change from that PR: in the editor, Enter inserted a Markdown list continuation
where the spec expects it to accept the autocomplete entry. It is `main`'s test and
was not root-caused in #2668.

```text
  P3 · [no ticket] Make the collage spec's Enter accept the completion deterministically
       why now   — a spec that fails or flakes on CI teaches reviewers to ignore red.
       where     — docs/e2e/library-images-complete.spec.ts:67; the editor keymap order
                   (completion accept vs list-continue) in docs/src/components/studio/.
       done when — the spec passes 10 of 10 repeated runs on the nightly workflow_dispatch.
       evidence  — the Playwright run log from studio-e2e-nightly.yml (webkit-phone and
                   chromium projects), repeated runs.
       verify    — tier 0. It fixes a test or a key-binding order; no engine blast radius.
```
