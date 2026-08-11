---
status: proposed
summary: >
  The sign-off package #1527 asked for, and it changes the recommendation. THE FLIP IS STILL NOT
  SHIPPED. Three things are now measured that were not. (1) The full sweep: all 32 themes in both
  modes, before and after, 576 slides per side — every one of the 64 grid states changes at least
  one slide, and 36 of those states are distinct (16 of the 32 theme files are -dark wrappers that
  render identically at a fixed color-mode), so the honest figures are 36 of 36 states and 99
  distinct changed renderings rather than the grid's 64 and 202. Either way "four themes, light
  only" was a wide underestimate of the blast radius.
  (2) THE PREVIEW AND THE EXPORT ALREADY DISAGREE. lib/engine's composeCss inlines the base at the
  theme's own `@import 'lattice'` position, so the Studio, the docs site and the browser playground
  render the PALETTE's value — measured on the real engine, 932 of 932 disputed tokens resolve
  exactly as the flip would and none as the export does. The export is the odd one out of four
  sites, not one of two models; the flip makes preview and export agree rather than swapping which
  is wrong. (3) The flip is NOT purely an activation of better values. Measuring the twelve
  --hljs-* against --code-bg and --pass/--warn/--fail against --bg across 64 theme-modes: 684 of
  960 pairs change ratio, 411 get worse, 11 cross BELOW their floor and 3 cross above. Looking at
  those 11 rather than trusting them corrected the reading — a11y-achromatopsia's dark checklist
  genuinely loses its rails and its icons, while a11y-deuteranopia's "regression" is the palette's
  intended blue encoding finally rendering and staying legible, which says the reference surface
  was wrong for that use, not the palette. What survives is a short, well-scoped repair list that
  must land BEFORE the flip: the four a11y palettes' dark-mode status grays, and cuoio's
  --hljs-literal at 4.05:1.
---

# The concat flip: what a full sign-off sweep says

**#1527.** `2026-08-10-palette-concat-order.md` measured the mechanism and stopped
at the QUALITY BAR gate, listing what a sign-off would need. This is that package.
**The flip is still not in this change.**

## 1. The full sweep — the blast radius is bigger than the sample suggested

A nine-slide deck built from live gallery slides (`divider`, `code`, `roadmap`,
`list takeaway`, `gantt`, `kanban`, `piechart`, `checklist`, `closing accent`),
rendered PNG-per-slide across **all 32 selectable themes × both modes × before and
after** — 576 slides per side, 1,152 renders, compared by SHA-256.

| | |
|---|---|
| theme-modes in the grid | **64** (32 theme files × 2 `color-mode:`) |
| …with at least one changed slide | **64 of 64** |
| changed slide instances | **202 of 576** |
| **DISTINCT** states in that grid | **36** |
| **DISTINCT** changed renderings | **99** |

**The 64 and the 202 double-count, and the distinct figures are the honest ones.**
Sixteen of the 32 theme files are `-dark` wrappers of the other sixteen, and at a
*fixed* `color-mode:` a wrapper renders byte-identically to its parent — verified:
`cuoio-dark` at `color-mode: dark` and `cuoio` at `color-mode: dark` are the same
bytes. So the grid contains 36 distinct states, not 64, and 99 distinct changed
renderings, not 202. The prior draft of this table published only the grid
figures, which overstate the corpus by roughly 2×.

**The conclusion is unchanged and does not depend on the inflation:** all 36
distinct states change. The prior sample was four themes, light only. The worst is
`cuoio` in dark mode (8 of 9 slides); the mildest is `indaco` dark, which still
changes one. **There is no theme this is invisible on**, in either mode.

Which slides change tracks the token families exactly: `code` (the twelve
`--hljs-*`) and `checklist` (`--pass`/`--warn`/`--fail`) change nearly everywhere;
`gantt` and `kanban` (the `--diagram-*` state family) change on the themes that
declare those tokens; `divider`, `takeaway`, `piechart` and `closing` change only
on `cuoio`, the theme with the most dead declarations.

## 2. The preview already renders the flipped order — measured on the real engine

The prior note left this open and said it decides whether the flip makes preview
and export *agree* or merely swaps which one is wrong. **It makes them agree.**

`lib/engine/css.js` `composeCss` builds the preview sheet as

```js
const resolvedTheme = packTheme(stripComments(themeCss).replace(THEME_IMPORT_RE, () => base));
```

— the base is inlined **at the position of the theme's own `@import 'lattice';`**,
which is to say FIRST, with the theme's rules after it. That is the declared
cascade, and it is what the Studio, the docs-site preview and the browser
playground all run on (`lib/playground/index.js` → `engine.render` →
`themes.cssFor`).

Driven on the real engine rather than read off the source: register the base and
every palette, render a slide per theme, and read the disputed tokens off the
rendered `<section>` in Chromium.

| | |
|---|---|
| disputed (dead) tokens across 32 themes | **932** |
| resolving in the preview as the **export** does (base wins) | **0** |
| resolving in the preview as the **flip** would (palette wins) | **932** |

So of the four places that order these two stylesheets, **three already agree with
what the themes declare** — the Mermaid token reader, `engine.addThemes`, and now
the engine's own composed sheet, which is the one users look at — and the export's
injected `${css}` is the only holdout. A `cuoio` deck looks one way in the
Playground and another way in the PDF it exports, today, on all 32 themes.

*Two harness errors are recorded rather than deleted, because both produced a
confident wrong answer first.* Comparing **all** declared tokens rather than only
the disputed ones measured `composeCss`'s scaffold, geometry vars and `:root`→
`section` packing instead of the cascade, and reported ~127 differences per theme.
Then registering only `[base, palette]` left a `-dark` wrapper's `@import 'parent'`
unresolved against an empty store, so all 522 wrapper tokens read as "neither".
Both are the same mistake the prior note names: **measure the way the code loads,
not the way the files sit.**

## 3. The flip is not purely an activation of better values

The prior note's reading — "very likely the right outcome, the palettes were
authored to be seen" — is too generous, and its own §6 said why: *"a palette could
carry a stale declaration that was written against an older base and never
re-checked BECAUSE it was dead."* That is exactly what the measurement finds.

Resolving the twelve `--hljs-*` against `--code-bg` (floor 4.5:1) and
`--pass`/`--warn`/`--fail` against `--bg` (floor 3:1) in real Chromium under each
order, across 64 theme-modes:

| | |
|---|---|
| pairs measured | **960** |
| contrast ratio changes | **684** |
| ratio gets worse (any amount) | **411** |
| crosses **below** its floor after the flip | **11** |
| crosses **above** its floor after the flip | **3** |

The three fixes are `carbone`'s `--pass` (2.69 → 3.26) and `concrete`'s `--warn`
(2.53 → 4.73, both variants). The eleven crossings:

```
a11y-achromatopsia/dark  --pass  12.05 → 2.48      a11y-protanopia/dark  --pass  12.05 → 2.28
a11y-achromatopsia/dark  --fail   7.59 → 1.55      a11y-protanopia/dark  --fail   7.59 → 1.95
a11y-deuteranopia/dark   --pass  12.05 → 2.28      a11y-tritanopia/dark  --fail   7.59 → 1.94
a11y-deuteranopia/dark   --fail   7.59 → 1.95      cuoio · cuoio-dark, both modes
                                                     --hljs-literal 5.68 → 4.05
```

## 4. Looking at the eleven corrected the reading — twice

Numbers are not the sign-off; the QUALITY BAR asks for someone to look. Rendering
the checklist slide before and after for the affected themes splits the eleven into
two genuinely different things.

**CORRECTION (2026-08-11, after the sweep): seven of the eleven crossings are in
a mode those themes declare they do not have.** All five a11y palettes carry
`modes: ["light"]` in their manifests, `a11y-base.css` pins
`:root:root { color-scheme: light }` specifically to beat the global dark toggle,
and `checkThemeModes` is green — so the CSS genuinely provides one face. The sweep
rendered every theme at `color-mode: light` AND `dark`, which for those five is a
configuration the palette does not claim to support. **They are not a flip
blocker**, and the recommendation in §5 is corrected accordingly. What the sweep
did surface is a different, real gap: **nothing prevents `color-mode: dark` on a
light-only theme.** The `:root:root` pin beats the global toggle but not a per-deck
mode, which lands on the section — a11y-base's own comment says the pin cannot
reach there. Nothing warns and no gate covers it. The paragraph below stands as a
description of what that unsupported state looks like; it is no longer a
prerequisite.

**`a11y-achromatopsia` in that unsupported dark mode.** The palette declares flat
grays with no light-dark() pair:

```css
--pass: #4d4d4d;  --warn: #6E6E6E;  --fail: #2e2e2e;
```

Authored for a light canvas. On the dark canvas they are 2.48:1 and 1.55:1, and the
rendered slide shows it: the green/amber row rails vanish and the state icons go
to near-invisible gray on near-black. The base's `light-dark(#2D6A3F, #4ADE80)` has
been masking that defect on the export path for the whole life of the palette.

**`a11y-deuteranopia` dark is NOT a regression, and the measurement's reference
surface is what is wrong.** Its "after" swaps the green check for a **blue** one —
which is the entire point of a deuteranopia palette, and the encoding its author
wrote — and the icon stays perfectly legible in the render. The measured drop is
against `--bg`, but the icon is not painted on the bare canvas at that use site. So
for the deuteranopia/protanopia/tritanopia rows the number is measuring the wrong
pair. **Their row tints do disappear, which is a smaller and separate question.**

That correction only came from opening the image. A sign-off that had stopped at
"11 regressions" would have blocked the flip for the wrong reason, and one that had
stopped at "the palettes were authored to be seen" would have shipped an unreadable
achromatopsia deck.

**`cuoio`'s `--hljs-literal` at 4.05:1 is a plain AA miss** and the reference is
right: it is code text on `--code-bg`. It is a defect in cuoio, revealed rather
than caused.

## 5. Where this leaves the decision

**The flip is the right direction and it is not ready to ship as one line.** It
restores the cascade the themes declare, it makes the export agree with the three
other sites including the one users look at, and it turns on curated work nobody
has seen. It also reveals two authoring defects that the dead declarations have
been hiding, and shipping it without repairing them exports an unreadable
accessibility deck.

The order that follows from the measurement:

1. **~~Repair the a11y status grays first.~~ DONE, and it was the wrong list.**
   The a11y crossings are in an unsupported mode (§4's correction). The repairs
   that were actually owed, both landed:
   - **`indaco` `--hljs-literal` 3.71:1 → 4.67:1.** Not a flip prerequisite at all
     — a **live** AA failure in shipped output, in both concat orders, found by
     the new gate rather than by this sweep (the sweep compares orders, so a value
     under the floor in *both* never registers as a crossing).
   - **`cuoio` `--hljs-literal` 4.05:1 → 4.68:1.** A genuine flip prerequisite:
     today the base's `#ff5874` paints at 5.68:1 on cuoio's panel, so cuoio's own
     value has never rendered.
2. **~~Land an `--hljs-* × --code-bg` AA gate with the flip.~~ LANDED, ahead of
   it** — see §7. It is what found the indaco defect, which is the argument for
   gating before the flip rather than with it. The status trio still wants the same
   treatment against the surface it is actually painted on, which §4 shows is not
   always `--bg`.
3. **Then flip `lattice-emulator.js:691`**, with the sweep re-run as the proof.

**This is still a human gate.** The artifacts are the four contact sheets and the
a11y comparison in the PR; the decision is the owner's.

## 6. Not verified

- **Nine slides, not the whole gallery.** The deck exercises the families the
  measurement identified; a component reading a dead token this deck does not use
  would not show up. The token-level measurement in §2 is exhaustive over the 932;
  the render sweep is not exhaustive over components.
- **PPTX and the HTML player were not swept.** They consume the same bundle, and
  #1596 established that path is inert for a *different* change; nothing here
  measures them under the flip.
- **The status trio's real reference surface.** §4 shows `--bg` is the wrong pair
  for at least the a11y icon use. Which surface each status token is actually
  painted on, per component, is unmeasured — and it is what a status contrast gate
  would need.
- **The other 22 token families.** Only `--hljs-*` and the status trio were
  contrast-measured. The `--diagram-*` family visibly changes the gantt and kanban
  slides and nothing here says whether those changes clear any floor.

## 7. The `--hljs-*` gate (landed 2026-08-11)

`checkHljsContrast` resolves each `--hljs-*` token against its own theme's
`--code-bg`, per mode, through `catResolve` — the same resolver the categorical
arms use, so the two cannot disagree about what a token resolves to.

**It earned itself immediately.** `indaco` declares Night Owl's `#ff5874`
verbatim, and the comment above the block says so — but Night Owl tuned that
against Night Owl's panel (`#011627`), and indaco's `--code-bg` is the lighter
`#003d66`. 3.71:1, **rendering that way today**, in both concat orders. Verified
in Chromium on a real `section.code pre`, not just in the token map. That is a
borrowed palette meeting a panel it was not chosen for, and no sweep comparing
*orders* could ever have found it.

### 7a. The exemption, and why it was wrong — corrected same day

The gate shipped its first cut with `--hljs-comment` and `--hljs-punctuation`
**exempt**, and the argument was written down at length: 64 comment values and 46
punctuation values sit under 4.5:1 across the shipped palettes, against **4** for
every other token combined; de-emphasis is what makes code findable; a gate
demanding 110 palette edits to enforce a reading no syntax theme follows would be
damage done to make a number zero. WCAG says otherwise, so it was flagged to the
owner rather than settled.

**The owner's answer was to fix it, and on inspection the argument was reasoning
about the wrong end of the scale.** De-emphasis is a question of where a token
sits *relative to the code around it*. The floor is a question of whether a human
can read it *at all*. The floor is 4.5:1 and the content tokens sit well above it,
so both are satisfiable at once — the exemption traded away legibility to buy a
hierarchy it never had to spend anything on.

So all 110 were repaired. Each was lifted through `ensureContrast`
(`lib/theme/color.js` — OKLCH, hue and chroma held, first step that clears), which
is the *minimum* movement that reaches the floor: they land at 4.5–4.7:1, not at
body-text contrast. That collapsed to **23 declaration sites across 14 files**,
because `onyx.css` alone supplies the values 28 theme-modes inherit.

**The hierarchy was verified afterwards, not assumed.** Across all 64 theme-modes,
no token that carries CODE sits below a repaired comment.

> **Correction (same day, from the independent checker).** This paragraph first
> said "a comment is still the quietest thing in the panel", and that is **false in
> 26 of 66 theme-modes** — `--hljs-punctuation` is lifted to the same floor and
> lands a few hundredths either side of the comment. The test passed only because
> it skips punctuation. Comment and punctuation are peers at the bottom by design;
> the claim that holds is the narrower one now stated above.
>
> **And the visual sign-off cited an artifact that refutes it.** This paragraph
> originally read *"Rendered `indaco` and `crepuscolo` (the largest lift, 1.96 →
> 4.57:1) and looked at them: the comments read comfortably."* Probed in Chromium,
> all four of those `.scratch/after-*.html` files paint `#637777` — the
> **unrepaired base** value — because the emulator loads the base last (§7d). The
> repaired theme values were never on screen, and on that path they cannot be. The
> renders were real; they were renders of the old value. That is exactly the HARD
> RULE #23 failure the rule exists for, committed while quoting the rule.
>
> The claim is now carried by artifacts that do show it: the CI golden montages on
> `code · light · slide 2` (default palette) and `code · dark · slide 3` (the
> comment-dense stress slide), where the before/after differ and the overlay marks
> only comment lines.

The lesson is the transferable part: **an exemption that arrives with a big number
attached is usually a defect being counted rather than fixed.** 110 was presented
as the reason not to act; it was the size of the problem.

**A second defect the lift itself introduced.** Pushing comment and punctuation to
the same floor collapsed them: `concrete` ended 2/255 apart in one channel — OKLab
ΔE 0.0030 against the repo's own `CAT_INK_COLLAPSE_DIST` of 0.010, having been
0.1378 before. Same in laguna, crepuscolo, atelier, mustard, onyx, brina, magnolia.
Legible and indistinguishable is a different defect from illegible, and no contrast
number can see it. Punctuation is now separated to ΔE ≥ 0.030 across 8 declaration
sites, moved toward the code (it *is* code — braces, semicolons) so the comment
stays the quietest. The gate and a test both enforce it now.

### 7b. A defect in the gate, found by the test that replaced the exemption

Writing the per-token mutation test exposed a second bug — in the gate's own
signature. `checkHljsContrast(errors, themesDir)` listed *filenames* from
`themesDir` but read their *contents* through `catPaletteSource`, which hardcoded
the real `THEMES_DIR`. So a fixture tree could be scanned by name while the real
palettes were measured, and a mutation test against the fixture would pass because
nothing it wrote was ever read — the canary in the exemption-era test was green for
exactly that wrong reason. `catPaletteSource` now threads `themesDir` through its
recursion, defaulted so every other caller is unchanged.

Mutation-tested per token, all twelve: each driven to its own theme's `--code-bg`
(1.00:1 — guaranteed to fail whatever the panel's lightness, which a fixed hex
cannot be) must fail the gate *and name the token*.

### 7c. The base palette — the biggest miss, found by distrusting a clean result

After the fourteen themes were repaired, a full **340-render** regression sweep
(75 galleries × 2 moods + 190 deck goldens) reported **zero drift**. That could not
be true of a change that moved colors in fourteen palettes, so it got traced
instead of accepted.

The sweep was not broken. `regression-gate.mjs` renders every golden with
`dist/lattice.css`, and **that bundle's comment color is not any theme's** — it is
`lib/base/base.tokens.css`'s own `--hljs-comment`, which the theme edits never
touched. The sweep was correctly reporting that fourteen theme edits did not reach
the bundle everything actually renders with.

And that value was **`#637777` at 3.63:1** on the base's `--code-bg` (`#001d33`) —
Night Owl's value a third time, tuned for Night Owl's `#011627`. This is the
palette `dist/lattice.css` ships: what a deck renders with before any theme is
chosen, and what the regression gate itself renders every golden with. **It was the
most-read sub-AA value in the repo.**

`checkHljsContrast` could not see it. The gate scanned `themes/` and its own
comment excused the omission — *"a palette that declares no syntax colors of its
own inherits the base's, which the base is responsible for"* — but nothing made the
base responsible. The gate now scans `lattice` first and not optionally. Verified
by running the widened gate against the un-repaired value: it fails and names it
(`lattice/light --hljs-comment #637777 on --code-bg #001d33 = 3.63:1`).

Lifted to `#748989`, 4.64:1, hue and chroma held.

**The transferable lesson is the second one this section has produced, and it is
the sharper of the two: a gate that reports clean after a change it should have
seen is making a claim, and the claim is checkable.** Three defects in this
section — the exemption, the `themesDir` lie, and the base blind spot — were all
found by asking a green result to justify itself.

### 7d. The export path — where the "Fixed" claim did not reach

An independent checker was run on the finished branch, and its lead finding was
that **the headline repair did not reach the surface the changelog named.**

`lattice-emulator.js:690` is `const css = paletteCSS + '\n' + layoutCSS;` — the
base is concatenated **after** the theme, so on the export path the base's
`--hljs-*` win and a theme's own values never paint. That inversion *is* #1527, and
the flip is deliberately not shipped here. It was written into this branch's own
commit message to explain why cuoio's repair "has never rendered" — and then the
opposite was asserted for indaco, which requires the theme to win. Both numbers
read 3.71:1 only because indaco and the base declare the same Night Owl hex, so the
measurement was right and the conclusion about the *fix* was wrong.

Verified independently before acting, in real Chromium on real emulator output:

```
panel                      rgb(0,61,102)      #003d66
--hljs-literal resolves to #ff5874            (the BASE's value)
painted                    rgb(255,88,116)  = 3.71:1
```

`lib/engine/css.js:389` inlines the base at the theme's `@import` position, so the
engine/docs/Studio path *did* get the repair. The export — the CLI, all 45
exemplars — did not.

**The gate had the matching blind spot.** It paired base tokens with the *base's*
panel and theme tokens with the *theme's*, which models the post-flip world. The
combination the export actually paints — base token on theme panel — was measured
by nothing. Sixteen such pairs were under the floor: `--hljs-comment` on 12 panels
(worst 3.06 on indaco) and `--hljs-literal` on 4 (worst 3.71).

**The repair.** The base's two offenders are now solved against *every* panel they
can land on — its own plus all 15 distinct `--code-bg` values in the corpus —
rather than against Night Owl's or the base's alone: comment `#92a8a8` (worst
4.51:1), literal `#ff7c8c` (worst 4.58:1). `checkHljsContrast` now judges the base
against the whole panel set, so both concat orders are safe and the flip's
prerequisite is genuinely met rather than asserted.

**Two more things the checker caught, both real:**

- `lib/theme/derive.js` still held generated `--hljs-*` to **3:1**, with a comment
  calling syntax highlighting "decorative" — the exact argument §7a spends forty
  lines refuting. Every theme the Studio generated shipped comments at ~3.1:1: the
  defect being *manufactured downstream* while the committed palettes were repaired.
  Now 4.5; two seeds that produced 3.10 and 3.12 now produce 4.91 and 4.71.
- The gate **silently skipped any value it could not parse** — `rgb()`, `hsl()`,
  `oklch()`, a named color, 8-digit hex — contradicting the resolver's own
  documented contract ("never a silent skip") and making the gate evadable by
  changing notation alone. An unreadable value is now a loud error. Note the
  disclosed caveat had this backwards: it named `color-mix()`, which was always
  handled, and missed the notations that actually escaped.

**The lesson §7c drew was right but too narrow.** It said a gate reporting clean
after a change it should have seen is making a checkable claim. The sharper version:
**a gate encodes a model of where the value lands, and that model is the thing most
likely to be wrong.** Every defect in this section — the exemption, the `themesDir`
lie, the base blind spot, and this one — was the gate measuring the wrong pair, not
measuring the right pair badly. Four of them, in one swimlane, found by three
different means: a red team, a distrusted green result, and an independent checker.
The checker was the only one that caught this one, and it was nearly not run.
