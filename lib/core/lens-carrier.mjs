/**
 * lib/core/lens-carrier.mjs
 *
 * WHERE LATTICE KEEPS A SLIDE'S LENS TAG: the `lens` field of the slide's `<!-- @meta{…} -->` record, read and written by
 * the one slide-settings reader and writer (lib/core/meta-edit.mjs). Lente (`@laticent/lente`, zero-dependency) ships
 * the old `<!-- _lens: … -->` comment as its default carrier; every Lattice surface installs this one instead, through
 * `setLensTagCarrier` (docs/src/lib/lente-host.ts, tools/lfm-conformance.js).
 *
 * Since the cut (engineering/decisions/2026-10-17-meta-record.md §15, slice E) the engine reads no `_lens` comment, so
 * neither does this carrier: a tag lives in a record or nowhere. Two records that both set `lens` resolve as every
 * repeated field does, the last one winning (the linter names the repeat, `meta-repeated-key`), and a toggle leaves
 * such a slide as written until the author removes one: `writeMeta` refuses an edit it cannot make cleanly.
 *
 * Pure and fs-free (HARD RULE #7). ESM so the docs site imports it as source.
 */

import { readMetaField, writeMeta } from './meta-edit.mjs';

/** @type {{read: (slideSrc: string) => string, write: (slideSrc: string, tokens: string) => string}} */
export const recordLensCarrier = Object.freeze({
  read(slideSrc) {
    const field = readMetaField(slideSrc, 'lens');
    // Only a record resolves since the cut (lib/core/meta-scan.mjs), so a tag that is present is a record's.
    return field.present ? String(field.value ?? '') : '';
  },
  write(slideSrc, tokens) {
    return writeMeta(slideSrc, { lens: tokens });
  },
});
