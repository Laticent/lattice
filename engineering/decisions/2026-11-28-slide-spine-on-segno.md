---
status: proposed
summary: The slide spine, designed on Segno's deck model. One lib/core module owns what a deck's slides are (written slides, heading sections, panes, hidden slides), gives each written slide a session id that its own edits carry exactly, addresses slides by id or fingerprint, carries a content revision, applies structural ops atomically with receipts, and replaces the splitters that disagree on numbering. It settles use-case-layer §10 step 0, was hardened by the adversarial trio, and put four forks to the owner, who settled two (ids in memory; the spine counts source pages).
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
| D5 | "We use Segno" | The spine builds **on** `lib/core/deck-model.mjs` (`deckModel`, `bodyModel`, `updateDeckModel`) and its token adapter (`lib/core/model-tokens.mjs`). No new parser, no second parse, no second model |
| — | No breaking change after 1.0 | Every field the spine exposes publicly is opaque or an open set, so it can grow without a break (§2, §6) |

**The answer in six lines.**

1. One module, `lib/core/deck-spine.mjs`, reads Segno's model and adds what only Lattice knows (§1).
2. A written slide has a session id. The spine's own edits carry ids exactly; guessing is only for typing (§2).
3. A slide is addressed by id, or by fingerprint and ordinal resolved against a base revision (§3).
4. `applyOps` is atomic, refuses what it cannot apply exactly, and returns receipts with no new states (§5, §6).
5. The spine owns every source-side count; a render's extra pages stay the render's (§7).
6. Slices 1 and 5 together unblock E3; the other four retire splitters, each with named proof (§9, §10).

## 0. What the census found

A read-only census of `origin/main` at 88de0d1f (2026-11-28) changes the follow-up's premise.

**Boundaries already agree.** No product splitter cuts on `---` with its own regex any more. Each one
in `lib/` and `docs/src/` reaches `splitSlideChunks`, `slideBoundaries` or `slideBoundaryModel`
(`lib/core/slide-boundaries.mjs`), or `bodyModel` (`lib/core/deck-model.mjs`). Segno's P2 did that.
The follow-up's quote from `rehearsal.js` ("the index spaces STILL do not line up") no longer exists.

**What still disagrees is the unit and the edge rules:**

| # | Disagreement | Where |
|---|---|---|
| 1 | **Written slides vs pages.** Under `split: headings` (the default, `lib/core/resolve-split.mjs:49`) a written slide with a second `#`/`##` becomes two pages. Most counters count written slides; `buildDeckIndex`, `studio-store.slideCount`, `deck-ops.renderedCount` and `splitSourceToSections` count pages. The lint bakes the splits but reports written-slide numbers (`lib/authoring/lint-core.js:6889`) | `docs/src/lib/deck-lint.ts` `splitSlides`, `architect-edits.slideCount`, `deckSlides`, `ShareSheet`, coach `countSlides`, `deck-ops.slideCount`, `rehearsal.parseSlides` count written slides |
| 2 | **Hidden slides.** The engine keeps a hidden slide but gives it no page number (`lib/engine/slides.js:322-333`). `studio-store.slideCount` calls itself "the PDF's count" (`docs/src/components/studio/studio-store.ts:265`) but counts hidden parts, which the PDF leaves out. At least `presentationPairs`, `narration-bake`, `share-export`, `withoutHiddenSlides` and `step-pages` skip them; a dozen more files read the hide mark, not yet traced one by one | slice 2 traces each |
| 3 | **A leading chunk holding only a link reference definition.** `docs/src/lib/deck-lint.ts` keeps it; the kernel and the engine drop it (`leadingEmpty`). Its comment (`:57-60`) records the "count one too high" and why: dropping it would delete the definition on a rejoin | `deck-lint.ts` vs `slide-boundaries.mjs` |
| 4 | **Empty slides.** `rehearsal.parseSlides` filters them out (`present/rehearsal.js:71`); the engine renders them | rehearsal |
| 5 | **Front matter.** At least 14 non-generated files define their own `FRONT_MATTER` pattern (among them `slide-split.js:27`, `review-core.js:71`, `lint-core.js`, `squadra/bridge.js`, `deck-profiles.js`, `mermaid-check.ts`, `asset-refs.ts`); the model uses `FRONT_MATTER_FENCE` | slice 3 lists them all |
| 6 | **Pane split.** On square, tall, story and mobile decks one panes slide becomes one page per pane (`lib/core/panes.js:39-48`). Only `foldPaneSplits` (`narration-projection.ts:154`) knows | narration |
| 7 | **Structural auto-split.** At non-wide sizes the engine splits a slide's collection into cover, body pages and closing, from the **rendered** document and a measured plan (`lib/engine/structural-split.js`). The source cannot predict these pages | export, preview |
| 8 | **Comments are anchored by position.** A slide comment stores its 1-based slide index (`docs/src/components/studio/slide-comments.ts:11-20`), so a move re-anchors it to the wrong slide | comments |

**Ids today.** Only the deck outline mints ids, to written slides (`assignIds`,
`docs/src/lib/deck-outline/deck-outline.ts:247`, with Fuoco's `nextUnitId` and `carryIds`,
`docs/src/lib/fuoco/outline.ts:78`, `:225`). Heading sections are `(unit id, ordinal)`; panes have only
a per-render slot (`panes.js:334`). Segno's `DeckModel` has no ids and no revision
(`docs/src/lib/segno-markdown/deck.ts:194`). The front-matter `say:` map was retired on 2026-11-20
(`lib/core/read-along-build.js:234`): say lines and lens tags now travel inside their slide.

**The red team found that today's id passes misaddress** (probes run against `buildDeckIndex` and
`updateDeckIndex`):

- **Pass 3 ("same place") hands a deleted slide's id to its neighbor.** A,B,C with ids 1,2,3 edited to
  A,X,C gives X id 2.
- **A copy placed before its source takes the source's id.**
- **Moving one of two identical slides swaps their ids.**

Fine for a caret; wrong for an edit an agent made by id. §2 fixes it.

## 1. The spine and its layers

```
deck text
  └─ Segno DeckModel + model tokens (lib/core/deck-model.mjs, model-tokens.mjs)
       └─ the spine (lib/core/deck-spine.mjs)          Lattice's meaning of those ranges
            ├─ slides     written blocks: id, fingerprint, hidden?, panes?
            ├─ sections   heading parts of a slide: (slide, k)
            ├─ panes      a slide's panes: (slide, pane n), n = 0 | 1
            └─ views      written | pages | a range of either (§7)
```

**No second parse.** Segno P4 landed on 2026-11-16 (`2026-10-22-segno-deck-pipeline.md:978`), so the
model holds block tokens. `headingSplitPoints` cuts on `heading_open` tokens
(`lib/core/heading-split-core.mjs:70`). The spine's `sectionsOf` reads them from `modelTokens`, so the
`boundaryParser.parse` call in today's `sectionsOf` (`deck-outline.ts:186`) goes away. If a measured
reason forces a parse to stay, slice 1 states it.

**Incremental by the model.** `updateDeckModel` re-reads the edited slide. `buildDeckIndex` becomes a
thin adapter over the spine, and Fuoco's `Outline` contract (numeric `UnitId`) does not change: the
spine keeps Fuoco's number internally and translates at its public edge (§2).

**What the spine does not own.** Lens membership stays Lente's: it is a tag inside each slide, and
Lente projects it over the spine's `written` view. A "range" view is a slice of `written` or `pages`.

## 2. Identity

| Thing | Public identity | Lifetime |
|---|---|---|
| **Written slide** | `s<n>~<nonce>`: Fuoco's number plus a random nonce minted once per session | one session: a page load in the Studio, a process for `lattice mcp`. The nonce carries across every edit and every `applyOps` in that session |
| **Heading section** | `(slide id, k)`, `k` 0-based among the slide's sections | as its slide |
| **Pane** | `(slide id, pane n)` | as its slide |
| **Page** | a position in a view, never an address for an edit | one view |
| **Deck** | its revision (§4) | its text |

**Two ways ids move, never mixed:**

- **The spine's own edits carry ids exactly.** `applyOps` knows what it replaced, moved, copied, hid or
  deleted. It returns the next spine with ids assigned from that mapping, and the host adopts that
  spine as its next index rather than re-deriving one from the new text. A copy always gets a new id; a
  move keeps its id; a replace keeps its target's id.
- **Typing is guessed**, by today's three passes, for human edits only, with one change: **an id is
  retired** when its slide is deleted, and pass 3 matches through the edit's offset mapping, so a slide
  after a deletion keeps its own id and never inherits the deleted one's. A slide retyped in place,
  even all of it, keeps its id, as now: to the editor that is typing, not a delete.

**An id from another session is `NOT_FOUND`**, because the nonce differs. A restarted
`lattice mcp` cannot hand an old `s14` to a new slide.

**Recommendation: ids stay in memory (fork 2, option A).** Nothing is written into the file.

- **Why.** An id in the source is text an author can see, copy, paste twice and break, and every writer
  of deck text (a hand edit, a paste, the chat, `git merge`) must keep it unique. In memory, the spine
  is the only writer.
- **What it costs.** An id does not survive a reload or cross a process. A client that addresses a slide
  across sessions uses the fingerprint (§3).
- **Why it is safe for 1.0.** The id is opaque and the envelope states its scope (§6). A later persisted
  key (say `<!-- @meta{id=…} -->`) or a sidecar would be additive: the spine prefers a stored id when
  one is present. Persisting first cannot be undone: decks written with ids keep them forever.

## 3. Addressing

§5.2 names two forms; the spine adds a third for the chat's existing tools.

| Form | Shape | Base revision |
|---|---|---|
| **Id** (§5.2) | `{ slide: "s14~k3f9" }` | optional: ids survive edits |
| **Fingerprint** (§5.2) | `{ fingerprint: "sha256:…", ordinal: 0 }` | **required** |
| **Number** (an extension) | `{ number: 3 }`, 1-based among written slides | **required** |

- **Resolved once, against the base, before any op runs. This amends §5.2**, which says a later op is
  evaluated against the result of the earlier ones. Under §5.2, `[insert first, replace number 3]`
  replaces the old slide 2; here it replaces the old slide 3, which is the slide the caller read. Numbers
  and fingerprints name slides of the base text; after resolution every op holds ids, and only ids flow
  through the changeset. The ops still **apply** in order. The owner decides the amendment (§11, fork 4);
  until then §5.2's rule stands.
- **The fingerprint** is SHA-256 (256 bits, hex) over the written slide normalized by **the spine's one
  normalization**: BOM dropped, line ends folded to LF, trailing whitespace on each line kept, leading and
  trailing blank lines dropped. The typing passes compare slides with the same function.
- **Two identical slides with no ordinal are `AMBIGUOUS`**, with both positions. The spine never guesses.
- **The unit is the written slide.** A section or a pane is a part of it, `{ slide, section: k }` or
  `{ slide, pane: n }`. That answers §5.2's fork: only the written slide is text an author can move.
  An insert anchors to `{ after: <address> }` or `{ after: null }`, meaning first.
- **Views bound what a caller can see.** A host serving a lens projection returns ids and fingerprints
  only for slides in that view, and addressing outside it is `NOT_FOUND`. That stops a fingerprint
  from confirming a guess about a slide the reader was not shown.

## 4. Revisions

**Two hashes, for two jobs:**

- **The revision**, for addressing and locks, is SHA-256 over the normalized source, truncated to 128
  bits, hex. The same text has the same revision on every host.
- **The file host's on-disk check** (§6.3) compares **raw bytes**, so a change that touches only line
  endings or a BOM still counts as a change and a submit never overwrites it.

**Hashing is async, at the use-case edge.** `lib/core` already hashes through an injected
`sha256Hex: (text) => Promise<string>` (`lib/core/ltt-deck.mjs:44`). The dispatcher is async, so reads
and receipts compute fingerprints and revisions there, lazily, once per revision. The palette and
the editors address by id and never hash, so a keystroke and a palette verb stay synchronous. Slice 1
measures the cost on the gallery deck.

The Studio's numeric `rev` (`fuoco/outline.ts:44`) stays as an in-page memo key and never leaves the page.

## 5. `applyOps`

`applyOps(spine, ops, { base })` returns the next spine (text and ids) and a receipt per op, or refuses
the whole changeset.

- **Spine ops.** §5.2's five (`slide.replace`, `slide.insert`, `slide.delete`, `slide.move`,
  `slide.copy`), plus **`slide.hide` and `slide.show`, an extension**: the palette's verbs, today in
  `docs/src/components/studio/hide-ops.ts`.
- **Atomic.** A base mismatch is `STALE`. One refused op refuses all, and the text is unchanged.
- **Exact or refused.** An op changes exactly what it names. Today's `deck-ops.ts` does not hold that bar:
  the red team found a `replace` past the end rewrites the last slide, a `delete` on a one-slide deck is
  a silent no-op, and `replaceSlide` strips a leading indent. In the spine, resolution runs first (§3),
  an out-of-range target is `NOT_FOUND`, a no-op is `INVALID`, and nothing is clamped or trimmed.
- **One slide per body.** A `slide.replace`, `slide.insert` or `slide.copy` body must parse (through
  `bodyModel`) to exactly one written slide, or the op is `INVALID`. A body cannot smuggle in a second
  slide or a front-matter block.
- **Slide ops never touch front matter.** Its bytes must be identical before and after, or the changeset
  is refused as `INVALID`. Only the use-case layer's `fm.*` and `deck.create` ops write it.
- **The lens gate compares parsed registries.** `lensRegistryUnchanged(before, after)` parses `lenses:`
  on both sides (anchors, aliases and merge keys resolved) and refuses any change to an `approved`
  value as `GATED`. The use-case layer runs the same function on `fm.*` and `deck.create`. A text match
  on `approved:` is not enough: YAML can spell the key another way.
- **Fix-ups belong to the applier.** These are the separators around an inserted, moved or deleted
  slide, the leading-chunk rule (disagreement 3), and **comment anchors** (disagreement 8): a move or
  delete re-anchors, or orphans, each comment, and says so in the receipt.
- **One changeset is one undo step.** The host commits the result as one Filo `History` step
  (`docs/src/lib/filo/history.ts:213`).
- **The limit, stated.** Until §10 step 4, the chat still writes deck text through `setSource` without
  the spine, so the gate covers only hosts that route through `applyOps`. Step 4 closes that.

## 6. Receipts

§6.6's envelope already carries `ok`, `code`, `revision`, `data`, `ops`, `check` and `next_step`. The
spine adds **fields, never states**: each op's outcome stays `applied`, `held` or `refused`.

```ts
type OpReceipt = {
  op: number;                        // index in the changeset
  kind: string;                      // OPEN set; today the seven spine ops
  outcome: 'applied' | 'held' | 'refused';
  code?: string;                     // OPEN set; today STALE | AMBIGUOUS | NOT_FOUND | GATED | INVALID
  blocked_by?: number;               // a refused op that did not fail itself names the op that did
  target?: Identity;                 // as resolved; absent when resolution failed
  after?: Identity;                  // the slide as it now is; a fingerprint changes on replace and hide
  made?: Identity;                   // insert, copy
  comments?: { moved: number; orphaned: number };
};
type Identity = { slide: string; fingerprint: string; number: number };
// Envelope additions: base_revision; session (the spine nonce); id_scope: 'session'.
// `revision` is the one produced (the base, when refused). Advisory: lenses_deapproved: string[].
```

- **Open sets.** A client must tolerate an unknown `kind` or `code`, so growing either after 1.0 is
  not a break.
- **Per op, grouped.** §6.6's per-op-group outcomes are these receipts, grouped by op group.
- **De-approval is reported, not blocked.** Editing a member slide changes a lens's approval hash, and
  the lens fails closed (`2026-07-13-lente-reader-lenses.md` §6). The receipt lists the lenses it
  de-approved, so a person knows a share link went unavailable.

## 7. Views, and who owns page splitting (fork 3)

| View | One entry per | Who reads it |
|---|---|---|
| `written` | written slide, hidden included and marked | the editors, the chat's numbers, `autoHold`, Lente, comments, the share sheet's annotation bound |
| `pages` | source-side page: heading split and pane split applied, hidden removed, empty slides kept as the engine renders them | page counts, narration, rehearsal, the deck chip |

**What a render knows that the source cannot.** The structural auto-split works on the rendered
document with a measured plan, at non-wide sizes only, and the Studio preview renders one slide at a
time with an offset. `stampSlideNumbers` (`lib/engine/split-gate.js:31-43`) stamps each top-level
section, hidden ones included, with an integer; `lib/core/auto-split.js:507` adds the `.k` suffix to each split
page. So a render's pages are keyed by **section index, hidden included**, and depend on size, plan and
revision, not on text alone.

**Recommendation: option D.** The spine owns `written` and `pages`; a render owns its pages, and the
spine translates. Every render reader calls one spine function,
`pageOf(spine, stamp) → { slide, section, k }`, to map `data-lattice-slide="N.k"` back to a slide.
Nothing else counts on its own. The engine's page numbering keeps running, and a test holds its shown
numbers equal to `pages` at `wide`, where nothing auto-splits. The spine keeps no render map, so no
render can be folded into the wrong revision.

## 8. Ownership

| What | Owner | Why |
|---|---|---|
| The spine: views, ids, addressing, revision, `applyOps`, receipts | spine slices 1 and 5 (§9), dispatched by desk:agent-native under E3 | §10 step 0b |
| **Required vs advisory checks** (which findings hold a changeset, which only report) | **E3, the use-case layer**: one table in `lib/use-cases/`, read by the dispatcher's step 7 | the spine refuses only what is structurally wrong; policy is the layer's, once for every host |
| §10 step 4: the card renders ops; `proposalFromDraft` (`architect-agent.ts:1217`) is deleted; the chat stops calling `setSource` directly | E3, after slices 1 and 5 | the card is the chat host's |
| §10 step 7: the palette's deck verbs (`studio-commands.ts:34-40`, wired in `StudioShell.tsx:8560-8566`) become use cases | E3, the palette host, after step 4 | they already call `deck-ops.ts` and `hide-ops.ts`, which become the applier |
| Single-edit undo | each host that commits (chat, palette): one changeset, one `History` step; Filo unchanged | no new undo machinery |
| Comment anchors | the applier's fix-up (§5); moving comments to slide ids is the comments layer's later work | `2026-07-04-comments-layer.md` names it |

## 9. Migration (§10 step 0b)

Each slice is its own branch and PR, lands alone, and deletes what it replaces. Each PR body gives
the splitter count before and after, and the bytes of `engineJsGz`, `lintCoreGz` and the Studio route
against `docs/route-budget.json`.

**Order: 1, 5, then 2, 3, 4, 6.** Slices 1 and 5 make the spine E3 needs, and E3's step 4 waits for
them rather than building on the interim adapter: that would be the second model D5 forbids. Slices
2, 3, 4 and 6 retire splitters; each is worth having alone and none gates E3.

| # | Slice | Replaces | Proof it owes |
|---|---|---|---|
| 1 | **Spine core**: slides, ids (typing passes with retirement), sections from `modelTokens`, panes, hidden, the one normalization, async fingerprint and revision at the edge, the id nonce. `buildDeckIndex` becomes its adapter | `assignIds`, `sectionsOf` and its `boundaryParser.parse`, the unit build in `deck-outline.ts` | the deck-outline suite green; incremental equals full on the corpus; F8 shows retirement; `deck parses/key` stays 0; hash cost measured |
| 5 | **`applyOps`**: the seven ops, exact or refused, receipts, the parsed lens gate, front-matter bytes held, comment fix-ups, ids carried by construction | the structural edits in `deck-ops.ts` and `hide-ops.ts` as Studio modules. Inventory first: about 18 Studio importers of `deck-ops`, its imports (`deck-outline`, `fuoco/outline`, `docs/src/lib/front-matter`, `slice-equivalence-core`), and the front-matter module's move to `lib/` (§5.3) | property tests (apply then inverse is the identity; a refused changeset leaves the text unchanged); F6, F9, F10; the gate refuses every YAML spelling of `approved`; failing arms, repeat and load runs (#34) |
| 2 | **Counts**: every counter reads its view, per the table in §7 | `studio-store.slideCount`, coach `countSlides`, `deck-ops.slideCount` and `renderedCount`, `architect-edits.slideCount` (stays `written`: it feeds `autoHold`), `ShareSheet`'s count (stays `written`: it bounds comment annotations in the PDF), `galleries.mjs slideCount` | each view's own proof: a `written` count equals the written slides; a `pages` count equals the PDF's shown pages at `wide`; F1, F2, F4, F7. **Visible**: the deck chip stops counting hidden slides, so the slice ships a demo deck and screenshots (#9). Stored version-history counts keep their old meaning, and the slice says so |
| 3 | **Written-slide splitters, one front-matter definition** | `docs/src/lib/deck-lint.ts` `splitSlides`, `splitTopLevel` in `slide-split.js` **and its copy** in `architect-edits.js`, `review-core.splitSlides`, `slice-equivalence-core.splitSlides`, `deckSlides`, `tier-filter.splitDeck`, every `FRONT_MATTER` pattern the census lists | lint, review and coach output byte-identical on the corpus, except that lint findings gain page numbers beside their written-slide numbers; F2 keeps its definition through a rejoin; F5 parses as the engine does |
| 4 | **Pages for narration, rehearsal and share** | `rehearsal.parseSlides`, `foldPaneSplits`, the hidden filters in `narration-bake` and `share-export`, `presentationPairs`, `splitSourceToSections` | F1, F3, F4, F7: narration, rehearsal and the browser `.vtt` agree with the CLI's; export bytes unchanged, or dark and light sign-off |
| 6 | **Render readers and dev tools** | `slideCountOf` in `rendered-index.ts` (through `pageOf`), the `tools/` scripts that cut on their own regexes | the engine's shown numbers equal `pages` on the corpus at `wide`; `pageOf` round-trips every stamp at every size; `chat-figures.ts` keeps its own cut (it reads a model's code sample, not a deck), with that reason recorded |

The lint keeps written-slide numbers (what an author edits) and adds page numbers beside them in slice 3.

## 10. Fixture decks

One deck per disagreement or attack on record, under `test/fixtures/spine/` (slice 1 adds them). Each
test runs lint, render, narration and every count over its deck and asserts they agree.

| # | Fixture | Holds |
|---|---|---|
| F1 | **`split: headings` plus a hidden slide**: five written slides, slide 2 with two `##` headings, slide 4 hidden. Written 5, sections 6, pages 5, numbered 1 to 5 with no gap | disagreements 1, 2 (the follow-up's named test) |
| F2 | A leading chunk holding only `[a]: https://example.com`, then two slides using `[a]` | 3 |
| F3 | An empty slide between two slides | 4 |
| F4 | A tall deck with a panes slide: one written slide, two pages | 6 |
| F5 | Front matter after a BOM, closed by `---   ` (trailing spaces) | 5 |
| F6 | Two byte-identical slides: no ordinal is `AMBIGUOUS`; a copy placed before its source gets a new id; moving one keeps each id | addressing, §2 |
| F7 | A hidden slide that splits on headings: every section of it hidden | 1, 2 |
| F8 | Delete slide B and edit slide C in one change: B's id is retired, C keeps its own | §2 retirement |
| F9 | A `slide.replace` body holding `---` and a second slide, and one holding a front-matter block with `lenses:` | §5 one slide per body, the lens gate |
| F10 | A comment on slide 3, then a move of slide 3 to the front | disagreement 8 |

## 11. The forks for the owner

**Answered (the owner, 2026-11-28, about 11:35 UTC, in the command center's question round, relayed to
this session):**

- **Fork 2: A.** Ids stay in memory; a reconnecting client finds slides by fingerprint.
- **Fork 3: D** (the ❓ card's option A). The spine counts source-side pages; one function maps a render's
  stamps back to slides.

**Open:** fork 1 (the owner asked whether this is Lente's expansion; the answer went back through the
command center) and fork 4.

| Fork | Options | Recommendation | Cost |
|---|---|---|---|
| **1. Where the spine lives** | **A.** `lib/core/deck-spine.mjs`, beside the deck model, reached directly as `lib/` code is. **B.** Lente's core moved to `lib/` and grown into the spine. **C.** Inside `@laticent/segno-languages` as part of its deck language | **A.** The spine is Lattice's meaning of slides (heading split, hide, panes), which the owner kept out of Segno's package (2026-11-22: "standard languages only"). Lente reads written slides; making it own the deck gives a reader view the deck's structure. §5.3's `@laticent/*` route is for workspace libraries; the spine is core, not a library | A: one core module and an adapter in `deck-outline.ts`. B: changes a published package's scope and its boundary gate. C: puts Lattice's semantics into a package meant for other hosts |
| **2. Ids in memory or stored** | **A.** In memory, opaque, per spine instance; fingerprints across sessions. **B.** Written into each slide as a `@meta` key. **C.** A sidecar file beside the deck | **A.** B cannot be undone after 1.0, and A can grow into B or C additively (§2) | A: a reconnecting client uses fingerprints, and identical slides need an ordinal. B: every writer of deck text must keep ids unique, and pasted slides collide. C: a second file to keep in step with the deck, which every host and `git` must carry |
| **3. Who owns page splitting** | **A.** The spine also folds each render's page map into a `rendered` view. **B.** The spine owns source-side pages; every render reader counts its own pages. **C.** The spine runs the auto-split itself. **D.** The spine owns source-side pages and translates any render's stamps to slides with one function | **D.** One source-side count, and one translation for what only a render knows | A: a render map depends on size, plan and revision, so the spine would have to key and expire it, and could serve a stale one. B: every reader keeps its own count, the follow-up's complaint. C: the spine would need the rendered document. D: render readers change to call `pageOf` (slice 6) |
| **4. Resolve addresses against the base, or in order** (amends use-case-layer §5.2) | **A.** Numbers and fingerprints resolve once against the base revision; only ids flow through the changeset. **B.** Keep §5.2: each op's address is evaluated against the result of the earlier ops | **A.** The caller read the base, so its numbers mean the base; under B an insert earlier in the same changeset silently shifts a later number onto a different slide | A: §5.2 changes its documented rule in E3's PR that builds it. B: a caller must renumber its own later ops by hand, and a fingerprint of a slide it replaced earlier is `NOT_FOUND` |

## 12. What this does not decide

- How the review card renders ops and words refusals: E3's (§10 step 4).
- The rows of the required-vs-advisory table: E3's, in its own PR.
- Stored ids: not until someone needs them (§2).
- Moving comments from position to slide id: the comments layer's.

## 13. Adversarial review (2026-11-28)

The trio read the first draft (3961f65b). Its findings and what changed:

| Lens | Finding | Change |
|---|---|---|
| Red team | Today's typing passes hand a deleted slide's id to its neighbor, give a copy-before its source's id, and swap identical slides' ids (probes reproduced each) | §2: `applyOps` carries ids exactly; retired ids are never reused; F6, F8 |
| Red team | A text match on `approved:` misses YAML's other spellings; slide ops could write front matter | §5: parsed-registry gate; front-matter bytes held; F9 |
| Red team | A replace body can hold two slides; `deck-ops` clamps out-of-range targets and no-ops silently | §5: one slide per body; exact or refused; `INVALID` |
| Red team | No session in ids: a restarted server reissues `s14` | §2: per-instance nonce; envelope `session` |
| Red team | Numbers and ordinals inside one changeset were ambiguous | §3: resolved once against the base; only ids flow |
| Red team | Closed `kind` and `code` sets would break after 1.0; `target` required on refusal | §6: open sets; `target` optional; `after` identity; `blocked_by` |
| Red team | Fingerprints work as an oracle on slides outside a lens | §3: ids and fingerprints only inside the caller's view |
| Inversion | `applyOps` fifth invites E3 to build on the interim adapter | §9: order 1, 5, then the rest |
| Inversion | Slice 2 treated every count as the page count, changing `autoHold` and PDF annotations | §7 per-caller table; §9 slice 2 |
| Inversion, checker | Fork 3A cited a page map the engine does not produce; the stamp's key space was wrong | §7: option D, keyed by section index, hidden included |
| Inversion | Hidden scope in moving `deck-ops.ts`; numeric `UnitId`; async SHA-256 | §1, §2, §4, §9 slice 5 inventory and byte reports |
| Inversion | Comments are anchored by position | disagreement 8; §5 fix-up; F10 |
| Checker | P4 has landed, so keeping `boundaryParser.parse` would be a second parse | §1: sections from `modelTokens` |
| Checker | The census undercounted front-matter patterns and hide readers | §0 rows 2 and 5 |
| Checker | Revision over normalized text would let the file host miss a line-ending change | §4: raw bytes for the on-disk check |
| Checker | Number addressing and `slide.hide`/`show` extend §5.2 unannounced | §3, §5: labeled as extensions |
| Checker | Drifted line numbers; two files named `deck-lint.ts` | fixed throughout |
| Card grader | Resolving against the base amends §5.2's in-order rule without saying so | §3 says so; fork 4 puts it to the owner; §5.2 stands until then |
| Card grader | "Spine instance" was ambiguous (a new instance per edit would expire every id) | §2: the nonce is per session and carries across `applyOps` |
| Card grader | "Wholly rewritten" was undefined; the lint's page numbers sat in the wrong slice; one refusal had no code | §2 retires on delete only; slice 3; `INVALID` |
