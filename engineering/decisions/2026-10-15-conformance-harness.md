---
status: proposed
summary: An audit of what every kind of thing in Lattice owes — components, themes, finishes, settings, render surfaces, exporters, plugins, libraries and 20 more — and how much of it is checked. 242 stated expectations, 112 classified fix commits and the cross-products between kinds show the gates leak in the same few ways. Proposes one conformance harness, a contract per kind run against every instance and every axis, with a phased build and stated limits.
---

# Conformance harnesses: what each kind of thing owes, checked for every instance

**Scope.** Every kind of thing a contributor adds to Lattice, every axis it is rendered under,
and the joins between them. Measured on `main` at `d2a6e6f`. This note proposes work and
changes no code. The raw evidence is in the folder beside it:
[`explicit.md`](2026-10-15-conformance-harness/explicit.md) (242 stated expectations),
[`implicit.md`](2026-10-15-conformance-harness/implicit.md) (112 classified fix commits, 45
incidents, 232 gotchas, 260 follow-ups) and
[`joins.md`](2026-10-15-conformance-harness/joins.md) (axes and their coverage).

---

## 0. In plain words

Say someone adds a component called `timeline-v2` tomorrow. Today, whether it ships complete
depends on that person remembering about twenty things: write the docs, add it to the gallery
deck, follow card alignment if it has cards, pass contrast in dark mode, work on a split page,
survive PPTX export, appear in autocomplete. Some checks catch some of it, but only when the
component is on the right list or sets the right flag. When it is not, nothing complains.

A **conformance harness** replaces remembering with a checklist that runs itself:

- **One checklist per kind of thing** (component, theme, finish, deck setting, exporter, …),
  written once, in code.
- **The harness finds every instance itself.** `timeline-v2` is checked because its folder
  exists, not because someone enrolled it.
- **Each item on the checklist is one of three kinds:** always required; required *when it
  applies*, where the harness detects that from what renders rather than from what the thing
  claims; or checked *if present*.
- **It checks the combinations too.** A component is checked in every theme, light and dark,
  under every finish, on split pages, in every export format. Most real bugs live in a
  combination, not in the thing alone (§4).
- **Known failures go on a written list with a reason.** Nothing is silently accepted, and a
  fixed item that stays on the list fails the build.
- **The checklist doubles as the scaffold.** `npm run new:component` generates every required
  part, so most items pass on day one.

The result is one table per kind, one row per instance and one column per checklist item,
each cell pass, fail, not applicable, or known debt. A fail blocks the PR.

## 1. The answer

Lattice does not lack tests: about 96 `check*` gates in `tools/check-ownership.js`, four
nightly oracles, spec suites for LFM, the theme contract and the `.lattice` file, and one true
per-instance harness (plugins). The audit found three things the gates do not do.

1. **They are organized by rule, not by kind.** "No hex literal" walks every CSS file and
   works. Nothing says "here is everything a component owes" and checks each component against
   it. Of the **242 expectations the repo states** about its artifacts, 89 are enforced
   automatically for every instance; **65 have no check at all, 24 run on a hand-written list,
   and 8 apply only to instances that opt in** (the rest are partial, mixed, or unverified;
   `explicit.md`).
2. **They check things alone, not in combination.** Of 30-odd axes an instance is rendered
   under (theme, light/dark, finish, size, render path, split page, export format, …), five
   joins are checked across all their values (`joins.md`). The biggest single class of fix
   commits, **30 of 112, is "a second path diverges"**: the PPTX export, the reader view, the
   player or the Marp bundle drops something the main render had (`implicit.md`).
3. **Nothing says what a new X owes.** A contributor reverse-engineers a sibling, and the
   checks they miss are the ones nobody runs.

Measured against history: of the 68 engine-side fix commits in the last 600 commits, **a
clause that walks every instance would have failed 36 of them (53%) before merge**, and 25
more (37%) with an extra assertion the clause would need or with a real browser. The other 10%
are taste or not instance-shaped. For app behavior in the Studio, the harness catches little,
and §8 says so.

**Recommendation:** build one conformance harness on the registries Lattice already has
(`KINDS` in `lib/packages/kinds.js`, `FAMILIES` in `tools/manifest-schemas.js`), reuse the
existing gates as clause bodies rather than rewriting them, cover joins one axis at a time, and
land it in the phases of §9.

## 2. How the gates leak: seven failure modes

Every finding in this note, and every "Y" or "P" commit in `implicit.md`, falls into one of
these. The harness's design (§5) is one answer to each.

| # | Mode | What happens | Example |
|---|---|---|---|
| 1 | **Opt-in** | A contract governs only instances that declare it; nothing asks whether one *should* have | Card alignment: 18 of 75 components declare `cards`. `stats`, `actors`, `kpi` have card rows and never did, so a deck's `cards:` does nothing on them |
| 2 | **Hand list** | A check runs on a list someone maintains, and nobody adds the new one | Contrast, palette and axe sweeps run on a hand-written gallery deck missing 18 of 75 components and most variants. Result: `list-steps converge` ships white text at 3.01:1 |
| 3 | **No registry** | No single list says what the instances are, so no consumer can be checked against it | No list of front-matter keys: `finsh: halo` lints clean |
| 4 | **One way** | Declared ⇒ implemented is checked; implemented ⇒ declared is not (or the reverse) | `checkVariantDeclaration` (`check-ownership.js:477`) leaves "declared but unimplemented" to manual review |
| 5 | **Combination unchecked** | Each side passes alone; the join breaks | `tone-edge` missing on auto-split pages, fixed twice in two days (`ed9a233`, `7912dd7`); the Studio sanitizer stripped `vector-effect` from every exported chart while the unit suite stayed green (`sanitize-slide-html.test.js:55-61`) |
| 6 | **Debt absorbed** | A ratchet baseline accepts existing failures without a reason, so they become permanent | The nightly player-contrast baseline accepts 242 sub-AA text runs, 123 below 2:1 (`test/oracle/player-contrast.json`) |
| 7 | **Vacuous gate** | The check cannot fail, or measures the wrong thing | An overflow assertion that could not fire (`e7f58b87`); the contrast probe sampling the wrong background for `topic` (§3) |

## 3. What the audit measured

### 3.1 Components (75)

| Finding | Mode | Evidence |
|---|---|---|
| **Card alignment is opt-in with no reverse check.** `stats`, `actors`, `kpi` hard-code their own alignment | 1 | `lib/core/resolve-cards.js:31`; `stats.styles.css:142-147`; `actors.styles.css:19-24,48`; `kpi.styles.css:643-648`; none in `cards-catalog.generated.js` |
| **18 of 75 components never reach a rendered contrast, palette or axe check** | 2 | bar, bullet, collage, columns, flowchart, heatmap, line, matrix-grid, premise, rows, scatter, scene, slope, stacked-bar, team-profile, topic, video, waterfall. Consumers: `slide-contrast.test.js:86-88`, `palette-sweep.suite.js`, `axe-a11y.test.js:75` |
| **Variants are the same hole one level down.** I rendered all 75 generated galleries (947 slides) and ran the existing contrast probe: 14,196 text runs, 23 flagged, against 1,612 runs on the hand-written deck. `list-steps converge` sets white body text at **3.01:1** (AA is 4.5:1), confirmed on the rendered slide | 2 | `tools/check-slide-contrast.js` over every `*.gallery.md` |
| The same run flagged `topic` at 1.02:1. **That is the probe's error**: the tab labels sit on a light band and the probe read the slide's dark background. Enrolling everything amplifies probe error, so the probe is fixed first | 7 | rendered `topic.gallery.md` slide 2 |
| Frame conformance (render matches the declared Form) is opt-in | 1 | `conformance: "strict"` on 5 of 75 |
| Capacity contracts are opt-in, and every capacity lint depends on them | 1 | 23 of 75 declare `capacity` + `escalateTo`; 22 of 24 charts declare none, so a seventh series silently cycles hue (`design/skills/chart-component.md:30`) |
| Mutually exclusive variant axes must declare `exclusive`, or Reshape writes combinations that cannot render | 1 | 3 of 53 components with variants declare `variantAxes` (`design/design-system.md:425-431`) |
| A manifest with no prose fields gets no docs and no gallery, and the docs check passes | 1 | `isEnriched`, `tools/build-component-docs.js:70,864` |
| A missing `.styles.css`, or CSS with no manifest, passes every gate | 3 | `check-ownership.js:1475`; `manifest-schemas.js:222-248`; live: `lib/components/connect/_qr-card/` |
| The anatomy block is never checked against the render, which the layout audit names its #1 recurring defect | none | `engineering/decisions/2026-06-06-layout-audit/README.md:71,349` |
| The manifest's own autocomplete offers 9 of 58 schema keys | 3 | `docs/src/components/studio/manifest-complete.ts:11` |

### 3.2 Deck settings, slide settings, treatments

| Finding | Mode | Evidence |
|---|---|---|
| **No unknown-key lint**: `finsh: halo`, `themee: x`, `size: huge` lint clean | 3 | `npm run lint:deck`, run for this note |
| Keys are listed in four hand-written places that check only each other | 3 | `FRONT_MATTER_KEYS`, LFM 1.1 §2.3, `base.registers.docs.md`, conformance JSON |
| `icon`, `avatar` lack key autocomplete; `plugins`, `greeting`, `closing` are documented but not offered | 3 | `editor-complete.ts:59` never reads `pluginRegisters` |
| Several keys are lint-silent on values: `theme: nosuchtheme`, `size: huge`, and 13 whose only value list is a docs-site file | 3 | `STATIC_VALUES`, `editor-complete.ts:94` |
| `spectrum-card*`, `spectrum-trim`, `avatar` have no spec row and no conformance case | 2 | `SOURCES` map, `lfm-conformance.test.js:91-104` (26 keys) |
| No JSON Schema for front matter; no hover docs | 3 | — |
| Any `tint-*` / `mark-*` spelling passes lint; `tint-corner` without an `at-*` placement paints nothing, though `treatments.md` says a validator catches it | 3 | `lint-core.js:506`; `engineering/treatments.md:64,227`; the `follows` map feeds autocomplete only |
| A register a component does not honor is silently inert, and `modifier-effects.generated.json`, which already knows, runs on demand only | 1 | `joins.md` §5 |
| Slide classes are **closed**: lint and autocomplete derive from manifests, 75 of 75 match | ✓ | `buildVocab`, `lib/authoring/lint.js:122` |

### 3.3 Themes, finishes, contrast

| Finding | Mode | Evidence |
|---|---|---|
| Token completeness passes: 33 of 33 themes, 118 tokens; manifests schema-valid | ✓ | `tools/theme-conformance.js` 19/19; `contrast-audit.js` 0 failures over 891 pairs |
| **242 sub-AA runs accepted, 123 below 2:1**, nightly only | 6 | `test/oracle/player-contrast.json` |
| **No check measures text over a finish**; only the nightly player sweep touches about 12 decks, mostly atrium on indaco | 3 | `finish-canvas-contract.test.js` checks the computed `--fin-canvas`, not contrast |
| The a11y themes' dark side is never audited: 39 `light-dark()` dark branches in `a11y-base` | 4 | `tools/contrast-audit.js:69` decides dark per file |
| Finish recipes have no schema; a typo is silently clamped to a default | 3 | `lib/finishes/finish-generate.js:110` |
| Texture sets are not checked as all-12-or-none; `--muted-mark` used as text is not caught | 1, none | `accessibility-textures.test.js:218`; `design/skills/theme.md:350` |
| The chart no-black-paint check covers 3 of 33 themes | 2 | `tools/check-viz-render.js:71` |

### 3.4 Surfaces, exporters, plugins, libraries

| Finding | Mode | Evidence |
|---|---|---|
| **Render surfaces are not a kind anywhere.** The reader view, exported player, Present, Playground, Studio preview and dev server each project the deck their own way; 9 fix commits and 46 gotchas are about one dropping or changing content | 5 | `implicit.md` §3 |
| Exporters share no deck × every-format run. Only `strip-notes` enumerates `OUT_FORMATS`; `export-coverage-deck.md` runs nightly through PDF only | 2 | `strip-notes-every-format.test.js:216`; `chart-export.spec.ts:18` |
| An export run that prints OVERFLOW or palette warnings still exits 0 | none | `design/skills/cli.md:28-30` |
| Export-to-Marp has 11 unmirrored constructs, and nothing checks a component against the ledger | 5 | `lib/core/marp-fidelity.js:46` |
| Plugins: 7 of 7 enrolled and exercised — the model. Chart-family's 24 `kernel` members are not each exercised; a plugin's renderer escaping author text is unchecked | 2, none | `conformance.test.js:143-211`; `spec/LPM.md:221-222` |
| Spin-off libraries (Cadenza, Trama, Calco, Tavola, Fuoco, Suono, LTT, Anima, Lente, Segno, Vetrina) each get a hand-written boundary check; a new library is unchecked until someone writes one | 2 | `check-ownership.js:8649-9271` |
| Every slide surface owes keyboard, wheel and touch through the `present-transport` kernel; six hand-listed specs, no census | 2 | `2026-08-10-input-verb-parity.md:12,80` |
| "Any new preview surface owes the font gate"; one surface is tested | 2 | `engineering/jank.md:50` |
| Markdown ingests normalize line endings by hand-list | 2 | `2026-08-04-line-endings-lf-boundaries.md:129-138` |
| The deck-quality rubric is switched off under `lint:deck --all`, so it never runs on shipped examples | 2 | `tools/lint-deck.js:169` |

### 3.5 Docs that state something false

Two canonical docs contradict the code, and an author following them does the wrong thing:
`design/skills/theme.md:337` says to add a palette to `THEMES` in `token-parity.test.js` (it is
derived now), and `design/design-principles.md:55` says fonts must be on Google Fonts
(`tools/check-fonts.js` enforces self-hosting). Logged as follow-ups; a doc clause (§6, family
F) is what would catch the class.

## 4. Where bugs actually come from: the history

`implicit.md` classifies the last 600 commits' 112 defect fixes (window 2026-08-18 to
2026-10-15). By defect class:

| Class | Fixes | What a harness needs to catch it |
|---|---|---|
| A second path diverges (export format, reader, player, Marp bundle, dev server, installed package) | 30 | Surfaces and exporters as kinds; one coverage deck through every path |
| App behavior or state (Studio) | 18 | Mostly out of reach (§8) |
| Hand list or stale generated artifact | 11 | Discovery enrollment; generated files as a kind with a freshness clause |
| Parse or grammar edge | 10 | One shared reader per grammar, with cases |
| Dark-mode or palette contrast | 9 | Every variant × theme × scheme |
| Gate blind or vacuous | 9 | Every clause carries a failing arm |
| Fit at a size, venue or long label | 8 | Every variant × size, at `capacity.soft` |
| Untested combination (modifier × component, register × slide) | 6 | Declared-or-honored clauses per register; pairwise nightly |
| Split page loses something | 4 | Split as an axis, token *and* selector |
| Taste | 4 | Out of reach (§8) |
| Security or resource | 3 | Fuzzing, not enumeration (§8) |

The incidents in decision notes say the same: of 45, an enumerating clause catches 15, catches
23 more with an extra assertion, and misses 7.

## 5. The design

### 5.1 Vocabulary

| Term | Means |
|---|---|
| **Kind** | A type of thing: component, theme, finish, deck setting, exporter, render surface, … (§6) |
| **Instance** | One of them: `kpi`, `indaco`, `finish: halo`, the `pptx` exporter |
| **Axis** | A dimension an instance is rendered or consumed under: theme, scheme, finish, size, render path, split, export format, … (§7) |
| **Clause** | One thing an instance owes, with an id: `component.cards.governed` |
| **Level** | `required`; `conditional` (owed when a trigger fires); `optional` (checked if present) |
| **Trigger** | The *evidence* that makes a conditional clause owed, read from the instance or its render, never from its own declaration |
| **Verdict** | `pass`, `fail`, `n/a`, or `debt` (fails, and the ledger names it with a reason) |

### 5.2 Eight laws

1. **Enrollment is discovery.** Instances come from the filesystem or a generated registry,
   never a hand list. A check that needs a list derives it. *(answers mode 2)*
2. **Conditional clauses fire on evidence, then demand the declaration.** A detected card row
   with no `cards` declaration fails. Silence is a finding. *(mode 1)*
3. **Both directions**, for every declaration a kind has. *(mode 4)*
4. **One registry per kind, every consumer checked against it**: lint, autocomplete, docs,
   spec table, JSON Schema and hover are each generated from it or have a completeness clause.
   *(mode 3)*
5. **Joins are clauses.** A clause names the axes it runs across, and a relationship between
   kinds is a clause on one side: every component either honors register R or declares that it
   does not, with a reason. *(mode 5)*
6. **Debt is named, never silent.** A failing clause the tree cannot meet today goes in a
   ledger with a reason; a stale entry fails; the ledger only shrinks. *(mode 6)*
7. **Every clause proves it can fail.** Each clause ships a failing fixture, and the meta-check
   fails a clause whose failing fixture passes. A probe is part of the clause and is validated
   on known cases before it enrolls everything. *(mode 7)*
8. **The contract is the scaffold and the docs.** `new:<kind>` generates what the contract
   requires, and `dist/engineering/conformance.md` publishes what each kind owes and the live
   matrix, so nobody reverse-engineers a sibling.

### 5.3 Shape in the tree

```
lib/conformance/
  kinds/component.contract.js     one file per kind: enumerate() + clauses[]
  kinds/theme.contract.js
  kinds/deck-setting.contract.js
  axes.js                         the axes, each with its value source and cost class
  run.js                          instance × clause × axis-value → verdict
test/conformance/
  debt.json                       the ledger: { "kpi": { "component.cards.governed": "reason" } }
  static.test.js                  every static clause; fails on fail or stale debt
  render.test.js                  every render clause, on the integration tier
dist/engineering/conformance.md   generated: what each kind owes, and the live matrix
```

A clause is small and declarative:

```js
{
  id: 'component.cards.governed',
  level: 'conditional',
  tier: 'render',                               // 'static' (no browser) or 'render'
  axes: ['theme', 'scheme'],                    // runs across every value of each, one at a time
  trigger: (c, dom) => hasCardRow(dom),         // evidence, not declaration
  check:   (c) => Boolean(c.manifest.cards),
  failingFixture: 'test/conformance/fixtures/undeclared-card-row/',
  why: 'engineering/decisions/2026-09-01-card-stack-vertical-alignment.md',
}
```

**Existing gates become clause bodies, not rewrites.** `checkHexLiterals` already walks every CSS
file; the component contract calls it scoped to one component and reports the verdict in that
row. The gate in `build:check` stays as it is. The harness adds the per-instance view, the joins
and the clauses nobody runs today.

**Where it plugs in.** `KINDS` (`lib/packages/kinds.js`) already says what a package kind's
files are; the contract says what they must satisfy. Kinds that are not packages (deck setting,
surface, exporter, library, ingest, …) get the same contract shape. A meta-clause fails when a
`KINDS` row has no contract or a contract governs no instances, copying `FAMILIES`. The models to
copy are the plugin harness (`conformance.test.js`), `FAMILIES`, the gallery debt ledger
(`gallery-contract.test.js`) and `guide-handles.test.js`, which derives its set from what renders
and keeps a sanctioned-exceptions list.

### 5.4 Running joins without exploding CI

A full matrix is about 947 gallery slides × 33 themes × 10 finish states × 4 size families,
roughly 1.25M slide configurations, before registers. It cannot run on every PR, and it does not
need to. `joins.md` §4 splits the axes by cost:

- **Restyle axes** toggle in place on one render: theme, scheme, finish, backdrop, class-token
  registers, modifiers, venue, print. The palette sweep already does this at about **32 ms per
  slide-configuration** (`palette-sweep.suite.js:24-28`).
- **Re-render axes** need a fresh render: size, split, render path, export format, plugins, fit,
  browser engine.

| When | What runs | Rough cost (from real counts) |
|---|---|---|
| Every PR, static | Every static clause, every instance | seconds, in `npm test` |
| Every PR, render | **Changed instances × every axis, one axis at a time, all values.** A changed component: its ~13 gallery slides × ~305 restyle values, plus 8 canvas re-renders. A changed theme or finish: all 947 slides × 2 schemes | ~2.5 min per changed component; ~1 min per changed theme |
| Nightly | Every instance × every axis, one at a time | ~2.6 h serial, ~40 min over 4 shards |
| Nightly | Pairwise over the re-render axes, and over the restyle axes | ~288 renders; ≥330 restyle configurations |

These are estimates built from measured unit costs, not a measured run. Phase 3 measures the
real thing before anything is wired into CI (decision §10.3). Restyling in place was once wrong
in both directions, so every restyle axis needs a native-render reconciler like
`tools/palette-native.js`, and registers a transform fills in (`cards:` via `stampCardsAlign`)
belong in the re-render group.

## 6. The kinds, and what each owes

Clause status: ✓ exists and finds its instances · ◐ opt-in, hand-listed, partial or nightly ·
✗ no check. Full rows with sources are in `explicit.md`; this is the catalog.

### Family A — what a deck is built from

| Kind (count) | Key clauses | Status |
|---|---|---|
| **Component** (75) | manifest present, schema-valid, both ways with its CSS · variants both ways · docs and gallery generated, one slide per variant · lint and autocomplete know it · anatomy matches render · capacity + `escalateTo` declared · exclusive variant axes declared · manifest skeleton renders, not only the gallery · every variant × every axis (§7): no overflow, AA contrast, axe clean · card row ⇒ `cards` · `[data-family]` ⇒ every tier fires · declared Form ⇒ render matches · honors each register or declares it does not | ✓ files; ◐ variants, contrast, axe, capacity, Form; ✗ anatomy, register honoring, card trigger |
| **Chart** (24, also components) | ≤ 6 categories or `capacity` declared · labels on the canvas · marks emitted = marks declared · empty, single-row, long-label cases · shared vocabulary (status words) means the same in every member · chart-finish × theme · rasterizes without black paint | ◐ marks, a11y; ✗ edge cases, vocabulary, categories |
| **Diagram / Mermaid** | scoped token selectors · ink and non-text contrast both schemes | ✓ |
| **Form** frame/cell/tile (12/13/…) | manifest · cross-references · `accepts`/`fits` lint · `function.form` pair sanctioned | ✓ shape; ✗ lint, pair |
| **Plugin** (7) | files, cases, detect ⊇ parser, fail-soft · every extension-point member exercised · renderer escapes author text · `--fs-*` in its CSS | ✓ harness; ✗ members, escaping, type |
| **Motion / Anima scene** (4) | manifest, `order` unique, scene valid JSON · reduced-motion honored | ✓ manifest; reduced motion not audited for this note |

### Family B — how it looks

| Kind | Key clauses | Status |
|---|---|---|
| **Theme** (33 files = 19 palettes) | 118 tokens · manifest, identity, roles, modes · every color token in some contrast pair (non-text too) · AA in **both** schemes, both branches of every `light-dark()` · categorical and code roles distinct under color-vision deficiency · palette beats engine defaults in the export bundle · texture set all-12-or-none | ✓ tokens, pairs; ◐ dark; ✗ CVD, export precedence, texture set |
| **Finish** (9) | manifest · generated rule matches · recipe schema · text contrast over the finish, every component × theme × scheme · one finish per slide | ✓ / ✗ contrast, recipe, one-per-slide |
| **Treatment** (`tint-*`, `mark-*`) | known spelling · required `at-*` placement · opacity budget | ✗ |
| **Token** | no hex; role names; `--fs-*`; no dangling or phantom reads | ✓ |

### Family C — what an author writes

| Kind | Key clauses | Status |
|---|---|---|
| **Deck setting** (front-matter key, ~68) | one registry entry · unknown key warns · unknown value warns · autocomplete key and values · documented · spec row + case · JSON Schema · hover · rides onto split pages (token *and* selector) | ✗ registry, key lint, schema; ◐ the rest |
| **Slide modifier** (198 in 35 groups) | lint + autocomplete · documented · applying it changes the output · its effect on every component measured | ✓ lint; ◐ docs; ✗ effect |
| **Lint rule** | registered in the Diagnostic Protocol · fires on a failing case · silent on a passing one · runs under `--all` | ◐ |
| **Grammar** (section, class directive, fence, CSS comment, block scalar) | one shared reader per grammar · shared cases | ✗ |
| **Lens** | `lensEligibility` fails closed · never changes the look · the read path never imports the suggester | ◐ |

### Family D — where it is shown and shipped

| Kind | Key clauses | Status |
|---|---|---|
| **Render path** (engine, runtime mirror, export-to-Marp) | same output on a shared deck · every construct a component uses has a Marp-ledger row | ◐ |
| **Render surface** (reader view, player, Present, Playground, Studio preview, dev server) | every component's prose, coda and charts projected and painted · keyboard, wheel and touch through `present-transport` · font gate · sanitizer keeps every attribute the engine emits | ✗ as a kind; ◐ per surface |
| **Exporter** (6 formats + Marp, video) | one coverage deck through every format · fonts embedded · text filled and extractable · PPTX schema-valid · assets round-trip · notes kept or stripped as asked · no QA chrome · deterministic · a warning fails the run | ✓ notes; ✗ the rest as a matrix |
| **Ingest** (file read, import, model reply, zip) | line endings and BOM normalized | ◐ hand list |
| **Sanitizer sink** (4 shapes, HARD RULE #22) | each sink guarded | ✓ |
| **Package / `.lattice` file** | strict read · installed package runs and exports what it claims | ✓ / ✗ |

### Family E — what we ship around it

| Kind | Key clauses | Status |
|---|---|---|
| **Spin-off library** (11) | zero-dependency boundary · derived from a registry, not a hand-written function per library | ◐ |
| **Generated artifact** (galleries, oracles, goldens, WebPs, bench counts) | fresh against its source | ◐ |
| **Example / demo deck, exemplar, gallery** (6 subtypes) | lints clean under the full rubric · renders without warnings | ◐ |
| **Gate** (every `check*`, every clause) | runs in some CI job · has a failing arm | ✗ |

### Family F — what we write about it

| Kind | Key clauses | Status |
|---|---|---|
| **Component and base docs** | every modifier and register named · examples lint clean | ◐ (54 modifiers unnamed) |
| **Skill doc, canonical doc** | every file path, function and list it names exists and says what the code does | ✗ (the two false docs in §3.5) |
| **Spec** | four parts present (`checkSpecParts`) · every instance it governs has a row | ✓ / ◐ |

## 7. The axes

An axis applies to the kinds it can vary. Value counts and sources are in `joins.md` §1.

| Axis | Values | Class | Covered across all values today |
|---|---|---|---|
| Theme | 33 files, 19 palettes | restyle | palette sweep, on the hand-written deck only |
| Scheme | light, dark (two implementations: `-dark` file and `section.dark`) | restyle | partly |
| Finish | 9 + none; `backdrop:` 16 | restyle | ✗ for text |
| Registers | mode 3, stamp 13, rule 5, cards 4, spectrum 5+5, … | restyle or re-render | split token-ride only |
| Modifiers | 198 in 35 groups | restyle | on demand only |
| Size and family | 8 canvases; 4 families | re-render | nightly, indaco light only |
| Venue, print | 4; on/off | restyle | ✗ |
| Split | auto-split, split-panel | re-render | split oracle ✓; selector match ✗ |
| Render path | engine, runtime, Marp | re-render | partial parity |
| Output format | 6, with sub-modes | re-render | strip-notes only |
| Render target | default, player, read, fluid, present | re-render | ✗ as a matrix |
| Browser engine | Chromium, WebKit, Gecko | re-render | PR gates are Chromium; WebKit nightly report-only |
| Plugins on/off | per plugin | re-render | ✗ |
| Density | at `capacity.soft` | re-render | on demand only |

Two axes do not exist yet and are out of scope until decided: **right-to-left text** (component
CSS has 321 physical left/right declarations against 33 logical ones) and **reveal/build
states**. §10.4 asks.

## 8. What a harness will not catch

The harness is a necessary floor, not the whole bar. It will not catch:

- **Studio app behavior and state.** 19 fix commits, 15 of them out of reach. Undo crossing
  decks and a chat reply shown twice are behavior bugs; they need app tests, not a contract.
- **Real devices and third-party viewers.** iOS audio, long-press, pinch, wake lock (31
  follow-ups owe a real-device check), and PDF rendering in Quartz, PDFKit or PowerPoint. HARD
  RULE #23 still applies: a clause passing in Chromium is not verification of Safari.
- **Taste.** A layout can conform and still be ugly. The 10/10 visual review stays.
- **Adversarial input.** Malformed EXIF, fence closers, `</style>` in CSS, deflate bombs: these
  need fuzzing.
- **Content conserved but placement destroyed.** A count-based clause passes a slide where
  everything is present and in the wrong place. Placement has no oracle today; `check:jank`
  covers movement, not position. A placement oracle is future work, not phase 1.
- **Its own bugs**, beyond what law 7 makes it prove.

## 9. Order of work

One PR per phase (HARD RULE #17), ordered by what each unblocks.

| # | Phase | Why this order | Done when |
|---|---|---|---|
| 1 | **Harness skeleton and the component static contract.** `lib/conformance/`, runner, debt ledger, failing-fixture meta-check (law 7), generated checklist, contract-driven `new:component`. Static clauses: manifest and CSS both ways, variants both ways, `isEnriched`, capacity and exclusive-axis declarations, manifest autocomplete from the schema | Every later phase becomes "add a contract". Components are where the owner's examples live | `npm test` runs it; every component has a row; every clause has a failing fixture; debt seeded with reasons |
| 2 | **Deck-setting and modifier registry.** One engine-side table; unknown key and value warn; autocomplete, docs, spec §2.3 and a front-matter JSON Schema derived from it; treatment spelling and placement; `STATIC_VALUES` moves into the engine | The widest silent failure, cheapest to close | `finsh: halo` warns; `icon:` completes; the schema ships in `dist/` |
| 3 | **Render tier, axes one at a time.** Fix the probe first (law 7); every variant × theme × scheme for contrast and axe; the card-row trigger; size families crossed with scheme; finishes; split as token *and* selector. Measure, then bring the cost for decision | Closes the hand-deck hole and the owner's card example | `list-steps converge` fixed or named debt; `stats`, `actors`, `kpi` governed or exempt with a reason |
| 4 | **Surfaces and exporters.** Render surface becomes a kind; one coverage deck through every format and every surface; export warnings fail; Marp ledger completeness | The largest defect class in history (30 of 112) | — |
| 5 | **Themes, finishes, treatments, textures, charts.** Both `light-dark()` branches; CVD distinctness; recipe schema; texture sets; chart edge cases and vocabulary; chart-family members | — | — |
| 6 | **Family E and F.** Libraries, generated artifacts, gates (every check runs in CI with a failing arm), docs whose claims are checked | — | — |
| 7 | **Burn down debt.** The 242 player-contrast runs into the ledger with reasons, starting with the 123 below 2:1 | Last, because phases 3–5 stop new entries first | — |

## 10. Open decisions for the owner

1. **The direction** — decided, §11.1.
2. **Card governance** — decided, §11.2.
3. **Render-tier cost.** Phase 3 adds per-PR render work for changed instances (estimated
   ~2.5 min per changed component, §5.4). That changes what runs on every PR (CLAUDE.md's
   second filter, row 2), so it comes back with a measured number.
4. **Right-to-left text and reveal states.** Neither axis exists. Are they in scope for the
   harness, or for later?
5. **Studio app kinds.** The harness reaches little of the 18 Studio behavior fixes. Leave app
   behavior to app tests (recommended), or define Studio panels as a kind?

## 11. Owner rulings (2026-10-15)

1. **Direction: yes, components first.** Phase 1 is the first build PR.
2. **Cards: opt-in, plus an evidence trigger.** A detected card row with no `cards` declaration
   fails. `stats`, `actors` and `kpi` are each reviewed: each one either adopts `cards` (a visual
   change, shipped with a demo deck) or goes in the ledger as debt with a reason.
3. **An unknown front-matter key is a warning**, like every other authoring rule.
4. **This note holds for revision** before it merges. The owner asked for very high confidence
   that every explicit and implicit expectation is covered; the three harvests behind §3–§7 are
   that pass.
