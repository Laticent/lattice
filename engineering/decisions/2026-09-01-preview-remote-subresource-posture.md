---
status: shipped
summary: >
  A deck could make a docs-site preview frame fetch an arbitrary external URL on open — a
  tracking beacon leaking the viewer's IP and User-Agent — through fully sanitized slide HTML.
  Not a Mermaid bug and not a sanitizer hole: the sanitizer keeps inline `style` deliberately,
  and HARD RULE #22's threat model covers script execution, not resource loads. The deciding
  measurement was that the EXPORTED player already contains this (`img-src data:`, zero
  outbound requests), so preview was both the only open surface and the one rendering
  something the shipped file would not. Decision: contain, via a narrow CSP on all three
  preview-frame builders — img/media/font/connect/object/base/form closed to same-document
  sources, deliberately NO `default-src` so script and style loading are untouched. Measured
  before/after on the real assembled srcdoc: 3 beacon requests to 0, payload still in the DOM.
  Cost measured at zero — no shipped deck references a remote image. The full Playground round
  trip is now driven on the real app: 4 beacon requests with the meta neutered, 0 with it,
  payload present in the DOM both times, pinned by docs/e2e/preview-remote-subresource.spec.ts.
---

# The preview frame's remote-subresource posture

**Date:** 2026-09-01 · **Issue:** #1753 (split out of #1246) · **Status:** decided, implemented

## The question

A deck can make a docs-site preview frame fetch an arbitrary external URL on **open**, with
no interaction. Measured on the real Playground during #1753, through **fully sanitized**
slide HTML, with no Mermaid anywhere:

| deck content | outbound requests |
|---|---|
| `[pic](https://attacker.invalid/plain.png)` | 2 |
| an inline `style="background-image:url(…)"` | 1 |
| a raw `<img src="https://attacker.invalid/raw.png">` | 2 |

A Mermaid node label does the same. That is why this is **not** a Mermaid bug and not a
sanitizer hole: `lib/core/sanitize-slide-html.mjs` keeps inline `style` deliberately, because
the engine emits `url()` for backgrounds and logo masks — *"a resource load, not script."*

## Why HARD RULE #22 did not already answer it

#22's threat model (#616, `2026-06-29-component-transformer-threat-model.md` §5.1) is about
**script execution → OpenRouter-key theft**. A resource load executes nothing. The harm here
is different: for a deck that arrived from someone else — a shared deck or an AI-generated
one, both shipped paths — an image URL is a **tracking beacon**. It leaks the viewer's IP and
User-Agent and confirms they opened the deck, silently, on open. Real, and simply not the
question #22 was written to answer.

## The measurement that decided it

The **exported player already contains this**, and has all along. `lib/export/player-core.mjs`
ships `img-src data:` in its CSP, and a deck carrying a remote image fires **zero** outbound
requests from the exported `.html` (measured, Chromium 131, request interception). The URL
survives in the markup; the fetch is refused.

One consequence follows, and it settles the cost question:

- **Preview was rendering something the shipped player would not.** A remote image displays
  while authoring and is silently dead in the exported `.html` — that export inlines *local*
  files only. Containing preview does not remove a working feature; it stops preview from
  disagreeing with the file people receive.

**A second consequence was claimed here and was FALSE, and the correction is the more useful
half of this record.** The first draft said "preview was the only open surface — the artifact
that actually leaves the building was already closed." Review found it wrong. `buildSrcdoc` —
the function this change adds the CSP to — also builds the Studio's **offscreen export capture
frame** (`docs/src/components/studio/export/deck-export.js`, `createCaptureFrame`), the sole
frame factory behind Download PDF, PPTX, PNG and the image set. Containing that frame would
have blanked a legitimately-remote image in a **downloaded file** — an export-bytes change,
which the QUALITY BAR makes a stop-and-show, and which nobody was shown. It would also have
put the Studio's export at odds with the CLI's, which carries no CSP at all: the same deck
rendering two ways, the exact disagreement this policy exists to remove.

So the capture frame **opts out** (`csp: false`), and the boundary is now explicit: a
**preview** is a frame the author browses, where a deck's image beacons on open; an **export
renderer** produces a file the author asked for. Exports load what the deck references, on
both paths. See "What this does not do".

And the cost to this repo's own content is **zero**: no deck under `examples/**`,
`exemplars/**`, the baseline decks, or the component galleries references a remote image or
media file.

## The decision

**Contain, via a CSP on every preview-frame builder.** Chosen by the maintainer over
*accept-and-document* and *split-by-provenance*. Containment is the only option that actually
closes the vector, its cost landed at zero once measured, and it makes preview agree with the
export. Split-by-provenance was the best-targeted option but needs a provenance signal the
preview does not carry, and a signal that fails open is worse than no signal.

A CSP rather than a scrub because it closes the vector uniformly, **pre- and post-render** —
including the one shape no post-render scrub can reach: `A@{ img: "https://…" }` fetches
during Mermaid's *own* layout, before our injection point exists.

## The policy, and why it is narrow

```
img-src 'self' data: blob:; media-src 'self' data: blob:;
font-src 'self' data: <katex origin>; connect-src 'self';
object-src 'none'; base-uri 'none'; form-action 'none'
```

**There is deliberately no `default-src`.** Script, style and worker loading stay exactly as
unrestricted as before, so this change cannot break Mermaid, KaTeX or the runtime by starving
a directive nobody thought to enumerate. What is listed is only what a *deck* can aim at a
remote host:

- **`img-src`** — the beacon proper: markdown images, raw `<img>`, and `url()` in an inline
  style attribute all land here.
- **`media-src`** — `<video>`/`<audio>` survive sanitization (only script/iframe/object/embed
  are forbidden), so they are the same vector with a different tag.
- **`font-src`** — a deck's front-matter `style:` can carry `@font-face { src: url(…) }`. The
  KaTeX origin is **derived from the `katexUrl` parameter**, not hard-coded: these URLs are
  call-site parameters, and a surface pointing at a different mirror must not silently lose
  its math glyphs.
- **`connect-src` / `object-src` / `base-uri` / `form-action`** — closed; nothing in a preview
  needs them and each is an exfiltration route on its own.

`data:` and `blob:` stay open throughout: both are same-document payloads that reach no
network, and the Studio's own image handling depends on them.

## Verification

**Measured before/after on the real assembled preview document** — the actual `buildSrcdoc`
output, loaded in Chromium 131 with request interception, with only the CSP meta removed for
the "before":

| | beacon requests | payload elements in DOM |
|---|---|---|
| without the CSP | **3** (`plain.png`, `raw.png`, `bg.png`) | 3 |
| with the CSP | **0** | 3 |

The payload is present in the DOM both times, so the fetch is refused rather than the markup
rewritten — and the probe is demonstrably able to see a beacon when one fires.

**Pinned by:** `test/unit/playground/deck-preview.test.js` — that the meta is emitted, that it
precedes `<body>` and every subresource link (a CSP meta governs only what the parser has not
already reached), that each directive is present, that `default-src` is *absent*, that the
font origin follows `katexUrl`, and a **census** asserting all three builders call
`previewCspMeta`. The census is by source text because two builders are not Node-importable —
the same shape #22's own guards use, for the same reason.

## The Playground round trip, driven

**Measured on the real running Playground**, not on the assembled document: the built docs
site served by `astro preview`, a deck seeded as the visitor's draft carrying all three
vectors, request interception on `attacker.invalid`, Chromium.

| | beacon requests | payload elements in the frame DOM |
|---|---|---|
| with the CSP (shipped) | **0** | 3 |
| with `previewCspMeta` neutered in the served bundle | **4** | 3 |

Four rather than three in the control because the raw `<img>` is requested twice; the
before/after on the assembled document below counted three distinct URLs. The payload is in
the DOM both times, so the fetch is refused rather than the markup rewritten, and the probe
is demonstrably able to see a beacon when one fires. Zero page errors either way — the CSP
starves no directive the app needs.

**Pinned by `docs/e2e/preview-remote-subresource.spec.ts`**, which is the same measurement as
a spec: it reads the CSP off the LIVE frame document (not off the builder), settles on
`img.complete` rather than a fixed wait — a refused load still completes, so the absence
assertion has a real signal to poll — and asserts both that the payload survived and that
nothing was fetched. Run red against the same neutered bundle.

**What this cost to learn, recorded so nobody re-pays it.** The prior session concluded the
docs e2e suite "cannot render a seeded deck in this sandbox" from
`mermaid-post-sanitize.spec.ts` failing 11/11 with `.lattice` never appearing. That
conclusion was too wide by one step: THAT suite loads the real Mermaid from the CDN the
preview names, which this sandbox cannot reach, so its preview never settles. A seeded deck
with no Mermaid in it renders here in about three seconds. The deployed Cloudflare Pages
preview remains out of reach for a browser (`net::ERR_CONNECTION_RESET`, with and without
`--proxy-server=$HTTPS_PROXY`, while `curl` gets HTTP 200) — but it is no longer the only
route to a real Playground.

## What this does not do

Script execution out of a preview frame is #22's territory and is covered elsewhere (#1752,
`2026-08-18-post-sanitize-injection-queue.md` §3.1). This record is about resource loads only.

**It does not contain EXPORTS, on either path, and that is the open question this leaves.** The
CLI (`lattice-emulator.js`) emits no CSP into the documents it rasterizes, and the Studio's
capture frame now explicitly opts out to match it. So a deck carrying a remote image still
fetches it while a `.pdf` / `.pptx` / `.png` is being produced — which leaks the *exporting
author's* IP, not a recipient's, and that is a materially weaker harm than the preview case: the
author chose the deck and chose to export it. It is still a real question for a deck that
arrived from someone else, and the answer has to cover both export paths at once or it just
recreates the CLI/Studio divergence in the other direction. Deciding it means moving exported
bytes, so it needs its own change and its own sign-off.

The exported **player** is the one artifact already contained (`img-src data:`), and that
predates this work.
