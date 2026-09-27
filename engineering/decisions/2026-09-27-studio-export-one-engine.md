---
status: proposed
summary: The owner wants the Studio's Export to PDF to produce "option 1" — a background photo with real, sharp text and shapes on top — through one export spine shared with the CLI. A browser page cannot write a real-text PDF on its own, so the choice is between one engine on a server (A) and a second PDF drawer in the browser (B). Measured sizes, speeds and scope for each; recommends A with today's photo export as the offline fallback.
---

# One export engine for the Studio's Export to PDF

**Status:** proposed 2026-09-27, waiting on the owner's pick.
**Related:** [`2026-09-26-backdrop-register.md`](2026-09-26-backdrop-register.md) §4.7–4.8
(the edge fixes, made twice), PR #2404 (the CLI's option 1),
`followups.d/2400-p2-shared-export-face.md`.

## 1. What the owner asked for

The owner approved "option 1" on their own cuoio deck: each slide's soft background (glow,
fade, spotlight) is a small photo, and the text, charts and lines are drawn on top as real
text and shapes. They want the Studio's **Export to PDF** button to produce the same PDF in
the colored modes, and they want every export to come from **one shared spine**, so a finish
bug is fixed once. The black-and-white print mode is out of scope: #2404 already removes the
finish there, so it has no photo at all.

## 2. Why the Studio can't do it today

Option 1 needs a PDF writer that can lay out text and shapes. The CLI has one: it runs its
own Chrome, and Chrome's `page.pdf()` writes real text. **A web page has no such call.** It
can only open the print dialog (`window.print()`), which the Studio already offers as its
separate Print button (`docs/src/components/studio/export/deck-export.js` `exportPrint`).
So the Studio's Export to PDF writes the file itself: one photo per slide
(`pdf-image-stream.js`), plus invisible words for copy and search (`pdf-text-layer.js`).

## 3. Measured today, on the same deck

All numbers come from the 9-slide Northwind deck, measured in the cloud sandbox on
2026-09-27. Poppler is a desktop PDF renderer; its time is how long it takes to draw all
nine pages.

| Export | File size | Text | Sharp at deep zoom |
|---|---|---|---|
| Studio today, PNG pages (strata + `clear`) | 1.19 MB | invisible copy over a photo | no |
| Studio today, JPEG q95 pages | 1.95 MB | invisible copy over a photo | no |
| CLI option 1, strata + `clear` (#2404 light method) | 363 KB | real | yes |
| CLI option 1, cuoio + atrium + `spot-tr` (#2404 fallback) | 2.67 MB | real | yes |
| CLI today, cuoio + atrium + `spot-tr` | 343 KB | real | yes, but slow and hard-edged |

The 2.67 MB row is the known gap in #2404: a spotlight falls back to one full-size photo of
the backdrop, including atrium's fine grid. The #2404 rework draws the grid as real lines
instead. The expected result is close to 343 KB, but that is not yet measured.

Speed on the same deck: poppler draws option 1 in 5.5 s against 13.2 s today. One CLI export
of the deck takes 4.9–10.3 s end to end here, and most of the difference between those two
runs is starting Chrome.

## 4. The two ways to give the Studio option 1

### A. One engine, run on a server

The Studio sends the deck (Markdown, theme, and the images it uses) to a Lattice export
service. The service runs the CLI export and returns the PDF.

- **One spine, literally.** Every export button runs the same code, so the Studio's PDF is
  byte-for-byte the CLI's PDF. A finish fix lands once and every export has it.
- **Speed:** about 5 s for this deck with a cold Chrome, less with a warm one (not measured),
  plus the upload and the download.
- **Costs:** a service we run and pay for (not measured). Decks leave the user's browser,
  which is a real question for board decks and needs a stated retention policy. The export
  also stops working offline, so today's photo export stays as the offline fallback.
- **Build size:** small. The export already exists; the work is hosting it, a request from
  the Studio, and the fallback.

### B. A second PDF drawer, in the browser

The Studio's own writer keeps the background photo, and draws everything else itself: real
text with embedded fonts, charts as vector shapes, boxes, borders and shadows.

- **Private and offline:** nothing leaves the browser.
- **The scope, measured on this one 9-slide deck:**
  - 66 text runs across 9 font faces;
  - 25 letter-spaced runs and 16 upper-cased runs;
  - 58 chart shapes;
  - 23 rounded boxes, 7 borders, 7 shadows and 7 gradient fills.

  The full catalog adds Mermaid diagrams, KaTeX math, highlighted code, tables and images.
  Chrome handles all of these for the CLI. B would have to redraw each one by hand.
- **Not one spine for the drawing.** The finish rules and the "photo or drawn" plan can be
  shared, but the drawing would be two implementations. Every construct is a place the
  Studio's PDF can drift from the CLI's, which is the same kind of fix-it-twice problem this
  work set out to end.
- **Build size:** large, and it never finishes, because every new component owes a second
  drawer.

### Not pursued

- **Real text only in the browser, with charts and shapes left in the photo.** A smaller
  build than B, but charts go soft at deep zoom, which the owner ruled out.
- **The Print button.** It produces option 1 once the background step runs first, but it
  goes through a print dialog and Safari has its own PDF engine (untested). It stays as it
  is: a separate button, not the Export to PDF.
- **The Laticent desktop app.** It may be able to write a real PDF from its built-in webview,
  which would give A's result offline. This is not checked, and it helps only desktop users.

## 5. What is shared under either option

Two layers are shared under either option:

1. **One export face per finish.** The export CSS in `lib/base/base.finish.css`, and the rules
   `lib/finishes/finish-generate.js` writes for Fabricate finishes, are defined once.
2. **One background plan.** A single piece of code runs inside the slide and decides what
   becomes the small photo and what is drawn as real lines. It is the export-face half of
   #2404's `planLiveLayers`, moved into `lib/core` (HARD RULE #1).

Under A, both layers feed a single engine. Under B they feed two drawers, one of which we
would own and maintain by hand.

## 6. Recommendation

**A, with today's photo export kept as the offline and private fallback.** It is the only
option in which the Studio and the CLI are the same code, which is what "one shared spine"
means. It is also the smallest build, and it removes the Studio's separate drawing path
rather than adding a second one. The open costs are the service's running cost, which is
not yet measured, and the privacy policy for decks that leave the browser. Both are the
owner's decisions, not engineering ones.

Order of work under A:

1. Rework #2404 onto the shared export face and background plan, closing the spotlight size
   gap.
2. Stand up the export service.
3. Switch the Studio's Export to PDF to the service, with the photo export as the fallback.
