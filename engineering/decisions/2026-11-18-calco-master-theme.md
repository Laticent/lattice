---
status: shipped
summary: The editable .pptx carries the deck's own theme (colors from the theme tokens, heading and body faces), its master's text styles and every layout's title and body placeholders are in the deck's type, and the running header, footer and page number are drawn once on the master. Existing slides render pixel-identical in LibreOffice; PowerPoint, Keynote and Google Slides are UNVERIFIED.
---

# Calco: the deck's theme on the master, and chrome edited in one place (2026-11-18)

**The question.** The owner asked whether Calco ships a slide master with layouts, uses native header, footer and
page numbers, and ships a master theme, and whether that makes the editable file hard to extend. An audit of real
`--editable` exports (venue-chrome, chart-finishes, mermaid-12, card-tags) answered it.

## 1. What was there

- **One master and one layout per background** (`2026-10-17-calco-shared-backgrounds.md`), named "Layout 1–4", each with
  its background and a title placeholder. The master was empty.
- **The theme was Office's**: Calibri Light and Calibri, Office's blue and orange accents, the master's title style 44pt
  black. A slide added in PowerPoint or LibreOffice had a black Calibri title and body (LibreOffice: 18pt), and no body
  placeholder.
- **Headers** went on a layout only when two slides shared the header on the same background, so a slide on a one-off
  background kept its own copy, and Slide Master edits missed it.
- **The page number never left the slides.** The layout number was refused for any letter-spacing or opacity, and
  Lattice's own number has both (`spc="86"`, opacity 0.9). Every slide kept a text box with a `slidenum` field, so the
  number updated when slides were reordered but a new slide had none.

## 2. What was built

- **Theme** (`theme.ts`, `readTheme`). Fonts: the face most title characters are drawn in (major) and most body
  characters (minor). Colors: the host's palette when it passes one, else read off the slides. Lattice passes
  `OFFICE_PALETTE` (`lib/core/office-export-policy.js`): `dk1` text-body, `lt1` bg, `dk2` text-heading, `lt2` bg-alt,
  `accent1` accent, `accent2–6` cat-1–5-mark (the chart series colors), resolved on every slide under its color scheme
  (`resolvePalette`), most-common value per slot. A dark deck gets its light text as `dk1`, because `tx1` maps to `dk1`.
- **Text styles.** The master's title, body and other styles are the deck's title and body (size, weight, ink, line pitch,
  letter-spacing, caps), on the theme faces (`+mj-lt`, `+mn-lt`). Existing runs keep their explicit colors and faces: a
  theme switch cannot recolor the slides' pictures, so binding text to theme colors would let them disagree.
- **Placeholders.** The master has a title and a body placeholder. Each layout has a title placeholder in its first
  title's look (a white title on the dark opening slide), and a body placeholder over the area its first slide draws, or
  a subtitle placeholder on the title look.
- **Names.** A look with no running chrome that opens or closes the deck is "Title" (`type="title"`); the others are
  "Content", "Content 2", … (`type="obj"`). The `.odp` master pages carry the same names as `style:display-name`.
- **Chrome on the master** (`masters.ts`). Chrome is counted over the whole deck, not per background. The master draws
  the header, footer and page number most slides show; a layout whose header and footer are the master's draws none of
  its own (its page number is its own placeholder, since a master placeholder never draws on a slide). A layout with
  another header or footer, or none, sets `showMasterSp="0"` and draws its own. Matching is to the whole px with the box
  height left out (a figure layout sets the header line 20px, not 19px).
- **The page number** keeps its whole look in the placeholder's list style (letter-spacing, opacity and caps included),
  so only a highlighted number is refused.

## 3. Measured

- **Schema**: every master, layout, slide, presentation and notes-master part of the four decks validates against
  ISO/IEC 29500 `pml.xsd` (system `xmllint`; `xmllint-wasm` was not installable), the theme against `dml-main.xsd`; no
  shape id repeats on the master or a layout.
- **No visual change**: each slide of the four decks rendered by LibreOffice 24.2 before and after, `.pptx` and `.odp`:
  0.00% of pixels differ on every slide.
- **Chrome**: venue-chrome and chart-finishes keep no header on any slide. card-tags slides 7 and 9 and mermaid-12 slides 5
  and 6 keep theirs, because those headers really differ (a white header on a dark split slide, Shantell Sans on a sketch
  slide, a muted ink on a figure slide).
- **New slide in LibreOffice** (UNO, the Content master page): the header, footer and rule carry over, and the body is the
  deck's (Outfit 24pt, heading ink, was Calibri 18pt black). The title is still 18pt: LibreOffice does that for
  PowerPoint's own default template too (python-pptx's template, measured the same way), so it is LibreOffice's
  behavior, not the file's. LibreOffice does not add a page number to a new slide.
- **Dark theme** (accent-on-accent): `dk1` #BFB8A8 on `lt1` #0F0E0C, accents from the dark scheme.

## 4. Not verified

- **PowerPoint, Keynote, Google Slides**: whether "New Slide" on "Content" gives the deck's title and body, the header and
  footer, and a page number (the layout's `hf sldNum="1"` asks for one). This is the point of the change and it is
  UNVERIFIED; it joins `followups.d/3220-p1-native-pptx-real-readers.md`.
- **`test/unit/calco/pptx-parity.test.js`** reads back the layouts and their placeholders against a frozen snapshot, and
  could not run here (jsdom not installable). Layout names, placeholders and the master's shapes changed on purpose; the
  snapshot needs its hand edit, as that test's header says.
- **Native charts and Mermaid** stay pictures; this change does not touch them.
