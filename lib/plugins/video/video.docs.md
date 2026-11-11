# video

A video as a static, PDF-safe poster that links to the clip, written in inline code on a line of its own:

```markdown
`@video{"https://youtu.be/dQw4w9WgXcQ", title="The 90-second tour", poster=sample:photo-pano.jpg}`
```

The line draws a poster with a play badge and the provider's name, and the poster is a link to the clip. It is never a live
iframe. It draws on any slide. The `video` slide class (`lib/components/imagery/video/video.docs.md`) seats the clip beside its
words: the default, `companion`, `gallery` and the `qr` variant. Design: `engineering/decisions/2026-10-16-media-plugins.md`.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`). It is on by default, and a deck pays nothing for it
until it writes a record.

## The record

```markdown
`@video{ADDRESS, title="…", description="…", poster=…}`
`>{ADDRESS, title="…"}`
```

`>{…}` is the short form, the way `^{…}` is an icon's and `!{…}` an avatar's: the two spellings draw the same figure.

| Word | Meaning |
|---|---|
| the address | First, required. YouTube, Vimeo, TikTok or Instagram (the table below). Quote it when it holds `=` or `,` (`"https://youtu.be/x?t=90"`); Segno says so and offers the fix. |
| `title="…"` | The caption under the poster, and the poster's accessible name. |
| `description="…"` | A longer line for narration and the notes. Not shown on the slide. |
| `poster=…` | The picture behind the play badge: a path, a `sample:` or `asset:` name, or a web address. Without one the poster is a drawn stand-in. |
| `sm` `md` `lg` | The poster's size, `md` by default: a nudge of about a fifth either way, never past the box the layout gives it. |
| `frame=…` | `mat`, `keyline`, `float`, `device` or `corners`, written bare or as `frame=device`. None by default. |
| `nimbus` `halo` `meridian` | A finish on the poster, the deck's own looks laid over the picture. A strength follows the name: `nimbus=40`, from `20` to `80` and `full`. |
| `duotone` `grayscale` | A tone, at full strength unless the record says `duotone=60`. |
| `show=…` | Which words the slide shows under the poster: `title` (the default for a clip), `all` (the description too) or `none`. Hidden words still reach a screen reader, the tooltip, the print notes and narration. |

The frames, finishes, tones and sizes are the same ones a picture takes (`lib/plugins/image/image.docs.md`), so a clip matches
the photos beside it. A deck sets them once with the `video:` register (`video: mat nimbus=40`), a slide with a class
(`<!-- _class: video-keyline -->`), and a record's own word wins over both. One finish and one tone at a time: two finishes
leave the record as code, and `lint:deck` says why.

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

On any other slide the record is a figure in the slide's flow: the poster at about half the slide's width, the title under it.

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
  Lattice cannot be sure of (inside a quote, a list or a fence) is left as code, so nothing is rewritten wrongly. Where the
  bundle's runtime runs, a record left as code, or one typed after export, draws the poster the way the kit does (below).
- **A deck written in Marp (the copy-and-go kit, `dist/marp-kit`).** The record draws the same poster and, on a `video` slide,
  the same card as in Lattice. Marp runs none of Lattice's rules, so the record reaches the runtime from your Markdown: marp-cli
  runs the kit's `marp.config.cjs` engine, which reads the records as Marp parses them, and the VS Code preview reads the saved
  file. Two consequences. In VS Code a record you have just typed draws when you save, not before. And a `@video{…}` that is on
  the page but not in your Markdown as a record (raw HTML, or a plugin's output) stays code: the address always comes from
  what you wrote (spec/LPM.md §10). The poster needs the runtime, so it draws in `marp --pdf`, in a `marp --html` file opened
  beside the kit's scripts, and in the VS Code preview at the *Disable* security level; elsewhere the record shows as code.

## What the linter says

| Finding | When |
|---|---|
| `video-no-record` | A `video` slide with no record, which draws no clip. |
| `video-not-alone` | A record in running text, or touching a line of text above or below it. |
| `video-literal` | A record whose address is not one of the four providers. |
| `video-extra-record` | A second lone record on one `video` slide, which runs off the slide. |
| `video-web-poster` | A `poster=` from another site, which the preview replaces with a placeholder. Save the poster beside the deck. |

## What stays literal

A record in running text, in a code fence, in a quote's lazy continuation, or with an address the provider table does not own
stays code. To show a record as text on purpose, put a backslash before the `@` or the `>`: `` `\@video{"https://youtu.be/x"}` ``, `` `\>{"https://youtu.be/x"}` ``.

## Anti-patterns

- **Two records on one slide.** The layouts seat one clip. The second is drawn below the first and runs off the slide, and `video-extra-record` says so. Give each clip its own slide.
- **A bullet for the address.** The old form draws nothing. Write the record.
- **Leaving the address unquoted when it holds `=`.** `?t=90` ends the address at the `=`. Quote it.
- **Expecting a live player.** The poster is a link. If the room needs the clip, show the scannable code or open the link.
