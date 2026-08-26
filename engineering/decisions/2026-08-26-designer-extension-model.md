---
status: proposed
summary: >
  #1804 flipped the export bundle to engine-first so a palette's own tokens finally
  win, which was right — and it silently inverted the only slot a designer could pass
  their own CSS through. Measured in real Chromium both ways: a caller sheet declaring
  `--accent: #FF00FF` painted magenta before the flip and indaco's `#006FA8` after,
  with the caller's declaration still in the file, ~6 KB earlier at equal specificity.
  The investigation found something larger than a regression. `--css` was never a
  designer door — the CLI's own usage text calls it "for layout-engine development,
  not deck authoring" — and `--palette` takes a NAME resolved against `PKG_ROOT/themes/`
  with a hard exit, so a custom theme today means writing into `node_modules`. There
  is no designer-facing extension path on the CLI at all, while the Studio has had one
  since #1839/#1841 (the Theme faculty's CSS view, where the stylesheet you edit IS the
  theme). This note settles three of four axes: precedence is PINNED SOURCE ORDER stated
  once in a shared composition kernel (cascade layers are the textbook answer and are
  VETOED by HARD RULE #26 — a layered caller overlay would lose to every unlayered engine
  rule, the rule-3 trap, so layers make this worse today, not better); the theme slot
  ACCEPTS A PATH as well as a name; a missing `@import 'lattice'` is auto-injected WITH A
  WARNING, and the warning is the valuable half because under engine-first the injection
  changes no pixel on the CLI — it buys portability to the Marp and standalone paths.
  Guardrails WARN AND COACH rather than block, per #29's split, and most of the machinery
  already exists unwired (`gateThemeCss` in `lib/theme/gate.js`, `cvd-audit --themes-dir`).
  The FOURTH axis — how many caller CSS slots and what each means — is deliberately left
  OPEN with four candidates and their tradeoffs, because it is the one choice that cannot
  be reversed cheaply once a CLI surface ships. The note itself proposes no code; the
  change that carries it also makes the default palette `cuoio` and gives it one
  declaration (see 2026-08-26-one-default-palette.md), which is why §2's account of
  the resolution chain names `cuoio` rather than the `indaco` it was drafted against.
tags: [cli, theming, css, cascade, extensibility, designer, export]
---

# The designer extension model (2026-08-26)

**Area:** `lattice-emulator.js`, `lib/engine/css.js`, `lib/theme/*`, the CLI surface
**Prompted by:** the #1804 cascade flip, and a finding from #1739 that did not travel with it

---

## 1. What happened, and why it is not just a regression

#1804 changed one line in `lattice-emulator.js`: the export bundle went from
`paletteCSS + layoutCSS` to `layoutCSS + paletteCSS`. That was correct and overdue.
Four other sites already composed engine-first, and each was read directly for this
note rather than taken from #1804's description:

| Site | Mechanism | Base lands |
|---|---|---|
| `composeCss`, `lib/engine/css.js:481` | splices the base **at the theme's own `@import 'lattice'` position** (`themeCss.replace(THEME_IMPORT_RE, () => base)`) | first |
| `ThemeStore.resolveThemeImports` / `cssFor`, `lib/engine/themes.js:162`, `:196` | resolves theme-name imports including `'lattice'` against the registered base, then hands to `composeCss` | first |
| the Mermaid var reader, `lattice-emulator.js:1131` | `parsePaletteVars(layoutCSS + '\n' + paletteCSS)` | first |
| the Marp kit, `dist/marp-kit/*.css` | themes ship a literal `@import 'lattice';`, resolved natively by marp-cli | first |

So the export was the odd one out, and a deck looked one way in the Playground and
another in the PDF it exported.

**Three of the four splice rather than concatenate**, and that distinction matters for
§5: the base is inlined *at the position the theme's own import declares*, not prepended
to it. A composition kernel therefore cannot be a two-term concatenation — it has to
resolve the theme chain first and place caller overlays after the resolved result.

`layoutCSS`, though, carries two meanings. It is the **engine bundle** when the CLI
resolves the default, and it is the **caller's own sheet** when someone passes `--css`
or the positional `.css` form. The flip moved the slot to satisfy the first meaning.
It inverted the second.

#1739 — the earlier PR for the same issue, still open — named this in its `## Breaking`
section, and its adversarial trio listed it among its findings as "one unnamed breaking
change (`--css`)". When the work re-landed as #1804 the finding did not come with it.
That is worth recording on its own: **a finding that survives review in one PR and is
lost when the work re-lands in another is invisible to every gate we have.**

### The measurement

Real Chromium, computed values off `document.documentElement`, on the CLI HTML export
path. Fixture: `mytheme.css` containing `@import 'lattice'; :root { --accent: #FF00FF;
--text-body: #123456 }`, passed as `--css`, against a deck declaring `theme: indaco`.

| | `--accent` | `--text-body` |
|---|---|---|
| pre-flip (concat reverted locally) | `#FF00FF` | `#123456` |
| post-flip (`main` at 0c920ca) | `light-dark(#006FA8, #82C8E5)` | `light-dark(#1E3A5F, #CBD9E8)` |

Both declarations are present in the output. The caller's sit at byte ~865,695 and
indaco's at ~871,701 — same specificity, ~6 KB later, so the palette wins on source
order. Nothing warns.

**Surface and scope of that claim (HARD RULE #23):** this is the CLI export path only,
HTML output, one fixture, two tokens. It is not a sweep. The other four composition
sites are not implicated, because none of them has a caller-supplied CSS slot at all —
which is itself the finding in §2.

## 2. The larger finding: the door was never built

The CLI's own usage text, `lattice-emulator.js` header:

> The bundled `lattice.css` is auto-resolved when no `.css` arg is given; pass an
> explicit `.css` path only to override the layout engine (rare — **for layout-engine
> development, not deck authoring**).

So `--css` is a development hatch that happened to behave like a designer door, and the
flip closed that too. Meanwhile the other slot cannot help: `resolvePalette`
(`lib/core/resolve-palette.js`) returns a **name**, constrained to `[A-Za-z0-9_-]+`
explicitly so a deck cannot path-traverse, and `lattice-emulator.js:820` joins it to
`PKG_ROOT/themes/<name>.css` and `process.exit(1)`s if the file is absent. A palette is
always loaded — the chain has a default, and that default is `cuoio` as of the same
change that carries this note. It was `indaco` while the note was drafted, and the two
declarations of it disagreed: `dist/lattice-default.css` inlined `cuoio` while the
CLI resolved `indaco`. There is one declaration now. The point the section makes is
unaffected by which palette it names — a palette is ALWAYS loaded and always lands
last, so a caller sheet has something in front of it whatever the deck asked for.

What a designer wants, against what exists today:

| Want | Path today |
|---|---|
| a palette that extends a shipped theme | none — edit `node_modules/@workwel/lattice/themes/` |
| a completely custom theme | none — same |
| component / finish / motion rules | `--css`, the dev hatch, now outranked by the palette |
| a subset of the engine sheet | same hatch, same problem |

**And there is a parity gap.** The Studio has had a designer door since #1839/#1841 —
the Theme faculty's CSS view, where the stylesheet you edit IS the theme, validated by
`gateThemeCss`. A Studio user can hand-write theme CSS. A CLI user cannot. The engine
is the product surface for anyone integrating Lattice, and it is the surface with no
door.

## 3. Root cause

One variable with two meanings, and precedence decided by concatenation order. That
combination has a permanent property: **every future change to composition order is a
silent breaking change for whichever meaning loses**, and no gate can see it, because
the losing declaration is still in the file and still valid CSS.

The fix is not a better order. It is separating the roles and stating the order once,
somewhere both roles can be reasoned about.

## 4. Axis 1 — how many caller slots, and what each means — **OPEN**

This is the one axis left undecided, deliberately. It is the only choice here that
ships a CLI surface, and a CLI surface is expensive to take back.

The four candidates, with what each buys and costs:

### 1a. `--palette <path|name>` plus a repeatable `--style <path>`

Two roles. `--css` keeps its documented dev-hatch meaning (replaces the engine sheet,
loads first); `--palette` gains path support; `--style` is the designer's extension,
repeatable, applied last in the order typed.

- **For:** one ordering rule to learn, and it is the one every web developer already
  knows from `<link>` tags — later wins. A team splits files however it likes
  (`--style brand.css --style motion.css`) with no new contract. A fifth kind of CSS
  later needs no CLI change. The slot with a real contract (`--palette`) still gets
  `gateThemeCss`, chain participation, and dark-companion resolution.
- **Against:** a `--style` file does not declare what is inside it, so one loose lint
  has to cover all of them. Two new behaviors land at once (path support and a new flag).

### 1b. Repeatable `--style` only

- **For:** the smallest possible surface — one flag, one rule, nothing else to learn.
- **Against:** a custom theme cannot join the theme chain, dark-companion resolution, or
  the manifest-driven tooling, because it is not a theme to the system — just CSS that
  lands late. This also walks back the Axis 3 decision below.

### 1c. Named per-surface flags (`--components`, `--motion`, `--finish`, `--theme`)

- **For:** self-documenting; each kind can be validated against its own contract; mirrors
  the function / form / substance / finish axes already in `design/concepts.md`.
- **Against:** we must invent and defend a precedence order between every pair of flags,
  which is a new ordering contract of exactly the kind that caused this note. CSS does not
  split cleanly along those lines — an animated card is components *and* motion, and the
  designer has to guess which file it belongs in. Every new surface is a CLI change.

### 1d. A single `--style` file

- **For:** zero precedence questions. Your one file is last, full stop.
- **Against:** a team splitting work builds its own concatenation step, so we have exported
  the problem rather than solved it. No per-kind validation is ever possible.

**Not yet recommended.** The parked question is really whether per-surface *naming* is
worth a per-surface *precedence contract*; §7 lists what would settle it.

## 5. Axis 2 — what decides who wins — **DECIDED: pinned source order, one kernel**

Three mechanisms were considered.

**Cascade layers** are the textbook answer and are **off the table**. HARD RULE #26 holds
the engine bundle to all-or-nothing layering while export-to-Marp ships marp-core's
unlayered scaffold that Lattice cannot wrap. The relevant consequence is sharper than the
rule's general form: an unlayered rule beats a layered one regardless of specificity, so a
caller overlay wrapped in `@layer` would lose to **every** engine rule — the rule-3 trap
that broke 100% of canary pages in Phase 3.5b. Layers would make a designer's overlay
weaker than it is today, not stronger.

**Specificity bumps** (`:root:root`) work and have precedent — #1789 used exactly this to
make the status trio reach the page whichever order the sheets concatenate in. But it only
addresses tokens at `:root`; it does not generalize to a component or motion rule, and it
is a trick the designer has to know rather than a contract the system states.

**Pinned source order** is what we adopt: engine sheet, then the resolved theme chain, then
caller overlays in the order given. Two obligations come with it.

1. The order is stated **once**, in a shared composition kernel that every site calls, not
   re-derived per site (HARD RULE #1). The flip is the proof this matters: five sites, four
   agreeing and one wrong for long enough that curated `--hljs-*` values had never once
   reached an export. Per §1 the kernel's shape is constrained: three of the four correct
   sites *splice* the base at the theme's declared `@import` position, so the kernel resolves
   the theme chain to a single sheet and then appends caller overlays — it is not a flat
   concatenation of engine, theme and overlay.
2. It is pinned by a test on the **computed** value in a real browser, not on the
   concatenation expression. A test that asserts the string order re-passes the moment
   someone adds a sixth input.

## 6. Axes 3 to 5 — decided

### Axis 3 — theme discovery: **a path or a name**

`--palette ./brand.css` works alongside `--palette indaco`. The wiring largely exists: an
external theme has no manifest, so its parent edge comes from its own `@import 'x'`, and
`gateThemeCss` already validates exactly that shape — a bare quoted registered name passes,
while `url(...)`, a quoted path, an unregistered name, an unquoted target, a self-import, an
escaped spelling and any `layer()` / `supports()` / media tail are rejected.

Two things this must not break, both already load-bearing: the `SAFE_PALETTE_NAME` constraint
exists because a palette name becomes a filename and a deck must not path-traverse, so **a
path is accepted from the CLI and never from deck front matter**; and `themeChain` must keep
reading `extends` from a manifest for shipped themes, with the `@import` fallback used only
for an external file that has no manifest.

### Axis 4 — the missing base import: **auto-inject, and warn**

Today a theme without `@import 'lattice'` yields scaffold-only CSS. This is not theoretical:
the manifest record notes a minified `@import"indaco"` that one regex missed, "collapsing
every `*-dark` wrapper to scaffold-only CSS".

We inject the base when it is absent, and we say so. The nuance worth writing into the
warning text: **under engine-first composition the injection changes no pixel on the CLI**,
because the engine sheet is already emitted first for everyone. What it buys is portability
— the same file rendered by marp-cli from the kit, or opened standalone, resolves its own
base. So the warning is the valuable half and the repair is the courtesy, and the message
should say which.

### Axis 5 — guardrails: **warn and coach, never block**

Consistent with HARD RULE #29's split, in its own words: authors can do what they want, and
where there is a better alternative we warn, name what it will look like elsewhere, and offer
the fix. We gate the artifacts *we* ship; we coach everyone else's.

Most of the machinery exists and is simply unwired from the CLI:

| Guardrail | State |
|---|---|
| `gateThemeCss` — safety, contract conformance, import allowlist | exists, shared kernel, used by the Studio, **not wired to the CLI** |
| `cvd-audit.js --themes-dir` | exists, already accepts an external directory |
| `contrast-audit` / `checkHljsContrast` | exist, hard-scoped to `themes/` — need a path argument |
| anything checking a caller's component / finish / motion rules | **missing** |

An overlay lint must be a **thinner and different** thing than the engine gates. HARD RULE #3
(no hex literals, always `var(--token)`) is right for engine CSS and wrong for a brand overlay
— a brand color *is* a hex literal, and that is the point of supplying one. What an overlay
owes is narrower: it does not break the box model, its text clears AA on the surface it lands
on, and **it does not need `!important`**.

That last one is the acceptance criterion for this whole design. If a designer reaches for
`!important`, the precedence contract failed. It is cheap to detect and it should warn with
that reason named, because the warning is then a bug report about us, not about them.

## 7. What is not decided, and what would settle it

- **Axis 1.** What would settle it is not more analysis but two or three real brand sheets
  written against a prototype — the question is whether a designer reaches for per-surface
  files often enough to justify a precedence contract between them. Until someone has written
  one, both answers are speculation.
- **Whether `--css` should be renamed or deprecated.** It is documented as a dev hatch and used
  as one; leaving it and adding `--style` is the reversible move, but two flags whose difference
  is "replaces" versus "extends" is a documentation burden forever.
- **The Studio and CLI should converge.** #1839/#1841 made the Studio's theme stylesheet the
  model. If the CLI accepts a theme path, the same file should round-trip through both, and
  `parse.js` / `serialize.js` are the seam where that is either true or quietly false. Not
  investigated here.

## 8. What this note does not do

No code changes. The behavior described in §1 is shipping on `main` today: a caller-supplied
`--css` sheet is silently outranked by the palette. That is deliberate for now — the scope
chosen for this pass was the decision record alone — but it means anyone passing `--css` with
token overrides between #1804 and the implementation gets no warning, and the workaround is
`:root:root` or writing into the package's `themes/` directory.

Also not verified here: whether PPTX and the exported HTML player show the same inversion. They
share the `${css}` document shell with the HTML path by construction, so the same-code-path
argument applies, but no artifact from either was driven end to end.
