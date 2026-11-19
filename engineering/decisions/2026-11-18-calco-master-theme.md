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
  Without a palette `readTheme` fills the slots by the same roles (body ink in `dk1`, the main ground in `lt1`, the title
  ink in `dk2`), whatever their lightness; an earlier draft sorted them by lightness and put a dark ground in `dk1`.
  The slide master's own ground stays an explicit white, as Office's `bg1` was before: a slide with no background of
  its own shows it, and a dark `lt1` would repaint that slide (measured: the parity decks' slide with no ground turned
  navy until this was pinned).
- **Text styles.** The master's title, body and other styles are the deck's title and body (size, weight, ink, line pitch,
  letter-spacing, caps), on the theme faces (`+mj-lt`, `+mn-lt`). Existing runs keep their explicit colors and faces: a
  theme switch cannot recolor the slides' pictures, so binding text to theme colors would let them disagree.
- **Every layout carries the whole look of its slides** (`masters.ts`; owner, 2026-11-19: "dark slides can have more
  content than title and subtitles. They can have header, footer, pagination, meta, eyebrow", for every anchor slide:
  title, divider, topic, closing). Slides share a layout when they sit on the same background, are the same look
  (`Slide.look`, Lattice's `data-frame`) and draw each chrome role in the same place and style, whatever its text says.
  Within a layout, chrome with the same text on every slide is drawn once on the layout, a layout of one slide included;
  chrome whose text varies stays on each slide and the layout offers a placeholder in its look (`Layout.vary`), so
  per-section headers do not make a layout per slide. This replaced "hoist only what two slides share", which left a
  one-off look's chrome (a dark topic-fact slide's header and footer) on the slide, so a slide added on it had none.
- **Placeholders.** The master has a title and a body placeholder. Each layout has a placeholder, in that layout's own
  type and ink, for every role its slides show: the title; a body, or on a look whose slides hold a heading and at most
  one plain line under it a subtitle (on a lead line, where and as the deck drew it); the eyebrow (`idx` 13); the meta
  line, a source or basis (`idx` 14, the new `meta` role); a header or footer whose text varies (`idx` 15, 16). A slot
  whose role no slide on the layout shows takes the layout's title ink at a quieter size, never an empty style: an empty
  style inherits the master's light-slide ink, which was dark text on a dark look (owner, Google Slides: the venue-chrome
  title look's subtitle prompt).
- **Names.** The look's: "Title", "Content", "Divider", "Topic", "Closing", numbered when one repeats ("Divider 2" for a
  light divider). A divider is `type="secHead"`, other title-like looks `type="title"`, the rest `type="obj"`. With no
  look (another host), "Title" for a chrome-less look that opens or closes the deck, else "Content". The `.odp` master
  pages carry the same names as `style:display-name`.
- **Chrome on the master.** The master draws the header, footer and page number the most slides show; a layout whose
  header and footer are the master's draws none of its own (its page number is its own placeholder, since a master
  placeholder never draws on a slide). Any other layout sets `showMasterSp="0"` and draws its own. Matching is to the
  whole px with the box height left out (a figure layout sets the header line 20px, not 19px). Only chrome that reads
  on the master's own white ground (3:1 or more) can be the master's: a dark look's pale header there was faint in
  Slide Master view and on a layout a user inserts (checker: #91A7C2 on white, 2.3:1). Which look wins changes where a
  header is edited once, not what an existing slide shows.
- **Chrome the ground cannot show stays on the slide.** Chrome whose ink is under 1.5:1 against its layout's flat
  ground sits on something the slide's own picture paints (card-tags slide 7: a white header over a split slide's dark
  half, on a white ground), and a layout paints under the picture. Measured: hoisted, that header vanished; kept, the
  slide is pixel-identical to `main`. A new slide on such a layout has no copy of it (its dark half is in the picture).
  The test needs a flat ground: on a picture ground every chrome frame is hoisted, and the pixel A/B on five decks is
  what guards that case.
- **Slides with their own opaque picture** (no shared background) show nothing of a layout, so they share one layout
  per look rather than one each.
- **Runs say "off".** Because the inherited title and body styles can be bold, all caps or letter-spaced, every slide run
  writes `b`, `i`, `cap` and `spc` even when they are off (`b="0"`, `cap="none"`, `spc="0"`). Otherwise PowerPoint would
  draw a plain run, such as a light title or a text box, in the inherited look. The page-number field writes none, so it
  follows its placeholder's list style.
- **The page number** keeps its whole look in the placeholder's list style (letter-spacing, opacity and caps included),
  so only a highlighted number is refused.

## 3. Measured

- **Schema**: every master, layout, slide, presentation and theme part of the four decks and an anchor deck (title,
  content, divider, topic, topic fact, numbered divider, light divider, closing, in light mode with header, footer and
  page numbers) validates against ISO/IEC 29500 `pml.xsd` / `dml-main.xsd` (system `xmllint`): 81 parts.
- **No visual change**: every slide of those five decks rendered by LibreOffice 24.2 from `main`'s CLI and this
  branch's, `.pptx` (41 slides) and `.odp` (24 slides of three of them): 0 pixels differ.
- **New slides on every layout** (UNO, the anchor deck): Title and Closing navy with their light footer, Content white
  with header and footer, Divider and Topic navy with their own header and footer, the light divider white. Each slot
  is in its layout's ink (read from the file; empty placeholders do not draw in a PDF). LibreOffice adds no page number
  to a new slide, with PowerPoint's own template too.
- **Google Slides** (owner, iPhone, 2026-11-19): Add slide lists "Title" and "Content"; a new Title slide has the white
  Playfair title on navy, a new Content slide the Playfair title, the Outfit body, header, footer and a live page number.
  The owner's first test, black Arial and no number, was `main`'s export (its layouts are "Layout 1/2", title only).
- **Dark theme** (accent-on-accent): `dk1` #BFB8A8 on `lt1` #0F0E0C, accents from the dark scheme.

## 4. Not verified

- **PowerPoint and Keynote**: whether "New Slide" on each layout gives the deck's type, chrome and a page number. This
  is the point of the change and it is UNVERIFIED; it joins `followups.d/3220-p1-native-pptx-real-readers.md`. Google
  Slides is verified for Title and Content only; the anchor layouts (Divider, Topic, Closing) are not yet seen there.
- **Inheritance is not read back.** `test/helpers/pptx-readback.js` now records the slide master and each layout's
  `showMaster`, and the parity snapshot was updated for the intended changes (its header lists them). It does not resolve
  inherited text styles, though: a placeholder's list style, such as the page number's look, is not compared. `pptx.test.js`
  pins the explicit run attributes and the number's list style instead.
- **Native charts and Mermaid** stay pictures; this change does not touch them.
