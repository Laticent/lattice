# video

A video as a static, PDF-safe poster that links to the clip, written in inline code on a line of its own:

```markdown
`@video{"https://youtu.be/dQw4w9WgXcQ", title="The 90-second tour", poster=sample:photo-pano.jpg}`
```

The line draws a poster with a play badge and the provider's name, and the poster is a link to the clip. It is never a live
iframe. The `video` slide class (`lib/components/imagery/video/video.docs.md`) lays the figure out: `companion`, `gallery`
and the `qr` variant. Design: `engineering/decisions/2026-10-16-media-plugins.md`.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`). It is on by default.

## The record

| Word | Meaning |
|---|---|
| the address | First, required. YouTube, Vimeo, TikTok or Instagram. Quote it when it holds `=` or `,` (`"https://youtu.be/x?t=90"`); Segno says so and offers the fix. |
| `title="…"` | The caption under the poster, and the poster's accessible name. |
| `description="…"` | A longer line for narration and the notes. Not shown on the slide. |
| `poster=…` | The picture behind the play badge: a path, `sample:` or `asset:` name, or a web address. Without one the poster is a drawn stand-in. |

The record goes on a line of its own. In running text it stays code, and `lint:deck` says why.

## The address comes only from the record

Nothing in this plugin reads a slide's text. The engine reads the address from your `@video{…}` span while it parses
the Markdown. A zip plugin's drawing is text on the slide, so a plugin that wrote `https://attacker.example/?d=…`
into a video slide gets no poster, no link and no code from Lattice: the browser's own pass skips anything inside
`[data-lattice-plugin]`, and the kind is declared `address`, which keeps it off the runtime's DOM mirror.

## Migrating a `video` slide

Before, the address was a bare bullet:

```markdown
<!-- _class: video companion -->

- https://www.youtube.com/watch?v=aqz-KE-bpKQ
- A guided walkthrough `caption`
```

Now it is a record. The class stays; the bullets go:

```markdown
<!-- _class: video companion -->

`@video{"https://www.youtube.com/watch?v=aqz-KE-bpKQ", title="A guided walkthrough"}`
```

`lint:deck` flags the old form on a `video` slide as `video-bullet`.
