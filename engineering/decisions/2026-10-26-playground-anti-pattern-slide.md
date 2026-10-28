---
status: shipped
summary: >
  A phone showed the owner the statute-stack "When NOT to reach for" slide clipped. At design size it sat 4 px inside the
  frame (716 of 720), because cards-stack is calibrated for ~16 words an item and the anti-patterns run a median 29. The slide
  is now cards-grid columns with claim-hero and per-column word caps at about two thirds of where each layout clips. All 99
  generated slides render clean at design size. Body type is never changed. Why the phone drew it larger is unverified.
---

# The Playground's anti-pattern slide, and how much a showcase slide holds

## Symptom

The owner opened the Playground on an iPhone (the screenshot is 1179 px wide, an iPhone 15 Pro in portrait, and the slide
is 81% of the width, which matches a 390 px viewport here). The `statute-stack` slide "When NOT to reach for
statute-stack." showed three `cards-stack` cards, each clipped by a line, with the red "OVERFLOWS" tab, and its body text
was drawn larger than desktop draws it. The owner's read: "almost all decks in the playground suffer from content overflow."

## What was measured

Surface: the real Playground (`/playground?c=<name>&view=read`), headless Chromium 131 at 1440×900, driven with Playwright;
a slide counts as clipped when the runtime's watcher stamps `section.overflow`. All 79 component plans (862 slides) walked.

| Condition | Slides clipped |
|---|---|
| Design size, desktop Chromium | **2 of 862**: `list` and `rows` stress slides, both already in `test/integration/overflow-baseline.json` |
| The 321 example decks, committed export baseline | 11 clip, 21 pages (of 428 decks swept, 25 clip) |

"Almost all decks overflow" does not reproduce at design size. The `statute-stack` slide did fit, but only by 4 px (716 of
720), so any difference in the viewer's rendering clips it. **I could not reproduce why the phone drew the text larger.**
Chromium's mobile emulation draws the slide at design size. iOS Safari's text autosizing is the usual source (long text
blocks grow, headings do not, which is what the screenshot shows) and the preview frame did not opt out, so it now sets
`text-size-adjust: 100%`. That is a hypothesis. **UNVERIFIED on iOS.**

Body type is a design constant; only `venue:` changes it. Nothing here scales it, and an earlier pass of this work that
stress-tested slides with enlarged text was a probe of the unreproduced symptom, not a method, so none of its numbers are
kept.

## Why the old slide had no room

`cards-stack` is calibrated for ~16 words an item (its docs: a stacked card is a short paragraph at most). The manifests'
anti-patterns run a median 29 words a card (p90 41, max 152), because the same string is the docs page's prose. Three
stacked cards of that length fill the frame.

## Candidates, at design size

The same card text through each form at 18 / 26 / 34 / 42 body words, three and four cards. "Holds" means no clipped slide
and nothing in the 12 px tolerance band that no check reports.

| Form | 3 cards hold | 4 cards hold |
|---|---|---|
| `cards-stack` (old) | 34 (42 is in the tolerance band) | 18 (26 clips) |
| `cards-grid three` | 50 (58 clips) | n/a (three columns) |
| `cards-grid` (2 columns) | 66 or more | 26 (34 is in the tolerance band, 42 clips) |
| `list-tabular` | 42 | 26 (34 clips) |
| `q-and-a` | 42 | 18 (26 clips) |
| `q-and-a rail` | 26 (34 clips) | none (18 clips) |

Then `claim-hero` (drops the masthead and footer bands, `examples/claim.md`), which gives the cards that height. Body words
per card at which the layout clips, with and without it:

| Layout | Without `claim-hero` | With `claim-hero` |
|---|---|---|
| `cards-grid three`, 3 cards | 58 | 90 |
| `cards-grid`, 2 cards | 100 | past 140 |
| `cards-grid`, 1 card | past 260 | past 260 |

The owner's "maybe a vertical version" is right: columns spend the stage's width, which a stack gives to two-line
paragraphs while it runs out of height.

## Decision

`tools/build-component-docs.js` pages anti-patterns into columns, in `claim-hero`:

- Caps by column count, title plus body: three across ≤ 60, two across ≤ 100, one ≤ 200. Each is about two thirds of the
  clip point above, so the slide keeps a third of the room unused.
- When every card fits three across, pages balance (4 become 2 + 2, 5 become 3 + 2), so no slide holds a lone card.
  A longer card pulls its page to two across or one, and the rest pack greedily around it.
- The footer `claim-hero` hides said "Anti-patterns · <name>"; the heading already names the component.
- Five manifests' longest anti-patterns were trimmed (`kpi` 152 words, `gantt` 86, `topic` 81, `state-chart` 74, `math`).
- The preview frame sets `text-size-adjust: 100%`. Preview only; no export byte changes.

## Result

All 78 components' anti-pattern slides, CLI export oracle, design size: **99 slides (was 117), 0 clipped, 0 in the
tolerance band.** Cards-per-slide: 1 slide holds a single card.

## Open

- **Verify the iOS cause** on a real iPhone: open `?c=statute-stack&view=read&s=anti-patterns` with and without the
  frame rule.
- `list` and `rows` stress slides clip at design size. Both were already in the baseline.
- The showcase budgets for authors are in `design/skills/component-showcase.md`.
