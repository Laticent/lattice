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

module.exports = { SIZES, DEFAULT_SIZE, DEFAULT_SIZE_NAME, sizeFor, isRegisteredSize, sizeBlock };
