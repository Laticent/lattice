---
kind: plugin
name: Video
order: 9
promise: A clip on a slide that still works in print.
intro: 'Write `@video{"https://youtu.be/…", title="…"}` on a line of its own and Lattice draws a poster with a play badge and the provider''s name. The poster is a link, so it opens the clip in a browser and in a PDF. Add a scannable code for the room, or a matte for an exhibit.'
useWhen: A slide is about a recording, such as a demo, a customer story or a launch film, and the deck has to read the same on a screen, in a PDF and on paper.
syntax: '`@video{"https://youtu.be/…"}`'
facts:
  - { k: You write, v: '`@video{"address", title="…"}` on a line of its own' }
  - { k: Providers, v: 'YouTube, Vimeo, TikTok and Instagram' }
  - { k: Draws with, v: A still, a play badge and a link, never a live player }
  - { k: Loaded, v: By default; free until a deck uses one }
reference:
  - label: The plugin's reference
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/video/video.docs.md
    note: The record's words, every address form each provider accepts, and how to move an old video slide over.
  - label: The conformance cases
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/video/video.fixtures.md
    note: Exactly what each spelling renders to.
  - label: A sample deck
    href: https://github.com/Laticent/lattice/blob/main/examples/video-plugin.md
    note: All four providers, the three layouts, the accepted address forms and a slide with no poster.
  - label: The video slide
    href: https://github.com/Laticent/lattice/blob/main/lib/components/imagery/video/video.docs.md
    note: The slide class that lays the clip out, with its companion, gallery and code variants.
  - label: Why the address comes only from your record
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-16-media-plugins.md
    note: The design note, including the rule that nothing here reads a slide's text.
examples:
  - key: companion
    label: A clip beside its claim
    caption: The heading and a sentence lead on the left, and the poster sits on the right. The qr word adds a code the room can scan.
    sample: |
      <!-- _class: video companion qr -->

      ## Onboarding that sticks — watch a customer do it live.

      Ninety seconds, unscripted: a first-day admin goes from signup to a published deck.

      `@video{"https://www.youtube.com/watch?v=aqz-KE-bpKQ", title="Ree A., Head of Ops at Northwind", poster="sample:photo-wide.jpg"}`
  - key: gallery
    label: An exhibit on its matte
    caption: The gallery slide frames the poster on a matte, and the provider's name sits on the frame whatever shape the picture is.
    sample: |
      <!-- _class: video gallery -->

      ## Exhibit 1 — the onboarding flow, end to end.

      `@video{"https://vimeo.com/1084537", title="The reference onboarding walkthrough.", poster="sample:photo-pano.jpg"}`
  - key: stand-in
    label: No poster yet
    caption: Leave the poster off and a drawn stand-in holds the place, so the slide still reads as a video.
    sample: |
      <!-- _class: video gallery -->

      ## The launch film goes here.

      `@video{"https://youtu.be/dQw4w9WgXcQ", title="Poster to come."}`
---

## The problem

A slide needs to show a recording. A live player can't go in a PDF, and a pasted screenshot has no link behind it. A bare address on the slide reads as clutter, and it is no more than text once the deck is printed.

- **A live player** works in a browser tab and nowhere else. The PDF, the handout and the emailed copy all lose it.
- **A screenshot** looks right and goes nowhere. The reader has to type the address from memory.
- **A bare address** is easy to mistype and says nothing about what is behind it.

What you want is a picture that says "this is a video", names where it plays, and opens it.

## The idea

- **A record on a line of its own.** `@video{"https://youtu.be/…", title="…", poster=…}` is the whole slide's content. The address comes first and is the only required word.
- **A poster that is a link.** Lattice draws the still with a play badge and "Watch on" and the provider's name. In a PDF the poster is a clickable link, and in a browser a tap opens the clip.
- **Four providers.** YouTube, Vimeo, TikTok and Instagram, in every spelling people copy from a browser bar, including short links and the address with no `https://`.
- **A code for the room.** Add `qr` to the slide and a scannable code carries the same address, so a printed page or a projected slide works for someone with a phone.
- **The address is yours alone.** Nothing here reads a slide's text. The engine takes the address from the record you wrote, so a plugin's drawing can never turn into a poster, a link or a code.

## How to use it

Put the record on a line of its own, on a `video` slide, with a blank line above and below it:

```markdown
<!-- _class: video companion qr -->

## The 90-second tour.

`@video{"https://youtu.be/dQw4w9WgXcQ", title="The tour", poster="sample:photo-wide.jpg"}`
```

| Word | Does |
| --- | --- |
| The address | First, and required. YouTube, Vimeo, TikTok or Instagram. Quote it when it holds `=` or `,`. |
| `title="…"` | The caption under the poster, and the poster's accessible name. |
| `description="…"` | A longer line for narration and notes. It isn't shown on the slide. |
| `poster=…` | The picture behind the play badge: a path, a `sample:` or `asset:` name, or a web address. Leave it off for a drawn stand-in. |

The slide class picks the layout. `video` alone centers the poster. Add `companion` for a clip beside its claim, `gallery` for a matte, and `qr` to either for a scannable code.

In the Studio, type `` `@ `` and choose `video` from the menu. The linter tells you when the address isn't one it can show.

## Where else it fits

A customer story with the interview behind it, a product tour in a launch deck, a recorded talk on a conference handout, a reel in a field report. Anywhere the page has to carry a clip the reader can open later.

## How Lattice uses it

The `video` slide class lays the record out and paints its poster. The plugin reads the record while Lattice parses your Markdown, and the same address feeds the link, the badge, the code and the player the Studio opens when you tap a poster. Export to Marp turns a lone record into an ordinary Markdown link.

## What it doesn't do

- **It never plays inside the slide.** The poster is a link. In the Studio a tap opens a player over the preview, and everywhere else it opens the clip's own page.
- **It can't make a blocked player load.** A browser's tracking protection can blank a TikTok or Instagram player. The Studio always shows an "Open on" link under the player, and adds a notice if the player stays silent for 8 seconds.
- **It doesn't lay out on other slides.** `@video` belongs on a `video` slide. On any other slide it is only a text link, and the linter says so with `video-slide-class`.
- **It doesn't read bullets any more.** An old video slide that names its clip as a bullet draws nothing, and `lint:deck --fix` moves a lone address bullet into a record.
- **It doesn't trust a lookalike.** A provider's name in a path or a fragment doesn't make the address that provider's, so a lookalike address draws nothing.
- **It doesn't fetch the picture.** Rendering stays offline. Give it a `poster=`, or fetch a thumbnail once ahead of time with the oEmbed tool in the reference. Instagram has no public lookup, so an Instagram clip needs a `poster=` of its own.
