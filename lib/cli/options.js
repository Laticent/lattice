/**
 * The `lattice` render command's options — ONE table, read by three consumers:
 *
 *   - `parseArgs` in lattice.js, which accepts exactly these;
 *   - shell completion (lib/cli/complete.js), which offers exactly these;
 *   - test/unit/cli/cli-docs-coverage.test.js, which ties them to the docs.
 *
 * Before this table the switches were an if-chain inside `parseArgs`, so completion could not
 * read them and would have needed a second hand-kept list (followup 2601-p2). A flag added here
 * reaches all three; a flag added anywhere else fails test/unit/cli/completion.test.js.
 *
 * Each row: `flags` (the spellings), `key` (the `flags` object field parseArgs sets), `desc` (the
 * one-line description zsh, fish and PowerShell show beside the candidate). A VALUE option also
 * has `arg` (its placeholder) and `complete`: what Tab offers for the value —
 *   - an array, or a function returning one: a closed set (loaded only when Tab asks for it);
 *   - `'files'`, `'files:<ext,…>'` or `'dirs'`: the shell's own path completion;
 *   - `'palettes'` / `'plugins'`: the shipped palettes plus installed theme packages / the plugins;
 *   - `null`: free text (a number), nothing to offer.
 * `list: true` marks a comma-separated value, so Tab completes the item after the last comma.
 *
 * Pure and cheap to load: completion requires this on every Tab press.
 */

/** `--paper`: the sheets lib/core/print-sheet.mjs fits a slide onto. */
const PAPER_CHOICES = Object.freeze(['auto', 'letter', 'legal', 'a4']);
/** `--orientation` for `--paper`. */
const ORIENT_CHOICES = Object.freeze(['auto', 'landscape', 'portrait']);
/** `--player-mode`: the mode the exported player opens in. */
const PLAYER_MODES = Object.freeze(['light', 'dark', 'system']);

/** The output extensions the render command writes (lattice.js `OUT_FORMATS`). */
const OUTPUT_EXTS = Object.freeze(['pdf', 'pptx', 'odp', 'png', 'zip', 'html']);

const imageSet = () => require('../export/image-set.js');

const VALUE_OPTIONS = Object.freeze([
  { flags: ['-o', '--output'], key: 'output', arg: 'PATH', complete: `files:${OUTPUT_EXTS.join(',')}`, desc: 'Output path' },
  { flags: ['-p', '--palette'], key: 'palette', arg: 'NAME', complete: 'palettes', desc: 'Color palette' },
  { flags: ['-c', '--css'], key: 'css', arg: 'PATH', complete: 'files:css', desc: 'Layout CSS override' },
  { flags: ['--paper'], key: 'paper', arg: 'SIZE', complete: PAPER_CHOICES, desc: 'Fit slides on a sheet' },
  { flags: ['--orientation'], key: 'orientation', arg: 'O', complete: ORIENT_CHOICES, desc: 'Sheet orientation for --paper' },
  // Image-set (.zip) tuning — see normalizeImageSetOptions (lib/export/image-set.js).
  { flags: ['--image-format'], key: 'image-format', arg: 'F', complete: () => imageSet().IMAGE_FORMATS, desc: 'Image set: png, jpeg or webp' },
  { flags: ['--image-size'], key: 'image-size', arg: 'S', complete: () => imageSet().SIZE_PRESETS, desc: 'Image set: raster size' },
  { flags: ['--image-quality'], key: 'image-quality', arg: 'N', complete: null, desc: 'Image set: jpeg/webp quality 1-100' },
  { flags: ['--thumb-width'], key: 'thumb-width', arg: 'N', complete: null, desc: 'Image set: thumbnail width in px' },
  { flags: ['--image-mode'], key: 'image-mode', arg: 'M', complete: () => imageSet().COLOR_MODES, desc: 'Image set: color mode' },
  { flags: ['--svg-background'], key: 'svg-background', arg: 'B', complete: () => imageSet().SVG_BACKGROUNDS, desc: 'Image set: chart SVG look' },
  // Who a clipped slide's marker speaks to in THIS render — the same export
  // setting tools/export-marp.js takes (lib/core/resolve-overflow-marker.js).
  { flags: ['--overflow-marker'], key: 'overflow-marker', arg: 'WHO', complete: () => require('../core/resolve-overflow-marker.js').OVERFLOW_MARKER_LEVELS, desc: 'Clipped-slide marker: author, reader or off' },
  // The package store for THIS run (lib/packages/home.js): an installed theme or component
  // the deck names is found here. Default: $LATTICE_HOME/packages, else ~/.lattice/packages.
  { flags: ['--packages'], key: 'packages', arg: 'DIR', complete: 'dirs', desc: 'Package store for this run' },
  // The mode the --player opens in, over the deck's own (light, dark or system).
  { flags: ['--player-mode'], key: 'player-mode', arg: 'M', complete: PLAYER_MODES, desc: 'Player opens in light, dark or system' },
  // Render on another canvas, over the deck's own `size:` (lib/engine/sizes.js).
  { flags: ['--size'], key: 'size', arg: 'NAME', complete: () => Object.keys(require('../engine/sizes.js').SIZES), desc: 'Render on another canvas' },
  // Plugins switched off for this run (lib/plugins/host-grammar.mjs `admitPlugins`'s `disabled`).
  { flags: ['--disable-plugin'], key: 'disable-plugin', arg: 'N', complete: 'plugins', list: true, desc: 'Switch plugins off for this run' },
  // The host's default plugin set for this run (`admitPlugins`'s `defaults`); `none` for empty.
  { flags: ['--default-plugins'], key: 'default-plugins', arg: 'N', complete: 'plugins+none', list: true, desc: 'Narrow the default plugin set' },
]);

const SWITCHES = Object.freeze([
  { flags: ['-q', '--quiet'], key: 'quiet', desc: 'Only print errors' },
  { flags: ['--notes'], key: 'notes', desc: 'Also write a speaker-notes text file' },
  { flags: ['--captions'], key: 'captions', desc: 'Also write WebVTT captions' },
  { flags: ['--no-split'], key: 'no-split', desc: 'Do not paginate an overflowing slide' },
  { flags: ['--strip-notes'], key: 'strip-notes', desc: 'Remove speaker notes from every output' },
  { flags: ['--no-player-motion'], key: 'no-player-motion', desc: 'Ship the still in the exported player' },
  { flags: ['--no-guide'], key: 'no-guide', desc: 'Leave the Guide out of a narrated player' },
  { flags: ['--strip-say'], key: 'strip-say', desc: "Remove the author's say: lines" },
  { flags: ['--notes-icon'], key: 'notes-icon', desc: 'Show a sticky-note icon on noted slides' },
  { flags: ['--fluid'], key: 'fluid', desc: 'HTML: the fluid-box viewer' },
  { flags: ['--player'], key: 'player', desc: 'HTML: the self-contained player' },
  { flags: ['--narrate'], key: 'narrate', desc: 'Voice the player on-device (Kokoro)' },
  { flags: ['--read'], key: 'read', desc: 'HTML: the reading article' },
  { flags: ['--present'], key: 'present', desc: 'PDF opens in presentation mode' },
  { flags: ['--print'], key: 'print', desc: 'Black-and-white-safe print mode' },
  { flags: ['--raster'], key: 'raster', desc: 'PDF as one image per page' },
  { flags: ['--keep-html'], key: 'keep-html', desc: 'Keep the temporary HTML' },
  { flags: ['--editable'], key: 'editable', desc: 'PPTX/ODP: real text boxes' },
  { flags: ['--allow-remote'], key: 'allow-remote', desc: 'Let the render fetch remote media' },
  { flags: ['--embed-source'], key: 'embed-source', desc: 'Attach the Markdown source to the PDF' },
  { flags: ['--reopenable'], key: 'reopenable', desc: 'Carry the deck as a Lattice project' },
  { flags: ['--keep-vector-images'], key: 'keep-vector-images', desc: 'Keep SVG images as vectors in the PDF' },
  { flags: ['--chrome-pdf'], key: 'chrome-pdf', desc: "Write the PDF with Chrome's printer" },
  { flags: ['--no-thumbnails'], key: 'no-thumbnails', desc: 'Image set: omit thumbnails' },
  { flags: ['--no-svg'], key: 'no-svg', desc: 'Image set: omit chart/diagram SVGs' },
]);

/** Handled before parseArgs runs (lattice.js), so they are not rows above. */
const EARLY_FLAGS = Object.freeze([
  { flags: ['-h', '--help'], desc: 'Show help (--help all for every option)' },
  { flags: ['-v', '--version'], desc: 'Show the version' },
]);

// Null-prototype, so a word such as `constructor` or `__proto__` is never mistaken for a flag.
const index = (rows) => Object.freeze(Object.assign(Object.create(null), Object.fromEntries(rows.flatMap((r) => r.flags.map((f) => [f, r])))));
/** flag spelling → row, for parseArgs. */
const VALUE_BY_FLAG = index(VALUE_OPTIONS);
const SWITCH_BY_FLAG = index(SWITCHES);

module.exports = {
  PAPER_CHOICES, ORIENT_CHOICES, PLAYER_MODES, OUTPUT_EXTS,
  VALUE_OPTIONS, SWITCHES, EARLY_FLAGS, VALUE_BY_FLAG, SWITCH_BY_FLAG,
};
