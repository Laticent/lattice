---
status: proposed
summary: >
  Chrome and the eyebrow become curated, author-chosen type voices. Agreed with the owner: the eyebrow is content and
  must read apart from chrome; all chrome shares one style (one face, size, weight and ink, tracking set by case); the
  eyebrow gets one multi-axis front-matter key; voices are offered through autocomplete and the deck-settings
  inspector, never as free font knobs. Header and footer placement stays where it is. Defaults are open. Records the
  chrome mockups (A/B/C) and eyebrow mockups (E0–E3) tried on 2026-11-08, with the CSS that reproduces them.
---

# Type voices: chrome and the eyebrow, curated for the author

**Date:** 2026-11-09 · **Discussed with:** the owner, on PR #3095, after the anchor-chrome work
(`2026-11-08-anchor-chrome.md`) · **Status:** proposed; no code yet · **Follow-up:**
`followups.d/3095-p1-type-voices.md`

## Why this came up

PR #3095 made the chrome *correct*: one baseline in the footer band, a rail that never moves, the same type in the
browser, the PDF and the Office exports. The owner's verdict on the result was that it still looked "no better than
IKEA": consistent, but not crafted. Two causes, found by mocking the alternatives on one slide:

- **Everything small speaks in one voice.** The header, the meta line, the footer, the page number, the divider's
  count AND the eyebrow are all small monospaced capitals. Monospace signals "system"; six lines of it around one serif
  heading read like a form.
- **Content and chrome look alike.** The eyebrow is the author's own words, part of the heading, but it wears the
  chrome voice, so the top-left corner holds two lines of the same kind of type, one chrome and one content.

The owner's second point decided the shape of the answer: *craft is a choice*. What suits an art festival is wrong for
a boardroom, so Lattice should not pick one look for everyone. It should offer a few curated, well-made voices and let
the author choose.

## What chrome is

**Chrome is everything on a slide the author does not write per slide**: set once in front matter or computed by the
engine, repeated around the content. Three kinds, by job:

| Kind | Pieces | Set by |
|---|---|---|
| Identity: whose deck | header, logo, spectrum bar | `header:`, `logo:`, theme / `spectrum:` |
| Wayfinding: where am I | page number, section rail, divider marker, topic track, agenda legend, split counter | computed |
| Standing notes: what must always be said | footer, meta line, status stamp | `footer:`, `meta:`, a status class |

The heading, the body and **the eyebrow** are content. The eyebrow has a double life (authors use it for wayfinding,
"Part two", and the engine fills it on a topic slide, `02 · Section`), but it is written per slide, it says something
about this slide, and the engine already files it with the title and subtitle (`design/forms.md` §5.1,
`masthead-lede`). Note: `lib/base/base.registers.docs.md` calls `eyebrow:` one of the "marks on chrome"; that line is
wrong under this ruling and should be corrected when the work lands.

## Agreed principles

1. **The eyebrow is content.** It must read apart from chrome and belong to the heading.
2. **All chrome shares one style:** one face, one size (`--chrome-fs`, already true), one weight, one ink. Letter
   spacing is set by case, not one number: capitals take the wide value, sentence case the tight one. The footer keeps
   the author's own case (a "Confidential" line is a sentence someone wrote, and some notices must appear as written);
   forcing it into capitals was considered and rejected.
3. **Content is easy to tell from chrome.** The separation is the craft; which voice is the taste.
4. **The eyebrow stands out through the content's own type**, never the chrome face, plus at most two of: ink (accent
   to stand out, heading ink to belong), case and tracking (capitals read as a label, sentence case as a phrase), and a
   mark (`dot`, `bar`, `arrow`, `underline`).
5. **A curated guarantee:** the eyebrow must differ from the chrome in face OR in ink. When an author's choices give
   them the same face, the eyebrow takes the accent or heading ink automatically, so no combination merges content
   back into chrome.
6. **Choices are curated, offered, and completed**: one front-matter key per thing, axis words completed in the
   editor and set from the deck-settings inspector, carried by the presets. No free font knobs.
7. **Header and footer placement stays.** Chrome sits at the frame inset (30 px at hd) while content starts at 64 px.
   That difference is designed, so the frame stands apart from the content. Moving chrome onto the content edge was
   mocked (below) and declined by the owner unless a compelling reason appears.

## The proposed keys

**`eyebrow:` grows from one axis (the mark) to three**, the `progress-rail:` shape: one word per axis, a slide's own
word overriding the deck's on that axis.

| Axis | Words | Notes |
|---|---|---|
| face | `sans` · `serif` · `label` | `serif` implies italic sentence case; `sans` and `label` imply capitals. `label` is today's mono, kept so existing decks can stay as they are. |
| ink | `accent` · `heading` · `muted` | defaults by face; principle 5 can override |
| mark | `plain` · `dot` · `bar` · `arrow` · `underline` | today's values, unchanged |

```yaml
eyebrow: sans accent         # E1
eyebrow: serif               # E2
eyebrow: sans heading bar    # E3
```

**A chrome voice key** (name open: `chrome:` is taken by the manifest field, so perhaps `chrome-voice:` or
`voice:`) with curated values:

| Voice | Suits | Look |
|---|---|---|
| `system` | engineering, technical reviews | today's monospaced capitals |
| `quiet` | boardroom, finance | the body sans, small tracked capitals |
| `editorial` | culture, festivals, brand stories | the heading serif, italic, sentence case, old-style figures |

Presets carry both (`editorial` would pick the `editorial` voice and a `serif` eyebrow), so most authors make one
choice.

## What we tried (2026-11-08), and how to reproduce it

All mockups were a `style:` block in front matter over the shipped engine, on `cuoio` at hd, so nothing below is in the
code. Deck: a divider, a content slide (`header:`, `meta:`, `footer:`, eyebrow `` `Revenue · Part two` ``, heading,
three bullets), a second divider.

### Chrome voices

| | Mock | Observation |
|---|---|---|
| A | as shipped | Five lines of small mono capitals at the frame edge; reads as "system". |
| B | quiet sans | Crafted and quiet; legible at 15 px, on projectors and in the PPTX/ODP exports (Outfit is embedded). |
| C | editorial serif | The warmest; italic at ~15 px is the hardest to read on a projector or a phone thumbnail. |

B and C were mocked *with* chrome moved to the content edge (64 px); that move is now declined (principle 7). The
voices should be re-judged at the frame edge.

```css
/* B · quiet sans */
section header, section footer, section .lat-pagination, section .tile-meta, section .divider-marker { font-family: var(--font-body) !important; }
section header, section .tile-meta { letter-spacing: 0.14em !important; font-size: calc(var(--chrome-fs) * 0.82) !important; font-weight: 600 !important; }
section footer, section .lat-pagination { letter-spacing: 0.02em !important; }

/* C · editorial serif */
section header, section footer, section .lat-pagination, section .tile-meta, section .divider-marker { font-family: var(--font-display) !important; font-style: italic; text-transform: none !important; letter-spacing: 0.01em !important; font-weight: 400 !important; }
section header, section .tile-meta { font-size: calc(var(--chrome-fs) * 1.1) !important; }
section .lat-pagination, section .divider-marker-count { font-style: normal; font-variant-numeric: oldstyle-nums proportional-nums; }
```

### Eyebrow as content (chrome unchanged)

| | Mock | Observation |
|---|---|---|
| E0 | as shipped | Same voice as the header: the top-left reads as one kind of thing. |
| E1 | sans capitals, accent ink | Joins the heading, the header recedes; the annual-report move. The accent then carries meaning everywhere. |
| E2 | heading serif italic, sentence case, a little larger | Reads as the heading's opening line; warmest, least like a label; suits phrases over codes. |
| E3 | sans capitals, heading ink, short accent bar | Strongest tie to the heading; a deliberate section label, close to today's `eyebrow: bar` in sans. |

All three separate the slide into two layers, a quiet frame and a confident slide. That separation did more for the
crafted feel than the choice among them.

```css
/* shared reset for E1–E3 */
section p:has(> code:only-child):not([data-prose]) > code { background: none !important; padding: 0 !important; border: 0 !important; text-shadow: none !important; }
/* E1 */ … > code { font-family: var(--font-body) !important; font-weight: 600 !important; text-transform: uppercase !important; letter-spacing: 0.1em !important; font-size: calc(var(--chrome-fs) * 1.05) !important; color: var(--accent) !important; }
/* E2 */ … > code { font-family: var(--font-display) !important; font-style: italic !important; font-weight: 400 !important; text-transform: none !important; letter-spacing: 0 !important; font-size: calc(var(--chrome-fs) * 1.45) !important; color: var(--text-secondary) !important; }
/* E3 */ … > code { font-family: var(--font-body) !important; font-weight: 600 !important; text-transform: uppercase !important; letter-spacing: 0.1em !important; font-size: calc(var(--chrome-fs) * 1.05) !important; color: var(--text-heading) !important; display: inline-flex !important; align-items: center; gap: 0.6em; }
/* E3 */ … > code::before { content: ''; display: inline-block; inline-size: 1.6em; block-size: 2px; background: var(--accent); }
```

**Found along the way:** on a divider the eyebrow stays at chrome size beside display-size type, in every variant
including today's. Whatever the voice, the divider's eyebrow should scale with its heading.

## Open questions

- **Defaults.** What a deck with no `eyebrow:` key and no voice key looks like. Changing either default restyles every
  existing deck; keeping today's keeps content and chrome merged by default. The owner deferred this.
- **The voice key's name** (`chrome:` is the manifest field).
- **Type pairing.** What makes a festival deck feel like one is mostly the heading/body pairing (Playfair with Outfit
  for every deck today; no theme sets a font). A curated pairing, with the chrome voice and eyebrow following it, may be
  the honest axis; one coherent choice rather than several.
- **Is `label` worth keeping** as an eyebrow face once decks have moved?

## What it costs

- Each voice's fonts shipped, embedded in the PDF (HarfBuzz subsets) and in Calco's Office exports, and counted against
  the docs route budget.
- Each voice checked at every size and venue, in light and dark, for contrast, and in PDF / editable PPTX / ODP
  (the method #3095 used: render, rasterize, measure).
- Studio: inspector controls and editor completion per axis, as `progress-rail:` has.
