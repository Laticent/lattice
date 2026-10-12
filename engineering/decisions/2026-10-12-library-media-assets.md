---
status: proposed
summary: Photos and videos in the Library — one `asset:<name>` namespace, a scope flag (library or one deck), a name-to-URL map the host hands the engine, and the intake, export, backup and storage rules that follow.
---

# Library media assets — photos and videos, shared or per deck (2026-10-12)

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
| Studio export (PDF, PNG, PPTX capture) | the same object URL; the capture frame already counts `blob:` as embeddable |
| HTML player export | embedded as a `data:` URL, under the video cap in §4 |
| CLI | not supported; a CLI deck uses a relative path. `asset:` there is an authoring error, and `lint:deck` says so |

A reference the map cannot satisfy (asset deleted, deck opened on another browser) renders the
existing missing-image placeholder and the export still completes.

### 3. Intake

Both `<input>` elements gain `accept="image/*,video/*"` on the media tab. On Android and iOS that
opens the native picker with Photo Library, Take Photo or Video, and Choose File. A desktop browser
shows its file dialog and a drag-and-drop onto the Library accepts the same types
(`library-drop.test.ts` is the existing harness).

- **Photos are downscaled on import** to a 2560 px long edge, re-encoded as JPEG (WebP when the
  source has alpha), and the record is marked `original: false`. A 12-megapixel phone photo is
  3 to 6 MB; a slide shows at most 1920 px wide, so the extra pixels cost quota and buy nothing a
  viewer can see. SVG, GIF and PNG under the cap are stored as given.
- **HEIC** (iPhone's native format): iOS Safari converts to JPEG when `accept` names `image/*`
  and `image/heic` is not requested. Other browsers that hand back raw HEIC get a clear
  "this browser can't read HEIC; export as JPEG" refusal, not a silent broken picture.
- **Video** is stored as given (no transcoding in the browser). Import captures a poster frame
  at 0.5 s onto a canvas, and reads duration.
- **"Files"** (the third word in the ask) is already the reference-doc tab. It stays the home of
  `.txt/.md/.pdf`; nothing else is accepted, and the Images tab does not grow a "any file"
  option, because a Word file has nowhere to render.

### 4. Quotas and limits

Numbers below are **proposals**, to be confirmed or changed by the owner; none are measured
against the real app yet, and slice 1 measures them before they harden.

| Limit | Proposal | Why |
|---|---|---|
| Per image after downscale | no cap needed (about 0.3 to 1.5 MB) | the downscale is the cap |
| Per video | 50 MB, refused with a message above that | phone clips run 10 to 30 MB a minute at 1080p |
| Workspace media | warn at 80% of `navigator.storage.estimate()` | the browser evicts silently under pressure; the warning is the only defense |
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
- **Name clash.** Adding a name that exists in either scope is refused with the store's existing
  `Can't save — "x" is already another saved image. Rename that one first.`
- **Deleting a deck** deletes its deck-scoped assets in the same step, after the confirm that
  names how many.
- **Deleting a library asset** that decks reference warns first with the count of decks that
  use it (a scan of deck sources for `asset:<name>`). The delete still goes through; the
  affected slides show the placeholder.

### 6. Portability

`asset:foo` means nothing outside your browser, so every way a deck leaves the browser must carry
or mention its assets:

- **Workspace backup** gets a `media/` folder of binary zip entries plus a `media.json` index.
  The bytes do **not** go through `refdocs.json`: that lane parses JSON under a count cap, and
  base64 video would blow it. Media has its own declared-size and running-budget caps in
  `zip-limits.ts`, and per the backup's rule for side lanes a media failure is skipped and named,
  never a reason to lose the decks.
- **Single-deck share or export zip** includes only the assets that deck references.
- **Pasted-deck markdown** that names an asset the workspace lacks renders the placeholder and
  the editor's lint warns by name.

### 7. Metadata

Import reads the file's embedded metadata and stores it on the record as `meta`. Nothing in the
repo reads EXIF or video atoms today (checked `capabilities.md` and `package.json`, 2026-10-12),
so this adds a reader.

**What is read.**

| Source | Fields kept |
|---|---|
| Photo EXIF, XMP, IPTC | capture date, camera make and model, lens, exposure (f-stop, shutter, ISO, focal length), orientation, GPS (lat, lon, altitude), title, caption, creator, copyright, keywords |
| Video (MP4 and MOV atoms) | creation date, duration, frame size, frame rate, codecs, rotation, GPS (the `©xyz` atom iPhone and most Android cameras write) |
| Every file | original filename, MIME type, byte size, last-modified time |

**Order matters: read metadata before the downscale.** Re-encoding through a canvas (§3) drops
all EXIF and applies no rotation. The importer reads the original bytes first, bakes the EXIF
orientation into the pixels so a portrait phone photo does not land sideways, then re-encodes. Skip
that order and every phone photo loses its date and location silently.

**Reader.** A browser `<video>` element exposes only duration and size, so video needs an MP4 box
reader. Candidates are `exifr` for photos (modular, tree-shakes to a few KB for the fields above)
and a small in-repo atom parser or `mp4box.js` for video. HARD RULE #15 asks for a check of
`capabilities.md` first; that check found nothing to reuse. Slice 1 picks the reader by measured
bundle cost and lazy-loads it, so the Studio's first paint pays nothing.

**Privacy: GPS never leaves the workspace by default.** A location tag on a team photo is
information the author may not have meant to publish. The record keeps GPS (it is useful for
search and for the author), but:

- every export, share zip and backup of a **single deck** strips GPS from the embedded copy;
- the workspace backup, which is the author's own full copy, keeps it;
- the Library card shows a "has location" marker, and a per-asset action removes it for good.

The stripping happens on the bytes: the image is already re-encoded on import (so photos carry no
EXIF), and videos are stored as given, so a video export that keeps the original bytes needs the
atom removed or the poster used instead. The video-export route is an open question below.

**Where it shows.** The Images tab gains a details view per asset (date, camera, size, duration),
search by filename, caption and keywords, and sort by capture date. A caption or title from the
file seeds the asset's alt text when the author has not written one, which helps accessibility
exports. Dates and numbers format through the user's locale.

**What it is not.** No face, object or scene analysis, no reverse geocoding (a network call that
would send coordinates to a third party), and no editing of the embedded EXIF. Those are separate
asks.

## Options not taken

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
3. Whether a video export that keeps the original bytes should strip the GPS atom (a small
   rewrite of the file's header boxes, no re-encode) or fall back to the poster frame whenever
   location is present. The atom rewrite is cheap but is a byte change to a user's video.
4. Whether camera capture ("Take Photo") warrants its own button, or `accept="image/*"` is
   enough. On iOS it is enough; on some Android browsers the picker hides the camera unless
   `capture` is set. Slice 1 checks.
