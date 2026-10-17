---
status: in-progress
summary: >
  Pills become a shipped plugin, on by default. The plugin owns the `{LABEL, shape, c4}` notation, the reader,
  the drawing and every `.lat-pill` rule. No component paints its own pill: a component either has the author
  write a pill or translates its content into one through the plugin, and passes color, size and case in through
  the pill's custom properties. Fifteen components now hand-roll a pill look; they move one at a time, and a
  `build:check` gate holds the count at zero. With the plugin off, a pill span is ordinary inline code.
---

# Pills as a plugin (2026-10-17)

Status: in progress. The owner's decisions are in §3. Nothing is built yet; §9 is the commit plan. Parents:
`2026-09-27-plugin-system.md` (the plugin contract), `2026-10-14-plugin-inline-door.md` (the inline kinds;
§4.3 lists `pill` as a host kind, which this note reverses), `2026-09-28-segno-unified-inline-notation.md`
(the notation a pill is spelled in), `2026-05-11-inline-code-directives.md` (where pills began).

## 1. The answer

`pill` stops being a host kind and becomes the `pills` plugin, beside `icons` and `avatars`. Three rules:

1. **The plugin owns everything about a pill:** the `{…}` notation, the reader, the HTML and DOM drawing, the
   styles, the docs page. It is in the default set, so a deck that lists nothing renders as it does today.
2. **No component draws a pill.** A component gets a pill one of two ways: the author writes it, or the
   component translates its own content (a trailing `` `code` ``, a computed range, a counter) into a pill by
   calling the plugin. The component passes in only what it knows: a color, a size, a case. It may place the
   pill (flow, position, alignment). It may not set the pill's border, background, color, radius, padding or font.
3. **A gap in the plugin is closed in the plugin,** when the need is sensible. A component never works around one.

## 2. What exists, measured

| Surface | Today | Count |
|---|---|---|
| The kernel | `lib/core/inline-pills.js`: reader, `resolve`, `diagnose`, HTML and DOM drawing | 571 lines |
| Direct importers of the kernel | `lint-core`, `review-core`, `inline-editors` (Compose), `inline-code-directives`, `label-set`, `segno-slots`, `inline-sparks`, the runtime, the icons service | 10 files |
| The `pill` slot | `lib/core/segno-slots.js`, a CORE slot | 1 |
| The pill's own CSS | `lib/base/base.modifiers.css`, bundled at tier 7 | 63 `.lat-pill` rules |
| Components that paint a pill from the `--pill-*` tokens | 15 stylesheets | 15 |

The 15 are `roadmap`, `state-chart`, `pricing`, `redline`, `verdict-grid`, `kpi`, `cards-grid`, `cards-stack`,
`glossary`, `inventory`, `list-tabular`, `logo-wall`, `policy-recommendation`, `regulatory-update` and
`statute-stack`. Read by selector (not yet line by line), they fall into four kinds of pill:

| Kind | Where | What the author wrote |
|---|---|---|
| **A. A trailing `code`** | `kpi`, `cards-grid`, `cards-stack`, `logo-wall`, `policy-recommendation`, `list-tabular.register`, `roadmap` headers, `regulatory-update`, `statute-stack` (two sites), `verdict-grid` | `` - `ON TRACK` `` at the end of an item. Today `pill-tag.js` adds `lat-pill` to it but no `data-shape`, so the `.lat-pill[data-shape]` rules do not match it. Each component paints it itself. |
| **B. An element the engine makes** | `state-chart` `.state-chip`, `verdict-grid` `.badge`, `glossary` `.range-pill`, `roadmap` `.horizon-meta`, `pricing` `li > em` | Words the component turns into a chip. |
| **C. A pseudo-element** | `redline` (`sup`, `li::before`), `regulatory-update` (`::before` timeline dot, `TIER n`) | A counter. CSS cannot give a `::before` a class. |
| **D. Not a pill** | `inventory` | It reserves the height of one pill (`calc(1em + 2 * var(--pill-pad-y) + 2px)`). It should read the plugin's `--lat-pill-h`. |

## 3. Decisions (owner, 2026-10-17)

- **Full move.** `pill` is a shipped plugin's kind, not a host kind.
- **Default-on.** It is in the default set; no deck needs a `plugins:` entry, and no existing deck changes.
- **Off means literal.** With the plugin off, `` `{LIVE}` `` renders as ordinary inline code.
- **The plugin owns rendering and styling.** Components author a pill or translate into one. A component that needs
  something from a pill passes it in; it does not rebuild the pill.
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

`lib/core/inline-pills.js` stays as a thin re-export for one release so the ten importers move in their own
commits, then it is deleted.

### 4.2 An untagged inline kind (the one new host capability)

Every plugin kind today is tagged: `^{…}`, `!{…}`, `@name{…}`. A pill is the untagged record `{…}`. The manifest
gains `contributes.inline.<kind>.untagged: true`, in-tree only, and at most one plugin may hold it. The host's
dispatcher table (`inline-code-directives.js`) asks that row where the first-party pill row sits now, so the order
is unchanged. `@pill{…}` also works, as `@avatar{…}` does, so a pill has a named spelling for editors and
autocomplete. This changes `spec/LPM.md` §3.3 (`inline`) and `plugin.schema.json`; both change in the same commit
as the generator (`tools/build-plugin-registry.js`).

### 4.3 The component contract

A component reaches a pill through one call, never through CSS:

```js
// in the component's transformer or kernel, string and DOM forms both
const pill = service('pills', 'html', off)?.({ label: 'ON TRACK', shape: 'capsule', color: 'c3', size: 'sm' });
```

- **With the plugin on,** the component gets `<span class="lat-pill" data-shape=… data-c=…>`.
- **With it off,** `service()` returns `null` and the component leaves the author's text alone (a plain `code`).
- **A component that cannot say anything without the pill** (a verdict badge, a state chip) declares
  `plugins: { requires: ["pills"] }`. Every other component declares `optional: ["pills"]`.
- **Inputs a component may pass:** `--lat-pill-edge`, `--lat-pill-bg`, `--lat-pill-ink` (color), `--lat-pill-scale`
  (size), plus the two new knobs `--lat-pill-case` and `--lat-pill-tracking` (§5). Placement properties on the
  pill's own box are allowed (`position`, `inset`, `align-self`, `flex`).
- **The cascade makes this safe.** The plugin's stylesheet sits in the plugin slot of the tail, after the
  components (`tools/build-css.js`), so a component rule that sets a pill's `border` or `padding` directly loses
  to the plugin's. Passing a custom property is the only route that works, which is the contract.

### 4.4 The gate

`checkHandRolledPills` in `tools/check-ownership.js`, run by `build:check`: a component stylesheet may not set
`border-radius`, `padding` or `font-size` from `var(--pill-radius | --pill-pad-x | --pill-pad-y | --pill-fs)`, and
may not set a `border` or `background` on a `code`, `em`, `.badge` or pseudo-element whose declaration block
also takes a `--pill-*` token. Budget 0 once the last component moves; a measured allowlist until then, and an
entry that goes stale fails the build, as the other allowlists do. The gate adds no CI job: it is a function in a
checker that already runs.

## 5. Gaps in the plugin the 15 components expose

Each is closed in the plugin, in the commit that first needs it.

| Gap | Seen in | Fix in the plugin |
|---|---|---|
| Upper-case, wider tracking | `kpi` (`0.12em`, `uppercase`), `pricing` | `--lat-pill-case`, `--lat-pill-tracking`, default `none` and `var(--pill-tracking)` |
| A counter inside a pill | `redline`, `regulatory-update` (`TIER n`, timeline dot) | The component's transformer emits a real `<span class="lat-pill" data-shape="circle">n</span>` instead of `::before { content: counter() }`. The DOM gains a node per item; the numbering moves from CSS to the plugin's caller. |
| A leading mark inside the pill | `verdict-grid` `.badge::after` (a state disc) | The pill's existing `icon=` slot takes a state mark; `mark=` is added only if `icon=` cannot carry it. |
| Hairline width | `state-chart` (`--chart-hairline`) | `--lat-pill-edge-w`, default `1px` |
| One pill height for layout | `inventory` | `--lat-pill-h` becomes the documented public metric; `inventory` reads it |
| A trailing `code` has no `data-shape` | the nine type-A components | The pills plugin owns the `pill-tag` pass: it tags a trailing `code` as `data-shape="capsule"` and drops the component rules that duplicated the shape |
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
- **Off is tested.** With `plugins: { defaults: [] }`, `` `{LIVE}` `` is `<code>{LIVE}</code>` on the engine path,
  the runtime path, `lint:deck` (no pill diagnostics) and Compose (no pill editor).
- **Each component move carries before and after PNGs** at its gallery's worst case in light and dark, and
  `tools/pixel-check.js` output.
- **The gate has a failing arm:** a fixture stylesheet that hand-rolls a pill makes `checkHandRolledPills` fail.
- **The whole change gets the adversarial trio** (HARD RULE #25), applied to the diff that ships: it touches
  `lib/core`, the dispatcher, the manifest contract and fifteen components.

## 8. Risks

- **Ten importers of the kernel.** Each moves to the plugin services layer; an importer that keeps a direct
  `require` works until the re-export is deleted, then fails loudly. The re-export's removal is its own commit.
- **`lint-core` must stay pure and fs-free.** It reaches the plugin the way it reaches icons and avatars today, through
  the generated registry, not through a file read.
- **Compose and autocomplete** already key on the inline-kind table; the pill row must keep its editor.
- **Cascade order.** Moving the pill rules from tier 7 to the plugin slot changes their source position relative to
  `base.treatments`, `sketch`, `semi-universal` and `universal`. Phase 1's byte-diff of the pill rules does not catch
  a cascade change, so phase 1 also renders `examples/inline-pills.md` and the gallery's pill slides before and after.
- **`HARD RULE #26`.** The pill rules are unlayered today and stay unlayered.
- **`HARD RULE #20`.** The pill rules use no `margin`; the component rules that move out must not reintroduce one.

## 9. Commit plan (one branch, one PR, one commit per item)

1. This note.
2. The `pills` plugin folder with the kernel and styles moved, the untagged-kind support in the schema, the
   generator and `spec/LPM.md`, and the dispatcher row. Byte-identical output.
3. Move the ten kernel importers to the services layer; delete the re-export.
4. The off path: literal code on every surface, with the tests in §7.
5. `docs/src/content/catalog/plugins/pills.md`, the hub entry, and the `lib/plugins/README.md` and `base.docs.md` edits.
6. The plugin gaps from §5 that no component needs first: `--lat-pill-case`, `--lat-pill-tracking`, `--lat-pill-edge-w`,
   the `tone` axis, the `pill-tag` pass.
7. `checkHandRolledPills` with a measured allowlist of the 15.
8. One commit per component, type A first (nine), then B, then C, then `inventory`. Each removes its allowlist entry.
9. The allowlist is empty; the gate's budget is 0. `changelog.d/` fragment, `examples/pills-plugin.md` demo deck.
10. The adversarial trio on the result; fixes folded in before the PR opens.

## 10. Open

- Whether `verdict-grid` and `state-chart` should `require` the plugin or list it `optional` is decided when each
  component moves, from what its off state looks like.
- Whether the counter pills in `redline` and `regulatory-update` keep their numbering in CSS and ask the plugin for
  only the shape is decided in that component's commit. The §5 row is the default.
