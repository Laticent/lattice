// Lente, as Lattice runs it: the library with Lattice's lens-tag carrier installed. A slide's lens membership is the
// `lens` field of its `<!-- @meta{…} -->` record (engineering/decisions/2026-10-17-meta-record.md §15, slice D), read and
// written by the one slide-settings reader and writer (lib/core/meta-edit.mjs), never a second copy of the record
// grammar inside the zero-dependency package (followups.d/3426-p2: a hand-rolled copy invented classes the engine
// rejects). Until the cut the reader also reads a `<!-- _lens: … -->` comment, and the writer moves one into the record.
//
// Every Lattice surface imports Lente from HERE, not from '@/lib/lente', so no surface reads tags with the comment
// default (test: docs/src/lib/lente-host.test.ts).

import { readMetaField, writeMeta } from '../../../lib/core/meta-edit.mjs';
import { type LensTagCarrier, setLensTagCarrier } from './lente';

export const recordLensCarrier: LensTagCarrier = {
	read(slideSrc) {
		const field = readMetaField(slideSrc, 'lens');
		return field.present ? String(field.value ?? '') : null;
	},
	write(slideSrc, tokens) {
		return writeMeta(slideSrc, { lens: tokens });
	},
};

setLensTagCarrier(recordLensCarrier);

export * from './lente';
