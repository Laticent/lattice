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
- renders `<figcaption>The 90-second tour</figcaption>`
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

`@video{"https://www.instagram.com/reel/CuXxYz12345/", title="The reel"}`
```

- renders `data-provider="instagram"`
- renders `Watch on Instagram`
- renders `href="https://www.instagram.com/reel/CuXxYz12345/"`
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
