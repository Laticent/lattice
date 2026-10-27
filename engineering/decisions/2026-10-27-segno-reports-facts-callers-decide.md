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
| **R1** | Segno core: `facts` (limits with `maxNodes`, anomalies, coverage) and the `ROLES` table. | Codegen differential (old vs new on the corpus); the 466-test suite; `mutate:segno` gains mutants for roles and the node cap; bake-off no-regress on the three Segno benches. |
| **R2** | CSS island with `ref` roles, replacing `cssRefSpans`. | Rewrite and `blocked` lists byte-identical on the 433 decks; fuzz 0 requests in three engines; the failing arm still fails. |
| **R3** | HTML island: the WHATWG tokenizer states in a generated grammar, with tree-construction effects as `unsure` spans. | Soundness invariant on 100,000 inputs per engine; platform-parser differential on the corpus; `unsure` rate reported (a high rate means the island is not yet useful). |
| **R4** | Consumers migrate one at a time (gallery gate, export, linter, narrator); each deletes its scanner. | Census count of private ref readers goes down; each migration its own PR. |

Cost is an estimate, not a measurement: R0 and R1 are small (days); R2 follows the pipeline's P5; R3 is the real work (the
tokenizer is about 80 states; tree construction is deliberately out of scope behind `unsure`). Nothing in R0-R2 depends on R3.

## Decisions for the owner

- **D5. The `ping`/`action`/`formaction` call (A or B).** *Recommended: A, as the R0 table row.* B leaves the scanner's claim at "on render" and documents the gap; the PR stays at HIGH either way.
- **D6. Where the role vocabulary lives.** *Recommended: the dialect package,* with Segno carrying opaque labels. *Alternative:* a fixed set in core, which is simpler to check and wrong the moment a second dialect needs a different word.
- **D7. Fail-closed on `unsure`.** *Recommended: refuse, or defer to the platform parser.* *Alternative:* allow and warn, which recreates a quiet guess.
- **D8. Sequencing.** *Recommended: R0 now (its own PR, after the export sign-off), R1 next, then R2.* R3 only after R2's gate has run.

## Not decided here

How tree construction facts (foreign content, templates) are best expressed in a generated grammar is the open design question of R3; the note commits only to the soundness invariant and to `unsure` as the escape. The connection-with-no-request oracle cannot fail in headless Chromium today (the control opens no attributable idle connection), so `fetch/hint` has no measured coverage until that oracle is fixed.
