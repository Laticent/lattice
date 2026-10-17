---
status: in-progress
summary: The editable .odp/.pptx now put each slide's own background on a shared master page or layout instead of in a movable picture on every slide, name titles, page numbers and running chrome as what they are, and lock the content picture. Built and measured in LibreOffice on five decks; the owner opens these files in Google Slides and Collabora on iOS, which could not be reached from the build sandbox and are UNVERIFIED.
---

# Calco: shared backgrounds, layouts and roles (2026-10-17)

**Status: built and measured in LibreOffice (§4). Not yet verified in Google Slides or
Collabora on iOS, the two surfaces the owner opens these files on (§6). The Studio's browser
export gets the roles but not shared backgrounds (§7).**

**The question.** The owner reported that Calco's editable export "just creates shapes and
background slide" and that all of it can be selected and moved. They wanted backgrounds shared
between slides and fixed like true backgrounds, and shapes grouped with their text so they do
not move apart. An audit (§1) found both complaints partly true.

## 1. What was there

Read from real exports of `card-tags`, `accent-finishes`, `finish-backdrops`, `chart-finish`
and `cards-stats-actors-kpi`:

- **No shared background.** Each slide was one full-slide screenshot with its text hidden. That
  one image held the page color, the gradient rule across the top, any finish wash, **and**
  every chart, diagram and card Calco could not turn into a shape. The `.pptx` had one empty
  slide master and one empty layout, and 12 slides wrote 12 different images. Nothing used a
  real background (`<p:bg>` appeared 0 times).
- **Nothing locked.** The picture carried only `noChangeAspect`, so it could be selected,
  dragged and deleted.
- **Cards were already grouped** (`p:grpSp` in the `.pptx`, `draw:g` in the `.odp`, from
  `2026-10-07-calco-native-shapes.md`), but only a card that Calco could lift. A card that
  holds an icon, a chart or a `::before` tag stays in the picture whole.
- **Roles were not recorded.** The title, header, footer and page number were ordinary text
  boxes. The page number was a plain box holding the literal digit, so reordering slides left
  it wrong. (An earlier draft of this audit guessed the number was baked into the picture; it
  is a real `<span class="lat-pagination">`, read as text.)

## 2. What was built

- **A background split.** `splitSlide(section, 'background')` hides everything inside a slide, so
  a photograph shows only the slide's own paint: its fill, its `border-image` rule, its
  non-text pseudo-elements, and its decorative layer (an absolutely placed child under the
  content with no text, which is how a finish's wash and ghost numeral are built).
  `splitSlide(section, 'foreground')` hides that paint, so a photograph with a transparent
  background holds only content. `lib/export/office-export.js` takes both for every slide.
- **Sharing.** Backgrounds that match within 3 levels per channel are one (a gradient dithers
  by a level between slides that draw the same thing; exact hashes missed it). A flat
  background is a solid fill with no picture. Each distinct background is written once, on a
  `.pptx` layout (`<p:bg>`) or an `.odp` master page (`draw:fill-image`).
  `splitKey(section)` hashes the computed style that produces the background, so slides that
  draw the same thing are photographed once. Output is byte-identical with and without that
  shortcut on all five decks.
- **A safety check where layers do not add up.** A transparent foreground over a background
  composites exactly, except where an element reads what is behind it. A slide with
  `mix-blend-mode` or `backdrop-filter` anywhere is checked against an opaque photograph, and
  keeps the opaque picture if more than 0.1% of its pixels differ by more than 16 levels. The
  CLI prints how many slides did.
- **Roles.** `readSlide` tags frames `title`, `eyebrow`, `subtitle`, `header`, `footer` and
  `number` from the page's own markup. The title is a title placeholder in both formats, and
  LibreOffice lists it as a title object. A page number is a slide-number field. A header, footer
  or page number that two or more slides share on one background moves to the layout
  (`masters.ts`). A slide with no shared background hoists nothing, because a layout paints
  **under** the slide's picture and would hide the header.
- **A lock.** The slide's content picture is protected against moving and resizing in the `.odp`
  (`style:protect`), and marked `noMove`/`noResize` in the `.pptx`.

**Eyebrow and subtitle are named text boxes, not placeholders.** Their position differs for
almost every component, so placeholders would need a layout for each. **The running header is a
text object on the layout, not a placeholder**, because PowerPoint has no slide header
placeholder (only notes and handouts have one).

## 3. What PptxGenJS 3.12 forced

Found by probing a package, not from its docs:
- A slide placeholder ignores its own position and name, so the title is a normal text box that
  `tidyPptx` turns into a placeholder (`applyRoles`). The same step turns a page number into a
  field.
- PptxGenJS copies every empty layout placeholder onto every slide, each showing a "Click to
  add" prompt; `applyRoles` removes them.
- A layout's static text object takes one string in one style, so only single-style headers and
  footers are hoisted.
- A layout's `slideNumber` writes the number onto every slide that uses it, with a real field.

## 4. Measured (LibreOffice 24.2)

Mean absolute difference per pixel against the Chrome PDF at 1280×720, lower is closer. `.odp`:

| Deck | Slides | Old | New | Shared backgrounds |
|---|---:|---:|---:|---:|
| accent-finishes | 12 | 1.79 | 1.79 | 4 |
| finish-backdrops | 15 | 2.95 | 2.94 | 12 |
| chart-finish | 9 | 1.42 | 1.42 | 2 |
| cards-stats-actors-kpi | 10 | 1.59 | 1.52 | 2 |
| card-tags `.pptx` | 10 | 5.38 | 5.41 | 3 |

No slide fell back on any of them. On `finish-backdrops` slide 3, the share of non-transparent
foreground pixels went from 96% to 1.2% once the backdrop counted as background.

**Time** (`accent-finishes`, 12 slides, editable `.odp`, same machine): 6.2 s before; 17.4 s with
a full ground-truth check on every slide; **8.1 s** with the check limited to slides that read
their backdrop and with matching backgrounds photographed once (+0.16 s per slide).
`finish-backdrops`, where every slide draws a different finish, saves nothing from sharing.

**Size** of the `.odp`: accent-finishes 471→495 KB, finish-backdrops 5500→5245 KB, chart-finish
670→755 KB, cards-stats-actors-kpi 394→347 KB. Fonts dominate, so sharing does not shrink a
file much.

Driven through LibreOffice's UNO API on the `.odp`: 5 master pages for the 10 slides of
`card-tags`, titles come up as `TitleTextShape`, the slide picture reports `MoveProtect` and
`SizeProtect` true, and cards are `GroupShape`s. On the `.pptx` the titles are
`TitleTextShape`, the layout number is a `SlideNumberShape`, and a slide's own number is a
field. LibreOffice **ignores** the `.pptx` picture lock.

## 5. What is still a movable picture

A card that holds an icon, a chart, a `::before` tag or a bulleted list is refused as a shape
(the one rule in `2026-10-07-calco-native-shapes.md` §7), so it stays in the foreground
picture. That is the remaining source of "I can move it" on a card slide, and it is the open
item the native-shapes note already records (tags drawn by `::before`). Charts, diagrams and
equations stay pictures by design.

## 6. Not verified

- **Google Slides** (the `.pptx` the owner opens on a phone and desktop). Whether it keeps layout
  backgrounds, title placeholders and the slide-number field, and whether it honors the
  picture lock, was not tested. Google Slides is not expected to use the fonts embedded in the file.
- **Collabora Office on iOS** (the `.odp`). It runs LibreOffice's engine, so the master pages,
  the title class and `style:protect` should hold; that is a claim about the engine, not a
  test on a phone.
- **PowerPoint.** Not tested; Calco's README already says so.

The sign-off files are for the owner to open on those surfaces.

## 7. Not done

- **Studio browser export.** `docs/src/components/studio/export/deck-export.js` captures with
  html-to-image and has no background split. It now receives roles (title placeholders, number
  fields, the picture lock) and no shared backgrounds. Parity needs a transparent
  html-to-image capture, which the capture fixups there may fight.
- **Group locks.** Groups are not locked. Google Slides has no lock to honor, and LibreOffice
  has no group protect attribute. The shared background removes the most-grabbed object; a card
  that stays a picture is the next one.
