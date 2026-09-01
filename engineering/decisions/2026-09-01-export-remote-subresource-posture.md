---
status: shipped
summary: >
  The preview frame was contained in #1753; exports were left open and written up as an open
  question. Measuring them split the question in three. The exported player was already
  contained (`img-src data:`). The RASTER artifacts — pdf/pptx/png, on both the CLI and the
  Studio's capture frame — fetch on the EXPORTING author's machine and hand the recipient
  baked pixels, so the harm is the author's own and containing it would blank a picture they
  asked for. But the CLI's `.html` and `--fluid` exports are LIVE DOCUMENTS whose own help
  calls them emailable, and there the beacon fires on the RECIPIENT's machine on every open —
  the identical harm the preview CSP exists to stop, in a file that has left the building.
  Measured: 2 requests each, 0 from the player. Decision: contain the live class only. The
  feared cost is not there — measured in Chromium, `img-src 'self' data: blob:` on a `file://`
  export blocks the remote image and the deck's own local images still load, because a
  same-directory `file://` image counts as `'self'`.
---

# What an exported artifact may fetch

**Date:** 2026-09-01 · **Follows:** `2026-09-01-preview-remote-subresource-posture.md` · **Status:** decided, implemented

## The question that record left open

Its "What this does not do" section says containment stops at the preview, and frames the
export harm as "materially weaker — it leaks the EXPORTING author's IP, not a recipient's".
That framing is right for some exports and wrong for others, and the difference decides the
answer.

## Three classes, measured

A two-slide deck carrying `![](https://attacker.invalid/plain.png)` and an inline
`background-image:url(…)`, exported three ways, each artifact then opened from `file://` in
Chromium with request interception:

| class | artifacts | who fetches, and when | requests |
|---|---|---|---|
| **contained** | CLI `--player`, Studio "Webpage (.html)" | nobody | **0** |
| **live document** | CLI `.html`, CLI `--fluid` | the RECIPIENT, on every open | **2** each |
| **raster** | CLI pdf/pptx/png/imageset; the Studio capture frame | the AUTHOR's machine, once, at export | at render |

The player's CSP has carried `img-src data:` all along, so the artifact most often emailed was
never the problem. `--fluid`'s own `--help` text calls its output "a single emailable file".

## The decision

**Contain the live class. Leave the raster class alone.** Chosen by the maintainer over
containing everything, over inlining remote images at export time, and over accepting and
documenting.

The line is who bears the harm. A recipient opening a `.html` or `--fluid` file did not choose
the deck's images and cannot see that opening it phones home; that is the preview case exactly,
in a file that travels. An author exporting a PDF chose the deck and chose to export it, and
their recipient receives pixels and fetches nothing — so containing the raster class would blank
a picture the author asked for and buy the recipient nothing.

## Why this does not recreate the CLI/Studio divergence

That was the standing objection, and it does not apply, because the classes do not straddle the
two paths the same way:

- **live** — CLI only. The Studio's sole HTML export is the player, already contained. So this
  change REMOVES a divergence: the CLI's shareable HTML stops disagreeing with the CLI's own
  player.
- **raster** — both paths have one, and they stay together by staying untouched.

## The cost that was feared, and is not there

A CSP on a `file://` document was expected to break the deck's own local images. Measured in
Chromium on a real export carrying one local and one remote image:

| CSP on the exported `.html` | remote requests | local `./local.png` |
|---|---|---|
| none (before) | 1 | loads |
| `img-src 'self' data: blob:` | **0** | **loads** |
| `img-src 'self' data: blob: file:` | 0 | loads |

A same-directory `file://` image counts as `'self'`, so no `file:` token is needed and local
assets cost nothing. **UNVERIFIED on Firefox and Safari** (HARD RULE #23): the measurement is
Chromium's, and `file://` origin rules are engine-specific.

## The cost that is real, and small

A plain `.html` export does NOT inline local files — only `--player` does — so a deck built to
be emailed as `.html` may use a remote resource deliberately, because that is the only way it
travels today. Such a deck now shows a blank there while its own PDF still shows the picture.

**It is not only images, and an earlier draft of this section said so by omission.** Three
directives bite, measured on the real CLI — 3 requests before, 0 after:

- `img-src` — a remote image;
- `media-src` — a hosted `<video>` or `<audio>`;
- `font-src` — a front-matter `style:` declaring `@font-face { src: url(https://…) }`.

That is the policy behaving as designed rather than a defect, but a reader weighing the change
should not have to derive the other two from the directive list.

No deck this repo ships is in any of those positions: zero of `examples/**`, `exemplars/**`, the
baseline decks and the component galleries reference a remote image, media file or font.

## Where the policy is injected, and why that IS the decision

One step, after rasterization, into whatever HTML the run leaves at `outHtml`
(`lattice-emulator.js`). That placement is not an implementation detail — it is the boundary:

- the `.html` deliverable, the `--fluid` viewer, and the `.html` sidecar beside a pdf/pptx/png
  all end up there, so all three are contained;
- the PDF/PPTX/PNG were rasterized from the clean file written *before* that line, so their
  bytes cannot move;
- the assembled player already carries a stricter policy (`default-src 'none'`), so the
  injection skips it — from a FLAG set when the player is written, never from the document's
  text. A text match here let the deck switch its own policy off, and review found it: a
  `<meta http-equiv=…>` in the BODY (which browsers ignore outside `<head>`, so the artifact
  ended up with no effective policy at all), and — worse, because it hits an author who was
  documenting the feature rather than attacking it — an inline code span or a front-matter
  `style:` comment carrying the string, since markdown-it's `escapeHtml` does not escape `'`.
  A `<head>`-scoped text match would still fall to the second, because a deck's `style:` lands
  in a `<style>` inside `<head>`. Nothing the deck writes can reach a flag, which is why the
  skip is one. It also gets the player-assembly FAILURE path right: `outHtml` is then the
  clean render, which does want the policy.

Move that step one line earlier and every raster artifact silently loses its remote images with
every other assertion still green. `test/integration/export/export-remote-subresource.test.js`
therefore asserts the author's own request DOES reach a real HTTP server during a PDF export;
that arm goes red under exactly that mutation.

**The policy itself moved to `lib/core/subresource-csp.mjs`** (HARD RULE #1). It was a
docs-site module, and preview and export were one hand-kept copy away from disagreeing — which
is the divergence the preview record exists to remove, in the other direction.
`docs/src/playground/preview-csp.js` keeps `previewCspMeta`, the name three preview builders
already call, and imports the directive list.

## Measured after

Every artifact opened from `file://` in Chromium with request interception:

| artifact | before | after | payload still in the DOM |
|---|---:|---:|---|
| CLI `.html` | 2 | **0** | yes |
| CLI `--fluid` | 2 | **0** | yes |
| CLI `--player` | 0 | 0 | yes |
| CLI `.pdf` (the author's own fetch, to a local server) | 1 | **1** | n/a — baked pixels |

The payload is present in the DOM in every contained case, so the fetch is refused rather than
the markup rewritten — and the control, which strips the meta back out of a shipped artifact and
sees the requests fire, proves the probe can see a beacon when one exists.
