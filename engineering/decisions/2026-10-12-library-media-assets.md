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
| `view_asset`, then `caption_asset` | A JPEG thumbnail, 512 px on the long edge, labeled by name, for a photo with no caption. The model writes a caption of under 20 words and the store keeps it on the record (`MediaRecord.caption`). | About 800 tokens a picture, at most 6 a turn, once per photo ever. |

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
- **The budget gate prices a picture as a fixed `THUMB_TOKENS`**, not as the ~40K characters of base64 that
  carry it, which would have overstated a round's cost about twelve times.
- **Videos are listed but cannot be viewed.** There is no poster frame yet.

**What is verified, and what is not.** `docs/e2e/chat-library-assets.spec.ts` drives the real Studio in
Chromium: photos added through the Library's file input, the real thumbnail code (512 px, under 150 KB of
base64), the real agent loop, and the caption read back from IndexedDB. The model is mocked (HARD RULE #24),
so **how a real model chooses between photos is UNVERIFIED.** The spec fails if the thumbnail edge grows.
A workspace backup carries each photo's caption and a restore reads it back through `cleanCaption`, so a restore does not make the chat look at every photo again. A backup file is untrusted and the caption re-enters a prompt, which is why it is cleaned on the way in; a caption that is not a string is dropped.

## Options not taken

- **Capturing metadata (capture date, caption) on the record.** An earlier draft of this note (§7) read the
  date, caption and location before the re-encode, kept them on the record and stripped them only from exported
  bytes. It was dropped when the importer settled on "re-encode and discard", and nothing recorded the reversal.
  What ships keeps nothing, so a photo's capture date is gone for good after import. Reviving it means reading
  EXIF before the canvas pass (#2627's `exifOrientation` walk is prior art) into a `meta` field. Left to the owner.
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
