---
status: shipped
summary: Reported (#1438) as "on a hard reload the utility icons and the middle action bar are missing while the deck dropdown and the slide rail render immediately". Reproduced on the built site at the reporter's 393x651, and the report's premise turned out to be inverted: nothing in the Studio is server-rendered, so there is no defensive `useMounted`, no cookie-vs-localStorage question and no IndexedDB coupling — the whole app is one Astro `client:only` island, and what a reload shows before it mounts is a static shell in `studio.astro`. That shell drew exactly TWO things, a topbar and the Nacre slide box, so it was STRUCTURALLY INCOMPLETE: hydration dropped four more bands in at once (the phone eight-cell action bar, the preview sub-bar, the slide navigator, the status strip) plus, above tablet, the entire editor column, and the hand-off read as a re-layout. FIX: the shell now renders the APP'S OWN chrome components to static HTML at BUILD time (Astro renders React with no client directive, so it ships markup and zero JS) — Button/Separator/LatticeMark/icons.ts plus BarIcon, PostureDial and EditorSkeleton, extracted from StudioShell into chrome-parts.tsx and now shared by both surfaces. No px constant and no copied SVG survive in the shell. A FIRST PASS hand-drew skeleton blocks at hand-measured sizes and left tablet+desktop with an empty topbar tail, justified by the belief that the app stylesheet does not exist pre-hydration; that belief is FALSE (one render-blocking stylesheet already carries every utility, arbitrary values included), and the section recording it is kept as the correction. Rule that replaced it: render the real control where its identity is fixed, never render per-deck content (slide names, counts, palette) — content gets a neutral bar inside the real control shape, so the retired second-content-surface failure cannot return. Also: `lx-ui` on the shell root is load-bearing (shadcn's baseline reset is scoped to it; without it the bar's fractional cells drift 3px by the sixth), landscape-phone cinema is modeled, the Build stop drops the slim tail rather than paint a header the app replaces, a 4px `mobileBarH` drift left by the eight-cell redesign is fixed, and a committed e2e oracle measures BOTH surfaces in one page load — bands AND every individual control — and fails on either drift. Verified at 393/820/1440, light and dark, at Read, at Build and in cinema. Real iOS remains UNVERIFIED (HARD RULE #23).
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
  Studio** — `grep` finds the idiom only in the Playground's editor host;
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
private functions inside `StudioShell` and are now shared from `chrome-parts.tsx`. **There is
no px constant and no copied SVG path in the shell.**

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
(`studio-instant-shell`, `studio-header-fit`, `responsive`, `split`, `touch-chrome`) — green.

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
- `docs/src/components/studio/preview-rect.ts` — `mobileBarH` 53 → 49, new `statusH`
- `docs/e2e/studio-instant-shell.spec.ts` — the shell-vs-app oracle (new)
- `docs/scripts/check-studio-shell.mjs` — band, seed and real-glyph markers
