# Gotchas — Fonts and emoji

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## A rendered PDF shows serif/fallback type, not the design fonts

- **Symptom:** A committed deck PDF (e.g. `examples/sketch.pdf`) opens
  with serif headings and a plain sans body — none of the design's
  Playfair/Outfit, or under `sketch` none of the Caveat/Shantell hand
  type. It looks the same no matter where you open the PDF.
- **Cause:** Fonts are embedded into a PDF **at render time**, never
  fetched when viewed. The engine loads its faces from a Google-Fonts
  `<link>`/`@import`, which needs the network. A render with no network
  — the pre-commit PDF rebuild offline — silently embeds a system
  fallback instead. In the **cloud sandbox** specifically the network is
  present but a **TLS-intercepting (MITM) proxy** sits in front of CDNs,
  so the webfont fetch fails the certificate check and falls back the
  same way — i.e. "the sandbox has network" does not mean CDN webfonts
  resolve. The page-count tests don't catch it (font
  swaps don't change slide count), so the broken PDF ships green. The
  trap: "open it on a networked device and the fonts resolve" is FALSE
  — a fallback-font PDF is fallback forever.
- **Fix:** `lattice-emulator.js` base64-injects the self-hosted woff2 in
  `assets/fonts/` (Caveat, Shantell Sans, Outfit) as an inline
  `@font-face` block that wins over the `@import`, and waits on
  `document.fonts` before `page.pdf()`. So the repo's own renders embed
  the real type offline. `assets/` is excluded from the npm tarball, so
  the shipped bin still uses Google fonts for end users.
- **Coverage:** the whole engine stack is self-hosted — Playfair Display
  (incl. italics), Outfit, JetBrains Mono, Caveat, Shantell Sans — so a
  network-less render embeds every face. To add a weight/family, drop its woff2
  into `assets/fonts/`, add a row to `SELF_HOSTED_FACES`, **and** vendor it for
  the web-export path too (`docs/src/playground/font-embed.js` + its `./fonts/`).
  The `fonts:check` gate (`tools/check-fonts.js`, run by `build:check` and
  pre-commit) enforces that the `@import` demand and both offline supplies stay
  in lockstep — half-update one and the build fails.
- **Verify the right way:** check the *rendered pixels* (rasterize a
  page), not `pdffonts`/`get_fonts()` — a subset-embedded face often
  reports an empty name and reads as "missing" when it's actually there.

## Studio PDF/PPTX export shows fallback type on some slides

- **Symptom:** A deck exported from the docs-site Studio (Share →
  PDF or PowerPoint) renders *most* type correctly but a face drops to a
  system fallback on a subset of slides — classically, a `finish: sketch`
  deck keeps its Caveat headings but the Shantell Sans **body** goes clean
  Outfit. The live preview looks right; only the exported file is wrong.
  This is the **web-export** twin of the offline-font fallback gotcha
  above ("A rendered PDF shows serif/fallback type") — same symptom,
  different render path and fix.
- **Cause:** The image exporters (`docs/src/components/studio/export/deck-
  export.js`) rasterize every slide through `html-to-image`, including
  off-screen ones they force-visible mid-loop. Marp's template lazy-loads
  each web-font face only when the *active* slide needs it, and the export
  awaited `document.fonts.ready` **once**, up front — before those
  off-screen slides requested their faces. A face first needed by an
  off-screen slide hadn't finished loading from Google Fonts when its slide
  rasterized, so that slide baked in a fallback. Headings survived only
  because a bookend slide was active at export time. Letting
  `html-to-image` chase the cross-origin Google-Fonts `@import` itself is
  also unreliable (its `cssRules` read is CORS-blocked).
- **Fix:** `docs/src/playground/font-embed.js` vendors every engine text
  face (latin subset, in `docs/src/playground/fonts/`), builds **one**
  data-URI `@font-face` sheet, and hands it to every `html-to-image` call
  as `fontEmbedCSS` — so each rasterized slide is self-contained, no
  network, no race. It also injects the faces into the preview doc and
  awaits them so the cloned nodes lay out with real metrics. The module is
  lazy-`import()`ed (its `.woff2` imports aren't Node-loadable, which would
  break the export module's unit tests). Covers PDF + PPTX (shared
  rasterizer); the vector `Print` path renders through the browser's own
  engine and was never affected.
- **Verify the right way:** rasterize a body slide of an exported sketch
  deck and read the pixels — `pdffonts` is useless here (the export is an
  *image* PDF; text is baked into PNGs, not embedded as PDF fonts).
- **Note:** This is docs-export-scoped. The published engine and its
  Google-Fonts `@import` are unchanged; npm consumers load from Google.

## Studio / playground LIVE PREVIEW shows hand-body decks in a system sans

- **Symptom:** A `finish: sketch` deck in the docs-site live preview shows
  hand-drawn *headings* but a clean-sans *body* (and clean eyebrows, pills,
  bullets) — it looks like "only headings are styled." It is the same
  fallback-asymmetry as the export, but visible on screen, before any export.
- **Cause:** The preview renders each slide into an `srcdoc` iframe whose
  `<style>` is `frame-CSS + theme-CSS` concatenated. The engine's Google-Fonts
  `@import` rides at the top of the theme CSS, but once it's concatenated
  **after** the frame rules it is no longer the first rule in the sheet — and
  **CSS silently ignores an `@import` that isn't first.** So the iframe
  registers *none* of its own webfonts; it renders only the faces the **parent
  docs page** already loaded into the shared same-origin font cache
  (Playfair/Outfit/JetBrains, from `styles/landing.css`). The docs UI never
  loads Caveat/Shantell, so the sketch faces are simply absent in the iframe —
  headings fall to the system hand font in the `--sketch-font-display` stack
  (`'Bradley Hand', cursive`) and so still *look* hand, while body falls to
  `system-ui, sans-serif` and looks clean. The split is a fallback artifact, not
  a missing CSS rule: the token re-pointing (`--font-body` → Shantell) is
  correct and reaches every element; the font just wasn't loaded.
- **Diagnosis tip:** In the iframe, `document.fonts` will list KaTeX faces but
  **not** Caveat/Shantell/Outfit/Playfair, and `document.fonts.load("16px
  'Shantell Sans'")` resolves to `0 face(s)` — proof the face isn't registered.
  `document.fonts.check(...)` is a trap here: it returns `true` for an
  unregistered family (it reports the system fallback as "ready").
- **Fix:** Register the vendored faces in the iframe directly. The preview host
  passes a `@font-face` block (built from `previewFontFaceCss()`, referencing the
  bundled woff2 by URL) through `data.previewFontCss` into `writeFrame`'s srcdoc;
  `single-slide-render.ts` (hero / restyle / field-card islands / specimens)
  lazy-imports the same builder.
  The faces are now genuinely present in the iframe regardless of the inert
  `@import` or what the parent loaded.

## Color emoji needs an installed font on the owned render paths

- **Symptom:** Emoji render as monochrome glyphs or tofu boxes (▯) in
  PDFs produced by `lattice-engine` or `lattice-emulator` on a bare
  host (CI runner, server, a freshly-provisioned desktop WebView) — even
  though they look fine on a Mac/Windows dev machine.
- **Cause:** Unlike the marp-core-based surfaces — the VS Code Marp
  preview and a marp-cli-rendered Export-to-Marp bundle — which rewrite
  emoji to twemoji `<img>` (see "Marp Core wraps emoji in `<img class="emoji">`"
  in `marp.md`), the **owned paths
  emit emoji as plain unicode text**. Headless Chromium then needs a
  *color* emoji font to be available to render them. The `--font-*`
  stacks name `'Noto Color Emoji'` and `lattice.css` now also loads it
  as a webfont via the Google Fonts `@import`, **but Chromium is
  unreliable about honoring `@font-face` for emoji presentation
  sequences** — it frequently bypasses the webfont and uses the
  platform emoji font. So the webfont is a portable bonus, not a
  guarantee; an *installed* color emoji font is the reliable mechanism.
- **Mitigation:** Install `fonts-noto-color-emoji` (Debian/Ubuntu) in
  every environment that renders Lattice PDFs:
  - **CI** — `.github/workflows/ci.yml`, the integration job's apt step.
  - **Cloud sessions** — `.claude/hooks/session-start.sh` (step 2b).
  - **The SlideWright desktop app** — its WebView/packaging must ship or
    install a color emoji font; the engine alone can't guarantee it.
- **Triggered by:** Any unicode emoji in a deck rendered through
  `lattice-engine` / `lattice-emulator` on a host without a color
  emoji font.
- **Removable when:** Never fully — it's inherent to emitting emoji as
  text. The webfont `@import` and the font installs together are the
  correct shape. (Note: this sandbox's headless Chromium loads **no**
  webfonts at all, so verify emoji rendering relies on the *installed*
  font here, not the `@import`.)
- **See:** `engineering/decisions/2026-06-10-marp-replacement-proposal.md`
  (the twemoji-drop decision).

## Flex-centered caps read high in JetBrains Mono (and `text-box-trim` can't fix it here)

- **Symptom:** A pill/badge laid out as `display:inline-flex; align-items:center; line-height:1` in **JetBrains Mono** looks like its text sits slightly HIGH — more empty space below the glyphs than above — even though the box is centered. Adding `text-box-trim:trim-both; text-box-edge:cap alphabetic` (the spec-correct fix) changes nothing in the rendered PDF.
- **Cause:** `align-items:center` centers the line BOX, but a font's baseline sits asymmetrically inside it — the descender space below the baseline is reserved even for caps/digits that never use it. The magnitude is **font-specific**: JetBrains Mono seats caps badly (caps land ~7px high, mixed-case ~15px high, in a 60px test pill), while the body sans Outfit lands caps ~1px off — imperceptible. `text-box-trim` would trim the box to the cap/baseline edges and fix it for any font, but it shipped unprefixed only in **Chrome 133** (Feb 2025); the puppeteer-cached Chromium that lattice-emulator renders with is **131**, where the property is silently ignored (a `text-box-trim` pill is pixel-identical to one without).
- **Mitigation:** Don't center small caps labels in JetBrains Mono. The universal pill uses the **body sans** (`--pill-font: var(--font-body)`), whose metrics center caps correctly with plain symmetric padding — no optical nudge, no `text-box-trim`. This was the fix for the pill family; it also suits a pill better (a status chip is a label, not code). Measured by rasterising caps pills in both fonts and comparing the ink-gap above vs below. If you must center caps in mono somewhere, either accept the ~7px lean or wait for `text-box-trim`.
- **Triggered by:** Any small flex-centered caps label set in JetBrains Mono.
- **Removable when:** The render Chromium reaches ≥133 — then `text-box-trim:trim-both; text-box-edge:cap alphabetic` becomes the general, font-agnostic fix.
- **Commits:** The universal-pill branch.
