---
status: in-progress
summary: >
  Design investigation (opened from the #1084 open question): should the hand-written
  authoring skills (design/skills/*.md) FEED the product AI generator ("Fabricate"), or
  stay a separate channel? Investigating against source reframed the question. There are
  not two channels but SEVERAL independent renderings of one body of design canon: the
  shipped themes (themes/*.css), the skills (design/skills/), and — the ones nobody was
  watching — the product AI's OWN prompts (THEME_CANON in lib/theme/ai.js, COMPONENT_CANON
  in lib/layout/ai.js, FINISH_SYSTEM in architect.ts) plus the deriveTheme derivation
  (lib/theme/derive.js). The recert work (#1032, #1084) fixed the skills + themes/*.css to
  the #1022 three-layer categorical contract, but the PRODUCT path never migrated, and it
  has drifted in TWO confirmed places: (1) deriveTheme + THEME_CANON still encode the
  retired two-tier, non-flipping, fixed-ink model — measured, every categorical mark on a
  Fabricate theme sits ~2.0-2.9:1 against the dark canvas (below the 3:1 WCAG graphical
  floor), and the derive unit test + the live Studio "WCAG report" both bless it GREEN
  because their predicate (auditBoth) only checks text pairs, never the edge floor; (2)
  FINISH_SYSTEM teaches a NARROWER finish vocabulary than the shipped closed set (missing
  mesh/pinstripe/lattice/frame), so the finish generator cannot propose the premium layers.
  So the real problem is "one canon has several hand-synced renderings and the product ones
  drifted worst, silently." Recommends: (0) fix both drifted product prompts + the
  derivation + the audit predicate blind spot; (1) the load-bearing drift-safety move —
  extend the EXISTING ownership/freshness gate to assert every product prompt stays true to
  its source enums/params (the mechanism we already own); (2) a generated shared kernel /
  generated skill skeletons only if the gate proves insufficient. Separately, elevate the
  owner's "feed the skills" instinct for the DECK path specifically — the thinnest-canon,
  plausibly highest-traffic AI surface. Recommends AGAINST feeding verbose skills wholesale
  to the theme/component generators and AGAINST collapsing to one channel. Trio-hardened.
  DECISION PENDING — owner picks direction and depth.
companion:
  - ./2026-07-19-skill-recertification.md
  - ./2026-07-17-skill-recertification.md
  - ./2026-07-15-categorical-token-contract.md
---

# Skills ↔ Fabricate: one authoring truth, or several channels?

**Date:** 2026-07-19 · **Status:** in-progress (decision made; implementing) · **Owner:** Sharmarke

> **Decision (2026-07-19).** Direction: **Stage 0 + Stage 1**. Fix both product drifts + the
> `auditBoth` blind spot (Stage 0), then extend the existing ownership/freshness gate to assert
> every product prompt (`THEME_CANON`, `FINISH_SYSTEM`, `COMPONENT_CANON`) stays true to its
> source enums/params (Stage 1). The generated shared kernel / generated skill skeletons
> (Stage 2) are **not** adopted now — earn them only if the gate proves insufficient. The
> `deriveTheme` + `THEME_CANON` dark-mode categorical regression ships as its **own fast PR**
> (a shipped WCAG defect); `FINISH_SYSTEM` + the gate extension follow. The deck-path grounding
> (parallel move B) is not adopted in this round.

This opens the question left in `2026-07-19-skill-recertification.md`: should the hand-written
authoring skills (`design/skills/*.md`) also *feed* the product's AI generator ("Fabricate" —
the Studio deck/theme/component/finish generators), or stay a separate long-form teaching
channel? The owner's framing offered three moves — skills as **supporting material** fed to the
model, **pick one** channel, or the **skill becomes generated** from canonical artifacts.

Investigating against source (not memory), and hardening the result with an adversarial trio,
reframed the question. This doc leads with what the code shows, then the model.

## The reframe — one canon, several renderings, and the product's drifted worst (silently)

The premise was "two sources of truth: the skill and Fabricate's theme knowledge (generated from
`lib/theme`)." That is not what the code shows. Fabricate does **not** read the skills (verified:
no runtime path reads `design/skills/`; only the freshness gate and the npm `files` allowlist
touch them). It grounds on its OWN hand-written prompts:

- **`THEME_CANON` + `ASK_SYSTEM`** — `lib/theme/ai.js:41-76`, bundled into `theme-core.generated.js`,
  fed as `generateTheme`'s system turn (~630-token turn; `THEME_CANON` ≈ 205 of them).
- **`COMPONENT_CANON` + 5 worked examples** — `lib/layout/ai.js:42-430`, ~7,900-token turn to
  `generateComponent`.
- **`FINISH_SYSTEM`** — hand-inlined in `architect.ts:429-440`.
- The **deck** path (`runArchitect`/`chatComplete`) uses a tiny ~350-char `SYSTEM`
  (`architect.ts:37-42`) that hand-inlines HARD RULE #5 — the same card rule the skills teach —
  and grounds only the user's reference doc; there is **no canon retrieval** on the deck path.

So one body of canon (the categorical contract, the finish vocabulary, the `function.form` matrix,
the margin rule, HARD RULE #5, the token names/counts) is rendered several times, independently
maintained: `themes/*.css`, `design/skills/*.md`, and the product prompts + `derive.js`. The only
machine link is `checkSkillFreshness` pinning the *skills'* counts to source — nothing cross-checks
the **product prompts** against source. And two of them have drifted.

### Drift #1 — the theme categorical contract (measured, systematic)

#1022 + the recert work (#1032, #1084) moved `themes/*.css` and the skills to the **three-layer
flipping** contract (mark-vs-bg ≥ 3:1, ink-vs-fill ≥ 4.5:1, fill ≠ mark; `cat-on-fill` flips with
the scheme). **The product theme path never got the memo:**

- `THEME_CANON` (`lib/theme/ai.js:46-48`) still tells the model categoricals are "12 PALE fills
  (L≈0.9) and 12 DEEP marks (L≈0.45)" — the retired two-tier heuristic.
- `deriveTheme` (`lib/theme/derive.js:41-42, 262-276`) emits **non-flipping single-value**
  `cat-N-fill`/`cat-N-mark` (no `light-dark()` wrapper) and a **fixed dark** `cat-on-fill`, citing
  a `theming.md` passage #1032 has since rewritten to the opposite contract. `git log` confirms
  `lib/theme` was untouched in the #1022 window.

Measured — `deriveTheme` on the indaco worked-example essentials, and swept:

| canvas | ink-vs-fill (need ≥ 4.5) | mark-vs-bg (need ≥ 3.0) |
|---|---|---|
| light | 12.86 ✓ | 7.09 ✓ |
| **dark** | 12.86 ✓ | **2.69 ✗** |

This is **systematic, not one slot**: across 5 accents × 3 ramp strategies × all 4 shipped
starters, **all 12 marks fall in the ~2.0-2.9:1 band** on the dark canvas (worst 2.04 under
`brand-mono`). The label stays legible (ink-vs-fill is AA-repaired); the categorical
**branch/border** reads below the graphical floor in dark mode, by construction.

**The precise gate status (corrected from a first draft that said "ungated").** The derivation is
NOT unguarded — it is guarded **against the retired contract**. `test/unit/palette/theme-derive.test.js`
audits `deriveTheme` output in both modes via `auditBoth` and passes **green**; the live Studio
Fabricate UI calls `auditBoth(…, {level:'full'})` and paints a **green "WCAG report"** — while
shipping 2.69 marks. The reason: `auditBoth`/`contractPairs` (`lib/theme/contrast.js`) only checks
**text pairs** (`cat-N-fill`↔`cat-on-fill`, `cat-N-mark`↔`cat-on-mark`); there is **no `mark`↔`bg`
graphical pair anywhere in the derive path**. The 3:1 edge floor exists only in `checkCatContrast`,
which scans `themes/*.css` and never calls `deriveTheme`. So the blind spot is a *predicate* gap,
and it is blessed green today by both the unit test and the shipped UI — a sharper problem than
"nothing catches it."

### Drift #2 — the finish vocabulary (a capability regression)

`FINISH_SYSTEM` (`architect.ts:435-437`) gives the model these closed vocabularies: wash
`none|corner-glow|duotone|spotlight|bands`; texture `none|grid|dots|hatch|contour|rings|ruled`;
edge `none|vignette|margin-rule|fold`. The **actual** closed set (`finish-generate.ts:30-33`,
exported as `as const` arrays) is wider: wash adds **`mesh`**, texture adds **`pinstripe`, `lattice`**,
edge adds **`frame`** — the premium layers from the Finish redesign (the same one that added
`nimbus/loom/savile/gallery` to the register, which `finish.md` teaches correctly). So the AI
finish generator **cannot propose the premium layers**: a silent capability regression, and — the
telling part — `finish-generate.ts` already **exports the enums** that `FINISH_SYSTEM` re-inlines
as a stale prose string. Same failure mode as the theme case, second surface.

### The counter-example that shows the fix already works

The **component** path did NOT drift the same way, and shows the pattern that holds:

- `COMPONENT_CANON` inlines its enums (`FUNCTIONS`/`FORMS`/`BUCKETS`) **programmatically from
  `gate.js`** (`lib/layout/ai.js:413-416`) — they cannot drift from source.
- The model **proposes**; `gateComponent` + `findCssExfil` **dispose** (reject hex, non-reset
  margin, unscoped selectors, oversized CSS). It never tells the model to use `@layer`, so the
  footgun #1084 fixed in the skill cannot occur in generated output.

The theme + finish prompts lack this: their contract-bearing facts are hand-typed prose, not
enum-from-source, and nothing disposes a sub-floor mark or a missing layer. **propose → gate →
enums-from-source** is the pattern that held; the theme/finish prompts just never adopted it.

## The design axes

1. **Source of truth for the FALSIFIABLE canon** (token names/counts, the `function.form` matrix,
   the categorical contract params, the finish vocab, the margin/`@layer` rules): today rendered
   several times, hand-synced, and only the *skills'* copy is gated.
2. **Register / audience.** The skills are verbose (~13 KB each): skeletons, good/bad, npm
   workflow, "render and look." The product prompts are terse, token-budgeted, machine-validated
   (component canon already ~7.9 K tokens, billed per call). Genuinely different artifacts — not
   one document at two lengths. The shared **falsifiable** facts are a few hundred tokens; the
   rest of each artifact is audience-specific pedagogy.
3. **Delivery.** Inlined (skills), retrieved (deck path — but today only for component dedup, not
   canon), bundled-from-source (the cores), derived (manifests → `components.json`, already
   single-sourced).

## Candidate models

- **A — Status quo.** *Reject:* proven to drift silently, twice, on the product side.
- **B — Feed the skills to Fabricate as supporting material** (owner's move 1). *Split verdict:*
  for the **theme/component** generators, reject — wrong register (verbose, human-workflow-laden),
  real per-call cost, and it wouldn't fix the *derivation* (`derive.js`) anyway. But for the
  **deck** path it is the best-value move (see the recommendation): that surface has the thinnest
  canon (~350-char `SYSTEM`, no canon retrieval) and is plausibly the highest-traffic AI surface,
  so ranking `deck.md`/`component.md` authoring guidance into it directly serves first-try quality
  — exactly the owner's instinct.
- **C — Pick one channel** (owner's move 2). *Reject:* collapsing verbose-teaching and terse-prompt
  starves whichever audience loses; axis 2 is a real fork, not redundancy.
- **D — Generate the skills from canonical artifacts** (owner's move 3). Emit the skill's FACT
  skeleton from engine + manifests + gate constants; hand-write only teaching prose. *Good but
  partial and higher-cost:* drift-proofs the skills, does nothing for the product prompts, and adds
  a build artifact. Defer behind the gate (below).
- **E — Shared generated "authoring-truth kernel."** One generated source of the falsifiable canon
  that the skills, the product prompts, and `derive.js` all read. *Powerful but the heaviest option:*
  a new build artifact plus three-way coupling, to de-risk a few-hundred-token sliver. Only worth
  it if the cheaper gate (below) proves insufficient.

## Recommendation — staged; the cheapest drift-safety first

The adversarial trio's sharpest point: we **already own** the mechanism. `checkSkillFreshness`
imports source enums (e.g. `FINISH_REGISTER`) and fails when a prose artifact's inlined facts
drift from source. Extending that to the **product prompts** captures every drift actually observed,
at a fraction of the cost/coupling of a generated kernel. So:

- **Stage 0 (do regardless of the rest): fix the two product drifts + the audit blind spot.**
  - (a) Migrate `deriveTheme` + `THEME_CANON` to the three-layer flipping model, AND — the cheap,
    high-leverage locus — add a **`mark`↔`bg` ≥ 3.0 pair to `auditBoth`/`contractPairs`**. That one
    edit closes the derive unit test, the live Studio WCAG report, and (with a small hook) the file
    gate's blind spot at once. Ship with a demo: generate a theme, render a mermaid deck dark,
    confirm ≥ 3:1.
  - (b) Migrate `FINISH_SYSTEM` to the full vocabulary — ideally **derive the enum lists from
    `finish-generate.ts`'s exported `as const` arrays** rather than re-inlining prose.
- **Stage 1 (the load-bearing drift-safety move): extend the ownership/freshness gate to the
  product prompts.** Assert `THEME_CANON`'s contrast framing, `FINISH_SYSTEM`'s vocab, and
  `COMPONENT_CANON`'s enums each stay true to their source (`derive.js` params, `finish-generate.ts`
  enums, `gate.js`). Small, low-coupling, mirrors what already guards the skills.
- **Stage 2 (only if Stage 1 proves insufficient): the generated shared kernel (E) and/or generated
  skill skeletons (D).** The higher-cost, higher-coupling options — earn them with evidence, don't
  lead with them.
- **Parallel, independent, high-value: ground the DECK path (move B, deck-only).** Rank
  `deck.md`/`component.md` authoring guidance into the deck generator's context. Cheapest win where
  the owner's instinct pointed, on the surface that most lacks canon and most likely carries traffic.

Net: **keep the two registers; unify the FACTS beneath them with the gate we already own; fix the
two product drifts now; and feed the skills to the model only where the canon is actually thin (the
deck path).** Not "feed the verbose skills everywhere," not "pick one channel," not "build a kernel
first."

## Honest caveats

- **Impact is a capability/architecture defect, not measured traffic.** `generateTheme`/finish are
  shipped Studio features but run on the user's own OpenRouter key (BYOK, connect-required power
  features). The defects are real by construction and by measurement; their *priority* relative to
  the deck-path win is unproven without usage data.
- The 2.69 figure is one accent; the **12/12-across-accents** sweep shows the class, not a fluke.

## Open sub-decisions for the owner

1. **Depth:** Stage 0 only (fix both product drifts, keep several renderings, no new gate), Stage
   0+1 (also gate the product prompts — recommended), or Stage 0+1+2 (also generated kernel/skills)?
2. **Deck-path move B:** pursue the deck-path grounding in parallel now, or hold for usage data?
3. **Stage 0 packaging:** the `derive.js`/`auditBoth` contrast fix is a shipped dark-mode regression
   — its own fast PR, or folded into the larger effort?

## Verification

Findings verified against source and re-derived independently, then hardened by an adversarial trio
(red team, Munger inversion, independent fact-checker). Folded before this proposal: the "ungated" →
"gated against the retired contract (auditBoth checks text pairs only; the unit test + live WCAG
report bless it green)" correction; the systematic 12/12 sweep; the second drift (`FINISH_SYSTEM`
vocab); the inverted staging (extend the existing gate before any generated kernel); the softened
impact claim; and the elevated deck-path move-B win. The fact-checker verified all quantitative
claims (two numbers restated more precisely here).
