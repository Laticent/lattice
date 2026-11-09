---
status: proposed
summary: >
  The hierarchy / tension / isolation study the type-voices work asked for first. Measures every text role on nine
  real slides (face, size, weight, case, tracking, ink) with `tools/type-voice-audit.mjs`, counts the axes that tell
  each pair of roles apart, and finds four content-against-chrome pairs that differ on none: the eyebrow against the
  header and the meta line, and the chart's ticks against the page number and the source line. Sets nine rules any
  curated pairing, chrome voice or eyebrow style must keep. Three findings change the plan: ink alone cannot separate
  the eyebrow from chrome (accent and muted sit under 0.1 apart in OKLab in 10 of 28 theme × mode pairs, so the face
  must differ, always); a "quiet" chrome voice in the body sans moves the collision onto chart labels and the quote
  attribution instead of removing it; and Playfair Display and Fraunces have no tabular figures, so they cannot set
  chart data labels. Mockups of ten type recipes, in light and dark on three decks, go to the owner for the pick.
---

# Type hierarchy, tension and isolation: the study behind curated type

**Date:** 2026-11-09 · **Parent:** `2026-11-09-type-voices.md` (§ Widened scope, point 1) · **Follow-up:**
`followups.d/3095-p1-type-voices.md` · **Status:** proposed; the rules are the study's, the defaults are the owner's

## The answer first

Today's type has a sound ladder for content and no separation between content and chrome. Five small roles (the
header, the meta line, the footer, the page number and the eyebrow) share one face, one size and nearly one ink, and
the chart's own small text joins them. The fix is not a better chrome font. It is a rule that **the chrome face is
reserved**: no content role that sits near chrome may wear it, and the eyebrow always changes face, because ink alone
fails in a third of our themes. Every pairing we ship must pass the nine rules in §4, and `tools/type-voice-audit.mjs`
checks them on a fixed probe deck.

## 1 — Words

- **Hierarchy** is the order a reader takes a slide in. Size, weight, face, ink and position set it.
- **Tension** is the contrast between two levels. A 64 px serif heading over a 21 px sans body pulls hard; two weights
  of one sans at one size barely pull at all.
- **Isolation** is what lets one element stand alone: space around it, or a difference no neighbor shares.
- A **role** is a job a run of text does, whatever component draws it: the eyebrow, the h2, a chart's tick label.
- An **axis** is one way two roles can differ. The study counts five: **face** (family, or italic against roman),
  **size** (at least 1.2× apart), **weight** (at least 200 apart), **case** (capitals against as written) and **ink**
  (at least 1.5:1 apart in luminance, or at least 0.1 apart in OKLab so a change of hue counts).
- A **collision** is two roles on one slide that differ on zero or one axis. A reader cannot tell them apart at a
  glance.

## 2 — How it was measured

`node tools/type-voice-audit.mjs [--theme t] [--mode light|dark] [--style recipe.css] [--json]` writes a fixed probe
deck (title; a content slide with `header:`, `meta:`, `footer:` and an eyebrow; divider; quote; big number; cards; bar;
piechart; line chart with a source line), renders it with the real CLI to HTML, opens it in Playwright Chromium at
1280 × 720 and reads the computed style of every visible text run. SVG text is scaled by its screen matrix, so a
chart label reports the size a reader sees. It files each run under a role, counts the axes between every pair of
roles that share a slide, and measures the gaps on the content slide. It warns when a family it measured never
loaded, because a computed `font-family` names the face asked for, not the face drawn.

Face metrics (x-height, cap height, average advance) were read with the canvas API from the shipped woff2s and from
the candidate faces' Fontsource variable files; figure widths and OpenType features were read with fontTools.

**A trap found on the way:** the CLI's PNG and PDF path does not load fonts a deck's `style:` block declares with
`@font-face` and a local URL; the HTML path does. The first round of mockups rendered in a Times-like fallback without
any error. Every mockup below was rendered to HTML and screenshotted in Chromium after `document.fonts.ready`, with a
check that each family it uses has a loaded face.

## 3 — What today's type does

### 3.1 The ladder, measured (cuoio, light, 1280 px wide)

| Role | Face | px | Weight | Case · tracking | Contrast |
|---|---|---|---|---|---|
| hero figure | Playfair Display | 114.7 | 700 | as written | 6.0:1 |
| heading: h1 (title), h2 (divider) | Playfair Display | 64 | 700 | as written | 16.2:1 |
| heading: h2 | Playfair Display | 37.3 | 700 | as written | 16.2:1 |
| subtitle | Outfit | 28 | 300 | as written | 7.9:1 |
| quote | Playfair Display italic | 28 | 400 | as written | 16.2:1 |
| hero caption | Outfit | 28 | 400 | as written | 5.9:1 |
| body | Outfit | 21.4 | 400 | as written | 5.9:1 |
| card title | Outfit | 21.4 | 700 | as written | 16.2:1 |
| chart: key label · key value | JetBrains Mono | 19.9 | 400 · 600 | as written | 5.9 · 16.2:1 |
| chart: data label | Playfair Display | 18.6 | 700 | as written | 16.2:1 |
| chart: category | Outfit | 17.4 | 400 | as written | 5.9:1 |
| **eyebrow** | **JetBrains Mono** | **15** | **600** | **capitals · 0.18em** | **5.1:1** |
| **chrome: header · meta** | **JetBrains Mono** | **15** | **500** | **capitals · 0.08em** | **5.1:1** |
| chrome: footer · page number | JetBrains Mono | 15 | 500 | as written · 0.06em | 5.1–6.1:1 |
| quote attribution | Outfit | 15 | 400 | as written | 5.1:1 |
| chart chrome: source line | JetBrains Mono | 15 | 500 | as written · 0.06em | 5.1:1 |
| chart: direct label | Outfit | 14.1 | 600 | as written | 6.6:1 |
| chart: tick | JetBrains Mono | 13.1 | 400 | as written | 5.1:1 |

**The content ladder is healthy.** On a content slide the steps are chrome 15 → body 21.4 → heading 37.3 (1.43×, then
1.74×); on the title, 15 → 28 → 64 (1.87×, 2.29×). Heading and body differ on face, size, weight and ink. Nothing in
the study argues for changing a `--fs-*` coefficient.

**The bottom of the ladder is crowded.** Seven roles sit between 13 and 15 px, and five of them are JetBrains Mono.

**Mono reads larger than its size.** JetBrains Mono's x-height is 0.55 em; Outfit's is 0.48. At 15 px the chrome's
lowercase stands 8.3 px tall against the body's 10.3 px, so the body is only 1.25× the chrome where the type sizes say
1.43×. The chrome is louder than the ladder intends, and wider too (0.60 em average advance against Outfit's 0.42).

### 3.2 Collisions, today

Pairs that share a slide and differ on zero or one axis (cuoio light; the other themes and dark mode give the same
set, plus the footer against the page number and the source line in dark):

| Pair | Axes apart | What a reader sees |
|---|---|---|
| eyebrow ~ chrome: header | **0** | Two lines of small tracked mono capitals at the top left, one the author's, one the deck's |
| eyebrow ~ chrome: meta | **0** | The meta line sits **on the eyebrow's row** (both at 102 px from the top), same voice: one line, two owners |
| chart: tick ~ chrome: page number | **0** | The scale reads as chrome |
| chart: tick ~ chart chrome: source line | **0** | The source line reads as one more tick row |
| eyebrow ~ footer, page number, source line | 1 (case) | |
| chart: category ~ page number, source line | 1 (face) | |
| quote attribution ~ page number | 1 (face) | |

The first two are the owner's "content and chrome look alike", now measured. The third and fourth are new: the chart's
scale is drawn in the chrome face.

### 3.3 Isolation by space

On the content slide the eyebrow sits **8 px** above the heading and **53 px** below the header: a 6.6 : 1 proximity
ratio, so space already files the eyebrow with the heading. The voice undoes what the space does. On a divider the
eyebrow is 15 px beside a 64 px heading (1 : 4.3), small enough to read as a stray label: the note's "divider eyebrow
should scale with its heading", measured.

### 3.4 Ink cannot carry the eyebrow alone

Principle 5 of the type-voices note lets the eyebrow differ from chrome "in face OR in ink". The audit measured the
accent (a `sans accent` eyebrow) against the chrome's muted ink on every theme in both modes:

| | OKLab distance accent ↔ muted | Luminance ratio |
|---|---|---|
| under 0.1 (reads as one ink) | brina L, burgundy D, crepuscolo D, cuoio L/D, indaco L, laguna L, magnolia L/D, mustard L | 1.01–1.37 |
| 0.1–0.2 | brina D, burgundy L, carbone L, carta L/D, crepuscolo L, indaco D, laguna D, mustard D | 1.07–1.79 |
| over 0.2 | ardesia L/D, atelier L/D, carbone D, concrete L/D, onyx L/D | 2.0–4.1 |

**10 of 28 theme × mode pairs give an accent within 0.1 of the muted gray.** Themes tint their muted ink toward their
own hue, so the accent and the gray are cousins. Ink is a second axis where a theme gives it, never the first.

### 3.5 Charts

| Part | Today | Problem |
|---|---|---|
| Data label | Playfair Display 700, 18.6 px | **No tabular figures**: Playfair carries no `tnum` and its digits run 370–451 units wide, so a column of values does not align |
| Category | Outfit 400, 17.4 px | 1.07× below the data label; separated by face and weight only |
| Tick | JetBrains Mono 400, 13.1 px | Collides with the page number and the source line (0 axes) |
| Key label · value | JetBrains Mono 400 · 600, 19.9 px | The key reads as chrome, and at 19.9 px it is larger than the eyebrow and nearly the body |
| Source line | JetBrains Mono 500, 15 px | Identical to the footer, which sits right below it |

None of the chart's sizes is on the `--fs-*` ladder: the kernels draw in viewBox units and the SVG scales to its box, so
the same role is 13–20 px depending on the chart kind. The chart's internal order still holds (data label > category >
tick), but by face and weight more than by size.

### 3.6 The candidate faces

| Face | Role | x-height | Avg. advance | Tabular figures | Axes | Latin file(s) |
|---|---|---|---|---|---|---|
| Outfit (shipped) | body | 0.48 | 0.42 | via `tnum` | static | 5 × 14–32 KB |
| Playfair Display (shipped) | display | 0.52 | 0.45 | **none** | wght | 4 × 38 KB |
| JetBrains Mono (shipped) | label | 0.55 | 0.60 | by design | wght | 3 files |
| Inter | body | 0.55 | 0.45 | via `tnum` | wght | 48 KB |
| Space Grotesk | display | 0.49 | 0.47 | via `tnum` | wght | 22 KB |
| Newsreader | display / text | 0.45 | 0.41 | by default | wght | 58 + 65 KB (italic) |
| Lora | display / text | 0.50 | 0.45 | via `tnum` | wght | 38 + 41 KB |
| Fraunces | display | 0.44 | 0.36 | **none** | opsz, wght, SOFT, WONK | 121 + 150 KB |
| Source Serif 4 | display / text | 0.46 | 0.39 | by default | opsz, wght | 122 + 130 KB |
| Barlow Condensed | display (the Impact role) | 0.52 | 0.35 | via `tnum` | static | ~22 KB per weight |

Two consequences. **Swapping the body face changes its apparent size and width**: Inter at Outfit's size stands 15%
taller and sets 9% wider, which moves every fit the engine measures. **Fraunces and Playfair cannot set a figure that
must align.**

## 4 — The rules every curated choice keeps

1. **Two layers.** Every content role and every chrome role that share a slide differ on at least two axes.
2. **The eyebrow changes face.** The eyebrow never shares the chrome's face (§3.4). Ink, case and a mark are second
   axes. This tightens principle 5 of the type-voices note from "face OR ink" to "face, plus one more".
3. **The chrome face is reserved below the body.** No content role at or below `--fs-body-compact` (chart ticks, keys,
   categories, the quote attribution, a caption) may speak in the chrome voice's face and case. When the chrome voice
   uses a face content also uses (the body sans), chrome must add capitals, a different weight or a different ink on
   *every* piece, the page number included.
4. **The meta line keeps the chrome voice.** It shares the eyebrow's row; the row reads as two things only when the
   two speak differently.
5. **Measure tension in x-height, not in px.** Adjacent levels on one slide stay at least 1.25× apart in x-height (today's
   chrome-to-body step, the tightest one we accept). A pairing whose body face has a different x-height from Outfit
   carries a size factor that holds the body's x-height at today's value (10.3 px at 1280). Office exports have no
   `font-size-adjust`, so the factor is baked into the size, not left to CSS.
6. **Proximity groups the eyebrow with its heading.** The eyebrow-to-heading gap stays at most a quarter of the
   header-to-eyebrow gap (today 8 : 53). A larger eyebrow face (the serif eyebrow is 1.45× chrome size) must not close
   that ratio.
7. **An anchor's eyebrow scales with its heading** (half the heading's size on a divider or a title), whatever its
   voice.
8. **Figures align in every face.** A face sets a chart data label, a tick or a key value only if it has tabular
   figures (by default or by `tnum`); the CSS asks for `tabular-nums lining-nums`. A display face without them
   (Playfair Display, Fraunces) hands data labels to the body face.
9. **A chart has one voice and its own order.** Category labels, ticks, keys and data labels speak the chart voice;
   the source line and status speak the chrome voice; the chart heading follows the content pairing. Inside the chart,
   data label > category > tick, and the key never outranks the slide's body.

## 5 — The recipes, audited

Each recipe is a pairing, a chrome voice and an eyebrow style, mocked as a `style:` block over the shipped engine
(fonts from Fontsource, all OFL). The chart's own text takes the body face with tabular lining figures and the data
labels take the heading face, in every recipe but `classic`. Counts are content-against-chrome pairs on one slide,
from the audit tool on cuoio light:

| Recipe | Heading + body | Chrome voice | Eyebrow | 0-axis | 1-axis | Rules it breaks |
|---|---|---|---|---|---|---|
| `classic` (today) | Playfair + Outfit | system (mono) | label (mono) | 4 | 13 | 1, 2, 3, 4, 8 |
| `ledger` | Newsreader + Inter | system (mono) | serif | **0** | **6** | 1, only for the page number and source line against small chart text (face alone) |
| `technical` | Space Grotesk + Inter | system (mono) | sans accent | 0 | 8 | 1: eyebrow against header and meta by face alone |
| `salon` | Newsreader + Inter | editorial (serif italic) | sans heading bar | 0 | 8 | 1: chart text against chrome by face alone |
| `editorial` | Newsreader + Inter | editorial | serif | 0 | 14 | 1, 2: the serif eyebrow and serif chrome share a face, size apart only |
| `lora` | Lora + Inter | editorial | serif | 0 | 14 | as `editorial` |
| `festival` | Fraunces + Inter | editorial | serif | 0 | 14 | as `editorial`, and 8 (Fraunces has no tabular figures) |
| `minimal` | Inter + Inter | quiet (body sans) | sans heading bar | 6 | 10 | 1, 2, 3 |
| `board` | Source Serif 4 + Inter | quiet | sans accent | 6 | 15 | 1, 2 (ink only), 3 |
| `poster` | Barlow Condensed + Inter | quiet | sans accent | 6 | 15 | 1, 2, 3 |

`ledger` and `salon` were not in the original mockups. The rules pointed at them: give the eyebrow and the chrome two
different faces, neither of which small content uses. Every recipe was rendered on a board deck (indaco), a festival
deck (cuoio) and a chart-heavy deck (indaco), in light and dark, 280 slides in all; the comparison sheets are in
`2026-11-09-type-hierarchy-study/`.

What the audit says:

- **The quiet voice breaks rule 3 by construction.** Chrome in the body sans, at chrome size, in the author's case,
  matches the chart's category and direct labels, the quote attribution and the ticks on every axis: 6 zero-axis pairs
  in every quiet recipe. It cleans up the top of the slide and dirties the chart. To keep it, chrome must take capitals
  everywhere (the owner rejected that for the footer) or a distinct weight and ink on every piece.
- **The mono voice and the editorial voice keep chrome apart from content.** Both use a face no small content role
  uses. What is left is mostly the page number, which is digits and so has no case to differ by.
- **The eyebrow and the chrome must not take the same "special" face.** A serif eyebrow under serif-italic chrome
  (`editorial`, `lora`, `festival`) or a sans eyebrow under sans chrome (`board`, `poster`, `minimal`) leaves the two
  apart by size alone. Cross them: serif eyebrow with mono chrome (`ledger`), or sans eyebrow with serif chrome
  (`salon`).

What the renders say, which the numbers do not:

- **The variable serifs look light at title size.** Newsreader at 500, Lora and Source Serif 4 at 600 read thinner
  than Playfair at 700 on a 64 px title; Source Serif 4's optical size axis thins its strokes further as it grows. A
  serif heading face needs 600–700 at display sizes, or the heading loses the tension it has today.
- **The title slide's eyebrow is as stranded as the divider's**: 15 px above a 64 px heading. Rule 7 extends to the
  title.
- **Italic chrome at the frame edge is the hardest voice to read.** At about 16 px on a projector or a phone
  thumbnail, the editorial voice's footer and page number lose their counters. It suits a festival cover; it is weak as
  a default.
- **Barlow Condensed and Fraunces give the most distinct looks.** `poster` reads as a campaign and `festival` as a
  cultural program at a glance, which is the "craft is a choice" the owner asked for. Both still need the chrome and
  eyebrow fixes above.

## 6 — What the study does not decide

The owner's, with the mockups as evidence (`followups.d/3095-p1-type-voices.md`): the default pairing, chrome voice and
eyebrow style; the chrome-voice key's name; which recipes ship and which preset carries which; whether `quiet` ships
with all-capital chrome or not at all. The study's rules hold whichever way those go, and the audit tool checks them.

## 7 — Evidence

Comparison sheets, every recipe in light and dark (left and right of each pair), rendered with the fonts loaded and
checked (`2026-11-09-type-hierarchy-study/`):

| Sheet | What to look at |
|---|---|
| `corner-eyebrow-vs-chrome.jpg` | The top-left corner of the content slide, all ten recipes: the eyebrow against the header and the meta line on its row |
| `board-content.jpg` · `board-title.jpg` | A board deck (indaco): the full content slide and the title |
| `festival-title.jpg` · `festival-quote.jpg` | A festival deck (cuoio): the cover and a pull quote |
| `chart-bar.jpg` · `chart-pie.jpg` | A chart-heavy deck (indaco): data labels, categories, the key and the source line |

Re-run any number in this note with `node tools/type-voice-audit.mjs --theme <t> --mode <m> [--style <recipe.css>]`.
A recipe file is plain CSS: `@font-face` rules with absolute `file://` URLs, then the token and selector overrides the
type-voices note lists under § What we tried.

Not yet verified, because nothing ships yet: the editable PPTX and ODP exports and the PDF's font embedding for the new
faces. Those are verified on the implementation, not on mockups that load fonts through a `style:` block.
