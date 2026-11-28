// Lente, as Lattice runs it: the library with Lattice's lens-tag carrier installed. A slide's lens membership is the
// `lens` field of its `<!-- @meta{…} -->` record (engineering/decisions/2026-10-17-meta-record.md §15), read and written
// by the one slide-settings reader and writer (lib/core/meta-edit.mjs, through lib/core/lens-carrier.mjs), never a
// second copy of the record grammar inside the zero-dependency package (followups.d/3426-p2: a hand-rolled copy invented
// classes the engine rejects). Since the cut (slice E) a `<!-- _lens: … -->` comment is not a tag.
//
// Every Lattice surface imports Lente from HERE, not from the bare package, so no surface reads tags with the comment
// default (test: docs/src/lib/lente-host.test.ts). The package is imported through the `@/` alias, never a directory
// path: Playwright loads specs (and what they import, e.g. deck-lint.ts) through Node ESM, which rejects a directory import.

import { type LensTagCarrier, setLensTagCarrier } from '@/lib/lente';
import { recordLensCarrier as carrier } from '../../../lib/core/lens-carrier.mjs';

export const recordLensCarrier: LensTagCarrier = carrier;

setLensTagCarrier(recordLensCarrier);

export * from '@/lib/lente';
