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
  `resyncFrom` and the unit test only ever drove the in-Compose `slideOp` path; the table door
  took FOUR passes and three were wrong — the engine does NOT drop a table on a layout without a
  table slot (universal table CSS renders one at the boardroom bar), the real defect was an EMPTY
  starter table rendering as two hairlines, reverting that gate then answered a rendering
  question when the report had asked an editorial one, and the replacement was too narrow until
  MEASUREMENT showed a three-row table costs a chart or diagram 35-45% of its figure height while
  taking only 20% of the slide, so the door is now withheld on a curated 46 of 61 wherever a
  primary figure or fixed anatomy owns the stage; the structural guard read the SELECTION to
  judge intent, which is
  right for a keystroke and wrong for a paste, making every multi-slide paste a silent no-op;
  deleting the slide you were editing flung the caret and the preview to the LAST slide; and an
  inserted slide did not take the caret. Each fix ships with an e2e oracle checked BOTH ways
  (8 of 10 fail pre-fix) — a round that caught two oracles passing for the wrong reason,
  because they raced the clipboard and asserted "nothing changed" against an untouched deck.
  A later pass (§12) found a fourth disguise of that same disease: the oracles were green
  only on an IDLE machine, failing 3 runs in 4 at the CI worker count because `.click()`
  resolves before ProseMirror moves its selection, so the next `⌘A` landed in the previous
  slide. Fixed by witnessing the caret at every site, and three oracles now run on the PR
  gate rather than nightly only.
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

**A regression net is only as good as the moment it fires, and that is a split.** The
whole file runs in the nightly tier (`studio-e2e-nightly.yml`, 04:41 UTC — it greps out
only `@perf`), which is 17 runs: 14 on `desktop` plus the `@parity` oracle on the three
touch projects. Nightly alone would let a regression sit on `main` for up to a day, so the
three oracles covering SILENT loss or the two things a human actually reported — the
clipboard `_class` wipe, the fold surviving a rail move, and the table door — carry
`@smoke` and run on the PR gate as well. Measured on the shipped code: those three add
12.9s of test time (3.9 + 4.8 + 4.2) to a 40-test tier on 2 CI workers — ~7s of wall
clock — against a `studio-smoke` job whose worst observed run was 829s. Quote the reading,
not the wall time of a local run: the same three measured 26.9–28.3s end to end, and
almost all of that is the `webServer` building and previewing the site, which the smoke
job has already paid for. The 34-step walk stays nightly deliberately — its value is breadth
over time, not per-PR latency.

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

## 3. The table door — four passes, three of them wrong

The most instructive entry here. Four passes, three wrong, and each wrong one looked like a
correction of the last. The lesson is not "measure more" — every wrong pass HAD a measurement.
It is that a measurement answers the question you actually asked it, and three times running
that was not the question the report had asked.

**First pass (wrong).** The control was gated to the 4 of 61 components whose manifest
declares a table, on the claim that the engine DROPS a table anywhere else — "measured across
all seven classes of the shipped tour deck: seven inserts, seven silent drops."

**The premise was false.** `lib/base/base.elements.css` § UNIVERSAL TABLE exists precisely so
a plain pipe table renders at the boardroom bar on a layout that does not own one — shipped
deliberately in `2026-08-02-default-slide-layout.md` §4, with its own gate. Rendering one
proved it: a table on a `title` slide comes out with label-cased heads, hairline rules and
zebra. Exactly one component, `split-compare`, actually drops it.

What was really observed: `insertStarterTable` built the table with EMPTY cells, which
serializes to `|  |  |` and renders as two hairlines — invisible on a dark slide, and
indistinguishable from a dead button. **The instrumentation had said so at the time**: the
probe printed `tables=1` for the preview, and the finding was written as "the preview drops it
entirely" anyway, off the screenshot. The measurement was there and was overruled by a glance.

**Second pass (also wrong, differently).** Reverting the gate left the control on all 61 and
treated that as the answer. It was not. Refuting the premise settled a RENDERING question,
and the report had asked an EDITORIAL one. A table on a title slide renders beautifully and
is still the wrong slide — Lattice's whole proposition is that the engine holds the design
line, so "it renders" was never the bar.

**Third pass (too narrow).** The door was withheld on layouts whose anatomy is a single
thing — one statement, one number, one picture. That caught the bookends and missed the case
that matters most, raised in review: **a chart or diagram slide.** The figure IS the slide,
and a table does not sit beside it, it takes the canvas.

**Fourth pass (shipped).** The criterion is now: *does this layout render a PRIMARY FIGURE or
a FIXED ANATOMY that owns the stage?* Measured on the shipped skeletons at 1280x720, adding
one three-row table:

| component | figure clean | figure + table | loss |
|---|---|---|---|
| `quadrant` | 343px (48% of slide) | 188px (26%) | **−45%** |
| `diagram` | 446px (62%) | 284px (39%) | **−36%** |
| `piechart` | 424px (59%) | 270px (38%) | **−36%** |
| `code` | 438px (61%) | 284px (39%) | **−35%** |

The table itself occupies only ~20% of the slide; the rest is the fit spine rebalancing. **The
figure loses roughly twice what the table gains.**

The ENGINE corroborates where the damage is acute: with a table added it reports `quadrant`'s
labels below the type-legibility floor, and clipping or overflow on `journey`, `kpi`,
`logo-wall` and `authority-chain`. But warnings are neither necessary nor sufficient as the
rule. `diagram` never warns — Mermaid scales its own labels down instead — and a diagram at
39% of the slide is a worse slide regardless. Conversely `policy-recommendation`, `q-and-a`
and `regulatory-update` overflow only because their skeletons already sit near capacity,
which is a `lint:deck` concern, not evidence that a table is the wrong kind of content there.

**46 withheld, 15 offered.** What keeps the door: `content`, the open list-flow layouts
(`list`, `list-criteria`, `list-steps`, `agenda`, `actors`, `checklist`, `inventory`,
`q-and-a`, `policy-recommendation`, `regulatory-update`) — all measured with a figure height
of ZERO, so there is nothing for a table to compete with — and the four whose table IS the
content (`compare-table`, `matrix-grid`, `obligation-matrix`, `roadmap`).

Two entries are withheld for ALREADY BEING A GRID. `glossary` earned it by measurement —
it renders its entries as a real `<table>` from its own list grammar. `list-tabular` is the
same idea one step softer: its whole job is the compact reference row, so it READS as a table
even where the markup is a list. Either way an author-added table is the second grid on the
slide, which is the one thing a reference layout cannot afford. `list-tabular` was offered in
the first cut of this list and moved on review — a reminder that "has no figure" was necessary
but not sufficient.

**Curated, not derived, and TWO failed derivations are why.** A regex over manifest slots
answers "does this component DECLARE a table?" — a different question, and it hid the control
on 57 of 61 including `content`. A DOM census for `svg/pre/img/canvas` then missed every
component that builds its figure from divs and CSS: `kanban`, `cycle`, `progress`,
`matrix-2x2`, `verdict-grid`, `kpi` and `big-number` all read as 0% figure and are not.
Both instruments have blind spots in the same shape — they answer a mechanical question that
resembles the real one. The list is judged, with the measurements as evidence rather than as
the rule. The cost of a hand-written list is that it rots when a component is renamed, so a
CENSUS test asserts every curated name still matches a real component in the shipped
manifest.

**It withholds a CONTROL, not a capability.** Typing a pipe table or pasting one still works
and still renders correctly. That is the line HARD RULE #29 draws — we do not refuse the
author — and it is why the answer is a hidden button rather than a blocked edit or a lint
error. The starter table's header cells also now carry `Column`, so where the door IS offered,
what it inserts is visible the moment you use it.

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

## 12. The oracles only worked on an idle machine (found by putting them on the PR gate)

The fourth disguise of §10, found by asking a different question: not "is this oracle green
for the wrong reason?" but "is it green on a LOADED machine?" It was not. At 2 workers on 4
cores — the CI shape, `workers: isCI ? 2 : undefined` — the one-slide paste oracle failed **3
runs out of 4**. Serially it passed 3 for 3, and the file's own comment ("These run in the
nightly E2E tier") is why nobody had seen it: the nightly runs the whole suite at 2 workers,
so this was already going to go red on a night nobody was reading.

**The failure diff named the mechanism, which is the part worth carrying.** It expected
slide 4's text and received slide **0**'s. `.click()` resolves once the click has been
dispatched, not once ProseMirror has moved its selection — so the `⌘A` on the next line was
delivered to the slide the caret had not yet left, the oracle copied slide 0, and pasted
slide 0 over slide 1. Every assertion afterwards was about the wrong slide. Under load the
gap is ~5x wider (the test ran 18–20s against 3.4s in isolation), which is the entire
difference between a green file and a red one.

Fixed by making `caretInto(page, i)` — click, then poll `activeSlide(page) === i` — the ONE
way the file places a caret, at all 16 sites including those that type nothing. The file
already had that witness at exactly one site, which is how a hazard gets half-addressed:
uniformity is what makes the absence of a bare `.click()` mean something to the next reader.
Measured: 12 consecutive clean runs (5 at 2 workers, 3 at 4 workers on 4 cores — twice the CI
contention, 4 more from the single-site probe) against the 3-in-4 failure baseline.

**"Flake" was available here and it would have been the wrong answer.** A load-sensitive
oracle is not noise; it is a test whose passing depended on a condition nobody wrote down.
The instrument that found it was running the file five times instead of once — which is also
the answer to "is this oracle fit for the PR gate", and the reason three of them now are.

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
