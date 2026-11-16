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

## 3b. The rail's selected chip (owner pick: option B)

The rail's selected state was a pale accent tint that cleared 3:1 against the rail in none of the 36
palette × mode combinations (1.01:1 in cuoio light). Five looks were measured in the live Studio and
scored (the "Selected-State Options" artifact). The owner chose **B**: the theme's `--text-heading` as
the chip and `--bg` as the label, the Read/Write/Craft switch's look. It clears 9.88:1 against the rail
and 9.65:1 for the label in all 36. **D**, the same chip with the OTHER mode's accent as the label
(gold on ink in Cuoio), is the follow-up: AA in all 36, the accent shows in 19, and its fallback is B,
so it only adds. It is a new generated token across every selected control, so it is its own PR.

## 3c. Compose's drawn caret follows a pane swap (found by the owner while testing)

While Compose is not focused (clicking a rail button blurs it) it draws its caret (`ghostCaretPlugin`, ComposeView.tsx).
It was `position: fixed` from viewport coordinates, re-measured only on focus, blur, scroll, window resize and an edit,
so opening or closing a pane re-flowed the column under it and left it where the text had been, outside the editor's
clipping: 311px off the title's first letter after Coach closed, measured. It now sits in the host (`.cs-host`, made
`position: relative`) in content coordinates, so it scrolls and clips with the text, and a ResizeObserver on the host
and the document re-measures it after layout and before paint, so it never trails a frame. Guard:
`docs/e2e/one-side-pane.spec.ts` "Compose's drawn caret stays on its text", on Chromium, WebKit and Gecko.

## 3d. One pane header (owner: "there is no house style with the panes")

One slot put every pane in the same place, which made their headers impossible to miss: measured at 1440px
on the built Studio, the seven panes drew three designs. Coach, Chat, Live and Reader views drew an 11px
uppercase mono label (about 34px tall, 40 with Chat's model chip) with no icon and no way out but the rail.
The Library drew the shared `PanelHeader` with its search field open in it (about 56px) and no close. Settings
drew a tinted band (about 45px) whose title was its scope ("Slide 1 override", "All 7 slides"), with search
and a collapse. The phone and tablet sheets already all wore `PanelHeader`; only the docked column did not.

The owner picked, from options put side by side:

| Question | Pick |
|---|---|
| What every docked header carries | `PanelHeader`: icon chip, the pane's name (`PANE_NAME`), its actions, a trailing collapse |
| How search works | One `PanelSearchButton` in the header opens `PanelSearchRow` under it, focused; Esc or an empty close puts the button back |
| Where Settings' scope goes | The tinted band stays as the body's first row; the header says "Slide settings" / "Deck settings" |
| Where it ships | In this PR: one slot is what put the headers in one place (HARD RULE #18) |

How it is built:
- `PanelHeader` takes `collapse: 'left' | 'right'`: a docked column draws `PanelLeftClose` / `PanelRightClose`
  (the glyph the preview's own collapse uses) and a sheet keeps its ✕. The desktop docks collapse left; the
  tablet's settings dock, on the right, collapses right.
- `StudioShell` draws each docked pane's header with `dockHeader(id, icon, actions)`, and every collapse calls
  `collapsePane`, the same function Esc calls, so the rail's last-used mark and the focus return (the rail
  button, else the tablet's toolbar or "More controls") cannot drift between the two ways out. Accessible names:
  "Collapse Coach", "Collapse Library", …, and "Collapse settings" (unchanged; the iOS probe and specs use it).
- Chat and Live draw no header of their own any more. Every host (dock, tablet sheet, phone sheet) passes a
  header node and they portal into it: Chat its cost readout, Live its session menu. The `title` props and their
  uppercase-label branches are gone from `ArchitectChat`, `ChatShell` and `LivePanel`.
- Reader views' Add button is the header's in the dock as in the sheet (`lensAddButton`).
- `PanelSearchButton` is the outline `icon-sm` button every header action uses, so the Library's search and
  Import share one height (pinned by `e2e/library-header-search.spec.ts`). `SettingsToolbar` uses
  `PanelSearchRow` and takes `searchButton={false}` where the header carries the button; a phone sheet's band
  keeps its own.
- A phone is unchanged: each sheet keeps its leading back chevron (no X), and the Library keeps its search
  docked at the bottom above the keyboard.

Guard: `StudioShell.test.tsx` "every docked pane wears the shared header", red with Coach's old label.

**One background (the follow-up PR after #3222).** Settings sat on `--bg` (`bg-background`) and the tool panes on the
card color (`bg-card`, `--bg-alt`), so the column changed tint whenever the slot swapped. Every docked pane now sits on
`bg-background`: the Settings column's color, and the color every phone and tablet sheet already used, so a pane also
looks the same docked as in its sheet. Measured on the built Studio in all 36 palette × mode combinations at 1440:
- Settings did not move, so its card-colored controls (the scope band, Basic/Advanced, preset cards) keep a fill of
  1.08–1.49:1 against the column and their borders at least 3.03:1, before and after.
- The tool panes' cards are `bg-background` with a border, as in their sheets. Their fill now matches the column, and
  the `--border` outline (at least 3.03:1, above the 3:1 floor for UI parts) is what marks them.
- The other way, putting everything on the card color, would have flattened 82 card-colored Settings fills into the
  column (1.00:1) and dropped the lowest border to 3.01:1.

Guard: `StudioShell.test.tsx` "every docked pane paints the one column on the same background", red with `bg-card`.

## 3e. Labels that read, and a reset in every pane that edits (owner, from a design review)

**The owner's report:** on a laptop and a desktop the rail's captions and Read/Write/Craft were hard to read and
"the icons overpower them"; the phone looked fine. Measured on the built Studio, then reviewed by an independent
design reviewer with screenshots at 1x and 2x:

| Element | Before | After (owner's picks) |
|---|---|---|
| Rail caption | Outfit 8.5px/600, tracking -0.21px, muted (4.65:1 light, 6.13:1 dark) under an 18px, 2px-stroke icon | 10px/600, no tracking, `--text-body` (7.8:1 light, 10.15:1 dark) under a 16px, 1.75-stroke icon |
| Read/Write/Craft | 12px words beside 16px, 2px-stroke icons | 12.5px words beside 14px, 1.75-stroke icons, 5px gap |
| Phone bar caption | 9px, muted, 17px icons | 9px, `--text-body`, 17px icons (geometry unchanged) |

The cause, ranked by the reviewer: the size (8.5px is about 4 device pixels of x-height at 1x, the smallest text in
the Studio), the icon carrying about ten times the word's ink, the muted color losing more contrast than its ratio
says at that size, and tracking tightened where small text needs it open. Weight 600 was not the problem. A 2x
screen and the phone hid all of it. "Library", the longest caption, is 33px at 10px, inside the 44px cell, so the
rail (52px wide) does not widen. Captions stay on the rail (words-on-controls is a recorded decision, and the tooltip never
reaches a touch laptop).

**The phone bar's geometry is held on purpose.** The instant shell places everything under it from a frozen height
(`PREVIEW_CHROME.mobileBarH`, 49px), and the @minfont cases in `studio-instant-shell.spec.ts` pin how the slide box
lands when a reader raises the minimum font. Giving the bar 16px icons or a 10px caption on a `leading-none` line
moved that box 4px off. Note the trap that caused the second: `cn` (tailwind-merge) DROPS a line-height that
precedes a font size, so the captions have always inherited the app's 1.6 line box; listing the size first kept
`leading-none` and shrank the bar 4px. The size stays after `leading-none` in `BarIcon`.

**Reset.** Every pane that edits something (Slide settings, Deck settings) has a `PanelResetButton` in its header,
left of the collapse; a pane that edits nothing has none. It UNDOES THIS VISIT: Slide settings puts the slide back
as it was when the pane opened (the body's existing baseline, now reported to the header via `onResetChange`); Deck
settings puts back only the front-matter keys its own writes changed during the visit (`deck-reset.ts`:
`touchedKeys` per write, `revertKeys` on reset), so an edit the editor, a collaborator or the command palette made
meanwhile stays, and the slides below are untouched. A visit is keyed by the pane's show AND the deck's id, and the
Slide baseline by deck, slide and open, both moved during render: an earlier cut kept the visit across a deck
switch and wrote deck A's settings, or its first slide, into deck B, and its Slide reset flashed enabled for a frame
on every slide change (all found by the checker). One Undo step with the Undo toast, so no confirm. Off
(`aria-disabled`, still focusable so its hint says why) until the visit changed something, and drawn by the shell
from the first frame so the header never shifts when the body loads. The body's
old "Reset slide" row is gone. A per-field reset (the preset picker's "Reset to Classic") stays beside its field.
Guards: `StudioShell.test.tsx` "Deck settings' header reset" (red with a no-op reset), the `SlideContext.test.tsx`
reset cases, and `e2e/panel-shells.spec.ts`, which pins the header's reset as a frame piece.

## 4. Do not regress — the traps this area has already paid for

Each line names the guard. A change to panes re-checks every one.

**Layout and splitters**
- Every dock shares `DOCK` = min 280 / default 320 / max 480; the editor and preview floor at 300 and
  fold to a 46px rail (`dock-layout.ts`, `preview-rect.ts`). Guard: `e2e/studio-dock-sizing.spec.ts`,
  rewritten here to pin the one-pane contract at 1100, 1280, 1440, 1920 and 2560.
- A window resize puts the widths back once it settles (`use-resizable-split.ts`, the resize sync). The panels are
  sized in percentages and clamped at their px floors, so a dock pushed to 280 in a narrow window used to keep that
  larger share when the window grew: 371px at 1440 instead of 320. A panel set nobody dragged now returns to the
  ideal layout; a set the person dragged (any divider in it, the editor|preview one included) returns to its saved
  shares, which the library clamps to the floors again, so a dragged width holds at the window width it was dragged
  at and scales with the window otherwise. A drag made while a side was collapsed is not saved, and the sync leaves
  that set as it is. The sync skips a drag in progress, builds its target from the group's own ids (a stored layout
  with a stray key used to throw "Invalid N panel layout"), and fires `lattice:split-resize-settled` when it has run.
  ⌘K "Reset split" clears the saved set, so the next settled resize lays the docks out at their ideal widths, as a
  reload already did. Guards: the four resize tests in `e2e/studio-dock-sizing.spec.ts`.
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

Per HARD RULE #23, each claim names its surface.

| Surface | What ran | Result |
|---|---|---|
| Mobile Safari 26.5 in the **iOS Simulator**, iPhone at 402px (platform-suites dispatch 43813078296, `ios-safari-studio-iphone`, on 01af168) | studio, panes, sheet-focus and compose probes | pass: the drawn caret within 1px at rest, with Coach opened and closed, and after a scroll; the toolbar holds; a tap places the caret |
| Same run, iPad at 1032px (`ios-safari-studio-ipad`) | the same probes, the caret checked through a docked and closed settings column | pass |
| Built Studio in Playwright Chromium, WebKit and Gecko at 1440, 820 and 390 (projects desktop, tablet, tablet-touch, mobile, webkit-tablet, gecko, webkit-phone, minfont) | the pane, sheet, focus, shell-parity and chrome specs (`one-side-pane`, `library-header-search`, `panel-shells`, `settings-reopen`, `studio-shell-parity`, `studio-instant-shell`, `library-card-fit` and the rest named in the commits) | pass (142 and 133 in the two last sweeps) |
| jsdom | docs vitest | pass (studio and ui: 340 files; the whole docs suite: 665 files) |
| Screenshots of the built Studio, light and dark, 1x and 2x | every docked header; the rail and Read/Write/Craft before and after; the tablet dock; both open searches; the reset off and on; the phone settings sheet | sent to the owner in the session |

**UNVERIFIED:** a physical iPhone or iPad. The simulator runs real Mobile Safari, but its touches are synthesized,
so the feel of a finger (the tap, the sheet swipe, the keyboard) is for the owner to check on a device.

Carried over, not caused here: the iPad Compose tap reads as a long press now and then on `main` too (another
session tracks it). The Settings column's tint, also carried over at first, was fixed by the follow-up PR (§3d).
