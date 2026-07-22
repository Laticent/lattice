#!/usr/bin/env node
/**
 * lattice-emulator.js — Marp-faithful HTML renderer + PDF exporter
 *
 * Emulates the HTML structure that Marp CLI produces so that
 * lattice.css (written for Marp) renders correctly without
 * modification. Produces section elements with the same
 * attributes, pagination span, and header/footer structure
 * that Marp CLI v4 outputs.
 *
 * Mermaid diagrams (```mermaid blocks) are rendered to SVG via mmdc
 * with theme variables mapped to the Lattice palette.
 *
 * Usage:
 *   node lattice-emulator.js <source.md> <output.pdf> [palette]
 *   node lattice-emulator.js <source.md> <custom-layouts.css> <output.pdf> [palette]
 *
 * The bundled `lattice.css` is auto-resolved when no `.css` arg is given;
 * pass an explicit `.css` path only to override the layout engine (rare —
 * for layout-engine development, not deck authoring).
 *
 * NOTE: This script exists only because Marp CLI cannot be installed
 * in this build environment. End users should use Marp CLI directly:
 *   marp deck.md --pdf --allow-local-files   # picks up marp.config.js
 */

const fs            = require('fs');
const path          = require('path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const os            = require('os');
const { execSync }  = require('child_process');

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
const LOGO_MARK_RE = /<span\b([^>]*\bclass="[^"]*\blogo-mark\b[^"]*"[^>]*)><\/span>/g;
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

// Package root for sibling-asset lookups (themes/, dist/lattice.css,
// node_modules/.bin/mmdc). This file runs from two locations: as repo-root
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

// ── KaTeX CSS ────────────────────────────────────────────────────────────────
// The engine (lib/engine, created with `mathOutput:'html'`) renders `$…$` /
// `$$…$$` to KaTeX markup itself; the emulator only links KaTeX's stylesheet so
// the glyph fonts resolve in the PDF. Resolved lazily — absent the optional dep,
// no link is emitted and math degrades to plain text.
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
// cleanly. Marp CLI (marp.config.js) and the VS Code preview
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
  node lattice-emulator.js <source.md> <output.pdf|.pptx|.png|.zip> [palette]
  node lattice-emulator.js <source.md> <custom.css> <output> [palette]

ARGUMENTS
  source.md          Markdown source (required)
  output             Output path (required); the extension picks the format:
                       .pdf   vector PDF, selectable text (default; + HTML sidecar;
                              or one image per page with --raster)
                       .pptx  PowerPoint, one full-bleed slide image per slide
                       .png   one PNG per slide, written as <output>.NNN.png
                       .zip   an IMAGE SET — a zip of one raster per slide
                              (PNG/JPEG/WebP) plus opt-in thumbnails and
                              standalone chart/diagram SVGs (see IMAGE SET below)
                     An HTML sidecar is always written alongside.
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
                          'class: print'.
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
  const pkg = require('./package.json');
  console.log(`lattice-emulator ${pkg.version}`);
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
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-q' || a === '--quiet') { flags.quiet = true; continue; }
    if (a === '--notes') { flags.notes = true; continue; }
    if (a === '--captions') { flags.captions = true; continue; }
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
if (positional[1]?.endsWith('.css')) {
  cssFile    = positional[1];
  outFile    = positional[2];
  paletteArg = positional[3];
} else {
  cssFile    = path.join(PKG_ROOT, 'dist', 'lattice.css');
  outFile    = positional[1];
  paletteArg = positional[2];
}
// Named flags override positional resolution.
if (flags.css)     cssFile    = flags.css;
if (flags.output)  outFile    = flags.output;
if (flags.palette) paletteArg = flags.palette;
const QUIET = flags.quiet;
const NOTES_SIDECAR = !!flags.notes;
const CAPTIONS = !!flags.captions;
// `--strip-notes`: the privacy strip for the self-contained player. Notes ride by
// default (present-from-it), but this scrubs them from EVERY baked copy — the slide
// DOM aside, the PDF text annotation, AND the envelope `source` (design doc §Notes
// on export) — so a shared file leaks no speaker text.
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
  if (STRIP_NOTES) out = notesCore.stripNotesFromSource(out, noteBodies);
  if (STRIP_CAPTIONS) out = notesCore.stripCaptionsFromSource(out);
  return out;
}
const NOTES_ICON = !!flags['notes-icon'];
const EMBED_SOURCE = !!flags['embed-source'];
const KEEP_VECTOR_IMAGES = !!flags['keep-vector-images'];
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
// anything else → the vector PDF (the original, selectable-text path). PPTX/PNG
// are rasterized from the same headless-Chromium render the PDF uses, so all
// three formats are byte-for-byte the same pixels.
const OUT_EXT = path.extname(outFile).toLowerCase();
// `.zip` → an IMAGE SET: a zip of one raster per slide (PNG/JPEG/WebP) plus opt-in
// thumbnails and standalone chart/diagram SVGs. `.pptx` → image-per-slide PowerPoint,
// `.png` → loose per-slide PNGs, anything else → the vector PDF.
const OUT_FORMAT = OUT_EXT === '.pptx' ? 'pptx'
  : OUT_EXT === '.png' ? 'png'
  : OUT_EXT === '.zip' ? 'imageset'
  : 'pdf';
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
// --raster swaps the PDF's vector page content for one full-bleed slide image
// per page (the same 2× screenshots the PPTX path uses) — a maximum-compatibility
// mode for viewers that mishandle vector constructs. Selectable text is lost, so
// it is opt-in; the vector path stays the default. PDF only: PPTX/PNG are raster
// by construction, so the flag is meaningless (and warned) there.
const RASTER_PDF = !!flags.raster && OUT_FORMAT === 'pdf';
if (flags.raster && OUT_FORMAT !== 'pdf') {
  console.warn(`  ⚠ --raster applies only to .pdf output (a .${OUT_FORMAT} is already image-per-slide) — ignoring.`);
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

// Friendly error wrapper for file reads. Bare ENOENT throws produce
// stack traces that look like crashes; this surfaces them as one-line
// errors with exit code 1.
function readFileOrDie(p, label) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') console.error(`error: ${label} not found: ${p}`);
    else if (e.code === 'EACCES') console.error(`error: ${label} not readable (permission denied): ${p}`);
    else console.error(`error: failed to read ${label} (${p}): ${e.message}`);
    process.exit(1);
  }
}

// --print stamps the deck-wide `print` canvas class (the B&W-safe ink-on-white
// band; base.modifiers.css section.print) by merging it into the front-matter
// `class:`, so the existing deck-class propagation (plugins.js deckClassPropagate)
// applies it to every slide — the same path as authoring `class: print` directly.
function withPrintClass(src) {
  const fm = src.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)/);
  if (!fm) return `---\nclass: print\n---\n\n${src}`; // no front matter → add one
  const [full, open, body, close] = fm;
  if (/^[ \t]*class:.*\bprint\b/m.test(body)) return src; // already present
  const merged = /^[ \t]*class:/m.test(body)
    // Anchor the value to the class LINE ([^\n], not \s* which would cross the
    // newline and append `print` onto the next key). Handles an empty `class:`
    // (→ `class: print`) and drops any quotes (a class list needs none).
    ? body.replace(/^[ \t]*class:[ \t]*["']?([^"'\n]*)["']?[ \t]*$/m, (_m, val) => `class: ${[val.trim(), 'print'].filter(Boolean).join(' ')}`)
    : `${body}\nclass: print`;
  return src.replace(full, open + merged + close);
}
const mdRaw = readFileOrDie(mdFile, 'source markdown');
// PRINT canvas is stamped by `--print` OR by an image set's `--image-mode print`
// (same deck-wide class:print path, so the whole set renders the B&W-safe handout).
const WANT_PRINT = flags.print || (OUT_FORMAT === 'imageset' && IMAGE_SET_OPTS.mode === 'print');
const md = WANT_PRINT ? withPrintClass(mdRaw) : mdRaw;

// Resolve palette name from the precedence chain (CLI > env > front
// matter > default). Logic lives in lib/resolve-palette.js so it can
// be unit-tested in isolation; see test/unit/palette-resolution.test.js.
const { resolvePalette } = require('./lib/core/resolve-palette');
const { CLIP_CELL_SELECTOR, PROBE_SRC } = require('./lib/core/overflow-probe');
const { SETTLE_FONTS_SRC } = require('./lib/core/font-settle');
// An image set's `--image-mode light|dark` forces the palette's light / dark variant
// (the same `<name>-dark` companion the Studio's dark export picks — HARD RULE #1),
// on top of the normal precedence chain. `inherit`/`print` leave the resolved name alone
// (print rides the class:print stamp above, palette-independent). A missing dark
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
const palettePath = path.join(PKG_ROOT, 'themes', `${paletteName}.css`);
if (!fs.existsSync(palettePath)) {
  console.error(`error: palette not found: ${paletteName}`);
  console.error(`       (looked in ${palettePath})`);
  console.error(`available palettes: ${listAvailablePalettes()}`);
  process.exit(1);
}
// Load the palette and any sibling palette imports it declares (e.g.
// cuoio-dark.css imports cuoio.css). The palette parser scans `:root`
// blocks of this combined string, so the dark variants inherit every
// token defined in the parent without duplicating declarations.
function loadPaletteWithImports(filePath, seen = new Set(), label = null) {
  if (seen.has(filePath)) return '';
  seen.add(filePath);
  const content = readFileOrDie(filePath, label ?? `palette '${path.basename(filePath, '.css')}'`);
  // Match `@import 'name';` and `@import "name";` and `@import name;`.
  // The lattice palette convention is single-token names (cuoio, indaco)
  // resolved relative to the themes/ directory.
  const importRe = /@import\s+["']?([A-Za-z0-9_-]+)["']?\s*;/g;
  let imported = '';
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const name = m[1];
    if (name === 'lattice') continue; // layout CSS, loaded separately
    const importPath = path.join(path.dirname(filePath), `${name}.css`);
    if (fs.existsSync(importPath)) {
      imported += loadPaletteWithImports(importPath, seen) + '\n';
    }
  }
  // Parent first so child :root blocks override on identical token names
  // (matches CSS cascade order).
  return imported + content;
}

const paletteCSS = loadPaletteWithImports(palettePath);
const layoutCSS  = loadPaletteWithImports(cssFile, new Set(), 'layout CSS');
const css = paletteCSS + '\n' + layoutCSS;

// ── Fail fast on an unknown `size:` directive (#502) ──────────────────────
// A typo'd size name (`size: storyy`) otherwise resolves SILENTLY to the first
// declared @size: the deck renders at the wrong geometry with no signal, and a
// degenerate value can wedge the render. Validate the EXPLICIT directive against
// the registered @size names (theme first, then base) and error at config time —
// before any Chrome work — listing the valid names. No directive → hd default,
// unchanged. Front-matter-scoped so a `size:` in prose / a code block can't trip it.
const { parseSizes } = require('./lib/engine/css');
const _mdFmMatch  = md.match(/^---\n[\s\S]*?\n---/);
const _mdFm       = _mdFmMatch ? _mdFmMatch[0] : '';
const explicitSize = (_mdFm.match(/^\s*size:\s*["']?([\w:/-]+)["']?\s*$/m) || [])[1];
if (explicitSize) {
  const knownSizes = new Set();
  for (const src of [paletteCSS, layoutCSS]) for (const k of parseSizes(src).keys()) knownSizes.add(k);
  if (knownSizes.size && !knownSizes.has(explicitSize)) {
    console.error(`error: unknown size: ${explicitSize}`);
    console.error(`available sizes: ${[...knownSizes].sort().join(', ')}`);
    process.exit(1);
  }
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
//      a normal page stylesheet via lattice.css; the mmdc-produced SVG is
//      embedded inline in the host HTML, so the host stylesheet cascades
//      onto it at PDF-rasterize time — same mechanism the runtime preview
//      already uses. No Mermaid `themeCSS` init parameter is used.
//
// See engineering/decisions/2026-05-12-diagram-tokens.md for the architecture.

// ── Mermaid theme variables — structural map only ───────────────────────
// The mapping below names which Mermaid theme variable corresponds to which
// CSS custom property in the active palette. The CSS variables hold the
// actual hex values; this map is structural and unchanging across palettes.
//
// Adding a new palette doesn't require editing this file — define the same
// CSS custom properties in themes/<n>.css and the same mapping resolves
// against the new values.
//
// Reference for the variable inventory: https://mermaid.js.org/config/theming.html
const MERMAID_VAR_MAP = {
  // Typography (literal — fonts are structural, not palette-specific)
  fontFamily: { literal: '"JetBrains Mono", monospace' },
  fontSize:   { literal: '14px' },

  // Canvas
  background:               { var: 'bg' },

  // Primary/secondary/tertiary fills (pale band)
  primaryColor:             { var: 'cat-1-fill' },
  secondaryColor:           { var: 'cat-2-fill' },
  tertiaryColor:            { var: 'bg-alt' },
  primaryBorderColor:       { var: 'diagram-stroke' },
  secondaryBorderColor:     { var: 'diagram-stroke' },
  tertiaryBorderColor:      { var: 'diagram-stroke' },

  // Text — ONE token, --cat-on-fill, for every text element. It flips
  // with the canvas (dark ink on a light canvas, light ink on a dark
  // canvas). No "shape text vs canvas text" split: the fills flip with
  // the canvas too, so ink and fill always stay matched. Text on a
  // categorical fill, text on a pale surface, titles, edge labels —
  // all the same token, all flip together.
  primaryTextColor:         { var: 'cat-on-fill' },
  secondaryTextColor:       { var: 'cat-on-fill' },
  tertiaryTextColor:        { var: 'cat-on-fill' },
  textColor:                { var: 'cat-on-fill' },
  titleColor:               { var: 'cat-on-fill' },
  labelTextColor:           { var: 'cat-on-fill' },
  loopTextColor:            { var: 'cat-on-fill' },
  classText:                { var: 'cat-on-fill' },
  labelColor:               { var: 'cat-on-fill' },

  // Lines (near-black on white canvas)
  lineColor:                { var: 'diagram-line' },
  defaultLinkColor:         { var: 'diagram-line' },
  edgeLabelBackground:      { var: 'bg' },
  labelBackground:          { var: 'bg' },

  // Main background paths
  mainBkg:                  { var: 'cat-1-fill' },
  nodeBorder:               { var: 'diagram-stroke' },
  nodeTextColor:            { var: 'cat-on-fill' },   // flowchart node text, on fill
  clusterBkg:               { var: 'bg-alt' },
  clusterBorder:            { var: 'diagram-stroke' },

  // cScale (mid-tone band) — kanban lighten brings to L≈70
  cScale0:                  { var: 'cat-1-mark' },
  cScale1:                  { var: 'cat-2-mark' },
  cScale2:                  { var: 'cat-3-mark' },
  cScale3:                  { var: 'cat-4-mark' },
  cScale4:                  { var: 'cat-5-mark' },
  cScale5:                  { var: 'cat-6-mark' },
  cScale6:                  { var: 'cat-1-mark' },
  cScale7:                  { var: 'cat-2-mark' },
  cScale8:                  { var: 'cat-3-mark' },
  cScale9:                  { var: 'cat-4-mark' },
  cScale10:                 { var: 'cat-5-mark' },
  cScale11:                 { var: 'cat-6-mark' },

  // cScaleLabel — text fill in Mermaid's auto-generated
  // `.section-${r-1} text { fill: cScaleLabel${r} }` rule. Mermaid's own
  // contrast-aware derivation lands on white when fed mid-tone cScale,
  // which fails against our pale band fills. Setting each slot to the
  // paired band-text token (all map to --text-heading in shipped palettes)
  // ensures the auto rule renders dark ink, regardless of whether our
  // explicit CSS overrides match the diagram in question.
  cScaleLabel0:  { var: 'cat-on-fill' },
  cScaleLabel1:  { var: 'cat-on-fill' },
  cScaleLabel2:  { var: 'cat-on-fill' },
  cScaleLabel3:  { var: 'cat-on-fill' },
  cScaleLabel4:  { var: 'cat-on-fill' },
  cScaleLabel5:  { var: 'cat-on-fill' },
  cScaleLabel6:  { var: 'cat-on-fill' },
  cScaleLabel7:  { var: 'cat-on-fill' },
  cScaleLabel8:  { var: 'cat-on-fill' },
  cScaleLabel9:  { var: 'cat-on-fill' },
  cScaleLabel10: { var: 'cat-on-fill' },
  cScaleLabel11: { var: 'cat-on-fill' },

  // fillType (subgraph / mindmap-level fills, pale band)
  fillType0: { var: 'cat-1-fill' },
  fillType1: { var: 'cat-2-fill' },
  fillType2: { var: 'cat-3-fill' },
  fillType3: { var: 'cat-4-fill' },
  fillType4: { var: 'cat-5-fill' },
  fillType5: { var: 'cat-6-fill' },
  fillType6: { var: 'cat-1-fill' },
  fillType7: { var: 'cat-2-fill' },

  // Sequence diagram
  actorBkg:                 { var: 'cat-1-fill' },
  actorBorder:              { var: 'diagram-stroke' },
  actorTextColor:           { var: 'cat-on-fill' },   // sequence actor text, on fill
  actorLineColor:           { var: 'diagram-line' },
  signalColor:              { var: 'diagram-line' },
  signalTextColor:          { var: 'cat-on-fill' },
  labelBoxBkgColor:         { var: 'bg-alt' },
  labelBoxBorderColor:      { var: 'diagram-stroke' },
  activationBorderColor:    { var: 'diagram-stroke' },
  activationBkgColor:       { var: 'cat-1-fill' },
  sequenceNumberColor:      { var: 'cat-on-fill' },

  // Notes (yellow accent — category-distinct)
  noteBkgColor:             { var: 'diagram-note' },
  noteTextColor:            { var: 'cat-on-fill' },
  noteBorderColor:          { var: 'diagram-today' },

  // Error (alarm — saturated red)
  errorBkgColor:            { var: 'diagram-critical' },
  errorTextColor:           { var: 'cat-on-fill' },

  // Pie chart (pale band cycle — unified contract)
  pie1:  { var: 'cat-1-fill' },
  pie2:  { var: 'cat-2-fill' },
  pie3:  { var: 'cat-3-fill' },
  pie4:  { var: 'cat-4-fill' },
  pie5:  { var: 'cat-5-fill' },
  pie6:  { var: 'cat-6-fill' },
  pie7:  { var: 'cat-7-fill' },
  pie8:  { var: 'cat-8-fill' },
  pie9:  { var: 'cat-9-fill' },
  pie10: { var: 'cat-10-fill' },
  pie11: { var: 'cat-11-fill' },
  pie12: { var: 'cat-12-fill' },
  pieTitleTextSize:    { literal: '18px' },
  pieTitleTextColor:   { var: 'cat-on-fill' },
  pieSectionTextSize:  { literal: '14px' },
  pieSectionTextColor: { var: 'cat-on-fill' },   // text on pie slices, on fill
  pieLegendTextSize:   { literal: '13px' },
  pieLegendTextColor:  { var: 'cat-on-fill' },
  pieStrokeColor:      { var: 'bg' },
  pieStrokeWidth:      { literal: '2px' },
  pieOuterStrokeWidth: { literal: '2px' },
  pieOuterStrokeColor: { var: 'diagram-stroke' },
  pieOpacity:          { literal: '1' },

  // Gantt (pale bars, dark text, alarm-only saturation)
  sectionBkgColor:        { var: 'bg-alt' },
  altSectionBkgColor:     { var: 'bg' },
  sectionBkgColor2:       { var: 'cat-1-fill' },
  taskBkgColor:           { var: 'cat-1-fill' },
  taskTextColor:          { var: 'cat-on-fill' },   // text on task bar, on fill
  taskTextLightColor:     { var: 'cat-on-fill' },   // ditto, Mermaid's "dark bar" variant
  taskTextOutsideColor:   { var: 'cat-on-fill' },  // text in the margin, on canvas
  taskTextClickableColor: { var: 'cat-on-fill' },   // text on task bar, on fill
  taskTextDarkColor:      { var: 'cat-on-fill' },   // Mermaid's dark-bar text variant — same ink contract
  taskBorderColor:        { var: 'diagram-stroke' },
  activeTaskBkgColor:     { var: 'diagram-active' },
  activeTaskBorderColor:  { var: 'diagram-active-mark' },
  gridColor:              { var: 'diagram-done' },
  doneTaskBkgColor:       { var: 'diagram-done' },
  doneTaskBorderColor:    { var: 'diagram-done-mark' },
  critBkgColor:           { var: 'diagram-critical' },
  critBorderColor:        { var: 'diagram-critical-mark' },
  todayLineColor:         { var: 'diagram-today' },

  // Git graph
  git0: { var: 'cat-1-mark' },
  git1: { var: 'cat-2-mark' },
  git2: { var: 'cat-3-mark' },
  git3: { var: 'cat-4-mark' },
  git4: { var: 'cat-5-mark' },
  git5: { var: 'cat-6-mark' },
  git6: { var: 'cat-8-mark' },
  git7: { var: 'cat-7-mark' },
  gitBranchLabel0: { var: 'cat-on-fill' },
  gitBranchLabel1: { var: 'cat-on-fill' },
  gitBranchLabel2: { var: 'cat-on-fill' },
  gitBranchLabel3: { var: 'cat-on-fill' },
  gitBranchLabel4: { var: 'cat-on-fill' },
  gitBranchLabel5: { var: 'cat-on-fill' },
  gitBranchLabel6: { var: 'cat-on-fill' },
  gitBranchLabel7: { var: 'cat-on-fill' },
  commitLabelColor:      { var: 'cat-on-fill' },
  commitLabelBackground: { var: 'bg-alt' },
  tagLabelColor:         { var: 'cat-on-fill' },  // flips with canvas
  tagLabelBackground:    { var: 'bg-alt' },        // neutral label chip — distinct
  tagLabelBorder:        { var: 'diagram-stroke' },       // from the colour-coded branch chips

  // Quadrant chart
  quadrant1Fill:                    { var: 'cat-1-fill' },
  quadrant2Fill:                    { var: 'cat-2-fill' },
  quadrant3Fill:                    { var: 'cat-3-fill' },
  quadrant4Fill:                    { var: 'cat-4-fill' },
  quadrant1TextFill:                { var: 'cat-1-mark' },
  quadrant2TextFill:                { var: 'cat-2-mark' },
  quadrant3TextFill:                { var: 'cat-3-mark' },
  quadrant4TextFill:                { var: 'cat-4-mark' },
  quadrantPointFill:                { var: 'diagram-stroke' },
  quadrantPointTextFill:            { var: 'cat-on-fill' },
  quadrantXAxisTextFill:            { var: 'cat-on-fill' },
  quadrantYAxisTextFill:            { var: 'cat-on-fill' },
  quadrantInternalBorderStrokeFill: { var: 'cat-8-mark' },
  quadrantExternalBorderStrokeFill: { var: 'diagram-stroke' },
  quadrantTitleFill:                { var: 'cat-on-fill' },

  // State / class
  altBackground: { var: 'bg-alt' },

  // Entity-relationship diagram — the attribute-row band fills. Without these,
  // Mermaid derives them from `lighten(background)`, which renders off-brand in
  // the exported PDF (the deliverable). Pale band: odd rows on the primary fill,
  // even rows on the alt surface — the same alternating-band contract as gantt.
  attributeBackgroundColorOdd:  { var: 'cat-1-fill' },
  attributeBackgroundColorEven: { var: 'bg-alt' },

  // XY chart — nested object, expanded below. plotColorPalette joins
  // multiple palette vars into a comma-separated string (Mermaid's required
  // format for this key) so each palette's --cat-* hues drive the bars and
  // lines, not a hardcoded indaco-flavoured literal. The axis LINE + TICK keys
  // theme the axes themselves (without them Mermaid falls back to its own
  // primaryTextColor, leaving the axes subtly mis-toned in the PDF).
  xyChart: { nested: {
    backgroundColor:  { var: 'bg' },
    titleColor:       { var: 'text-heading' },
    xAxisLabelColor:  { var: 'text-heading' },
    xAxisTitleColor:  { var: 'text-heading' },
    xAxisLineColor:   { var: 'diagram-stroke' },
    xAxisTickColor:   { var: 'cat-8-mark' },
    yAxisLabelColor:  { var: 'text-heading' },
    yAxisTitleColor:  { var: 'text-heading' },
    yAxisLineColor:   { var: 'diagram-stroke' },
    yAxisTickColor:   { var: 'cat-8-mark' },
    plotColorPalette: { joinVars: ['cat-1-mark', 'cat-2-mark', 'cat-3-mark', 'cat-4-mark', 'cat-5-mark', 'cat-6-mark'] },
  }},
};

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
function resolveMermaidThemeVars(paletteVars) {
  const result = {};
  const resolve = (entry) => {
    if (entry.literal !== undefined) return entry.literal;
    if (entry.var !== undefined) {
      const val = paletteVars[entry.var];
      if (!val) {
        console.warn(`  ⚠ Palette missing CSS variable: --${entry.var}`);
        return '#000000';
      }
      return val;
    }
    if (entry.joinVars !== undefined) {
      // Mermaid keys like xyChart.plotColorPalette want a comma-separated
      // string of hex values, not an array — pull each var, fall back to a
      // black sentinel on miss so a palette gap is loud, then join.
      return entry.joinVars.map(name => {
        const val = paletteVars[name];
        if (!val) {
          console.warn(`  ⚠ Palette missing CSS variable: --${name}`);
          return '#000000';
        }
        return val;
      }).join(',');
    }
    return undefined;
  };
  for (const [key, entry] of Object.entries(MERMAID_VAR_MAP)) {
    if (entry.nested) {
      result[key] = {};
      for (const [nKey, nEntry] of Object.entries(entry.nested)) {
        result[key][nKey] = resolve(nEntry);
      }
    } else {
      result[key] = resolve(entry);
    }
  }
  return result;
}

// Parse the combined cascade (layoutCSS first, then paletteCSS) so the
// universal semantic palette defaults declared in lattice.css are visible
// to the Mermaid var resolver. Theme declarations parsed last override
// defaults — matches the real browser cascade where `@import 'lattice'`
// at the top of every theme loads lattice.css first.
const PALETTE_VARS = parsePaletteVars(layoutCSS + '\n' + paletteCSS);
const MERMAID_THEME_VARS = resolveMermaidThemeVars(PALETTE_VARS);
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
const MERMAID_THEME_VARS_DARK = resolveMermaidThemeVars(PALETTE_VARS_DARK);
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
const MERMAID_THEME_VARS_PRINT = resolveMermaidThemeVars(overlayPrintVars(PALETTE_VARS));

// ── Puppeteer config — chrome auto-detection ─────────────────────────────
// The renderer shells out to mmdc (mermaid-cli) which uses puppeteer to
// rasterize diagrams. Puppeteer needs a Chrome binary; resolution order:
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
const PUPPETEER_CONFIG = JSON.stringify(
  CHROME_EXEC
    ? { executablePath: CHROME_EXEC, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    : { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
);
if (!CHROME_EXEC) {
  console.warn('  ⚠ No Chrome binary detected. Set PUPPETEER_EXECUTABLE_PATH or install puppeteer to download one.');
}

function renderMermaidOne(definition, themeVars, extraClass) {
  // Prepend the Mermaid init block if not already present.
  // JetBrains Mono is bundled by the lattice.css font import and is the
  // safe default for diagrams: predictable character widths, no measurement
  // drift between the layout pass and render pass.
  //
  // No `themeCSS` field is set: per-diagram CSS overrides live in
  // lattice-diagram.css and reach the SVG via the host page's stylesheet
  // cascade (the mmdc-produced SVG is embedded inline in the host HTML at
  // PDF-rasterize time). themeVariables is enough here because it covers
  // the values Mermaid inlines as SVG attributes — gradient stops, marker
  // fills, gantt grid lines — which no external CSS can reach.
  const hasInit = definition.includes('%%{init');
  const initObj = {
    theme: 'base',
    themeVariables: themeVars,
    // C4 ships with shape widths tuned for very short Person()/System()
    // labels and never wraps. Limit shapes-per-row to 3 (default 4) so a
    // 5-shape diagram fans across two rows rather than cramming a single
    // tight strip. Width/height keys exist in the schema but Mermaid 11's
    // c4 renderer ignores them — fix authoring-side by keeping labels short.
    c4: {
      c4ShapeInRow: 3,
      c4BoundaryInRow: 1,
    },
  };
  // Mermaid requires YAML frontmatter (--- ... ---) to be the FIRST thing in
  // the source. If the diagram opens with frontmatter, inject %%{init}%%
  // AFTER the closing fence; otherwise prepend it normally.
  const initDirective = `%%{init: ${JSON.stringify(initObj)}}%%`;
  let themed;
  if (hasInit) {
    themed = definition;
  } else {
    const fmMatch = definition.match(/^---\n[\s\S]*?\n---\n/);
    themed = fmMatch
      ? `${fmMatch[0]}${initDirective}\n${definition.slice(fmMatch[0].length)}`
      : `${initDirective}\n${definition}`;
  }

  const tmpDir    = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-'));
  const inFile    = path.join(tmpDir, 'diagram.mmd');
  const outSvg    = path.join(tmpDir, 'diagram.svg');
  const cfgFile   = path.join(tmpDir, 'puppeteer.json');

  fs.writeFileSync(inFile,  themed);
  fs.writeFileSync(cfgFile, PUPPETEER_CONFIG);

  // mmdc / Puppeteer has known transient failures (browser startup races,
  // network hiccups when fetching CDN-hosted icon sets for architecture/c4).
  // Retry up to 3 times before falling back. Each attempt is fully isolated:
  // we delete any stale output between tries.
  const MAX_ATTEMPTS = 3;
  let lastError = null;
  // Resolve mmdc binary explicitly — falls back to bare 'mmdc' on PATH if the
  // local install is missing. Direct `node lattice-emulator.js` doesn't include
  // node_modules/.bin in PATH the way `npm run` does.
  const localMmdc = path.join(PKG_ROOT, 'node_modules', '.bin', 'mmdc');
  const mmdcBin   = fs.existsSync(localMmdc) ? localMmdc : 'mmdc';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (fs.existsSync(outSvg)) fs.unlinkSync(outSvg);
      execSync(
        `"${mmdcBin}" -i "${inFile}" -o "${outSvg}" --backgroundColor transparent --puppeteerConfigFile "${cfgFile}"`,
        { stdio: 'pipe' }
      );
      if (!fs.existsSync(outSvg) || fs.statSync(outSvg).size === 0) {
        throw new Error('mmdc exited cleanly but produced no SVG');
      }
      let svg = fs.readFileSync(outSvg, 'utf8');
      // mmdc hardcodes the SVG root id to "my-svg" and prefixes every internal
      // id (markers, gradients, filters) and every emitted CSS rule with that
      // same string. When a slide deck embeds many Mermaid SVGs in one HTML,
      // their `<style>` blocks all use `#my-svg .node …` selectors that step
      // on each other — the last diagram's theme variables (e.g. a treeview
      // with primaryColor="#FFFFFF") silently override every prior diagram's
      // node fills. Rewrite to a per-diagram suffix so the SVGs are isolated.
      // The replacement is a single global substitution: it catches the root
      // id, every internal id (e.g. my-svg-flowchart-A-0), every url(#my-svg…)
      // reference, and every #my-svg selector inside the embedded <style>.
      const uniqueId = `lattice-mmd-${renderMermaidOne.counter = (renderMermaidOne.counter || 0) + 1}`;
      svg = svg.replace(/my-svg/g, uniqueId);
      // Mermaid sankey (11.14) has a label-rendering bug: it appends the
      // outbound-link value to the source node's <text> as raw HTML <p>…</p>,
      // breaking SVG text positioning and concatenating labels visually.
      // Strip any <p>…</p> from inside <text>…</text>: the link-value labels
      // are unrecoverable here (they'd need a separate <text> with proper
      // positioning), so the deck-friendly fallback is "keep just the node
      // name" — same trade Mermaid's own docs recommend when sankey labels
      // overlap. Sankey-only by virtue of <p> never appearing inside <text>
      // in any other diagram type's emitted SVG.
      // Mermaid sankey (11.14) emits each node's <text> with the node name on
      // line 1 and the outbound-link value on line 2, separated by a literal
      // newline:   <text>Wages\n750</text>
      // SVG ignores newlines inside <text> (no <tspan>, no line break), but
      // the post-mmdc pipeline runs the HTML through marp/markdown-it, which
      // parses `\n\n` inside the inlined SVG as a paragraph break and wraps
      // the value in <p>…</p>. The resulting <text>Wages<p>750</text> is
      // invalid SVG and breaks text positioning, producing the visible
      // "750Disposable income750Savings…" run-together labels. Sankey is the
      // only diagram type that puts newlines inside <text>; gate on the
      // sankey-specific <g class="links"> marker so the substitution doesn't
      // touch <text> elements in any other diagram type.
      if (svg.includes('<g class="links"')) {
        svg = svg.replace(/(<text\b[^>]*>)([\s\S]*?)(<\/text>)/g, (_m, open, inner, close) => {
          const collapsed = inner.replace(/\s*\n\s*/g, ' ').trim();
          return `${open}${collapsed}${close}`;
        });
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
      const cls = extraClass ? `mermaid-svg ${extraClass}` : 'mermaid-svg';
      return `<div class="${cls}">${svg}</div>`;
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) {
        // Brief backoff before retry — gives Puppeteer time to release
        // any zombie chrome processes from the failed attempt.
        execSync('sleep 1');
      }
    }
  }
  console.warn(`  ⚠ Mermaid render failed after ${MAX_ATTEMPTS} attempts:`, lastError.message.split('\n')[0]);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return `<pre class="mermaid-fallback">${definition}</pre>`;
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
function renderMermaid(definition, mode) {
  const themeVars = mode === 'print' ? MERMAID_THEME_VARS_PRINT
    : (mode === 'dark' && DUAL_RENDER ? MERMAID_THEME_VARS_DARK : MERMAID_THEME_VARS);
  return renderMermaidOne(definition, themeVars, null);
}

// ── Pre-process markdown: render mermaid blocks before slide splitting ────────
// Each fence is rendered for the colour-scheme of ITS slide: the nearest
// preceding `<!-- _class: … -->` decides (a `dark` token => dark bake), falling
// back to a deck-wide `class:`/`color-scheme:dark` signal in the front matter.
// (geometry/orientation helpers — used here AND in the page-geometry block below;
// required up here because preprocessMermaid runs before that block.)
const { resolveSize, orientationFor, orientationCss } = require('./lib/engine/css');
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
// which can disagree (a `color-mode: dark` deck rendered under a light `--image-mode`).
const MERMAID_REBAKE_MODES = [];

function preprocessMermaid(source) {
  const fmMatch = source.match(/^---\r?\n[\s\S]*?\r?\n---/);
  const fm = fmMatch ? fmMatch[0] : '';
  // The first-class `color-mode:` key WINS (it supersedes the legacy `class:` color axis),
  // so when a known color-mode is present the Mermaid bake follows it ALONE — otherwise a
  // half-migrated deck (`color-mode: light` + a leftover `class: dark`) would render light
  // slides with DARK-baked diagrams. Only `dark` bakes dark; light/system/inherited bake
  // LIGHT (a static Mermaid SVG can't follow the OS/host — the static-export default).
  // When no `color-mode:` key is present, fall back to the legacy `class: … dark` alias / a
  // raw `color-scheme: dark`. Case-insensitive, matching colorModeClass + deckScheme.
  const cmDark = /^\s*color-mode:\s*["']?([A-Za-z]+)\b/mi.exec(fm);
  const cmKey = cmDark ? cmDark[1].toLowerCase() : '';
  const knownCm = cmKey === 'light' || cmKey === 'dark' || cmKey === 'system' || cmKey === 'inherited' || cmKey === 'print';
  const globalDark = knownCm
    ? cmKey === 'dark'
    : /^\s*class:\s*["']?[^"'\n]*\bdark\b/mi.test(fm) ||
      /color-scheme\s*:\s*dark/i.test(fm);
  // Print is a deck-wide canvas axis (stamped by `color-mode: print` / `class: print`
  // / the engine --print flag) and WINS over dark — a print slide bakes ink-on-white.
  // Deck-wide print applies to EVERY slide (the propagation kernel merges it into each
  // section), so it isn't overridden by a slide's own `_class:`.
  const globalPrint = !!flags.print ||
    cmKey === 'print' ||
    /^\s*class:\s*["']?[^"'\n]*\bprint\b/mi.test(fm);
  // Deck-wide orientation, resolved from the `size:` directive the same way the
  // page geometry below does. A portrait deck reorients LR/RL flowcharts to
  // TB/BT (lib/integrations/mermaid/reorient.js) so a wide graph flows down the
  // tall frame instead of shrinking to a thin strip; landscape is untouched.
  const sizeName = (fm.match(/^\s*size:\s*["']?([\w:/-]+)["']?\s*$/m) || [])[1] || 'hd';
  const orientation = orientationFor(resolveSize(sizeName, [paletteCSS, layoutCSS])).name;
  return source.replace(/```mermaid\n([\s\S]*?)```/g, (_match, def, offset) => {
    const before = source.slice(0, offset);
    const classDirectives = [...before.matchAll(/<!--\s*_class:\s*([^>]*?)\s*-->/g)];
    const lastClass = classDirectives.length ? classDirectives[classDirectives.length - 1][1] : '';
    const slidePrint = globalPrint || /\bprint\b/.test(lastClass);
    const slideDark = classDirectives.length ? /\bdark\b/.test(lastClass) : globalDark;
    const slideMode = slidePrint ? 'print' : (slideDark ? 'dark' : 'light');
    if (!QUIET) process.stdout.write(`  Rendering mermaid diagram (${slideMode})...`);
    const reoriented = reorientMermaidForPortrait(def.trim(), orientation);
    const idx = MERMAID_REBAKE_DEFS.push(reoriented) - 1; // keep the source def for a later re-bake
    MERMAID_REBAKE_MODES[idx] = slideMode; // and the scheme it was baked in, so a look re-render can
    const svg = renderMermaid(reoriented, slideMode);      // tell whether THIS diagram actually needs one
    if (!QUIET) console.log(' done');
    // Stamp the def index so a cross-scheme image-set export can find + re-bake this exact diagram.
    return svg.replace(/(<div class="mermaid-svg[^"]*")/, `$1 data-mmd-idx="${idx}"`);
  });
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
const fmMatch = rawMd.match(/^---([\s\S]*?)---\n/);
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
// Self-contained HTML PLAYER (2026-07-07-html-lattice-player.md): rewrite the .html
// sidecar into a portable, offline, three-view player (Present · Read·Slides ·
// Read·Article). Like --fluid, it only affects the written .html, after raster.
// Enabled by `--player` OR a `player: true` front-matter key. Takes precedence over
// --fluid (the player is the richer viewer). Frozen player-runtime version stamp.
const PLAYER = !!flags.player || /^\s*player:\s*(?:true|yes|on)\s*$/im.test(fm);
const PLAYER_VERSION = '1';
const ENGINE_BUILD = (() => {
  try { return require('./package.json').version; } catch { return ''; }
})();
// Auto-split (the Fit Ladder SPLIT move) — opt-in per deck. The flag + the capacity
// map are hoisted to module scope so BOTH passes see them: the cheap STATIC pre-pass
// in engineSlides() (count > capacity.hard), and the MEASURED loop in the export IIFE
// (split what a real render found to OVERFLOW, by how much — the only pass that
// catches density overflow in a tall box). The map carries each layout's split AXIS
// from the top-level `capacity` OR the per-family `adapt.capacity`, so a layout whose
// budget lives only in adapt is still splittable by measurement. See lib/core/auto-split.js
// + engineering/decisions/2026-06-22-the-fit-spine.md §3.
const AUTOSPLIT = /^\s*autosplit:\s*(?:on|true|yes)\s*$/im.test(fm);
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
    if (axis || m.split) map[m.name] = { axis: axis ?? null, hard: m.capacity?.hard ?? null, sweet: m.capacity?.sweet ?? null, soft: m.capacity?.soft ?? null, split: m.split ?? null };
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
// `@size` directive through the engine's own `resolveSize`, the same lookup the
// scaffold bakes into `@page`. `paletteCSS`/`layoutCSS` carry every theme +
// base `@size` declaration (theme first, then base — composeCss's source order).
// (resolveSize / orientationCss required above, before preprocessMermaid.)
const deckSizeName   = (fm.match(/^\s*size:\s*["']?([\w:/-]+)["']?\s*$/m) || [])[1] || 'hd';
const _geom          = resolveSize(deckSizeName, [paletteCSS, layoutCSS]);
const slideW         = parseFloat(_geom.width);
const slideH         = parseFloat(_geom.height);
// Auto-split is a portrait/square-family behavior — the Fit Ladder's SPLIT move
// (the-fit-spine.md §3). In a wide/landscape box, collapse + shed resolve overflow
// before split is ever reached, so the move is scoped to NON-LANDSCAPE @sizes — the
// universal rule mirrored by lint-core's PORTRAIT_SIZES and the manifest `orientation`
// contract. A landscape deck with `autosplit: on` is therefore a no-op (lint:deck
// warns; the HD/4K PDF stays byte-identical).
const AUTOSPLIT_APPLIES = AUTOSPLIT && orientationFor(_geom).name !== 'landscape';
if (AUTOSPLIT && !AUTOSPLIT_APPLIES) {
  console.log(`  auto-split: skipped — '${deckSizeName}' is a landscape @size; autosplit applies only to portrait/square sizes (portrait · story · mobile · square).`);
}
// Orientation scaling/fill (social/mobile portrait + square @sizes). Empty for
// landscape, so the HD/4K PDF is byte-identical. Same helper the engine
// scaffold + runtime use, so every render path agrees.
const orientationStyle = orientationCss(_geom);
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
// same engine that powers marp.config.js. parseSlide — the bespoke regex parser
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
// from the engine's assembled <div class="lattice"> document.
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
  // mathOutput:'html' drops KaTeX's hidden MathML annotation — it can't be read
  // in a PDF and its unclipped layout trips the slide overflow watcher (a stale
  // ring), matching the emulator's own `output:'html'` KaTeX call.
  const engine = latticeEngine.createEngine({ mathOutput: 'html' });
  engine.addThemes([readFileOrDie(cssFile, 'layout CSS'), fs.readFileSync(palettePath, 'utf8')]);
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
  // Auto-split over-capacity slides into several, BEFORE the index-based
  // `data-lattice-slide` re-tag below renumbers them (the Fit Ladder's SPLIT move
  // — lib/core/auto-split.js; engineering/decisions/2026-06-22-the-fit-spine.md §3).
  // OPT-IN per deck (`autosplit: on` in the front-matter): existing decks and the
  // curated galleries — whose stress slides demonstrate overflow on PURPOSE — stay
  // byte-unchanged. Default-on is a later decision, once the catalog is audited.
  let html = renderedHtml;
  if (AUTOSPLIT_APPLIES) {
    // Cheap STATIC first cut (count > capacity.hard); the MEASURED loop in the
    // export IIFE then catches whatever still overflows once it is really rendered.
    const r = require('./lib/core/auto-split').autoSplitDeck(renderedHtml, SPLIT_CAP);
    html = r.html;
    if (r.splits) console.log(`  auto-split (static): ${r.splits} over-capacity slide(s) divided`);
  }
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
    const cls = (s.match(/^<section\b[^>]*\bclass="([^"]*)"/i) || ['', ''])[1];
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
  return stripped.replace(/^(\s*<section\b)([^>]*>)/i, `$1${sectionAttr}$2${inject}`);
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
const SELF_HOSTED_FACES = require('./lib/fonts/text-faces.js').TEXT_FACES;
function embeddedFontsStyle() {
  // Prefer the shipped dist/fonts/ (in the npm tarball AND committed in-repo);
  // fall back to the assets/fonts/ source for a pre-build run. Either way the
  // woff2 are local — the emulator embeds them with zero network.
  const dir = [path.join(PKG_ROOT, 'dist', 'fonts'), path.join(PKG_ROOT, 'assets', 'fonts')]
    .find((d) => fs.existsSync(d));
  if (!dir) return '';
  const faces = [];
  for (const { family, weight, style, file } of SELF_HOSTED_FACES) {
    const fp = path.join(dir, `${file}.woff2`);
    if (!fs.existsSync(fp)) continue;
    const b64 = fs.readFileSync(fp).toString('base64');
    faces.push(
      `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};` +
      `font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`,
    );
  }
  return faces.length ? `<style id="lattice-embedded-fonts">${faces.join('')}</style>` : '';
}
const embeddedFonts = embeddedFontsStyle();

// Raw `@font-face{…}` rules (no <style> wrapper) for a standalone SVG asset, subset
// to the families it actually uses (from collectFontFamilies) so a diagram/chart
// lifted into the image set opens with the right type instead of a serif fallback,
// without embedding all ~17 faces in every file. Reuses the SAME PKG_ROOT-resolved
// woff2 as embeddedFontsStyle (bundling-safe, unlike a tools/ __dirname path).
function standaloneFontFaceCss(families) {
  const want = new Set((families || []).map((f) => String(f).toLowerCase()));
  const dir = [path.join(PKG_ROOT, 'dist', 'fonts'), path.join(PKG_ROOT, 'assets', 'fonts')]
    .find((d) => fs.existsSync(d));
  if (!dir) return '';
  const rules = [];
  for (const { family, weight, style, file } of SELF_HOSTED_FACES) {
    if (want.size && !want.has(family.toLowerCase())) continue;
    const fp = path.join(dir, `${file}.woff2`);
    if (!fs.existsSync(fp)) continue;
    const b64 = fs.readFileSync(fp).toString('base64');
    rules.push(
      `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};` +
      `font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`,
    );
  }
  return rules.join('');
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

// Deck-logo (`logo:`). The Form toggle + the masthead-meta / progress-rail /
// watermark injectors already ran inside engine.render (they match on section
// class). deck-logo is the ONE injector that keys off `data-lattice-slide` — which
// engineSlides() stamps AFTER engine.render — so the engine's own logo pass
// no-ops and the emulator runs it here, post-stamp. Same fn the owned engine's
// render hook uses. Called on the joined HTML (not slide-by-slide) so the "first
// slide" check in the logo rewriter (`logo-on: title`) sees source order.
// NB: the `.backdrop` wrapper is NOT injected here — the engine's class-matching
// applyBackdropToHtml already ran inside engine.render (like the watermark pass).
// Only deck-logo re-runs, because it keys off the data-lattice-slide attribute
// the emulator stamps after the engine pass.
const { applyDeckLogoToHtml } = require('./lib/integrations/markdown-it/plugins');
const slidesWithMeta2 = applyDeckLogoToHtml(highlightedSlides.join('\n'), rawMd);

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
// on DOMContentLoaded; puppeteer's `waitUntil: networkidle0` covers it.
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
// runs on DOMContentLoaded which puppeteer's networkidle0 wait covers —
// the same pre-render-then-PDF flow function-plot uses. The function body
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
const htmlDoc = `<!DOCTYPE html>
<html lang="${escapeHtml(deckLang)}"><head><meta charset="utf-8">
<title>${escapeHtml(deckTitle)}</title>
${embeddedFonts}
${katexCssLink}
<style>
@page { size: ${slideW}px ${slideH}px; margin: 0; }
body  { margin: 0; padding: 0; }
${css}
section[data-lattice-slide] { width: ${slideW}px !important; height: ${slideH}px !important; }
${orientationStyle}
${marpSystemCss}
${globalStyle ? `\n/* Front-matter style: directive */\n${globalStyle}\n` : ''}
</style></head><body>
${a11yTextureDefs}
${slidesWithMeta2}
${functionPlotScript}
${stateChartScript}
<script>
/* Overflow watcher — tags any section whose content exceeds the slide
   frame with class "overflow" so lattice.css can draw the red warning ring.
   Mirrors the watcher in lattice-runtime.js (used by the VS Code preview). */
(function(){
  var TOL = 12;
  var CLIP_CELL_SELECTOR = ${JSON.stringify(CLIP_CELL_SELECTOR)};
  var probeSectionOverflow = ${PROBE_SRC};
  var settleFonts = ${SETTLE_FONTS_SRC};
  function check(){
    document.querySelectorAll('section[data-lattice-slide]').forEach(function(s){
      // Cell-aware probe — a clipping content cell hides its overflow from the
      // section, so probe the cells too (lib/core/overflow-probe.js).
      var over = probeSectionOverflow(s, CLIP_CELL_SELECTOR, TOL).over;
      s.classList.toggle('overflow', over);
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
  // it already force-loads fonts first, via the same lib/core/font-settle.js
  // helper. 2s bound: a hung font fetch must not suppress the ring FOREVER
  // on a static file nothing else re-checks.
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

const outHtml = outFile.replace(/\.(pdf|pptx|png|zip)$/i, '') + '.html';
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
if (!QUIET) console.log(`HTML: ${slides.length} slides → ${outHtml}`);

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
  await g(() => page.goto('file://' + path.resolve(outHtml), {
    waitUntil: 'networkidle0',
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
  await g(() => page.evaluate(async () => {
    try {
      await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
      await document.fonts.ready;
    } catch (_e) { /* fonts API unavailable — proceed with whatever loaded */ }
  }), 'load fonts');
  // Bake dynamic components for the self-contained player: `state-chart` (inline
  // script) and `function-plot` (file:// script) draw their SVGs in the BROWSER at
  // load. Capture the inflated DOM NOW — after load, before the raster's SVG-image
  // swap mutates it — so the player ships static SVG (§A2b) instead of a dead
  // `file://`/inline script the player would strip (leaving the diagram blank).
  let inflatedPlayerHtml = null;
  if (PLAYER && (hasStateChart || hasFunctionPlot)) {
    try {
      await page.evaluate(() => new Promise((r) => setTimeout(r, 200))); // let async inflaters settle
      inflatedPlayerHtml = await page.evaluate(() => {
        // Clone (never mutate the live page — the raster below still needs it) and
        // drop the authoring overflow ring the watcher may have toggled on.
        const root = document.documentElement.cloneNode(true);
        for (const s of root.querySelectorAll('section.overflow')) s.classList.remove('overflow');
        return `<!DOCTYPE html>\n${root.outerHTML}`;
      });
    } catch (_e) { inflatedPlayerHtml = null; /* fall back to the static render */ }
  }
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
  const measureOverflow = () => g(() => page.evaluate(({ structuralCarousel, paginatorCarousel, clipSel, probeSrc }) => {
    const TOL = 12; // filter sub-pixel rounding; see lattice-runtime.js
    // Cell-aware probe (lib/core/overflow-probe.js, injected verbatim): a bounded
    // content cell that clips hides its overflow from section.scrollHeight, so we
    // fold the cell's internal overflow back into the section's effective extent —
    // otherwise autosplit never sees an over-stuffed cell and the content is lost.
    const probeSectionOverflow = new Function('return (' + probeSrc + ')')();
    const out = [];
    document.querySelectorAll('section[data-lattice-slide]').forEach((s, i) => {
      const probe = probeSectionOverflow(s, clipSel, TOL);
      const vOver = probe.vOver;
      const over = probe.over;
      if (!over) return;
      const C = probe.clientH;
      const ratio = C > 0 ? probe.scrollH / C : 2;
      // A STRUCTURAL carousel (cover-code/cover-sides) re-authors a side-by-side layout to
      // one panel per page, so ANY overflow is actionable — compare-code overflows
      // HORIZONTALLY (two code blocks too wide for a portrait box; one-block-per-page fixes
      // it). Mark it splittable and let resplitDoc's carousel branch own it (the ratio is
      // irrelevant to a structural re-author).
      if (structuralCarousel.some((c) => s.classList.contains(c))) {
        out.push({ slide: i + 1, ratio, canSplit: true, splitRatio: ratio });
        return;
      }
      // A VERTICAL PAGINATOR (cover-paginate) divides a row/item collection; it can only fix
      // VERTICAL overflow. A too-wide table overflows HORIZONTALLY — row-splitting it is
      // futile and balloons the deck — so gate canSplit on vOver and leave a width-overflow
      // for the ring (this is the guard that lets a wide compare-table / obligation-matrix
      // carry a split recipe without ever ballooning).
      if (paginatorCarousel.some((c) => s.classList.contains(c))) {
        out.push({ slide: i + 1, ratio, canSplit: vOver, splitRatio: ratio });
        return;
      }
      // The auto-splitter only divides a list (ul/ol) or table — so a split can only
      // make the slide fit if THAT collection is the height driver. Measure the tallest
      // such collection and the headroom the surrounding content leaves: if the
      // non-collection content alone already fills the box (a tall <p>/figure/code with
      // an incidental list), splitting just copies that block onto every piece and never
      // fits — leave it for the ring. `canSplit` gates the measured pass; `splitRatio`
      // sizes it from the collection's own height, not the whole slide's.
      let collH = 0;
      s.querySelectorAll('ul, ol, table').forEach((el) => { collH = Math.max(collH, el.offsetHeight); });
      const headroom = C - (probe.scrollH - collH); // box space left for the collection (cell-aware extent)
      const canSplit = vOver && collH > 0 && headroom > C * 0.2;
      const splitRatio = canSplit ? Math.max(2, collH / headroom) : ratio;
      out.push({ slide: i + 1, ratio, canSplit, splitRatio });
    });
    return out;
  }, { structuralCarousel: STRUCTURAL_CAROUSEL_NAMES, paginatorCarousel: PAGINATOR_CAROUSEL_NAMES, clipSel: CLIP_CELL_SELECTOR, probeSrc: PROBE_SRC }), 'measure overflow');
  let overflow = await measureOverflow();
  // MEASURED auto-split — the loop that makes "split" fit REAL boxes. Divide every
  // overflowing SPLITTABLE slide by how much it overflows, re-render, re-measure,
  // until the deck fits or only un-splittable overflow remains (read-across / atomic /
  // a single item taller than the page — those stay for the ring). This catches the
  // DENSITY overflow a count threshold can't see — dominant in a tall/portrait box.
  // Opt-in (`autosplit: on`). See lib/core/auto-split.js + the-fit-spine.md §3.
  if (AUTOSPLIT_APPLIES) {
    const { resplitDoc, applyRails } = require('./lib/core/auto-split');
    for (let pass = 1; pass <= 5 && overflow.some((o) => o.canSplit); pass++) {
      // Only the slides whose OWN collection drives the overflow (canSplit); size each
      // split from its collection-relative ratio so the loop converges instead of
      // re-splitting a slide a tall non-list block keeps over the box.
      const splittable = overflow.filter((o) => o.canSplit).map((o) => ({ slide: o.slide, ratio: o.splitRatio }));
      const r = resplitDoc(cleanDocHtml, splittable, SPLIT_CAP);
      if (!r.changed) break;
      cleanDocHtml = r.html;
      fs.writeFileSync(outHtml, cleanDocHtml);
      await g(() => page.goto(`file://${path.resolve(outHtml)}`, { waitUntil: 'networkidle0', timeout: 60000 }), 'navigate (autosplit)');
      await g(() => page.evaluate(async () => {
        try { await Promise.all([...document.fonts].map((f) => f.load().catch(() => {}))); await document.fonts.ready; } catch (_e) { /* fonts API unavailable */ }
      }), 'load fonts (autosplit)');
      overflow = await measureOverflow();
      if (!QUIET) console.log(`  auto-split (measured) pass ${pass}: ${r.changed} slide(s) divided to fit`);
    }
    // Splitting has converged — NOW stamp the k-of-N progress rail, run by run (a slide may
    // have split across several passes; only the final grouping knows each run's true
    // length). One re-render so the rails land in the exported DOM.
    const railed = applyRails(cleanDocHtml);
    if (railed !== cleanDocHtml) {
      cleanDocHtml = railed;
      fs.writeFileSync(outHtml, cleanDocHtml);
      await g(() => page.goto(`file://${path.resolve(outHtml)}`, { waitUntil: 'networkidle0', timeout: 60000 }), 'navigate (rails)');
      await g(() => page.evaluate(async () => {
        try { await Promise.all([...document.fonts].map((f) => f.load().catch(() => {}))); await document.fonts.ready; } catch (_e) { /* fonts API unavailable */ }
      }), 'load fonts (rails)');
    }
  }
  const overflowing = overflow.map((o) => o.slide);
  if (overflowing.length) {
    const n = overflowing.length;
    console.warn(`  ⚠ OVERFLOW — ${n} slide${n > 1 ? 's' : ''} exceed the frame and ${n > 1 ? 'are' : 'is'} CLIPPED in this export: page${n > 1 ? 's' : ''} ${overflowing.join(', ')}.`);
    console.warn(`    Fix ${n > 1 ? 'them' : 'it'} before delivering (trim content, or use a layout/fill that fits). The export stays clean — no overflow marker is printed.`);
  }
  // Strip the authoring-only overflow signal before exporting. The injected
  // watcher (and base.modifiers.css) draw a loud red ring + "OVERFLOWS" tab on
  // any `.overflow` section — invaluable while authoring in the live preview,
  // but a red box in front of a board is worse than the silent clip that
  // overflow:hidden already applies. The author was warned on stderr above; the
  // PDF / PNG / PPTX deliverable stays clean, matching the contract documented
  // at the detection pass. (Removing the class also hides the .overflow-tab via
  // `section:not(.overflow) > .overflow-tab { display:none }`.)
  await g(() => page.evaluate(() => {
    for (const s of document.querySelectorAll('section.overflow')) s.classList.remove('overflow');
  }), 'strip overflow marker');
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
    let finalBytes = await embedNotesInPdf(pdfBytes, materializedNotes);
    finalBytes = await applyPresentMode(finalBytes);
    finalBytes = await embedSourceInPdf(finalBytes);
    fs.writeFileSync(outFile, finalBytes);
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
    finalBytes = await embedNotesInPdf(finalBytes, materializedNotes);
    finalBytes = await applyPresentMode(finalBytes);
    finalBytes = await embedSourceInPdf(finalBytes);
    fs.writeFileSync(outFile, finalBytes);
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
    // 'light'. print is palette-independent (the class:print stamp) — and is authoritative via
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
        let lookThemeVars = null;
        if (lookMode !== 'print') {
          const base = paletteName.replace(/-dark$/, '');
          const targetName = lookMode === 'dark' ? `${base}-dark` : base;
          const targetPath = path.join(PKG_ROOT, 'themes', `${targetName}.css`);
          if (fs.existsSync(targetPath)) {
            lookPaletteCss = loadPaletteWithImports(targetPath, new Set(), 'svg-look palette');
            sectionLookClass = lookMode === 'dark' ? 'dark form' : 'form';
            // Resolve Mermaid theme vars from the LOOK palette (not the deck's) — the module-level
            // MERMAID_THEME_VARS is baked from the deck's resolved palette, which for `--image-mode
            // dark` is the DARK theme, so re-rendering `light` with it would still read dark. Parse
            // the look palette fresh so a light look bakes light diagram colors and a dark look dark.
            lookThemeVars = resolveMermaidThemeVars(parsePaletteVars(layoutCSS + '\n' + lookPaletteCss, lookMode === 'dark'));
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
              // re-render can't fully recolor it: an author `%%{init}%%` theme (mmdc skips themeVars), or
              // explicit `fill:`/`stroke:`/`color:` hex/rgb in `style`/`classDef`/`linkStyle`.
              const authorColored = /%%\{\s*init/i.test(def) ||
                /\b(?:fill|stroke|color)\s*:\s*(?:#[0-9a-fA-F]{3,8}|rgb)/i.test(def);
              // print → the print theme vars (MERMAID_THEME_VARS_PRINT, scheme-independent); light/dark
              // → the vars resolved from the LOOK palette above, so the diagram bakes the look's colors.
              const out = lookMode === 'print' ? renderMermaid(def, 'print') : renderMermaidOne(def, lookThemeVars, null);
              // mmdc can degrade to a `<pre class="mermaid-fallback">` (no <div> wrapper) after exhausting
              // its retries — keep the ORIGINAL live diagram (still an <svg>) below, but flag it distinctly:
              // it's still in the slide scheme, unlike the benign author-color case.
              if (!/^\s*<div\b/.test(out)) { renderFailed.add(idx); continue; }
              parts.push(out.replace(/^<div class="mermaid-svg/, `<div data-look-idx="${idx}" class="mermaid-svg`));
              if (authorColored) authorKept.add(idx);
            }
            lookDiagramMarkup = new Map();
            if (parts.length) {
              // Clean look-scheme doc: engine layout CSS + the look palette + a section in the look scheme,
              // holding just the re-rendered diagrams. No slide content, no rendered-scheme CSS. NOTE: the
              // scratch page is trusted for COLOR only — its `@font-face` urls are relative to about:blank
              // so text renders in a fallback font, but glyph geometry is baked by mmdc and font bytes are
              // embedded post-hoc (standaloneFontFaceCss), so only the flattened COLORS are ever read here.
              const scratchDoc = `<!DOCTYPE html><html style="color-scheme:${lookMode === 'dark' ? 'dark' : 'light'}"><head><meta charset="utf-8"><style>${layoutCSS}\n${lookPaletteCss}</style></head><body><section class="${sectionLookClass}" data-lattice-slide="1">${parts.join('')}</section></body></html>`;
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
    const pkgVersion = (() => {
      try { return JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version; }
      catch (_e) { return null; }
    })();
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
      engineVersion: pkgVersion,
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
  } else {
    // PNG / PPTX: rasterize one image per slide from the SAME rendered page.
    // Each `section[data-lattice-slide]` is exactly slideW×slideH (fixed-page),
    // so an element screenshot yields a clean full-bleed slide image.
    const handles = await g(() => page.$$('section[data-lattice-slide]'), 'collect slide handles');
    const pngBuffers = [];
    for (const h of handles) {
      pngBuffers.push(await g(() => h.screenshot({ type: 'png' }), 'screenshot slide'));
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
      // When `color-mode:` is absent, infer from the effective `color-scheme` (theme
      // palette or a deck `style:`/`class: … dark` alias):
      //   · `light dark` (both) → SYSTEM.  · `dark` only, or `class: … dark` → DARK.
      //   · anything else → LIGHT.
      // Strip CSS comments from the palette first — a theme's DOC comment mentioning
      // `color-scheme:light dark` (indaco's does) must NOT read as an actual declaration.
      const cmKey = ((fm.match(/^\s*color-mode:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m) || [])[1] || '').trim().toLowerCase();
      const paletteDecls = paletteCSS.replace(/\/\*[\s\S]*?\*\//g, '');
      const csDeclares = (re) => re.test(paletteDecls) || re.test(fm);
      const deckScheme =
        cmKey === 'light' || cmKey === 'dark' ? cmKey
          : cmKey === 'system' || cmKey === 'inherited' ? 'system'
            : csDeclares(/color-scheme\s*:\s*(light\s+dark|dark\s+light)\b/) ? 'system'
              : csDeclares(/color-scheme\s*:\s*dark\b/) || /^\s*class:\s*["']?[^"'\n]*\bdark\b/m.test(fm) ? 'dark'
                : 'light';
      const { html: playerHtml, report } = await buildPlayerHtml({
        // Prefer the browser-inflated DOM when the deck has dynamic components, so
        // state-chart / function-plot ship as baked static SVG (§A2b); else the
        // clean static render (fast path, no re-serialize).
        docHtml: inflatedPlayerHtml || cleanDocHtml,
        // The envelope carries verbatim source for lossless re-import — but under
        // `--strip-notes` / `--strip-captions` that source is re-serialized WITHOUT the
        // respective comments (directive-safe: notes match only the exact bodies lifted
        // from the render; captions match the `caption:` prefix), so the shared file leaks
        // no speaker text and/or no caption text. A stripped file re-imports without them —
        // the stated privacy tradeoff (§Notes on export).
        source: stripSharedSource(rawMd, noteStripSet),
        title: deckTitle,
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
    } catch (err) {
      console.warn(`warning: --player assembly failed (${err?.message}); ${outFile} is unaffected, but ${outHtml} is the clean render, not the player.`);
    }
  } else if (FLUID_VIEW) {
    fs.writeFileSync(outHtml, toFluidViewer(cleanDocHtml));
    if (!QUIET) console.log(`Fluid viewer: ${outHtml}`);
  }
  // Read-along captions ride alongside ANY output format — a .vtt is a sidecar next to the deck,
  // not baked into its bytes. `--strip-notes` blanks the note channel (materializedNotes) and the
  // projection, but NOT the captions: a caption is public-facing narration the author opts into via
  // `--captions`, not a private note, so it composes with `--strip-notes` (ship captions, drop notes).
  if (CAPTIONS) {
    await writeCaptionsSidecar(outFile, materializedNotes, cleanDocHtml, slideCaptions);
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
    let html = playerHtml;
    if (cssOk) html = html.replace(target.full, () => `<style>${cssResult.css}</style>`);
    if (fontResult.applied) {
      html = html.replace(fontBlock.full, () => `<style id="lattice-embedded-fonts">${fontResult.css}</style>`);
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
    return await doc.save();
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
  return await doc.save();
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
    return await doc.save();
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
    return await doc.save();
  } catch (e) {
    console.warn(`  ⚠ Could not mark the PDF for presentation mode (${e.message}); writing deck without it.`);
    return pdfBytes;
  }
}

// Plaintext speaker-notes sidecar: one block per slide that has a note.
function writeNotesSidecar(pdfPath, notes) {
  const blocks = [];
  notes.forEach((note, i) => {
    if (note) blocks.push(`# Slide ${i + 1}\n\n${note}\n`);
  });
  const sidecar = pdfPath.replace(/\.pdf$/i, '') + '.notes.txt';
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
  let fmForMerge = fmCaptions;
  if (AUTOSPLIT_APPLIES && fmCaptions?.size) {
    fmForMerge = null;
    if (!QUIET) console.log('Captions: front-matter captions: keys are unsafe under autosplit (section count shifts) — using inline captions / notes for those slides');
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
