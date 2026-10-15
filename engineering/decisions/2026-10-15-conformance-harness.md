---
status: proposed
summary: An audit of how Lattice checks that a component, theme, finish, plugin, deck setting, slide modifier or exporter is complete. The ~96 gates are strong where they discover instances themselves and leak where an instance must opt in or be listed by hand. Proposes one conformance harness per kind (a contract of required and conditional clauses, discovery-based enrollment, a debt ledger) and a phased build.
---

# Conformance harnesses: what each kind of thing owes, checked for every instance

**Scope.** Every extension point an author or contributor adds to: components (charts
included), themes, finishes, treatments, plugins and packages, deck settings (front-matter
keys), slide settings (`_class` modifiers), lint rules and exporters. Measured on `main` at
`d2a6e6f`. No code changes; this note proposes work.

---

## 1. The answer

Lattice does not lack tests. It has about 96 `check*` gates in `tools/check-ownership.js`,
four nightly oracles, spec conformance suites for LFM, the theme contract and the `.lattice`
file, and one true per-instance harness (plugins). What it lacks is the thing the owner
named: **a contract per kind, run against every instance of that kind.**

The existing gates are organized by **rule** ("no hex literal", "no margin", "every manifest
matches its schema"). A rule gate is excellent when it finds its instances itself: walk
every CSS file, walk every manifest. It goes blind in three situations, and every defect
this audit found sits in one of them:

1. **Opt-in.** The contract governs only instances that declare it. Nothing asks whether an
   instance *should* have declared. (Card alignment: 18 of 75 components declare it; three
   components with card rows never did.)
2. **Hand list.** The instances a check runs on come from a list someone maintains, and
   nobody adds the new one. (The contrast, palette and axe sweeps run on a hand-written
   gallery deck that leaves out 18 of 75 components, and the variants of the other 57 that
   nobody wrote a slide for.)
3. **No registry.** There is no single list of what the kind's instances are, so nothing can
   check any consumer against it. (Deck settings have no key list: `finsh: halo` lints clean.)

A **conformance harness** flips the axis. For each kind it holds one contract: a list of
clauses, each *required*, *conditional* (owed when evidence says so) or *optional* (checked
when present). The harness discovers every instance itself and reports an instance × clause
matrix. A new component does not get checked because someone remembered to enroll it; it
gets checked because it exists.

The recommendation is to build that harness on the registries Lattice already has (`KINDS`
in `lib/packages/kinds.js`, `FAMILIES` in `tools/manifest-schemas.js`), reusing the existing
gates as clause bodies rather than rewriting them, in the phases §7 lays out.

## 2. What already works, and is the model

Not everything leaks. These are the patterns to copy:

| What | Where | Why it is the model |
|---|---|---|
| Manifest schemas | `FAMILIES`, `tools/manifest-schemas.js:85`; `checkManifestSchemas` | Walks directories. Fails on a manifest no schema covers **and** on a schema that governs zero files. 0 of 75 component manifests invalid; schema is `additionalProperties: false` |
| The plugin harness | `test/unit/plugins/conformance.test.js` | Loops every plugin from the generated registry. Author-written cases, plus invariants checked on every case without the author asking |
| The gallery debt ledger | `test/unit/components/gallery-contract.test.js` | Each instance is *conforming*, *named debt* or *exempt with a reason*; a stale entry fails. The right way to phase in a contract that the tree does not meet today |
| `strip-notes-every-format` | `test/integration/export/strip-notes-every-format.test.js:216` | Reads the exporter list (`OUT_FORMATS`) and fails when a format has no case. The only exporter check that enumerates |
| The spec four parts | `spec/README.md`, `checkSpecParts` | Document, schema, reference implementation, shared cases, and a gate that fails when a part goes missing. The same idea, one level up (formats rather than extension points) |
| Theme token gate | `lib/theme/gate.js`; `test/unit/palette/theme-gate.test.js` | All 33 themes, 118 tokens, by directory walk; a hard count makes a new theme noticed |

The October spec audit (`2026-10-08-spec-audit.md` §8) settled that formats get conformance
suites. It also classed the component, finish, motion and form manifests and the package
shape as *internal contracts* that "a schema and our own tests" cover. This note is about
those internal contracts: they have the schema, and the tests exist, but no harness ties
the tests to the instances.

## 3. Where it leaks: measured

Each row was found by a read-only probe on `d2a6e6f`. "Mode" is which of the three
failure modes in §1 it is.

### Components

| Finding | Mode | Evidence |
|---|---|---|
| **Card alignment is opt-in, with no reverse check.** `stats` (square family lays out card tiles), `actors` (a column of cards) and `kpi` (card tiles) carry card styling and hard-code their own alignment, so a deck's `cards:` setting is silently inert on them and no lint says so | opt-in | `lib/core/resolve-cards.js:31` ("a component that declares NOTHING is not governed"); `stats.styles.css:142-147` `align-content: space-evenly`; `actors.styles.css:19-24,48`; `kpi.styles.css:643-648`. None is in `lib/core/cards-catalog.generated.js` |
| **18 of 75 components never reach a rendered contrast, palette or axe check** because the sweeps run on `test/integration/baseline-decks/gallery.md`, which is written by hand | hand list | Missing: bar, bullet, collage, columns, flowchart, heatmap, line, matrix-grid, premise, rows, scatter, scene, slope, stacked-bar, team-profile, topic, video, waterfall. Consumers: `slide-contrast.test.js:86-88`, `palette-sweep.suite.js`, `axe-a11y.test.js:75` |
| **Variants are the same hole one level down.** I rendered all 75 generated galleries (947 slides) and ran the existing contrast probe on them. `list-steps converge` sets white body text on mid-blue at **3.01:1** (AA needs 4.5:1). `list-steps` is in the hand-written deck, but its `converge` variant is not | hand list | `node tools/check-slide-contrast.js` over every `*.gallery.md` render: 14,196 runs, 23 flagged, vs 1,612 runs on the hand-written deck. Confirmed by eye on the rendered slide |
| The same run flagged `topic` with 11 runs at 1.02:1. **That one is the probe's error, not the component's**: the text sits on a light band, and the probe sampled the slide's dark background. Enrolling every gallery means fixing the probe first, or it ships noise | — | Rendered `topic.gallery.md` slide 2: the tab labels are dark on light and clearly legible |
| Frame conformance (the rendered cell tree matches the declared Form) is opt-in | opt-in | `conformance: "strict"` on 5 of 75 (contact, diagram, math, video, wifi) |
| A manifest with none of the prose fields generates **no docs and no gallery**, and the docs check passes | opt-in | `isEnriched`, `tools/build-component-docs.js:70`, `:864` |
| A missing `.styles.css`, or a folder with CSS but no manifest, passes every gate | no registry | `checkComponentCss` `if (!cssPath) continue` (`check-ownership.js:1475`); `listFamilyManifests` skips silently (`manifest-schemas.js:222-248`) while `build-css.js:443` still bundles the CSS |
| Variants are checked one way only: implemented ⇒ declared. Declared but unimplemented is "left to manual review" | one-way | `checkVariantDeclaration`, `check-ownership.js:467` |
| The Studio's manifest-JSON autocomplete offers 9 of 58 schema keys, and its `mode` enum lacks `single-orientation` | no registry | `docs/src/components/studio/manifest-complete.ts:11` (hand-written) vs `manifest.schema.json` |
| Rendered checks run on one theme per PR; size-family firing and gallery page counts run nightly only | tiering | `component-invariants.test.js`; `integration-nightly.yml:353`; `package.json:308` |

### Deck settings and slide settings

| Finding | Mode | Evidence |
|---|---|---|
| **No unknown-key lint.** A deck with `finsh: halo`, `themee: x`, `size: huge` lints with zero errors or warnings | no registry | `npm run lint:deck` on that front matter, run for this note |
| The list of keys exists in four hand-maintained places that check nothing but each other: `FRONT_MATTER_KEYS`, the LFM 1.1 §2.3 table, `base.registers.docs.md`, the conformance JSON | no registry | `docs/src/components/studio/front-matter-keys.ts`; `front-matter-docs.test.ts:13-19` compares it only with another hand-written file |
| `avatar` and `icon` have no key autocomplete; `plugins`, `greeting`, `closing` are documented but not offered | no registry | `editor-complete.ts:59` `VOCAB_VALUE_FIELDS` never reads `pluginRegisters` |
| About 13 keys are lint-silent on values (`theme`, `size`, `motion*`, `logo-on`, `logo-style`, …): their only value list lives in a docs-site file the engine cannot import | no registry | `STATIC_VALUES`, `editor-complete.ts:94` |
| `spectrum-card`, `spectrum-card-edge`, `spectrum-trim` and `avatar` are linted but have no spec row and no conformance case; the spec test misses them because it reads a hand-written map | hand list | `SOURCES`, `test/unit/spec/lfm-conformance.test.js:91-104` (24 keys) |
| There is no JSON Schema for front matter, and no hover documentation for keys | no registry | — |
| Any `tint-*` / `mark-*` spelling passes lint | no registry | `lint-core.js:506` accepts the prefix |
| Slide classes (`_class:` components and modifiers) are **closed**: lint and autocomplete both derive from manifests. 75 of 75 match | — | `buildVocab`, `lib/authoring/lint.js:122`; `autocomplete-parity.test.js` |

### Themes, finishes, contrast

| Finding | Mode | Evidence |
|---|---|---|
| Token completeness passes: 33 of 33 themes, 118 tokens, both theme and finish manifests schema-valid | — | `node tools/theme-conformance.js` 19/19; `tools/contrast-audit.js` 0 failures over 891 pairs |
| **The rendered player contrast baseline accepts 242 sub-AA text runs, 123 of them below 2:1**, and runs nightly only. As a ratchet it stops things getting worse, and stops nothing that is already bad | ratchet absorbed debt | `test/oracle/player-contrast.json` (counted for this note). Example: the `a11y` deck's Mermaid pie labels after the dark toggle measure 1.00:1 |
| **No check measures text over a finish.** 7 of 8 finishes never appear in a measured render | no registry | `finish-canvas-contract.test.js` checks source and the computed `--fin-canvas`, not contrast |
| The a11y themes' dark side is missing from the token AA sweep: `contrast-audit` reads one mode per file and a11y has no `-dark` file | one-way | `tools/contrast-audit.js:69` |
| Finish recipe files have no schema; `coerceRecipe` silently clamps a typo to a default | no registry | `lib/finishes/finish-generate.js:106` |
| A theme declaring 7 of 12 `--cat-N-texture` tokens is not caught | conditional, unchecked | `accessibility-textures.test.js:218` checks referenced ids only |
| The chart no-black-paint check covers 3 of 33 themes | hand list | `THEMES`, `tools/check-viz-render.js:71` |

### Plugins, charts, exporters

| Finding | Mode | Evidence |
|---|---|---|
| Plugins: 7 of 7 enrolled automatically, every declared token and fence exercised | — | `conformance.test.js:143-211` |
| The chart family declares a `kernel` extension point, but the harness checks tokens and fences only, so its ~23 members are not each exercised | hand list | 6 fixture cases in `chart-family.fixtures.md` |
| Charts share no edge contract (empty data, one row, a long label, every theme in both schemes). gantt, kanban, piechart, progress and timeline-list have no per-type unit file | no registry | — |
| **Exporters share no same-deck × every-format matrix.** `export-coverage-deck.md` is used by one nightly PDF-only Playwright spec. PPTX, ODP, HTML and image-set never see it | hand list | `docs/e2e/journeys/chart-export.spec.ts:18`; `export-formats.test.js` is hand-written per format on `preview-deck.md` |

## 4. Why rule gates leak in exactly these places

A rule gate answers "does every X that *I can see* satisfy R?". Its blind spot is the
second half of the sentence. When the gate walks files, it sees everything. When it reads a
declaration (`cards:`, `conformance: strict`), it sees only the instances that declared.
When it reads a list, it sees only what someone listed. Each fix so far has been local:
`slide-contrast.test.js` grew a "fourth surface" for `word-cloud spectrum` after an AA
failure shipped, and its own comment names the lesson ("the list's own framing was the
hole — it enumerated ungated COMPONENTS and had no notion of an ungated variant"). The
next one will need a fifth surface. A harness ends that by making enrollment structural.

There is a second, quieter cause: **no one place says what a new X owes.** A contributor
adding a component today reads `design/skills/`, the schema, a sibling component and
whatever review catches. The harness's contract, published as a generated checklist, is that
place.

## 5. The design

### 5.1 Vocabulary

| Term | Means |
|---|---|
| **Kind** | A type of thing contributors add: component, theme, finish, plugin, deck setting, … |
| **Instance** | One of them: `kpi`, `indaco`, `finish: halo`, the `pptx` exporter |
| **Clause** | One thing an instance owes, with an id: `component.cards.governed` |
| **Level** | `required` (every instance), `conditional` (owed when a trigger fires), `optional` (checked only if present) |
| **Trigger** | For a conditional clause, the *evidence* that makes it owed, read from the instance itself, not from its declaration |
| **Verdict** | `pass`, `fail`, `n/a` (trigger did not fire), `debt` (fails, and the ledger names it with a reason) |

### 5.2 Five laws

1. **Enrollment is discovery.** A kind's instances come from the filesystem or a generated
   registry, never a hand list. A check that needs a list *derives* it.
2. **Conditional clauses fire on evidence, then demand the declaration.** "Card-shaped" is
   detected from what the component renders (a card row: repeated siblings carrying
   `--elevation-card`), and a detected card row with no `cards` declaration fails. Silence
   becomes a finding.
3. **Both directions.** Declared ⇒ implemented *and* implemented ⇒ declared, for every
   declaration a kind has (variants, cards, tokens, textures, registers).
4. **One registry per kind, every consumer checked against it.** Lint, autocomplete, docs,
   spec table, JSON Schema, hover: each is either generated from the registry or has a
   completeness clause that fails when it drifts.
5. **Debt is named, never silent.** A failing clause the tree cannot meet today goes in a
   ledger with a reason; a stale entry fails; the ledger only shrinks. Same shape as
   `gallery-contract.test.js`. A baseline that accepts 242 failures without naming why is
   the anti-pattern.

### 5.3 Shape in the tree

```
lib/conformance/
  kinds/component.contract.js     one file per kind: enumerate() + clauses[]
  kinds/theme.contract.js
  kinds/deck-setting.contract.js
  …
  run.js                          instance × clause → verdict matrix
test/conformance/
  debt.json                       the ledger: { "kpi": { "component.cards.governed": "reason" } }
  static.test.js                  runs every static clause; fails on fail or stale debt
  render.test.js                  runs every render clause on the integration tier
dist/engineering/conformance.md   generated: what each kind owes, and the live matrix
```

A clause is small and declarative:

```js
{
  id: 'component.cards.governed',
  level: 'conditional',
  tier: 'render',                               // 'static' (no browser) or 'render'
  trigger: (c, dom) => hasCardRow(dom),         // evidence, not declaration
  check:   (c) => Boolean(c.manifest.cards),
  why: 'engineering/decisions/2026-09-01-card-stack-vertical-alignment.md',
}
```

**Existing gates become clause bodies, not rewrites.** `checkHexLiterals` already walks every
CSS file; the component contract calls it scoped to one component's files and reports the
verdict in that component's row. The gate in `build:check` stays exactly as it is. The
harness adds the per-instance view and the clauses nobody runs today.

**Where it plugs in.** `KINDS` (`lib/packages/kinds.js`) already says what a package kind's
required and optional *files* are; the contract adds what they must *satisfy*, and gets a
row per `KINDS` entry plus three non-package kinds (deck setting, slide modifier, exporter).
A meta-clause fails when a `KINDS` row has no contract or a contract governs no instances,
copying `FAMILIES`.

**Static vs render.** Static clauses (files, schemas, registries, lint and autocomplete
completeness) run in `npm test`, under a second. Render clauses (contrast, card alignment
evidence, overflow, axe) run on the existing integration tier, per instance, both schemes.

### 5.4 The contract is also the scaffold

`npm run new:component <bucket>/<name>` (and `new:theme`, `new:finish`; `new-plugin.js`
already exists in `lib/packages/`) generates every required part from the contract. The
generated checklist in `dist/engineering/conformance.md` is what a contributor, human or
agent, reads instead of reverse-engineering a sibling. This is the "quality out of the box"
half: the harness catches a missing part, and the scaffold means the part is never missing.

## 6. The contracts, per kind

✓ exists and enrolls itself · ◐ exists, opt-in or hand-listed · ✗ no check today.

**Component** (75)

| Clause | Level | Today |
|---|---|---|
| manifest present, schema-valid, unique name, `related` resolves | required | ✓ (folder-without-manifest ✗) |
| `.styles.css` present; token colors, no margin, `--fs-*`, no typed glyphs | required | ✓ rules, ✗ presence |
| variants: implemented ⇒ declared / declared ⇒ implemented | required | ✓ / ✗ |
| docs.md and gallery generated; one gallery slide per variant | required | ◐ (`isEnriched` skip) |
| deck lint knows its class and variants; autocomplete offers them | required | ✓ |
| every variant rendered: no overflow, required slots resolve | required | ◐ (one theme) |
| every variant: text contrast ≥ AA, light and dark | required | ◐ (hand-written deck, 57 of 75) |
| axe clean | required | ◐ (hand-written deck) |
| card row detected ⇒ declares `cards` and its CSS reads `--cards-align` | conditional | ◐ (forward only) |
| `[data-family]` CSS ⇒ every tier fires | conditional | ◐ (nightly) |
| declares a Form ⇒ rendered cell tree matches | conditional | ◐ (5 opt in) |
| categorical marks ⇒ texture channel in print | conditional | ◐ (charts only) |

**Chart** (a component, plus): kernel exports `transformSection` ✓; marks declared ✓; a11y
narration ✓; edge cases (empty, one row, long label) ✗; no black paint in every theme ◐ (3 of
33); exercised as a chart-family member ✗.

**Theme** (33): 118 tokens ✓; manifest ✓; identity, roles, modes ✓; token pairs AA in **both**
modes ◐ (a11y dark ✗); categorical and chart contrast ✓; texture tokens all 12 or none ✗;
rendered contrast every component × this theme ◐ (palette sweep on the hand-written deck).

**Finish** (9): manifest ✓; generated rule matches ✓; recipe schema ✗; text contrast over the
finish, every theme × mode ✗.

**Plugin** (7): files, manifest, cases, detect ⊇ parser, fail-soft, every declared token and
fence exercised ✓; every declared extension-point member exercised ✗.

**Deck setting** (no registry today): one engine-side registry entry (key, value source,
scope, docs anchor, spec section) ✗; unknown key lints ✗; unknown value lints ◐ (13 silent);
autocomplete offers key and values ◐; documented ◐; spec row and conformance case ◐; JSON
Schema ✗; hover doc ✗.

**Slide modifier** (206): lint and autocomplete ✓; documented ◐ (54 not named in the base
docs); treatment spelling validated ✗.

**Exporter** (6 + Marp, video): strip-notes ✓; one coverage deck through every format, fonts
embedded, text extractable, page count ✗.

## 7. Proposed order of work

One PR per phase (HARD RULE #17), ordered by what each unblocks.

| # | Phase | Why this order | Done when |
|---|---|---|---|
| 1 | **Harness skeleton and the component static contract.** `lib/conformance/`, the runner, the debt ledger, the generated checklist; component clauses that need no browser: manifest/CSS presence both ways, variants both ways, the `isEnriched` skip, manifest-JSON autocomplete from the schema | Every later phase is "add a contract file". Components are where the owner's examples live | `npm test` runs it; every component has a row; each clause has a failing arm; debt seeded with reasons |
| 2 | **Deck-setting registry.** One engine-side table of keys; unknown-key lint (warning, like every authoring rule); autocomplete keys and values, docs, the spec §2.3 table and a front-matter JSON Schema all derived or checked against it; the `STATIC_VALUES` lists move into the engine | The widest silent failure (a typo'd key does nothing) and the cheapest to close | `finsh: halo` warns; `icon:` and `avatar:` complete; the schema ships in `dist/` |
| 3 | **Render tier: every variant enrolled.** Contrast and axe run on the generated galleries instead of the hand-written deck, light and dark; fix the probe's band-background error first; the card-row trigger | Closes the 18 + variants hole and the owner's card example. Needs phase 1's ledger to land green | `list-steps converge` is fixed or named debt; `stats`, `actors`, `kpi` are governed or exempt with a reason |
| 4 | **Theme, finish, treatment clauses.** Finish × theme × mode contrast; recipe schema; a11y dark in the token sweep; texture all-or-none; treatment vocabulary | Static and cheap once the harness exists | — |
| 5 | **Exporter matrix.** The coverage deck through every `OUT_FORMATS` entry, per PR | — | — |
| 6 | **Chart edge contract and chart-family membership** | — | — |
| 7 | **Burn down the player-contrast baseline** into the ledger with reasons, starting with the 123 runs below 2:1 | Debt work, not harness work; last, because phases 3–4 will stop new entries first | — |

**Cost, measured.** Rendering all 75 galleries one CLI process at a time took 3m02s
(dominated by process start-up; an in-process render will be far less). The contrast probe
over the 75 renders took 3m46s against 6.7s for the hand-written deck, because it opened 75
documents serially. Both numbers are upper bounds from a naive loop, not the design; phase 3
must measure the real cost against the `test:integration:pr` critical path (371s today,
per `slide-contrast.test.js`) and shard if needed.

## 8. Open decisions for the owner

1. **The direction.** A per-kind conformance harness as described, built on `KINDS` and
   `FAMILIES`, with existing gates reused as clause bodies.
2. **Card governance default.** Keep `cards` opt-in and add the evidence trigger (a detected
   card row with no declaration fails), or make every card row governed by default. The first
   keeps today's `stats`/`actors`/`kpi` layouts until each is reviewed; the second changes
   their rendering at once.
3. **Render-tier cost.** Phase 3 makes the per-PR integration tier render every gallery
   variant in two schemes. That changes what runs on every PR (CLAUDE.md's second filter, row
   2), so it needs a yes, with the measured number from phase 3 in hand.
4. **Unknown front-matter key: warning or error.** Every authoring rule warns today; a typo'd
   key silently does nothing, which argues for at least a warning.
