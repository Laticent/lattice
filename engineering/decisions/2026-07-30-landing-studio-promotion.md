---
status: in-progress
summary: The landing page promotes the Studio by selling TWO doors into one engine rather than three products. The hero's primary CTA moves from the Playground to the Studio and gains a one-line router ("Same engine, same output."); a new section 3 — "The Studio puts the engine in a window." — proves the claim with a live render of the deck the Studio actually boots into, three capability rows, and two honesty blocks. It costs no net section: "Bring your own model" is ABSORBED into it, every string verbatim, so the page carries one AI conversation instead of two. Chosen from a 5-track design competition on a risk-first basis: it is the only candidate designed backwards from the three ways this ships and fails (three doors; "Preview" reading as "unfinished"; the deterministic-engine wedge dissolving into "another web slide app"). Landed as a PROTOTYPE for human review — not verified against the full quality bar; see §7.
---

# Promoting the Studio on the landing page (2026-07-30)

> Status: **prototype, built and screenshotted** — the code is on
> `claude/studio-homepage-promotion-91r6xm`. This is the landing half of
> `2026-07-03-studio-succession.md` §6 P4; the nav half shipped separately in
> #1274.

## The problem

`lattice.style` sold Lattice as a Markdown→PDF engine and its only "do something
now" CTA was the Playground. The Studio — the mature, customer-facing in-browser
workspace — appeared nowhere on the page except the footer link list. Meanwhile
the nav change (#1274) put the Studio first on every surface, so the page and
the chrome disagreed about what the product's front door is.

## How this design was chosen

A 5-track design competition (`.claude/workflows/design-competition.js`), one
assigned perspective per track, each iterating internally against a brief
carrying the positioning contract, the protected copy lines, the BYOK honesty
constraint, the three breakpoints, and the perf budget.

**The run was cut short at 11 agents on the owner's instruction.** Three stages
therefore never ran: the fresh-eyes critiques were **not folded back** (2 of 5
returned, 13 and 14 findings, unapplied), **no shared fact-check** ran over the
candidates' claims, and **no comparative judge** ran. The pick was a human
call on a summary; the "winner" is a chosen candidate, not a scored one.

The five: *The Second Door* (leverage-existing), *The Front Door* (user-first),
**The Two-Door Hero** (risk-first — this one), *The fold is the front room*
(contrarian), *The Front Door Slice* (incremental).

## The three failures this design is built against

| | The failure | The structural answer |
|---|---|---|
| **F1** | **Three doors.** The visitor sees engine / Playground / Studio and can't tell which is theirs. | The fold offers exactly TWO doors — browser and machine — closing on `Same engine, same output.` The Playground moves to where it is genuinely the right tool. |
| **F2** | **"Preview" reads as "unfinished."** The nav badge stays; a landing that hypes the Studio while the nav whispers "Preview" is a trust contradiction. | The section names the badge itself, first, in our words — converting it from a *stability* doubt to a *scope* statement, with the escape hatch (export, whole-workspace backup) in the same breath. |
| **F3** | **"Yet another web slide app."** The deterministic-engine wedge dissolves. | Order (the Studio sits AFTER "How it works", so the text-file→engine model is read first), framing (the H2 subordinates the Studio to the engine), and consolidation (one AI conversation, wearing the disclaiming eyebrow). |

## What changed

**Hero** (`HeroCopy.tsx`). Eyebrow, H1, lead, and the gallery link are untouched.
The primary CTA re-points to `/studio/` as `Open the Studio`; `Get started` stays
a first-class outline button, because the engine is still the product. A new
router line sits under the buttons, and the trust line is trimmed — its "laptop
or CI" clause moved up into the router, where it is attached to a door and does
more work.

**New section 3 — the Studio** (`sections.tsx`: `StudioCopy`, `StudioActions`,
`StudioHonesty`; `StudioPreview.tsx` for the island). An inset `bg-card` panel
carrying the headline *The Studio puts the engine in a window.*, three capability
rows, the CTAs, a live render, and the two honesty blocks.

The **Review** row is the load-bearing sentence: *"The same deterministic review
the command line runs — a scorecard, and a named fix for each finding."* It is
what makes "web slide app" impossible to say, and it is **verified true** —
`studio/coach/coach-core.ts` runs the generated `scorecard.scoreDeck` over
`lintCore` + `reviewCore` findings, and the Studio's old 3-check heuristic was
deleted when that landed.

**Everything displayed in the preview is derived, never transcribed:** the deck
title, the slide count, and the rendered slide all come from `DECKS[0]` at build
time — the deck the Studio actually boots into. The count reads
`slides.length`, deliberately **not** the deck's hand-written `meta: '7 slides'`
string, which can rot independently.

**"Bring your own model" is absorbed, not deleted.** Its eyebrow, heading words,
body paragraph, and `How AI authoring works →` link all survive verbatim inside
honesty block B; it loses only its `h2` altitude and its own band. One new
sentence is added, and it is literally true: *switch the AI off entirely and the
Studio still edits, reviews, presents, and exports.*

**Field cards** now say `Edit this in the playground` — the Playground gets its
job assigned at the one moment it is the better tool (each card holds a single
component's sample: a slide verb, not a deck verb).

**Next-steps card 4** re-points to the Studio and names the playground inline.
The card list moved from `index.astro` into `sections.tsx` as `nextStepsFor(url)`
— card 4's body carries a link, and **JSX cannot appear in Astro frontmatter**;
it is also the more consistent home, since every other block of landing copy
already lives in that module.

**Band alternation** (a regression this change would otherwise create). Removing
the BYOM band left Proof and Showcase adjacent and both plain. Fixed in the same
change per HARD RULE #18: Showcase inherits the vacated `border-y bg-muted`, and
Next steps drops `bg-muted` while keeping its top rule.

## Deviations from the competition design, and why

1. **The section is composed by Astro, not by one React component with
   `children`.** The design had `StudioSection` take the preview as `children`.
   Astro does not support a `client:` island nested inside a server-rendered
   React component's children — it throws an invalid-hook-call during SSR. So
   Astro owns the panel and the grid, React owns the content: exactly the split
   `HeroCopy` / `HeroPreview` already uses.
2. **Three grid children, not two.** The design's mobile order put the CTAs
   directly under the preview, arguing the impulse to open peaks the moment the
   visitor has seen the slide. A two-child grid can't do that — the whole prose
   column stacks above the preview. `StudioActions` is therefore its own grid
   child, placed into column 1 row 2 at `lg`. Stacked order is now prose →
   preview → button. The design's exact order also put the rows *after* the
   CTAs on mobile; that part is not reproduced, and the conversion argument it
   was making is satisfied without it.

## What this costs

- **Scroll depth.** ≈ +300px net on desktop (≈ 700px added, ≈ 400px removed
  with the BYOM band), ≈ +800px on mobile. "Why decks drift" and the Proof strip
  move down by roughly the new section's full height. This is the design's
  largest genuine cost and it was accepted, not hidden.
- **The Playground loses the hero.** Deliberate reallocation. Reversible with
  one prop (`studioHref` → `playgroundHref`).
- **One new island**, `client:visible`, reusing the existing `<DeckPreview>` →
  `single-slide-render.ts` bridge. No new preview builder, so HARD RULE #22
  needs no `SANCTIONED_PREVIEW_BUILDERS` entry. The engine bundle is already in
  flight from the hero's `client:load` preview, so this adds no new network
  bytes — but that is an argument, not a measurement (§7).

## 7. Verification status — what is and isn't checked

**Done:** `npm run typecheck` (docs), `npm run lint`, `npm run build:check`, the
unit suite (4,749 tests), the landing vitest specs (including a new
`StudioPreview.test.tsx` that pins the derived slide count), and full-page +
per-section captures at 1440 / 820 / 390 in **both** light and dark, with the
island scrolled into view so it actually hydrates.

### The band change DID create a regression, and it is fixed

The predicted risk was real. The restyle carousel's stage was `bg-muted`, and
this change moved that section onto a `bg-muted` band — so the figure's fill
resolved to the **exact same color** as the band behind it. Measured, not
eyeballed, in two palettes × two modes:

| | band | figure (before) |
|---|---|---|
| indaco light | `rgb(242,245,250)` | `rgb(242,245,250)` |
| indaco dark | `rgb(0,40,71)` | `rgb(0,40,71)` |
| cuoio light | `rgb(243,237,228)` | `rgb(243,237,228)` |
| cuoio dark | `rgb(30,26,21)` | `rgb(30,26,21)` |

**The design's pre-agreed fix (`bg-muted` → `bg-card`) does not work**, and that
is worth recording: in this token bridge `--card` and `--muted` resolve to the
same value, so the swap is a no-op that *looks* like a fix. The applied fix is
`bg-background`, which genuinely differs on both sides (light 255,255,255 vs
242,245,250; dark 0,29,51 vs 0,40,71). Re-measured: distinct in all four
combinations.

**Scope of the symptom, honestly:** it only shows in the pre-render window —
once the engine paints, the slide's own palette background fills the figure, so
a rendered carousel looked fine throughout. But that window is exactly what a
slow connection sits in, and a same-tone tripwire that only a border rescues is
the kind of thing that rots. Fixed rather than filed, per HARD RULE #18, because
this change caused it.

**Still NOT done:**

- Only `indaco` and `cuoio` were viewed — a cool and a warm palette, not all 14.
- No perf measurement. The "zero new network bytes" claim is reasoning from the
  fact that the hero's `client:load` preview already fetches the engine bundle,
  not a captured waterfall.
- No adversarial trio (HARD RULE #25) has been run on this design, and the two
  returned competition critiques (13 + 14 findings) are still unapplied.
- Nothing has been tapped on a real device; 390px is emulation (HARD RULE #23).

**Pre-existing, not caused here:** the docs dev server logs an
`Invalid hook call` warning during SSR of the landing page. It reproduces on
unmodified `main` with these changes stashed, and the page renders correctly
either way. Logged, not fixed — off this change's path (HARD RULE #18).
