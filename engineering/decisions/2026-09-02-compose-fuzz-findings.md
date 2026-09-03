---
status: shipped
summary: >
  A randomized Playwright walk over the real Studio — six seeds, 360 operations, four
  structural invariants checked after every op — found seven Compose defects the unit tier
  could not, all of them at seams the unit tests do not cross. (That sweep was a scratch
  harness; what is COMMITTED is one seed x 34 steps as a regression net, plus a named oracle
  per defect.) The worst is silent data loss:
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
`cs-collapsed` class. Six seeds, 360 operations, from a scratch harness. What is COMMITTED
is smaller and should not be described as that sweep: `docs/e2e/compose-stress.spec.ts`
carries a named oracle per defect plus ONE seed at 34 steps as a regression net.

Every named oracle in that file was checked BOTH ways. My own run of the first cut put it
at 8 of 10 failing pre-fix; an independent checker pass measured 9 of 10 on a clean
pre-fix build. Take the direction as the finding and neither number as exact — the
difference is a clipboard race in the oracles themselves, which is finding 10 below. That round is not
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

## 3. An inserted table was invisible — and the first diagnosis was WRONG

The report was "slides that don't support tables allow the adding of a table," and it was
half right in a way worth recording, because the first fix here was built on a false
premise and shipped as far as a PR before the inversion pass caught it.

**The claim was:** the engine drops a markdown table on a component with no table slot, so
Compose should withhold the control on 57 of 61. **The claim was false.** The engine has
carried a UNIVERSAL TABLE treatment since `2026-08-02-default-slide-layout.md` §4 — landed
in `lib/base/base.elements.css`, with its own gate (`checkUniversalTableGuard`) — precisely
so a plain pipe table on `content`, a base modifier, or no class at all renders at the
boardroom bar instead of raw browser defaults. Rendered and looked at: a table on a `title`
slide comes out with label-cased heads, `--spectrum-structure` underline, hairline row
rules and accent zebra. Exactly one component of 61, `split-compare`, genuinely drops one.

**What was actually broken:** `insertStarterTable` built the table with EMPTY cells. That
serializes to `|  |  |` / `| --- | --- |` / `|  |  |` and renders as two hairlines and
nothing else — invisible on a dark slide, and indistinguishable from a button that did
nothing. The engine was working perfectly on content that had no content.

**Fix.** The starter table's header cells carry `Column`, so an insert is visible the
moment it lands. The control stays on every component: HARD RULE #29's stated policy for
"an author can do this but probably shouldn't" is to warn and coach, never to remove the
door, and the withheld-control version took the option that rule explicitly refuses.

**How the wrong diagnosis survived to a PR**, because that is the transferable part:
the probe printed `tables=1` for the preview and the screenshot showed no visible table.
The number was right and the eye was wrong, and the write-up followed the eye. A
measurement that contradicts the screenshot is the interesting result, not the noise.

## 4. A paste could never grow the deck (and a DROP must not)

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
`uiEvent: paste` meta, placed AFTER the locked-slide check so a paste still cannot
silently rewrite a slide Compose can't round-trip.

**NOT `drop`, and that was learned the hard way.** The first version of this exemption
covered `uiEvent: 'drop'` on the same "the author declared intent" reasoning. A drop does
not carry it: `prosemirror-view`'s `handleDrop` puts a `deleteSelection()` AND a
`replaceRange()` in ONE transaction, so dragging a slide's whole selected content into a
neighbour empties the source slide, invalidates its `block+` content, and ProseMirror
removes the node. Measured on the real Studio: a 7-slide deck silently became 6 and the
`big-number` slide's `_class` went with it, by an ordinary mouse gesture — the exact
accident this guard exists to prevent, reintroduced through its own exemption. Undo
restored it, which is mitigation, not permission.

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

## 8. The clipboard bridge was an injection channel into the deck source

Found by the red-team pass, on the fix from §1. Carrying `directives` through
`toDOM`/`parseDOM` closed the `_class` wipe and opened something worse: `parseDOM` matches
`section.cs-slide` in ANY pasted HTML, and directive strings are not content —
`composeSlideChunk` joins them and prepends them to the slide's prose, so whatever a
foreign page puts in `data-directives` lands in the DECK SOURCE and from there in the
exported artifact.

Two demonstrated shapes. A legal-looking `<!-- _backgroundImage: url(https://evil.example/
beacon.png) -->` pasted over one slide-scoped selection put that URL into the exported HTML
three times, with **nothing visible in Compose** — directives are an attribute, not content,
so the author sees only the innocent paragraph. And a directive string carrying newlines
forged `---` slide boundaries and smuggled a raw `<style>` block into the export. This is
the harm HARD RULE #22 names for the export root: a beacon in every copy the recipient
opens. (The docs-site preview was never exposed — `sanitizeSlideHtml` forbids `script` and
`style` — so this was not the #616 key-theft path.)

**Fix, two gates.** PROVENANCE: a per-session token stamped by `toDOM` and required by
`parseDOM`, so a copy from this session round-trips and foreign HTML falls back to `[]` —
the pre-bridge behavior, hence no regression. SHAPE: a directive must be a single-line
`<!-- _name: … -->` comment, which kills the newline forgery even if the token ever leaks.
Stated cost: copying a slide between two Studio TABS no longer carries its `_class`, which
is the pre-bridge behavior for that path and the safe direction.

**The test lives at the parser, not in e2e, and that was a finding of its own.** An
end-to-end version of this attack could not be made to FAIL even with both gates removed:
driving the system clipboard's `text/html` branch through a real paste is too indirect to
be a sound oracle for a security property. `deck-doc.clipboard.test.ts` fails on the
mutation — the beacon URL and the forged `<style>` visibly reach the deck source — and
passes on the fix. A security test that cannot fail is worse than no test.

## 9. The collapse restore snapped the preview to slide 1

Also red-team, also self-inflicted, and a textbook HARD RULE #18 window: the surface
behaved correctly before the §2 fix and not after. `resyncFrom` dispatches the restore on a
freshly built `EditorState`, whose selection sits at doc start; `dispatchTransaction` read
that selection and edge-fired `onCursorSlide(0)`, throwing the shell's preview to slide 1.
It fired **only when something was folded** — i.e. only in the state the fix exists to
preserve. Measured A/B on the same rail op: with no fold the preview followed the slide,
with one fold it jumped to slide 1.

**Fix.** A restore transaction seeds `lastSlideRef` without publishing, so a later real
crossing still edge-fires. The §2 oracle asserted `collapsedIndices` and never the active
slide, so it passed throughout; it now asserts both.

## 10. Three of the oracles were green for the wrong reason — twice

Worth its own section because it happened three times on one branch, in three different
disguises, and the fix that looked right the first two times was not.

1. **Racing the clipboard.** Both copy/paste oracles fired ⌘V before the system clipboard
   held the copy, so they asserted "nothing changed" against a deck nothing had touched —
   green over the very defect they pin.
2. **A witness is not a wait.** The remedy was to witness the paste by its text, which
   converts a vacuous PASS into a red test rather than a correct one. An independent pass
   measured one of them failing 6 of 6 runs.
3. **A wait that waits for the wrong thing.** Polling for a NON-EMPTY clipboard is satisfied
   by the previous test's contents. Polling for a marker read from `innerText` compares the
   RENDERED text against the SOURCE: Compose upper-cases the eyebrow in CSS, so the clipboard
   held `Why Lattice` while the marker said `WHY LATTICE`, and a correct copy timed out.

Settled by clearing the clipboard to a sentinel before each copy, so "not the sentinel"
means "this copy" unconditionally. 44 consecutive passes under the back-to-back repeat that
reproduced the flake, against 1 in 65 before it.

The same disease hit the SECURITY oracle: an e2e injection test passed with both gates
removed. That one moved to the parser (§8). And the rail-duplicate oracle passed because
collapsing does not move the shell's current slide, so the rail was duplicating slide 0 —
the assertion was true for a reason unrelated to what it claimed.

**The transferable lesson is that a mutation check is not optional for a test you wrote to
pin a defect you just fixed.** Every one of these was caught by running the oracle against
the pre-fix build, and none by reading it.

## 11. Folding a slide next to a folded one unfolded the neighbor

Found by the checker pass. `DecorationSet.find(from, to)` returns everything that OVERLAPS
the range, and a slide's node decoration ends exactly where the next slide's begins — so the
toggle's `find(pos, pos + 1)` matched the PREVIOUS slide and removed its fold instead of
adding this one's. Fold slide 1, then slide 2: slide 1 pops open and slide 2 stays open. Two
clicks, fully visible.

**Pre-existing on `main`**, so this PR did not cause it — but squarely on its path under
HARD RULE #18's on-path rule: §2 is entirely about collapse, it renames that very
expression, and it shipped three collapse oracles that all fold non-adjacent slides. The
fuzz walk could not see it either: invariant 4 compares `aria-expanded` against the
`cs-collapsed` class, and both derive from this same decoration set, so they agree while
being jointly wrong. Fixed by anchoring on `d.from === meta.pos`, with a unit test that
fails on the old expression.

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
- **Pasting a copy of a LOCKED slide degrades it.** A slide Compose cannot round-trip
  (inline math, strikethrough) re-serializes from its parse when pasted, because a pasted
  slide has no `raw` to emit: `$e^{i\pi}$` comes back `$e^{i\\pi}$`. The same-count case
  predates this change; the count-growing case is newly reachable through the paste
  exemption. It is a wider door on an existing defect rather than a new class of one, and
  closing it properly means teaching the serializer to round-trip those constructs.
- **The collapse key is the slide's source chunk**, so a deck of identical slides can fold
  a different slide than the author folded. View-only, one-for-one, and the docblock now
  says so rather than claiming it "follows its slide".
- **`⌘A ⌘A` then a keystroke still replaces the whole deck** with no warning.
  This is the documented, guarded behavior of `selectionSpansSlides` (#1650) and
  undo recovers it — but it is the one remaining two-keystroke path from a
  finished deck to a blank one, and non-technical authors are exactly who reach
  for select-all.
