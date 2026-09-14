---
status: shipped
summary: A `video` component (imagery bucket) that renders a static poster + play badge + provider label + scannable QR/link — never a live iframe inside the slide — so it works identically in PDF/PPTX/HTML; posters come from an author override or a build-time oEmbed fetch cached to disk, keeping render offline-deterministic
last-updated: 2026-09-13
companion:
  - ../../lib/components/imagery/image/image.manifest.json
  - ../../lib/engine/qr.js
  - ./2026-07-01-qr-authoring-grammar.md
  - ./2026-07-02-video-overlay-playback.md
  - ../../lib/core/transform-dsl/schema.js
---

# A `video` component — poster + QR, never a live embed

## Why not a real embed

The ask was "embed YouTube / TikTok / Instagram / Vimeo." Two hard facts shape
the answer:

1. **The primary output is a static PDF (and PPTX).** A PDF is paper — it cannot
   play a video. Whatever we render has to make sense as a still.
2. **The engine bars iframes by design, in two independent places.** The
   transform-DSL element allow-list explicitly BARS `iframe`/`object`/`embed`
   (`lib/core/transform-dsl/schema.js` §6.1), and untrusted slide HTML in the
   docs Studio must pass through `sanitizeSlideHtml` (HARD RULE #22, the
   XSS/OpenRouter-key threat model), which strips iframes. A live player would
   require a sanctioned exception in *both* — a security-sensitive escalation.

So the component renders a **static representation**: a poster frame with a ▶
play badge, the provider's name, an optional caption, and a **scannable QR code**
(reusing `lib/engine/qr.js`) that links to the video. In the boardroom the
audience scans to watch; in the HTML export the poster is also a plain link.
This degrades identically across PDF / PPTX / HTML and needs zero security
exceptions.

**Live playback shipped later, and it needed no #22 exception either** — this
paragraph's original parenthetical predicted one and was wrong on both counts.
[`2026-07-02-video-overlay-playback.md`](2026-07-02-video-overlay-playback.md)
mounts the player in the **parent** document, positioned over the poster, so it is
never slide HTML and never passes through `sanitizeSlideHtml`. It runs on the
Playground and in the Studio today. Nothing here changes: the *component* still
renders a static poster, and that is still what a PDF, a PPTX and an HTML export
carry.

## Shape

- **Bucket / axes:** `imagery` (mirrors `image`). Function `imagery`, a canvas-ish
  form. New component `lib/components/imagery/video/`.
- **Authoring** mirrors the QR postfix-key grammar
  (`2026-07-01-qr-authoring-grammar.md`) the QR variants already use:

  ```
  <!-- _class: video -->

  ## Watch the 90-second product tour.

  - https://www.youtube.com/watch?v=dQw4w9WgXcQ
  - Scan to watch `caption`
  - my-poster.jpg `poster`
  ```

  The **video URL** is a bare bullet, provider auto-detected by URL pattern.
  `caption` and `poster` are optional postfix-key bullets (reserved keys).
  A `poster` override always wins; everything else is optional.
- **Render anatomy:** `<figure class="video-embed"><div class="video-poster">`
  (background-image poster + `.video-play` ▶ badge + `.video-provider` label)
  `</div>` + QR tile (`lib/engine/qr.js`) + optional `<figcaption>`. Palette-blind;
  spacing via gap/padding only (#20); fixed-contrast QR chip via the same
  `--qr-paper`/`--qr-ink` token-with-fallback the QR variants use (#3-exempt).
- **Transform:** a code transform in `lib/transformers/video.js` + kernel under
  `lib/components/imagery/video/`, registered in the shared registry so it runs
  on every render path (#1). Reuses the QR-card parse helpers where they fit.

## Compositions (from a parallel design exploration)

Five composition candidates were generated in parallel (one designer agent each)
and rendered for review. Two were kept; `qr` became an opt-in **modifier** (the
transform emits the QR only under `.qr`), not a baked default:

- **`companion`** — a claim/lead line leads on the LEFT, the poster proves it on
  the RIGHT (the kernel splits the heading+lead from the figure). With `qr`, a
  poster-width hairline divider + a symmetric gap separates the poster from the
  code, both centered on the column's axis. The boardroom workhorse.
- **`gallery`** — the still CONTAINED on a matte (zero-crop, letterboxed) with a
  placard caption below and a play overlay; `qr` adds a chip beside the placard.
  For a vertical/diagram-ish clip where the whole frame matters.

Dropped after review: `card` (a poster + meta column — redundant with companion),
`reel` (a multi-clip contact sheet), and `spotlight` (a full-bleed cinematic
hero). **`spotlight` is deferred, not rejected**: a true full-bleed hero must be
a *sovereign* frame (no masthead band / stage cell), which the Form cell
structure this component uses actively fights — a dedicated follow-up, not a CSS
tweak.

## Poster sourcing — oEmbed at build, cached, offline-safe

Render must stay offline/deterministic (fonts self-hosted, Mermaid vendored, QR
pure-JS — never a CDN at render). So the network touch happens once, at build,
and is cached:

- A build tool (`tools/fetch-video-oembed.js`) resolves each unique video URL via
  the provider's public oEmbed endpoint → `{ provider, title, thumbnailUrl }`,
  downloads the thumbnail, and writes it to a **committed cache** (a
  `video-oembed.cache.json` map + the thumbnail files). Re-runs are no-ops when
  the cache is warm; a fetch failure never breaks the build.
- **At render**, the transform reads only the local cache — no network.
- **Poster fallback order:** author `poster` override → cached oEmbed thumbnail →
  a provider-branded placeholder tile (name + ▶, no image). The QR/link always
  works regardless, because it's derived from the URL alone.

## Provider matrix (from reachability testing, 2026-07-02)

| Provider | oEmbed | Poster source |
|---|---|---|
| YouTube | public ✓ | auto (oEmbed thumbnail) |
| Vimeo | public ✓ | auto (oEmbed thumbnail) |
| TikTok | public ✓ | auto (oEmbed thumbnail) |
| Instagram | **deprecated** (needs a Facebook app token) | **author `poster` required**, else placeholder |

Instagram's public oEmbed is gone (301 → app-token gate), so Instagram relies on
the author poster + link. URL patterns still detect the provider for the label.

## Delivery (full component contract)

`video.manifest.json` (+ variants), `video.docs.md`, `video.styles.css`, sample
poster asset(s), `video.gallery.md` (+ dark/light PDFs on graduation, not before
review — #8), the transform + registry wire-up, the oEmbed tool, unit tests, a
per-feature demo deck `examples/video.md` (+ committed PDF, #9), and a
`CHANGELOG` entry (#10). Ships in one PR (#17). Visual sign-off: render the demo
in dark + light and actually look at it (Quality Bar).

## Status

**Shipped.** Every item in Delivery above is in the tree: the manifest and
variants, `video.docs.md`, `video.styles.css`, the poster asset,
`video.gallery.md` with its dark and light PDFs, `lib/transformers/video.js`
registered in the shared registry, `tools/fetch-video-oembed.js`, unit tests, and
`examples/video.md` with its committed PDF. `spotlight` stays deferred (see
Compositions), and the provider table moved to `lib/core/video-providers.mjs` in
2026-09 — see
[`2026-09-13-plugin-architecture.md`](2026-09-13-plugin-architecture.md).
