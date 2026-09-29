---
status: proposed
summary: >
  Should the chart and inline grammars move to a parser library? Peggy, Chevrotain, Ohm,
  Nearley, Parsimmon and Lezer were held to five shipped kernels (axis bracket list, flowchart
  row, gantt span, value pill, inline-code dispatch). All 33 implemented cells read every real
  input exactly as the kernels do, and 29 hold 100% on 20k fuzz inputs per target; Ohm and
  Lezer miss only on emoji, counting code points where the kernels count UTF-16 units. So
  expressiveness is not the problem. Speed is: over all spans the best library per target is
  5-42x slower (0.8-7x on accepted spans), and on the two context-sensitive grammars (axis,
  flow) every library goes quadratic or worse on hostile input, 1-16 s where the kernel stays
  under 8 ms, because the same three rules (a quote's partner, the parts cap, the arrow's word
  boundary and label cap) need an escape hatch in every library. Recommendation: keep the
  kernels, make the parity harness the contract, and use Peggy for the first genuinely
  recursive grammar. The harness also found a stray-] quirk in bracket-list.js (fixed) and
  a Chevrotain lexer bug that silently drops input.
---

# Parser libraries against our hand-written grammars: every one can say it, none should ship it

**Date:** 2026-09-28 · **Status:** proposed — the recommendation needs an owner call (§ "The decision")
**Harness:** `npm run parser:bakeoff` · `npm run parser:bakeoff:speed` · `npm run parser:bakeoff:versus` (Segno head to head) · `tools/parser-bakeoff/`
**Related:** `2026-09-22-chart-axis-grammar.md` (why `bracket-list.js` is a single-pass scan),
`2026-09-25-flowchart-authoring.md` (the flowchart grammar), `2026-09-20-dom-library-bakeoff.md`
(the harness shape this one copies)

## The answer

**Keep the five kernels hand-written. Standardize the METHOD instead of a library.**

The worry behind this bake-off was that hand-rolled parsers do not scale: each chart and
inline grammar is its own scanner, and the next one will be too. So six libraries were held
to the grammars we ship — Peggy, Chevrotain, Ohm, Nearley, Parsimmon and Lezer — on five
targets, four chart and one inline:

| target | what it reads | shipped kernel |
|---|---|---|
| `axis` | `` `[{Effort, 0..10, 5}, Reach]` `` | `lib/core/bracket-list.js` `parseBracketList` (cap 3, and uncapped) |
| `flow` | `Storefront -SEV1-> Payments` | `lib/core/flowchart-grammar.js` `splitRow` + `readArrow` |
| `gantt` | `` `2026 Q1..Q3` `` | `lib/core/gantt-time.js` `parseSpanToken` + `parseTimePoint` |
| `value` | `` `-$0.8M` `` `` `1,25M` `` `` `($1.2M)` `` | `lib/core/chart-values.js` `isValuePill` + `signedValue` |
| `inline` | `` `{BETA}:tag:c4` `` `` `[x]` `` `` `\{X}` `` | `lib/core/inline-code-directives.js` (state mark · pill · escape) |

Three results decide it:

1. **Every library can express every grammar.** All 33 implemented cells (five libraries on
   six targets, Lezer on three) read identically to the shipped kernel on every real input —
   the 10,129 inline-code spans in the decks and docs, 4,472 once deduplicated with the
   kernels' test literals, plus 269 flowchart rows. On a seeded fuzz of 20,000 inputs per
   target, 29 cells stay at 100%; the four that do not (Ohm on flow and value, Lezer on
   value) miss only on emoji, because those two count a character as a code point where our
   kernels count UTF-16 units (§ "What the harness found", 3). So the problem was never that
   our grammars are too irregular for a real parser.
2. **Every library is slower, and on the hard grammars every one goes super-linear.** Over
   all spans — most of which a dispatcher rejects — the best library for each target is 5x
   to 42x slower than the kernel; on accepted spans alone, 0.8x to 7x. On the two
   context-sensitive grammars (axis, flow) every library goes quadratic or worse on hostile
   input, taking 1 to 16 s where the kernel stays under 8 ms at 32,000 characters. The
   kernels were rewritten as single-pass scans precisely because `label-set.js`'s regex took
   10.9 s on 3,000 characters in the browser linter, on untrusted Markdown (HARD RULE #22).
   A library does not remove that risk; it moves it into a grammar where it is harder to see.
3. **Most of each kernel is not grammar.** A library replaces only the structural code —
   239 lines across the five kernels. The separator rule, the magnitude table, the month
   vocabulary, the pill vocabulary, quote stripping and the calendar round-trip are policy,
   and every candidate calls them unchanged (`tools/parser-bakeoff/shared.mjs`). For `value`
   this is nearly all of it: the grammar replaces one regex (`NUMERIC_PILL`) and the number
   itself is still read by `signedValue`.

What does scale is what this bake-off had to build to be fair: a **parity harness** — real
corpus, seeded fuzz, a scaling ladder, per-process timing — that any grammar kernel can be
held to. Outside the libraries it found a latent quirk in a shipped kernel (fixed here) and a
lexer bug in the one library already in our tree (§ "What the harness found").

## Why these candidates

The three in the brief — **Chevrotain** (LL(k)), **Peggy** (PEG) and **Nearley** (Earley)
— plus three that each answer a question the brief raised by implication:

- **Ohm** — the purest PEG: grammar text with no embedded code, separate semantics, the
  best tooling of the field. Tests whether a grammar can stay a pure specification here.
- **Parsimmon** — parser combinators, the family most JavaScript codebases actually reach
  for (arcsecond, parjs). No grammar language, no build step.
- **Lezer** — CodeMirror's parser. The Studio editor already runs on CodeMirror, so a Lezer
  grammar is the one option that could also drive editor highlighting and incremental
  re-parse. That is a different reason to want a grammar, and it is worth knowing its cost.

Chevrotain is already in the dependency tree (`mermaid` → `@mermaid-js/parser` → `langium`
→ `chevrotain@12`). The other five were installed with `npm i --no-save` and are not
dependencies; the harness skips a candidate that is not installed.

## How the comparison was kept fair

**The incumbent is the spec.** A challenger passes a case only when its output is
deep-equal to what the shipped function returns (`reference.mjs`). The incumbent runs
through the same harness as its own control row and must read 100% against itself.

**Structure is the grammar's; policy is shared.** Everything that decides where a quote
opens, which `-` is an arrow, what `..` splits, is written in each library. The tables and
rules that sit after the reading — `unquote`, the month list, `signedValue`,
`resolveMods`, the calendar round-trip — are the incumbent's own code, imported by every
candidate from `shared.mjs`. A divergence therefore means the grammar read the string
differently, never that the tables were retyped.

**Inputs a migration would actually meet.** `corpus.mjs` takes every inline-code span in
`examples/`, the baseline deck and the component docs as markdown-it tokenizes them (10,129
spans, 3,982 distinct) — so each candidate faces the 99% of spans it must reject, not only the ones it accepts — plus
every string literal in the kernels' own unit tests, which is where earlier adversarial
reviews pinned the inputs that broke previous versions. The fuzz mutates those strings over
each target's alphabet with a seeded generator, so every candidate sees the same 20,000
inputs. It edits by code point and each alphabet carries two astral-plane characters, so an
emoji is tested whole and never as a lone surrogate half (which no UTF-8 file can hold). A
few seeds the real corpus lacks are added to the fuzz only: braced members of three or more
parts, where the cap bites, and arrow labels at the 61-unit limit, some in emoji.

The correctness table prints how many inputs the incumbent ACCEPTS, because parity on rejects
alone would be cheap. Across the fuzz sets it accepts 13,768 axis inputs, 3,735 arrow-bearing
rows, 1,048 gantt spans, 4,630 value pills and 1,409 inline directives; on the real corpus,
60, 74, 60, 361 and 38.

**One process per timing cell, under a deadline.** A super-linear candidate cannot stall
the table or warm the JIT for the next one (`speed-cell.mjs`).

## Correctness: everything reached parity, and what it took

| | axis | axis (uncapped) | flow | gantt | value | inline |
|---|---|---|---|---|---|---|
| incumbent | 100% | 100% | 100% | 100% | 100% | 100% |
| Peggy | 100% | 100% | 100% | 100% | 100% | 100% |
| Chevrotain | 100% | 100% | 100% | 100% | 100% | 100% |
| Ohm | 100% | 100% | 100% · **99.87%** | 100% | 100% · **99.88%** | 100% |
| Nearley | 100% | 100% | 100% | 100% | 100% | 100% |
| Parsimmon | 100% | 100% | 100% | 100% | 100% | 100% |
| Lezer | — | — | — | 100% | 100% · **99.88%** | 100% |

One figure means real and fuzz both read 100%; two are real · fuzz. Every miss is an emoji
(§ "What the harness found", 3). `npm run parser:bakeoff` prints the per-cell counts.

The table hides the useful part. **Three rules in our grammars are context-sensitive, and
every library needed an escape hatch for the same three:**

| rule | why a plain grammar cannot say it | how each library got there |
|---|---|---|
| **a quote opens only if a partner that ENDS A PART exists further on** (`bracket-list.js`) | depends on text arbitrarily far ahead, possibly in a later member | Peggy/Ohm/Parsimmon: a lookahead that scans forward from every quote. Chevrotain: a `GATE` in JS that scans the same way. Nearley: a `reject` postprocessor calling a JS scan. All five are quadratic on the same input (see Speed). Lezer: needs an external JS tokenizer, so not implemented |
| **the parts cap** — after `maxParts − 1` kept parts, commas are text (`bracket-list.js`) | a number the CALLER picks at parse time, counting only NON-EMPTY parts | Peggy: mutable per-parse state read by a predicate. Chevrotain: a field and a `GATE`. Parsimmon: a counter threaded through `.chain` — the cleanest. Ohm and Nearley cannot read a runtime number, so a grammar is **generated per cap value** |
| **an arrow starts at a word start, ends at a word boundary, and its label stops at the FIRST valid closer within 61 characters** (`readArrow`) | lookbehind, lookahead and bounded repetition at once | Peggy: predicates reading `input[offset()]` + a length predicate. Chevrotain: `BACKTRACK` + `GATE`s, and one `OR` forced to `MAX_LOOKAHEAD: 1` because the LL(k) analysis could not see that `--` may end the input. Ohm: no bounded repetition, so the label rule is **unrolled into 122 generated rules**. Nearley: the row is restructured into space-separated chunks and a word is `reject`ed wherever an arrow parses (a sub-parse per word start). Lezer: an external tokenizer that would be `readArrow` itself |

That is the finding behind "hand-rolled doesn't scale": the hard part of our grammars is
exactly the part a grammar library does not make easy. What a library removes is the easy
part — the bracket, the colon, the `..`.

## Speed

Read this beside the correctness table: every row below is a candidate that already reads
every input correctly.

### Per span — what a deck pays

Nanoseconds per input over **all** real spans (what the dispatcher sees: most are rejects),
then over the **accepted** subset (the path that builds output). One process per cell, warm.

| target | incumbent | Peggy | Chevrotain | Ohm | Nearley | Parsimmon | Lezer |
|---|---|---|---|---|---|---|---|
| axis | **276** · 3,434 | 42,408 · 35,300 | 3,279 · 22,991 | 16,853 · 304,859 | 19,718 · 181,394 | 8,041 · 98,661 | — |
| axis (uncapped) | **296** · 2,762 | 47,845 · 25,752 | 4,369 · 29,777 | 11,699 · 124,282 | 28,445 · 153,994 | 10,173 · 106,858 | — |
| flow | **2,644** · 2,632 | 12,649 · 6,918 | 26,074 · 14,836 | 176,899 · 248,652 | 105,658 · 331,199 | 32,877 · 44,014 | — |
| gantt | **704** · 1,120 | 38,075 · 8,815 | 40,128 · 4,656 | 80,138 · 58,339 | 894,351 · 361,448 | 83,862 · 61,512 | 29,876 · 37,150 |
| value | **962** · 3,787 | 122,323 · 5,056 | 48,873 · 4,386 | 27,720 · 44,803 | 40,620 · 14,417 | 46,430 · 61,902 | 22,345 · **3,084** |
| inline | **149** · 851 | 1,756 · 2,451 | 32,863 · 9,059 | 36,059 · 25,174 | 37,319 · 33,596 | 4,296 · 8,128 | 17,101 · 6,233 |

On the all-spans column the **best** library per target is 5x (Peggy, flow) to 42x (Lezer,
gantt) slower than the kernel, and the field runs to about 1,300x (Nearley, gantt). On the
accepted-only column the gap closes: the best library is 0.8x (Lezer, value — the one cell a
library wins) to 7x (Chevrotain, axis). Absolute figures move by up to 2x between runs on
this shared sandbox; the orders of magnitude do not. Two things explain
most of the gap. The kernels reject in one character — `inline-pills.js` returns on the first
`charCodeAt`, so over 99% of spans never allocate — where every library builds a parse
state first. And Peggy's rejects are **slower than its accepts** (value: 122 µs against
5 µs) because a failed Peggy parse throws a `SyntaxError` with a computed expected-list; a
one-character guard in front of it would remove most of that, and would be hand-written.

At deck scale the kernels are dust and most libraries are not. `inline` runs on every
inline-code span of every slide, a few hundred per deck: about 0.1 ms today, 1 to 2 ms with
Peggy or Parsimmon, 10 to 20 ms with Chevrotain, Ohm or Nearley — against an ~80 ms render
(`2026-09-22-chart-axis-grammar.md` § "Whole-deck"), and again on every keystroke in the
Studio, where `lint-core` runs the same kernels on the main thread.

### Hostile input — the number that matters for HARD RULE #22

Milliseconds at 2k / 8k / 32k characters. **DNF** = the rung before took over half a second,
so the next would have taken seconds to minutes; **TIMEOUT** = over 20 s. The shapes are
the ones that bit earlier regexes (`corpus.mjs` `scaling`).

| target · shape | incumbent | Peggy | Chevrotain | Ohm | Nearley | Parsimmon | Lezer |
|---|---|---|---|---|---|---|---|
| axis · unclosed quotes | 0.4 / 1.7 / 1.9 | 79 / 700 / DNF | 19 / 65 / **1,090** | **1,093** / DNF | **1,178** / DNF | **1,718** / DNF | — |
| axis · spaces in a member | 0.3 / 1.1 / 0.4 | 1.2 / 5.1 / 7.7 | 0.5 / 0.6 / 1.5 | 9 / 27 / 158 | 157 / 3,420 / DNF | 6 / 11 / 48 | — |
| axis · nested braces | 0.4 / 1.0 / 0.4 | 0.7 / 2.4 / 6.1 | 6.7 / 8.3 / 37 | 11 / 55 / 177 | 127 / 2,354 / DNF | 7 / 13 / 37 | — |
| flow · open labels (`-a -a -a …`) | 0.4 / 2.3 / 3.9 | 121 / **1,053** / DNF | 64 / 301 / **1,129** | 583 / DNF | TIMEOUT | 379 / **8,537** / DNF | — |
| flow · dashes (`- - - …`) | 0.4 / 0.6 / 1.5 | 2.4 / 4.3 / 19 | **16,511** / DNF | 61 / 170 / 738 | 217 / 2,862 / DNF | 17 / 42 / 176 | — |
| flow · arrow chain | 0.4 / 1.1 / 1.4 | 1.2 / 3.6 / 10 | 7.1 / 12 / 42 | 29 / 130 / 669 | **3,320** / DNF | 6 / 18 / 99 | — |
| gantt · dots | 0.0 / 0.1 / 0.6 | 0.5 / 0.6 / 1.2 | 0.6 / 2.1 / 1.8 | 3.9 / 6.3 / 40 | 243 / 2,288 / DNF | 0.1 / 0.1 / 0.1 | 9 / 28 / 126 |
| value · digits | 0.5 / 1.1 / 7.1 | 1.0 / 1.7 / 8.9 | 3.3 / 3.6 / 21 | 3.1 / 9.9 / 60 | 49 / 551 / DNF | 1.8 / 2.7 / 7.3 | 1.6 / 1.6 / 4.3 |
| inline · mods | 0.0 / 0.1 / 0.3 | 0.3 / 1.1 / 4.2 | 2.3 / 1.8 / 9.0 | 4.6 / 18 / 86 | 16 / 55 / **1,153** | 3.6 / 3.9 / 11 | 5.6 / 4.1 / 11 |

(`npm run parser:bakeoff:speed` prints every shape, including the ones left out here.)

The kernels stay under 8 ms at 32,000 characters on every shape. The libraries split
cleanly along the line the correctness section drew: **on the regular grammars (gantt,
value, inline) every library but Nearley is linear too; on the two context-sensitive
grammars every library goes super-linear**, because the escape hatch each
one needed — a forward scan for a quote's partner, a speculative arrow parse at every word
start — runs once per position. Nearley, whose Earley parse keeps every alternative alive,
does not finish 14 of the 15 ladders. Chevrotain's worst case is the most surprising: 16.5 s
on 2,000 characters of `- - - -`. It is not root-caused; the obvious suspect is the
speculative `BACKTRACK` of the arrow rule at every word start.

Every one of those is fixable with a better-written grammar, and each fix is the same
move: bound the scan, precompute the partner positions, stop trying the arrow where it
cannot start — which is the hand-written kernel's design, re-expressed in a library's
vocabulary.

## Size and startup

| | runtime (min+gz) | grammars + glue (min+gz) | total | cold import, dev form | cold import, shipped form |
|---|---|---|---|---|---|
| incumbent | 0 | 10,147 | **10,147** | 6.8 ms | 6.8 ms |
| Peggy | 0 (output is standalone) | 10,047 | **10,047** | 144 ms (90 building) | **13.4 ms** precompiled |
| Chevrotain | 31,001 | 3,550 | 34,551 | 173 ms (108 building) | 173 ms — no build step |
| Ohm | 25,108 | 2,720 | 27,828 | 460 ms (411 building) | 460 ms — no build step |
| Nearley | 2,951 | 4,233 | 7,184 | 65 ms (44 building) | **12.4 ms** precompiled |
| Parsimmon | 6,051 | 1,935 | 7,986 | 16 ms | 16 ms |
| Lezer (3 of 5) | 17,854 | 2,956 | 20,810 | 62 ms (45 building) | 20.8 ms precompiled |

Bytes are what a browser bundle would add (`size.mjs`), with one scope for everyone:
grammars plus the glue that drives them, and never `shared.mjs`'s policy. The incumbent row
is an upper bound, because its policy tables sit inside the same modules and cannot be cut
out: 6,876 of its 10,147 bytes are `flowchart-grammar.js` whole — the outline reader and two
semantic passes as well as the row scan the `flow` target covers. Cold import is the median
of five fresh processes, and every row loads the shipped kernels inside the timed region.

Chevrotain is already in the tree, but only inside Mermaid, which the runtime loads as its
own `mermaid.min.js` UMD script (`lib/runtime/index.js`). Nothing our own bundle imports can
share that copy, so a kernel that needed Chevrotain would add its 31 KB to the bundle
`lint-core` ships in.

Cold import matters twice here: `node --test` forks a process per file, and the Studio
loads the linter on first paint. **Precompiled, it stops mattering**: Peggy and Nearley load
in 12 to 13 ms against the kernels' 7, at the price of a generated file in the tree and a
build step that `build:check` would have to police (HARD RULE #2's territory). Chevrotain
and Ohm have no build step and pay at every load; Ohm's 411 ms grammar build is the single
largest cost in the field. On bytes, Nearley and Parsimmon are the smallest, Peggy ties the
kernels, and Chevrotain, Ohm and Lezer each add 20 to 35 KB.

## Readability

Code lines for the same behavior, comments and blank lines out (`loc.mjs`). The incumbent
figure counts only the structural functions; `tidy`, `isWs`, `unquote` and `resolveMods`
are policy every challenger calls through `shared.mjs`, so nobody is charged for them.

| | lines | note |
|---|---|---|
| incumbent | 239 | `parseBracketList`, `readArrow` + `splitRow`, the two gantt readers, `NUMERIC_PILL` + `isValuePill`, pill `parse`, `parseInlineState` |
| Peggy | **123** | 81 of them in five `.peggy` files; the rest is glue |
| Parsimmon | **121** | |
| Lezer | 107 | three targets of five |
| Nearley | 218 | |
| Ohm | 231 | includes the generators for the per-cap and unrolled rules |
| Chevrotain | 344 | the grammar is the class; every DSL call site is numbered (`CONSUME2`, `MANY3`) |

Peggy is the one that reads like the spec: `grammars/peggy/value.peggy` is one rule and three
helpers, and it is the `NUMERIC_PILL` regex made legible, with `Sym|0..3|` where the regex has `[^\w\s]{0,3}`.
It is also where the escape hatches are most visible: `axis.peggy` carries mutable
per-parse state and `flow.peggy` compares characters through `input[offset()]`, and a
reader has to know Peggy's scoping rules to follow either.

Error messages come free with every library except Lezer (`errors.mjs`), but none is one we
would show an author. On `12 kgs of stuff` Peggy says ``Expected ")" or [\t-\r …] but "o"
found``, Chevrotain ``Expecting token of type --> EOF <-- but found --> 'of' <--``, Ohm
`Line 1, col 8: expected end of input`. `lint-core`'s diagnostics are written for authors
and name the fix; a library's message would be an input to that, not a replacement.

## What the harness found

**1. A latent quirk in the incumbent — fixed in this PR.** `parseBracketList` decides
whether a quote has a partner by scanning right to left and asking whether the next
non-space character is `,`, `}` or the closing `]`. It seeded that scan with the closing
bracket's own code, so a stray `]` INSIDE the list counted too. In
`` `['90s cohor{, Customer']s spend]` `` the apostrophe before `]s` became a partner, the
leading quote opened, and the comma was swallowed: one member, where the documented rule
says two. Peggy's first grammar followed the documented rule and disagreed on exactly this
fuzz input. The owner chose to fix the kernel: the scan now seeds a sentinel for the closing
bracket, `bracket-list.test.js` pins the two-member reading, and every challenger follows
the corrected rule. Measured before the fix landed: 0 of the 10,129 deck and doc spans read
differently, capped or uncapped, so no shipped deck changes.

**2. A Chevrotain lexer bug that silently drops input.** Chevrotain 12's "first char" lexer
optimization reads the character class `[\s\S]` — the lint-preferred spelling of "any
character" — as whitespace only, so every other character becomes a lexer error and is
skipped: ``tokenize('`a é')`` returns only the space. Our lint rule
(`noEmptyCharacterClassInRegex`) flags `[^]`, and `[\s\S]` is the obvious rewrite. The fuzz
arm caught it as a gantt parity loss the moment that rewrite landed; the harness keeps `[^]`
with a comment saying why. Any Chevrotain grammar we wrote would need the same comment.

**3. Two libraries count characters differently from our kernels.** Ohm's `any` and Lezer's
tokenizer consume a CODE POINT; JavaScript strings, and so every kernel, Peggy, Chevrotain,
Nearley and Parsimmon, count UTF-16 units. An emoji is two units. So a flowchart label of 31
emoji is 62 units — over the 61-unit cap — and the kernel reads it as plain text while Ohm
reads an arrow; `` `😀😀21` `` is four symbol units, over the value pill's three, and the
kernel refuses it while Ohm and Lezer read 21. Neither reading is wrong in the abstract, but
a migration to either library would silently change what emoji-heavy input means, and the
first fuzz had no astral characters, so it could not see this. An independent checker found
the gap.

**4. A bug in a challenger, before it could be believed.** Nearley's first axis grammar
refused a capped part that begins with a comma (`{A, 1,, 2}`). The fuzz found it in its
first run. Every library's first draft had at least one such miss; the table above is the
state after the harness had found them.

## What the independent check found

One checker agent audited the harness before these numbers were written up. It confirmed the
headline — **no challenger calls incumbent structure**: none imports `parseBracketList`,
`readArrow`, `splitRow`, `parseTimePoint`, `parseSpanToken` or `NUMERIC_PILL`, and no impl
carries a copy of a kernel's whole-input regex — and it confirmed `loc.mjs` extracts the
right function bodies (all 13, by hand). It also found ten problems in the secondary
numbers. All are fixed in the tables above, and the list is kept because each one moved a
figure in the incumbent's favor or against it:

| # | what was wrong | effect | fix |
|---|---|---|---|
| 1 | Peggy, Nearley and Lezer compiled their grammars at import, so cold load counted a compiler a shipped build never loads | their cold rows ran 3 to 11x high | `precompile.mjs` writes the shipped form; cold is reported both ways |
| 2 | `speed-cell.mjs` imported the kernels before the incumbent's clock started | incumbent cold read 0.1 ms | cold mode imports nothing before timing |
| 3 | the incumbent's bundle followed `flowchart-grammar.js`'s lazy `./label-set` into two generated catalogs | incumbent size ran ~1.3 KB high | `./label-set` is external |
| 4 | line and byte counts had different scopes: the incumbent was charged for policy (`tidy`, `unquote`, `resolveMods`), and Nearley and Lezer were not charged for their glue | favored the libraries | one scope for all: grammar plus glue, policy out |
| 5 | no astral-plane character was ever fuzzed | hid the Ohm and Lezer divergence | astral code points in every alphabet |
| 6 | the value target tests recognition only | overstated what a grammar replaces there | stated in the answer, 3 |
| 7 | Peggy throws on every reject | dominates Peggy's all-spans column | stated in § Speed |
| 8 | "32 cells" and "10,129 spans" did not reproduce | wrong counts | 33 cells; 10,129 spans, 3,982 distinct |
| 9 | "accepted" meant different things in the two scripts | gantt's accepted-only speed included 58 rejects | one `positive()` in `reference.mjs` |
| 10 | almost no input read differently capped and uncapped | the two axis rows were near-duplicates | 3+-part braced seeds in the fuzz |

## The decision

Four options. Each row's cost is measured above; nothing here is estimated.

| | buys | costs | risks |
|---|---|---|---|
| **A. Keep the kernels; make the harness the contract** *(recommended)* | Nothing gets slower. The fear that hand-rolled does not scale is answered where it is true: a new grammar kernel must pass the same three arms this bake-off built (corpus parity, seeded fuzz, a scaling ladder) before it ships | A small follow-up: turn the scaling shapes into `test:perf` ratio guards per kernel, and write each kernel's grammar as a one-screen spec in its header (as `flowchart-grammar.js` already does) | Each new grammar is still hand-written; the harness makes a bad one visible, not impossible |
| **B. Standardize on Peggy** | The shortest, most spec-like grammars (123 lines against 239), zero runtime, standalone output, bounded repetition and predicates when needed | 5x to 160x slower per span over all spans (Peggy's rejects throw), 1.3x to 10x on accepted spans; quadratic on axis and flow until rewritten; a precompiled parser is a generated file in `lib/` and a new `build:check` step (a CI-contract change, so an owner call on its own) | The HARD RULE #22 exposure moves into grammar files, where a lookahead that scans to the end of input looks harmless |
| **C. Standardize on Chevrotain** | No build step; already a transitive dependency (via Mermaid); the fastest library on axis | The longest code (344 lines) and the most library-specific ceremony; +31 KB to the main bundle; a lexer optimization that silently drops input (§ "What the harness found"); 16.5 s on 2,000 characters of `- - - -` | Its LL(k) analysis silently mis-chose an alternative until one `OR` was pinned to one token of lookahead; nothing reported it but the parity table |
| **D. Lezer, for the editor only** | Highlighting and incremental re-parse of the chart grammars in the Studio's CodeMirror editor | A second grammar beside each kernel, kept honest by this harness; axis and flow need external tokenizers regardless | Two readers of one grammar is what HARD RULE #1 exists to prevent, unless the kernel stays the authority and the Lezer grammar is display-only |

**Recommendation: A.** The measurement says our grammars are small, regular in their easy
parts and context-sensitive in their hard parts, and a library helps with the first and
hurts with the second. Peggy is the right library for the first grammar that is genuinely
recursive — nesting, precedence, an expression language — and nothing we ship today is. D
is independent of A and worth its own brief if editor highlighting becomes a goal.

One smaller call rides on this note: whether the harness should run in CI. It should not:
it needs five uninstalled packages and takes about twenty minutes, which is why it follows
`dom:bakeoff` as an on-demand tool. (The stray-`]` quirk was the other; the owner chose to
fix it, and it is fixed here.)

## Head to head with Segno

The owner's answer to this note was an owned engine, Segno (`2026-09-28-segno-unified-inline-notation.md`).
This section holds it to the same field, and it is meant to be re-run and quoted:
`npm run parser:bakeoff:versus` (`tools/parser-bakeoff/versus.mjs`) prints the tables below.

**How it is kept fair.** Every candidate runs in its own process, so no parser's JIT state
touches another's (measured during this work: one parser slowed 2.5x after sharing a process with
other inputs). Every candidate reads the identical inputs: all 64 bracket lists in the decks,
parsed into parts, and all 4,645 inline-code spans, dispatched. The libraries read today's
syntax; Segno reads the same spans with pills translated to its spelling (`{X}:a:b` becomes
`{X, a, b}`), the only inline syntax that changed. Repetitions are sized per candidate so a
40 ns parser and a 100 µs one both get five stable rounds. The hostile ladder is one parse per
rung, stopped when a rung passes half a second.

**Run of 2026-09-29, Node 22.22, cloud sandbox:**

Per input, best of five rounds (node v22.22.2). Bracket lists: 64; inline spans: 4645.

| parser | bracket lists (split into parts) | inline spans (dispatch) |
|---|---|---|
| Lattice kernels (hand-written) | 942 ns | 33 ns |
| **Segno** | 734 ns | 45 ns |
| Peggy | 6,577 ns | 882 ns |
| Chevrotain | 4,723 ns | 24,605 ns |
| Ohm | 107,161 ns | 24,597 ns |
| Nearley | 66,000 ns | 12,644 ns |
| Parsimmon | 54,267 ns | 1,073 ns |
| Lezer | — | 8,670 ns |

Hostile input: ms for one parse at 2k / 8k / 32k characters; DNF = the rung before took over 500 ms.

| shape | Lattice kernels (hand-written) | **Segno** | Peggy | Chevrotain | Ohm | Nearley | Parsimmon |
|---|---|---|---|---|---|---|---|
| spaces in a member | 1.2 / 1.9 / 3.9 | 0.25 / 0.72 / 1.5 | 2.2 / 3.3 / 14 | 2.2 / 0.70 / 2.3 | 11 / 24 / 104 | 126 / 2,953 / DNF | 7.8 / 10 / 29 |
| unclosed quotes | 0.77 / 2.9 / 7.2 | 0.72 / 1.9 / 7.0 | 64 / 353 / 7,266 | 15 / 88 / 776 | 468 / 6,577 / DNF | 921 / DNF / DNF | 894 / DNF / DNF |
| nested braces | 0.34 / 1.1 / 4.7 | 1.7 / 0.03 / 0.02 | 1.1 / 3.9 / 14 | 2.7 / 4.2 / 22 | 5.4 / 25 / 123 | 172 / 2,494 / DNF | 2.2 / 4.0 / 16 |
| unclosed double quote | 0.49 / 1.7 / 5.7 | 1.3 / 3.9 / 3.2 | 1.4 / 4.3 / 20 | 1.2 / 5.5 / 21 | 17 / 63 / 312 | 1,224 / DNF / DNF | 8.3 / 32 / 116 |

A second run on the same machine agreed with this one to within 25% on every cell, with the same
DNF cells.

**What it says:**

- **Per input, Segno is in the hand-written kernels' class and the libraries are not.** On bracket
  lists Segno was faster than the kernels in both runs (734 and 637 ns against 942 and 827). On
  inline spans it is 1.3-1.4x the kernels. The fastest library is 6.4x Segno on lists (Chevrotain)
  and 20x on inline spans (Peggy); the slowest is 146x on lists (Ohm) and about 550x on inline
  spans (Chevrotain and Ohm, tied).
- **On hostile input, Segno is the only parser besides the kernels that stays linear on every
  shape.** Its worst case is 7-8 ms at 32,000 characters. Peggy took 7.3 s on the unclosed-quote
  shape, Chevrotain 776 ms, and Ohm, Nearley and Parsimmon did not finish it.
- **Read the unclosed-quote row with care.** It is the bake-off's shape, an unclosed apostrophe:
  a quote in today's syntax, ordinary text in Segno's. The row is kept for every candidate as-is,
  and the "unclosed double quote" row is Segno's real equivalent, where it also stays under 4 ms.
- **Segno's flat nested-braces row is a refusal, not a parse.** It stops at its 31-level cap with
  an error, by design.

**Caveats.** Absolute times move by up to 2x between machines and runs on this sandbox; the ratios
and the growth along the ladder are what carry. Lezer's grammar set does not cover bracket lists.
The libraries' grammars are the bake-off's own, written to parity with the kernels, and none was
tuned for speed beyond that.

## Reproduce

```bash
npm i --no-save peggy@5 nearley@2 moo ohm-js@17 parsimmon @lezer/generator @lezer/lr
npm run parser:bakeoff                 # parity table (about three minutes)
npm run parser:bakeoff:speed           # throughput, scaling, cold, size (about 20 minutes)
npm run parser:bakeoff:versus          # Segno head to head with the kernels and the libraries (about 20 minutes)
node tools/parser-bakeoff/loc.mjs      # code lines per candidate
node tools/parser-bakeoff/errors.mjs   # each library's own error message
```

Measured on the cloud sandbox (Node 22.22). Absolute times move with the machine; the
ratios between rows and the growth ratios in the scaling ladder are what carry.

## What this does NOT claim

- **Not that a grammar library is wrong for Lattice in general.** A genuinely recursive
  language — expressions, nesting, a formula language, a future transform DSL — is where a
  parser generator earns its keep, and none of the five targets is one.
- **Not that the challengers were written as well as they could be.** Each was written
  idiomatically, once, by one author, and driven to parity. A specialist could make any of
  them faster; the quadratic lookaheads in particular have known rewrites, which is the
  point — they are rewrites back toward a hand-written scan.
- **Not a verdict on Lezer for the Studio editor.** Highlighting the chart grammars in the
  editor is a separate, real want. This bake-off only says Lezer cannot be the ONE parser
  for these kernels without delegating their hard tokens to hand-written JS.
- **Not that flowchart-grammar.js was measured whole.** The `flow` target is the row scan
  (`splitRow` on a single text segment). The outline reader and the two semantic passes are
  not parsing and no library would replace them.
