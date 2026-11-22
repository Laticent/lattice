---
status: shipped
summary: >
  Compose names each slide's layout on its bar (`cards-grid ▾`, the pill's first button; a quiet copy on every other slide)
  and changes it from a menu of the slide's looks and its manifest's related layouts, with live previews, picks that apply at
  once, one Undo per visit and a confirm before a layout replaces the text. Design 6 of a six-design round with an independent
  UI/UX review (8.9 of 10). The build found and fixed a class rewrite that dropped `_paginate`, `cards-grid three four`
  stacking, a phone bar that moved slides 5.6px on focus, and a menu that leaked preview frames on every open.
---

# Compose's layout button: what each slide is, and changing it from the slide bar

**Date:** 2026-11-15 · **Owner's pick:** Design 6 of a six-design round

## 1. The answer

Compose now names each slide's layout on its bar and changes it from there.

- **The button.** The slide's component by name with a chevron (`cards-grid ▾`): the pattern a word processor puts first in its toolbar ("Normal text ▾"). It is the pill's first control on the active slide. Every other slide shows the same button, quietly, on its line, in the space the hidden pill already reserves. You learn one control once, and the column of slides reads as a list of layouts.
- **The menu.** A box under the button off the phone; the Studio's standard sheet on the phone. Both stay mounted after the first open and are only hidden on close (`PersistentSurface`), so the preview frames survive between opens (§4). It leads with a live preview of the author's own slide, then the component's **looks** (its variants), then **"Same text, new layout"** (the manifest's `related` list, each with its "use when" line and a thumbnail of the slide in that layout), then **"Starts from an example"** (related layouts that cannot read the slide's text).
- **Picks apply live and the menu stays open.** Closing it, any way at all (Done, Escape, a tap outside), keeps what was chosen, and the notice offers one Undo for the whole visit. Nothing reverts on its own.
- **A layout that would replace the text asks first**, in place: "Replace text" or "Keep my text".
- **Disabled, never absent,** on a slide Compose cannot rewrite: a slide it cannot round-trip ("edited in Source") and a class that shares its comment with other settings. The title says which.

Code: `ComposeView.tsx` (`SlideView.layoutButton`, `syncLayout`, the handle's `layoutOf` / `applyLayout` / `restoreLayout`), `LayoutMenu.tsx`, the shell wiring in `StudioShell.tsx` (§"THE LAYOUT MENU"), the model in `docs/src/lib/compose/slide-layout.ts`.

## 2. How it was chosen

The owner asked for a way to see which component a slide uses and to reshape it or switch its variant, "tasteful and polished", keeping the pill's simplicity while adding "quick scanning and action". Five designs were built as live mockups and the owner asked for an independent UI/UX review. The reviewer chose its own rubric: Scan 20%, Act 20%, Calm (nothing moves) 20%, Choose (the menu explains the options) 15%, Touch and accessibility 15%, Learn 10%.

| Design | Idea | Review |
|---|---|---|
| 1 Name plate | the name as the pill's first segment, a menu with "use when" lines | 7.1 |
| 2 Rail caption | the name on a second hairline under the pill, a bottom sheet | 7.4 |
| 3 Variant shelf | a row of chips under the pill, one tap | 5.1 |
| 4 Corner tag | a tag inside the slide's text, a strip of picture cards | 6.4 |
| 5 Shape glyph | a drawing of the layout that widens into a carousel | 5.7 |

The owner found Design 2's caption unfamiliar: a word on a hairline reads as a drawing label, not a control. The familiar pattern is Design 1's, so Design 6 took Design 1's button and menu and Design 2's scanning (every slide labeled, no extra height), and fixed what the review measured. Three review rounds took it from 7.8 to 8.8 to **8.9**: Scan, Act, Calm, Touch and Learn at 9, Choose at 8.5. The owner picked it.

## 3. What changed between the mockup and the build

Each change is a place the real Studio answered differently from the mockup.

- **No per-layout drawing on the button.** The mockup drew a schematic of each of three layouts. The catalog has 80, and no drawing exists for them. The review had already found the 20×13 drawing marginal ("Scan holds at 9 only because the name is always shown"), so the button shows the name alone. The menu shows **real previews** instead: the author's own slide rendered by the engine in each layout (`PooledThumbFace`, the same pool Reshape uses). That also answers the review's remaining Choose finding, that a look like `three` → `four` changes nothing in Compose's text: the preview shows it.
- **The class name, not a friendly name.** The Studio names a component by its class everywhere else (the gallery tiles, the pane bar, the strip), so the button reads `cards-grid`, not "Cards grid", and `text` for `content` as the pane bar does. (Changed 2026-11-17: `content` everywhere, as Source and the docs name it; `2026-11-17-compose-empty-deck.md` §5.)
- **The phone gets the Studio's standard full-height sheet, not a half-height one.** Every phone panel shares one height on purpose (`components/ui/panel.tsx`, `MOBILE_HEIGHT`, and the history in its comment). The preview at the top of the sheet is what "you see the change" rests on now.
- **Undo and Redo left the pill; the pill became two groups.** On a phone the layout name, Undo, Redo, Add, Insert and Settings did not fit one row with 25px clear of each end cap: the name had room for about five characters (measured at a 342px pane). A first fix moved the layout button to the pill's second row; the owner found that astonishing and set the model (2026-11-15): Undo and Redo act on the whole deck, so they belong with the deck's editor controls (the edit bar, beside Compose / Source, Reshape and Fix all; the phone's header), not on each slide. The pill holds two groups: a **static** one (the layout, Add, Insert, Settings) and a **dynamic** one (the block's styles, or the table / code island), with a divider between them. They share one row when the editor pane is 520px or wider; below that the dynamic group takes row two. Measured at a phone's pane: 28–55px clear of the caps, and only names past about ten characters end in an ellipsis (the full name is in the button's title and accessible name). The touch-tablet header's Undo / Redo pair went with it, since the edit bar now carries them there too, and the pre-paint skeleton matches.
- **"All layouts…" is not in the menu.** The slide gallery has no mode that changes the current slide's layout (its pane mode changes one pane). The menu lists the manifest's alternatives. A route to the whole catalog is a follow-up, not a link to a gallery that would add a slide.
- **The family on offer is the one the slide started the visit with.** After picking `stats` on a `big-number` slide, the list still shows `big-number`'s alternatives, so it does not reshuffle under the author's finger and the way back is still there.

- **The divider between the two groups got room.** 4px of clear space each side of the 1px line (a transparent border with the background clipped to the line, not a margin), so it sits 7px from its neighbors instead of 3px: enough to read as two groups, little enough for a phone's pill.

## 3b. The edit bar: Undo, Redo, Find and replace, and a row that never bleeds

The owner's model put Undo and Redo in the editor's edit bar, and asked for Find and replace there too, with the rule that nothing may run past the pane at any width down to its minimum (300px, `EDITOR_MIN`).

- **A row that steps, not one that guesses.** The edit bar already measured itself (`useRowFit`): it takes the lowest step whose controls fit its box. The steps are now six (`EDIT_FIT` in `chrome-parts.tsx`): (1) the issue pill shortens to its count; (2) Version history and Slide settings move into a **More** menu; (3) Reshape and Fix all move into More; (4) the Compose / Source words drop to their icons; (5) Find and replace and the issue pill move into More. Undo and Redo never move. The More menu reads the row's step when it opens and lists exactly what the row is not showing; Reshape chosen from it opens the same picker, hung from the More button.
- **The words outlast the controls.** Before, the words were the first thing to go. At a tablet's 820px the row now settles on step 3 with the words shown (`compose-first.spec.ts` holds that), the controls it moved one tap away in More.
- **Measured on the real Studio, not reasoned.** The row's content width never exceeded its box at any width tried: 1440, 1100, 1024 and 820px windows, and panes of 420, 360, 330 and 300px, the last with an issue count and a text selection crowding it (step 5).
- **The pre-paint shell steps the same way.** Each control carries the step it leaves at as a short attribute (`data-out="3"`), and three rules in `styles/tailwind.css` hide what a step has moved out, for the app's row and the shell's alike. A few lines of inline script in `studio.astro` measure the shell's row as `useRowFit` measures the app's, so the two agree at every width without hand-picked breakpoints. A first cut used a Tailwind utility per step per control: about 0.7KB more HTML, which put the Studio page 0.4KB past its HTML ceiling (`docs/route-budget.json`). A unit test (`edit-fit.test.ts`) holds the script, the stylesheet and `EDIT_FIT` to one another.
- **Find and replace** (`FindBar.tsx`, lazy). One bar for both editors, docked under the edit bar so it never covers the text: the field, "3/12", previous, next, match case, show replace, close; a second row for the replacement, Replace (this match) and All. Enter steps, Shift+Enter steps back, Escape closes and clears. It drives a `FindTarget` (`lib/find-types.ts`): CodeMirror's own search in Source (`lib/find-replace.ts`), and `prosemirror-search` in Compose (`lib/compose/find-target.ts`; a new dependency, ProseMirror's own package). Neither editor loads the other's search code. Replace all is one undo step in both. In Compose a slide it cannot round-trip is left out of the search (the query's filter), because the structural guard refuses any change there and one such match would have made Replace all do nothing. ⌘F in either editor opens the bar on the selected text; on a phone, the drawer's "Find and replace" does.

## 4. What the build found

- **A class comment that holds other settings lost them.** `<!-- _class: stats⏎_paginate: false -->` passed the "class alone" test in `image-objects.ts` `directivesWithClass` because `[^>]` matches a newline, and the rewrite dropped `_paginate`. Picture placement had the same bug. The test now keeps to one line, and the layout button is disabled on such a slide, saying why (`layoutBlocker`).
- **`cards-grid`'s `three` and `four` stacked.** Picking `four` on a `three` slide wrote `cards-grid three four`, because nothing declared them as one pick-one group. Slide settings' Reshape did the same. The manifest now declares the axis (`variantAxes`, "Columns", exclusive). Only four other manifests declared any axis, so the owner had every other layout audited in this PR (2026-11-16). Of the 40 manifests with two or more looks and no axes, 35 now declare them. Each audit call cites the CSS or the transform that makes two looks alternatives: the same property set two ways, or a kernel that keeps only the first token it finds. Looks that combine stay out of the exclusive axes (`agenda progress-3 checks`, `scene` plus `mirror`, `math matrix decompose`). Five need none, because all their looks combine: `cards-stack`, `logo-wall`, `waterfall`, `divider` and `stacked-bar`. Where the evidence was close, the call went to pick-one, because a wrong pick-one only swaps two looks that could have combined (Source still writes both), while a wrong combine writes a slide that cannot render. `docs/src/components/studio/variant-axes.test.ts` walks every exclusive axis through `applyVariant` and pins the pick-one pairs the audit found.
- **`numbered` is not a class.** `cards-grid numbered` is written as an ordered list, and its own sample's `_class` leaves the token out. The menu does not offer a variant that is a way of writing rather than a class (`layoutVariants` in `StudioShell.tsx`).
- **The toolbar moved one pixel as the caret moved.** The name is text, so its width is fractional, and the centered pill sat on a half pixel that rounded either way. The button now gets a whole-pixel width after layout.
- **The menu leaked preview frames on every open.** The first build hosted it in a Radix popover and sheet, which unmount their content on close, so every open built a new `PreviewPool`: frames created went 1, 8, 14, 21, 27, 34 over five opens, measured on the real Studio. WebKit never frees a destroyed frame's document (`preview-pool.tsx`: about 11 MB each), so on an iPhone or in Safari each open would have stranded about 70 MB. The menu now sits in a `PersistentSurface`, the add-slide gallery's host, and is hidden rather than unmounted; a test counts the frames and holds three more opens to zero new ones.
- **On a phone, focusing a slide moved its text 5.6px.** Pre-existing, found by this PR's layout test once it measured every slide. The active bar swapped its 12px top margin for padding (the sticky bar's opaque band), and an inactive bar's top margin collapses out through its slide while the active one's could not. Every bar on a phone now carries the active bar's spacing, so focus changes only its stickiness and background. HARD RULE #20 bans margins in engine layout CSS for this reason; this was Studio CSS.
- **Focus fell to the page when the phone sheet closed.** The menu focused its selected row before the sheet recorded what held focus at open, so the sheet tried to give focus back to its own row. The row is focused a frame later, and the button takes focus before the menu opens.

## 5. Verification

The real Studio, served by `npm run dev`, driven by `docs/e2e/compose-layout-button.spec.ts` on four projects: Chromium desktop, Chromium phone (390px), WebKit phone and Gecko, 16 of 16. The spec covers the button on every slide, a look applied live, a layout that keeps the text, one that asks first, one Undo for the whole visit, focus back to the button, and that no slide moves relative to another when a slide is focused or its menu opens. The frame test counts every `<iframe>` the page creates. Each test was turned red by breaking the product (the write made a no-op, `aria-expanded` never set, the quiet button given its own grid row and `display:none`) and the files restored byte for byte. The first draft of the last test stayed green under its mutation: it measured only the first and last slide, and two bars changing in opposite directions canceled out. It now measures every slide.

The specs that touch the pill pass on desktop and phone with the button in place: `compose-toolbar-steady`, `compose-insert-menu`, `compose-spark-phone`, `compose-panes`, `compose-pill-editor` (47 of 47). The model has unit tests (`slide-layout.test.ts`); the compose suite is 1,656 of 1,656.

Screenshots at 1440px, 820px and 390px, light and dark, were looked at: at 820px the pill wraps to two rows (`cards-grid ▾` beside the block's style on the second) and the menu opens under it, with the preview pane beside it showing each pick.

**Not verified here:** a real iPhone or iPad (WebKit phone emulation is not iOS Safari, and the frame-leak fix rests on the repo's WebKit measurement, not one taken on a device). The desktop popover can cover a long line of the slide being changed, as the review's last round found; that is the one criterion it left at 8.5.

## 6. References

- The mockups and the review rounds: the "Compose Component Pill" artifact of the 2026-11-15 session.
- `engineering/decisions/2026-10-21-compose-point-and-click.md` §5, the Insert menu, whose island and focus lessons this follows.
- `engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md` §7.2, the pane gallery's "keeps your text", which the slide-level fit shares (`bodyFit`).
- `engineering/decisions/2026-07-18-slide-variants-in-gallery.md`, variants as looks.
