---
status: proposed
summary: Grow the Studio Notes button into a per-slide "This slide" drawer — curated, provenance-aware craft controls over one fence-aware directive serializer; ship in two PRs
---

# Slide Context Editor — the per-slide "This slide" drawer

**Design accepted; build in two PRs (substrate first, drawer second).**

**Owner ask:** grow the Studio's per-slide **Speaker notes** button into a
context-sensitive **slide editor** — beyond notes, let an author tune a single
slide's craft (universal classes, finish, decoration, …) without leaving the
Studio. Direction chosen after a red-team (inversion) + independent-design pass
and an independent-chair synthesis.

---

## 1. The decision in one paragraph

The Notes button becomes a **"This slide"** drawer (the note is its first
section). It exposes a **curated, provenance-aware set of per-slide controls**
whose vocabulary is **generated from the engine manifests**, whose validity is
**owned by lint-core**, and whose writes go through **one fence-aware,
span-surgical directive serializer** that replaces today's lossy string hack.
Scope is **Ring 1 + Ring 2** (state, tone, dark, type scale, chrome, density,
**per-slide finish**, **per-slide decoration**) — "real craft play per slide."
Layout swaps, raw colors, header/footer text, and every deck-wide knob stay
**out** (Ring 3). It ships in **two PRs**: the serializer/bug-fix first (it fixes
shipped data-loss on its own), the drawer second on top of it.

---

## 2. Why "just add fields to the Notes drawer" is a trap

The framing assumes `docs/src/components/studio/slide-notes.ts` is a sound base.
It is not. The inversion pass found **live, shipped data-loss bugs** in the very
transform the feature would generalize:

1. **The directive classifier has drifted from the engine.**
   `slide-notes.ts:10` hand-lists directive names and is missing `focus`,
   `focusStyle`, `focusSteps`, `build`, `style`, `debug`, `logo`,
   `backgroundImage` — all real, all in `lib/engine/directives.js:31` (`KNOWN_DIRECTIVES`).
   On a slide carrying `<!-- _focus: row 2 -->` or `<!-- _build -->`, `getNote`
   returns the directive body as "the note" and `setNote` **deletes the directive**
   (it strips every comment it fails to classify, `slide-notes.ts:38-42`).
2. **Writes are fence-blind and whole-deck.** Every structured write routes
   through `replaceSlide` → `splitSlides`, a bare `.split(/\n-{3,}\n/)` with no
   code-fence awareness (`docs/src/components/studio/lint.ts:6-11`). A `---` inside
   a mermaid front-matter block (real: `test/integration/baseline-decks/gallery.md`)
   is treated as a slide boundary — one chip toggle destroys the diagram and
   silently changes the slide count. `rejoin` re-serializes **every** slide and
   `setNote` normalizes whitespace **inside code fences** (`slide-notes.ts:43`).
3. **The comment regex is fence-blind**, so a `code`-bucket slide that *displays*
   `<!-- _class: … -->` as example content gets its example edited.
4. **Prefix matching misfires both ways** — a note "Present the numbers first"
   matches `present\b` and is misread as a directive.

A context editor multiplies write frequency ~20× and adds more hand-listed
vocabularies. **You cannot build it on this substrate.** So the feature
decomposes into a **substrate** (§5) and a **drawer** (§4) — and the substrate is
also a bug-fix that stands alone (HARD RULE #18: a defect on the path gets fixed
in place; here it's load-bearing enough to bank as its own PR, HARD RULE #8/#17
isolation).

---

## 3. What can be edited — three rings

Judged on **author value** vs **risk** (chance of corrupting a deck or lying to
the author) vs **effort** (the guardrails, not the chips). Chosen scope: **Rings
1 + 2 ship; Ring 3 never enters this drawer.**

### Ring 1 — single-token, structure-safe, high value

| Control | Tokens | Source of truth | Notes |
|---|---|---|---|
| **Speaker note** | `<!-- note: … -->` | — | Exists; becomes section one. |
| **State stamp** | `wip draft tbd confidential redacted archived pinned revised` | `UNIVERSAL_GROUPS.state` (`lib/components/index.js:196`) | Single-select; the per-slide collaboration vocabulary. |
| **Tone** | `tone-pass tone-warn tone-fail tone-skip` | `UNIVERSAL_GROUPS.tone:206` | Single-select; chips tinted by status token. |
| **Dark** | `dark` | `UNIVERSAL_GROUPS.mood:178` | **Tri-state** (see §6). |
| **Type scale** | `scale-l scale-xl scale-2xl` (+ default) | `UNIVERSAL_GROUPS.typography:187` | Segmented `M/L/XL/2XL`; sets one custom prop. |
| **Chrome** | `silent` + `no-header no-footer no-paginate` | `UNIVERSAL_GROUPS.chrome:194` | `silent` headline switch; granular behind disclosure. |
| **Density** | `compact loose` + `accent` | `SEMI_UNIVERSAL_VARIANTS:218` | Respect per-layout `excludes` via `effectiveVariants`. |

### Ring 2 — real craft, needs guardrails (in scope, this is the "C" choice)

| Control | Tokens | Source | Guardrail |
|---|---|---|---|
| **Per-slide finish** | `finish-<name>` / `finish-none` | `finishNames` (`resolve-finish.js:41`) + saved finishes | Tri-state **override** model (§6); a `finish-*` implies bare `finish` (`resolve-finish.js:89-118`) — the serializer emits the pair. |
| **Decoration** | `tint-* mark-*` + `at-*` placement | `UNIVERSAL_GROUPS.decoration:179` | Composition grammar (§7): max one tint + one mark; placement is a sub-axis, not a chip. |

**Deferred out of v1 (still Ring 2, later PRs):** per-slide **mode** override
(`sketch`/`boardroom`, same tri-state as finish), **family modifiers**
(`checks-*`, `heat` — render only when the layout's `familyModifiers` is
non-empty), **focus** (`_focus`/`_focusStyle`), **layout-specific variants**
(`mirror` etc.). Each is a clean follow-up once the substrate + provenance model
are proven.

### Ring 3 — engine-supported, **never** in this drawer

| Kept out | Why | Where it lives instead |
|---|---|---|
| **Layout / component swap** (first `_class` token) | Each component has its own body grammar (HARD RULE #6); swapping the token without reshaping the body renders garbage. The single worst possible control. | Insert-component / AI restructure / markdown. |
| **`_color` / `_backgroundColor` / `_backgroundImage`** | Raw per-slide color breaks the palette-blind contract the token system exists to protect. | `dark`, tones, finishes, themes. |
| **`_header` / `_footer` free text** | Quoting + markdown + same-origin `srcdoc` injection (HARD RULE #22); high risk, low value. | Markdown; deck `header:` in the Inspector. |
| **Reserved/derived classes** | `lattice-exporting`, `finish-editing`, `finish-preview`, bare `finish`, `boardroom` must never be hand-set. | Never offered — allowlist only. |
| **Anything deck-wide** | theme, size, `mode:`, `finish:`, `paginate:`, logo — the Deck Inspector owns these. | The Inspector (one surface per scope). |

---

## 4. The drawer — surface & interaction

**Surface (decided):** rebrand today's Notes `Sheet` into **"This slide"**; the
note is the first section. Reuses the existing button, sheet, and 390px handling
(`StudioShell.tsx:1622`, `:1516`) — no third right-side sheet alongside Inspector
+ Architect. Header badge keeps the `slide N` chip.

**Controls:** chips for single-select groups (state, tone, decoration), segmented
controls for ordered axes (type scale, density), switches for booleans
(`dark`, `silent`, `accent`), a select for finish. **Validity-aware:** the drawer
receives the active slide's layout (`slideClass(chunk)`) and looks it up in the
catalog; a token absent from that layout's `effectiveVariants` / `familyModifiers`
**doesn't render** (no disabled-gray graveyard). A bare-markdown slide gets
universals only.

**Live preview:** every change commits immediately through the single write
funnel (§6) → the preview re-renders. Each toggle is one undoable source change.

**Teach the grammar:** show the emitted `<!-- _class: cards-grid dark scale-xl -->`
line, read-only, with inherited deck tokens **ghosted** after it, tappable to jump
the editor cursor to that line (`slideStartOffset`, `lint.ts:46`). The deck *is*
markdown — export, sharing, AI, lint findings, and the docs all speak `_class`;
the drawer must build authors who can read their own source, not hide it.

**Mobile (390px):** same `w-[88vw]` sheet; chip rows wrap; the preview-pane Notes
button becomes the drawer button. No layout done without `tools/screenshot.js`
evidence at 1440/820/390 (HARD RULE / Quality Bar).

---

## 5. The substrate — one fence-aware, span-surgical serializer (PR 1)

A new tested module (sibling to `slide-notes.ts`) with a strict **"own only what
you touch"** contract. Everything the drawer and rail and lint read/write goes
through it.

- `getClassTokens(chunk): string[]` — parse the **first** `<!-- _class: … -->`
  (same anchor as `lint-core.js:16`), return ordered tokens. Handles the compound
  form (`<!-- _class: kpi\n_paginate: false -->`) and refuses shapes it can't
  round-trip losslessly (YAML array `_class: [a, b]`, duplicate `_class`
  comments) by reporting **read-only "hand-authored — edit in markdown."**
- `setClassTokens(chunk, tokens)` — rewrite that one comment **in place** (insert
  as the first line if absent; remove the comment if empty). **Span-surgical:**
  touches only that comment's character range; **zero** bytes changed elsewhere —
  no `split`/`rejoin`, no whitespace normalization, no fence-region edits.
- Group mutators: `setGroupToken(chunk, groupMembers, tokenOrNull)` removes only
  tokens ∈ `groupMembers` then appends; `toggleToken`. Group membership comes
  from the **generated vocabulary**, never a hardcoded list.
- **Unknown-token preservation is the invariant.** Any token the vocabulary
  doesn't claim — saved local components, deprecated aliases (`image left`),
  hand-written `tint-*`/`at-*` phrases, typos — passes through **verbatim, in
  place**. Append new tokens at the end; delete in place; never re-sort. This is
  `setNote`'s discipline lifted to tokens.
- **Fence-aware.** A shared fence-mask helper (in the generated authoring core,
  HARD RULE #7 — shared with lint-core, which has the same
  `source.split(/^---$/m)` flaw at `lint-core.js:558`) so comment/`---` scanning
  ignores fenced regions. This fixes the shipped corruption independently of the
  drawer.
- **Directive vocabulary is generated,** from `KNOWN_DIRECTIVES`
  (`lib/engine/directives.js:31`) via the bundle the Studio already imports
  (`authoring-core.generated.js`), so note-vs-directive classification never
  drifts and `_focus`/`_build`/`style` are never eaten.
- **Comment-close escaping** on every serialized value (`-->` in user text),
  extending the guard already at `slide-notes.ts:44`.

PR 1 lands this + repoints `getNote`/`setNote`, the rail's `CLASS_RE`
(`lint.ts:13`, which today misses multi-token `_class`), and lint-core onto it —
one parser, three consumers, tested once (property-style over the fence /
compound / duplicate / array / unknown-token cases).

---

## 6. Truth model & the tri-state provenance rule

**Never regenerate the `_class` line from UI state.** Edits are token-scoped set
operations on the source (§5). The drawer is a **projection, not a copy** — every
control derives its state from `source` on each render; there is no per-field
`useState` draft to go stale (the note keeps its blur-commit, but reads live).
One **write funnel:** every commit is `setSource((s) => …)` against the *latest*
source after forcing an editor flush, keyed to a **stable slide identity**
(content anchor), not `activeFullIndex` — so a concurrent AI edit that adds/removes
slides can't land a write on the wrong slide (`StudioShell.tsx:961-969`).

**Inheritance is the hard part, and it's why binary toggles lie.** Deck-wide
`class:` / `finish:` / `mode:` are **appended** to every section
(`deckClassPropagate`, `plugins.js:190-224`), with per-slide finish/mode
**overriding** rather than stacking. So removing `dark` from a slide whose deck
front matter says `class: dark` does **nothing** — the token re-appends. Every
inherited-capable control is therefore **tri-state**:

| State | Meaning | Serialized as |
|---|---|---|
| **Inherited (deck)** | comes from front matter | *(no per-slide token)* |
| **This slide: on** | set here | the token (`dark`, `finish-atrium`) |
| **This slide: off** | opt out of the deck value | the **opt-out token** — `finish-none` (`resolve-finish.js:97`) or `boardroom` (`resolve-mode.js:46`); for `dark` there is no engine opt-out, so "off" is only offered when the deck is *not* dark |

The drawer computes **effective state with provenance** using the *same*
resolution the engine uses (append + spot-override, `plugins.js:205-223`) and
labels it ("dark — from deck `class:`"). **A control whose effective state it
cannot compute does not render.** A per-slide `finish-*` implies the bare
`finish` compositor; the serializer emits the pair (`resolve-finish.js:111-118`).

---

## 7. Decoration — the composition grammar (the other Ring-2 trap)

Decoration universals are **token phrases**, not flat chips:
`'tint-corner at-tl'`, `'tint-edge at-right'` (`index.js:179-186`) — a `tint-*`
or `mark-*` treatment plus an orthogonal `at-*` **placement** axis. The drawer
models this as **treatment + placement**, not a checkbox soup:

- One **tint** select (`none` / `corner` / `edge` / `vignette` / …) and one
  **mark** select (`none` / `orbit` / `threads` / …) — max one of each, matching
  how the engine composes them.
- A **placement** sub-control (`at-tl`/`at-right`/…) shown only when the chosen
  treatment takes one; the serializer emits the phrase in canonical order.
- Vocabulary + which treatments take placement come from the generated
  `UNIVERSAL_GROUPS.decoration` (see §8) — not re-typed.

---

## 8. The three-part gate (a control ships only if all three hold)

1. **Generated vocabulary, never hand-typed.** The repo already proves hand-lists
   drift: `design/design-system.md` says "25 universal variants / Chrome (4)";
   `UNIVERSAL_GROUPS` has 32 / Chrome-7. The only legitimate source is the
   build-time bundle the Studio already consumes (`buildVocab`/`lintVocab`,
   `studio.astro:60-70`). **One gap to close in PR 2:** the *group structure* of
   `UNIVERSAL_GROUPS` isn't exported — add `vocabularies.universalGroups` to the
   `components.json` generator and widen `studio.astro:45-47` (which today strips
   the catalog to `{name,bucket,description,skeleton}`) to pass `variants`,
   `variantAxes`, `effectiveVariants`, `familyModifiers`, `focusAxes`.
2. **Provenance-aware / tri-state** (§6). No control that can't show effective
   state.
3. **Validity owned by lint-core** (HARD RULE #7). Mutual-exclusion (two tones,
   stacked scales, `with-period no-period`, `dark` on an already-dark bookend,
   `silent` ⊇ `no-header`…) lands as a new **`conflicting-variants`** rule in
   `lib/authoring/lint-core.js`, generated into the browser bundle; the drawer
   **reflects** it (exclusive groups render as radios) — it never encodes a second
   authority the CLI linter doesn't share. *If a rule isn't worth adding to
   lint-core, it isn't real enough to encode in the UI.*

---

## 9. Build plan

**PR 1 — substrate + notes bug-fix (banks a real correctness win).**
Fence-aware span-surgical serializer; generated directive vocabulary; shared
fence-mask; repoint `getNote`/`setNote`, rail `CLASS_RE`, lint-core reader onto
it. Property-style tests over fence / compound / duplicate / array / unknown-token
cases. `CHANGELOG` under `## Unreleased` (fixes: `_focus`/`_build`/`style`
deletion; fenced-`---` corruption). Demo/regression via a deck exercising the
corruption cases.

**PR 2 — the "This slide" drawer (Rings 1 + 2).**
Export `universalGroups` + widen the Studio catalog (gate part 1); the
`conflicting-variants` lint rule (gate part 3); the tri-state provenance resolver
(gate part 2); the drawer UI on shadcn primitives (HARD RULE #15) reusing the
Notes sheet; the emitted-line teach affordance. Per-feature demo deck
(`examples/slide-context-editor.md` + committed PDF, HARD RULE #9). Screenshot
evidence at 1440/820/390 (Quality Bar). Docs: `base.docs.md` cross-links + a
Studio doc note; align with the existing slide-context autocomplete
(`2026-06-09-slide-context-autocomplete.md`) so drawer and editor speak one
grammar. Reconcile the drifted counts flagged in §8 while there.

**Maker-checker:** PR 1 touches the shared serializer (real blast radius) — spawn
an independent checker on the diff before merge (round-trip corruption, unknown-
token preservation, fence edge cases). PR 2's lint rule likewise.

---

## 10. Do-not-ever (binding constraints for both PRs)

- Never expose a **layout/component swap**.
- Never **hardcode** a variant/directive list in `docs/src` — generated bundle only.
- Never write via **split-mutate-rejoin** — span-surgical, fence-aware edits only.
- Never render a control whose **effective state** it cannot compute.
- Never encode **validity rules only in the UI** — lint-core first, drawer reflects.
- Never surface **reserved/derived** classes.
- Never **normalize/rewrite** content it didn't edit.
- Never add a **new preview-frame builder** without the HARD RULE #22
  `sanitizeSlideHtml` + allowlist ceremony (prefer reusing the existing preview
  path — no new sink).

---

## 11. Off-path defects logged (HARD RULE #18 — recorded, not pulled into scope)

- `design/design-system.md:318-329` says "25 universal variants / Chrome (4) /
  Typography (2)"; `UNIVERSAL_GROUPS` carries 32 incl. `form`/`no-form`/
  `no-progress`, `safe`, and the `scale-*` trio. Reconcile in PR 2 (on-path there).
- `lint-core.js:816`'s focus-style message omits `blur|pop` though `FOCUS_STYLES`
  accepts them. Fix when focus enters the drawer (deferred Ring 2).
