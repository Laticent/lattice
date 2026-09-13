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

`onImageErrorHandler` on both capture flavors, which resolves instead. The image is
simply absent from the page and everything else renders. That one option is the
whole behavioral fix, and it changes the PDF, the PowerPoint AND the image set at
once, because they share `captureOptions`.

The rest is the part that keeps it from becoming a WORSE defect. An export that
silently ships a hole is harder to catch than one that refuses: the author sees
"PDF ready." over a file they would not have sent. So each run carries a log, and
the reason goes in the toast — through the `onDegraded` channel the webpage export
already uses, because the progress line is transient and gone by the time the file
lands.

### Naming the path takes TWO sources, and neither alone is enough

- **`count` comes from the capture's hook**, which sees every failure — including a
  remote image the frame displayed happily and whose `fetch` the exporter could not
  read past CORS.
- **`paths` comes from the LIVE DOM** — an `<img>` that is `complete` with
  `naturalWidth === 0` asked for something it did not get, and it still has the
  attribute the author wrote.

The hook cannot name anything: it is handed the CLONE, whose `src` has already been
blanked, and an empty `src` reads back as the PAGE's own address (measured:
`http://localhost:4321/studio/`), which would send the author looking in exactly the
wrong place. The DOM scan cannot see the CORS case, because that image loaded fine.
Together they give a trigger that is complete and names that are right. The sentence
then lists up to three paths, and when it can name NONE of them it gives no number at
all — deliberately, because `count` is one per failed image ELEMENT: a single bad
`logo:` on a 56-slide deck registers 56, and telling an author they have fifty-six
broken images when they have one would send them hunting for fifty-five that do not
exist.

`complete` is the guard that matters in the scan — an image still in flight also
reports `naturalWidth === 0`, and accusing it would name a file that was fine.

## How it was verified

| Claim | Evidence |
|---|---|
| A deck with a 404 image exports | `docs/e2e/export-missing-image.spec.ts` drives the REAL Studio with a deck referencing `/this-image-does-not-exist-4f2a.png`, downloads the PDF and opens it: 2 pages. On `main` the same deck produces no download at all |
| The author is told, and told WHAT | The same spec asserts the toast reads `PDF ready — but …could not be loaded…` and contains the broken path verbatim |
| The naming rules are right | Unit tier (jsdom): the path the deck wrote is what gets named; an image still loading is not accused; one bad path on 56 slides reads as one image, not 56; a failure that can be named at all gives no count; the list stops at three |
| The e2e arm can fail | **Mutation-proved**: delete `onImageErrorHandler` from `captureOptions` — which is exactly `main` — rebuild, and the spec fails (no download arrives) |
| Nothing else changed | `npm run lint`, `tsc`, the docs export suite (78), root unit suite, `build:check` |

## What this is NOT

- **Not a fix for a broken path.** It is a fix for what a broken path COSTS. The
  author still has to correct the deck; they can now see which line to correct.
- **Not coverage of every image channel.** A CSS `background-image` that 404s and an
  SVG `<image href>` are counted by the hook (they go through the same fetch) but not
  NAMED by the DOM scan, which reads `<img>` elements. Naming those needs the capture
  frame to record its own failed requests.
- **Not a change to the CLI export.** `lattice-emulator.js` has its own asset path and
  is not on this seam.
