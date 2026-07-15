---
status: in-progress
summary: >
  The categorical color cycle (`--cat-1..12-fill` / `--cat-N-mark` + `--cat-on-fill` /
  `--cat-on-mark`) is 24+ free-form color slots hand-authored per theme, with its real
  contract — fill and mark are DISTINCT tiers of one hue, the 12 slots are MUTUALLY
  DISTINGUISHABLE, the ink contrasts — living only in prose (theming.md) and gated only for
  indaco + cuoio. Consequence: 10 of 14 themes set `fill == mark` on all 12 slots, and 7 of
  those ship at least one pair of byte-identical categorical marks (two categories a reader
  cannot tell apart). Rendered proof: ardesia's mindmap collapses the whole cycle to
  near-identical grays while indaco shows 12 distinct hues. The engine ALREADY has the better
  model — the chart family lets a theme declare only a HUE (`--chart-catN`) and DERIVES
  fill/ink via `color-mix(in oklab,…)` + `light-dark()`, making `fill==ink` structurally
  impossible. DECISION SOUGHT: generalize the chart-family derive-from-hue model to the `--cat-*`
  categorical/diagram cycle so the tokens carry their semantics, and add a distinctness gate that
  runs over EVERY theme (not just Adam & Eve). This doc is a design investigation for a human
  pick — it does not presuppose indaco/cuoio are the target; the recommended model improves on
  them too.
companion:
  - ./2026-05-12-diagram-tokens.md
  - ../typography.md
---

# The categorical token contract — semantics, not paint buckets

**Date:** 2026-07-15 · **Status:** accepted — Seed & Roles, locked 2026-07-15 (implementation pending trio-hardening) · **Owner:** Sharmarke

> Surfaced while writing `design/skills/theme.md`: the skill's advice on `--cat-on-*`
> contradicted the shipped themes, and pulling that thread exposed a systemic issue in the
> categorical token model. This doc is the "design before code" step for the fix.

---

## Decision — Seed & Roles, locked (2026-07-15)

A 5-track **design-competition** (17 agents: 5 design tracks + fresh critics + a shared
fact-checker + comparative judging) pressure-tested the model against independent
alternatives, weighted to the human's hard constraint — override ergonomics, no "magic
trap." **Winner: Track 5 "Seed & Roles"** (9/10; runner-up "Anchored Roles, Audited at the
Floor", 8/10).

**The model.** A theme declares **one seed hue per category** — `--cat-N-seed`, as
`light-dark(lightHue, darkHue)`. The engine **derives** `--cat-N-fill` / `--cat-N-mark` /
on-inks via the chart-family recipe (`color-mix(in oklab, …)` + `light-dark()`), so
`fill==mark` and indistinct collapse are **structurally impossible**. Override is a named
**`-set` seam** (chart-family's `var(--input, default)` idiom) that wins regardless of source
order, specificity, or `@layer` — *set a token, it wins, no color-mix to reverse-engineer.*
That is the anti-magic escape the human weighted highest.

**The locked framing — one model, two exceptions** (the shape confirmed with the owner):

- **Uniform** derive-from-seed for every theme; the **light path is fully derivable** — nothing
  theme-specific beyond the declared hues.
- **Dark mode** carries the per-theme tuning: the seed's **bright dark arm**, plus a few
  **pinned dark fills via the override seam** on the good-4 themes (indaco / cuoio / carta /
  carbone), where pure `color-mix(seed, black)` underperforms hand-tuning. Same token/form —
  the dark side just gets the attention.
- **AA / a11y themes** are the sanctioned **function exception**: they swap the hue axis for a
  **luminance spread + textures** (as `a11y-achromatopsia` already does) — same "declare inputs,
  derive roles" spirit, different distinctness axis.

**Prototype validation (cuoio, rendered 2026-07-15).** Light mode reproduces cuoio faithfully —
and cleaner, since each category becomes a *coherent single hue* instead of cuoio's mismatched
fill/mark. Dark **node fills** are the one honest compromise (the mix-into-black desaturation),
addressed by the seam pins above; strokes/marks are fine. Before/after mindmaps + the two jargon
PDFs are the evidence.

**Grafts folded from the runners-up (before implementation).**
- *Track 2:* the gated invariant is **intra-cycle distinctness on the mark tier** — the **gate**,
  not derivation, carries safety (demote "fill==mark impossible" to a bonus); keep **Model A
  (literals + gate) as the documented cheaper fallback**; target MARK (not fill) for per-slide
  mindmap recolor.
- *Track 4:* factor the derivation into **one shared CSS partial** imported by both chart-family
  and the cat block (no drift, #1/#15); the cat cycle reads its own `--cat-N-hue`
  (default `var(--chart-catN, …)`) so recoloring a category does not move charts; calibrate the
  distinctness gate as a **frozen, dated, raise-only ratchet** (#3/#21 idiom), not a self-lowering
  formula.
- *Track 1:* adopt its **Mermaid override-boundary table** — theme-level override reaches
  everything; per-slide reaches CSS categoricals + `mermaid.css` node fills, but **NOT** the
  JS-baked `cScale` palette without a separately-costed per-section re-theme runtime change.
- *Track 3:* if the `oklch(from …)` mark-L pin is ever taken (deferred), it MUST be a real
  relative-color evaluator in `resolve-token-expr`, not a shape-match (#1); set an absolute
  perceptual floor with indaco's blue/indigo pair as a sanctioned allow-listed exception.

**Blast radius — ~13 components consume the cycle.** Heavy: `mindmap`, `kanban`, `decision`,
`actors`, `roadmap`, `journey`, `logo-wall`, `obligation-matrix`. Accent: `kpi`,
`authority-chain`, `statute-stack`, `math`, `compare-prose`. Charts are unaffected (separate
`--chart-*` palette, already on this model).

**Next.** Harden this design with the **adversarial trio** (red team + Munger inversion +
independent checker) applied to what ships; THEN implement — shared derivation partial +
per-theme seeds + a distinctness gate over **every** theme + the a11y texture treatment — with
**export sign-off (dark + light)** since diagram bytes shift (QUALITY BAR export gate).

The §1–§9 investigation below is the analysis this decision rests on; where it and this Decision
differ (e.g. §4/§9's "Model B" framing), the Decision supersedes — Seed & Roles is Model B
sharpened by the competition (the `-set` seam is the addition that answers the anti-magic
constraint Model B left open).

---

## 1. The problem

A Lattice theme paints categorical data (Mermaid mindmaps, flowchart node classes, kanban
lanes, roadmap sections, decision/legal cells) from a **12-slot categorical cycle**:

| Token | Intended role |
|---|---|
| `--cat-N-fill` (×12) | the pale AREA behind a category |
| `--cat-N-mark` (×12) | the deep STROKE/ink that defines it |
| `--cat-on-fill` | ink that sits on a fill |
| `--cat-on-mark` | ink that sits on a mark |

The **contract** these tokens are supposed to honor is real and specific:

1. **Tier separation** — `fill` is a pale tier, `mark` is a deep tier of the *same hue*, so a
   category reads as a pale box with a defining border.
2. **Mutual distinctness** — the 12 slots must be tellable apart (that is the entire point of a
   *categorical* palette).
3. **Ink contrast** — `on-fill` / `on-mark` clear WCAG AA on their surface, both canvas modes.

**None of that contract is encoded in the tokens or enforced across themes.** It lives in prose
(`design/theming.md`) and is gated only for `indaco` + `cuoio` (`test/unit/palette/contrast.test.js`
loops exactly `['indaco','cuoio']`). The tokens are 24+ free-form color slots — *paint buckets* —
so a theme can fill them with anything and every gate stays green.

This is the root the owner named: **"tokens used for this sort of thing should carry clear
semantics, not select a list of color palettes."**

---

## 2. Evidence

**Structural (threshold-independent):**

- **`fill == mark` on all 12 slots in 10 of 14 base themes** — ardesia, atelier, brina, burgundy,
  concrete, crepuscolo, laguna, magnolia, mustard, onyx. Only indaco, cuoio, carta, carbone keep
  distinct tiers. When `fill == mark`, the pale-area/deep-stroke distinction is gone by
  construction.
- **7 themes ship ≥1 pair of byte-identical categorical marks** (OKLab ΔE = 0.000): atelier,
  brina, burgundy, crepuscolo, laguna, magnolia, mustard. Two categories that are literally the
  same color.

**Rendered (the proof that matters — same mindmap, light mode):**

- `indaco`: every branch a distinct categorical hue. ✅
- `ardesia`: the whole 12-color cycle collapses to near-identical grays — categories
  indistinguishable. ❌ (Renders in `/tmp` during the investigation; reproduce with a `mindmap`
  under `theme: ardesia` vs `theme: indaco`.)

**Scope note — what is NOT affected:** native charts use a *separate* palette
(`--chart-cat1..8` → derived `--chart-cat-N-fill/-ink`) and are fine. Plain flowcharts use the
single `--diagram-stroke` and are fine. The defect is specific to the `--cat-*` categorical cycle
(mindmap cScale, kanban/roadmap/decision/legal categorical sections).

**A measurement caveat, stated honestly:** a naive "min pairwise OKLab distance" gate is
mis-calibrated — measured on the pale *fills* it flags indaco (fills all sit near-white); measured
on *marks* with a 0.10 threshold it still flags indaco (0.043) whose closest pair, blue vs indigo,
is genuinely similar. So **calibrating the distinctness gate is itself a design task** (§5), not a
one-liner. The `fill==mark` and `ΔE==0.000` facts above need no calibration.

---

## 3. The design space

Four axes to decide:

- **A — Authoring surface.** Does a theme hand-author every fill/mark/on-ink slot (status quo),
  or declare a small **hue set** and let the engine derive the roles?
- **B — Tier derivation.** Are fill/mark/on-fill/on-mark *values a theme types*, or *functions of
  a hue* (so `fill==mark` can't happen)?
- **C — Distinctness enforcement.** Unchecked (today), or a gate over **every** theme, both modes,
  measured on the saturated tier and calibrated to pass the references.
- **D — Monochrome themes.** Are grayscale identities (ardesia "slate", onyx) *banned*, or
  *allowed but held to distinctness* the way `a11y-achromatopsia` is (spread luminance ramp +
  textures)?

---

## 4. Candidate models

### Model A — Keep hand-authored, just gate harder
Leave the 24-slot hand-authored cycle; extend the contrast + a new distinctness gate to all
themes; fix the 10 collapsed themes by hand.
- **Pro:** smallest engine change; themes keep full manual control.
- **Con:** does nothing about the *semantics* problem — the tokens stay paint buckets, and the
  next theme can re-break them in a way the gate must forever chase. Fixing 10 themes by hand is
  the larger cost and re-introduces drift risk. Does not honor the owner's actual point.

### Model B — Derive the cycle from a hue set (generalize the chart-family model) — RECOMMENDED
A theme declares only the **hues** (e.g. `--cat-1-hue … --cat-12-hue`, or reuses one hue vocabulary
shared with charts). The engine derives the roles, exactly as chart-family already does today
(`lib/components/chart/_chart-family/chart-family.css`):

```css
--cat-N-fill:    light-dark(color-mix(in oklab, var(--cat-N-hue) 24%, var(--bg)),
                            color-mix(in oklab, var(--cat-N-hue) 40%, black));   /* pale tier */
--cat-N-mark:    light-dark(var(--cat-N-hue),
                            color-mix(in oklab, var(--cat-N-hue) 78%, white));   /* deep tier */
--cat-on-fill:   /* derived dark ink */      --cat-on-mark: /* derived light ink */
```

- **Pro:** the semantics are *in the token* — `fill` and `mark` are provably different tiers of
  one hue, so `fill==mark` is impossible and the whole class of collapse we found cannot recur.
  A theme picks hues (its actual identity); the boardroom tier discipline is the engine's, not
  the author's, to get right. **It is already proven in production** (every chart renders through
  it) and it is *better posture than indaco/cuoio*, which hand-author 24 slots and could still
  drift — so this improves on Adam & Eve rather than merely conforming to them.
- **Con:** a real migration (all 14 themes move from 24 authored slots to ~12 hues); the derived
  tiers must be validated to not regress the 4 good themes' current look; monochrome themes need
  the §D answer (a hue set of one hue can't be distinct — they must opt into luminance+texture).

### Model C — One shared categorical vocabulary for charts AND diagrams
Model B, plus **unify** the chart cycle and the diagram cycle onto ONE hue vocabulary, so a pie and
a mindmap in the same theme read as one palette (they diverge today).
- **Pro:** maximal coherence; one thing to tune per theme; kills the chart-vs-diagram palette
  split.
- **Con:** biggest blast radius; charts cap at 6–8 and diagrams want up to 12, so the vocabularies
  aren't the same size — unification needs a rule for slots 9–12. Best treated as a *follow-on* to
  B, not bundled.

**Recommendation: Model B now, Model C as a documented follow-on.**

---

## 5. The distinctness gate (part of B)

- **Measure on the saturated tier** (the hue / mark), never the pale fill.
- **Calibrate to the references, not to a guessed constant** — pick the threshold as (minimum
  adjacent distinctness that `indaco` + `cuoio` already pass) minus a small margin, so the gate
  encodes "at least as distinct as Adam & Eve" rather than an arbitrary 0.15. Re-derive if the
  references change.
- **Check adjacent slots among the first N** (chart-family checks the first 6; past ~6 categories
  perceptual distinction collapses anyway — Wong 2011 — so the cycle should *consolidate*, and the
  gate should say so rather than demand 12 distinct hues).
- **Both canvas modes.** Reuse `oklabDistance` from `lib/theme/color.js` (already exists) and the
  `parsePaletteVars` light/dark resolver from `contrast.test.js`.
- **Run over every base theme**, not `['indaco','cuoio']` — closing the coverage gap the red-team
  review flagged is half the value here.

---

## 6. Theme triage (which themes need what)

| Bucket | Themes | Action under B |
|---|---|---|
| Distinct-tier references | indaco, cuoio, carta, carbone | migrate to hue-declaration; validate derived look ≈ current |
| `fill==mark`, hued | atelier, brina, burgundy, crepuscolo, laguna, magnolia, mustard | declare their real hues; derivation restores tier separation + fixes the identical-mark pairs |
| `fill==mark`, grayscale identity | ardesia, onyx, concrete | §D decision: give them the `a11y-achromatopsia` treatment (luminance-spread ramp + textures) so the monochrome identity survives *with* distinctness |
| Intentional monochrome (function deviation) | a11y-* | already texture+luminance; exempt from the hue-distinctness gate, held to the a11y distinctness rule instead |

(The hued-vs-grayscale split within the `fill==mark` group should be confirmed per theme during
implementation — the design question is settled; the per-theme classification is mechanical.)

---

## 7. What this changes downstream

- **`design/theming.md`** — replace the hand-authored "Paired ink (non-flipping)" contract (which
  already contradicts every shipped theme) with the derive-from-hue model + the distinctness rule.
- **`design/skills/theme.md`** — its current `--cat-on-*` guidance is wrong (it tells authors to
  hand-set inks and flags `var(--text-heading)` as bad, then says "copy indaco," which does the
  opposite). Under B the skill gets simpler: *declare hues; the engine derives the rest; the gate
  proves distinctness.* Remove the caveat entirely.
- **`checkSkillFreshness`** already ties the skill's counts to source; the new distinctness gate is
  its palette-side sibling.

---

## 8. Open questions

1. **Monochrome identities (§D):** ban, or allow-with-a11y-treatment? (Recommend allow — ardesia's
   slate identity is legitimate; indistinct categories are the defect, not gray itself.)
2. **Hue count:** 12 declared hues, or a smaller set that *cycles with a consolidation rule* past 6?
3. **Charts + diagrams unification (Model C):** now or later? (Recommend later.)
4. **Migration validation:** the 4 good themes must not visually regress — needs a per-theme
   before/after pixel pass (`tools/pixel-check.js`) as part of the change, and export sign-off since
   diagram bytes shift.
5. **Distinctness threshold:** derive-from-references (§5) — confirm the margin.

---

## 9. Recommendation in one line

**Adopt Model B:** make the categorical cycle *derive* fill/mark/on-inks from a declared hue set
(the model charts already use), add a reference-calibrated distinctness gate over every theme, and
give monochrome identities the a11y luminance+texture treatment — so the tokens carry their
semantics and the collapse we found cannot recur. Then converge the themes, doc, and skill.
This is a human-pick design doc; nothing is implemented.
