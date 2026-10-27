---
status: shipped
summary: >
  Two e2e specs were red on main and the nightly was the only run that could see them (followup 2921-p2). The plugin
  admission spec pinned a `pluginsOff` list from before the `callout` (#2864) and `video` (#2874) plugins existed, so the
  list in the Marp bundle was right and the pin was stale. The Playground stress spec "Explore → Edit → Explore comes back
  to the same slide" found a real defect: the switch to Edit replaces the editor's text with the walked deck, which puts the
  caret on line 1, and Explore reopens on the caret's slide, so the reader came back on slide 1. Fixed by treating the slide
  Explore was on as a click on it, which the sync already turns into a caret at that slide's title. Both specs pass.
---

# Two red e2e specs on main (followup 2921-p2)

Both failed on a `build:e2e` of `main` before the neighboring PR #2921 changed anything, so neither came from it. The e2e
suite runs nightly, so a red spec costs a day before anyone sees it.

## `plugin-admission.spec.ts` "under defaults: [] the rail splits a `$$` block…"

The assertion `expect(md).toContain('"pluginsOff":[…]')` is a literal list of every plugin the deck did not load. The bundle
now records `callout` and `video` as well: `["anima","avatars","callout","chart-family","code","function-plot","icons","legend",
"math","mermaid","sparks","video"]`. Both plugins landed after the list was written (#2864 on 2026-10-22, #2874 on
2026-10-24). The producer was right and the pin was stale, so the pin is updated, with a comment that names the two PRs. The
spec now passes at desktop width (10 of 10 in the file).

## `playground-stress.spec.ts` "Explore → Edit → Explore comes back to the same slide"

**What happens.** A reader steps Explore to slide 6 and switches to Edit. `setViewMode('edit')` finds the editor's text
differs from the deck Explore is showing (a component walk), backs the draft up and replaces the editor's whole document with
Explore's. A whole-document replace puts the caret on line 1, and the focus sync reports that as the editor's caret
(`caretSlide = 0`). Switching back, `enterExplore()` opens Explore on the caret's slide, which is slide 1.

**Why it was red on `main`.** Not a new regression: the design says Explore opens on the caret's slide, and nothing told the
sync that this caret was a side effect of the replace and not the reader's choice.

**The fix.** In that replace branch the host now calls `syncRef.current.exploreClicked(page)` with the page Explore was on
(the walk index for a deck walk, the first page of the slide group for a plan walk, the same arithmetic `mapWalkPage` uses).
That is what a click on a slide in Explore already does: when Edit's preview is written, `leaveExplore()` puts the caret at the
end of that slide's title. The editor now opens with the caret on the slide the reader was reading, and the return to Explore
lands there. When the text is not replaced the branch does not run, so the caret stays where the reader left it.

An earlier cut added a `replacingForEdit` flag to the sync that skipped the replace's caret report. It failed its own unit test:
the hub reports a caret move on its next frame, so a flag cleared by `leaveExplore()` came too early. The click route needs no
timing.

**Verification.** The stress spec passes at desktop and phone width. The neighbors that exercise the sync pass too:
`playground-stress`, `-tab-switch`, `-focus-sync`, `-explore`, `-map`, `-state`, `-filmstrip-jump` (109 tests at both widths).
The `playground-map` spec "a blank slide in a deck with a front matter header…" failed once in a loaded run and passed on every
rerun; it is not touched by this change.
