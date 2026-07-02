---
marp: true
theme: indaco
paginate: true
header: "Lattice · PDF export portability"
---

<!-- _class: title silent -->

# The PDF that opens everywhere

`Export · portability`

The deck stays vector — selectable text, embedded fonts, crisp at any zoom. Only the SVG photos become pixels, and only because some viewers demand it.

<!-- Speaker notes ride every slide of this deck: each one is embedded in the PDF as a hidden per-page annotation. Run with --notes-icon to surface them as clickable sticky notes, or --notes for a plaintext sidecar. -->

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

`The problem`

## A shared deck gets opened on a phone first — the export has to survive the strictest viewer it meets.

<!-- iOS Safari's built-in PDF viewer (Quartz) is that strictest viewer: it mishandles the vector constructs Chromium prints for clipped SVG image placements — issue #690, found on a real device. -->

---

<!-- _class: image spotlight -->
<!-- _footer: "full-bleed SVG panorama — the placement that broke on iOS" -->

## A panorama earns the full frame.

On iOS, this full-bleed SVG used to draw only a top band over bare canvas. It now exports as a 2× raster twin — a plain image XObject every viewer supports.

![bg](assets/sample-photo-pano.svg)

<!-- The spotlight cover placement emits shading-pattern / transparency-group constructs in the vector PDF. Quartz partially renders them; poppler is fine — which is why CI never caught it. -->

---

<!-- _class: image split -->
<!-- _footer: "full-height SVG column — the placement iOS dropped entirely" -->

## Built for the long climb.

The tall photo column vanished outright in Quartz viewers. Same fix: the SVG is rasterized at export time, at twice its placement size, aspect intact.

![bg](assets/sample-photo-tall.svg)

<!-- One raster twin per unique SVG, sized to 2x its largest placement — the resolution the #681 on-device fix proved out. Layout is unaffected because the twin keeps the intrinsic aspect ratio. -->

---

<!-- _class: content -->

## What the exporter now does by default

- Rasterizes SVG images
  - Every `![bg](photo.svg)` and inline `![](photo.svg)` becomes a 2× PNG twin in the PDF — text and layout stay vector.
- Keeps real vectors vector
  - Mermaid diagrams, charts, and logo marks are inline SVG: they print through the page's own paint path and stay selectable-crisp.
- Leaves you an out
  - `--keep-vector-images` restores the pure-vector export when you control the viewers.

<!-- The swap happens in the loaded page right before printing; the HTML sidecar keeps the original SVGs, because browsers render them perfectly. -->

---

<!-- _class: content -->

## Two delivery flags for the artifact itself

- `--raster`
  - One full-bleed 2× JPEG per page — maximum compatibility, at the cost of selectable text. Notes, `--present`, and `--embed-source` still apply.
- `--embed-source`
  - Attaches this deck's Markdown inside the PDF, so the artifact alone round-trips back to an editable deck. Opt-in: it ships your source, speaker notes included.

<!-- This PDF was exported with the defaults: vector pages, rasterized SVG photos, hidden note annotations. -->

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

## Beautiful is the floor. Portable is the contract.

`Export · portability`

<!-- Closing note: the vector export remains the one canonical artifact; --raster and --embed-source are delivery-time choices, not defaults. -->
