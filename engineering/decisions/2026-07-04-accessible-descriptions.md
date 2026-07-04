---
status: in-progress
summary: A per-slide accessibility DESCRIPTION channel — author-owned, AI-accelerated, human-confirmed — that exports as the WCAG SC 1.1.1 (Level A) text alternative. It lives beside the speaker note in the Studio Notes tab but is a SEPARATE register with opposite correctness rules (objective equivalent of THIS slide, never off-slide context), stored as its own consumed directive (never a bare comment that leaks into the note). Charts/numbers derive their description from the same source data (structure-first, can't hallucinate). MVP ships to PPTX `altText` + HTML; tagged-PDF `/Alt` is deferred (no pipeline). Reshaped from the owner's plan after a red-team + inversion + independent feasibility pass.
companion:
  - ./2026-07-03-semantic-html-accessibility.md
  - ./2026-07-04-comments-layer.md
  - ./2026-07-03-author-reader-notes-deferred.md
---

# Accessible slide descriptions — the text alternative, author-owned + AI-accelerated

**Date:** 2026-07-04 · **Status:** in-progress (channel + export + authoring shipped; follow-ons noted above) · **Owner:** Sharmarke

> **Status: partially shipped.** The channel + export + authoring are built (see
> "Shipped" below). When this note and a shipped surface disagree, the shipped surface wins.

**Shipped (this build):** the `describe:` engine channel (`notes-core`: consumed, never a
note); PPTX image `altText` on **both** export paths (CLI `lib/export/pptx-export.js` +
Studio `drawing-board-export.js`); the HTML `aria-describedby` sink (CLI); the Studio Notes-tab
field with AI **Generate** (slide-local, structure-first prompt) + the review/confirm gate.
On both PPTX paths the alt text is read from the **rendered `<section>` being rasterized**
(via `notesCore.descriptionFromHtml`), never from a source re-split — so the alt stays
index-locked to its slide even on front-matter and `split: headings` decks. (A first cut of
the Studio path re-derived descriptions from `splitSlides(source)`; a red-team + checker pass
caught that the front-matter `---` becomes a phantom chunk and shifted every alt by one — a
"wrong alt is worse than none" failure. Guarded by `test/unit/export/description-alignment.test.js`.)
**Deferred (documented follow-ons):** tagged-PDF `/Alt` (no tagged-PDF pipeline exists); a
full deck-wide batch "describe all slides" in the Architect (the per-slide generate ships now);
engine-derived data-tables for charts (the structure-first rule is enforced at the prompt today).

Shaped with the owner, then pressure-tested by a **red-team + inversion + independent
feasibility** pass. The owner's plan was right on destination and ownership; four
mechanics it bundled for token-efficiency optimized the *speaker note's* correctness
rules and **inverted the description's** — those are corrected below.

---

## The problem (why this is Level-A, not a nicety)

Lattice's PPTX export is **one full-bleed image per slide** (`lib/export/pptx-export.js:68`,
`addImage({ data, … })` with no alt). A screen reader announces *"Slide N, Picture"*
and stops — every word, number, and chart is locked in pixels. That is a **WCAG SC
1.1.1 Non-text Content failure at Level A** (the floor of ADA / Section 508 / EN 301 549),
already tracked as **G1** in [`2026-07-03-semantic-html-accessibility.md`](./2026-07-03-semantic-html-accessibility.md).
The PDF is untagged (`lattice-emulator.js:1791` prints with no tagged option; no `/Alt`,
`/Lang`, `/Title`). Today the only per-slide "text about the slide" is the speaker note,
which is the *wrong* register (see below) and routes only to the presenter-notes field.

**A per-slide description is the fix** — a plain-language, objective equivalent of what
the slide shows, for someone who can't see it and can't correct a wrong one.

## The decision (short version)

1. **Author-owned, AI-accelerated, human-CONFIRMED.** The author owns the description;
   a "Generate" action drafts it; the author reviews/edits/confirms. AI text is never
   authoritative until confirmed, and **unconfirmed AI text does not export**.
2. **It lives beside the speaker note in the Studio Notes tab** — but as a **separate,
   clearly-labeled field** ("Description — what's on the slide, for screen readers" vs
   "Presenter note — what you say"). Co-located UI, never a shared value.
3. **It is a SEPARATE register from the note, with opposite correctness rules** — objective
   equivalent of *this slide only*; importing off-slide context is a WCAG *failure*, not a
   bonus. So it gets its **own, slide-local, differently-prompted** generation.
4. **Structure-first for structural slides.** Charts, big-numbers, tables, and lists derive
   their description from the **same structured source that renders them** (can't drift);
   the LLM writes at most a one-line summary *over* that. (a11y doc **G5**.)
5. **Its own stored channel — a consumed directive, never a bare comment.** Stored in the
   deck source (so it travels + exports), consumed by the render paths, routed to the alt
   sinks — never swept into `notesFromHtml` (that would leak it into the spoken note).
6. **MVP exports to PPTX `altText` + HTML; PDF `/Alt` is deferred** (no tagged-PDF pipeline
   exists). Claim **Level A (SC 1.1.1)** for the surfaces that ship; mark PDF **UNVERIFIED**.

## The register split — the load-bearing correction

A speaker note and a description are governed by **opposite rules**. Conflating them
corrupts both — and Lattice already codified "keep these channels distinct" in
[`2026-07-04-comments-layer.md`](./2026-07-04-comments-layer.md) (§"Three travelling channels").

| | **Speaker note** | **Description (alt-text)** |
|---|---|---|
| Register | subjective, persuasive, "what you say" | objective equivalent, "what's on the slide" |
| Off-slide context | **wanted** (references the room, prior slides) | a **conformance failure** if imported |
| Full-deck context | genuinely improves it | **degrades** it — pulls in claims not on the slide |
| Audience | the presenter | a screen-reader / assistive-tech user |
| Export sink | PPTX `addNotes` / PDF annotation / HTML sidecar | PPTX image `altText` / (later) PDF `/Alt` / HTML `aria` |
| Accuracy stakes | a loose note is survivable | a **wrong** description is worse than none (the user can't see the slide to catch it) |

So the two levers the original plan shared — **one AI call** and **full-deck context** —
are *correct-signed for the note and wrong-signed for the description*. They must diverge.

### The one-call reconciliation

The owner's "one shot for both" **survives in the cheap default**: when everything is
slide-local, a single call can emit **both** fields as two clearly-separated, differently-
instructed outputs. The split becomes mandatory only when **full-deck context is turned on
for the note** — at that point the description stays its own slide-local generation. So:
*one call by default; split when the note goes full-context.* This keeps the efficiency
instinct without contaminating the description.

## Generation model (author-time only)

- **Reuse the existing AI one-shot pattern** — `docs/src/components/studio/architect.ts`
  (controller) + the pure prompt/coerce halves in `lib/layout/ai.js` (`coerceComponent`,
  `:671`) + `lib/theme/ai.js`. A `{ note, description }` generator is a straight analog: a
  new pure builder + a coerce + one `architect.ts` action. BYO-key OAuth PKCE, client-side,
  streaming SSE, budget guard already exist (`architect-model.js:170` key in localStorage;
  `architect.ts:186` budget) — **HARD RULE #24 holds** (the user spends their own key).
- **Generation happens at AUTHORING time, never at export.** The confirmed string is stored;
  export just reads it. Offline PDF/PPTX export stays network-free.
- **Slide-local is the default and the norm for descriptions** — cheaper *and* more accurate.
  The "full-deck context" control (a workspace setting, `studio-store.ts:229` `StudioSettings`)
  is a **note-only** option, **default off** (a deck-wide generate is ~N × deck-size in input
  tokens on the user's key).
- **Deck-wide batch lives in the Architect** (`ArchitectChat.tsx`, the AI surface) — but it
  is a **drafter, not an approver**: it drafts into an **unconfirmed** state, confirmation
  stays **per-slide**, and unconfirmed drafts do not export. (Inversion: "one click, 40
  slides, pre-approved" is the design that *guarantees* wrong alt-text ships at scale.)

## Storage + export (the engine-first gate)

- **A new consumed per-slide directive** — provisionally `<!-- describe: … -->` (final key
  TBD; must not collide with per-image markdown `![alt]`). It is added to the directive
  vocabulary so the render paths **consume** it (like `_class`) and it **never reaches
  `notesFromHtml`** (`lib/authoring/notes-core.js`) — otherwise it is read aloud as a
  speaker note, the exact leak the [`2026-07-03-author-reader-notes-deferred.md`](./2026-07-03-author-reader-notes-deferred.md)
  analysis proved for `_author`/`_reader`. Storage sits beside the note in the Studio
  (`slide-notes.ts` is the sibling), but is a *different* channel at the engine layer.
- **Export sinks:**
  - **PPTX (cheap — mirror #741):** thread a per-slide `descriptions[i]` into
    `slide.addImage({ …, altText })` (`pptxgenjs` supports `altText`, types `:1304`), exactly
    as #741 threaded `notes[i]` → `addNotes`. Small, high-value — closes the G1 gap.
  - **HTML (easy):** a visually-hidden description / `aria-describedby` on the slide, and a
    real `alt` on the slide image where one is emitted.
  - **PDF (deferred — the expensive part):** a real `/Alt` needs a **tagged-PDF pipeline**
    (StructTree + marked content) that does not exist — the emulator prints one untagged
    vector page per slide, not discrete tagged image objects. Mark **UNVERIFIED / out of
    scope** until that pipeline lands.

## Structure-first: the accuracy backbone

For a chart, a hallucinated number is *invisible to the sighted author confirming it*
("the bars go up, the sentence says up" — but the figure is wrong and they can't see it).
So for structural slides, **derive the equivalent from the same source that draws the SVG**
(the chart's data, the big number, the table rows, the list items) — the a11y doc's **G5**
single-source rule. The current auto-emitted SVG `<title>`s are generic ("Pie chart",
`chart-family.js:387`) — not a description; the derived data table replaces them as the
equivalent. The LLM writes only a one-line human summary *over* the table, never the numbers.
This is the biggest accuracy win and it is already the house decision.

## What survives from the original plan (unchanged)

- Author owns it; AI accelerates; author reviews/edits. (Right ownership; refuses fully-auto alt-text.)
- It lives in the Notes tab beside the speaker note (distinct labels, distinct values).
- Slide-local by default.
- One AI call in the cheap default (see reconciliation).
- A deck-wide generate in the Architect.

## Non-goals / do-not

- **No auto-export of unconfirmed AI text** — a wrong description is worse than none; per-slide human confirm gates export.
- **No full-deck context for the description** — it is a note-only option; descriptions are always slide-local.
- **No free-text AI for chart/number/table data** — derive from source (structure-first); AI writes only a summary.
- **No storing the description as a bare comment** — it must be a consumed directive routed to the alt sinks, never swept into the speaker note.
- **No PDF `/Alt` claim yet** — deferred until a tagged-PDF pipeline exists; MVP claims Level A for PPTX + HTML only.
- **No "AA" claim** — the text-alternative requirement is **SC 1.1.1, Level A** (SC 1.4.5 Images-of-Text is a different, AA criterion).

## Open questions / phasing

1. **Directive name + syntax** — `describe:` vs `alt:` vs a front-matter/manifest field;
   must not collide with per-image markdown alt, and must round-trip byte-exact.
2. **The engine channel is the gate** — the consumed directive + `addImage({ altText })`
   thread + HTML sink must land **before** the Studio field ships (do-not-ship-before, per
   the deferred-notes doc). The PPTX thread reuses the #741 pattern and can land first.
3. **Confirmed-state model** — how "unconfirmed AI draft" is represented so export can refuse
   it (a flag on the directive? a separate draft store?) without cluttering the source.
4. **Tagged-PDF pipeline** — the expensive follow-on for PDF `/Alt` / `/Lang` / `/Title`
   (a11y doc G1/G2); its own decision when prioritized.
5. **Note generation** — the one-call `{note, description}` builder is net-new; `lib/layout/ai.js:91`
   only *preserves* note comments during component-gen, it is not a note generator.

## Known limitations / edge cases (from the red-team + checker pass)

These are accepted, bounded trade-offs — recorded here so they are known, not silent.

- **A pre-existing note that begins `describe:` is now reclassified as a description.** The
  channel reserves the `describe:` comment prefix, so a legacy speaker note authored as
  `<!-- describe: the slow build to the reveal -->` moves from the presenter-notes field to the
  image alt text. Narrow trigger (the word must be the very first token); no migration shipped.
  This is the cost of a plain, memorable prefix and is by design — `describe:` is the directive.
- **Export-to-Marp does not translate the description.** The one surviving Marp handoff
  (`shareMarp` → `lib/core/marp-bundle.js`) emits the source with `<!-- describe: … -->` intact;
  rendered by *real* Marp (which has no `describe:` concept) it becomes a speaker note. Out of the
  owned engine, but a path where a description could be spoken — a follow-on if Marp export is hardened.
- **The Studio PPTX path threads descriptions but not speaker notes.** Pre-existing asymmetry
  (`exportPptx` never took a notes argument); the CLI PPTX carries both. Tracked as a follow-on —
  wire the Studio browser export's `addNotes` the same way it now wires `altText`.
- **Deck delete now also clears the per-deck comment store** (`clearComments` in `deleteDeck`);
  a sibling gap — checkpoints (`lattice-studio-snap-<id>`) are still orphaned on delete — is
  pre-existing and off-path, logged here rather than pulled into this diff (HARD RULE #18).

## Related decisions

- [`2026-07-03-semantic-html-accessibility.md`](./2026-07-03-semantic-html-accessibility.md) — the a11y groundwork + gap register (G1 PPTX alt from source; G5 chart data-table single-source; G2 tagged PDF).
- [`2026-07-04-comments-layer.md`](./2026-07-04-comments-layer.md) — the "three travelling channels, keep them distinct" model (note vs description vs comment); export-options step.
- [`2026-07-03-author-reader-notes-deferred.md`](./2026-07-03-author-reader-notes-deferred.md) — the register analysis this came from + the "consumed directive, or it leaks into the note" engine-first gate.
- [`2026-06-16-lattice-export-format.md`](./2026-06-16-lattice-export-format.md) — the `.lattice` manifest (an alternative home if the description is not a source directive).
- [`2026-06-16-colour-blindness-accessibility.md`](./2026-06-16-colour-blindness-accessibility.md) — sibling a11y work (palette).
- [`2026-07-03-slide-context-editor.md`](./2026-07-03-slide-context-editor.md) — the per-slide drawer whose Notes tab hosts the field.
- Shipped: **#741** — PPTX now carries speaker notes via `addNotes` (the threading pattern the PPTX `altText` export mirrors); `lib/export/pptx-export.js`, `lib/authoring/notes-core.js`.
