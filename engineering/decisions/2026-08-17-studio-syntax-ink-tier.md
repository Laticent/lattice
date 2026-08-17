---
status: shipped
summary: >
  The Studio's code editors painted strings and numbers with --pass / --warn — status tokens
  doing a syntax job, #1703's stopgap after those rows were found reading tokens declared
  nowhere. Replaced with a DERIVED three-role tier — --syntax-keyword-ink / -string-ink /
  -number-ink — seeded from each palette's own --hljs-* code colors and solved onto
  the EDITOR canvas by the shared solveInk recipe, then repelled from the colors the same editor
  paints from --text-heading / --text-body / --text-muted. Two corrections to #1703's record: its
  stated reason for not using --hljs-* (the a11y palettes declare none, so resolveToken throws) is
  FALSE — a11y-base extends onyx and all 18 base palettes resolve the family; the real blocker is
  the SURFACE, and bigger than stated — 21 of 36 palette-modes put a raw --hljs-* below AA on the
  editor canvas, worst 1.01:1 (concrete/light, not the 1.63:1 case originally found). The tier
  lands at worst 4.65:1 across 216 ink-surface pairs, and worst OKLab dE 0.0350 from any
  neighboring role FOR THE TWO REPELLED ROLES (keyword is not repelled and is byte-identical to
  --text-heading on 13 palette-modes, so the unqualified form of that sentence is false). It
  repairs two pre-existing defects nobody had filed: mustard/light painted keywords and Markdown
  headings in --accent at 3.89:1 against --bg-alt (4.35:1 against --bg); and on a11y-achromatopsia
  the shipped --warn IS --text-muted, so number literals were byte-identical to comments. The
  public Playground editor carried the --accent defect and is repaired with the same token. A
  fourth `muted` role was added and REVERTED — see the record — because repairing --text-muted's
  contrast on this one-lever solve costs the comment-to-body separation it exists to have.
  Verified on the real built Studio — every rendered span's computed color compared for equality
  against its palette-mode's own emitted value — plus a committed hostile sweep of the solver
  (test/unit/palette/syntax-ink.test.js) with zero sub-AA values and zero collapses. The Anima half fixes a
  prompt that taught models var(--text), a token the engine does not declare; the scene palette is
  now generated into the prompt and gated against the engine's declarations. Enforcing that list
  in validateColor was tried and REVERTED: an undeclared custom property inherits rather than
  rendering colorless, so the coercion turned a correct var(--fail) part flat gray — and reverting
  it leaves every exported artifact byte-identical to main, so this change needs no export
  sign-off.
---

# The Studio's syntax ink tier — real code colors on the editor's own canvas

**#1688.** Follow-up to #1703, which fixed the dangling-token half of this and left the
semantic half logged rather than smuggled in.

## 1. What shipped before, and why it was a compromise

`studioHighlight` (docs/src/components/studio/editor-theme.ts) and `tokenColor`
(chat-highlight.ts) painted the string row `var(--pass)` and the number row `var(--warn)`.
Those are STATUS tokens. They cleared AA and preserved the green/amber the rows had been
hand-picking, so #1703 was right that it was an improvement over `var(--chart-3, #2e6f00)`
— a token declared nowhere, whose hex literal therefore won on all 36 palette × mode rows
forever. But a status token carrying a syntax role means two things drift together that
have no reason to: retune `--warn` for a badge and you have retuned number literals.

## 2. Two corrections to #1703's record

**The stated reason for not using `--hljs-*` is false.** The PR and the comment block in
`editor-theme.ts` both said the four `a11y-*` base palettes declare no syntax colors, so
`resolveToken` would throw on partial `PORTAL_TOKENS` coverage. `a11y-base` extends `onyx`,
which declares the whole family, so all 18 base palettes resolve it. Reproduced:

```
node -e "const m=require('./tools/build-docs-portal');
  m.PORTAL_TOKENS.push('hljs-string','hljs-number','hljs-comment');
  const p=m.resolvePalettes();
  console.log(p.length, p.find(r=>r.name==='a11y-achromatopsia').light['hljs-string']);"
# -> 18  #80B880   (no throw)
```

That claim was load-bearing — it was the argument for taking the cheap path — and it is
corrected in the file where it lived.

**The real blocker is the SURFACE, and it is worse than first measured.** `--hljs-*` are
tuned for `--code-bg`, the slide's code panel, which is dark on every palette in both
modes. The editor's canvas is `--bg`. Measured over 18 palettes × 2 modes × {string,
number}: **21 of 36 rows put a raw `--hljs-*` below AA**, and the worst case is
**1.01:1 — concrete/light `--hljs-number` #C8B880 on #B8B8B5**, effectively invisible. The
1.63:1 indaco/light figure that opened this investigation is real but not the floor.

So dropping `--hljs-*` in as-is would have been materially worse than the status trio. A
solved tier is the answer, not a direct read.

## 3. The design

**Three roles, seeded per palette** (`syntaxInkSeeds`, tools/build-docs-portal.js):

| role | seed | why |
|---|---|---|
| `keyword` | `--accent` | The color the editor ALREADY paints keywords, headings, tags and links. `solveInk` returns a clearing seed unchanged, so this is visually identical on 34 of 36 rows. |
| `string` | `--hljs-string` | The palette's own string color — indaco's Night Owl tan, cuoio's terracotta, laguna's sage. |
| `number` | `--hljs-number` | Likewise. |

**Solved, then repelled** (`deriveSyntaxInks`). Step 1 is the shared recipe from
`lib/theme/cat-ink.js` — `solveInk`, hue and chroma held, lightness bisected until the value
clears AA + margin against BOTH `--bg` and `--bg-alt`. Step 2 is the part `--cat-N-ink` does
not need: a slide's categorical inks only have to be tellable from *each other*, but an
editor tier lands among colors it does not control and cannot move — `--text-heading` for
property names and `--text-body` for identifiers — plus whatever the tier's own other roles
resolved to. A string that reads as a comment is the same defect as a string that reads as
another string.

(`--text-muted` was in that fixed set until the `muted` role took over the comment and
punctuation rows; it is no longer a color this surface paints, so it left both the `avoid`
set and the gate's FIXED list. An earlier draft of this paragraph still counted it.)

This is not hypothetical. The minimum-move solve puts `a11y-achromatopsia`'s number ink
**byte-identical to its `--text-muted`** (#6E6E6E) — both are "the least darkening of a
mid-gray that clears AA on white", and there is only one such value. So each repelled role
is pushed along `feasibleRange`'s own `dir`, which is *away* from the canvas and therefore
monotonically more legible, until it sits ≥ `MIN_DIST` in OKLab from every fixed role and
every role already placed.

**`keyword` is deliberately NOT repelled**, and the exclusion is the design rather than an
oversight. Measured on the emitted sheet, `--accent` is BYTE-IDENTICAL to `--text-heading` on **13
palette-modes across seven palettes** — `onyx` and `concrete` (both modes), the four `a11y-*` (both
modes), and `atelier`/light — a monochrome palette taking its ink as its accent. (An earlier draft
said "five palettes" and claimed the shared value is always `#000000`/`#FFFFFF`; it is `#1A1A18` on
atelier/light and `#0F0F0E`/`#ECECE8` on concrete, so the "no lightness left to push into" argument
holds for the poles and not for those three. The reason that survives is the one below.) Repelling it would invent an off-brand accent on every one
of those rows to solve a collision the palette author chose. The first cut did repel it, and
the gate correctly threw on `a11y-achromatopsia` — which is how the exclusion was found
rather than assumed.

### The a11y palettes seed from the status pair, and that is the deliberate answer

The brief asked what achromatopsia should do, and guessed "collapsing to weight-only may be
the right answer there." Measured, the right answer is one rung more specific than that, and
it comes out of the palettes' own declarations.

The four `a11y-*` palettes inherit their entire syntax family from `onyx`: `--hljs-string`
green at hue 144°, `--hljs-number` yellow-green at 104°. That pair sits squarely on the
red-green axis `a11y-deuteranopia` and `a11y-protanopia` exist to avoid, and hue means
nothing at all under `a11y-achromatopsia`. Meanwhile each of those palettes overrides
`--pass`/`--warn` with a pair it has curated as safe *under its own condition*:

| palette | status pair | OKLab dE | vs. the inherited syntax pair |
|---|---|---|---|
| `a11y-deuteranopia` | blue 250° / amber 76° | 0.2675 | 0.1009 |
| `a11y-protanopia` | blue 250° / amber 76° | 0.2675 | 0.1009 |
| `a11y-tritanopia` | green 150° / red-orange 35° | 0.2318 | 0.1009 |
| `a11y-achromatopsia` | **grayscale** #4D4D4D / #6E6E6E | 0.1180 | 0.1009 |

So on those four the seeds are `--pass`/`--warn`. It is the safer pair on the measurement as
well as on the intent, and for achromatopsia it *is* the lightness-only answer — that palette
already made that decision for itself. The value the editor paints on those four is
therefore close to what shipped, and that is the correct outcome: what was wrong there was
the NAME and the accident, not the color. The thirteen hued palettes are where the substance
of the change is.

**The a11y family is asked by NAME** (`name.startsWith('a11y-')`), as `isModeInvariant` in
the same file already does. There is no structural signal that separates them from `onyx`,
which shares their exactly-achromatic categorical cycle (max chroma 0.0000 across both
modes, against 0.045 for `concrete` and ≥0.13 for everything else) and is a monochrome
BRAND rather than a color-vision accommodation. An earlier cut used that chroma signal and
would have forced grayscale syntax on `onyx` — imposing an accessibility accommodation on a
palette that never asked for one. `onyx` keeps its own hued pair.

### A second pre-existing defect the repulsion pass fixes

The shipped `--warn` on `a11y-achromatopsia` is `#6E6E6E`. So is its `--text-muted`. So the
editor painted **number literals byte-identical to comments** — OKLab dE **0.0000** — on the
one palette that has nothing but lightness to separate anything with. That is what the
repulsion pass is for, and it is why the pass earns its complexity rather than being a
theoretical nicety: after it, the same pair sits at dE 0.0350. The `--pass`/`--warn` stopgap
did not merely have the wrong NAME on that palette; it had a collapsed value.

### The `muted` role: added, then reverted — and the reversal is the finding

Comments and punctuation run on `--text-muted`, and an early comment in `editor-theme.ts` justified
leaving them alone: *"de-emphasis is the design, and `--text-muted` is AA against the canvas by
contract."* **There is no such contract.** It holds for `--text-body` and `--text-heading`;
`--text-muted` is below AA on **44 of 72 palette-mode-surface pairs, worst 2.11:1** (magnolia/light
`#B79A93` on `--bg-alt`; 2.47:1 against `--bg`). A checker caught the false claim by measuring it.

So a fourth `muted` role was added — same recipe, seeded from `--text-muted`, solved to the same
floor. It shipped for one commit and was **reverted**, because a Munger inversion measured what it
cost and the cost is structural:

**This solve has one lever.** `solveInk` moves LIGHTNESS AWAY FROM THE CANVAS — and away from the
canvas is exactly where `--text-body` already sits. Raising the comment's contrast necessarily walks
it toward the body text it exists to be quieter than. `MIN_DIST` is a floor against collision;
nothing in the design is a ceiling against being too loud. Measured on **cuoio light — the site's
default palette and mode**:

| | before | with the `muted` role |
|---|---|---|
| comment (`--text-muted` → `--syntax-muted-ink`) | `#A69882` @ 2.64:1 | `#766854` @ 5.07:1 |
| body text `#6B5D4F` | 5.95:1 | 5.95:1 |
| **OKLab dE(comment, body)** | **0.198** | **0.038** |

0.038 is **1.09x the `MIN_DIST` this very change calls "collapsed"** when it happens between two
syntax roles. **26 of 36 palette-modes lost comment-to-body separation; none gained any.** The
ORDERING survived — the comment stayed quieter than the body on every row, which is the check that
made it look safe — and the MARGIN is what vanished. A red team ran exactly that ordering test and
reported "de-emphasis survives"; it was measuring the wrong property.

**And it could not be completed here even in principle.** `editor-theme.ts` also paints
`.cm-gutters` and `.cm-completionDetail` from `--text-muted`, untouched. So lifting only the comment
row left the line numbers at 2.64:1 beside a 5.07:1 comment — **the chrome dimmer than the content
it numbers**, an inverted hierarchy introduced by the repair itself.

The honest scope was already written in §9 before the role was added: repairing `--text-muted` is a
theme-token change, so the gutter, the completion chrome, the docs captions and the comment row move
together. That is what should happen, and it is not this branch. Tracked separately.

**What this episode is really about**, since it is the second time in one change: a defect was found
by measurement, a repair was reached for immediately, and the repair was worse than the defect on the
surface that matters. The first time it was the Anima coercion (§7). Both were caught by an
adversarial pass and not by any gate, because both gates were built to certify the direction the
change was failing in.

### A pre-existing legibility failure, repaired because it is on the path

`--accent` carries no AA guarantee against the canvas — `editor-theme.ts` says so in its own
`caretColor` comment — and the highlighter spent it on four rows (keyword, tagName/heading,
link, plus `t.heading`, the most common token in a Markdown editor). Measured: **mustard/light
`--accent` #8C6A18 reads at 3.89:1** against its own canvas, and burgundy/dark at 4.60:1. One
palette-mode fully below AA, in the editor, on headings.

Nobody had filed it and it is not what this change set out to do, but it is the same surface,
the same rows, and the same recipe repairs it for free: seeding `keyword` from `--accent` and
routing all four accent rows through it fixes those two rows and changes nothing on the other
34, because `solveInk` returns a clearing seed untouched. Fixing it in place is what HARD RULE
#18 asks of a pre-existing defect **on the path** of the change.

## 4. Measured result

216 ink-surface pairs (18 palettes x 2 modes x 3 roles x 2 surfaces):

| | before | raw `--hljs-*` | **this tier** |
|---|---|---|---|
| worst contrast on the editor canvas, string/number | 4.60:1 | **1.01:1** | **4.65:1** |
| string/number rows below AA | 0 of 36 | **21 of 36 palette-modes** | **0 of 36** |
| worst `--accent` on the canvas (keyword/heading/tag/link rows) | **3.89:1** | 3.89:1 | **4.65:1** |
| worst OKLab dE from a neighboring role, **repelled roles only** | **0.0000** (a11y-achromatopsia: number = comment) | — | **0.0350** |
| worst string-to-number separation | 0.1138 | — | 0.0364 |

**Three qualifications, each of which an earlier draft got wrong and a reviewer caught.**

**"worst dE 0.0350 from any neighboring role" is only true of the REPELLED roles.**
`--syntax-keyword-ink` is not repelled, and it is byte-identical to `--text-heading` on **13
palette-modes across seven palettes** (`onyx`, `concrete`, the four `a11y-*`, `atelier`/light) — dE
**0.0000**. That is the palette author's own choice (a monochrome palette taking its ink as its
accent) and is preserved deliberately; but the unqualified sentence shipped in the summary, this
table, a code comment and the changelog, and it was false in all four. The gate never
separation-checks `keyword` at all, which is now stated where the exclusion lives.

**The contrast figures are `--bg-alt`, not `--bg`.** The prose says the editor's canvas is `--bg`,
and it is — but `ChatCodeBlock` sits on `--bg-alt`, which is why the solve targets both. The worst
case is whichever surface is worse, and quoting it without naming the surface reads as inflation.
Editor-canvas-only: `--accent` on mustard/light is **4.35:1** (still the worst accent row);
`--text-muted` on magnolia/light is **2.47:1**.

**0.1138 is concrete/light's number, not cuoio's.** The table row is an honest worst-before /
worst-after pair. An earlier draft turned it into one palette's journey — *"cuoio's separation drops
from 0.1138 to 0.0364"* — and cuoio never had 0.1138 (its `--pass`/`--warn` pair is 0.1320 light,
0.1976 dark). What is true of cuoio: its **authored** `--hljs-string`/`--hljs-number` separation is
0.0292 in both modes, and the tier emits 0.0364 dark / 0.0404 light — slightly WIDER than the
palette's own spacing, because the repulsion pass moved `number`. So the tier reproduces cuoio's
authored spacing rather than the fabrication it replaces, which is the point the paragraph was
reaching for; it just attributed the wrong number to the wrong palette.

0.0364 is 3.6x `checkCatContrast`'s 0.010 collapse floor.

### The coupling demonstrated itself during this change's own rebase

The argument against a status token carrying a syntax role is that two unrelated things drift
together. That stopped being an argument and became a measurement while this branch was being
rebased onto `main`.

#1704 (`theme(contrast): gate the surfaces components compose, and fix what it found`) landed in
between, and retuned `--pass` / `--warn` on six palette-modes: ardesia/light, brina/light,
carbone/light+dark and laguna/light (`--pass`), and magnolia/dark (`--warn`). Under the code this
replaces, that PR — which is about the surfaces components compose and touched no editor and no
syntax anything — would have silently repainted **string and number literals in the Studio's code
editors on six palette-modes**. Nothing would have flagged it, because nothing connected the two.

Re-derived on the rebased tree, the tier's own values were byte-identical: the seeds it reads
(`--hljs-string`, `--hljs-number`, `--accent`) are the ones that should move syntax colors, and
they did not move.

## 5. Gates

- **`checkSyntaxInkContrast`** (tools/check-ownership.js, via `build:check`) **parses the
  committed `docs/src/styles/lattice-tokens.generated.css`** and asserts properties of what is
  in it: AA against each block's own canvas, and OKLab separation from `--text-heading` /
  `--text-body` and from the other tier members. Deliberately not "the committed value equals a
  fresh solve" — `build-landing-tokens --check` already compares the file byte-for-byte, and a
  gate that recomputes with the producer's own function cannot fail for the reason that matters,
  because a solver change moves both sides together.

  **Two corrections an independent checker forced here, and they are the same species: a gate
  claiming more than it did.**

  *It did not read the file.* The first cut called `resolvePalettes()` while its docblock said it
  read the emitted values. A hand-edit to the generated stylesheet was invisible to it. It now
  reads the file, and a hand-edited `--syntax-string-ink:#FFFFFF` on indaco/light is caught
  (`1.00:1, BELOW the 4.5:1 AA floor`).

  *Its floors were the generic ones, so neither advertised bite actually bit.* It reused
  `CAT_TEXT_FLOOR` (4.5) and `CAT_INK_COLLAPSE_DIST` (0.010) while the recipe targets 4.65 and
  `MIN_DIST` 0.035. Measured: dropping `MARGIN` to 0 emitted 4.5005:1 and **passed**; weakening
  `MIN_DIST` to 0.011 emitted 0.0110 and **passed**. Only emptying `SYNTAX_INK_REPELLED` bit. So
  it tolerated a 3.2x weakening of the separation target and the complete removal of the contrast
  margin — while this record claimed both as bites, and quoted an evidence value
  (`#b08a55 … 3.xx:1`) the recipe cannot produce and nobody had observed. Importing the constants
  would have been worse: lower `MIN_DIST` and the gate lowers with it.

  The floors are now **pinned literals** stating what the tier promises — 4.5 absolute AA, 4.6
  for "the recipe's margin is still there", 0.030 separation — and all three mutations bite:

  | mutation | emitted | gate |
  |---|---|---|
  | `MARGIN` 0.15 → 0 | indaco/light string 4.51:1 on `--bg-alt` | **RED** — "above AA but the recipe's margin is gone" |
  | `MIN_DIST` 0.035 → 0.020 | cuoio/light string↔number dE 0.0214 | **RED** — "under the 0.03 the repulsion pass exists to hold" |
  | hand-edit the generated CSS | indaco/light string #FFFFFF | **RED** — "1.00:1, BELOW the 4.5:1 AA floor" |

  `build-landing-tokens --check` passes in the first two cases, which is the point of having both.

  **Where the 0.030 floor actually starts biting, measured rather than assumed.** Regenerating at
  each value: `MIN_DIST` 0.034 → emitted 0.0344, GREEN. 0.031 → 0.0315, GREEN. 0.029 → 0.0292, RED.
  So a reduction anywhere in `[0.030, 0.035)` is invisible — a ~14% weakening of the separation
  target passes, against the 3.2x hole this replaced. That is a real improvement and an honest
  remaining gap, stated here rather than left for the next reader to discover.

  **It never separation-checks `keyword` at all.** That role is not repelled (it is `--accent` made
  legible, byte-identical to `--text-heading` on 13 palette-modes by the palette's own choice), so
  the loop skips it — and a keyword ink that collided with `--text-body` would go unflagged. None
  does today; the surface is unguarded and says so.

  It also **fails closed on an operand it cannot parse.** The first cut hex-guarded the ink but
  handed `--bg` / `--bg-alt` / the text roles to `catContrast` unchecked — and `catContrast`
  returns `NaN` on a value it cannot read, with `NaN < 4.5` evaluating to `false`. An unparseable
  canvas would have made the gate pass while measuring nothing. The generated file already
  carries `color-mix(...)` values for other token families, so that is a live shape.

- **`checkHljsContrast` is untouched.** It holds `--hljs-*` to AA against `--code-bg`, and
  extending it to a second surface would fail values that are correct for the panel they are
  tuned for. Two surfaces, two floors.
- **`syntax-highlight-parity.test.ts`** pins the two highlighters together per role. They
  have already drifted once: `tokenColor`'s propertyName row read `var(--chart-2)` — the
  NUMBER color — while its own comment claimed parity with the editor's `--text-heading`.
  It also asserts no syntax row reads `--pass`/`--warn` again, that `t.invalid` deliberately
  KEEPS `--fail` (invalid input is exactly what a status token names), and that every color
  on both surfaces is a bare `var(--token)` with no literal fallback — the construction that
  hid this whole class.

## 6. Verification (HARD RULE #23)

**The real built Studio, and the first attempt was pointed at the wrong surface.**
`studioHighlight` does NOT render in the deck editor: `Editor.tsx` composes `markdown()` +
`editorTheme` and no `syntaxHighlighting(...)` extension at all, so the deck source is
unhighlighted — its `.cm-line`s carry bare text nodes and **zero** token spans. The one live
consumer is `CodeField` (CodeField.tsx:69), reached at **Craft → Fabricate → Component →
"Component CSS"**. A run pointed at the deck editor measures nothing and reports a pass,
which is exactly what the first run would have done had it not asserted a span count first.

`astro preview` over the real build, real Chromium, the real topbar Theme MENU
(`role="menuitem"`, real `page.mouse.click`) and the real dark-mode button —
`tools/verify-studio-syntax.js`. For all 36 palette-modes it types a CSS probe into the real
CodeField and compares each value to that palette-mode's own emitted token value, parsed out of
the committed `lattice-tokens.generated.css` rather than recomputed.

**The counts, stated the way the run actually splits them**, because an earlier draft of this
record said "216 equality comparisons of computed span colors" and that was two things merged: of
the 216, 108 compared the *document's own custom-property values* to the file and involved no
rendered element at all, and one of the three rendered roles was the comment row, which at that
point was not part of the tier. Only 72 measured a tier ink on a painted span. **Worse, the
keyword ink had no rendered assertion at all** — the change's headline repair (mustard/light
3.89 → 4.65) was verified as a CSS variable and never as a pixel. The run now asserts four
rendered roles (string, number, **keyword** via the `section` tagName, and comment) plus four
declared tokens, reports the two totals separately, and `--bite` flips **every** role rather than
one, so a predicate that silently matches no element cannot pass.

Four traps it hit, each of which would have produced a green run that measured nothing:

- **The `aria-label="Theme"` button is ambiguous three ways** — the topbar palette menu, Fabricate's
  own "Theme" TAB, and the pre-paint skeleton's decoy that opens nothing. Trying each in turn
  clicked Fabricate's tab on the way, which navigates OFF the Component panel and destroys the
  field being measured; the run then failed on the *next* palette with a misleading "decoy"
  message. Now picked by position (topbar only) and cached.
- **The menu shows DISPLAY names**: `a11y-deuteranopia` is listed as "Deuteranopia". An exact-id
  match found nothing for all four, and the run reported "no menuitem for it" — which would have
  left the one group whose seed choice this change is really about UNVERIFIED.
- **CSS lexes `42px` as ONE token.** Looking for the span whose text is exactly `42` found nothing.
- **3-digit hex.** `--text-heading` is `#000` on the a11y palettes and `--bg` is `#fff`; a
  6-digit-only parser fails the comparison, not the product.

**The harness is COMMITTED**, as `tools/verify-studio-syntax.js`, rather than left in `.scratch/`.
It is the third attempt at this surface and the first that works; the four traps above are not
guessable, and catalogued tooling is exactly what `engineering/capabilities.md` exists for (HARD
RULE #15). The full loop is in its header: build the docs, `astro preview`, run it.

**Bitten.** `--bite` flips the expected value for every role on one palette-mode and the run fails
on exactly those pairs, so the passes are not vacuous.

**Two holes in the harness itself, found by a red team and closed.** `--only <a-name-that-is-not-a-
palette>` filtered the palette list to empty, skipped the whole loop, and printed
`PASS … (0 comparisons)` with exit 0 — because the anti-vacuous floor had been scoped to full runs
precisely so subset runs would stop printing FAIL. A typo was indistinguishable from a green run.
And bare `--only` with no argument crashed at module load. Now: zero comparisons is always a
failure whatever was asked for; an unknown palette name is an error rather than a silent empty set;
and the full-run floor is DERIVED from what the run intends to compare rather than hardcoded — the
old literal 200 was 93% of the then-expected 216 and silently decayed to 69% when the count grew. Screenshots of the real field for all 36
palette-modes are in the PR.

**NOT verified on the DEPLOYED docs preview.** The PR's Cloudflare Pages deployment is a
different surface from a local `astro preview` — same bundle, different host, real CDN — and
running the harness against it would be strictly better evidence. Chromium cannot reach it from
this sandbox: the request dies with `net::ERR_CONNECTION_RESET` even with `--proxy-server` set to
the agent proxy and the CA bundle trusted, though `curl` through the same proxy gets a 200. So
that surface is **UNVERIFIED**, and the 252 comparisons are against the real built site served
locally. Stated rather than blurred — "couldn't reach it" is not "tested it".

**The hostile sweep is COMMITTED**, as `test/unit/palette/syntax-ink.test.js`. It runs 20,000
random palettes (canvas pair, seeds and fixed roles all random, fixed LCG seed so a failure
reproduces) and asserts the contract: every role returns a hex, every unreported role clears AA on
both surfaces, and every repelled role sits at least `MIN_DIST` from every fixed role and sibling.
It also asserts the sweep is not vacuous — that most palettes actually solved, and that the failure
arms were reached at least once.

An earlier draft of this record quoted "a 60,000-palette hostile sweep" run by hand, with no
committed script. An inversion pass named that correctly: an unverifiable number carrying a
load-bearing claim. Committing it also repairs a dangling citation — `deriveSyntaxInks`'s docblock
already pointed at `test/unit/palette/syntax-ink.test.js` as the evidence its `exhausted` arm is
unreachable, **and that file did not exist**. Three separate reviewers found it, in a change whose
entire subject is references to things that are not there.

The sweep is bitten three ways: emptying `SYNTAX_INK_REPELLED` fails the separation arm, dropping
`MARGIN` fails the AA arm, and adding a fourth role fails a drift guard. That last one exists
because the test pins its own expectation of which roles are repelled as a LITERAL rather than
importing the producer's constant — the first cut imported it, so emptying that constant emptied
the test's loop too and the mutation ran green. That is the same self-referential trap a checker
had just caught in `checkSyntaxInkContrast`, reproduced one file over.

`npm run lint`, `npm test`, the docs suite, `npm run build:check` and `cd docs && npm run typecheck`
all pass. **`typecheck` is on that list because it was missing from an earlier draft and was RED**:
a type assertion in a new test did not compile, and `typecheck` is a blocking CI step this change
touched TypeScript in. A gate list that omits the one gate a change is most likely to break is not
a gate list.

## 7. The Anima half — a prompt that taught a token the engine does not declare

`architect.ts` told models `Colors MUST be palette tokens — "var(--accent)", "var(--cat-2-mark)",
"var(--text)", "var(--cat-1-mark)"`. **`--text` does not exist** — the engine has `--text-body` and
`--text-heading`. The prompt was a hand-copied sample of nothing, so no gate could see it.

**What shipped:** `SCENE_COLOR_TOKENS` in `docs/src/lib/anima/scene-palette.ts` — the recommended
scene palette (`--accent`, `--accent-soft`, `--on-accent`, the three text roles, `--border`, the
twelve `--cat-N-mark`; `--bg`/`--bg-alt` deliberately absent, since a part in the canvas color is an
invisible part). **The prompt is generated from it**, and `checkAnimaColorVocabulary` asserts every
entry is declared in the ENGINE's own CSS — `lib/**.css` / `dist/**.css`, narrower than
`checkDanglingTokenReads`, which accepts a token declared anywhere it looked including `docs/src`.
A docs-only token does not resolve inside a slide. Bitten by adding `var(--text)` back.

### What was tried, shipped for a while, and then REVERTED — and why that is the finding

An earlier cut also made `validateColor` enforce the list: an off-vocabulary color was dropped
(coerced) and reported on a new `warnings` channel, on the reasoning that an undeclared custom
property is invalid at computed-value time, so the part "renders with no color at all" and dropping
it is strictly better than shipping an invisible part.

**The premise was wrong, and an independent checker demonstrated it in real Chromium.** `color` and
`fill` are INHERITED properties, so a declaration that is invalid at computed-value time falls back
to the *inherited* value — not to "no color". And this repo never even lets the browser decide:
`backends/paint.ts`'s `resolveColor` sets `probe.style.color = el.color` on a span parented to the
host and reads `getComputedStyle`, so `var(--text)` resolved to the host's own text color. A phantom
scene color was **wrong, never invisible.**

That inverts the trade. The list is a *recommendation*, so enforcing it punishes correct scenes:
`var(--fail)`, `var(--chart-cat1)`, `var(--cat-3-ink)` and `var(--code-bg)` are all real engine
tokens that render correctly and are not on it. Measured, the coercion turned a correct red part
into flat `#888888`. **That is a regression the change itself introduced**, on the strength of a
premise nobody had tested — so it is reverted rather than filed (HARD RULE #18).

Reverting it bought three things beyond removing the regression:

1. **`schema.ts` and `vocabulary.ts` are byte-identical to `main`**, so `lib/export/anima-player-bundle.generated.mjs`,
   `docs/src/playground/player-core.generated.js` and `dist/lattice-emulator.js` are too — verified.
   **This change alters no exported bytes**, and the owner sign-off the QUALITY BAR would have
   required for it does not apply. The earlier cut had reached the exported HTML player.
2. It removed a second, quieter export-path risk: the same cut had stopped accepting the
   `var(--x, var(--y))` fallback form, which would have rejected an already-exported scene using it.
3. The list moved to its own module. `vocabulary.ts` opens *"the CLOSED vocabulary … Closed by
   design"*, and housing a recommendation there is a category error — and it also kept the array out
   of the module graph the exported player bundles, which is what makes (1) hold.

A real existence check is still worth having. It has to be sourced from the ENGINE's declared tokens
rather than a curated palette, and because `parseScene` runs on the export path (`hydrate.ts`'s
`decodeSpec` re-validates the embedded spec at playback, leaving the poster frame standing on
failure), getting that population wrong downgrades an already-exported deck. That is a generated
engine-token list plus its own staleness gate, and it does not belong in the same change as this
one.

## 8. Item 3 — should the dangling-token gate cover engine CSS? Triaged, and DEFERRED with a reason

The brief asked for five engine-CSS token reads to be triaged before any gate was built. They
were, exhaustively (writers searched via `setProperty`, template-literal `--${…}` emitters,
string concatenation, inline `style=` in every transformer directory, and `git log -S` history):

| token | verdict | writer |
|---|---|---|
| `--stat-emphasis` | RUNTIME-SET | `lib/engine/css.js:469` + `lib/runtime/index.js:2102`, portrait/square only — and the reads are co-gated on `[data-orientation]` |
| `--safe-bottom` | RUNTIME-SET | same mirrored pair, `css.js:460` / `index.js:2099` |
| `--lat-split-offset` | RUNTIME-SET | `lib/core/auto-split.js:252-255`, spliced into a per-section inline `style` |
| `--fin-backdrop-mask-opaque` | RUNTIME-SET | `finish-generate.ts:630,633` as generated CSS text; no built-in preset writes it, and the `none` fallback is the correct un-masked rendering |
| **`--ink`** | **PHANTOM-WITH-FALLBACK** | **none, anywhere, ever** — `git log -S"--ink:" -- lib themes` is empty |

`--ink` is real. It is read four times in `lib/base/base.finish.css` (598, 604, 692, 698) as
`var(--ink, var(--accent))` inside the `finish-halo` and `finish-nimbus` vignette rims, whose
own comment says the intent is a neutral text-colored rim. The fallback always wins, so the rim
ships in the BRAND hue and lands in the same hue family as the wash it is meant to seat.
`finish-generate.ts:461-462` bakes the same read into every Studio-fabricated finish, and
`examples/finish-override.md` teaches the pattern.

**So the gate is worth building — and it is not in this PR, on purpose.** The gate cannot land
green while `--ink` is unfixed, and fixing `--ink` means changing engine CSS for two finish
presets, the Studio's finish generator, and a committed example PDF — a finish-preset visual
change on a different surface, needing its own visual review. That is HARD RULE #17 (one
feature, one branch) and #8 (isolation), so it is filed rather than pulled in. Sanctioning a
known defect to get a new gate green is the "third exit meaning ship it broken" the
no-safe-default record warns against, and it is not taken here. Filed as **#1715**, with the
triage table, the gate design and the sequencing trap written up there.

The design is already settled for whoever picks it up: `fallbackHops()`
(tools/check-ownership.js:7700) is the one scanner that enumerates every `var(--a, var(--b))`
chain in `lib/` with **no** `themeTokens` restriction, so it is the only arm that can see a
token no palette declares — which is exactly why `--ink` is invisible to
`checkNoSafeDefaultTokens` (`fallbackOnlyTokens` opens with
`if (!themeTokens.has(token) …) continue;`). "Declared-or-runtime-set" is mechanizable there:
`declaredCustomProps` already recognizes both a `--x:` declaration in a JS/TS template literal
and a `setProperty('--x'` call, which is precisely how all four legitimate writers above were
found. On today's tree such a gate reports exactly one token.

Note for that work: `--ink` already appears in `KNOWN_CONTRACT_DROPS`
(tools/check-ownership.js:7660) as `'--ink → --accent'`, and that ledger **fails on stale
entries** — so the row must be deleted in the same change as the fix.

## 9. What the adversarial trio changed (HARD RULE #25)

A checker ran on `02fe7a1` and changed the outcome. Then a red team, a Munger inversion and a second
checker ran on what would actually ship — which by then differed substantially from what the first
checker had seen — and changed it again, more.

**The inversion found the one thing that would have shipped worse than `main`:** the `muted` role,
above. Nothing else in the branch made any surface worse; that did, on the default palette, and its
defense was contradicted by the branch's own generated output.

**The red team found four real holes**, all in code written after the first checker: the `--only`
typo printing PASS on zero comparisons; a non-hex seed taking down the whole docs-token build with
`not a hex color: …` naming nothing (the exact failure `lib/theme/cat-ink.js` documents as the
reason for its own null-check); `checkAnimaColorVocabulary` bypassed by a spread or a template
literal — which would admit this change's own docs-only tier into the scene vocabulary, the #1688
defect returning through the gate written to stop it; and the same gate false-firing on a
commented-out entry, so recording *"we tried `var(--text)`, see #1688"* where the rejection lives
would break the build. All four are fixed and bitten.

**The second checker verified the first round's fixes actually held** — each re-run rather than
read, including a full real-surface run of its own — and then found that four load-bearing numbers
in this record were wrong: the unqualified dE claim, the 0.1138 attribution, "five palettes", and
`#000000`/`#FFFFFF`. All corrected in §3 and §4. It also caught **five new British spellings** this
branch had added while presenting its budget drop as a ratchet win (HARD RULE #21); the branch now
introduces zero, and the budget is pinned to the true count with no slack, as that constant's own
comment requires.

**Where two lenses disagreed, and how it was settled.** The red team explicitly tested the `muted`
role's de-emphasis and reported it survived; the inversion reported it destroyed. Both measurements
were correct and they tested different properties — the red team asked whether the comment is still
QUIETER than body text (it is, on every row), the inversion asked how big the gap is (it collapsed
from 0.198 to 0.038). The ordering test is the weaker one for a hierarchy question. Re-measured
independently before deciding, and the gutter inversion — chrome dimmer than the content it numbers —
settled it, since no ordering check on the comment row would ever surface that.

**The pattern across all four passes, worth naming because it repeats:** every blocking finding was
*a claim the code did not make good on* — a gate whose docblock described a stricter gate than the
one written, a bite that did not bite, a citation to a file that was not there, a number measured on
a different surface than the sentence around it, a premise about CSS that real Chromium refuted. Not
one was a logic bug in the solver, which four passes tried hard to break and could not.

**Process note, recorded rather than tidied away:** the first round's findings were folded in as an
amend after the work had been committed locally, rather than before. The rung says fold back, then
commit. The branch was not pushed until they had.

## 10. What this does NOT fix

- **`--text-muted` is sub-AA on 44 of 72 palette-mode-surface pairs**, worst 2.11:1 — so comments
  and punctuation in all three editors, the CodeMirror gutter, the completion detail and the docs
  chrome are all still hard to read on several palettes. This branch tried to repair the two syntax
  rows and reverted it (§3): on a one-lever solve the repair costs the comment-to-body separation,
  and repairing only the syntax rows leaves the gutter dimmer than the comment beside it. The fix is
  the token, so everything that uses it moves together. **This is the largest thing left undone**, it
  is bigger than this branch, and it is the honest scope.
- **The `a11y-*` palettes still inherit `onyx`'s red-green syntax family for their SLIDE code
  panels.** This change routes the EDITOR around it; a deck on `a11y-deuteranopia` still renders a
  code block with green strings and yellow-green numbers.
- **`--ink`**, filed as #1715.
- **On the four `a11y-*` palettes the tier's emitted values ARE `--pass`/`--warn`**, byte-identical,
  because that is what they seed from. So "retuning the status trio no longer repaints code" is true
  of the 14 hued palettes and FALSE of those four — the coupling is relocated there, not removed,
  and `syntax-highlight-parity.test.ts` asserting the token NAME is absent does not establish
  otherwise. The seeding is still right (that pair is the accessible one), but the decoupling claim
  needs the qualifier.
- **The deck editor has no syntax highlighting at all.** `Editor.tsx` carries `markdown()` and
  `editorTheme` but no `syntaxHighlighting(...)`. Pre-existing; whether it should is a design call.
- **`t.variableName` / `t.className` / `t.typeName` share `--text-body` with plain text.** A
  defensible theme choice; a fourth role would tighten the separation budget for a cosmetic gain.
- **The `avoid` constraint is inert on all 18 shipped palettes** — regenerating with `avoid: []`
  produces a byte-identical sheet. Every collision the tier resolves today is ink-vs-ink. The guard
  is kept for a future palette; it is unexercised and the code says so.
- **`dist/lattice-emulator.js` is not byte-reproducible from a clean checkout** — 394 characters of
  6.8M, all minified identifier renames in vendored code, identical length. Reproduced with this
  change stashed, so it is not caused here; invisible to `build:check`; recorded because the next
  person trying to prove an export claim will hit it.
- **The deployed Cloudflare preview is UNVERIFIED.** Chromium cannot reach it from this sandbox
  (`ERR_CONNECTION_RESET` through the agent proxy, where `curl` gets a 200). The 252 comparisons are
  against the real built site served locally.
