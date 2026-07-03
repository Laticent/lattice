// Shared reference-doc library (#640) — persistence so an attached doc is reusable
// across EVERY deck, not lost after one generation. Records live in the existing
// Workbench IndexedDB asset store (`asset-store.js`, kind:'refdoc'), which is
// library-scoped, not deck-scoped — so a doc saved once is shared by construction.
//
// Privacy: stored locally in the browser (IndexedDB), NEVER uploaded to us — the
// bytes are only ever inlined into a call the user's own key pays for (the
// inline-only decision, engineering/decisions/2026-06-29-studio-spend-budget.md).
import { deleteAsset, listAssets, putAsset } from '@/components/studio/library/asset-store.js';
import type { ReferenceDoc } from './reference-doc';

/** A persisted reference doc — an asset-store record of kind 'refdoc'. */
export type RefDocRecord = {
	id: string;
	kind: 'refdoc';
	name: string;
	docKind: 'text' | 'pdf';
	text?: string;
	dataUrl?: string;
	bytes: number;
	addedAt: number;
};

const REFDOC_KIND = 'refdoc';

/** Rehydrate the in-memory ReferenceDoc a generation call consumes from a record.
 *  Carries the record `id` so the UI can match the active doc by identity. */
export function recordToDoc(rec: RefDocRecord): ReferenceDoc {
	return { id: rec.id, name: rec.name, kind: rec.docKind, text: rec.text, dataUrl: rec.dataUrl, bytes: rec.bytes };
}

/** Persist a doc to the shared library (dedups by name — re-adding replaces in
 *  place). `addedAt` is passed in so callers own the clock (tests stay deterministic). */
export async function saveRefDoc(doc: ReferenceDoc, addedAt: number): Promise<RefDocRecord> {
	const record: Omit<RefDocRecord, 'id'> = {
		kind: REFDOC_KIND,
		name: doc.name,
		docKind: doc.kind,
		text: doc.text,
		dataUrl: doc.dataUrl,
		bytes: doc.bytes,
		addedAt,
	};
	// putAsset assigns an id and updates an existing (kind,name) in place.
	return (await putAsset(record)) as RefDocRecord;
}

/** Every saved reference doc, newest first (asset-store sorts by addedAt). */
export async function listRefDocs(): Promise<RefDocRecord[]> {
	try {
		return (await listAssets(REFDOC_KIND)) as RefDocRecord[];
	} catch {
		return []; // IndexedDB unavailable (private mode) — the library is simply empty
	}
}

/** Remove a saved doc from the library. */
export async function deleteRefDoc(id: string): Promise<void> {
	try {
		await deleteAsset(id);
	} catch {
		/* best-effort — a failed delete just leaves the row */
	}
}
