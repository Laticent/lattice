---
status: proposed
summary: >
  Segno grows from an inline-notation engine into the one reader of a whole deck: a staged
  pipeline (ingest, block pass, inline pass, islands) that writes one document model every
  consumer reads, so the renderer, the linter, the narrator and the Studio stop each re-deriving
  slides, directives and fences. The measured prize is consistency and one parse per edit, not
  parse speed: markdown-it's parse is 2-7% of a render, while the linter alone re-reads the deck
  with its own scanners for 19-73 ms. CommonMark first, matched to markdown-it on the corpus;
  Djot second; HTML and CSS later, as islands through the same interface.
---

# Segno reads the whole deck: a staged pipeline and one document model

The owner asked (2026-10-22) for Segno to parse CommonMark and Djot "extremely fast", alongside
the inline notation, as a library Lattice uses to read a whole deck, a slide, the inline code in
it and the content of its HTML comments. Replacing markdown-it is not the goal. HTML and CSS are
out of scope for now, but the design must leave room for them.

This note is the audit and the proposed design. Four decisions in § Decisions are the owner's.

## What the audit measured

All figures from this sandbox on 2026-10-22, Node 22, best of several runs. Reproduce with the
scripts named in each row.

| Question | Answer |
|---|---|
| How much of a render is markdown-it's parse? | **2-7%.** The 59 KB gallery: 3.6 ms parse of a 96.7 ms render. A 12 KB deck: 1.0 of 47.8 ms. A 3 KB deck: 0.2 of 2.1 ms. |
| How long does one lint pass take, and how often does it call markdown-it's `parse`? | 72.9 / 37.6 / 19.2 ms for the same three decks, and **zero** `parse` calls: `lib/authoring/lint-core.js` reads the deck with its own line and regex scanners. |
| Where does lint's time go? | Spread over repeated structure work, not one hot spot. `splitSlideChunks` (lib/core/slide-boundaries.mjs) 9.7% of self time, a `\r\n?` normalization regex 7.1%, then dozens of rule bodies. On the 124-slide gallery one lint applies that normalization **1,261 times**, about ten per slide, because each helper normalizes its own copy. |
| How many modules read deck structure themselves? | A coarse grep finds about 30 under `lib/` that read slides, fences, directives or front matter from source text, and 8 places that build their own markdown-it instance. P0's census replaces the grep with an exact count. |
| Has that cost correctness? | Repeatedly. The headers of `slide-split.js`, `slide-boundaries.mjs`, `section-source-split.js` and `boundary-parser.mjs` each record a bug where one reader disagreed with the engine about where a slide starts (`***`, setext underlines, `---` in fences, empty sections). |
| What does Segno's generated parser look like to a pipeline? | `parse(input, rule)` over a whole string, state at module scope, the tree written into one module-level `Int32Array` that the next call overwrites (lib/core/list-text.generated.js:658, docs/src/lib/segno/codegen.ts:397). Tokenizer speed on whole CSS/HTML/Markdown files: 150-210 MB/s in V8, faster in WebKit (2026-09-28 note, § Generated-parser speed). |

Two conclusions follow.

1. **A faster parser is not where the speed is.** A parser ten times faster than markdown-it
   would take about 3 ms off a 97 ms render. The win is **one parse per edit, shared by every
   consumer**, plus re-parsing only the slide that changed.
2. **Consistency is the larger prize.** Every past boundary bug came from two readers of one text
   disagreeing. One model that every consumer reads removes the class.

## The design: four stages, one tape

```
source ──► S0 ingest ──► S1 block pass ──► S2 inline pass ──► S3 islands (lazy)
           BOM, LF,       dialect-specific   dialect-specific    notation, directives,
           line index     containers,        code spans,         fence records, chart rows,
                          slide boundaries   delimiters, links   front matter … later CSS/HTML
                                   │                │                     │
                                   └────────── one document model ────────┘
                                         read by render, lint, narrator,
                                         Compose, notes, boundaries, export
```

**S0, ingest.** Strip the BOM and normalize line endings once, at the boundary
`2026-08-04-line-endings-lf-boundaries.md` already defines, and build a line-offset index. No
later stage normalizes again.

**S1, block pass.** One pass over the deck that classifies each line with a generated Segno
grammar and keeps the container stack (blockquotes, list items, fences, HTML blocks, tables) in a
small hand-written driver. Slide boundaries fall out of it as a by-product: in CommonMark they
depend on block structure (a setext underline is not a break, a `---` in a fence is not a break),
so a separate splitter cannot be right without doing this pass anyway. Front matter, directives
in HTML comments and fence info strings are recorded as ranges here.

**S2, inline pass.** Per leaf block: a Segno tokenizer for code spans, delimiter runs, brackets,
escapes, entities and autolinks, then a linear delimiter resolver (CommonMark's "process
emphasis" with its openers-bottom table; Djot's simpler rules) and link resolution against the
reference definitions S1 collected deck-wide. A leaf whose text is not contiguous in the source
(a paragraph inside `> ` lines) is copied once with an offset map; every other leaf is read in
place.

**S3, islands, lazy.** Each embedded language is read when a consumer first asks, and memoized
by its range and text: inline code through the existing notation and slots
(lib/core/segno-slots.js), HTML comments through a new directive grammar (`_class: …`,
`key: value`, notes), fence records and bodies through the existing chart-row, flowchart-row
and list-text grammars, front matter through the register grammar. An island is
`(ranges, language, entry rule)`, which is exactly the interface a CSS or HTML tokenizer needs
later, and each of those should be ONE tokenizer every consumer reads, for the same reason.

**The tape.** Segno's existing flat form (four integers per node: kind, from, to, next; preorder)
holds for every stage. S1 knows a container when it opens, so it writes preorder and patches
`next` on close, as Segno does now. S2's emphasis pairs are known only after a leaf is scanned,
so each leaf is two-phase: tokenize into a scratch tape, resolve pairs, then write the leaf's
final preorder nodes. This corrects the 2026-10-19 review's advice to switch Segno to a
postorder tape: the change is unnecessary once each leaf is two-phase, and it would have cost a
migration of every existing reader.

**Incremental.** A top-level thematic break closes every container, so the block state at a
slide boundary is empty by definition. After an edit, S1 re-runs from the edited slide until the
boundaries line up with the old ones again (shifted by the edit's length), and S2 re-runs only
the leaves in between. A keystroke in a 124-slide deck re-reads one slide.

## What Segno has to gain

| Gap | Why the pipeline needs it | Cost |
|---|---|---|
| **G1. Parse a window.** `parse(input, rule, from, to)` | S1 runs a line grammar over the deck at each line, S2 over each leaf, S3 over each island. Slicing copies every one. | Small: the generated code already reads `s` and `n` from module scope. |
| **G2. Caller-owned output.** Write into a tape the caller passes, at an offset | The module-level buffer is overwritten by the next call, so stage outputs cannot coexist. | Small in codegen; every existing caller keeps the default buffer. |
| **G3. Case-insensitive `until`** | CommonMark's HTML-block end conditions (`</script>`, `</style>`, `</pre>`, `</textarea>`) are case-insensitive. Needed for Markdown, not only for HTML. | Small. |
| **G4. Unicode classes** | CommonMark's flanking rules need Unicode whitespace and punctuation. | Exists: sets above U+007F binary-search since 2026-10-07. |
| **G5. A stage API with stated bounds** | The container driver and the delimiter resolver are hand code, which the LL(1) proof cannot cover. Each states its bound (every line visited once, every container pushed and popped once, every delimiter resolved once) and is held to it by the hostile ladders and `mutate:segno`. | Medium; the discipline already exists for `attempt()`. |

The dialect drivers do not belong inside `@laticent/segno`, whose promise is that a grammar that
compiles runs in linear time. They belong in a package that depends on it (see D4).

## Speed targets, from the measured baselines

| Measure | Today | Target |
|---|---|---|
| S0-S1 over the 59 KB gallery (structure, boundaries, directive ranges) | 3.6 ms for markdown-it's whole parse | under 0.5 ms |
| S0-S2 (full CommonMark parse) over the same deck | 3.6 ms | under 1 ms |
| Re-parse after a keystroke inside one slide | the whole deck, several times | one slide, tens of microseconds |
| Structure work inside one lint of the gallery | about 17% of 73 ms, plus what each rule re-derives | near zero: rules read the model |

A full render will not get much faster from this alone: its time is in the transforms. A render
gets faster only where the engine also stops re-deriving structure.

## Acceptance, per dialect

- **CommonMark dialect:** the block structure matches markdown-it's, as Lattice configures it
  (`buildMd` in lib/engine/index.js, plugins' block rules included), on every deck in the corpus
  (403 decks, 3,953 slides); the CommonMark spec examples are reported as a metric, with every
  divergence named. The slide boundaries match `slide-boundaries.mjs` exactly.
- **Djot dialect:** structure counts match djot.js on the corpus converted to Djot and on
  djot.js's 318 spec inputs (the 2026-10-19 probe reached 392/403 and 298/318 for a tokenizer
  alone).
- **Both:** every stage on a hostile ladder grows about 10x for 10x input. (djot.js itself fails
  this: unclosed `:::` divs are quadratic, 0.5 s at 5k, 9 s at 20k.)

## Plan

Each phase ships on its own and is worth having if the next never comes.

| Phase | Delivers | Replaces or unblocks |
|---|---|---|
| **P0. Census and harness** | The per-keystroke census in the Studio (which modules read the deck, how often), `parser:bakeoff:deck`, and the corpus differential harness | The numbers every later phase is held to |
| **P1. Engine gaps G1-G3, G5** | Window parsing, caller-owned tapes, case-insensitive `until`, the stage contract | Notation output byte-identical; `segno-lib:check` green |
| **P2. S0 + S1, CommonMark** | `deckModel(source)`: slides, boundaries, front matter, directive and fence ranges, leaf ranges, incremental re-parse | `slide-boundaries.mjs`, `boundary-parser.mjs`, `split-slides.js`, `section-source-split.js`, and the markdown-it boundary parser in the Studio's startup JavaScript |
| **P3. S3 islands** | The directive grammar for HTML comments; inline code, fence records and chart rows read through the model | `lib/engine/directives.js`'s regexes, lint-core's own scanners, `mermaid-fences.js` |
| **P4. S2, CommonMark** | Inline structure to spec | Compose's and the narrator's inline needs; a later token adapter that lets markdown-it render from the model |
| **P5. Djot** | Djot's S1 and S2, sharing S0 and S3 | Djot authoring, if chosen (2026-10-19 conformance probe) |
| Later | CSS and HTML islands | The CSS and HTML tokenizers from the 2026-09-28 bake-off (`parser:bakeoff:languages`) |

## Decisions

**Decided by the owner on 2026-10-22:** D1 the structure model first; D2 CommonMark first, held
to markdown-it as Lattice configures it, with the spec reported as a metric (D3); D4 a new
sibling package. The options as they were put follow.

- **D1. Scope of the first milestone.** *Recommended:* the structure model (P0-P3), with
  markdown-it still rendering. *Alternative:* aim straight at a full parse (through P4) so the
  engine can render from Segno. The structure model removes the disagreement bugs and the
  repeated reads; the full parse adds rendering independence and costs the hardest part
  (CommonMark's inline rules) before anything ships.
- **D2. Dialect order.** *Recommended:* CommonMark first, because every deck is CommonMark today
  and markdown-it is an exact oracle for parity. *Alternative:* Djot first, which is simpler to
  parse but has no deck to serve until the format decision is made.
- **D3. Fidelity bar for CommonMark.** *Recommended:* match markdown-it as Lattice configures it,
  because that is what renders; report the spec as a metric. *Alternative:* match the spec and
  accept differences from the renderer, which would bring back the disagreement this exists to
  remove.
- **D4. Where the code lives.** *Recommended:* a new package beside Segno
  (`docs/src/lib/segno-markdown/`, published like its siblings) that depends on
  `@laticent/segno`. Segno keeps its compile-time linear promise; the dialect drivers carry
  their own stated bounds. *Alternative:* inside `@laticent/segno`, which is one package to
  publish but mixes proven grammars with hand-written drivers under one promise.
