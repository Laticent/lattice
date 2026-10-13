---
status: in-progress
summary: Photos and videos in the Library — one `asset:<name>` namespace, a scope flag (library or one deck), a name-to-URL map the host hands the engine, and the intake, export, backup and storage rules that follow.
---

# Library media assets — photos and videos, shared or per deck (2026-10-12)

**Where this stands:** images (slices 1 to 4) are built in #2640; video (slice 5) and the open questions below are still proposals.

**Owner rulings (2026-10-12):** one `asset:<name>` namespace with a `scope` flag rather than two
prefixes; images and video in the same line of work; one Images tab with a "This deck / All
decks" toggle rather than a second panel in the deck editor.

## The ask

"I want to be able to add images from photos, videos, files, etc. Library is shared assets.
Deck-specific assets need a design."

Today the Library accepts `.zip` (asset packs) and `.txt/.md/.pdf` (reference docs). Both
`<input type="file">` elements hard-code an `accept` filter (`Library.tsx:676-677`), so the
native Android and iOS pickers hide photos and videos. The filter is the smaller problem: the
store, the deck syntax and the exports have no notion of a user-supplied picture or clip.

## What exists (read 2026-10-12)

| Piece | Where | What it means here |
|---|---|---|
| Shared store | `docs/src/components/studio/library/asset-db.js`, `asset-store.js` | One IndexedDB database, one `assets` store, `kind` index. `(kind, name)` is unique and enforced inside the write transaction. A new kind needs no schema bump. |
| Reference docs | `reference-doc-store.ts` | The model to copy: a record of `kind: 'refdoc'` with `dataUrl`, saved through `putAsset`. It stores bytes inline as a data URL, which is wrong for video (see §4). |
| Decks | the Studio store (localStorage-backed) | Decks are markdown strings. They hold no bytes and should not start to. |
| Picture references | `lib/core/remote-ref.js` `sampleName`, `lib/core/bg-image.js` `resolveAssetUrl` | `sample:<name>` resolves through one kernel. A host supplies a base URL. Component transforms never resolve it. |
| Exports | `share-export.ts`, `export/deck-export.js` | Embed same-origin, `data:` and `blob:` images. A missing image degrades to a placeholder (`2026-09-13-export-survives-a-missing-image.md`). |
| Backup | `workspace-backup.ts` | A zip with `workspace.json`, `library.zip` and a `refdocs.json` side lane, each with its own size cap (`zip-limits.ts`). |

## The decision

### 1. Records

A new kind pair in the existing store, `image` and `video`. Each record carries:

- `name` — unique across **both** kinds and **both** scopes. The existing `(kind, name)` rule
  becomes "one name, one asset" for media, so `asset:logo` can only mean one thing.
- `scope` — `'library'` or a deck id. This is the only thing that separates a shared asset from a
  deck-specific one.
- `blob` — the bytes as a `Blob`, not a data URL. IndexedDB stores Blobs natively without the
  33% base64 inflation, and a video as a data URL would sit whole in memory.
- `mime`, `bytes`, `width`, `height`, `addedAt`; for video also `durationMs` and a `poster`
  (a small JPEG `Blob`).
- `original` — `false` once the importer has downscaled the picture (§3).

### 2. The deck syntax: `asset:<name>`

A deck writes `![](asset:team-offsite)` or `![bg](asset:hero)`. The grammar is the `sample:`
grammar: one path segment of plain characters, never `..`, parsed by a sibling of `sampleName`
in `lib/core/remote-ref.js` (that module is loaded as-is in the browser, so it takes no imports).
A well-formed `asset:` reference is local (`isRemoteUrl` returns false), so it passes the package
import gate (HARD RULE #22). A malformed one resolves to nothing and stays refused.

There is **no fallback chain**. The sample-images decision (`2026-10-07-sample-images.md`,
"Options not taken") rejected "try the deck, then the library" because a missing file would
silently show a different picture. One unique name per asset removes the need.

**What resolves it.** `sample:` resolves against a base URL. An asset's bytes live in
IndexedDB, not at a URL, so the host hands the engine a **name → URL map** (`assetUrls`) in the
same place it hands `samplesUrl`. The engine resolves in the same two spots it resolves
`sample:` (`installSampleImages`, `resolveInlineImageSrcs`) and component transforms never do,
so a sandboxed code package sees the same markup as the in-repo render
(`code-package-parity.test.js`).

What the map holds depends on the host:

| Host | URL for `asset:x` |
|---|---|
| Studio preview, presenter | `URL.createObjectURL(blob)`, revoked when the deck closes or the asset changes |
| Studio export (webpage, PDF, PowerPoint, image set) | a `data:` URI built from the photo's bytes (`dataUrlsFor`, `media-urls.ts`). A `blob:` URL dies with the tab, so a saved file would ship a dead link, and a capture frame may not fetch one. The Share sheet adds a note when a named photo is not in this browser's Library |
| `.lattice`, Markdown, Marp exports | the bytes travel: the `.lattice` as `media/`, Markdown and Marp as `photos/<name>.<ext>` with the reference rewritten to that path (§6; only image references outside code fences are rewritten). A photo the file cannot hold stays as written and is named in the toast |
| CLI | not supported; the reference passes through untouched. A CLI deck uses a relative path. (No `lint:deck` rule yet.) |

A reference the map cannot satisfy (asset deleted, deck opened on another browser) renders the
existing missing-image placeholder and the export still completes.

**What slice 2 found (2026-10-12, real Chromium).** Two things the plan did not predict:

1. **The HTML sanitizer strips `blob:`.** DOMPurify's default URL policy refuses it, so the engine
   resolved `asset:hero` to a `blob:` URL and the sanitizer then deleted the `src`, leaving a
   pictureless `<img>`. Fixed in `lib/core/sanitize-slide-html.mjs`, as one shape and nothing wider:
   a `blob:` URL is kept only as the `src` of `<img>`, `<video>`, `<audio>` or `<source>`, only
   when its origin is the window's own and its path is a UUID. An `href` to a blob stays refused
   (an anchor navigates, and a blob can be a page), as does another origin, a guessable path and
   any value a `filterAttr` caller vetoed or rewrote. Pinned in
   `test/unit/core/sanitize-slide-html.test.js`. This is HARD RULE #22 territory, so it stays
   one narrow allowance with its reasons beside it.
2. **The preview needs a re-render when the shelf changes.** The preview caches key on the extra
   CSS, so the registry (`docs/src/components/studio/media-urls.ts`) contributes a stamp that
   changes only when the name → URL map does. Adding, deleting or re-scoping a photo then re-renders
   the slides that named it. A deck with no `asset:` reference never loads the registry: the
   injection in `docs/src/lib/render-engine.ts` tests the source first and imports on demand.

A missing asset resolves to the existing drawn missing-image stand-in (`WEB_IMAGE_PLACEHOLDER`),
so a deleted photo leaves the slide readable. A deck rendered with no map at all (the CLI, a
gallery) keeps the reference as written.

### 2b. Editor completion

The editor completes Library photos (`makeAssetCompletion`, `editor-complete.ts`), as a second CodeMirror
source beside the component and front-matter completion (the two never apply to the same spot):

- Inside the `(…)` of any markdown image, `asset:<name>` for each photo the open deck can see, with
  `width×height` and "this deck" for a deck-kept photo. A typed `https:`, `sample:` or relative path is left
  alone.
- On a `collage` slide, a bare list item offers the whole line `![Alt](asset:name)` with the alt text
  selected (a name like `img-0042` is a poor alt). It opens once a letter is typed or on Ctrl-Space, so an
  Enter on an empty bullet stays a newline.
- The shelf is read on the first such keystroke (`StudioShell.completionAssets`, scoped to the open deck),
  never at editor start-up, so the editor's initial bundle does not grow.

Not done: video components (slice 5), a photo picker menu in the editor toolbar, and thumbnails inside
the completion list.

### 3. Intake

Both `<input>` elements gain `accept="image/*,video/*"` on the media tab. On Android and iOS that
opens the native picker with Photo Library, Take Photo or Video, and Choose File. A desktop browser
shows its file dialog and a drag-and-drop onto the Library accepts the same types
(`library-drop.test.ts` is the existing harness).

- **Photos are re-encoded on import.** JPEG and HEIC always go through a canvas: capped to a
  2560 px long edge, written as JPEG at quality 0.88, record marked `original: false`. The
  re-encode is what removes the phone's GPS and EXIF from the stored bytes, and it bakes the EXIF
  rotation into the pixels so a portrait photo is not stored sideways. A 12-megapixel phone photo
  is 3 to 6 MB and a slide shows at most 1920 px wide, so the cap costs nothing a viewer can see.
  PNG and WebP are re-encoded only when over the cap, in their own format, so transparency and
  lossless screenshots survive. GIF is kept with its pixels, transparency and animation untouched, and PNG and WebP
  likewise; `media-scrub.ts` rewrites their bytes keeping only a LIST OF BLOCKS THE PICTURE NEEDS and dropping
  everything else, so a block it has never heard of (a C2PA `caBX` manifest, a `tIME` stamp, a vendor chunk,
  metadata nested inside a WebP animation frame) cannot ride through. A drop-list was tried first and a red team
  got GPS past it in a dozen blocks. PNG keeps IHDR, PLTE, IDAT, IEND, tRNS, gAMA, cHRM, sRGB, iCCP, sBIT, pHYs,
  bKGD, hIST, cICP and the animation chunks; WebP keeps VP8, VP8L, VP8X, ALPH, ANIM, ANMF (filtered inside) and
  ICCP; GIF keeps frames, frame timing, the colour profile and the loop count, and nothing else. A picture's
  ROTATION is the one thing kept from EXIF: browsers differ on whether they apply a PNG's or WebP's rotation tag
  (measured: Chrome applies a PNG's, ignores a WebP's), so an orientation-only EXIF block replaces the original,
  with no location, date or camera. A file a scrubber cannot parse is re-encoded through a canvas (capped, as PNG),
  never stored with a block nobody could read. AVIF is re-encoded to JPEG: its metadata sits in an ISO container a
  byte scrub does not parse here, and an AVIF with transparency loses it (rare for photos). A file's bytes (not
  its extension) decide its type (`sniffImageMime`), so a renamed JPEG is still re-encoded. A **restore** gives a
  backup's photos the same cleaning (`scrubJpeg` for JPEG, where the importer's canvas is not available: it keeps JFIF, an ICC profile and an
  orientation-only EXIF block, drops every other APPn segment and comments, including between progressive
  scans, and drops everything after the end-of-image marker, where cameras append a second image or a
  motion-photo video), because a backup is a file from anyone. A file cut short (a JPEG with no end marker,
  a WebP with no picture, a GIF frame without its terminator) is refused, not stored. Verified in real Chromium, WebKit and Firefox for PNG and GIF with a marker in
  each block; WebP and the animated formats were checked against Pillow-generated files by the independent
  checker (frames and pixels identical, no metadata left) and by unit tests, not in a real browser.
  SVG is never stored: an SVG opened as a
  blob document runs its script on the site's origin, so the importer draws it to a PNG and keeps
  only the pixels.
- **HEIC** (iPhone's native format): iOS Safari converts to JPEG when `accept` names `image/*`
  and `image/heic` is not requested. Other browsers that hand back raw HEIC get a clear
  "this browser can't read HEIC; export as JPEG" refusal, not a silent broken picture.
- **Video** is stored as given (no transcoding in the browser). Import captures a poster frame
  at 0.5 s onto a canvas, and reads duration.
- **"Files"** (the third word in the ask) is already the reference-doc tab. It stays the home of
  `.txt/.md/.pdf`; nothing else is accepted, and the Images tab does not grow a "any file"
  option, because a Word file has nowhere to render.

#### Format choice at intake (2026-10-13)

The importer's automatic policy above is still what the chat's photo intake uses. The Library's **Add image** (picker and
drop) now asks first (`PhotoFormatDialog.tsx`), with four choices and the size each would store for THESE files, measured by
the import's own encoder (`media-import.ts` `measureFormats`, a sample of up to four files scaled by size for a bigger batch):

| Choice | Stores | Cost |
|---|---|---|
| Keep original | the file's pixels and type, metadata cut (`media-scrub.ts`), no resize; HEIC and AVIF become JPEG | largest |
| JPEG (default) | lossy q0.88, long edge at most 2560 px, transparency painted white | |
| WebP | lossy q0.82, same cap, transparency kept; hidden where the browser cannot write WebP | about two thirds of JPEG |
| PNG | lossless, same cap; a PNG already under the cap is kept as it is | several times JPEG for a photograph |

PNG is offered but not recommended for photographs: on a photo-like test image PNG was 5.1 MB at 1920 px and 8.3 MB at 2560 px
against 0.9 and 1.3 MB for JPEG (synthetic proxy, `python3` + PIL; no real photos were reachable). The last choice is remembered.
Each option's one-line meaning is on the dialog, since the choice decides what the photo can do later (a `.lattice` carries
128 MB of photos, `MAX_LATTICE_MEDIA_BYTES`).

### 4. Quotas and limits

Numbers below are **proposals**, to be confirmed or changed by the owner; none are measured
against the real app yet, and slice 1 measures them before they harden.

| Limit | Proposal | Why |
|---|---|---|
| Per image after downscale | no cap needed (about 0.3 to 1.5 MB) | the downscale is the cap |
| Per video | 50 MB, refused with a message above that | phone clips run 10 to 30 MB a minute at 1080p |
| Workspace media | warn at 80% of `navigator.storage.estimate()` (**not built**; a followup). What IS built: the first photo added asks the browser to keep storage (`navigator.storage.persist()`), and a full disk is named plainly | the browser evicts silently under pressure; Safari after about a week unused |
| HTML export video embed | embed at or under 25 MB total, otherwise poster plus a visible note | a self-contained HTML file is mailed around; 200 MB of it is a defect |
| PDF, PNG, PPTX | video renders as its poster frame | those formats carry pixels, not playback |

### 5. Deck-specific assets

- **Adding.** The Images tab has a "This deck / All decks" toggle on add. "This deck" writes
  `scope: <deckId>`; "All decks" writes `scope: 'library'`.
- **Showing.** A scope badge on each card and a filter for "this deck's assets". The tab shows
  library assets and the active deck's assets together by default; another deck's assets are
  never listed.
- **Moving.** "Make shared" and "Keep to this deck" flip `scope` in place. The name does not
  change, so no deck markdown is rewritten.
- **Name clash.** The store refuses to overwrite: a second save under a held name in either scope is
  refused (`Can't add — "x" is already another saved image. Delete it first to reuse the name.`). The Images tab
  adds a file whose name is taken under the next free name (`logo` → `logo-2`) and SAYS so in a
  notice, so a deck that still shows the old picture is not a mystery. (The first draft of this note
  said "refused"; the notice is the built behavior, because a refusal would drop a whole camera-roll batch.)
- **Deleting a deck** deletes its deck-scoped assets in the same step, after the confirm that
  names how many.
- **Deleting a library asset** that decks reference warns first with the count of decks that
  use it (a scan of deck sources for `asset:<name>`). The delete still goes through; the
  affected slides show the placeholder.

### 6. Portability

`asset:foo` means nothing outside your browser, so every way a deck leaves the browser must carry or
mention its photos. What each one does, as built and checked on the real Studio (2026-10-12):

| Leaves as | Does | Checked on |
|---|---|---|
| Webpage (`.html`) | The photo is embedded as a `data:` URI; no `blob:` or `asset:` is left. | Chromium, WebKit, Firefox: the embedded bytes decode to the photo's own pixels |
| PDF | The photo is on the page. | Chromium, WebKit, Firefox: poppler rasterizes page 1 and the photo's color is on it |
| PowerPoint | The photo is in the slide picture. | Chromium, Firefox. **WebKit drops every picture in this lane today, a repo sample image included** (`followups.d/2640-p2-webkit-pptx-drops-images.md`) |
| Image set, print | Same render as PDF and PowerPoint (`buildDeckRender` takes the same `data:` map). | UNVERIFIED on its own: the e2e drives PDF, PowerPoint and webpage, not the image-set download |
| `.lattice` | `media/<name>.<ext>` plus `media.json` carry the photos the deck NAMES (not the whole Library), unless the author turns "Include photos" off. Import restores them through the backup's `restoreMedia` (sniff, scrub, caps, never overwrite) and renames a clashing name in the deck. | Unit round-trip (`lattice-media.test.ts`); real Chromium e2e: a second browser profile with an empty Library opens the file and draws the photo. Not yet driven on WebKit or on a phone |
| Markdown | A deck that names photos downloads as a `.zip`: the `.md` beside `photos/<name>.<ext>`, each `asset:` reference rewritten to that path. A deck with no photos is the bare `.md` it always was. | Unit (`deck-export.marp.test.ts`, `lattice-media.test.ts`); real Chromium e2e reads the downloaded archive and decodes the photo. Not yet run on WebKit or Firefox |
| Marp | The bundle gains the same `photos/` folder and rewrite. It is not `assets/`, which already holds Lattice's sample art: a Library photo named like a sample file would have overwritten it. | Same as Markdown |
| Re-openable PDF, PowerPoint | The embedded `.lattice` carries the photos the deck names, up to `MAX_EMBEDDED_MEDIA_BYTES` (32 MB). The importer's embedded-payload cap rose from 25 MB to 25 MB + 32 MB to match. | Unit round-trip (`embedded-photos.test.ts`); real Chromium e2e: a second profile imports the PDF and draws the photo. PowerPoint shares the code path but is not driven |
| Workspace backup | `media/` holds the bytes, `media.json` indexes them (§9). A restore puts them back to the same deck. | Chromium, WebKit, Firefox: back up, delete both photos, restore, bytes and scopes equal |

**How the `.lattice` carries photos (2026-10-13).** The owner's iPhone showed "the photos it names … are
not inside this file" over a project file whose whole job is to be opened elsewhere. Four choices:

- **On by default, with a switch.** The Share sheet's Lattice row now opens an options step with one switch,
  "Include photos (N · size)". Off keeps the old behavior and says so in the toast.
- **Only the photos the deck names and can see.** A photo another deck owns stays a stand-in and is named.
- **One reader.** The write side is `packMedia` and the read side `restoreMedia`, the same code a workspace
  backup uses, so a `.lattice` is as untrusted as a backup and gets the same refusals. The rows are written
  with scope `library`: the recipient's deck gets a new id, so a deck-scoped photo arrives shared.
- **One new number, `MAX_LATTICE_MEDIA_BYTES` = 128 MB** (`lib/packages/limits.js`), on top of the 25 MB
  the deck and its packages already had. The writer and the reader read the same constant, so a file one
  Studio saves is never one another refuses. A deck that would pass it ships the photos that fit and the
  toast names the rest. The number is a proposal: it is about 60 photos at the 2 MB the importer can
  produce today.

**The other exports (2026-10-13).** Owner decisions: Markdown becomes a `.zip` when the deck names photos (a bare
`.md` otherwise), and the Marp bundle's `assets/` folder takes the photos. Both reuse `packLatticePhotos` (same
visibility, 128 MB cap, never-throw) through `bundlePhotos`, so there is one packer. The embedded `.lattice` gets its
own, smaller number, `MAX_EMBEDDED_MEDIA_BYTES` = 32 MB (`lib/packages/limits.js`): the importer refuses a PDF or
PowerPoint over 200 MB (`MAX_CARRIER_BYTES`), and the carrier already holds the rendered pages. The switch that
opts a PDF in ("Re-openable in Lattice") now says it includes the photos, as the Library stores them: full
resolution and scrubbed of metadata, which is more than the page shows. Not covered, and written to `followups.d/`:
live collaboration, which needs a guest-asks-host design (`2640-p3-live-collaboration-photos.md`).

**Why exports use `data:` and not the preview's `blob:`.** A saved file cannot hold a `blob:` URL, and
the PDF, PNG and PowerPoint cameras render in a frame that may not fetch one: before this was fixed the
webpage export shipped `blob:http://localhost:4321/…` and the PDF reported "could not load every
image" (both measured). So every export renders with a name → `data:` map built for just the photos the
deck names (`docs/src/components/studio/media-urls.ts` `dataUrlsFor`), through one helper
(`assetOpts` in `share-export.ts`) at each of the four export render sites.

**Correction.** An earlier draft of this note, and the PR text, said a workspace restore sweeps the
Library. It does not: a restore upserts and clears nothing. The sweep is the Workspace "Library assets"
**Clear** action, which deletes photos on purpose, and its row now says so. The real gap was the other
way: a backup carried no photos.

### 9. Backup and restore

`workspace-media.ts`. A backup is a file from anyone, so a restore reads it as untrusted: sizes are
checked before anything inflates, all photo bytes share one running budget (1 GiB), one photo is at most
50 MB (the same cap the importer applies, so a photo the Library took is one a restore will take), at most
5,000 rows, a row's `file` must be exactly `<name>.<ext>` for an image type the Library stores, its `mime`
must agree with the extension, and every number it claims is clamped. A refused photo is named in the
restore toast and never costs the decks. A photo kept to a deck returns only if that deck did. A photo
whose name is already taken here is reused when the bytes are identical (under the same name or one it
already came back under), so restoring one backup twice adds nothing; a name nobody holds is stored under
its own name even when the same bytes sit under another, because a deck the restore does not rewrite may
name it (an e2e caught the first version collapsing two identical photos into one); if it was kept to one deck the backup's decks cannot see, it is shared with all decks
(widening visibility deletes nothing). A different photo under a taken name comes back under a new name
chosen against every name on the device AND every name in the backup, and each restored deck and each of
its checkpoints is rewritten once, from one name map, so a rename is never renamed again. Nothing on the
device is ever replaced. Each photo's leading bytes must match its claimed type (JPEG, PNG, GIF, WebP,
AVIF), so a row that says PNG over zeros or over a JPEG is refused. At most 25 refusals are listed by name.

### 10. Browsers that refuse to store a Blob

Safari in a private window answers `UnknownError: Error preparing Blob/File data to be stored in object
store` (reproduced on real WebKit, where an `ArrayBuffer` and a string store fine). `saveMedia` tries the
Blob first, because IndexedDB hands it back file-backed and a shelf of photos is not held in memory, and
on that refusal retries as an `ArrayBuffer` (`data`), rebuilding the Blob on read. If both fail the person
is told the browser would not store the photo and to try a normal window. A name clash is never retried.
The first version of this had no fallback and, on WebKit, added nothing.

## The chat uses the Library (added 2026-10-12)

The Studio chat could not see Library photos, so "make a collage of my photos" produced placeholder
paths. It now sees them in three layers, cheapest first. The code is `agent-assets.ts` (pure),
`agent-assets-browser.ts` (storage and thumbnails), the tools in `architect-agent.ts`, and the wiring
in `chat-agent.ts`.

| Layer | What the model gets | Cost |
|---|---|---|
| The list | One line per asset in the prompt tail: name, photo or video, shape (`landscape 3:2`), scope, caption. Capped at 40 lines, then "…and N more". | About 15 tokens an asset. Nothing for an empty Library. |
| `list_assets` | Name, shape, pixel size, bytes, scope and caption for a filtered slice (words match name, caption and shape). | Only when called. |
| `view_asset`, then `caption_asset` | A JPEG thumbnail, 512 px on the long edge, labeled by name, for a photo with no caption. The model writes a caption of under 20 words and the store keeps it on the record (`MediaRecord.caption`). | From about 250 to 1,300 tokens a picture on most models (8,500 on GPT-4o mini), at most 6 a turn, once per photo ever. |

**Decisions, and why**
- **The list rides in the dynamic tail, not the cached prefix.** It changes whenever a photo is added or
  captioned; the prefix must stay byte-stable (the 1-hour cache).
- **The three tools are sent only when the Library holds something** (`ASSET_TOOLS`, separate from
  `AGENT_TOOLS`). Tools lead the request, so adding them for everyone would change the cache key for
  every author, including those with no photos.
- **Pictures travel in a user message after the tool results**, because a tool result carries text only.
  The message ends on a text part, because the rolling cache breakpoint (`withCachedTail`) marks a
  message only when its last part is text.
- **Seen once, then text.** A captioned photo comes back from `view_asset` as its caption, not a picture.
  A caption is tied to the record's bytes; replacing a photo is delete-and-add, which makes a new record
  with no caption.
- **`caption_asset` accepts a caption only for a photo whose picture has been SENT.** A photo counts as seen
  when the loop delivers the picture message (`takeImages`), not when `view_asset` queues it, so a model that
  sends `view_asset` and `caption_asset` in one message cannot save a caption it made up (the independent
  checker found this). `view_asset` also declines when the next round is the last, which goes out without
  tools and so could never caption what it was shown.
- **A caption is untrusted.** It is model output about untrusted pixels, put back in a later prompt.
  `cleanCaption` makes it one line, strips control characters, quotes and backticks, and caps it at 140
  characters; the prompt calls captions and the pictures themselves data, never instructions.
- **A model that cannot read images is told so** (`view_asset` answers from the catalog's `vision` flag; an
  unknown flag reads as no) and is never sent a picture. It still gets the list and `list_assets`.
- **The cost readout includes the Library.** `agentTurnUsd` takes the photo count: with one or more photos it adds
  the three asset tools to the cached prefix and `libraryPromptTokens(count)` (a header plus at most 40 lines at
  the worst-case line size) to the tail; with none it is unchanged. `ChatCost` re-prices when a photo is added or
  removed. The per-line figure is a worst case on purpose (a bare-name Library is overstated by up to about a
  cent, never understated), and a test holds it at or above the real manifest at every size. Measured in the real
  Studio at a $3 / $15 price, two photos move the readout from $0.078–0.088 to $0.083–0.093, a cold turn; a
  warm turn costs far less. Pictures are not in the readout, because whether the chat will look at one is not
  known before the turn.
- **One shelf read per turn.** `createAgentAssets()` reads the shelf once and serves the list, every thumbnail
  and every caption from that read; it was one full read of every photo's bytes per call.
- **The budget gate prices a picture per model, from a measured table** (2026-10-13; it was a flat 800 tokens, which
  was too low for most of the catalog and wrong by 40x at the ends). A picture is never charged as its base64 (a
  thumbnail is ~40K characters). What it costs is the model's: for one 3:2 picture at 512 px, 212 tokens on GPT-5 mini, 250
  on Claude, 1,290 on Gemini 2.5, 8,500 on GPT-4o mini; at 1568 px, 258 to 36,835. `tools/probe-picture-tokens.mjs`
  measures it (the same short prompt with no picture, a 512 px and a 1568 px one; the difference in `usage.prompt_tokens`),
  and `docs/src/components/studio/picture-tokens.data.json` holds the result.
  - **Shape.** Pictures keep their shape, and the probe's are 3:2. A second probe on 18 models from 14 vendors measured
    square and portrait: portrait costs the same as landscape; a square costs 1.45 to 1.51x as much on the models that price
    by area (Claude, GPT-5, Qwen, Mistral, Kimi, GLM) and from 0.69x to 1.43x on the tiled ones. Every figure in the table is
    the measured one times `SHAPE` = 1.55, so no shape is under-charged.
  - **Table.** A default (`thumb` 2,000, `photo` 3,600, at or above the 90th percentile of the 192 models measured, after the
    shape factor) plus the 20 models that cost more, each rounded up to 50. `resolvePictureTokens(model)` (`picture-tokens.ts`)
    reads it; a model not in the table is charged the default.
  - **Aliases.** `~anthropic/claude-sonnet-latest` style ids are not measured models. The catalog says which model each points
    at today (`alias_target.slug`; `listModels` keeps it as `aliasSlug`), and that one is looked up. All 15 vision aliases
    point at measured models. A catalog cached before the field, or one that cannot be read, prices the alias as the default.
  - **Not measured, so charged the default:** 20 of the 212 vision models: 404 or 403 (not served to our key), 400,
    rate-limited after a retry (429), a timeout, or a reading that made no sense (`gemini-4-argon` read -47 tokens for its 512 px
    picture; `grok-4.20-multi-agent` read 25,336 once and 1,509 on a retry, because its own prompt changes between calls).
    A model released after 2026-10-13 is the default until the tool is rerun
    (`OPENROUTER_ALLOW_SPEND=1 node tools/probe-picture-tokens.mjs --write`, about $1.4; it refuses `--write` on a partial run).
- **A model's own image price raises that figure, never lowers it.** `listModels` keeps OpenRouter's `pricing.image` as
  `ORPrice.imagePerM`, and `pictureSurchargeUsd` adds the gap over the token figure to the gate (`cloudBudgetBlock`'s
  `extraUsd`). 18 of the 212 vision models list it, all Google, and on every one it equals the prompt price, so today the
  surcharge is $0 and the measured token table does the work. OpenRouter does not say what the number counts, so a rate
  within 10x the prompt rate is read as per-token and a larger one as dollars per picture; above that line the gate
  picks a possible under-charge over a certain absurd over-charge, and no listed model is there.
- **Attached photos are priced the same way** (`photo`, not the old flat 1,500), by the chat agent and by the one-shot
  chat path a tool-refusing model falls back to; a clip stays a flat `VIDEO_TOKENS`.
- **Videos are listed but cannot be viewed.** There is no poster frame yet.

**What is verified, and what is not.** `docs/e2e/chat-library-assets.spec.ts` drives the real Studio in
Chromium: photos added through the Library's file input, the real thumbnail code (512 px, under 150 KB of
base64), the real agent loop, and the caption read back from IndexedDB. The model is mocked (HARD RULE #24),
so **how a real model chooses between photos is UNVERIFIED.** The spec fails if the thumbnail edge grows.
A workspace backup carries each photo's caption with the rest of its metadata (see the next section). A restore
treats a backup as a file from anyone: the caption must be a string, is cut to one line of at most 140 characters,
and has control, bidirectional and invisible characters removed. A person's own wording otherwise survives the
round trip, quotes included. What keeps a caption from breaking out of a prompt is the chat boundary, not the
store: `infoOf` in `agent-assets-browser.ts` runs every caption through `cleanCaption` before the model sees it.

## Editing a photo's metadata (added 2026-10-13)

The Images tab opens a detail dialog for a photo, so a person can see and edit what a deck can reuse
(`MediaDetailDialog.tsx`). Four fields are editable. The record holds them next to the bytes, and the stored
bytes stay scrubbed, so an export never carries them.

| Field | Record field | Notes |
|---|---|---|
| Description | `caption` | One line, 140 characters. The chat writes the same field; a person's edit wins and the chat captions only a photo with none. Kept as typed. The chat gets a cleaned copy (`infoOf` in `agent-assets-browser.ts`), so a quote cannot break out of its prompt. |
| Credit | `credit` | One line, 100 characters. |
| Date taken | `taken` | A real `YYYY-MM-DD`, chosen with the browser's date picker. |
| Name | `name` | See aliases. |

**A rename keeps the old name as an alias** (the Avro idea of `aliases`: a renamed field still answers to its old
name). `renameMedia` moves the old name into `aliases`, so `asset:<old>` keeps resolving and no deck text is
edited. Rules:

- **Names and aliases share one namespace.** A new upload, a restore and a rename may not take a name or alias
  another photo holds. `putMedia` and `renameMedia` check this inside the write transaction. The Library importer
  and a restore treat a held alias as a held name (rename on clash, reuse when the bytes are identical).
- **Resolution adds alias keys** to the name → URL map and the export data map (`media-urls.ts`), so a
  preview, the presenter and every export show the photo under any name it has had. The delete warning and
  the "used in" count include decks that write an old name (`decksUsingRecord`).
- **A photo keeps at most 20 old names** (`MAX_ALIASES`). A rename past that is refused rather than dropping
  one, because a dropped name turns the decks that write it into placeholders without a word. A person
  removes an alias in the dialog to free the name.
- **Backups carry all four fields and the aliases** in `media.json`. A missing field reads as empty and an
  unknown field is ignored, so a backup crosses builds in both directions. On restore, text is cleaned, an old
  name another photo here already holds is dropped, and the decks the restore wrote are rewritten from that old
  name to the restored photo (a `renames` entry), so they do not quietly show the other photo. A restore that
  reuses an identical photo gets the same rewrite for the old names the backup listed.

### What a photo's own file gives us (read once, at import)

`media-exif.ts` reads the file BEFORE the scrub or the canvas re-encode, because the stored bytes keep none of it. It
reads JPEG (EXIF, XMP, IPTC), PNG (`eXIf`, uncompressed XMP `iTXt`, `tEXt`) and WebP (`EXIF`, `XMP `), and never
throws: a file it cannot read gives nothing and the import goes on.

| What | Where it comes from | What we keep |
|---|---|---|
| Credit | XMP creator, IPTC byline, EXIF Artist, else a copyright line | `credit`, filled in at import |
| Date taken | EXIF DateTimeOriginal, XMP, IPTC date, EXIF DateTimeDigitized. Never EXIF DateTime (the modified date). | `taken`, filled in at import |
| Description | XMP description, IPTC caption, EXIF ImageDescription, then a title | `fileCaption`, **a suggestion**: shown in the detail view with **Use as description**, never used as alt text until the person takes it. A file's own text can be a private note. A camera default (`SONY DSC`, `IMG_2041`), a file name or a bare number is not offered. |
| Location | EXIF GPS coordinates, or XMP GPS text | `hadLocation: true` only. The coordinates are never read into a value. The detail view says "This photo carried a location. Lattice removed it when the photo was added." |
| Camera, lens, exposure, software, everything else | | Ignored. A deck has no use for them. |

The reader treats the file as hostile: every read is bounds-checked, block sizes and IFD entry counts are capped, text is a
plain string and never markup, a compressed XMP packet is skipped rather than inflated, and an IFD that points back at
itself cannot loop. `media-exif.test.ts` builds real JPEG, PNG and WebP bytes, truncates them at every length, and feeds
it overrunning offsets, a lying segment length and a pathological XMP packet.

### The description is the alt text

The Studio hands the engine a second map beside `assetUrls`: `assetAlts` (name → description, aliases included).
`lattice_sample_images` in `lib/engine/background-image.js` fills an **empty** alt on an `asset:` image from it, at the
token, so a component that reads alt text later (a collage's lightbox caption and narration) sees what a prose image sees.

- An alt the author wrote is never replaced. `![bg …]` is never an empty alt. A name with no description leaves alt empty.
- A deck that names no described photo renders **byte-identical** to before (pinned in `asset-images.test.js`).
- The description is escaped as text: it cannot add an attribute or markup (also pinned).
- A description edit changes the preview's asset stamp, so the slides that show the photo re-render with no deck edit.
- An export gets the descriptions for the photos the deck names (`altsFor`), beside its data-URI map.
- **Export sign-off:** this is a change to the bytes of the exported page, so it needed the dark and light review. The
  whole difference, in both modes, is `alt=""` becoming the description on each photo, a `data-label` on each collage
  tile (the lightbox caption), and the embedded generation timestamp. The author's own alt and every other byte are unchanged.

### Suggest

**Suggest a name and description** in the detail view sends one thumbnail, one fixed instruction (forbidding guesses at names,
places, brands and unreadable text; it asks for JSON `{name, description}`) and the deck's language to the author's **image
model**, on their own OpenRouter key, only when they press it. The author's standing instructions are not sent: they are about
slides, not alt text (pinned in `architect-photo-describe.test.ts`). The draft goes in the form and saves nothing until Save. It
reuses the chat's thumbnail code (`createAgentAssets().thumbnail(name, edge)`, cut from the stored, scrubbed bytes), the budget gate
(`cloudBudgetBlock`, priced from the look's picture size) and the model's `vision` flag from the catalog. No connected model, a
model that cannot read images (unknown reads as no), a budget block and an unusable reply each give a plain line, never a silent
button. The call lives in `suggest-photo-description.ts`, loaded on demand.

**The name.** A camera's name (`img-4568`, `dsc0042`, `pxl-2026…`, bare digits; `generatedName` in `MediaDetailDialog.tsx`) says
nothing about the picture, so the suggested name replaces it, and the old name stays as an alias like any rename. A name the person
chose is only offered ("Suggested name: … Use this name"), never applied. The model's name is cleaned to what the Library accepts
(`cleanPhotoName`: lowercase, hyphens, 32 characters) or dropped.

### The detail view's design (second pass, 2026-10-13)

A phone check and a measurement of the first version found it uneven: controls 32, 36, 64 and 90 px tall; Credit 257 px wide, Date 192,
Name 526; the picture took half the desktop dialog, so Name sat below the fold; the alias remove button was 14 px; three static hint
lines repeated. The owner chose **one column everywhere, tightened**, and **a native date input styled as a shadcn Input that takes
its column's width** (no new dependency; the device's own picker). What it is now: shadcn `Label` (new `ui/label.tsx`), `Input`,
`Textarea`, `Button`, `Collapsible`, `Badge` and `HelpTip`; every input `h-9`; Credit | Date a 50/50 pair at every width; Name full
width; **Suggest with AI** as a full-width `h-9` outline button directly under the Description field (a small button on the label row read as a pill, not a button, on a phone; its explanation is in a HelpTip, not a static line); old names and "From the
file" as collapsibles (Old names opens itself while a deck still writes one, and never closes under the person); 36 px remove button;
the picture capped at `min(30dvh, 220px)`; header and Save row fixed with only the body scrolling, so Save is never below the fold.
A HelpTip sits BESIDE its `Label`, never inside it: a button inside a label is labelled by it and answers `getByLabel`. The e2e pins
equal heights, the Credit | Date width, Name filling the column, and Save on screen at 1440, 820 and 390.

### The image model

A phone check showed Suggest ran on whatever model the chat used, with no way to choose, and no way to ask for a closer look. Two
workspace settings now sit in Workspace → Model beside the chat's model (`ImageModelSettings.tsx`, stored in `StudioSettings` as
`imageModel` and `imageLook`, so they ride in a backup and a junk stored value reads as the default):

- **Image model**: a picker of vision models only (the same catalog list as the chat's picker, filtered), defaulting to
  `~anthropic/claude-sonnet-latest`, the alias of the newest Sonnet. The alias is not itself listed by OpenRouter, so `modelSees`
  reads it through its family. It is its own setting because the best model for editing a deck is not always the one to pay for to
  look at a picture. `createArchitectModel().complete` gained a per-call `model` (used by no other caller).
- **Look closer** (`image-look.ts`): Quick (512 px picture), Careful (1024 px, the default) and Thorough (1568 px, and the model
  is asked to think first via `reasoningEffort: 'medium'`). The panel prints the cost in input tokens (about edge² / 750). A model
  that cannot reason ignores the effort field.

The chat's own photo looking (`view_asset`, which attaches pictures to the chat model itself) is unchanged and still follows the
chat's model: moving it would change what every chat turn costs, which is a decision for its own change.

### What the second independent check found (merge with `main`, then the phone check)

- A `.lattice` export dropped a photo a deck still named by an OLD name, because the pack and restore code matched on the current
  name only. Both halves now match `namesOf(photo)` and the row's `aliases`; `lattice-media.test.ts` round-trips it.
- `asset-refs.ts` rewrote a code span inside a table cell: markdown-it gives a cell's inline token no line range, so the cell now
  reads with its row's (`tr_open`).
- The chat's photo intake named new photos against current names only; it now treats an alias as a taken name.
- The format dialog from `main` had a branch that built the record without the file's own details; fixed and e2e-guarded.
- **Third check (the phone-feedback commit), all fixed.** The image and chat model lists shared one radio-group name, so an arrow
  key in one could change the CHAT model (each list now has its own name); a Suggest answer overwrote a name typed while it was
  on its way (the field is read live); an auto-applied name could clash with another photo and make the save refuse the
  description too (the name is made unique first); the budget hard stop priced a Suggest at the chat model's price (it now prices
  the image model, and a `~…-latest` alias at its family's dearest member); a model that reasons could spend its whole
  `max_tokens` thinking and return nothing (ceilings raised to 600 / 800 / 3000, and a cut-off reply says so instead of "no
  suggestion"); a backup file could choose which provider receives the photos (`imageModel`, like the chat's model, is not
  restored from a file; the look dial is); `generatedName` missed real camera and chat-app names; `cleanPhotoName` now folds
  accents (`école` → `ecole`) instead of dropping letters; the dialog keeps pinch-zoom (`touch-pinch-zoom`).
- **The picture after a save, and what is not verified.** The picture's object URL used to be minted again whenever the Library
  re-read the photo (a new Blob object), and the old URL was revoked at once, so the picture could point at nothing. A first
  version kept the first Blob's URL for good, which would break if the browser drops an overwritten record's Blob data (not
  observable here). The hook now mints a URL for each new Blob, keeps showing the old one until the new one has decoded, then
  revokes the old one two seconds later. The Chromium test proves the picture is painted after a save; whether it fixes the
  iPhone report is **UNVERIFIED** until it runs on that device.
- **The broken picture was a rewrite bug, not a display bug (found on a real iPhone, 2026-10-13).** After a rename or a description
  edit the card showed WebKit's broken-image mark with the name and size intact. `mutateImage`, `setMediaCaption` and
  `setMediaScope` read a row (its Blob is a handle to a file the browser keeps for that record) and wrote it back with the SAME
  handle; WebKit replaces the record and deletes that file. The first import never had the problem because it writes a fresh Blob.
  All three now copy the bytes into an in-memory Blob first (`detachedBlob`, read outside the write transaction, since awaiting inside
  one lets it commit early) and write that. `media-store.test.ts` pins that no Blob IndexedDB handed out is ever put back, and checks
  the stored bytes after a caption, a rename, an alias removal and a scope flip; the e2e decodes the STORED pixels after each edit and
  a reload, in Chromium, WebKit and Firefox. A photo already broken this way on someone's device cannot be repaired (the file is gone);
  it now shows `PhotoPlaceholder` (the product's own lattice with one cracked tile) instead of the browser's mark, with a line saying
  the file may be missing, so the author knows to add it again.
- **Left as is, deliberately.** The chat can replace a description the person typed, but only when the person asks it to look
  again (`view_asset … again`), and it is the same field by design. A HEIC photo gives no credit, date or location flag (the reader
  knows JPEG, PNG and WebP); nothing is stored from it either way, since the photo is re-encoded.
- `<code>asset:x</code>` and TeX are rewritten by the "everything not code" rule; only Markdown code, raw-text blocks and
  inline code spans are exempt.

### Rename can rewrite the decks

The alias list in the detail view shows how many decks still write each old name, and **Use new name** rewrites them
(`asset-refs.ts`). The count and the button use one function, so they cannot disagree.

**The parser decides what is code, not a rule list of ours.** An earlier version re-implemented CommonMark's block rules by hand,
and three independent reviews kept finding one more shape it read differently from the renderer (a table row, a setext heading, a
fence in a list item, a `<pre>` with blank lines). Now `parse()` from the engine's own `markdown-it` (the `commonmark` preset, HTML on,
tables and strikethrough, as in `lib/engine/index.js`) says where fenced and indented code, raw HTML blocks and paragraphs are, by their
line ranges. The only rule written here is how backticks pair inside one paragraph (a run of N closes at the next run of exactly N;
a backslash before an opener makes it text). The engine resolves `asset:` in more places than an image destination (a video's
poster bullet, a `url(asset:x)` in a directive comment, an `<img>` tag inline or spread over lines), and a checker round showed that
a destination-only rule missed all four. So the rule is "everything the parser does not say is code": every `asset:x` is rewritten
except in fenced or indented code, a `<pre>`/`<script>`/`<style>`/`<textarea>` block, or an inline code span. A sentence that only
mentions a photo name follows the rename too, which is harmless; `asset:hero.jpg` (not a valid reference) stays as written. If the references in a paragraph cannot be matched one-to-one with the parser's text for it,
that paragraph is left alone: a reference wrongly left alone keeps working through the old name, while one wrongly rewritten changes
a code sample.

**The test is the renderer.** `asset-refs.test.ts` holds some 50 deck shapes, including every shape the reviews found. For each, the
real renderer says which `asset:` values it resolves; the rewrite must move exactly those, and the visible text of every other
`asset:` (a sample, a `<pre>`, a sentence) must come out unchanged. It also runs each shape with Windows line endings, and a
150,000-line block and pathological backtick and fence patterns against a time limit. The parser loads on demand (about 35 KB
gzipped), only when a photo with old names is opened or "Use new name" is pressed; until then the dialog says "checking decks…".

Each deck gets a Version history entry first (`Before using asset:<new>`). The way back is saved first and read back: the store
swallows a full-storage error, so a deck is never rewritten on the promise of an undo that was not written. If the browser has
no room, the dialog says so, says how many decks were updated, and says the rest still use the old name, which keeps working. The
open deck is replaced through the shell (`onReplaceSource`) and every other deck in storage.

### Hostile input, and what an independent check found

A second independent check read the EXIF reader, the alt fill and the rewrite as an attacker would. What it found, and the fix:

- **A crafted XMP packet could freeze the tab.** The first reader used regular expressions that rescan from every start; 262 KB of
  `<` took two minutes. Every XMP scan is now a single forward pass (`unxml`, `xmpValue`, `openTagEnd` in `media-exif.ts`), and
  `media-exif.test.ts` runs the pathological shapes against a time limit. **No pattern in that file may rescan from an earlier
  position.**
- **A description that starts with `bg` turned a photo into the slide background.** The alt fill now marks the token
  (`meta.assetAlt`) and the background reader ignores it. An author's own `![bg …]` is unaffected.
- **Text read from a file went through a weaker cleaner than text a person types.** It now uses `cleanLine` (control, invisible
  and unpaired-surrogate characters out, cut by whole characters). A numeric entity that is not a character becomes a space.
  `cleanLine` keeps what changes a text's meaning: the three subdivision flags that exist as emoji (England, Scotland, Wales: a black flag,
  the tag letters `gbeng`, `gbsct` or `gbwls`, a cancel tag), and ONE joiner between two NON-ASCII characters (a family emoji, a Persian
  word with its zero-width non-joiner). Any other tag sequence (tags can hide instructions from a reader and show them to a model), a run
  of joiners, a joiner between plain ASCII letters, a half-written flag left by a length cut, and every other invisible character are
  removed.
- **Two location cases went unflagged:** a GPS pointer written as type IFD, and an XMP packet with only a longitude. Both are flagged.
  (The stored bytes were scrubbed either way; this is the "carried a location" notice.)
- **Dialog state:** Save sends only what the person changed from the values the form OPENED with, so a description the chat wrote
  underneath is not erased; the form starts over every time it opens, so a cancelled draft is gone; and a Suggest answer lands only in
  the visit that asked (a counter moves on every open, close and photo change), even if the same photo is reopened.

### Weight at startup

The Studio route loads its shell at startup, and every byte there is measured against `main` (`docs/route-budget.json`). The first
cut added 4,067 bytes (gzipped) there. The editing code now lives in `media-edit.ts` and Suggest in `suggest-photo-description.ts`,
both loaded on demand (the Library, and the Chat panel's photo import), never at startup, and the route is **561 bytes smaller than `main`**, with nothing to declare.

### Keyboard and focus

The detail view is a real form: Enter in a field saves, and the Save button is disabled until something changed. Enter on a card
opens it, Tab stays inside, and Escape closes it and returns focus to the card (an explicit `returnFocusTo`, because the Library
clears the record the moment the dialog asks to close). A rename and the edit save in ONE transaction (`updateMediaDetails`),
so a refused name never leaves the edit half saved.

### Verified, and what is not

**Verified** in real Chromium (`docs/e2e/library-image-metadata.spec.ts`, 21 tests, OpenRouter mocked per HARD RULE #24): edit,
save and read the record back from IndexedDB at 1440, 820 and 390 px; an alias keeps a deck's slide painting; the description
fills alt in the preview, live on edit, and in the exported page; EXIF read at import (credit, date, the suggestion, the location
flag, no EXIF left in the stored bytes); Use new name on the open deck and on a stored deck, and its honest failure when storage refuses the undo entry; Suggest with a vision model, a model
without vision, and no model; keyboard open, tab containment, Enter to save, Escape and focus return; at 390 px nothing in the dialog is wider than the dialog, the date field is short, the Edit button opens it, and the picture is still painted after a save (Chromium only); the suggested name, the image model and the look from the workspace settings. The export sign-off artifacts
above were produced from the real Studio in both modes.

**UNVERIFIED:** the sideways pan itself (it was seen on an iPhone; Chromium does not reproduce it, so the spec pins the layout that prevents it), Firefox and WebKit (only Chromium is installed here; the engine-sensitive tests are tagged for the nightly's
`@webkit-tablet @gecko` projects), real touch input, a screen reader, and **how a real model words a description** (the model is mocked).

## Options not taken

- **Capturing metadata (capture date, caption) on the record.** An earlier draft of this note (§7) read the
  date, caption and location before the re-encode, kept them on the record and stripped them only from exported
  bytes. It was dropped when the importer settled on "re-encode and discard". **Reversed 2026-10-13:** a
  record now holds a description, credit and date taken (see "Editing a photo's metadata"). They are typed so
  far; reading them from EXIF before the canvas pass (#2627's `exifOrientation` walk is prior art) is next.
  Location stays out: it is never stored.
- **Naming a photo by a fingerprint of its bytes** (`asset:team-offsite-7f3a9c`). A reference would then show
  exactly those bytes or the stand-in, never a different photo that happens to share a camera file name, and
  restore would put photos back by fingerprint instead of renaming. It is cheap now and a migration later, since
  decks and backups that write bare names harden. Not decided; put to the owner with the stored-scope question.

- **Data URLs in the deck markdown.** No store change, and it works anywhere. It makes the deck
  unreadable, bloats every autosave into localStorage's 5 to 10 MB quota, and wrecks the
  backup's readable `decks/*.md` copies.
- **Two prefixes, `library:` and `deck:`.** The origin shows in the markdown. Moving an asset
  between scopes rewrites every reference. Declined by the owner.
- **Bytes inside each deck's record.** A photo two decks share is stored twice, and "use it in
  another deck" becomes a copy.
- **A separate deck-assets panel in the editor.** More discoverable, but a second surface to
  keep consistent with the first (HARD RULE #15). Declined by the owner.

## Build order

One PR for the line of work, one commit per item (`workflow.md` §Batch a session's slices). Each
commit builds and tests against `main` alone.

1. **Store and intake (images).** `image` kind, `scope`, downscale, native pickers, the Images
   tab with the toggle. Measures the real picture sizes and the real quota numbers for §4.
2. **Resolve and preview.** `asset:` grammar in the kernel, `assetUrls` through the five preview
   sinks, the placeholder path, `lint:deck` rule.
3. **Exports.** PDF, PNG, PPTX and HTML embedding.
4. **Backup and share.** `media/` entries, caps, deck-delete cascade, delete-warning count.
5. **Video.** `video` kind, poster capture, the HTML-player embed cap, the poster rendering in
   the other formats.

## Gates and sign-offs this line of work owes

- **Export sign-off (CLAUDE.md Quality Bar).** Slices 3 and 5 change the bytes of exported
  artifacts. Each owes a demo deck (`examples/library-media.md`, 6 to 10 slides) rendered in dark
  and light mode, sent to the owner before merge.
- **Real-device verification (HARD RULE #23).** The native Android and iOS pickers are the whole
  point and no headless sandbox reaches them. The PR marks them **UNVERIFIED** until a person
  drives a real phone.
- **Adversarial trio (HARD RULE #25).** This touches a storage schema, the engine kernel and
  the export bytes, so it is high blast radius. The trio runs on what will ship, not on this plan.
- **Ownership gates.** The new `asset:` handling lands in the shared kernel (HARD RULE #1). Any
  new preview sink or style sink needs its allowlist entry with a justification (HARD RULE #22).
  A changelog fragment ships with the work (HARD RULE #10).

## Open questions

1. The four numbers in §4 are proposals. Slice 1 measures real photos and real quota behavior
   before the owner confirms them.
2. Whether an uploaded video should be playable in the **Studio presenter** (it can: a `blob:`
   URL feeds a `<video>`), or poster-only everywhere except the HTML export. This doc assumes
   playable in the presenter.
3. Whether Markdown and Marp exports should carry the photos a deck names (a Marp bundle already copies
   `sample:` art). They keep the reference only. `.lattice` now carries them (§6).
4. Whether a video export that keeps the original bytes should strip the GPS atom (a small
   rewrite of the file's header boxes, no re-encode) or fall back to the poster frame whenever
   location is present. The atom rewrite is cheap but is a byte change to a user's video.
5. Whether camera capture ("Take Photo") warrants its own button, or `accept="image/*"` is
   enough. On iOS it is enough; on some Android browsers the picker hides the camera unless
   `capture` is set. Slice 1 checks.

**What the measurements were, and what a first live turn got wrong (2026-10-13; owner-directed key spend, about $1.9 in all).**
A first live turn of the real Studio on `google/gemini-2.5-flash-lite` read 7,554 prompt tokens with no picture and 18,927 with one,
which looked like an 11x under-charge. It was not the picture. Replaying that turn's exact second request with parts removed
read 17,899 as sent, 8,949 with the `cache_control` markers removed, 7,662 with the picture replaced by text, and 6,917 with
the tools removed too: the picture is about 1,300 tokens, as the direct probe said, and the marked request reports every
prompt token twice. The marker was the finding:

**Google cache markers cost money, so Google no longer gets them.** `or-cache.js` marked the system block and a rolling tail for
Google as well as Anthropic, on the belief that Google caches only what you mark. On the chat agent's real three-round turn,
replayed through OpenRouter with and without the markers, marked cost more on every Google model tried:

| model | marked, cold turn | unmarked, cold turn |
|---|---|---|
| gemini-2.5-flash-lite | $0.004695 | $0.002569 |
| gemini-2.5-flash | $0.009914 | $0.007863 |
| gemini-3.5-flash-lite | $0.007344 | $0.006302 |
| gemini-3.8-flash | $0.018744 | $0.017574 |
| gemini-3.1-pro-preview | $0.066578 | $0.042178 |

Repeating the same turn within the cache lifetime (three turns, same prefix): 2.5 Flash Lite $0.00324 / $0.00174 / $0.00175
marked against $0.00184 / $0.00108 / $0.00042 unmarked; 2.5 Flash $0.01013 / $0.00756 / $0.00559 against $0.00556 / $0.00336 /
$0.00140; 3.5 Flash Lite $0.00737 / $0.00598 / $0.00595 against $0.00420 / $0.00419 / $0.00213. Unmarked requests earn Google's
implicit-cache discount; marked ones pay for an explicit cache and do not. The breakpoint set is now Anthropic only
(`or-cache.js`, pinned in `or-cache.test.ts`). The gate prices a round uncached, which is now also right for Google; before,
a marked Gemini round billed up to 1.8x what the gate assumed. Anthropic was checked the other way on `claude-haiku-5.5`: a
marked first call costs 1.25x ($0.003156 against $0.002526) and a repeat 0.1x ($0.000258), as designed.

**Everything that follows from Google not taking markers.** The Coach's per-finding Fix sent its own marker (`architect-fix.js`
`buildFixMessages`) whenever the switch was on, whatever the vendor; it now follows `orSupportsCache`. The Workspace "Reuse the
cached prompt" switch is disabled for a model that caches on its own, with the reason in its copy (OpenAI, Google, DeepSeek, x-ai).
The cost readout treats such a model as primed after the first turn whatever the stored switch says, because the switch only
governs Anthropic's breakpoint (`ArchitectChat.tsx`). The readout's cache rates (2x write, 0.1x read) are still Anthropic's for every
vendor; they overstate a cold Google or OpenAI turn and are untouched here.

**The price must be known before the first spend.** The budget gate compares an estimate against the cap, and the estimate needs the
model's price from the catalog, which loaded only when something asked for it (the Workspace model tab, an alias lookup). With no price
`openRouterModelPrice()` is `null`, `estimateUsd` returns `null`, and the call goes through: on a fresh browser profile the first chat turn,
and the Coach's Fix and the refine and generate actions on any profile that had not opened the model tab, ran past a hard-stop cap (13
call sites of `cloudBudgetBlock`). Three changes close it, each pinned by a test that fails without it:
- `cloudBudgetBlock` is async and, in stop mode with a cap and no price, waits for the catalog (at most 4 seconds, timer cleared) before it
  compares. Every spending action goes through it. It does not wait in alert mode or with no cap, where nothing could use the price.
- The catalog is fetched as soon as a key exists: when a connected model is created, and when a key is written during the session (the OAuth
  return, Undo after Disconnect), so it is normally loaded before anything can spend. Concurrent callers share one in-flight fetch
  (`listModels` memoizes it), a fetch that never answers is abandoned after 15 seconds so the next call can try again, and a fetch that
  started before the self-heal invalidated the cache cannot write its stale answer back.
- The chat reads the catalog at most once a turn (`boundedCatalog`, 4 seconds, failure reads as empty) and only when the vision check or an
  alias lookup needs it. On a hung network a turn with photos, an alias model and a cap can still wait about 8 seconds once (the catalog
  read, then the gate's own wait) before the fetch aborts at 15.
A call that starts in the first moments after a key is written, before the fetch returns, waits for it in the gate. Verified on the real
Studio (the final build, a fresh profile, the real key, a $0.0001 stop-mode cap, `~anthropic/claude-haiku-latest`): no request left the page,
the chat said "Estimated ~$0.01 — that would exceed your $0.00 cap", and the page made exactly one catalog request; the same setup before
the change sent the chat request. The Coach's Fix, refine and generate are verified in unit tests against the real gate, not driven on a real Studio.

**Real Studio, final build, one turn each (2026-10-13).** A Library photo, the agent calling `view_asset` then `caption_asset`.
`google/gemini-2.5-flash-lite`: no request carried `cache_control`, prompt tokens read 7,554 / 8,949 / 8,989 (not doubled), three
rounds cost $0.00076 + $0.00091 + $0.00016 = $0.0018; the first live turn, with markers, cost $0.0048 for the same work.
`~anthropic/claude-haiku-latest`: every request carried `cache_control`, the alias resolved, rounds two and three read 12,168 and
12,605 prompt tokens from cache. Not driven on a real Studio: the Coach's Fix (pinned by `architect-agent.chat.test.ts` against the real wiring),
an attached photo through the chat's attach control, and any WebKit or phone surface.

**The Library's "Suggest" is priced the same way** (merged from #2668, 2026-10-14). It sent a picture to the author's image model with a flat
`edge² / 750` estimate, which is Claude's formula; it now charges the model's measured figure for the look's size (`lookCharge`: the 512 px
figure for Quick, the 1568 px one for Careful and Thorough, never below the old formula) plus the model's own image-price surcharge, through the
same gate, and its `cloudBudgetBlock` call gained the `await` and the `priceModelId` argument that PR introduced, after `extraUsd`.
