---
status: proposed
summary: Consolidates and CLOSES the entire "make chart/diagram color survive old browsers" effort (four abandoned attempts — #908 the @supports fork, #945 widen-the-fork, #943 static-palette-compilation, #953 layered runtime-shim) and REVERTS all of it: this PR removes the #908 machinery from main, restoring themes + build to their pre-#908 state, and the three open branches/PRs (#945/#943/#953) are closed with tip SHAs recorded here for archaeology. Lattice deliberately does NOT chase old-browser (Safari < 16.2 / frozen smart-TV Chromium) color parity — themes stay pure-modern; the exported player's own independent dark-mode flattening is the ONE old-engine concession kept (a reproduced white-deck fix that shares no code with the reverted generator). This doc then ANALYZES the "true visualization unification" the churn kept pointing at — and, guided by an adversarial trio, SPLITS it into two very different questions with opposite answers. (1) A shared `.viz-frame` (one skeleton for the chart + diagram groups, which are the same presentation object) is a real, coherent maintainability win worth doing — it is a LAYOUT unification that leaves color untouched, with known caveats (Mermaid width is a calc() that relocates not deletes; the layout hoist may need export sign-off). (2) A unified color PALETTE / token migration is NOT recommended: the trio proved the premise false — charts, diagrams and Mermaid already share ONE design-system palette contract (chart categoricals are PORTED from each theme's brand `--cat-*` on purpose so they speak the same color language, ratified in 2026-06-18-chart-mermaid-style-separation.md), there are actually THREE token families not two (`--chart-cat-*` 8-slot, `--cat-*`/`--diagram-*` 12-slot, `--state-*` semantic), much viz paint is injected from transform JS (not a clean CSS alias), a collapse would strand logo-wall's 12 slots and flatten deliberately-curated per-theme brand identity to re-solve a CVD problem the a11y palettes already own, and the maintenance pain that motivated it (keeping two systems' OLD-BROWSER FALLBACKS in sync) was just deleted by this very revert. Net: ship the revert + this doc now; recommend the FRAME merge as the next step (pending one owner go-ahead); do NOT migrate the palette. No unification code lands in this PR.
---

# Visualization frame + color unification — consolidating the old-browser saga and separating the good idea from the costly one

**Date:** 2026-07-13
**Area:** theming / charts / diagrams / build / architecture
**Supersedes:** `2026-07-11-old-browser-chart-fallback.md` (removed from main by this PR)

> **Read this first.** Two things happened. (1) We spent three days trying to make
> chart/diagram color survive old browsers, built four designs, merged none, and are
> now **reverting all of it** — Lattice does not chase old browsers. (2) That churn
> kept blaming "we have two color systems and no shared frame," so this doc tested
> that claim with an adversarial trio. The verdict is nuanced and matters: the
> **shared-frame** half is a genuine win worth pursuing; the **unified-palette** half
> rests on a premise the codebase contradicts, and the pain that motivated it just
> disappeared with the revert. This PR ships the revert + this analysis. It does
> **not** migrate any colors.

---

## Part 1 — What we did, and why it is all being reverted

### 1.1 The root problem (real, and unchanged)

Every theme color is authored `--t: light-dark(L, D)`, often through `color-mix()`.
Those CSS Color-5 functions shipped in Chromium 111/123 and Safari 16.2/17.5. An
engine below that floor — old iOS Safari, a frozen smart-TV/webOS Chromium — treats
a declaration whose computed value contains an unsupported function as **invalid at
computed-value time and drops it** (CSS Variables §3). SVG `fill`'s initial value is
`black`, so a chart wedge or a map region renders **solid black**; an HTML
`background`/`border` vanishes. Reported live on an LG C4 TV. This is a genuine
browser-support gap — not a token bug — and **no old-engine browser is reachable
from our CI or sandbox** (HARD RULE #23), so every attempt below validated only
transitively (resolver↔Chromium) and handed the real-device check to a human pass
that never closed.

### 1.2 The four attempts (the arc)

| # | Branch (tip SHA) | Mechanism in one line | Why it died |
|---|---|---|---|
| **#908** | *merged to main* (`fb7f993`) | Per-theme flat-literal twin inside `@supports not (light-dark)`, appended to each `dist/themes/*.min.css`. | **Untestable by construction.** Headless Chromium — the only CI browser — evaluates the guard to *false* and never runs the block, so four regressions (#908→#925→#930→#936) rode through it invisibly. |
| **#945** | `claude/diagram-group-palette-fix-yqs7ag` (`eea267de`) | Widen the #908 fork's scan to the diagram group (mermaid/legal/decision) via a hand-listed `DIAGRAM_GROUP_FILES`. | Perpetuates the untestable fork; the list has no completeness gate, so acknowledged black-on-old consumers (kpi, actors, logo-wall, …) stay silently uncovered. |
| **#943** | `claude/session-resolution-p9gge0` (`5afd36bb`) | **Dissolve the fork.** Compile every chart color at build time to flat literals + plain `var()` (a 2016-era feature), scheme-switched by plain cascade, so modern == old and regressions surface where they are testable. Introduced a `--viz-*` token-hygiene invariant. | Carries a **standing per-paint maintenance tax**: a parallel `--viz-*` vocabulary + a `build:check` gate to keep SVG paints off raw core (the gate needed hardening one day after landing). Generalizing engine-wide multiplies the tax. |
| **#953** | `claude/viz-color-shim` (`61e137a6`) | **Layered.** A runtime JS shim flattens the `:root` tier at load; static compilation stays for the `.chart-frame` tier a `:root` shim provably cannot reach. | Its own PR says **"not mergeable as-is"**: the chart tier is render-UNVERIFIED, the fallback path is JS-only + CI-invisible, it is two mechanisms for one problem, and the player's sha256 CSP refuses the inline shim script. |

Two durable facts the arc produced, worth keeping even though the feature is gone:

> **`var()` (Safari 9.1, 2016) and `prefers-color-scheme` (Safari 12.1) sit far below
> the modern-color floor.** Any fallback built on flat literals + plain `var()` +
> a `prefers-color-scheme` arm is old-safe *and* testable on a modern browser. The
> `@supports` fork had the opposite property, and that is why it rotted.

> **Custom properties inherit by tree DEPTH, not specificity.** A closer ancestor
> wins regardless of selector weight — why the chart palette on `.chart-frame` can't
> be overridden from `:root`, and why every scheme-switch design here fought the same
> battle.

### 1.3 The decision: revert, and do not chase old browsers

We are **removing** old-browser color support. It never reached the device (zero
verified pixels on the actual hardware, the only evidence that would matter); every
mechanism traded one permanent cost for another; and the audience does not justify it
(boardroom decks render to PDF on a modern embedded Chromium, or open in a modern
browser / the exported player).

**Reverted on `main` by this PR:** `tools/build-chart-compat-css.js`,
`lib/core/parse-root-vars.js`, the `@supports` append in `build-css.js`, the
`chart-compat-css` test, and the `resolveDeclarationValue` addition to
`lib/core/resolve-token-expr.js` (`resolveTokenExpr`, used by Mermaid theme
resolution, is kept). Modern render is byte-identical — the fork was inert on modern
engines (verified: charts render full-color light + dark on the PDF surface, and an
adversarial trio found no modern-surface regression).

**The one old-engine concession KEPT** (deliberate): the exported `.html` player's
own dark-mode `light-dark()` flattening (`docs/src/playground/player-core.generated.js`).
It fixes a *reproduced* on-device bug — dark mode rendered a **white deck** on old
mobile in-app WebKit — and shares **zero code** with the reverted generator (trio-
confirmed). Removing it would re-ship a broken export. If the owner wants it gone too,
that is a separate, isolated revert.

**Branches closed by this PR** (SHAs recorded; git objects survive deletion):
#945 `claude/diagram-group-palette-fix-yqs7ag` → `eea267de` · #943
`claude/session-resolution-p9gge0` → `5afd36bb` · #953 `claude/viz-color-shim` →
`61e137a6`. Their (never-on-main) decision docs' load-bearing ideas are folded into
Part 2.

---

## Part 2 — "True unification," tested against the real architecture

The churn blamed "two color systems, no shared frame." Before committing to fix that,
this doc ran an adversarial trio (red-team + Munger inversion + independent checker)
against the claim. **The trio split the idea in two, with opposite answers.** Both
are recorded here because the split *is* the finding.

### 2.1 Ground truth (corrected by the trio) — there are THREE token families, already one contract

| Family | Slots | Declared on | Read by |
|---|---|---|---|
| **`--chart-cat-*`** | 8, per-theme curated | `.chart-frame` (in `chart-family.css`; print-remapped in `base.modifiers.css`) | funnel, kanban, map, piechart, progress, quadrant, timeline-list, word-cloud, **radar** (via `radar.transform.js`) |
| **`--cat-*` / `--diagram-*`** | 12, per-theme brand | each theme's `:root` | journey, roadmap, state-chart, decision, kpi, actors, logo-wall, authority-chain, statute-stack, math, **Mermaid** (CSS *and* the JS bridge) |
| **`--state-*`** (semantic status) | 5 roles (pass/warn/fail/info/mute) | `.chart-frame` (`chart-family.css`) | gantt, journey, kanban, progress, radar, state-chart |

The correction that changes everything: **these are not "two disconnected systems
kept in sync by hand." They are one design-system palette contract, by design.**

- `chart-family.style.md` §"Port, don't invent": chart categoricals are *lifted from
  the theme's own `--cN`/brand spectrum* "so charts speak the same color language as
  the theme's Mermaid diagrams." The 8-slot chart set is **per-theme curated brand
  color**, not a fixed CVD/Wong standard (cuoio = earth triad, onyx = value-not-hue,
  indaco = blue-led). An earlier draft's "Wong-2011, distinct-from-brand" framing was
  wrong.
- Shipped decision `2026-06-18-chart-mermaid-style-separation.md`: chart CSS and
  Mermaid CSS *"must not share selectors/rules. They may share **tokens** (`--cat-*`,
  `--chart-cat-*`, …) — that is the design-system palette contract, not
  contamination."* **The token layer is already the single unification seam.**

So "everyone takes tokens from the theme" — the owner's stated goal — is **already
true**. The three families are the vocabulary of one contract; they differ because a
data-series set (8, distinctness-assessed), a brand categorical set (12), and a
semantic-status set (5) are genuinely different jobs.

### 2.2 The good idea: a shared `.viz-frame` (LAYOUT, not color)

Charts and diagrams *are* the same presentation object — a captioned, full-bleed
visual — yet `.chart-frame` (the chart group's skeleton in `_chart-family/`) and
`section.diagram` (the diagram group's thinner surface) are two separate skeletons.
Merging them into one `.viz-frame` is a **layout** unification that never touches a
color token. It is the part of the owner's ask that is both real and safe-in-kind,
and it matches "chart and diagram group should share a new visualization frame."

Caveats the prior trio already surfaced (do not re-discover):

- **Mermaid width is `calc(100cqi − 2·--sp-2xl)`, not `width:100%`.** A naive merge
  that sets `width:100%` *relocates* the inset rather than removing it.
- **The layout hoist may change export bytes** → QUALITY BAR export sign-off before
  merge if it does.
- Mermaid stays colored by its own path (`--cat-*`/`--diagram-*` in `mermaid.css`
  **and** the JS `themeVariables` bridge — `MERMAID_VAR_MAP` in the emulator,
  `buildMermaidThemeVars` in the runtime); the frame merge must not disturb it.

**Recommendation: do the frame merge as the next step, pending one owner go-ahead**
(it is a visible layout change, so it wants a look before it lands). It delivers the
"single viz-frame" the owner asked for, at low color risk.

### 2.3 The costly idea: a unified color PALETTE / token migration — NOT recommended

Collapsing every non-Mermaid component onto one `--viz-cat-*` palette (the "migrate
everything" half of the ask) failed the inversion on five independent counts:

1. **The premise is false (see §2.1).** The palettes are already one shared-token
   contract; a migration inserts a *new* `--viz-*` indirection layer between paint and
   an already-shared seam — it adds a layer, it does not remove one.
2. **The motivating pain is gone.** The only thing that forced the two families to be
   kept in lockstep was the **old-browser fallback** having to cover both — which this
   very PR deletes. Without it, the shared-token contract needs no hand-syncing.
3. **It re-imports #943's rejected tax** (§1.2): the `--viz-*` vocabulary + a
   forever `build:check` gate. And that gate is **not fully gate-able** — much viz
   paint is injected from transform JS (`radar.transform.js` sets `--series-color`
   from `var(--chart-cat-N-hue)`; `roadmap.transform.js` sets `--phase-accent` from
   `var(--cat-1-mark)`), invisible to a CSS scanner, plus setter-laundered reads
   (`quadrant` sets `--cell-fill` then paints `var(--cell-fill)`).
4. **It strands slots and flattens brand.** `logo-wall` cycles **all 12** `--cat-*`
   slots; a `--viz-cat-*` grounded in 8 leaves cells 9–12 uncolored. And collapsing
   the diagram group onto one disciplined cycle **erases the per-theme brand
   expression** `chart-family.style.md` is explicitly built to preserve ("don't wear
   someone else's charts"). The CVD benefit it claims is already delivered by the
   dedicated a11y palettes + redundant shape/label encoding
   (`2026-06-16-cvd-redundant-encoding.md`).
5. **It reverse-couples non-viz components.** kpi, actors, logo-wall, decision are
   evidence/inventory/legal/comparison components that merely *tint* with `--cat-*`.
   Putting them "in scope" means a future viz-palette tweak silently repaints a KPI
   tile — conflating "reads `--cat-*`" with "is a visualization."

**Recommendation: do NOT migrate the palette.** If any token work is wanted later, the
smallest honest version is a *naming/hygiene* pass that treats the existing three
families as the shared contract they already are — but with old-browser support gone,
even that buys little, and it is explicitly not this PR.

### 2.4 The genuine decision for the owner

Two questions, decided independently:

- **Frame:** merge `.chart-frame` + `section.diagram` → one `.viz-frame`? **Rec: yes,
  next PR, after a look.** (Layout win, low color risk, matches the ask.)
- **Palette:** migrate all components onto one unified color palette? **Rec: no.** The
  shared-token contract already gives "everyone takes tokens from the theme"; migration
  costs brand identity + a forever gate to fix a sync-pain the revert just removed.

If the owner still wants a palette migration after this analysis, §2.3's five points
are the spec for doing it *safely* (widen to 12 CVD-audited slots, cover JS-injected
paints, decide the non-viz components in/out explicitly, keep a per-theme brand
override) — but it is a large, visible, export-signable change, not an overnight one.

---

## Part 3 — Status & next steps

- **This PR:** reverts #908 (done, verified — build:check + full unit suite green,
  charts render full-color light+dark, reviewed by an adversarial trio), closes
  #945/#943/#953, and lands this doc. **No unification code ships here.**
- **Recommended next:** the `.viz-frame` **frame** merge (§2.2), after one owner look.
- **Not recommended:** the palette migration (§2.3). Re-open only with an explicit
  owner decision that accepts the brand/gate/scope costs.

*Every old-browser attempt reached the same wall — a modern-Chromium-only sandbox
(HARD RULE #23) — which is exactly why old-browser support is being retired rather
than trusted. And the "unify the colors" reflex it produced does not survive contact
with the architecture that already unifies them at the token layer.*
