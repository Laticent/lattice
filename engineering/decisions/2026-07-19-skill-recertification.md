---
status: shipped
summary: >
  Fresh re-certification of the seven design/skills/*.md authoring skills against the
  engine as of 2026-07-19, following the 2026-07-17 categorical/texture recert (#1032).
  Re-verified every inlined fact against source (not memory): the six gate-locked counts
  (46 universal variants, 13 buckets, 10 finishes, 8 chart-cat slots, 91-token contract,
  10 required core tokens), the function·form matrix (the new cycle + policy-recommendation
  components land on already-sanctioned coordinates), the lens exports, the finish register,
  the chart token model, and all 13 review-finding IDs — all TRUE today. Found ONE genuine
  conceptual defect the #1032 pass missed: chart-component.md's CSS skeleton wrapped rules
  in `@layer components { … }` with plain `section.<name>` selectors — both wrong, because a
  chart IS a component (every shipped chart CSS is UNLAYERED, and a layered rule silently
  loses the cascade to unlayered base rules; cascade.md) and real charts match
  `:is(section.<name>, figure.chart-frame)` so colors resolve in the Read·Article figure
  re-host too. Fixed the skill, added a finish.md `--fin-texture` vs `--cat-N-texture`
  disambiguation, and generalized the checkSkillFreshness `@layer`/unlayered guard from
  component.md alone to BOTH CSS-authoring skills so this class can't recur. Also records the
  skills-vs-Fabricate two-channel finding and the open unify-or-keep-separate question that
  #1032 left unrecorded.
companion:
  - ./2026-07-17-skill-recertification.md
  - ./2026-07-17-layer-footgun-gate.md
  - ./2026-06-18-layer-activation-scope.md
---

# Re-certifying the authoring skills — 2026-07-19 fresh pass

**Date:** 2026-07-19 · **Status:** shipped · **Owner:** Sharmarke

The `design/skills/*.md` files are self-contained teaching docs — each authors ONE
artifact (deck / theme / component / chart / finish / lens / notes) from a blank file at
the boardroom bar, with the tokens, counts, and gates **inlined** so an agent never chases
a link mid-task. That sanctioned duplication is only safe while it stays TRUE, and the
`checkSkillFreshness` gate pins the falsifiable facts. The 2026-07-17 pass (#1032) rewrote
theme.md to the three-layer categorical contract + the `--cat-N-texture` channel and gated
the concept, and fixed a `@layer components` footgun in component.md. This is a **fresh
audit against the engine as of 2026-07-19** — verify #1032's fixes still hold, and catch
anything that moved in the ~48 commits since (the `cycle` and `policy-recommendation`
components, the insight-* vocabulary growth, the Anima/Compose work).

## What I verified TRUE today (source, not memory)

The gate-locked counts are re-derived from source on every `build:check`, and the tree is
green, so each is correct **today**:

- **46** Tier-1 universal variants (grew from 35 as the `insight-*` vocabulary landed — the
  count gate forced component.md to follow), **13** buckets, **10** finishes, **8**
  chart-cat slots, the **91**-token per-theme contract, **10** required core tokens.

Beyond the counts, I re-checked the hand-inlined models that no count guards:

- **component.md's function·form matrix** — the two components added since #1032 land on
  **already-sanctioned** coordinates: `cycle` is `progression·timeline` and
  `policy-recommendation` is `statement·panel`, both already in design-system.md §4. No
  matrix drift.
- **theme.md** — three-layer contract (① mark-vs-`--bg` ≥ 3:1, ② intentionally-low fill,
  ③ `--cat-on-fill`-vs-fill ≥ 4.5:1, + fill ≠ mark), the flipping inks, the
  `--cat-N-texture` adoption channel, and the "gates three of these" honesty — all current.
- **chart-component.md** — the token model (`--chart-cat-N-fill`/`-ink`, the `--chart-catN`
  override hook, `--chart-state-*`), the cap-6/Wong-2011 story, and the CHART_LAYOUTS /
  SECTION_BUILDERS dispatcher wiring — all match `chart-family.{js,css}`.
- **lens.md** — `LensDef` fields (incl. the `order?` #1032 added) and every named export
  (`approvalHash`, `lensEligibility`, `lensSlides`, `readerLenses`, `lensPairs` in
  `project.ts`; `parseLensRegistry`/`emitRegistry` in `registry.ts`) exist. `approvalHash`
  is still content-bound in `project.ts` after #1071 made it injective — the teaching holds.
- **finish.md** — the 10 finish rows (`none, atrium, meridian, strata, halo, ledger, nimbus,
  loom, savile, gallery`) match `FINISH_REGISTER` exactly; the RICH/OPAQUE dual holds.
- **speaker-notes.md** — all **13** review-finding IDs in the §4 rubric exist in
  `review-core.js`; the narration precedence chain and the Cadenza model are current.
- **deck.md / README.md** — front-matter block, the `new:slide`/`new:theme`/`new:component`
  scripts, and the three-layer falsifiable-bar example (README) all verify.

## What drifted (the one real defect)

**chart-component.md — the CSS skeleton taught the inert `@layer` wrapper.** Its "The CSS"
block wrapped the rules in `@layer components { … }`:

```css
@layer components {
  section.funnel .funnel-band:nth-of-type(1) { fill: var(--chart-cat-1-fill); … }
}
```

This is the SAME footgun #1032 caught in component.md, and it was wrong for the same reason:
`@layer` is **inert** in the engine bundle (HARD RULE #26 — the bundle reserves the layer
order but wraps no rule, so plain source order decides the cascade), and a layered rule
**loses to an unlayered base rule regardless of specificity** (`engineering/cascade.md`). A
chart is a component; **every shipped chart CSS is unlayered** — `piechart.styles.css`,
`funnel.styles.css`, and `map.styles.css` all use bare `:is(section.<name>,
figure.chart-frame) …` selectors. Following the skill verbatim produced chart CSS whose
fills silently lost the cascade. The #1032 pass fixed and gated component.md but the guard
was component.md-only, so the identical bug in chart-component.md survived.

A second, quieter miss in the same block: the selector was a plain `section.funnel`, which
does **not** match the Read·Article `<figure class="chart-frame">` re-host that re-parents
the chart SVG outside its `section` (chart-family.css). The real charts guard against this
with `:is(section.<name>, figure.chart-frame)`.

## What changed

- **chart-component.md** — rewrote the CSS skeleton to be **unlayered** and anchored on
  `:is(section.funnel, figure.chart-frame)`, matching every shipped chart CSS; taught the
  convention in recipe step 5, the ship checklist, and a new common-mistake entry. (Prose
  deliberately avoids the literal `@layer components {` so the strengthened gate can't
  false-fire on the skill's own warning about it — the same care component.md takes.)
- **finish.md** — added a short "two unrelated textures" note disambiguating its
  `--fin-texture` (a z2 backdrop pattern layer) from the theme skill's categorical
  `--cat-N-texture` channel (`engineering/textures.md`). Same word, different mechanism and
  prefix; a finish never touches `--cat-*` and a theme never touches `--fin-*`.
  (`--fin-texture` is NOT renamed — it is the correct, shipped name.)
- **checkSkillFreshness** — generalized the component.md `@layer`/unlayered guard to a
  `CSS_AUTHORING_SKILLS = ['component.md', 'chart-component.md']` loop: neither may show an
  `@layer components {` block wrapper, and each must teach the word "unlayered". Added unit
  tests (`test/unit/cli/check-ownership.test.js`) that both skills are clean and that an
  injected wrapper trips the regex. Verified the gate BITES: injecting the wrapper into
  chart-component.md fails `build:check` with the exact error; reverting restores green.

## How the gate now prevents recurrence

The original guard would have stayed green through this drift forever — it only watched
component.md. The strengthened guard fails if EITHER CSS-authoring skill reintroduces the
inert `@layer components` wrapper or stops teaching the unlayered convention. Combined with
#1032's categorical-concept markers and the six source-tied counts, the falsifiable facts a
rewrite could silently invert are now pinned across the skills that carry CSS skeletons.
Prose, taste, and recipe *quality* remain on human review — the gate pins the class of
error that actually rotted here (a CSS skeleton that silently loses the cascade).

## The skills are a parallel channel to the product AI — NOT its source (and the open question)

A finding worth recording, which the #1032 doc did not: **the skills do not feed the
product's AI generator ("Fabricate", the Studio deck/theme/component generator).** No
runtime code reads `design/skills/` into a prompt; the only references are the release-zip
packaging (`tools/build-release-zip.js`) and the freshness gate. Fabricate builds its model
context from a **different** set of sources — the hardcoded system prompts in
`docs/src/components/studio/architect.ts`, the **generated** cores
(`docs/src/playground/theme-core.generated.js` built from `lib/theme/*` by
`tools/build-theme-core.js`, and `layout-core.generated.js` from `lib/components/*`), the
component catalog, and any **user-supplied** reference doc — not the repo's canonical docs.

**Implication.** The skills are a parallel authoring-knowledge channel aimed at an in-repo
agent (or human) authoring by hand. Their drift does not degrade Fabricate output directly,
so this is correctness/maintenance work, not a prod fix. The real divergence risk is
**two-sources-of-truth**: Fabricate's theme knowledge is *generated* from `lib/theme`, but
theme.md is hand-written — which is exactly how the #1022 palette recolor regenerated the
Fabricate core automatically while theme.md silently rotted until #1032. The mitigation is
the one both this pass and #1032 already apply: **anchor every skill to the ENGINE it
describes** (`lib/theme`, `lib/components`, the canonical docs the cores are generated from),
so both channels stay in agreement.

**Open question (not decided here — a genuine fork for the owner).** Should the skills also
*feed* the product AI — one generated authoring-truth source for both the in-repo agent and
Fabricate — or stay a separate long-form teaching channel? The tension is real: Fabricate
needs terse, token-budgeted, machine-validated prompts, while the skills are deliberately
verbose (skeletons, side-by-side good/bad, canonical-source footers). Unifying risks
bloating the prompt or starving the teaching; keeping them separate keeps the divergence
risk that this gate now partly covers. **Recommendation: keep them separate for now**, and
lean on engine-anchoring + the freshness gate to hold them in agreement — but this is the
owner's call, flagged rather than silently decided.

## Verification (adversarial trio + maker-checker)

Per HARD RULE #25 (a shared-kernel gate change is real blast radius, but the diff is small):
a maker-checker on the gate diff and a right-sized adversarial trio (red team, Munger
inversion, independent fact-checker) on the result. Dogfooded the fixed chart teaching on
the real surface (HARD RULE #23): rendered `examples/chart-family-coverage.md` and confirmed
the unlayered `:is(section.<name>, figure.chart-frame)` pattern resolves distinct
categorical colors (not collapsed/gray). `build:check` (incl. `checkSkillFreshness` +
`checkCatContrast`), `npm run lint`, and `npm test` green.

No `CHANGELOG` entry: the skills and the gate are internal authoring guidance / CI infra,
not a user-visible engine change (render output bytes are unchanged).

## Off-path, tracked (HARD RULE #18 — logged, not fixed here)

The Munger pass surfaced a pre-existing defect in `tools/build-decisions-index.js`: it does
not parse YAML **folded scalars**, so any decision doc whose front matter uses `summary: >`
(the multi-line form — 29 docs today, including this one and the 2026-07-17 predecessor)
renders in `engineering/decisions/README.md` as a bare `— >` instead of its summary text;
docs with an inline single-line `summary:` render fully. This is systemic shared-tooling
drift affecting 29 entries — off this recert's path, and fixing the generator's YAML reader
is its own change (it re-renders every folded-scalar entry). Logged here rather than pulled
into this PR (keeps #8/#17 intact); this doc keeps `summary: >` for consistency with its
siblings. Owner for a follow-up: whoever maintains `decisions:index`.
