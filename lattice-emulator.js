#!/usr/bin/env node
/**
 * lattice-emulator.js — the Lattice CLI: HTML renderer + PDF exporter
 *
 * This is the package's `bin` and `main` (built to dist/lattice-emulator.js).
 * It renders on the OWNED engine (lib/engine/), which is canonical for every
 * first-party render path — this CLI and the browser runtime both interpret it.
 * It emits the section elements, pagination attribute, and header/footer
 * structure that lattice.css targets.
 *
 * The name is historical. The file began as a Marp CLI stand-in during the
 * migration, and the HTML shape it emits stays Marpit-compatible on purpose
 * (that compatibility is what LFM specifies and what Export-to-Marp hands
 * off) — but nothing here defers to Marp, and lattice.css is written for
 * this engine, not for Marp. See engineering/marp-independence.md.
 *
 * Mermaid diagrams (```mermaid blocks) are rendered to SVG in an engine-owned
 * Puppeteer page (lib/integrations/mermaid/render-worker.js), with theme variables
 * mapped to the Lattice palette and the engine's own fonts loaded before Mermaid
 * measures a label.
 *
 * Usage:
 *   node lattice-emulator.js <source.md> <output.pdf> [palette]
 *   node lattice-emulator.js <source.md> <custom-layouts.css> <output.pdf> [palette]
 *
 * The bundled `lattice.css` is auto-resolved when no `.css` arg is given;
 * pass an explicit `.css` path only to override the layout engine (rare —
 * for layout-engine development, not deck authoring).
 *
 * Want a copy someone can render with Marp instead? That is a one-way
 * EXPORT, not a render path: `npm run export:marp` (lib/core/marp-bundle.js)
 * produces a self-contained bundle the recipient renders with their own
 * marp-cli. What such a render does and does not reproduce is the ledger in
 * lib/core/marp-fidelity.js.
 */

const fs            = require('fs');
const path          = require('path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const os            = require('os');
const { execSync, execFileSync } = require('child_process');

// Inline each local `logo-wall` mark as a REAL `<svg>` for the export path.
// The logo-marks transform emits `<span class="logo-mark" … style="--logo-mask:
// url('<src>')">` — a CSS `mask` that renders cleanly in a live browser but NOT
// reliably in print-to-PDF (different PDF rasterisers honour the soft-mask
// differently: poppler-splash hairlines the group, cairo drops it and shows a
// solid box). So for the PDF we swap each mask span for the mark's actual SVG
// vector, given the marks authored with `fill="currentColor"`: the inline svg
// inherits `color: var(--logo-ink)` (logo-mark-svg rule), so it's the SAME token
// colour as the preview — robust across every PDF viewer. Local marks only;
// remote (http) / already-inlined (data:) srcs are left as the mask span.
// Order-independent: match an empty `<span>` carrying the `logo-mark` class
// anywhere in its attribute run, and pull `--logo-mask` / `aria-label` out of the
// captured attrs — so a future change to the span's attribute order can't silently
// drop the inline-SVG swap and leave the unreliable mask in the PDF.
const LOGO_MARK_RE = /<span\b([^>]*\sclass="[^"]*\blogo-mark\b[^"]*"[^>]*)><\/span>/g;
function inlineLogoMarkSvg(html, baseFileUrl) {
  if (typeof html !== 'string' || html.indexOf('logo-mark') === -1) return html;
  return html.replace(LOGO_MARK_RE, (whole, attrs) => {
    const urlM = attrs.match(/--logo-mask:url\('([^']*)'\)/);
    if (!urlM || /^(?:data:|https?:)/i.test(urlM[1])) return whole;
    const labelM = attrs.match(/aria-label="([^"]*)"/);
    const label = labelM ? ` aria-label="${labelM[1]}"` : '';
    try {
      const svg = fs.readFileSync(fileURLToPath(new URL(urlM[1], baseFileUrl)), 'utf8')
        .replace(/<\?xml[^>]*\?>/, '').trim();
      return `<span class="logo-mark logo-mark-svg" role="img"${label}>${svg}</span>`;
    } catch {
      return whole;
    }
  });
}

// Package root for sibling-asset lookups (themes/, dist/lattice.css, dist/fonts/,
// the Mermaid render worker). This file runs from two locations: as repo-root
// source (tests, `node lattice-emulator.js`) where __dirname IS the root,
// and as the bundled dist/lattice-emulator.js (the published `bin`) where
// __dirname is <root>/dist. esbuild collapses every bundled module onto the
// output file's __dirname, so a fixed `..` is wrong for the source case —
// walk up to the nearest package.json instead, which lands on the root in
// both layouts (and on the installed package dir for npm consumers).
const PKG_ROOT = (() => {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return __dirname;
})();

// The package version, READ at runtime from PKG_ROOT — never `require`d.
// `require('./package.json')` would look correct, but esbuild treats it as a
// local relative import and inlines the WHOLE manifest into the bundle, so
// dist/lattice-emulator.js carried every dependency range. That made the
// committed bundle byte-stale on any dependency bump — reddening `build:check`
// on a diff no human wrote and no bot could repair, since Dependabot cannot
// run `npm run build`. Only `version` is ever wanted; read just that.
const pkgVersion = () => {
  try { return JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version; }
  catch (_e) { return null; }
};

// ── KaTeX CSS ────────────────────────────────────────────────────────────────
// The engine (lib/engine, created with `mathOutput:'htmlAndMathml'`) renders `$…$` /
// `$$…$$` to KaTeX markup itself; the emulator only links KaTeX's stylesheet so
// the glyph fonts resolve in the PDF. Resolved lazily — absent the optional dep,
// no link is emitted and math degrades to plain text.
// This stylesheet is also what makes the MathML free: it clips `.katex-mathml` out
// of the flow, so the accessible alternative costs no layout and no pixels.
let katexCssAbsPath = '';
try { katexCssAbsPath = require.resolve('katex/dist/katex.min.css'); } catch (_e) { /* no css link emitted */ }

// ── function-plot (math function plotting in math.canvas) ─────────────────
// ```functionplot fences (alias: the deprecated ```latticeplot) carry a JSON
// function-plot config; the build emits a `<div class="functionplot"
// data-fp-config="…">` placeholder that the vendored function-plot UMD bundle
// inflates to an SVG on page load — same
// pre-render-then-PDF flow puppeteer uses for the rest of the deck. The
// library is purpose-built for y=f(x), parametric, polar, implicit, and
// vector-field plots; it parses math.js expressions and skips asymptotes
// cleanly. The export bundle's Marp render and the browser runtime
// (lattice-runtime.js) load the same bundle for path parity.
let functionPlotJsAbsPath = '';
try { functionPlotJsAbsPath = require.resolve('function-plot/dist/function-plot.js'); } catch (_e) { /* no script emitted */ }

// ── Help / version (handled before positional parsing) ─────────────────────
function listAvailablePalettes() {
  try {
    return fs.readdirSync(path.join(PKG_ROOT, 'themes'))
      .filter(f => f.endsWith('.css'))
      .map(f => f.replace('.css', ''))
      .join(', ');
  } catch (_e) { return '(themes/ not readable)'; }
}

function showHelp() {
  console.log(`lattice-emulator — PDF / PPTX / PNG / HTML renderer for Lattice decks

USAGE
  node lattice-emulator.js <source.md> <output.pdf|.pptx|.png|.zip|.html> [palette]
  node lattice-emulator.js <source.md> <custom.css> <output> [palette]

ARGUMENTS
  source.md          Markdown source (required)
  output             Output path (required); the extension picks the format, and an
                     extension that is not on this list is a usage error rather than
                     a PDF under the wrong name (a path with NO extension is still
                     the PDF path — nothing is mislabeled when nothing is labeled):
                       .pdf   vector PDF, selectable text (+ HTML sidecar; or one
                              image per page with --raster)
                       .pptx  PowerPoint, one full-bleed slide image per slide
                       .png   one PNG per slide, written as <output>.NNN.png
                       .zip   an IMAGE SET — a zip of one raster per slide
                              (PNG/JPEG/WebP) plus opt-in thumbnails and
                              standalone chart/diagram SVGs (see IMAGE SET below)
                       .html  the rendered HTML as the DELIVERABLE — no PDF is
                              written. Still a real browser render (auto-split and
                              the overflow/legibility passes measure laid-out DOM,
                              and this file is their post-split result); it only
                              skips the PDF encode
                     For every format EXCEPT .html, an HTML sidecar is written
                     alongside; with .html that sidecar IS the output file.
                     For per-slide JPEG or WebP, ask for a .zip and pass
                     --image-format jpeg|webp — there is no loose .jpg/.webp output.
  custom.css         Optional layout CSS override; if omitted, the bundled
                     lattice.css from the install dir is used
  palette            Palette name (e.g. 'indaco', 'cuoio')

OPTIONS
  -h, --help              Show this help and exit
  -v, --version           Show version and exit
  -o, --output PATH       Output path (alternative to positional output)
  -p, --palette NAME      Palette name (alternative to positional palette)
  -c, --css PATH          Layout CSS override (alternative to positional custom.css)
  -q, --quiet             Suppress non-error progress output
      --notes             Also write a plaintext speaker-notes sidecar
                          (<output>.notes.txt), one block per slide
      --captions          Also write read-along WebVTT caption sidecars from the
                          speaker notes — one deck-level <output>.vtt (continuous
                          timeline) plus per-slide <output>.NN.vtt. Timing is
                          Cadenza's estimate (no audio, no key); honors --strip-notes
                          and --strip-captions
      --no-split          Do NOT paginate an overflowing slide — render it whole
                          and let it ring. INSTRUMENTATION only: a measurement rig
                          needs page N to stay slide N. A deck that means to show
                          overflow marks the slide <!-- stress-slide --> instead
      --strip-notes       Scrub speaker notes from every output copy (the player
                          DOM, the PDF annotations, AND the embedded source) — a
                          shareable file with no speaker text
      --strip-captions    Scrub the read-as caption channel (inline <!-- caption: -->
                          and front-matter captions:) from the .vtt and embedded
                          source — orthogonal to --strip-notes; those slides fall back
                          to the note / auto projection. NOTE: a slide that had BOTH a
                          caption and a note will now narrate the NOTE — add
                          --strip-notes too if the note is also private
      --notes-icon        Show a clickable sticky-note icon on each slide with
                          a note (default: notes are embedded but hidden)
      --fluid             Emit the .html as the opt-in fluid-box VIEWER: each
                          slide fills the viewport and reflows to portrait on a
                          phone (swipe between slides), with a toggle back to the
                          fixed deck. PDF/PPTX/PNG outputs are unchanged. Can also
                          be enabled per-deck with a 'fluid: true' front-matter key.
      --player            Emit the .html as the self-contained PLAYER: a portable,
                          offline, double-clickable file with three views (Present,
                          Read Slides, Read Article), all assets inlined, the slide
                          HTML sanitized under a strict CSP, and the deck source
                          embedded for lossless re-import. Supersedes --fluid. Can
                          also be enabled with a 'player: true' front-matter key.
      --present           Mark the PDF to open directly in full-screen
                          presentation mode (Adobe Acrobat/Reader and most desktop
                          viewers honour this; browser-embedded viewers ignore it
                          harmlessly). Adds a subtle cross-fade between slides;
                          slides stay presenter-driven (no auto-advance). PDF only.
                          Can also be enabled per-deck with a 'present: true'
                          front-matter key.
      --print             Render in PRINT mode: a B&W-safe, ink-on-white band
                          (grayscale + hatch/dot textures for chart & diagram
                          series) for paper handouts, instead of the screen /
                          colour palette. Every text token clears WCAG AA on
                          white. Any output format; also settable per-deck with
                          'color-mode: print'.
      --raster            Print the PDF as one full-bleed slide image per page
                          (2x JPEG, from the same screenshots the PPTX path
                          takes) instead of vector pages. Maximum viewer
                          compatibility; selectable text is lost. Speaker
                          notes, --present, and --embed-source still apply.
                          PDF only.
      --paper <size>      Fit each slide onto a standard sheet — auto | letter |
                          legal | a4 — instead of the default slide-sized page,
                          so the PDF prints correctly on office paper (baked
                          paper MediaBox, 9mm safe margin, fit + centered, never
                          cropped). auto picks the least-wasteful sheet for the
                          deck's aspect (16:9 → US Legal, 4:3 → Letter). This is
                          a raster paper-fit (like the Studio Print drawer);
                          selectable text is lost. PDF only.
      --orientation <o>   auto | landscape | portrait for --paper (auto follows
                          the deck aspect). Implies --paper auto if given alone.
      --embed-source      Attach the deck's Markdown source to the PDF as an
                          embedded file (visible in any viewer's attachments
                          panel), so the deck can be re-rendered from the PDF
                          alone. Note: ships your source (including speaker
                          notes) inside the artifact.
      --overflow-marker <author|reader|off>
                          Who a clipped slide's marker speaks to in the exported
                          artifact. A slide with more content than fits is CLIPPED
                          (not scrollable, not printed), so the export says so
                          rather than losing it quietly. 'reader' (default) draws a
                          calm "Content clipped" tag; 'author' draws the red ring,
                          the "Overflows" flag and the small-type alarm (the
                          per-cell "Fix Me" tags are preview-only — they need the
                          runtime script an export does not carry); 'off' draws
                          nothing, for a deck you have already
                          checked fits. LATTICE_OVERFLOW_MARKER sets a standing
                          default ('off' is per-render only). The overflow warning
                          on stderr is printed at every level.
      --keep-vector-images
                          Keep SVG images as vectors in the PDF. By default SVG
                          <img>/background images are rasterized to 2x PNG at
                          export, because some PDF viewers (iOS Quartz) mishandle
                          the vector constructs Chromium prints for clipped or
                          cropped SVG placements (#690). Inline SVG (Mermaid,
                          charts, logo marks) always stays vector.

  IMAGE SET (.zip output only)
      --image-format <f>  png (default, lossless, perfect fidelity) | jpeg | webp.
                          jpeg/webp are lossy levers for a smaller set; webp is
                          smaller than jpeg at equal quality.
      --image-size <s>    max (default, fidelity-first: 2x for HD, 1x for 4K) |
                          2x | 1x | half. Lower sizes shrink each image and the
                          overall set — the "size selection" lever.
      --image-quality N   Encoder quality 1–100 for jpeg/webp (default 92);
                          ignored for png.
      --image-mode <m>    Color mode for the whole set — inherit (default, the deck's
                          own / palette-resolved) | light | dark | print. light/dark
                          render the palette's light / dark variant; print is the
                          B&W-safe ink-on-white handout mode.
      --svg-background <b>
                          Look for each standalone chart/diagram SVG —
                          inherit (default) | light | dark | print. Controls BOTH
                          the render and the canvas, independent of --image-mode:
                          light/dark render the chart in that scheme; print renders it
                          B&W-safe (grayscale + textures) on white — so you can export
                          color slides but print-ready chart/diagram vectors.
                          inherit follows the slides' color mode, with no canvas.
      --thumb-width N     Thumbnail width in px (default 480); height follows the
                          slide aspect.
      --no-thumbnails     Omit the thumbnails/ folder (thumbnails ship by default).
      --no-svg            Omit the assets/ folder (standalone chart & diagram SVGs
                          ship by default; each opens on its own, fonts embedded).

  Value-taking options accept both --flag value and --flag=value syntax; the
  boolean switches above take no value. Positional args still work; named
  flags take precedence when both are supplied.

SPEAKER NOTES
  A non-directive HTML comment on a slide is that slide's speaker note
  (Marp-faithful; see spec/LFM-1.0.md). Each note is embedded as a per-page PDF
  text annotation and a hidden HTML presenter-notes channel. By default the PDF
  annotation is hidden — the note is embedded and tool-extractable, but no icon
  marks the slide; --notes-icon exposes a clickable sticky note instead. --notes
  additionally writes a plaintext sidecar. Tooling pragmas (markdownlint /
  prettier) are not notes.

PALETTE RESOLUTION (highest precedence first)
  1. CLI palette positional argument
  2. LATTICE_PALETTE environment variable
  3. Deck front-matter \`theme:\` directive
  4. Default 'indaco'

  Available palettes: ${listAvailablePalettes()}

EXIT CODES
  0  Success
  1  Usage error, missing file, palette not found, or render failure

EXAMPLES
  node lattice-emulator.js deck.md out.pdf
  node lattice-emulator.js deck.md out.pptx          # PowerPoint (image slides)
  node lattice-emulator.js deck.md out.png           # → out.001.png, out.002.png, …
  node lattice-emulator.js deck.md out.zip           # image set (PNG + thumbs + SVGs)
  node lattice-emulator.js deck.md out.zip --image-format webp --image-size 1x
  node lattice-emulator.js deck.md out.pdf cuoio
  node lattice-emulator.js deck.md custom-layouts.css out.pdf cuoio
  LATTICE_PALETTE=cuoio node lattice-emulator.js deck.md out.pdf
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(`lattice-emulator ${pkgVersion() ?? ''}`);
  process.exit(0);
}

// Argv parsing — supports both named flags and positional args. The layout
// CSS positional is optional; the bundled `lattice.css` is auto-resolved
// when no .css positional is given.
//
//   node lattice-emulator.js source.md output.pdf [palette]                 # bundled
//   node lattice-emulator.js source.md custom.css output.pdf [palette]      # override
//   node lattice-emulator.js -o out.pdf -p cuoio source.md                  # named flags
//
// Named flags take precedence over positional args when both are given.
function parseArgs(argv) {
  const flags = { quiet: false };
  const positional = [];
  const opts = {
    '-o': 'output', '--output': 'output',
    '-p': 'palette', '--palette': 'palette',
    '-c': 'css', '--css': 'css',
    '--paper': 'paper', '--orientation': 'orientation',
    // Image-set (.zip) tuning — see normalizeImageSetOptions (lib/export/image-set.js).
    '--image-format': 'image-format', '--image-size': 'image-size',
    '--image-quality': 'image-quality', '--thumb-width': 'thumb-width',
    '--image-mode': 'image-mode', '--svg-background': 'svg-background',
    // Who a clipped slide's marker speaks to in THIS render — the same export
    // setting tools/export-marp.js takes (lib/core/resolve-overflow-marker.js).
    '--overflow-marker': 'overflow-marker',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-q' || a === '--quiet') { flags.quiet = true; continue; }
    if (a === '--notes') { flags.notes = true; continue; }
    if (a === '--captions') { flags.captions = true; continue; }
    if (a === '--no-split') { flags['no-split'] = true; continue; }
    if (a === '--strip-notes') { flags['strip-notes'] = true; continue; }
    if (a === '--strip-captions') { flags['strip-captions'] = true; continue; }
    if (a === '--notes-icon') { flags['notes-icon'] = true; continue; }
    if (a === '--fluid') { flags.fluid = true; continue; }
    if (a === '--player') { flags.player = true; continue; }
    if (a === '--present') { flags.present = true; continue; }
    if (a === '--print') { flags.print = true; continue; }
    if (a === '--raster') { flags.raster = true; continue; }
    if (a === '--embed-source') { flags['embed-source'] = true; continue; }
    if (a === '--keep-vector-images') { flags['keep-vector-images'] = true; continue; }
    if (a === '--no-thumbnails') { flags['no-thumbnails'] = true; continue; }
    if (a === '--no-svg') { flags['no-svg'] = true; continue; }
    // --flag=value form
    const eq = a.match(/^(--?[A-Za-z][\w-]*)=(.*)$/);
    if (eq && opts[eq[1]]) { flags[opts[eq[1]]] = eq[2]; continue; }
    // --flag value form
    if (opts[a]) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('-')) {
        console.error(`error: ${a} requires a value`);
        process.exit(1);
      }
      flags[opts[a]] = v;
      i++;
      continue;
    }
    if (a.startsWith('-')) {
      console.error(`error: unknown option: ${a}`);
      console.error('Run with --help to see available options.');
      process.exit(1);
    }
    positional.push(a);
  }
  return { flags, positional };
}

const { flags, positional } = parseArgs(process.argv.slice(2));

// Resolve mdFile + outFile + cssFile + paletteArg from positionals, with
// named flags overriding. Positional shape:
//   [source.md] [output.pdf | custom.css] [output.pdf | palette] [palette]
const mdFile = positional[0];
let cssFile, outFile, paletteArg;
// Did the CALLER supply the layout stylesheet, or did we construct the default? On
// the default path the sheet is `dist/lattice.css` and its name is unambiguously
// `lattice`, so the name is passed rather than searched for. Only a caller-supplied
// sheet has an identity we genuinely cannot know.
let cssIsDefault = false;
if (positional[1]?.endsWith('.css')) {
  cssFile    = positional[1];
  outFile    = positional[2];
  paletteArg = positional[3];
} else {
  cssFile    = path.join(PKG_ROOT, 'dist', 'lattice.css');
  cssIsDefault = true;
  outFile    = positional[1];
  paletteArg = positional[2];
}
// Named flags override positional resolution.
if (flags.css)     { cssFile = flags.css; cssIsDefault = false; }
if (flags.output)  outFile    = flags.output;
if (flags.palette) paletteArg = flags.palette;
const QUIET = flags.quiet;
const NOTES_SIDECAR = !!flags.notes;
const CAPTIONS = !!flags.captions;
// `--strip-notes`: the privacy strip for the self-contained player. Notes ride by
// default (present-from-it), but this scrubs them from EVERY baked copy — the slide
// DOM aside, the PDF text annotation, AND the envelope `source` (design doc §Notes
// on export) — so a shared file leaks no speaker text.
// Instrumentation, not authoring: hold the deck still so a rig can measure it (page N
// must stay slide N). See the AUTOSPLIT comment below.
const NO_SPLIT = !!flags['no-split'];
const STRIP_NOTES = !!flags['strip-notes'];
// `--strip-captions`: the SEPARATE privacy strip for the caption (read-as) channel —
// orthogonal to `--strip-notes`. Notes (what you SAY) and captions (what a slide READS)
// are independent channels, so each has its own strip. This scrubs the author's caption
// OVERRIDES — inline `<!-- caption: -->` AND the front-matter `captions:` map — from the
// baked copies: the read-along `.vtt` (those slides fall back to note → projection) and
// the envelope/attached `source`. Notes and the auto DOM projection are untouched.
const STRIP_CAPTIONS = !!flags['strip-captions'];
// Compose the privacy strips for any re-embedded SOURCE copy (the player envelope, the
// PDF-attached source): scrub note comments under `--strip-notes` and/or caption comments
// under `--strip-captions`. Order-independent — the two comment classes are disjoint (a
// `note:` body is never a `caption:` body). `noteBodies` is the set lifted from the render.
function stripSharedSource(src, noteBodies) {
  let out = src;
  if (STRIP_NOTES) {
    out = notesCore.stripNotesFromSource(out, noteBodies);
    // FAIL-CLOSED. The scrub matches note bodies lifted from the RENDER against comments in
    // the SOURCE, and every leak this has had was a new way for those two sides to disagree.
    // So check the OUTPUT rather than trusting the matcher: a comment still standing that is
    // not a directive, pragma, `describe:` or `caption:` is suspected speaker text that got
    // through. Reported, never silent — a `--strip-notes` export that quietly keeps a note is
    // the one failure the author cannot take back once the file is sent.
    const survivors = notesCore.auditStrippedSource(out);
    if (survivors.length) {
      console.warn(
        `  WARNING: --strip-notes left ${survivors.length} comment(s) in the embedded source that look like speaker text.\n` +
          // Wide enough for the whole line a survivor carries. A survivor is not always just
          // a body: the audit appends WHY it is reported (a directive the engine consumed, an
          // unterminated comment), and a 70-column cut landed mid-explanation — leaving the
          // author the alarm without the half that says what to do about it.
          survivors.slice(0, 3).map((s) => `    · ${s.replace(/\s+/g, ' ').slice(0, 160)}`).join('\n') +
          (survivors.length > 3 ? `\n    · …and ${survivors.length - 3} more` : '')
      );
    }
  }
  if (STRIP_CAPTIONS) out = notesCore.stripCaptionsFromSource(out);
  return out;
}
const {
  OVERFLOW_MARKER_LEVELS, isKnownOverflowMarker,
} = require('./lib/core/resolve-overflow-marker');
const { resolveExportOverflowMarker } = require('./lib/core/marp-bundle');
const { exportSettingsBlock } = require('./lib/core/export-settings');
const { readClassAttr } = require('./lib/core/section-walk');
const NOTES_ICON = !!flags['notes-icon'];
const EMBED_SOURCE = !!flags['embed-source'];
const KEEP_VECTOR_IMAGES = !!flags['keep-vector-images'];
// Who the overflow marker in the printed artifact is addressed to. Same setting,
// same kernel and same precedence as the Marp exporter — `--overflow-marker` for
// this render, `LATTICE_OVERFLOW_MARKER` as the standing answer, else `reader`.
//
// This path used to be hard-wired to the equivalent of `off`: it stripped every
// marker and warned the author on stderr. That was defensible on its own, but it
// made the setting one that the PRIMARY export did not read — so `--overflow-marker=author`
// silently did nothing in a PDF, and a clipped slide in the most-used artifact went
// out looking finished while the same deck exported to Marp said "Content clipped".
// engineering/decisions/2026-07-30-overflow-marker-register.md
const OVERFLOW_MARKER = resolveExportOverflowMarker({
  chosen: typeof flags['overflow-marker'] === 'string' ? flags['overflow-marker'] : null,
  workspace: process.env.LATTICE_OVERFLOW_MARKER ?? null,
});
if (flags['overflow-marker'] !== undefined && !isKnownOverflowMarker(flags['overflow-marker'])) {
  console.error(`lattice: --overflow-marker must be one of ${OVERFLOW_MARKER_LEVELS.join(', ')}`);
  process.exit(1);
}
for (const bad of OVERFLOW_MARKER.ignored) {
  const where = bad.tier === 'this export' ? '--overflow-marker' : 'LATTICE_OVERFLOW_MARKER';
  console.warn(`  ⚠ ${where}='${bad.value}' ignored — ${bad.reason || 'not a known level'}.`);
}
// PRESENT is resolved below, once the deck front matter is parsed (it can be
// enabled by `--present` OR a `present: true` front-matter key, mirroring --fluid).
// FLUID_VIEW is resolved below, once the deck front matter is parsed (it can be
// enabled by `--fluid` OR a `fluid: true` front-matter key).

if (!mdFile || !outFile) {
  console.error('Usage:');
  console.error('  node lattice-emulator.js source.md output.pdf [palette]               # bundled lattice.css');
  console.error('  node lattice-emulator.js source.md custom.css output.pdf [palette]    # explicit layout CSS');
  console.error('  node lattice-emulator.js [-o out.pdf] [-p palette] [-c css] source.md # named flags');
  console.error('');
  console.error('Run with --help for full options. Default palette: indaco.');
  process.exit(1);
}

// Output format is driven by the output extension: `.pptx` → image-per-slide
// PowerPoint (owned, via pptxgenjs), `.png` → one PNG per slide (`<base>.NNN.png`),
// `.zip` → an IMAGE SET (a zip of one raster per slide — PNG/JPEG/WebP — plus opt-in
// thumbnails and standalone chart/diagram SVGs), `.html` → the rendered HTML as the
// DELIVERABLE (no PDF at all), `.pdf` → the vector, selectable-text path. PPTX/PNG/
// the image set are rasterized from the same headless-Chromium render the PDF uses,
// so every format is byte-for-byte the same pixels.
//
// THE TABLE IS CLOSED, and that is the whole point of it being a table. It used to end
// in `: 'pdf'`, so ANY unrecognized extension rendered a PDF and wrote it under the name
// the caller asked for: `lattice deck.md out.webp` produced a file whose bytes `file(1)`
// reads as "PDF document" and whose name says WebP. `.webp`/`.jpeg` are the ones that
// actually get asked for — they ARE supported formats, via `--image-format` inside a
// `.zip` — so the refusal below names that route rather than a bare list of extensions.
// A format is added by adding a row here, never by a caller guessing an extension.
const OUT_EXT = path.extname(outFile).toLowerCase();
//
// `.html` used to fall through to 'pdf', which wrote PDF BYTES INTO A FILE NAMED
// `.html` and put the real HTML in a second `<out>.html.html` — a silently
// mislabeled file, because the sidecar name is derived by stripping the output
// extension and appending `.html`. It is a first-class format now rather than a
// rejected extension: the HTML sidecar was always a real artifact of every render,
// so the only thing missing was a way to ask for it WITHOUT paying `page.pdf`.
//
// This is NOT a browser-free path and must not be sold as one. The deck still
// renders in Chromium — the auto-split, overflow and legibility passes measure laid-out
// DOM, and the HTML written here is the post-split result of those passes, which is
// exactly what makes it worth having. What it skips is the PDF encode (plus the
// PDF-only SVG rasterize pass): 2.3% of a 1-slide render and 15% of a 58-slide one,
// so the whole-run saving is ~18% on a large deck and UNDER 1% on a one-slide
// fixture, where browser startup dominates. Do not pick this format for speed on a
// small deck — there is none
// (engineering/decisions/2026-08-16-render-format-cost-assessment.md). For markup
// without layout, call `lib/engine` directly instead — that IS browser-free, and it
// is a different coverage tier, not a faster version of this one.
const OUT_FORMATS = Object.freeze({
  '.pdf': 'pdf',
  '.pptx': 'pptx',
  '.png': 'png',
  '.zip': 'imageset',
  '.html': 'html',
});
// The lossy image formats the image-set encoder DOES speak — just not as a loose
// per-slide output. A caller who typed one meant "one image per slide in this format",
// so the error hands them the command that does exactly that.
const IMAGE_SET_EXTS = Object.freeze({ '.webp': 'webp', '.jpeg': 'jpeg', '.jpg': 'jpeg' });
// NO extension is NOT an unknown format — it is the sidecar idiom, and it stays PDF.
// `lattice deck.md .scratch/out/player-input --player` is how this repo's own player
// verifiers render (tools/verify-player-input.mjs, tools/verify-narrated-player.mjs):
// the deliverable is the `<out>.html` sidecar, the PDF is a byproduct nobody opens, so
// the output path deliberately carries no extension. Nothing is mislabeled there —
// there is no label — which is the whole difference from `out.webp`. Refusing it broke
// all three call sites, and they are the committed HARD RULE #23 evidence for the
// exported player, so a refusal here costs a verification surface and buys nothing.
const OUT_FORMAT = OUT_EXT ? OUT_FORMATS[OUT_EXT] : 'pdf';
if (!OUT_FORMAT) {
  // Report the extension AS TYPED. OUT_EXT is lowercased for the lookup, and telling
  // someone who typed `out.WEBP` that '.webp' is unsupported invites the reply "I did
  // not write that".
  const typed = path.extname(outFile);
  console.error(`error: unsupported output extension '${typed}' — lattice writes ${Object.keys(OUT_FORMATS).join(', ')}.`);
  const asImageSet = IMAGE_SET_EXTS[OUT_EXT];
  if (asImageSet) {
    // The command has to run AS PRINTED, so both paths keep the form the caller gave —
    // a basename would resolve against the cwd and quietly mean a different file.
    console.error(`  ${asImageSet.toUpperCase()} slides ship as an image set — one image per slide in a zip:`);
    console.error(`    lattice ${mdFile} ${outFile.slice(0, -typed.length)}.zip --image-format ${asImageSet}`);
  }
  process.exit(1);
}
// Image-set tuning, normalized to a complete config (defaults = perfect-fidelity PNG,
// thumbnails on, SVG extraction on). Resolved even for non-imageset outputs — it is
// inert there. Undefined flags fall through to the kernel's DEFAULTS.
const { normalizeImageSetOptions, resolveRasterScale, resolveThumbScale, svgBackgroundFill, svgLookMode, dpiFor, embedRasterDpi, KEYED_CHART_LAYOUTS } = require('./lib/export/image-set');
const IMAGE_SET_OPTS = normalizeImageSetOptions({
  format: flags['image-format'],
  size: flags['image-size'],
  quality: flags['image-quality'] !== undefined ? Number(flags['image-quality']) : undefined,
  thumbnails: flags['no-thumbnails'] ? false : undefined,
  thumbWidth: flags['thumb-width'] !== undefined ? Number(flags['thumb-width']) : undefined,
  extractSvg: flags['no-svg'] ? false : undefined,
  mode: flags['image-mode'],
  svgBackground: flags['svg-background'],
});
// THE CORNER'S EXPORT TARGET. A rounded corner is a hole the artifact has to be able to
// hold — an alpha channel, or a live document whose host paints behind it. `.zip` is the
// only output whose capability depends on a flag, because the image format IS the choice
// (png/webp carry alpha, jpeg has no such channel). Everything else is fixed by the
// container. The capability table and the per-format measurements live in
// lib/core/corner-export-capability.mjs — NOT in resolve-corners.js, which answers the
// different question of what the DECK asked for.
const { cornerSurvivesExport, isFlatExportTarget } = require('./lib/core/corner-export-capability.mjs');
const CORNER_TARGET = OUT_FORMAT === 'imageset' ? IMAGE_SET_OPTS.format : OUT_FORMAT;
const CORNER_SURVIVES = cornerSurvivesExport(CORNER_TARGET);
// --raster swaps the PDF's vector page content for one full-bleed slide image
// per page (the same 2× screenshots the PPTX path uses) — a maximum-compatibility
// mode for viewers that mishandle vector constructs. Selectable text is lost, so
// it is opt-in; the vector path stays the default. PDF only: PPTX/PNG are raster
// by construction, so the flag is meaningless (and warned) there.
const RASTER_PDF = !!flags.raster && OUT_FORMAT === 'pdf';
if (flags.raster && OUT_FORMAT !== 'pdf') {
  // Two different reasons the flag is meaningless here, and the old message asserted
  // the wrong one for `.html` ("already image-per-slide" — it has no images at all).
  const why = OUT_FORMAT === 'html' ? 'a .html render has no page raster' : `a .${OUT_FORMAT} is already image-per-slide`;
  console.warn(`  ⚠ --raster applies only to .pdf output (${why}) — ignoring.`);
}

// --paper / --orientation: fit the deck onto a standard sheet (US Letter / Legal / A4)
// instead of the default slide-sized MediaBox, keeping the PDF VECTOR (selectable text).
// `auto` picks the least-wasteful sheet + orientation for the deck's aspect — the same
// decision the Studio Print drawer makes, via the shared kernel (lib/core/print-sheet.mjs,
// HARD RULE #1). PDF only (the raster/PPTX/PNG paths are full-bleed image-per-slide).
const PAPER_CHOICES = ['auto', 'letter', 'legal', 'a4'];
const ORIENT_CHOICES = ['auto', 'landscape', 'portrait'];
const PAPER = flags.paper ? String(flags.paper).toLowerCase() : null;
const ORIENTATION = flags.orientation ? String(flags.orientation).toLowerCase() : null;
if (PAPER && !PAPER_CHOICES.includes(PAPER)) {
  console.error(`error: --paper must be one of ${PAPER_CHOICES.join(' / ')} (got "${flags.paper}")`);
  process.exit(1);
}
if (ORIENTATION && !ORIENT_CHOICES.includes(ORIENTATION)) {
  console.error(`error: --orientation must be one of ${ORIENT_CHOICES.join(' / ')} (got "${flags.orientation}")`);
  process.exit(1);
}
// Orientation without paper still fits the slide to a sheet (auto-picks the paper).
const PAPER_FIT = !!(PAPER || ORIENTATION);
if (PAPER_FIT && (OUT_FORMAT !== 'pdf' || RASTER_PDF)) {
  console.warn(`  ⚠ --paper/--orientation apply only to the vector .pdf export — ignoring for ${RASTER_PDF ? '--raster PDF' : `.${OUT_FORMAT}`}.`);
}
// --present writes PDF catalog hints. Scoped to `.html` deliberately: before this
// change `deck.md out.html --present` produced a (mislabeled) PDF that DID carry the
// hints, so going silent on that combination is a regression THIS change introduces,
// and it gets the warning. `--present` with .png/.pptx/.zip was already silently
// ignored and is left alone — off-path pre-existing behavior, not this diff's to
// widen (HARD RULE #18). The warning itself lives further down, next to PRESENT's
// definition: it must fire for the front-matter `present: true` form too, and the
// front matter is not parsed yet here.

// Friendly error wrapper for file reads. Bare ENOENT throws produce
// stack traces that look like crashes; this surfaces them as one-line
// errors with exit code 1.
/**
 * Read a text file, and NORMALIZE ITS LINE ENDINGS TO LF at this boundary.
 *
 * This is the CLI's only door for author-supplied text, so it is where the house LF
 * convention is enforced rather than in each of the ~55 readers downstream. `\r\n?` covers
 * Windows CRLF and classic-Mac lone CR in one pattern, at no extra cost over `\r\n`.
 *
 * WHY HERE AND NOT IN `render()`. A CRLF deck used to export in the DEFAULT PALETTE,
 * silently: `resolvePalette` is called on this raw string BEFORE and OUTSIDE the engine's
 * `render()`, so normalizing inside the engine would not have caught it (#1349). The
 * boundary has to be the read.
 *
 * Byte-safe for anything already LF — the replace is a no-op, so no committed deck's export
 * changes. It changes output only for a CRLF file, which is the file that was rendering
 * wrong. Palette CSS goes through here too; CSS is whitespace-insensitive, so that is inert.
 */
function readFileOrDie(p, label) {
  try {
    return fs.readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  } catch (e) {
    if (e.code === 'ENOENT') console.error(`error: ${label} not found: ${p}`);
    else if (e.code === 'EACCES') console.error(`error: ${label} not readable (permission denied): ${p}`);
    else console.error(`error: failed to read ${label} (${p}): ${e.message}`);
    process.exit(1);
  }
}

const mdRaw = readFileOrDie(mdFile, 'source markdown');
// PRINT canvas is stamped by `--print` OR by an image set's `--image-mode print`
// (one `color-mode: print` path, so the whole set renders the B&W-safe handout).
// The source transform lives in the kernel (lib/core/resolve-color-mode.js) so it
// is testable as behavior and so the permutation gate can drive this axis exactly
// as the CLI does.
const {
  withPrintColorMode, deckColorModeToken, classTokens,
} = require('./lib/core/resolve-color-mode');
const { frontMatterValue } = require('./lib/core/front-matter-key');
const { PALETTE_END_MARK } = require('./lib/core/export-shell-marks');
const WANT_PRINT = flags.print || (OUT_FORMAT === 'imageset' && IMAGE_SET_OPTS.mode === 'print');
const md = WANT_PRINT ? withPrintColorMode(mdRaw) : mdRaw;

// A REFUSED deck-wide `class:` token says so HERE, not only in `lint:deck`.
//
// The register drops a component name outright, and a color token superseded by
// `color-mode:` — both silently, at the boundary, by design. That is the right
// place for the FILTER and the wrong place for the only notice: the person whose
// deck changed shape is rendering it, not linting it, and a deck that used to
// carry `class: kpi` on every slide now renders as prose with a successful exit
// code. One line on stderr is the difference between a breaking change and a
// mysterious one. The linter says the same thing with a fix (`deck-wide-component`).
const { deckClassRefusalsFromFrontMatter } = require('./lib/core/deck-class-register');
const { frontMatterBody: deckFrontMatterBody } = require('./lib/core/resolve-color-mode');
for (const { token, reason } of deckClassRefusalsFromFrontMatter(deckFrontMatterBody(md))) {
  console.error(reason === 'component'
    ? `warning: deck-wide \`class: ${token}\` names a COMPONENT — it is ignored (every slide would be a ${token} slide). Name it per slide with <!-- _class: ${token} -->, or once for a run with <!-- class: ${token} -->.`
    : `warning: deck-wide \`class: ${token}\` is superseded by \`color-mode:\` — it is dropped, not merged. Remove it from the class list.`);
}

// Resolve palette name from the precedence chain (CLI > env > front
// matter > default). Logic lives in lib/resolve-palette.js so it can
// be unit-tested in isolation; see test/unit/palette-resolution.test.js.
const { resolvePalette } = require('./lib/core/resolve-palette');
// THE theme graph, from the manifests — never re-derived from the stylesheets.
const { themeChain, flattenCssImports } = require('./lib/theme/chain.mjs');
const { THEME_EDGES } = require('./lib/theme/edges.generated.mjs');
// Which band does a slide's diagram bake for — light, dark, or print. Lives in
// the kernel so it is unit-testable as BEHAVIOR rather than as a source-text
// assertion on this CLI. THIS PATH IS ITS ONLY CALLER — the preview reads tokens
// through getComputedStyle, so CSS inheritance hands it the band implicitly and it
// never resolves one. See lib/core/diagram-band.js.
const { resolveDiagramBand } = require('./lib/core/diagram-band');
// The look question, the band question's sibling — same inputs, same per-slide walk.
// See lib/core/diagram-look.js for why it is decided HERE and not in CSS.
const { resolveDiagramLook, resolveDiagramHandType, paletteUsesTextureChannel } = require('./lib/core/diagram-look');
// Hoisted ABOVE the mermaid pre-pass, which runs at module-evaluation time. Declared with
// the other font plumbing further down, these were in the TDZ when `warnOnUnloadedFaces`
// fired — the same trap `escAttrLocal` documents a few hundred lines below, and it
// surfaced the same way: a misleading "Mermaid render failed" for a bug in our own code.
const { fontFaceCss } = require('./lib/fonts/face-css.js');
const { TEXT_FACES } = require('./lib/fonts/text-faces.js');
// THE diagram render kernel — it walks the deck and calls this path back (#1332
// step 4, HARD RULE #1). This path supplies a token reader and a renderer; it
// decides no policy.
const { renderDiagrams } = require('./lib/core/render-diagrams');
// Which slide a byte of source belongs to, and what `_class:` that slide declared —
// from the engine's OWN boundaries rather than a scan of everything before the fence
// (#1329).
const { slideClassSpans, slideClassAt, slideIndexAt } = require('./lib/core/slide-class-spans');
const { CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR, IGNORED_BEARER_SELECTOR, PROBE_SRC, CONTENT_CLIPPED_SRC, LEGIBILITY_SRC, FIGURE_TEXT_FLOOR_RATIO } = require('./lib/core/overflow-probe');
const { SETTLE_FONTS_SRC } = require('./lib/core/font-settle');
const { ROUGH_INK_STRUCTURES, pathsForPlan } = require('./lib/core/rough-ink');
const { MEASURE_ROUGH_INK_SRC, PAINT_ROUGH_INK_SRC } = require('./lib/core/rough-ink-dom');
// HARD RULE #22, STYLESHEET channel. Every `<style>` this file writes carries CALLER CSS
// — the `--css` layout sheet and the palette file are caller-supplied by construction,
// and a deck's own front-matter `style:` block rides in the same element. A `<style>`'s
// content is HTML RAWTEXT: it ends at the first `</style`, from inside a well-formed CSS
// comment or string just the same, and everything after it is parsed as MARKUP. In the
// emitted `.html` and in `--player` that markup ships to whoever opens the file (a
// `<link rel=stylesheet>` becomes a beacon in every copy); in the render page it runs in
// the browser this process drives. The guard escapes ONLY the element terminator, is
// idempotent, and returns its input BY IDENTITY when there is nothing to escape — which
// is every real stylesheet, so exported bytes are unmoved. `require()` of an `.mjs` is
// native on this repo's pinned engines (>=22.12) and the house idiom here (leading-is.js,
// comment-directive.js, boundary-parser.js, math-block-rule.js all do it).
// See engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md.
const { sanitizeStyleText } = require('./lib/core/sanitize-style-text.mjs');
// Pin /CreationDate + /ModDate on the way out, so re-rendering an unchanged deck
// writes byte-identical bytes and git stores nothing new (HARD RULE #1: both PDF
// write sites below call the one kernel).
const { pinPdfTimestamps, pinPdfLibDates } = require('./lib/core/pdf-timestamps');
const {
  OVERFLOW_TAB_TEXT_SRC,
  LEGIBILITY_TAB_TEXT_SRC,
} = require('./lib/runtime/fluid-view-policy');
const fitBerth = require('./lib/core/fit-berth');
const { BERTH_SRC } = fitBerth;
// An image set's `--image-mode light|dark` forces the palette's light / dark variant
// (the same `<name>-dark` companion the Studio's dark export picks — HARD RULE #1),
// on top of the normal precedence chain. `inherit`/`print` leave the resolved name alone
// (print rides the color-mode:print stamp above, palette-independent). A missing dark
// companion falls back to the base name with a warning rather than a hard error.
function applyImageModePalette(name) {
  if (OUT_FORMAT !== 'imageset') return name;
  const base = name.replace(/-dark$/, '');
  if (IMAGE_SET_OPTS.mode === 'light') return base;
  if (IMAGE_SET_OPTS.mode === 'dark') {
    const dark = `${base}-dark`;
    if (fs.existsSync(path.join(PKG_ROOT, 'themes', `${dark}.css`))) return dark;
    console.warn(`  ⚠ --image-mode dark: no dark companion 'themes/${dark}.css' — rendering '${base}' as-is.`);
    return base;
  }
  return name;
}
const paletteName = applyImageModePalette(resolvePalette({ md, cliArg: paletteArg }).name);
// The a11y-* palettes are first-class themes (pick `theme: a11y-deuteranopia`
// like any theme). Their categorical fills reference texture <pattern> <defs>
// — SVG markup CSS can't hold — so emit them on every render. They're inert
// unless an a11y theme's CSS references them, so there's no palette-name gate;
// this matches the Drawing Board's always-on injection (drawing-board.astro).
const a11yTextureDefs = require('./lib/core/accessibility-textures').texturePatternDefs();
const THEMES_DIR   = path.join(PKG_ROOT, 'themes');
const palettePath = path.join(THEMES_DIR, `${paletteName}.css`);
if (!fs.existsSync(palettePath)) {
  console.error(`error: palette not found: ${paletteName}`);
  console.error(`       (looked in ${palettePath})`);
  console.error(`available palettes: ${listAvailablePalettes()}`);
  process.exit(1);
}
// THE theme chain, from the manifest. `themes/<name>.manifest.json` declares the
// parent as `extends`; the CSS also says `@import 'parent'`, but that copy is
// MARP's — Lattice reads the manifest and never parses the stylesheet for it.
//
// This replaces a hand-rolled flattener with its OWN `@import` regex, the third
// such resolver in the repo. They had already drifted: the engine's copy was
// fixed to match a minified `@import"indaco"` (no space) and this one never was,
// so a minified palette silently lost its parent here while resolving correctly
// everywhere else. Proven a byte-for-byte drop-in across all 32 palettes.
// See engineering/decisions/2026-08-16-manifest-is-the-theme-contract.md.
const themeChainFor = (name) => themeChain(name, THEME_EDGES);
// Parent-first, so a child's `:root` overrides its parent at equal specificity —
// the cascade order every palette is authored against.
const paletteChain = themeChainFor(paletteName);
const paletteFiles = paletteChain.map((n) => path.join(THEMES_DIR, `${n}.css`));

const paletteCSS = paletteFiles.map((f) => readFileOrDie(f, `palette '${path.basename(f, '.css')}'`)).join('\n');
// Does this deck's palette carry its categories by PATTERN rather than hue?
// Read from the IMPORT-RESOLVED palette, so an `a11y-*` variant inherits the
// answer from `a11y-base` — a theme allowlist here would rot the first time a
// palette adopted the channel. Gates the hand-drawn diagram look: the texture
// IS the redundant encoding, and it cannot survive rough.js's stroked hachure
// (lib/core/diagram-look.js rule 1).
const PALETTE_USES_TEXTURE = paletteUsesTextureChannel(paletteCSS);
// The layout sheet is CALLER-SUPPLIED (`--css` / the positional form, both documented
// in the usage text above), so it has no manifest and its graph can only come from its
// own bytes. The default `dist/lattice.css` declares no theme-name import, but a custom
// sheet may — dropping to a plain read here silently stopped inlining it, which the
// adversarial trio caught as a real regression. One named helper, not a fourth regex.
const layoutCSS  = flattenCssImports(cssFile, {
  read: (f) => readFileOrDie(f, 'layout CSS'),
  resolve: (from, name) => path.join(path.dirname(from), `${name}.css`),
  exists: fs.existsSync,
});
// THE CASCADE, in the order every theme declares it (#1527). The engine sheet
// FIRST, the palette chain LAST, so a palette's `:root` beats the base's at equal
// specificity — which is exactly what `@import 'lattice';` at the top of every
// theme file means, and what `loadPaletteWithImports` strips out before we get here.
//
// This file held the opposite order for the whole life of the export path, and it was
// the ONLY one of four sites that did: the Mermaid token reader below parses
// `layoutCSS + paletteCSS` and cites the `@import` rationale in as many words,
// `engine.addThemes` hands the layout first, and `lib/engine`'s `composeCss` inlines
// the base AT the theme's own `@import` position. So a deck looked one way in the
// Playground and another in the PDF it exported, on all 32 themes — 925 palette
// declarations across 37 tokens resolved to the base's value on this path and painted
// nothing the palette's author wrote. Measured, swept and signed off across every theme
// in both modes before it moved: engineering/decisions/2026-08-10-palette-concat-order.md,
// 2026-08-11-palette-concat-signoff.md, 2026-08-24-palette-cascade-flip.md.
//
// PALETTE_END_MARK closes the palette region for `tools/palette-sweep.js`, which
// overwrites that exact byte range in a rendered deck to re-theme it in place. Before
// the flip the region was bounded by the two sheets' own opening banners; with the
// palette last there is no banner after it, and a sweep that guessed the end would be
// measuring a hybrid. The sentinel is emitted here, beside the concat it describes.
const css = layoutCSS + '\n' + paletteCSS + '\n' + PALETTE_END_MARK + '\n';

// ── The TWO front-matter readers, defined once (HARD RULE #1) ─────────────
// This file used to carry four hand-written copies of "match the front matter" and three of
// "read `size:`", and they did not agree. Two divergences were real, both found by adversarial
// review on #1234, and both landed on the SPLIT GATE — which decides its answer from the deck's
// geometry, so a reader that mis-reads `size:` sends the gate to the wrong box:
//
//   · CRLF. Two copies matched `/^---\n/`, LF only, while `lib/authoring/lint-core.js` and two
//     other readers in THIS file already used `\r?\n`. A deck saved with CRLF line endings has
//     front matter that the marpit engine parses fine — so the engine stamped `data-family="tall"`
//     for `size: story` while this file saw NO front matter at all, defaulted to `hd`, and
//     rendered tall-family CSS into a 1280x720 landscape page with the content clipped. Every
//     other directive (`theme:`, `color-mode:`, `style:`, `fluid:`) was silently dropped with it.
//   · A trailing YAML comment. `size: story # phone` is legal YAML and the value is `story`, but
//     a `$`-anchored value pattern rejects the whole line and falls back to `hd`, while lint's
//     prefix-matching copy accepted it — so lint promised a split the engine would not perform.
//
// `\r?\n` on both sides, and the value pattern tolerates the comment and the `.` that lint has
// always allowed. Strictly a superset of what these matched before: no LF deck changes.
const FRONT_MATTER_RE   = /^---\r?\n[\s\S]*?\r?\n---/;
const SIZE_DIRECTIVE_RE = /^\s*size:\s*["']?([\w:/.-]+)["']?\s*(?:#.*)?$/m;

// ── Fail fast on an unknown `size:` directive (#502) ──────────────────────
// A typo'd size name (`size: storyy`) otherwise resolves SILENTLY to the hd
// default: the deck renders at the wrong geometry with no signal, and a
// degenerate value can wedge the render. Validate the EXPLICIT directive against
// the engine's size registry and error at config time — before any Chrome work —
// listing the valid names. No directive → hd default, unchanged. Front-matter-
// scoped so a `size:` in prose / a code block can't trip it.
//
// Reads lib/engine/sizes.js, the same table `resolveSize` resolves against, so
// the CLI cannot accept a name the renderer would not honour or reject one it
// would. This used to parse `@size` out of the loaded stylesheets — which meant
// the guard was only as good as whichever sheet happened to carry the table, and
// it silently disabled ITSELF (`knownSizes.size &&`) when none did. See
// engineering/decisions/2026-08-16-size-registry-ownership.md.
const { SIZES, isRegisteredSize } = require('./lib/engine/sizes');
const _mdFmMatch  = md.match(FRONT_MATTER_RE);
const _mdFm       = _mdFmMatch ? _mdFmMatch[0] : '';
const explicitSize = (_mdFm.match(SIZE_DIRECTIVE_RE) || [])[1];
if (explicitSize && !isRegisteredSize(explicitSize)) {
  console.error(`error: unknown size: ${explicitSize}`);
  console.error(`available sizes: ${Object.keys(SIZES).sort().join(', ')}`);
  process.exit(1);
}

// ── Mermaid renderer ─────────────────────────────────────────────────────────
// Two surfaces wire the rendered SVG to the active palette:
//
//   1. themeVariables.  Mermaid inlines a handful of values into the SVG
//      as attributes (gradient stops, gantt grid lines, marker fills).
//      CSS can't reach those — they must come from this map. The map below
//      is structural metadata; values come from the active palette's
//      --diagram-* / --cat-* / --text-* tokens.
//
//   2. lattice.css "DIAGRAM OVERRIDES" section.  Per-diagram CSS
//      (`section .section-N rect { fill: var(--cat-3-fill) }` and so
//      on) that target classes Mermaid emits but doesn't theme. Loaded as
//      a normal page stylesheet via lattice.css; the rendered SVG is
//      embedded inline in the host HTML, so the host stylesheet cascades
//      onto it at PDF-rasterize time — same mechanism the runtime preview
//      already uses. No Mermaid `themeCSS` init parameter is used.
//
// See engineering/decisions/2026-05-12-diagram-tokens.md for the architecture.

// ── Mermaid theme variables — structural map only ───────────────────────
// THE map lives in lib/core/mermaid-theme-map.js, imported by this path and by
// the runtime (#1332 step 2, HARD RULE #1). It used to live HERE, with a second
// copy in lib/runtime/index.js kept in sync by comment; the two held the same 166
// slots but 38 different VALUES. They are now one object, so a key exists on both
// paths or on neither, and there is one set of values.
//
// The map names which Mermaid theme variable corresponds to which CSS custom
// property in the active palette. The CSS variables hold the actual hex values;
// the map is structural and unchanging across palettes, so adding a palette
// means declaring the same custom properties in themes/<n>.css — never editing
// the map.
//
// The `%%{init}%%` reconciliation kernel (#1311) — how the engine palette and an
// author's own directive coexist, shared with the runtime (HARD RULE #1).
// Required HERE, above the first use: the mermaid pre-pass runs during module
// evaluation, so everything it reaches for must already be bound (the same
// hazard the local escapeHtml below works around).
const { engineInitConfig, authorPinsTheme } = require('./lib/integrations/mermaid/init-directive');
const { buildDiagramTheme } = require('./lib/core/mermaid-theme-map');


// Offline value evaluator shared with the unit tests — var()/light-dark()/
// color-mix() → literal, the offline twin of getComputedStyle. See
// lib/core/resolve-token-expr.js.
const { resolveTokenExpr } = require('./lib/core/resolve-token-expr');

// ── Resolver: parses CSS custom properties from the palette file ─────────
// Walks every :root { ... } block and extracts --variable-name: <value>,
// then resolves each value with resolveTokenExpr() (var()+fallback,
// light-dark(), color-mix()). Returns a flat map suitable for feeding
// Mermaid themeVariables (which expects literal colors, not CSS expressions).
function parsePaletteVars(paletteCSSContent, forceDark) {
  // Strip CSS comments first so doc blocks containing example strings
  // like `":root{color-scheme:dark}"` don't break the :root brace matcher.
  const stripped = paletteCSSContent.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  const rootBlocks = stripped.match(/:root\s*\{[^}]*\}/g) || [];
  for (const block of rootBlocks) {
    const decls = block.match(/--[a-z0-9-]+\s*:\s*[^;]+/gi) || [];
    for (const d of decls) {
      const m = d.match(/--([a-z0-9-]+)\s*:\s*(.+)$/i);
      if (m) vars[m[1]] = m[2].trim();
    }
  }
  // Determine the palette's effective color-scheme. Mermaid renders in an
  // isolated SVG context, so `light-dark()` cannot resolve dynamically per
  // viewer; we collapse it now to whichever side matches what the deck is
  // declared as. Dark variants (e.g. cuoio-dark.css) declare
  // `color-scheme: dark` at :root; everything else is treated as light.
  // `forceDark` collapses to the dark branch regardless — used by the
  // dual-render path to bake a second, dark-scheme SVG for section.dark slides.
  const isDark = forceDark || /:root\s*\{[^}]*color-scheme\s*:\s*dark\b/.test(stripped);
  // Resolve every declaration against the RAW map with the recursive
  // evaluator. Order-independent, unlike the former "collapse light-dark,
  // then chase one-level var()" passes — those could not follow a chained
  // token (var(--cat-1-fill) → light-dark() → hex, or one token pointing at
  // another) nor evaluate color-mix(). resolveTokenExpr reads from the raw map
  // so chained var()s resolve regardless of declaration order.
  const resolved = {};
  for (const k of Object.keys(vars)) resolved[k] = resolveTokenExpr(vars[k], vars, isDark);
  return resolved;
}

// ── Build the Mermaid themeVariables object from the map + CSS vars ──────
// This path's half of the port (lib/core/mermaid-theme-map.js): read one token
// out of the OFFLINE-resolved palette. The render worker is a separate process, so
// there is no live DOM to ask — `parsePaletteVars` has already collapsed light-dark() and
// chased every var() chain to a literal for the scheme being baked.
//
// The MISS POLICY is this path's too, and it is not cosmetic: a build-log
// warning is how a palette gap becomes visible at all here.
//
// The sentinel DOES ship. `prune()` in the directive kernel drops only EMPTY
// strings, and '#000000' is not one — so a palette missing a `--cat-*` token
// paints that element literally black in the export rather than falling back to
// a Mermaid default. The warning above is the only signal. That is unchanged
// behavior, and `mermaid-var-map.test.js` gates every token the map reads
// against every self-declaring palette, so a gap should never reach a render;
// the sentinel is the backstop, not a safety net.
function readPaletteToken(paletteVars, name) {
  const val = paletteVars[name];
  if (!val) {
    console.warn(`  ⚠ Palette missing CSS variable: --${name}`);
    return '#000000';
  }
  return val;
}

function resolveMermaidThemeVars(paletteVars, hand = false) {
  return buildDiagramTheme((name) => {
    // Same sketch re-point `readScopeToken` applies, against a palette handed in
    // rather than one selected by band — the image-set look re-bake parses a
    // DIFFERENT theme file, so it cannot go through the band reader. Stated in both
    // places would be two answers; `readScopeToken` delegates the lookup and this
    // repeats only the one-line table read.
    const repoint = hand ? SKETCH_TOKEN_REPOINTS[name] : undefined;
    if (repoint && paletteVars[repoint]) return readPaletteToken(paletteVars, repoint);
    return readPaletteToken(paletteVars, name);
  });
}

// Parse the combined cascade (layoutCSS first, then paletteCSS) so the
// universal semantic palette defaults declared in lattice.css are visible
// to the Mermaid var resolver. Theme declarations parsed last override
// defaults — matches the real browser cascade where `@import 'lattice'`
// at the top of every theme loads lattice.css first.
const PALETTE_VARS = parsePaletteVars(layoutCSS + '\n' + paletteCSS);
// Dual-render dark set: the SAME palette resolved to its DARK branch. Mermaid
// bakes themeVariables to literal hex at render time (in the light scheme), so
// a single bake can't flip on a `section.dark` slide — the documented dark-mode
// gap. We bake a second SVG with dark-resolved vars and toggle the two by
// color-scheme in CSS (see mermaid.css `.mmd-light/.mmd-dark`). This makes dark
// diagrams correct natively, including Mermaid's own colour-math derivations.
// Toggle off with LATTICE_MERMAID_SINGLE=1 to fall back to the single (light)
// bake + the per-diagram CSS overrides.
const DUAL_RENDER = process.env.LATTICE_MERMAID_SINGLE !== '1';
const PALETTE_VARS_DARK = parsePaletteVars(layoutCSS + '\n' + paletteCSS, true);
// Print-resolved set — the print analog of the dark bake. A Mermaid SVG bakes
// its themeVariables to literal hex offline, so a `section.print` CSS remap can't
// recolor its NODE TEXT / EDGE LINES (the categorical node FILLS get textured by
// base.print-textures.css, which CSS !important CAN override). We overlay the flat
// `--print-*` band onto its base tokens (cat-*-fill/mark, diagram-line/stroke,
// cat-on-fill, …) and bake once; a print slide selects this set. The --print-*
// values are single-scheme literals, so no light-dark() branch is needed.
function overlayPrintVars(vars) {
  const out = { ...vars };
  for (const k of Object.keys(vars)) {
    if (Object.hasOwn(vars, `print-${k}`)) out[k] = vars[`print-${k}`];
  }
  return out;
}
const PALETTE_VARS_PRINT = overlayPrintVars(PALETTE_VARS);

// ── THIS PATH'S HALF OF THE PORT (#1332 step 4) ──────────────────────────────
// The band a slide renders in IS this path's `scope`: hand the kernel a band and a
// token name, get the value that band resolves. `resolveDiagramBand` decides the
// band (lib/core/diagram-band.js); the kernel decides when to build a palette from
// it (lib/core/render-diagrams.js). Nothing here assembles `themeVariables`.
//
// The three eager `MERMAID_THEME_VARS*` constants that used to live here are gone.
// They resolved all 166 variables for all three bands at module load, printing a
// palette-gap warning per band whether or not the deck had a diagram in it; the
// kernel builds one palette per band the deck ACTUALLY uses, on first use.
function paletteVarsForBand(band) {
  if (band === 'print') return PALETTE_VARS_PRINT;
  // LATTICE_MERMAID_SINGLE=1 collapses the dark band onto the light bake — the
  // documented fallback to the per-diagram CSS overrides. It has to live in the
  // READER, not at the call site, or the two ways of asking for a dark palette
  // (this preprocess pass and the image-set look re-bake) could answer differently.
  if (band === 'dark' && DUAL_RENDER) return PALETTE_VARS_DARK;
  return PALETTE_VARS;
}
/**
 * THE SKETCH RE-POINT THIS READER CANNOT SEE (#1674).
 *
 * `base.sketch.css` re-points `--font-body` to `--sketch-font-body` inside a CLASS
 * scope (`section.sketch`). The preview's reader is `getComputedStyle(section)`, so
 * that re-point is already applied by the time it looks. This reader resolves tokens
 * OFFLINE against the palette text — there is no element, no cascade and no class —
 * so it would hand back the clean body stack for a sketch slide and the export's
 * diagram labels would be the only thing on the slide still speaking in the machine
 * face. That is #1674 in one sentence.
 *
 * So the re-point is applied HERE, in the reader, which is where a path difference
 * belongs (`lib/core/render-diagrams.js` § THE PORT): the map stays declarative
 * (`fontFamily: { var: 'font-body' }`) and both paths answer the same question.
 *
 * Only the tokens the diagram map actually reads need an entry. `base.sketch.css`
 * re-points `--font-label` and `--pill-font` too, and neither reaches Mermaid.
 * `test/unit/mermaid/sketch-font-repoint.test.js` reads the real CSS and fails if a
 * mapped token's re-point is renamed or dropped, so this table cannot silently rot.
 */
const SKETCH_TOKEN_REPOINTS = Object.freeze({ 'font-body': 'sketch-font-body' });

/**
 * Read one palette token as a SCOPE resolves it. The scope is `{ band, hand }` —
 * the band decides the palette, `hand` says whether the slide wears the sketch
 * finish's type. It is an object rather than the bare band string it used to be
 * because a slide's diagram now needs BOTH answers, and passing them separately is
 * how the two drift.
 */
function readScopeToken(scope, name) {
  const { band, hand } = normalizeScope(scope);
  const vars = paletteVarsForBand(band);
  const repoint = hand ? SKETCH_TOKEN_REPOINTS[name] : undefined;
  // Fall through to the base token when a theme somehow carries no sketch value, so a
  // missing re-point degrades to the clean face rather than to the black sentinel.
  if (repoint && vars[repoint]) return readPaletteToken(vars, repoint);
  return readPaletteToken(vars, name);
}

/** Accept a bare band string as well as a scope object — the look re-bake passes one. */
function normalizeScope(scope) {
  return typeof scope === 'string' ? { band: scope, hand: false } : (scope || { band: 'light', hand: false });
}

/** Names the palette a scope resolves, for the kernel's per-palette memoization. */
function diagramScopeKey(scope) {
  const { band, hand } = normalizeScope(scope);
  return `${band}|${hand ? 'hand' : 'clean'}`;
}
// The band palettes, for the ONE caller that renders outside the kernel's walk: the
// image-set cross-scheme look re-bake, which re-renders an already-placed diagram in a
// different band (and, for a light/dark look, out of a DIFFERENT theme file, which is
// why that caller cannot simply name a band). Memoized so it costs the same as the
// constants it replaced, and built through `resolveMermaidThemeVars` — the same single
// assembly point that caller uses — so the two cannot diverge.
const bandThemeVars = new Map();
function themeVarsForBand(band, hand = false) {
  const key = diagramScopeKey({ band, hand });
  let vars = bandThemeVars.get(key);
  if (!vars) {
    // Through `resolveMermaidThemeVars`, deliberately: the PDF path keeps exactly ONE
    // palette-assembly site, and `test/unit/core/diagram-theme-parity.test.js` fails on
    // a second one — that is where the 38 drifted values came from (#511).
    vars = resolveMermaidThemeVars(paletteVarsForBand(band), hand);
    bandThemeVars.set(key, vars);
  }
  return vars;
}

// ── Puppeteer config — chrome auto-detection ─────────────────────────────
// Both the diagram render worker and the PDF rasterize step drive puppeteer, which
// needs a Chrome binary; resolution order:
//   1. PUPPETEER_EXECUTABLE_PATH env var (explicit override)
//   2. puppeteer's bundled copy under <user>/.cache/puppeteer/chrome/
//   3. system Chrome / Chromium (looked up via `which`)
// If none of these resolve, we omit executablePath and let puppeteer use
// its default (which may download a Chrome on first run).
function detectChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  // Look in known puppeteer cache locations across users.
  const possibleHomes = [];
  if (process.env.HOME) possibleHomes.push(process.env.HOME);
  // Many systems store puppeteer cache under /home/<user>/.cache/puppeteer
  // even when the script runs as a different user. Check common locations.
  try {
    if (fs.existsSync('/home')) {
      for (const u of fs.readdirSync('/home')) {
        const h = path.join('/home', u);
        if (!possibleHomes.includes(h)) possibleHomes.push(h);
      }
    }
  } catch (_e) { /* ignore */ }
  const candidates = [];
  for (const h of possibleHomes) {
    const cacheRoot = path.join(h, '.cache', 'puppeteer', 'chrome');
    if (!fs.existsSync(cacheRoot)) continue;
    try {
      for (const dir of fs.readdirSync(cacheRoot)) {
        const linuxBin = path.join(cacheRoot, dir, 'chrome-linux64', 'chrome');
        if (fs.existsSync(linuxBin)) candidates.push(linuxBin);
        const macArm = path.join(cacheRoot, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
        if (fs.existsSync(macArm)) candidates.push(macArm);
        const macX64 = path.join(cacheRoot, dir, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
        if (fs.existsSync(macX64)) candidates.push(macX64);
      }
    } catch (_e) { /* skip unreadable */ }
  }
  if (candidates.length > 0) {
    return candidates.sort().reverse()[0];
  }
  // Fall back to system chrome/chromium via PATH lookup.
  const systemBins = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const bin of systemBins) {
    try {
      const which = require('child_process')
        .execSync(`which ${bin}`, { stdio: ['pipe', 'pipe', 'ignore'] })
        .toString().trim();
      if (which) return which;
    } catch (_e) { /* not found, try next */ }
  }
  return null;
}

const CHROME_EXEC = detectChromeExecutable();
// The engine-owned Mermaid render page, run as a child process so this synchronous
// pre-pass can drive an async Puppeteer render. Resolved from PKG_ROOT rather than
// __dirname so a bundled emulator finds it the same way the fonts are found.
const MERMAID_WORKER = path.join(PKG_ROOT, 'lib', 'integrations', 'mermaid', 'render-worker.js');
if (!CHROME_EXEC) {
  console.warn('  ⚠ No Chrome binary detected. Set PUPPETEER_EXECUTABLE_PATH or install puppeteer to download one.');
}

// A human name for a Mermaid diagram's TYPE, read from the first meaningful line of
// its source (skipping `%%{init}%%` directives, front-matter and blank lines). Used
// only as the accessible-name floor for a diagram whose author supplied no
// `accTitle:` — see the call site. Unknown keywords fall back to the keyword itself
// rather than a wrong guess.
const MERMAID_KINDS = {
  graph: 'Flowchart', flowchart: 'Flowchart', sequencediagram: 'Sequence diagram',
  classdiagram: 'Class diagram', statediagram: 'State diagram', 'statediagram-v2': 'State diagram',
  erdiagram: 'Entity relationship diagram', journey: 'User journey diagram', gantt: 'Gantt chart',
  pie: 'Pie chart', quadrantchart: 'Quadrant chart', requirementdiagram: 'Requirement diagram',
  gitgraph: 'Git graph', mindmap: 'Mind map', timeline: 'Timeline', sankey: 'Sankey diagram',
  'sankey-beta': 'Sankey diagram', xychart: 'XY chart', 'xychart-beta': 'XY chart',
  block: 'Block diagram', 'block-beta': 'Block diagram', packet: 'Packet diagram',
  architecture: 'Architecture diagram', 'architecture-beta': 'Architecture diagram',
};
// Escaped LOCALLY rather than via the module's `escapeHtml`, which is declared far
// below as a `const`: the mermaid pre-pass runs during module evaluation, so reaching
// forward to it throws `Cannot access 'escapeHtml' before initialization`. That failure
// was ALSO invisible — the surrounding retry loop deleted the temp dir before this
// point, so attempts 2 and 3 failed with a misleading "Command failed" (no input file)
// and the real cause never surfaced.
const escAttrLocal = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function mermaidKindLabel(definition) {
  const lines = String(definition || '').split('\n');
  let inFrontMatter = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Mermaid YAML FRONT MATTER is a `---` fenced block, and skipping only the fence
    // lines left the loop reading `title: …` from INSIDE it — which is not a diagram
    // keyword, so every front-mattered diagram fell through to the generic "Diagram".
    // 12 of the repo's own 100 mermaid blocks use front matter, including the baseline
    // gallery's first diagram, which is the artifact §17.12 originally cited as proof
    // this worked. Track the block and skip its BODY, not just its fences.
    if (line === '---') { inFrontMatter = !inFrontMatter; continue; }
    if (inFrontMatter) continue;
    if (!line || line.startsWith('%%')) continue;
    const word = (line.split(/[\s:;{(]/)[0] || '').toLowerCase();
    if (!word) continue;
    return MERMAID_KINDS[word] || 'Diagram';
  }
  return 'Diagram';
}

function renderMermaidOne(definition, themeVars, extraClass, look) {
  // Mermaid / Chromium has known transient failures (browser startup races, a lost
  // page). Retry the whole worker up to 3 times before degrading to a `<pre>`.
  const MAX_ATTEMPTS = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const out = runMermaidWorker([{ definition, themeVars, look }]);
    if (out.ok && out.results[0]?.ok) {
      return finishMermaidSvg(out.results[0].svg, definition, extraClass);
    }
    lastError = out.results[0]?.error || out.error || 'unknown failure';
    // A DIAGRAM-level error is the author's syntax, not a flaky browser — retrying it
    // costs three Chromium boots to reach the same verdict. Only a WORKER-level failure
    // is worth another attempt.
    if (out.ok) break;
    if (attempt < MAX_ATTEMPTS) execSync('sleep 1');
  }
  console.warn(`  ⚠ Mermaid render failed: ${String(lastError).split('\n')[0]}`);
  return mermaidFallbackPre(definition);
}

/**
 * The degradation block for a diagram that could not render, with its source ESCAPED.
 *
 * It was interpolated raw on both paths, which put author markup straight into the
 * exported `.html` sidecar and into the page Puppeteer rasterizes — a fence body of
 * `</pre><img src=x onerror=…>` executed there, verified. Pre-existing (identical on
 * `origin/main`) and off the path of #1674, so by HARD RULE #18 it would be logged rather
 * than fixed — except that it is one call, the helper already existed a few lines up, and
 * #1674 makes this path materially easier to reach (a batch that used to fall back and
 * retry now degrades in place). Fixing beats logging when the fix is this small.
 *
 * `escAttrLocal` rather than the module's `escapeHtml`: same TDZ reason as its own
 * docstring gives — the mermaid pre-pass runs during module evaluation.
 */
function mermaidFallbackPre(definition) {
  return `<pre class="mermaid-fallback">${escAttrLocal(definition)}</pre>`;
}

/**
 * A face that is DECLARED but never LOADS is the #1674 bug wearing a disguise: the
 * diagram still renders, Mermaid just measured it in a fallback and the deck then paints
 * it in the real face. Nothing about the output looks wrong until a label overflows its
 * box. The worker reports what actually reached `status === 'loaded'`, so say something
 * the one time it does not — once per run, naming the faces, rather than per diagram.
 */
let warnedUnloadedFaces = false;
function warnOnUnloadedFaces(out) {
  if (warnedUnloadedFaces || !out || !Array.isArray(out.fontsLoaded)) return;
  // PER FACE, not per family. A family with its 400 present and its 700 missing would pass
  // a family-level check while mermaid measured cluster titles and bold runs against
  // synthetic bold — the same measure/paint split one weight down.
  const loaded = new Set(out.fontsLoaded);
  const missing = TEXT_FACES
    .filter((f) => !loaded.has(`${f.family}|${f.weight}|${f.style}`))
    .map((f) => `${f.family} ${f.weight}${f.style === 'italic' ? ' italic' : ''}`);
  if (!missing.length) return;
  warnedUnloadedFaces = true;
  console.warn(`  ⚠ Mermaid render page did not load: ${missing.join(', ')} — diagram labels in `
    + 'those faces were measured against a fallback and may not fit their nodes.');
}

/**
 * Run the engine-owned Mermaid render worker over a list of requests, synchronously.
 *
 * WHY A CHILD PROCESS AT ALL — `preprocessMermaid` is called at module-evaluation
 * time (below) and cannot `await`, while Puppeteer is async throughout. The worker
 * keeps the caller's shape exactly as the `mmdc` shell-out had it. See
 * lib/integrations/mermaid/render-worker.js for why we stopped calling `mmdc`.
 *
 * @param {Array<{definition: string, themeVars: object, look: string|undefined}>} requests
 * @returns {{ok: boolean, error?: string, results: Array<{ok: boolean, svg?: string, error?: string}>}}
 */
function runMermaidWorker(requests) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-'));
  try {
    const jobFile = path.join(tmpDir, 'job.json');
    const outFile = path.join(tmpDir, 'out.json');
    fs.writeFileSync(jobFile, JSON.stringify({
      pkgRoot: PKG_ROOT,
      chromePath: CHROME_EXEC || undefined,
      backgroundColor: 'transparent',
      outFile,
      // The engine's config, delivered the way the live preview delivers it. Nothing is
      // serialized into a `%%{init}%%` directive any more, so the author's own directive
      // is the ONLY one in the source and Mermaid merges it over ours exactly as it does
      // in the preview (#1674, HARD RULE #1).
      diagrams: requests.map((r) => ({
        definition: r.definition,
        // `omitPalette` carries the theme STAND-DOWN across the transport change. It used
        // to be implicit in `withEngineInit`, which returned the definition untouched when
        // the author pinned a theme, so no engine config reached Mermaid at all. Config
        // travels beside the source now, so the stand-down has to be stated.
        config: engineInitConfig(r.themeVars, {
          look: r.look,
          omitPalette: authorPinsTheme(r.definition),
        }),
      })),
    }));
    // A BUDGET, because there was none. The worker bounds its own CDP calls, but a child
    // that wedges before it can report leaves this synchronous call blocked forever — and
    // `mmdc` had the same gap with a fraction of the blast radius, because it booted a
    // browser per diagram. Scaled by batch size so a large deck is not cut off mid-render;
    // on expiry `execFileSync` throws, the catch below degrades, and the caller retries.
    const timeout = Math.max(120_000, 15_000 * requests.length);
    execFileSync(process.execPath, [MERMAID_WORKER, jobFile], { stdio: ['ignore', 'ignore', 'pipe'], timeout });
    const out = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    warnOnUnloadedFaces(out);
    return out;
  } catch (e) {
    // The worker writes its result file even when the browser never came up, so prefer
    // that over the process error — it carries the real reason.
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, 'out.json'), 'utf8'));
      if (parsed && Array.isArray(parsed.results)) { warnOnUnloadedFaces(parsed); return parsed; }
    } catch (_e) { /* fall through to the process-level error */ }
    return { ok: false, error: String(e?.message ? e.message : e).split('\n')[0], results: [] };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Everything that happens to a rendered SVG between "Mermaid succeeded" and
 * "this is a slide fragment". EXTRACTED so the one-at-a-time path and the batched
 * path cannot drift: they are two ways of calling the worker, not two renderers, and a
 * fix applied to one of them silently missing the other is precisely the failure
 * `lib/core/render-diagrams.js` was built to stop (#1326, four defects in a row,
 * each one two implementations answering the same question differently).
 *
 * @param {string} svg          Raw worker output.
 * @param {string} definition   The diagram source, for the accessible-name fallback.
 * @param {string|null} extraClass  Extra class on the wrapper, or null.
 */
let mermaidSvgCounter = 0;
function finishMermaidSvg(svg, definition, extraClass) {
  // ID ISOLATION — the first thing that happens, and it must happen on EVERY path.
  // mmdc hardcodes the SVG root id to "my-svg" and prefixes every internal id
  // (markers, gradients, filters) and every emitted CSS rule with that same string.
  // When a deck embeds many Mermaid SVGs in one HTML, their `<style>` blocks all use
  // `#my-svg .node …` selectors that step on each other — the last diagram's theme
  // variables (a treeview with primaryColor="#FFFFFF", say) silently override every
  // prior diagram's node fills. Rewrite to a per-diagram suffix so the SVGs are
  // isolated. One global substitution catches the root id, every internal id
  // (my-svg-flowchart-A-0), every url(#my-svg…) reference, and every #my-svg
  // selector inside the embedded <style>.
  //
  // It lived in `renderMermaidOne` until batching arrived, and the batched path
  // did not inherit it — so all 14 diagrams of a gallery came back sharing one
  // prefix. The counter is module-level rather than a function property for exactly
  // that reason: it belongs to "a diagram was finished", not to "a diagram was
  // rendered one-at-a-time". Order is unchanged either way, so the ids a deck emits
  // are identical whether its fences were batched or not.
  svg = svg.replace(/my-svg/g, `lattice-mmd-${++mermaidSvgCounter}`);
  // Mermaid sankey (11.14) emits each node's <text> with the node name on line 1
  // and the outbound-link value on line 2, separated by a literal newline. SVG
  // ignores newlines inside <text>, but the post-mmdc pipeline runs the HTML
  // through markdown-it, which parses `\n\n` inside the inlined SVG as a paragraph
  // break and wraps the value in <p>…</p>. The resulting <text>Wages<p>750</text>
  // is invalid SVG and breaks text positioning, producing the visible
  // "750Disposable income750Savings…" run-together labels. Sankey is the only
  // diagram type that puts newlines inside <text>; gate on the sankey-specific
  // <g class="links"> marker so the substitution doesn't touch <text> elements in
  // any other diagram type.
  if (svg.includes('<g class="links"')) {
    svg = svg.replace(/(<text\b[^>]*>)([\s\S]*?)(<\/text>)/g, (_m, open, inner, close) => {
      const collapsed = inner.replace(/\s*\n\s*/g, ' ').trim();
      return `${open}${collapsed}${close}`;
    });
  }
  // ── PAST THIS POINT mmdc HAS SUCCEEDED ──────────────────────────────────────
  // Everything below is post-processing on a string we already hold, and it must
  // NOT be retried by the caller: on the one-at-a-time path the temp dir is already
  // gone, so a re-run of mmdc would fail on a missing input file and report
  // `Command failed: … mmdc …` — blaming the renderer for a bug in our own code.
  // That is exactly what happened when the accessible-name injection first landed
  // (ADR §17.13): a TDZ error here cost several minutes of misdiagnosis because the
  // retry laundered it. §17.13 stated the lesson and did not apply it; this is the
  // fix: post-processing gets its own try, so a throw here degrades to the
  // UNPROCESSED-but-valid SVG and says so, instead of masquerading as a failure.
  try {
    // ACCESSIBLE NAME. Mermaid emits its root as `role="graphics-document document"`
    // with NO name unless the author wrote `accTitle:` / `accDescr:` in the diagram
    // source — so an un-annotated diagram reaches a screen reader as an anonymous
    // graphics document. We do not author this markup (mmdc does), so the fix is
    // additive and conservative: only when the SVG carries no name of its own, label
    // it with the diagram's TYPE, read from the first meaningful line of the source.
    // That is a floor, not a description — `accTitle:`/`accDescr:` remain the right
    // way to say what a diagram MEANS, and mermaid's own `<title>`/`aria-labelledby`
    // is left untouched wherever it exists. Semantic-html ADR §17.12.
    if (!/\saria-label(?:ledby)?=/.test(svg.slice(0, svg.indexOf('>') + 1)) && !/<title\b/.test(svg)) {
      const kind = mermaidKindLabel(definition);
      svg = svg.replace(/^(\s*<svg\b)/, `$1 aria-label="${escAttrLocal(kind)}"`);
    }
  } catch (postErr) {
    // The diagram itself is fine — only our decoration failed. Ship the SVG.
    console.warn(`  ⚠ Mermaid post-processing failed (diagram still rendered): ${postErr?.message}`);
  }
  const cls = extraClass ? `mermaid-svg ${extraClass}` : 'mermaid-svg';
  // STAMP THE STAND-DOWN. When the author pins a theme in the fence, the engine emits no
  // palette AND no font keys — the diagram deliberately wears Mermaid's stock look, which
  // means its labels are deliberately NOT in the deck's face. Nothing in the output said
  // so, so `tools/check-diagram-labels.js` could not tell a diagram that opted out from
  // one the finish failed to reach: it had to fall back to a denylist of five Mermaid
  // default face names, which passes any face that is merely WRONG rather than famous.
  // One attribute makes the export self-describing and lets that gate ask the exact
  // question — "is this label in the face its own slide asked for?" — with an exemption
  // that is a fact about the diagram rather than a guess.
  const pinned = authorPinsTheme(definition) ? ' data-author-theme="1"' : '';
  return `<div class="${cls}"${pinned}>${svg}</div>`;
}

/**
 * Render EVERY fence in ONE browser instead of one browser each.
 *
 * THE COST THIS REMOVES. `mmdc` boots its own Chromium, and it was booting one PER
 * DIAGRAM: ~2.9s per fence, which on the 14-fence diagram gallery was 40.7s of a 44.3s
 * render — 92%, the largest single cost anywhere in the CLI
 * (engineering/decisions/2026-08-16-render-format-cost-assessment.md §2b). Batching
 * through `mmdc -i <markdown>` brought that to a measured `1.86s + 1.09s × N`.
 *
 * The worker goes further for free: it reuses ONE PAGE across the batch, so the 1.6 MB
 * Mermaid bundle is parsed once rather than once per diagram, which is where most of
 * that per-diagram second went. Numbers for the change are in the PR's `## Performance`
 * section (HARD RULE #19).
 *
 * NOT ALL-OR-NOTHING ANY MORE, and that is the other improvement. The `mmdc -i`
 * batch wrote `<out>-1.svg`, `<out>-2.svg`, … and a fence it could not parse simply
 * produced no file — which invalidated the index alignment the caller depends on, so
 * one bad fence sent the WHOLE deck back through the one-at-a-time path. The worker
 * returns an index-aligned result per diagram with its own `ok` flag, so a bad fence
 * costs only itself and the other thirteen are already rendered.
 *
 * Returns an array of finished slide fragments index-aligned with `requests`, or `null`
 * when the worker itself could not run at all (no browser, a crash before any diagram)
 * — the caller then falls back to the one-at-a-time path, which retries.
 *
 * @param {Array<{definition: string, themeVars: object, look: string|undefined, extraClass: string|null}>} requests
 */
function renderMermaidBatch(requests) {
  if (!requests.length) return [];
  const out = runMermaidWorker(requests);
  if (!out.ok || out.results.length !== requests.length) return null;
  return out.results.map((r, i) => {
    if (r.ok) return finishMermaidSvg(r.svg, requests[i].definition, requests[i].extraClass);
    // One fence failed to parse. Degrade THIS diagram only — and say which, because the
    // batch used to be silent about it (the whole run just got slower).
    console.warn(`  ⚠ Mermaid render failed for one diagram: ${String(r.error).split('\n')[0]}`);
    return mermaidFallbackPre(requests[i].definition);
  });
}

// Scheme-aware render: a diagram is baked with the dark-resolved themeVars when
// its slide is dark, else the light-resolved set. Mermaid bakes themeVariables
// to literal hex at render time, so a light bake can't flip on a section.dark
// slide — the documented dark-mode gap. Baking the correct scheme per slide
// closes it natively (including Mermaid's own colour-math derivations), with no
// per-element CSS overrides and no wasted second SVG on single-scheme decks.
// Author-supplied %%{init}%% diagrams keep their own theming.
// LATTICE_MERMAID_SINGLE=1 forces the light bake everywhere (fallback to the
// CSS-override path).
function renderMermaid(definition, mode, look, hand = false) {
  return renderMermaidOne(definition, themeVarsForBand(mode, hand), null, look);
}

// ── Pre-process markdown: render mermaid blocks before slide splitting ────────
// Each fence is rendered for the band of ITS OWN slide, and the walk is the shared
// kernel's (`renderDiagrams`, lib/core/render-diagrams.js — #1332 step 4). This path
// supplies two capabilities and no policy: read a token for a band
// (`readScopeToken`), and render one diagram with the palette the kernel resolved
// (`renderMermaidOne`).
// (geometry/orientation helpers — used here AND in the page-geometry block below;
// required up here because preprocessMermaid runs before that block.)
const { resolveSize, orientationFor, orientationCss, geometryVarsCss } = require('./lib/engine/css');
// The ONE family classifier (lib/adaptive/README.md) — the same call the engine's `data-family`
// stamp makes, so the split gate and the components can never disagree about which box this is.
const { familyFor } = require('./lib/adaptive/families');
const { reorientMermaidForPortrait } = require('./lib/integrations/mermaid/reorient');
// Reoriented raw Mermaid definitions, index-aligned with the `data-mmd-idx` stamp on each
// rendered `.mermaid-svg`. The image-set export's cross-scheme SVG look uses this to RE-BAKE a
// diagram in a different scheme (mmdc bakes colors at render time, so a CSS restyle can't recolor
// baked node text/edges — re-running renderMermaid in the look mode can). Empty for decks with no
// diagrams; only read on a cross-scheme image-set export. SINGLE-SHOT: this is a run-once CLI
// (`preprocessMermaid` fires once per process, one deck), so the array never accumulates across
// decks. If this module is ever reused for multiple decks in one process, reset it per deck.
const MERMAID_REBAKE_DEFS = [];
// The scheme each diagram was BAKED in (index-aligned with MERMAID_REBAKE_DEFS), so a cross-scheme
// image-set look re-renders a diagram only when its own bake scheme differs from the look — keyed on
// the diagram's real bake (from the deck's `color-mode:`), NOT the palette-derived slide scheme,
// which can disagree (a `color-mode: dark` deck rendered under a light `--image-mode`). SINGLE-SHOT
// like MERMAID_REBAKE_DEFS above — the two are index-aligned and MUST be reset together if this
// run-once CLI is ever reused for multiple decks in one process, or a look re-render would read a
// stale bake mode for the wrong deck's diagram.
const MERMAID_REBAKE_MODES = [];
// The LOOK each diagram was baked with (index-aligned with the two arrays above),
// so a cross-scheme image-set re-bake reproduces the slide's own node renderer.
// Without it a `mode: sketch` deck's re-baked diagrams would come back CLASSIC
// while every un-re-baked one stayed hand-drawn — the look version of the
// scheme mismatch MERMAID_REBAKE_MODES exists to prevent. SINGLE-SHOT and reset
// together with them.
const MERMAID_REBAKE_LOOKS = [];
// Index-aligned with the above: did this diagram bake its labels in the sketch hand
// face? A cross-scheme re-bake reads a different palette file and must resolve the
// SAME font token, or a re-baked sketch diagram silently reverts to the clean face.
const MERMAID_REBAKE_HAND = [];

function preprocessMermaid(source) {
  const fmMatch = source.match(/^---\r?\n[\s\S]*?\r?\n---/);
  const fm = fmMatch ? fmMatch[0] : '';
  // Deck-wide orientation, resolved from the `size:` directive the same way the
  // page geometry below does. A portrait deck reorients LR/RL flowcharts to
  // TB/BT (lib/integrations/mermaid/reorient.js) so a wide graph flows down the
  // tall frame instead of shrinking to a thin strip; landscape is untouched.
  const sizeName = (fm.match(SIZE_DIRECTIVE_RE) || [])[1] || 'hd';
  const orientation = orientationFor(resolveSize(sizeName)).name;

  // REAL SLIDES, from the engine's own boundaries (lib/core/slide-class-spans.js).
  // This replaced a scan of `source.slice(0, offset)` for the last `_class:`
  // directive anywhere before the fence — which never reset at a slide boundary,
  // while Marp's `_class` is a SINGLE-SLIDE directive that does not carry forward.
  // A bare slide following a `<!-- _class: dark -->` slide therefore got a
  // DARK-baked diagram on a light canvas: white node ink on a light chip (#1329).
  // The old fallback was asymmetric too — once any `_class:` had appeared earlier in
  // the deck, the deck default stopped being consulted for every later slide.
  const { spans } = slideClassSpans(source);

  // Collect the fences, then let the kernel walk. Two passes rather than rendering
  // inside `String.replace`, because the kernel owns the walk now — and because a
  // walk over real slides is what makes the band per SLIDE rather than per fence.
  const fences = [];
  for (const m of source.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    const slideIndex = Math.max(0, slideIndexAt(spans, m.index));
    fences.push({
      matchStart: m.index,
      matchEnd: m.index + m[0].length,
      slideIndex,
      slideClass: slideClassAt(spans, m.index),
      source: reorientMermaidForPortrait(m[1].trim(), orientation),
    });
  }
  if (fences.length === 0) return source;

  // One deck entry per slide THAT HAS A DIAGRAM, in document order. `scope` is the
  // resolved band — this path's scope, and its own scopeKey (the kernel's default
  // `String` is exactly right for a band string).
  const bySlide = new Map();
  for (const fence of fences) {
    let slide = bySlide.get(fence.slideIndex);
    if (!slide) {
      slide = {
        // The look rides beside the band on the slide entry: both are per-SLIDE
        // answers read from the same two inputs, so resolving them together is
        // what keeps them from drifting apart the way band and chip did.
        look: resolveDiagramLook({
          frontMatter: fm,
          slideClass: fence.slideClass,
          paletteUsesTexture: PALETTE_USES_TEXTURE,
          // The print band textures EVERY theme's categories (base.print-textures.css),
          // so the look has to see it — the palette file alone cannot answer for print.
          band: resolveDiagramBand({
            frontMatter: fm,
            slideClass: fence.slideClass,
            flagPrint: WANT_PRINT,
          }),
        }),
        // THE SCOPE IS `{ band, hand }` (#1674), not the bare band it used to be.
        // The band decides the palette; `hand` decides whether `--font-body` resolves
        // through the sketch re-point (see readScopeToken). Both are per-SLIDE answers
        // read from the same two inputs, so they are resolved together for the same
        // reason the look is — a scope that answered one per slide and the other per
        // deck would bake a diagram whose palette and type disagreed.
        scope: {
          band: resolveDiagramBand({
            frontMatter: fm,
            slideClass: fence.slideClass,
            // WANT_PRINT, not `flags.print`: `--image-mode print` sets the print
            // canvas too, and passing the narrower flag made the band depend on the
            // front-matter merge alone — so an image set exported in print mode
            // baked full-color ink while manifest.json recorded "print".
            flagPrint: WANT_PRINT,
          }),
          // NOT `look === 'handDrawn'`: a texture palette and the print band both take
          // the hand SHAPE away (redundant encoding cannot survive a hachure stroke)
          // while leaving the hand TYPE, which is what `resolveDiagramHandType` answers.
          hand: resolveDiagramHandType({ frontMatter: fm, slideClass: fence.slideClass }),
        },
        diagrams: [],
      };
      bySlide.set(fence.slideIndex, slide);
    }
    slide.diagrams.push(fence);
  }
  const deck = [...bySlide.keys()].sort((a, b) => a - b).map((k) => bySlide.get(k));

  // TWO PASSES, and the kernel is untouched by design. `renderDiagrams`
  // (lib/core/render-diagrams.js) is SHARED with the browser runtime, which renders
  // in-page and has nothing to batch; widening its synchronous `renderOne` contract
  // to serve one path is exactly the "two renderers deciding the same thing"
  // failure that kernel exists to prevent. So the kernel still drives the walk and
  // still calls back once per diagram — this path's callback just RECORDS the
  // request instead of shelling out, and the batch runs after the walk returns.
  //
  // Pass 1 keeps every index-aligned side effect (MERMAID_REBAKE_*) in exactly the
  // order it had before, because the image-set cross-scheme re-bake reads those by
  // position and a reordering would re-bake the wrong diagram.
  const requests = [];
  const rendered = renderDiagrams(deck, {
    readToken: readScopeToken,
    scopeKey: diagramScopeKey,
    renderOne: (fence, themeVars, meta) => {
      // Keep the source def AND the band it was baked in, index-aligned, so the
      // image-set look re-bake can tell whether THIS diagram needs re-rendering.
      const idx = MERMAID_REBAKE_DEFS.push(fence.source) - 1;
      // The BAND, not the whole scope: `MERMAID_REBAKE_MODES` is compared against a
      // look name (`'light'`/`'dark'`/`'print'`) to decide whether a diagram needs
      // re-baking, and the scope became an object when the hand-type answer joined it.
      MERMAID_REBAKE_MODES[idx] = meta.scope.band;
      // Whether this diagram's labels are in the hand face, so a cross-scheme re-bake
      // resolves the same font token the first bake did.
      MERMAID_REBAKE_HAND[idx] = meta.scope.hand;
      MERMAID_REBAKE_LOOKS[idx] = meta.look;
      requests.push({ definition: fence.source, themeVars, look: meta.look, extraClass: null, scope: meta.scope });
      return { fence, idx };
    },
  });

  // Pass 2: one browser for all of them, falling back to one-per-diagram if the WORKER
  // could not run at all. The fallback is narrower than it used to be and still not a
  // formality: a per-DIAGRAM failure is now degraded in place by the batch, so this
  // path is reached only when nothing rendered — where `renderMermaidOne`'s retry is
  // exactly what is wanted.
  if (!QUIET && requests.length) {
    const scopes = [...new Set(requests.map((r) => diagramScopeKey(r.scope)))].join(', ');
    process.stdout.write(`  Rendering ${requests.length} mermaid diagram${requests.length === 1 ? '' : 's'} (${scopes}) in one pass...`);
  }
  let htmls = renderMermaidBatch(requests);
  if (!htmls) {
    htmls = requests.map((r) => renderMermaidOne(r.definition, r.themeVars, r.extraClass, r.look));
  } else if (!QUIET) {
    console.log(' done');
  }
  for (const r of rendered) {
    // Stamp the def index so a cross-scheme image-set export can find + re-bake
    // this exact diagram.
    r.html = htmls[r.idx].replace(/(<div class="mermaid-svg[^"]*")/, `$1 data-mmd-idx="${r.idx}"`);
  }

  // Splice the rendered diagrams back in, by slicing. NOT because `String.replace` was
  // unsafe — a replacement FUNCTION never interprets `$1`/`$&`, only a replacement
  // string does, so the previous form had no corruption hazard and an earlier version of
  // this comment claiming otherwise was simply wrong. The reason is that the kernel owns
  // the walk now: results come back as a list, and slicing is how a list of (offset,
  // html) pairs goes back into the source without re-deriving the match.
  const byStart = new Map(rendered.map((r) => [r.fence.matchStart, r.html]));
  let out = '';
  let cursor = 0;
  for (const fence of fences) {
    out += source.slice(cursor, fence.matchStart);
    out += byStart.get(fence.matchStart) ?? source.slice(fence.matchStart, fence.matchEnd);
    cursor = fence.matchEnd;
  }
  return out + source.slice(cursor);
}


// Auto-glossary (#920): when the deck opts in with front-matter `glossary: auto`, append a
// reference-appendix slide built from the acronym registry's `definition` fields (reusing the
// `glossary` component). A source transform, so the generated slide flows through render / notes /
// captions / the manifest source like any authored slide; it's idempotent (strips its own trigger),
// so a `.html` round-trip renders it once and never regenerates. No-op unless `glossary: auto` +
// ≥1 defined term. Shared with the docs render path (render-engine.ts) — HARD RULE #1.
const { appendAutoGlossary, glossaryEntries, resolveGlossaryMode } = require('./lib/core/glossary-auto.mjs');
const preGlossaryMd = preprocessMermaid(md);
const rawMd = appendAutoGlossary(preGlossaryMd);
// The manifest term→definition projection is part of the SAME `glossary: auto` opt-in as the
// slide (design §18) — gate it so a deck with acronym definitions but no `glossary: auto` stays
// byte-identical. Read the mode off the pre-append source: `rawMd` has had the trigger stripped
// (the idempotency mechanism), so its mode always resolves to 'off'.
const autoGlossaryEntries = resolveGlossaryMode(preGlossaryMd) === 'auto' ? glossaryEntries(preGlossaryMd) : [];
// CRLF-aware, and it captures the front-matter BODY (see FRONT_MATTER_RE above for why the
// LF-only form was a real defect). Every consumer below reads it with an `/m`-anchored pattern,
// so the exact newlines at the capture's edges do not matter.
const fmMatch = rawMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
const fm      = fmMatch ? fmMatch[1] : '';
// Fluid-box viewer: emit the .html as the opt-in responsive viewer (keeps +
// inlines the runtime, flags the page fluid-capable). Enabled by the `--fluid`
// flag OR a `fluid: true` front-matter key. The PDF/PPTX/PNG outputs are
// UNCHANGED either way — fluid only affects the written .html, after raster.
// Design: engineering/decisions/2026-06-21-fluid-box-viewer-design.md.
const FLUID_VIEW = !!flags.fluid || /^\s*fluid:\s*(?:true|yes|on)\s*$/im.test(fm);
// Presentation mode: mark the exported PDF to open in full-screen presentation
// view (see applyPresentMode). Enabled by the `--present` flag OR a
// `present: true` front-matter key, mirroring --fluid. PDF only.
const PRESENT = !!flags.present || /^\s*present:\s*(?:true|yes|on)\s*$/im.test(fm);
// PDF-only options that have nothing to attach to under `.html`, warned HERE rather
// than beside the other output-format warnings because both must see the FRONT MATTER
// form, not just the CLI flag: a deck opting in with `present: true` renders to .html
// and would otherwise get no warning at all — the exact silent regression the guard
// exists to prevent, missed on half its input space (red-team, this PR). Scoped to
// `.html` on purpose; the same silence on .png/.pptx/.zip is pre-existing (#18).
if (OUT_FORMAT === 'html') {
  if (PRESENT) console.warn('  ⚠ --present / `present: true` sets PDF viewer hints — ignoring for .html (no PDF is written).');
  if (EMBED_SOURCE) console.warn('  ⚠ --embed-source embeds the deck in the PDF — ignoring for .html. Use --player, which embeds the source for lossless re-import.');
}
// Self-contained HTML PLAYER (2026-07-07-html-lattice-player.md): rewrite the .html
// sidecar into a portable, offline, three-view player (Present · Read·Slides ·
// Read·Article). Like --fluid, it only affects the written .html, after raster.
// Enabled by `--player` OR a `player: true` front-matter key. Takes precedence over
// --fluid (the player is the richer viewer). Frozen player-runtime version stamp.
const PLAYER = !!flags.player || /^\s*player:\s*(?:true|yes|on)\s*$/im.test(fm);
const PLAYER_VERSION = '1';
const ENGINE_BUILD = pkgVersion() ?? '';
// Auto-split — the Fit Ladder's SPLIT move. ONE trigger: a real render MEASURED the slide
// overflowing its box, and the slide has a seam (lib/core/auto-split.js `resplitDoc`, driven
// by the `measureOverflow` evaluate below). The capacity map is hoisted to module scope so
// the measured loop can read each layout's split AXIS + pacing from the top-level `capacity`
// OR the per-family `adapt.capacity`, so a layout whose budget lives only in adapt is still
// splittable. See engineering/decisions/2026-06-22-the-fit-spine.md §3.
//
// SPLIT FIRES ON FIT, NEVER ON COUNT (2026-07-29). There used to be a second trigger: a cheap
// pre-render pass counted the collection against `capacity.hard` and fed every over-budget
// slide into the measured loop as a candidate, so a slide that was authored past its budget
// AND fit its box comfortably was cut anyway — twelve one-line checklist items at
// `size: portrait`, occupying about a third of the canvas, became three pages, two of them
// mostly white. That is the engine second-guessing an author who
// stayed inside the geometry. `capacity` is an AUTHORING advisory and `lint:deck` is where it
// speaks; the engine's only question is "does it fit". See
// engineering/decisions/2026-07-29-autosplit-is-not-a-toggle.md §"Fit, not count".
//
// Splitting is INTRINSIC. A deck is authored once and presented at many sizes, so its page
// COUNT is a function of the content and the box, not an authoring fact — which is why the
// retired `autosplit:` directive was never the right shape.
//
// `--no-split` is INSTRUMENTATION, not authoring: the measurement rigs need page N to
// stay slide N so they can measure (tools/check-family-tiers.js's sweep records the
// un-split terminal on purpose; tools/lib/calibrate-core.js grades one step per page).
// A specimen slide that means to DEMONSTRATE overflow marks itself per-slide with
// `<!-- stress-slide -->` instead — the marker lint-core already reads as "this slide
// EXISTS to show the upper limit".
const AUTOSPLIT = !NO_SPLIT;
const SPLIT_CAP = (() => {
  if (!AUTOSPLIT) return {};
  const map = {};
  // Resolve the manifest tree from PKG_ROOT, not the module's __dirname: in
  // the esbuild bundle __dirname is <pkg>/dist/ (no manifests there), which
  // made autosplit a SILENT NO-OP for every npx/npm consumer of the packaged
  // CLI while working in the repo. lib/ ships in the tarball, so the
  // package-root walk lands on the real manifests in both worlds.
  for (const m of require('./lib/components').loadAll(path.join(PKG_ROOT, 'lib', 'components'))) {
    const axis = m.capacity?.axis ?? m.adapt?.capacity?.axis;
    // A layout joins the split registry if it can paginate (has a capacity axis) OR
    // declares a carousel `split` recipe (read-across re-authored as a sequence).
    // `perPage` is the AUTHORED split pacing — how many members ride one page of a split
    // run (1 for a heavy member that atomizes). Distinct from `sweet`, which is authoring
    // comfort; auto-split.js `splitTargetOf` prefers it and falls back to sweet → soft → hard.
    // `relationship` is the CONNECTED-MEMBER kind (§0b, §8 rule 12a) — the split kernel needs it
    // to derive each page's "→ next / ↻ back to / governs ↓ / Option N of M" adornment. This
    // projection is a hand-listed whitelist, so a capacity field absent here reaches the kernel as
    // `undefined` and the feature is a SILENT no-op (the manifests declared it, every unit test
    // passed, and the real render emitted nothing — caught only by looking at the render).
    if (axis || m.split) map[m.name] = { axis: axis ?? null, hard: m.capacity?.hard ?? null, sweet: m.capacity?.sweet ?? null, soft: m.capacity?.soft ?? null, perPage: m.capacity?.perPage ?? null, relationship: m.capacity?.relationship ?? null, split: m.split ?? null };
  }
  // An empty registry with autosplit requested means the manifests were not
  // found — the exact silent failure this resolver fix closes. Never quiet.
  if (!Object.keys(map).length) {
    console.warn('autosplit: on — but no component manifests were found under ' + path.join(PKG_ROOT, 'lib', 'components') + '; autosplit will not run.');
  }
  return map;
})();
// The layout class tokens that carouselize owns (read-across re-authored as a
// sequence) — handed to the browser overflow measure so it marks them splittable.
const CAROUSEL_NAMES = Object.keys(SPLIT_CAP).filter((n) => SPLIT_CAP[n].split);
// A carousel split either REDUCES HORIZONTAL extent — re-authoring a side-by-side layout to
// one panel per page (cover-code, cover-sides) — or PAGINATES A VERTICAL COLLECTION
// (cover-paginate & friends: rows/items divided, the read-across columns repeating on every
// page). Only the former can fix HORIZONTAL overflow; row/item pagination never narrows a
// wide table. So a vertical paginator is marked splittable on VERTICAL overflow ONLY — a
// too-wide table (compare-table, obligation-matrix) falls to the ring instead of being
// row-split futilely, which would balloon the deck pass after pass (#499/#500). The
// width-reducing strategies keep the any-overflow behavior they need. See the-fit-spine.md §3.
const WIDTH_REDUCING_STRATEGIES = new Set(['cover-code', 'cover-sides', 'cover-cards']);
const STRUCTURAL_CAROUSEL_NAMES = CAROUSEL_NAMES.filter((n) => WIDTH_REDUCING_STRATEGIES.has(SPLIT_CAP[n].split.strategy));
const PAGINATOR_CAROUSEL_NAMES  = CAROUSEL_NAMES.filter((n) => !WIDTH_REDUCING_STRATEGIES.has(SPLIT_CAP[n].split.strategy));
// Slide geometry — ONE registry (HARD RULE #1). The page template needs pixel
// dimensions for the puppeteer PDF; rather than duplicate a size table (which
// drifted — it used to omit 16:9 and silently rendered it as hd), resolve the
// `size:` directive through the engine's own `resolveSize`, the same lookup the
// scaffold bakes into `@page`. It reads the engine's size REGISTRY
// (lib/engine/sizes.js) — the stylesheets are not consulted, so no sheet is passed.
// (resolveSize / orientationCss required above, before preprocessMermaid.)
const deckSizeName   = (fm.match(SIZE_DIRECTIVE_RE) || [])[1] || 'hd';
const _geom          = resolveSize(deckSizeName);
const slideW         = parseFloat(_geom.width);
const slideH         = parseFloat(_geom.height);
// THE SIZE GATE — split runs at `square`, `tall` and `strip`, never at `wide`.
//
// A deck is AUTHORED at 16:9. `hd` and `4K` are the same box (cqi is width-relative, so a
// 3840×2160 render is a 1920×1080 render at 2× — identical layout, identical fit), and that
// box is the one the author had in front of them: a slide that fits there is a slide they
// composed. Pagination at wide would be the engine re-cutting a deck to solve a problem the
// author does not have. The sizes that DO need it are the ones the deck was never authored
// for — `square`, `portrait`, `story`, `mobile` — where the same content meets a box it was
// never fitted to and the choice is paginate or clip.
//
// One classifier, the same one the components read off `data-family` (lib/adaptive/families.js):
// square → square, portrait|story → tall, mobile → strip, hd|4K|16:9|standard → wide. Naming the
// FAMILY rather than listing @size names means a geometry registered by a custom `@size` in theme
// or layout CSS is classified by its shape rather than by whether someone remembered to add its
// NAME to a list. (An earlier draft of this comment offered `size: 1000x1000` as the example. That
// cannot happen — inline dimensions are not a size value, and the #502 fail-fast rejects an
// unregistered name before this line runs.)
//
// The `Number.isFinite` guard is not defensive noise: both sibling call sites carry it
// (lib/engine/index.js:171, lib/engine/css.js orientationFor), because `familyFor(NaN)` falls
// through every band and returns 'strip' — the opposite verdict from the 'wide' those two produce
// for the same degenerate geometry. Dropping it here is how the gate and the `data-family` stamp
// would come to disagree about one box, which is exactly what this gate must never do.
const AUTOSPLIT_APPLIES = AUTOSPLIT
  && familyFor(Number.isFinite(slideW) && Number.isFinite(slideH) && slideH > 0 ? slideW / slideH : 16 / 9) !== 'wide';
// Orientation scaling/fill (social/mobile portrait + square @sizes). Empty for
// landscape, so the HD/4K PDF is byte-identical. Same helper the engine
// scaffold + runtime use, so every render path agrees.
const orientationStyle = orientationCss(_geom);
// The slide's own 1%, emitted from the SAME geometry the page box uses (one
// helper, shared with the engine scaffold — HARD RULE #1). Without it the export
// left `--_sec-1cqi` unset, so every token written as `calc(N * var(--_sec-1cqi,
// 1cqi))` fell back to a bare `cq*`: the section's own properties resolved
// against the ICB (right only because the PDF viewport IS the slide, wrong the
// moment a human opens the HTML sidecar at any other size) and stage descendants
// resolved against the section's CONTENT box, rendering ~11% smaller than the
// token coefficients are defined for. See lib/engine/css.js geometryVarsCss.
const geometryStyle = geometryVarsCss(_geom);
// Deck-wide `style:` directive — Marp injects this CSS verbatim into the
// rendered output. Authors use it for ad-hoc overrides like
// `style: ":root{color-scheme:dark}"` without needing a custom theme.
// Two forms are supported: an inline string (`style: "..."`) and a YAML
// block scalar (`style: |` followed by indented lines).
function readGlobalStyle(fmText) {
  const inline = fmText.match(/^\s*style:\s*(["'])([\s\S]*?)\1\s*$/m);
  if (inline) return inline[2];
  // `(?=^\S|$(?![\s\S]))` — stop at the next top-level YAML key or at the
  // absolute end of the frontmatter string. JS regex has no `\Z` anchor,
  // so we spell end-of-input as `$` with a negative lookahead for any
  // remaining characters.
  const block = fmText.match(/^\s*style:\s*\|\s*\r?\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m);
  if (block) {
    return block[1]
      .split(/\r?\n/)
      .map((l) => l.replace(/^ {2}/, '')) // strip the YAML indent (≥2 spaces)
      .join('\n')
      .trimEnd();
  }
  return '';
}
const globalStyle = readGlobalStyle(fm);

// `![bg …]` half-canvas image handling — the engine path uses liftBgImages
// (markdown pre-pass) + wrapImageText (HTML post-pass) to reproduce the
// lattice-bg/image-text panel, since lib/engine matches marp WEB mode (which
// collapses bg left/right to a full-bleed background). See engineSlides().
const bgImage            = require('./lib/core/bg-image');
const imageDimensions    = require('./lib/core/image-dimensions');

// ── P2: the markdown→slide engine (lib/engine) is the emulator's parser ─────
// Lattice converges on ONE markdown implementation: the owned lib/engine, the
// same engine every first-party path renders on. parseSlide — the bespoke regex parser
// the emulator shipped with — is retired (P2 step d). The corpus flip-A/B
// (tools/emulator-flip-ab.mjs) gated this swap to zero regressions; see
// engineering/decisions/2026-06-11-emulator-on-engine-p2.md.
//
// The engine runs the SAME plugins + registry + highlight.js + KaTeX + deck-logo
// + island injectors, so the emulator only has to:
//   - feed the mermaid-preprocessed source WITH front matter (rawMd), so the
//     engine's directive layer resolves paginate/header/footer/class/size;
//   - re-tag each section with `data-lattice-slide` (the engine omits it; the
//     page template's sizing / overflow watcher / PDF pagination key off it).

// Depth-counted scan over <section>…</section> so nested split-panel sections
// stay inside their parent. Produces the "one <section> string per slide" array
// shape the emulator's downstream (highlight, deck-logo, page template) expects,
// from the engine's assembled <article class="lattice"> document.
function splitTopLevelSections(latticeHtml) {
  const out = [];
  const re = /<section\b[^>]*>|<\/section>/gi;
  let depth = 0;
  let start = -1;
  let m;
  while ((m = re.exec(latticeHtml)) !== null) {
    if (m[0][1] === '/') {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(latticeHtml.slice(start, re.lastIndex));
        start = -1;
      }
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  return out;
}

function engineSlides() {
  const latticeEngine = require('./lib/engine');
  // `htmlAndMathml` — KaTeX's default, and the ONLY setting under which math is
  // readable by a screen reader.
  //
  // This used to be `mathOutput:'html'`, on the reasoning that the MathML "can't be
  // read in a PDF and its unclipped layout trips the slide overflow watcher (a stale
  // ring)". BOTH halves were re-tested on a real render and neither reproduces:
  // katex.min.css (linked into this very shell) clips `.katex-mathml` out of the flow,
  // so a dense four-formula slide flags ZERO overflow either way and the rasterized PDF
  // pages are pixel-identical. The PDF half is true but harmless — MathML costs nothing
  // there.
  //
  // What the old setting DID cost: KaTeX marks `.katex-html` `aria-hidden="true"`
  // because the MathML is meant to be the accessible alternative. Dropping the MathML
  // left the visual half hidden and NOTHING in its place, so every formula — display
  // and inline — was invisible to assistive technology. And it was invisible in exactly
  // the wrong artifact: the engine/preview path never overrode the default, so the
  // EXPORT (the file people actually ship, and the ADR's designated accessible route)
  // was the only path that lost it. See the semantic-html ADR §17.11.
  const engine = latticeEngine.createEngine({ mathOutput: 'htmlAndMathml' });
  // Both names are passed wherever they are known. The PALETTE's always is
  // (`palettePath` is `themes/<paletteName>.css`). The LAYOUT CSS's is known on the
  // DEFAULT path — it is `dist/lattice.css`, which is `lattice`, the name every
  // palette's `@import 'lattice'` resolves against — and only genuinely unknown when
  // `--css` / a positional `.css` substitutes a caller's own engine stylesheet. The
  // original sanction here claimed the layout slot could never know its name; that was
  // wrong for the default path, which is 100% of real usage, so it left the searched
  // form on the one path that did not need it.
  // See engineering/decisions/2026-08-16-theme-identity-ownership.md.
  // Register the WHOLE CHAIN, parent-first, not just the leaf. Registering only the
  // leaf left `@import 'indaco'` unresolvable inside the store, so `render().css` for
  // any `-dark` theme composed to ~2.3 KB of scaffold instead of ~768 KB. That went
  // unnoticed because this file discards `rendered.css` and inlines its own
  // `paletteCSS` — but any caller using the engine's composed output from a
  // CLI-shaped setup got an unstyled deck. The chain comes from the manifests
  // (lib/theme/chain.mjs); no stylesheet is parsed to find it.
  const layoutCss = readFileOrDie(cssFile, 'layout CSS');
  engine.addThemes([
    cssIsDefault ? { name: 'lattice', css: layoutCss } : layoutCss,
    ...paletteChain.map((n, i) => ({ name: n, css: readFileOrDie(paletteFiles[i], `palette '${n}'`) })),
  ]);
  // Rewrite `![bg side](url)` to the lattice-bg div (CSS background) BEFORE render
  // so the engine's basic-mode background ruler never collapses the split (lib/engine
  // matches marp WEB mode; the emulator's PDF path wants the half-canvas panel).
  // The deck's directory (as a file:// URL with a trailing slash) resolves
  // deck-relative asset URLs to absolute file:// URLs so they render regardless of
  // the output directory (the path-bug fix —
  // engineering/decisions/2026-06-17-image-rearchitecture.md).
  const deckBaseUrl = pathToFileURL(path.dirname(path.resolve(mdFile)) + path.sep).href;
  const rendered = engine.render(bgImage.liftBgImages(rawMd, deckBaseUrl), paletteName);
  // logo-wall marks ride as CSS `mask` in the preview; for the PDF we swap each
  // mask span for the mark's real `<svg>` vector (CSS mask isn't reliable in
  // print-to-PDF). Read against the deck dir, the same base `![bg]` uses.
  const renderedHtml = inlineLogoMarkSvg(rendered.html, deckBaseUrl);
  // No pre-render split pass. There used to be one — it counted each collection against
  // `capacity.hard` and handed every over-budget slide to the measured loop as a candidate —
  // and it was the second of two triggers. Splitting now has exactly ONE trigger, measured
  // overflow (the loop in the export IIFE, which reads the really-rendered DOM), because a
  // slide that fits its box is a slide the author composed and the engine has no business
  // re-cutting it. `capacity` speaks to the author through `lint:deck`, not to the splitter.
  const html = renderedHtml;
  const imageScrim = require('./lib/transformers/image-scrim');
  return splitTopLevelSections(html).map((sec, i) => {
    // Re-tag the slide index, then apply the per-section image fixups the
    // engine's basic-mode render doesn't: wrap half-canvas prose in
    // `.image-text`, and inject the contrast scrim for full/contain image
    // layouts (after the lattice-bg so it darkens the image, not the text).
    let s = bgImage.wrapImageText(sec.replace(/^<section\b/i, `<section data-lattice-slide="${i + 1}"`));
    // Adaptive image: stamp the photo's intrinsic aspect bucket, then resolve the
    // composition (bucket × data-orientation, or an explicit author class) so CSS
    // keys the whole layout off a single `[data-img-composition]` attribute.
    s = imageDimensions.stampImageBucket(s);
    s = imageDimensions.stampImageComposition(s);
    // The `statement` composition (text on a scrim over a full-bleed photo) is the
    // only one that needs a contrast scrim node; every other composition carries
    // its own contrast (solid card / matte / panel). statement is opt-in, so it's
    // always the author's `statement` class — needsScrim keys off that.
    // Resolved `class`, never the `data-class` directive payload that precedes it —
    // see lib/core/section-walk.js readClassAttr (#1358).
    const cls = readClassAttr((s.match(/^<section\b[^>]*>/i) || [''])[0]);
    if (imageScrim.needsScrim(cls) && s.indexOf('class="image-scrim') === -1) {
      s = s.replace(/(<div class="lattice-bg[\s\S]*?<\/div>)/, `$1${imageScrim.SCRIM_HTML}`);
    }
    return s;
  });
}

const slides = engineSlides();

// ── Speaker notes ──────────────────────────────────────────────────────────
// A non-directive HTML comment on a slide is that slide's speaker note
// (Marp-faithful; LFM §3.5). notes-core is the single source shared with the
// marp-cli path (HARD RULE #1); extracting from the already-rendered `slides`
// keeps the note index aligned with the slide split (incl. `split: headings`).
// Each note is lifted into a hidden presenter-notes channel and the raw comment
// nodes are stripped — exactly what Marp does, so the rendered HTML/PDF carry
// the note once, structurally, rather than as an invisible comment.
const notesCore = require('./lib/authoring/notes-core');
const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slideNotes = notesCore.extractSlideNotes(slides);
// `--strip-notes` blanks every MATERIALIZED note copy (DOM aside, PDF annotation,
// sidecar) while `slideNotes` stays intact for the envelope source-scrub set below.
const materializedNotes = STRIP_NOTES ? slideNotes.map(() => null) : slideNotes;
// The set of INDIVIDUAL note bodies straight from the render — the directive-safe
// key for scrubbing the SOURCE copies (the player envelope AND the PDF `--embed-source`
// attachment). NOT the `\n\n`-joined note split apart, which shatters a single
// blank-line note and leaks it.
const noteStripSet = STRIP_NOTES ? new Set(slides.flatMap((sec) => notesCore.noteBodiesFromHtml(sec))) : null;
const slideDescriptions = notesCore.extractSlideDescriptions(slides);
// Per-slide inline `<!-- caption: … -->` read-as text (Layer 1, §16) — the highest-precedence
// narration source. Extracted from the rendered slides (index-aligned) exactly as notes are. A
// caption is public-facing narration (the caption track), not a private note, so it is NOT blanked
// by `--strip-notes` (which removes the note channel) — the two flags compose.
const slideCaptions = notesCore.extractSlideCaptions(slides);
const slidesWithNotes = slides.map((sec, i) => {
  const stripped = notesCore.stripCommentNodes(sec);
  const note = materializedNotes[i];
  const description = slideDescriptions[i];
  if (!note && !description) return stripped;
  let inject = '';
  let sectionAttr = '';
  // Speaker note: a `hidden` aside — out of layout/print AND out of the a11y tree
  // (it is spoken by the presenter, not read by a screen reader). `--strip-notes`
  // omits it so the shared player's DOM carries no speaker text.
  if (note) inject += `<aside class="lattice-notes" hidden data-slide="${i + 1}">${escapeHtml(note)}</aside>`;
  // Accessible description: a visually-hidden but AT-EXPOSED element (sr-only, NOT
  // `hidden`), referenced by `aria-describedby` on the section. It is the slide's
  // text alternative for a screen-reader user; sr-only keeps it off the rasterized
  // PNG (so it never prints on the slide) while a screen reader still reads it.
  if (description) {
    const id = `lat-desc-${i + 1}`;
    inject += `<p class="lattice-description" id="${id}">${escapeHtml(description)}</p>`;
    sectionAttr = ` aria-describedby="${id}"`;
  }
  // Inject just inside the opening <section>, adding aria-describedby to the tag.
  // A REPLACER FUNCTION, not a replacement string: `inject` carries author prose,
  // and in a replacement string `$1`-`$9` / `$&` / `` $` `` / `$'` are backreferences.
  // A note reading "$100" therefore expanded to the first capture group ("<section")
  // plus "00" — unbalancing the HTML, so the depth-aware section walker under-counted
  // slides and every note annotation was dropped from the PDF. A replacer's return
  // value is taken literally, so author prose stays author prose.
  return stripped.replace(
    /^(\s*<section\b)([^>]*>)/i,
    (_m, open, rest) => `${open}${sectionAttr}${rest}${inject}`,
  );
});

// ── Marp-equivalent CSS for pagination and header/footer ────────────────────
// Marp injects these styles itself; we reproduce them here since we're
// not running through marp-core.
//
// Pagination uses the native Marp mechanism: the section carries a
// `data-lattice-pagination="N"` attribute, and `section::after` consumes it
// as the pseudo-element content. All visual styling (font, color, position)
// lives in lattice.css on `section::after` — see the !important block there.
// We only need the `content` rule here so the page number actually renders.
const marpSystemCss = `
/* Marp system styles — pagination content binding.
   Header/footer positioning + section::after typography live in lattice.css
   so both the CLI and the Marp VS Code preview share identical coordinates. */

section { position: relative; }

section[data-lattice-pagination]::after {
  content: attr(data-lattice-pagination);
}

/* Speaker-notes channel: a hidden, non-printing per-slide aside. Pinned off
   explicitly so a theme styling bare <aside> can never leak it into the PDF. */
aside.lattice-notes { display: none !important; }

/* Accessible-description channel: visually hidden (sr-only) so it never prints on
   the slide or lands in the rasterized PNG, but — unlike display:none — it stays
   in the accessibility tree for a screen reader (the WCAG SC 1.1.1 alternative). */
.lattice-description {
  position: absolute !important;
  width: 1px !important; height: 1px !important;
  padding: 0 !important; margin: -1px !important;
  overflow: hidden !important; clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important; border: 0 !important;
}
`;

// ── Self-hosted fonts (offline PDF embedding) ────────────────────────────────
// The engine CSS now carries a self-hosted `@font-face` block (url('fonts/…'))
// instead of a Google `@import`, but the emulator can't rely on a relative
// `fonts/` URL resolving against the right base during PDF rasterisation, so it
// base64-inlines the SAME woff2 (assets/fonts/) into an inline @font-face block.
// These local faces embed the real type into the printed PDF with zero network —
// the whole point of the library carrying its own fonts. The face list is the
// canonical manifest (lib/fonts/text-faces.js), shared with the build emitter
// and the parity gate. Absent (assets/ isn't in the tarball) it returns '' and
// the stylesheet's own `fonts/` URLs are used unchanged. Covers the full engine
// type stack: display serif (Playfair, incl. italics), body sans (Outfit), mono
// (JetBrains), and the `sketch` hand pair (Caveat, Shantell). See
// assets/fonts/README.md.
// Both suppliers below come from ONE builder (lib/fonts/face-css.js) over the canonical
// manifest. They used to be two near-identical loops here, and #1674 needed a third for
// the Mermaid render worker's page — three copies of "walk the manifest, find the woff2,
// base64 it, emit a rule" is how the `font-display` value or the directory fallback drift
// apart with nothing watching (HARD RULE #15).

// The PDF page's embedded block: every face, wrapped in a <style>. Covers the full engine
// type stack — display serif (Playfair, incl. italics), body sans (Outfit), mono
// (JetBrains), and the `sketch` hand pair (Caveat, Shantell). See assets/fonts/README.md.
function embeddedFontsStyle() {
  const faces = fontFaceCss(PKG_ROOT);
  return faces ? `<style id="lattice-embedded-fonts">${faces}</style>` : '';
}
const embeddedFonts = embeddedFontsStyle();

// Raw `@font-face{…}` rules (no <style> wrapper) for a standalone SVG asset, SUBSET to the
// families it actually uses (from collectFontFamilies) so a diagram/chart lifted into the
// image set opens with the right type instead of a serif fallback, without embedding all
// ~17 faces in every file.
function standaloneFontFaceCss(families) {
  return fontFaceCss(PKG_ROOT, { families });
}

// ── Build-time syntax highlighter ─────────────────────────────────────────────
// Tokenizes code at build time into <span class="token X"> elements.
// Covers: javascript, typescript, python, bash, css, yaml, json.
// Token classes match what our Lattice CSS already targets.

const TOKEN_PATTERNS = {
  comment:    { js:  /\/\/.*$/m,                           py: /#.*$/m,            sh: /#.*$/m,   css: /\/\*[\s\S]*?\*\//,       yaml: /#.*$/m  },
  string:     { js:  /(['"`])(?:\\.|(?!\1)[^\\])*\1/,      py: /(['"`]{3})[\s\S]*?\1|(['"`])(?:\\.|(?!\2)[^\\])*\2/, sh: /(['"])(?:\\.|(?!\1)[^\\])*\1/, css: /(['"])(?:\\.|(?!\1)[^\\])*\1/, yaml: /(['"])(?:\\.|(?!\1)[^\\])*\1/ },
  keyword:    { js:  /\b(const|let|var|function|return|import|export|from|default|class|extends|new|this|if|else|for|while|async|await|try|catch|throw|typeof|instanceof|of|in)\b/, py: /\b(def|class|return|import|from|as|if|elif|else|for|while|with|try|except|finally|raise|pass|in|not|and|or|is|lambda|yield|global|nonlocal|async|await)\b/, sh: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|export|local|echo|cd|ls|grep|awk|sed|cat|mkdir|cp|mv|rm)\b/, css: /\b(import|media|keyframes|root|from|to)\b/, yaml: /\b(true|false|null|yes|no)\b/ },
  builtin:    { js:  /\b(console|process|require|module|exports|Promise|Array|Object|String|Number|Boolean|JSON|Math|Error|Map|Set|Symbol|undefined|null|true|false)\b/, py: /\b(print|len|range|type|str|int|float|list|dict|set|tuple|bool|None|True|False|open|super|self|cls)\b/, sh: '', css: '', yaml: '' },
  classname:  { js:  /\b([A-Z][A-Za-z0-9_]*)\b(?=\s*[({])/, py: /\b([A-Z][A-Za-z0-9_]*)\b/, sh: '', css: /\b([a-z-]+)(?=\s*:)/, yaml: '' },
  number:     { js:  /\b\d+(\.\d+)?\b/, py: /\b\d+(\.\d+)?\b/, sh: /\b\d+\b/, css: /-?\d+(\.\d+)?(%|px|em|rem|vh|vw|s|ms|deg)?/, yaml: /\b\d+(\.\d+)?\b/ },
  punctuation:{ js:  /[{}[\]();,.]/, py: /[{}[\]():,.]/, sh: /[|;&]/, css: /[{}();:,]/, yaml: /[-:{}[\],|>]/ },
  operator:   { js:  /[+\-*/%=!<>&|^~?]+/, py: /[+\-*/%=!<>&|^~@]+/, sh: /[=+\-*/%]/, css: /[:,]/, yaml: '' },
};

function highlightCode(raw, lang) {
  const l = (lang || '').toLowerCase();
  const map = { javascript: 'js', typescript: 'js', js: 'js', ts: 'js',
                python: 'py', py: 'py',
                bash: 'sh', sh: 'sh', shell: 'sh',
                css: 'css', scss: 'css',
                yaml: 'yaml', yml: 'yaml',
                json: 'json' };
  const k = map[l];
  if (!k && l !== 'json') return raw; // no pattern set — return as-is

  // For JSON, reuse js patterns with a json-specific override
  const langKey = k || 'js';

  // Build ordered list of (tokenClass, regex) for this language
  const patterns = [];
  for (const [cls, langs] of Object.entries(TOKEN_PATTERNS)) {
    const rx = langs[langKey];
    if (rx) patterns.push([cls, rx]);
  }

  // Walk through the code character by character, finding earliest match
  let out = '';
  let remaining = raw;
  while (remaining.length > 0) {
    let earliest = null, earliestIdx = Infinity, earliestCls = '';
    for (const [cls, rx] of patterns) {
      const m = remaining.match(rx);
      if (m && m.index < earliestIdx) {
        earliestIdx = m.index;
        earliest = m;
        earliestCls = cls;
      }
    }
    if (!earliest) {
      out += remaining;
      break;
    }
    // Emit everything before the match as plain text
    if (earliestIdx > 0) out += remaining.slice(0, earliestIdx);
    // Emit the matched token wrapped in a span
    out += `<span class="token ${earliestCls}">${earliest[0]}</span>`;
    remaining = remaining.slice(earliestIdx + earliest[0].length);
  }
  return out;
}

// Apply highlighting to all <pre><code class="language-X"> blocks in slides
function applyHighlighting(html) {
  return html.replace(
    /<pre class="language-(\w+)"><code[^>]*>([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => {
      const highlighted = highlightCode(code, lang);
      return `<pre class="language-${lang}"><code class="language-${lang}">${highlighted}</code></pre>`;
    }
  );
}

const highlightedSlides = slidesWithNotes.map(s => applyHighlighting(s));

// Deck-logo (`logo:`) USED TO BE RE-RUN HERE, and deleting that call is the fix for
// #1652's own regression rather than a tidy-up.
//
// The claim it stood on: "deck-logo is the ONE injector that keys off
// `data-lattice-slide` — which engineSlides() stamps AFTER engine.render — so the
// engine's own logo pass no-ops and the emulator runs it here, post-stamp." The first
// half was true and was the bug: keying on an attribute `lib/engine` never writes made
// the injector dead on the canonical render path, so `logo:` produced nothing in the
// Studio, the playground and every live preview. The engine's pass selects slides with
// the shared section walker now, so it does the work inside engine.render — and this
// second pass became a DUPLICATE. It was not a harmless one: `applyBackdropToHtml` puts
// the finish wrapper ahead of the mark, so the re-run's first-child guard missed and
// stacked a second logo on every finish slide of a logo deck.
//
// One injector, one call site. Nothing to re-run post-stamp, because nothing in the
// logo path reads `data-lattice-slide` any more.
const slidesWithMeta2 = highlightedSlides.join('\n');
// `data-lattice-slide-bake` USED TO BE STAMPED HERE, and its removal is the
// acceptance test #1332 set for the inversion above: "a correct fix should let us
// DELETE the reconciliation devices, not accumulate more."
//
// What it did: the texture polarity pins in themes/{onyx,concrete,a11y-base}.css are
// valid exactly where a diagram's ink is baked PER SLIDE, and this attribute was what
// said so. It had to exist because the two render paths disagreed about granularity —
// this one baked per slide, the runtime baked ONCE from the first section — so the
// pins were right here and wrong there. Pinned live on a runtime path, a
// `_class: dark` slide got a dark chip under slide-1's dark ink: 1.55:1 in a real
// marp-cli render, where before it was 17.14:1.
//
// #1332 step 3 ended the disagreement: the runtime now resolves its palette from the
// section it is rendering. Both paths bake per slide, the pins are unconditionally
// correct, and an attribute that announces "this render baked per slide" announces
// nothing. Deleted, along with `SLIDE_BAKE_ATTR`/`stampSlideBake` in
// lib/core/resolve-color-mode.js and the `[data-lattice-slide-bake]` qualifier on all
// nine pinned selectors.
//
// ONE case still needs the pins to stand down, and `:not(.print)` on every pin is now
// sufficient for it: `--print` bakes one B&W band deck-wide, and `print` reaches EVERY
// section — including one that pins its own `_class: dark`, which used to evict it
// (lib/core/color-mode.js `slidePinEvictsDeckToken`). That eviction was the seam the
// marker actually stood on; closing it is what let the marker go.

// ── KaTeX CSS link ────────────────────────────────────────────────────────
// KaTeX's CSS references font files via relative `url(fonts/…woff2)` paths,
// so we link to the actual file in node_modules; the browser resolves the
// font URLs against that origin. file:// works under puppeteer because
// allowLocalFiles is the default for `page.goto('file://...')`.
const katexCssLink = katexCssAbsPath
  ? `<link rel="stylesheet" href="file://${katexCssAbsPath}">`
  : '';

// ── function-plot script + bootstrap ──────────────────────────────────────
// Only emitted if at least one slide actually contains a functionplot block,
// so decks that don't use it pay nothing. The bootstrap runs synchronously
// on DOMContentLoaded, which any navigation wait already covers: the <script src>
// above is parser-blocking, so `window.functionPlot` exists by DOMContentLoaded, and
// `inflate()` is synchronous d3 with no fetch of its own. The render navigates with
// `waitUntil: 'load'`, which fires strictly after DOMContentLoaded. (This comment used
// to credit `networkidle0`; that was true but stronger than the facts — DOMContentLoaded
// already precedes `load`, so the extra idle wait was never what covered this.)
const hasFunctionPlot = highlightedSlides.some(s => s.includes('class="functionplot"'));
const functionPlotScript = (hasFunctionPlot && functionPlotJsAbsPath)
  ? `<script src="file://${functionPlotJsAbsPath}"></script>
<script>
(function(){
  function inflate() {
    if (typeof window.functionPlot !== 'function') return;
    document.querySelectorAll('div.functionplot[data-fp-config]').forEach(function(div){
      if (div.dataset.fpInflated === '1') return;
      try {
        var cfg = JSON.parse(atob(div.getAttribute('data-fp-config')));
        var rect = div.getBoundingClientRect();
        cfg.target = div;
        cfg.width  = cfg.width  || Math.round(rect.width)  || 480;
        cfg.height = cfg.height || Math.round(rect.height) || 320;
        // Disable hover tip in static PDF — it only adds DOM mass.
        if (!cfg.tip) cfg.tip = { renderer: function(){} };
        window.functionPlot(cfg);
        div.dataset.fpInflated = '1';
      } catch (e) {
        div.textContent = 'functionplot error: ' + e.message;
        div.classList.add('functionplot-error');
      }
    });
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', inflate);
  else inflate();
})();
</script>`
  : '';

// ── state-chart browser-measured layout bootstrap ─────────────────────────
// state-chart emits HTML nodes + a transitions JSON attr + an empty SVG
// overlay; the browser measures the laid-out nodes and draws the edges.
// Only emitted if a slide actually contains a state-chart figure, and it
// runs on DOMContentLoaded, which the navigation's `waitUntil: 'load'` covers —
// the same pre-render-then-PDF flow function-plot uses. Its first draw is in fact
// synchronous at parse time; the DOMContentLoaded and `fonts.ready` handlers are
// re-draws. The `fonts.ready` one is a promise continuation no navigation wait ever
// covered; what keeps it correct is NOT registration order — see the invariant written
// beside the Node-side force-load below, which is the accurate account. The function body
// is the canonical installStateChartLayout from the kernel, serialised so
// the emulator and lattice-runtime share one implementation.
const hasStateChart = highlightedSlides.some(s => s.includes('state-chart-figure'));
let stateChartScript = '';
if (hasStateChart) {
  try {
    const { STATE_CHART_BROWSER_JS } = require('./lib/components/chart/state-chart/state-chart.transform');
    stateChartScript = `<script>\n${STATE_CHART_BROWSER_JS}\n</script>`;
  } catch (_e) { /* kernel unavailable; figures degrade to an empty overlay */ }
}

// ── Document accessibility metadata (WCAG 2.4.2 title, 3.1.1 language) ─────────
// An exported HTML/PDF shell with no <title> and no lang is a tracked a11y gap
// (semantic-html-accessibility.md G1/G2): a screen reader can't announce the deck's
// name or language, and Chrome's print-to-PDF carries neither into the file. Derive
// both from the deck — front-matter `title:`/`lang:`, else the first heading / a safe
// default — and stamp them on the shell. Reuse the ENGINE's front-matter parser
// (HARD RULE #1) so title/lang read exactly like theme/size (quote- + CRLF-tolerant),
// and strip fenced code so a `# comment` inside a leading code block isn't the title.
const { parseFrontMatter: parseFm } = require('./lib/engine/directives');
const { directives: deckFm, body: deckBody } = parseFm(rawMd);
const cleanTitle = (t) => String(t == null ? '' : t).replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
const deckLang = (String(deckFm.lang || '').match(/^[A-Za-z][\w-]*/) || ['en'])[0];
const firstHeading = (deckBody.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '').match(/^#{1,3}\s+(.+?)\s*#*\s*$/m) || [])[1];
const deckTitle =
  cleanTitle(deckFm.title) ||
  cleanTitle(firstHeading) ||
  path.basename(outFile).replace(/\.[^.]+$/, '') ||
  'Lattice deck';

// ── HTML document ─────────────────────────────────────────────────────────────
// The page's single deck `<style>`, assembled as ONE string so the whole element body
// goes through `sanitizeStyleText` at the point it is embedded, rather than each
// caller-influenced piece being remembered separately. Three of the pieces below are
// caller-supplied — `css` (the palette chain + the `--css` layout sheet) and
// `globalStyle` (the deck's own front-matter `style:` block) — and a `</style>` in any
// of them ends the element for the parser, comment or no comment (HARD RULE #22).
const deckStyleText = `@page { size: ${slideW}px ${slideH}px; margin: 0; }
body  { margin: 0; padding: 0; }
${css}
section[data-lattice-slide] { width: ${slideW}px !important; height: ${slideH}px !important; }
${geometryStyle}
${orientationStyle}
${marpSystemCss}
/* Skip link — the keyboard bypass for a deck that is otherwise a flat pile of
   slides (WCAG 2.4.1). Off-screen rather than hidden, so it stays in the tab
   order; revealed on focus because a sighted keyboard user has to SEE it. The
   rules live HERE, inline, so a missing stylesheet can never leave it rendering
   visibly. Hidden in print: the exported PDF has no tab order, and an
   off-screen absolute box must not influence pagination. */
.lat-skip-link{position:absolute;left:-9999px;top:0;z-index:9999;padding:10px 16px;background:var(--accent,#4338ca);color:var(--on-accent,#fff);font:600 14px/1.2 system-ui,sans-serif;text-decoration:none}
.lat-skip-link:focus{left:0}
@media print{.lat-skip-link{display:none}}
/* The deck landmark adds no box of its own — the slides keep their own geometry. */
main#deck{margin:0;padding:0;display:block}
/* …EXCEPT in the FLUID viewer, where interposing any element between <body> and the
   slides is NOT layout-neutral. base.fluid-view.css makes <body> a centred flex column
   and sizes each slide with min(100%, 100dvh * --fill-max-aspect). That percentage
   resolves against the slide's PARENT — so once <main> sits in between, body's
   align-items:center shrink-to-fits it, the percentage resolves against a
   content-derived width, and every slide collapses to ZERO WIDTH. The viewer
   self-activates on load, so a recipient double-clicking the exported .html saw a
   blank page.
   The ADR's §10-R4 argument for this being the one sanctioned wrap — "<main> has no UA
   margin and the theme CSS is section-scoped" — is about MARGINS and SPECIFICITY. It
   never considered CONTAINING BLOCKS, which is what "never wrap" (§2 reason 1)
   actually protects. A wrapper adds no box and still changes layout.
   Fix: make <main> transparent to the flex column — same axis, full width — so the
   slides resolve their percentage against the same box they did before. */
:root[data-lattice-view="fluid"] main#deck{display:flex;flex-direction:column;align-items:center;width:100%;min-width:0;flex:1 0 auto}
${globalStyle ? `\n/* Front-matter style: directive */\n${globalStyle}\n` : ''}`;

const htmlDoc = `<!DOCTYPE html>
<html lang="${escapeHtml(deckLang)}"><head><meta charset="utf-8">
<title>${escapeHtml(deckTitle)}</title>
${embeddedFonts}
${katexCssLink}
<style>
${sanitizeStyleText(deckStyleText)}
</style></head><body>
<a class="lat-skip-link" href="#deck">Skip to the slides</a>
${a11yTextureDefs}
<main id="deck" tabindex="-1">
${slidesWithMeta2}
</main>
${functionPlotScript}
${stateChartScript}
<script>
/* Overflow watcher — tags any section whose content exceeds the slide
   frame with class "overflow" so lattice.css can draw the red warning ring.
   Mirrors the watcher in lattice-runtime.js (used by the VS Code preview). */
(function(){
  var TOL = 12;
  var CLIP_CELL_SELECTOR = ${JSON.stringify(CLIP_CELL_SELECTOR)};
  // Clip boxes that are never evidence of lost content — decorative bleeds, invisible
  // a11y mirrors, our own marker chrome. Both probes take it; see overflow-probe.js.
  var IGNORED_CLIP_SELECTOR = ${JSON.stringify(IGNORED_CLIP_SELECTOR)};
  var IGNORED_BEARER_SELECTOR = ${JSON.stringify(IGNORED_BEARER_SELECTOR)};
  // The resolved overflow-marker level, stamped on every slide so base.modifiers.css
  // can pick the TONE (author = red ring + "Overflows"; reader = no ring + a calm
  // "Content clipped" pill). Same attribute the browser runtime stamps.
  // (No backticks in this string -- it is injected into a template literal.)
  var MARKER_LEVEL = ${JSON.stringify(OVERFLOW_MARKER.marker)};
  var overflowTabText = ${OVERFLOW_TAB_TEXT_SRC};
  var probeSectionOverflow = ${PROBE_SRC};
  var probeContentClipped = ${CONTENT_CLIPPED_SRC};
  var probeFigureLegibility = ${LEGIBILITY_SRC};
  // The legibility tab's LABEL and its add/update/remove decision are injected from the
  // same policy module the live runtime imports (lib/runtime/fluid-view-policy.js), not
  // re-typed here — the two watchers stamp the same class and must not drift in what they
  // call the same measurement (HARD RULE #15).
  var legibilityTabText = ${LEGIBILITY_TAB_TEXT_SRC};
  // The marker's chrome is emitted WITH the slide, so this watcher only ever fills
  // it -- same element the browser runtime fills, injected from the same kernel so
  // the two cannot drift (HARD RULE #1). It mints on a miss rather than returning
  // nothing, so a document that predates the berth still gets its marker.
  // (No backticks in this comment -- it is injected into a template literal.)
  var berth = ${BERTH_SRC};
  var settleFonts = ${SETTLE_FONTS_SRC};
  function check(){
    document.querySelectorAll('section[data-lattice-slide]').forEach(function(s){
      // Cell-aware probe — a clipping content cell hides its overflow from the
      // section, so probe the cells too (lib/core/overflow-probe.js).
      var probed = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL, IGNORED_CLIP_SELECTOR);
      var over = probed.over;
      s.classList.toggle('overflow', over);
      if (s.getAttribute('data-lattice-overflow-marker') !== MARKER_LEVEL) {
        s.setAttribute('data-lattice-overflow-marker', MARKER_LEVEL);
      }
      // WHAT THE READER IS TOLD is a narrower question than what the author is shown.
      // "author" keeps pure geometry: an over-subscribed box is a defect to fix whether
      // or not today's copy happens to fit inside the spill. "reader" asks whether the
      // clip actually CUT something readable or visible, because the pill makes a claim
      // to a recipient and a recipient can only check it by looking. On the shipped
      // corpus 18 bare-kpi slides overflow by 282-416px of pure padding with every
      // glyph inside the frame -- a "Content clipped" tag there is not true.
      // (lib/core/overflow-probe.js probeContentClipped.)
      // OVERPRINT counts as lost content even though it crosses no box edge: a
      // flex-shrunk child paints over its next sibling, so a reader gets text on top
      // of text. probeContentClipped cannot see it (no rect leaves a clip box), so
      // ask the geometry probe, which already measures it, for the number.
      // ...and the content probe is no longer GATED BEHIND the geometry probe, which is
      // the #1299 design question answered. It used to read "over AND (... OR cut)", so a
      // geometry blind spot was load-bearing for all three registers at once: the content
      // probe could never rescue a slide geometry missed, and #1299 shipped 24 cut text
      // rects at over:false because of it. clipSuspect is the cheap, over-eager
      // "is any clip box hiding anything at all" from the same probe, so the expensive
      // walk still stays off the slides where nothing clips -- it just no longer needs
      // the GEOMETRY to have been right first.
      // (No backticks in this comment -- it is injected into a template literal.)
      var isAuthor = MARKER_LEVEL === 'author';
      var clip = (over || probed.clipSuspect)
        ? probeContentClipped(s, IGNORED_CLIP_SELECTOR, TOL, IGNORED_BEARER_SELECTOR)
        : { cut: false, first: null, chromeOnly: false };
      // DETECTION is general; TREATMENT is not. Every cut counts for the author -- the
      // running footer's included, which is why there is no exemption in the probe. A cut
      // ENTIRELY inside the footer band is not shown to a READER: the reader pill lives in
      // that band, so it painted an opaque capsule over the confidentiality line it was
      // reporting, on every page of any deck with an ordinary footer. See the climb in
      // lib/core/overflow-probe.js. Must match lib/runtime/index.js exactly (HARD RULE #1)
      // or a --fluid export disagrees with the PDF beside it.
      // (No backticks in this comment -- it is injected into a template literal.)
      var tell = isAuthor
        ? (over || clip.cut)
        : ((over && probed.squeezed > TOL) || (clip.cut && !clip.chromeOnly));
      // The overflow tab. The ring is colour-only (WCAG 1.4.1), so the condition is
      // named in text -- and the text differs by level AND by condition. "Overflows" is
      // the geometry word and was wrong on the population this change added: an ellipsed
      // label has over:false, so the author got a red OVERFLOWS flag with no ring beside
      // it and went hunting for a spill that was correctly absent.
      // The "off" level draws none; the strip pass below clears the class too.
      // FILLS a berth the markup already carries (lib/core/fit-berth.js); it does
      // not create or remove one. That is what makes this watcher and the browser
      // runtime's produce the same DOM for the same level -- a --fluid export runs
      // BOTH, and while they each minted their own tab the two could disagree about
      // wording, about whether one existed at "off", and about which of them won.
      // Empty text is the "no marker" state; the CSS already hides an unmarked tab.
      // (No backticks in this comment -- it is injected into a template literal.)
      var oTab = berth(s, 'overflow-tab');
      var tabWord = (MARKER_LEVEL !== 'off' && tell) ? overflowTabText(isAuthor, isAuthor && !over) : '';
      if (oTab && oTab.textContent !== tabWord) oTab.textContent = tabWord;
      // ONE class, orthogonal to the geometric .overflow: clip-marked IS tell. It
      // replaced two conjunction classes that between them left a slide which BOTH
      // overflows and cuts carrying neither, and let CSS un-hide a population by one
      // class while styling it by the other. Never stamped under the off level, which
      // promises to leave nothing -- the sweep clears once at boot and this watcher
      // re-stamps on every settle, so an unguarded toggle loses that race.
      // (No backticks in this comment -- it is injected into a template literal.)
      s.classList.toggle('clip-marked', MARKER_LEVEL !== 'off' && tell);
      // §8 rule 8 — a viewBox figure NEVER overflows its box; it shrinks its own text instead,
      // so the probe above is blind to it by construction. Ring it separately when the figure's
      // rendered type falls below the deck's own smallest size.
      // AUTHOR-ONLY, matching the overflow branch above and the runtime's own gate
      // (lib/runtime/index.js). A reader cannot resize a figure, so "Type 3px ·
      // floor 8.4px" is a QA diagnostic in front of an audience. Ungated, it rode
      // into the exported .html -- which is written BEFORE the level-aware strip
      // runs, so nothing cleaned it up there.
      var leg = MARKER_LEVEL === 'author' ? probeFigureLegibility(s, ${FIGURE_TEXT_FLOOR_RATIO}) : null;
      var under = !!(leg && leg.under);
      s.classList.toggle('illegible', under);
      // The labelled tab — the ring is colour-only (WCAG 1.4.1), so name the condition in text,
      // and name it with the NUMBERS, since "too small" is only actionable next to the floor it
      // missed. Presence-guarded; position:absolute, so it never changes the measured height.
      var tab = berth(s, 'illegible-tab');
      var legWord = under ? legibilityTabText(leg) : '';
      if (tab && tab.textContent !== legWord) tab.textContent = legWord;
    });
  }
  // Force every declared @font-face to load before the FIRST measurement —
  // Marp's template lazy-loads fonts per active slide, so a bare
  // document.fonts.ready can resolve "loaded" before a font a not-yet-
  // rendered slide's text actually needs has been fetched, leaving that
  // slide measured against FALLBACK metrics (wider/taller than the real
  // font). A borderline slide can cross the 12px tolerance on fallback
  // metrics alone and get a FALSE "Overflows" ring that never clears —
  // this script only re-checks on 'resize', so nothing else would ever
  // correct it on a static file a human just opens and reads (found via a
  // Puppeteer/Playwright cross-check, #894). measureOverflow() (the pass
  // that generates the PDF export's console warning) was never affected —
  // its call sites force-load fonts first. 2s bound: a hung font fetch must
  // not suppress the ring FOREVER on a static file nothing else re-checks.
  function settleFontsThenCheck(){
    try { settleFonts(document.fonts, 2000).then(check, check); }
    catch (e) { check(); }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', settleFontsThenCheck);
  else settleFontsThenCheck();
  if (typeof window !== 'undefined') window.addEventListener('resize', check);
})();
</script>
</body></html>`;

// For an `.html` OUTPUT the sidecar IS the deliverable, so it resolves to `outFile`
// ITSELF rather than to `<out>.html.html`. Taken as an identity rather than by
// round-tripping the extension through the strip-and-append below, because that
// rebuilds the extension in LOWERCASE: `deck.HTML` resolved to `deck.html`, so the
// path the caller asked for was never written and the run still exited 0
// (red-team, this PR). Case-insensitive filesystems hide it; CI does not.
const outHtml = OUT_FORMAT === 'html'
  ? outFile
  : outFile.replace(/\.(pdf|pptx|png|zip|html)$/i, '') + '.html';
// Strip the live-preview runtime (lattice-runtime.js) from the export HTML.
// A deck may embed `<script src="…/lattice-runtime.js">` for the VS Code / web
// preview; that runtime runs the overflow watcher, which CREATES the red
// ".overflow-tab" and re-marks sections on a MutationObserver/ResizeObserver/rAF
// loop — re-painting the authoring badge during print and defeating the
// export-stays-clean contract. Mermaid is pre-rendered to SVG at build time and
// styling is the embedded lattice.css, so the runtime is a documented no-op for
// the deliverable. We drop the tag rather than intercept the request per render:
// request interception adds latency to every page load (it slows the 53-component
// invariants suite enough to time out in CI). The class-strip below still clears
// the emulator's own inline-watcher ring.
const RUNTIME_SCRIPT = /[ \t]*<script\b[^>]*\blattice-runtime(?:\.min)?\.js[^>]*><\/script>\s*/gi;
// The CLEAN export HTML: drop any deck-embedded <script src=…runtime…> tag (the
// relative/file:// path won't resolve in a shared HTML, and the runtime is a
// no-op on already-rendered export DOM). This is what the PDF/PPTX/PNG raster
// loads below — so those outputs are byte-identical whether or not --fluid is
// set. The fluid VIEWER is derived from this clean HTML and written over outHtml
// ONLY after rasterization (see toFluidViewer / the post-raster rewrite).
let cleanDocHtml = htmlDoc.replace(RUNTIME_SCRIPT, '');

// Build the opt-in fluid viewer from the clean export HTML: flag the page
// fluid-capable and inline the runtime (the controller re-derives orientation
// and wires the toggle). Self-contained so the .html stays a single emailable
// file. Returns the clean HTML unchanged if the runtime bundle is missing.
function toFluidViewer(cleanHtml) {
  const runtimePath = path.join(PKG_ROOT, 'dist', 'lattice-runtime.min.js');
  if (!fs.existsSync(runtimePath)) {
    if (!QUIET) console.warn(`warning: --fluid set but ${path.relative(PKG_ROOT, runtimePath)} is missing — run \`npm run runtime:build\`; the viewer will not reflow.`);
    return cleanHtml;
  }
  // The bundle builds HTML strings containing `</script>`, `<script`, and `<!--`;
  // inlined raw they prematurely close this <script> element and the whole
  // runtime fails to parse. Escape the `<` of just those sequences with \x3C —
  // valid only inside the string/regex literals where they occur, so the executed
  // JS is unchanged. (See HTML spec, script-data states.)
  const runtimeJs = fs.readFileSync(runtimePath, 'utf8')
    .replace(/<(?=!--|\/?script)/gi, '\\x3C');
  return cleanHtml
    .replace(/<html\b/i, '<html data-lattice-fluid-capable')
    // Function replacement (not a string) so `$&`/`$1`/`$$` inside the minified
    // runtime are inserted literally, not interpreted as replace patterns.
    .replace(/<\/body>/i, () => `<script>\n${runtimeJs}\n</script>\n</body>`);
}

// Write the clean export HTML now; the raster path below loads it. If --fluid,
// the post-raster rewrite replaces it with the viewer once raster is done.
fs.writeFileSync(outHtml, cleanDocHtml);
// Skipped when the HTML *is* the deliverable: this fires BEFORE the auto-split pass
// rewrites the file, so its count is the pre-split one. The `.html` branch logs the
// final rendered-page count instead, and one line beats two disagreeing ones.
if (!QUIET && OUT_FORMAT !== 'html') console.log(`HTML: ${slides.length} slides → ${outHtml}`);

// ── PDF via Puppeteer ─────────────────────────────────────────────────────────
// Locate puppeteer in either: a local node_modules (preferred), the project
// node_modules, or the mermaid-cli installation (which bundles its own copy).
function loadPuppeteer() {
  const tryPaths = [];
  // Standard resolution (project deps, current user node_modules)
  tryPaths.push('puppeteer');
  tryPaths.push('puppeteer-core');
  // mermaid-cli's bundled puppeteer — try both global install locations
  // and any local install. Use `npm root -g` to find the actual global path.
  try {
    const globalRoot = require('child_process')
      .execSync('npm root -g', { stdio: ['pipe', 'pipe', 'ignore'] })
      .toString().trim();
    if (globalRoot) {
      tryPaths.push(path.join(globalRoot, '@mermaid-js', 'mermaid-cli', 'node_modules', 'puppeteer'));
    }
  } catch (_e) { /* npm not on path; try other fallbacks */ }
  // Local mmdc install (npm install @mermaid-js/mermaid-cli)
  tryPaths.push(path.join('node_modules', '@mermaid-js', 'mermaid-cli', 'node_modules', 'puppeteer'));
  for (const p of tryPaths) {
    try { return require(p); } catch (_e) { /* try next */ }
  }
  console.error('Puppeteer not found. Install with: npm install puppeteer');
  console.error('Or use the bundled copy: npm install -g @mermaid-js/mermaid-cli');
  process.exit(1);
}
const puppeteer = loadPuppeteer();
const { guard, isTargetGone } = require('./lib/engine/render-guard');
// Per-call watchdog: shorter than any sane outer CI timeout, longer than any
// legit single render op (goto/evaluate/pdf). A true crash is caught by the
// `disconnected` race in ms; this only backstops a SILENT wedge. Override with
// LATTICE_RENDER_WATCHDOG_MS for very large decks on slow hardware. See #502.
const RENDER_WATCHDOG_MS = Number(process.env.LATTICE_RENDER_WATCHDOG_MS) || 90000;
// Snapshot the pre-split deck HTML so a hardened RETRY starts from a clean slate
// (the autosplit loop below mutates cleanDocHtml + rewrites outHtml in place).
const initialDocHtml = cleanDocHtml;

// One render+export attempt. `hardened` adds the flags that fix the classic
// swiftshader "Target closed" GPU-process crash (--disable-gpu) and the
// /dev/shm exhaustion crash in small containers (--disable-dev-shm-usage).
async function renderExport({ hardened }) {
  const launchOpts = {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      ...(hardened ? ['--disable-dev-shm-usage', '--disable-gpu'] : []),
    ],
    headless: 'new',
  };
  if (CHROME_EXEC) launchOpts.executablePath = CHROME_EXEC;
  // Reset to the pre-split baseline so each attempt renders from clean HTML.
  cleanDocHtml = initialDocHtml;
  fs.writeFileSync(outHtml, cleanDocHtml);

  // Guard launch itself with the watchdog (no browser to listen on yet). If
  // launch ITSELF wedges, the watchdog rejects but `browser` is never bound, so a
  // half-spawned Chrome can be orphaned — unavoidable without a PID hook into
  // puppeteer's launch, and the process exits non-zero right after anyway.
  const browser = await guard(null, () => puppeteer.launch(launchOpts), 'browser launch', RENDER_WATCHDOG_MS);
  // Every CDP call below goes through `g`: it races the call against the
  // browser's `disconnected` event (crash → reject in ms) AND the watchdog
  // (silent wedge → reject in seconds), so a wedged Chrome NEVER hangs to the
  // outer timeout. A guarded, idempotent close (with a SIGKILL fallback) tears
  // the browser down even when it is itself wedged.
  const g = (op, label) => guard(browser, op, label, RENDER_WATCHDOG_MS);
  let closed = false;
  const closeBrowser = async () => {
    if (closed) return;
    closed = true;
    try {
      await guard(null, () => browser.close(), 'browser close', 15000);
    } catch (_e) {
      try { browser.process()?.kill('SIGKILL'); } catch (_e2) { /* already gone */ }
    }
  };

  try {
    return await renderBody(browser, g, closeBrowser);
  } finally {
    await closeBrowser();
  }
}

async function renderBody(browser, g, closeBrowser) {
  const page = await g(() => browser.newPage(), 'new page');
  // Set viewport to slide dimensions so section's own cqi properties (padding,
  // border-top) resolve against the correct ICB in screen mode.  Without this,
  // Puppeteer's default 800×600 viewport causes section's cqi fallback to
  // resolve to 6.875% × 800 = 55 px instead of the intended 88 px (HD) or
  // 264 px (4K), which makes the overflow-detection pass see a different
  // content area than the printed PDF.
  // PDF prints at 1× (the vector page is resolution-independent). PNG/PPTX
  // rasterize, so scale up for crisp images while keeping the long edge near
  // 3840px — a 4K (3840×2160) @size at 2× would paint a 7680px canvas and risk
  // an OOM (same trade-off the browser exporter makes). The largest integer
  // factor whose long edge stays ≤ 3840: HD (1280) → 2×, 4K (3840) → 1×, and any
  // custom @size is capped rather than left to blow up.
  const RASTER = OUT_FORMAT === 'pptx' || OUT_FORMAT === 'png' || OUT_FORMAT === 'imageset' || RASTER_PDF;
  // The image set honors its `--image-size` preset (shared with the Studio via the
  // kernel's resolveRasterScale); every other raster path keeps the historical
  // long-edge-capped 2× (HD → 2×, 4K → 1×).
  const rasterScale = OUT_FORMAT === 'imageset'
    ? resolveRasterScale(IMAGE_SET_OPTS.size, slideW, slideH)
    : (RASTER ? Math.max(1, Math.min(2, Math.floor(3840 / Math.max(slideW, slideH)))) : 1);
  await g(() => page.setViewport({ width: slideW, height: slideH, deviceScaleFactor: rasterScale }), 'set viewport');
  // DEFERRED MEDIA — the one class `load` genuinely does not wait for, and the reason
  // this step exists rather than riding on the navigation wait.
  //
  // The engine emits no lazy media, but the engine is not the only author of the
  // document: `lib/engine/index.js` sets markdown-it `html: true`, so a deck can carry
  // raw `<img loading="lazy">`. Chromium defers a below-viewport lazy image until AFTER
  // the load event — measured against a 1,500 ms delayed server, `load` returned in 15 ms
  // where `networkidle0` waited 2,014 ms — and every slide after the first is below a
  // 1280x720 viewport. So under `load` alone the fetch never starts and the export ships
  // WITHOUT the image, silently, exit 0: `pdfimages -list` showed the image object present
  // under `networkidle0` and NO image objects at all under `load`.
  //
  // `networkidle0` only ever covered this by accident of timing. Lazy loading is
  // meaningless in a one-shot static export, so this makes it explicit instead: promote
  // every deferred image and frame to eager, then wait for the pixels. Runs after each
  // navigation, and under `g()`'s watchdog, so a resource that never answers fails the
  // render loudly rather than hanging it.
  const settleDeferredMedia = async (label) => {
    const timedOut = await g(() => page.evaluate(async () => {
      // EVERY wait here is bounded, and that is not defensive noise — an unbounded one
      // wedged the render. A first cut awaited `load` on every <iframe> that did not
      // report `contentDocument.readyState === 'complete'`. For an opaque-origin frame
      // (file://, http://, data: — i.e. all the ordinary ones) `contentDocument` is
      // **null rather than a throw**, so the check said "not done" for a frame whose
      // load event had ALREADY fired during the navigation; the listener could never
      // fire and the render hung until the watchdog killed it, ~190 s, then failed.
      // The mirror-image bug sat in the same line: a same-origin LAZY frame reports its
      // initial about:blank as 'complete', so it was skipped and never awaited at all.
      const BOUND_MS = 10000;
      let expired = 0;
      const bounded = (p) => Promise.race([
        Promise.resolve(p).then(() => false, () => false),
        new Promise((r) => setTimeout(() => { expired++; r(true); }, BOUND_MS)),
      ]);

      const waits = [];
      // FRAMES. Only the ones we promote need awaiting: an already-eager frame was
      // covered by the load event we navigated on. `readyState` cannot tell us whether a
      // promoted frame has arrived (see above), so the listener is the only signal, and
      // it is bounded because it may be attached after the event it waits for.
      const frames = [...document.querySelectorAll('iframe[loading="lazy"]')];
      for (const frame of frames) {
        frame.loading = 'eager';
        waits.push(bounded(new Promise((resolve) => {
          frame.addEventListener('load', resolve, { once: true });
          frame.addEventListener('error', resolve, { once: true });
        })));
      }
      // IMAGES need no promotion: `decode()` on a deferred lazy image starts and
      // completes the fetch by itself (measured). Not touching `loading` also keeps the
      // attribute out of the DOM the --player bake captures, so the export still carries
      // what the author wrote.
      for (const img of document.images) {
        if (typeof img.decode === 'function') waits.push(bounded(img.decode()));
      }
      await Promise.all(waits);
      return expired;
    }), `settle deferred media${label}`);
    // A resource that never answers is a defect in the DECK, not in the render, so it
    // must not fail the export — but it must not pass silently either, which is the
    // whole complaint against the wait this change removed.
    if (timedOut && !QUIET) {
      console.warn(`  ⚠ ${timedOut} deferred resource(s) did not settle within 10s — exported without them.`);
    }
  };

  // `load`, not `networkidle0`. The two are not a correctness/speed trade here: `load`
  // already waits for every resource kind this document actually contains, and the
  // document issues nothing after it. Both halves are measured, not inferred — the
  // inferred answers in this area have a poor record (see the correction log in
  // engineering/decisions/2026-08-16-render-format-cost-assessment.md §9).
  //   • Serving each resource kind behind a deliberate delay, `load` WAITS for
  //     <img>, CSS `background-image: url()`, <link rel=stylesheet> and the webfont
  //     fetch. Those are exactly what the deck emits: author images are absolute
  //     file:// URLs rather than inlined (`liftBgImages`, deckBaseUrl above), plus the
  //     KaTeX <link> and the function-plot <script src>.
  //   • Instrumenting five real sidecars (state-chart, function-plot, images, the
  //     58-slide jargon gallery, portrait-roadmap): ZERO requests start after the load
  //     event, watched a further 2s past networkidle0. Mermaid is pre-rendered in Node
  //     and inlined, deck fonts are data: URIs, and nothing fetches at runtime.
  // So networkidle0 only ever bought its own idle floor. Sized END TO END through the
  // real CLI rather than from a sidecar probe (the probe read high — it opened a fresh
  // page against a warm browser, a context that pins networkidle0 at 2,002 ms): the
  // saving is 0.66-0.80 s per navigation, 31-59% of a deck's total render depending on
  // how many auto-split passes it drives.
  // Font correctness does NOT rest on this wait; it rests on the explicit unbounded
  // force-load immediately below, which is unchanged.
  await g(() => page.goto('file://' + path.resolve(outHtml), {
    waitUntil: 'load',
    timeout: 60000
  }), 'navigate');
  // Force every declared @font-face to load (incl. the base64 self-hosted
  // faces) and settle before measuring/printing. Marp's template lazy-loads
  // fonts per active slide, so document.fonts.ready alone resolves without
  // faces used only on later slides; explicitly load() them all. Without this
  // the overflow pass and the PDF can be laid out in the fallback metrics.
  // Already correct (spread, not Array.prototype.map.call — see
  // lib/core/font-settle.js's SETTLE_FONTS_SRC, the shared/tested version of
  // this exact recipe used by the embedded export watcher below and the live
  // runtime); left as its own inline `page.evaluate` call rather than
  // refactored onto the shared helper here, since this Node-side async/await
  // call shape differs from the browser-injected Promise-chain one and this
  // is the hot measure/auto-split path — not touched by the bug this file's
  // OTHER two copies had.
  //
  // WHERE THIS LIVES MATTERS, and a comment in the injected watcher below used to
  // get it wrong: `measureOverflow` references `document.fonts` NOWHERE. The
  // force-load is here, in the caller, once per navigation. A new call site added
  // without this preamble would silently measure fallback metrics.
  //
  // AND ONE ORDERING INVARIANT, because the obvious reason for it is false.
  // `STATE_CHART_BROWSER_JS` registers an in-page `document.fonts.ready.then(drawAll)`
  // whose redraw feeds the geometry measured below. It is NOT safe merely because that
  // `.then` was registered before this await: calling `f.load()` on a face that is still
  // `unloaded` switches the FontFaceSet back to loading and REPLACES `document.fonts.ready`
  // with a new promise — measured — at which point the two awaits are on different objects
  // and registration order buys nothing. What actually holds it today is that no face is left
  // `unloaded` when the navigation returns: measured across five real sidecars, 74 declared
  // faces resolve to 37 `loaded` + 37 `error`, and the force-load does NOT replace
  // `document.fonts.ready`. Note BOTH halves, because the tempting one-line version ("deck
  // fonts are `data:` URIs") is false — only 17 faces are base64 `data:`; the other 37 are
  // KaTeX's relative `fonts/…woff2`, fetched and 404. It is their prompt FAILURE, not
  // inlining, that keeps them out of `unloaded`. A theme or `--css` override adding a
  // genuinely remote face that resolves SLOWLY rather than failing would break the invariant
  // and orphan the redraw. Tracked in the cost assessment's §8 rather than guarded here.
  await g(() => page.evaluate(async () => {
    try {
      await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
      await document.fonts.ready;
    } catch (_e) { /* fonts API unavailable — proceed with whatever loaded */ }
  }), 'load fonts');
  await settleDeferredMedia('');
  // The self-contained player's DOM is captured further down, immediately after the
  // overflow-marker level is applied — see "Bake the player's DOM" below. Declared
  // here only because the autosplit loop between here and there may re-render the
  // page, and a capture taken before that would be stale.
  let inflatedPlayerHtml = null;
  // Detect sections whose content exceeds the 1280×720 frame, to WARN the
  // author (with exact pages) — but keep the EXPORT itself clean: the red ring
  // + "OVERFLOWS" tab are NOT burned into the deliverable PDF. A loud red box in
  // front of a board is worse than the subtle clipping the section's
  // overflow:hidden already does, so the export clips and the author is warned
  // below to fix it. The loud ring+tab signal lives in the live preview
  // (lib/runtime), where the author is actively authoring and can act on it.
  // Measure which sections overflow the frame, and BY HOW MUCH (scrollHeight /
  // clientHeight) — the signal both the author warning and the measured auto-split
  // pass below read. Scope to real slide sections only — `<section>` literals inside
  // code blocks parse as nested DOM and would pollute the indices.
  const measureOverflow = () => g(() => page.evaluate(({ structuralCarousel, paginatorCarousel, clipSel, ignoreSel, probeSrc, legibilitySrc, floorRatio }) => {
    const TOL = 12; // filter sub-pixel rounding; see lattice-runtime.js
    // Cell-aware probe (lib/core/overflow-probe.js, injected verbatim): a bounded
    // content cell that clips hides its overflow from section.scrollHeight, so we
    // fold the cell's internal overflow back into the section's effective extent —
    // otherwise autosplit never sees an over-stuffed cell and the content is lost.
    const probeSectionOverflow = new Function('return (' + probeSrc + ')')();
    const probeFigureLegibility = new Function('return (' + legibilitySrc + ')')();
    const out = [];
    document.querySelectorAll('section[data-lattice-slide]').forEach((s, i) => {
      const probe = probeSectionOverflow(s, clipSel, TOL, ignoreSel);
      const vOver = probe.vOver;
      const over = probe.over;
      // §8 rule 8 — the LEGIBILITY FLOOR. A viewBox figure is container-responsive: it never
      // overflows its box, it shrinks its own text, so `probe.over` is structurally blind to it
      // and a dense figure ships silently at 6px type. Reported on its own axis, and NEVER
      // splittable — a figure has no seam to divide, so the honest answer is the ring.
      const leg = probeFigureLegibility(s, floorRatio);
      const illegible = leg?.under ? leg : null;
      // Figures whose labels the probe cannot size at all (mermaid's `<foreignObject>` HTML
      // labels). Carried on its own field so the report can say "not measured" rather than
      // let silence read as "legible" (HARD RULE #23).
      const unmeasured = leg && !leg.count && leg.unmeasured ? leg.unmeasured : 0;
      if (illegible && !over) {
        // Illegible while its box FITS: nothing to split (a figure has no seam), so record and stop.
        out.push({ slide: i + 1, ratio: 1, canSplit: false, splitRatio: 1, illegible, unmeasured });
        return;
      }
      if (!over) return;
      // …and a slide that is BOTH illegible and clipping must be reported on BOTH axes. Returning
      // early above swallowed such a slide's CLIPPED warning and its split — flagged as a latent
      // ordering hazard by the HARD RULE #25 inversion pass, which could not construct the
      // co-occurrence (once the box overflows the figure stops being squeezed) but was right that
      // nothing prevented it. `illegible` now rides along on the record instead of replacing it.
      const C = probe.clientH;
      const ratio = C > 0 ? probe.scrollH / C : 2;
      // A STRUCTURAL carousel (cover-code/cover-sides) re-authors a side-by-side layout to
      // one panel per page, so ANY overflow is actionable — compare-code overflows
      // HORIZONTALLY (two code blocks too wide for a portrait box; one-block-per-page fixes
      // it). Mark it splittable and let resplitDoc's carousel branch own it (the ratio is
      // irrelevant to a structural re-author).
      if (structuralCarousel.some((c) => s.classList.contains(c))) {
        out.push({ slide: i + 1, ratio, canSplit: true, splitRatio: ratio, illegible, unmeasured });
        return;
      }
      // A VERTICAL PAGINATOR (cover-paginate) divides a row/item collection; it can only fix
      // VERTICAL overflow. A too-wide table overflows HORIZONTALLY — row-splitting it is
      // futile and balloons the deck — so gate canSplit on vOver and leave a width-overflow
      // for the ring (this is the guard that lets a wide compare-table / obligation-matrix
      // carry a split recipe without ever ballooning).
      if (paginatorCarousel.some((c) => s.classList.contains(c))) {
        out.push({ slide: i + 1, ratio, canSplit: vOver, splitRatio: ratio, illegible, unmeasured });
        return;
      }
      // The auto-splitter only divides a list (ul/ol) or table — so a split can only
      // make the slide fit if THAT collection is the height driver. Measure the tallest
      // such collection and the headroom the surrounding content leaves: if the
      // non-collection content alone already fills the box (a tall <p>/figure/code with
      // an incidental list), splitting just copies that block onto every piece and never
      // fits — leave it for the ring. `canSplit` gates the measured pass; `splitRatio`
      // sizes it from the collection's own height, not the whole slide's.
      // The collection's REAL extent, not its laid-out box. `offsetHeight` was the measure, and
      // in a bounded flex stage it reports the SQUEEZED height: a checklist's `ul` inside
      // `section.checklist > .cell-stage { display: flex; flex-direction: column }` shrank to
      // offsetHeight 0 (rect 0, scrollHeight 312) and the veto therefore concluded the
      // collection contributed NOTHING to the overflow — the exact opposite of the truth — and
      // refused to split a slide whose list was the entire driver. It clipped, silently.
      // `scrollHeight` is the content extent a clipping or squeezed box hides, which is what
      // "how tall does this collection want to be" means; the rect is the floor for the ordinary
      // un-squeezed case. Same cell-aware reasoning as `probeSectionOverflow` itself.
      const extentOf = (el) => Math.max(el.scrollHeight, Math.round(el.getBoundingClientRect().height));
      let collH = 0;
      let collEl = null;
      s.querySelectorAll('ul, ol, table').forEach((el) => {
        const h = extentOf(el);
        if (h > collH) { collH = h; collEl = el; }
      });
      // …AND the headroom must be measured against the slide the split will actually EMIT, not
      // the one on screen. The envelope HOISTS the framing lede to the cover and the trailing
      // note/key-insight off every page but the last, so counting them as immovable
      // non-collection content under-reports the room a body page will have. Measured in the
      // emulator on a portrait `checklist` of 8 items with a long lede and a long below-note: the
      // collection read 0 (`offsetHeight` and its rect both 0 against a scrollHeight of 312 — the
      // squeeze above), so the headroom came out at −114 against a 269px floor and the slide was
      // VETOED. It clipped, silently, while the identical slide with the lede and note deleted
      // split cleanly — so the author's fix would have been to cut the lede, which is exactly the
      // content the envelope was built to relocate.
      //
      // Mirrors split-envelope.js's own `ledeSpansIn` / `trailingSpansIn` (HARD RULE #1 — same
      // two regions, read here from the DOM instead of the HTML string): the LEDE is the
      // cell's direct-child <p>s before the collection, minus the code-only eyebrow/subtitle
      // and a chart subtitle; the TRAILING run is the contiguous <p> / .below-note /
      // <blockquote> after it. Deliberately narrow — over-counting would let an unsplittable
      // slide into the loop and balloon the deck.
      let hoistH = 0;
      if (collEl) {
        const cell = s.querySelector(':scope > .cell-stage') || s;
        if (cell.contains(collEl)) {
          const kids = [...cell.children];
          const at = kids.findIndex((el) => el === collEl || el.contains(collEl));
          if (at > 0) {
            for (const el of kids.slice(0, at)) {
              if (el.tagName !== 'P') continue;
              if (el.classList.contains('chart-subtitle')) continue;
              if (el.children.length === 1 && el.firstElementChild.tagName === 'CODE') continue;
              hoistH += extentOf(el);
            }
          }
          for (let k = kids.length - 1; k > at; k--) {
            const el = kids[k];
            if (el.tagName === 'HEADER' || el.tagName === 'FOOTER' || el.tagName === 'NAV') continue;
            const trailing = el.tagName === 'P' || el.tagName === 'BLOCKQUOTE'
              || (el.tagName === 'DIV' && el.classList.contains('below-note'));
            if (!trailing) break;
            hoistH += extentOf(el);
          }
        }
      }
      const headroom = C - (probe.scrollH - collH - hoistH); // room a BODY page will have
      // ── The HORIZONTAL half, which this gate did not have (#1234 group C).
      //
      // `canSplit` keyed on `vOver` alone, so a collection that overflows ONLY sideways
      // was never handed to the measured loop. `list-steps` at `size: square` is the
      // reproduction: its `<ol>` is `display:flex; flex-direction:row`, and six steps want
      // **1291px in a 972px track** (eight want 1852) with `scrollH === clientH` — zero
      // vertical spill. Step 06 rendered entirely off the frame and step 05 sliced
      // mid-word, on a component that declares `capacity.perPage: 1` and would have been
      // completely fixed by pagination. Worse, the slide was over `capacity.hard` and the
      // static pass DID defer it — but a deferred candidate is dropped when the slide is
      // already in the measured list, and it was, with `canSplit: false`. So it fell
      // between the two passes and shipped clipped, while `lint:deck`'s
      // `capacity-autosplit` advisory told the author it would be divided. That is §8
      // rule 10's lie-to-the-author defect, through a different door.
      //
      // The `vOver` gate was RIGHT about its own case and too broad. Its stated reason (at
      // the paginator branch above) is that "a too-wide table overflows HORIZONTALLY —
      // row-splitting it is futile and balloons the deck". True of a `<table>`: its width
      // comes from its COLUMNS and its rows stack vertically, so cutting rows narrows
      // nothing. False of a collection whose MEMBERS run along the inline axis — there,
      // fewer members per page IS a narrower row, and pagination fixes the overflow
      // directly. So the test is not "which direction did it overflow" but "does splitting
      // this collection reduce its width", which is a property of its layout.
      const hOver = collEl ? collEl.scrollWidth - collEl.clientWidth > TOL : false;
      const inlineFlow = (() => {
        if (!collEl || collEl.tagName === 'TABLE') return false; // the counter-case, excluded by construction
        const cs = getComputedStyle(collEl);
        if (cs.display.includes('flex')) return cs.flexDirection.startsWith('row');
        // A multi-COLUMN grid lays members out inline too; a single-column one does not.
        if (cs.display.includes('grid')) return cs.gridTemplateColumns.split(/\s+/).filter(Boolean).length > 1;
        return false;
      })();
      const vSplit = vOver && headroom > C * 0.2;
      const hSplit = hOver && inlineFlow;
      const canSplit = collH > 0 && (vSplit || hSplit);
      // Size the cut from whichever axis is actually binding. For the horizontal case that
      // is how many times too wide the collection is — and the authored `perPage` still
      // wins where it is tighter (`resplitDoc` takes the tighter of the two), so a
      // `perPage: 1` component still atomizes rather than merely halving.
      const splitRatio = vSplit
        ? Math.max(2, collH / headroom)
        : (hSplit ? Math.max(2, collEl.scrollWidth / Math.max(1, collEl.clientWidth)) : ratio);
      out.push({ slide: i + 1, ratio, canSplit, splitRatio, illegible, unmeasured });
    });
    return out;
  }, { structuralCarousel: STRUCTURAL_CAROUSEL_NAMES, paginatorCarousel: PAGINATOR_CAROUSEL_NAMES, clipSel: CLIP_CELL_SELECTOR, ignoreSel: IGNORED_CLIP_SELECTOR, probeSrc: PROBE_SRC, legibilitySrc: LEGIBILITY_SRC, floorRatio: FIGURE_TEXT_FLOOR_RATIO }), 'measure overflow');
  let overflow = await measureOverflow();
  // MEASURED auto-split — the ONLY split trigger, and the loop that makes "split" fit REAL
  // boxes. Divide every overflowing SPLITTABLE slide by how much it overflows, re-render,
  // re-measure, until the deck fits or only un-splittable overflow remains (read-across /
  // atomic / a single item taller than the page — those stay for the ring). This is the pass
  // that catches DENSITY overflow, which no count threshold can see: whether a slide fits is
  // a fact about glyphs in a box, not about how many bullets someone typed.
  //
  // Nothing is fed in here from a count estimate. That is the point of the 2026-07-29
  // correction: a slide over `capacity.hard` that FITS is left exactly as authored, at every
  // size the gate admits. See lib/core/auto-split.js + the-fit-spine.md §3.
  if (AUTOSPLIT_APPLIES) {
    const { resplitDoc, applyRails, applyRelationshipSignals } = require('./lib/core/auto-split');
    for (let pass = 1; pass <= 5 && overflow.some((o) => o.canSplit); pass++) {
      // Only the slides whose OWN collection drives the overflow (canSplit); size each
      // split from its collection-relative ratio so the loop converges instead of
      // re-splitting a slide a tall non-list block keeps over the box.
      const splittable = overflow.filter((o) => o.canSplit).map((o) => ({ slide: o.slide, ratio: o.splitRatio }));
      const r = resplitDoc(cleanDocHtml, splittable, SPLIT_CAP);
      if (!r.changed) break;
      cleanDocHtml = r.html;
      fs.writeFileSync(outHtml, cleanDocHtml);
      // `load` for the same measured reason as the initial navigation above.
      await g(() => page.goto(`file://${path.resolve(outHtml)}`, { waitUntil: 'load', timeout: 60000 }), 'navigate (autosplit)');
      await g(() => page.evaluate(async () => {
        try { await Promise.all([...document.fonts].map((f) => f.load().catch(() => {}))); await document.fonts.ready; } catch (_e) { /* fonts API unavailable */ }
      }), 'load fonts (autosplit)');
      await settleDeferredMedia(' (autosplit)');
      overflow = await measureOverflow();
      if (!QUIET) console.log(`  auto-split (measured) pass ${pass}: ${r.changed} slide(s) divided to fit`);
    }
    // Splitting has converged — NOW stamp the two RUN-LEVEL adornments, run by run (a slide may
    // have split across several passes; only the final grouping knows each run's true length and
    // membership): the k-of-N progress rail, and the §0b relationship signal a connected
    // component's atomized members carry ("→ next: …" / "↻ back to …" / "governs ↓ …" /
    // "Option N of M"). One re-render so both land in the exported DOM.
    // …and RE-BERTH, in the same re-render. The splitter builds each cover page
    // fresh, so a cover carries none of the marker chrome the engine emitted onto
    // the slide it came from — leaving `berth()`'s mint-on-miss as the only thing
    // that would draw its ring. That net works, and it is documented as a branch
    // that should never be taken; a split deck taking it on every cover would make
    // that false. Idempotent, so every page the split preserved is untouched, and
    // it runs AFTER the split rather than before so the pages it berths are the
    // final ones. (lib/core/fit-berth.js applyToDocHtml — the assembled-document
    // form, which slices the head prefix off for the same reason resplitDoc does.)
    const railed = fitBerth.applyToDocHtml(applyRails(applyRelationshipSignals(cleanDocHtml, SPLIT_CAP)));
    if (railed !== cleanDocHtml) {
      cleanDocHtml = railed;
      fs.writeFileSync(outHtml, cleanDocHtml);
      // `load` for the same measured reason as the initial navigation above.
      await g(() => page.goto(`file://${path.resolve(outHtml)}`, { waitUntil: 'load', timeout: 60000 }), 'navigate (rails)');
      await g(() => page.evaluate(async () => {
        try { await Promise.all([...document.fonts].map((f) => f.load().catch(() => {}))); await document.fonts.ready; } catch (_e) { /* fonts API unavailable */ }
      }), 'load fonts (rails)');
      await settleDeferredMedia(' (rails)');
    }
  }
  // §8 rule 8's figures are reported on their OWN line: "clipped" would be a lie (the box fits)
  // and so would "trim content" (the fix is a simpler figure, or a bigger box).
  const illegible = overflow.filter((o) => o.illegible);
  if (illegible.length) {
    const n = illegible.length;
    // "scaled figure", not "viewBox figure": the probe judges a CSS-letterboxed box
    // (`data-fit-k`) on the same axis now, and that box may carry no `<svg>` at all.
    console.warn(`  ⚠ TYPE FLOOR — ${n} scaled figure${n > 1 ? 's' : ''} render${n > 1 ? '' : 's'} text below the ` +
      `legibility floor (${(FIGURE_TEXT_FLOOR_RATIO * 100).toFixed(2)}% of slide height = ${illegible[0].illegible.floorPx}px here): ` +
      illegible.map((o) => `page ${o.slide} at ${o.illegible.minPx}px (${o.illegible.pct}%)`).join(', ') + '.');
    console.warn('    A container-responsive figure never overflows — it scales its own labels instead, so the');
    console.warn('    overflow check cannot see this. Simplify the figure (fewer labels, shorter text), give it a');
    // Level-aware, like the OVERFLOW line below. `author` keeps the amber ring in
    // the artifact, so claiming a clean export there was the tool stating the
    // opposite of what it had just done, on the same run.
    console.warn(`    bigger box, or split it across slides. ${OVERFLOW_MARKER.marker === 'author'
      ? 'The export carries the amber ring and its tag.'
      : 'The export stays clean — no ring is printed, so this warning is the only channel.'}`);
  }
  // …and the figures the floor could not judge AT ALL. Mermaid's `htmlLabels` emit
  // `<foreignObject>` HTML rather than SVG `<text>`, which the probe cannot size — so a
  // flowchart whose labels shrank to 4px would otherwise pass in silence. Said out loud rather
  // than implied: "not measured" is an honest answer, a quiet pass is not (HARD RULE #23).
  const unjudged = overflow.filter((o) => o.unmeasured);
  if (unjudged.length) {
    const n = unjudged.length;
    console.warn(`  ⓘ TYPE FLOOR NOT MEASURED — ${n} slide${n > 1 ? 's' : ''} carr${n > 1 ? 'y' : 'ies'} a viewBox figure whose ` +
      `labels are HTML (<foreignObject>, e.g. a mermaid flowchart): page${n > 1 ? 's' : ''} ${unjudged.map((o) => o.slide).join(', ')}.`);
    console.warn('    The legibility floor could not judge these. Check them by eye.');
  }
  // A slide can be on BOTH lists — its box clips AND its figure is illegible. Only the ones that
  // are illegible while their box FITS are off this one; for them "CLIPPED" would be a lie.
  const overflowing = overflow.filter((o) => !o.illegible || o.ratio > 1).map((o) => o.slide);
  if (overflowing.length) {
    const n = overflowing.length;
    console.warn(`  ⚠ OVERFLOW — ${n} slide${n > 1 ? 's' : ''} exceed the frame and ${n > 1 ? 'are' : 'is'} CLIPPED in this export: page${n > 1 ? 's' : ''} ${overflowing.join(', ')}.`);
    // What the ARTIFACT does about it depends on the level — this line used to say
    // "The export stays clean — no overflow marker is printed", which was true only
    // while this path was hard-wired to strip everything. It reads the setting now,
    // so it has to report what it actually did.
    const marked = {
      // Deliberately hedged: at `reader` the export tags only the slides where the clip
      // actually CUT something readable or visible, so on a slide that overflows by
      // padding alone there is no tag and this warning is the whole signal. Saying "the
      // export marks the clipped slides" flatly would be the same overclaim in the
      // console that the pill itself was making on the page.
      reader: 'The export tags the ones that actually lose content with a "Content clipped" tag; a slide that overflows by padding alone is not tagged, so this warning is its only channel.',
      author: 'The export draws the full authoring signal (red ring, "Overflows" flag) on them.',
      off: 'The export stays clean — no overflow marker is printed, so this warning is the only channel.',
    }[OVERFLOW_MARKER.marker];
    console.warn(`    Fix ${n > 1 ? 'them' : 'it'} before delivering (trim content, or use a layout/fill that fits). ${marked}`);
  }
  // …and the slides that LOSE CONTENT WITHOUT overflowing the frame. Their own line,
  // because "exceeds the frame" is false for them and the fix is different.
  //
  // The two probes ask different questions (2026-07-30-overflow-marker-register.md §"The
  // two registers ask different questions"), and geometry is the one that can be blind:
  // `text-overflow: ellipsis` and `-webkit-line-clamp` truncate real copy with ZERO
  // spill past any box. Live instance: `premise.gallery.md` p3 ellipses 65px — 34% —
  // off the label "Advanced beginner", and every channel read it as fitting. The export
  // tags these for the reader; it was not TELLING the author, so the only person who
  // could fix it was the only person not informed. `overflow:check` reads this line
  // too, so the corpus ratchet counts them (HARD RULE #23 — a channel nothing reads is
  // not a channel).
  const contentOnly = await g(() => page.evaluate(({ ignoreSel, bearerSel, ccSrc, probeSrc, clipSel }) => {
    const TOL = 12;
    const probeContentClipped = new Function('return (' + ccSrc + ')')();
    const probeSectionOverflow = new Function('return (' + probeSrc + ')')();
    const out = [];
    document.querySelectorAll('section[data-lattice-slide]').forEach((s, i) => {
      const p = probeSectionOverflow(s, clipSel, TOL, ignoreSel);
      if (p.over) return;                       // already on the OVERFLOW line above
      if (!p.clipSuspect) return;               // nothing clips anything — skip the walk
      const c = probeContentClipped(s, ignoreSel, TOL, bearerSel);
      if (c.cut) out.push({ slide: i + 1, first: c.first });
    });
    return out;
  }, { ignoreSel: IGNORED_CLIP_SELECTOR, bearerSel: IGNORED_BEARER_SELECTOR, ccSrc: CONTENT_CLIPPED_SRC, probeSrc: PROBE_SRC, clipSel: CLIP_CELL_SELECTOR }), 'measure content cuts');
  if (contentOnly.length) {
    const n = contentOnly.length;
    console.warn(`  ⚠ CONTENT CLIPPED — ${n} slide${n > 1 ? 's' : ''} lose${n > 1 ? '' : 's'} content inside a box that clips, without exceeding the frame: page${n > 1 ? 's' : ''} ${contentOnly.map((o) => o.slide).join(', ')}.`);
    console.warn(`    First cut on each: ${contentOnly.map((o) => `p${o.slide} "${o.first}"`).join(', ')}.`);
    console.warn('    An ellipsis, a line-clamp or a sheared panel head loses text with no box overflow to see,');
    console.warn('    so the frame check above cannot report it. Shorten the copy or give that box more room.');
  }
  // Strip the authoring-only overflow signal before exporting. The injected
  // watcher (and base.modifiers.css) draw a loud red ring + "OVERFLOWS" tab on
  // any `.overflow` section — invaluable while authoring in the live preview,
  // but a red box in front of a board is worse than the silent clip that
  // overflow:hidden already applies. The author is warned on stderr at EVERY level;
  // what the artifact shows is the `overflow-marker` setting's job, resolved above.
  // (Tab visibility keys on `.clip-marked`, not on `.overflow` — a slide can cut content
  // without overflowing — so `off` has to clear THAT class or the pill survives the strip.)
  const level = OVERFLOW_MARKER.marker;
  await g(() => page.evaluate((lvl) => {
    // `off` — the historical behavior of this path, now a CHOICE rather than the
    // only option: clear the ring so the deliverable carries no marker at all. The
    // stderr warning above is then the author's only channel, which is why `off` is
    // never a standing default (lib/core/resolve-overflow-marker.js).
    if (lvl === 'off') {
      for (const s of document.querySelectorAll('section.overflow')) s.classList.remove('overflow');
      for (const s of document.querySelectorAll('section.clip-marked')) s.classList.remove('clip-marked');
      for (const t of document.querySelectorAll('.overflow-tab')) t.remove();
    }
    // The §8 rule 8 TYPE-FLOOR marker is AUTHOR-ONLY at every level below `author`:
    // a reader cannot resize a figure, so an amber alarm reading "Type 3px · floor
    // 8.4px" is a QA diagnostic in front of a boardroom. The stderr warning is the
    // author's channel for it.
    if (lvl !== 'author') {
      for (const s of document.querySelectorAll('section.illegible')) s.classList.remove('illegible');
      for (const t of document.querySelectorAll('.illegible-tab')) t.remove();
    }
  }, level), 'apply overflow marker level');

  // ── Rough ink — the sketch finish's drawn lines ──────────────────────────
  // Measure in the page → generate in Node → paint back in the page. Rough.js
  // never enters the browser context on this path: `pathsForPlan` is a plain
  // `require` here, so there is no 28KB script to inject per render and no
  // second copy of the library to keep in step with the runtime's.
  //
  // POSITION IS LOAD-BEARING, and it is pinned between two things:
  //   · AFTER every overflow/clip probe above. The overlay is an absolutely
  //     positioned child of `<section>` whose frame paths deliberately
  //     overshoot the slide box; a probe that ran after it would read that
  //     overshoot as content spilling the frame and flag a red ring on a
  //     perfectly fine slide.
  //   · BEFORE the player bake below. The player ships no runtime (it strips
  //     every inline script), so whatever the DOM holds at this instant is
  //     what a shared `--player` file shows forever. Painting after the bake
  //     would give the PDF its ink and the player none — the same class of
  //     split-path bug the overflow marker had before it moved here.
  const inkPlans = await g(() => page.evaluate(({ structures, measureSrc }) => {
    const measure = new Function('return (' + measureSrc + ')')();
    return measure(structures);
  }, { structures: ROUGH_INK_STRUCTURES, measureSrc: MEASURE_ROUGH_INK_SRC }), 'measure rough ink');
  if (inkPlans.length) {
    // Wrapped, and deliberately: the ink is DECORATION. A finish that cannot
    // draw a wobbly line must never take a whole export down with it — the
    // deck still renders, the CSS fallback still draws rules, and the author
    // gets a warning instead of a stack trace where a PDF should have been.
    // `shiftPath` in particular throws by design on a path command it cannot
    // translate, which is the right call for a bug report and the wrong one
    // for someone's board pack.
    try {
      const bySection = new Map();
      for (const plan of inkPlans) {
        const paths = pathsForPlan(plan);
        if (!paths.length) continue;
        const prev = bySection.get(plan.sectionIndex);
        if (prev) prev.push(...paths);
        else bySection.set(plan.sectionIndex, paths.slice());
      }
      const paints = [...bySection].map(([sectionIndex, paths]) => ({ sectionIndex, paths }));
      await g(() => page.evaluate(({ p, paintSrc }) => {
        const paint = new Function('return (' + paintSrc + ')')();
        paint(p);
      }, { p: paints, paintSrc: PAINT_ROUGH_INK_SRC }), 'paint rough ink');
    } catch (e) {
      console.warn(`  ⚠ sketch ink skipped — ${e?.message ? e.message : e}`);
      console.warn('    The slides render with the CSS fallback rules instead of drawn strokes.');
    }
  }

  // Bake the player's DOM NOW — after the level above is applied, before the raster's
  // SVG-image swap mutates the page. One capture carries two things:
  //
  //   · THE OVERFLOW MARKER. The player ships no runtime (player-core.mjs drops every
  //     inline script from this doc — "authoring watcher etc."), so whatever the marker
  //     looks like at this instant is what the shared file shows forever. The old base
  //     was the PRE-BROWSER static render, which no watcher had ever touched — so
  //     `--player` was silently equal to `off` at every level, a second export path
  //     that ignored the setting. That is precisely the failure the settings block
  //     exists to prevent (lib/core/export-settings.js).
  //   · DYNAMIC COMPONENTS. `state-chart` (inline script) and `function-plot`
  //     (file:// script) draw their SVGs in the BROWSER at load, so the player ships
  //     baked static SVG (§A2b) rather than a dead script it would strip, leaving the
  //     diagram blank. This used to be its own earlier capture; taking it here instead
  //     also makes it survive an autosplit re-render.
  //
  // Never fail-hard: a failed capture falls back to the clean static render, which is
  // exactly the behavior that shipped before.
  if (PLAYER) {
    try {
      if (hasStateChart || hasFunctionPlot) {
        // Through the render guard like every other page call in this file: a CDP
        // response that never arrives would otherwise hang to the outer CI timeout
        // instead of failing fast into the hardened retry (lib/engine/render-guard.js).
        // The old capture was unguarded too, but it ran only for dynamic-component
        // decks; this one runs for EVERY --player render, on the largest DOMs the
        // tool serializes, so the unguarded window is no longer narrow.
        await g(() => page.evaluate(() => new Promise((r) => setTimeout(r, 200))), 'player capture: settle inflaters');
      }
      // Bake every Mermaid diagram into a SELF-STYLED svg with native <text> labels
      // before the clone. The player sanitizes its slide DOM, and that sanitizer bars
      // two things a Mermaid svg leans on: its own injected `<style>` (all of mermaid's
      // type + paint) and `<foreignObject>` (EVERY node/edge/cluster label — HTML
      // smuggled into the SVG namespace, the mXSS shape we keep shut). So an unbaked
      // diagram reached the shared file as shapes and arrows with no words at all.
      // `flattenSvgStyles` resolves the computed paint/type inline and rewrites the
      // labels as <text>, leaving nothing for the sanitizer to take.
      //
      // CHARTS are deliberately NOT flattened: they are token-driven, the player ships
      // the deck CSS that drives them, and freezing their computed colors here would
      // pin them to the export-time scheme — killing the player's own dark/light toggle
      // and the Read·Article re-host's `figure.chart-frame` recolor. Mermaid has no
      // such dependency (it bakes its colors at render time either way).
      const { flattenSvgStyles: flattenPlayerSvg } = require('./lib/components/chart/_chart-family/standalone-svg.js');
      await g(() => page.evaluate(`window.__flattenSvgStyles = ${flattenPlayerSvg.toString()};`), 'player capture: inject svg flattener');
      const baked = await g(() => page.evaluate(() => {
        // Clone — never mutate the live page; the raster below still needs it.
        const root = document.documentElement.cloneNode(true);
        const SEL = '.mermaid-svg > svg, .mermaid > svg';
        const live = document.querySelectorAll(SEL);
        const copies = root.querySelectorAll(SEL);
        let unbaked = 0;
        for (let i = 0; i < live.length && i < copies.length; i++) {
          // Per-diagram try: one un-flattenable svg keeps its (unbaked) self rather
          // than costing the whole capture. COUNTED, not swallowed — an unbaked svg
          // keeps its <foreignObject>, the player's sanitizer strips it, and the
          // diagram ships as shapes with no words: precisely the defect this bake
          // exists to prevent. Silence there is indistinguishable from success.
          try {
            copies[i].replaceWith(window.__flattenSvgStyles(live[i], window, { foreignObjectLabels: 'text' }));
          } catch (_e) { unbaked++; }
        }
        return { html: `<!DOCTYPE html>\n${root.outerHTML}`, unbaked, total: live.length };
      }), 'player capture: serialize baked DOM');
      inflatedPlayerHtml = baked.html;
      if (baked.unbaked) {
        console.warn(
          `  WARNING: ${baked.unbaked}/${baked.total} diagram(s) could not be baked for the player; ` +
            'they will ship without their labels.'
        );
      }
    } catch (_e) { inflatedPlayerHtml = null; /* fall back to the static render */ }
  }
  // SQUARE THE CORNER for a target that cannot hold it — BEFORE any capture, so the
  // clip is never applied rather than applied and then undone. Undoing it downstream
  // (resetting border-radius on a clone, say) is what left the two exporters disagreeing:
  // `clip-path` does the real rounding here, `border-radius` only rides along for
  // consumers to read back, so a reset that names one and not the other flattens nothing.
  // Evicting the token is the whole fix, and it covers a per-slide `_class: corners-rounded`
  // opt-in for free — that is the same token, on the same element.
  //
  // This runs IN THE PAGE, not on the emitted HTML, and that is deliberate: the `.html`
  // sidecar written alongside every non-html output is a LIVE document, which CAN hold the
  // corner. Stripping the markup would wrongly square it. Squaring the DOM squares only
  // the pixels we are about to flatten. See lib/core/corner-export-capability.mjs.
  // `squareNow` also tells us whether this deck is rounded AT ALL, which decides
  // `omitBackground` below. A square deck must stay BYTE-IDENTICAL: it stamps no token
  // today, and asking for an alpha channel it has no hole to put in would rewrite every
  // existing PNG export for nothing.
  const roundedSlides = await g(() => page.evaluate((squareNow) => {
    const hit = document.querySelectorAll('section.corners-rounded');
    if (squareNow) for (const s of hit) s.classList.remove('corners-rounded');
    return hit.length;
  }, !CORNER_SURVIVES), 'resolve corners for the export target');
  if (roundedSlides && !CORNER_SURVIVES && !QUIET) {
    // Say which of the two reasons applies. `isFlatExportTarget` is the kernel's whole
    // point of having two lists rather than one: a MEASURED flat format and a target
    // nobody ever classified both square, but only the first is a fact about the format.
    // Claiming "a .avif cannot carry a transparent corner" would be asserting a
    // measurement that was never taken — the corner squared because the target is
    // unknown and unknown fails safe, which is a different sentence and a fixable state.
    const why = isFlatExportTarget(CORNER_TARGET)
      ? `a .${CORNER_TARGET} cannot carry a transparent corner`
      : `.${CORNER_TARGET} is not a classified export target, so the corner squares to be safe (lib/core/corner-export-capability.mjs)`;
    console.log(`  Corners: squared on ${roundedSlides} slide${roundedSlides === 1 ? '' : 's'} — ${why}.`);
  }
  // A rounded deck into an alpha-capable raster: let the corner be a real hole. Puppeteer
  // paints an opaque white default canvas unless told otherwise, which is exactly the
  // pale-notch artifact — the corner LOOKS clipped but ships white. Scoped to rounded
  // decks so a square deck's bytes do not move.
  const OMIT_BG = CORNER_SURVIVES && roundedSlides > 0 && OUT_FORMAT !== 'html';
  // Rasterize SVG <img>/background images before printing the VECTOR pdf: the
  // clipped/cropped placements Chromium prints for them emit shading-pattern /
  // transparency-group constructs that iOS Quartz viewers partially render or
  // drop outright (#690). A 2x raster twin (a plain image XObject — the
  // universally supported construct) is what fixed the gallery in #681; this
  // applies the same remedy at export time, for any deck. Inline <svg>
  // (Mermaid, charts, logo marks) is untouched — it prints through the page's
  // normal paint path and stays vector. Opt out with --keep-vector-images.
  // The raster paths (PPTX/PNG/--raster) screenshot pixels anyway, so skip.
  if (OUT_FORMAT === 'pdf' && !RASTER_PDF && !KEEP_VECTOR_IMAGES) {
    const swapped = await rasterizeSvgImagesInPage(browser, g, page);
    if (swapped && !QUIET) {
      console.log(`  SVG images: ${swapped} reference${swapped > 1 ? 's' : ''} rasterized at 2x for PDF portability (--keep-vector-images keeps vectors)`);
    }
  }
  if (OUT_FORMAT === 'pdf' && !RASTER_PDF && !PAPER_FIT) {
    // Render to a buffer (no `path`) so we can post-process before writing: the
    // speaker notes are attached as per-page PDF text annotations.
    const pdfBytes = await g(() => page.pdf({
      width: `${slideW}px`, height: `${slideH}px`,
      printBackground: true,
      preferCSSPageSize: true
    }), 'print pdf');
    await closeBrowser();
    // Bind notes to the RENDERED pages, not the authored slides — a split run has more
    // of the former than the latter, and the length guard inside would otherwise drop
    // every annotation in the deck (see notesPerRenderedPage).
    const pageNotes = notesPerRenderedPage(cleanDocHtml, materializedNotes);
    let finalBytes = await embedNotesInPdf(pdfBytes, pageNotes);
    finalBytes = await applyPresentMode(finalBytes);
    finalBytes = await embedSourceInPdf(finalBytes);
    fs.writeFileSync(outFile, pinPdfTimestamps(finalBytes).bytes);
    const noteCount = materializedNotes.filter(Boolean).length;
    if (!QUIET) {
      const tags = [];
      if (noteCount) tags.push(`${noteCount} slide${noteCount > 1 ? 's' : ''} with speaker notes`);
      if (PRESENT) tags.push('presentation mode');
      if (EMBED_SOURCE) tags.push('source embedded');
      console.log(`PDF: ${outFile}${tags.length ? ` (${tags.join(', ')})` : ''}`);
    }
    if (NOTES_SIDECAR) writeNotesSidecar(outFile, materializedNotes);
  } else if (OUT_FORMAT === 'pdf') {
    // Image-per-page PDF. Two triggers land here:
    //   · --raster: one FULL-BLEED slide image per slide-sized page (max-compat sharing).
    //   · --paper/--orientation: each slide fit + centered on a standard SHEET (Letter/Legal/
    //     A4) via the shared print kernel — the reliable paper-fit path. (The vector page.pdf
    //     path can't reliably paginate a scaled deck onto a larger sheet: Chromium drops the
    //     per-slide page break once a slide no longer fills the page, packing 2-up in portrait.
    //     Rasterize + place, exactly like the Studio Print drawer, so every sheet is correct.)
    // The pdf-lib post-passes (notes / present / source) run on the assembled document.
    let paperSheet = null;
    if (PAPER_FIT) {
      const { resolvePrintSheet } = require('./lib/core/print-sheet.mjs');
      paperSheet = resolvePrintSheet(slideW, slideH, { paper: PAPER, orientation: ORIENTATION });
    }
    const handles = await g(() => page.$$('section[data-lattice-slide]'), 'collect slide handles');
    const jpegBuffers = [];
    for (const h of handles) {
      jpegBuffers.push(await g(() => h.screenshot({ type: 'jpeg', quality: 95 }), 'screenshot slide'));
    }
    await closeBrowser();
    let finalBytes = await assembleRasterPdf(jpegBuffers, paperSheet);
    finalBytes = await embedNotesInPdf(finalBytes, notesPerRenderedPage(cleanDocHtml, materializedNotes));
    finalBytes = await applyPresentMode(finalBytes);
    finalBytes = await embedSourceInPdf(finalBytes);
    fs.writeFileSync(outFile, pinPdfTimestamps(finalBytes).bytes);
    const noteCount = slideNotes.filter(Boolean).length;
    if (!QUIET) {
      const tags = [];
      if (paperSheet) {
        const label = { letter: 'US Letter', legal: 'US Legal', a4: 'A4' }[paperSheet.paper];
        tags.push(`${label} ${paperSheet.orientation}, ${jpegBuffers.length} page${jpegBuffers.length > 1 ? 's' : ''}, slide fit to page`);
      } else {
        tags.push(`raster, ${jpegBuffers.length} page${jpegBuffers.length > 1 ? 's' : ''}`);
      }
      if (noteCount) tags.push(`${noteCount} slide${noteCount > 1 ? 's' : ''} with speaker notes`);
      if (PRESENT) tags.push('presentation mode');
      if (EMBED_SOURCE) tags.push('source embedded');
      console.log(`PDF: ${outFile} (${tags.join(', ')})`);
    }
    if (NOTES_SIDECAR) writeNotesSidecar(outFile, slideNotes);
  } else if (OUT_FORMAT === 'imageset') {
    // IMAGE SET (.zip): one raster per slide in the chosen format, opt-in thumbnails,
    // and opt-in standalone chart/diagram SVGs — packed via the SHARED image-set kernel
    // (lib/export/image-set.js), the same contract the Studio's "Images" export uses.
    const fmt = IMAGE_SET_OPTS.format;
    const shot = fmt === 'png' ? { type: 'png' } : { type: fmt, quality: IMAGE_SET_OPTS.quality };
    // png/webp carry the rounded corner as real transparency; jpeg has no alpha channel
    // and was squared before this point, so it never reaches here wanting one.
    if (OMIT_BG) shot.omitBackground = true;

    // (1) Full-fidelity raster, one per slide, at the resolved `--image-size` scale. Taken
    // FIRST, before any SVG-look re-styling below, so the slides keep the export color mode.
    const handles = await g(() => page.$$('section[data-lattice-slide]'), 'collect slide handles');
    if (handles.length === 0) {
      await closeBrowser();
      console.error(`error: the deck rendered no slides — nothing to write to ${outFile}.`);
      process.exit(1);
    }
    // The scheme the slides are ACTUALLY in (so the manifest self-describes, and a matching SVG
    // look needs no re-style). Derived from the resolved palette, not the raw flag: `--image-mode
    // dark` with no `-dark` companion falls back to the base palette, so this correctly reads
    // 'light'. print is palette-independent (the color-mode:print stamp) — and is authoritative via
    // WANT_PRINT, which is ALSO set by the standalone `--print` flag (not just `--image-mode
    // print`), so a `deck.md out.zip --print` records 'print' to match its ink-on-white pixels.
    const resolvedScheme = WANT_PRINT
      ? 'print'
      : (/-dark$/.test(paletteName) ? 'dark' : 'light');
    let effectiveSvgBackground = IMAGE_SET_OPTS.svgBackground;
    const images = [];
    for (const h of handles) {
      images.push(await g(() => h.screenshot(shot), 'screenshot slide'));
    }

    // (2) Thumbnails — re-raster the same sections at a small device scale (thumbWidth
    // ÷ slideW). deviceScaleFactor changes only the pixel density, never the layout, so
    // the thumbnail is a faithful shrink of the full image.
    const thumbs = [];
    if (IMAGE_SET_OPTS.thumbnails) {
      const thumbScale = resolveThumbScale(IMAGE_SET_OPTS.thumbWidth, slideW, rasterScale);
      await g(() => page.setViewport({ width: slideW, height: slideH, deviceScaleFactor: thumbScale }), 'set thumb viewport');
      const thumbHandles = await g(() => page.$$('section[data-lattice-slide]'), 'collect thumb handles');
      for (const h of thumbHandles) {
        thumbs.push(await g(() => h.screenshot(shot), 'screenshot thumb'));
      }
    }

    // (3) Standalone vector assets — LAST, because the SVG "look" may re-style the page (a
    // print class, or a light/dark palette) so a chart/diagram exports in its own look even
    // when the slides are a different color mode. The slide + thumbnail rasters above are
    // already captured, so mutating the page now is safe. Reuses the chart-SVG kernel:
    // flatten computed styles inline (theme-free file) + embed fonts; covers Mermaid diagrams
    // and the keyed chart SVGs.
    let svgAssets = [];
    if (IMAGE_SET_OPTS.extractSvg) {
      const lookMode = svgLookMode(IMAGE_SET_OPTS.svgBackground); // null | light | dark | print
      // An SVG look re-treats the extracted vectors two ways. Token-driven CHARTS reflow from an
      // in-place palette/print restyle of the LIVE page — they read the look's tokens directly, so
      // they're restyled only when the look differs from the slide/palette scheme. Mermaid DIAGRAMS
      // bake their colors at render time (mmdc), so a CSS restyle can't recolor them; instead each
      // diagram whose OWN bake scheme differs from the look is RE-RENDERED in the look and flattened
      // in an ISOLATED scratch page that is natively in the look scheme (a clean document holding only
      // the look palette + the diagrams — a page already rendered dark/color can't be faithfully
      // retrofit in place, its rendered-scheme CSS leaks into the flatten). This is the CLI's
      // equivalent of the Studio's full second render, scoped to the diagrams, and makes ANY look
      // export correctly. `lookDiagramMarkup` maps each re-rendered diagram's stamp index → its
      // look-flattened markup, applied to the extraction below. See pipeline.md §5.
      let lookDiagramMarkup = null;
      if (lookMode) {
        // Resolve the look's palette + Mermaid theme vars once (used by the diagram re-render, and —
        // for light/dark — the live chart restyle). A missing `-dark` companion coerces to `inherit`.
        let lookApplied = true;
        let lookPaletteCss = paletteCSS;
        let sectionLookClass = lookMode === 'print' ? 'form print' : 'form';
        // Per HAND, not one for the deck: a deck can mix sketch and boardroom slides, and
        // the two resolve `--font-body` differently. Memoized so the palette is still
        // built at most twice however many diagrams are re-baked.
        let lookThemeVarsFor = null;
        if (lookMode !== 'print') {
          const base = paletteName.replace(/-dark$/, '');
          const targetName = lookMode === 'dark' ? `${base}-dark` : base;
          const targetPath = path.join(PKG_ROOT, 'themes', `${targetName}.css`);
          if (fs.existsSync(targetPath)) {
            lookPaletteCss = themeChainFor(targetName)
              .map((n) => readFileOrDie(path.join(THEMES_DIR, `${n}.css`), 'svg-look palette'))
              .join('\n');
            sectionLookClass = lookMode === 'dark' ? 'dark form' : 'form';
            // Resolve Mermaid theme vars from the LOOK palette (not the deck's) — the module-level
            // themeVarsForBand is baked from the deck's resolved palette, which for `--image-mode
            // dark` is the DARK theme, so re-rendering `light` with it would still read dark. Parse
            // the look palette fresh so a light look bakes light diagram colors and a dark look dark.
            const lookPaletteVars = parsePaletteVars(layoutCSS + '\n' + lookPaletteCss, lookMode === 'dark');
            const byHand = new Map();
            lookThemeVarsFor = (hand) => {
              const k = hand ? 'hand' : 'clean';
              if (!byHand.has(k)) byHand.set(k, resolveMermaidThemeVars(lookPaletteVars, hand));
              return byHand.get(k);
            };
          } else {
            // Can't honor the look (no companion theme) — coerce to `inherit` so the baked canvas
            // + manifest describe what actually renders (the slide look), not a lie. Warn even
            // under --quiet: the artifact differs from what was asked for. (Mirrors the Studio.)
            console.warn(`  ⚠ --svg-background ${lookMode}: no 'themes/${targetName}.css' — exporting SVGs in the slide look ('inherit').`);
            effectiveSvgBackground = 'inherit';
            lookApplied = false;
          }
        }

        if (lookApplied) {
          // CHARTS: recolor in place ONLY when the look differs from the slide/palette scheme (else
          // they already read the look). print → a `.print` canvas class; light/dark → the look palette.
          if (lookMode !== resolvedScheme) {
            if (lookMode === 'print') {
              await g(() => page.evaluate(() => {
                for (const s of document.querySelectorAll('section[data-lattice-slide]')) s.classList.add('print');
              }), 'apply print look (charts)');
            } else {
              await g(() => page.evaluate(({ css, scheme }) => {
                const s = document.createElement('style');
                s.id = 'lattice-svg-look';
                s.textContent = css;
                document.head.appendChild(s);
                document.documentElement.style.colorScheme = scheme;
              }, { css: lookPaletteCss, scheme: lookMode }), 'apply svg-look palette (charts)');
            }
            await g(() => page.evaluate(() => new Promise((r) => setTimeout(r, 120))), 'settle svg look');
          }

          // DIAGRAMS: re-render each whose BAKE scheme differs from the look. Keying on the diagram's
          // real bake mode (from the deck's `color-mode:`), NOT the palette-derived resolvedScheme,
          // catches a `color-mode: dark` deck exported to a light look under a light `--image-mode` —
          // resolvedScheme reads 'light' but the diagram was baked dark and DOES need a re-render.
          // A diagram already in the look scheme keeps its live markup (its live context matches the
          // look — natively, or via the chart restyle above — so it flattens correctly).
          // De-duped: a diagram can be stamped on >1 section (autosplit clones a shared block).
          const allIdxs = await g(() => page.evaluate(() =>
            [...new Set([...document.querySelectorAll('.mermaid-svg[data-mmd-idx]')].map((d) => Number(d.getAttribute('data-mmd-idx'))))],
          ), 'collect diagram indices');
          const idxs = allIdxs.filter((idx) => MERMAID_REBAKE_MODES[idx] !== lookMode);
          if (idxs.length) {
            if (!QUIET) process.stdout.write(`  re-rendering ${idxs.length} Mermaid diagram(s) → ${lookMode}...`);
            const { flattenSvgStyles: flatten } = require('./lib/components/chart/_chart-family/standalone-svg.js');
            const parts = [];
            const authorKept = new Set();   // sets its own colors — the look can't override (intended, benign)
            const renderFailed = new Set(); // mmdc fell back — no look render; keeps the slide-scheme bake (may be WRONG)
            for (const idx of idxs) {
              const def = MERMAID_REBAKE_DEFS[idx];
              if (def == null) continue;
              // A diagram that sets its OWN colors overrides Mermaid's theme variables, so the look
              // re-render can't fully recolor it: an author `%%{init}%%` that PINS A THEME (the engine
              // stands down and injects no themeVars), or explicit `fill:`/`stroke:`/`color:` hex/rgb
              // in `style`/`classDef`/`linkStyle`.
              // A pinned theme makes the re-render a total NO-OP (the init block survives untouched),
              // so skip the wasted mmdc/Chromium cost and keep the diagram's live markup — its author
              // colors are literal and context-independent. Flag it as author-kept. (An explicit
              // `style`/`classDef` fill still benefits: the re-render recolors the theme-driven parts,
              // leaving only the styled nodes in the author's colors — so it IS re-rendered below.)
              // The test is `authorPinsTheme`, NOT "has an init directive": since #1311 a
              // color-neutral directive (layout, curve, renderer) keeps the engine palette, so it
              // re-bakes like any other diagram and must not be reported as author-kept.
              if (authorPinsTheme(def)) { authorKept.add(idx); continue; }
              const explicitColor = /\b(?:fill|stroke|color)\s*:\s*(?:#[0-9a-fA-F]{3,8}|rgb)/i.test(def);
              // print → the print theme vars (themeVarsForBand('print'), scheme-independent); light/dark
              // → the vars resolved from the LOOK palette above, so the diagram bakes the look's colors.
              // The LOOK is the slide's own, so a sketch deck's re-baked diagrams stay
              // hand-drawn like the ones that were not re-baked — EXCEPT into print,
              // which is a texture band for every theme (base.print-textures.css). The
              // hand look has no texture channel, so re-baking a sketch diagram onto a
              // print canvas would strip the redundant encoding exactly the way rule 1
              // of resolveDiagramLook exists to prevent — and the scratch document this
              // lands in really is `section.print` (sectionLookClass below). Same rule,
              // enforced at the second place a diagram can be baked.
              const bakeLook = lookMode === 'print' ? 'classic' : MERMAID_REBAKE_LOOKS[idx];
              const out = lookMode === 'print'
                ? renderMermaid(def, 'print', bakeLook, MERMAID_REBAKE_HAND[idx])
                : renderMermaidOne(def, lookThemeVarsFor(MERMAID_REBAKE_HAND[idx]), null, bakeLook);
              // mmdc can degrade to a `<pre class="mermaid-fallback">` (no <div> wrapper) after exhausting
              // its retries — keep the ORIGINAL live diagram (still an <svg>) below, but flag it distinctly:
              // it's still in the slide scheme, unlike the benign author-color case.
              if (!/^\s*<div\b/.test(out)) { renderFailed.add(idx); continue; }
              parts.push(out.replace(/^<div class="mermaid-svg/, `<div data-look-idx="${idx}" class="mermaid-svg`));
              if (explicitColor) authorKept.add(idx);
            }
            lookDiagramMarkup = new Map();
            if (parts.length) {
              // Clean look-scheme doc: engine layout CSS + the look palette + a section in the look scheme,
              // holding just the re-rendered diagrams. No slide content, no rendered-scheme CSS. NOTE: the
              // scratch page is trusted for COLOR only — its `@font-face` urls are relative to about:blank
              // so text renders in a fallback font, but glyph geometry is baked by mmdc and font bytes are
              // embedded post-hoc (standaloneFontFaceCss), so only the flattened COLORS are ever read here.
              // Same `<style>` RAWTEXT rule as the deliverable document (HARD RULE #22), and
              // `layoutCSS` is the caller's `--css` sheet: a `</style>` here would end the
              // element and hand the remainder to the parser as markup in a live page THIS
              // process drives. Nothing in the scratch page ships, but a script node in it
              // reads and writes the render browser all the same — and the guard is free.
              const scratchDoc = `<!DOCTYPE html><html style="color-scheme:${lookMode === 'dark' ? 'dark' : 'light'}"><head><meta charset="utf-8"><style>${sanitizeStyleText(`${layoutCSS}\n${lookPaletteCss}`)}</style></head><body><section class="${sectionLookClass}" data-lattice-slide="1">${parts.join('')}</section></body></html>`;
              const scratch = await g(() => page.browser().newPage(), 'look-diagram scratch page');
              try {
                await g(() => scratch.setContent(scratchDoc, { waitUntil: 'networkidle0', timeout: 60000 }), 'load look scratch');
                await g(() => scratch.evaluate(`window.__flattenSvgStyles = ${flatten.toString()};`), 'inject flattener (scratch)');
                await g(() => scratch.evaluate(() => new Promise((r) => setTimeout(r, 120))), 'settle scratch');
                const flat = await g(() => scratch.evaluate(() => {
                  const ser = new XMLSerializer();
                  const acc = {};
                  for (const wrap of document.querySelectorAll('.mermaid-svg[data-look-idx]')) {
                    const svg = wrap.querySelector('svg');
                    if (!svg) continue;
                    try { acc[wrap.getAttribute('data-look-idx')] = ser.serializeToString(window.__flattenSvgStyles(svg, window)); } catch (_e) { /* skip one un-flattenable svg */ }
                  }
                  return acc;
                }), 'flatten look diagrams');
                for (const [k, v] of Object.entries(flat)) lookDiagramMarkup.set(Number(k), v);
              } finally {
                await scratch.close().catch(() => {});
              }
            }
            const recolored = idxs.length - authorKept.size - renderFailed.size;
            if (!QUIET) console.log(` ${recolored}/${idxs.length} recolored`);
            // Distinguish the two non-recolor causes — one is intended, one is a real wrong export.
            // Both are ungated by --quiet so an automated pipeline sees them.
            if (authorKept.size) {
              console.warn(`  ⚠ ${authorKept.size} of ${idxs.length} Mermaid diagram(s) kept their own colors — an author \`%%{init}%%\` theme or explicit \`style\`/\`classDef\` fills override the ${lookMode} look. Remove the fixed theme/style, or re-color in the Studio.`);
            }
            if (renderFailed.size) {
              console.warn(`  ⚠ ${renderFailed.size} of ${idxs.length} Mermaid diagram(s) could NOT be re-rendered (Mermaid failed) and remain in the SLIDE scheme — they may read wrong on the ${lookMode} canvas. Re-run the export, or use the Studio.`);
            }
          }
        }
      }

      const { flattenSvgStyles, collectFontFamilies, finalizeStandaloneSvg } =
        require('./lib/components/chart/_chart-family/standalone-svg.js');
      await g(() => page.evaluate(`window.__flattenSvgStyles = ${flattenSvgStyles.toString()};`), 'inject svg flattener');
      const raw = await g(() => page.evaluate((KEYED) => {
        const ser = new XMLSerializer();
        const out = [];
        document.querySelectorAll('section[data-lattice-slide]').forEach((sec, si) => {
          const push = (svg, kind, chartType, mmdIdx) => {
            try {
              const flat = window.__flattenSvgStyles(svg, window);
              out.push({ slide: si + 1, kind, chartType: chartType || null, mmdIdx: mmdIdx == null ? null : Number(mmdIdx), markup: ser.serializeToString(flat) });
            } catch (_e) { /* skip one un-flattenable svg rather than fail the export */ }
          };
          // Mermaid/diagram blocks render to an inline <svg> inside `.mermaid-svg`; carry the stamp
          // index so a cross-scheme look can swap in the isolated look-rendered markup below.
          sec.querySelectorAll('.mermaid-svg').forEach((wrap) => {
            const svg = wrap.querySelector('svg');
            if (svg) push(svg, 'diagram', null, wrap.getAttribute('data-mmd-idx'));
          });
          // The four keyed chart layouts emit the diagram+key as one self-contained svg;
          // the section class (piechart/radar/…) is the manifest's `chartType`.
          if (sec.classList.contains('chart-frame') && KEYED.some((c) => sec.classList.contains(c))) {
            const ct = KEYED.find((c) => sec.classList.contains(c)) || null;
            sec.querySelectorAll('svg[viewBox]').forEach((svg) => { push(svg, 'chart', ct, null); });
          }
        });
        return out;
      }, KEYED_CHART_LAYOUTS), 'extract standalone svgs');
      // For a cross-scheme look, replace each diagram's LIVE markup (flattened against the slide doc)
      // with the look-rendered one from the isolated scratch page. Diagrams that couldn't be recolored
      // (author-themed / mmdc fallback) aren't in the map and keep their live markup.
      if (lookDiagramMarkup) {
        for (const t of raw) {
          if (t.kind === 'diagram' && t.mmdIdx != null && lookDiagramMarkup.has(t.mmdIdx)) t.markup = lookDiagramMarkup.get(t.mmdIdx);
        }
      }
      const svgBg = svgBackgroundFill(effectiveSvgBackground);
      svgAssets = raw.map((t) => {
        const fontFaceCss = standaloneFontFaceCss(collectFontFamilies(t.markup));
        return { slide: t.slide, kind: t.kind, chartType: t.chartType, svg: finalizeStandaloneSvg(t.markup, { fontFaceCss, background: svgBg }) };
      });
    }

    // Per-slide titles for the manifest — the slide's first heading (unaffected by the look).
    const slideTitles = await g(() => page.evaluate(() =>
      Array.from(document.querySelectorAll('section[data-lattice-slide]')).map((sec) => {
        const h = sec.querySelector('h1, h2, h3');
        return (h?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
      })), 'extract slide titles');
    await closeBrowser();

    // (4) Pack via the shared kernel → a single .zip.
    const { assembleImageSetPlan, addPlanToZip } = require('./lib/export/image-set');
    const JSZip = require('jszip');
    // Effective print resolution of the full rasters — recorded in the manifest AND baked into
    // the PNG/JPEG bytes (pHYs / JFIF) so they drop into a print/office document at the right
    // physical size instead of the tool's 96dpi guess.
    const dpi = dpiFor(Math.round(slideW * rasterScale), Math.round(slideH * rasterScale));
    const plan = assembleImageSetPlan({
      name: path.basename(outFile).replace(/\.zip$/i, ''),
      // Record the RESOLVED scheme + honored look so the manifest self-describes what the
      // pixels actually are (not the raw `inherit` / an unhonored look).
      options: { ...IMAGE_SET_OPTS, mode: resolvedScheme, svgBackground: effectiveSvgBackground },
      geom: { w: slideW, h: slideH },
      scale: rasterScale,
      images: images.map((b) => embedRasterDpi(Buffer.from(b), fmt, dpi)),
      thumbs: thumbs.map((b) => Buffer.from(b)),
      svgs: svgAssets,
      title: deckTitle,
      palette: paletteName,
      engineVersion: pkgVersion(),
      createdAt: new Date().toISOString(),
      slideTitles,
      generator: 'cli',
    });
    const zip = new JSZip();
    addPlanToZip(zip, plan);
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(outFile, zipBuf);
    if (!QUIET) {
      const c = plan.manifest.counts;
      const tags = [`${c.slides} ${fmt.toUpperCase()}`, resolvedScheme];
      if (c.thumbnails) tags.push(`${c.thumbnails} thumbnails`);
      if (c.assets) tags.push(`${c.assets} SVG${effectiveSvgBackground !== 'inherit' ? ` (${effectiveSvgBackground})` : ''}`);
      console.log(`Image set: ${outFile} (${tags.join(', ')}, ${(zipBuf.length / 1024).toFixed(0)} KB)`);
    }
  } else if (OUT_FORMAT === 'html') {
    // HTML deliverable: there is nothing left to export. `outHtml === outFile` here, and
    // the file on disk is already the finished render — written pre-navigation and
    // REWRITTEN by the auto-split / rails passes, so what is on disk is the measured,
    // split-baked document rather than the pre-layout guess.
    //
    // Close the browser and stop. No `page.pdf`, no screenshots. `--player` / `--fluid`
    // still apply below and overwrite this same path with the viewer build, which is
    // coherent: in this mode the sidecar IS the deliverable, so the viewer replaces it
    // exactly as it replaces the sidecar of a PDF render.
    // Count the RENDERED pages off the live document, not `slides.length` — a deck that
    // auto-splits has more of the former than the latter, and reporting the authored
    // count here would disagree with the page count the same deck's PDF would carry.
    // Read it before closing the browser; fall back to the authored count if the query
    // fails, since a log line must never sink a completed render.
    // Scope the count to the document's OWN slide sections. `section[data-lattice-slide]`
    // unscoped also matches a `<section data-lattice-slide>` an author wrote in their
    // markdown, which parses as nested DOM — the same hazard measureOverflow scopes around
    // — and an inflated count here would contradict the "pages identically to the .pdf"
    // claim this format is documented on.
    let pageCount = slides.length;
    try {
      const n = (await page.$$('#deck > section[data-lattice-slide], body > section[data-lattice-slide]')).length;
      if (n > 0) pageCount = n;
    } catch { /* keep the authored count */ }
    await closeBrowser();
    // materializedNotes, NOT slideNotes — under --strip-notes the former is all-null. The
    // sidecar is a SHAREABLE file, so handing it the unstripped array leaks exactly the
    // text the flag exists to remove, and it did (red-team, this PR): the same deck+flags
    // stripped on the .pdf path and leaked here. The log tag counts the same array so it
    // cannot claim notes the sidecar does not contain.
    const noteCount = materializedNotes.filter(Boolean).length;
    if (!QUIET) {
      const tags = [`${pageCount} slide${pageCount === 1 ? '' : 's'}`];
      if (noteCount) tags.push(`${noteCount} slide${noteCount === 1 ? '' : 's'} with speaker notes`);
      console.log(`HTML: ${outFile} (${tags.join(', ')})`);
    }
    if (NOTES_SIDECAR) writeNotesSidecar(outFile, materializedNotes);
  } else {
    // PNG / PPTX: rasterize one image per slide from the SAME rendered page.
    // Each `section[data-lattice-slide]` is exactly slideW×slideH (fixed-page),
    // so an element screenshot yields a clean full-bleed slide image.
    const handles = await g(() => page.$$('section[data-lattice-slide]'), 'collect slide handles');
    const pngBuffers = [];
    // `.png` keeps a rounded corner as transparency; `.pptx` shares this loop but was
    // squared above, so OMIT_BG is false for it and its images stay opaque.
    const pngShot = OMIT_BG ? { type: 'png', omitBackground: true } : { type: 'png' };
    for (const h of handles) {
      pngBuffers.push(await g(() => h.screenshot(pngShot), 'screenshot slide'));
    }
    await closeBrowser();

    if (OUT_FORMAT === 'png') {
      // `deck.png` → `deck.001.png`, `deck.002.png`, … (a per-slide set, the
      // same convention marp's `--images png` used).
      const base = outFile.replace(/\.png$/i, '');
      const pad = Math.max(3, String(pngBuffers.length).length);
      pngBuffers.forEach((buf, i) => {
        fs.writeFileSync(`${base}.${String(i + 1).padStart(pad, '0')}.png`, buf);
      });
      if (!QUIET) console.log(`PNG: ${pngBuffers.length} slides → ${base}.NNN.png`);
    } else {
      // PPTX — image-per-slide via the shared writer (lib/export/pptx-export.js).
      const { writePptx } = require('./lib/export/pptx-export');
      const count = await writePptx(outFile, pngBuffers, {
        title: path.basename(outFile).replace(/\.pptx$/i, ''),
        company: `Lattice · ${paletteName}`,
        width: slideW,
        height: slideH,
      }, slideNotes, slideDescriptions);
      if (!QUIET) console.log(`PPTX: ${count} slides → ${outFile}`);
    }
  }
  // Fluid viewer: now that the raster (which loaded the CLEAN outHtml) is done,
  // overwrite outHtml with the responsive viewer. The exported PDF/PPTX/PNG bytes
  // above are unaffected — they never saw the marker or the inlined runtime.
  if (PLAYER) {
    // The self-contained player supersedes the fluid viewer when both are set. A
    // player-assembly failure must NOT fail-hard the render — the deliverable
    // PDF/PPTX/PNG already succeeded above, and outHtml already holds the clean
    // render (written pre-raster), so we warn and keep that clean sidecar.
    try {
      const { buildPlayerHtml } = require('./lib/export/html-player.js');
      // The mode the deck is AUTHORED for — baked as the player's default so the shared
      // file opens the way the sender chose, not re-themed by the receiver's OS.
      // The first-class `color-mode:` key WINS when present:
      //   · light / dark → PIN that mode.  · system → defer to the receiver's OS.
      //   · inherited → no host in a standalone player, so BAKE AS SYSTEM (follow the OS).
      // `color-mode:` DECIDES when it is set — it supersedes the legacy `class:` color
      // alias, so a deck carrying both must not seed the player from the token the render
      // just dropped. Read through the shared `deckColorModeToken` rather than a local
      // regex: this was the FOURTH spelling of that key, and the three before it disagreed
      // on a value with a trailing YAML comment (lib/core/resolve-color-mode.js).
      // `print` is a paper canvas, not a scheme, so the player opens light — the same
      // coercion the Studio's image-set export makes.
      //
      // Only when the key is ABSENT does the effective `color-scheme` decide (theme palette
      // or a deck `style:` / `class: … dark` alias):
      //   · `light dark` (both) → SYSTEM.  · `dark` only, or `class: dark` → DARK.
      //   · anything else → LIGHT.
      // Strip CSS comments from the palette first — a theme's DOC comment mentioning
      // `color-scheme:light dark` (indaco's does) must NOT read as an actual declaration.
      const cmToken = deckColorModeToken(fm);
      const paletteDecls = paletteCSS.replace(/\/\*[\s\S]*?\*\//g, '');
      const csDeclares = (re) => re.test(paletteDecls) || re.test(fm);
      const deckScheme =
        cmToken === 'dark' ? 'dark'
          : cmToken === 'color-light' || cmToken === 'print' ? 'light'
            : cmToken === 'color-system' || cmToken === 'color-inherited' ? 'system'
              : csDeclares(/color-scheme\s*:\s*(light\s+dark|dark\s+light)\b/) ? 'system'
                // WHOLE-token membership, matching the propagation kernel: `\bdark\b` also
                // matches inside `dark-mode`, which is not the `dark` class token.
                : csDeclares(/color-scheme\s*:\s*dark\b/) || classTokens(frontMatterValue(fm, 'class')).includes('dark') ? 'dark'
                  : 'light';
      const { html: playerHtml, report } = await buildPlayerHtml({
        // The browser-baked DOM (captured after the overflow-marker level was applied,
        // with state-chart / function-plot inflated to static SVG). Falls back to the
        // clean static render only if that capture failed — which also means no marker,
        // so the fallback is announced rather than silent.
        docHtml: inflatedPlayerHtml || cleanDocHtml,
        // The envelope carries verbatim source for lossless re-import — but under
        // `--strip-notes` / `--strip-captions` that source is re-serialized WITHOUT the
        // respective comments (directive-safe: notes match only the exact bodies lifted
        // from the render; captions match the `caption:` prefix), so the shared file leaks
        // no speaker text and/or no caption text. A stripped file re-imports without them —
        // the stated privacy tradeoff (§Notes on export).
        source: stripSharedSource(rawMd, noteStripSet),
        title: deckTitle,
        // The deck's REAL canvas. Without it the player hardcoded 1280x720 and any deck
        // declaring a non-default `size:` exported laid out for its own canvas and then
        // crushed into an HD box — type at 3x, slides cut off mid-word, and silently, since
        // this same run's PDF was correct (#1577). Already resolved above for the render.
        width: slideW,
        height: slideH,
        theme: { name: paletteName, mode: deckScheme },
        // The engine's shallow front-matter parse doesn't read the nested `captions:` map (it
        // surfaces as `""`), so `config` normally carries no caption text — but an inline
        // `captions: {…}` form would echo here. Under `--strip-captions` drop the key outright
        // so the envelope config can't carry ANY caption-labeled text (privacy, not just the map).
        config: STRIP_CAPTIONS ? { ...deckFm, captions: undefined } : deckFm,
        notes: !STRIP_NOTES,
        // Term→definition projection from the acronym registry (#920) — carried in the manifest
        // for downstream tools; gated on the `glossary: auto` opt-in, so a deck that merely defines
        // terms (without opting in) is byte-identical. Empty → omitted (lean envelope).
        glossary: autoGlossaryEntries,
        now: Date.now(),
        build: ENGINE_BUILD,
        playerVersion: PLAYER_VERSION,
      });
      // P6 — used-selector CSS prune + used-family FONT prune. Authoritative Chromium
      // matching (+ a computed-style gate for CSS); a gate failure or css-tree-absent
      // silently keeps the full CSS, an empty font detection keeps every face. Never
      // fail-hard — these are size levers, not the deliverable.
      let finalPlayerHtml = playerHtml;
      const pruneNotes = [];
      try {
        const pr = await prunePlayerCssInPage(playerHtml);
        if (pr.applied) {
          finalPlayerHtml = pr.html;
          if (pr.saved > 0) pruneNotes.push(`  pruned unused CSS: ${pr.keptRules}/${pr.totalRules} rules kept, ${(pr.saved / 1024).toFixed(0)} KB saved`);
          if (pr.fontApplied) pruneNotes.push(`  pruned unused fonts: ${pr.fontsKept}/${pr.fontsTotal} faces kept, ${(pr.fontSaved / 1024).toFixed(0)} KB saved`);
        }
        if (pr.gateFailed) pruneNotes.push('  note: CSS prune skipped — computed-style gate flagged a diff; shipping full CSS');
      } catch (e) {
        pruneNotes.push(`  note: player optimization skipped (${e?.message}); shipping full CSS + fonts`);
      }
      fs.writeFileSync(outHtml, finalPlayerHtml);
      if (!QUIET) {
        console.log(`Player: ${outHtml} (${report.images} image(s) inlined)`);
        if (report.missing.length) console.warn(`  honesty: ${report.missing.length} asset(s) could not be inlined — ${report.missing.slice(0, 3).join(', ')}`);
        if (inflatedPlayerHtml && (hasStateChart || hasFunctionPlot)) console.log('  baked dynamic components (state-chart / function-plot) to static SVG');
        else if (report.strippedScripts.length) console.warn(`  note: ${report.strippedScripts.length} runtime component(s) could not be baked — they will be blank in the player`);
        for (const n of pruneNotes) console.log(n);
      }
      // Say so rather than let the level go quietly missing: without the baked DOM the
      // player falls back to the pre-browser render, which carries no marker at all.
      //
      // UNGATED by --quiet, matching the mermaid re-render warnings above ("so an
      // automated pipeline sees them"): --quiet is exactly the mode a pipeline runs in,
      // and this is the only signal that a delivered artifact silently lost its marker.
      // Gated on there being something to mark, so a clean deck whose capture failed is
      // not told it is missing a marker that was never going to appear.
      if (!inflatedPlayerHtml && level !== 'off' && overflowing.length) {
        console.warn(`  honesty: the player DOM could not be captured — this player shows no overflow marker, not \`${level}\`.`);
      }
    } catch (err) {
      console.warn(`warning: --player assembly failed (${err?.message}); ${outFile} is unaffected, but ${outHtml} is the clean render, not the player.`);
    }
  } else if (FLUID_VIEW) {
    // The fluid viewer runs the BUNDLED RUNTIME, which resolves the overflow level
    // from an export-settings block and otherwise falls back to `reader`. Without
    // the block the flag was silently ignored here: `--overflow-marker=off` still
    // drew a pill, and `author` drew a reader-styled pill with author wording.
    // Emitting it is the same channel the Marp bundle uses (lib/core/export-settings.js).
    fs.writeFileSync(
      outHtml,
      toFluidViewer(cleanDocHtml) + exportSettingsBlock({ overflowMarker: OVERFLOW_MARKER.marker }),
    );
    if (!QUIET) console.log(`Fluid viewer: ${outHtml}`);
  }
  // Read-along captions ride alongside ANY output format — a .vtt is a sidecar next to the deck,
  // not baked into its bytes. `--strip-notes` blanks the note channel (materializedNotes) and the
  // projection, but NOT the captions: a caption is public-facing narration the author opts into via
  // `--captions`, not a private note, so it composes with `--strip-notes` (ship captions, drop notes).
  if (CAPTIONS) {
    // PAGE-bound notes, not authored ones: `projectDeckSpeechFromHtml` projects the
    // RENDERED sections, so feeding it the authored array made the two lengths disagree
    // the moment a slide split — and `mergeNarration` then dropped the projection (and
    // the front-matter captions with it) rather than misalign. One index space fixes all
    // three channels at once.
    const pageNotesForCaptions = notesPerRenderedPage(cleanDocHtml, materializedNotes);
    await writeCaptionsSidecar(outFile, pageNotesForCaptions, cleanDocHtml, slideCaptions);
  }
}

// P6 — used-selector CSS prune for the self-contained player. Drops the rules of
// the ~47 components a given deck doesn't use from the inlined lattice.css block,
// toward the "Minimal" size tier. SAFE on a frozen artifact by two guards:
//   (1) AUTHORITATIVE matching — a scratch Chromium page holding the REAL player
//       DOM (all three view-DOMs inline) answers `document.querySelector` for every
//       base selector; no token heuristic.
//   (2) A COMPUTED-STYLE GATE — full vs pruned CSS is compared across all three
//       views for every element (+ ::before/::after); ANY diff rejects the prune
//       and the full CSS ships. css-tree absent / parse error / a smaller-than-nothing
//       result all fall back to the full CSS. Returns { html, applied, saved, ... }.
//
// Runs in its OWN short-lived hardened browser (--disable-dev-shm-usage), NOT the
// render browser: by the time the player is assembled the render browser has
// consumed /dev/shm (raster + PDF + SVG twins), and a second 1 MB+ page on top of
// that crashes the small-container Chromium. A dedicated hardened instance is
// isolated from that pressure and can't perturb the deliverable render.
async function prunePlayerCssInPage(playerHtml) {
  const { collectBaseSelectors, prunePlayerCss, prunePlayerFontFaces, GATE_PROPS } = require('./lib/export/html-player.js');
  // Two targets: the inlined lattice.css (largest non-font <style>) for the selector
  // prune, and the base64 @font-face block (#lattice-embedded-fonts) for the font prune.
  const blocks = [...playerHtml.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)];
  let target = null;
  let fontBlock = null;
  for (const b of blocks) {
    if (/lattice-embedded-fonts/.test(b[1])) {
      fontBlock = { full: b[0], css: b[2] };
      continue;
    }
    if (!target || b[2].length > target.css.length) target = { full: b[0], css: b[2] };
  }
  const bases = target && target.css.length >= 50000 ? collectBaseSelectors(target.css) : [];
  // Nothing to do without a browser-backed pass? Only bail if BOTH prunes are moot.
  if (!bases.length && !fontBlock) return { applied: false };

  const pruneOpts = {
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    headless: 'new',
  };
  if (CHROME_EXEC) pruneOpts.executablePath = CHROME_EXEC;
  const pruneBrowser = await puppeteer.launch(pruneOpts);
  const g = (op, label) => guard(pruneBrowser, op, label, RENDER_WATCHDOG_MS);
  try {
    // newPage() inside the try so a failure here still closes the browser.
    const scratch = await pruneBrowser.newPage();
    await g(() => scratch.setContent(playerHtml, { waitUntil: 'domcontentloaded', timeout: 60000 }), 'player prune: load');

    // ── FONT prune: which embedded families does the deck actually use? ──────────
    // Authoritative + honors `sketch`: a family is USED if the browser LOADED a face
    // (lazy — only when an element needs it) OR it appears in any element's resolved
    // `font-family` (so a deck applying the sketch hand keeps Caveat + Shantell). All
    // three views are cycled and every element forced to lay out so no face is missed.
    let fontResult = { applied: false };
    if (fontBlock) {
      const usedFamilies = await scratch.evaluate(async () => {
        for (const v of ['present', 'read-slides', 'read-article']) {
          document.getElementById('lp-app')?.setAttribute('data-lp-view', v);
          for (const el of document.querySelectorAll('#lp-app *')) el.getBoundingClientRect();
          try {
            await document.fonts.ready;
          } catch {
            /* fonts not ready this cycle — the loaded-status + computed-family nets
               below still run against whatever HAS loaded; worst case fewer faces
               are marked used and MORE are kept (never fewer) */
          }
        }
        const strip = (s) => String(s).trim().replace(/^["']|["']$/g, '');
        const fams = new Set();
        for (const f of document.fonts) if (f.status === 'loaded') fams.add(strip(f.family));
        for (const el of document.querySelectorAll('*')) {
          for (const part of (getComputedStyle(el).fontFamily || '').split(',')) fams.add(strip(part));
        }
        document.getElementById('lp-app')?.setAttribute('data-lp-view', 'present');
        return [...fams];
      });
      fontResult = prunePlayerFontFaces(fontBlock.css, usedFamilies);
    }

    // ── CSS prune (only when the lattice.css block is present + css-tree installed) ─
    let cssResult = { applied: false };
    if (bases.length) {
      // (1) authoritative match — keep a base on ANY querySelector error (conservative).
      const used = await scratch.evaluate((sels) => {
        const out = [];
        for (const s of sels) {
          try {
            if (document.querySelector(s)) out.push(s);
          } catch {
            out.push(s);
          }
        }
        return out;
      }, bases);
      const usedSet = new Set(used);
      const pruned = prunePlayerCss(target.css, (b) => usedSet.has(b));
      cssResult = pruned.applied && pruned.css.length < target.css.length ? pruned : { applied: false };
    }

    // (2) computed-style gate across all three views (+ pseudo-elements) — CSS only.
    const identical = !cssResult.applied ? true : await scratch.evaluate(
      ({ prunedCss, PROPS }) => {
        // The pruned block is the biggest non-font <style> — same target the Node
        // side chose, re-found here by size so we swap the right one.
        const styleEl = [...document.querySelectorAll('style')]
          .filter((s) => s.id !== 'lattice-embedded-fonts')
          .sort((a, b) => b.textContent.length - a.textContent.length)[0];
        const app = document.getElementById('lp-app');
        const views = ['present', 'read-slides', 'read-article'];
        const snap = () => {
          const rows = [];
          for (const el of document.querySelectorAll('#lp-app *')) {
            for (const pseudo of [null, '::before', '::after']) {
              const cs = getComputedStyle(el, pseudo);
              rows.push(PROPS.map((p) => cs.getPropertyValue(p)).join('|'));
            }
          }
          return rows.join('\n');
        };
        const before = {};
        for (const v of views) {
          if (app) app.setAttribute('data-lp-view', v);
          before[v] = snap();
        }
        const original = styleEl.textContent;
        styleEl.textContent = prunedCss;
        let ok = true;
        for (const v of views) {
          if (app) app.setAttribute('data-lp-view', v);
          if (snap() !== before[v]) {
            ok = false;
            break;
          }
        }
        styleEl.textContent = original;
        if (app) app.setAttribute('data-lp-view', 'present');
        return ok;
      },
      { prunedCss: cssResult.css, PROPS: GATE_PROPS },
    );
    // A CSS-gate failure drops only the CSS prune; the font prune (independent, no
    // gate needed — it removes faces nothing paints) can still apply.
    const cssOk = cssResult.applied && identical;

    if (!cssOk && !fontResult.applied) {
      return { applied: false, gateFailed: cssResult.applied && !identical };
    }

    // Apply whichever prunes survived. Replacer FUNCTIONS, not strings — else a
    // `$&`/`$1`/backtick in the CSS or a data-URI would be interpreted by replace().
    // Re-sanitized on the way back in (HARD RULE #22): both strings have been through
    // css-tree's parse→generate since the document guarded them, and a serializer is
    // entitled to normalize an escape away. The document's own guard cannot cover CSS
    // that left the document and came back, so the re-wrap owns it — and it is free,
    // since the guard returns its input by identity for every real stylesheet.
    let html = playerHtml;
    if (cssOk) html = html.replace(target.full, () => `<style>${sanitizeStyleText(cssResult.css)}</style>`);
    if (fontResult.applied) {
      html = html.replace(fontBlock.full, () => `<style id="lattice-embedded-fonts">${sanitizeStyleText(fontResult.css)}</style>`);
    }
    return {
      applied: true,
      html,
      gateFailed: cssResult.applied && !identical,
      saved: cssOk ? target.css.length - cssResult.css.length : 0,
      keptRules: cssResult.keptRules,
      totalRules: cssResult.totalRules,
      fontApplied: fontResult.applied,
      fontSaved: fontResult.applied ? fontBlock.css.length - fontResult.css.length : 0,
      fontsKept: fontResult.kept,
      fontsTotal: fontResult.total,
    };
  } finally {
    await pruneBrowser.close().catch(() => {});
  }
}

// Rasterize every SVG `<img>`/`background-image` reference in the loaded deck
// page to a right-sized PNG data URL, and swap the references in place — the
// vector-PDF portability fix for #690 (see the call site). Only <img> src and
// inline-style background-image URLs ending .svg (or data:image/svg+xml) are
// touched. Each unique URL is rendered once in a scratch page at its intrinsic
// aspect ratio, sized to 2x its largest on-slide placement (the raster-twin
// resolution #681 verified on-device), transparent background preserved. Any
// per-image failure warns and leaves that reference vector — the deck must
// never be lost to a portability fix. Returns the number of swapped references.
async function rasterizeSvgImagesInPage(browser, g, page) {
  // Pass 1 — collect: every SVG image URL (absolutized) with the largest
  // placement box it occupies, measured from the real layout.
  const refs = await g(() => page.evaluate(() => {
    // Fragment views (sprite.svg#view) are skipped: a raster twin would swap
    // the fragment's view for the whole sprite sheet. A data: URL can't carry
    // a raw `#` (it would have terminated the URL), so only fetchable URLs
    // get the fragment test.
    const isSvgUrl = (u) => /^data:image\/svg\+xml/i.test(u) || (!u.includes('#') && /\.svg(?:\?.*)?$/i.test(u));
    const out = {};
    const add = (url, rect) => {
      if (!url || !isSvgUrl(url)) return;
      const r = out[url] || (out[url] = { w: 0, h: 0 });
      r.w = Math.max(r.w, rect.width);
      r.h = Math.max(r.h, rect.height);
    };
    for (const img of document.images) add(img.currentSrc || img.src, img.getBoundingClientRect());
    for (const el of document.querySelectorAll('[style*="background-image"]')) {
      // Walk EVERY url() token — a declaration can layer a gradient scrim over
      // the image — and never let one malformed URL abort the collect: the
      // deck must not be lost to a portability fix.
      for (const m of (el.style.backgroundImage || '').matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
        try { add(new URL(m[1], document.baseURI).href, el.getBoundingClientRect()); } catch (_e) { /* skip this token */ }
      }
    }
    return out;
  }), 'collect svg images');
  const urls = Object.keys(refs);
  if (!urls.length) return 0;

  // Pass 2 — rasterize each unique SVG once in a scratch page.
  const map = {};
  const scratch = await g(() => browser.newPage(), 'svg raster page');
  try {
    for (const url of urls) {
      try {
        // A file:// SVG can't load as a subresource of the about:blank scratch
        // page (Chromium blocks local subresources off non-file pages), so
        // inline it as a data: URL; data:/http(s) sources load as-is.
        const src = url.startsWith('file:')
          ? `data:image/svg+xml;base64,${fs.readFileSync(fileURLToPath(url)).toString('base64')}`
          : url;
        await g(() => scratch.setContent(
          '<!DOCTYPE html><html><body style="margin:0"><img id="t" style="display:block"></body></html>',
        ), 'svg scratch doc');
        // Assign src via evaluate (never string-interpolated into markup) and
        // wait for the actual load result — a failed load throws to the catch
        // below, leaving that reference vector instead of swapping in a blank.
        const nat = await g(() => scratch.evaluate(async (s) => {
          const i = document.getElementById('t');
          const loaded = await new Promise((resolve) => {
            i.onload = () => resolve(true);
            i.onerror = () => resolve(false);
            i.src = s;
          });
          try { await i.decode(); } catch (_e) { /* naturalWidth fallback below */ }
          return { ok: loaded, w: i.naturalWidth, h: i.naturalHeight };
        }, src), 'load svg');
        if (!nat.ok) throw new Error('image failed to load');
        // Intrinsic aspect from the SVG itself; a viewBox-less SVG reports 0,
        // so fall back to its placement box (then the slide) for the ratio.
        const disp = refs[url];
        const natW = nat.w || disp.w || slideW;
        const natH = nat.h || disp.h || slideH;
        // 2x the placement box on EACH axis independently: a cover placement of
        // an extreme-aspect asset (a pano full-bleed, a tall column) is
        // constrained by its SHORT axis, so a long-edge-only target would
        // under-resolve exactly the placements #690 is about. Floor for tiny
        // marks, cap the long edge so a pano can't paint an OOM-sized canvas.
        let scale = Math.max((2 * Math.max(disp.w, 1)) / natW, (2 * Math.max(disp.h, 1)) / natH);
        const longEdge = Math.max(natW, natH) * scale;
        if (longEdge < 64) scale *= 64 / longEdge;
        if (longEdge > 4096) scale *= 4096 / longEdge;
        const outW = Math.max(1, Math.round(natW * scale));
        const outH = Math.max(1, Math.round(natH * scale));
        await g(() => scratch.setViewport({ width: outW, height: outH, deviceScaleFactor: 1 }), 'size svg viewport');
        await g(() => scratch.evaluate((w, h) => {
          const i = document.getElementById('t');
          i.style.width = `${w}px`;
          i.style.height = `${h}px`;
        }, outW, outH), 'size svg');
        const png = await g(() => scratch.screenshot({
          type: 'png',
          omitBackground: true,
          clip: { x: 0, y: 0, width: outW, height: outH },
        }), 'raster svg');
        map[url] = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
      } catch (e) {
        console.warn(`  ⚠ Could not rasterize SVG image (${url.slice(0, 96)}): ${e.message} — leaving it vector.`);
      }
    }
  } finally {
    try { await scratch.close(); } catch (_e) { /* browser teardown owns it */ }
  }
  if (!Object.keys(map).length) return 0;

  // Pass 3 — swap in place, layout-neutrally. An <img> is pinned to its
  // laid-out box FIRST (the twin's intrinsic size is 2x the placement, so an
  // intrinsically-sized image would otherwise re-lay-out at double size — and
  // this runs after the overflow/autosplit measurements, which must stay
  // true). Background declarations replace only the matched url() tokens, so
  // layered gradient scrims survive.
  const swapped = await g(() => page.evaluate((twins) => {
    let n = 0;
    for (const img of document.images) {
      const key = img.currentSrc || img.src;
      if (!twins[key]) continue;
      const r = img.getBoundingClientRect();
      if (r.width && r.height) {
        img.style.width = `${r.width}px`;
        img.style.height = `${r.height}px`;
      }
      img.src = twins[key];
      n++;
    }
    for (const el of document.querySelectorAll('[style*="background-image"]')) {
      const bg = el.style.backgroundImage || '';
      const next = bg.replace(/url\(["']?([^"')]+)["']?\)/gi, (token, u) => {
        try {
          const abs = new URL(u, document.baseURI).href;
          if (twins[abs]) { n++; return `url("${twins[abs]}")`; }
        } catch (_e) { /* leave this token as-is */ }
        return token;
      });
      if (next !== bg) el.style.backgroundImage = next;
    }
    return n;
  }, map), 'swap svg images');
  // Let the swapped-in data: images decode before print.
  await g(() => page.evaluate(() => Promise.all(
    [...document.images].map((i) => (i.complete ? null : i.decode().catch(() => {}))),
  )), 'settle swapped images');
  return swapped;
}

// Driver: render once; on a Chrome target crash / wedge (NOT an author-fixable
// layout error) retry exactly once with hardening flags before giving up loud
// and non-zero. This turns a transient, environmental Chrome failure into a
// few-seconds-then-retry instead of a multi-minute hang to the outer timeout (#502).
(async () => {
  try {
    await renderExport({ hardened: false });
  } catch (e) {
    if (isTargetGone(e)) {
      console.warn(`  ⚠ render failed (${(e.message || String(e)).split('\n')[0]}) — retrying once with hardening flags (--disable-dev-shm-usage --disable-gpu)…`);
      await renderExport({ hardened: true });
    } else {
      throw e;
    }
  }
})().catch((e) => {
  // A FAILED `.html` render must not leave a complete-looking deliverable behind.
  // Every other format writes its artifact only on success, so a failure leaves no
  // file. `.html` is the exception by construction — outHtml IS outFile, and it is
  // written before the browser launches and rewritten on the hardened retry — so a
  // crash here left a 2.5 MB PRE-SPLIT, unmeasured document at the deliverable path,
  // indistinguishable from a good render and overwriting any previous good one
  // (red-team, this PR). Absence is the honest outcome; unlink so the caller sees
  // "no artifact" like every other format. Best-effort: a failing unlink must not
  // mask the render error we are about to report.
  if (OUT_FORMAT === 'html') {
    try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch { /* report the real error below */ }
  }
  // Surface render/export failures as a one-line error (matching readFileOrDie),
  // not a raw unhandled-rejection stack trace that reads like a crash.
  console.error(`error: ${e?.message ? e.message : e}`);
  process.exit(1);
});

// Attach each slide's speaker note as a PDF "Text" annotation (a sticky note)
// in the top-left corner of its page, so any PDF viewer surfaces it on click.
// Slides without a note get no annotation. Returns the modified PDF bytes; on
// any pdf-lib failure it falls back to the un-annotated bytes (the visible deck
// must never be lost to a notes problem).
/**
 * The per-PAGE notes of the FINAL, post-split document. Parses the sections and hands
 * them to notes-core, which owns the binding rule (and is dependency-free, so it takes
 * the parsed list rather than reaching for a parser itself). Falls back to the authored
 * array when the document has no recognizable sections, so a deck that never split is
 * byte-identical either way.
 */
function notesPerRenderedPage(docHtml, authored) {
  const at = String(docHtml || '').search(/<section\b[^>]*\bdata-lattice-slide=/);
  if (at < 0) return authored;
  try {
    const parts = require('./lib/core/split-sections').splitSections(docHtml.slice(at))
      .filter((p) => p.type === 'section');
    return parts.length ? notesCore.notesPerRenderedPage(parts) : authored;
  } catch { return authored; }
}

async function embedNotesInPdf(pdfBytes, notes) {
  if (!notes.some(Boolean)) return pdfBytes;
  try {
    const { PDFDocument, PDFName, PDFString } = require('pdf-lib');
    const doc = await PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    // notes[i] is keyed to PDF page i (both derive from the slide array). Guard
    // the invariant: if a future transform ever made puppeteer emit a different
    // page count, annotating by index would silently land notes on wrong pages.
    if (pages.length !== notes.length) {
      console.warn(`  ⚠ Speaker notes: ${notes.length} slide notes but ${pages.length} PDF pages — skipping note annotations to avoid misplacement.`);
      return pdfBytes;
    }
    pages.forEach((pg, i) => {
      const note = notes[i];
      if (!note) return;
      const { height } = pg.getSize();
      const annot = doc.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Name: 'Note',
        Open: false,
        // 24×24 icon tucked into the top-left (PDF origin is bottom-left).
        Rect: [12, height - 36, 36, height - 12],
        Contents: PDFString.of(note),
        T: PDFString.of('Speaker notes'),
        // Hidden (flag bit 2) by default: the note is embedded and
        // tool-extractable, but no icon mars the boardroom slide and it never
        // prints. --notes-icon omits the flag, exposing a clickable sticky note.
        ...(NOTES_ICON ? {} : { F: 2 }),
      });
      const ref = doc.context.register(annot);
      let annots = pg.node.get(PDFName.of('Annots'));
      if (!annots) {
        annots = doc.context.obj([]);
        pg.node.set(PDFName.of('Annots'), annots);
      }
      annots.push(ref);
    });
    return await pinPdfLibDates(doc).save();
  } catch (e) {
    console.warn(`  ⚠ Could not embed speaker notes into the PDF (${e.message}); writing deck without note annotations.`);
    return pdfBytes;
  }
}

// Assemble the --raster PDF: one page per slide image, page box matching the
// vector path's geometry exactly (CSS px → PDF points at 96px/in → 72pt/in), so
// page-size expectations, N-up printing, and the note-annotation Rect math all
// hold. Unlike the post-pass helpers below this must NOT swallow errors — there
// is no deck without it.
// `sheet` (from resolvePrintSheet, px @96dpi) → each slide fit + centered on that paper
// size; absent → the historical full-bleed slide-sized page. All geometry is px @96dpi;
// PDF points are px × 0.75 (72/96). pdf-lib's Y origin is bottom-left, so the fit rect's
// top-left y is flipped to `pageH - y - h`.
async function assembleRasterPdf(jpegBuffers, sheet) {
  const { PDFDocument } = require('pdf-lib');
  const { fitSlideOnSheet } = sheet ? require('./lib/core/print-sheet.mjs') : {};
  const doc = await PDFDocument.create();
  const PT = 0.75;
  for (const buf of jpegBuffers) {
    const img = await doc.embedJpg(buf);
    if (sheet) {
      const place = fitSlideOnSheet(slideW, slideH, sheet.pageW, sheet.pageH, 'page');
      const pg = doc.addPage([sheet.pageW * PT, sheet.pageH * PT]);
      // White paper under the fit+centered slide so the letterbox bands print white.
      pg.drawRectangle({ x: 0, y: 0, width: sheet.pageW * PT, height: sheet.pageH * PT, color: rgbWhite() });
      pg.drawImage(img, {
        x: place.x * PT,
        y: (sheet.pageH - place.y - place.h) * PT,
        width: place.w * PT,
        height: place.h * PT,
      });
    } else {
      const pg = doc.addPage([slideW * PT, slideH * PT]);
      pg.drawImage(img, { x: 0, y: 0, width: slideW * PT, height: slideH * PT });
    }
  }
  return await pinPdfLibDates(doc).save();
}

// pdf-lib's white (avoids importing `rgb` at module top just for this one call).
function rgbWhite() {
  const { rgb } = require('pdf-lib');
  return rgb(1, 1, 1);
}

// When --embed-source is set, attach the deck's ORIGINAL Markdown (as read from
// disk — before the Mermaid pre-render) to the PDF as an embedded file, so the
// artifact alone round-trips back to an editable deck. Any viewer with an
// attachments panel (Acrobat, Firefox's pdf.js, most desktops) surfaces it;
// `pdfdetach`/pdf-lib extract it in tooling. On any pdf-lib failure it returns
// the input bytes unchanged — provenance must never cost the visible deck
// (mirrors embedNotesInPdf).
async function embedSourceInPdf(pdfBytes) {
  if (!EMBED_SOURCE) return pdfBytes;
  try {
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.load(pdfBytes);
    // Under --strip-notes / --strip-captions the attached source is scrubbed too — else
    // the PDF leaks the speaker notes and/or caption text the outputs were careful to remove.
    const attachSource = stripSharedSource(md, noteStripSet);
    await doc.attach(Buffer.from(attachSource, 'utf8'), path.basename(mdFile), {
      mimeType: 'text/markdown',
      description: 'Lattice deck source (Markdown). Re-render with: lattice-emulator <this file> out.pdf',
    });
    return await pinPdfLibDates(doc).save();
  } catch (e) {
    console.warn(`  ⚠ Could not attach the Markdown source to the PDF (${e.message}); writing deck without it.`);
    return pdfBytes;
  }
}

// When --present is set, mark the PDF to open straight into full-screen
// presentation mode. These are document-catalog hints that Adobe Acrobat/Reader
// and most desktop viewers honour (it is exactly what Keynote / PowerPoint
// "Save as PDF" emit); browser-embedded viewers (Chrome's pdfium, pdf.js) and
// macOS Preview ignore them harmlessly, so there is no downside elsewhere.
//   /PageMode /FullScreen   open directly in presentation/full-screen view
//   /PageLayout /SinglePage one slide at a time (no continuous scroll)
//   /ViewerPreferences      clean page-only view when the presenter EXITS full
//                           screen (no panel auto-opening), and fit the window
//   per-page /Trans         subtle cross-fade on advance — tasteful, not a
//                           gimmick; NO /Dur, so slides stay presenter-driven
//                           (no kiosk auto-advance).
// On any pdf-lib failure it returns the input bytes unchanged — a presentation
// hint must never cost the visible deck (mirrors embedNotesInPdf).
async function applyPresentMode(pdfBytes) {
  if (!PRESENT) return pdfBytes;
  try {
    const { PDFDocument, PDFName } = require('pdf-lib');
    const doc = await PDFDocument.load(pdfBytes);
    const { catalog, context } = doc;
    catalog.set(PDFName.of('PageMode'), PDFName.of('FullScreen'));
    catalog.set(PDFName.of('PageLayout'), PDFName.of('SinglePage'));
    catalog.set(PDFName.of('ViewerPreferences'), context.obj({
      NonFullScreenPageMode: PDFName.of('UseNone'),
      FitWindow: true,
    }));
    for (const pg of doc.getPages()) {
      pg.node.set(PDFName.of('Trans'), context.obj({
        S: PDFName.of('Fade'),
        D: 0.4,
      }));
    }
    return await pinPdfLibDates(doc).save();
  } catch (e) {
    console.warn(`  ⚠ Could not mark the PDF for presentation mode (${e.message}); writing deck without it.`);
    return pdfBytes;
  }
}

// Plaintext speaker-notes sidecar: one block per slide that has a note.
function writeNotesSidecar(outPath, notes) {
  const blocks = [];
  notes.forEach((note, i) => {
    if (note) blocks.push(`# Slide ${i + 1}\n\n${note}\n`);
  });
  // Strip whichever output extension we were given, not just `.pdf` — an `.html`
  // deliverable should get `deck.notes.txt` like every other format, not
  // `deck.html.notes.txt`.
  const sidecar = outPath.replace(/\.(pdf|pptx|png|zip|html)$/i, '') + '.notes.txt';
  fs.writeFileSync(sidecar, blocks.length ? blocks.join('\n') : '(no speaker notes in this deck)\n');
  if (!QUIET) console.log(`Notes: ${blocks.length} slide${blocks.length === 1 ? '' : 's'} → ${sidecar}`);
}

/**
 * Component-aware DOM speech projection for the export (2026-07-11-manifest-speech
 * -contract §6 Phase 2). Parses the sanitized-render HTML, sanitizes each slide
 * section (HARD RULE #22 — the caller-sanitizes contract prose-projection requires),
 * and projects each to natural narration DISPLAY text. Returns [] (never throws) on
 * any failure — the notes-only path below still narrates. `docHtml` is the emulator's
 * cleanDocHtml. Async: the projection + sanitizer are ESM (dynamic import).
 */
async function projectDeckSpeechFromHtml(docHtml) {
  if (!docHtml || typeof docHtml !== 'string') return [];
  try {
    const { JSDOM } = require('jsdom');
    const DOMPurify = require('dompurify');
    const { createSlideSanitizer } = await import('./lib/core/sanitize-slide-html.mjs');
    const { projectDeckToSpeech } = await import('./lib/transformers/prose-projection.mjs');
    const sanitize = createSlideSanitizer(DOMPurify, new JSDOM('').window);
    const doc = new JSDOM(docHtml).window.document;
    const raw = [...doc.querySelectorAll('section[data-lattice-slide]')];
    // Sanitize each section in isolation, then project the clean nodes.
    const clean = raw
      .map((s) => new JSDOM(sanitize(s.outerHTML)).window.document.querySelector('section[data-lattice-slide]'))
      .filter(Boolean);
    return projectDeckToSpeech(clean);
  } catch (e) {
    // Degrade to notes-only, but SURFACE the failure — a swallowed projection
    // crash is otherwise indistinguishable from "nothing to project".
    if (!QUIET) console.warn(`  note: caption projection failed (${e?.message}); falling back to speaker notes only`);
    return [];
  }
}

// Read-along WebVTT sidecars from per-slide narration (--captions). Builds Cadenza
// estimate tracks via the shared root producer, then derives one deck-level .vtt
// (continuous, deck-absolute timeline) plus per-slide <base>.NN.vtt parts. Pure +
// offline — no audio, no TTS key. See 2026-07-08-read-along-export-manifest.md.
// EXPORT NARRATION SOURCE (§6 Phase 2): an authored speaker note wins per slide;
// where a slide has none, the component-aware DOM speech projection narrates it —
// so a deck with no notes still gets read-along captions (the old behavior wrote
// nothing). This narrates the EXPORT's projected prose; the live Studio Present
// path is markdown-only and still narrates differently for the chart family —
// giving Present the same DOM projection is Phase 3, not done here.
// `--strip-notes` intentionally suppresses BOTH notes AND projection (a stripped
// deck emits no narration, honoring the documented contract).
async function writeCaptionsSidecar(outPath, notes, docHtml, captions = []) {
  const { buildReadAlong, mergeNarration } = require('./lib/core/read-along-build.js');
  const { readAlongToVtt, readAlongToVttParts } = require('./lib/core/read-along-vtt.js');
  const base = outPath.replace(/\.(pdf|html?|pptx|png|zip)$/i, '');
  // Deck acronym registry (author `acronyms:` front-matter, §15) → term→spoken map, and the
  // front-matter `captions:` map (Layer 1, §16) → slide-number→read-as text. Parsed once from
  // the shared resolver so both producers can't drift (#904).
  let acronyms;
  let lexicon; // author `lexicon:` — a token (glyph or word) → spoken; beats the built-in commons
  let fmCaptions;
  let lang; // deck language (Marp `lang:`); a non-English deck bypasses English say-as (#919)
  try {
    const { acronymSpokenMap, frontMatterCaptions, frontMatterLang, lexiconMap } = await import('./lib/core/resolve-captions.mjs');
    acronyms = acronymSpokenMap(rawMd);
    lexicon = lexiconMap(rawMd);
    fmCaptions = frontMatterCaptions(rawMd);
    lang = frontMatterLang(rawMd);
  } catch (e) {
    if (!QUIET) console.warn(`  note: narration front-matter parse failed (${e?.message})`);
  }
  const projected = STRIP_NOTES ? [] : await projectDeckSpeechFromHtml(docHtml);
  // A length mismatch (an autosplit deck renders more sections than authored slides)
  // makes the index mapping unsafe, so mergeNarration drops the projection wholesale
  // rather than misalign a caption — surface that here so it isn't silent.
  if (projected.length && projected.length !== notes.length && !QUIET) {
    console.log(`Captions: slide count and rendered sections differ (${notes.length} vs ${projected.length}) — narrating authored notes only`);
  }
  // Chart-narration parity (#902 Gap 1). A chart slide (funnel / journey-weighted /
  // radar / quadrant / state-chart) narrates a COMPUTED fact — funnel conversion %,
  // the auto-fit scale an unlabeled axis is plotted against, an inferred start/terminal
  // state — that exists only in the render, never in the figure projection's
  // heading-only caption. Run the SAME shared narrateChart the live Studio Present uses
  // (lib/core/chart-narration.js) per chart slide and, when it fires (non-null),
  // substitute its FULL-slide narration for the figure projection at that index. It
  // sits at the PROJECTION precedence level (mergeNarration still lets an inline
  // caption / front-matter caption / speaker note win), exactly as Present's narrationAt
  // orders note → chart → projection. `splitSourceToSections` recovers each rendered
  // section's SOURCE Markdown from the engine's OWN `hr`-token boundary (bake headings
  // boundaries → `---`, then group on markdown-it's hr tokens), so blocks[i] ⇔ section i
  // by construction — it can't drift from the render the way a parallel line-splitter
  // did (a chart binding to the wrong slide on a `***` / setext / empty-section deck).
  // The count guard is a belt-and-suspenders: autosplit / focus-step expansion ADD
  // sections after this split, so a mismatch stands chart narration down (a logged
  // note) rather than misalign — the same guard mergeNarration applies to the projection.
  if (projected.length === notes.length && projected.length > 0) {
    try {
      const { narrateChart } = require('./lib/core/chart-narration.js');
      const { splitSourceToSections } = require('./lib/core/section-source-split.js');
      // Narrate from a FENCE-INTACT source, not `rawMd`. `rawMd` bakes every ```mermaid
      // fence to `<svg>` BEFORE this split, so a `diagram` slide's Mermaid source is gone —
      // narrateChart's flowchart narrator (narrateDiagram) would then fire live (Present has
      // the fence) but be silent on export, breaking HARD RULE #1 parity. `appendAutoGlossary(md)`
      // is the ORIGINAL source (fences intact) with the SAME glossary slide appended, so it has
      // identical section boundaries/counts to `rawMd` (preprocessMermaid only swaps a fenced
      // block for an inline `<svg>` — it injects no heading/`---`/hr, and the glossary append is
      // front-matter-driven, mermaid-independent). The 5 chart narrators parse LIST Markdown the
      // bake never touches (and withoutFences-blank any fence anyway), so they're byte-identical
      // on this input; only narrateDiagram needs the fence. See
      // 2026-07-13-mermaid-diagram-narration.md §8 (Axis B1, trio-verified).
      const blocks = splitSourceToSections(appendAutoGlossary(md));
      if (blocks.length === projected.length) {
        for (let i = 0; i < blocks.length; i++) {
          // Per-slide guard: one pathological chart slide can't disable narration for
          // the rest of the deck (a deck-wide try/catch would).
          try {
            const chart = narrateChart(blocks[i]);
            if (chart) projected[i] = chart;
          } catch (e) {
            if (!QUIET) console.warn(`  note: chart narration skipped on slide ${i + 1} (${e?.message})`);
          }
        }
      } else if (!QUIET) {
        // Under autosplit / focus-step expansion the rendered section count no longer
        // matches the authored slides, so chart slides narrate from the heading-only
        // projection (Present, markdown-indexed, still narrates them richly) — surface
        // it so the divergence isn't silent.
        console.log(`Captions: rendered sections and authored slides differ (${projected.length} vs ${blocks.length}) — chart slides narrate from the projection (heading only) in the export`);
      }
    } catch (e) {
      if (!QUIET) console.warn(`  note: chart narration skipped (${e?.message})`);
    }
  }
  // The front-matter `captions:` map is keyed by AUTHORED slide number, but `notes` is indexed
  // per RENDERED section. Autosplit ADDS sections, so rendered-index+1 ≠ the author's number and a
  // number-keyed caption would misbind past a split — so drop the front-matter map under autosplit
  // (with a note). Inline `<!-- caption: -->` is unaffected: it rides with its section, staying
  // index-aligned. (Present resolves the same map through the original source index; the export has
  // no such map here.) NOTE: captions are NOT stripped by `--strip-notes` — that flag removes the
  // private NOTE channel; a caption is public-facing narration the author opts into via `--captions`.
  // Front-matter `captions:[n]` is keyed by AUTHORED slide, and splitting changes the
  // page count — so the keys stop lining up the moment a slide paginates. This used to
  // DROP the whole map on any split deck, which was survivable while splitting was
  // opt-in and is not now that it is intrinsic: every deck with a split slide would
  // silently lose its authored captions. Remap instead. `authoredIndexPerPage` recovers
  // page → authored slide from the contiguous `data-split-run` groups, so a caption
  // written for slide 4 reaches every page slide 4 became — the same treatment notes
  // got, for the same reason (2026-07-29-autosplit-is-not-a-toggle.md).
  let fmForMerge = fmCaptions;
  if (fmCaptions?.size) {
    const at = cleanDocHtml.search(/<section\b[^>]*\bdata-lattice-slide=/);
    if (at >= 0) {
      const pages = require('./lib/core/split-sections').splitSections(cleanDocHtml.slice(at))
        .filter((x) => x.type === 'section');
      const origin = require('./lib/core/auto-split').authoredIndexPerPage(pages);
      // Only rebuild when the split actually moved something; an unsplit deck keeps the
      // authored map byte-for-byte, so a deck that never paginates is unaffected.
      if (origin.length && origin[origin.length - 1] !== origin.length) {
        const remapped = new Map();
        origin.forEach((authored, i) => {
          if (fmCaptions.has(authored)) remapped.set(i + 1, fmCaptions.get(authored));
        });
        fmForMerge = remapped;
        if (!QUIET) console.log(`Captions: front-matter captions remapped across the split — ${remapped.size} page(s) keyed from ${fmCaptions.size} authored slide(s)`);
      }
    }
  }
  // `--strip-captions` blanks the author's caption OVERRIDES (inline + front-matter) — a
  // channel separate from `--strip-notes`. Those slides fall back to note → projection, so
  // the deck still gets an auto caption track (add `--strip-notes` too to fall back to the
  // projection alone). Inline captions come in via the `captions` arg; drop both here.
  const inlineForMerge = STRIP_CAPTIONS ? [] : captions;
  if (STRIP_CAPTIONS) fmForMerge = null;
  // Precedence, highest first: inline `<!-- caption: -->` → front-matter `captions:[n]` → note → projection.
  const slideTexts = mergeNarration(notes, projected, { captions: inlineForMerge, fmCaptions: fmForMerge });
  const readAlong = buildReadAlong(slideTexts, {
    // Voice is metadata for the manifest; captions time off `pace`, not the voice.
    voice: { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 },
    pace: 'moderate',
    acronyms,
    lexicon,
    lang, // non-English deck bypasses the English lexicon + number/period expansion (#919)
  });
  if (!readAlong.slides.length) {
    if (!QUIET) console.log('Captions: nothing to narrate (no notes, no projectable slide prose) — no .vtt written');
    return;
  }
  fs.writeFileSync(`${base}.vtt`, readAlongToVtt(readAlong)); // deck-level, continuous
  const parts = readAlongToVttParts(readAlong); // per-slide, slide-relative
  const pad = Math.max(2, String(notes.length).length);
  for (const { index, vtt } of parts) {
    fs.writeFileSync(`${base}.${String(index + 1).padStart(pad, '0')}.vtt`, vtt);
  }
  if (!QUIET) {
    console.log(
      `Captions: ${parts.length} narrated slide${parts.length === 1 ? '' : 's'} → ${base}.vtt + ${parts.length} per-slide .vtt`,
    );
  }
}
