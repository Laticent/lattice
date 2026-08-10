---
status: shipped
summary: >
  A Studio-generated theme painted solid black Mermaid subgraph boxes and lost the
  canvas of every dark/divider slide in the real export, because lib/theme/derive.js's
  REQUIRED_TOKENS omitted tokens the engine reads with NO SAFE DEFAULT — no :root
  default in the base layer and no var() fallback at the read — and no gate could see
  it, since every theme gate scans themes/ and a generated theme never lands there.
  Fixed by deriving the three missing families (12 --cat-N-ink, 6 --c-* containment,
  --spectrum/-vertical/-end; 83 → 104 tokens) and, more importantly, by replacing the
  hand-kept list with a COMPUTED obligation: checkNoSafeDefaultTokens derives the set
  from the shipped palettes' vocabulary, the engine's :root declarations, and the
  fallback-free reads in lib/**, so the next such token is caught by the machine. The
  ink solve moved out of tools/derive-cat-ink.js into lib/theme/cat-ink.js and is now
  shared, with the failure policy as the caller's parameter: the committed generator
  throws, the browser-facing one degrades and reports. Two corrections to #1457's own
  numbers, both measured: the ink arm IS a shipping contrast defect for generated
  themes — sampling 200 essential sets per ramp strategy, 23-34 of 200 carry a sub-AA
  label under the four hue-spread ramps and 176 of 200 under brand-mono, worst 2.99:1;
  the fact-check that found "zero" measured only the four curated starters at the
  default ramp — and the
  spectrum arm is WORSE than the black box it was filed behind — a missing --spectrum
  invalidates the whole `background:` shorthand it rides in, so a divider slide
  rendered white-on-white, 1.0:1.
---

# No safe default — the generator's contract, computed instead of remembered

**#1457.** Found while reproducing #1450; filed rather than fixed there because it
was off that PR's path (HARD RULE #18).

## 1. What actually shipped, on the real export path

Generated a theme exactly as the Studio does — `deriveTheme(essentials)` →
`serializeTheme()` — dropped it in `themes/`, and rendered committed decks through
`node lattice-emulator.js` to PNG in Chromium 131. Two distinct failures, one of
which was not in the issue.

**The black box (as filed).** `examples/containment-tier.md`, 8 slides:

| | slides with a large near-black area | black pixels |
|---|---|---|
| indaco (hand-authored) | 0 of 8 | 0 |
| Studio-shaped theme | **5 of 8** | **2,853,031** |

Up to 23.9% of a slide is a solid black box with its own labels rendered dark-on-black.
The mechanism is documented in the module that causes it: `lattice-emulator.js`'s
`readPaletteToken` warns and returns `#000000` on a miss, and the directive kernel's
`prune()` drops only empty strings — **so the sentinel ships**. `MERMAID_VAR_MAP` points
`clusterBkg` at `--c-container` and `clusterBorder` at `--c-container-edge`, neither of
which the generator emitted.

**The lost canvas (new, and worse).** `--spectrum` is read bare *inside a `background:`
shorthand* — `section.dark { background: var(--spectrum) top / 100% 1px no-repeat,
var(--bg); }`, and the divider's left rail likewise. An undefined custom property makes
the whole declaration **invalid at computed-value time**, so the property falls to its
initial value: `transparent`. It does not fall back to the earlier `section` rule.

Sampled from the render: a `_class: dark` slide came out `#FFFFFF` where indaco is
`#001D33`, and a divider slide came out white with its near-white display headline on
top of it — **1.0:1, an invisible slide**. Losing the canvas is a larger defect than
losing the ribbon, and it was riding underneath the box everyone was looking at.

## 2. Two corrections to the issue's own numbers

Both measured; both change how the work is sized.

**The ink arm is a real contrast defect for generated themes.** The fact-check on #1457
refuted this, and it was right about what it measured and wrong about the population.
It swept the four shipped starters at the default ramp and found zero sub-AA slots
(worst 5.86:1). Sweeping the same starters across **all five ramp strategies** the AI
can pick already finds one (pine/`brand-mono`, 4.47:1). Sampling 200 essential sets per
strategy — measuring what `var(--cat-N-ink, var(--cat-N-mark))` resolves to when a theme
omits the tier — finds this:

| ramp strategy | themes with ≥1 sub-AA label | worst | with the tier |
|---|---|---|---|
| `spectrum` | 34 of 200 | 3.95:1 | **0 of 200** |
| `analogous` | 23 of 200 | 4.00:1 | **0 of 200** |
| `triad` | 33 of 200 | 3.94:1 | **0 of 200** |
| `complementary` | 34 of 200 | 3.95:1 | **0 of 200** |
| **`brand-mono`** | **176 of 200** | **2.99:1** | **0 of 200** |

The reason is structural, not statistical: `deriveTheme` repairs `--cat-N-mark` to
`AA_LARGE` — the 3:1 **graphical** floor, correct for a bar or a node — and the fallback
then paints that value as **label text**, which needs 4.5:1. `brand-mono` is far worse
than the rest because a single-hue cycle separates by lightness, so most slots land in
the same band and fail together. With the tier, every strategy is clean at 4.65:1 (the
solver's AA + 0.15 margin).

**The sampler, because a figure nobody can re-run is not evidence.** An earlier draft of
this record cited a single mixed-strategy number (63 of 200) with the sampler left in a
scratch directory; an independent sweep with a different distribution measured 4 of 200
and could not reconcile. The distribution is the whole difference — the spread between
`--bg` and `--bg-alt` moves the figure from 31 to 63 on its own, and the strategy mix
moves it far more. So it is written down:

```js
let seed = 42; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const h = rnd() * 360, bgL = 0.9 + rnd() * 0.09;
const e = {
  bg:          oklchToHex({ L: bgL,                      C: 0.005, h }),
  bgAlt:       oklchToHex({ L: bgL - 0.03 - rnd() * 0.06, C: 0.01,  h }),
  textHeading: oklchToHex({ L: 0.15 + rnd() * 0.1,       C: 0.02,  h }),
  textBody:    oklchToHex({ L: 0.35 + rnd() * 0.1,       C: 0.02,  h }),
  textMuted:   oklchToHex({ L: 0.6,                      C: 0.02,  h }),
  accent:      oklchToHex({ L: 0.35 + rnd() * 0.3,       C: 0.1 + rnd() * 0.08, h }),
  accentSoft:  oklchToHex({ L: 0.92,                     C: 0.03,  h }),
  pass: '#1F7A4D', warn: '#B26A00', fail: '#C0392B',
};
// 200 iterations per strategy; a theme counts once if ANY of
// 12 slots x {light,dark} x {--bg,--bg-alt} falls below 4.5:1.
```

So the ink tier is not merely a contract gap. It is a fallback that degrades onto the
wrong floor, and on one of the five ramps the AI can pick it does so on 88% of themes.

**The `--spectrum` family is two tokens, not one.** The issue named `--spectrum`. The
computed gate (below) also names `--spectrum-vertical`, read bare at
`base.variants.css:161`. This is the first thing the gate bought: the hand-written list
was one short before it was even written down.

## 3. The class, and why no gate could see it

`REQUIRED_TOKENS` is what the Studio's generator promises to emit. It shipped 21 tokens
short, and every theme gate in `tools/check-ownership.js` was blind to it for one
structural reason: **they all scan `themes/`**, and a generated theme never lands there.
It lands in a browser, in an asset bundle, in someone's export.

The three families, and what a miss does:

| Family | Engine `:root` default | Fallback at the read | What a miss does |
|---|---|---|---|
| 6 × `--c-*` containment | none anywhere | none | black sentinel, shipped |
| `--spectrum`, `--spectrum-vertical` | none at `:root` (only `section.print` / the `spectrum-*` variants, both conditional) | none | the whole `background:` declaration is dropped |
| 12 × `--cat-N-ink` | none, **deliberately** (`base.tokens.css`) | `var(--cat-N-ink, var(--cat-N-mark))`, gated by `checkCatInkFallback` | degrades onto the 3:1 graphical floor |

The `--cat-N-ink` row is worth stating precisely, because the issue's phrasing ("no safe
default") reads as "resolves to nothing" and that is not accurate. The absent `:root`
default is deliberate and documented: the export bundle concatenates the theme *before*
`base.tokens.css`, so a base default would win on equal specificity and silently revert
every curated ink to its mark on the PDF path. The fallback lives at each consumer
instead, which is order-independent and correct. That family therefore **degrades**
rather than breaking — and it degrades onto the wrong contrast floor, which is why it is
in the contract now regardless.

## 4. What shipped

**(a) The three families are derived.** 83 → **104** tokens.

- `--cat-N-ink` — solved by the shared recipe, per mode, against that mode's own
  `--bg`/`--bg-alt`.
- `--c-*` — two structural rungs stepping **away** from the canvas, brand-hue-tinted at
  C=0.012, each with an edge repaired to 3:1 on its own fill and a label ink repaired to
  4.5:1. The ladder's direction is decided from the canvas and then **checked against
  relative luminance**, not assumed from OKLCH lightness: the gate that governs the tier
  (`containment-contrast.test.js`) asserts on luminance, and the two can disagree by a
  hair when the canvas is chromatic and the rung is not.
- `--spectrum` / `--spectrum-vertical` / `--spectrum-end` — a three-stop ribbon whose
  endpoint hue comes from the **same ramp strategy** as the categorical cycle, so a
  `brand-mono` theme gets a single-hue ribbon instead of a rainbow contradicting the
  rest of it.

Measured across every starter × every ramp strategy (40 themes, both modes): worst
containment ink **10.69:1** (floor 4.5), worst edge **3.38:1** (floor 3.0), ladder
failures **0**, worst `--cat-N-ink` on canvas **4.68:1** (floor 4.5).

**(b) The ink solve is shared, not copied.** `solveInk` / `feasibleRange` /
`armCollapsed` / `separateArm` moved from `tools/derive-cat-ink.js` into
`lib/theme/cat-ink.js` (pure, fs-free, browser-bundlable). #1457 proposed *porting* them
into `derive.js`; copying 150 lines of two-pole OKLCH search into a second caller is
what HARD RULE #1 exists to stop. The tool re-exports `solveInk` so its tests keep their
import path, and `derive-cat-ink --check` reports all 15 palettes byte-identical after
the move — the refactor is provably inert.

**(c) The open risk is settled: it degrades, it does not throw.** #1457 flagged this as
an owner call — the anti-collapse guard has two throwing paths, and porting them would
give `deriveTheme` a browser-facing throw driven by a user's ramp choice. The failure
policy is now the **caller's parameter**, the same seam `lib/core/mermaid-theme-map.js`
already documents for its token reader:

- `strict: true` — the committed generator. It writes tracked source, so an unsolvable
  palette must throw and name the theme, the slot and the two surfaces. Unchanged.
- `strict: false` — the Studio. It runs in a browser on a color a user just picked, and
  `deriveTheme` has never thrown for a valid essential set. An unsolvable slot degrades
  to its most legible available shade and is recorded in `degraded[]`; an arm that runs
  out of axis parks the slot at the pole rather than aborting the theme.

A modal stack trace mid-edit is a worse answer than a best-effort ink the audit can
report. The guarantee `bestEffortInk` carries is deliberately modest and stated as such:
it never returns something **worse** than the mark it replaces. On a straddling canvas
pair (`--bg` near-white, `--bg-alt` near-black) there is no good answer — every
candidate fails one surface — and sometimes the mark itself is the best compromise.

**(d) The gate computes the obligation.** `checkNoSafeDefaultTokens`:

> a token **shipped palettes declare at `:root`** (so it is part of the theme
> vocabulary), that **the engine gives no default the reader can reach**, and that
> **`lib/**` reads with no `var()` fallback** — counting the Mermaid map, whose
> `readToken` has no fallback parameter at all — **must be in `REQUIRED_TOKENS`**.

Run against the pre-fix contract it names exactly the 8 tokens that broke the render;
against the current one, nothing. `--cat-N-ink` is correctly absent from its findings,
because every read carries a fallback — which is the mechanism, not an exception.

**"A default the reader can reach" is per-reader, and collapsing that produces a false
positive the engine's own comment invites.** The first cut counted only `:root`
declarations. But the engine defaults `--spectrum-quiet` on the bare `section` slide
root, and `base.variants.css` says in as many words that *"a theme may override
`--spectrum-quiet`"* — so the moment a palette accepted that invitation, the token would
enter the theme vocabulary with no `:root` default and a bare read, and the gate would
demand a contract row for a token that IS defaulted. Neither of its two exits would be
correct. So the model is split by reader: a CSS `var()` read is satisfied by `:root` OR
by the bare `section` (every slide is one, and slide content inherits from it); a
**Mermaid map** read is satisfied only by `:root`, because that reader is not CSS — the
export path's `parsePaletteVars` scans `:root` blocks out of the palette *text* and
cannot see a `section` rule at all. 153 tokens in `lib/**` sit in the state that would
otherwise have been latent false positives.

**There is deliberately no allowlist.** Every other gate in that file has one because
its rule admits justified exceptions; this one does not, because a token it catches has
two honest exits and both are cheap: derive it, or give the read its fallback. An
allowlist here would be a third exit meaning "ship it broken." That stance only holds
while the *default model* is right, though — the `--spectrum-quiet` case above is
exactly how a no-allowlist gate rots: the first legitimate false positive forces a wrong
contract row or an allowlist added under pressure.

Three noise sources the gate has to *not* fire on, and the filter that handles each:
per-element locals the transformers write as inline style (`--actor-color`, `--pct`,
`--series-color`) are read bare and defaulted nowhere, but no palette declares them, so
the theme-vocabulary filter drops them; `--fs-*` likewise; and a *conditional* root
(`:root.print`) is not a default, which `isUnconditionalRoot` distinguishes from the
`:root:root` specificity pin and the `:where(:root)` zero-specificity default that both
are.

**It fails loud on an empty scan.** Every input is an intersection term, so any one of
them coming back empty makes the gate silently report clean — a gate that is also a
claim. A regex change or a moved directory now reads as broken rather than green.

## 5. Verification (HARD RULE #23)

Real surface, real artifact, same command as the reproduction — but TWO decks, because
they show different halves. `examples/containment-tier.md` is a committed deck and it
carries the black box; it has **no divider slide**, so the lost-canvas half is measured
on a purpose-built three-slide probe (a default slide, a `_class: dark` slide, a
`divider`) rendered through the same CLI.

| deck | | before | after |
|---|---|---|---|
| `examples/containment-tier.md` | black px | 2,853,031 across 5 of 8 slides | **0 across 0 of 8** |
| `examples/containment-tier.md` | emulator warnings | `⚠ Palette missing CSS variable: --c-container`, `--c-container-edge` | none |
| divider probe | `_class: dark` canvas | `#FFFFFF` (declaration dropped) | `#141823` |
| divider probe | divider canvas / left rail | `#FFFFFF` / none | `#0B0D13` / the ribbon |

Both renders were also opened and looked at, not merely pixel-counted: the containment
slide shows the two-rung nested ladder with a legible blue edge, and the divider shows
its dark canvas with the vertical ribbon on the left.

An independent checker reproduced both, from its own generated theme, to within 35
pixels of the black-pixel total, and measured the divider headline at **1.02:1 before,
19.11:1 after**.

`npm run lint`, `npm test` (5714), `npm run build:check` and the integration tier all
pass. `derive-cat-ink --check`: 15 palettes up to date.

### What the checker caught, and what it means

An independent checker ran on the diff (maker-checker, HARD RULE #25) and changed the
outcome. Three findings were blocking, and all three are the same species — **a claim
the code did not actually make good on.**

- **Every `file:line` the gate printed was wrong.** `bareVarReads` counted lines against
  comment-*stripped* source, and stripping deletes the comments' newlines too, so each
  number was shifted by the comment volume above it. The correct helper —
  `stripCommentsKeepOffsets`, which blanks comments in place — was already sitting 335
  lines up in the same file (HARD RULE #15, missed). This was not hypothetical damage:
  the wrong number (`base.variants.css:62`, the middle of an unrelated comment) had
  already been copied out of the gate's output into this record before anyone opened
  the file it pointed at.
- **The `:root`-only default model had a false positive built into it** — the
  `--spectrum-quiet` case now written up in §4(d). A gate with no allowlist has to be
  *right*, because there is no relief valve.
- **"It degrades and reports" had no reporter.** `deriveTheme` drops the solver's
  `degraded[]`, and `lib/theme/contrast.js` carried no `--cat-N-ink` pair at all, so the
  whole non-strict policy reported a best-effort ink to nobody. The audit now carries a
  `categorical-ink` row per slot per surface; on a straddling canvas it reports all 12.
- **The headline test bit by 0.03:1.** Mutating the tier away entirely failed it on ONE
  assertion in 960, at 4.47 against a 4.50 floor — one rounding change from vacuous. It
  now runs against the sampled population this record measures on, and asserts that the
  mutant *does* fail, so it cannot quietly stop seeing the defect.

Two more, folded in as corrections rather than fixes: the containment derivation's
step-widening loop **has never fired** in 20,000 random canvases (its comment now says
so instead of selling it as a check), and the anti-collapse guard's "18 of 4224" figures
are true of the shipped palettes and *not* of the derived path — 4 in 2,000 derived
themes keep an ink pair below the collapse floor on a `brand-mono` ramp, which is now
stated in `lib/theme/cat-ink.js` as a known limit of a lightness-only guard rather than
implied away.

The checker also verified what held: 8,000 differential trials proving the extraction
behavior-preserving (including 1,558 that entered `separateArm`), an 8,900-case hostile
sweep of the containment derivation with zero invariant breaks, and an independent
reproduction of the export defect to within 35 pixels.

**Process note, recorded rather than tidied away:** the work was committed while this
review was in flight, under a stop-hook nudge. The rung says fold findings back, *then*
commit. It went in as a follow-up commit instead.

## 6. What this does NOT fix

- **The Studio preview still cannot show this class.** `lib/runtime/index.js` returns the
  empty string on a token miss — deliberately, so a slow webview does not paint a deck
  black — while the export path substitutes the sentinel. So a user importing a
  *third-party* theme that is short a `--c-*` still sees nothing wrong until they export.
  This change removes the Studio as a source of such themes; it does not make the
  preview report one.
- **`serializeTheme` still interpolates `description`/`label` raw into the CSS comment
  header**, and imported asset-bundle theme CSS still reaches the preview verbatim.
  Out of scope here, tracked in #1458.
- **The 95-vs-91 `CONTRACT` drift** between `token-parity.test.js` and
  `theme-scorecard.js` (#1459) is untouched.
