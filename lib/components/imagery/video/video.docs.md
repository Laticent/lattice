# video

> A video as a static, PDF-safe embed: a poster that links to the clip, a play badge, the provider's name, and a scannable QR to the same URL — never a live iframe.

**Function** imagery · **Form** canvas · **Substance** prose

**Tags** `visual` · `showcase` · `pitch`

Use to put a YouTube / Vimeo / TikTok / Instagram video on a slide. Because the deck renders to a static PDF (and the engine bars iframes), a `video` slide shows a POSTER with a play badge + provider label — the poster is a clickable link in the HTML/PDF — and, when you add the `qr` modifier, a scannable code the room can scan to watch. Two compositions: `companion` (a claim leads on the left, the clip proves it on the right) and `gallery` (a contained, matted exhibit). Author the clip as one `@video{"https://…", title="…", poster=…}` record on a line of its own (the video plugin draws it); the provider is auto-detected.

## Agent contract

**By venue** no count budget. The poster fills its box and scales, so no element count marks where it stops fitting.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | no | Optional heading — the so-what of the clip, not 'Video'. |
| `video` | `.video-embed` | yes | The clip, written as a `@video{"https://…"}` record on a line of its own. The video plugin draws the poster, play badge and provider label from that record; the layout adds the QR on a `qr` slide. |
| `caption` | `.video-embed figcaption` | no | Optional: the record's `title="…"`, shown under the poster. |

### Variant decision rule

- **default (no modifier).** A standalone video callout with no strong claim beside it — poster plus meta column, the simplest look.
- **`companion`.** A specific claim leads the slide and the clip proves it — text and poster split left/right.
- **`gallery`.** The video is more exhibit than pitch — contained on a matte the way a diagram or screenshot would be. The provider's badge sits on the matte's lower edge, so it stays with the frame when the poster is portrait or square (TikTok and Instagram thumbnails usually are).
- **`qr`.** The room should be able to open the clip on their own phones — combines with any other variant to add a scannable code beside the poster.

### Common mistakes

- **The clip is still a bare bullet, with `caption` and `poster` bullets beside it.** The bullet form is gone: the address comes only from your own `@video{…}` record, never from slide text. `lint:deck --fix` rewrites the bullets into the record (`video-bullet`).
- **Writing a second `@video{…}` expecting a second clip or a contact-sheet grid.** The layout seats one clip; the first record on the slide is the one it lays out, and the second is drawn below it and runs off the slide. `lint:deck` says so (`video-extra-record`); give each clip its own slide.
- **Writing `@video{…}` on a slide that is not a `video` slide.** The layout and the poster picture belong to this class, so any other slide draws the clip only as a plain text link. `lint:deck` says so (`video-slide-class`); add `<!-- _class: video -->`.
- **The address holds `=` or `,` unquoted (`@video{https://youtu.be/x?t=90}`).** Quote it: `@video{"https://youtu.be/x?t=90"}`. Segno names the fix.

## When to use

- **A clip makes the point better than a screenshot.** A product walkthrough, a customer testimonial, a demo reel — anywhere motion carries the argument. The slide shows a clean poster; the room scans the QR (or clicks it in the HTML/PDF) to watch.
- **The URL is all you have to write.** Write the YouTube / Vimeo / TikTok / Instagram link in one `@video{…}` record; the provider is detected and the QR is generated for you. Add `poster=…` only when you want a specific still (required for Instagram, whose thumbnails aren't fetchable).
- **Closing / hand-off slides.** A 'watch the full demo' or 'see the launch film' send-off pairs a poster with a scannable code the audience takes with them — the same pattern as the QR closing/divider variants.

## When NOT to use

- **Expecting it to autoplay in the PDF.** A PDF is paper — it can't play video, and the engine bars iframes for security. `video` is a poster + scannable link by design. If you need in-app playback, that's a separate interactive surface, not a boardroom deck.
- **A wall of caption.** The caption is one line — 'Scan to watch', a title, a runtime. If you're writing a paragraph about the video, put it in a `content` slide and drop the clip in as a supporting `video`.
- **Instagram with no poster.** Instagram's public thumbnails aren't fetchable, so an Instagram `video` with no `poster=` word falls back to a plain placeholder tile. Author a `poster` for a real still.

## Authoring

```markdown
<!-- _class: video companion -->

## Watch the 90-second product tour.

One screen, one story — the fastest way to see the product work.

`@video{"https://www.youtube.com/watch?v=aqz-KE-bpKQ", title="A guided walkthrough"}`
```

## Variants (component-specific)

### `companion` — companion

The player beside the claim it proves.

```markdown
<!-- _class: video companion -->

## companion seats the player beside its pitch.

Ninety seconds, unscripted: signup to a published deck without touching support.

`@video{"https://www.youtube.com/watch?v=aqz-KE-bpKQ", title="Ree A., Head of Ops at Northwind", poster="sample:video-poster.svg"}`
```

### `gallery` — gallery

A contained, matted exhibit.

```markdown
<!-- _class: video gallery -->

## gallery mats the player like an exhibit.

`@video{"https://vimeo.com/1084537", title="The reference onboarding walkthrough, contained on its matte.", poster="sample:video-poster.svg"}`
```

### `qr` — qr

Adds a scannable code; combines with any look.

```markdown
<!-- _class: video companion qr -->

## qr hands the video to the room’s phones.

The full 90-second tour — scan to open it on your phone.

`@video{"https://www.youtube.com/watch?v=aqz-KE-bpKQ", title="Scan to watch", poster="sample:video-poster.svg"}`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`image`](../../imagery/image/image.docs.md) — the visual is a still photo or screenshot, not a video
- [`closing`](../../anchor/closing/closing.docs.md) — the send-off is a call to action with a QR, not a specific clip
- [`diagram`](../../diagram/diagram/diagram.docs.md) — the motion you want is an animated process — a Mermaid diagram may say it statically

## Demo deck

See [video.gallery.light.pdf](./video.gallery.light.pdf) for rendered examples of every variant.
