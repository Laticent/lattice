---
name: desk-polish
description: >
  Run the ✨ polish desk: hold what already ships to the 10/10 boardroom bar: the
  gallery, the themes, the example decks and the docs site at desktop, tablet and
  mobile. Start from the visual follow-ups and issues, sweep one surface per pass by
  LOOKING at it, and drive each shortfall to a fix with before/after artifacts. Use when
  this session is told to be the polish desk, or the owner asks what looks off, cheap or
  unfinished.
argument-hint: "[gallery | themes | examples | site | followups]"
---

# ✨ Polish desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, and "Read
your lane first"), CLAUDE.md's QUALITY BAR section, `engineering/visual-review.md` §The loop,
§What each agent runs and §Responsive sweeps, and the 10/10 rubric in
`engineering/decisions/2026-06-06-layout-audit/`. Tag this session `desk:polish` and
`ui:pinned`.

**The question this desk owns:** does it look like it belongs in a boardroom? "It renders"
is the floor. A claim here names its surface and carries an artifact from it (HARD RULE
#23): a rasterized PDF page, a `tools/screenshot.js` capture at the width it is about.

## The pass

1. **Read your lane first.** `npm run followups` and keep the visual items
   (`grep -liE 'polish|visual|10/10|boardroom' followups.d/*.md` is the start; read each),
   the open issues about how something looks, `claim:` tags on live sessions, and the
   gotcha file for the surface (`grep -rn <surface> engineering/gotchas/`). This is your
   starting queue.
2. **Sweep one surface per pass**, in this order unless the owner names one: the gallery,
   the themes (dark and light), the example decks, the docs site at 1440, 820 and 390 px.
   Render it (`npm run preview`, `tools/rasterize-for-review.sh` for a PDF,
   `tools/screenshot.js` for the site) and look at whole slides or pages. A sweep of more
   than about 20 slides fans out reviewer agents as `visual-review.md` §When to fan out
   says; that fan-out is mandated by CLAUDE.md's QUALITY BAR and still counts toward the
   lane's budget.
3. **Rank** by what a viewer meets first: the gallery and the default theme before an
   edge modifier; a defect on every slide of a layout before a one-off. Keep the top three.
4. **Act inside the lane:** start one fix session per item from `main` (tags
   `desk:polish`, `origin:desk-polish`, a `claim:`). Its brief carries the before artifact
   and says: the fix ships with the after artifact from the same surface, a demo deck if a
   slide changes (HARD RULE #9), `tools/pixel-check.js` before and after, and the PR deletes
   the follow-up file it fixes. A change to export bytes stops for the owner's sign-off
   (CLAUDE.md's QUALITY BAR section).
5. **Write back** (through a session you start, counted in the budget). A trap becomes a gotcha entry in the topic file. A shortfall you will
   not fix this pass becomes a `followups.d/` file with its artifact path and
   `deferred: large|blocked|off-path`.
6. **Report** to the command center: the surface swept, the top items as fleet rows with
   their artifacts attached (`SendUserFile`), a taste call as a ❓ item with the picture,
   and `budget: N/10 today`.

## Lane

Yours: how shipped surfaces look. Not yours: layout motion (the jank desk), a red test
(the flake desk), new components or presets (feature work), export plumbing (the owner
signs off). Never: hex literals in layout CSS (HARD RULE #3), typed glyphs where a shape
belongs (#29), a new typography size outside the `--fs-*` scale (#4), or a taste call
decided alone when the owner should see the picture.
