---
status: proposed
summary: >
  The Studio already ships a code editor — CodeMirror 6 (`CodeField`), and the
  component faculty already gives you CSS + skeleton + a Fields ⇄ manifest-JSON
  toggle. What theme and finish lack is not an editor but a decision about which
  artifact is the MODEL: their CSS is generated, so hand-editing it forks away
  from the pickers that generated it. The rule adopted here — be isomorphic where
  the two representations can round-trip, and validate where they can't — splits
  the three faculties three ways. A first draft claimed theme CSS ⇄ a flat token
  map was already isomorphic; the adversarial trio refuted that against the
  shipped corpus, so the theme model is specified here as a total, ordered,
  selector-aware declaration record, and `serializeTheme` needs producer changes
  before any of it works.
tags: [studio, authoring, theme, finish, component, css, validation]
---

# Hand-editing a generated asset (2026-08-25)

## Correction, on implementing the first slice (2026-08-25, #1841)

Five figures below were taken against a tree that had already moved, and one of
them specifies a producer change **the tree now rejects**. The parser and its
round-trip test were built against the measurements, not against this note, and
these are what the corpus actually says. Everything else here held.

| This note says | Measured | Where |
|---|---|---|
| `serializeTheme` needs a **`:root:root` status-trio mirror** | **Dead — and now a gate failure.** #1826 landed after this note and retired the duplicates; `checkStatusTrioParity` no longer exists. Its replacement `checkPackedRootReach` fails a custom property declared at BOTH `:root` and `:root:root`: **3 errors per theme with the mirror, 0 without.** One producer change, not two | `tools/check-ownership.js:1523`, `2026-08-24-status-trio-single-root.md` |
| Precondition 5 — Studio themes "could not be graduated without failing `build:check`" | **False now.** A generated theme runs `checkPackedRootReach` clean. Plain `:root` is exactly right post-#1527 | measured on `serializeTheme` output |
| **47** distinct non-contract custom properties | **48** | `themeRecordView` over `themes/` |
| **15 of 32** declare one inside a root block | **19 of 32** — all at plain `:root`. The four `a11y-*` variants were missed; they carry `--hljs-params` / `--hljs-tag` | ” |
| `@import` is the whole token content of **18 of 32** | **13 of 32** — the `*-dark` wrappers only. 18 is `32 importers − 14 self-contained`, and that subtraction double-counts: the four `a11y-*` variants both import *and* declare 19 tokens of their own | ” |

The validation-ladder row for `checkStatusTrioParity` is therefore struck — the
pairing rule it named no longer exists, and the invariant that replaced it says
the opposite.

## The ask

> "Whether we want direct css editing for themes, css and manifest for
> components, css editing for finish … we should allow power users to do hand
> editing. I don't think our current design is suited for that. We have a rich
> point and click editor with preview today but we are missing a code editor."

Half of that premise is already false, and the half that is true is not an
editor problem.

## What already ships

`docs/src/components/studio/CodeField.tsx` is a CodeMirror 6 field — syntax
highlighting, line numbers, `css` / `markdown` / `json` languages, optional
schema-aware autocomplete, and a `<textarea>` fallback under jsdom. It shares
the deck editor's visual theme (`editor-theme.ts`).

The **component** faculty already uses it three times over:

| Surface | Where | Language |
|---|---|---|
| Component CSS | `LayoutStudio.tsx:94` | `css` |
| Skeleton | `LayoutStudio.tsx:98` | `markdown` |
| Manifest JSON | `Fabricate.tsx:984` | `json`, with `manifestJsonCompletion` |

The manifest surface is already a **Fields ⇄ JSON toggle** over one model, and
its own copy says so: *"Edit the raw manifest — the Fields view stays in sync,
completion suggests valid values. The gate validates it live."* Findings from
`gateCss` render live beside the editor, and a CSS exfil finding **pauses** the
CSS out of the preview frame — the decision is commented at
`LayoutStudio.tsx:82-87` and the mechanism is one line, `extraCss={cssBlocked ?
'' : css}` at `LayoutStudio.tsx:126`.

So the component faculty is already the thing being asked for. Theme and finish
have no code surface at all.

## Why theme and finish are not just "add a `CodeField`"

The axis that matters is **whether the code IS the model or an OUTPUT of it.**

| Faculty | The model | The CSS | Inverse |
|---|---|---|---|
| **Component** | the CSS + skeleton + manifest, authored directly | authored | not needed — the code *is* the model |
| **Theme** | 10 essentials + per-token `overrides` + a `rampStrategy` | `serializeTheme(deriveTheme(…))` — **107 declarations / 153 lines** | **none exists** |
| **Finish** | a `FinishRecipe` object | `generateFinishCss(slug, recipe)` | **none exists** |

*(A hand-authored palette runs larger — `onyx.css` is 167 custom properties
across 453 lines. The generated figure is the one that matters here.)*

Drop a `CodeField` over a generated stylesheet and you have built a fork: the
author edits the CSS, then changes something in the faculty, the model
regenerates, and the edit is gone with no warning. That is the actual design
problem, and it is why "add a code editor" is the wrong shape of answer for two
of the three.

**The fork window is a keystroke, not a picker move.** `Fabricate.tsx:270-282`
recomputes `deriveTheme → applyOverrides → serializeTheme` in a `useMemo` keyed
on `[core, overrides, themeName, themeDesc, rampStrategy]`, commented "REAL,
every render." Two of those are free-text fields. Typing one character into the
*description* regenerates the CSS. So the hand-edited model must **become** that
memo's source, not sit beside it.

## The rule

> Be **idiomatic and isomorphic** where we can be, and **leverage validation**
> where we can't.

*Isomorphic* here means the strict thing: two representations of the same model,
convertible both ways without loss, so editing either is editing the model. The
manifest's Fields ⇄ JSON toggle is the existing proof that we already know how to
build one; the point is to find where else the property genuinely holds instead
of assuming it everywhere.

Where it doesn't hold, we do not fake it with a lossy round-trip. We keep the
one-way generation honest and put a validator on the hand-written side.

Applied to the three faculties, the rule does not give one answer — it gives
three, and each is a measurement, not a preference.

## Theme — the model is a total, ordered, selector-aware declaration record

**A first draft of this note claimed theme CSS ⇄ a flat token map was already
isomorphic, and that no producer change was needed. Both were wrong.** The
adversarial trio (HARD RULE #25) refuted it against the shipped corpus; the
measurements are below, because they are what constrains the design.

### Why the flat map fails

`serializeTheme` is a **projection onto 107 names, not a bijection.** `rootBlock`
(`lib/theme/serialize.js:74-79`) walks a fixed name list — the `REQUIRED_TOKENS`
sections at `serialize.js:112-120` — so any key outside that list is never
visited. `parse` then `serialize` silently deletes it.

Measured over `themes/`:

| | |
|---|---|
| `REQUIRED_TOKENS` names (what the emitter can write) | **107** |
| distinct custom properties in `themes/` outside that list | ~~47~~ → **48** |
| themes declaring ≥1 of them | **19 of 32** |
| themes declaring ≥1 *inside a root block* (what a parser eats) | ~~15~~ → **19 of 32** |

The dropped names are not decoration: `--chart-catN-ink` ×8, the `--diagram-*`
state family, `--cat-N-texture` ×12 (the categorical texture channel,
`engineering/textures.md`), `--hljs-params` / `--hljs-tag`, `--seq-500`.

**And the failure cascades.** `themes/indaco.css:173` declares

```css
--spectrum: linear-gradient(90deg, var(--brand-canvas) 0%,
                            var(--brand-bright) 55%, var(--brand-alt) 100%);
```

`--spectrum` is in the contract and survives. All three operands are outside it
and are dropped. `--spectrum` then resolves to the guaranteed-invalid value, and
because it is read bare inside `background:` / `border-image-source:` shorthands
(`lib/base/base.elements.css:73`, `base.modifiers.css:477`,
`base.variants.css:160`), the whole declaration is invalidated at computed-value
time. That is precisely the failure
`engineering/decisions/2026-08-10-no-safe-default-token-contract.md` records: *a
missing `--spectrum` invalidates the whole `background:` shorthand it rides in,
so a divider slide rendered white-on-white, 1.0:1.* The naive inverse reproduces
this repo's own worst shipped palette bug.

### Why "root-ish → the map" fails twice more

**`:root:root` is a protocol, not a specificity curiosity.** A flat map has one
slot per name and cannot hold "this value, at two selectors." *(The example this
paragraph used — the status trio declared twice — is gone: #1826 retired the
duplicates and `checkPackedRootReach` now fails them, so `checkStatusTrioParity`
no longer exists. The argument survives on a narrower case that still ships:
`themes/a11y-base.css:89` pins `color-scheme` at `:root:root` as well as `:root`.
The record is keyed by (selector, name) so the shape is representable at all.)*

**`color-scheme` is not a token.** It appears under a root selector in **28 of 32**
themes. `themes/ardesia-dark.css` is, in its entirety:

```css
@import 'ardesia';

:root { color-scheme: dark; }
```

Under "declarations under a root-ish selector → the token map", `color-scheme:
dark` enters the map, is not a `REQUIRED_TOKEN`, is dropped on the way out, and
`serializeTheme` hard-codes `:where(:root) { color-scheme: light; }` in its
place. **Open a dark theme in the CSS view, save, and it is a light theme.**

**`@import` carries inheritance.** It appears in **32 of 32** themes, and in
~~18~~ **13 of 32** it is the theme's entire token content — the `*-dark`
wrappers. *(The `a11y-*` variants were counted here and should not have been:
they import `a11y-base` AND declare 19 tokens of their own, the status trio moved
off the red-green axis being the one thing that differs per CVD type.)* A parser
that files at-rules under "everything else"
loses `@import 'ardesia'` outright, and the conformance rung then reports ~106
phantom missing tokens as errors against a file that is correct.

### The model this implies

**Four buckets, not two**, and a record rather than a map:

1. **custom properties under a root-ish selector** → the declaration record,
   keyed by **(selector, name)** so `:root` and `:root:root` stay distinct, in
   source order, **including names outside `REQUIRED_TOKENS`**;
2. **non-custom-property declarations under a root-ish selector** (`color-scheme`)
   → their own slot, never the token record;
3. **at-rules** (`@import`) → their own slot, preserved and understood;
4. **non-root rules** → the verbatim tail, round-tripped untouched.

`REQUIRED_TOKENS` is the **validator** and never the **emitter**. `serializeTheme`
needs an **extras emitter** for unrecognized names before any of this works.
*(This paragraph called for a second producer change, a `:root:root` mirror for
the status trio. See the correction at the top: #1826 landed after this note and
made that mirror a gate failure. The extras block is additive, so a theme
carrying no extras keeps its exact byte layout.)*

The tail (bucket 4) remains the escape hatch for a rule the token model can't
express — found by parsing rather than bolted on as a separate "custom CSS" box.

### What is genuinely lossy, and the demotion

`essentials` + `rampStrategy` do not round-trip, and the resolution is to stop
calling them the model. They are a **generator**: ten colors and a strategy that
*produce* a declaration record. The record is the model; the pickers seed and
nudge it; the CSS view edits it directly.

This is closer to writing down what the code already does than the first draft
realized. `Fabricate.tsx:470` — the only production caller of `saveStudioTheme` —
passes `{name, label, essentials, css}` and **never passes `overrides` or
`rampStrategy`**, though `saveStudioTheme` (`theme-library.ts:81`) and
`themeAsset` (`serialize.js:143`) both accept them and the latter's docblock
promises a saved theme reloads as itself. `asset-bundle.ts`'s `ThemeItem` has no
field for them at all. What every consumer actually renders is `text`
(`StudioShell.tsx` `extraTheme = {name, css}`). Essentials are already advisory.

Two consequences the design owes:

- **Four surfaces read `essentials` back** and start lying after a hand edit: the
  Library card's swatch row (`Library.tsx:99-103` — it *is*
  `Object.values(essentials)`), the theme picker dot (`StudioShell.tsx:1804`,
  `:3169`), `StudioDrawer.tsx:439`, and the `lattice-asset/1` zip manifest. Derive
  those from the record's `--accent`, and decide whether the zip's `essentials`
  field becomes advisory or deprecated — that is a compatibility surface.
- **The AI path is a silent overwrite.** `architect.ts:510-551` returns
  `{essentials, rampStrategy, tokens}` and `Fabricate.tsx:313-343` `runDescribe`
  sets core + ramp and clears overrides. Running "describe a look" on a
  hand-edited theme destroys the record exactly as "re-derive from essentials"
  would, but reached from a text box rather than a button that announces itself.
  Both need the same explicit-overwrite affordance. The same shape applies to the
  component faculty's `runDescribeComponent`.

## Component — nothing to reconcile

The CSS is arbitrary by design; the author owns it. The model here is *edit the
CSS, preview the result*, which is exactly what ships. The isomorphism that
applies is the one already built: Fields ⇄ manifest JSON.

What the component path contributes to this note is the **validation** half of
the rule, already working: `gateCss` (`lib/layout/gate.js:461`) runs `no-hex`,
selector `scope`, `findCssExfil`, `no-margin` (HARD RULE #20) and `fs-token`
(HARD RULE #4) live against the editor.

**The trap for whoever implements this: no `gateCss` rule is reusable as-is for a
theme.** Measured: `gateCss` rejects **all 32** shipped themes, but not for one
reason. For the 19 full palettes it is `no-hex` (118–200 findings each) and
`scope` (6–39 each) — a theme *is* hex literals at `:root`. For the 13 `*-dark`
wrappers neither rule fires; they are rejected by `css-import` alone. Compose the
theme gate from the individual `find*` primitives (all exported from
`lib/layout/gate.js`) — never by calling `gateCss`.

## Finish — recipe ⇄ JSON is isomorphic; recipe → CSS is not

`generateFinishCss` (`finish-generate.ts:653`) emits three blocks — the rich
screen face, an `@media print` opaque mirror, and a `.lattice-exporting` opaque
mirror — and each is a slot list, so the output *looks* token-shaped. It isn't
reversible:

- The opaque mirrors are emitted twice from **one** `opaqueBody` specifically so
  they cannot drift; a hand edit to one is a fork with no representation in the
  recipe.
- A wash `type` swap is a whole different slot set, which is exactly why a deck's
  `finish-override:` overrides by **regenerating the finish** rather than by
  racing a rival custom property (`mergeFinishOverride`).
- `spotlightMask` turns `{x, y, radius}` into `radial-gradient(…)` strings at two
  feather profiles. *(This is the weakest of the three arguments — the values are
  `toFixed(0)` integers `coerceRecipe` already clamps, so that string is
  parseable. The two above carry the section.)*

So the finish's isomorphic pair is **Fields ⇄ recipe JSON**, not Fields ⇄ CSS.
The generated CSS gets a **read-only** view with copy/export: the export path
reads the recipe (`--fin-backdrop-*` slots, the opaque mirrors), so hand-edited
finish CSS detaches from the artifact the PDF and PPTX actually render.

`coerceRecipe(input: unknown)` (`finish-generate.ts:218`) is the validator — with
two caveats that must not be discovered at implementation time. It **normalizes
silently and reports nothing**, so "tell the author what was clamped" needs a
second return channel that does not exist today. And it is a normalizer rather
than a validator in exactly one field: `mark.glyph` (`:244`) is stored raw. That
is inert only because `sanitizeGlyph` (`:93-102`) strips `["'\\<>{};]` and
truncates at *emit* time — the guard is downstream, not in the "validator".

**Open question, deliberately not settled here:** the recipe is a closed
vocabulary — every axis is an enum or a clamped range — so a JSON view lets an
author type `wash.type: "sparkle"`, get `"none"` back, and read a diff about it.
That may be a worse experience than the picker for someone who by construction
cannot express anything new. The read-only CSS view is cheap and honest and
should ship; the Fields ⇄ JSON view should wait for a user who wants it.

## Templates

Every code surface opens on a **template**, never an empty box:

- **Theme** — every `REQUIRED_TOKENS` name present in `serializeTheme`'s section
  order, at plain `:root` and nowhere else, so the template is a theme that would
  pass `checkPackedRootReach` if it were graduated to `themes/`. *(This called for
  a `:root:root` mirror; adding one is what would now fail the gate — see the
  correction at the top.)*
- **Component** — ships already (`STARTER_CSS` / `STARTER_SKELETON` /
  `STARTER_META`).
- **Finish** — `coerceRecipe(DEFAULT_RECIPE)`, not `DEFAULT_RECIPE`: coercion adds
  `wash.x/y/spread` and `mark.x/y/scale/angle`, so the raw constant mutates on the
  author's first keystroke. Seed with the coerced form and the template *is* the
  model.

The template is also what makes the validator teachable: "this token is missing"
is only fair if the author was handed the full list to begin with.

## The validation ladder

| Surface | Validates against | Blocking? |
|---|---|---|
| Theme CSS | `REQUIRED_TOKENS` conformance — **only for a self-contained theme**; a theme composing via `@import` inherits and must not be indicted | error |
| Theme CSS | `auditBoth` AA in both modes — **with the blindness below surfaced** | warning |
| Theme CSS | `findCssExfil` **minus `css-import`**, plus the theme-import allowlist below | **blocking** — pause the CSS out of the preview, the `LayoutStudio.tsx:126` pattern |
| Theme CSS | ~~`checkStatusTrioParity`'s pairing rule~~ — **struck**; the gate is retired. Its replacement `checkPackedRootReach` inverts it: a custom property above plain `:root` is dead weight or inert | error |
| Component CSS | `gateCss` — unchanged | error / warning as today |
| Finish JSON | `coerceRecipe` + a clamp/drop report | normalizes; report what changed |
| Any CSS → preview frame | `sanitizeStyleText` (HARD RULE #22) | neutralizes `</style`; it is **not** a CSS sanitizer and blocks nothing on its own |

### The `@import` allowlist is a security decision, not a convenience

`CSS_EXFIL_RULES[0]` (`lib/layout/gate.js:69`) bans `@import` unconditionally, and
`findCssExfil(serializeTheme(deriveTheme(…)))` returns `css-import` at line 14 —
**the theme template trips the blocking rung.** The obvious fix is to drop the
rule for themes. That opens a live channel: `hoistImports`
(`lib/engine/css.js:216-233`) *deliberately* hoists `@import url(…)` to the top of
the composed sheet so it survives the "@import must be first" rule, and
`prunePlayerCss` (`lib/export/player-prune.js:129`) always keeps `@import` into a
downloaded player.

What makes a hoisted remote import inert today is that theme CSS is never first
in the `<style>` — `single-slide-render.ts:611-635` and `deck-preview.js:325`
both prepend rules — so CSS ignores the import. That is an **accident of
concatenation order**, gated by nothing, one refactor from being false, in a
frame holding the user's BYOK key (HARD RULE #24).

So the theme gate allows **a bare quoted import of a registered theme name**
(the `THEME_IMPORT_RE` / `THEME_NAME_IMPORT_RE` grammar at `lib/engine/css.js:51`,
`lib/engine/themes.js:45`) and **rejects `@import url(…)` and any other target
outright**. Write it as an allowlist, not a relaxation.

### `auditBoth` fails open on non-hex color

`isHex` (`lib/theme/contrast.js:51`) is `#rgb` / `#rrggbb` only. A non-hex
operand yields `status: 'skipped'`, and `auditVars`'s verdict counts `skipped` as
neither failure nor missing. Measured: a 107-token map of `oklch(50% 0.1 250)`
returns **`ok: true`**. The pickers only ever emit hex, so this was never
load-bearing — but hand-editing is exactly where `oklch()` / `color-mix()` /
`rgb()` / `#RRGGBBAA` arrive. Either normalize parsed values to hex before
auditing, or surface `skipped` as a first-class "could not be checked" finding.
Silently reporting a clean bill of health on an unreadable theme is the one
outcome not available.

### A css-tree parser would be an ungated re-wrap sink

If the parser uses css-tree (already a dependency via `player-prune.js`), it
becomes a HARD RULE #22 third-arm sink: any CSS serializer normalizes `<\/style`
back into a live terminator, and `themes/a11y-base.css:234-241` is exactly the
`content: "…"` shape that carries it. `checkCssTreeRewrapSinks`
(`tools/check-ownership.js:5583`) discovers sinks by matching
`prunePlayer(Css|FontFaces)\s*\(`, so a new `csstree.generate()` site matches
nothing and the gate stays green. The parser owes `sanitizeStyleText` at the
re-wrap **and** an entry in that gate's discovery. css-tree also drops comments by
default, which would eat the theme header and the a11y docblocks.

## Preconditions — things that must be true before this is buildable

These are pre-existing and off-path for this note's own diff (HARD RULE #18 says
log them), but the design rests on them:

1. **`overrides` / `rampStrategy` are never persisted by any production caller**
   (`Fabricate.tsx:470`, `Library.tsx:295`, `workspace-backup.ts:129` all omit
   them; only a unit test passes them). So no theme in any user's library today
   can be faithfully re-derived, and "re-derive from essentials" is a destructive
   button on records that cannot honor it.
2. **The zip format cannot carry them** — `ThemeItem` / `ParsedTheme`
   (`asset-bundle.ts:28,39`) are `{kind, name, label, essentials, css}`. Export →
   import is lossy by type.
3. **Asset history is not in the workspace backup.** `asset-history.js:19-22`
   states the backup "carries it separately"; `workspace-backup.ts` never
   references it. The docblock is false, and #1839's recoverability — the safety
   net this note leans on — does not survive a backup/restore.
4. **No record-level schema version.** `putAsset` (`asset-store.js:76-85`) has
   none; `DB_VERSION` versions the database, not the record. Changing what a
   `kind:'theme'` record *means* is an unversioned reinterpretation of data
   already in users' browsers.
5. ~~**Studio-generated themes already ship an export-inert status trio**~~ —
   **struck, and it was false when written.** Measured: a `serializeTheme` output
   runs `checkPackedRootReach` clean, and adding the `:root:root` mirror this note
   asked for is what produces errors (3 per theme). Since #1527 flipped the export
   concat, plain `:root` reaches every render path.

## What this does not do

- **Motion / Anima is out of scope** (the maintainer's call, and #1678 has to
  give scenes a Library shelf first).
- **It does not make a hand-edited theme reproducible from its essentials.** That
  is the point, not an oversight — see the generator/model split above.
- **It does not add a raw-CSS path for finishes.** If that is wanted later, it
  should arrive as an explicit detach with a revert, on top of the version
  history #1839 specifies — not as a silently forking editor.
- **It does not gate the zip import path.** A theme imported from a `.zip`
  (`Library.tsx:295`) reaches `extraTheme` with no CSS gate at all, and the tail
  is arbitrary unscoped CSS that reaches every export. Either put the theme gate
  on the import path in the same change or log it — but do not leave it
  undiscussed, because a shared `.zip` is the one path where the author and the
  victim are different people.

## Sequencing

Tracked by #1841.

The **record-shape decision is a precondition on #1839's implementation**, even
though the UI ships after it. #1839 must decide what a saved theme reopens as, and
the two candidate implementations are mutually exclusive: re-derive from
`essentials` + `overrides` + `rampStrategy` (which first requires fixing
`Fabricate.tsx:470` to persist them, plus a migration for every record saved to
date), or hydrate from `text`. If #1839 ships the first, #1841 discards it and the
migration was net-negative work on user data. Decide the record shape first;
build the UI second.

## Prior art in the codebase

- The deck-level `style:` front matter is already a raw-CSS escape hatch (and
  #1790 is the open question of keeping the AI out of it).
- Per-token `overrides` on a theme are already a structured escape hatch, with
  `Override = { light?, dark? }` (`Fabricate.tsx:88`), reaching any token name —
  the declaration record generalizes them rather than replacing them.

## What the adversarial trio changed

Run per HARD RULE #25: red team + Munger inversion + independent checker, three
agents on Opus, against the first draft of this note.

**Refuted, and rewritten above:** the flat-map isomorphism claim (the emitter is a
projection onto 107 names); "only `findCssExfil` is universal" (it bans `@import`,
so the template tripped the note's own blocking rung); "`no-hex`/`scope` would
reject every valid theme" (false for 13 of 32); "~171 declarations / ~453 lines"
(the real generated figure is 107 / 153 — the wrong number was a hand-authored
theme's).

**Confirmed and kept:** the axis and the three-way split; the component analysis;
the finish irreversibility argument (the strongest section — the trio could not
break its central claim); the selector census (89 / 23 / 14, exactly 3 files with
non-root rules), reproduced independently with a css-tree AST walk; and the
round-trip itself, which is byte-identical **for Studio-generated themes** — the
scope the first draft failed to state.

**Attacks that held:** duplicate declarations of one token (last-wins matches
CSS); declaration order within a block (custom properties are not order-resolved);
a value divergence between the `:root` and `:root:root` arms (zero across all 32 —
the parity gate keeps them identical); `</style>` through the theme header
(`sanitizeStyleText` is called at both sanctioned builders); a hand-edited
`@theme` line hijacking the live registry (blocked by the named `addThemes`
form).

**Unverified, by construction:** nothing here has been driven on the running
Studio, because there is no UI yet. Every behavioral prediction owes a real-surface
check at implementation time (HARD RULE #23).
