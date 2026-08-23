---
status: shipped
summary: >
  The deck shells have had an axe gate since #1740 (G10); the WEBSITE — `lattice.style`, the
  component reference, the Playground, the Studio — had no automated accessibility scan of any
  kind. The nearest thing, `check-shadcn-bridge-contrast.js`, grades TOKEN MATH and passed on
  every palette the whole time the component reference rendered its ACTIVE nav item as `--accent`
  ink on an `--accent` pill: a 1:1 ratio, an invisible label, shipped. The tokens were never
  wrong. An unlayered `a { color: var(--accent) }` in `landing.css` beat the `@layer`-ed Tailwind
  utility that was supposed to color it, and no amount of token arithmetic can see a cascade —
  the rule-3 layering trap of HARD RULE #26, on the docs site rather than in the engine. axe files
  an exact 1:1 as `incomplete` (`equalRatio`), not a violation, so even an axe run would have
  called the page clean; that one messageKey is now promoted. `docs/e2e/axe-site.spec.ts` scans 12
  routes at 1440/820/390 in both color modes, plus the site menu OPEN — the widths are load-bearing
  (every `scrollable-region-focusable` finding existed only at 390px) and so is the open menu
  (three defects lived behind it). Eight defect classes found and fixed; two adjudicated
  exceptions, both with the measurement behind them. Also closes an unrelated hole the sweep
  exposed by contrast: `--text-muted` — the running header, footer and pagination ink on EVERY
  slide of EVERY deck — was the one `--text-*` role `contrast-audit.js` never scored, its AA
  standing asserted only in a comment repeated across 32 theme files. Now gated. Measured across
  the shipped palettes, `--text-heading` is the ONLY ink that clears AA on the bridge's accent
  surface (worst 7.01:1); `--text-muted` is sub-AA there on 33 of 36 palette-modes and `--accent`
  on 7 — so the accent surface has exactly one ink, and both non-pairs are now measured on every
  run rather than remembered.
---

# The website had no accessibility gate, and a token gate cannot see a cascade

**Status:** shipped.
**Scope:** `docs/` (the site, the component reference, the Playground, the Studio), plus
`tools/contrast-audit.js` and `tools/check-shadcn-bridge-contrast.js`.
**Related:** `2026-07-03-semantic-html-accessibility.md` §18.1 (G10, the deck-shell half),
`2026-08-18-contrast-floor-deck-scale.md` (why the large-text allowance is not available),
`2026-08-17-composed-surface-contrast.md`, HARD RULE #26 (the layering trap), HARD RULE #23
(a claim names its surface).

---

## 1. What was actually missing

Lattice runs in two environments. The deck shells — the HTML export and the standalone player —
have been gated by `test/integration/invariants/axe-a11y.test.js` since G10 landed, and that file
is careful to say what it does not cover. The other environment is the website, and it had
nothing: no axe, no pa11y, no rendered-DOM check at all. `@axe-core/playwright` is not in the
tree, and `axe-core` itself was reachable only from the engine-side test.

What the website did have was `tools/check-shadcn-bridge-contrast.js`, which is a good tool
aimed at a different question. It reads the generated palette tokens and the bridge's own
constants, re-derives the mixed colors, and scores the pairs — 36 palette×mode blocks, all
passing. It is arithmetic on values. It cannot see which rule wins.

## 2. The defect that proves the difference

The component reference's active nav item shipped with `bg-primary text-primary-foreground`.
Those are both declared bridge tokens and the pair is gated: `--on-accent` on `--accent`, AA in
every palette. In the browser the element computed to

```
color:            rgb(122, 90, 16)   /* #7a5a10 — the palette --accent */
background-color: rgb(122, 90, 16)   /* #7a5a10 — the palette --accent */
```

a 1:1 ratio and a completely invisible label, on the default palette, on the shipping site.

The cause is one rule in `docs/src/styles/landing.css`:

```css
a { color: var(--accent); }
```

It is unlayered. Tailwind v4 emits its color utilities inside `@layer utilities`, and an
unlayered declaration beats a layered one regardless of specificity — the same rule-3 trap HARD
RULE #26 keeps out of engine CSS, here in the docs site where that rule does not reach. So
`text-primary-foreground` never applied, and neither did `text-foreground` on the inactive rows:
**every link in that nav rendered `--accent`**, and the active one simply had an `--accent` pill
behind it. The file already knew about the trap — there is a comment at the `a` rule explaining
it, and an unlayered `.lx-ui a[data-slot='button']` block written to work around it — but nothing
enforced that a new link had to opt in.

Two things follow, and the second is the more useful one:

1. A token-math gate is structurally unable to catch this. It was green throughout.
2. **An axe run alone would also have called the page clean.** axe classifies an exact 1:1 as
   `incomplete`, not a violation — `messageKey: "equalRatio"`, on the sound theory that ink
   matching its ground is sometimes deliberate hiding. The single worst contrast defect on the
   site sat in the bucket a violations-only scan discards.

The gate therefore promotes that one messageKey out of `incomplete` and nothing else from it.
The rest of the site's `incomplete` is ~800 nodes of `bgOverlap` / `bgGradient` /
`elmPartiallyObscured` — places axe genuinely cannot resolve a background behind a gradient or
an overlapping box. Those are unknowns, not defects, and enforcing them would be a scoreboard.

## 3. The gate

`docs/e2e/axe-site.spec.ts`, tagged `@a11y`, routed to `desktop` / `tablet` / `mobile`. It reuses
the repo's existing `axe-core` (4.12.1) rather than adding `@axe-core/playwright`, evaluating the
bundle source in the page — the same CSP-safe idiom the engine-side test uses, and one axe
version across both gates instead of two that can drift.

Rule set: WCAG 2.0/2.1/**2.2** A + AA, plus axe's best-practice set. Best-practice earns its place
here exactly as it does engine-side: `landmark-one-main`, `region` and `page-has-heading-one` are
what caught the Playground shipping with no main landmark and no `<h1>` at all.

Two axes are load-bearing rather than decorative:

- **Three widths.** Every `scrollable-region-focusable` finding on this site exists *only* at
  390px, where a table or code block starts to overflow. A desktop-only scan called those pages
  clean. The QUALITY BAR already says all three widths are first-class; here it is the difference
  between finding a WCAG 2.1.1 failure and not.
- **The menu, open.** A first-paint scan cannot see a closed dialog. Driving one Sheet open by
  hand found three defects the whole sweep had reported nothing about.

The suite plants two deliberate defects at the end of each run — an unnamed button and an
`equalRatio` pair — and requires the same code path that just returned nothing to return both.
A green sweep that has quietly stopped measuring is the failure mode a budget of zero cannot
distinguish from success.

## 4. What it found, and what was done

| # | Finding | Where | Disposition |
|---|---|---|---|
| 1 | Active nav label at **1:1** — invisible | component reference, all widths | Fixed. `data-nav` hooks + unlayered rules beside the existing `a[data-slot='button']` block, so the intended ink wins the cascade instead of losing it silently. |
| 2 | `text-primary` on `bg-accent` at **4.47:1** (6 nodes) | component reference chips + nav | Fixed. Repointed to `--accent-foreground`, the ink the bridge *declares* for that surface. |
| 3 | Inactive tab trigger at **2.46:1** | landing (`text-foreground/60`) | Fixed. An alpha-diluted de-emphasis replaced by `--text-muted`, which §6 now gates. Dark mode already used the token; light mode was the outlier. |
| 4 | Playground: **no `<main>`, no `<h1>`**, two toolbars in no landmark | `/playground/` | Fixed. The island root retagged `div` → `main` (`display:contents` keeps the box behavior and still exposes the role — verified, not assumed), plus a visually hidden `<h1>`. |
| 5 | Studio: **no `<h1>`** on any of four shells | `/studio/` | Fixed. A visually hidden `<h1>` inside each `<main>`. |
| 6 | `heading-order`: `<h3>` under `<h1>` with no `<h2>` | `/features/` | Fixed. Tag changed, classes untouched — the cards look identical. |
| 7 | Scrollable `<pre>` and `<table>` unreachable by keyboard | component reference + 3 docs pages, **390px only** | Fixed. One `ScrollableCode` component; a four-line rehype plugin for Markdown tables. Tab stop only — a `role` on a `<table>` would trade real table semantics for a scroll affordance. |
| 8 | Menu (open): label **4.47:1**, description **3.80:1**, close button **16×16** | site header Sheet | Fixed. Ink per §5; the close button's base target raised to 24×24 (WCAG 2.2 2.5.8). `pointer-coarse` already grew it to 44×44 for a phone — the case it missed is a 390px-wide window on a laptop, a FINE pointer. |

Two exceptions are sanctioned in the spec, each with the measurement behind it, and each fails if
it goes stale:

- **`.cm-scroller`** (`scrollable-region-focusable`) — a measured false positive. axe's
  `focusable-content` check reads `element.tabIndex` to decide tabbability, and Chrome reports
  `-1` for a `contenteditable` div that is fully in the tab order. Driven on the real surface:
  Tab reaches `.cm-content` in 18 presses, and 60 `ArrowDown`s scroll `.cm-scroller` from 0 to
  658px. Both halves of the rule's intent are met.
- **Expressive Code's `pre[role="region"]`** (`landmark-unique`) — third-party markup we do not
  author, best-practice tier, no name unless the block has a frame title. Logged rather than
  fixed under HARD RULE #18's pre-existing/off-path arm; the fix path is an Expressive Code
  `postprocessRenderedBlock` plugin, which is its own change.

## 5. The accent surface has exactly one ink

Finding 2 looked like a rounding problem — 4.47 against a floor of 4.5. It is not. The shadcn
`--accent` surface is `color-mix(in oklab, var(--bg-alt), var(--accent) 14%)`: a tint of the
accent itself. Measuring against it across all 36 palette×mode blocks — the three `--text-*` roles the
generated token file carries; `--text-secondary` and `--text-label` are not in it, so
"every role" would overstate the sweep:

| ink on the accent surface | worst | sub-AA blocks |
|---|---|---|
| `--text-heading` | **7.01:1** | **0** |
| `--text-body` | 4.18:1 | 2 |
| `--text-muted` | 3.05:1 | **33** |
| `--accent` (i.e. `text-primary`) | 3.29:1 | 7 |

Tuning cannot rescue the bottom two rows: lowering the mix to buy contrast collapses the hover
surface into the card, which `HOVER_DL` already guards. `--text-heading` is the only ink that
clears AA everywhere on that ground — which is exactly what the bridge declares
`--accent-foreground` to be. **The contract was right; five call sites had drifted from it.**

`--text-muted` is the instructive one, because it is not a careless choice anywhere else: it is
gated AA on the two backdrops a palette declares, the canvas and the card, and clears both in all
32 themes. A token can be correct on every surface it was scored against and wrong on a surface
nobody thought to score. Both non-pairs are now soft rows in the bridge tool, so the numbers are
measured on every run instead of remembered.

## 6. The ungated `--text-*` role

The sweep exposed this by contrast rather than by finding it: `contrast-audit.js` scores
`text-heading`, `text-body`, `text-secondary` and `text-label` on both the canvas and the card,
and did not score `text-muted` on either. That token is the declared ink for the running header,
the running footer and the pagination counter on **every slide of every deck**
(`base.tokens.css` → `section header` / `section footer`), plus the section-rail dots.

Its AA standing was asserted in a comment — `de-emphasized TEXT — AA on --bg and --bg-alt
(#1715)` — repeated identically across 32 theme files, and read by nothing. All 32 clear both
pairs today, so the two new rows seed green and their whole job is to keep it that way. A
hand-written claim standing in for a gate is the silent-drift shape that table exists to remove.

The floor is 4.5, not 3.0. `2026-08-18-contrast-floor-deck-scale.md` settled that a deck's
canvas-unit size says nothing about the size a human sees — the chrome's 43.4px on a nominally
3840px canvas is ~14px on a 1280px projection — and this table grades tokens with no viewing size
at all, so the small-text floor is the only honest bar available to it.

Note what this does **not** close. G13's remaining half is the *rendered* chrome measurement
(4.20:1 light / 4.07:1 dark on the player shell). Those numbers are not the token pair this gate
scores; they are the token composited against whatever the player paints behind it, which is a
different backdrop and a different gate's job.

## 7. What is still open

Stated so the green is not read as more than it is. Every line is a place a defect can ship.

- **One palette.** The site scan runs whatever `cuoio` resolves to. 17 others ship. The token-side
  sweep covers all of them (`theme-surface-aa.test.js`); what is covered *nowhere* is a rendered
  cascade defect in a non-default palette — which is precisely the class this change found in the
  default one.
- **Twelve routes of 88.** The component reference alone is 61 pages from one template; one is
  scanned.
- **Transient surfaces.** One Sheet is opened. Every Popover, the Command palette, the Studio's
  panels and its Fabricate flow are unscanned — and that is where most of the site's remaining
  alpha-diluted ink lives (**30** `text-*-foreground/NN` occurrences, 26 of them in the Studio;
  finding 3 was one of these and measured 2.46:1).
- **The unlayered `a` rule itself.** Three separate fixes in this change are workarounds for it.
  The systemic fix is to move that rule into `@layer base` so utilities win normally, which would
  make the `.lx-ui a[data-slot=…]` and `a[data-nav=…]` blocks unnecessary. It is a site-wide
  cascade change needing its own visual sweep at three widths, so it is logged, not done.
- **Focus.** WCAG 2.2's 2.4.11 (focus not obscured) and 2.4.13 (focus appearance), focus-ring
  contrast, and focus order are outside axe's rule set and outside this gate. `--ring` maps to
  `--accent`, whose contrast against adjacent surfaces is scored nowhere.
- **The Studio visual baseline is stale on `main`** — `studio-desktop-linux.png` and
  `studio-tablet-linux.png` fail by 15857 / 10876 pixels (ratio 0.02). Confirmed identical on a
  stashed clean tree, so it is pre-existing and not this change's; re-blessing belongs to whoever
  made the look change, not here.
- **`target-size` beyond the two close buttons.** 2.5.8 was only exercised where a scanned surface
  reached it.
