---
status: proposed
summary: >
  Segno should report facts and tagged spans, and callers should decide what they mean. It gets two
  general facilities: limits and input anomalies (what the parse capped, skipped or found odd) and
  per-kind roles on the tape (a grammar labels a node as a reference, a directive, a language island;
  zero tape cost). A dialect package owns the reference model (what is fetched, and when it fires:
  on render, on a click, on a submit). The web-reference scanner then shrinks to a policy table over
  that model. Segno never judges "is this a beacon". Reader and browser must agree, so the seeded
  fuzz becomes the reader's acceptance gate. Open for the owner: the A/B call on ping/action now,
  where role vocabulary lives, and fail-closed on "the reader is unsure".
---

# Segno reports facts; callers decide (the scanner question, answered at the root)

**Answer.** The refusal policy does not belong in Segno, and it should not stay a private scan in
`lib/core/remote-ref.js` either. Segno reads text and says what it found and where. A dialect
reader (CSS, HTML) turns that into a **reference model**: every address in the input, what kind it
is, and when the browser uses it. The policy ("refuse a web address that loads on render or fires
on a click") is then a short table over that model, in one place, and the same model answers the
gallery gate, the export, the linter and the narrator without any of them rescanning the text.

## Why this note exists

The 2026-10-26 fuzz of the web-reference scanners asked a narrow question and exposed a structural one.

- **The narrow question.** `blockWebImages` leaves a web `ping`, `action` and `formaction` alone,
  because they fire on a click or a submit and not on render (`RENDER_FETCH_ATTRS`). Run alone it
  leaks 77 of 3,000 `--wide` inputs. The Reading view and the preview frame hold (0 requests in 24,000
  inputs across three engines), because the sanitizer or the content-security policy stops them.
  Whether the scanner should refuse them was put to the owner as A (refuse) or B (leave).
- **The structural question.** The owner's reply: Segno is a general parser, so why is a scanner
  deciding this at all, and should the parser flag security concerns with specifics a caller can
  act on, so no caller rescans? That is the better question, and this note answers it.

Facts that frame it (all measured or read from the tree, not estimated):

- `lib/core/remote-ref.js` does not use Segno (0 references). It is hand-written scanners plus a
  fallback to the platform parser (`verifyWithParser`), and a `risky` flag that means "I cannot be sure here".
- The first version had 30 known payloads and still missed eight spellings that the seeded fuzz
  found; the extended fuzz found `<picture>`, `xml:base` and the click-time class later. Every
  one was a place where a hand scanner **disagreed with the browser about what the text means**,
  not a place where it failed to find a span.
- The deck-pipeline note already plans the shape this needs: S3 islands (`(ranges, language, entry
  rule)`), a CSS tokenizer as P5 with `cssRefSpans` as "its first reader", and one tape every consumer reads.

## The axes

1. **Where policy knowledge lives**: in the parser, in a dialect reader, or in the caller.
2. **What the parser hands back**: a verdict, facts, or only a tree.
3. **How many readings of one text exist**: one shared, or one per consumer.
4. **Who is right when reader and browser disagree**: the browser, always, so the design needs a
   measured way to know.

## Candidate moves

| Move | What it is | Verdict |
|---|---|---|
| **M0. Status quo** | Each caller runs its own scan; the scanner stays hand-written. | Rejected. It is how the eight misses happened, and each new consumer adds another reading. |
| **M1. Segno judges** | The parser returns "findings": beacon, injection, unsafe link. | Rejected. Segno would have to know HTML, CSS and browser behavior. Its promise is a compile-time linear parse of any grammar; a verdict table inside it rots as browsers change and breaks the "general" claim. |
| **M2. Segno reports facts and roles** | Generic facilities only: limits hit, anomalies in the input, and a role label per node kind. Callers interpret. | **Recommended for the core.** Cheap, general, zero tape cost. |
| **M3. A dialect reader owns the reference model** | A CSS island and an HTML island (S3) emit refs with a kind and a `when`. The policy is a table over them. | **Recommended for the web case.** This is what removes the rescans. |
| **M4. Run the platform parser everywhere** | Parse every input with DOMParser/parse5 and read its tree. | Rejected as the only path: it is the browser's own reading, but it is slow on the keystroke path, absent in some hosts, and it drops source offsets the editor needs. Kept as the **oracle in CI** and the runtime fallback for spans the reader flags unsure. |

## The design

### 1. Segno core: limits and anomalies (general, no semantics)

Every parse can carry a small `facts` record next to the tree. Nothing in it names a browser or a URL.

- **limits**: which runtime cap the parse hit (`depth`, a stack overrun, `tape size`) and where. Today the
  depth cap is a parse error and a stack overrun has its own code (`stack`); the attempt window and `until`
  limits are fixed when the grammar is built and so need no report. The tape has no node cap
  today: one hostile 3M-character flowchart row held 67 MB before the reset in `parse()` (phase 3b's
  red team). A `maxNodes` option closes that and reports it the same way. This is the one place the core has a real gap.
- **anomalies**: characters the input contains that readers should not take as ordinary text, found
  once at S0 ingest (which already strips the BOM and folds line endings), as typed spans:
  `nul`, `lone-surrogate`, `bidi-control` (U+202A-202E, U+2066-2069, the "Trojan Source" class),
  `zero-width`, `c1-control`, `cr-without-lf`, `bom`. One pass, no per-grammar cost.
- **coverage**: ranges no rule read. For a lossless editor this is already needed; for security it
  answers "was something left unread that a later stage will interpret?".

These are facts, so they stay true as browsers change, and every dialect gets them for free.

### 2. Roles on the tape: labels, not judgments

A grammar may label a node **kind** with an opaque string role, in the same place it names the
kind: `node('url', x, { role: 'ref' })`. The generated parser already keeps a `KINDS` table that
maps a kind number to its name; a parallel `ROLES` table maps it to the role. The tape stays four
integers a node, so there is **no per-node cost and no second pass over the text**: finding every
reference is one linear walk over the tape, filtering by role.

Rules that keep this from going janky:

- Roles are **opaque to Segno**. The vocabulary belongs to the dialect package that declares the
  grammar, and its tests, not to the core. Segno only guarantees the label survives the parse and
  that `consistency()` flags a role no rule can produce.
- A role-bearing node must have a **decoder** in its dialect (the value after entities and escapes),
  and `lint()` checks the pair. Callers never decode a span themselves, because that is where
  scanners went wrong (`&#58;`, `\31 27`, tabs the URL parser removes).
- The generated parsers stay byte-identical except for the added table; the 20k-span parity fuzz and
  the metamorphic suites gate it (HARD RULE #19 applies if a speed claim is made).

### 3. The reference model (dialect level, not core)

For CSS and HTML islands the dialect emits **refs**:

```
ref { kind, when, value, span, context }
  kind     fetch | navigate | base | policy
  when     render | interaction | submit | hint | never
  value    the decoded address (after entities, escapes, the URL parser's stripped characters)
  span     UTF-16 offsets in the original text
  context  the element/at-rule and attribute, and whether it sits in foreign content, a template, a comment
```

Examples: `<img src>` is `fetch/render`; `<a ping>` is `fetch/interaction`; `<form action>` is
`fetch/submit`; `<link rel=preconnect>` is `fetch/hint` (a connection with no request);
`<a href>` is `navigate/interaction`; `<base href>` is `base` (it changes the meaning of every other
relative address, so it is a fact about the others and not only a fetch); a refresh `<meta>` is
`navigate/render`.

### 4. Policy is a table

`lib/core/remote-ref.js` keeps the decision and loses the scanning:

| kind / when | Web address | Same origin or `data:` |
|---|---|---|
| fetch / render | refuse | allow |
| fetch / interaction, submit | refuse | allow |
| fetch / hint | refuse | allow |
| navigate / interaction | allow (a visible link the reader chooses to follow) | allow |
| navigate / render (refresh) | refuse | allow |
| base | refuse a web base, and re-resolve every relative ref against it | allow |

The `ping`/`action` question becomes one row. **Recommendation on A/B: A, and do it now in the
current scanner as that row,** because the table is the end state and the row is where the
decision lives either way. It changes exported bytes only for a deck that carries a web `ping`,
`action` or `formaction`, which needs the owner's export sign-off (dark and light before/after)
before merge.

### 5. Reader and browser must agree, and we measure it

The risk is the one that made the hand scanners fail: a reader that disagrees with the browser about
what the text means. Two controls, both already half-built:

- **Soundness invariant.** For every input, the set of requests the browser makes is a subset of
  the reader's refs with `when` ≠ `never` (resolved against the reader's bases). Over-reporting is
  allowed; under-reporting is a defect. The seeded fuzz (`npm run fuzz:web-refs`, including `--wide`) already
  measures exactly this against three engines. It becomes the reader's acceptance gate, run per
  engine, and the failing arm (an older reader, `--ref`) must still fail.
- **Honest uncertainty.** Where the text is only decidable by tree construction (foreign content,
  templates, `<select>`, an unterminated comment), the reader emits an `unsure` span, replacing the
  scanner's private `risky` flag. Policy fails **closed**: an unsure span with a web-looking address
  is refused, or the input is handed to the platform parser (M4) and that answer used. The reader
  never guesses quietly.

## Scalability and what keeps it from being janky

- **One reading.** CSS and HTML each get one tokenizer on the spine (the pipeline note's P5 and S3), memoized by range and text. The gallery gate, the Studio export, the linter, the narrator and Compose read the same refs.
- **No cost where it is not used.** Roles are a table beside `KINDS`; limits and anomalies are computed at S0 once. A grammar with no roles pays nothing.
- **Incremental.** An island is `(ranges, language, entry rule)`, so an edit re-reads one island and its refs.
- **New concern, one row.** A new fetch class (a new attribute, `<picture>`, `xml:base`) is a grammar edit and a policy row, found by the fuzz, not a new scanner in each consumer.
- **The vocabulary is closed and versioned in the dialect package**, so a role added later cannot silently change what an older consumer allows: the policy table lists every `kind/when` pair and a test fails on a pair with no row.

## What Segno should watch for (the list the owner asked for)

In the core (general): time and space bounds (the compile-time linear promise, caps, the missing node cap); offset integrity (UTF-16 units, lone surrogates); input anomalies (bidi controls, NUL, C1, zero-width, mixed line endings); partial or ambiguous parses (trailing input, unread ranges, a branch that could match two ways, which the LL(1) check already refuses at compile time).

In dialect readers (not the core): references and when they fire; `javascript:`, `data:` and `vbscript:` schemes in link destinations and autolinks; `<base>`, `srcdoc`, refresh, SVG `use`/`feImage`, MathML links, `xml:base`; CSS `url()`, `image-set()`, `@import`, `@font-face`; raw HTML inside Markdown; directive injection through HTML comments; fence info strings.

At sinks (neither): re-emitting a parsed span into HTML or CSS is HARD RULE #22's job (`sanitizeSlideHtml`, `sanitizeStyleText`). A parser that reports a span as safe is not a license to skip the sink guard.

## Phasing

Each phase is shippable alone, reversible by a revert, and leaves the tree no worse (HARD RULE #18).

| Phase | What | Evidence it owes |
|---|---|---|
| **R0** | Policy table inside `remote-ref.js`, including the `ping`/`action`/`formaction` rows (A). No new reader. | Export before/after (dark and light) for sign-off; `--wide` plain run drops to 0; fuzz default stream unchanged. |
| **R1** (shipped 2026-10-29) | Segno core: `facts` (limits with `maxNodes`, anomalies, coverage) and the `ROLES` table. | Codegen differential (old vs new on the corpus); the 466-test suite; `mutate:segno` gains mutants for roles and the node cap; bake-off no-regress on the three Segno benches. See "R1 landed" below. |
| **R2** | CSS island with `ref` roles, replacing `cssRefSpans`. | Rewrite and `blocked` lists byte-identical on the 433 decks; fuzz 0 requests in three engines; the failing arm still fails. |
| **R3** (shipped 2026-11-02) | HTML island: the WHATWG tokenizer states in a generated grammar, with tree-construction effects as `unsure` spans. | Soundness invariant on 100,000 inputs per engine; platform-parser differential on the corpus; `unsure` rate reported (a high rate means the island is not yet useful). |
| **R4** (the listed consumers shipped 2026-11-03: gallery gate, Studio export, narrator and the CLI export) | Consumers migrate one at a time (gallery gate, export, linter, narrator, and the CLI's HTML export, found later); each deletes its scanner. | Census count of private ref readers goes down; each migration its own PR. See "R4: the gallery gate", "R4: the export", "R4: the narrator, and the linter" and "R4: the CLI export" below. The linter had no reader to migrate. Every listed consumer is moved; the CLI export's review found readers outside the list, recorded there. |

Cost is an estimate, not a measurement: R0 and R1 are small (days); R2 follows the pipeline's P5; R3 is the real work (the
tokenizer is about 80 states; tree construction is deliberately out of scope behind `unsure`). Nothing in R0-R2 depends on R3.

### R1 landed

- **The node cap** is `maxNodes` on the grammar spec. Both runtimes stop at the same node with
  `code: 'nodes'`. It counts the peak: an attempt's nodes count while it runs, and a failed
  attempt gives them back (the independent checker found the earlier wording promised more). The generated parser pays nothing
  per node: its node case already compared the tape position with `buf.length` before each write,
  and a capped grammar compares it with `cap` (the smaller of the buffer and the cap) instead.
- **Byte identity.** A grammar that sets no cap and no role generates exactly the parser it did
  before: `node tools/build-segno-grammar.js --check` passes on all four shipped parsers (the
  notation, its plain subset, the flowchart row, the list text) with the new generator, and a test
  pins it. So the three Segno benches run unchanged code and cannot regress.
- **Roles** are a `ROLES` table beside `KINDS`, emitted only when a grammar names one.
- **Facts** are a separate call, `facts(spec, input, result)`, not a field on every result: the
  notation parses a span in about 130 ns, and most callers never ask. Anomalies take one native
  regex test on clean input and one pass otherwise. They are listed up to 1,000 runs and counted
  over the whole input, so a hostile string cannot make the report itself unbounded.
- **Not done here:** no shipped grammar sets `maxNodes` yet. The flowchart row grammar matches
  every string and `splitRow` treats a refusal as a defect, so capping it means giving `splitRow` a
  refusal path (a diagnostic) first; the reset in `parse()` already lets the big tape go after the
  parse. That is the caller's decision under this note's own rule, and it belongs with R4.

- **Update, 2026-10-29: the flowchart row now sets `maxNodes`** (65,536; the longest of 882 corpus
  rows holds 27 nodes). `splitRow` answers a `code: 'nodes'` refusal with `tooLong: true`, and
  `parseFlowchart` reports `flowchart-row-too-long` and leaves the row and its children out. The cap
  sits above the existing 6,000-step chain contract (18,000 nodes, 24,000 with labels), and `splitRow` sums the nodes of a row's runs so code spans cannot split a row under the cap. A 3,000,000-character row
  of escapes is refused by test.

### R2: what stands between the scanner and a CSS island (2026-10-29)

R2 was scoped and not started in the session that shipped R1. Two facts about CSS and one about Segno
make it a design step of its own, not a port:

- **The unquoted `url(` token is context-sensitive.** After a name that decodes to `url` and a `(`,
  CSS reads everything up to `)` as one token: quotes, `/*` and `{` lose their meaning. A
  character-level LL(1) grammar can only take that branch if the name's spelling decides it, and
  the name can be spelled with escapes (`u\72l(`, `\55 RL(`, `\000075rl(`, `\u\r\l(`). So the
  grammar has to factor every escaped spelling of `u`, `r` and `l` against ordinary names and
  ordinary escapes, character by character, including the optional whitespace a hex escape eats.
  `cssRefSpans` makes the same decision after decoding the name, which no grammar can.
- **The block stack is state, not syntax.** `@font-face` (only at a rule start, only with its block
  next) and `[…]` (an attribute selector never fetches) are decided by the open blocks, and a closer
  that does not match the innermost block is an ordinary token. That half belongs in the reader
  over the tape, which is the design's intent, and it is small.
- **Segno parses whole inputs.** An island is `(ranges, language, entry rule)`, but `parse(input,
  rule)` has no start offset, so the reader cannot hand the url body to a second rule mid-stream.
  Either the url token is factored into the one grammar (above), or Segno grows a
  `parse(input, rule, from)` entry, which is an engine change with its own differential.

Recommended next step: add the offset entry (it also serves S3 islands), write the CSS tokenizer as
a grammar whose `url-name` branch covers the escaped spellings, and gate it on the R2 evidence in the
table above. Measured cost is unknown; the note's "follows the pipeline's P5" estimate stands.

### R2 landed (2026-10-29)

`cssRefSpans` reads CSS through a generated parser and is held to the old tokenizer by every test below.
It was built unwired first, because the parser's bytes crossed a route-budget ceiling; the owner answered
D1 A on #2980 (raise the Studio ceiling by about 2.5 KB and switch now), and the switch is done.

- **What is built.** `lib/core/css-ref-grammar.js` is a Segno grammar; `tools/build-segno-grammar.js`
  generates `lib/core/css-ref.generated.js`; `lib/core/css-ref-reader.js` (`makeCssRefSpans`) walks its tape
  and keeps the block stack (`@font-face`, `[…]`, mismatched closers) as reader state, as the design said.
  The old tokenizer is frozen in `tools/segno-legacy/css-ref-spans.js` as the oracle.
- **The cost, and the owner's answer.** `remote-ref.js` requires the generated parser, which adds 2,690
  gzip bytes to the module in a browser bundle (9,677 to 12,367; the parser alone is 2,616). That put
  the Studio's `eagerJsGz` at 548.6 KB against a ceiling of 546.6 KB. The ledger says raising a ceiling is
  the owner's decision, so the first version held the switch; the owner chose to raise it. Only the
  Studio's eagerJsGz ceiling moved, 559,719 to 562,200 bytes (a hand edit with its history entry, because
  `route-budget:rebaseline --raise --ceiling` resets every route that is over its soft target and moved
  other routes' ceilings by up to 76 KB). No soft target moved. The swap is
  `const cssRefSpans = require('./css-ref-reader.js').makeCssRefSpans(require('./css-ref.generated.js'), { cssEscape, cssString });`;
  the docs-site dev shim and the code-door sanitizer page both inline the two siblings (checked).
- **How the unquoted `url(` is handled.** The note's two options were a factored grammar or an offset
  entry. The grammar does both, each for the half it fits. `urlName` spells every form of `u`, `r`,
  `l` (`u`, `\u`, `\75 `, `\000075`, either case, the whitespace a hex escape eats) inside one
  bounded attempt of 32 characters; the node it keeps (`url`) is a STOP kind. The parse ends there, and
  `urlBody` is parsed from the end of the stop with `parse(input, rule, from)`. That is two parses per
  `url(` plus one, each reading its own stretch, so the cost stays linear.
- **Segno gained `stops` and the `from` entry**, in both runtimes (`stops.test.ts`, 14 cases) and
  `mutate:segno` (52 of 52 mutants killed in the grammar and codegen run, 12 of them new). A stop does not unwind: the first version threw to end the parse and cost 1,579 ms on
  150,000 `url(a)` (900 KB), against 40 ms for the old tokenizer; cutting the input window at the stop
  instead (`n = i`, so every loop and optional after it sees the end) measured 40 ms in the same loop.
  The independent review found the cut was incomplete for a multi-character literal and for `until`
  (the runtimes disagreed on `end`); both now respect the cut, with tests. A grammar that names no stops
  generates byte-identical parsers: `build-segno-grammar --check` passes on all five.
- **Differential.** `test/unit/core/css-ref-spans-differential.test.js` compares the reader with the frozen
  tokenizer, field for field: 50 picked spellings, every CSS file and `<style>` body under `lib`,
  `themes`, `examples` and the baseline decks, and 60,000 seeded token soups. The failing arm runs the
  real generated parser with its `url(` window cut from 32 characters to 5 and requires a difference.
  The independent red team ran about 90 million further comparisons (every zero-padded, cased,
  whitespace-terminated spelling of `url`; exhaustive small alphabets; a mutation at every position of
  hostile seeds): no difference and no throw.
- **Corpus.** `npm run check:css-ref-spans`: 430 decks, 191 CSS files, 198 CSS texts, 4 blocked
  addresses; `blockWebCss` and `webRefsInCss` return the same bytes as at 242de4a, with no origin
  allowed and with one allowed; spans equal. The corpus holds few `url(` addresses, so the fuzz is the
  stronger arm.
- **Fuzz.** `npm run fuzz:web-refs -- --seed 11 --count 4000` on the wired tree: see the PR body. On the first grammar: Chromium 131, WebKit 26.0 and Firefox
  142.0.1, 4,000 inputs each, 0 requests after the rewrite (630 to 650 of 4,000 fetch as written).
  The same fuzz on a scanner whose `url(` window is cut to 5 characters leaks on the escaped spellings.
- **Cost on hostile input.** The first version kept a tape node for every `;`, so 5 MB of `;` held 235 MB
  of ArrayBuffer for good. `;` needs no node (`@font-face` is only armed when the next significant
  character is `{`), and `cssRefSpans` now parses an empty string on exit, which releases a large tape.
  Speed on the repo's 3.1 MB of CSS is within about 15% of the old tokenizer; dense `{` and `url(` input
  is 2 to 3 times slower and 16 bytes of tape per kept token. A reader cannot throw on input except by
  failing to allocate that tape.
- **Not done:** R3 (the HTML island) and R4 (each consumer deletes its scanner) stay open, as D8 says.

### R3 landed (2026-11-02)

`scanHtml` reads markup through a generated parser, held to the hand-written scanner it replaced by every
test below, and to a spec parser by a differential the scanner never had. The work found six ways a web
address got past the sanitizer, all older than R3; the hand-written scanner got all six fixes first, and R3
is held to that fixed scanner. It was built on 2026-10-30 and held unwired for two days because the parser
crossed the Studio's route-budget ceiling (D9); the owner's 5 KB raise in #3001 (for #2997) left room for it,
so it is switched on with no ceiling moved, which the owner confirmed (D9 A).

- **What is built.** `lib/core/html-ref-grammar.js` is a Segno grammar for the WHATWG tokenizer's data
  state: tags, attributes, comments (the dash-counting states of §13.2.5.43-52, written as a regular
  grammar), bogus comments, doctypes and `</>`. `tools/build-segno-grammar.js` generates
  `lib/core/html-ref.generated.js`; `lib/core/html-ref-reader.js` (`makeScanHtml`) walks its tape and
  returns the tags `scanHtml` returns. The scanner as it was at e6c3a4a is frozen in
  `tools/segno-legacy/scan-html.js`.
- **The open question, answered.** The note left open how tree-construction facts belong in a generated
  grammar. They do not: the grammar stops wherever what follows depends on state it does not own, the
  same mechanism R2 used for `url(`. Four stop kinds: `rtn` (the name of a raw-text start tag, whose
  content the reader ends with an end-tag search), `copen` and `cend` (a comment, read by its own rule),
  and `cdo` (`<![CDATA[`, a CDATA section or a bogus comment by the reader's foreign-content stack). The
  rules a stop hands over end on stops of their own (`rgt`, `cdx`, `bog`). The foreign-content stack, and
  the integration points open inside each foreign element, stay in the reader, as the block stack did in R2.
  One trap: the generated parser's tape is module state, so a sub-parse overwrites the tape the reader is
  walking. The first version read two offsets after a sub-parse and silently stopped scanning after
  `<svg><title><![CDATA[x]]>` (the inversion review found it); every branch now reads its offsets first.
- **`unsure` replaces `risky`.** The reader returns `unsure`, spans with a reason (`comment-unterminated`,
  `foreign-content`, `foreign-breakout`, `integration-point`, `select`, `noscript`, `escaped-script`,
  `foreign-cdata`), declared in the island's package (D6). Switched on, `blockWebImages` fails closed on any
  of them by asking the spec parser (D7), as it does on `risky`.
- **The switch.** `remote-ref.js` builds `scanHtml` from the reader over the generated parser, returning
  `{ tags, risky, unsure }` (`risky` is whether any span is unsure), so `blockWebImages` reads it unchanged.
  The hand-written scanner is frozen in `tools/segno-legacy/scan-html-fixed.js` as the oracle. Before the
  switch, every gate below ran on a copy with the switch applied, so the evidence is for this code. The
  docs-site dev shim and the code-door sanitizer page inline require-free siblings already (both new files
  are require-free).
- **What the work found, fixed in the hand-written scanner before the switch, each with a test.** Each fetched in Chromium
  131 as written, and the sanitizer passed it:
  1. A CDATA section inside an integration point: Chromium (131), WebKit (26.0) and parse5 read `<![CDATA[`
     there as a bogus comment that ends at its first `>`, so `<math><mi><![CDATA[<picture><source srcset=…>]]>`
     builds a live `<source>`. Firefox (142) reads a CDATA section, as the standard's text says. Found by
     the parse5 differential.
  2. The same section with no `]]>`: the scanner stopped reading at it (the checker found it).
  3. `</svg>` or `</math>` inside an integration point: `desc` and `mi` are special to the HTML rules that
     run there, so the end tag is ignored and the content stays foreign, and
     `<svg><desc><x></svg></x></desc><style><img src=…>` has markup, not raw text, in its `<style>` (the
     red team found it).
  4. A start tag inside an integration point is HTML: `<svg><desc><title><!--</title><img src=…>-->` has a
     `<title>` of text and a live `<img>` (the inversion review found it, live in all three engines).
  5. Comments were quadratic: 400 KB of `<!-- x -->` took 29 s (the `--!>` search ran to the end once per
     comment). The scanner now remembers its last search: 9 ms.
  6. A stray `<body>` (or `<html>`) start tag gives its attributes to the page's own body, and the spec
     parser's check (`verifyWithParser`) visited only the body's descendants, so on risky markup
     `<select></select><table><td><table><BODY background=…>` went out unchanged and fetched in all three
     engines (the browser fuzz found it, input fb-43615 of seed 11; it fetches at e6c3a4a too). The check
     now refuses those attributes and re-serializes, which drops them.
  The scanner does not track the current node, so 1 to 4 set `risky` where the readings can part (the
  spec parser decides): a `>` before the `]]>` or no `]]>`; a `</svg>` or `</math>` while an integration
  point is open; any start tag inside one. Lattice's own chart SVG has a `<title>` and a `<desc>` with
  text only, so none of these touch a deck: 0 of 860 corpus texts are newly risky.
- **Differential.** `test/unit/core/html-ref-differential.test.js` holds R3 to the fixed hand-written
  scanner with nothing left out (the same tags field for field, `unsure` exactly where `risky` is). It also
  holds the fixed scanner to the e6c3a4a one: the same tags, `risky` never dropped (where the earlier scanner
  gave up at an unterminated CDATA section, its tags are where the fixed ones start). Inputs: 117 picked, one per state the readers depend on; every markdown, HTML and SVG
  file under `lib`, `themes`, `examples`, the baseline decks and the test fixtures; 60,000 seeded token
  soups and 30,000 seeded foreign-content structures (`test/fixtures/html-ref-soups.js`). Two arms must
  fail and do: a parser generated from a grammar whose comment ends at `--!`, and the reader's own source
  with its foreign stack cut out (caught on more than a quarter of 2,000 structures).
- **Corpus.** `npm run check:html-ref-spans`: 430 decks, 860 texts (each as written and as rendered).
  `blockWebImages` from the working tree and from e6c3a4a return the same bytes with no origin allowed and
  with one, `fonts` off and on, with no spec parser and with jsdom's: 0 differences, 0 texts newly risky.
- **Platform-parser differential.** The same tool parses every text with parse5 (a WHATWG tree builder,
  scripting on) and requires every element it builds to be the reader's tag at the same source offset, with
  the same attributes: 195,641 elements on the corpus, 0 missed. `--fuzz N --seed S` runs it on N inputs
  of each of three streams; see the PR body for the run at 100,000 per stream.
- **The `unsure` rate.** 0 of 860 corpus texts. On the hostile streams it is high on purpose, since they
  are built from the constructs that raise it: see the PR body, by stream and by reason. No deck asks the
  spec parser.
- **Cost.** On the 443 rendered decks (13.6 MB) the reader takes 183 ms against the old scanner's 144 ms
  (median of five). Both are linear on hostile input now (the unit test times both on ten floods).
- **Bytes.** Measured with `docs/scripts/measure-route-base.sh` against main and the branch's docs build:
  `_astro/remote-ref.js` grows by 2,701 gzip bytes on studio, playground and home as CI measures it (2,495 locally; the parser is 3,172 bytes
  minified and gzipped; the reader 1,810 against the old scanner's 1,374), declared in
  `docs/route-budget.d/3002-segno-html-island.md`. Studio eagerJsGz measures 551.6 KB in CI against the
  554.5 KB (567,832-byte) ceiling. Playground and home stay under theirs.
- **Browser fuzz.** `npm run fuzz:web-refs -- --seed 11` in Chromium 131, WebKit 26.0 and Firefox 142, run in
  resumable 3,000-input chunks (`--from`/`--count`), on the shipped scanner (`lib/` identical from 9498c3a to
  513d0ef): 100,000 inputs per engine, 0 leaks, 0 unattributed requests, 0 hung inputs, 0 scanner errors;
  17,125 (Chromium), 16,373 (WebKit) and 16,648 (Firefox) of them fetch as written. An earlier run, on the code
  before the stray-`<body>` fix, found that leak (fb-43615, closed and replayed clean in all three). The failing arm, `--ref 3780dc9` (the
  scanner before #2909's fuzz fixes), leaked 142 times in 2,400 inputs.
- **Not done:** R4. Each consumer (gallery gate, export, linter, narrator) still keeps its own scan.

### R4: the gallery gate (2026-11-03)

The package gallery gate was the first consumer to move. Both halves, `lib/cli/gallery-gate.js` and the Studio's
`library/gallery-gate.ts`, rendered a gallery and then parsed the result with a spec parser of their own (parse5 in
the CLI, `DOMParser` in the Studio) to walk every element. Both now hand the rendered markup to `remote-ref.js`
`remoteRefsInHtml`, and the two element walkers are deleted. The census of private reference readers goes from four
consumers to three: export, linter and narrator.

- **What `remoteRefsInHtml` does.** It reads the markup with `scanHtml` and turns each tag into the element
  `remoteRefsInElements` already judged: names lowercased, attribute values decoded once with a NUL read as U+FFFD
  (as the tokenizer does), and `text` the body of a raw-text element (as written, or decoded for `<title>` and
  `<textarea>`).
- **`unsure` is a refusal (D7).** Each reason becomes one `policy:` finding that names where its first span starts
  (`foreign-content, at character 9`), so the gate asks no parser and needs none. This is the "refused" half of D7,
  not the "ask the platform parser" half. It costs real packages something: a sample slide with an inline SVG that
  carries a `<style>` (the usual output of a design tool's SVG export), a `<foreignObject>`, a `<select>` or a
  `<noscript>` is now refused, where parse5 admitted it. No shipped gallery has one. If a third-party package needs
  one, the answer is the other half of D7 (ask a spec parser on the unsure spans), not a looser reader.
- **A diagram's text is read exactly or refused.** The runtime draws an element whose class names Mermaid from its
  text content, which is not a raw-text body. Only a `<code>`, `<pre>` or `<div>` may carry the class (any other
  element gets its own finding), and `diagramText` reads its text only where the reader can know it: text and
  balanced `<span>`s up to its own end tag, which is what a fence renders (highlight.js spans). Anything else is a
  `policy:` finding, so an HTML `<div class="mermaid">` with a `<br>` in a label is refused. In that text a NUL is
  dropped (the tree builder never inserts one in body) and a legacy reference with no `;` decodes before a letter
  (`&ltimg` is `<img` in text). Both were found by the red team on this PR: the first admitted
  `img\0:` (latent, since markdown-it turns NUL into U+FFFD first), the second admitted `&ltimg` end to end from a
  `gallery.md`; both now have tests and soup pieces. Two first tries failed the differential and are recorded so
  nobody retries them: reading every diagram's text as ONE run to the end of the markup (concatenating two diagrams'
  text changes how the CSS reader tokenizes the second, and lost `background:ur` on a seeded soup), and keeping
  comments in the text (`img<!---->:` is `img:` to the runtime). Balanced spans also rule out the clone the tree
  builder makes when an ancestor closes a `<code>` early (`<span><code class=mermaid></span>img: x`); a picked case
  holds that, since the checker's mutations showed the soups do not.
- **Differential.** `test/unit/core/gallery-html-differential.test.js` holds the new reader to the CLI's parse5
  reader, frozen in `tools/segno-legacy/gallery-elements.js` (the Studio's `DOMParser` walker was not frozen; it read
  the same shape). On the 446 rendered decks and galleries in the repo (96 component and chart-kind
  `*.gallery.md`, `examples/`, the baseline decks) the two return the same references, 0 differences. On 60,000
  seeded inputs (token soups, foreign-content structures and diagram soups) the new one refuses wherever the old one
  does, and where it is neither unsure nor refusing a diagram it lists every reference the old one did. Two arms must
  fail and do: the reader with its diagram classes renamed away (caught on more than 50 of 2,000 diagram soups), and
  the reader with its unsure findings dropped (more than 20 of 2,000 foreign-content structures).
- **What it costs.** No shipped gallery is newly refused: the gate itself, alone and as inserted, admits every
  shipped gallery (`gallery-remote-refs.test.js`). The gate refuses more hostile markup than before, on purpose: in
  an exploration run (not committed), 28,453 of 90,000 soups (32%) were refused where parse5 found nothing, 23,617 of
  them for `unsure` and the rest for a diagram holding markup. Floods stay linear: 1 to 5 MB of diagram hosts or
  spans in 0.4 to 2.5 s, roughly in proportion to size. `_astro/remote-ref.js` grows by about 560 gzip bytes measured
  locally (esbuild, minified), declared in `docs/route-budget.d/r4-gallery-gate-scan-html.md`; no ceiling moves.
  That code is the gate's and it now loads on every route that loads `remote-ref.js`; moving it to a module of its
  own is blocked by the dev shim, which inlines only require-free siblings of `remote-ref.js`.
- **Not done:** export (moved next, below), linter and narrator kept their own scans, one PR each (D8).

### R4: the export (2026-11-03)

The Studio's player export was the second consumer to move. `lib/export/inline-url-media.mjs` embeds every picture a
deck names by URL as a `data:` URI (the player's policy loads nothing else), and it found those pictures with four
regular expressions of its own: a start tag, an attribute, a `<style>` element and a `url(`. This PR deletes the four
and has the module read tags with `scanHtml` and each `url()` with `cssRefSpans`. The census goes from three
consumers to two: linter and narrator.

- **Why not `remoteRefsInHtml`.** The gallery gate asks "which addresses does this markup fetch", and
  `remoteRefsInHtml` answers with a list of strings. The export REWRITES each address in place, so it needs where
  each one is: the tag's attribute offsets (`vq`, `vFrom`, `vTo`) and each `url()` span. Those are the facts
  `remoteRefsInHtml` is built from, so the export reads the same reading one level down, as `blockWebImages` does.
- **What it keeps.** On every deck in the repo the output is byte-for-byte the same. A picture attribute and a
  `style` attribute are written back whole and double-quoted, a `url()` keeps its quote (or gains one when a data URI
  needs it), and a font source and an attribute selector stay. The engine's string copy of a background
  (`--background-image:"url(\"…\")"`) is a string span, which the export never reads.
- **What it reads differently, on purpose.** Each of these was a place the old patterns disagreed with the browser.
  - A tag inside a comment is not a tag (the walker fetched it and rewrote the comment).
  - An escaped `u\72l(` is a `url()` (missed before).
  - Entities in raw `<style>` text stay as written, as the CSS parser reads them (the walker decoded them).
  - Only the first of two same-named attributes is read (the walker rewrote every copy).
  - An HTML `<image src>` is an `<img>` to the tree builder, so it is embedded (missed before). The reader builds no
    tree, so it cannot tell an SVG `<image>` from an HTML one and embeds every picture attribute of either. An extra
    embed is an own-origin fetch the author allowed, written into an attribute that loads nothing.
  - A bad-url token (`url(/a(b.png)`, `url(/a.png x)`) is not embedded: the browser never fetches one.
    `cssRefSpans` reports it anyway, because a refusal errs that way.
  - A custom property's `url()` is embedded whatever its name. The walker embedded only `--logo-mask`'s, and a
    comment or string holding `--x:` hid a real `url()` after it. Deleting that rule changes 0 bytes on the corpus.
- **An inline SVG `<style>`.** In foreign content a `<style>` holds markup, not raw text, and `scanHtml` gives it no
  body. The export reads its text the way the tree builder builds it: the runs between the tags, comments and CDATA
  markers inside it, a CDATA section as written and other text with references decoded, and a replacement written
  back with `&` and `<` escaped outside CDATA. The red team, the inversion review and the checker each found the
  first version skipping these, which the regex walker had embedded. That is the usual output of a design tool's SVG
  export, so the fix is in this PR, with a picked test for each form.
- **`unsure` is not a refusal here.** This pass only embeds pictures from origins the author allowed. Where
  `scanHtml` is unsure it embeds what it reads, and `blockWebImages`, which runs right after it, refuses every other
  site's address there (D7). A picture of our own it misses there is not refused by that pass: a relative address is
  no web origin to it, and the completion warning leaves our own origin out. So that picture ships blank with no
  warning. This was true of the walker too. The cases left are markup the reader cannot model, which no deck in the
  repo has (0 of 446 are unsure).
- **Differential.** `test/unit/export/inline-url-media-differential.test.js` holds the new reader to the regex walker,
  frozen in `tools/segno-legacy/inline-url-media.mjs`.
  - **The corpus.** The 446 rendered decks and galleries in the repo, rendered with the Studio's `samplesUrl` so
    `sample:` art is a real address. Each runs with and without other sites allowed, against a transport that fails
    one picture in five and returns both encodings. The two return the same bytes, count and `missing` list: 0
    differences. Of the 446, 47 name a picture by URL, giving 389 picture references over the two runs. None has a
    `<style>` with a `url()`, a poster or a `srcset`.
  - **The soups.** That gap is covered by four seeded streams: picture soups, style soups (a `<style>` block of
    picture CSS around a picture soup), token soups and foreign-content structures. On every input the reader is
    not unsure of, three things are checked:
    1. It fetches exactly the pictures parse5 finds. The CSS that parse5 finds is read by the same CSS reader, so
       only the markup reading is compared.
    2. After it embeds everything, parse5 finds no picture left to fetch.
    3. The document parse5 builds is unchanged apart from the pictures (`shape`).
  - **The counts.** The unit test runs 15,000 inputs. `INLINE_MEDIA_FUZZ=30000` runs 30,000 per stream, which
    compared 24,624 picture soups, 23,342 style soups, 26,847 token soups and 2,365 foreign-content structures. The
    new reader had 0 failures. The frozen walker disagreed with parse5 on 11,395, 21,166, 107 and 183 of them.
  - **The arms.** Three arms must fail, and do on 2,000 inputs each:
    - the frozen walker, caught on 776;
    - an embed that eats the `<` of `</style>`, caught on 520 by the shape check alone;
    - the new reader blind to `<style>` elements, caught on 103.
- **Floods.** The first version checked each `url()`'s custom property with an unanchored search back to the last
  `{` or `;`, which the red team made quadratic: a 64 KB `style` attribute held the export for 64 s. That check is
  gone with the rule, and a unit test times the input at well under a second.
- **Bytes.** `WebpageOptionsPanel.tsx` imports `webPictureOrigins` from the module statically, so it loads with the
  Share sheet, which the Studio loads lazily. That sheet already imported `remote-ref.js`, and neither module is in
  any route's eager JavaScript, so no route budget moves.
- **Not moved:** `webPictureOrigins` in the same file. It reads deck SOURCE, not markup, to decide whether the
  export panel shows its "Embed pictures from other sites" switch, and it is generous on purpose (a false yes shows a
  harmless switch). It decides no fetch and no refusal, so it is not a reference reader in the census's sense.
- **Not done:** the linter and narrator (done next, below).

### R4: the narrator, and the linter (2026-11-03)

The narrator moves, and the linter is found to have nothing to move. R4 is NOT closed: the inversion review of this
change found a fifth reader that no list had named, in the CLI's HTML export (below, "Left").

- **The linter had none.** The phasing table listed it as a consumer, but `lib/authoring/lint-core.js`,
  `lint.js` and the CLI lint never read a web address out of markup or CSS. Their nearest matches are the `qr` payload
  check (it looks for a URL scheme in a bullet's text) and the author `<script>` body scan (it finds a script, not an
  address). So it had nothing to migrate, and the census went from two consumers to one when this was checked. What the
  linter SHOULD say about unsafe content is a separate question, written up where it is asked (not here).
- **The narrator.** `lib/transformers/prose-projection.mjs` rebuilds a video slide as a link card in the Reading view
  and the export's article, and takes the poster from the embed's inline `style`. It read that with
  `/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i`. It now calls `posterInStyle`, which reads the style with
  `cssRefSpans` and returns the first `url()` of the last `background-image` or `background` declaration, the one the
  browser applies. It splits declarations at a `;` outside every span, comment and `(` block, decodes escapes in the
  property name, lets `!important` beat a later declaration, and skips a declaration the browser drops: an empty
  value, a bad url token, or a `background-image` value that is not a list of images. `safePosterUrl` and the card's
  `cssSafe` check still decide what is written back, so a wrong reading costs a picture, not a fetch.
- **Shared pieces it needed.** `cssEscape` and `cssString` moved from `remote-ref.js` into `lib/core/css-token-readers.js`
  (not `css-escapes.js`, which the engine imports, so the engine's bundles do not carry them). The narrator builds
  `cssRefSpans` from the same three parts `remote-ref.js` does (`css-ref-reader.js` `makeCssRefSpans`, the generated
  parser, the token readers), so it reads CSS without loading the HTML scanner. Each part requires nothing, on purpose:
  the docs dev server and the plugin code door's sanitizer page load a CommonJS `lib/` file only when every require in
  it names a require-free sibling. A first version that had `css-ref-reader.js` require the other two broke both
  (`vite-cjs-lib-dev.test.ts` and the code-door integration tests caught it). The export's check for a valid url token
  moved into `css-ref-reader.js` as `isValidUrlToken`, and both callers use it.
- **A bug the move found.** That check read an escape as one character after the backslash, so it called
  `url(k\29 .png)` a bad url token. A hex escape takes one space after its digits, and Chromium paints that picture.
  The fix is in the shared check, so the export now embeds such a picture too. No deck in the repo has one: the
  export differential still returns the same bytes on all 446. The red team then found the first version of that
  fix backtracking exponentially: as `[0-9a-fA-F]{1,6}`, each run of hex digits after a backslash could split six
  ways against the plain-character branch, so a 10-escape bad url took 1.6 s to refuse and a 12-escape one 60 s,
  in the Reading view and in the Webpage export alike. The digits are now matched atomically (a lookahead takes the
  longest run, a backreference consumes exactly it), and 2,000 escapes refuse in under a millisecond. The test
  times it.
- **Differential.** `test/unit/transformers/prose-projection-poster.test.js` holds `posterInStyle` to the regex,
  frozen in `tools/segno-legacy/poster-in-style.js`.
  - **The corpus.** Every `style` attribute in the 462 rendered decks, galleries and fixtures: 14,277 of them. 124
    name a background and 117 give a poster, video embeds among them. 0 differences.
  - **Chromium (a scratch run, not committed).** A seeded run set 30,000 styles (three seeds of 10,000, from property, value and separator pieces)
    on an element in a real Chromium and read `style.backgroundImage`. The new reader agreed on 29,329 (97.8%), the
    regex on 12,921 (43%). Every one of the rest is a function left unclosed (`url("o.png"` or `garbage(` with no `)`),
    which the browser closes at the end of input. `cssRefSpans` reports an unclosed `url("…"` as a string span, not a
    url, so the card shows no poster there. The refusal scanner still refuses it, since it treats every string as a
    possible address. That run lives in no committed tool, so it cannot be repeated from the tree; what is durable is
    18 of its cases, pinned in the test with the value Chromium painted. The frozen regex gets 9 of them wrong (the
    failing arm). Three more cases run the whole video card (`prose-projection.test.js`): an escaped `u\72l(`, the
    last of two declarations, and an escaped `javascript:` that `safeHref` still drops.
  - **Floods.** A 64 KB style, 2,000 escapes in a bad url and 32,000 declarations each read in well under a second
    (timed in the test). The first version filtered every span once per declaration, so 32,000 declarations took 2.8 s;
    a cursor over the spans, which come in source order, reads them once.
- **The scanners still hold.** `npm run fuzz:web-refs` (seed 1, 2,000 inputs per engine) on this tree: 0 requests
  after the rewrite in Chromium 153, WebKit 26 and Firefox 142, with 17-19% of the inputs fetching as written.
- **Bytes.** The narrator now loads the CSS reader. The export's speech-projection bundle
  (`lib/export/speech-projection-bundle.generated.mjs`, evaluated in the export's own Chromium page, never shipped to a
  reader) grows from 55.0 KB to 74.8 KB, or 19.9 KB to 24.0 KB gzipped. No engine or Studio startup bundle changes.

- **Left: the CLI's HTML export.** `lib/export/html-player.js` `inlineDocAssets` embeds a deck's local files into
  the self-contained HTML, and finds them with a CSS reader of its own (`mapCssUrls`, with its own `cssString`,
  `cssUnescape` and `mapSrcset`). It matches only a literal `url(`, so it misses `u\72l(a.png)`, which `cssRefSpans`
  reads. It was never on the phasing table's list, so the census was short by one. It moved in its own change with its
  own differential, like the others (D8): see "R4: the CLI export" below.

### R4: the CLI export (2026-11-03)

The last consumer the census named moves. `lib/export/html-player.js` `inlineDocAssets` embeds a deck's local
pictures into the CLI's self-contained HTML. It found them in CSS with a tokenizer of its own (`mapCssUrls`, with
`cssString`, `cssUnescape`, `escapeEnd` and `matchingParen`). This PR deletes the tokenizer and has `mapCssUrls` read
each `url()` and each `image-set()` string with `cssRefSpans`. Every consumer the census listed now reads through
the shared readers. The census was a hand-kept list, though, and the review of this PR found more readers outside it
(below, "Readers the census never counted").

- **Markup needs no move.** The followup asked for `scanHtml` "where it reads tags". `inlineDocAssets` reads no tags
  from text: it walks the DOM jsdom already parsed for the assembler, so the parser decides what a tag and an
  attribute are. Only its CSS was read by hand.
- **One new fact in the shared reader.** `cssRefSpans` did not say whether a string sits inside `image-set()`, where
  a bare string is an address the browser fetches. `makeCssRefSpans(parser, helpers, { imageSet: imageSetBlock })` now
  adds an `imageSet` field to each span. It is true inside an `image-set(` or `-webkit-image-set(` at any depth (a `var()`
  fallback there is substituted and fetched), except directly inside a `type()`, whose string is a MIME type. The
  function's name is not on the tape (the grammar keeps only the `(`), so `imageSetBlock`
  (`lib/core/css-image-set-block.js` (moved from lib/export/ in the security spine's P2)) reads it from the stretch the tape skipped before the `(`, forward and once,
  escapes decoded. It is its own file because the reader's chunk is eager on three docs-site routes and the Studio
  never asks for the fact. Every other caller asks for nothing and gets the
  spans as before, so the frozen tokenizer's differential still compares field for field, and no generated parser
  changes. The first version marked only the innermost block, which missed the `var()` fallback that the old
  reader baked and Chromium fetches. The inversion review caught it; `test/unit/core/css-ref-image-set.test.js` pins
  the field.
- **What it reads differently, on purpose.** Each is a place the old tokenizer disagreed with Chromium:
  - An escaped `u\72l(` is a `url()` (missed before, so its local path shipped in the shared file).
  - An escaped `image-s\65t(` is the function, so its strings are addresses (missed before).
  - An unquoted `url(` or an `image-set()` string that the end of the text closes is fetched, so it is embedded
    (missed before). A quoted `url("…` the end closes is still missed, by both (below, "Left").
  - A string inside a `type()` inside `image-set()` is a MIME type, not an address. The old reader tried to embed
    it and listed it as "not a picture".
  - An attribute selector never fetches, so it is not read. The old reader rewrote an unquoted
    `a[x=url(file:///a.png)]`.
- **Two fixes in the shared reader.** The checker found that both read JavaScript's whitespace where CSS has its
  own. `isValidUrlToken` excluded `\s` from a bare url, so `url(a<NBSP>b.png)`, which Chromium fetches, read as a
  bad url and was not embedded. The unquoted branch trimmed its value with `trim()`, which also drops a no-break
  space, so `url(photo.jpg<NBSP>)` read as `photo.jpg`. Both now use CSS whitespace (space, tab, the three newlines),
  and the trim is a loop, since a `\s+$` regex backtracks on a long inner run of spaces (200,000 spaces read in
  32 ms).
- **A leak found on this path, fixed.** `resolveRelative` wrote a resolved address back as written, so a deck folder
  named `Decks (2024)` or `Bob's decks` turned `url(a.jpg)` into a bad-url token, or `url('a.jpg')` into a string
  the folder's quote ended. It was never baked and never reported, and the author's absolute folder path shipped in
  the shared file. The red team showed it on the real CLI. The old reader did the same. Such an address is now
  written as a `"` string with `"` and `\` escaped.
- **What it keeps.** A font source in a `<style>` is still read, as before: only picture types are ever embedded
  (`fileToDataUri`), so the export's `missing` list stays the same. `mapSrcset` stays in the file. It reads an HTML
  `srcset` value by the HTML spec's algorithm, not CSS, and no other module reads `srcset` that way (`remote-ref.js`
  splits at every comma, as a refusal may). The engine's `--background-image` string copy is still dropped by its
  pattern: it is the engine's own output, matched whole, not a reading of author CSS.
- **Differential.** `test/unit/export/html-player-inline-differential.test.js` holds the new reader to the old
  one, frozen in `tools/segno-legacy/html-player-inline.js`.
  - **The decks.** The 446 rendered decks and galleries, rendered as the CLI renders them (`sample:` art as
    `file://`, a deck-relative picture left relative and resolved against the deck's folder). 45 decks name a local
    picture and 192 pictures are baked. The two return the same bytes, count and `missing` list: 0 differences. This
    reaches only the `style` attribute path: no rendered deck has a `<style>` with a `url()`, an `image-set()` or a
    CSS escape.
  - **The stylesheets.** So every tracked `.css` file, plus the built `dist/lattice.css` when the install built it
    (192 sheets, 24 with a `url()`), is baked as a `<style>` body by both: 0 differences.
  - **Picked cases.** Twelve spellings, each with the load count Chromium gives it (the checker loaded each in
    Chromium and the counts match). The frozen reader gets the four escaped or end-closed forms wrong, which is the
    failing arm. Two more cases pin the folder-name fix (a paren and a quote, four spellings each).
  - **Chromium.** `test/integration/export/inliner-browser-oracle.test.js` loads 500 seeded CSS soups and 160 markup
    cases in headless Chromium and checks that every picture Chromium loads is one the inliner reads. This PR adds
    four pieces to its CSS soups: `u\72l(`, `image-s\65t(`, a `type()` and a `var()` fallback in `image-set()`. The
    new reader passes. `INLINER_ORACLE_LEGACY=1` runs the frozen reader instead, and it fails on the two escaped
    forms: that is the committed failing arm. `INLINER_ORACLE_ENGINE=webkit|firefox` drives Playwright's WebKit or
    Gecko instead of Chromium (Gecko reads the files from a loopback server, since Playwright reports no request for
    a `file://` load there; only the folder prefix changes, so every escape is read as written). In all three
    engines the new reader passes and the frozen one fails the CSS test, each on 28 pictures from the escaped forms.
- **Floods.** The name check reads each stretch before a `(` once, so the reader stays linear. A 220 KB style of
  `image-set()`, `url()` and comments bakes in about 200 ms (the test's bound is 3 s, for slow runners), and the
  red team's hostile megabyte inputs ran in 1-81 ms each. On the real 2.8 MB `dist/lattice.css` the new reader
  takes about 57 ms to the old one's 24 ms.
- **Bytes.** `css-ref-reader.js` minified and gzipped goes from 1,348 to 1,501 bytes (+153): the CSS-whitespace
  fixes, the trim loop and the block-stack hook. Its chunk (`remote-ref`) is eager on the Studio, Playground and home
  routes, all above their soft targets, so the growth is declared in `docs/route-budget.d/3024-r4-cli-export-css.md`.
  The first version kept the name check in the reader and cost those routes 380 bytes; it moved to
  `lib/core/css-image-set-block.js` (moved from lib/export/ in the security spine's P2), which only the Node export loads. The export's speech-projection bundle carries the narrator's copy of the reader and is regenerated with it.
  `html-player.js` runs in Node only. `tools/structure.js`'s single-consumer ceiling drops from 44
  to 43: `css-ref-reader.js` now has two consumers.
- **Readers the census never counted.** The inversion review searched the tree for readers that decide a fetch, an
  embed or a refusal and found these, none on any list. They are recorded, not moved here
  (`followups.d/3024-p2-segno-census-readers-outside-the-list.md`):
  - `lib/export/player-prune.js` `namesRemoteResource` drops a deck declaration naming a remote resource before the
    CSS reaches the Studio's Reading view, which has no subresource policy. It matches a literal `url\(`, so
    `u\72l(https://…)` survives the prune. Whether author CSS can reach that sheet unsanitized was not traced.
  - `lib/core/css-scan.js` `findAddressStrings`, a full CSS tokenizer behind the theme, layout and package gates. It
    decodes escaped names; no bypass was found.
  - `lib/core/door-attr.mjs` `cssRefTargets`, the code door's CSS walk. No bypass was found.
  - `lib/core/slide-camera.mjs` `CSS_URL` / `REL_URL`, which pick what the photo layer inlines. They miss `u\72l(`,
    which costs a missing picture, not a leak.
  - `docs/src/components/studio/motion/svg-intake.ts` `EXTERNAL_URL_RE`, a refusal on SVG intake. Not traced.
- **Left in the shared reader.** The red team found three spellings Chromium fetches that every `cssRefSpans`
  consumer reads as a plain string, old and new alike: a quoted `url("…" foo)` with a modifier or a comment before
  `)`; a quoted `url("…` the end of the text closes; and a string that reaches `image-set()` through a custom
  property (`--a:"…"` then `image-set(var(--a))`). The refusal side already treats every string as an address, so
  only the embedders miss them. They were recorded as a grammar change; a fact on the reader's spans closed the
  first two on 2026-11-04 and the third is a documented gap (below, "R4: url() strings the exports missed").

### R4: the Reading view's prune (2026-11-04)

The first reader the census missed moves. `lib/export/player-prune.js` `namesRemoteResource` drops each deck
declaration naming a remote resource from the sheet `scopeReHostedCss` builds for the Studio's Reading view, which
sits in the app's top-level document with no subresource policy. It matched a literal `url\(` and a quoted string
with a regex, so `u\72l(https://…)` survived the prune.

- **The trace.** The sheet is `render.flatCss`: the engine's flat pack plus the deck's theme (`extraTheme`) and the
  Studio's local components (`extraCss`). An imported theme is a file an attacker can write, so author-controlled CSS
  does reach this function. Two layers stand in front of it. `saveStudioTheme` refuses a theme whose CSS reaches off
  the device (`lib/theme/gate.js`, which reads escapes and refuses `u\72l(https://…)`). Then
  `article-projection.ts` runs `blockWebCss` (remote-ref.js, which reads with `cssRefSpans`) on `flatCss` before the
  prune, so a web address the reader has not allowed is already the hatch. What reached the regex was an address on
  an origin the reader allowed, or on the site's own origin (`withOwnOrigin`). The prune drops every remote
  address whatever the reader allowed, because this document has no policy behind it, and the escaped spelling
  slipped past that one rule. So this was a gap in the third layer, not a leak past all three.
- **The move.** `namesRemoteResource` now reads the value with `cssRefSpans`, built in the file from the reader's
  three require-free parts as the narrator builds it, with the `imageSet` fact. A `url()` target, and a string inside
  `image-set()`, is remote when `isRemoteRef` (lib/core/media-sources.js, the kernel the refusals use) says so,
  any scheme included. That also catches what the regex missed outside escapes: a tab inside the scheme
  (`ht\9tps:`), a `\\host` that Chromium reads as `//host`, `javascript:`, `chrome-extension://`, and the desktop
  app's `asset://` and `tauri://`. Any other string is text until something fetches it, and `isRemoteRef` calls every
  unknown scheme remote, so such a string keeps the regex's own rule (`scheme://…` or `//…`), applied as written and
  again after the URL parser's normalization (a tab removed, `\` read as `/`, a host after the `//`). So the reader
  drops everything the regex dropped, and `content:"File: "` or a lone `"\\"` stays.
- **What the review found, fixed here.** The trio ran on this change (HARD RULE #25, tier 2).
  - The first version judged a non-`url()` string by a list of web schemes. The inversion review showed it kept
    `image-set("chrome-extension://…")` and `"asset://…"`, which the regex had dropped. `blockWebCss` knows only web
    origins, so for those schemes the prune was the only runtime layer. Fixed as above. The `CAUGHT` list now
    carries them.
  - The checker and the red team showed that the same list dropped prose such as `content:"File: "`, and that the
    as-written check dropped a lone `"\\"`. Both are in `KEPT` now.
  - The red team found two gaps older than this change, on the surface it touches. A nested rule with no `&`
    (`.a{.b{…}}`, `.a{+ p{…}}`) is a raw node to css-tree, so neither the fence nor the drop could see it, and every
    engine applied it. Its `url()` fetched, and `+ p` reached the app's prose. Such a node is now dropped (no tracked
    sheet has one). An escaped at-rule name (`@\70roperty`, `@\66ont-face`, `@\6b eyframes`) skipped the drop list
    and registered app-global rules. Names are now decoded before the check.
- **Differential.** `test/unit/export/rehost-remote-ref.test.js` holds the reader to the regex, frozen in
  `tools/segno-legacy/names-remote-resource.js`, on every declaration of every tracked stylesheet and the built
  bundle (193 sheets, 58,685 declarations). They differ on one: `spec/conformance/theme/script-url.css`'s
  `--x:url(javascript:alert(1))`, which the reader now drops. The engine's mark tokens (`data:image/svg+xml` urls that
  carry `xmlns='http://…'`) all survive. Eight picked spellings fail on the frozen regex, which is the failing arm, and
  the test asserts that every difference on the tree is a drop the regex missed.
- **Browsers.** `test/integration/export/rehost-remote-oracle.test.js` loads 50 cases (five spellings of a web
  address, ten places to put one, a nested rule among them) from a page on one loopback origin. Each address is a
  distinct file on a second loopback origin that stands in for the web, and the test reads that server's log.
  Unpruned, Chromium and WebKit fetch all 50. Through the real `scopeReHostedCss` (prune, fence and css-tree's
  re-serialization) they fetch 0, and so does Gecko 142. `REHOST_ORACLE_LEGACY=1` drops with the frozen regex, and 38
  of 50 fetch in Chromium: that is the committed failing arm. `REHOST_ORACLE_ENGINE=webkit|firefox` selects the
  other engines. Gecko does not read `\\host` as `//host` in CSS, so it fetches 40 of the 50 unpruned, and the test
  lists the ten it skips.
- **The real surface.** The spelling cannot reach the Reading view through the Studio's own doors without first
  passing the theme gate, so no Studio e2e can feed it the input without writing storage by hand.
  `docs/e2e/read-article-beacons.spec.ts`, which logs the Reading view's requests to a loopback tracker, is the real-
  surface check that nothing regressed. It passes on the built site in Chromium and WebKit: the blocked arm logs 0
  requests, and the control arm fetches once the origin is allowed.
- **Bytes.** `player-prune.generated.js` is a lazy chunk: the Reading view loads it when it opens, and it now
  carries the reader and its parser (the same bytes the eager `remote-ref` chunk already ships). No eager route grows.


### R4: url() strings the exports missed (2026-11-04)

The red team of #3024 found three spellings that every `cssRefSpans` consumer read as a plain string, though a
browser fetches them (`followups.d/3024-p3`, deleted by this change). The refusal side treats every string as an
address, so nothing was fetched that a refusal should stop. The embedders, the CLI export and the Studio's Webpage
export, left the picture out and, for a local file, shipped its path.

- **What a browser fetches, measured.** A page on a loopback server, each shape its own file:

  | Shape | Chromium 153 | WebKit 26 | Gecko 142 |
  |---|---|---|---|
  | `url("a.png" crossorigin(anonymous))`, or any token before `)` | fetched (the CI runner's Chrome does not) | not fetched | not fetched |
  | `url("a.png" /*c*/)`, a comment before `)` | fetched | fetched | fetched |
  | `url("a.png`, closed by the end of the text | fetched | fetched | fetched |

- **A fact, not a new kind.** The grammar is unchanged. All three shapes reach the same reader branch: a string
  after `url(` with no `)` right after it. `makeCssRefSpans(…, { urlArg: true })` now sets `urlArg: true` on that
  string's span. The span stays a string and not a `url` span on purpose. An embedder that swapped the whole
  `url("a.png"` for `url("data:…")` would leave the modifier's `)` dangling and void the declaration. So both exports
  replace the STRING with a quoted address, which keeps what follows valid. Callers that do not ask get the spans as
  before. The scanner (remote-ref.js) does not ask, so the frozen tokenizer's differential still compares field for
  field, and no generated parser changes.
- **The Reading view's prune reads it too.** `namesRemoteResource` (lib/export/player-prune.js) judges a
  `urlArg` string as it judges a `url()` target, with `isRemoteRef`, any scheme included, so
  `url("tauri://localhost/x.png" crossorigin(anonymous))` is dropped rather than read as prose.
- **The two exports read it.** `lib/export/html-player.js` `mapCssUrls` embeds a closed `urlArg` string as it embeds an
  `image-set()` string, with the kind `'arg'` so the replacement is a string, never a `url()`.
  `lib/export/inline-url-media.mjs` builds its own reader with the fact, as the CLI export does, and embeds the same
  strings. Both read `isClosedString`, which moved out of `html-player.js` into `lib/export/css-closed-string.js` so the
  two share it and the eager reader does not carry it.
- **What the review found, fixed here.**
  - The checker showed that a foreign `<style>` (inside an `<svg>`) that a comment or CDATA marker splits is read
    run by run in `inline-url-media.mjs`, so the end of a run looked like the end of the sheet. A `url("…` cut there
    was embedded and its added quote voided the rules after it. `mapCssUrls` now takes `endsSheet`, and a span that
    reaches the end of a run that is not the last is left alone. The same guard keeps the older unquoted case,
    `url(/img/m.png<!--c-->)`, from being rewritten.
  - The red team showed that a refused file's stand-in, an SVG that carries `'`, ended a `'` string early or made a
    bare url bad, so it never painted. `rewriteFileUrls` now writes an address its quote cannot hold as a `"` string,
    escaped. A base64 picture always fits, so every deck exports the bytes it did.
- **Erring toward the embed.** Only some browsers fetch the modifier shape: the sandbox's Chromium 153 does, and the
  CI runner's Chrome, WebKit 26 and Gecko 142 do not. Where a browser does not, the export now shows a picture it would
  not have loaded. That is the side to err on: the alternative ships the author's local path in a file that a browser
  supporting modifiers loads it from. The inliner oracle allows that one over-read, in every engine, and no other.
- **The third shape, a custom property's string read by `image-set(var(--a))`, is left as a documented gap.** To
  embed it, the reader would have to call every closed string in a custom property an address, and
  `--label:"photo.png"` behind a `content:var(--label)` is text. An export that rewrote it to a data URI would show the
  URI as text. A refusal already treats the string as an address. What it costs: such a picture is missing from the
  shared file, and a local path in it ships as written. An author who writes the address as a `url()` inside the
  custom property gets it embedded.
- **Evidence.** `test/unit/core/css-ref-url-arg.test.js` pins the fact (six spellings with it, five without) and
  drives the CLI export on all three shapes in both a `style` attribute and a `<style>` body. `inline-url-media.test.js`
  does the same for the Studio's export. The inliner's Chromium oracle
  (`test/integration/export/inliner-browser-oracle.test.js`) adds the modifier and comment shapes to its soups, and
  appends an end-closed `content:url("…` to some cases. It passes in Chromium, WebKit and Gecko. With `urlArg` turned off in
  `html-player.js`, it fails in Chromium on all three shapes, which is the failing arm. `INLINER_ORACLE_LEGACY=1`
  still fails, as before. The 446-deck and 192-sheet differential against the frozen inliner
  (`html-player-inline-differential.test.js`) still shows 0 differences: no tracked deck or sheet carries one of the
  shapes.
- **Bytes.** `css-ref-reader.js`, eager on the Studio, Playground and home routes, goes from 1,471 to 1,499 bytes
  minified and gzipped (+28) on its own, and +44 inside the built `remote-ref` chunk, which CI measures. It is declared in
  `docs/route-budget.d/3024-p3-url-arg.md`.


### R4: the four census readers (2026-11-04)

The inversion review of #3024 named four readers no census counted (`followups.d/3024-p2-…`). One moved; the other three
have their exclusion written, with the reason, for the security spine's S3 census gate to sanction.

- **`svg-intake.ts`, moved.** Paste intake strips every attribute that would fetch from somewhere else. It tested that with
  `url\(\s*['"]?\s*(?:scheme:)?//` on any attribute, and `^\s*(?:scheme:)?//` on an `href`. It now asks remote-ref.js:
  `attrIsRemote(tag, name, value)` (the policy table's fetch attributes, and any CSS value read by `cssRefSpans`), plus
  `isRemoteUrl` on an `href`, because `attrIsRemote` treats an `<a href>` as a link and intake strips that too. The
  Studio already loads remote-ref.js at startup, so the move costs no bytes.

  The oracle cuts the web-reference fuzz's CSS inputs (seed 7, 3,000 inputs) into 7,769 declarations. It sets each one on
  an SVG `<rect>` in a real page, as a `style` and as a `fill`, and counts requests at a loopback server, rechecking each
  candidate alone on a fresh page:

  | Engine | Values the browser fetched | Let through by the old patterns | Let through by `attrIsRemote` |
  |---|---|---|---|
  | Chromium 153 | 806 | 284 | 0 |
  | WebKit 26 | 728 | 208 | 0 |
  | Firefox 142 | 585 | 170 | 0 |

  The new test strips everything the old one stripped, in each engine. Over the 31,374 attributes of the 358 SVG files in
  the tree, the two agree on every one. The old patterns' misses are the escape and whitespace spellings: `u\72l(`, a
  form feed or tab before `url(`, `\68\74tp:` for `http:`, and escaped slashes in a quoted address
  (`url( "http:\/\/…" )`). That made a pasted drawing a beacon from the Studio's origin, which paints the shelf and
  ships in every exported copy. A bad url token (`url(/**/"//x")`) fetched in no engine, and both tests keep it.

- **`css-scan.js` `findAddressStrings` and `door-attr.mjs` `cssRefTargets`, excluded for now.** Both decide a refusal
  (the theme, layout and package gates; the code door), and both read a channel `cssRefSpans` does not report: an
  address-shaped string in a custom property or an `@property` `initial-value`, which an `image-set(var(…))` elsewhere
  fetches, and for the door any string inside a function. Moving them means the reader reports the declaration each
  span sits in. That is new state in a security reader, so it gets its own differential against these two walkers and
  the trio, which makes it work for its own change. No bypass is known in either (#3024's review).
  **Moved 2026-11-04** onto `cssRefSpans`' declaration channel (`decls`), with that differential and a three-browser
  oracle; the oracle found one bypass in the gate, an address inside `image()`, and the red team one in the door, a
  custom property spelled with escapes; both now refused (security spine note, "P2, the
  declaration channel, as built").
- **`slide-camera.mjs` `CSS_URL` / `REL_URL`, excluded for now.** They choose which pictures a picture export inlines
  and make relative `url()`s absolute. That is not a refusal, and the known miss (`u\72l(`) costs a missing picture,
  not a leak. Moving them changes export bytes for those spellings, so the move ships with a dark and a light render of
  a representative deck for the owner's sign-off (CLAUDE.md, Quality Bar). **Moved on 2026-11-05**: the camera reads CSS
  with `cssRefSpans`, and picture export is byte-identical on the demo decks (security spine note, "The picture camera, as
  built").

## Decisions for the owner

- **D5. The `ping`/`action`/`formaction` call (A or B).** **Decided by the owner on 2026-10-27: A**, because the same door will later carry user-approved plugins (as video does) behind strong controls, so the filter's default is to refuse and an approved origin passes. Done in `remote-ref.js` as the first row of the policy table (`CLICK_FETCH_ATTRS`). The alternative, B, left the scanner's claim at "on render" and documents the gap; the PR stays at HIGH either way.
D6 to D8 were answered on 2026-10-29 by the session the owner briefed to answer them and proceed
(the continuation brief after #2945: "Answer D6 to D8 in the design note"). Each took the
recommendation; the owner can overturn any of them on the PR that carries this edit, and nothing
built so far is hard to undo.

- **D6. Where the role vocabulary lives. Answered: the dialect package.** Segno carries opaque
  labels (`node(kind, x, { role })`, shipped in R1) and checks only that a kind has one role. The
  words a CSS or HTML island uses (`ref`, `base`, `unsure`) are declared and tested in that
  island's package, beside its grammar. *Why:* a fixed set in core is simpler to check and wrong
  the moment a second dialect needs a different word, and the policy table already fails on a
  `kind/when` pair with no row, which is the check that matters.
- **D7. Fail-closed on `unsure`. Answered: fail closed.** An `unsure` span with a web-looking
  address is refused, or handed to the platform parser where one is available and that answer
  used. *Why:* allow-and-warn recreates the quiet guess that produced the eight misses; refusing
  costs a deck with a genuinely ambiguous reference one blocked address, which the reader can
  still allow by hand.
- **D8. Sequencing. Answered: R0 (shipped with D5), then R1 (shipped 2026-10-29), then R2.** R3
  starts only after R2's gate (433-deck byte identity, fuzz at 0 requests in three engines, the
  failing arm still failing) has run green. R4 stays one PR per consumer.

- **D9. The Studio ceiling for R3. Answered by the owner on 2026-11-02 on #3002: A, keep R3 switched on.** Switching R3 on adds about 2.5 KB gzip to the Studio's eager JavaScript (2,495 bytes
  locally, 2,701 in CI), which sat 164 bytes under its 562,200-byte ceiling, so on 2026-10-30 the switch was
  held and the question put to the owner, with B (do not switch) as the default if silent. The owner did not
  answer it. On 2026-11-02 the owner raised the ceiling by 5 KB in #3001 for #2997's 0.2 KB, and the session
  switched R3 on inside that room (CI: 551.6 KB against 554.5 KB), declaring the bytes and moving no ceiling.
  That spends about 2.7 KB of headroom raised for another PR; the owner accepted it ("go with A"). Overturning it later is one revert of the switch commit; the
  hand-written scanner, with the six fixes, is frozen in tools/segno-legacy/scan-html-fixed.js.

## Not decided here

How tree construction facts (foreign content, templates) are best expressed in a generated grammar was the open design question of R3. R3 answered it with stops and a reader that keeps the state ("R3 landed"). The connection-with-no-request oracle cannot fail in headless Chromium today (the control opens no attributable idle connection), so `fetch/hint` has no measured coverage until that oracle is fixed.
