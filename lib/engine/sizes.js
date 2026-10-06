/**
 * lattice-engine — THE size registry.
 *
 * The one table mapping a deck's `size:` front-matter NAME to a pixel canvas.
 * The engine owns the page box; a stylesheet does not.
 *
 * WHY THIS MODULE EXISTS. Until 2026-08-16 this table lived in a Marp-shaped
 * `/* @theme … *​/` comment at the top of every theme, and the engine parsed it
 * back out with a regex — a round trip through a serialization format we then
 * read against ourselves. It cost 33 byte-identical copies (32 `themes/*.css` +
 * `lib/_theme.css`), a 34th hardcoded in the Theme Studio serializer, and — the
 * tell — a NAME-ONLY duplicate in `lib/authoring/lint-core.js`, which is
 * browser-safe and fs-free (HARD RULE #7) and therefore could not read a CSS
 * comment at all. Its own note called that copy "a LAST RESORT, not the source
 * of truth" and named the drift class it invited (#1218). A module every one of
 * those consumers can import removes the copies instead of documenting them.
 * See engineering/decisions/2026-08-16-size-registry-ownership.md.
 *
 * PURE AND FS-FREE, deliberately: `lint-core.js` and the browser bundles import
 * it, so it must carry no `fs` and no engine dependencies.
 *
 * THE NAMES ARE THE WHOLE VOCABULARY. A theme can no longer register a novel
 * `@size` — that channel was retired with the same decision (§7), because it
 * desynchronized the linter from the renderer by construction and let a
 * stylesheet redefine the page box the engine owns. A deck that needs a canvas
 * we do not ship is a request to add an entry here.
 *
 * Marp still needs the directives, and still gets them: `sizeBlock()` renders
 * this table into the `@size` comment lines that `tools/build-css.js` and
 * `tools/build-marp-kit.js` STAMP into the Marp-facing artifacts. The
 * requirement is a property of that export, not of Lattice's source CSS.
 */

/**
 * Name → canvas, in declaration order (the order `sizeBlock()` emits). Values
 * are CSS lengths because they are written straight into the scaffold's
 * `width`/`height` and `@page { size }`.
 *
 * Aliases sit beside their canonical name on purpose: `16:9` is the same box as
 * `hd`, and a deck may say either. The picker
 * (`docs/src/playground/deck-sizes.js`) offers one entry per FORMAT and omits
 * the aliases; the registry accepts both.
 */
const SIZES = Object.freeze({
  // Landscape (screen)
  hd: { width: '1280px', height: '720px' },
  HD: { width: '1280px', height: '720px' },
  '4K': { width: '3840px', height: '2160px' },
  '4k': { width: '3840px', height: '2160px' },
  standard: { width: '960px', height: '720px' },
  '16:9': { width: '1280px', height: '720px' },
  // A phone held sideways (#2372 fork 9): ~19.5:9, so a video of the deck fills the screen with no
  // side bars. HD's 720 height, wider; the engine scales type and spacing by 1280/1560 on it
  // (`wideFactor`), so every size lands on the pixels it has at HD and the width is extra room.
  // No `19.5:9` alias: the Marp-facing `@size` names take no `.`, and `mobile` has none either.
  'mobile-landscape': { width: '1560px', height: '720px' },
  // Square / portrait — the social + mobile formats (#399,
  // engineering/decisions/2026-06-16-social-mobile-portrait-sizes.md)
  square: { width: '1080px', height: '1080px' },
  '1:1': { width: '1080px', height: '1080px' },
  portrait: { width: '1080px', height: '1350px' },
  '4:5': { width: '1080px', height: '1350px' },
  story: { width: '1080px', height: '1920px' },
  reel: { width: '1080px', height: '1920px' },
  '9:16': { width: '1080px', height: '1920px' },
  mobile: { width: '1080px', height: '2340px' },
});

/** The canvas a deck gets when it declares no `size:` — and the last-resort fallback. */
const DEFAULT_SIZE_NAME = 'hd';
const DEFAULT_SIZE = SIZES[DEFAULT_SIZE_NAME];

/**
 * Resolve a `size:` directive value to a canvas. An unknown or absent name
 * falls back to `hd` rather than throwing: a deck with a typo'd size renders at
 * the default box, and `lint:deck` is what tells the author about the typo.
 *
 * OWN properties only. The name comes from deck front matter, so a plain
 * `SIZES[name]` lookup answers `size: constructor` with a function off
 * `Object.prototype` — which then flows into `parseFloat(geometry.width)` as
 * NaN and takes the scaffold with it.
 */
/**
 * How much a landscape canvas WIDER than 16:9 scales its type and spacing, so they land on the
 * pixels they have on a 16:9 canvas of the same height: `(16/9) / aspect`, and 1 at 16:9 or
 * narrower. Every `--fs-*` and `--sp-*` token is width-relative (a `cqi` coefficient curated at
 * HD's 1280 width), so on a 19.5:9 canvas they grew ~22% against an unchanged height and a dense
 * slide ran out of room. Pure; the engine (lib/engine/css.js) and the runtime share it.
 */
function wideFactor(width, height) {
  const w = parseFloat(width);
  const h = parseFloat(height);
  if (!(w > 0 && h > 0)) return 1;
  const f = 16 / 9 / (w / h);
  // A hair of tolerance, so 1280x720 rounding can never produce 0.9999.
  return f < 0.995 ? Math.round(f * 10000) / 10000 : 1;
}

/**
 * `wideFactor` for a LAID-OUT box, which is what the runtime has: the factor only when the box has
 * the shape of a registered canvas wider than 16:9 (within 1%), and 1 for any other shape. A live
 * section is not always its canvas yet: a host that lets it take its content's height (a test page,
 * an embed, a mid-layout read) gives a short, wide box, and reading that as a wide canvas shrank the
 * design unit toward 0 (the label-set key's swatch collapsed to 0x0). The shape test keeps the
 * preview's own scaling working, since a phone-landscape slide drawn at any size keeps its 13:6.
 */
function canvasWideFactor(width, height) {
  const w = parseFloat(width);
  const h = parseFloat(height);
  if (!(w > 0 && h > 0)) return 1;
  const aspect = w / h;
  for (const geo of Object.values(SIZES)) {
    const gw = parseFloat(geo.width);
    const gh = parseFloat(geo.height);
    if (wideFactor(gw, gh) < 1 && Math.abs(aspect / (gw / gh) - 1) < 0.01) return wideFactor(w, h);
  }
  return 1;
}

/**
 * The deck source with its `size:` register set to `name` — the CLI's `--size`, which renders a
 * deck on another canvas without editing it (the shape of `withPrintColorMode`). Column-0 key
 * only; a duplicate collapses into the first; a deck with no front matter gains one.
 */
function withSize(source, name) {
  const src = String(source ?? '');
  const fm = src.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/);
  // An EMPTY block (`---` straight after `---`) has no body line for the pattern above to end on.
  const empty = fm ? null : src.match(/^(\uFEFF?---(\r?\n))---(?:\r?\n|$)/);
  if (empty) return src.slice(0, empty[1].length) + `size: ${name}${empty[2]}` + src.slice(empty[1].length);
  if (!fm) return `---\nsize: ${name}\n---\n\n${src}`;
  const [full, open, body, close] = fm;
  // A new line takes the block's own line ending, so a CRLF deck stays CRLF.
  const eol = open.endsWith('\r\n') ? '\r\n' : '\n';
  let seen = false;
  const lines = body.split('\n').flatMap((line) => {
    if (!/^size:/.test(line)) return [line];
    if (seen) return [];
    seen = true;
    // A function replacer: `name` is the `--size` a person typed, never expanded as `$&`.
    return [line.replace(/^size:[^\r\n]*(\r?)$/, (_, cr) => `size: ${name}${cr}`)];
  });
  const merged = seen ? lines.join('\n') : `${body}${eol}size: ${name}`;
  // Slice, never String.replace: a `$&` in the front matter would be expanded (see withPrintColorMode).
  return src.slice(0, fm.index) + open + merged + close + src.slice(fm.index + full.length);
}

function sizeFor(name) {
  return isRegisteredSize(name) ? SIZES[name] : DEFAULT_SIZE;
}

/** Is `name` a registered size? (The linter's membership test.) */
function isRegisteredSize(name) {
  return Boolean(name) && Object.hasOwn(SIZES, name);
}

/**
 * The registry as the `@size` comment lines Marp reads, WITHOUT the enclosing
 * `/* … *​/`: the build stamps these into the Marp-facing artifacts alongside
 * the `@theme` directive.
 *
 * Column alignment is preserved from the hand-maintained block this replaced
 * (name padded to 8, width to 6) so the stamped artifact is byte-identical to
 * what shipped before — the diff on `dist/` stays empty, and a reviewer can see
 * the move changed nothing downstream.
 *
 * @param {string} [prefix]  line prefix inside the comment block
 * @returns {string} newline-joined `@size` lines
 */
function sizeBlock(prefix = ' * ') {
  return Object.entries(SIZES)
    .map(([name, { width, height }]) => `${prefix}@size ${name.padEnd(8)} ${width.padEnd(6)} ${height}`)
    .join('\n');
}

module.exports = { SIZES, DEFAULT_SIZE, DEFAULT_SIZE_NAME, sizeFor, isRegisteredSize, sizeBlock, wideFactor, canvasWideFactor, withSize };
