---
kind: plugin
name: Images
order: 11
promise: A picture you describe once; the slide decides where it goes.
intro: 'Write `@image{photo.jpg, title="…", description="…"}` on a line of its own. On an `image` slide it becomes the photo panel, on a `bleed` slide the background, in a collage a tile, and anywhere else a figure among your words, with the same frames, finishes and tones a clip takes.'
useWhen: A slide shows a photograph, a screenshot or a product shot, and you want it named for a screen reader, framed the deck's way and placed by the slide, not by keywords hidden in its alt text.
syntax: '`@image{photo.jpg, title="…"}`'
facts:
  - { k: You write, v: '`@image{address, title="…"}` on a line of its own, or Markdown''s `![title](src "description")`' }
  - { k: Placed by, v: 'The slide: `image`, `bleed`, `collage`, or a figure anywhere else' }
  - { k: Looks, v: 'Frames, finishes, tones and sizes shared with clips' }
  - { k: Loaded, v: By default; free until a deck uses one }
reference:
  - label: The plugin's reference
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/image/image.docs.md
    note: The record's words, where each slide puts the picture, and how to move a Marp `![bg]` picture over.
  - label: The conformance cases
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/image/image.fixtures.md
    note: Exactly what each spelling renders to.
  - label: A sample deck
    href: https://github.com/Laticent/lattice/blob/main/examples/image-plugin.md
    note: Every seat, every frame and a finish, tone and size on each.
  - label: The image slide
    href: https://github.com/Laticent/lattice/blob/main/lib/components/imagery/image/image.docs.md
    note: The slide class whose photo panel a record fills.
  - label: Why the address comes only from your record
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-16-media-plugins.md
    note: The design note, including the shared display layer and the rule that nothing here reads a slide's text.
examples:
  - key: figure
    label: A framed figure
    caption: On an ordinary slide the picture sits among the words. The mat frames it and the title shows beneath.
    sample: |
      <!-- _class: content -->

      ## The lake at dawn, before the first boat.

      `@image{sample:photo-wide.jpg, title="The lake at dawn", frame=mat, show=title}`
  - key: panel
    label: The photo panel
    caption: On an `image` slide the record becomes the layout's own photo, here with a nimbus finish.
    sample: |
      <!-- _class: image -->

      ## The record becomes the layout's photo.

      The slide reads the picture's shape and gives it the panel.

      `@image{sample:photo-tall.jpg, title="A tall photograph", nimbus}`
  - key: bleed
    label: The slide's background
    caption: A `bleed` slide makes the picture its background, with a scrim so the heading stays readable.
    sample: |
      <!-- _class: content dark bleed -->

      ## Or the slide's own background.

      `@image{sample:photo-pano.jpg, description="A panorama of the lake", meridian}`
  - key: tone
    label: A tone in the deck's colors
    caption: Duotone recolors the picture in the theme's own ink, inside a single keyline.
    sample: |
      <!-- _class: content -->

      ## One hairline, and the picture in the accent.

      `@image{sample:photo-square.jpg, title="The mug", frame=keyline, duotone, sm}`
---

## The problem

A picture on a slide carries three things: where it comes from, what it shows, and where it goes. Markdown's `![alt](src)` holds the first two, and Marp hid the third in the alt text: `![bg left 40%](photo.jpg)`.

- **The alt text was doing two jobs.** A screen reader heard "bg left 40%" as the picture's name.
- **The placement lived in the picture.** Move it to another slide and the keywords came along, meaning something different or nothing at all.
- **Every picture looked the same.** A frame, a finish or a tone meant writing your own CSS.

## The idea

- **A record names the picture.** `@image{photo.jpg, title="…", description="…"}`: the address, its name, and a longer description for narration and screen readers.
- **The slide places it.** An `image` slide makes it the photo panel (`mirror` puts it on the left), a `bleed` slide makes it the background, a `collage` packs it as a tile, and any other slide shows it as a figure.
- **One look for pictures and clips.** The frames, finishes, tones and sizes are shared with the video plugin, so a photo and the clip beside it match. A deck sets them once with the `image:` front-matter key.
- **The address is yours alone.** The engine takes it from the record you wrote, never from a slide's text.

## How to use it

Put the record on a line of its own, with a blank line above and below it:

```markdown
<!-- _class: content -->

## The lake at dawn.

`@image{lake.jpg, title="The lake at dawn", description="A canoe on still water", frame=mat}`
```

| Word | Does |
| --- | --- |
| The address | First, and required: a path beside the deck, a `sample:` or `asset:` name, or a web address. |
| `title="…"` | The picture's name for a screen reader, and its caption when shown. |
| `description="…"` | A longer line for narration and screen readers. Shown only with `show=all`. |
| `sm` `md` `lg` | The size of a figure. |
| `frame=…` | `mat`, `keyline`, `float`, `device` or `corners`. |
| `nimbus` `halo` `meridian` | A finish, with a strength such as `nimbus=40`. |
| `duotone` `grayscale` | A tone in the deck's colors. |
| `show=…` | `none` (the default for a picture), `title` or `all`. |

**Markdown's picture is the shortcut.** On an `image` or `bleed` slide, `![title](src "description")` alone on its line is placed exactly like the record, when it is the slide's only lone picture and the slide has no `![bg]` or record already. Anywhere else it is an ordinary picture: write the record when you want a frame, a finish, a tone, a size or `show=`. Both forms take a `sample:` or `asset:` name.

## Where else it fits

A product shot in a launch deck, a site photo in a field report, a portrait on a team slide, a screenshot in a walkthrough. Anywhere a picture should look like the deck and be named for everyone who reads it.

## How Lattice uses it

The plugin reads the record while Lattice parses your Markdown, and the slide's class decides the seat. The CLI reads each picture's size before it loads, so the slide lays out the same whether or not the picture has arrived. Export to Marp turns a record back into an ordinary Markdown image.

## What it doesn't do

- **It doesn't read Marp's keywords.** `lint:deck` warns on `![bg …]` and `--fix` writes the record, moving the placement to the slide (`left` becomes `mirror`, a background becomes `bleed`).
- **It doesn't fetch web pictures on its own.** A web address follows the deck's web-image policy, and the linter names it.
- **It doesn't seat two panels.** An `image` slide has one photo and a `bleed` slide one background; a second record lands over the first, and the linter says so (`image-extra-panel`). Use `collage` for several.
