// Lente, as Lattice runs it: the library with Lattice's lens-tag carrier installed. A slide's lens membership is the
// `lens` field of its `<!-- @meta{…} -->` record (engineering/decisions/2026-10-17-meta-record.md §15, slice D), read and
// written by the one slide-settings reader and writer (lib/core/meta-edit.mjs), never a second copy of the record
// grammar inside the zero-dependency package (followups.d/3426-p2: a hand-rolled copy invented classes the engine
// rejects). Until the cut the reader also reads a `<!-- _lens: … -->` comment, and the writer moves one into the record.
//
// Every Lattice surface imports Lente from HERE, not from the bare package, so no surface reads tags with the comment
// default (test: docs/src/lib/lente-host.test.ts). The package is imported through the `@/` alias, never a directory
// path: Playwright loads specs (and what they import, e.g. deck-lint.ts) through Node ESM, which rejects a directory import.

import { commentLensCarrier, type LensTagCarrier, setLensTagCarrier } from '@/lib/lente';
import { readMetaField, writeMeta } from '../../../lib/core/meta-edit.mjs';

// Where the record reader cannot edit the tag (two tags on one slide, a tag inside a list item or quote, an array
// value: `readMetaField(...).editable` false), the carrier falls back to the comment one, so those slides behave as
// they did: the FIRST tag counts (LFM 1.1 §2.4, spec/conformance/lfm/lens-tag.json) and a toggle still rewrites it,
// where `writeMeta` would leave the slide unchanged and the Studio's toggle would do nothing, without a word.
// A tag the record reader sees is one in a record, or a spot `_lens` comment (moved into the record on its next write).
export const recordLensCarrier: LensTagCarrier = {
	read(slideSrc) {
		const field = readMetaField(slideSrc, 'lens');
		if (!field.present || !field.editable || !field.record) return commentLensCarrier.read(slideSrc);
		return String(field.value ?? '');
	},
	write(slideSrc, tokens) {
		const field = readMetaField(slideSrc, 'lens');
		if (field.present && !field.editable) return commentLensCarrier.write(slideSrc, tokens);
		return writeMeta(slideSrc, { lens: tokens });
	},
};

setLensTagCarrier(recordLensCarrier);

export * from '@/lib/lente';
