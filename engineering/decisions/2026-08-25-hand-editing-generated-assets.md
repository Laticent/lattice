---
status: proposed
summary: >
  The Studio already ships a code editor — CodeMirror 6 (`CodeField`), and the
  component faculty already gives you CSS + skeleton + a Fields ⇄ manifest-JSON
  toggle. What theme and finish lack is not an editor but a decision about which
  artifact is the MODEL: their CSS is generated, so hand-editing it forks away
  from the pickers that generated it. The rule this note adopts — be isomorphic
  where the two representations can round-trip, and validate where they can't —
  splits the three faculties three different ways, and the measurements say which
  goes where.
tags: [studio, authoring, theme, finish, component, css, validation]
---

# Hand-editing a generated asset (2026-08-25)

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
CSS from reaching the preview frame (`LayoutStudio.tsx:82-87`) rather than
rendering it.

So the component faculty is already the thing being asked for. Theme and finish
have no code surface at all.

## Why theme and finish are not just "add a `CodeField`"

The axis that matters is **whether the code IS the model or an OUTPUT of it.**

| Faculty | The model | The CSS | Inverse |
|---|---|---|---|
| **Component** | the CSS + skeleton + manifest, authored directly | authored | not needed — the code *is* the model |
| **Theme** | 10 essentials + per-token `overrides` + a `rampStrategy` | `serializeTheme(deriveTheme(…))`, ~171 declarations / ~453 lines | **none exists** |
| **Finish** | a `FinishRecipe` object | `generateFinishCss(slug, recipe)` | **none exists** |

Drop a `CodeField` over a generated stylesheet and you have built a fork: the
author edits the CSS, then moves one picker, the model regenerates, and the edit
is gone with no warning. That is the actual design problem, and it is why "add a
code editor" is the wrong shape of answer for two of the three.

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

## Theme — CSS ⇄ token map is genuinely isomorphic

`serializeTheme` (`lib/theme/serialize.js:87-127`) emits, in order: a comment
header, `@import 'lattice';`, one zero-specificity `:where(:root) { color-scheme:
light; }` line, and then **nothing but `:root { --token: value; }` blocks** —
`rootBlock` maps a name list through `decl`, which writes exactly `  --name:
value;` and omits absent tokens. There is no computation on the way out.

That makes the inverse straightforward: parse the `:root` declarations back into
a flat map, and you have the model. Two facts make it more than a hunch:

- **`auditBoth(vars, …)` (`lib/theme/contrast.js:324`) already takes a flat
  token map.** The AA validator runs on the parsed representation with no
  adaptation — the same function the pickers use today.
- **`REQUIRED_TOKENS` (`lib/theme/derive.js:158`) is the conformance contract**,
  and `serializeTheme` already consumes it as the section ordering. Parse →
  check against the same list → tell the author which tokens are missing.

**What is genuinely lossy is `essentials` + `rampStrategy`** — and the resolution
is to stop calling them the model. They are a **generator**: ten colors and a
strategy that *produce* a token map. The map is the model; the pickers seed and
nudge it; the CSS view edits it directly. Under that reading nothing is lost by a
round-trip, because the thing that round-trips is the map.

This is a real change of meaning, and it has a visible consequence: after a hand
edit, the ten essential swatches no longer describe the map they generated. The
honest UI is to keep showing them as *what this theme was generated from*, with a
"re-derive from essentials" action that overwrites the map — an explicit,
undoable act, not a silent one.

**Non-root rules are a real case, not a corner.** Measured across the 32 shipped
themes: 89 `:root`, 23 `:root:root`, 14 `:where(:root)` — and **3 files**
(`a11y-base.css`, `concrete.css`, `onyx.css`) that also carry ordinary rules
(`section.dark:not(.print)`, per-series `section.radar .radar-poly[data-series]`
blocks, and similar). So the parser needs two buckets: **declarations under a
root-ish selector → the token map**, and **everything else → a verbatim tail**
that round-trips untouched.

That tail is worth noticing, because it is the escape hatch the original question
was reaching for — arrived at by parsing rather than bolted on as a separate
"custom CSS" box. A rule the token model can't express lives in the tail, the
pickers keep owning the map, and neither erases the other.

## Component — nothing to reconcile

The CSS is arbitrary by design; the author owns it. The model here is *edit the
CSS, preview the result*, which is exactly what ships. The isomorphism that
applies is the one already built: Fields ⇄ manifest JSON.

What the component path contributes to this note is the **validation** half of
the rule, already working: `gateCss` (`lib/layout/gate.js:461`) runs `no-hex`,
selector `scope`, `findCssExfil`, `no-margin` (HARD RULE #20) and `fs-token`
(HARD RULE #4) live against the editor.

**The trap for whoever implements this: `gateCss` is component-shaped and must
not be reused wholesale.** A theme is *made of* hex literals and is scoped to
`:root` by definition, so `no-hex` and `scope` would reject every valid theme
ever written, including all 32 shipped ones. Only `findCssExfil` is universal.
Compose the per-faculty gate out of the individual `find*` primitives — they are
all exported from `lib/layout/gate.js` — rather than calling `gateCss`.

## Finish — recipe ⇄ JSON is isomorphic; recipe → CSS is not

`generateFinishCss` (`finish-generate.ts:653`) emits three blocks — the rich
screen face, an `@media print` opaque mirror, and a `.lattice-exporting` opaque
mirror — and each is a slot list, so the output *looks* token-shaped. It isn't
reversible:

- `spotlightMask` turns `{x, y, radius}` into a `radial-gradient(…)` **string**,
  at two different feather profiles. Recovering the three numbers means parsing
  generated gradient text, per face.
- The opaque mirrors are emitted twice from one body specifically so they cannot
  drift; a hand edit to one is a fork with no representation in the recipe.
- A wash `type` swap is a whole different slot set, which is exactly why a deck's
  `finish-override:` overrides by **regenerating the finish** rather than by
  racing a rival custom property (`mergeFinishOverride`).

So the finish's isomorphic pair is **Fields ⇄ recipe JSON**, not Fields ⇄ CSS —
and `coerceRecipe(input: unknown)` (`finish-generate.ts:218`) already exists to
be its validator, normalizing arbitrary input, clamping numbers, resolving
keywords and dropping reset-to-default axes. It is the same shape as the
component's manifest editor and needs almost no new machinery.

The generated CSS gets a **read-only** view with copy/export. This is the one
place the answer is narrower than the ask, and the reason is concrete rather than
conservative: the export path reads the recipe (`--fin-backdrop-*` slots, the
opaque mirrors), so hand-edited finish CSS detaches from the artifact the PDF and
PPTX actually render.

## Templates

Every code surface opens on a **template**, never an empty box:

- **Theme** — every `REQUIRED_TOKENS` name present, in `serializeTheme`'s section
  order, with the section headings it already writes. A new theme's CSS view is
  the contract, spelled out.
- **Component** — ships already (`STARTER_CSS` / `STARTER_SKELETON` /
  `STARTER_META`).
- **Finish** — `DEFAULT_RECIPE` serialized as JSON.

The template is also what makes the validator teachable: "this token is missing"
is only fair if the author was handed the full list to begin with.

## The validation ladder

| Surface | Validates against | Blocking? |
|---|---|---|
| Theme CSS | `REQUIRED_TOKENS` conformance; `auditBoth` AA in both modes | contract → error; AA → warning (a deliberate low-contrast accent is the author's call) |
| Theme CSS | `findCssExfil` (HARD RULE #22) | **blocking** — pause the CSS out of the preview frame, as `LayoutStudio` already does |
| Component CSS | `gateCss` — unchanged | error / warning as today |
| Finish JSON | `coerceRecipe` | normalizes; report what it clamped or dropped |
| Any CSS → preview frame | `sanitizeStyleText` (HARD RULE #22) | **blocking** |

HARD RULE #22 is not a formality here: the Studio preview is a same-origin,
un-sandboxed `srcdoc` iframe holding the user's BYOK key, and hand-written CSS is
a new author-controlled path into it. Every surface this note adds is a
stylesheet channel and owes the guard.

## What this does not do

- **Motion / Anima is out of scope** (the maintainer's call, and #1678 has to
  give scenes a Library shelf first).
- **It does not make a hand-edited theme reproducible from its essentials.** That
  is the point, not an oversight — see the generator/model split above.
- **It does not add a raw-CSS path for finishes.** If that is wanted later, it
  should arrive as an explicit detach with a revert, on top of the version
  history #1839 specifies — not as a silently forking editor.

## Sequencing

Tracked by #1841. This lands **after** #1839 (edit a saved asset in place). A code view is most
useful once a saved asset can be reopened in its faculty, and #1839's version
history is what makes any destructive action here recoverable — "re-derive from
essentials" included.

## Prior art in the codebase

- The deck-level `style:` front matter is already a raw-CSS escape hatch (and
  #1790 is the open question of keeping the AI out of it).
- Per-token `overrides` on a theme are already a structured escape hatch, with
  `Override = { light?, dark? }` (`Fabricate.tsx:88`) — the token map generalizes
  them rather than replacing them.
