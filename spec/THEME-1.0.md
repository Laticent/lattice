# The Lattice theme contract — spec 1.0

<!-- spec-parts
schema: themes/theme.schema.json
reference: lib/theme/gate.js lib/theme/derive.js
tests: spec/conformance/theme/ tools/theme-conformance.js
-->

**Version:** 1.0 · **Status:** Draft, for the owner's sign-off · **Date:** 2026-10-08 · **Owner:** @saden1 ·
**License:** [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) (this document and its shared test cases)

A **theme** is the palette a deck renders in. Lattice's layouts never name a color: every color
they paint is a CSS custom property, a **token**, such as `--accent` or `--cat-3-fill`. A theme
supplies the tokens, so one deck can be restyled by changing one line. This spec says what a
theme file holds, which tokens it must declare, and what a reader must refuse, so another tool
can write a theme Lattice renders, or render a deck in a Lattice theme.

The owner ruled on 2026-10-08 that the theme contract is a public spec
(`engineering/decisions/2026-10-08-spec-audit.md` §8.1). The cost of that ruling is stated
there: the token names below change only with a version of this spec.

## 1. The four parts

| Part | Where it lives |
|---|---|
| Document | this file |
| Schema | [`themes/theme.schema.json`](../themes/theme.schema.json), for the manifest (§5) |
| Reference implementation | `gateThemeCss` in `lib/theme/gate.js` (the conformance and safety checks); `deriveTheme` in `lib/theme/derive.js` (a full theme from ten colors); the token list, `REQUIRED_TOKENS` in the same file |
| Shared test cases | [`spec/conformance/theme/`](./conformance/theme/README.md) |

## 2. How a deck names a theme

A deck names its theme in front matter, `theme: indaco`. A renderer resolves the name to one CSS
file; the reference implementation reads `themes/<name>/<name>.css`. A name is lower-case letters,
digits and hyphens, starting with a letter (`^[a-z][a-z0-9-]*$`). What a renderer does with a
name it does not know is not fixed by 1.0.

## 3. The theme file

A theme file is a CSS stylesheet with three kinds of content.

1. **A name directive** in its first comment, `/* @theme <name> */`. A writer SHOULD write one
   matching the file name; a reader uses it to refuse a theme that imports itself (§6).
2. **An import naming what it builds on.** A **base** theme imports the engine,
   `@import 'lattice';`. A theme that builds on another (a dark variant, or a derived palette)
   imports that theme by its bare name, `@import 'indaco';`. Every import is a quoted bare name
   and nothing else (§6). A writer SHOULD write exactly one. A theme that imports no other theme
   is self-contained, whether or not it imports the engine.
3. **Token declarations at the root**, in a rule whose selector is `:root`, `:where(:root)` or a
   repetition of `:root` (`:root:root`). A value may use `light-dark(<light>, <dark>)` to give the
   token two faces (§4.2).

A theme may also set `color-scheme` at the root. Anything else (a rule that paints an element
directly) is allowed but reported: it reaches every slide of every deck the theme is applied to,
around the tokens.

## 4. The tokens

### 4.1 Which tokens a theme declares

A theme that imports the engine (a **self-contained** theme) MUST declare every token in the
table below, except the ones marked †, which the engine defaults, and ‡, which every reader
reads with a fallback. A missing unmarked token is an error: the engine has no value for it, so
whatever reads it paints nothing. A missing † or ‡ token is a warning: the deck renders, but the
contrast the token was meant to guarantee is not checked against its surface.

A theme that imports another theme (a **composing** theme) inherits that theme's tokens and may
override any subset of them.

| Group | Tokens |
|---|---|
| Surfaces | `--bg` `--bg-alt` `--surface-inverse` `--border` |
| Ink | `--text-display` `--text-heading` `--text-body` `--text-secondary` `--text-label` `--text-muted` `--code-inline-fg` |
| Graphical ink | `--muted-mark` |
| Accent | `--accent` `--accent-soft` `--on-accent` `--on-accent-soft` † `--accent-soft-body` † |
| Status | `--pass` `--fail` `--warn` `--info` `--mute` `--on-mark` `--pass-mark` `--warn-mark` `--fail-mark` `--info-mark` `--mute-mark` `--pass-vivid-mark` `--warn-vivid-mark` `--fail-vivid-mark` `--info-vivid-mark` `--warn-signal-mark` `--fail-signal-mark` `--pass-bg` `--fail-bg` `--warn-bg` |
| The dark face | `--scheme-dark-bg` `--scheme-dark-bg-alt` `--scheme-dark-border` `--scheme-dark-text-heading` `--scheme-dark-text-body` `--scheme-dark-text-display` `--scheme-dark-text-secondary` `--scheme-dark-text-label` `--scheme-dark-text-muted` `--scheme-dark-muted-mark` |
| Categorical slots | `--cat-1-fill` `--cat-2-fill` `--cat-3-fill` `--cat-4-fill` `--cat-5-fill` `--cat-6-fill` `--cat-7-fill` `--cat-8-fill` `--cat-9-fill` `--cat-10-fill` `--cat-11-fill` `--cat-12-fill` `--cat-1-mark` `--cat-2-mark` `--cat-3-mark` `--cat-4-mark` `--cat-5-mark` `--cat-6-mark` `--cat-7-mark` `--cat-8-mark` `--cat-9-mark` `--cat-10-mark` `--cat-11-mark` `--cat-12-mark` `--cat-1-ink` `--cat-2-ink` `--cat-3-ink` `--cat-4-ink` `--cat-5-ink` `--cat-6-ink` `--cat-7-ink` `--cat-8-ink` `--cat-9-ink` `--cat-10-ink` `--cat-11-ink` `--cat-12-ink` `--cat-on-fill` `--cat-on-mark` `--diagram-stroke` `--diagram-line` `--diagram-accent-warm` |
| Heatmap ramp | `--heatmap-step1` ‡ `--heatmap-step2` ‡ `--heatmap-step3` ‡ `--heatmap-step4` ‡ `--heatmap-step5` ‡ `--heatmap-step1-ink` ‡ `--heatmap-step2-ink` ‡ `--heatmap-step3-ink` ‡ `--heatmap-step4-ink` ‡ `--heatmap-step5-ink` ‡ |
| Containment | `--c-container` `--c-subcontainer` `--c-container-edge` `--c-subcontainer-edge` `--c-on-container` `--c-on-subcontainer` |
| Spectrum | `--spectrum` `--spectrum-vertical` `--spectrum-end` |
| Sequential | `--seq-500` |
| Universal signal | `--diagram-critical` |
| Code highlighting | `--syntax-comment` `--syntax-keyword` `--syntax-builtin` `--syntax-number` `--syntax-constant` `--syntax-string` `--syntax-entity` `--syntax-type` `--syntax-variable` `--syntax-punctuation` |
| Charts | `--chart-cat1` `--chart-cat2` `--chart-cat3` `--chart-cat4` `--chart-cat5` `--chart-cat6` `--chart-cat7` `--chart-cat8` `--chart-neutral-mark` |

† the engine defaults it (`ENGINE_DEFAULTED_TOKENS`). ‡ every reader has a fallback
(`FALLBACK_ONLY_TOKENS`). Both live in `lib/theme/gate.js`, and a test holds this table to them.

**Status has two jobs, chart colors are SOLIDS, and every solid carries one ink.** `--pass` `--warn` `--fail`
`--info` `--mute` are the status as INK on the slide: each clears 4.5:1 as text on `--bg` and `--bg-alt`.
`--pass-mark` … `--mute-mark` are the status as a FILL a label sits on, in the default `muted` intensity, and the
`-vivid` set is the `vivid` one (`chart-finish: … vivid`; `--mute-mark` has none). Every chart fill, a status, one of
the eight `--chart-catN` or `--chart-neutral-mark`, is DEEP: text on it is white (`--on-mark`, the one ink), at 7:1 on the light face and 4.5:1 on the dark face, and the fill clears 3:1 against `--bg` by itself.
A status drawn as a line or as text paints its ink, `--pass` … `--mute`, so it needs no token of its own.
`--warn-signal-mark` and `--fail-signal-mark` are the rings an at-risk or blocked shape
wears, at the opposite lightness to its fill: bright on a deep fill, clearing 3:1 against the fill on the light face
and against `--bg` on the dark face; deep on an `a11y-` palette's bright dark-face fill, clearing 3:1 against the
fill. The status fills of an `a11y-` palette stay apart for its own colorblind condition; on the dark face an `a11y-`
palette's chart fills are BRIGHT under a near-black `--on-mark` (still one ink per slide), and its
rings deep.

The code-highlighting tokens name ROLES, not a highlighter's classes: Lattice's code plugin maps
each highlight.js class onto one of them, so a theme never names highlight.js. Four more roles are
optional, because the engine gives each a default: `--syntax-parameter` (function parameters),
`--syntax-markup` (tags, names and attributes in markup languages), and the diff pair
`--syntax-inserted` and `--syntax-deleted` (a diff's added and removed lines). A theme MAY declare
them; one that does is held to the same contrast as the ten above.

A theme MAY declare tokens outside this table, for its own use (`--brand-*` operands that build
`--spectrum`, for instance). A reader MUST keep them: a token in the table can be built from one
that is not.

### 4.2 Light and dark

A theme can have a light face, a dark face, or both. A token written `light-dark(L, D)` resolves to
`L` or `D` by the slide's `color-scheme`. The `--scheme-dark-*` tokens are the surfaces a deck uses
when one slide (a `dark` slide) flips inside a light deck. A **dark variant** theme imports its base
theme and pins `color-scheme: dark` at the root; it declares no tokens of its own.

### 4.3 What the tokens must satisfy

Declaring every token is the floor. The categorical slots carry a three-layer contrast contract
(mark against the slide 3:1 or more, ink against fill 4.5:1 or more, fill distinct from mark),
documented in `design/theming.md` § The categorical contrast contract and checked for the shipped
themes by `checkCatContrast` in `tools/check-ownership.js`. Contrast is not part of conformance in
1.0, because it needs a renderer to compute; a conformant theme SHOULD meet it.

## 5. The manifest

A theme MAY carry a manifest, `<name>.manifest.json`, beside its CSS. Every shipped theme has one,
and every theme the Studio exports writes one. The manifest says what the CSS cannot: the theme's
role, its family, which faces it has and where a picker lists it. It carries **no** token names or
values; those live in the CSS only. The schema is [`themes/theme.schema.json`](../themes/theme.schema.json).

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | The theme's name, equal to its file name. |
| `role` | yes | `base` (imports the engine), `variant-dark` (imports a base, pins dark) or `derived-variant` (imports a theme, overrides some tokens). |
| `extends` | unless `base` | The theme it imports. |
| `family` | yes | `brand` or `a11y` (built for a color-vision deficiency). |
| `modes` | yes | The faces it has: `light`, `dark` or both. |
| `tier`, `darkCounterpart` | for a `base` | Which picker group lists it, and its dark variant (or `null`). |
| `order`, `swatch` | for a listed theme | Its place in the picker group, and the color of its dot there. |
| `cvd` | no | The color-vision deficiency an `a11y` theme is built for. |
| `type`, `format` | no | `"theme"` and `1`, written by an exporter so a loose file says what it is. |
| `note` | no | One line on a deliberate oddity. |

## 6. What a reader refuses

A theme is a file from anyone, and a stylesheet can fetch, so a reader MUST refuse:

- an `@import` that is not a quoted bare name of a theme the reader holds: `@import url(…)`, a path,
  a URL, an unquoted target, a name it does not know, the theme's own name, or an import with a
  `layer()`, `supports()` or media tail;
- a `url()` or `image-set()` target that is not an inline `data:` URI or a `#fragment`, because a
  remote fetch can carry deck content out;
- `expression(…)`, `-moz-binding`, and a `javascript:` or `vbscript:` URL.

The reference implementation reports these as `theme-import`, `css-url-remote`, `css-expression`,
`css-binding` and `css-scheme`, and marks them **blocking**: a reader shows no part of a theme that has one. The
reasons are in `engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md`.

## 7. Conformance

A theme file is **conformant** when it has no finding §6 refuses and, if it is self-contained,
declares every unmarked token in §4.1. The SHOULDs in §3 are advice, not conformance. A **reader**
is conformant when it resolves the tokens a conformant theme declares, keeps the tokens it does
not know, and refuses what §6 lists.

The shared test cases pair a theme file with what the checks conclude: `ok`, `blocked` and the
missing tokens are the contract. The cases also name the reference implementation's finding IDs
(`errors`, `warnings`); a reader whose findings are named differently checks the contract fields
and skips those two.

## 8. Versioning

- **Major:** renaming or removing a token, adding a token a self-contained theme must declare, or
  changing what a token means. Every existing theme stops conforming.
- **Minor:** adding a token marked † or ‡, or a manifest field.
- **Patch:** clarifications.

## 9. Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-08 | First version, written from the reference implementation (spec audit §8.1). Waits on the owner's sign-off. |
| 1.0 (draft amended) | 2026-10-15 | Before sign-off, the code-highlighting tokens were renamed (the ten `--hljs-*` this spec required, and two more the engine read) to role names (`--syntax-keyword`, …; `built_in` → `builtin`, `literal` → `constant`, `title` → `entity`) and four optional roles were documented, because the engine stopped naming its highlighter (`engineering/decisions/2026-10-15-code-plugin.md`). The owner chose to amend the unsigned draft rather than version it. `lib/tokens/crosswalk.js` renames an old theme mechanically. |
