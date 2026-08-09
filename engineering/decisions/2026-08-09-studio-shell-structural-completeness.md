---
status: shipped
summary: Reported (#1438) as "on a hard reload the utility icons and the middle action bar are missing while the deck dropdown and the slide rail render immediately". Reproduced on the built site at the reporter's 393x651, and the report's premise turned out to be inverted: nothing in the Studio is server-rendered, so there is no defensive `useMounted`, no cookie-vs-localStorage question and no IndexedDB coupling — the whole app is one Astro `client:only` island, and what a reload shows before it mounts is a static shell in `studio.astro`. That shell drew exactly TWO things, a topbar and the Nacre slide box, so it was STRUCTURALLY INCOMPLETE: hydration dropped four more bands in at once (the phone eight-cell action bar, the preview sub-bar, the slide navigator, the status strip) plus, above tablet, the entire editor column, and the hand-off read as a re-layout. FIX: the shell now renders the APP'S OWN chrome components to static HTML at BUILD time (Astro renders React with no client directive, so it ships markup and zero JS) — Button/Separator/LatticeMark/icons.ts plus BarIcon, PostureDial and EditorSkeleton, extracted from StudioShell into chrome-parts.tsx and now shared by both surfaces. No px constant and no copied SVG survive in the shell. A FIRST PASS hand-drew skeleton blocks at hand-measured sizes and left tablet+desktop with an empty topbar tail, justified by the belief that the app stylesheet does not exist pre-hydration; that belief is FALSE (one render-blocking stylesheet already carries every utility, arbitrary values included), and the section recording it is kept as the correction. Rule that replaced it: render the real control where its identity is fixed, never render per-deck content (slide names, counts, palette) — content gets a neutral bar inside the real control shape, so the retired second-content-surface failure cannot return. Also: `lx-ui` on the shell root is load-bearing (shadcn's baseline reset is scoped to it; without it the bar's fractional cells drift 3px by the sixth), landscape-phone cinema is modeled, the Build stop drops the slim tail rather than paint a header the app replaces, a 4px `mobileBarH` drift left by the eight-cell redesign is fixed, and a committed e2e oracle measures BOTH surfaces in one page load — bands AND every individual control — and fails on either drift. VERIFIED ON DEVICE: the reporter confirmed the shell on their own iPhone and iPad (the sandbox cannot reach iOS, so this is the only thing that could close that claim). The residual shift they reported was a font mismatch, fixed. A subsequent adversarial pass (HARD RULE #25) then found EIGHT divergences the hand-listed oracle passed green over — the Build stop's header and activity rail, a persisted splitter, a collapsed pane, the cinema morph's padding, the sub-bar's three heights, a rotation mid-load, and two mis-copied breakpoints — all fixed, and the hand-listed oracle replaced by two ENUMERATING matrices that compare the two surfaces as sets. A THIRD adversarial round (red team + inversion + checker, run on what would actually ship) then found nine more — a rotation into cinema leaving stale bands, the desktop-Read title showing the wrong deck, a phantom tours button worth 44px, a transient stop and an orientation poisoning the replayed rect, a split restore that collapses rather than clamps, a storage-blocked visitor losing the whole shell, a legacy posture branch, and a listener that never retired — plus five false claims in this page and the PR. All fixed; the rule that kills the class is recorded below (draw only what width or the seeded stop can decide).
---

# Studio instant shell — structural completeness on reload (#1438)

**Date:** 2026-08-09 · **Status:** SHIPPED

## Symptom, as reported

On an iPhone (Firefox iOS, 393×651, `/studio/`), a hard reload showed a shell that was
partly there and partly not:

- **present immediately** — the top-left dropdown carrying the deck name, and the bottom
  slide carousel;
- **absent** — the utility icons (theme, settings, menu) and the whole middle action bar
  (Source, Compose, Preview, …);
- the slide area correctly showed a blurred loading surface.

The report came with three hypotheses (a `useMounted` guard around a `localStorage`-backed
theme icon; a `window.innerWidth` check gating the hamburger; the action bar waiting on
IndexedDB) and three proposed fixes (theme state in a cookie so the server can render it;
CSS-only responsive nav; render the action bar disabled until data loads).

## What is actually happening

**None of the three hypotheses hold, because the premise underneath them does not.** The
Studio is not a server-rendered React app with a hydration pass to defend against. It is a
**static Astro page** deployed as files, and the entire app is one island mounted
`client:only="react"` (`docs/src/pages/studio.astro`). There is no server render, so:

- there is no hydration mismatch to guard against, and **no `useMounted` anywhere in the
  repo** — `grep -rn useMounted docs/src lib` returns nothing at all (an earlier draft of
  this page said the idiom lived in the Playground's editor host; it does not exist there
  either);
- `useBreakpoint()` reads `matchMedia` **synchronously in the first render**
  (`docs/src/lib/use-breakpoint.ts`), so no viewport check delays anything;
- the action bar is plain markup inside `StudioShell`, gated on nothing but the breakpoint —
  it never waits on storage.

What a reload actually shows before the island mounts is a **hand-written static shell** —
`#studio-ssr-shell` in `studio.astro`, a fixed, opaque, `pointer-events:none` layer shown to
every visitor by an inline seed and dismissed when the live preview first paints. Until this
change that shell contained exactly two things:

1. a 54px topbar holding the brand mark and the deck title as bare text, and
2. one Nacre skeleton in a slide box, placed at the rect the app will measure.

So the map from the report to the code is:

| Reported | Actually |
|---|---|
| "the dropdown, populated with the deck name" | the shell's static topbar — a logo and a title, **not** a dropdown. The seed resolves the returning visitor's deck title from `localStorage`, which is why it reads as populated. |
| "the utility icons are missing" | true, and they are missing because **the app that owns them has not mounted yet**. The shell simply never drew them. |
| "the middle action bar is missing" | same cause. The eight-cell bar is app markup. |
| "the bottom slide carousel renders immediately" | the shell has no rail; this is the app's own rail, seen once the island mounts. The two screenshots in the report catch different moments of the load — plus a 220ms cross-fade in which the semi-transparent topbar shows the app's header through it (which is why the deck title appears doubled). |

**The defect is real, and it is not a hydration bug — it is an incomplete shell.** The shell
promised a topbar and then the app added four more horizontal bands and, above tablet, a
whole editor column. That is a re-layout at hand-off, and it is what "the app pops in" feels
like.

## Verdicts on the proposed options

**1. Move theme state to a cookie so the server can render the right icon — REJECTED.**
There is no server. `docs/` builds to static files; a cookie has nothing to be read by, and
adding one would cost a round-trip the current design does not pay. The problem it targets is
already solved by the static-site equivalent, and solved better: `ColorSchemeSeed` plus the
inline seed set `data-mode` / `data-palette` on `<html>` from `localStorage` **before first
paint**, which is why the shell is already in the right theme on a reload (verified in dark
below). It also keeps working offline, which a cookie read cannot promise a PWA.

**2. CSS-only responsive nav — ACCEPTED for the shell, REJECTED as a diagnosis.**
The app has no JS viewport gate to remove: `useBreakpoint()` answers on the first render.
But the *shell* has no JS at all, and it now draws its bands and the phone's icon run
entirely with CSS media queries at the app's own boundaries (700 / 1100 — never Tailwind's).
That is this option, applied where it actually bites.

**3. Decouple the action bar from data state — ACCEPTED in substance, REJECTED as written.**
Nothing to decouple: the bar is not coupled to IndexedDB. And rendering "disabled buttons" in
the React tree would not help, because the React tree is the thing that does not exist yet.
The correct form of this option is what shipped: **draw the action bar's geometry in the
static shell**, so its space is reserved and its shape is on screen from the first paint.

## The question under the options: why not SSR / server components?

The three options above all presume a server render exists to fix. It does not, and the
reasons are worth stating at this level rather than only as "there is no server".

**The platform is a choice, not a blocker.** `docs/` builds `output: static` with no Astro
adapter, and deploys as `wrangler pages deploy docs/dist` — a directory upload. Cloudflare
Pages *can* run SSR on Workers, so adopting it is possible. It collides with a ratified
direction rather than a technical wall: `2026-06-25-social-auth-byo-storage.md` chose
bring-your-own-storage over hosted accounts specifically so the docs site stays static and
backend-free, and HARD RULE #24 leans on the deployed docs being a static bundle.

**But the decisive reason is that SSR cannot render this route's content.** Which deck you
are editing, its title, your palette, your mode, your posture, your split share, your preview
rect — every one is per-visitor state in `localStorage`. A stateless server emits the same
generic frame for everybody. The pre-paint inline seed **reads that state before first paint,
with no round trip**, which is why the shell already paints the returning visitor's deck
title, their palette and mode, their deck's authored aspect ratio, and the exact rect the app
is about to measure. On this route the static shell is *strictly more capable* than SSR, not
a fallback from it. Cookies (option 1) would recover only mode and palette — the two things
the seed already has — and would pay a request round trip to do it.

**SSR would also not have fixed this bug.** The defect was six bands' worth of frame drawn as
two. A server render produces the same six bands from a different source; the win is the
bands. And the irony: server rendering is what *introduces* the hydration-mismatch class the
report hypothesized. `useMounted` guards are the price of SSR, not the cure for it — the
Studio has none precisely because it is `client:only`.

**React Server Components have nothing to do here.** They solve "fetch server data without
shipping the fetching code". There is no server data. The build-time data this page needs —
the component catalog, the grammar heading register — is already inlined by the Astro
frontmatter at build.

**The real cost of the approach taken, and the thing that WOULD fix it.** The shell's markup
is now a second source of truth for the app's chrome, alongside `StudioShell`'s JSX. The
constants, the build gate and the e2e oracle bound that drift; they do not collapse it. The
remedy is not a server — it is **build-time prerendering**: extract a pure, state-free
`<StudioChrome>` (bands, deck pill, icon buttons; no handlers, no browser APIs), render it
into the page at build via `client:load` instead of hand-writing the shell, and the two
surfaces become one component. Static output preserved, no adapter, no worker. It would also
buy back what this pass deliberately declined — the real glyphs, and the tablet/desktop
right-hand cluster. It is a larger change than this bug warranted; it is the right target if
the duplicate-shell cost is judged too high.

## Decision — the shell renders the APP'S OWN chrome, at build time

The shell now paints the full structural frame:

```
┌──────────────────────────────────────┐
│ topbar 54                            │  every width
├──────────────────────────────────────┤
│ action bar 49                        │  phone only
├──────────────────┬───────────────────┤
│ editor sub-bar 47│ preview sub-bar 47│  wide only │ dropped at Read
│                  ├───────────────────┤
│  editor skeleton │   Nacre slide box │
│                  ├───────────────────┤
│                  │ navigator ~51     │  dropped at Read
│                  ├───────────────────┤
│                  │ status 31         │  dropped at Read
└──────────────────┴───────────────────┘
```

**The content of those bands is the app's own components, rendered to static HTML at build
time.** `docs/src/pages/studio.astro` renders `<StudioChromeSkeleton>` with **no client
directive** — Astro renders React to HTML at build, so it ships as markup and zero JS. What it
renders is not a lookalike: `Button` and `Separator` (the shadcn primitives), `LatticeMark`,
the `icons.ts` semantic registry, and `BarIcon` / `PostureDial` / `EditorSkeleton`, which were
private functions inside `StudioShell` and are now shared from `chrome-parts.tsx`. **No SVG
path is copied** — every glyph comes from the same `lucide` / `icons.ts` source the app draws
from, and every control is the same shadcn primitive.

The class strings ARE still copied, and that is the honest limit of this: `StudioChromeSkeleton`
carries ~50 px literals (`h-[54px]`, `size-[18px]`, `min-[1100px]:`) because they are the app's
own Tailwind arbitrary values, retyped. That is the STRUCTURE duplication the closing section
names as surviving debt, and it is why the e2e parity guard exists — it is what makes the copy
verifiable rather than trusted. One literal is not a copy but a measurement, and is marked as
such in the source: the `w-[53px]` slot that reserves room for the per-deck slide count the
shell must not draw.

### The first pass got this wrong, and the reason is worth recording

It hand-drew muted skeleton blocks at hand-measured sizes, and justified that with a rule —
*"the shell draws geometry, never glyphs"* — resting on the claim in this page's own comments
that **the island's stylesheet does not exist pre-hydration.** That claim is false for the
app's utilities: `/studio/` ships ONE render-blocking stylesheet that already contains every
class the chrome uses, arbitrary values included (`h-[54px]`, `size-[18px]`, `min-w-[42px]`).
So the copied geometry bought nothing, and the same false premise was then used to justify
leaving tablet and desktop with an EMPTY topbar right-hand side — a visible pop-in on two
first-class widths, shipped as a "deliberate non-goal". It was not a trade-off; it was a
mistake resting on an unchecked belief.

The rule that replaced it: **render the real control wherever its identity is fixed; never
render per-deck content.** The topbar run, the eight-cell bar and the navigator's slide ops
are chrome — identical for every visitor and every deck, so drawing them is a promise the app
always keeps. Slide names, the slide count and the active palette are content the shell cannot
know, and painting them would re-create the second-content-surface failure that
`2026-07-21-studio-preview-one-skeleton.md` retired the cached-slide replay for. Content gets
a neutral bar inside the real control's shape.

### Two things the tier gating has to respect

**Breakpoints are CSS, not JS.** The app picks its header with `useBreakpoint()`, which cannot
run at build time. So the skeleton renders every tier and lets media queries choose, at the
app's own 700 / 1100 boundaries — the ticket's "CSS-only responsive nav" option, applied where
it actually bites.

**Where the app's chrome is genuinely unknowable, draw nothing rather than something wrong.**
At the Build stop on a wide viewport the app swaps the slim header for the full one; rather
than model a third header, the seed stamps `data-ssr-stop` and the CSS drops the slim tail
there, keeping only what both headers share.

### `lx-ui` is load-bearing

Tailwind Preflight is OFF site-wide; shadcn's baseline reset is **scoped to `.lx-ui`**, which
every island root carries. The shell's chrome is shadcn components, so it needs the same
scope — without it the buttons render on a different box model and the eight-cell bar
distributes its fractional cell widths differently, measured as a **3px drift by the sixth
cell**. With it, every cell is byte-identical to the app's, including the `outline` and
`solid` tones whose borders are what expose the difference.

## Three things found on the way

**A 4px drift in `mobileBarH`.** It read 53 — the height of the pane-toggle bar as measured
*before* the 2026-07-26 eight-cell redesign reshaped that row. The bar is 49px, flat across
320–699. The 4px hid while the constant only *placed* a box; it cannot hide now that a band
is drawn on it.

**Cinema was unmodeled.** On a landscape phone the app suppresses the header, the bar and the
navigator and runs the slide full-bleed. The shell used to flash a 54px topbar into that, and
the compute seed sized the box against a split the app does not render. The seed now detects
cinema from the same media query `useLandscapePhone` uses, turns the chrome off entirely, and
computes a full-bleed box.

**A dragged splitter could have contradicted the bands.** The bands come from the default
0.54 preview share; a returning visitor's *box* is replayed from the app's own measurement.
When the two disagree the replay path now widens the pane to contain the replayed box, so the
slide can never land on top of the editor band. Widening only — the default case is untouched.

## Verification

Real Chromium against the real built site (`astro build` + `astro preview`), at the reporter's
viewport and at all three first-class widths.

Shell bands vs the app's own bands, same page load, in px `[l, t, w, h]`:

| | shell | app |
|---|---|---|
| 393×651 topbar | `0,0,393,54` | `0,0,393,54` |
| 393×651 action bar | `0,54,393,49` | `0,54,393,49` |
| 393×651 preview sub-bar | `0,103,393,47` | `0,103,393,47` |
| 393×651 footer | `0,569,393,82` | `0,569,393,82` |
| 820×1180 preview sub-bar | `377,54,443,47` | `378,54,442,47` |
| 1440×900 preview sub-bar | `662,54,778,47` | `663,54,777,47` |
| 1440×900 footer | `662,818,778,82` | `663,818,777,82` |

And the CONTROLS, not just the bands — the phone's eight bar cells, unrounded, at 390px:

```
shell  0 · 48.25 · 96.5 · [1] · 145.75 · 194 · 242.25 · [1] · 291.5(50.25) · 341.75
app    0 · 48.25 · 96.5 · [1] · 145.75 · 194 · 242.25 · [1] · 291.5(50.25) · 341.75
```

Byte-identical, including the wider `outline` (Present) cell whose border is exactly what
exposed the `lx-ui` scoping bug. Also checked as pure pre-hydration paints with the island's
scripts blocked: light and dark at 393 / 820 / 1440, the Read stop (no sub-bar, one 49px
footer band, matching the app's measured 602/49 and 851/49), the Build stop on desktop (slim
tail correctly dropped), and cinema at 844×390 (no chrome at all, full-bleed box).

**The oracle is committed**, not a scratch run: `docs/e2e/studio-instant-shell.spec.ts` holds
the engine bundle briefly so the shell stays up, measures both surfaces in one load, and
requires them to agree on every band AND on each of the eight bar cells and the header's
utility buttons. Reverting `mobileBarH` to 53 fails it with
`preview sub-bar top: shell 107 vs app 103`; dropping `lx-ui` fails it with
`bar cell 5 left: shell 245 vs app 242`. `check:studio-shell` additionally keeps the bands,
the geometry seed, and a real lucide glyph in the shipped HTML — that last marker is what
catches `<StudioChromeSkeleton>` silently not rendering, which would otherwise leave the bands
present and empty.

Gates: `npm run lint`, `npm test` (5606), docs vitest (2658), docs `typecheck`,
`npm run build:check`, `check:overflow`, plus the Studio e2e specs nearest this change
(`studio-instant-shell`, `studio-shell-parity`, `studio-header-fit`, `responsive`, `split`,
`touch-chrome`) — green.

*Correction:* an earlier revision of this page claimed the shell was "verified at Read, at Build
and in cinema". It was not: those were shell-only paint checks, never compared against the app,
which is precisely the kind of claim HARD RULE #23 exists to stop — and the adversarial pass
below found real divergences at two of the three. They are now verified in the sense the rule
means: a committed oracle drives the real built site and compares both surfaces in one page
load, at Build, at Read and in cinema.

**VERIFIED ON DEVICE (HARD RULE #23).** The reporter confirmed the shell on their own iPhone
and iPad: structurally complete on both, and the missing icons and action bar are gone. That
closes the claim this sandbox could not make — headless Chromium cannot reproduce iOS's
URL-bar reflow or its visual-vs-layout viewport split.

They also reported the one thing the band-and-cell oracle was blind to: **a slight shift when
the real chrome hydrates.** Root cause, measured at 820px: the shell forced
`font-family: system-ui`, while the app renders in `--font-body` (Outfit). Different text
metrics, and the deck pill is CONTENT-sized from tablet up — so it painted at 164.5px and the
app re-measured it at 185px. Not a font-loading race: identical before and after
`document.fonts.ready`. That system stack was correct for the hand-drawn shell, which believed
the app's stylesheet was absent pre-hydration; with the REAL chrome rendered here it was simply
the wrong font. The shell now inherits `--font-body`, and shell and app agree exactly (185px
both). The fallback stack survives inside the `var()` default.

*Correction:* an earlier wording here said "not a font-loading race: identical before and after
`document.fonts.ready`". That is wrong, and the adversarial pass caught it — on a cold cache the
shell's pill measures ~164.5px BEFORE the webfont swaps in, on the fallback metrics, then
reflows. What the fix removes is the PERMANENT mismatch (two different stacks, so the pill never
converged); the cold-cache reflow that `font-display: swap` implies is still there, and both
surfaces now do it together. The e2e specs wait on `document.fonts.ready` for exactly this
reason — measuring inside the swap window is a flake, not a finding.

Why nothing caught it: every other thing the oracle compares — the bands, the phone's eight bar
cells — is width-CONSTRAINED, so a text-metrics disagreement cannot move it. The pill is the
only control whose width is set by its own content, which makes it the sole detector for that
class of drift. It is now asserted, at a documented 6px tolerance: the pill also carries a
per-deck slide count ("7 slides" vs "12 slides") that the shell must not draw, so its slot is
reserved at the measured typical width and a few px of variance is by construction. Reverting
the font to the system stack fails that assertion by 39px.

**Pre-existing failure found, not caused here:** `demo-mobile.spec.ts` ("the phone demo types
the 4-slide deck across pane-swaps and completes") fails on a toast assertion — it expects the
first deck's name and finds "Demo complete — the deck is yours to edit." Confirmed by stashing
this entire change, rebuilding and re-running: it fails identically on the base branch. Off the
path of this change, so logged here rather than pulled into the diff (HARD RULE #18).

## The adversarial trio, and the guard that replaced hand-listed assertions

The change went through the trio (HARD RULE #25) after the on-device confirmation. It found
**eight** divergences the shipped oracle passed green over, and the shape of all eight is the
same: the shell mirrors the app's chrome, the mirror is maintained by hand, and the only thing
comparing them was a HAND-LISTED set of four bands and a dozen controls. A list guards what
someone thought to list.

| Found | Was |
|---|---|
| the Build stop's activity rail | 52px rail sits OUTSIDE the split, so the split divides `vw − rail`; bands landed 29–52px off |
| a persisted splitter | the seed used the 54% DEFAULT and never read `lattice-docs-split-studio`; the split line landed up to 288px off |
| a collapsed pane | a third persisted state (sessionStorage) the seed did not model at all |
| the launcher's breakpoint | the app's `sm:` (640) was hand-copied as `min-[700px]:` — 6px of drift across 640–699 |
| the posture dial | hardcoded to Write, so a Read or Build visitor watched the lit segment jump |
| Present / Share labels | lost across 1024–1099, moving both controls ~100px |
| the Build header's left run | the shell drew the SLIM header's bare mark where the app draws launcher + rule, pushing the deck pill 27px right |
| the cinema morph's padding | modelled as unpadded; the holder is `px-0 py-3`, so the slide came out 24px too tall and (height-bound at 16:9) 43px too wide |
| the preview sub-bar's height | one number for a bar that is 47 / 45 / 41px depending on the PANE's width and whether the split exists |
| rotation during load | geometry derived once at parse time; a phone rotated during the ~505KB engine fetch held the portrait layout until hydration |

**The guard is the answer to "what happens when someone adds an icon".** Two oracles, both
driving the real built site and measuring BOTH surfaces in one page load:

- `studio-shell-parity.spec.ts` does not list controls. It **enumerates** every visible control
  in both chromes, keyed by `aria-label` (falling back to a stable hook, then to text), and
  requires the two SETS — and every box in them — to agree, across 16 width × stop cases. A
  control added to the app's header and not to the shell fails on the first run, without anyone
  remembering the file exists.
- `studio-instant-shell.spec.ts` does the same for the BANDS, the deck title and the slide box,
  across 16 matrix cases plus five standalone ones, each entering a state the old single default
  case never did: a dragged splitter, a collapsed pane, a share below the collapse midpoint, a
  pane below the lens-label threshold, the Read stop, the Build stop, cinema, a rotation INTO
  cinema, a docked-panel session, and the rect-REPLAY path.

Widths BRACKET the tier boundaries (639 and 660 around Tailwind's 640, 1024 for `lg`, 1099 and
1100 around the app's desktop line, plus one width inside each band) because that is where
hand-copied gating goes wrong — three of the eight lived at a boundary. They bracket rather than
sit on the line: a boundary bug shows as a disagreement on ONE side of it, so the two neighbors
catch it without sampling the exact pixel.

Both matrices run nightly; **two cases from each carry `@smoke`**, so the per-PR job runs one
phone and one desktop case of each oracle. Be precise about what that covers — an earlier
revision of this page was not: all four are at the **Write** stop, so they cover every band and
control the shell draws at Write and nothing that is Build-only or Read-only. The activity rail,
the Build header's tail, the Read dial and the chromeless preview are nightly. Promoting the
full matrices follows the repo's existing escalation rule — an observed nightly green streak
first (#800), never on hope.

### Then: is it consistent across the three tiers?

The matrices above were width-diverse but STOP-thin — most tiers were verified only at Write,
the stop that happens to be the default. Filling them out to one case per **tier x stop**
(and adding the one case that exercises the rect-REPLAY path rather than the compute path)
found three more divergences, and all three are *tier-asymmetric* — behavior that differs
between mobile, tablet and desktop, which is exactly the class a single-width check cannot see:

| Tier | Was |
|---|---|
| **tablet** | the Build stop's 52px activity rail is DESKTOP-only (`bp === 'desktop'`, ≥1100). The seed derived it from "not mobile" (>699), so every tablet Build layout got a rail the app does not draw — bands 28px off. The rail's CSS gate re-derived the tier a *third* time; it now keys on a `data-ssr-rail` flag the seed publishes, so the gate and the geometry cannot disagree. |
| **desktop** | at Read the slim header drops the deck switcher entirely for a plain title (deck navigation is a Write-and-up concern). The shell kept the pill and blanked its border, which left the title **27px** right of the app's and drew a live-dot the app has none of. The same unscoped rule flattened the switcher on a *phone*, where the app draws it in full. Two elements now, one shown — the same idiom as the header's left run. |
| **tablet + desktop** | the persisted preview rect was captured with whatever side panels were docked. Panel docking is **not** persisted (`activeAssistant` / `activeSettings` are plain `useState(null)`), so the app always boots with them closed: a rect saved with the Coach open described a layout that cannot recur, and the shell replayed it — a 601px box on a 1440 Build reload that the app re-drew at 708px. Mobile was structurally immune, having no docked panels. The app now DROPS a rect it cannot boot into rather than storing one. |

That last one also corrects a caveat this page used to carry — "not modelled: the Build stop's
side panels; rect-replay covers a returning visitor there." Rect-replay did not cover it; it
was the *source* of the divergence. Nothing needs to model docked panels, because no reload
ever boots into them.

**The rule the three share:** every place the shell answers a tier question, it must answer it
from the app's own boundary, once. Two of the three were a second copy of a tier test (`>699`
standing in for `>=1100`; a CSS gate re-deriving what the seed had already decided), and the
third was persisted state describing a layout the app cannot reach. The matrices are now one
case per tier x stop precisely so a tier-specific answer cannot be verified only at the tier
where it happens to be right.

### The third round: what the shell cannot know

Asked whether the result was consistent across tiers, then run through the trio again on the
delta, this round found **nine** more. They sort into one sentence: *the shell must predict what
the app renders from what is knowable before paint, and each round has discovered one more input
that is not.* Round 1 was width. Round 2 was tier × stop. This round is everything else.

| Found | Was | Who caused it |
|---|---|---|
| rotation INTO cinema | `publish()` set `data-ssr-cinema` and returned without clearing `data-ssr-chrome`. The four bands are SIBLINGS of `.ssr-chrome`, so suppressing the chrome does not suppress them: a portrait-width sub-bar and footer stayed painted over the full-bleed slide. Unreachable while `publish` ran once — the re-seed made it reachable. | this delta |
| desktop Read showed the WRONG deck name | the title-correction script used `getElementById`, and the new `ReadTitle` element carries no id — so the only VISIBLE title at desktop Read was the uncorrected build-time default. Per-deck content, drawn wrong, which the one-skeleton rule forbids outright. | this delta |
| a phantom tours button | the header's tours control is gated on `toursEnabled()` — a persisted global preference. The shell drew it unconditionally: anyone with tours off got a control the app deletes plus a 44px slide of the three after it. | this delta |
| a transient stop poisoned the replayed rect | `effectiveStop` is `revealBuild ? 'build' : quietened ? 'write' : posture`, and neither override persists. Ending a Build session with ⌘. quiet armed stored a Write-shaped rect the next boot replayed against Build — 29px off. The new boot-shape test checked the panel set and the collapse, not the stop. | this delta |
| an orientation poisoned it too | the rect is viewport FRACTIONS, so it only survives if the viewport SHAPE did not change. A landscape session replayed in portrait resolved to a 300×791 panel where the app draws a 358×201 slide. | pre-existing, on-path |
| a restored split COLLAPSES, it does not clamp | both panes are `collapsible`, so below the midpoint of 46 and 300 the library snaps to the rail. The shell clamped to 300 and painted a pane, and a slide in it, where the app handed off to a 46px rail with neither. | this delta |
| a storage-blocked visitor lost everything | `seedGeometry()` sat inside a `try` whose first statement is a `localStorage` read, so one throw swallowed the bands, the dial and the box placement — leaving a full-viewport Nacre box the app then snapped to a fraction of the width. | pre-existing, tipped |
| a legacy `onboarded: true` | `derivePosture` returns **build** for it; the seed's mirror had only the explicit-posture branch. Latent until the stop started selecting the header variant and the rail. | pre-existing, tipped |
| the re-seed listener never retired | `sawShell` latched only if a resize fired WHILE the shell was up, which for most visitors never happens — so it re-seeded a page with no shell, on every resize, forever. | this delta |

**And five claims that were false.** The trio audits prose as well as code, which this page has
now needed three times: the guard sections said "13 width × stop cases" against arrays of 16;
"widths at 640 and 700" against widths of 639 and 660; "those four `@smoke` cases cover every
band and every control", when all four are at the Write stop and cover nothing Build- or
Read-only; "the compute path models every boot layout there is", refuted by three of the nine
above; and the CHANGELOG's "the app now drops a rect it cannot boot into", true only of the two
disqualifiers it had enumerated. All corrected in place.

### The rule that kills the class

Three of the nine are the same defect wearing different clothes: the shell drew a control, or
trusted a rect, whose correctness depended on something the shell cannot see. And the guard
could not catch any of them, because the guard is a width × stop matrix — dense along exactly
the two axes the design already answers by construction, and empty along every other axis the
app branches on. A matrix like that always fights the last war.

So the rule is a *design* rule, recorded in `StudioChromeSkeleton.tsx` where the next person will
meet it:

> **Draw a control only where its presence is a function of viewport width or `data-ssr-stop`.
> Anything else is either published by the seed as its own `data-ssr-*` flag, or not drawn.**

The asymmetry is what makes "not drawn" the safe default: omitting a control leaves a hole,
while drawing one the app deletes shifts every sibling after it. `toursOn` is now a seeded flag
(`data-ssr-no-tours`); the boot-shape test for a replayed rect gained the stop and an aspect
check; and the parity matrix gained a case with tours OFF, because the axis existing at all is
what the matrix could not see.

**What stopped drifting by construction, not by test.** Three numbers the shell and the app used
to each hold a copy of now have one home in `preview-rect.ts`, consumed by both: the split's px
minimums (`splitEditorMin` / `splitPreviewMin`, which `StudioShell` now passes as the panels'
own `minSize`), the collapsed pane's rail width, and the split's storage key. A guard proves a
copy agrees; a shared constant means there is no copy to disagree.

## The prerender experiment — measured, not speculated

Since the shell duplicating the app's chrome was the standing objection, the alternative was
actually tried: `client:only="react"` → `client:load`, so Astro prerenders the island at build.
**It builds and emits real chrome** (`<header>`, `Slide navigator`, `lucide-share` all land in
`dist/studio/index.html`). It is not a drop-in for two measured reasons:

1. **The server has no viewport.** `useBreakpoint()` returns `'desktop'`, so the prerendered
   markup is the desktop SLIM header — `Workspace launcher` and `Deck actions` are absent from
   the output. A phone would parse desktop chrome and then re-layout.
2. **Duplicate accessible names.** Making it correct means converting the chrome's JS
   breakpoints to CSS ones, which puts two copies of every control in the DOM. Playwright's
   `getByRole(name)` then goes strict-mode ambiguous across dozens of specs.

So full prerendering is a real project with suite-wide blast radius, not a bolt-on — and the
shipped approach already takes most of its value (the app's own components, one source for
glyphs and sizes) without it. What survives as genuine debt is the chrome's STRUCTURE, which
is still expressed twice; collapsing that is the same CSS-breakpoint conversion above.

## Files

- `docs/src/components/studio/StudioChromeSkeleton.tsx` — the build-time chrome (new)
- `docs/src/components/studio/chrome-parts.tsx` — `BarIcon` · `PostureDial` · `EditorSkeleton`,
  extracted from `StudioShell` so both surfaces render the same source (new)
- `docs/src/pages/studio.astro` — chrome seed (`G`), band positioning, `lx-ui` + `inert` on the
  shell root, cinema and Build-stop gating
- `docs/src/components/studio/preview-rect.ts` — `mobileBarH` 53 → 49, `statusH`, the cinema
  pad, the three sub-bar heights, the split's separator / rail / minimums, and the split
  storage key (now shared with `StudioShell` rather than restated there)
- `docs/e2e/studio-instant-shell.spec.ts` — the shell-vs-app BAND + box oracle, as a matrix
- `docs/e2e/studio-shell-parity.spec.ts` — the enumerating CONTROL-parity oracle (new)
- `docs/scripts/check-studio-shell.mjs` — band, seed and real-glyph markers
