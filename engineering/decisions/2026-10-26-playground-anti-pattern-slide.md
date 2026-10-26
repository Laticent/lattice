---
status: shipped
summary: >
  A phone showed the owner the statute-stack "When NOT to reach for" slide clipped, with its body text about 1.2x larger than
  desktop Chromium draws it. On desktop the Playground's 862 component-gallery slides clip on 2 (list and rows stress tests);
  with body text 1.2x larger 38 clip, and the old stack clipped 48 of 117 anti-pattern slides at 1.35x. The slide moved from
  cards-stack to cards-grid columns with per-column word caps: 0 of 108 clip at 1.2x, 14 at 1.35x. The cause of the phone's
  enlargement is a hypothesis (iOS text autosizing) that this sandbox cannot check.
---

# The Playground's anti-pattern slide, and how much a showcase slide holds

## Symptom

The owner opened the Playground on an iPhone (the screenshot is 1179 px wide, an iPhone 15 Pro in portrait,
and the slide is 81% of the width, which is what the 390 px emulation here gives). The `statute-stack` slide
"When NOT to reach for statute-stack." showed three `cards-stack` cards, each clipped by a line, with the red
"OVERFLOWS" tab. The owner's read: "almost all decks in the playground suffer from content overflow."

## What was measured

Surface: the real Playground (`/playground?c=<name>&view=read`), headless Chromium 131 at 1440×900, driven with
Playwright; a slide counts as clipped when the runtime's watcher stamps `section.overflow`. Every one of the 79
component plans (862 slides) was walked.

| Condition | Slides clipped |
|---|---|
| Default render, desktop Chromium | **2 of 862**: `list` stress, `rows` stress (both already in `test/integration/overflow-baseline.json`) |
| Body text 1.2× (a CSS override on `section li li, section p`) | **38 of 886**, in 18 of 79 components: 12 variants, 9 stress, 9 composition, 5 default, 3 anti-pattern |
| The 321 example decks, committed export baseline | 11 clip, 21 pages (of 428 decks swept, 25 clip) |

So on this surface the claim "almost all decks overflow" does **not** reproduce. What reproduces is the owner's
screenshot, once body text is enlarged: the slide was drawn 4 px inside the frame (716 of 720 px). **I could not
reproduce the enlargement itself.** Chromium's mobile emulation draws the slide at the desktop scale and nothing
clips. Safari on iOS is the usual source of this symptom (long text blocks enlarged, headings not, which is what
the screenshot shows), and nothing in the preview frame opted out. That is a hypothesis. **UNVERIFIED on iOS.**

## Why the old slide had no room

`cards-stack` is calibrated for ~16 words an item (its docs say a stacked card is a short paragraph at most). The
manifests' anti-patterns run a median 29 words per card (p90 41, max 152), because the same string is the docs page's
prose. Three stacked cards of that length fill the frame.

## Candidates

One slide, the same card text, rendered through each form at 18 / 26 / 34 / 42 body words, at body size and at 1.2×.
"ok/X" is clipped-at-1.0/clipped-at-1.2; `~` is inside the 12 px fit tolerance that nothing reports.

| Form | 3 cards | 4 cards |
|---|---|---|
| `cards-stack` (old) | holds 26; clips 34 at 1.2× | clips from 18 at 1.2× |
| `cards-grid three` | **holds 42 at 1.2×**; 50 clips at 1.2×; 58 clips at 1.0× | n/a (three columns) |
| `cards-grid` (2 columns) | holds 66 at 1.2×; 82 clips at 1.2× | clips at 26 at 1.2× |
| `list-tabular` | holds 34; clips 42 at 1.2× | clips at 26 at 1.2× |
| `q-and-a` | holds 26; clips 34 at 1.2× | clips at 26 |
| `q-and-a rail` | holds 18 | clips from 18 |

A lone `cards-grid` card holds 150 words at 1.2×. The owner's "maybe a vertical version" is right: three columns
carry about half again as many words as a stack of three, because a stack spends width on two-line paragraphs and
runs out of height.

## Decision

`tools/build-component-docs.js` pages anti-patterns into columns:

- Caps by column count, title plus body: three across ≤ 42, two across ≤ 66, one ≤ 150.
- When every card fits three across, the pages balance (4 become 2 + 2, 5 become 3 + 2), so no slide holds a lone card.
- A longer card pulls its page to two across or one, and the rest pack greedily around it.
- Five manifests' longest anti-patterns were trimmed (`kpi`, `gantt`, `topic`, `state-chart`, `math`); the four over
  66 words are gone, and `math` and `state-chart` were the two that clipped at 1.2×.
- The slide carries `claim-hero` (the claim dial that drops the masthead and footer bands, `examples/claim.md`), so the cards get that height. Text size is untouched.
- The preview frame sets `text-size-adjust: 100%`. Preview only; no export byte changes.

## Result

Same 78 components, anti-pattern slides only, CLI export oracle, body text enlarged by the factor shown:

| Body text | Old stack | Columns | Columns + `claim-hero` (shipped) |
|---|---|---|---|
| 1.0× | 0 / 117 | 0 / 108 | 0 / 108 |
| 1.2× | 3 / 117 | 0 / 108 | **0 / 108** |
| 1.35× | 48 / 117 | 14 / 108 | **0 / 108** |
| 1.5× | 51 / 117 | 44 / 108 | 7 / 108 |

The columns-only 1.35× failures were all three-across slides whose longest card is 31 to 42 words. Capping three across at 30 would
have cleared them, but it makes 140 slides with 45 single-card slides, which is worse to read than a tight slide. Past 1.5×,
the fix is to stop the enlargement; no slide should shrink its type.

## Open

- **Verify the iOS cause** on a real iPhone: open `?c=statute-stack&view=read&s=anti-patterns` with and without the new
  frame rule.
- **The other 35 slides that clip at 1.2×** (outside the anti-pattern slide) belong to their components: `citation-card`,
  `regulatory-update`, `redline`, `kpi`, `pricing` and `logo-wall` are the worst. Their default and variant samples run
  past the venue the component promises.
- `list` and `rows` stress slides clip at default size. Both were already in the baseline.
- The showcase budgets are written down for authors in `design/skills/component-showcase.md`.
