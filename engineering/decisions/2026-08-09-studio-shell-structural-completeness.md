---
status: shipped
summary: Reported (#1438) as "on a hard reload the utility icons and the middle action bar are missing while the deck dropdown and the slide rail render immediately". Reproduced on the built site at the reporter's 393x651 and root-caused, and the reporter's premise turned out to be inverted: nothing in the Studio is server-rendered or hydrated, so there is no defensive `useMounted`, no cookie-vs-localStorage question, and no IndexedDB coupling to decouple — the whole app is one Astro `client:only` island, and what a reload shows before it mounts is a hand-written static shell in `studio.astro`. That shell drew exactly TWO things, a topbar and the Nacre slide box, so it was STRUCTURALLY INCOMPLETE: hydration dropped four more bands in at once (the phone's eight-cell action bar, the preview sub-bar, the slide navigator, the status strip) and, on tablet/desktop, the entire editor column, and the hand-off read as a re-layout rather than a cross-fade. The reporter's "missing icons" is the shell's topbar, which drew a bare logo and title where the app draws a bordered pill and three 32px icon buttons. Fix: the shell now DRAWS every structural band, from the same `PREVIEW_CHROME` constants the seed already used to PLACE the box — one derivation, two consumers — under a stated rule, GEOMETRY NEVER GLYPHS: band heights are exact and gated, what sits inside a band is a muted skeleton, and no app icon or label is ever copied into the shell. Also: modeled the landscape-phone cinema morph (the shell no longer flashes a 54px topbar the app is about to delete), fixed a 4px `mobileBarH` drift the eight-cell redesign left behind, and added the missing measured oracle — an e2e spec that reads the shell's bands and the app's bands in the SAME page load and requires them to agree. Verified at 393/820/1440 in light and dark, at the Read stop, and in cinema; every band lands within 1px of the app's. The tablet/desktop topbar right-hand cluster is deliberately NOT sketched — it is a width-dependent mix of pills, a bordered segment and the posture dial, so fixed-width chips would drift.
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

## Decision — the shell draws every band, and draws GEOMETRY, never GLYPHS

The shell now paints the full structural frame:

```
┌──────────────────────────────────────┐
│ topbar 54                            │  every width
├──────────────────────────────────────┤
│ action bar 49                        │  phone only
├──────────────────┬───────────────────┤
│ editor sub-bar 47│ preview sub-bar 47│  wide only │ dropped at Read
│                  ├───────────────────┤
│  editor column   │   Nacre slide box │
│                  ├───────────────────┤
│                  │ navigator ~51     │  dropped at Read
│                  ├───────────────────┤
│                  │ status 31         │  dropped at Read
└──────────────────┴───────────────────┘
```

Two rules make this safe rather than a second surface to keep in sync:

**Every band height is a `PREVIEW_CHROME` constant — the same numbers the seed already used
to place the slide box.** The chrome derivation was hoisted to run once, before both box
seeds, and both now consume it (`G` in the seed). One derivation, two consumers: a band
cannot disagree with the box it frames, and the compute seed lost its duplicate copy of the
posture/breakpoint/pane logic.

**The shell draws geometry, never glyphs.** What sits inside a band is a muted skeleton —
chips and cells — never a copy of the app's icons or labels. A copied glyph can silently
become a *lie* about what a control does, and a control that looks live inside a
`pointer-events:none` layer invites a tap that does nothing. The one glyph in the shell is
the brand mark, which is brand, not a control, and predates this.

The **phone's** three utility buttons are drawn as three 32px slots because that run is
exactly three 32px buttons at every mobile width. **Tablet and desktop deliberately get no
right-hand cluster sketch**: there the row is a width-dependent mix of a ⌘K pill, a bordered
appearance segment, Present/Share, the posture dial and per-tier icon runs, so fixed-width
chips would drift with the row and move at hand-off — the exact failure the bands avoid.
Revisit if the desktop pop-in is judged worth those constants.

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

Every band within 1px (the 1px is the split handle's border rounding). Also checked as pure
pre-hydration paints, with the island's scripts blocked: light and dark at 393 and 1440, the
Read stop at both (no sub-bar, one 49px footer band — matching the app's measured 602/49 and
851/49), and cinema at 844×390 (no chrome at all, full-bleed box).

**The measured oracle is now committed**, not a scratch run: `docs/e2e/studio-instant-shell.spec.ts`
holds the engine bundle briefly so the shell stays up, measures both surfaces in one load, and
requires them to agree. Reverting `mobileBarH` to 53 fails it with
`preview sub-bar top: shell 107 vs app 103` — the drift that had been invisible to every guard
in the repo. `check:studio-shell` additionally keeps the four bands and the geometry seed in
the shipped HTML.

**UNVERIFIED (HARD RULE #23):** real iOS Safari / Firefox iOS — the reporter's actual surface.
This sandbox is headless Chromium, which cannot reproduce iOS's URL-bar reflow or its visual-
vs-layout viewport split. The geometry here is pure CSS and constant arithmetic with no
engine-specific behavior, but the on-device confirmation is owed.

## Files

- `docs/src/pages/studio.astro` — chrome seed (`G`), band CSS, band markup, topbar re-measured
  against the app's own box model, cinema handling
- `docs/src/components/studio/preview-rect.ts` — `mobileBarH` 53 → 49, new `statusH`
- `docs/e2e/studio-instant-shell.spec.ts` — the shell-vs-app oracle
- `docs/scripts/check-studio-shell.mjs` — band + geometry-seed markers
