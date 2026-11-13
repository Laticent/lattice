---
name: accessibility-review
description: "Use when reviewing a deck for accessibility: contrast, alt text and describe: comments, reading order, color as the only signal, type size, captions and motion."
kind: operate
studio: true
---

# Skill — Review a deck for accessibility

> Walk a finished deck the way a screen-reader user, a color-blind reader, the back
> row and a viewer who turned motion off will meet it, and fix what fails them.

**Read this when** an author asks "is this deck accessible?", before a deck goes to a
public audience, or when a deck will be exported to PPTX, HTML or a narrated player.
**You'll produce** a short list of findings, each with the slide, the person it fails
and the fix, and then the fixed deck.

---

## The 10/10 bar

- **Every slide has a text alternative.** A `<!-- describe: … -->` comment says what
  the slide SHOWS, for anyone who cannot see it.
- **Every meaningful image is described.** Every picture carries a name: `![A name](…)`,
  or `title=` on an `@image{…}` record. A slide's placed photo (an `image` panel, a `bleed`
  background) speaks its name too, and the slide's `describe:` covers the rest.
- **Nothing depends on color alone.** Status reads by shape, categories by texture or
  label, change by underline and strike-through.
- **No author-made contrast failure.** The theme holds WCAG AA; the review checks the
  places an author can break it.
- **Text is big enough for the room.** `venue:` names the room; nothing was shrunk to
  fit.
- **The reading order makes sense as prose.** Read top to bottom, each slide still
  says its claim.
- **Motion is optional.** Every build and animation degrades to a still.

Mediocre looks like: a deck of screenshots with no descriptions, a status table that is
only red and green cells, white text over a photograph, a `.pdf --raster` sent to a
reader who needs a screen reader, and a heading that a reader only understands by
looking at the chart.

---

## Mental model

**The engine owns most of accessibility; the author owns the words.** Split the review
along that line, so you neither re-check what the engine guarantees nor miss what only
an author can supply.

| The engine guarantees | The author supplies |
|---|---|
| Theme text tokens clear WCAG AA (4.5:1) in light and dark | Colors added by hand (inline HTML, a `style:` block, TeX `\color`, a Mermaid hex) |
| State marks (`` `[x]` ``, `` `[!]` ``…) carry a spoken name (`aria-label`) | Using marks rather than bare colored text |
| `<ins>` / `<del>` are underlined and struck, not just colored | Writing them as elements, not "deleted:" prose |
| `a11y-*` themes add textures, status shapes and line styles | Choosing that theme when the audience needs it |
| Every PDF shows a build's finished slide; `chart-anima` and diagram motion show the finished still under reduced motion | Not hiding meaning inside a build |
| `describe:` lands as PPTX alt text and HTML `aria-describedby` | Writing the `describe:` text |
| Type scales by `venue:` | Naming the venue, and splitting slides instead of shrinking |

**Three channels per slide, three audiences** (see `speaker-notes.md`): the speaker
note is for the presenter, `say:` is what the slide speaks (captions, `.vtt`, voice),
and `describe:` is what the slide shows (screen readers, alt text). An accessibility
review mostly checks the third and uses the second.

---

## Where it lives

- **Linter:** `npm run lint:deck -- deck.md` runs `lib/authoring/lint-core.js` and the
  advisory `lib/authoring/review-core.js` pass. `--strict` fails on warnings.
- **Contrast of a rendered deck:** `node tools/check-slide-contrast.js deck.html`,
  run on an HTML render. On demand, not a gate.
- **CVD themes:** `theme: a11y-deuteranopia`, `a11y-protanopia`, `a11y-tritanopia`,
  `a11y-achromatopsia` (shared base `themes/a11y-base/a11y-base.css`).
- **Texture channel:** `lib/core/accessibility-textures.js`; the
  `--cat-N-texture` tokens.
- **CLI flags that matter here:** `--read` (the deck as a reading article),
  `--captions` (WebVTT sidecars from `say:`), `--strip-notes` (keeps `describe:`),
  `--raster` (image-only PDF, no selectable text), `--no-player-motion`.
- **Demo decks:** `examples/accessible-descriptions.md` (`describe:` on every slide),
  `examples/a11y.md` (a CVD theme), `examples/build.md` (builds).

---

## Recipe

Review in this order: the cheap machine pass first, then the human passes it cannot do.

1. **Lint.** `npm run lint:deck -- deck.md`. Fix every error and warning, and read the
   suggestions: `image-no-alt`, `collage-alt`, `typed-shape-glyph`, `capacity-scale`
   and `chart-no-takeaway` all bear on access.
2. **Text alternatives.** Walk every slide. Does it carry a `describe:` comment? Does
   picture have a name, including the photo an `image` or `bleed` slide places? An
   untitled placed photo is decorative: it paints as CSS with no `<img>`, so it gives a
   screen reader nothing on its own.
3. **Color as the only signal.** Look for meaning carried by hue: red and green text,
   colored table cells, "the blue line". Replace with state marks, labels, patterns or
   words. If the audience includes color-blind readers, or the deck will print in
   grayscale, switch to an `a11y-*` theme or `color-mode: print` and look again.
4. **Contrast an author can break.** Search the source for `style=`, a `style:` front
   matter block, `\color`, `classDef`, `style ` lines in Mermaid fences, and text laid
   over a placed photo. Render to HTML and run `tools/check-slide-contrast.js`. It
   always reports the muted footer and pagination (exempt by palette contract), and
   it cannot measure text over a photo, so look at those slides yourself.
5. **Type size.** Check `venue:` matches the room (`laptop`, `huddle`, `conference`,
   `hall`). A slide that only fits by shrinking type is too full: split it.
   `capacity-scale` names slides past their venue budget.
6. **Reading order.** Render with `--read` and read the article top to bottom. Each
   slide becomes a heading and its body in order; charts, diagrams and math become
   figures captioned with the slide title. A heading that only makes sense beside its
   chart fails here.
7. **Captions and voice.** If the deck will be narrated or played, check `say:` lines
   read well aloud, and that acronyms that should be spoken as words are listed in
   `acronyms:`. `--captions` writes the `.vtt`.
8. **Motion.** Nothing essential may exist only mid-animation. A build (`_build`)
   shows its finished slide in every PDF and reveals without a transition under
   reduced motion; `chart-anima` and `motion: on` diagrams show the finished still.
   `--no-player-motion` ships the still in an exported player.
9. **Output format.** Never send `--raster` to a reader who needs a screen reader: it
   flattens each slide to a picture. Prefer the vector PDF, or `--read` for a reading
   copy.
10. **Render and look** at the fixed deck, in each color mode it uses.

---

## The contract / skeleton

**A `describe:` per slide**, written as what a sighted reader sees, in plain sentences:

```markdown
<!-- _class: table -->

`Site readiness · September`

## Two sites are ready and two still wait on staffing.

| Site | Staffing | Systems | Safety sign-off |
| --- | --- | --- | --- |
| Leeds | `[x]` | `[x]` | `[x]` |
| Lyon | `[x]` | `[x]` | `[x]` |
| Turin | `[!]` | `[x]` | `[-]` |
| Porto | `[!]` | `[-]` | `[-]` |

<!-- describe: A table of four sites against three checks. Leeds and Lyon pass all three. Turin passes systems, fails staffing and is partly through safety sign-off. Porto fails staffing and is partly through systems and safety sign-off. -->
```

The marks draw a shape and carry a spoken name, so status survives without color. Only
the six exact forms dispatch, and a screen reader says their names: `[x]` yes,
`[-]` partly, `[!]` no, `[?]` unknown, `[ ]` open, `[/]` does not apply.

**A placed photo, named and covered by `describe:`:**

```markdown
<!-- _class: image -->

`Turin · loading dock`

## The Turin dock still has one forklift lane for three bays.

The second lane opens when the floor resurfacing finishes in October.

![A loading dock with three bays](sample:photo-wide.jpg)

<!-- describe: A photo of a loading dock with three bays and a single marked forklift lane. -->
```

**Front matter for an audience that needs it:**

```yaml
---
marp: true
theme: a11y-deuteranopia   # or a11y-protanopia | a11y-tritanopia | a11y-achromatopsia
venue: conference          # laptop (default) | huddle | conference | hall
---
```

The `a11y-*` themes ignore the light/dark toggle, so every viewer reads the same
palette, and they pair CVD-tuned status colors with textures on chart and diagram
fills, shapes on status pills, and dash patterns on multi-series lines.

### What each check catches

| Check | Catches | Severity |
|---|---|---|
| `image-no-alt` (review) | `![](…)` with empty alt text | suggestion |
| `collage-alt` (lint) | collage photos with no alt text | warning |
| `typed-shape-glyph` (lint) | a typed check, cross or arrow that renders differently per font | warning |
| `capacity-scale` (lint) | a slide past its `venue:` budget, which clips | warning under a `venue:`, info otherwise |
| `chart-no-takeaway` (review) | a chart heading that names a topic, not a finding | suggestion |
| `caption-key-retired` (lint) | the old `caption:` key, which the engine ignores; use `say:` | error |
| `narration-acronyms` (lint-deck) | all-caps tokens read letter by letter | suggestion |
| `tools/check-slide-contrast.js` | sub-AA text runs on a rendered HTML deck | on demand |

**What no check catches:** a missing or wrong `describe:`, meaning carried by color in
your own words ("the red bars"), text over a photograph, and a reading order that only
works visually. Those are this skill's human passes.

---

## What good looks like

- Every slide has a `describe:` that names the layout and the content in one to three
  plain sentences, without repeating the speaker note.
- Status in tables and lists uses state marks; categories in charts carry a key or a
  label, never hue alone.
- No hand-set color anywhere in the source.
- `venue:` set to the real room, and no slide shrunk to fit.
- The `--read` article reads as a coherent document.
- Builds reveal a sequence; the finished slide still says everything.

## What bad looks like

- "Green means on track, red means late" in a legend. Fix: state marks, or status
  words in the cells.
- A `describe:` that says "Chart." Fix: say what the chart shows: "Revenue by region;
  North America is largest at $4.2M."
- White text over a photo with a busy sky. Fix: move the text to the text slot, or
  pick a calmer image; no contrast tool can measure it for you.
- A deck sent as `--raster` to a reader using a screen reader. Fix: vector PDF.
- `- **Deleted:** old clause` to mark a removal. Fix: `<del>old clause</del>`; the
  element already announces itself.
- A typed check mark in a card title. Fix: a state mark in inline code.

---

## Ship checklist

- [ ] `npm run lint:deck -- deck.md` reports no errors or warnings; suggestions read.
- [ ] Every slide carries a `<!-- describe: … -->` comment.
- [ ] Every picture has a name, the slide's placed photo included.
- [ ] No meaning rests on color alone; status uses marks or words.
- [ ] No hand-set color (`style=`, `style:` front matter, `\color`, Mermaid hex).
- [ ] Text over images checked by eye; `tools/check-slide-contrast.js` run on the HTML.
- [ ] `venue:` matches the room; no slide past its venue budget.
- [ ] The `--read` article read top to bottom and makes sense.
- [ ] `say:` lines read aloud cleanly; acronyms registered where needed.
- [ ] Nothing essential exists only mid-build or mid-animation.
- [ ] The output format keeps text selectable for readers who need it (not `--raster`).

---

## Common mistakes

1. **Treating alt text as optional on a photo slide.** A placed photo has no `<img>`;
   without a name or `describe:` it does not exist for a screen reader.
2. **Writing `describe:` as a speaker note.** It is public: it survives
   `--strip-notes` and reaches the recipient. Describe what is shown, not what you say.
3. **Assuming the theme fixes everything.** It fixes its own tokens. It cannot fix a
   hex you typed, or text you put over a photo.
4. **Adding "deleted:" words to `<del>`.** Screen readers already announce the
   element; the extra words are heard twice.
5. **Shrinking type to fit.** Split the slide instead; `scale-*` and `venue:` exist to
   go up, not down.
6. **Using the retired `caption:` key** for spoken text. The engine ignores it. Use
   `say:`.
7. **Expecting `venue:` to grow a Mermaid diagram's labels.** Mermaid sizes its own
   text; draw fewer nodes.
8. **Typing glyphs for status.** A typed check mark renders as a fallback font, a
   color emoji or a box. Use `` `[x]` ``.

---

## Canonical sources

- `lib/base/base.docs.md` — §"Accessibility — color-vision-deficiency themes
  (`a11y-*`)", §"Accessibility — tracked changes (`<ins>` / `<del>`)", §"Inline state
  marks", and the `scale-*` modifiers.
- `engineering/textures.md` — the texture channel and the `--cat-N-texture` tokens.
- `engineering/typography.md` §7 — the global font scale and `venue:`.
- `design/skills/speaker-notes.md` — the note, `say:` and `describe:` channels.
- `design/skills/theme.md` — the AA contract every theme holds.
- `design/skills/cli.md` — `--read`, `--captions`, `--strip-notes`, `--raster`.
- `lib/authoring/review-core.js` (`RUBRIC`) — the advisory review rules and their fixes.
- `engineering/decisions/2026-06-16-cvd-redundant-encoding.md` — why meaning rides
  more than one channel.
- `engineering/decisions/2026-08-25-typed-glyphs.md` — why we draw shapes instead of
  typing them (HARD RULE #29).
