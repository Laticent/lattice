/**
 * lib/core/front-matter-island.mjs
 *
 * THE FRONT-MATTER ISLAND: S3 of the Segno deck pipeline for a deck's leading YAML block
 * (engineering/decisions/2026-10-22-segno-deck-pipeline.md §The design; 2026-11-13-squadra-replaces-lint-core.md §5,
 * §11). It is two import-free modules, joined here:
 *
 *   - lib/core/front-matter-fence.mjs: WHERE THE FRONT MATTER ENDS (`frontMatterFence`, `frontMatterMatch`,
 *     `FRONT_MATTER_FENCE`), the block the engine finds after S0.
 *   - lib/core/front-matter-keys.mjs: ITS KEYS (`frontMatterKeys`, `topLevelKey`, `looseKey`, `BLOCK_SCALAR_HEAD`).
 *
 * Each reader imports the half it needs, so a page that only needs the block (the docs home page) never ships the key
 * reader. CommonJS readers require the two halves directly, never this module: a required ES module that imports
 * another fails to load under Playwright's loader. This module is for ES readers and tests that want both at once.
 */

import { frontMatterFence } from './front-matter-fence.mjs';
import { frontMatterKeys } from './front-matter-keys.mjs';

export { FRONT_MATTER_FENCE, frontMatterFence, frontMatterMatch } from './front-matter-fence.mjs';
export { BLOCK_SCALAR_HEAD, frontMatterKeys, looseKey, topLevelKey } from './front-matter-keys.mjs';

/**
 * @typedef {object} FrontMatterIsland  a deck's front matter, read
 * @property {number} end        where the body starts: the block's length, closing line end included
 * @property {number} closeEnd   where the closing `---` ends, before its line end (`end` less that line end)
 * @property {number} yamlFrom   the YAML body's span in the source (between the fences)
 * @property {number} yamlTo
 * @property {string} yaml       the YAML body
 * @property {FrontMatterKey[]} keys  its key lines, with source offsets
 */

/**
 * The front matter at the start of `source`, or null when it opens with none. `source` is read as given: the engine
 * and the deck model hand S0 text, a raw-bytes reader its bytes (a leading BOM then means no front matter, as it does
 * to every reader that has not run S0).
 *
 * @param {string} source
 * @returns {FrontMatterIsland|null}
 */
export function frontMatterIsland(source) {
  const text = String(source ?? '');
  const f = frontMatterFence(text);
  if (!f) return null;
  const yaml = text.slice(f.yamlFrom, f.yamlTo);
  return { ...f, yaml, keys: frontMatterKeys(yaml, f.yamlFrom) };
}

