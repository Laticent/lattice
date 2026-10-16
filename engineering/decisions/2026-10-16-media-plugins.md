---
status: proposed
summary: >
  Images and videos become two plugins, `image` and `video`, that any slide can use through Segno records
  (`@image{…}`, `@video{…}`), with Markdown's `![alt](src)` kept as the image's alias. Where the bytes come
  from is a separate, core concern: one registry of media sources (data, relative, file, web, sample, asset,
  later Google Drive) replaces the scheme checks repeated across five files. Video hosts stay one table of
  provider rows, extended with a `file` row for MP4 and WebM. The audit found nine defects in today's wiring,
  one of them confirmed by a render: a relative image in slide text breaks in a CLI export written to another folder.
  Owner decisions: a clean break from Marp's alt-text keywords with an autofix, `>` as the video sigil, and remote
  sources fetched in the bake into a cache; packaging is on hold.
---

# Image and video plugins, and one registry of media sources (2026-10-16)

Status: proposed. The owner's decisions are in §8; packaging is on hold. Parents: `2026-09-27-plugin-system.md` (the plugin
contract), `2026-10-14-plugin-inline-door.md` (the `@kind{…}` form), `2026-09-28-segno-unified-inline-notation.md`
(the record grammar), `2026-10-12-library-media-assets.md` (the `asset:` namespace and the Library),
`2026-09-13-plugin-architecture.md` (the "T0 Provider" tier, whose first example was video providers).

## 1. The answer

There are two separate questions here, and today's code mixes them:

1. **What a slide shows**: an image or a video, where it sits on the slide, and how it is treated. This
   becomes two plugins, `image` and `video`, written as Segno records so they work on any slide.
2. **Where the bytes come from**: a pasted `data:` URI, a file beside the deck, a web address, Lattice's
   sample art, the Studio Library, and later Google Drive. This becomes one core registry of **media
   sources**. Both plugins read from it, and so do the `image`, `collage` and `video` slide classes.

The two axes are independent. `@video{asset:launch-demo}` is the `video` plugin reading the `asset` source.
`@image{gdrive:1AbC…, right}` is the `image` plugin reading a future `gdrive` source. Adding a source never
touches a plugin, and adding a video host never touches a source.

Author syntax, as proposed:

```md
![Team offsite](asset:offsite)                       an image: CommonMark, kept as the image's alias
`@image{asset:offsite, alt="Team offsite", right, 40%, scrim}`   the same image, placed and treated
`@video{https://youtu.be/dQw4w9WgXcQ, poster=asset:keynote, qr}` a video on any slide
`>{https://youtu.be/dQw4w9WgXcQ}`                    the same video through its sigil (§8)
`@video{clips/demo.mp4}`                             a video file beside the deck (new: the `file` row)
```

A paragraph that holds only one media record renders as a block figure, the same way a lone `![…](…)` does
today. A record inside running text renders inline at text height, as an icon does.

## 2. What exists today

A read-only map of the pipeline, with every claim below checked against the source on 2026-10-16.

**Video is a slide layout, not something a slide can contain.** The only way to show a video is
`<!-- _class: video -->` with the URL as a list bullet (`lib/components/imagery/video/video.transform.js:16-19`).
Only the first matching URL is used. Every output (HTML, PDF, PPTX, PNG) gets the same markup: a poster tile
linked to the watch page, a play badge, "Watch on {label}" and, under `qr`, a QR code. Live playback exists only
in the docs-site preview, where the parent page mounts an iframe over the poster (`docs/src/playground/video-overlay.js`).

**The video hosts are already one table.** `PROVIDERS` in `lib/core/video-providers.mjs:85-158` holds one
descriptor per host (`key, label, hosts, id(url), watch, oembed, embed, shape, asyncResolve?`): YouTube,
Vimeo, TikTok and Instagram. Detection is a host lookup on a parsed URL, not a regex over the whole string,
and the render never touches the network. This is the strategy pattern already; the proposal extends it rather
than replacing it.

**Images use Markdown plus Marp's keywords in the alt text.** `![bg left](x)` is parsed by `BG_RE`
(`lib/core/bg-directive.js:30`) and by `installBackgroundImage` (`lib/engine/background-image.js:112-151`).
The `image` slide class lifts it into a `.lattice-bg` div (`lib/core/bg-image.js:172`); other slides get a
section background. `collage` reads `- ![Alt](path) \`hero, top, 3:2\`` list items.

**Sources are handled by scheme checks scattered across files:**

| Source | Written | Resolved by | Preview | Export |
|---|---|---|---|---|
| Embedded | `data:image/png;base64,…` | passes through | renders | renders |
| Relative path | `pic.jpg` | `resolveAssetUrl` (`bg-image.js:86`) against `baseUrl` | against the host's base | CLI lifts `![bg]` to `file://`; the player inlines `file://` as `data:` (`html-player.js:70-112`) |
| Absolute / `file:` | `/x/pic.jpg` | passes through | as written | inlined by `inlineFileUrls` |
| Web | `https://…` | `blockWebImages` (`remote-ref.js:527`) | a drawn hatch until the reader allows it | CLI: blocked unless `--allow-remote`; Studio player: fetched on opt-in, capped (`inline-url-media.mjs:132`) |
| Sample art | `sample:<name>` | `sampleName` (`remote-ref.js:67`) + `samplesUrl` | the site's staged copy | `file://` into `lib/samples/` |
| Library | `asset:<name>` | `assetName` (`remote-ref.js:82`) + the host's `assetUrls` map | `blob:` URL | `data:` URI (`media-urls.ts:160`); **CLI: unsupported** |

There is no source interface. `sample:` and `asset:` are regexes repeated in `bg-image.js:74,81,113,128-129`,
`background-image.js:93-94` and `remote-ref.js:55-56`. The host seams that do exist (`opts.assetUrls`,
`samplesUrl`, `baseUrl` on `engine.render`; `fetchDataUri` in `inlineUrlMedia`; `createAssetReader` in the PDF
writer) are the natural places for a registry to plug into.

**Nothing proposed an image or video plugin before this note.** The plugin-system note's list of future
plugins (§5) names neither. The only precedent is the "T0 Provider" tier in `2026-09-13-plugin-architecture.md`
(line 96), whose example was video providers, and its remark that "adding Loom or a bare `.mp4` is now a
one-row change" (lines 324-327).

## 3. Defects the audit found

| # | Defect | Evidence |
|---|---|---|
| D1 | **A relative image in slide text breaks in a CLI export written to another folder.** Chromium loads the page from the output path, and the CLI passes the engine `samplesUrl` but no `baseUrl` (`lattice.js:2178,2191`), so `![a](pic.jpg)` resolves against the output folder. `![bg]` is unaffected because the CLI lifts it to `file://` first | **Confirmed by render, 2026-10-16:** `deck/d.md` → `out/d.png` shows a broken-image icon and the PDF writer reports "1 not-loaded"; the same deck rendered into `deck/` shows the picture. Logged as `followups.d/2727-p1-cli-relative-prose-image.md` |
| D2 | The `sample:` / `asset:` checks are repeated in five places, so a new source means editing all of them, and the security predicate (`isRemoteUrl`) can drift from the resolver | §2 |
| D3 | The CLI lifts `![bg]` on every slide (`liftBgImages`, `lattice.js:2170`); the engine lifts only on `image` slides (`bg-image.js:172`). Two render paths, two behaviors (HARD RULE #1) | code reading |
| D4 | `bgDiv` drops `fit` / `contain`; only the engine's section-background rule honors them | `bg-image.js:151` vs `background-image.js:39` |
| D5 | Marp's `w:`, `h:`, filters (`blur`, `sepia`, …) and `bg left:40%` are not implemented. `![w:200](x)` renders a full-size image with "w:200" as its alt text; `bg left:40%` renders a full-bleed cover | no handler in `lib/`; `BG_RE` rejects `:` and `%` (checked with `node -e`) |
| D6 | `tools/fetch-video-oembed.js` writes a poster cache that no render reads, so the author copies the path into a `poster` bullet by hand | grep finds only a comment at `video-providers.mjs:71` |
| D7 | `asset:` names a Library video, but a slide cannot show one: it renders the missing-image stand-in | `2026-10-12-library-media-assets.md:8,639` |
| D8 | `IMG_SRC_RE` (`bg-image.js:94`) matches double-quoted `src` only; raw `<video src="asset:x">` and `srcset` are not resolved | also `followups.d/2640-p3-raw-html-asset-refs.md` |
| D9 | The PDF writer's asset reader accepts PNG and JPEG only (`pdf-asset-reader.js:23-30`); WebP, GIF and AVIF stay in the Chromium raster | code reading; not rendered |

D1 is pre-existing and off the path of this note, which is design only. It sits on the path of slice 1 (§7),
which fixes it.

## 4. The model

### 4.1 Media sources: one core registry

A **source** is one way of turning a reference into bytes. Each is a row in `lib/core/media-sources.js`, a
dependency-free leaf like `remote-ref.js` so the browser can load it as-is:

```js
{
  scheme: 'asset',                 // matched on the reference's scheme; null for relative paths
  parse(ref)    → id | null,       // pure; a malformed reference is null and is refused
  locality: 'local' | 'remote',    // remote = a beacon to a third party (HARD RULE #22)
  resolve(id, host) → url | null,  // sync, during the render; the host supplies what it needs
  materialize?(id, host) → bytes,  // async, in the bake pass, for sources a render cannot reach
  exportAs: 'inline' | 'copy' | 'link',  // what an export does with it
}
```

The rows: `data`, `relative`, `file`, `web`, `sample`, `asset`. `isRemoteUrl` is derived from the table's
`locality`, so the security predicate and the resolver can no longer disagree (D2). Each host supplies only the
`host` half: the Studio its IndexedDB map, the CLI the deck folder and `lib/samples/`, the desktop app its file
system. A source a host cannot serve resolves to the existing drawn stand-in, and `lint:deck` names it.

**Remote and slow sources materialize in the bake pass.** The plugin host already runs an async bake before
the synchronous render. A source with `materialize` (web, and later `gdrive`, `onedrive`, `dropbox`, `unsplash`)
fetches there, behind the same consent the web source has today, into a content-addressed cache keyed by
SHA-256. The render then sees a local reference. This one step also fixes the export duplication in
`followups.d/2640-p3-media-export-duplication.md`: one cached copy, referenced from every slide.

**A future source is a plugin contribution.** `contributes.sources` joins the manifest as a T0 provider:
declarative, so a source can ship from a zip plugin, with its fetch code in-tree or sandboxed. Google Drive
needs an OAuth token, which the desktop app and the Studio hold and the CLI does not; the row declares which
hosts can serve it, and the others show the stand-in.

### 4.2 The `image` plugin

- **The kind is `image`.** `` `@image{src, alt="…", …}` `` is the full form. CommonMark's `![alt](src)` is
  its alias, the way `^{…}` is the icon's: same record, no options. Every editor, GitHub and every Markdown
  tool still shows the picture.
- **Options are Segno words, not Marp keywords:** placement (`bg`, `left`, `right`, a share like `40%`), fit
  (`cover`, `contain`), size (`w=`, `h=`), treatment (`scrim`, `duotone`, `grayscale`), focus (`focus=top`).
  Each maps to a register the deck can set once, as icons and avatars do (`image: scrim`).
- **It owns** `bg-image.js`, `background-image.js`, `image-scrim`, `image-adaptive` and the `wrapImageText`
  pass. That ends the CLI/engine split (D3, D4): one lift, in the kernel both paths read.
- **The `image` and `collage` slide classes require the plugin**, as the `math` class requires `math`.
- **Images are not opt-in.** Unlike icons, `![…](…)` is CommonMark, so the plugin is a default plugin a
  host can still disable; a deck never has to list it.

### 4.3 The `video` plugin

- **The kind is `video`:** `` `@video{url, poster=…, caption="…", qr}` ``. It renders the existing poster,
  badge and QR figure on any slide. The `video` slide class becomes a layout that requires the plugin.
- **The provider table moves in, and grows a `kind`.** Today's four rows become `kind: 'embed'`. A new
  `kind: 'file'` row claims `.mp4`, `.webm` and `.mov` from any source (relative, `asset:`, web). That makes
  Library videos showable (D7) and gives the HTML player and the desktop app a real `<video>` element.
- **Per-surface output is the row's job, not the call site's:**

  | Surface | `embed` row | `file` row |
  |---|---|---|
  | PDF, PNG, PPTX | poster, badge, QR | poster (the Library's captured one, or a first frame), badge |
  | HTML player, presenter | click-to-load iframe behind the web consent | `<video controls>` |
  | Studio preview | the existing overlay | `<video controls>` |

- **Posters resolve through a chain:** the author's `poster=`, then the Library record's poster, then the
  oEmbed cache (wiring the dead cache, D6), then the drawn stand-in. Each link is a media source, so a poster
  can come from anywhere an image can.
- **New hosts are rows.** Loom, Wistia and Google Drive video are each one descriptor. In-tree rows keep
  their `id(url)` functions; a zip plugin's row is declarative (hosts plus a Segno-compiled path pattern),
  because the Segno compiler already rejects any pattern that could backtrack.

### 4.4 What stays where

| Piece | Home | Why |
|---|---|---|
| Media sources registry, `isRemoteUrl` | core (`lib/core/media-sources.js`) | a security boundary every surface needs, with or without a plugin |
| Image placement, treatment, `@image` | `lib/plugins/image/` | owns the syntax; the slide classes require it |
| Video providers, `@video` | `lib/plugins/video/` | the T0 table plus the inline kind; a deck with no video loads none of it |
| `image`, `collage`, `video` slide classes | components, unchanged in place | layouts that compose the plugins |

## 5. Why records, not Marp keywords

Marp hides options in the alt text (`![bg left:40% blur](x)`), so the alt text a screen reader needs is
also the place that says "bg left". It is a private grammar the house notation was built to retire, half of it
is not implemented here (D5), and it cannot carry a key with a value (`poster=`, `focus=top`). A Segno record
gives every option a name, completes in the editor through the `@` trigger, and gets a Compose panel from its
declared fields, as pills, icons and avatars already do.

Keeping `![alt](src)` as the alias costs nothing and keeps decks readable outside Lattice. Export-to-Marp
(`lib/core/marp-bundle.js`) writes Marp's keywords back out, so a round trip to Marp still works.

## 6. Options not taken

- **One `media` plugin for both.** Images are on by default and video is not; one plugin would load the
  provider table for every deck with a picture.
- **Sources as part of each plugin.** The `collage`, `image` and `video` layouts and the CSS `url()` path all
  need sources, and the security predicate must see every one. Splitting sources by plugin is how D2 happened.
- **A fallback chain across sources** ("try the deck folder, then the Library"). Rejected once already
  (`2026-10-07-sample-images.md`): a missing file would silently show a different picture.
- **Fetching in the render.** The render stays synchronous and offline; every fetch happens in the bake,
  behind consent.

## 7. Build order

Each slice ships on its own, smallest risk first.

1. **Sources registry**, no visible change except fixes: the six rows, `isRemoteUrl` derived from them, the
   repeated regexes deleted, `asset:` resolving in the CLI against a deck-folder map, and D1 fixed by passing
   the deck folder as `baseUrl`. Maker-checker (it moves a HARD RULE #22 predicate).
2. **`video` plugin**: the table moves, `@video{…}` on any slide, the `file` row, the poster chain, the oEmbed
   cache read. Demo deck (HARD RULE #9).
3. **`image` plugin**: `@image{…}`, the options and registers, one lift for both paths (D3, D4), Marp keywords
   rewritten by `lint:deck --fix` (§8, decision 2). Demo deck.
4. **Bake materialization and the content-addressed cache**, then the first remote source behind consent.
   Google Drive comes after the desktop app holds a token.

Adversarial trio on slices 1 and 4 (a new trust boundary); one checker on 2 and 3.

## 8. Decisions (owner, 2026-10-16)

1. **Packaging: on hold.** The owner held this one. The options stay as written: a core sources registry plus
   separate `image` and `video` plugins (this note's recommendation, §4.4), one `media` plugin, or all core.
   Slice 1 (the sources registry) is core under every option, so it does not wait on this.
2. **Marp's alt-text keywords: a clean break, with an autofix.** `![alt](src)` stays as the plain image alias.
   Placement and treatment move to `@image{…}`, and `lint:deck --fix` rewrites `![bg left](x)` and the rest.
   This matches Segno's no-dual-syntax decision. Export-to-Marp still writes the keywords back out.
3. **Video gets the sigil `>`:** `` `>{https://youtu.be/…, qr}` `` is `@video{…}`. The tag set is
   `INLINE_TAGS` in `lib/plugins/resolve.js:419` (`~ ^ !` today), so slice 2 widens it to four and has
   to show that no shipped grammar reads an inline code span that starts with `>{`. The sigil is typed only in
   source, so no glyph reaches a slide (HARD RULE #29).
4. **Remote sources are fetched in the bake into a content-addressed cache, behind consent** (§4.1). The
   render stays offline, and an export carries one copy of each file.

## 9. Progress

- 2026-10-16: audit and proposal written; D1 confirmed by render and logged. Owner settled decisions 2-4;
  decision 1 (packaging) is on hold.
