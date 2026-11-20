---
status: proposed
summary: The deck-look preset works because it turns about ten dials into one choice among four pictures. Two more Studio surfaces have the same problem at a larger scale. The slide panel has about 40 controls, and the Share sheet asks for a format and then a different options sheet per format. This note proposes slide LOOKS (Standard, Spotlight, Contrast), named in the slide's class line and expanded in the shared kernel the way `preset:` is, and Share PURPOSES (Send for review, Hand out, Keep editing in PowerPoint, Post online, Print handout) that pick the format and its switches. A prototype built on real engine renders shows that Spotlight and Contrast read clearly at tile size, and that Clean barely differs from Standard. The owner chose, in one round: a `look-*` class token the shared kernel expands; three looks (Standard, Spotlight, Contrast) with Clean kept as today's switch; Share purpose-first with format as the escape hatch; slide looks built first.
companion:
  - ./2026-09-26-deck-presets-and-settings-tiers.md
  - ./2026-07-03-slide-context-editor.md
---

# Slide looks and Share purposes

**Date:** 2026-11-20 · **Status:** proposed; the forks are owner-settled (2026-11-20, one round, §6); nothing is built

The ask: *"The Studio is getting way too complicated even for me to remember what's what. I
love the presets we have for the deck look. I wonder if there are more opportunities to
introduce presets elsewhere? How would that change the user experience?"* Then: *"let's
prototype and design."*

This reopens one point the owner settled on 2026-09-26: "Which panels: both, presets
deck-only" (`2026-09-26-deck-presets-and-settings-tiers.md` §2). The owner asked for it to be
reopened, so this note treats it as a new question, not as drift.

## 1. The problem, measured

| Surface | Controls today | Where counted |
|---|---|---|
| Deck look | 4 presets in front of about 46 controls | `2026-09-26-…` §1 (shipped) |
| This slide | about 40 labeled controls; Basic shows 3 (Canvas, Type scale, Clean slide) plus the note | `docs/src/components/studio/SlideContext.tsx`, `label="…"` rows |
| Share | a format first, then its own sheet: PDF and PowerPoint 6 switches, Image set about 12 choices, Print 4, Webpage 4, Narration 3 | `ExportOptionsPanel.tsx`, `ImageSetOptionsPanel.tsx`, `PrintOptionsPanel.tsx`, `WebpageOptionsPanel.tsx`, `NarrationExportOptions.tsx` |

The slide panel's Basic tier already helps, but it answers "which dials matter?" with three
dials, not with a look. An author who wants "make this the slide that lands" still has to
know that means accent title, card rails, a glow and one size up.

## 2. The pattern being copied

The deck preset (`lib/core/resolve-preset.js`, table in `lib/core/front-matter-key.js`) has
four properties, and every new preset surface should keep all four:

1. **A few options that look clearly different.** Three to five, each with something big.
   Round two of the deck presets failed this test first (§7 of the 2026-09-26 note).
2. **Named in the source.** The deck says `preset: editorial`, so it remembers its look, and the
   CLI renders the same thing as the Studio (HARD RULE #1).
3. **The dials become overrides.** Picking a value equal to the preset's own clears the key;
   the panel says "Editorial · 2 changes" with a Reset.
4. **Live previews in the deck's own theme.** The picker shows the result, not a description.

## 3. Slide looks

### 3.1 The candidates, rendered

A 16-slide deck (two layouts, `cards-grid` and `big-number`, under four looks, under the
`classic` and `editorial` deck presets, theme `indaco`) was rendered through the CLI. The
token sets below are the second round. The first round's Spotlight (`accent spectrum-solid
rule-accent tint-spotlight scale-l`) changed only the title color and a faint glow, and read as
Standard at tile size; card rails and an eyebrow bar fixed it.

| Look | Class tokens it expands to | What a reader sees | Distinct at tile size? |
|---|---|---|---|
| Standard | none | The deck's look | (baseline) |
| Spotlight | `accent rule-accent with-spectrum-card spectrum-card-solid tint-spotlight scale-l eyebrow-bar` | Accent-colored title, rails on the cards, a soft glow, one size up | Yes |
| Contrast | `dark silent tint-ambient scale-xl` | A dark slide, no header/footer/page number, larger type | Yes, strongly |
| Clean | `silent no-spectrum no-finish no-treatment flat no-heading-rule` | No bar, footer, page number, backdrop or heading rule | **No.** On a cards or number slide it differs from Standard by the footer line and a hairline rule |

The prototype (a clickable page on the real renders; regenerate the renders with the
script under "Reproduce" below) lets the owner switch deck preset, slide layout and look.

### 3.2 Rules that keep slide looks from fighting deck presets

- **Order of precedence:** the deck preset, then the slide look, then any dial the slide sets by
  hand. A dial always wins, as with deck presets.
- **A slide look changes EMPHASIS, never IDENTITY.** It never sets headline alignment,
  typography set, theme or finish choice. Those belong to the deck, and an Editorial deck
  must stay left-aligned on a Spotlight slide. In the render, Editorial's ledger rail and
  left alignment survive every look. Clean removes the finish (`no-finish`) rather than
  choosing a different one, which is still within this rule.
- **Which layouts accept each token is still open.** Of the 16 tokens in §3.1, five are in
  `universalGroups` (`dark`, `silent`, `scale-l`, `scale-xl`, `no-treatment`) and one is in
  `semiUniversalVariants` (`accent`), in `dist/docs/components.json` `vocabularies`. The other
  ten (`rule-accent`, `eyebrow-bar`, `flat`, `with-spectrum-card`, `spectrum-card-solid`,
  `tint-spotlight`, `tint-ambient`, `no-spectrum`, `no-finish`, `no-heading-rule`) are listed
  only in `modifierGroups` (rule, eyebrow, lift, card rail, decoration, switches). The build
  PR must check every token against each layout's accepted modifiers, and decide whether a
  look applies only the tokens a layout accepts. The card rail does nothing on a layout
  without cards, so Spotlight is weaker on a `quote` slide than on `cards-grid`.

### 3.3 Where a look lives (fork F1)

| Option | What the source says | Buys | Costs |
|---|---|---|---|
| **A. A class token expanded in the shared kernel** (recommended) | `<!-- _class: cards-grid look-spotlight -->` | The slide remembers its look; "Spotlight · 1 change" is exact; the CLI, Studio and agents all read one word; matches `preset:` | An engine change: the class reader must expand `look-*` before every consumer sees the token list, and the lint vocabulary, Studio serializer and `components.json` must learn the family |
| B. The Studio writes the tokens | `<!-- _class: cards-grid accent rule-accent with-spectrum-card … -->` | No engine change | The slide forgets which look it came from. Up to 7 tokens on the class line. The change count has to be guessed by matching, and is wrong after any hand edit. This is the option the owner rejected for decks in 2026-09-26 §2 |

### 3.4 How many looks (fork F2)

- **Three (Standard, Spotlight, Contrast)** (recommended), and the existing **Clean slide**
  switch stays where it is in Basic. Every tile is visibly different, and "Clean" stays the
  one-switch job it already is.
- **Four, with Clean as a look.** Covers the full-bleed photo case by name, but its tile looks
  like Standard's on most layouts. It would need a photo sample slide in its tile to read, and
  the tiles render the author's own slide.

### 3.5 The panel

The slide panel's Basic tier becomes: **Look** (the 2×2 or 1×3 tiles, live, on the author's
own slide), the look's one-line blurb, the status line ("Spotlight · 1 change · Reset"),
Canvas, Type scale, Clean slide, and the note. Advanced keeps every dial as today. Live
tiles reuse the preview pool the deck preset tiles use (`settings-dock.tsx` explains why the
pool must outlive the panel on WebKit); a slide panel must not add a second pool.

## 4. Share purposes

### 4.1 The candidates

| Purpose | Format | Switches it sets (labels as in today's sheets) |
|---|---|---|
| Send for review | PDF | Add comments as sticky notes on; Which comments to include: Open only; Re-openable in Lattice on; Strip speaker notes off |
| Hand out | PDF | Strip speaker notes on; Add comments as sticky notes off; One page per step off; Re-openable in Lattice off |
| Keep editing in PowerPoint | PowerPoint | Editable text on; Re-openable in Lattice on |
| Post online | Webpage | Color mode: System; Animate charts on; Strip speaker notes on; Embed pictures from other sites on |
| Print handout | Print | Paper size: Auto (least-wasteful fit); Layout: Notes; Color: Black & white |

### 4.2 How it behaves

The sheet asks "What is this copy for?" and shows the purpose tiles; the chosen purpose lists
what it sets and why, with **Export**. "Change details" opens today's options sheet with the
purpose's values filled in, and any change shows as "Hand out · 1 change". "Choose a format
instead" keeps today's format-first path for authors who know what they want.

A purpose is a Studio-side recipe, not an engine concept: it sets export options, which never
live in the deck. So it needs no engine change and HARD RULE #1 does not apply.

**Not the Marp-environment presets.** `2026-10-15-bridges-and-two-hosts.md` D1 rejected export
presets for the Marp bridge ("one bundle carries everything"). That was about which runtime a
Marp bundle targets. Purposes are about which switches a person wants, and do not touch the
bridge.

### 4.3 Scope (fork F3)

- **Purpose first, format as the escape hatch** (recommended). The common job gets one choice.
- **Purposes as a row above today's format list.** Smaller change, but the sheet then shows
  both, and the screen gets busier, which is the opposite of the ask.

## 5. Also considered, design only

- **AI model: Fast, Best, Private (on this device)** in front of the model list. Small,
  independent, and the chat's Talk / Review / Auto already proves the pattern there.
- **Motion: None, Calm, Brisk** in front of style and speed. Low priority: few decks use
  motion (`modifierUsage` counts `motion-*` tokens in single digits).

## 6. Decisions (owner-settled 2026-11-20, one round)

| Fork | Chosen | Rejected, and why |
|---|---|---|
| F1. Where a slide look lives | A class token `look-*`, expanded in the shared kernel | The Studio writing the tokens out: the slide forgets its look, the class line grows by up to 7 tokens, and the change count becomes a guess |
| F2. How many slide looks | Three: Standard, Spotlight, Contrast. "Clean slide" stays a switch in Basic | Four with Clean: its tile reads as Standard's on most layouts |
| F3. Share | Purpose first; "Choose a format instead" keeps today's path | Purposes above the format list: the sheet shows both and gets busier |
| F4. Order of work | Slide looks first, then Share | Share first: faster, but leaves the biggest panel as it is |

## 7. What building it owes

- **Slide looks (first PR).** The kernel expansion of `look-*` (HARD RULE #1: one place every
  render path reads the class list through), the lint vocabulary and `components.json`, the
  Studio serializer and provenance (`slide-directives`, `slide-provenance.ts`) so a dial over a
  look counts as a change, the Basic tier's Look tiles on the shared preview pool, the docs
  (`lib/base/base.docs.md`, `design/skills/restyle-deck.md`, `design/skills/studio.md`), a
  `changelog.d/` fragment, and a demo deck `examples/slide-looks.md` (HARD RULE #9). Before
  ship: render all three looks across the 14 buckets and both color modes, since `accent` and
  `with-spectrum-card` do not reach every layout (§3.2), and Spotlight is weaker where there are no cards.
- **Share purposes (second PR).** Studio-only: the purpose table, the sheet, the change count
  over the format sheet, e2e at the three widths.

## Reproduce

The renders came from this script (run from an empty folder) and the CLI. The sample decks are
not committed; this section is the whole recipe.

```js
// gen.mjs — writes deck-classic.md and deck-editorial.md
import fs from 'node:fs';
const P = {
  standard: '',
  spotlight: 'accent rule-accent with-spectrum-card spectrum-card-solid tint-spotlight scale-l eyebrow-bar',
  contrast: 'dark silent tint-ambient scale-xl',
  clean: 'silent no-spectrum no-finish no-treatment flat no-heading-rule',
};
const cards = (m) => `<!-- _class: cards-grid ${m} -->\n\n## The framework has three parts.\n\n- Signal intake\n  - One weekly sweep across customer calls, market data and rival moves.\n- Scoring model\n  - Each signal scored for confidence, recency and strategic fit.\n- Decision log\n  - Every call recorded with the signals and options behind it.\n`;
const big = (m) => `<!-- _class: big-number ${m} -->\n\n\`Six-month pilot\`\n\n- 14×\n  - Return on signal investment, measured as first-time-right decisions against the old baseline.\n`;
for (const deck of ['classic', 'editorial']) {
  const slides = Object.values(P).flatMap((m) => [cards(m), big(m)]);
  const fm = `---\ntheme: indaco\npreset: ${deck}\npaginate: true\nfooter: "Signal framework · Q3 review"\n---\n\n`;
  fs.writeFileSync(`deck-${deck}.md`, fm + slides.join('\n---\n\n'));
}
```

Then, from the repo root: `node dist/lattice.js <dir>/deck-classic.md <dir>/classic.png` (and the
same for `editorial`). That writes one 2560×1440 PNG per slide. `npm run lint:deck` reported no
errors or warnings on either deck.
