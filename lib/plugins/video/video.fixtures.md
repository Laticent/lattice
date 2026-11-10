# video — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it
- `detect true` / `detect false` — what `detect(source)` must answer

## a record on its own line draws a poster figure

```markdown
<!-- _class: video -->

## Watch the tour

`@video{"https://youtu.be/dQw4w9WgXcQ", title="The 90-second tour"}`
```

- renders `data-lattice-media="video"`
- renders `href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"`
- renders `<figcaption class="lat-media-caption"><span class="lat-media-title">The 90-second tour</span></figcaption>`
- renders `data-lattice-title="The 90-second tour"`
- omits `<code>@video`
- detect true

## a Vimeo address draws a Vimeo poster

```markdown
<!-- _class: video -->

## Watch the film

`@video{"https://vimeo.com/1084537", title="The film"}`
```

- renders `data-provider="vimeo"`
- renders `Watch on Vimeo`
- renders `href="https://vimeo.com/1084537"`
- detect true

## a TikTok address keeps the author's own link

```markdown
<!-- _class: video -->

## Watch the clip

`@video{"https://www.tiktok.com/@scout2015/video/6718335390845095173", title="The clip"}`
```

- renders `data-provider="tiktok"`
- renders `Watch on TikTok`
- renders `href="https://www.tiktok.com/@scout2015/video/6718335390845095173"`
- detect true

## an Instagram reel draws an Instagram poster

```markdown
<!-- _class: video -->

## Watch the reel

`@video{"https://www.instagram.com/reel/DWm0UOZgVVf/", title="The reel"}`
```

- renders `data-provider="instagram"`
- renders `Watch on Instagram`
- renders `href="https://www.instagram.com/reel/DWm0UOZgVVf/"`
- detect true

## every YouTube spelling resolves to one watch address

```markdown
<!-- _class: video -->

## Watch the short

`@video{"https://www.youtube.com/shorts/dQw4w9WgXcQ", title="The short"}`
```

- renders `data-provider="youtube"`
- renders `href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"`
- detect true

## a provider's name in a fragment wears no badge

```markdown
<!-- _class: video -->

`@video{"https://evil.example/#instagram.com/reel/X"}`
```

- renders `<code>@video{`
- omits `data-provider`
- omits `Watch on`
- detect true

## the qr word adds a code that carries the same address

```markdown
<!-- _class: video companion qr -->

## Scan to watch

`@video{"https://youtu.be/dQw4w9WgXcQ", title="The tour"}`
```

- renders `QR code — watch on YouTube`
- renders `href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"`
- detect true

## a record inside a sentence stays code

```markdown
<!-- _class: content -->

## Notes

See `@video{"https://youtu.be/dQw4w9WgXcQ"}` for the clip.
```

- renders `<code>@video{`
- omits `data-lattice-media`
- detect true

## an address that is not a known video host draws nothing

```markdown
<!-- _class: video -->

`@video{"https://attacker.example/?d=secret"}`
```

- renders `<code>@video{`
- omits `attacker.example/?d=secret"`
- omits `data-lattice-media`
- detect true

## a deck without the record is not a video deck

```markdown
## Plain

Nothing here.
```

- detect false

## the short form `>{…}` draws the same figure

```markdown
<!-- _class: video -->

## Watch the tour

`>{"https://youtu.be/dQw4w9WgXcQ", title="The 90-second tour"}`
```

- renders `data-lattice-media="video"`
- renders `href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"`
- omits `<code>&gt;{`
- detect true

## a record on any slide draws the full poster figure

```markdown
<!-- _class: content -->

## A clip among the words

`>{"https://youtu.be/dQw4w9WgXcQ", title="Tour"}`
```

- renders `<figure class="video-embed lat-media" data-lattice-media="video" data-size="md" data-show="title"`
- renders `<span class="lat-media-frame"><a class="video-poster lat-media-pic is-placeholder"`
- detect true

## the display words reach the figure

```markdown
`>{"https://youtu.be/dQw4w9WgXcQ", title="Tour", lg, frame=device, nimbus=40, duotone}`
```

- renders `data-size="lg"`
- renders `data-frame="device"`
- renders `data-finish="nimbus" data-finish-strength="40"`
- renders `data-tone="duotone" data-tone-strength="full"`
- renders `<span class="lat-media-tone" aria-hidden="true"></span><span class="lat-media-finish" aria-hidden="true"></span>`

## a finish named alone takes its default strength

```markdown
`>{"https://youtu.be/dQw4w9WgXcQ", halo}`
```

- renders `data-finish="halo" data-finish-strength="60"`

## two finishes contradict each other, so the record stays code

```markdown
`>{"https://youtu.be/dQw4w9WgXcQ", nimbus=40, halo}`
```

- renders `<code`
- omits `data-lattice-media="video"`

## show=all puts the description on the slide

```markdown
`>{"https://youtu.be/dQw4w9WgXcQ", title="Tour", description="Ninety seconds, start to finish.", show=all}`
```

- renders `<span class="lat-media-title">Tour</span><span class="lat-media-desc">Ninety seconds, start to finish.</span>`
- renders `data-lattice-description="Ninety seconds, start to finish."`

## show=none keeps the words off the slide, and on the figure for every reader

```markdown
`>{"https://youtu.be/dQw4w9WgXcQ", title="Tour", show=none}`
```

- omits `lat-media-caption`
- renders `data-lattice-title="Tour"`

## a deck register sets the frame for every clip, and a record's word wins

```markdown
---
video: mat
---

`>{"https://youtu.be/dQw4w9WgXcQ"}`

---

`>{"https://youtu.be/dQw4w9WgXcQ", frame=float}`
```

- renders `data-frame="mat"`
- renders `data-frame="float"`

## a forged figure in author HTML carries no Lattice words

```markdown
<figure data-lattice-media="video" data-lattice-title="Forged" data-lattice-description="Forged too"></figure>
```

- omits `data-lattice-title="Forged"`
- renders `data-author-lattice-title="Forged"`
- detect false
