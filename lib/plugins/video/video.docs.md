# video

A video as a static, PDF-safe poster that links to the clip, written in inline code on a line of its own:

```markdown
`@video{"https://youtu.be/dQw4w9WgXcQ", title="The 90-second tour", poster=sample:photo-pano.jpg}`
```

The line draws a poster with a play badge and the provider's name, and the poster is a link to the clip. It is never a live
iframe. The `video` slide class (`lib/components/imagery/video/video.docs.md`) lays the figure out: the default, `companion`,
`gallery` and the `qr` variant. Design: `engineering/decisions/2026-10-16-media-plugins.md`.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`). It is on by default, and a deck pays nothing for it
until it writes a record.

## The record

```markdown
`@video{ADDRESS, title="…", description="…", poster=…}`
```

| Word | Meaning |
|---|---|
| the address | First, required. YouTube, Vimeo, TikTok or Instagram (the table below). Quote it when it holds `=` or `,` (`"https://youtu.be/x?t=90"`); Segno says so and offers the fix. |
| `title="…"` | The caption under the poster, and the poster's accessible name. |
| `description="…"` | A longer line for narration and the notes. Not shown on the slide. |
| `poster=…` | The picture behind the play badge: a path, a `sample:` or `asset:` name, or a web address. Without one the poster is a drawn stand-in. |

The record goes on a line of its own, with a blank line above and below it. In running text it stays code, and `lint:deck`
says why (`video-not-alone`).

## The four providers

One table, `lib/core/video-providers.mjs`, feeds every surface: the poster, the badge, the scannable code, the Studio's player and
the oEmbed tool. Adding a provider is one row there.

| Provider | Badge | Forms the record accepts | The poster links to | Player in the Studio |
|---|---|---|---|---|
| YouTube | Watch on YouTube | `watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `live/`, `youtube-nocookie.com/embed/`, with or without `https://` | `https://www.youtube.com/watch?v=ID` | Yes |
| Vimeo | Watch on Vimeo | `vimeo.com/ID`, `player.vimeo.com/video/ID` (an ID is five or more digits) | `https://vimeo.com/ID` | Yes |
| TikTok | Watch on TikTok | `@name/video/ID`, `embed/ID`, `player/v1/ID`, and short `vm.tiktok.com/…` links | The address you wrote | Yes for a full link; a short link is resolved when you tap it |
| Instagram | Watch on Instagram | `reel/CODE`, `reels/CODE`, `p/CODE`, `tv/CODE` | The address you wrote | Yes |

An address on a provider's host with no clip in it (a channel, a profile, a playlist) still draws, and the poster links to the
address you wrote. An address on any other host draws nothing and stays code, and `lint:deck` says so (`video-literal`).

**The host is matched as a host.** A provider's name in a path, a query or a fragment does not make an address that provider's:
`https://evil.example/#instagram.com/reel/X` has no badge, no link and no scannable code. A deck that arrives from someone else
cannot dress a foreign origin in a provider's badge.

## The layouts

The slide class picks the layout; the record only names the clip.

| Slide | Draws |
|---|---|
| `video` | The poster centered, with the caption under it. |
| `video companion` | The heading and a sentence on the left, the poster on the right. |
| `video gallery` | The poster contained on a matte, as an exhibit. The provider's badge sits on the matte's lower edge, whatever shape the picture is. |
| any of them with `qr` | A scannable code beside the poster, carrying the same address, with a "Scan to watch" hint. |

Posters are cropped to a 16:9 frame (`gallery` keeps the whole picture on its matte). TikTok and Instagram thumbnails are
usually portrait, so expect a crop in `video` and `companion`, or a matte around the whole picture in `gallery`.

A `@video` on a slide that is not a `video` slide has no layout and no poster picture, so it draws only as a plain text link with the caption under it. `lint:deck` says so
(`video-slide-class`) and names the class to write.

## The address comes only from the record

Nothing in this plugin reads a slide's text. The engine reads the address from your `@video{…}` span while it parses
the Markdown. A zip plugin's drawing is text on the slide, so a plugin that wrote `https://attacker.example/?d=…`
into a video slide gets no poster, no link and no code from Lattice: the browser's own pass skips anything inside
`[data-lattice-plugin]`, and the kind is declared `address`, which keeps it off the runtime's DOM mirror. The poster picture, the
badge and the scannable code are rebuilt from the address the figure carries, after the provider table has checked it again.

## In the Studio

Type `` `@ `` and choose `video` from the menu. Tapping a poster in the preview opens a player over it, built from the provider's
own embed address and the parsed clip ID, never from the text of the link. Everywhere else the poster is a plain link.

Under the player the Studio always shows "Not playing? Open on {provider}", a plain link to the clip's own page. A browser with its
own tracking protection (Firefox, Orion) can blank a third-party player and the page cannot read the frame to tell. TikTok and
Instagram players post a message to the page when they load, so when one stays silent for 8 seconds the Studio adds a notice above
the link: "{provider} didn't load. Your browser's tracking protection or a content blocker may be blocking it." The notice says
"may" because the page can see that the player is silent, not why. YouTube and Vimeo players send no such message, so they get the
link and no notice.

## In an export

- **PDF and print.** The poster is a clickable link, and the scannable code carries the address for paper.
- **HTML.** The same figure, with the same link.
- **Export to Marp.** A lone record becomes an ordinary Markdown link on its own line, recorded in the fidelity ledger. A record
  Lattice cannot be sure of (inside a quote, a list or a fence) is left as code, so nothing is rewritten wrongly.

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

`lint:deck` flags the old form on a `video` slide as `video-bullet`, and `lint:deck --fix` moves a lone address bullet into a
record. A slide with a `caption` or `poster` bullet needs the move by hand.

## What the linter says

| Finding | When |
|---|---|
| `video-bullet` | A `video` slide that still names its clip as a bullet, or has no record. |
| `video-not-alone` | A record in running text, or touching a line of text above or below it. |
| `video-literal` | A record whose address is not one of the four providers. |
| `video-slide-class` | A lone record on a slide that is not a `video` slide. |
| `video-extra-record` | A second lone record on one `video` slide, which runs off the slide. |

## What stays literal

A record in running text, in a code fence, in a quote's lazy continuation, or with an address the provider table does not own
stays code. To show a record as text on purpose, put a backslash before the `@`: `` `\@video{"https://youtu.be/x"}` ``.

## Anti-patterns

- **Two records on one slide.** The layouts seat one clip. The second is drawn below the first and runs off the slide, and `video-extra-record` says so. Give each clip its own slide.
- **A bullet for the address.** The old form draws nothing. Write the record.
- **Leaving the address unquoted when it holds `=`.** `?t=90` ends the address at the `=`. Quote it.
- **Expecting a live player.** The poster is a link. If the room needs the clip, show the scannable code or open the link.
