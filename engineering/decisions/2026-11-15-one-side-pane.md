---
status: in-progress
summary: The Studio shows ONE side pane at a time. Coach, Chat, Live, Reader views, Library, Slide settings and Deck settings share one slot, so opening any of them replaces the one showing; X closes to the canvas and never reopens an earlier pane; the only way back is a visible "‹ Chat" chip that a drill-in sets; the rail marks the pane used last. Replaces the two-slot model of 2026-07-06-studio-activity-bar.md, which let a tool and settings dock side by side and so put up to four columns on screen. Measured with the real dock-layout code, one pane keeps the editor on screen from 1100px up (two panes folded it at 1100 and 1024) and gives the preview 43% more width at 1440. Carries the do-not-regress list of the traps this area has already paid for.
---

# One side pane at a time

**Date:** 2026-11-15 · **Status:** in progress (branch `claude/funny-newton-ecq9lk`) · **Replaces:** the
two-slot rule in `2026-07-06-studio-activity-bar.md` §Decision and §"Why", which rejected one slot
because it "breaks the coach↔tune loop". Everything else in that note (the rail, its groups, the one
collapse rule, left docking, the resizable panels) stands.

## 1. The decision

Every side pane shares ONE slot in `StudioShell` (`activePane`). The owner chose this over two other
models after trying all three side by side in a working mock (the Pane Lab artifact):

| You do | Studio does |
|---|---|
| Click a pane's rail icon | Opens it, replacing whatever pane was open |
| Click the open pane's icon | Closes it |
| X, or Esc with focus in the pane | Closes it; the canvas gets the room. Never reopens an earlier pane |
| Use a link inside one pane that opens another (a **drill-in**) | Opens the destination with a "‹ Source" chip in its header |
| Click the chip | Returns to the source pane |
| Open any other pane | Replaces it, and the chip goes away |

The rail marks the pane that last held the slot with a small dot on its inner edge, where the active
rule sits, and its tooltip says "(last used)". Getting back is one click the author chooses to make.

**Rejected: "close reopens the previous pane."** The owner's first idea. It makes X depend on a history
the author cannot see: after Coach → Chat → Settings, X reopens Chat, then Coach, then the canvas. Two
panes deep, nobody can predict what X does next. Pane Lab showed this with a "hidden history" bar that
real users would never have. The visible chip keeps the useful half (a way back after a drill-in) and
drops the guessing.

**Rejected: keep two slots.** Settings plus a tool plus the editor plus the preview is four columns, the
overload the owner reported. The 2026-07-06 argument for two slots was the coach↔tune loop: read a
finding, tune a setting, look at the finding again. Coach's fixes now apply in place
(`coach/FindingCard.tsx`: Fix, Apply, Discard), so the loop rarely needs settings. When it does, the
rail's last-used mark makes the swap back a single visible click.

### What other products do

Google Slides, Canva and VS Code show one side surface and replace it on open. Slack shows a back arrow
only after a drill-in into a thread, and its X closes the whole pane, which is the model here.
PowerPoint stacks task panes, and that stacking is the overload this change removes.

## 2. Measured: what one pane buys

`idealDockLayout` (`docs/src/components/studio/dock-layout.ts`) run on the real constants (dock 280/320/480,
editor and preview minimum 300, rail 46, activity bar 52):

| Width | Two docks (old worst case) | One dock |
|---|---|---|
| 1440 | editor 343 · preview 402 | editor 490 · preview 576 |
| 1280 | editor 300 · preview 301 | editor 417 · preview 489 |
| 1100 | editor folded to 46 · preview 439 | editor 334 · preview 392 |
| 1024 | editor folded · preview 363 | editor 300 · preview 350 |

**A correction to the first analysis.** It reported the preview at 159px with two docks at 820px, below
its own 300px minimum. That configuration cannot happen: at tablet width only settings docks
(`studio-tablet-inspector`), and the tools open as sheets. Nothing to fix there.

**The fold that two docks forced is gone at desktop widths.** `onFoldedExpand` ("the editor is folded
because the docks leave it no room") is kept: an editor the author collapsed still reaches it, and
removing the path would be a second change in the same PR.

## 3. How it is built

- **One state, two reads.** `activePane: StudioPaneId | null` replaces `activeAssistant` and
  `activeSettings`. The two names survive as pure reads off it, because dozens of call sites (layout,
  aria-pressed, effects, the tour snapshot, Live's follow keys) speak "assistant" or "settings".
- **The group setters keep their API.** `setActiveAssistant` / `setActiveSettings` take the same
  functional updates as before. A non-null result takes the slot from either group; a null result
  closes the slot only when that group holds it. The tour restore (`setActiveAssistant(was.assistant);
  setActiveSettings(was.settings)`) depends on the second half, and so does a sheet that closes AFTER a
  drill-back swapped the slot (`setLibraryOpen(false)` no longer closes Chat).
- **The types live with the rail** (`chrome-parts.tsx`: `StudioPaneId`, `isAssistantPane`,
  `isSettingsPane`, `PANE_NAME`, `PANE_RAIL_LABEL`), because the pre-paint shell draws the rail too.
- **The chip is cleared during render** (React's "adjust state when a value changes" pattern), in the
  same commit as the swap that ends it.
- **Only the author's own swaps move the last-used mark**: the rail, Esc and a pane's own close call
  `notePane`. A tour and Live's follow-along drive the slot through the group setters and leave the
  mark alone, and the tour's snapshot restores it after pressing the rail itself (found by the checker:
  a render-derived mark ended the Craft tour pointing at a pane the author never opened).
- **The chip is part of the shared panel header**, not a per-pane widget (HARD RULE #15).
  `PanelDrillBack` in `ui/panel.tsx` wraps ONE pane; `PanelHeader` reads it. On a pointer surface it
  draws a "‹ Chat" chip before the panel's identity (44px tall on a coarse pointer). On a phone it takes
  over the existing leading back chevron: the chevron's label becomes the source pane and pressing it
  returns there. On a pointer surface the X keeps its one meaning. A phone sheet has no X (its chevron
  is the close), so after a drill-in the visible control goes back to the source, and closing straight
  to the deck is the backdrop tap or a swipe down, as on every phone sheet. Accepted: the chevron
  says where it goes, and the drill-in is one level deep.
- **The drill-in that exists today:** Chat's "Manage docs" opens the Library on its Docs tab
  (`drillPane('chat', 'library')`). Coach applies its fixes in place and opens no other pane.
- **Esc.** With focus inside a docked pane (`[data-studio-pane]` or `[data-settings-dock]`), not in a
  text field, and not already handled (`defaultPrevented`), Esc closes the pane and moves focus to the
  rail button that opens it. A tablet has no rail: there focus goes to the same control in the toolbar
  if one exists, else to the overflow menu ("More controls"), never to `<body>` (found by the checker). Everywhere else Esc keeps its existing meaning (clearing a transient Craft
  reveal or the quiet state). A tooltip or menu left open is a Radix layer and takes the first press, so
  Esc closes the innermost layer first, as it does everywhere else in the app.

## 4. Do not regress — the traps this area has already paid for

Each line names the guard. A change to panes re-checks every one.

**Layout and splitters**
- Every dock shares `DOCK` = min 280 / default 320 / max 480; the editor and preview floor at 300 and
  fold to a 46px rail (`dock-layout.ts`, `preview-rect.ts`). Guard: `e2e/studio-dock-sizing.spec.ts`,
  rewritten here to pin the one-pane contract at 1100, 1280, 1440, 1920 and 2560.
- The pre-paint shell clamps a restored split by the SAME minimums (`preview-rect.ts`). A saved layout
  for the old four-panel key can no longer be reached and must not leak in. Guard: the "returning
  visitor with a saved TWO-dock layout" test.
- Splitter drag: pointer capture on the handle and FIT paused during a drag
  (`2026-07-02-resizable-editor-preview-panes.md`). Untouched here.
- `splitPanelIds` lists the docked set by hand. With one slot, the settings + assistant combination
  is unreachable; the list is unchanged so every reachable key stays the same.

**Panes**
- Chat's in-flight reply survives the panel closing: `commit` calls `saveChat` unconditionally and the
  failure notice lives at module scope (`ArchitectChat.tsx`, #1849). One slot adds new ways to close
  Chat (opening Settings), so this guard matters more now.
- Settings content is drawn by `SettingsDock` over an empty column so it can outlive the column
  (WebKit leaks a preview document per reopen otherwise).
- Accessible roles and names stay the same: `CHROME` in `docs/e2e/studio-fixture.ts`, the tour
  selectors, the demo hook (`use-studio-demo.ts`).

**Phone and touch** (`2026-07-27-mobile-panel-framing.md`, `engineering/gotchas/browser-engine.md`)
- Every panel is a bottom sheet on a phone, at one height per tier; a panel with a text field is `full`.
- Text controls compute at least 16px on a coarse pointer, or iOS zooms on focus (`landing.css` net, a
  16px block per CodeMirror theme, `docs/e2e/ios-zoom.spec.ts`). Never `maximum-scale=1`.
- The keyboard is an occluder: `--kb` from `visualViewport`
  (`2026-09-14-the-keyboard-is-the-other-occluder.md`).
- 44px touch targets on a coarse pointer, including the new chip.
- Preview-side sheets stay non-modal, or iOS stops scrolling the preview.

## 5. Verification

To be filled before the merge ask, per HARD RULE #23: the real Studio at 1440, 820 and 390, light and
dark; the e2e specs above; and every iOS-only behavior marked UNVERIFIED until the owner checks it on a
phone.
