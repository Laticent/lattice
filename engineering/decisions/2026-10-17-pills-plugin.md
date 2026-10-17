---
status: in-progress
summary: >
  Pills become an embedded plugin. The plugin owns the `{LABEL, shape, c4}` notation, the reader,
  the drawing and every `.lat-pill` rule. No component paints its own pill: a component either has the author
  write a pill or translates its content into one through the plugin, and passes color, size and case in through
  the pill's custom properties. Fifteen components now hand-roll a pill look; they move one at a time, and a
  `build:check` gate holds the count at zero. The plugin is embedded: it cannot be switched off.
---

# Pills as a plugin (2026-10-17)

Status: in progress. The owner's decisions are in §3. Nothing is built yet; §9 is the commit plan. Parents:
`2026-09-27-plugin-system.md` (the plugin contract), `2026-10-14-plugin-inline-door.md` (the inline kinds;
§4.3 lists `pill` as a host kind, which this note reverses), `2026-09-28-segno-unified-inline-notation.md`
(the notation a pill is spelled in), `2026-05-11-inline-code-directives.md` (where pills began).

## 1. The answer

`pill` stops being a host kind and becomes the `pills` plugin, beside `icons` and `avatars`. Three rules:

1. **The plugin owns everything about a pill:** the `{…}` notation, the reader, the HTML and DOM drawing, the
   styles, the docs page. It is **embedded**: it loads on every render and no switch turns it off (§4.5).
2. **No component draws a pill.** A component gets a pill one of two ways: the author writes it, or the
   component translates its own content (a trailing `` `code` ``, a computed range, a counter) into a pill by
   calling the plugin. The component passes in only what it knows: a color, a size, a case. It may place the
   pill (flow, position, alignment). It may not set the pill's border, background, color, radius, padding or font.
3. **A gap in the plugin is closed in the plugin,** when the need is sensible. A component never works around one.

## 2. What exists, measured

| Surface | Today | Count |
|---|---|---|
| The kernel | `lib/core/inline-pills.js`: reader, `resolve`, `diagnose`, HTML and DOM drawing | 571 lines |
| Files that `require` the kernel | `lib/authoring/lint-core.js`, `review-core.js`, `inline-editors.js` (Compose), `lib/core/inline-code-directives.js`. The runtime reaches it through the dispatcher. `label-set`, `segno-slots`, `inline-sparks` and the icons service only name it in comments, and the kernel requires `segno-slots` and the plugin `services` layer, so those arrows run the other way. Also affected: `docs/src/playground/{authoring,read-along}-core.generated.js`, which inline it, and 10 test files | 4 files |
| The `pill` slot | `lib/core/segno-slots.js`, a CORE slot | 1 |
| The pill's own CSS | `lib/base/base.modifiers.css`, bundled at tier 7 | 33 rules with `.lat-pill` in a selector (36 selectors, 18 of them `[data-shape]`) |
| Hand-rolled pill painters | 15 component stylesheets, `chart-family`'s `.chart-status` (a plugin stylesheet, `chart-family.styles.css:1215-1273`, repainted with `!important` by `chart-finish.generated.css:304-306`), and the universal trailing-`code` rule in `base.modifiers.css:707-725` | 17 sites |

The 15 component stylesheets are `roadmap`, `state-chart`, `pricing`, `redline`, `verdict-grid`, `kpi`, `cards-grid`, `cards-stack`,
`glossary`, `inventory`, `list-tabular`, `logo-wall`, `policy-recommendation`, `regulatory-update` and
`statute-stack`. Checked against each component's rules and docs by an independent reader (2026-10-17), they fall into four kinds of pill. Two of the fifteen are not pills at all (`pricing`'s ribbon, `redline`'s superscript), and are listed under D:

| Kind | Where | What the author wrote |
|---|---|---|
| **A. An author's `code`** | `kpi`, `cards-grid`, `cards-stack`, `logo-wall`, `policy-recommendation`, `list-tabular.register`, `roadmap` headers (`thead th > code`), `regulatory-update` and `statute-stack` (a code-only last nested item; `statute-stack` also a leading `strong > code`), and the universal trailing-`code` rule in `base.modifiers.css` | `` - `ON TRACK` `` in an item. `pill-tag.js` adds `lat-pill`, not `data-shape`, and only to a `code` that sits before a nested list; a `code` that is an item's last child gets nothing and is painted by the universal rule. Each component paints the rest itself. |
| **B. An element the engine makes** | `state-chart` `.state-chip`, `verdict-grid` `.badge` (plus a fallback rule on the nested `li` until the badge transform runs), `glossary` `.range-pill`, `roadmap` `.horizon-meta`, `chart-family` `.chart-status` | Words the component turns into a chip. |
| **C. A pseudo-element** | `redline` `li::before` (a counter), `regulatory-update` `::before` (`TIER n`, and a timeline mark that shows a number such as "01", not a dot) | A counter. CSS cannot give a `::before` a class. |
| **D. Not a pill** | `state-chart`'s tiles and `.state-chip` transition chips (the chips carry an event, an arrow and a destination mark; the default `lr` variant draws SVG rectangles with a list-order number, which is a label and not a pill). `inventory` reserves the height of one pill (`calc(1em + 2 * var(--pill-pad-y) + 2px)`, the same formula as `--lat-pill-h`). `pricing`'s `li > em` is the author's own "Most popular" corner ribbon. `redline`'s `sup` is an author superscript that its CSS keeps off the pill look on purpose. | `inventory` should read `--lat-pill-h`. The state-chart chips move to `--state-chart-*` tokens that reference `--radius-*`, per the owner's rule in §3. The other two are left alone unless a later review says otherwise. |

## 3. Decisions (owner, 2026-10-17)

- **Full move.** `pill` is an embedded plugin's kind, not a host kind.
- **Embedded, never off.** (Revised the same day: the first cut said default-on, with `` `{LIVE}` `` rendering as
  inline code when off.) A pill is too basic to disable: a code-styled `{LIVE}` in the middle of a deck breaks the
  layout around it and the look of the slide. It loads on every render. No `plugins:` list, host narrowing or
  `disabled` set removes it, and no deck needs a `plugins:` entry to get it.
- **The plugin owns rendering and styling.** Components author a pill or translate into one. A component that needs
  something from a pill passes it in; it does not rebuild the pill.
- **A pill and a state chart share nothing but the base radius (owner, 2026-10-17).** The `--pill-*` tokens (font, size, weight,
  tracking, padding, radius) belong to the pills plugin and to pills only. An element that is not a pill (a state-chart tile or
  transition chip, a ribbon, a counter badge) owns its geometry through its own tokens, and may reference only the shared base
  (`--radius-sm | md | lg`); it never reads `--pill-*`. Today `state-chart`'s `.state-chip` reads `--pill-font`, `-fs`, `-weight`,
  `-tracking`, `-pad-*` and `-radius` (`state-chart.styles.css:580-623`); that is a coupling to remove, not a pill to convert.
  The test for each of the 17 sites in §2: does it share anything with a pill besides a radius? If it does not, it is not a
  pill, and it takes its own tokens. If it does, the plugin draws it.
- **Out of scope:** the logo wall's marks appearing late in the live preview is the mosaico packing (#2744), and the mosaico
  owner is fixing it.
- **No hand-rolled pills, no exceptions by default.** A component that seems to need one is a gap in the plugin (rule 3).

## 4. The model

### 4.1 What the plugin contributes

```
lib/plugins/pills/
  pills.manifest.json   contributes.inline.pill (untagged), services, styles, registers
  pills.syntax.mjs      detect(source): any `{` span in inline code
  pills.inline.js       the kernel (moved from lib/core/inline-pills.js): read, resolve, diagnose, html, element
  pills.services.js     reads, html, element, shapeNames, metrics
  pills.styles.css      every .lat-pill rule (moved from base.modifiers.css)
  pills.docs.md  pills.fixtures.md
```

`lib/core/inline-pills.js` stays as a thin re-export for one release so the four files that `require` it
(`lint-core`, `review-core`, `inline-editors`, `inline-code-directives`) move in their own commits, then it is
deleted. The two generated playground bundles (`docs/src/playground/{authoring,read-along}-core.generated.js`) are
regenerated in the same commit as each move, and the 10 test files that name the kernel move with it.

### 4.2 An untagged inline kind (the one new host capability)

Every plugin kind today is tagged: `^{…}`, `!{…}`, `@name{…}`. A pill is the untagged record `{…}`. The manifest
gains `contributes.inline.<kind>.untagged: true`, in-tree only, and at most one plugin may hold it. `@pill{…}` already
works today (the pill row has an empty alias in `inline-code-directives.js`), so the named spelling needs no new work.

Three places refuse this today and change with it, found by the fact-check:

- `lib/plugins/resolve.js` `checkInlineClaims` reserves the kind `pill` for the host (`HOST_INLINE.kinds`) and errors
  on any kind whose sigil is not one of `~ ^ !`. `HOST_INLINE.kinds` loses `'pill'`; an `untagged` kind is exempt from
  the sigil check. `test/unit/core/inline-code-table.test.js` pins `HOST_INLINE` to the dispatcher's rows and changes
  with it.
- The dispatcher appends plugin rows after the first-party rows, and gives a row with no sigil the `ANY` lead. The
  pill row must keep its place in the order, so the table needs a rule that an embedded plugin's row is placed where
  the first-party pill row sits now.
- `spec/LPM.md` §3.3 (`inline`), `plugin.schema.json` (which is `additionalProperties: false` at the top level) and the
  generator `tools/build-plugin-registry.js` change in the same commit.

### 4.3 The component contract

A component reaches a pill through one call, never through CSS:

```js
// in the component's transformer or kernel, string and DOM forms both
const pill = service('pills', 'html')({ label: 'ON TRACK', shape: 'pill', color: 'c3', size: 'sm' });
```

- **The call always answers.** The plugin is embedded, so `service('pills', …)` never returns `null`, and a
  component has no off branch to write or test.
- **A component that calls it declares `plugins: { requires: ["pills"] }`** like any dependency, so the
  dependency is visible in the manifest even though the plugin is always there.
- **Inputs a component may pass:** `--lat-pill-edge`, `--lat-pill-bg`, `--lat-pill-ink` (color), `--lat-pill-scale`
  (size), plus the two new knobs `--lat-pill-case` and `--lat-pill-tracking` (§5). Placement properties on the
  pill's own box are allowed (`position`, `inset`, `align-self`, `flex`).
- **The cascade does NOT make this safe on its own** (found by the fact-check; the first draft of this note said
  it did). Specificity decides before source order does. `.lat-pill[data-shape]` is (0,2,0): it beats
  `section.kpi code` (0,1,2) and `.badge` (0,1,0), and loses to `section.cards-grid > .cell-stage > ul > li > code`
  (0,2,4), statute-stack's `…strong:first-child > code` (0,3,5), `section.state-chart .state-chip` (0,2,1) and any
  `!important` (`chart-finish.generated.css`). A type-A pill stays a `<code>`, so its component's rules keep
  matching and keep winning. The contract is therefore enforced by deleting the component's pill-painting
  declarations, not by relying on the cascade; the gate (§4.4) is what holds it.

### 4.4 The gate

`checkHandRolledPills` in `tools/check-ownership.js`, run by `build:check`: **no stylesheet outside the pills plugin may read a `--pill-*` token at all** (owner's rule, §3: those tokens are the plugin's), and none may
set `border-radius`, `padding` or `font-size` from `var(--pill-radius | --pill-pad-x | --pill-pad-y | --pill-fs)`, and
may not set a `border` or `background` on a `code`, `em`, `.badge` or pseudo-element whose declaration block also takes
a `--pill-*` token. **Scope is every stylesheet, plugin stylesheets included:** the first draft said "component
stylesheet" and would have missed `chart-family`'s `.chart-status`, and the universal trailing-`code` rule in
`base.modifiers.css` is a pill painter too. Budget 0 once the last site moves; a measured allowlist of the 17 sites
until then, and an entry that goes stale fails the build, as the other allowlists do. The gate adds no CI job: it is a
function in a checker that already runs.

## 5. Gaps in the plugin the hand-rolled sites expose

Each is closed in the plugin, in the commit that first needs it.

| Gap | Seen in | Fix in the plugin |
|---|---|---|
| Upper-case, wider tracking | `kpi` (`0.12em`, `uppercase`) | `--lat-pill-case`, `--lat-pill-tracking`, default `none` and `var(--pill-tracking)` |
| A counter inside a pill | `redline`, `regulatory-update` (`TIER n`, and the numbered timeline mark) | The component's transformer emits a real `<span class="lat-pill" data-shape="circle">n</span>` instead of `::before { content: counter() }`. The DOM gains a node per item; the numbering moves from CSS to the plugin's caller. Open question (§10). |
| A leading mark inside the pill | `verdict-grid` `.badge::after` (a state disc) | The pill's existing `icon=` slot takes a state mark; `mark=` is added only if `icon=` cannot carry it. |
| Hairline width | `state-chart` (`--chart-hairline`) | `--lat-pill-edge-w`, default `1px` |
| One pill height for layout | `inventory` | `--lat-pill-h` becomes the documented public metric; `inventory` reads it |
| A trailing `code` has no `data-shape` | the type-A sites | **Open, widest blast radius (§10).** Giving every `pill-tag`-tagged `code` a `data-shape` makes `.lat-pill[data-shape]`, and list-tabular's placement rules (`list-tabular.styles.css:181-223`, which key on `[data-shape]` for exactly this reason), match ordinary `<code class="lat-pill">` in every deck, including `pricing`'s price and `list-tabular`'s plain-meta code. The shape name is `pill`, not `capsule` (`SHAPES`, `inline-pills.js:87`). |
| Muted and neutral roles | `logo-wall`, `policy-recommendation`, `list-tabular.register` | A `tone` axis (`neutral`, `quiet`, `accent`), set by the component through the color properties above |

## 6. What changes for the author

Nothing, by default. The notation, the escape (`` `\{LIVE}` ``), the shape and color words, and the lint
diagnostics are the same. Deck output changes in one place: a type-A pill (a trailing `code` in a card, a logo wall,
a policy list, a kpi row) now takes the plugin's size formula and optical centering instead of its component's copy
of the geometry. That is a visible shift of fractions of a pixel to a few pixels, so those galleries need new
baselines and a visual review (QUALITY BAR), not an export-pipeline sign-off: no exporter code changes.

## 7. What proves it

- **Phase 1 is byte-identical.** After the kernel and styles move and before any component changes, the rendered
  HTML and the compiled `lattice.css` pill rules are identical. `test/unit/core/inline-pills.test.js` and
  `inline-pills-edit.test.js` move with the kernel and pass unchanged. `marp-fidelity-render.test.js` still shows
  the engine and the runtime agree.
- **Embedded is tested.** With `createEngine({ plugins: { defaults: [] } })`, with `disabled: ['pills']` and with a
  deck whose front matter lists other plugins only, `` `{LIVE}` `` still draws a pill on the engine path and the
  runtime path, `lint:deck` still reads it, and Compose still edits it. A zip manifest with `embedded: true` is refused.
- **Each component move carries before and after PNGs** at its gallery's worst case in light and dark, and
  `tools/pixel-check.js` output.
- **The gate has a failing arm:** a fixture stylesheet that hand-rolls a pill makes `checkHandRolledPills` fail.
- **The whole change gets the adversarial trio** (HARD RULE #25), applied to the diff that ships: it touches
  `lib/core`, the dispatcher, the manifest contract, `resolve.js` and seventeen painting sites.

## 8. Risks

- **Four files `require` the kernel** (`lint-core`, `review-core`, `inline-editors`, `inline-code-directives`), plus the two
  generated playground bundles and 10 tests. Each moves to the plugin services layer; a file that keeps a direct `require`
  works until the re-export is deleted, then fails loudly. The re-export's removal is its own commit.
- **`resolve.js` refuses the plugin as drafted** (`checkInlineClaims`, §4.2). It is the first thing the skeleton commit must change.
- **`pills` must list `icons` as `optional`, never `requires`.** A pill's `icon=` calls the icons service, and
  `activePlugins` cascades a disabled dependency: with `requires`, `disabled: ['icons']` would switch off pills.
- **`lint-core` must stay pure and fs-free.** It reaches the plugin the way it reaches icons and avatars today, through
  the generated registry, not through a file read.
- **An always-on plugin is a precedent.** Nothing else in the host is embedded today. The flag is in-tree only and
  the schema test pins that, so it cannot become a way for a third-party plugin to force itself onto a deck.
- **Compose and autocomplete** already key on the inline-kind table; the pill row must keep its editor.
- **Cascade order.** Moving the pill rules from tier 7 to the plugin slot changes their source position relative to the
  sources between them: `base.card-tag`, `qr`, `treatments`, `finish`, `focus`, `build`, `sketch`, then the tail's
  `shared`, `variants`, the Form cells and tiles, and `accent-finish` (`build-css.js:225-250,554-608`; the header
  comment's `_semi-universal.css` and `_universal.css` no longer exist). A byte-diff of the pill rules does not catch
  a reorder, so phase 1 diffs whole rendered decks (baseline captured: `examples/inline-pills.md` and
  `examples/universal-pill.md`, deterministic across runs) and the compiled CSS.
- **`HARD RULE #26`.** The pill rules are unlayered today and stay unlayered.
- **`HARD RULE #20`: the pill rules DO carry margins.** `.lat-pill[data-shape]` has `margin-inline:0.22em`
  (`base.modifiers.css:4305`, again at `:4755`) and the trailing-`code` rule has `margin-left:auto` (`:713`). Both are
  `SANCTIONED_MARGINS` entries keyed to `file: 'lib/base/base.modifiers.css'`, so moving the rules makes both stale and
  `checkMarginDiscipline` fails. The move re-keys both entries to `lib/plugins/pills/pills.styles.css` in the same
  commit, with their justification unchanged.
- **`chart-family`'s `.chart-status` is a plugin-stylesheet pill,** repainted with `!important` by
  `chart-finish.generated.css`. It moves in its own commit, and the finish generator changes with it.

## 9. Commit plan (one branch, one PR, one commit per item)

1. This note.
2. The `pills` plugin folder with the kernel and styles moved, the untagged-kind and `embedded` support in the
   schema, the generator, `admitPlugins` and `spec/LPM.md`, and the dispatcher row. Byte-identical output.
3. Move the four kernel importers, and regenerate the two playground bundles, to the services layer; delete the re-export.
4. Embedded admission on every surface (§4.5), with the tests in §7.
5. `docs/src/content/catalog/plugins/pills.md`, the hub entry, and the `lib/plugins/README.md` and `base.docs.md` edits.
   The same commit replaces "shipped plugin" with "essential plugin" in `spec/LPM.md`, the README and the catalog, and adds the
   three-class table to `lib/plugins/README.md`, so the vocabulary lives in the canonical docs and not only in this note.
6. The plugin gaps from §5 that no component needs first: `--lat-pill-case`, `--lat-pill-tracking`, `--lat-pill-edge-w`,
   the `tone` axis, the `pill-tag` pass.
7. `checkHandRolledPills` over every stylesheet, with a measured allowlist of the 17 sites (§2).
8. One commit per component, type A first, then B (including `chart-family` `.chart-status`), then C, then `inventory`, and the universal trailing-`code` rule last. Each removes its allowlist entry.
9. The allowlist is empty; the gate's budget is 0. `changelog.d/` fragment, `examples/pills-plugin.md` demo deck.
10. The adversarial trio on the result; fixes folded in before the PR opens.

## 10. Open

- **Which of the 17 sites are pills (owner's test, §3).** The default is a pill for the nine type-A `code` sites and a
  non-pill for state-chart; `verdict-grid`'s badge, `glossary`'s range, `roadmap`'s `.horizon-meta`, `chart-family`'s
  `.chart-status` and the counter badges are judged one at a time as each component moves, and each such judgment is put to
  the owner with the rendered before and after, never decided in the diff.

- **How a type-A `code` becomes a pill.** The widest-blast-radius question in the plan (§5). Options: (a) the plugin
  tags it `data-shape="pill"` everywhere, which restyles ordinary `code` in every deck that `pill-tag` touches;
  (b) a component opts in with a hook (a manifest key or a `data-` attribute its transformer sets), so only the
  slots that mean a pill get one; (c) the component's transformer rewrites the `code` to a real pill `span`. I lean
  to (b), because it restyles nothing by accident, and I'll prove it on `kpi` first. Decided before the first
  type-A component commit, not in the skeleton.

- Whether the counter pills in `redline` and `regulatory-update` keep their numbering in CSS and ask the plugin for
  only the shape is decided in that component's commit. The §5 row is the default.

## 11. Progress

- **2026-10-17, skeleton (commit 2 of §9, kernel only).** The `pills` plugin exists: manifest (`embedded`, an `untagged`
  inline kind, `optional: ["icons"]`), syntax probe, services, docs and fixtures, and the kernel moved to
  `lib/plugins/pills/pills.inline.js` with `lib/core/inline-pills.js` as a re-export. The schema, the resolver
  (`checkInlineClaims`, the embedded-requires rule), `admitPlugins`, the generator and the zip importer
  (`refusePluginCode`) know the two new fields; the dispatcher's pill row comes from the registry and keeps its place
  between the marks and the sparks. **Measured:** `examples/inline-pills.md` and `examples/universal-pill.md` render
  to byte-identical HTML and the compiled `lattice-default.css` is byte-identical to the pre-change baseline
  (rendering is deterministic across runs). The unit suite, `lint`, `build:check` and `build:check:all` pass. With
  `plugins.defaults: []`, with `disabled: ['pills']` and with both, a deck still draws its pills on the engine path.
  Not yet done: the styles move (commit 3, where the cascade-order risk is measured), the four importers, the
  runtime/Compose/lint off-switch checks beyond the engine, the docs page and the components.
  Found while building: `lint-core` ran the generic plugin-kind diagnostic on the pill row and double-reported
  `pill-literal`; it now skips an untagged row. `pluginAdmission` (the Playground's pass-on list) leaves embedded
  plugins out, since they load whatever list a host passes.
- **2026-10-17, review of the skeleton.** An independent checker found two defects, both fixed in the next commit.
  (1) With a narrowed plugin set, a Studio Export-to-Marp left `@pill{…}` as literal code: callers derive the off list as
  every plugin name MINUS `pluginAdmission`'s answer, and that answer had dropped the embedded plugin. It now lists what
  the deck truly loads, and as defense in depth an embedded row ignores `off` in the dispatcher and in `markPluginsOff`.
  (2) The Studio Plugins tab labelled the pills row "Needed by  " and offered a list checkbox that does nothing; embedded
  plugins now have no row, and one quiet line names them. A third finding: `--disable-plugin=pills` was accepted and did
  nothing, so naming an embedded plugin is a CLI error. **Measured:** all 284 pill-bearing example decks and galleries render
  to byte-identical HTML against the pre-change tree, apart from the absolute asset paths of the comparison worktree and
  one Mermaid git graph whose commit ids are random in both trees.
