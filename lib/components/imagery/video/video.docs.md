# video

> A video as a static, PDF-safe embed: a poster that links to the clip, a play badge, the provider's name, and a scannable QR to the same URL — never a live iframe.

**Function** imagery · **Form** canvas · **Substance** prose

**Tags** `visual` · `showcase` · `pitch`

Use to put a YouTube / Vimeo / TikTok / Instagram video on a slide. Because the deck renders to a static PDF (and the engine bars iframes), a `video` slide shows a POSTER with a play badge + provider label — the poster is a clickable link in the HTML/PDF — and, when you add the `qr` modifier, a scannable code the room can scan to watch. Two compositions: `companion` (a claim leads on the left, the clip proves it on the right) and `gallery` (a contained, matted exhibit). Author the URL as a bare bullet; add an optional `caption` and an optional `poster` override. Provider is auto-detected.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | no | Optional heading — the so-what of the clip, not 'Video'. |
| `video` | `.video-embed` | yes | The video URL, authored as a bare bullet (`- https://youtube.com/watch?v=…`). Provider is auto-detected; the transform builds the poster + play badge + QR. |
| `caption` | `.video-embed figcaption` | no | Optional caption bullet — `` - Scan to watch `caption` ``. |

## When to use

- **A clip makes the point better than a screenshot.** A product walkthrough, a customer testimonial, a demo reel — anywhere motion carries the argument. The slide shows a clean poster; the room scans the QR (or clicks it in the HTML/PDF) to watch.
- **The URL is all you have to write.** Paste the YouTube / Vimeo / TikTok / Instagram link as a bare bullet; the provider is detected and the QR is generated for you. Add a `poster` bullet only when you want a specific still (required for Instagram, whose thumbnails aren't fetchable).
- **Closing / hand-off slides.** A 'watch the full demo' or 'see the launch film' send-off pairs a poster with a scannable code the audience takes with them — the same pattern as the QR closing/divider variants.

## When NOT to use

- **Expecting it to autoplay in the PDF.** A PDF is paper — it can't play video, and the engine bars iframes for security. `video` is a poster + scannable link by design. If you need in-app playback, that's a separate interactive surface, not a boardroom deck.
- **A wall of caption.** The caption is one line — 'Scan to watch', a title, a runtime. If you're writing a paragraph about the video, put it in a `content` slide and drop the clip in as a supporting `video`.
- **Instagram with no poster.** Instagram's public thumbnails aren't fetchable, so an Instagram `video` with no `poster` bullet falls back to a plain placeholder tile. Author a `poster` for a real still.

## Authoring

```markdown
<!-- _class: video companion -->

## Watch the 90-second product tour.

One screen, one story — the fastest way to see the product work.

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- A guided walkthrough `caption`
```

## Variants (component-specific)

### `companion` — companion

The player beside the claim it proves.

```markdown
<!-- _class: video companion -->

## companion seats the player beside its pitch.

Ninety seconds, unscripted: signup to a published deck without touching support.

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- Ree A., Head of Ops at Northwind `caption`
- video-poster.svg `poster`
```

### `gallery` — gallery

A contained, matted exhibit.

```markdown
<!-- _class: video gallery -->

## gallery mats the player like an exhibit.

- https://vimeo.com/1084537
- The reference onboarding walkthrough, contained on its matte. `caption`
- video-poster.svg `poster`
```

### `qr` — qr

Adds a scannable code; combines with any look.

```markdown
<!-- _class: video companion qr -->

## qr hands the video to the room’s phones.

The full 90-second tour — scan to open it on your phone.

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- Scan to watch `caption`
- video-poster.svg `poster`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`image`](../../imagery/image/image.docs.md) — the visual is a still photo or screenshot, not a video
- [`closing`](../../anchor/closing/closing.docs.md) — the send-off is a call to action with a QR, not a specific clip
- [`diagram`](../../diagram/diagram/diagram.docs.md) — the motion you want is an animated process — a Mermaid diagram may say it statically

## Demo deck

See [video.gallery.light.pdf](./video.gallery.light.pdf) for rendered examples of every variant.
