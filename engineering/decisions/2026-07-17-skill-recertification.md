---
status: shipped
summary: >
  Re-certified the seven design/skills/*.md authoring skills against the current
  engine. The checkSkillFreshness gate was GREEN but shallow — it verified counts and
  token NAMES, not the MENTAL MODEL each skill teaches — so the categorical-palette
  teaching in theme.md had silently rotted after the #1022 three-layer recolor and the
  #1028/#1030 texture-channel work: theme.md still taught the retired "pale fills L≈87 /
  deep marks L≈32, fixed non-flipping --cat-on-fill" recipe, which now FAILS
  checkCatContrast (a fixed dark ink measures ~3.1:1 on a dark-mode jewel fill, below the
  4.5:1 AA floor). Rewrote theme.md (and its cited canon design/theming.md) to the
  three-layer contrast contract + the flipping inks + the --cat-N-texture adoption
  channel; corrected README.md's L≈87/L≈32 example and a count drift (~72→91 tokens);
  added lens.md's omitted `order?` field. Strengthened checkSkillFreshness to catch the
  CONCEPT drift (not just numbers): theme.md must name the texture channel, the
  three-layer contract, and checkCatContrast (searched in the teaching body, not the
  footer); the 91-token contract count and the 8-slot chart-cat count are now tied to
  source and fail closed on a structural change. Six of the seven skills were already
  accurate; the drift was concentrated in the categorical teaching.
companion:
  - ./2026-07-15-categorical-token-contract.md
  - ./2026-07-16-universal-texture-channel.md
  - ./2026-07-17-texture-vocabulary-consolidation.md
---

# Re-certifying the authoring skills — teach the model, gate the model

**Date:** 2026-07-17 · **Status:** shipped · **Owner:** Sharmarke

The `design/skills/*.md` files are self-contained teaching docs: each authors ONE
artifact (deck / theme / component / chart / finish / lens / notes) from a blank file
at the boardroom bar, with the tokens, counts, and gates **inlined** so an agent never
chases a link mid-task. That sanctioned duplication is only safe while it stays TRUE.
`checkSkillFreshness` (added when the skills merged, PR #1013) tied the inlined **counts**
and **token names** to source — but a skill's load-bearing content is its **mental
model**, and a model can rot while every count stays right. That is exactly what
happened to the categorical-palette teaching between #1013 and today.

## What drifted (verified against source, not memory)

**theme.md — the categorical mental model was inverted (the serious one).**
The #1022 recolor (`2026-07-15-categorical-token-contract.md`, shipped 2026-07-16)
replaced the old "two lightness tiers" heuristic with a **three-layer contrast
contract**, and `checkCatContrast` now enforces it over every hue-based theme in both
canvas modes. theme.md still taught the retired model:

- "**pale fills at L≈87, deep marks at L≈32**" — retired. The shipped light fill is
  chromatic (~L82) and, crucially, the **dark** fill is a *jewel tone*, not a pale tier.
- "**`--cat-on-fill` a fixed dark hex, non-flipping**" and a "What bad looks like" entry
  that flagged `light-dark(--text-heading, …)` as the mistake — **backwards**. Because
  the fill goes pale→jewel across modes, the ink MUST flip. indaco ships
  `--cat-on-fill: var(--text-heading)` (dark ink in light mode, white in dark). A fixed
  dark ink now measures **3.10:1** on the dark jewel fill — below the 4.5:1 AA floor —
  and **fails `checkCatContrast`**. The skill taught a recipe the gate rejects: a broken
  recipe is worse than none.
- "**copy the rank-1 proposal from `themes/palette-audit.md`; you inherit the tiers for
  free**" — retired. The three-layer values were regenerated per theme by a deterministic
  recipe; the `new:theme` scaffold copies indaco's correct block verbatim.
- The **`--cat-N-texture` adoption channel** (#1028/#1030) was **absent** — a monochrome
  or CVD theme now textures its categories by declaring 12 `--cat-N-texture` tokens.
- Count drift: "**~72-token contract**" — the real `CONTRACT` in
  `test/unit/palette/token-parity.test.js` is **91**.

**README.md** — the falsifiable-bar example still cited "L≈87/L≈32 tiers." **lens.md** —
its inline `LensDef` omitted the optional `order?: number` field. The other five skills
(deck, component, chart-component, finish, speaker-notes) were audited claim-by-claim
against source and found **accurate** — deck's `size: 4k`, the component `function.form`
matrix (survived the forms/viz-frame merge), the 13 buckets, Tier-1 = 35, finish's 10
values + four `--fin-*` slots, the chart `--chart-cat1..8`/cap-6 story, and the
speaker-notes review rubric all verify today.

## What changed

- **theme.md**: rewrote the 10/10 bar, recipe step 5, skeleton, "good/bad", checklist,
  and common-mistakes to the three-layer contract (① mark-vs-`--bg` ≥ 3:1, ② fill-vs-bg
  intentionally low, ③ `--cat-on-fill`-vs-fill ≥ 4.5:1, + fill ≠ mark), the flipping
  `--cat-on-fill`/`--cat-on-mark` inks, and the optional `--cat-N-texture` channel with
  the onyx/concrete example. Count fixed to 91. Cross-linked `engineering/textures.md`
  and the #1022 decision.
- **design/theming.md**: the skill's cited categorical canon carried the *same* stale
  model (it even claimed "the fill stays pale in dark mode" and cited a non-existent test
  path). Rewrote its "Categorical tokens" and "lightness contract" sections plus the
  recipe step to the three-layer contract + texture channel — #1022 §7 called for this
  update and it had not landed.
- **README.md / lens.md**: fixed the L≈87/L≈32 example; added the `order?` field.
- **checkSkillFreshness** (the point of the exercise — gate the *model*, not just numbers):
  - theme.md must NAME the categorical model: the strings `--cat-N-texture`, `three-layer`,
    and `checkCatContrast` must appear **in the teaching body** (search stops at
    "Canonical sources" so a lone footer link can't satisfy it).
  - The **91-token contract** count (parsed from token-parity.test.js, eval-free, fails
    closed on any unmodeled spread) and the **8-slot chart-cat** count (parsed from
    chart-family.css) are now source-tied assertions; every occurrence of each count in the
    prose must agree (matchAll, not just the first).
  - A source count that can't be derived is a **loud fail-closed error**, never a silent pass.
  - Unit tests added in `test/unit/cli/check-ownership.test.js` for the concept markers and
    the fail-closed path; the maker-checker and adversarial-trio findings (spread-blindness,
    footer-only satisfaction, multi-occurrence drift) were folded before commit.

## How the gate now prevents recurrence

The original gate would have stayed green through this entire drift — every count and token
name was still present; only the *teaching* was false. The strengthened gate fails if
theme.md stops teaching the three-layer contract, the texture channel, or names
`checkCatContrast`; if any inlined count (91 tokens, 8 chart slots, plus the existing
finish/bucket/universal/required counts) diverges from source in ANY of its prose
locations; or if a source reader breaks (fail-closed). Prose, taste, and recipe *quality*
remain on human review — the gate pins the falsifiable facts a rewrite could silently
invert, which is precisely the class that rotted here.

## The adversarial trio (red team + Munger inversion + independent checker)

Run on the RESULT (HARD RULE #25 — high-value, novel doc work touching a shared gate),
plus a maker-checker on the gate diff. Findings folded before commit:

- **Fact-checker:** all 10 introduced facts VERIFIED against source (floors 3.0/4.5/1.25,
  the 91-token / 8-slot counts, texture prefixes, the flipping inks, the `order?` field).
- **Red team (correctness):** caught that "`checkCatContrast` enforces **all four**" was
  false — the gate computes only **three** contrasts (① mark-vs-bg, ③ ink-vs-fill, ④
  fill≠mark); layer ② (fill-vs-canvas, intentionally low) has no machine check. Corrected
  in theme.md and theming.md to "gates three of these four; ② is a design intention." Also
  flagged theme.md still pointing authors at the retired `palette-audit.md` — fixed.
- **Munger inversion:** the sharpest finding — a re-certified skill that silently *vouches
  for* stale copy-sources is worse than a uniformly-stale canon. theme.md's recipe (`npm
  run new:theme`) and "Where it lives" routed authors into `indaco.css`'s header comment,
  the scaffold's stamped `TODO(palette)` checklist, and `palette-audit.md` — all still on
  the retired model. Neutralized *within scope* by making theme.md **explicitly warn** that
  those neighbors' prose is stale (their token VALUES are correct; follow the skill's model,
  not their comments). Also: the gate's "enforced-fresh fast path" claim over-signaled
  whole-canon freshness — added an honest SCOPE note (green covers gated skill facts only,
  not neighbor canon). Also: `contractTokenCount` could return a wrong number on a stray
  quote/comment — hardened to fail closed (token-shape validation + comment stripping).

## Deferred (off the direct path — logged, not fixed here; HARD RULE #18)

The retired categorical model, and retired token NAMES, survive on several theme-authoring
surfaces beyond the skills. These form a coherent, separate **"re-certify the theme
scaffolder + theme-CSS-comment surfaces"** follow-up (kept out of this PR per #17; the
skill now explicitly warns authors about each, so following the skill is safe):

- **`tools/new-theme.js` (`checklistBlock`)** — the `TODO(palette)` checklist stamped into
  every new theme teaches the retired fixed-non-flipping-ink recipe and references tokens
  that no longer exist in the file it stamps into (`--diagram-band-1..12`, `--cat-blue…
  --cat-mauve`, `--chart-1..6`, `--dark-*`; the real contract is `--cat-N-fill/-mark`,
  `--chart-cat1..8`, `--scheme-dark-*`). Highest-leverage — it's on the scaffold happy path.
- **`themes/indaco.css` header "Design contract" comment** — describes the retired L≈83/L≈60
  band model and `--diagram-band-*`. Its token *values* are correct (three-layer); only the
  comment is stale.
- **`lib/base/base.tokens.css`** (lines ~185, 189) — a stale "non-flipping dark text …
  Brand-triad rank-1 proposal in palette-audit.md" comment that regenerates into
  `dist/lattice.css` / `dist/lattice-default.css` on every build (source comment, not a
  hand-edited dist file — no HARD RULE #2 issue, but it keeps re-emitting stale prose).
- **`themes/README.md`** — the categorical model wall-to-wall (L≈87/L≈32 ASCII tiers, fixed
  non-flipping ink, "copy palette-audit rank-1") AND the retired `--dark-*` naming.
- **`engineering/decisions/2026-06-10-design-studio-themes-layouts.md`** — mentions L≈87/L≈32;
  left as-is (a dated decision record captures a point-in-time decision, superseded by #1022,
  per the house convention that living contracts move to the canonical doc).

Partial mitigation applied here: `themes/palette-audit.md` got a superseded banner ("do not
copy these `--cat-*` values") so the most direct trap is closed regardless of who finds it.

No `CHANGELOG` entry: the skills and canon docs are internal authoring guidance, not a
user-visible engine change (the render output is byte-identical).
