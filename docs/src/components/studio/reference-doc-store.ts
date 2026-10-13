// Shared reference-doc library (#640) — persistence so an attached doc is reusable
// across EVERY deck, not lost after one generation. Records live in the existing
// Workbench IndexedDB asset store (`asset-store.js`, kind:'refdoc'), which is
// library-scoped, not deck-scoped — so a doc saved once is shared by construction.
//
// Privacy: stored locally in the browser (IndexedDB), NEVER uploaded to us — the
// bytes are only ever inlined into a call the user's own key pays for (the
// inline-only decision, engineering/decisions/2026-06-29-studio-spend-budget.md).
import { ASSET_STORE, openDB } from '@/components/studio/library/asset-db.js';
import { deleteAsset, listAssets, putAsset, REFUSAL_PREFIX } from '@/components/studio/library/asset-store.js';
import { blobToDataUrl, dataUrlToBlob, MAX_DOC_BYTES, type ReferenceDoc } from './reference-doc';

/** A persisted reference doc — an asset-store record of kind 'refdoc'. */
export type RefDocRecord = {
	id: string;
	kind: 'refdoc';
	name: string;
	docKind: 'text' | 'pdf';
	text?: string;
	/** A PDF's own bytes, stored as binary: base64 text would be a third larger on disk, and every list read
	 *  would hold each PDF as a string. */
	blob?: Blob;
	/** Only where an engine refused to store a `Blob` (Safari in a private window): the same bytes as an
	 *  ArrayBuffer, rebuilt into `blob` on the way out. */
	data?: ArrayBuffer;
	/** Records written before PDFs were stored as binary. Still read; `migrateLegacyRefDocs` rewrites them. */
	dataUrl?: string;
	bytes: number;
	addedAt: number;
};

const REFDOC_KIND = 'refdoc';

/** Rehydrate the in-memory ReferenceDoc a generation call consumes from a record.
 *  Carries the record `id` so the UI can match the active doc by identity. */
export async function recordToDoc(rec: RefDocRecord): Promise<ReferenceDoc> {
	// The base64 text a request needs is made here, once, for the doc being attached: not at rest.
	const dataUrl = rec.dataUrl ?? (rec.blob ? await blobToDataUrl(rec.blob) : undefined);
	return { id: rec.id, name: rec.name, kind: rec.docKind, text: rec.text, dataUrl, bytes: rec.bytes };
}

/** A saved PDF's bytes, or null for a text doc or a record with none. */
export function refDocBlob(rec: RefDocRecord): Blob | null {
	if (rec.blob) return rec.blob;
	if (rec.dataUrl) {
		try {
			return dataUrlToBlob(rec.dataUrl);
		} catch {
			return null;
		}
	}
	return null;
}

/** A row as the app uses it: a `blob`, whichever way the bytes were stored. */
function readable(row: RefDocRecord): RefDocRecord {
	if (row.blob || !row.data) return row;
	const { data, ...rest } = row;
	return { ...rest, blob: new Blob([data], { type: 'application/pdf' }) };
}

/** Persist a doc to the shared library (dedups by name — re-adding replaces in
 *  place). `addedAt` is passed in so callers own the clock (tests stay deterministic). */
export async function saveRefDoc(doc: ReferenceDoc, addedAt: number): Promise<RefDocRecord> {
	// A PDF arrives as base64 text (it is read that way for the request) and is stored as the bytes it encodes,
	// typed as a PDF whatever the text said (a file picked with no type reads as octet-stream, and a backup row can
	// claim any type: `recordToDoc` sends this type to the model).
	const decoded = doc.kind === 'pdf' && doc.dataUrl ? dataUrlToBlob(doc.dataUrl) : undefined;
	const blob = decoded ? decoded.slice(0, decoded.size, 'application/pdf') : undefined;
	// The size is what was decoded, never the row's own claim: a restored row says whatever its file says, and the
	// cost readout and the spend guard read this number.
	const bytes = blob ? blob.size : Math.min(MAX_DOC_BYTES, Math.max(0, Math.floor(Number(doc.bytes) || 0)));
	const record: Omit<RefDocRecord, 'id'> = { kind: REFDOC_KIND, name: doc.name, docKind: doc.kind, text: doc.text, bytes, addedAt };
	if (!blob) return readable((await putAsset(record)) as RefDocRecord);
	try {
		// putAsset assigns an id and updates an existing (kind,name) in place.
		return readable((await putAsset({ ...record, blob })) as RefDocRecord);
	} catch (first) {
		// A full disk or our own refusal is not a Blob problem; a second attempt would fail the same way.
		if ((first as { name?: string } | null)?.name === 'QuotaExceededError' || String((first as Error)?.message ?? '').startsWith(REFUSAL_PREFIX)) throw first;
		// Some engines refuse to store a Blob at all (Safari in a private window): the bytes go in as an ArrayBuffer.
		return readable((await putAsset({ ...record, data: await blob.arrayBuffer() })) as RefDocRecord);
	}
}

/** Rewrite every record that still holds a PDF as base64 text so it holds the bytes instead. Idempotent, and
 *  it leaves a record alone when it cannot be decoded (the text stays readable). Resolves how many changed. */
export async function migrateLegacyRefDocs(): Promise<number> {
	let n = 0;
	for (const rec of await listRefDocs()) {
		if (!rec.dataUrl || rec.blob) continue;
		try {
			if (await swapLegacyRefDoc(rec, dataUrlToBlob(rec.dataUrl))) n++;
		} catch {
			/* undecodable text, or a browser that will not store the Blob: the legacy record keeps working */
		}
	}
	return n;
}

/**
 * Rewrite ONE legacy record as binary, only if it is still exactly the record that was read: same id, same
 * base64 text, no blob. The list is read once and the rewrites happen later, so a doc the author saved over,
 * deleted or cleared in between must not be overwritten with the old bytes or brought back. The check and the
 * write share one transaction. Resolves whether it wrote.
 */
export async function swapLegacyRefDoc(rec: RefDocRecord, blob: Blob): Promise<boolean> {
	const db = await openDB();
	return new Promise<boolean>((resolve, reject) => {
		const t = db.transaction(ASSET_STORE, 'readwrite');
		const store = t.objectStore(ASSET_STORE);
		let wrote = false;
		t.oncomplete = () => resolve(wrote);
		t.onabort = t.onerror = () => reject(t.error || new Error('swapLegacyRefDoc: the change failed'));
		const get = store.get(rec.id);
		get.onsuccess = () => {
			const now = get.result as RefDocRecord | undefined;
			if (!now || now.dataUrl !== rec.dataUrl || now.blob || now.data) return;
			const { dataUrl: _legacy, ...rest } = now;
			store.put({ ...rest, blob });
			wrote = true;
		};
	});
}

/** Every saved reference doc, newest first (asset-store sorts by addedAt). */
export async function listRefDocs(): Promise<RefDocRecord[]> {
	try {
		return ((await listAssets(REFDOC_KIND)) as RefDocRecord[]).map(readable);
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
