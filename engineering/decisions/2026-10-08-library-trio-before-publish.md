---
status: shipped
summary: The adversarial trio over LTT, Segno and Trama before their first npm version — the verdicts, every finding and what happened to it; all nine libraries now point TypeScript at their built .d.ts, and LTT's reader accepts every 1.x file.
---

# Library trio before the first publish: LTT, Segno, Trama (2026-10-08)

**The answer.** The trio rated all three libraries **FIX-FIRST**, and after this change they
are fit to publish as 0.1.0. One defect was shared and serious. Every one of the nine
workspace libraries pointed TypeScript users at its raw `.ts` source instead of the `.d.ts` it
builds. An outside project with common strict settings therefore type-checked our source under
its own rules, and got 904 errors inside our packages; `skipLibCheck` does not help, because it
skips only `.d.ts` files. All nine now point `types` at `dist/*.d.ts`. The second defect would
have been permanent. LTT's reader rejected any file whose `version` was not exactly `"1.0"`, which
contradicts the spec's own rule that a minor revision only adds optional fields. Every 0.1.0
reader in the wild would then have refused every LTT 1.1 file. It now reads any `1.x`. Each
remaining finding is either fixed below or ruled on, with the reason.

The owner ruled on 2026-10-08 that these three get the trio before their first npm version
(`2026-10-08-library-audit.md` §6.3). They publish as dependencies of `@laticent/lattice`, and an
npm version number can never be reused.

## 1. How it ran

The owner set the shape: one trio, three agents on Opus, each lens covering all three libraries
(rather than nine agents, one per lens per library). The three libraries share their packaging
and their build, and a lens sees a cross-library defect such as the types one only when it holds
all three at once. Each agent packed the libraries with `npm pack`, installed the tarballs into a
scratch project, and probed the installed `dist/` as an outside user would.

| Lens | The question | Verdict |
|---|---|---|
| Red team | How does a hostile caller, or hostile input, break it? | FIX-FIRST, all three |
| Inversion | How would we make sure we regret this 0.1.0 in a year? | LTT and Segno FIX-FIRST; Trama SHIP after the types fix |
| Checker | Does it do what its README and comments claim? | FIX-FIRST, all three, for the types fix; the code held under fuzzing |

## 2. What held

The checker and the red team report these as tested, not assumed.

- **LTT.** `validateLtt` never threw on 30,000 mutated files, cyclic input or million-deep
  nesting. Every file it accepted round-tripped through `pack` and `unpack`, and `timeline` and
  `positionAt` stayed finite. Neither `pack` nor `makeCursor` mutates its input, and a packed file
  with a `__proto__` key polluted nothing. `dist/` and the schema were current.
- **Segno.** Parsing stayed linear on inputs of a million characters, and the depth caps return an
  error rather than throwing. The generated parser and the reference parser agreed on 100,000 fuzzed
  spans, including characters the existing fuzz never used. `generate()` escapes hostile names, and
  every README example produced its documented output.
- **Trama.** Layouts are deterministic, and mutating a result does not corrupt the cache. An empty
  graph, self-loops, prototype-named ids and an unknown edge endpoint all behave. `solveStar`'s
  floors held for 0 to 20 nodes, and `placeLabels` counted every overlap exactly once.

## 3. Findings and outcomes

IDs are the lens's own: `R` red team, `I` inversion, `C` (or a bare number) checker. Where two
lenses found the same thing, both IDs are listed.

### All three libraries

| ID | Finding | Outcome |
|---|---|---|
| X-1 · X-R1 · CROSS-I1 | `types` pointed at `./index.ts`, so consumers compiled our source under their settings: 904 errors with `noUncheckedIndexedAccess`, 914 with more. | **Fixed, all nine libraries.** `types` names `dist/*.d.ts`; the source stays reachable in this repo through a custom `@laticent/source` condition that `docs/tsconfig.json` enables. `test/unit/tools/package-nodenext-types.test.js` now compiles the packed tarballs with those strict flags, and fails on the old `package.json`. |
| CROSS-I2 | Six error styles across the three APIs. | **Ruled: fine for 0.x.** Changing it now would be a redesign; recorded in `followups.d/2609-p3-library-api-revisit-0-2.md`. |
| CROSS-I3 | Each entry bundles its own copy of shared classes. | **Fixed where it bites** (Segno's error classes, SEG-R3); the rest is in the 0.2 follow-up. |
| — | No `engines` field. | **Ruled: left as is.** The newest API in `dist/` is `Object.hasOwn` (Node 16.9), and the root package's `engines` already covers the install. |

### LTT

| ID | Finding | Outcome |
|---|---|---|
| LTT-I1 | The reader refused any `version` but `"1.0"`, against the spec's minor-revision rule. Permanent once readers exist. | **Fixed.** `validateLtt` accepts `^1\.[0-9]+$` and refuses a new major; the type and schema say `1.<minor>`. |
| LTT-I2 · LTT-I3 | The spec lived in `engineering/ltt.md`, a path the owner ruled will move, and the frozen README linked it. | **Fixed in this PR:** the spec moves to `spec/LTT-1.0.md` and the site (`/spec/ltt/`), and the README links the site. |
| LTT-I4 | The spec's §Staleness gave a two-element hash input; the code adds `emphasis` as a third. | **Fixed in the spec text,** which now states the three-element form the code has always used. |
| LTT-2 | `charOffset` never said what it counts. | **Fixed:** UTF-16 code units, in the types, the schema and the spec. |
| LTT-3 · LTT-R1 | `canonicalJson` wrote `[1,,3]` for a sparse array, `{}` for every `Date`, and `null` for a function key. | **Fixed:** it follows `JSON.stringify`'s rules. No stored hash moves, because a valid LTT file holds plain JSON only. |
| LTT-1 | No test pinned that an action fires on the exact word it names. | **Fixed:** two probes in the shared fixture `tour-recorded-waits.json`, at 249 ms and 250 ms. |
| LTT-R2 · LTT-I5 | The schema's `$id` URL returned 404. | **Fixed:** the site serves the schema at its `$id`, now `https://lattice.style/schemas/ltt-1.0.schema.json`. |
| LTT-R3 | `unpack` threw raw `TypeError`s on malformed input. | **Fixed:** it names the part that is wrong. |
| LTT-R4 | `timeline(ltt, { greeting: 'constructor' })` read the prototype and threw. | **Fixed:** own keys only; tested. |
| LTT-I6 | Mixed type naming (`Cue` beside `LttSegment`). | **Ruled: fine for 0.x**, in the 0.2 follow-up. |
| — | The package is AGPL while the spec it implements is CC-BY. | **Owner call, flagged:** the license stays AGPL for 1.0 (owner ruling 2026-10-08), so an outside implementer reuses the spec and its schema from `spec/`, not from the tarball. |

### Segno

| ID | Finding | Outcome |
|---|---|---|
| SEGNO-I1 | Callers detected a stack failure by comparing English text (`STACK_EXHAUSTED`). | **Fixed:** a `ParseError` now carries `code: 'stack'`, from both `compile()` and the generated parser. The string stays exported. |
| SEG-R1 | `chars()` and `charRange()` built broken sets, silently, from emoji and other characters outside the BMP, and accepted a backwards range. | **Fixed:** both throw and point at `lit()`. An empty `chars('')` stays legal: the engine's own tests build nullable pieces from it. |
| SEG-R3 · SEGNO-I3 | `SchemaError` from `/read` was not `instanceof` the root's `SchemaError`. | **Fixed:** `SchemaError` and `GrammarError` carry a registered-symbol brand, and `instanceof` checks it. |
| SEG-R6 | `lint()` on 3,000 overlapping branches took 12.7 s and built 4.5M strings. | **Fixed:** it names ten pairs per alternation and counts the rest; the same input now takes under 0.1 s. |
| SEG-R7 | A JSON spec with a `__proto__` rule threw an internal `TypeError`. | **Fixed:** `compile()` refuses the name as a `GrammarError`. |
| SEGNO-I2 | About 60 exports, including engine internals and the unratified notation. | **Fixed in the README:** a "What is stable" section marks the grammar engine and the notation grammar experimental and points at LFM 1.1 §3.6 as the notation's spec. Un-exporting is in the 0.2 follow-up. |
| SEGNO-3 | A newline is not whitespace in the notation. | **Ruled and documented:** the notation is one line, as Markdown inline code is. |
| SEGNO-I5 | "Never a stack overflow" overstated the guarantee. | **Fixed:** the README says it returns an error. |
| SEGNO-2 · SEG-R2 | `1.234,5` reads 1,000 times too small; `--5`, `(5`, `1,2,3` read as numbers. | **Deferred, with a reason:** Segno mirrors `lib/core/chart-values.js` on purpose and a parity test holds them together, so the fix changes how every chart reads values. That is a rendered-surface change owing its own demo deck (HARD RULE #9). `followups.d/2609-p2-segno-number-reader-misreads.md`. |
| SEG-R4 | An alias error is a plain `Error`, not a `SchemaError`. | **Ruled: correct as is.** It is a type-builder argument error, the same style as `lit('')`; `SchemaError` is for an ambiguous schema. |
| SEG-R5 | `parse()` returns `diagnostic`, `record().read()` returns `diagnostics`. | **Ruled: correct as is.** The names follow the cardinality: a parse stops at one problem, a record read collects several. |
| SEGNO-4 | The parity fuzz's alphabet lacked some characters. | **Ruled: coverage only.** The checker's own fuzz with them found nothing. |

### Trama

| ID | Finding | Outcome |
|---|---|---|
| TRAMA-1 | X-1, including `./radial`. | **Fixed** with X-1. |
| TRAMA-2 | A cache hit came back on `Object.prototype` where a fresh layout used null-prototype records, so the two were not equal. | **Fixed:** the hit restores the null prototype; tested with a shape named `constructor`. |
| TRAMA-3 · TRA-R2 | The README said "Not yet on npm", and twice "centre". | **Fixed.** |
| TRAMA-4 | The README's example passed a Lattice-internal global. | **Fixed:** it passes stock dagre as `{ layout, Graph: graphlib.Graph }`, checked against a real dagre build. |
| TRA-R3 | `solveStar` returned `bad: []` with NaN geometry for invalid input. | **Fixed:** invalid input is reported in `bad`; tested. |
| TRA-R5 | The worker loaded any `script[src]` named like dagre, including an inert one. UNCONFIRMED (needs a browser). | **Fixed anyway:** only a script of a JavaScript type is used. Cheap, and it closes the path. |
| TRAMA-I1 | `LayoutOptions` published seven internal fields. | **Fixed in the docs:** marked `@internal`, and the README says they are not API. |
| TRAMA-I3 | `paint` returns markup the pipeline sets as `innerHTML`. | **Fixed in the docs:** the README states the threat and marks the adapter API experimental. |
| TRA-R1 | The route solver's budget does not bound wall-clock time: 79 s at 160 shapes and 480 edges. | **Deferred:** a perf change owes a bench scenario and before/after numbers (HARD RULE #19), and moves layouts the goldens pin. `followups.d/2609-p2-trama-route-wall-clock.md`. |
| TRA-R4 | `layout(…, null)` was said to throw. | **Not reproduced:** it returns `null`, as documented. |
| TRAMA-I2 · I4 · I5 · I6 · TRAMA-5 | Worker shaped by the Lattice global, cryptic radial helpers, three rectangle shapes, no disposer, NaN `route()` input. | **Ruled: fine for 0.x**, in the 0.2 follow-up (TRAMA-5 is a documented precondition). |

## 4. What is left, and where it is tracked

- `followups.d/2609-p2-segno-number-reader-misreads.md`: the two number-reader defects.
- `followups.d/2609-p2-trama-route-wall-clock.md`: the route solver's time bound.
- `followups.d/2609-p3-library-api-revisit-0-2.md`: everything ruled fine for 0.x.

Not verified here (HARD RULE #23): Trama's pipeline in a real browser (font measurement, the
worker, an adapter's paint), and a real `npm publish`. Both are UNVERIFIED; the first publish
(release plan slice E) exercises the second.
