---
status: in-progress
summary: >
  One unreachable image failed the whole browser export — no PDF, no PowerPoint, no
  image set, only a message. The capture's own image-error hook now resolves instead
  of rejecting, so the picture is left out and the file lands; a per-run log names the
  paths that failed and the reason rides in the toast, which persists, rather than in
  the progress line, which does not. The naming comes from the LIVE DOM rather than
  the error event, because by the time that event fires the clone's `src` is blank and
  an empty `src` reads back as the page's own address.
---

# The export stops dying on one bad path

## The failure

From `2026-09-13-pdf-export-encode-lanes.md`, on a real phone: the jargon gallery
deck failed with *"PDF failed: unexpected error"*. Root cause was the deck's
`logo: ../lib/base/_logo/lattice-mark-min.svg` — a path relative to the deck FILE,
which the CLI resolves and the web cannot. That change made the message honest. It
deliberately left two things undone, and this is both of them:

> **It names no URL.** … **It does not make the export survive a missing image.** A
> deck with a broken image path still fails rather than exporting without it.

## Why it failed at all

`html-to-image` fetches every embedded image itself and inlines it as a data URL.
When that fetch fails, `resourceToDataURL` swallows the error and returns
`options.imagePlaceholder || ''` — so the clone gets an EMPTY `src`, its `onload`
never fires, and its `onerror` does. Without `options.onImageErrorHandler` that
`onerror` IS the promise's `reject`, and it rejects with the raw load `Event`, which
carries no `.message`.

So the deck was lost to one 404 in a corner of one slide. The export is the
deliverable; a picture is a part of it.

## What ships

`onImageErrorHandler` on both capture flavors, which resolves instead — and HIDES the
failed `<img>` in the clone. Resolving alone is not "the picture is simply absent":
the browser paints its own broken-image glyph AND the author's alt text into the box,
so the first version of this exported a boardroom slide carrying a platform icon (a
different one per machine, the divergence HARD RULE #29 exists for) and a line of
prose nobody wrote. Measured on a real export, then fixed: `visibility:hidden` on the
clone, which leaves the box its size so nothing around it moves. That option plus that
line is the whole behavioral fix, and it changes the PDF, the PowerPoint, the image
set and the print deck at once, because they share `captureOptions`.

The rest is the part that keeps it from becoming a WORSE defect. An export that
silently ships a hole is harder to catch than one that refuses: the author sees
"PDF ready." over a file they would not have sent. So each run carries a log, and
the reason goes in the toast — through the `onDegraded` channel the webpage export
already uses, because the progress line is transient and gone by the time the file
lands.

### Naming the path takes THREE sources, and none alone is enough

- **`count` comes from the capture's hook**, which sees every `<img>` failure —
  including a remote one the frame displayed happily and whose `fetch` the exporter
  could not read past CORS.
- **`paths` comes from the LIVE DOM** — an `<img>` that is `complete` with
  `naturalWidth === 0` asked for something it did not get, and it still has the
  attribute the author wrote.
- **A probe covers `background-image`, which neither of the other two can see.** This
  is the channel that mattered most and the one the first version of this note got
  wrong: a deck's `![bg](…)` full-bleed panel is NOT an `<img>` — `lib/core/bg-image.js`
  emits a `<div>` with a `background-image` — and html-to-image catches that fetch
  ITSELF, substitutes an empty URL and only `console.warn`s. So the hook never fires,
  nothing is counted, and a real export of a deck with a dead `![bg]` path produced a
  page with no background under a toast reading "PDF ready." — verbatim the silent hole
  this change exists to prevent. Probing each distinct background URL with an `Image` in
  the capture frame closes it, and costs almost nothing: the browser has already fetched
  them, so a probe of a working background is a cache hit.

The hook cannot name anything: it is handed the CLONE, whose `src` has already been
blanked, and an empty `src` reads back as the PAGE's own address (measured:
`http://localhost:4321/studio/`), which would send the author looking in exactly the
wrong place. The DOM scan cannot see the CORS case, because that image loaded fine.
Together they give a trigger that is complete and names that are right. The sentence
asserts **no total at all**, which is the only wording the log can stand behind:
`paths` may be a subset of what failed (a CORS-blocked `<img>` fires the hook and can
never be named), and `count` is one per failed ELEMENT, so a single bad `logo:` on a
56-slide deck registers 56. "One image" beside a list of one would tell an author to
stop looking; "56 images" would send them hunting for fifty-five that do not exist.
What is always true is that not every image loaded, and which ones we know about.

The trailing hint — *a path relative to the deck file does not resolve here* — is
appended **only when a named path is actually relative**. A `/absolute` or `https://`
URL that 404s has nothing to do with deck-relative resolution, and the first version
appended it unconditionally, including to the rooted fixture in its own e2e test.

Each path is truncated at 120 characters, because an author can write a very long one.

`complete` is the guard that matters in the scan — an image still in flight also
reports `naturalWidth === 0`, and accusing it would name a file that was fine.

## How it was verified

| Claim | Evidence |
|---|---|
| A deck with a 404 image exports | `docs/e2e/export-missing-image.spec.ts` drives the REAL Studio with a deck referencing `/this-image-does-not-exist-4f2a.png`, downloads the PDF and opens it: 2 pages. On `main` the same deck produces no download at all |
| The author is told, and told WHAT | The same spec asserts the toast reads `PDF ready — but the export could not load every image…`, contains the broken path verbatim, and does NOT blame deck-relative resolution for a rooted path |
| The degraded page is a GAP, not a broken glyph | The e2e deck's image carries alt text; the exported page shows neither a broken-image icon nor the alt, because the clone's `<img>` is hidden |
| The naming rules are right | Unit tier (jsdom): the path the deck wrote is what gets named; an image still loading is not accused; the sentence asserts no total; the relative-path hint appears only for a relative path; the list stops at three and one path at 120 characters |
| A dead background is named too | Unit tier drives the probe against a stubbed loader: a `background-image` that 404s is named AND trips the trigger by itself, while one that loads says nothing |
| The e2e arm can fail | **Mutation-proved**: delete `onImageErrorHandler` from `captureOptions` — which is exactly `main` — rebuild, and the spec fails (no download arrives) |
| Nothing else changed | `npm run lint`, `tsc`, the docs export suite (90), the root unit suite, `build:check` |

## What this is NOT

- **Not a fix for a broken path.** It is a fix for what a broken path COSTS. The
  author still has to correct the deck; they can now see which line to correct.
- **Not coverage of every image channel.** An SVG `<image href>` fires the hook (it is
  handled by the same code path as an `<img>`) but is not NAMED — the DOM scan reads
  `<img>` elements and the probe reads `background-image`. A CORS-blocked background is
  seen by nothing at all: it loads in the frame, so the probe says fine, and the hook
  never fires for a background. Both would need the capture frame to record its own
  failed requests.
- **Not a durable record.** The reason rides in a toast. It now stays up 15 s rather
  than 2.6 — long enough to read a path, which the design depends on and did not have —
  but an author who steps away during a long export still misses it. Somewhere to go
  back and read what an export dropped is a separate change.
- **Not a change to the CLI export.** `lattice-emulator.js` has its own asset path and
  is not on this seam.
