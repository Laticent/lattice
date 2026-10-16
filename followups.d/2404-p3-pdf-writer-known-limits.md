---
origin: 2404
priority: P3
recorded: 2026-09-27
area: engine
severity: low
swimlane: engineering/decisions/2026-09-27-studio-export-one-engine.md
source: https://github.com/Laticent/lattice/pull/2404
---

# The shared PDF writer's known limits, and the viewers it was not checked in

#2404 leaves these on purpose and records them in
`engineering/decisions/2026-09-27-studio-export-one-engine.md` (Known limits). None of them is a
wrong page. Each one is either text that doesn't copy or a small softness.

```text
  P3 · [followups.d/2404-p3-pdf-writer-known-limits.md] close the gaps worth closing
       why now   — copyable text is one of the owner's stated goals, and these are where it fails.
       where     — lib/core/pdf-compose/read-slide.mjs:
                   - Pseudo-element text, emoji and system-font characters stay in the photo and
                     do not copy.
                   - A 1px colored hairline left in the (JPEG) photo bleeds color into the next
                     row.
                   - A later sibling's outer box-shadow over a lifted border is not seen.
       done when — each item is either drawn as vectors or text (with a test that fails without
                   it), or recorded as accepted with the reason; and the owner has opened one
                   exported deck in Acrobat and on a big screen.
       evidence  — tools/pdf-writer-parity.mjs --galleries (0 errors; the thin-line sweep
                   reviewed); pdftotext showing the recovered words.
       verify    — tier 1 checker, because read-slide.mjs is the kernel every PDF export runs.
```
