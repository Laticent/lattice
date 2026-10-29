---
status: proposed
summary: The Studio's slide-structure model. One labeled "+ New slide" door, every slide action on the slide strip as one menu with drag, actions on the slide you see (also in heading-split decks), a real multi-step slide Undo, and a + in strip gaps. Built foundation first - deck ops that touch only the slides involved, unit ids that follow content (today they follow position, visibly for Live viewers), Undo - then the menu with drag. Veduta needs nothing. Reviewed by the adversarial trio and a UI/UX expert.
---

# The strip is the deck: one model for adding, moving and deleting slides (2026-10-27)

Status: proposed. The owner aligned on the model, then on four changes after review (§13). Nothing is built. The work is
§12, and every item is logged in `followups.d/2927-p*.md`.

## 1. The symptom

The owner called adding a slide "a super mystery". Five buttons open the add gallery (`SlidePicker`): the editor
header's `+ Add`, the `+` that leads the slide strip, the Compose slide bar's "Add slide below", the command palette, and
the phone menu drawer. All five insert **after** the current slide (`onInsertComponent` → `addSlideAfter(source,
activeFullIndex, …)`, `StudioShell.tsx:4740`). The Library and Fabricate insert directly, also after. Nothing a person
clicks adds before; only the Architect agent can insert at the start.

Duplicate and move have one door, and delete two, each behind a confirm: five 28px icons with no visible text (each has a
tooltip and `aria-label`) that lead the slide strip (`slideOps`, `StudioShell.tsx:6148`), and the Compose bar's delete
(`askDelete`, `ComposeView.tsx:1015`).

## 2. What is wrong

| Surface | Go to | Add | Before | Duplicate | Move | Delete |
|---|---|---|---|---|---|---|
| Icon row leading the strip (`slideOps`) | – | yes | no | yes | yes | yes (tap twice) |
| Editor header `+ Add` | – | yes | no | – | – | – |
| Compose slide bar | – | below | no | – | – | yes (confirm) |
| Slide pills (`SlideRail.tsx`) | yes | – | – | – | – | – |
| Slide map (`StudioMap.tsx` over `MapRail.tsx`, Veduta) | yes | – | – | – | – | – |
| Present overview grid (`SlideOverview.tsx`) | yes | – | – | – | – | – |
| Command palette | – | yes | no | no | no | no |
| Phone menu drawer (`StudioDrawer.tsx:380`) | – | yes | no | – | – | – |
| Keyboard | yes | no | no | no | no | no |

- **Hard to see.** The header button's word "Add" hides below a 36rem pane (`hidden @[36rem]:inline`), and the strip's
  `+` is an icon. The count of doors matters less than that none of them reads as *the* way to add. Two earlier "one
  door" passes (#1058, #1654) unified the gallery but not the visibility.
- **Detached.** The icon row acts on "the current slide", not on a tile.
- **Two strips that only navigate.** The pills and the thumbnail map are one list at two sizes.
- **The seam.** The strip numbers rendered slides; the actions work on blocks of text (units). With headings that split
  (the engine's default, `deck-outline.ts:6`), one block renders several slides. In a deck written without `---`, the
  whole deck is one block: run through `deck-ops.ts`, Duplicate doubles the deck (`[7] → [7,7]`), Move does nothing, Add
  lands at the end, and Delete is refused (`deleteSlide` keeps the last unit). With `---` decks, deleting "slide 4" can
  delete slides 3 to 5.
- **No keys.** No structural action has a shortcut; only Add is in the palette.

## 3. Options weighed for "before or after"

Ten options were mocked and scored on seven weighted criteria (notice 25%, clear where it lands 20%, taps 15%, phone
space 15%, hard to get wrong 10%, matches the Compose `+` 10%, build cost 5%). **The scores are judgment**, informed by
an independent UI/UX review, not measurements; do not quote them as data.

| Option | Score | Verdict |
|---|---|---|
| R · Button + gap `+` + "Move before" | 4.75 | Chosen, refined in §5 |
| I · Button + "Move before" only | 4.40 | R's phone half |
| H · Gap `+` only | 4.05 | No standout button |
| B · Before/After menu on the button | 4.00 | Taxes every add |
| G · Button that splits on hover/tap | 4.00 | The target moves while you aim. **Built after all, 2026-10-28** |
| A · Before/After switch in the gallery | 3.80 | Rejected by the owner |
| F · Two labeled buttons | 3.75 | The rare action takes prime space |
| C · Before/After on every tile | 3.70 | Clutter |
| D · Long-press for before | 3.20 | Undiscoverable |
| E · `+` on each side of the slide | 3.15 | No phone margin; reads as prev/next |

**Revised 2026-10-28: the door splits on a tap (G), and "Move before" is gone.** The owner saw the built "Move before"
button on a toast and rejected it: it asked where the slide goes only after it had gone somewhere, on a notice that
vanished, which is out of character for the Studio's notices. G had been scored on its HOVER form, where the target moves
under the pointer; a split on a TAP has no such problem, and puts the choice where the thumb already is. There is no
timer (one was proposed and declined: it adds a slide nobody chose, and fails anyone slower, WCAG 2.2.1).

The reviewer's account of other tools (not checkable from this repo): PowerPoint and Google Slides insert after the
current slide and set an insertion point when you click a gap between thumbnails; Notion adds below, Alt for above; Canva
shows a `+` between pages. None makes "before" a peer of "after".

## 4. Principles

1. **Act on the thing.** A slide's actions live on the slide: its tile in the strip, its bar in Compose.
2. **One loud, labeled door.** "+ New slide" is always visible where the author works.
3. **Position is a place.** "Where" is a gap or a drag, never a switch.
4. **One verb set everywhere.** Same actions, names, order and keys in the strip menu, Compose, the palette.
5. **Undo, don't ask** — and Undo is real: several steps, surviving typing and collaborators (§7).
6. **Act on the slide you see.** Numbers and targets are rendered slides; blocks are shown, not imposed (§6).
7. **Touch only what you change.** A structural op rewrites only the slides it moves (§8).

## 5. The model

**The strip is the deck's one place for structure.** Pills and thumbnails stay as two sizes of one strip, with one
behavior.

- **+ New slide.** A labeled, accent-filled "+ New slide" pill floats over the preview's bottom-right corner, just
  above the strip, at every width: the owner's call on seeing the built strip-end button, "an overlay in the preview
  itself so it stands out", like Gmail's Compose. Then "noticeable, not huge": it is 40px tall (44px on a touch
  screen, the repo's touch floor), 106px wide. Four sizes were scored in the real Studio (today's 140×56 pill 4.20,
  this smaller pill 4.40, a 56px round + 3.60, a 44px round + 3.50; judgment, weighted toward saying what it does,
  since an unlabeled + was part of the original mystery). It can cover the corner of a slide that reaches the bottom
  of the stage. **When the preview is collapsed**, a labeled door in the editor header takes over, so one door is on
  screen at a time. A phone hides the editor's toolbar, so its edit pane floats the same pill in its bottom corner,
  and it steps aside while an editor holds focus, which on a phone is when the keyboard is up. The landscape-phone
  view shows only the slide, so it has no door.
- **The gallery opens first; the slide is added on pick.** The target (slide id and side) is fixed when the gallery
  opens, so a focus move while it is open cannot change where the slide lands. The title names it by slide title:
  "New slide after 'Market size'", falling back to the number. The last-used layout comes first.
- **A slide menu** on every strip slide, from a `⋯` button beside the current slide (44px on touch, never inside a pill),
  right-click, Shift+F10 / the context-menu key, or tapping the current slide again. It holds New slide before,
  Duplicate, Move earlier, Move later and Delete, each showing its shortcut. Disabled items stay visible with a reason.
  - **Opening it makes that slide current** (Fuoco `go` with `grab:false, expand:false`), so the action's target is never
    ambiguous; strip centering is suppressed while it is open; it closes only on a scroll the user starts (wheel, touch,
    drag), never on a programmatic one.
- **Drag to reorder** in both strips. Long-press lifts the tile; releasing without moving opens the menu. That is the
  final rule from the first build, so no gesture changes meaning later. iOS fires no `contextmenu` on long-press, so it is
  a pointer timer that cancels on movement.
- **A `+` in the gaps** between strip slides on hover. On touch, only the gaps either side of the current slide, widened
  to 44px. Item 13 measures it on a real phone before it is built.
- **The door asks where, in place.** A tap splits "+ New slide" into **Before this slide | After this slide** (words,
  not arrows: the owner found "← Before | After →" hard to read, and arrows say previous/next), with After focused; it
  closes when focus MOVES outside, never when focus merely goes away, since iOS Safari does not focus a tapped button
  and closing on that blur swallowed the tap on After (the owner's iPhone recording). Enter or a
  tap on After means after, a tap on Before means before, and Escape or a tap anywhere else puts the pill back. Nothing
  happens on its own. The choice opens the gallery, which says where the pick lands ("Pick a slide to add it before
  'Market size'"; on a phone, a line under the sheet's header), and the target is fixed as it opens. When the slide is
  in, the pill itself says so ("Added before 'Market size'") for a moment, then returns: no toast. While it says so it
  is a message, not a button: it wears the strip chip's notice surface (neutral, bordered, an accent check) instead of
  the accent fill, and a tap on it does nothing. *(Owner's calls, 2026-10-28: the split replaces the "Move before"
  button on a notice that phase 1 built; the notice color and the dead tap came from the owner's iPhone test: "added
  after is a message. for it to add a new slide is astonishing".)*
- **Strip actions confirm on the strip.** Duplicate, Delete and Move say what they did in a chip just above the strip,
  with its Undo, where the read hint sits; the next action replaces it, and it clears after 6s. The Undo is Filo's,
  so its result is Filo's too: the slide it brings back is revealed and the screen reader hears "Undid: Delete
  slide". The Undo leaves the note as soon as the deck changes again, and an op that changes nothing shows no note.
  No toast.
- **Delete happens at once, with a real Undo** (§7). The note says what happened ("Slide deleted. · Undo"); the
  Live confirm, the one place delete still asks first, names the slide it takes.

**Where the affordances exist.** Only on the full view: never under a reader lens (it shows a filtered, possibly
reordered subset, and today's `op*` functions take a view index, `curIndex`, that would hit the wrong slide), never at the
Read stop, never in the landscape-phone view, never for a read-only Live member. Every op takes deck positions. The
Present overview stays read-only. Empty deck: the strip shows one "+ Add your first slide" tile. One-slide deck: Move is
disabled with a reason; deleting the last slide is refused, as `deleteSlide` does today.

| Action | Mouse | Touch | Keyboard (strip focused by keyboard) |
|---|---|---|---|
| Add after current | + New slide | + New slide | ⌘↩ |
| Add before current | + New slide, then Before; menu; gap `+` | + New slide, then Before; menu; gap `+` | ⇧⌘↩ |
| Duplicate | Menu | Menu | ⌘D |
| Move | Drag; menu | Long-press, drag; menu | ⌘⇧← / ⌘⇧→ |
| Delete | Menu, then Undo | Same | ⌫ or Delete, then ⌘Z |

**The shortcuts serve keyboard users, and say so.** They fire only while the strip holds focus that arrived by keyboard.
A pointer pick returns focus to the editor (as today), so ⌫ never deletes a slide while the author thinks they are
typing, and ⌘D in the editor stays CodeMirror's select-next. ⌥← is avoided because a lost focus would make Alt+← browser
Back on Windows. The keys are shown in the menu and in one table under "?".

## 6. The seam: rendered slides and blocks of text

Fuoco models it: a **unit** is one authored block, its **parts** the slides it renders as
(`docs/src/lib/fuoco/README.md` §The model; Lattice's outliner is `docs/src/lib/deck-outline`).

1. **Act on the slide you see.** Delete, move and duplicate act on one rendered slide. Inside a block, the op cuts at
   that slide's heading (the part offsets are in the index), and the result renders the same, because a heading that
   splits renders as a slide boundary either way. In a heading-split deck every slide is then fully editable.
2. **Show the block, don't impose it.** A block with several slides gets a labeled bracket (its title on hover) and, in
   thumbnails, a shared tint. It is information, not a rule; there is a gap `+` between every two slides.
3. **Numbers are rendered numbers** in every notice, title and announcement.

**Built (item 4).** `deck-ops.ts` gains `duplicateAt`, `deleteAt`, `addAfterAt` and `moveAt`, which take a rendered
slide (`SlideAt`, a block and a part). Each cuts only the boundaries it needs: a `---` goes in above the heading where
the slide starts and where the next one starts (and, for a move, around the neighbor it passes). Then the block op runs
on a slide that is now a block of its own. A cut sits where the engine's own split puts the boundary, so a directive or
an eyebrow above the heading stays with its slide. The strip, the add gallery, the Library and Fabricate inserts, and
the door's Before all use them; Move earlier and later disable at the deck's first and last rendered slide, and the delete
confirm names the one slide it takes. Pinned by a test that runs every op on every slide of `examples/split-headings.md`
and of a two-block outline against a list model, read through the engine's own split (`splitSourceToSections`), and by
a `slide-ops.spec.ts` e2e in the real Studio; both fail without the change. Compose's own add and delete still act on
blocks, as Compose shows blocks.

## 7. Undo that holds

Today's Undo is a toast (`showUndo`, `StudioShell.tsx:1566`): one slot, 6s (`ACTION_DURATION`, `lib/notify.ts:87`),
gone the moment the source changes for any reason (`:1600`), which in Live is any peer keystroke. Other notices take
the slot (the Live knock, a lesson's "Show me", Compose's Undo, the host's summon). The Live editor keeps no CodeMirror
history (`Editor.tsx:794`). So:

- A **slide history** (the plan; superseded by Filo, below): a stack of structural ops, each anchored by slide id and
  content, not by whole-document equality.
- **⌘Z with strip focus** and the notice's Undo both use it. The notice is one view of the stack, so a later notice
  replacing it loses nothing.
- **A confirm only for big or shared deletes**: 3 or more slides at once, or while others are in a Live session.
- The editor's own ⌘Z after a slide Undo must not re-apply the op (value-sync dispatches enter CodeMirror history,
  `Editor.tsx:1046`); the build settles which history owns a structural op.

**Built (item 6), on Filo.** The first build kept a slide history of its own beside the editor's undo. While this PR
was in review, #2940 made Filo (`2026-10-27-filo-undo-history.md`) the Studio's one undo history, with a gate against
any other stack, so the rebase onto it replaced that slide history rather than keeping two:
- A strip op is a labeled step of Filo's history ("Delete slide", "Move slide later", "Insert “Market size”"), written
  through the commit path with origin `rail`. ⌘Z from anywhere, the strip included, walks back ops and typing in the
  order they happened, and Filo's reveal lands each undo on the slide it changed.
- The strip's note keeps its Undo only while the op is the newest step: any later change to the deck takes it away,
  even one that leaves the text as the op left it (a letter typed and erased), and so does joining or leaving a Live
  session, which moves undo between Filo and the session's own. So the note never undoes something other than the op it
  names. After that, ⌘Z still reaches the op. Each op closes Filo's open step before it writes, so two quick identical
  ops (a double tap on Duplicate) are two steps rather than one under Filo's typing window, and an op that changes
  nothing (moving one of two identical slides past the other) writes nothing and shows no note. The checker that
  reviewed the rebase found both of those. This drops the first build's "Undo after typing in
  another slide" (a patch written back as an edit): under one linear history, the typing comes back off first.
- In a Live session Filo hands ⌘Z to the binding's undo manager, which undoes only this browser's edits. The shared-text
  write of a strip op is a step of its own there (`stopCapturing` on both sides, live-controller `structural`), so one
  ⌘Z takes back exactly the op.
- Delete is one tap; it asks first only while others are in a Live session. A strip delete takes one rendered slide
  (item 4), so the "3 or more slides" case cannot arise there; Compose's block delete keeps its own ask.
- Kept from the first build: the Live controller's echo filter clears on a Studio write, so a write that brings back an
  earlier text reaches the shared deck (it predates this PR); and deleting the LAST slide lands on the new last slide
  (a clamp one short since before this PR).
- The first build's review record (four checker rounds on the slide history) is in this PR's history; its findings
  about mapping older steps through unrecorded changes are why one history, not two, was the design from the second
  cut on. Pinned by `studio.controls.test.tsx` (the note's Undo retires on any later change; ⌘Z from the strip walks
  typing then the delete), a `slide-ops.spec.ts` e2e, and a two-browser Live run
  (`2026-10-27-slide-structure-strip/live-undo/`).

## 8. Touch only what you change

`deck-ops.ts` splits the deck, edits the list, and `rejoin`s it: every slide is trimmed and every separator normalized.
Moving the last slide of a 30-slide deck written with `\n---\n` rewrote 557 of its 595 characters, and `***` separators
became `---` (measured by the red team). The editor treats that as a whole replace (caret jumps, one huge history entry),
and in Live the rebase becomes a 94% replace that can drop the change or overwrite a peer.

The ops instead **splice only the ranges they touch**, from the index's offsets. The same work yields the map of where
each slide went (§10). They also renumber the front-matter `say:` narration keys, which are keyed by slide number
(`lib/core/resolve-narration.mjs`); today a move re-attaches narration to the wrong slides.

**Built (item 7).** `renumberFrontMatterSay` in `lib/core/renumber-say.mjs`, the write side of the parser in `resolve-narration.mjs`, rewrites only the
key digits of `say:` entries. `carrySay` in `deck-ops.ts` drives it from `moved`, counting RENDERED slides: a block that
headings split renders as several slides, and the keys count those. A deleted slide's entry goes, and a duplicate's copy
gets its own copy. Every op runs it, and so does Compose's own add and delete, which rebuild the deck without the ops
(`ComposeView.tsx` `commit`, by node identity, written into the doc's front-matter attribute so later keystrokes keep
it). Pinned by unit tests in `deck-ops.test.ts`, `ComposeView.sync.test.tsx` and `resolve-narration.test.js`, and by the
`slide-ops.spec.ts` e2e in the real Studio; each fails without the change. Not verified: hearing it in Present, since
the sandbox plays no audio; Present reads the same `frontMatterSayMap` by the same slide number.

## 9. Veduta, the strips, and focus

Veduta (`docs/src/lib/veduta`) decides which thumbnails stay loaded; it knows nothing about clicks or editing and stays
that way (it is headed for npm). The pill strip does not use it.

- **One strip-actions module** holds the menu, gap `+`, drag and the keyboard model. It plugs into the Studio's strips
  through `StudioMap` and the Studio's pill strip, never into `MapRail` itself, which the Playground also uses
  (`PlaygroundMap.tsx`) and which cannot edit there.
- **Keyboard and screen readers.** Both strips are a `nav` today, and `aria-activedescendant` needs a composite role whose
  options cannot hold the `⋯` and `+` buttons, so it is out. The strip is a roving-tabindex list (each slide named
  "Slide 4 of 12, Market size"), the `⋯` and `+` sit outside it, and **the current slide is always rendered** even when
  Veduta has unloaded its window (rendered outside the window, not a Veduta change). One live region announces each
  result ("Moved to position 3", "Deleted, Undo available").
- **Losing focus.** A focused tile that scrolls out unmounts and the browser drops focus to the page. **Reproduced
  2026-10-27** in Chromium on a 60-slide deck: focus went from slide 1's tile to `BODY` once a wheel scroll unloaded it;
  ArrowRight still stepped the deck, because the shell's page-level arrow navigation handles it, but focus had left the
  strip, so a strip-scoped shortcut would do nothing (`followups.d/2927-p9-strip-keyboard-model/`). Rendering the current slide always, returning focus to the strip, and drawing drags as a
  floating copy from the tile's poster (the strip holds the pointer) cover the three cases: an open menu, a shortcut, a
  long drag.

## 10. Fuoco: a slide's id must follow the slide

Fuoco keeps one current slide for every view. "Insert, then go to it" already works (`go(…, { after })`, used by
`applyDeckOp`).

**Measured, 2026-10-27, twice** (this note, then the checker): `deck-ops.ts` on a deck A–E, C split into three, through
the real `updateDeckIndex`. Fresh ids come from a global counter, so their numbers depend on run order; the pattern is
stable.

| Op | Ids after (start: A1 B2 C3 D4 E5) |
|---|---|
| Delete B | A1 **C2** D4 E5: C takes B's id |
| Add after B | A1 B2 **new3** C(new) D4 E5: the blank takes C's id |
| Move B after D | A1 **C2** D(new) **B4** E5 |
| Duplicate B | A1 B2 **copy3** C(new) D4 E5 |

The cause: `buildDeckIndex` carries an id by the offset where a unit starts (`carry`, `updateDeckIndex`), which is right
for typing and wrong for structural edits. **It is visible today.** `hub.update` re-places the focus by unit id
(`hub.ts:461`). `applyDeckOp`'s `go(…, {after})` corrects the author's own view in the same update, but a viewer with no caret (preview only, the Read stop, a follower, a phone) can land on the wrong slide.
**Reproduced 2026-10-27 in two real browsers over Live** (`2026-10-27-slide-structure-strip/live-peer-ids/`): a phone viewer
on Charlie landed on the new blank slide when the host added a slide after Bravo. When the host deleted Bravo, the viewer
stayed on Charlie, although the red team's Node run through the hub predicted Delta, so the delete case is not shown to
misfire. Compose's own delete skips
`applyDeckOp` and relies on the carry too.

**Built (item 5), in three places, because the bug had three.** Fixing the ids alone did not fix Live.
1. `deck-outline` assigns ids in three passes (`assignIds`), in both the incremental and the full path: a unit at the
   same offset with unchanged text keeps its id; then a unit whose text is an old unit's takes that id; then what is
   left goes by offset. The first pass is what stops typing in one of two identical slides from handing the untouched
   copy the edited one's id.
2. `hub.update`: a caret at the top of the focused slide follows that slide when a slide is inserted just above it,
   but only while the slide still exists. A slide merged into the one above leaves the caret where the merge put it.
3. `Editor.tsx` does not report the caret after a Live peer's change (`collab.isPeer`, y-codemirror's
   `ySyncAnnotation`); that change only maps the caret, and the mapped caret, left on the near side of the insertion,
   was what pulled the viewer onto the new slide. The editor then moves its own caret to the hub's, so the viewer's
   next keystroke lands in their slide. Every other change still reports: a lint fix that replaces the whole text
   maps the caret to 0 in CodeMirror and to the end in the hub, and the report keeps the two in step.

The checker's review found three regressions in the first cut of this (a Fix all that sent the preview to the last
slide, a merged slide that sent a viewer to the next one, and the duplicate-slide id swap), each now pinned by a test
that fails without its fix.
After all three, the two-browser run keeps the viewer on Charlie (`live-peer-ids/README.md`). One case is NOT covered:
text arriving in two pieces, where the first piece merges the new slide into the old one, still hands the old id to
the new slide. Live delivers one change per edit, so it did not show there.

The original plan, kept for the record: the fix lives in `deck-outline`, not in a side channel: when an edit spans units, match unit texts between the old
and new index and carry ids by content. A hint from the deck ops would miss peers (they receive plain Yjs text,
`live-controller.ts`), the toast Undo, editor undo and checkpoint restore. A Fuoco property test pins "after a move or
delete, the id follows the content", with a failing arm, and the README's "ids that survive edits" (§The model) is
corrected to say what holds. (Built as planned, except the property test lives in `deck-outline.test.ts`, beside the
outliner that carries the ids, and fails on the earlier code.)

## 11. Every surface

| Surface | Change |
|---|---|
| Icon row leading the strip (`slideOps`) | Removed **in phase 3**, when the menu and drag replace it |
| Preview | + New slide floats over its bottom-right corner, above the strip, at every width |
| Editor header `+ Add` | Becomes a labeled "New slide", shown while the preview is collapsed |
| Phone drawer "Add slide" | Removed: the phone's edit pane has its own round door |
| Icon row's `+` | Removed in phase 1; the rest of the row waits for phase 3 |
| Add gallery title | "New slide", the door's own name, so the two never disagree (#1654); item 15 adds the position |
| Slide pills and slide map | Menu, drag, gap `+`, block brackets; full view only |
| Compose slide bar | Keeps "+ below", relabeled "New slide after"; a `⋯` menu with the same actions; its delete goes through the one history |
| Command palette | New slide before, Duplicate, Move earlier/later, Delete |
| Present overview grid | Unchanged |

**What else depends on the names.** The accessible name changes from "Add slide" to "New slide" on purpose, and every
dependent moves with it: the lessons (`lessons/lesson-kit.ts:211` selects `[aria-label="Add slide"]`; five lessons use
it; `lessons/lines.ts` says "Click Add slide."), the welcome tour (`tours/welcome.ts:15`), the pre-paint skeleton
(`StudioChromeSkeleton.tsx:333`), `studio.controls.test.tsx`, the e2e fixture's `CHROME` map (`addSlide`,
`addSlideDialog`) with `openAddSlide` and `openAddSlideFromRail`, `e2e/slide-ops.spec.ts` (the slide-op buttons and the
two-tap arm), and the dialog-name lookup in `gallery-preview-metamorphic.spec.ts`. A lesson whose target is missing falls
to its "I'll open the gallery for you" branch and never goes red, so a test asserts that every lesson selector resolves
in the built Studio.

## 12. Work items

Each is a file in `followups.d/2927-p<n>-…`.

**Phase 1 · A door you can see** (relief now; the icon row stays)

1. "+ New slide" at the strip's end and round on a phone; the labeled editor-header door where the preview is hidden;
   the drawer row goes; the rename and every dependent in §11, with the lesson-selector test.
2. Delete names what it removes ("Delete 'Pricing' (3 slides)"), keeping the confirm until §7 exists. This alone stops
   today's silent multi-slide delete. *(Built: `deleteTargetName` in `deck-ops.ts`. The strip's armed button holds its
   hint open above itself. A bottom notice was tried first, and it covered the very button the second tap needs, so
   the arm ran out under it.)*

**Phase 2 · The foundation**

3. Deck ops splice only the touched ranges and return where each slide went (§8). *(Built: `deck-ops.ts` reads the deck as slots from the
   slide index, each keeping its own whitespace and separator, and changes only the slots an op involves; every op
   returns `moved`. On a 30-slide deck with `\n\n---\n` separators, moving the last slide changes a 47-byte span of
   757. A 300-deck randomized test, run once at 5,000, holds the ops to the list edit they replace. It found two edges,
   both fixed: text moved into a blank slide's slot landed on the `---` line, and a blank first slide could leave a
   deck starting with `---`, which opens front matter. An
   independent checker then found two regressions, both fixed with tests that fail on the earlier version: content
   written above a compact `\n---\n` separator turned it into a heading underline and merged two slides, so written
   content now always ends in a blank line before a separator; and a slot's indentation passed to content moved into
   it, turning a heading into a code block, so indentation now travels with its content. A second randomized test covers
   compact separators and indented first lines.)*
4. Ops act on the rendered slide inside a block (§6.1).
5. Unit ids follow content in `deck-outline`; Fuoco test and README (§10).
6. Undo for slide ops (built on Filo's one history): ⌘Z from the strip; confirm for 3+ slides or a shared Live session (§7).
7. Ops renumber `say:` narration keys (§8).

**Phase 3 · Menu and drag, together** (then the icon row goes)

8. The strip-actions module and the slide menu in both Studio strips: opening rules, gating to the full view, empty and
   one-slide states, the fixed gallery target, palette entries.
9. The strip's keyboard model: reproduce today's focus drop first; roving tabindex, current slide always rendered, live
   region, keyboard-only shortcuts shown in the menu and under "?".
10. Drag to reorder with the final long-press rule, a floating copy, edge auto-scroll, and tiles keyed by slide id;
    measure the redraw cost of an insert near the start before and after.
11. Remove the icon row; rewrite `e2e/slide-ops.spec.ts` for the menu, drag and Undo.
12. ~~The "Move before" notice on its own lifetime~~ Retired 2026-10-28: the door asks Before | After in place (§5).

**Phase 4 · Position and polish**

13. Gap `+` in both strips; measure the touch target at 390px on a real phone first.
14. Block brackets: labeled, tinted in thumbnails, display only.
15. The gallery title names the target by slide title; the last-used layout first.
16. Compose: "New slide after" label, the `⋯` menu, its delete through the one history.

**Later**

17. Multi-select (shift- and ⌘-click; bulk move and delete under the 3+ confirm). Deferred; phases 2–3 keep ids and the
    menu ready for it.

## 13. Decisions

Taken by the owner, 2026-10-27:

- The strip is the deck; one labeled door; Undo, not confirm; keep both strip sizes; Veduta unchanged.
- After review: **foundation first** (phases as §12); **act on the slide you see**, also in heading-split decks; **+ New
  slide at the strip's end** on desktop and tablet with an editor door where the preview is hidden; **a real Undo plus a
  confirm for 3+ slides or a shared Live session**.

## 14. Review

The design went through the adversarial trio (red team, Munger inversion, independent checker) and a separate UI/UX
expert review on 2026-10-27, after a first UI/UX review that shaped §5. What each changed:

- **Red team:** the heading-split blocker (§2, §6), the visible id bug and the in-indexer fix (§10), Undo in Live (§7),
  whole-deck rewrites (§8), the menu closing itself on open (§5), lens and Read gating (§5), `aria-activedescendant`
  (§9), MapRail being shared with the Playground (§9), `say:` keys (§8), the fixed gallery target (§5).
- **Inversion:** foundation-first phasing with the icon row kept until drag ships (§12), the lessons and tour that
  depend on "Add slide" (§11), delete safety before brackets (item 2), the final long-press rule (§5), keyboard-only
  shortcuts (§5).
- **Checker:** the corrected door count for delete, where the icon row sits, the extra insert paths, the id table's
  run-order caveat, the dependents in §11. Every other code claim confirmed.
- **UI/UX:** the add door where the preview is hidden, the strip-end button, the notice's timing and announcement, the
  44px `⋯` outside the pill, titles over numbers, the empty and one-slide states, multi-select as a later item.

Reproduced on a real surface since: the focus drop (§9, Chromium) and the Live viewer landing on the wrong slide after a
peer's add (§10, two browsers; the delete case did not misfire). Not yet verified on a real surface: the touch target
(item 13), the redraw cost (item 10), and the menu closing itself (§5, a prediction about code not yet built).
