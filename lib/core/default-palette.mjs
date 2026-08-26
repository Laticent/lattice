/**
 * THE default palette — the single declaration of "what does a deck with no
 * `theme:` look like".
 *
 * WHY THIS MODULE EXISTS. The answer used to be written down in five places that
 * did not reference each other, and they had already drifted:
 *
 *   lib/core/resolve-palette.js            'indaco'   the CLI + engine chain
 *   tools/build-default-bundle.js          'cuoio'    dist/lattice-default.css
 *   docs/.../playground-controller.ts      'cuoio' in code, 'indaco' in its docblock
 *   tools/export-marp.js                   'indaco'   the export-to-Marp bundle
 *   docs/.../studio/export/deck-export.js  'indaco'   the Studio's own export
 *
 * So a consumer who `<link>`ed the zero-config bundle and a deck rendered through
 * the CLI got different palettes from the same "no palette specified" input, and
 * one file disagreed with its own comment. See
 * `engineering/decisions/2026-08-26-one-default-palette.md`.
 *
 * It is `.mjs` because BOTH module systems have to read it: the CJS side
 * (`resolve-palette.js`, the emulator, the tools) `require()`s it, and the ESM
 * side (the docs site, the Studio export) `import`s it. That is the same bridge
 * `lib/theme/chain.mjs` and `lib/theme/edges.generated.mjs` already use — the CJS
 * emulator requires them at `lattice-emulator.js:742-743` while `docs/src` imports
 * them — so this adds a constant to an established pattern rather than a new one.
 *
 * NOT a general "config" module. One value, one question. Re-blessing a different
 * default is an edit here and nowhere else.
 */

export const DEFAULT_PALETTE = 'cuoio';
