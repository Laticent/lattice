---
status: shipped
summary: >
  A randomized Playwright walk over the real Studio — six seeds, 360 operations, four
  structural invariants checked after every op — found seven Compose defects the unit tier
  could not, all of them at seams the unit tests do not cross. The worst is silent data loss:
  the slide node's `directives` attr was not carried by `toDOM`/`parseDOM`, which is the
  CLIPBOARD contract, so copy-paste flattened every slide it touched to an unstyled `content`
  in two keystrokes an author reaches by habit. Also: folding a slide did not survive any op
  that rewrites the deck source (the rail, the gallery), because those re-import through
  `resyncFrom` and the unit test only ever drove the in-Compose `slideOp` path; "Insert table"
  was offered and worked on all 61 components when 4 take a table, so the engine dropped a grid
  the editor still showed; the structural guard read the SELECTION to judge intent, which is
  right for a keystroke and wrong for a paste, making every multi-slide paste a silent no-op;
  deleting the slide you were editing flung the caret and the preview to the LAST slide; and an
  inserted slide did not take the caret. Each fix ships with an e2e oracle checked BOTH ways
  (8 of 10 fail pre-fix) — a round that caught two oracles passing for the wrong reason,
  because they raced the clipboard and asserted "nothing changed" against an untouched deck.
---

# Compose fuzz sweep — what a random walk found that the unit tier could not

**Symptom.** Compose "felt janky" — folding a slide did not stick, and a table
could be added to a slide that has nowhere to put one. Both reports were true,
and neither was the worst thing wrong.

**Method.** A randomized Playwright walk against the *real* built Studio (not a
harness — HARD RULE #23), driving eleven op families in random order and
asserting four structural invariants after every single op: Compose's slide
count == the rail's, == the persisted source's; every slide still carries a
`_class`; and each collapse cap's `aria-expanded` agrees with its
`cs-collapsed` class. Six seeds, 360 operations. The oracles now live in
`docs/e2e/compose-stress.spec.ts`, which also carries a fixed-seed 34-step walk
so the invariants stay enforced.

Every named oracle in that file was checked BOTH ways — run against the pre-fix
build, 8 of 10 fail; against the fixed build, all 10 pass. That round is not
ceremony: it caught two tests that passed for the wrong reason. Both copy/paste
oracles fired ⌘V before the clipboard held the copy, so they asserted "nothing
changed" against a deck nothing had touched, and were green over the very defect
they were written for. They now witness the paste (by the pasted text, and by
emptying the deck first) before judging it.

**Why the unit tier missed all of it.** Every defect below lives at a SEAM the
unit tests do not cross. `compose-collapse.test.ts` drives ProseMirror
transactions directly and so only ever exercises the in-Compose `slideOp` path;
the clipboard defect needs a real DOM serialize/parse round trip; the table gate
needs the built manifest; the caret and insert-focus defects need the shell and
the editor together. Each unit test was correct about the thing it tested.

---

## 1. Copy/paste flattened every slide it touched (data loss)

`⌘A ⌘A ⌘C ⌘V` reproduced all seven slides of the tour deck with `directives:
[]` — every component assignment gone, the deck rendered as seven unstyled
`content` slides. Pasting one slide over another cost that one slide its class
the same way. Undo recovered it, which is the only reason this was survivable.

**Root cause.** `deck-doc.ts`'s slide node spec:

```js
toDOM: (node) => ['section', { class: … }, 0],
parseDOM: [{ tag: 'section.cs-slide' }],
```

That pair is the **clipboard contract** — ProseMirror serializes a copied slice
through the *schema*, not through the node view — so an attribute it does not
carry is an attribute a paste re-creates at its default. `directives` was not
carried.

**Fix.** Bridge `directives` through a `data-directives` attribute in `toDOM`,
read it back in `parseDOM.getAttrs`, and mirror it onto the live `SlideView`
element so a ProseMirror DOM re-read (mutation recovery) recovers it too.
`raw` and `locked` are deliberately NOT carried: `raw` is the byte-exact source
of an *untouched* slide keyed by node identity in `emitDeck`'s baseline, so a
pasted slide — a new node with no baseline entry — must re-serialize from its
content rather than emit the bytes of the slide that was copied. `locked` is the
flag that says "always emit `raw`", so it follows.

**Consequence worth knowing:** pasting a full-slide slice over another slide now
gives you the *copied* slide's class. That is coherent (the slide node is
`defining`, so the slice replaces the node) and it is what the fix's e2e oracle
pins — the outcome that must never return is the third one, no class at all.

## 2. Folding a slide did not stick

Collapse is a node decoration re-established by node IDENTITY on a `slideOp`.
That carries it through an in-Compose insert/delete and through nothing else.
Every slide op that lives OUTSIDE Compose — the rail's add/duplicate/move/delete,
the add-slide gallery — rewrites the deck source, and `resyncFrom` throws the
whole `EditorState` away to re-import it, unfolding everything.

**Fix.** `resyncFrom` reads the folded slides' source chunks before the state is
replaced and restores them after, matching greedily and one-for-one, so a fold
follows its slide through a reorder, survives an insert above it, and folds
exactly one of the two copies a duplicate makes.

**Still open, deliberately:** switching to Markdown and back unfolds everything,
because that unmounts the component. Leaving Compose is a plausible place to lose
a view-only preference, and persisting it would need a store keyed outside the
editor.

## 3. "Insert table" worked on every component

The control was offered on all 61 components and inserted on all 61 — including
`title`, `big-number`, `stats`. The engine then drops the table, so the author
saw a grid in Compose that never reached the slide, and their source carried
`|  |  |` they did not knowingly add. Measured on all seven classes of the
shipped tour deck: seven inserts, seven silent drops.

**Fix.** A `slideTables` map built at the docs-site build from the component
manifest — a slot whose selector names the `table` element, or a GFM delimiter
row in the component's own skeleton. Both readings agree on the same four of 61
(`compare-table`, `matrix-grid`, `obligation-matrix`, `roadmap`); keeping both
means a component that grows a table in either place is picked up without editing
the page. Same injection shape, same permissive-by-default guards, and the same
one-source-of-truth reasoning as `slideHeadings` / `slideBlocks` (HARD RULE #1).

The control is **hidden**, not dimmed, on a class that takes no table — matching
how the Format group already drops a register the class will not render. An
unclassed slide, an unrecognized `_class`, and a missing map all stay permissive.

## 4. A paste could never grow the deck

The structural guard reads the pre-transaction SELECTION to tell a deliberate
cross-slide edit from an accidental Backspace-merge at a slide join. That is the
right question for a keystroke — a caret at a join is genuinely ambiguous, and one
Backspace there is far more often an accident than an intent to merge — and the
wrong question for a paste, where the author has already declared intent by
putting slides on the clipboard.

Judged by the selection, every multi-slide paste was rejected, silently. Measured
with a seven-slide clipboard: pasting at a caret, over one slide's selection, and
into an emptied deck all left the deck exactly as it was. The only case that
appeared to work was pasting the whole deck over a whole-deck selection, and that
"worked" only because seven slides replaced seven. So there was no way to GROW a
deck by pasting — which is how a non-technical author duplicates a section.

**Fix.** The guard exempts a transaction carrying ProseMirror's own `paste` /
`uiEvent: paste|drop` meta, placed AFTER the locked-slide check so a paste still
cannot silently rewrite a slide Compose can't round-trip.

**Still open:** pasting a multi-slide clipboard at a BARE CARET still does
nothing. That one is not the guard — it is ProseMirror slice fitting. A selection
that starts mid-slide serializes with `openStart`/`openEnd` of 2, so the slice has
no complete slide boundary to place and merges into the surrounding textblock
instead. Closing the slice to whole slides in `transformPasted` when it contains a
complete slide would fix it, and it changes paste semantics broadly enough to want
its own pass.

## 5. Deleting the slide you were editing threw you to the end of the deck

`commit()` re-anchors the caret to its own slide node across the full-doc
rebuild, but when that node is the one being deleted there was nothing to anchor
to and `replaceWith` mapped the selection to the END of the document. Delete
slide 2 of 7 and both the caret and the preview (which follows it) landed on
slide 7. `commit` now takes a fallback index — the slide that took the deleted
one's place.

## 6. The slide you just added was not the slide you were in

Inserting from the gallery moved the rail and painted the preview, but left the
caret behind, so the next keystroke went into the previous slide.
`onInsertComponent` now reveals the new slide in whichever editor is mounted,
taking focus only on a fine pointer (the same rule the preview picker uses — on
touch, focusing raises the keyboard on every insert).

## 7. The locked-slide badge was clipped

A slide Compose cannot round-trip (inline math, block HTML, strikethrough) is
read-only and says so with an `edit in Markdown` badge. The badge and the delete
cap both sit at the top-right, and the cap landed on it: the label read
`· EDIT IN MARKDO`. The one piece of chrome that explains why the slide will not
take a keystroke was cut off mid-word. The badge now clears the cap.

---

## Found, NOT fixed here (off the path of this change — HARD RULE #18)

- **`logo-wall` inserts six broken images.** Its skeleton references
  `logo-1.svg` … `logo-6.svg` as relative paths; nothing serves them, so
  inserting the component from the gallery yields six broken images and six
  console 404s. This is a component-catalog asset gap, not a Compose defect.
- **28px slide-bar controls on a phone.** Every cap and pill button in the
  Compose slide bar is 28×28 at 390px, under the 44px touch guidance, and one of
  them is the destructive delete. Resizing shipped chrome is a visual-design
  call, so it is reported rather than taken.
- **The preview follows the caret, not the Compose scroll.** Scrolling Compose
  to the bottom leaves the preview on whatever slide the caret is in. Defensible
  (the caret is the thing you are editing) but worth a deliberate decision.
- **An emptied deck shows zero slides in the rail** while Compose shows one (its
  schema is `slide+`, so the document cannot be empty). The Markdown pane reaches
  the identical state on its own select-all + Delete, so this is the shell's shape
  for "empty" rather than anything Compose does — but a deck with no slides and no
  "start a slide" affordance is a dead end worth a deliberate design answer.
- **`⌘A ⌘A` then a keystroke still replaces the whole deck** with no warning.
  This is the documented, guarded behavior of `selectionSpansSlides` (#1650) and
  undo recovers it — but it is the one remaining two-keystroke path from a
  finished deck to a blank one, and non-technical authors are exactly who reach
  for select-all.
