---
status: proposed
summary: >
  Segno grows from an inline-notation engine into the one parser of a whole deck: a staged
  pipeline (ingest, block pass, inline pass, islands) that writes one document model every
  consumer reads, so the renderer, the linter, the narrator and the Studio stop each re-deriving
  slides, directives and fences. The prize, in the owner's order: one parse per edit shared by
  every consumer, consistency, then speed. markdown-it's parse is 2-7% of a render, while the
  linter alone re-reads the deck for 19-73 ms. CommonMark first, matched to markdown-it; Lattice's
  own semantics and CSS as dialects of the same spine; Djot after. The end state is a renderer
  that reads the model and no longer depends on markdown-it.
---

# Segno reads the whole deck: a staged pipeline and one document model

The owner asked (2026-10-22) for Segno to parse CommonMark and Djot "extremely fast", alongside
the inline notation, as a library Lattice uses to read a whole deck, a slide, the inline code in
it and the content of its HTML comments.

**The goal, restated by the owner on 2026-10-25.** One multi-dialect parser for Lattice's own
semantics, Markdown, Djot and CSS, built on one internal spine. Lattice's semantics plus Markdown
come first. markdown-it is fine today, but it is a dependency Lattice cannot rely on long term,
so **the end state is a renderer that reads this parser's model and no longer needs markdown-it**
(phase P7). The owner ranks the wins: one parse per edit shared by every consumer, then
consistency (every reader agrees by construction), then speed. HTML stays later.

This note is the audit, the bake-off and the proposed design. The decisions in § Decisions are
the owner's.

## What the audit measured

All figures from this sandbox on 2026-10-22, Node 22, best of several runs. The method, to
reproduce them: time `new MarkdownIt('commonmark', { html: true, breaks: true })` with `table`
and `strikethrough` enabled, `parse(src, {})`, against `createEngine().render(src)` and
`lintText(src)` (lib/authoring/lint.js) after three warm-up renders; count `parse` calls by
wrapping `MarkdownIt.prototype.parse`, and normalizations by wrapping `String.prototype.replace`
for the regex source `\r\n?`; profile lint with `node --cpu-prof` over 30 runs. The decks are
`test/integration/baseline-decks/gallery.md` (59 KB), `examples/data-viz-gallery.md` (12 KB)
and `examples/card-tags.md` (3 KB). P0 committed this as `npm run parser:bakeoff:deck` (§ What P0 measured).

| Question | Answer |
|---|---|
| How much of a render is markdown-it's parse? | **2-7%.** The 59 KB gallery: 3.6 ms parse of a 96.7 ms render. A 12 KB deck: 1.0 of 47.8 ms. A 3 KB deck: 0.2 of 2.1 ms. |
| How long does one lint pass take, and how often does it call markdown-it's `parse`? | 72.9 / 37.6 / 19.2 ms for the same three decks, and **zero** `parse` calls: `lib/authoring/lint-core.js` reads the deck with its own line and regex scanners. |
| Where does lint's time go? | Spread over repeated structure work, not one hot spot. `splitSlideChunks` (lib/core/slide-boundaries.mjs) 9.7% of self time, a `\r\n?` normalization regex 7.1%, then dozens of rule bodies. On the 124-slide gallery one lint applies that normalization **1,261 times**, about ten per slide, because each helper normalizes its own copy. |
| How many modules read deck structure themselves? | Dozens, and the number depends on the pattern: greps for slide splits, fences, front matter and `_class` under `lib/` match 175-210 files, many of them only touching the text. 8 files besides the engine build their own markdown-it (12 construction sites in 9 files under `lib/`). § What P0 measured replaces the greps with a count from the syntax tree. |
| Has that cost correctness? | Repeatedly. The headers of `slide-split.js`, `slide-boundaries.mjs`, `section-source-split.js` and `boundary-parser.mjs` each record a bug where one reader disagreed with the engine about where a slide starts (`***`, setext underlines, `---` in fences, empty sections). |
| What does Segno's generated parser look like to a pipeline? | `parse(input, rule)` over a whole string, state at module scope, the tree written into one module-level `Int32Array` that the next call overwrites (lib/core/list-text.generated.js:658, docs/src/lib/segno/codegen.ts:397). Tokenizer speed on whole CSS/HTML/Markdown files: 150-210 MB/s in V8, faster in WebKit (2026-09-28 note, § Generated-parser speed). |

**Three editing layers, three Markdown parsers.** The owner's stack is LFM at the foundation,
with three layers on it: CodeMirror edits the source, ProseMirror (Compose) is the hybrid text and
visual editor, and the engine renders. Today each reads LFM with its own parser and its own
settings:

| Layer | Parser | Settings |
|---|---|---|
| CodeMirror (`docs/src/components/studio/Editor.tsx`) | `@codemirror/lang-markdown`, a Lezer grammar | its own |
| Compose (`docs/src/lib/compose/deck-markdown.ts`) | `prosemirror-markdown` over its own markdown-it | CommonMark + `table` |
| The renderer (`buildMd`, `lib/engine/index.js`) | markdown-it | CommonMark + `table` + `strikethrough` + `breaks: true` |

So `~~a~~` renders struck through and is plain text in Compose: the boundary-bug class again,
across editors. Each agreement has to be added by hand. Compose once dropped a paragraph's soft
line breaks that the renderer draws (`breaks: true`); #2875 fixed it by mapping each one to a
`<br data-soft>` node (`deck-markdown.ts`). One model makes those agreements structural rather
than per-fix.

Two conclusions follow.

1. **A faster parser is not where the speed is.** A parser ten times faster than markdown-it
   would take about 3 ms off a 97 ms render. The win is **one parse per edit, shared by every
   consumer**, plus re-parsing only the slide that changed.
2. **Consistency is the larger prize.** Every past boundary bug came from two readers of one text
   disagreeing. One model that every consumer reads removes the class.

## What the bake-off measured (2026-10-26)

Can one generic spine be fast, or does every stage need hand code? The bake-off runs each arm over
every tracked deck, gallery and design or engineering doc (1,258 files, 19.7 MB at `1fc891b`) and
counts an arm only when its block structure matches markdown-it's on every file. Every arm matched
on all 1,258 in every run. The scripts are in `tools/parser-bakeoff/deck/` (`npm run parser:bakeoff:deck -- --arms`).

Five runs, each a separate process, on one machine (4-core Intel Xeon at 2.10 GHz, Node 22.22,
a shared cloud sandbox). The median and the range over the five; a ratio is against markdown-it in
the same run.

| Arm | Median | Range |
|---|---|---|
| markdown-it, block structure only | 85.4 MB/s | 75.9-90.1 |
| markdown-it's rules on a typed line index built in one pass | 1.25x | 1.24-1.30x |
| the same, plus one line pass that lets each rule skip lines it provably cannot match | 1.35x | 1.15-1.36x |
| the same line pass, generated by Segno instead of written by hand | 1.17x | 0.99-1.30x |
| the line pass alone: hand-written vs Segno-generated | 665 vs 361 MB/s | 637-680 vs 312-393 |
| a second pass over Segno's tape, on top of tokenizing | about +1% | one run, under contention, read -34% |

The first single run (2026-10-23) read 1.42x for the hand-written arm and 627 vs 276 MB/s for the
line pass; the five runs put both lower and show how much the sandbox moves (the markdown-it
baseline alone spans 19%). Three conclusions hold across all five:

1. **The staged shape is right.** One pass that classifies lines, then rules that read its
   arrays, beats markdown-it with markdown-it's own rules in every run (1.15-1.36x), at exact
   parity.
2. **Reading Segno's tape in a second pass is nearly free** (about 1%), so stages can hand each
   other tapes instead of re-scanning text.
3. **Segno's generated code is the bottleneck, and the spine depends on fixing it.** The hand
   loop runs 1.84x faster (median) because it finds the next of a few characters with one native
   search, where the generated code steps a character at a time. With today's codegen the
   generic arm is not reliably faster than markdown-it (one run in five read 0.99x). Teaching
   codegen to emit that search (G6 below) is what makes a generic spine the fast one at all.

## What P0 measured (2026-10-26)

`npm run parser:bakeoff:deck` (tools/parser-bakeoff/deck.mjs) now reproduces the audit table, counts
the readers, and runs the corpus differential harness. It ran on a tree at `00f4785` plus this change, on a 4-core Intel Xeon at
2.10 GHz, Node 22.22. Flags: `--audit`, `--census`, `--arms`, `--runs N` (median and range over N
processes), `--json`.

**The audit table reproduces.** One run, same method as above:

| Deck | markdown-it parse | Render | Parse share | One lint | `parse()` calls in lint | `\r\n?` runs in lint |
|---|---|---|---|---|---|---|
| gallery (59 KB) | 3.44 ms | 102.2 ms | 3.4% | 74.9 ms | 0 | 1,650 |
| data-viz (12 KB) | 1.11 ms | 51.7 ms | 2.2% | 32.2 ms | 0 | 507 |
| card-tags (3 KB) | 0.22 ms | 2.8 ms | 8.0% | 17.9 ms | 0 | 302 |

Parse share, lint time and the zero `parse()` calls match the audit. The normalization count does
not: 1,650 on the gallery against the 1,261 recorded on 2026-10-22. Counting at older commits (the
checker's run) gives 1,264 at the audit's date and 1,271 just before `514beea` (the video plugin,
#2874), which adds 379 normalizations to every lint and takes it to 1,650. The audit's own commit
was not recorded, so the 1,261 itself is not reproduced to the digit.

**The reader census.** A reader is a source file that does one of four things itself, found by
walking the syntax tree of every tracked, non-generated, non-test file under `lib/`, `docs/src/` and
`tools/` (1,600 JavaScript and TypeScript files at `00f4785`, none unparsed; TypeScript through
esbuild, then acorn; the harness's own directory is left out, as it reads patterns on purpose):

| Reader of | What the census looks for | `lib/` + `docs/src/` | `tools/` |
|---|---|---|---|
| a private markdown-it | `new MarkdownIt(...)`, `markdownit(...)`, `require('markdown-it')(...)` | **12 files**, 9 of them under `lib/` | 6 |
| fences | a regular expression that matches a run of three backticks or tildes | **46** | 12 |
| slide boundaries and front matter | one that matches a `---`, `***` or `___` line, or a front-matter block | **89** | 31 |
| directives | one that matches `<!--` | **37** | 18 |
| **Any of the four** | | **136 files** | 42 |

35 of the 136 read two or more of the four. 18 product files import one of the shared splitters
(`slide-boundaries`, `boundary-parser`, `split-slides`, `section-source-split`, `slide-split`; six
files, because `boundary-parser` has a `.js` and an `.mjs` form, and they are not counted as
readers). 11 of those 18 also read for themselves; 7 only call the splitter.

A pattern is classified by what it matches, not how it is spelled: each is run against probe strings
(a fenced block, a front-matter block, `***` between paragraphs, a comment) and against negatives (an
inline code span, a list item, a date, `key: value`), and it counts only when the text it matches holds
the marker. A text search for `---` finds every em-dash replacement; this does not. **Accuracy, from the
checker's hand review:** of a seeded sample of 25 product readers, 20 were right, 3 were false
positives (a number list, a CSS custom-property name, a Mermaid diagram's own front matter) and 2
read `<!--` in rendered HTML, not in deck source. The directive class is the weakest: about 16 of its
37 name a directive key, the rest match any comment (stripping, escaping, notes). Missed readers:
files that split with `startsWith`, `indexOf` or a `=== '---'` test use no regular expression, and a
10-minute grep found about 10 of them (`comment-directive.mjs` among them); `.astro` pages are not
scanned. Read each count as accurate to about ±15 files in each direction, and the two errors
partly cancel. `--census --json` lists every file.

**One render and one lint of the gallery run code in 46 of those readers** (39 in the render, 20 in
the lint; 4 of the 46 are false positives), from V8's precise coverage after warm-up. The figures
below count every function call in the file, not only the reading: `lib/authoring/lint-core.js` about
86,000 in one lint, `meta-record.mjs` 10,100, `shape-glyphs.js` 7,600; the render's
`integrations/markdown-it/plugins.js` 15,900 and `engine/slides.js` 5,000. **Not covered:** the Studio's own layers in the browser (CodeMirror,
Compose, the outline) run in a page, not in this process, so this is the engine-side census; a live
per-keystroke census of the Studio is still open and is not claimed here.

**The corpus differential harness** (`--arms`, scripts in tools/parser-bakeoff/deck/) is the bake-off
above, graduated from the follow-up folder: 1,259 files at `00f4785`, every arm at exact parity. The
first run reads markdown-it 60.9 MB/s, the typed line index 1.31x, the hand-written staged arm 1.57x,
the Segno-generated arm 1.18x, and the line pass alone 582 (hand) against 268 (Segno) MB/s. One run
is not comparable with the five above: markdown-it itself read 60.9 MB/s here against their 75.9-90.1,
and the hand-written arm's 1.57x is above their 1.15-1.36x range. `--runs N` is what the second-machine re-run (follow-up #2869)
uses.

**Two more sets of five runs (2026-10-26, `npm run parser:bakeoff:deck -- --arms --runs 5`, at `112271f`).**
Both are 4-core Intel Xeon at 2.10 GHz under KVM, Node 22.22, 1,259 files, every arm at parity in all
ten runs. The second ran in a separate cloud container started for the purpose. `lscpu` shows the same
CPU model for both, so it cannot say whether the host differs; the markdown-it baseline did (59.1 MB/s
here, 93.9 there), so the two are different VMs in practice. Median and range of five; a ratio is
against markdown-it in the same run.

| Arm | Machine 1 (this session) | Machine 2 (separate container) |
|---|---|---|
| markdown-it, block structure only | 59.1 MB/s (57.9-59.4) | 93.9 MB/s (86.2-100.5) |
| markdown-it's rules on a typed line index | 1.38x (1.27-1.51) | 1.37x (1.23-1.54) |
| plus the hand-written line pass | 1.48x (1.42-1.53) | 1.25x (1.14-1.54) |
| plus the Segno-generated line pass | 1.17x (1.15-1.21) | 1.08x (1.00-1.32) |
| line pass alone, hand vs Segno | 557 vs 270 MB/s | 711 vs 315 MB/s |

What the second machine settles. **The staged shape wins on both**, 1.14-1.54x with the hand-written
pass at exact parity, so conclusion 1 above stands. **The generated pass is the weak link on both**:
1.00-1.32x, one run in five at parity with markdown-it, and the hand loop is 2.06x (machine 1) and
2.26x (machine 2) faster than the generated one, so conclusion 3 stands and G6 is what a generic
spine needs. **The size of the win does not transfer between machines**: the hand-written arm reads 1.48x on
one and 1.25x on the other, so quote a range, and never a single run, for the speed target in §
Speed targets. The first set of five (above) sits inside these two for the staged arms.

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

**What the three layers need from the model.**

- **CodeMirror: incremental, with every position.** Highlighting, folding and lint need a tree
  updated per keystroke. The model feeds CodeMirror through an adapter from the tape to a Lezer
  tree, so the source editor reads LFM the way the renderer does instead of with its own grammar.
- **Compose: lossless.** A visual edit must re-emit the author's spelling everywhere it did not
  touch: list markers, spacing, table pipes. The model keeps concrete syntax (the characters as
  typed), not only meaning, so Compose builds its document from the model and serializes back
  without reformatting the deck.
- **All three: one coordinate system.** A cursor in the source, a selection in Compose and a click
  on the rendered slide name the same range of LFM text. Every node on the tape already carries
  `from` and `to`, so the three sync through the model.

## What Segno has to gain

| Gap | Why the pipeline needs it | Cost |
|---|---|---|
| **G1. Parse a window.** `parse(input, rule, from, to)` | S1 runs a line grammar over the deck at each line, S2 over each leaf, S3 over each island. Slicing copies every one. | Small: the generated code already reads `s` and `n` from module scope. |
| **G2. Caller-owned output.** Write into a tape the caller passes, at an offset | The module-level buffer is overwritten by the next call, so stage outputs cannot coexist. | Small in codegen; every existing caller keeps the default buffer. |
| **G3. Case-insensitive `until`** | CommonMark's HTML-block end conditions (`</script>`, `</style>`, `</pre>`, `</textarea>`) are case-insensitive. Needed for Markdown, not only for HTML. | Small. |
| **G4. Unicode classes** | CommonMark's flanking rules need Unicode whitespace and punctuation. | Exists: a set above U+007F binary-searches once it has more than 16 ranges (`HIGH_CHAIN`, `codegen.ts`; `HIGH_SCAN`, `charset.ts`), and a smaller one is an inline chain. |
| **G6. Native runs in codegen** | A rule that consumes "anything until one of these few characters" should compile to one native search (`indexOf`, or a small set check over a typed table) instead of a per-character loop. The bake-off's 665 vs 361 MB/s gap (median of five) is this. | Medium: codegen only, the grammar language does not change; byte-identical output on every existing grammar. |
| **G5. A stage API with stated bounds** | The container driver and the delimiter resolver are hand code, which the LL(1) proof cannot cover. Each states its bound (every line visited once, every container pushed and popped once, every delimiter resolved once) and is held to it by the hostile ladders and `mutate:segno`. | Medium; the discipline already exists for `attempt()`. |

The dialect drivers do not belong inside `@laticent/segno`, whose promise is that a grammar that
compiles runs in linear time. They belong in a package that depends on it (see D4).

## Speed targets, from the measured baselines

| Measure | Today | Target |
|---|---|---|
| A generated line pass, alone, on the bake-off corpus | 361 MB/s (median of five) | at least the hand-written loop's 665 MB/s, on the same machine (G6) |
| S0-S1 over the 59 KB gallery (structure, boundaries, directive ranges) | markdown-it's block parse, same machine | at least 3x faster than that, on the same machine (restated 2026-11-05: was "under 0.5 ms", see §P2 landed) |
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
| **P1. Engine gaps G1-G3, G5, G6** | Window parsing, caller-owned tapes, case-insensitive `until`, the stage contract, native runs in codegen | Notation output byte-identical; `segno-lib:check` green; the generated line pass at hand-written speed |
| **P2. S0 + S1, CommonMark** | `deckModel(source)`: slides, boundaries, front matter, directive and fence ranges, leaf ranges, incremental re-parse | `slide-boundaries.mjs`, `boundary-parser.mjs`, `section-source-split.js` (`split-slides.js` had no caller and was deleted by #2923), and the Studio deck outline's markdown-it boundary reader (`docs/src/lib/deck-outline/deck-outline.ts`, through `boundary-parser.mjs`) |
| **P3. S3 islands** | The directive grammar for HTML comments; inline code, fence records and chart rows read through the model | `lib/engine/directives.js`'s regexes, lint-core's own scanners, `mermaid-fences.js` |
| **P4. S2, CommonMark** | Inline structure to spec | Compose's and the narrator's inline needs; a later token adapter that lets markdown-it render from the model |
| **P4b. The editors on the model** | CodeMirror's tree from the tape; Compose's document built from the model and serialized losslessly | `@codemirror/lang-markdown`'s grammar and Compose's own markdown-it, so all three layers read LFM one way |
| **P5. CSS dialect** | One CSS tokenizer on the spine, as an island and as a whole stylesheet: `lib/core/remote-ref.js`'s `cssRefSpans` (#2871) is its first reader | Every hand-written CSS scan in `lib/`, one at a time, each held to the browser |
| **P6. Djot** | Djot's S1 and S2, sharing S0 and S3 | Djot authoring, if chosen (2026-10-19 conformance probe) |
| **P7. Render from the model** | A renderer that reads the document model; markdown-it removed | The dependency the owner cannot rely on long term. Held to byte-identical HTML on the corpus against today's renderer before the switch |
| Later | HTML islands | The HTML tokenizer from the 2026-09-28 bake-off (`parser:bakeoff:languages`) and `scanHtml` (#2871) |

## Decisions

**Decided by the owner on 2026-10-22:** D1 the structure model first; D2 CommonMark first, held
to markdown-it as Lattice configures it, with the spec reported as a metric (D3); D4 a new
sibling package. The options as they were put follow.

**Set by the owner on 2026-10-25:** the end state is P7, rendering without markdown-it; the
priority order is shared parse, then consistency, then speed; CSS and Lattice's own semantics are
dialects of the same spine. D1 stands as the first milestone, now on the way to P7 rather than
the destination. "LFM" in the owner's list is Lattice-flavored Markdown: Markdown plus Lattice's
own semantics, which is what P2-P4 parse. The owner would rather Lattice's semantics did not live
inside Markdown at all; Djot (P6) is the candidate, because John MacFarlane, who wrote the
CommonMark spec, designed it so that every input has one reading.

**Leave room for spreadsheets.** The owner's longer aim is documents and spreadsheets on the same
spine. Nothing here builds that, but two choices must not close it off: the document model holds
a table as data (typed cells in rows and columns), not only as something to render, so a deck
table, a document table and a sheet share one structure; and the island interface takes a formula
language the way it takes CSS. A formula grammar needs operator precedence, so like the container
and emphasis drivers it would pair a generated tokenizer with a small hand-written driver.

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

## G6 landed (2026-10-26)

`docs/src/lib/segno/codegen.ts` now compiles a `many` over the complement of one to three single characters to a cached native search. Each stop character gets `nx_<code>(from)`, which returns the remembered `indexOf` hit while the cursor has not passed it and searches again otherwise; the run ends at the smallest hit, clamped to `n` (the attempt window's end). `parse()` resets the caches. A set with more stops, or ranges, keeps the 16-character JS prefix plus regular expression.

Measured on the 4-core Xeon, median of five, `npm run parser:bakeoff:deck -- --arms --runs 5` at `1502454` versus this change:

| Measure | Before | After |
|---|---|---|
| Segno line pass alone | 315 MB/s | 460 MB/s |
| S-staged (Segno stage + predicates) | 86.5 MB/s, 1.16x markdown-it | 96.1 MB/s, 1.24x |
| Hand line pass alone (control) | 660 MB/s | 642 MB/s |

That is 72% of the hand-written loop, short of the 665 MB/s target. The earlier scratch spike reported 1.9-2.4x; this is the measured result of the shipped version, with the existing codegen tests, the grammar fuzz and metamorphic suites green. The remaining gap is tape writes and node bookkeeping, which is the tape-trimming step, not more run work. Trees are identical. Only `list-text.generated.js` gains the helpers; the notation parsers change by one blank line. A checker found two costs: runs of one to three characters are about as fast or slower than the loop (the empty run now skips the call), and a crafted input inside attempt windows can re-search about `max` times per block (2.5-5x, still linear). No shipped grammar has both.

Second machine (a separate cloud container, Xeon 2.3 GHz, 4 vCPU, Node 22.22.0), same command, `4df5cc6` against the pre-G6 generator and outputs from `1502454`, median of five:

| Measure | Pre-G6 | G6 |
|---|---|---|
| Segno line pass alone | 397 MB/s | 558 MB/s |
| S-staged (Segno stage + predicates) | 116.0 MB/s, 1.13x markdown-it | 128.3 MB/s, 1.23x |
| Hand line pass alone (control) | 911 MB/s | 906 MB/s |

The gain holds across machines (+41% here, +46% on the first), and the generated pass reaches 62% of the hand loop on this one (72% on the first).

`npm run mutate:segno`: 13 of 13 codegen mutants killed in the full run. None of the 13 targets the native-run path, so three hand mutants of it were run against the Segno suite: a cache that is always valid hangs the suite (caught); skipping the empty-run test survives and cannot change a result (it is a speed shortcut); letting a hit one past an attempt window's end win survives, because the attempt fails the same way either way. Neither survivor changes a parse.

## Tape trimming, measured (2026-10-29)

The follow-up after G6 (followups 2909-p2) assumed the generated line pass lost to the hand loop on
node bookkeeping and tape writes. Measured, it does not. `npm run parser:bakeoff:deck -- --arms` now
also prints the generated parse alone, before the walk that turns its tape into markdown-it's
arrays. On the 4-core Xeon (2.8 GHz, Node 22.22.0), corpus of 1,293 files and 20.2 MB, 530k nodes
(26 a KB):

| Measure | MB/s |
|---|---|
| Hand line pass (control) | 608-626 |
| Segno parse alone, no walk | 637-660 |
| Segno line pass, parse plus walk, before | 381 (median of five) |
| Segno line pass, parse plus walk, after | 471 (median of five, range 443-478) |

So the generated parser already matches the hand loop, and the whole gap was the bake-off's own
walk (`stageSegno`, tools/parser-bakeoff/deck/staged.mjs), which took 22 of the stage's 54 ms.
Two changes to the walk, trees and arrays identical on all 1,293 files:

- **Size the arrays from the tape.** The walk counted the source's newlines with `indexOf` before
  it read the tape: 12 ms of its 19. Every top-level node is a line, and each character between one
  line's end-plus-newline and the next line's start is a blank line, so the tape already holds the
  count.
- **No closure over the loop's counters.** `blankUntil` captured `L` and `start`, which put both in
  a heap context and every read and write of them in the hot loop with it.

One generator-side trim was tried and reverted: a node that can hold no other node writing all four
integers after its body, in one place, instead of reserving its slot first. Parse alone went from
645 to 650 MB/s, inside the run-to-run range, so tape writes are not where the time goes.

**Where that leaves the 15% target.** The stage is 77% of the hand loop (471 against 615), not
within 15%. What separates them is now structural, not tunable: the hand stage reads the source once
and writes the arrays as it goes; the Segno stage parses into a tape (31 ms) and then walks the
tape into the same arrays (about 5 ms of walk plus the 6 ms of allocation both stages pay). The
remaining 15% is the second pass and the arrays materialized from it.

**The wasm question, answered from this measurement: no.** Wasm would speed up the parse, and the
parse is already at the hand loop's speed. It cannot remove the walk or the arrays, which are the
cost. The step that would close the gap is the one the design already names: consumers read the
tape directly ("one tape every consumer reads"), so nothing re-materializes markdown-it's arrays.
That is the pipeline's next stage, not a speed fix.

Second machine (a separate cloud container, Xeon 2.1 GHz, 4 vCPU, Node 22.22.0), same command at
`74149fe`, median of five, the walk from `770e007` against this change:

| Measure | Before | After |
|---|---|---|
| Hand line pass (control) | 683 MB/s | 704 MB/s |
| Segno line pass, parse plus walk | 439 MB/s | 636 MB/s (90% of the hand loop) |
| Segno parse alone, no walk | not measured | 784 MB/s |
| S-staged (Segno stage + predicates) | 97.5 MB/s, 1.23x markdown-it | 110.6 MB/s, 1.34x |

So the target is met on this machine (90%) and missed on the first (77%). On both, the parse alone
is faster than the hand loop (784 against 704 here, 650 against 615 there), which is the measured
reason the rest is the second pass and not the parser.

## P2 landed (2026-11-05)

`deckModel(source)` exists: `@laticent/segno-markdown` (docs/src/lib/segno-markdown, the sibling package D4
chose) holds S0 and S1, and `lib/core/deck-model.mjs` configures it as the engine configures markdown-it.

**What S1 is.** markdown-it 14.1.1's eleven block rules (with `table`), ported rule for rule onto a lean state
that writes a flat tape of seven integers per token (kind, level, nesting, `map[0]`, `map[1]`, flags, one
per-kind number) and computes no `content` strings. It is not a Segno-generated grammar plus a hand driver, as
§The design sketched. The bake-off had already shown the hand-written line pass beats the generated one once
the arrays are materialized (§Tape trimming), and D3's bar is markdown-it's structure exactly; porting its
rules makes the structure match by construction, and the differential below holds it there. A generated line
classifier stays possible behind the same tape. Plugin block rules run unchanged through the plugin state
facade (`lib/plugins/state-facade.mjs`), and each is tried only on the characters its manifest's `triggers`
names (`BLOCK_TRIGGERS`, now generated into `blocks.generated.mjs`): before that, the two plugin rules were
40% of the parse.

**Parity (§Acceptance, CommonMark).** Token for token (type, level, nesting, line map, `hidden`) against
markdown-it as Lattice configures it:

| Input | Files | Differences |
|---|---|---|
| every committed deck (`examples/`, galleries, baseline decks) | 451 decks, 4,301 authored slides | 0, and 0 slide-boundary differences |
| the bake-off corpus (decks and docs) | 1,323 files | 0 |
| a fuzz over CommonMark's rule surface (atoms per rule edge) | 900,000 documents in development; 30,000 per unit run | 0 |
| CommonMark 0.31.2 spec examples | 652 | 0 (block-identical to markdown-it; spec conformance of the HTML is P4's metric) |

The corpus grew from 403 to 451 decks since §Acceptance was written. A mutation run of 20 hand mutants on the
rules killed every one that changes an output (13 of 13); the 5 survivors are equivalent (a check another one
already implies). It also found two atom gaps (two-marker lines like `**`, a `- | -` delimiter row), which the
fuzz now has.

**One dependency left.** A link reference destination holding an entity (`[a]: javascript&colon;x`) decides
between a definition (no token) and a paragraph (which a `---` below makes a heading), so it needs the HTML
entity table. The package takes that decision as a hook (`linkOk`), and the Lattice bridge answers with
markdown-it's own `validateLink(normalizeLink(unescapeAll(dest)))`. Only that path touches markdown-it.

**Speed** (`npm run parser:bakeoff:deck -- --model --runs 5`, 4-core Xeon 2.8 GHz, Node 22.23, median and range):

| Measure | markdown-it block parse | Deck model |
|---|---|---|
| S0-S1, gallery (59 KB) | 2.13 ms (2.13-2.26) | **0.73 ms** (0.71-0.76), 3.0x |
| S0-S1, data-viz (12 KB) | 0.63 ms | 0.23 ms, 2.7x |
| S0-S1, card-tags (3 KB) | 0.15 ms | 0.05 ms, 2.8x |
| the corpus, throughput | 37.5 MB/s | 158.9 MB/s, 4.2x |
| a keystroke in the gallery's middle slide | the whole deck | **42 µs** with the editor's span, 54 µs diffed |

The gallery target as first written (under 0.5 ms) was missed on this machine: 0.73 ms. It was set against the
P0 audit's 3.6 ms for markdown-it's whole parse on another machine; on this one the whole parse is about
5.1 ms, so the model is 7x the whole parse and 3x the block parse it replaces. **The owner restated the target
on 2026-11-05 (D2 on PR #3038) as a ratio: at least 3x markdown-it's block parse on the same machine**, because
an absolute time moves with the machine and a ratio does not. Met at 3.0x (range 2.79-3.11 over five runs).
What is left is structural (one record per markdown-it token, the line index): a leaner tape would buy more,
and the parity test would then have to map it back. The keystroke target (one slide, tens of microseconds) is
met.

**Incremental.** The model keeps its tape slide by slide. `updateDeckModel` re-parses from the break above the
edit and stops at the first break below it that the old parse had at the same shifted line; every other slide's
segment is reused by reference and only moves. Allocating one deck-sized typed array per keystroke cost 32 µs
here, which is why the tape is segmented rather than spliced. An edit in the front matter re-reads the deck. So
does any update where a forward-scanning rule (a manifest with `scansAhead`, today math's `$$`) was TRIED above
the reused tail, in the old parse or the new one: such a rule reads past the break the re-parse starts from,
and math's "no closer ahead" memo carries an answer from one slide into the next. The parser records each line
such a rule is tried on, so this does not depend on a pattern matching the edited lines. The first cut did
use the manifests' `scansAhead` patterns, and the red team broke it twice: a `> $$` in a quote sets the memo
with no line the pattern sees, and a closer with a trailing no-break space is one only `trim()` sees. A deck
with display math therefore re-reads the whole deck for an edit below its first `$$`. Held by a property
(every update equals a full parse of the same text, 2,400 random edits per run per parser, including CRLF and
BOM insertions and spans that lie), its failing arm (the rule not declared as scanning ahead goes red), and
each case the review reproduced, pinned as a regression test.

**The four readers.**

| Reader | Now |
|---|---|
| `lib/core/section-source-split.js` | **moved:** its `hr` lines come from `bodyModel(body).boundaries` instead of a full `md.parse` |
| `lib/core/slide-boundaries.mjs` | **moved:** `parseSlideBoundaries` reads `bodyModel(text).boundaries` and `.leadingEmpty`; every export above it is unchanged. This puts the model in the Studio's startup JavaScript and the lint core, past the route budget (below), which the owner raised for it |
| the Studio deck outline (`deck-outline.ts`) | **moved** with slide-boundaries, which it reads separators through. Its heading sections still tokenize with the boundary parser: `headingSplitPoints` reads inline children, which the model holds from P4 |
| `lib/core/boundary-parser.mjs` | **excluded, by design:** it stays the markdown-it instance for callers that need tokens with inline children (`bake-splits.js`, `slide-class-spans.js`) until P4. The model reads two things from it: the plugins a host switched off, and the entity-destination hook above |

**The route budget, and the owner's call on it.** With slide-boundaries moved, the docs build failed `check-route-budget`: the Studio's
lint core 147.9 KB gzipped against a 139.6 KB ceiling, its eager JavaScript 556.3 against 554.5, and the home
route 286.4 against 281.6. Measured against the same tree with slide-boundaries held (both full docs builds),
the move costs **+8.8 KB** gzipped in the lint core (139.1 to 147.9), **+8.4 KB** in the Studio's eager
JavaScript (547.9 to 556.3) and **+8.3 KB** on the home route (278.1 to 286.4). markdown-it stays in those
bundles (the outline's heading sections and the lint still use it), so nothing offsets the model until P4 lets
the Studio drop markdown-it. Raising a ceiling is the owner's number. Asked with the options (wait for P4, or raise
and move now), the owner chose to raise and move (D1 B on PR #3038, 2026-11-05); the raise landed in its own PR,
each ceiling up by the measured growth rounded to 0.5 KB (docs/route-budget.history.md, 2026-11-05).

Renders do not change: the engine's own split (`splitOnHr`) is untouched, and the moved reader's output is the
same by the parity above. Squadra's M1b and spine S3 can read `lattice-deck` structure from the model now.

## P3 landed: the directive island (2026-11-05)

The first S3 island is in. `lib/core/directive-island.mjs` reads each comment block the model recorded
(`model.directives`, the `html_block`s S1 opened for `<!--`) as an island: its text once, and the directive grammar
(`readDirectiveComment`, lib/core/comment-directive.mjs) over it. `scanMetaSource`
(lib/core/meta-record.mjs) is built on it. That is the reader lint-core's directive views, the class scan and the
editor's "directive above the cursor" (`metaAt`) all go through. The line walk it replaced (`walkComments`, with
its own fence, opener and `-->` regexes) is deleted. So is `parseCommentDirectives` in lib/engine/directives.js, a
`/<!--…-->/g` reader with no production caller; its tests now read through `scanMetaSource`.

**Two texts per island.** `raw` is the comment as the walk quoted it (first line from `<!--`, later lines whole),
so a lint finding quotes the same bytes. `content` is what the grammar reads. It is the engine's text: markdown-it's
token content drops a container's prefix from a block's later lines, so `> <!--` / `> _class: kpi` / `> -->` is a
directive to the engine, and the walk never saw it. The tape does not record where a container prefix ends on each
line, so `unprefixed` re-derives it from the first line's prefix (a quote marker, a list marker's width, or, for a
list item's continuation paragraph, its spaces). The block pass knows the exact offset when it pushes the token
(`blkIndent` and the quote-adjusted `bMarks`), so recording a comment block's content start there would let
`unprefixed` go; that is owed below.

**Folded comments.** The lint has rules whose subject is a comment the engine does NOT read: a record under an
`<img>` line that the HTML block swallows (`meta-in-html-block`), a multi-line record that a blank line in a list
item cuts off (`meta-block-in-container`). The walk listed those because it approximated block structure; the
islands alone dropped them, and four tests in test/unit/authoring/meta-comment-lint.test.js went red. So
`authoredComments` lists them beside the islands, marked `folded`, still from the model: a line-opening `<!--`
inside a range the model calls another HTML block (the new `model.html`) or a plugin block, and a comment block its
container ended before `-->`, extended to its `-->` unless a comment block the engine reads starts first. A folded
comment is listed for the lint and resolves nothing.

**The grammar is not memoized.** A first cut kept each island's answer keyed by its text. The inversion pass measured
190 MB retained after 3,000 keystrokes inside a 30 KB comment; the red team then showed that a SHORT key leaks worse,
because a key sliced from the deck body keeps the whole body alive (528 MB after 3,000 keystrokes in a short note on
a 180 KB deck, against 0.6 MB on `main`). Reading every comment of the gallery costs about 60 µs, so the memo went;
the islands of one model are still kept with that model.

**What the red team broke and this fixes.** One normalization of the source, the one `chunkBoundaryLines` applies,
so a deck with two BOMs no longer splits front matter differently from the boundaries (4 slides against 2, and a lost
`unknown-class` finding). A BOM just after the front matter stays text, as the engine reads it, so the comment under
it is a paragraph. A front-matter closer with text after it (`--- <!-- _class: k -->`) counts lines from its last
`\n`, and a comment on that line belongs to the first slide, as the engine applies it. A quote continued by a `>`
indented four spaces or a tab is still the quote. An exhaustive sweep of 1,274 first, middle and last line container
shapes now has 0 disagreements with the engine.

**What is still approximate.** A multi-line directive VALUE can keep different inner whitespace from the engine's
token content where tabs or a list's continuation indent are involved (`- <!-- _class: a` / `\tb -->` reads `a\n\tb`
where the engine reads `a\n  b`). The key is right in every case found. Comment content from S1, owed below, is the
exact fix.

**Held to.**

| Measure | Result |
|---|---|
| `scanMetaSource` on every tracked `.md` (decks, docs, notes) | 4,306 files, 0 differences from `main` |
| `lintText` on every deck and component doc | 553 files, 0 differences from `main` |
| `npm run identity:check -- --strict` (every shipped deck through the engine of both trees) | 447 decks, 0 differ; lint 31 = 31; 39 stylesheets, 0 differ |
| the engine differential: per slide, the directives `scanMetaSource` reads against `readDirectiveComment` on markdown-it's `html_block`s, over atoms for fences, indented code, HTML blocks, quotes, list items, unclosed comments and breaks | 300,000 random decks in development, 20,000 per unit run: **0** disagreements. The walk this replaced disagreed on 2,825 per 100,000 |

The corpus has none of the shapes the walk got wrong, which is why lint output there did not move. The fuzz finds
them in under 3% of random decks.

**Speed** (`scanMetaSource`, a new string every call as typing produces, median of 7 x 40, three runs, this
machine): **even with `main`**. The gallery was 1.21, 1.23 and 1.31 ms on `main` against 1.27, 1.20 and 1.38 ms here;
data-viz 0.34 to 0.37 ms on both. The comments and the boundaries come from one parse (`slideBoundaryModel` reads
the model from the memo `slideBoundaries` keeps), and each of the model's range lists is now built on its own
first read: the four together had cost 0.44 ms on the gallery. The folded-comment pass spends what the shared
parse saved.

**The lint core's bytes.** The first push failed `check-route-budget`: the Studio's lint core measured 149.0 KB
gzipped against its 148.6 KB ceiling. Raising a ceiling is the owner's number, so the bytes came back instead. The
island was written smaller (one span builder for islands and folded comments, and a forward line scan bounded by the
next island in place of a `-->` search memo and a binary search). The scan the linter reads moved to its own module,
lib/core/meta-scan.mjs (`scanMetaSource`, `directiveKey`, and a `hasMarker` that reads the model), which meta-record
re-exports. lint-core `require`s a whole module namespace, so while it read meta-record, the bundle carried the
editing helpers the Studio uses (`comments`, `fenceRanges`). Measured on the built `esm/lint.js` closure: 149.5 KB
before, 148.8 KB after, against 148.6 KB for `main`'s scan on the same build, with lint output identical on the corpus.

**Two P2 defects the island found, fixed here.**

- **A token's per-kind number was lost when its push grew the tape.** `state.tape[state.pushK(…) * STRIDE + T_AUX] = x`
  reads `state.tape` before `pushK` runs. When the push grows the shared scratch tape, the write lands in the old
  array. Ten sites did this: a comment block's mark, a fence's marker length, an `hr` marker, a heading's level, a
  table cell's alignment and column. It hit one token per growth, so the corpus parity passed and a 10,050-item
  list of comments did not (10,048 of 10,050 comment blocks). Every site now calls `pushAux`, which writes after
  the push.
- **A run of unclosed comments was quadratic.** Each comment block searched for `-->` from its own opener to the end
  of the source, so 20,000 list items each holding `<!-- open` took 5.3 s (markdown-it: 43 ms). The parse now
  keeps its last `-->` search and reuses it while it still answers: 54 ms for the whole scan. Both are pinned in
  docs/src/lib/segno-markdown/deck.test.ts and test/unit/core/directive-island.test.js.

**Also fixed on the way.** `tools/render-identity.mjs` found the workspace libraries to build with
`/^build-[a-z]+-lib\.js$/`, which misses `build-segno-markdown-lib.js`, so since P2 it failed on every tree
before rendering anything. The pattern now admits a hyphen.

`metaAt` (the editor's completion) is slower: it parses the text above the cursor, a string no memo holds, and now
reads its comments from that model. The inversion pass measured 1.61 to 1.98 ms with the cursor at the gallery's
end, and 0.54 to 0.65 ms mid-deck, once per completion request.

**What P3 still owes**, each recorded in followups.d/:

- **`comments()` and its callers.** lib/core/meta-record.mjs `comments(chunk)` still finds `<!--` by `indexOf`
  outside a fence, and the Studio's class editor (docs/src/lib/slide-directives.ts `getClassTokens` /
  `setClassTokens`), lib/core/meta-edit.mjs and `hasMarker` read through it. So on the shapes this phase fixed
  (`<div>` / `<!-- _class: kpi -->` / `</div>`) the class editor shows `kpi` while the lint and completion say no
  class: before, all three agreed, wrongly.
- **Comment content from S1.** Record each comment block's content start when the block pass pushes it, and
  delete `unprefixed`.

- **The front matter, through the register grammar.** `parseFrontMatter` keeps its regex. Moving the engine's
  split onto the model's S0 text changes what a deck that opens with a BOM renders (S0 strips the BOM, so its front
  matter becomes front matter), which is an export-bytes change for the owner to sign off.
- **Fence records and `mermaid-fences.js`.** The Mermaid matcher deliberately finds a fence inside an HTML block,
  which no `fence` token covers, and what it finds is what the export bakes. Moving it is an export-bytes change
  too.
- **lint-core's own comment scans.** About 17 sites in lib/authoring/lint-core.js still find `<!--` by regex or
  `indexOf`, each for its own rule (comment blanking, the track scan, the record checks). They move one at a time,
  each held to lint output on the corpus.
