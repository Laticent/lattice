---
status: proposed
summary: The slide spine, designed on Segno's deck model. One module in lib/core owns what a deck's slides are (written slides, their heading sections, panes, hidden and pane-split pages), gives each written slide an in-memory id, addresses slides by id or fingerprint, carries a content revision, applies structural ops atomically, and replaces the dozen splitters that disagree on numbering. It settles use-case-layer §10 step 0 and leaves three forks to the owner.
---

# The slide spine, on Segno (2026-11-28)

**Asked.** The use-case layer (`2026-11-17-use-case-layer.md` §5.2, §10 step 0) needs a slide spine
before its edit ops and its semantic reads: an id for every slide, a way to address one, a revision to
lock against, and one `applyOps`. The follow-up `followups.d/3287-p1-lente-slide-spine.md` asked for
the design and three forks. The agent-native desk dispatched this note on 2026-11-28 (E3, #3534; Lente
#3528). It builds nothing.

**Owner decisions it builds on** (desk:agent-native, 2026-11-27):

| # | Decision | What it means here |
|---|---|---|
| D5 | "We use Segno" | The spine builds **on** `lib/core/deck-model.mjs` (`deckModel`, `bodyModel`, `updateDeckModel`). No new parser, no second model of the deck |
| — | No breaking change after 1.0 | Anything the spine exposes publicly (a use-case result, an MCP field) must be extendable later without a break. That is why ids stay in memory and are opaque (§2) |

**The answer in six lines.**

1. **One module, `lib/core/deck-spine.mjs`**, reads Segno's model and adds what Lattice alone knows:
   written slides with ids, their heading sections, hidden slides and pane splits (§1, fork 1).
2. **A written slide has an id; everything below it is addressed through that id.** A heading
   section is `(slide, k)`, a pane is `(slide, pane n)`. Ids live in memory for the session (§2, fork 2).
3. **A slide is addressed by id, or by fingerprint plus ordinal** when the caller has no id, exactly
   as §5.2 asks. Two slides that cannot be told apart return `AMBIGUOUS` (§3).
4. **The revision is a hash of the deck text**, so the same text has the same revision on every host (§4).
5. **`applyOps` is the spine's**: atomic, in order, refusing human-gated fields, returning receipts that
   fit the §6.6 envelope with no new states (§5, §6).
6. **The splitters migrate in six slices**, each deleting what it replaces and owing named proof (§9),
   against fixture decks for every disagreement on record (§10).

## 0. What the census found

A read-only census of `origin/main` at 88de0d1f (2026-11-28) changes the follow-up's premise.

**Boundaries already agree.** No product splitter cuts on `---` with its own regex any more. Every one
in `lib/` and `docs/src/` reaches `splitSlideChunks`, `slideBoundaries` or `slideBoundaryModel`
(`lib/core/slide-boundaries.mjs`), or `bodyModel` (`lib/core/deck-model.mjs`). Segno's P2 did that.
The follow-up's quote from `rehearsal.js` ("the index spaces STILL do not line up") no longer exists.

**What still disagrees is the unit and the edge rules:**

| # | Disagreement | Where |
|---|---|---|
| 1 | **Written slides vs rendered pages.** Under `split: headings` (the default, `lib/core/resolve-split.mjs:49`) a written slide with a second `#`/`##` becomes two pages. Most counters count written slides; `buildDeckIndex`, `studio-store.slideCount`, `deck-ops.renderedCount` and `splitSourceToSections` count pages. The lint bakes the splits but reports written-slide numbers (`lib/authoring/lint-core.js:6890`) | `deck-lint.splitSlides`, `architect-edits.slideCount`, `deckSlides`, `ShareSheet`, `coach countSlides`, `deck-ops.slideCount`, `rehearsal.parseSlides` count written slides |
| 2 | **Hidden slides.** The engine keeps a hidden slide but gives it no page number (`lib/engine/slides.js:322-332`). Five readers skip it (`presentationPairs`, `narration-bake`, `share-export`, `withoutHiddenSlides`, `step-pages`). Everything else counts it, including `studio-store.slideCount`, whose comment calls it "the PDF's count" (`docs/src/components/studio/studio-store.ts:265`); the PDF leaves hidden slides out | readers listed |
| 3 | **A leading chunk holding only a link reference definition.** `deck-lint.splitSlides` keeps it; the kernel and the engine drop it (`leadingEmpty`). `deck-lint.ts:56-59` records the "count one too high" and why: dropping it would delete the definition on a rejoin | `deck-lint.ts` vs `slide-boundaries.mjs` |
| 4 | **Empty slides.** `rehearsal.parseSlides` filters them out (`present/rehearsal.js:71`); the engine renders them | rehearsal |
| 5 | **Front matter.** Four modules keep their own `FRONT_MATTER` regex (`slide-split.js:26`, `architect-edits.js`, `review-core.js:70`, `slice-equivalence-core.mjs:49`); the model uses `FRONT_MATTER_FENCE` | listed |
| 6 | **Pane split.** On square, tall, story and mobile decks one panes slide becomes one page per pane (`lib/core/panes.js:39-48`). Only `foldPaneSplits` (`narration-projection.ts:154`) knows | narration |
| 7 | **Structural auto-split.** At non-wide sizes the engine splits a slide's collection into cover, body pages and closing, from the **rendered** document string (`lib/engine/structural-split.js`). No source-side reader can know these pages without a render | export, preview |

Only `buildDeckIndex` gives ids (to written slides, `deck-outline.ts:247`). Heading sections are
`(unit id, ordinal)`; panes have only a per-render slot (`panes.js:334`). Segno's `DeckModel` carries
no ids and no revision (`docs/src/lib/segno-markdown/deck.ts:195`). The front-matter `say:` map was
retired on 2026-11-20 (`lib/core/read-along-build.js:234`): say lines and lens tags now travel inside
their slide, so a move no longer needs a positional fix-up for either.

## 1. The spine and its layers

```
deck text
  └─ Segno DeckModel (lib/core/deck-model.mjs)       boundaries, slide line ranges, directive/fence ranges
       └─ the spine (lib/core/deck-spine.mjs)         Lattice's meaning of those ranges
            ├─ slides      written blocks, each with an id, a fingerprint, hidden?, panes?
            ├─ sections    heading parts of a slide: (slide, k)
            ├─ panes       the panes of a slide: (slide, pane 0|1)
            └─ views       projections the callers read (§7)
                 ├─ written     one entry per written slide (the editors, the chat, Lente)
                 ├─ pages       one entry per source-side page: heading split, pane split, hidden removed
                 └─ rendered    pages plus the auto-split's pages, from a render's map (§7, fork 3)
```

The spine reads the model and never parses. A heading section today still comes from
`boundaryParser.parse` plus `headingSplitPoints` (`deck-outline.ts:183`), because the model holds no
inline structure until Segno P4 lands its inline pass; the spine keeps that call behind one function
(`sectionsOf`) and switches it to the model when P4 is on `main`, with no change to any caller.

**The incremental path is the model's.** `updateDeckModel` re-reads the edited slide; the spine
carries ids across it the way `updateDeckIndex` does today (`deck-outline.ts:349`). `buildDeckIndex`
becomes a thin adapter over the spine, so Fuoco's `Outline` contract does not change.

## 2. Identity

| Thing | Identity | Lifetime |
|---|---|---|
| **Written slide** | an opaque id from the spine, `s` plus a session counter (today's `UnitId`, made a string) | the session: one page load in the Studio, one process for `lattice mcp` |
| **Heading section** | `(slide id, k)`, `k` 0-based among the slide's sections | as its slide |
| **Pane** | `(slide id, pane n)`, `n` 0 or 1 in source order | as its slide |
| **Page** (source-side or rendered) | a position in a view, never an address for an edit | one view |
| **Deck** | its revision (§4) | its text |

**Ids are carried across edits by today's three passes** (`assignIds`, `deck-outline.ts:247`): same
place and same text, then same text (a move, a duplicate, a delete), then same place (a slide being
typed in). Splitting a slide keeps the first half's id; a copy gets a new one. The passes move into
the spine unchanged, with their tests.

**Recommendation: ids stay in memory (fork 2, option A).** Nothing is written into the file.

- **Why.** An id in the source is text an author can see, copy, paste twice and break, and every
  writer of deck text (a hand edit, a paste, the chat, `git merge`) must keep it unique. In memory
  the spine is the only writer, so ids are unique by construction.
- **What it costs.** An id does not survive a reload or cross a process. A host that addresses a slide
  across sessions (an MCP client that reconnects, a saved chat transcript) uses the fingerprint (§3).
- **Why it is safe for 1.0.** The id is an opaque string whose scope the result states (§6). A later
  persisted key, say `<!-- @meta{id=…} -->`, would be **additive**: the spine prefers a written id when
  present and mints one otherwise, so no caller and no deck breaks. Choosing persistence first would
  not be reversible: decks written with ids would carry them forever.

## 3. Addressing

As §5.2 requires, an op names its target in one of three ways, tried in this order:

1. **By id**, `{ slide: "s14" }`, when the host holds the spine's ids (the Studio; `lattice mcp` within
   one process).
2. **By fingerprint**, `{ fingerprint: "sha256:…", ordinal: 0 }`, when it does not. The fingerprint is
   SHA-256 (full 256 bits, hex) over the written slide normalized as the spine reads it: BOM dropped,
   line ends folded to LF, leading and trailing blank lines trimmed, nothing else. The ordinal counts
   among slides with the same fingerprint, in document order. Two identical slides with no ordinal
   return `AMBIGUOUS` with both positions; the spine never guesses.
3. **By number against a revision**, `{ number: 3, revision: "…" }`, for the chat's existing tools,
   which number written slides 1-based. The number resolves only against the revision it was read at;
   a different current revision is `STALE`.

**The unit is the written slide.** A heading section or a pane is addressed as a part of it,
`{ slide, section: k }` or `{ slide, pane: n }`. This answers §5.2's fork: the written slide is the
unit, with a part index for its pages, because only the written slide is text an author can move,
and a heading section exists only inside its slide. An insert anchors to `{ after: <slide> }` or
`{ after: null }`, meaning first.

**Reads cite ids.** Step 3's read use cases (`read_outline`, `read_slides`, `find_text`) return each
slide's id, fingerprint, written number and page numbers together, so a model can copy whichever its
next call needs.

## 4. Revisions

**The revision is a hash of the deck text**: SHA-256 over the normalized source (BOM dropped, LF),
truncated to 128 bits, as hex. The same text has the same revision on any host, which an optimistic
lock across hosts needs (§5.1's base revision; §6.5's changeset binding).

- **Cost.** Not measured yet; slice 1 measures it on the gallery deck. The spine computes it lazily, once
  per model object, only when a use case asks, so a keystroke does not pay it.
- **The Studio's numeric `rev`** (`fuoco/outline.ts:74`) stays: it is a cheap identity check for
  memo caches inside one page. It is internal and never leaves the page.
- **A changeset records its base revision and the revision it produced**, so a receipt can say what it
  applied to and what it made.

## 5. `applyOps`

`applyOps(spine, ops, { base })` returns a new deck text and a receipt per op, or refuses the whole
changeset. The rules are §5.2's, restated where the spine decides them:

- **Spine ops:** `slide.replace`, `slide.insert`, `slide.delete`, `slide.move`, `slide.copy`, plus
  `slide.hide` and `slide.show` (the palette's verbs, today in `deck-ops.ts`).
- **Atomic.** Base revision mismatch is `STALE`; any op that fails refuses all. Later ops are resolved
  against the result of earlier ones, in order.
- **Byte-preserving.** An op changes only the bytes it names. `deck-ops.ts`'s structural edits already
  do this and move into the spine with their tests (use-case-layer §5.3).
- **Fix-ups belong to the applier.** With `say:` retired and lens tags inside their slide, the known
  fix-ups are the separators around a moved, inserted or deleted slide and the leading-chunk rule
  (disagreement 3). Any later position-keyed fact is the applier's, never a kernel's.
- **Human-gated fields are refused**: an op that adds or changes `approved:` under `lenses:` is
  refused, including inside a `slide.replace` or `deck.create` body, so the applier reads full text.
- **One changeset is one undo step.** The host commits the applied text as one Filo `History` step
  (`docs/src/lib/filo/history.ts:213`), so a person's undo reverses a changeset whole.

## 6. Receipts

The §6.6 envelope already has `ops: per-op-group outcomes`. The spine fills it; it adds **fields, not
states**. Every op's outcome stays one of `applied`, `held` or `refused` (§6.3).

```ts
type OpReceipt = {
  op: number;                          // index in the changeset
  kind: 'slide.replace' | 'slide.insert' | 'slide.delete' | 'slide.move' | 'slide.copy' | 'slide.hide' | 'slide.show';
  outcome: 'applied' | 'held' | 'refused';
  code?: 'STALE' | 'AMBIGUOUS' | 'NOT_FOUND' | 'GATED';   // with refused
  target: { slide: string; fingerprint: string; number: number };   // as resolved
  made?: { slide: string; fingerprint: string; number: number };    // insert, copy
  pages?: { before: number[]; after: number[] };                   // source-side page numbers it touched
};
// Envelope additions: base_revision, revision (the one produced), id_scope: 'session'.
```

`id_scope: 'session'` is how a client learns not to store an id. A later persisted id would add
`'document'` (§2), which is additive.

## 7. Views, and who owns page splitting (fork 3)

A **view** is a list the spine projects for a caller: `written` (one entry per written slide),
`pages` (source-side pages: heading split and pane split applied, hidden removed, empty slides kept as
the engine renders them), and `rendered` (pages plus the auto-split's pages).

**The problem (disagreement 7).** The structural auto-split decides from the rendered document, so the
spine cannot compute rendered pages from source. Today the export, the preview and narration each count
what they see.

**Recommendation: the spine owns every source-side count, and a render reports its own extra pages
back to the spine (fork 3, option A).** The render returns a map `part → pages it became`, which it
already knows when it stamps `data-lattice-slide="N.k"` (`lib/engine/split-gate.js:31`). The spine's
`rendered` view folds that map in. Every counter, numberer and narration reader reads a view; none
counts by itself. The engine's own page numbering (`lib/engine/slides.js`) keeps running and is
**checked** against the `pages` view by a test, not replaced, so no exported byte moves in the
migration.

## 8. Ownership

| What | Owner | Why |
|---|---|---|
| The spine (`lib/core/deck-spine.mjs`), its views, ids, addressing, revision, `applyOps` | the spine slices (§9), dispatched by desk:agent-native under E3 | it is §10 step 0b |
| **Required vs advisory checks** (which findings hold a changeset, which only report) | **E3, the use-case layer, one table in `lib/use-cases/`** read by the dispatcher's step 7 | the spine refuses only what is structurally wrong (`STALE`, `AMBIGUOUS`, `NOT_FOUND`, `GATED`); policy is the layer's, defined once for every host |
| §10 step 4: the card renders ops; `proposalFromDraft` (`architect-agent.ts:1217`) is deleted | E3, after spine slice 5 lands `applyOps` | the card is the chat host's |
| §10 step 7: the palette's deck-editing commands (`studio-commands.ts:11-42`) become use cases | E3, the palette host, after step 4 | the commands already call `deck-ops.ts`, which becomes the spine's applier |
| Single-edit undo | the host that commits (§5): the chat host and the palette host; Filo's `History` is unchanged | one changeset is one step, so no new undo machinery |

## 9. Migration (§10 step 0b)

Each slice is its own branch and PR, lands alone, and deletes what it replaces. The count of
splitters before and after goes in each PR body.

| # | Slice | Replaces | Proof it owes |
|---|---|---|---|
| 1 | **The spine core**: `lib/core/deck-spine.mjs` with slides, ids (the three passes moved from `deck-outline.ts`), sections, panes, hidden, fingerprint, revision. `buildDeckIndex` becomes its adapter | `assignIds`, `sectionsOf`, the unit build in `deck-outline.ts` | the deck-outline suite unchanged; incremental equals full on the corpus; ids identical to today's on the edit-replay tests; the bench's `deck parses/key` stays 0 |
| 2 | **Counts**: every count reads a view | `studio-store.slideCount`, `ShareSheet`'s count, coach `countSlides`, `deck-ops.slideCount` and `renderedCount`, `architect-edits.slideCount`, `galleries.mjs slideCount` | fixtures F1, F2, F4, F7 (§10): every count equals the PDF's page count from a real export. **Visible**: the deck chip stops counting hidden slides, so the slice ships a demo deck and screenshots (#9) |
| 3 | **Written-slide splitters**: one written view, one front-matter definition | `deck-lint.splitSlides`, `splitTopLevel` in `slide-split.js` **and its copy** in `architect-edits.js`, `review-core.splitSlides`, `slice-equivalence-core.splitSlides`, `deckSlides`, four `FRONT_MATTER` regexes, `tier-filter.splitDeck` | lint, review and coach output byte-identical on the corpus; F2 keeps its definition through a rejoin; F5 parses as the engine does |
| 4 | **Pages for narration, rehearsal and share** | `rehearsal.parseSlides`, `foldPaneSplits`, the hidden filters in `narration-bake` and `share-export`, `presentationPairs`, `splitSourceToSections` | F1, F3, F4, F7: narration, rehearsal and the browser `.vtt` agree with the CLI's; export bytes unchanged (a moved byte stops for dark and light sign-off) |
| 5 | **`applyOps` on the spine**: `deck-ops.ts` moves into `lib/core`; receipts; the gate on `approved:` | `deck-ops.ts`'s structural edits as a Studio module | op property tests (apply then inverse is the identity; atomic refusal leaves the text unchanged); F6 returns `AMBIGUOUS`; the gate refuses `approved:` in every op that carries text; failing arms and load runs (#34) |
| 6 | **The rendered view and the dev tools**: the render's page map; the `tools/` scripts that cut on their own regexes | `slideCountOf` in `rendered-index.ts`, the dev-script regexes | the engine's page numbers equal the `pages` view on the corpus at every size; `chat-figures.ts` keeps its own cut (it reads a model's code sample, not a deck) with that reason recorded |

The lint's numbering (disagreement 1) stays written-slide numbers in slice 3, which is what an author
edits; slice 4 adds page numbers beside them in the findings, not instead of them.

## 10. Fixture decks

One deck per disagreement on record, each held by a test that runs lint, render, narration and every
count over it and asserts they agree. They live under `test/fixtures/spine/` (slice 1 adds them).

| # | Fixture | Disagreement |
|---|---|---|
| F1 | **`split: headings` plus a hidden slide**: five written slides; slide 2 has two `##` headings; slide 4 is hidden. Written 5, sections 6, pages 5 (the hidden one removed), numbered 1 to 5 with no gap | 1, 2 (the follow-up's named test) |
| F2 | A leading chunk holding only `[a]: https://example.com`, then two slides using `[a]` | 3 |
| F3 | An empty slide between two slides | 4 |
| F4 | A tall deck with a panes slide: one written slide, two pages | 6 |
| F5 | Front matter after a BOM, closed by `---   ` (trailing spaces) | 5 |
| F6 | Two byte-identical slides | addressing (§3) |
| F7 | A hidden slide that splits on headings: every section of it hidden | 1, 2 |

## 11. The forks for the owner

| Fork | Options | Recommendation | Cost |
|---|---|---|---|
| **1. Where the spine lives** | **A.** `lib/core/deck-spine.mjs`, beside the deck model. **B.** Lente's core moved to `lib/` and grown into the spine. **C.** Inside `@laticent/segno-languages` as part of its deck language | **A.** The spine is Lattice's meaning of slides (heading split, hide, panes), which the owner kept out of Segno's standard-language package (2026-11-22: "standard languages only"). Lente is a lens library that reads written slides; making it own the deck would give a reader view the deck's structure. Lente stays a caller of the `written` view | A: one new core module and an adapter in `deck-outline.ts`. B: moves a published package's scope and its boundary gate. C: puts Lattice semantics into a package meant for other hosts |
| **2. Ids in memory or in the file** | **A.** In memory, opaque, session-scoped; fingerprints across sessions. **B.** Written into each slide as a `@meta` key | **A**, because B cannot be undone after 1.0 and A can grow into B additively (§2) | A: a reconnecting MCP client uses fingerprints, and identical slides return `AMBIGUOUS`. B: every writer of deck text must keep ids unique; pasted slides collide |
| **3. Who owns page splitting** | **A.** The spine owns every source-side count; a render reports its auto-split pages back as a map. **B.** The spine owns source-side pages; the export keeps counting rendered pages itself. **C.** The spine runs the auto-split too | **A.** One count everywhere, with the render as the only source of what only a render knows | A: the render returns a page map it already computes. B: keeps two counts that can disagree (the follow-up's complaint). C: the spine would need the rendered document, so it could not answer before a render |

## 12. What this does not decide

- How the review card renders ops (§10 step 4) and the wording of refusals: E3's.
- The required-vs-advisory table's rows: E3's, in its own PR.
- Persisted ids: not before someone needs them (§2).
- Djot or any other source language: out of scope (Segno plan, 2026-11-22).
