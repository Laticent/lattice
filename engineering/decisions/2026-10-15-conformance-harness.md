---
status: proposed
summary: An audit of what every kind of thing in Lattice owes — components, themes, finishes, settings, render surfaces, exporters, plugins, libraries and more — and how much of it is checked. 242 stated expectations, 112 classified fix commits and the joins between kinds show the gates leak in seven repeatable ways. Proposes conformance contracts per kind, built on the harnesses that already exist, ordered so each PR catches real defects, with stated limits and anti-gaming rules.
---

# Conformance harnesses: what each kind of thing owes, checked for every instance

**Scope.** Every kind of thing a contributor adds to Lattice, every axis it is rendered under,
and the joins between them. Measured on `main` at `d2a6e6f`. This note proposes work and
changes no code. The raw evidence is in the folder beside it:
[`explicit.md`](2026-10-15-conformance-harness/explicit.md) (242 stated expectations),
[`implicit.md`](2026-10-15-conformance-harness/implicit.md) (112 classified fix commits, 45
incidents, 232 gotchas, 260 follow-ups) and
[`joins.md`](2026-10-15-conformance-harness/joins.md) (25 axes and their coverage). Each was
written by one agent and recounted, not re-judged, by a second (§11).

---

## 0. In plain words

Say someone adds a component called `timeline-v2` tomorrow. Today, whether it ships complete
depends on that person remembering about twenty things: write the docs, add it to the gallery
deck, follow card alignment if it has cards, pass contrast in dark mode, work on a split page,
survive PPTX export, appear in autocomplete. Some checks catch some of it, but only when the
component is on the right list or sets the right flag. When it is not, nothing complains.

A **conformance contract** replaces remembering with a checklist that runs itself:

- **One checklist per kind of thing** (component, theme, finish, deck setting, exporter, …),
  written once, in code.
- **The checks find every instance themselves.** `timeline-v2` is checked because its folder
  exists, not because someone added it to a list.
- **Each item is one of three kinds:** always required; required *when it applies*, detected
  from what actually renders rather than from what the thing claims; or checked *if present*.
- **The checks cover combinations too.** A component is checked in every theme, light and dark,
  under every finish, on split pages, in every export format, because most real bugs live in a
  combination (§4).
- **Known failures go on a written list with a reason**, and the list is hard to grow (§6.3).
- **The checklist doubles as the scaffold.** `npm run new:component` generates every required
  part, so most items pass on day one.

The result is one table per kind: a row per instance, a column per checklist item, each cell
pass, fail, not applicable, or known debt. Fast checks block every PR. The heavy rendered checks
block a PR for what it touched and run in full overnight (§6.4); how much render time a PR may
spend is measured first, then set with you (§12.4).

## 1. The answer

Lattice does not lack tests. It has about 96 `check*` gates in `tools/check-ownership.js`, four
nightly oracles, spec suites for LFM, the theme contract and the `.lattice` file, and **two real
per-instance harnesses**: plugins (`test/unit/plugins/conformance.test.js`) and components
(`test/integration/invariants/component-invariants.test.js`, which renders one sample of every
component in a single batched deck and checks required slots, overflow and heading contrast; a
new component "is covered the moment its manifest lands"). What is missing:

1. **The gates are organized by rule, not by kind.** "No hex literal" walks every CSS file and
   works. Nothing says "here is everything a component owes". Of the **242 expectations the
   repo states** about its artifacts, 89 are enforced automatically for every instance; **65
   have no blocking check, 24 run on a hand-written list, and 8 apply only to instances that
   opt in**. The rest are partial or mixed, and 26 rows could not be confirmed by grep
   (`explicit.md`).
2. **Things are checked alone, or on one sample, not in combination.** Of the 25 axes an
   instance is rendered under, about six or seven joins are checked across all their values
   (`joins.md`). The component harness renders one sample per component, in one theme, light
   only. The biggest class of fix commits, **30 of 112, is "a second path diverges"**: the PPTX
   export, the reader view, the player or the Marp bundle drops what the main render had.
3. **Nothing says what a new X owes.** A contributor reverse-engineers a sibling, and the
   checks they miss are the ones nobody runs.

**How much would this have caught?** An upper bound, graded by one agent: of the 68 engine-side
fix commits in the last 600, a check that walked every instance on every axis would have failed
36 (53%) before merge, and 25 more with an extra assertion or a real browser. Counting every
kind the contracts claim (packages, generated files, parsers, gates), it is 39 of 92 (42%). The
true per-PR figure is lower, because the heavy checks run in full only nightly. Each phase re-grades
history against its own clauses and reports its real catches (§6.5).

**Recommendation:** extend the two harnesses that exist into contracts for every kind, rather
than building a new framework beside them. Order the work so **every PR catches defects that
exist today**, and extract the shared contract shape early but thin. §9 has the order, which the owner
chose over the earlier one (§12.1).

## 2. How the gates leak: seven failure modes

Every finding in this note, and every "would catch" commit in `implicit.md`, falls into one of
these. The design answers each.

| # | Mode | What happens | Example |
|---|---|---|---|
| 1 | **Opt-in** | A contract governs only instances that declare it; nothing asks whether one *should* have | Card alignment: 18 of 75 components declare `cards`. `stats`, `actors`, `kpi` have card rows and never did, so a deck's `cards:` does nothing on them |
| 2 | **Hand list** | A check runs on a list someone maintains, and nobody adds the new one | Contrast, palette and axe sweeps run on a hand-written gallery deck missing 18 of 75 components and most variants, so `list-steps converge` ships white text at 3.01:1 |
| 3 | **No registry** | No single list says what the instances are, so no consumer can be checked against it | No list of front-matter keys: `finsh: halo` lints clean |
| 4 | **One way** | Declared ⇒ implemented is checked; implemented ⇒ declared is not (or the reverse) | `checkVariantDeclaration` (`check-ownership.js:477`) leaves "declared but unimplemented" to manual review |
| 5 | **Combination unchecked** | Each side passes alone; the join breaks | `tone-edge` missing on auto-split pages, fixed twice the same day (`ed9a233`, `7912dd7`). The Studio sanitizer stripped `vector-effect` from every Studio artifact and exported player while the unit suite stayed green (`test/unit/core/sanitize-slide-html.test.js:54-61`) |
| 6 | **Debt absorbed** | A ratchet baseline accepts existing failures without a reason, so they become permanent | The nightly player-contrast baseline accepts 242 sub-AA text runs, 123 below 2:1 |
| 7 | **Vacuous gate** | The check cannot fail, or measures the wrong thing | An overflow assertion that could not fire (`e7f58b87`); the contrast probe reading the wrong background for `topic` (§3.1) |

## 3. What the audit measured

### 3.1 Components (75)

| Finding | Mode | Evidence |
|---|---|---|
| **Card alignment is opt-in with no reverse check.** `stats`, `actors`, `kpi` hard-code their own alignment | 1 | `lib/core/resolve-cards.js:31`; `stats.styles.css:142-147`; `actors.styles.css:19-24,48`; `kpi.styles.css:643-648`; none in `cards-catalog.generated.js` |
| **18 of 75 components never reach a rendered contrast, palette or axe check** | 2 | bar, bullet, collage, columns, flowchart, heatmap, line, matrix-grid, premise, rows, scatter, scene, slope, stacked-bar, team-profile, topic, video, waterfall. Consumers: `slide-contrast.test.js:86-88`, `palette-sweep.suite.js`, `axe-a11y.test.js:75` |
| **Variants are the same hole one level down.** I rendered all 75 generated galleries (858 slides) and ran the existing contrast probe: 14,196 text runs, 23 flagged, against 1,612 runs on the hand-written deck. `list-steps converge` sets white body text at **3.01:1** (AA is 4.5:1). Confirmed on the rendered slide and re-measured by the checker | 2 | `tools/check-slide-contrast.js` over every `*.gallery.md` |
| 11 of the 23 flags are `topic` at 1.02:1. **That is the probe's error**: the tab labels sit on a light band and the probe read the slide's dark background. Enrolling everything amplifies probe error, so the probe is fixed first | 7 | rendered `topic.gallery.md` slide 2 |
| The component harness renders one sample per component, one theme, light only; body-text contrast is "phase 2" in its own header | 2 | `component-invariants.test.js` header and `:140` |
| Frame conformance (render matches the declared Form) is opt-in | 1 | `conformance: "strict"` on 5 of 75 |
| Capacity contracts are opt-in, and every capacity lint depends on them | 1 | 23 of 75 declare `capacity` + `escalateTo`; 22 of 24 charts declare none, so a seventh series silently cycles hue (`design/skills/chart-component.md:30`) |
| Mutually exclusive variant axes must declare `exclusive`, or Reshape writes combinations that cannot render | 1 | 3 of 53 components with variants declare `variantAxes` (`design/design-system.md:425-431`) |
| A manifest with no prose fields gets no docs and no gallery, and the docs check passes | 1 | `isEnriched`, `tools/build-component-docs.js:70,864` |
| A missing `.styles.css`, or CSS with no manifest, passes every gate | 3 | `check-ownership.js:1474`; `manifest-schemas.js:222-248`; live: `lib/components/connect/_qr-card/` |
| The anatomy block is never checked against the render. The layout audit calls it the #1 "docs vs image" failure and one of its two highest-recurrence classes | none | `engineering/decisions/2026-06-06-layout-audit/README.md:71,347` |
| The manifest's own autocomplete offers 9 of 58 schema keys | 3 | `docs/src/components/studio/manifest-complete.ts:11` |

### 3.2 Deck settings, slide settings, treatments

| Finding | Mode | Evidence |
|---|---|---|
| **No unknown-key lint**: `finsh: halo`, `themee: x`, `size: huge` lint clean (exit 0) | 3 | `npm run lint:deck`, run three times for this note |
| Keys are listed in four hand-written places that check only each other | 3 | `FRONT_MATTER_KEYS`, LFM 1.1 §2.3, `base.registers.docs.md`, conformance JSON |
| `icon`, `avatar` lack key autocomplete; `plugins`, `greeting`, `closing` are documented but not offered | 3 | `editor-complete.ts:59` never reads `pluginRegisters` |
| Several keys are lint-silent on values: `theme: nosuchtheme`, `size: huge`, and 13 whose only value list is a docs-site file | 3 | `STATIC_VALUES`, `editor-complete.ts:94` |
| `spectrum-card*`, `spectrum-trim`, `avatar` have no spec row and no conformance case | 2 | `SOURCES` map, `lfm-conformance.test.js:91-104` (26 keys) |
| No JSON Schema for front matter; no hover docs | 3 | — |
| `tint-bogus`, `mark-nonsense`, and `tint-corner` without an `at-*` placement all lint clean, though `treatments.md` says a validator catches the last | 3 | `lint-core.js:506`; `engineering/treatments.md:64,227` |
| A register a component does not honor is silently inert; `modifier-effects.generated.json` already knows, but runs on demand only | 1 | `joins.md` §5 |
| Slide classes are **closed**: lint and autocomplete derive from manifests, 75 of 75 match | ✓ | `buildVocab`, `lib/authoring/lint.js:122` |

### 3.3 Themes, finishes, contrast

| Finding | Mode | Evidence |
|---|---|---|
| Token completeness passes: 33 of 33 themes, 118 tokens; manifests schema-valid | ✓ | `tools/theme-conformance.js` 19/19; `contrast-audit.js` 0 failures over 891 pairs |
| **242 sub-AA runs accepted, 123 below 2:1**, nightly only | 6 | `test/oracle/player-contrast.json` |
| **No check measures text over a finish**; only the nightly player sweep touches finish decks at all | 3 | `finish-canvas-contract.test.js` checks the computed `--fin-canvas`, not contrast |
| The a11y themes' dark side is never audited: 39 `light-dark()` dark branches in `a11y-base` | 4 | `tools/contrast-audit.js:69` decides dark per file |
| Finish recipes have no schema; a typo is silently clamped to a default | 3 | `lib/finishes/finish-generate.js:110` |
| Texture sets are not checked as all-12-or-none; `--muted-mark` used as text is not caught | 1, none | `accessibility-textures.test.js:218`; `design/skills/theme.md:350` |
| The chart no-black-paint check covers 3 of 33 themes | 2 | `tools/check-viz-render.js:71` |

### 3.4 Surfaces, exporters, plugins, libraries

| Finding | Mode | Evidence |
|---|---|---|
| **Render surfaces are not a kind anywhere.** The reader view, exported player, Present, Playground, Studio preview and dev server each project the deck their own way; 9 fix commits and 46 gotchas concern them | 5 | `implicit.md` §1, gotcha totals |
| Exporters share no deck × every-format run. Only `strip-notes` enumerates `OUT_FORMATS` | 2 | `strip-notes-every-format.test.js:216`; `chart-export.spec.ts:18` |
| An export run that prints OVERFLOW or palette warnings still exits 0 | none | `design/skills/cli.md:28-30` |
| Export-to-Marp has 11 unmirrored constructs of 30, and nothing checks a component against that ledger | 5 | `lib/core/marp-fidelity.js:46` |
| Plugins: 7 of 7 enrolled and exercised — the model. Chart-family's 24 `kernel` members are not each exercised; a plugin renderer escaping author text is unchecked | 2, none | `conformance.test.js:143-211`; `spec/LPM.md:221-222` |
| Spin-off libraries (Cadenza, Trama, Calco, Tavola, Fuoco, Suono, LTT, Anima, Lente, Segno, Vetrina) each get a hand-written boundary check | 2 | `check-ownership.js:8649-9271` |
| Every slide surface owes keyboard, wheel and touch through `present-transport`; six hand-listed specs, no census | 2 | `2026-08-10-input-verb-parity.md:12,80` |
| "Any new preview surface owes the font gate"; one surface is tested | 2 | `engineering/jank.md:50` |
| Markdown ingests normalize line endings by hand-list | 2 | `2026-08-04-line-endings-lf-boundaries.md:129-138` |
| The deck-quality rubric is switched off under `lint:deck --all`, so it never runs on shipped examples | 2 | `tools/lint-deck.js:169` |
| **Components that never enter the tree are never checked**: Studio-authored and AI-generated local components, `.latticepack` files, installed packages and user themes | 3 | `lib/layout/gate.js`, `lib/packages/gate.js` |

### 3.5 Docs that state something false

`design/skills/theme.md:337` says to add a palette to `THEMES` in `token-parity.test.js` (it is
derived now), and `design/design-principles.md:55` says fonts must be on Google Fonts
(`tools/check-fonts.js` enforces self-hosting). Logged as follow-ups 2711-p2 and 2711-p3. Note
that a "does every path the doc names exist" check would pass both: `token-parity.test.js`
exists, and the font claim names no path. §6.2 family F says what would catch them.

## 4. Where bugs actually come from: the history

`implicit.md` classifies the 112 defect fixes in the last 600 commits (2026-08-18 to
2026-10-15):

| Class | Fixes | What a contract needs to catch it |
|---|---|---|
| A second path diverges (export format, reader, player, Marp bundle, dev server, installed package) | 30 | Surfaces and exporters as kinds; one coverage deck through every path |
| App behavior or state (17 Studio, 1 surface) | 18 | Mostly out of reach (§8) |
| Hand list or stale generated artifact | 11 | Discovery enrollment; generated files as a kind with a freshness clause |
| Parse or grammar edge | 10 | One shared reader per grammar, with cases |
| Dark-mode or palette contrast | 9 | Every variant × theme × scheme |
| Gate blind or vacuous | 9 | Every clause proves it fails, and for the right reason |
| Fit at a size, venue or long label | 8 | Every variant × size, at `capacity.soft` |
| Untested combination (modifier × component, register × slide) | 6 | A clause per register: honored, with a measured effect |
| Split page loses something | 4 | Split as an axis, token *and* selector |
| Taste | 4 | Out of reach (§8) |
| Security or resource | 3 | Fuzzing, not enumeration (§8) |

Decision-note incidents agree: of 45, an enumerating check catches 15, catches 23 more with an
extra assertion, and misses 7.

## 5. What the adversarial review changed

The first version of this note proposed a new framework, `lib/conformance/`, with components
first. A red team, a Munger inversion and an independent checker attacked it. Their findings
that change the design, all verified:

| Finding | Was | Now |
|---|---|---|
| **A component harness already exists** (`component-invariants`, discovery-enrolled, batched into one render) and the note missed it | Build a second harness beside it | Extend it: it becomes the render tier of the component contract (§6.1) |
| **The existing gates cannot be reused as-is.** All 96 `check*` gates push into a shared `errors` array, 40 take nothing else, and most walk the whole tree (`checkHexLiterals` walks `LIB_DIR` and decides stale sanctions globally); scoped to one component, every other file's sanction looks stale | "Gates become clause bodies, not rewrites" | A clause reads a gate's whole-tree output filtered by path. A gate is refactored into find-offenses + policy only when a clause needs it, one at a time (§6.1) |
| **Phase 1 caught nothing that exists today**; the repo has stalled multi-phase plans before (`2026-06-22-the-fit-spine.md` is still in progress) | Framework first | Each phase must catch current defects; the shared shape is extracted thin, in the first phase that needs it (§9) |
| **Restyling in place is unsound for modifiers and registers**: transforms read the class list (`lib/transformers/masthead-lift.js:49,83`; `resolve-mode.js`) | ~305 axis values toggled in place at 32 ms each | Only theme, scheme and finish restyle in place, and only with a per-PR native-render sample. Registers and modifiers re-render until traced (§6.4) |
| **"Changed instances" misses shared code.** A diff to `lib/core`, `lattice.css` or `build-css.js` changes no instance, yet that is where split, cascade and export fixes landed | Per PR, changed instances only | Per PR: the reverse-dependency closure of the diff, plus a fixed covering sample across every axis whenever shared code changes (§6.4) |
| **The escape hatches can be gamed**: free-text debt, one-line "does not honor" declarations, placeholder capacity numbers, fixtures that fail for the wrong reason, two exemption systems | Laws as stated | Anti-gaming rules (§6.3) |
| **A detector is a probe and can be wrong.** `hasCardRow` was undefined and one fixture proves nothing about its miss rate | One failing fixture | Each trigger is measured against a hand-labeled corpus before it blocks (§6.3) |
| **Per-PR render cost collides with a live cost effort** (`2026-08-18-inspection-oracle-catalog.md`, in progress: per-PR CI ≈ 11 min wall, lever A = fewer renders) | Measure after building | A render budget is measured and set in phase 2, before the per-PR render tier blocks, and every render clause uses lever A's one-deck batching (§12.4) |
| **Missing kinds and axes**: font face; speaker note, `say:` line, review comment; docs-site page at three widths; sample assets; the VS Code Marp preview; the diagnostic-code registry; CLI options; out-of-tree components; color modes `system`/`inherited`, `lang`, lens, motion and reduced motion, notes, install path, pane | Absent | Added (§6.2, §7) |
| Numbers: 858 slides, not 947 (947 counted front-matter delimiters); "65 with no *blocking* check"; 25 axes; the two split fixes landed the same day; the 53% is an upper bound | — | Corrected in this note; the raw harvests keep their original counts, with a header saying so |

## 6. The design

### 6.1 Build on what exists

| Existing | Becomes |
|---|---|
| `component-invariants.test.js` (render, discovery, batched) | The component contract's render tier, widened from one sample to every variant × the axes in §7 |
| `test/unit/plugins/conformance.test.js` | The plugin contract, unchanged; the model for author-written cases |
| `FAMILIES` (`tools/manifest-schemas.js`) | The pattern for the contract registry: fails on an uncovered instance and on a contract that governs nothing |
| `gallery-contract.test.js` debt ledger | The pattern for the ledger |
| `KINDS` (`lib/packages/kinds.js`) | The spine for package kinds. Kinds that are not packages (deck setting, surface, exporter, ingest, …) get new registries of the same shape |
| The 32 `SANCTIONED_*` allowlists in `check-ownership.js` | Stay where they are; the ledger *reads* them, so there is one exemption system with two storage places, not two systems |
| The 96 `check*` gates | Unchanged. A clause reads a gate's output filtered to its instance's paths. A gate is refactored into a pure `findX(files)` plus a policy wrapper only when a clause needs that, and the refactor rides that clause's PR |
| `guide-handles.test.js` | The model for a trigger: derive the set from what renders, keep a sanctioned-exceptions list |

The new code is thin: a contract per kind (enumerate + clauses), one runner, one ledger, one
generated checklist page. This is the thin core, not a second harness: the component render tier
stays in `component-invariants.test.js`, and the plugin contract stays in its own test.

```
lib/conformance/
  kinds/<kind>.contract.js        enumerate() + clauses[]
  axes.js                         each axis: its value source, and restyle or re-render
  run.js                          instance × clause × axis value → verdict
test/conformance/
  debt.json                       the ledger
  static.test.js                  every static clause (npm test)
dist/engineering/conformance.md   generated: what each kind owes, and the live matrix
```

A clause:

```js
{
  id: 'component.cards.governed',
  level: 'conditional',
  tier: 'render',
  axes: ['theme', 'scheme'],
  trigger: (c, dom) => equalSiblingBoxesAlignedLocally(dom),   // geometry, not markup
  check:   (c) => Boolean(c.manifest.cards),
  fails:   'test/conformance/fixtures/undeclared-card-row/',    // must fail with THIS id
  passes:  'test/conformance/fixtures/declared-card-row/',      // its near-twin must pass
  catches: [],  // none in the 600-commit window; reason: the owner's 2026-10-15 report (stats, actors, kpi)
  why: 'engineering/decisions/2026-09-01-card-stack-vertical-alignment.md',
}
```

### 6.2 Kinds, and what each owes

Status: ✓ exists and finds its instances · ◐ opt-in, hand-listed, partial or nightly · ✗ no
check. Full rows with sources are in `explicit.md`.

**Family A — what a deck is built from**

| Kind (count) | Key clauses | Status |
|---|---|---|
| **Component** (75) | manifest present, schema-valid, both ways with its CSS · variants both ways · docs and gallery generated, one slide per variant · lint and autocomplete know it · anatomy matches render · capacity + `escalateTo` declared and *measured* · exclusive variant axes declared · manifest skeleton renders, not only the gallery · every variant × §7 axes: required slots, no overflow, AA contrast, axe · card row ⇒ `cards` · `[data-family]` ⇒ every tier fires · declared Form ⇒ render matches · each register honored (measured effect) or declared inert · every construct used has a Marp-ledger row | ✓ files, one-sample render; ◐ variants, contrast, axe, capacity, Form; ✗ anatomy, register honoring, card trigger |
| **Chart** (24, also components) | ≤ 6 categories or `capacity` declared · labels on the canvas · marks emitted = marks declared · empty, single-row, long-label cases · shared vocabulary (status words) means the same in every member · chart-finish × theme · rasterizes without black paint in every theme | ◐ marks, a11y; ✗ edge cases, vocabulary, categories |
| **Diagram / Mermaid** | scoped token selectors · ink and non-text contrast both schemes | ✓ |
| **Form** frame/cell/tile | manifest · cross-references · `accepts`/`fits` lint · `function.form` pair sanctioned | ✓ shape; ✗ lint, pair |
| **Plugin** (7) | files, cases, detect ⊇ parser, fail-soft · every extension-point member exercised · renderer escapes author text · `--fs-*` in its CSS | ✓ harness; ✗ members, escaping, type |
| **Motion / Anima scene** (4) | manifest, `order` unique, valid JSON · reduced motion honored | ✓ manifest; reduced motion not audited |
| **Sample asset** | every `sample:` picture resolves in every render path | ◐ |
| **Font face** | self-hosted · metrics pinned · embedded in every export | ✓ hosting; ◐ embedding |

**Family B — how it looks**

| Kind | Key clauses | Status |
|---|---|---|
| **Theme** (33 files, 19 palettes) | 118 tokens · manifest, identity, roles, modes · every color token in some contrast pair, non-text too · AA in both schemes and both branches of every `light-dark()` · categorical and code roles distinct under color-vision deficiency · palette beats engine defaults in the export bundle · texture set all-12-or-none · `--muted-mark` never text | ✓ tokens, pairs; ◐ dark; ✗ CVD, export precedence, texture set |
| **Finish** (9) | manifest · generated rule matches · recipe schema · text contrast, every component × theme × scheme · one finish per slide | ✓ / ✗ contrast, recipe, one-per-slide |
| **Treatment** (`tint-*`, `mark-*`) | known spelling · required `at-*` placement · opacity budget | ✗ |
| **Token** | no hex; role names; `--fs-*`; no dangling or phantom reads | ✓ |

**Family C — what an author writes**

| Kind | Key clauses | Status |
|---|---|---|
| **Deck setting** (67 keys in the Studio list) | one engine-side registry entry · unknown key warns · unknown value warns · autocomplete key and values · hover · documented · spec row + case · JSON Schema · rides onto split pages, token *and* selector | ✗ registry, key lint, schema, hover; ◐ the rest |
| **Slide modifier** (198 in 35 groups) | lint + autocomplete · documented · applying it changes the output | ✓ lint; ◐ docs; ✗ effect |
| **Lint rule and diagnostic code** | registered in the Diagnostic Protocol · fires on a failing case · silent on a passing one · runs under `--all` | ◐ |
| **Grammar** (section, class directive, fence, CSS comment, block scalar) | one shared reader per grammar · shared cases | ✗ |
| **Speaker note, `say:` line, review comment** | kept or stripped as asked in every path · narration drops no content | ◐ notes ✓ |
| **Lens** | `lensEligibility` fails closed · never changes the look · the read path never imports the suggester | ◐ |

**Family D — where it is shown and shipped**

| Kind | Key clauses | Status |
|---|---|---|
| **Render path** (engine, runtime mirror, export-to-Marp) | same output on a shared deck · Marp-ledger completeness | ◐ |
| **Render surface** (reader view, player, Present, Playground, Studio preview, dev server, VS Code Marp preview) | every component's prose, coda and charts projected and painted · keyboard, wheel and touch through `present-transport` · font gate · sanitizer keeps every attribute the engine emits (derived from engine output) | ✗ as a kind; ◐ per surface |
| **Exporter** (6 formats + Marp, video) | one coverage deck through every format · fonts embedded · text filled and extractable · PPTX schema-valid · assets round-trip · no QA chrome · deterministic · a warning fails the run | ✓ notes; ✗ the rest |
| **CLI option** | documented in `--help` · exercised by a case | ◐ |
| **Ingest** (file read, import, model reply, zip) | line endings and BOM normalized | ◐ hand list |
| **Sanitizer sink** (4 shapes, HARD RULE #22) | each sink guarded | ✓ |
| **Out-of-tree instance** (Studio/AI component, `.latticepack`, installed package, user theme) | the same contract, run by the install and Studio gates at runtime | ✗ |
| **Docs-site page** | screenshot evidence at 1440, 820, 390 | ◐ discipline |

**Family E — what we ship around it**

| Kind | Key clauses | Status |
|---|---|---|
| **Spin-off library** (11) | zero-dependency boundary, derived from a registry rather than one hand-written function each | ◐ |
| **Generated artifact** | fresh against its source | ◐ |
| **Example deck, exemplar, gallery** (6 subtypes) | lints clean under the full rubric · renders without warnings | ◐ |
| **Gate and clause** | runs in some CI job · fails, for the right reason, on its fixture | ✗ |

**Family F — what we write about it**

| Kind | Key clauses | Status |
|---|---|---|
| **Component and base docs** | every modifier and register named (about 47–54 of 198 modifiers are not; unverified) · examples lint clean | ◐ |
| **Skill and canonical docs** | a list the doc states is generated from its registry, or the claim carries a quoted anchor a test asserts. Existence of a named path is not enough (§3.5) | ✗ |
| **Spec** | four parts present (`checkSpecParts`) · every governed instance has a row | ✓ / ◐ |

### 6.3 Rules that stop the harness being gamed

Each answers a way a contributor, or an agent under pressure, could pass every clause and still
ship something broken.

1. **Debt is keyed to the commit that seeded it.** A new entry is allowed only in the commit
   that adds its clause. A new instance can never carry debt: it conforms or it does not merge.
   A stale entry fails. The ledger only shrinks.
2. **An opt-out is a measured claim, not a line.** "Does not honor register R" is checked: the
   rendered effect of R on that component must be zero. The count of opt-outs is ratcheted.
3. **Declarations are measured.** A declared capacity is checked against the measured capacity
   at `capacity.soft`, so a placeholder number from the scaffold fails.
4. **A fixture must fail for the right reason.** The failing fixture must fail with the expected
   clause id (not a crash or a schema error), and a near-identical twin must pass.
5. **A clause asserts its own reach.** It states a minimum instance count per axis, so an axis
   source that returns `[]` fails instead of passing vacuously.
6. **A trigger is measured before it blocks.** Every trigger runs against a hand-labeled corpus
   (all 75 components for "has a card row") and publishes its hit and miss rate. It reports
   only, until both are acceptable. Triggers use geometry (equal sibling boxes that set their
   own alignment), not markup, so a `<dl>` or a flex row cannot dodge them.
7. **A probe is fixed before it enrolls everything** (the `topic` error).
8. **Every clause names what it catches**: the fix commits it would have failed, or a reason.
   A clause with neither is not added.

### 6.4 Running combinations without exploding CI

A full matrix is about 858 gallery slides × 33 themes × 10 finish states × 4 size families,
roughly 1.13M slide configurations, before registers. It cannot run on every PR, and it does
not need to.

**Which axes may restyle in place.** Swapping the palette stylesheet on one render matches a
native render byte for byte (`tools/palette-native.js`), at about 32 ms per
slide-configuration (`palette-sweep.suite.js:24-28`). That holds for theme and scheme, and
likely for finish. It does **not** hold for registers and modifiers: transforms read the class
list (`masthead-lift.js:49,83`, `resolve-mode.js`), so toggling a class is not a native render.
Those axes re-render until each is traced. An in-place axis keeps a per-PR native-render
sample so the two cannot drift.

| When | What runs |
|---|---|
| Every PR, static | Every static clause, every instance (seconds, `npm test`) |
| Every PR, render | The **reverse-dependency closure** of the diff × every axis, one axis at a time, all values, batched into one deck per axis. When the diff touches shared code (`lib/core`, `lib/engine`, `lattice.css`, `build-css.js`, `lib/transformers`), add a **fixed covering sample**: one representative per bucket × every axis. Inside the render budget set in phase 2 (§12.4) |
| Nightly | Every instance × every axis, one at a time; then pairwise over the axes |

Rough sizes from real counts, not a measured run: one changed component restyled across its in-place
axes (33 theme files, 10 finish states, 16 backdrops: about 60 values) is about 11 slides ×
60 × 32 ms ≈ 20 s; its re-render axes (8 sizes,
split, 6 formats) add a batched render each. Axe's per-configuration cost is not measured yet.
The full nightly is about 2.3 h serial. Phase 2 measures the render tier, nightly and report-only, before it
blocks a PR (§12.4).

### 6.5 How we know it works

Each phase's PR reports, in its body, the defects its clauses caught on the day they landed
(real ones in the tree, not fixtures). Each phase also re-grades the 112 historical fixes against the
clauses it adds, split into per-PR and nightly catches. Once phase 5 lands, the running total
replaces the 53% upper bound with a real number. A clause family that catches nothing over two
phases is a candidate for removal.

## 7. The axes

| Axis | Values | Class | Covered across all values today |
|---|---|---|---|
| Theme | 33 files, 19 palettes | restyle | palette sweep, hand-written deck only |
| Scheme / color mode | light, dark, system, inherited (dark has two implementations) | restyle | partly |
| Finish | 9 + none; `backdrop:` 16 | restyle (to verify) | ✗ for text |
| Registers | mode 3, stamp 13, rule 5, cards 4, spectrum 5+5, … | re-render until traced | split token-ride only |
| Modifiers | 198 in 35 groups | re-render until traced | on demand only |
| Size and family | 8 canvases; 4 families | re-render | nightly, indaco light only |
| Venue, print | 4; on/off | restyle | ✗ |
| Split | auto-split, split-panel | re-render | oracle ✓; selector match ✗ |
| Render path | engine, runtime, Marp | re-render | partial |
| Output format | 6, with sub-modes | re-render | strip-notes only |
| Render target | default, player, read, fluid, present | re-render | ✗ |
| Browser engine | Chromium, WebKit, Gecko | re-render | PR gates Chromium; WebKit nightly report-only |
| Plugins on/off, install path, hosted in a pane | per plugin; repo or installed; slide or pane | re-render | ✗ |
| Density | at `capacity.soft` | re-render | on demand only |
| Language, lens, motion | `lang`; lens on/off; motion and reduced motion | re-render | ✗ |
| Text direction | `ltr`, `rtl` | re-render | ✗ (no RTL support exists yet) |

Two axes do not exist yet. **Right-to-left text is in scope** (ruling §12.5): component CSS has
hundreds of physical left/right declarations against a handful of logical ones (321/33 or
401/10, depending on the regex; the ratchet's own counter will fix the number), so the axis starts as a static
ratchet (phase 2) and becomes a rendered `dir="rtl"` axis (phase 4). **Reveal/build states** stay
out until a feature adds them.

## 8. What the contracts will not catch

They are a floor, not the whole bar.

- **Studio app behavior and state.** 18 fix commits (17 Studio, 1 surface); undo crossing decks
  and a chat reply shown twice need app tests, not a contract. The Studio gets its own harness
  later, deliberately separate (§12.6).
- **Real devices and third-party viewers.** iOS audio, long-press, pinch, wake lock (31
  follow-ups owe a real-device check), and PDFs in Quartz, PDFKit or PowerPoint. A clause
  passing in Chromium is not verification of Safari (HARD RULE #23).
- **Taste.** A layout can conform and still be ugly. The 10/10 visual review stays.
- **Adversarial input**: malformed EXIF, fence closers, `</style>` in CSS, deflate bombs. These
  need fuzzing.
- **Content kept but placement destroyed.** A count-based clause passes a slide where everything
  is present and in the wrong place. Placement has no oracle; `check:jank` covers movement, not
  position. Future work.
- **Its own bugs**, beyond what §6.3 makes it prove.

## 9. Order of work

One PR per phase (HARD RULE #17). **Each phase must catch defects that exist today**, listed in
its "catches" column; the shared contract shape is extracted in phase 1, thin, because phase 1
is its first consumer.

| # | Phase | Catches on day one | Also delivers |
|---|---|---|---|
| 1 | **Deck-setting and modifier registry.** One engine-side table of keys and values; unknown key and value warn; autocomplete keys and values, hover, docs, spec §2.3 and a front-matter JSON Schema derived from it; treatment spelling and `at-*` placement; `STATIC_VALUES` moves into the engine. **Plus the thin contract core** (contract shape, runner, ledger, §6.3 fixture rules, generated checklist) with the deck-setting contract as its first user, and its share of the history re-grade (§6.5) | `finsh:`, `themee:`, `size: huge`, `theme: nosuchtheme`; `icon`/`avatar`/`plugins`/`greeting`/`closing` autocomplete; 4 spec gaps; `tint-bogus`, bare `tint-corner` | The contract core every later phase reuses |
| 2 | **Component contract on `component-invariants`.** Fix the probe; widen from one sample to every variant × theme × scheme, batched; body-text contrast and axe; the card-row trigger (report-only until measured, §6.3); static component clauses (manifest and CSS both ways, variants both ways, `isEnriched`, capacity and exclusive-axis declarations, manifest autocomplete from the schema); anatomy matches render; logical CSS properties, with today's physical left/right declarations seeded as a shrinking ratchet | `list-steps converge`; the 18 unchecked components; `stats`/`actors`/`kpi`; `_qr-card` | Render budget measured and set with the owner (§12.4) before the per-PR render tier is wired |
| 3 | **Surfaces and exporters.** Render surface and exporter become kinds; one coverage deck through every format and every surface; export warnings fail; Marp-ledger completeness; sanitizer keeps what the engine emits; the input-verb census (keyboard, wheel, touch through `present-transport`) and the font gate on every preview surface | The largest historical class (30 of 112) | — |
| 4 | **Joins.** Registers honored or measured-inert on every component; split as token *and* selector; size families × scheme; Form conformance from opt-in to evidence-triggered; every component rendered under `dir="rtl"` (mirrored layout, no clipped or overlapping text) | Register and split regressions | — |
| 5 | **Themes, finishes, treatments, textures, charts.** Both `light-dark()` branches; CVD distinctness; finish text contrast; recipe schema; texture sets; `--muted-mark`; chart edge cases, vocabulary, categories, members, black paint in every theme | a11y dark branches; finish contrast | — |
| 6 | **Families E and F, out-of-tree instances, the rest.** Libraries, generated artifacts, gates with failing arms, docs claims anchored, plugin escaping, ingest census, lint rules under `--all`, grammars, lens, motion, CLI options, fonts; the same contracts run by the package-install and Studio gates | The two false docs | — |
| 7 | **Burn down debt.** The 242 player-contrast runs into the ledger with reasons, starting with the 123 below 2:1 | — | — |

Every gap in §3 now sits in a phase. Not phased, on purpose: Studio app behavior, real devices,
taste, fuzzing and placement (§8).

## 10. Open decisions for the owner

None open. The four questions this section held were answered on 2026-10-15 (§12.1, §12.4–§12.6).
One number stays to be set: the per-PR render budget, which phase 2 measures and brings back
before the per-PR render tier blocks anything (§12.4).

## 11. Method and confidence

- **Audit (§3):** four read-only agents mapped components, themes and finishes, settings and
  editor, and plugins, packages and exporters. I re-ran the key probes myself: the lint runs,
  the 18-component diff, the all-gallery contrast run, and the rendered `list-steps` and
  `topic` slides.
- **Harvests (§1, §4, §6, §7):** three agents, one each for stated expectations, history, and
  axes and joins. Their tables are in the folder beside this note. Classifications are one
  agent's reading; a second recounted every number but did not re-judge rows.
- **Adversarial review (§5):** red team, inversion and an independent checker attacked the
  first full version; every change in §5 came from them and was verified.
- **What stays uncertain:** the 53% / 42% catch rate (author-graded, upper bound; phase 1
  re-grades); every cost in §6.4 (estimates from unit costs; phase 2 measures); about 47–54
  undocumented modifiers; 26 unconfirmed rows in `explicit.md`.

## 12. Owner rulings (2026-10-15)

1. **Direction: yes, in the revised order.** The owner first approved "components first", then,
   shown the review's better order, chose it: the deck-setting registry with the thin contract
   core first (phase 1), the component contract on `component-invariants` second (phase 2).
2. **Cards: opt-in, plus an evidence trigger.** A detected card row with no `cards` declaration
   fails. `stats`, `actors` and `kpi` are each reviewed: each one either adopts `cards` (a visual
   change, shipped with a demo deck) or goes in the ledger as debt with a reason.
3. **An unknown front-matter key is a warning**, like every other authoring rule.
4. **Per-PR render budget: measure, then set.** Phase 2 builds the render tier batched, runs it
   nightly and report-only, measures the real minutes, and brings the number to the owner before
   it blocks PRs.
5. **Right-to-left text is in scope now.** A static logical-properties ratchet in phase 2, a
   rendered `dir="rtl"` axis in phase 4. Reveal/build states stay out until a feature adds them.
6. **Studio app behavior stays with app tests, and out of this harness.** The owner wants the
   Studio to get its own test harness in future, kept separate from this one (follow-up
   2711-p4).
7. **This note holds for revision** before it merges, and the owner asked for very high
   confidence that every explicit and implicit expectation is covered. §11 is that pass.

## 13. Phase 2 outcome (2026-10-16)

What shipped, what it measured, and what is held for the owner. Numbers are from one sandbox
(16 GB, one Chromium); a CI runner will differ, so treat them as ratios and order of magnitude.

### 13.1 What shipped

- **Static component contract** (`lib/conformance/kinds/component.contract.js`), nine clauses over
  the 77 folders under `lib/components/` (75 components plus the shared `_chart-family` and
  `_qr-card`, which are instances because a folder of CSS with no manifest passed every gate before):
  `files-both-ways`, `css-wired`, `variants-rendered`, `variant-known-to-lint`, `axes-coherent`,
  `capacity-coherent`, `logical-properties`, `card-row-labeled`, `cards-declared`. Only the last
  three catch anything on day one: 44 components carry 402 physical left/right declarations
  (the ratchet, §12.5), and `stats`, `actors` and `kpi` carry `cards` debt (§12.2). The other six
  catch nothing today and say so; they are the reach guarantee for the render tier and keep six
  drifts from opening.
- **Ledger `ceiling`.** A clause that counts (`measure`) puts an integer ceiling on its debt entries:
  the count may not rise above it, and when it falls the ceiling must follow.
- **Render tier** (`tools/conformance-render.js`, `npm run conformance:render`): every gallery slide
  (858 slides, one per variant plus each gallery's generated title, closing and anti-pattern
  slides) rendered in pages of about 150, then overflow (the shared probe), axe-core, the card-row
  trigger, and the shared contrast PROBE swept over all 33 palettes (`palette-sweep.js`, with the
  shared `SANCTIONED_CONTRAST_EXEMPTIONS`). It reuses the machinery every other contrast gate
  uses rather than adding a fourth contrast implementation (HARD RULE #15). Report-only.

### 13.2 Measured cost (§12.4)

| Run | Wall time |
|---|---|
| Render the 858-slide deck to HTML (no PDF) | 17 s (29.5 s paged) |
| Overflow + card-row + axe, all slides | about 11 s |
| **Contrast sweep, 33 palettes, all 858 slides** | **about 46 min** |
| Whole matrix, nightly shape | **47 min 40 s** |
| One component, 33 palettes: `kpi` (15 slides) | 30 s |
| One component, 33 palettes: `map` (14 slides) | 3 min 23 s |
| 14-component covering sample (one page), 33 palettes | 17 min 33 s |

So the cost is the contrast sweep and nothing else: everything that is not contrast takes about
a minute for the whole gallery. Within the sweep, cost follows what a slide paints, not how many
slides there are: the PROBE scores every text run, and `map`, `math` and the chart components carry
thousands (2.0 s a palette at 73 slides, 4.7 s at 200, 85.7 s at 858 on one page; paging at about
150 slides keeps it near linear). The existing per-PR sweep (117 slides, 32 palettes) costs about
2 minutes by the same arithmetic.

### 13.3 What is held for the owner

Nothing in this tier is scheduled or blocking. Two decisions, each of which changes what every
future run pays (the second filter in `CLAUDE.md`):

1. **Run it nightly?** Setting `CONFORMANCE_RENDER=1` on the existing "Integration tests (nightly
   slice)" step adds about 48 minutes to that job. A separate nightly step costs the same and keeps
   the existing slice's time. Without either, only the small "bite" tests run on the nightly (they
   prove each probe can fail on a planted defect).
2. **Per-PR?** The cheap probes (overflow, axe, card-row, about 1 minute for everything) could run
   per PR on the changed components today. The contrast sweep is the cost: a changed component is
   30 s to 3.5 minutes across all 33 palettes, a changed shared file is the covering sample
   (about 17 minutes) or more. The honest options are all palettes for the changed component only,
   or two or three palettes per PR and all 33 nightly.

### 13.4 What the reviews changed

Three independent reviewers (red team, inversion, checker) read the first commit. Fixed: the
checklist claimed the render clauses "run nightly" when nothing schedules them; the physical-property
counter missed shorthands (`margin: 0 0 0 4px`, `inset: 0 auto 0 0`), mixed case and positions, and
the corrected count is 402, not 361; slides a gallery generates (title, closing and a `cards-stack`
anti-pattern slide on 73 of 75) were credited to the component, which would have charged `quote`
with `cards-stack`'s card row; a flat `lib/components/<name>/` folder was invisible to the contract;
a card-row label that was not a boolean passed; `measure` could crash the run; a gallery edit did not
trigger `test:conformance` before commit.

Not fixed, and stated: (1) `variant-known-to-lint` is nearly circular, because the linter's
vocabulary is built from the same manifests, so a variant of a real component is never refused; it
keeps the two in step and no more. (2) `topic`'s tab labels score 1.02:1 because the probe reads the
section's `background-color` and misses the gradient that paints the band, while the text renders
dark on light (viewed). §6.3 rule 7 says fix the probe first; `tools/check-slide-contrast.js` serves
five gates, so the fix is its own change. Until then `PROBE_LIMITS` in the render tool leaves those
runs out and counts them in the report. (3) `cards-declared` blocks on a hand-labeled corpus, as
ruling §12.2 says, and the labels outside the 20 components that declare `cards` and `stats`,
`actors`, `kpi` are provisional until the trigger's rates are reviewed against them (§13.5).
(4) The anatomy-matches-render, `isEnriched` and manifest-autocomplete items in §9 row 2 did not
land; they are phase 2 work still owed.

### 13.5 The card-row trigger, scored
RATES_PLACEHOLDER
