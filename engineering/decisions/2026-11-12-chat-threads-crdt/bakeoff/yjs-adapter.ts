/**
 * Yjs behind the bake-off interface: one Y.Doc, a Y.Array of Y.Maps (one map per record, `id` as a field).
 * The design note's option B (../../2026-11-12-chat-threads-crdt.md §5.1), used the way a careful integration would
 * (round 2, after the audit): an id index kept current on load and on remote updates (no scan per field write), a
 * fast path for appends, edits batched in one transaction, and the V2 update encoding for storage and sync.
 */

import * as Y from 'yjs';
import type { Contender } from './contender.ts';
import { gzipLength } from './gzip.ts';
import { seededId } from './ids.ts';

let n = 0;

export function yjsDoc(): Contender {
	const doc = new Y.Doc();
	const seeded = seededId();
	if (seeded !== null) doc.clientID = seeded;
	const newId = () => `${doc.clientID.toString(36)}.${(n++).toString(36)}`;
	const arr = doc.getArray<Y.Map<unknown>>('records');
	const byId = new Map<string, Y.Map<unknown>>();
	// Keep the index current when records arrive from another replica (a careful integration observes, not scans).
	arr.observe((e) => {
		for (const item of e.changes.added) for (const m of item.content.getContent() as Y.Map<unknown>[]) if (m instanceof Y.Map) byId.set(m.get('id') as string, m);
	});
	const indexOf = (id: string) => {
		const last = arr.length - 1;
		if (last >= 0 && arr.get(last).get('id') === id) return last; // appends: the common case
		let i = 0;
		for (const m of arr) {
			if (m.get('id') === id) return i;
			i++;
		}
		return -1;
	};
	const make = (id: string, fields: Record<string, unknown>) => {
		const m = new Y.Map<unknown>();
		m.set('id', id);
		for (const [k, v] of Object.entries(fields)) m.set(k, v);
		byId.set(id, m);
		return m;
	};
	const self: Contender = {
		name: 'yjs',
		push(fields) {
			const id = newId();
			arr.push([make(id, fields)]);
			return id;
		},
		insertAfter(afterId, fields) {
			const id = newId();
			const at = afterId === null ? -1 : indexOf(afterId);
			arr.insert(at + 1, [make(id, fields)]);
			return id;
		},
		set(id, key, value) {
			const m = byId.get(id);
			if (!m || m.parent === null || (m as unknown as { _item?: { deleted: boolean } })._item?.deleted) return;
			if (value === undefined) m.delete(key);
			else m.set(key, value);
		},
		delete(id) {
			const i = indexOf(id);
			if (i >= 0) arr.delete(i, 1);
		},
		deleteRange(from, count) {
			arr.delete(from, Math.min(count, arr.length - from));
		},
		toArray() {
			return arr.toArray().map((m) => m.toJSON() as Record<string, unknown> & { id: string });
		},
		encode() {
			return Y.encodeStateAsUpdateV2(doc);
		},
		since() {
			return Y.encodeStateVector(doc);
		},
		encodeSince(token) {
			return Y.encodeStateAsUpdateV2(doc, token as Uint8Array);
		},
		apply(update) {
			Y.applyUpdateV2(doc, update as Uint8Array);
		},
		bytes(update) {
			return (update as Uint8Array).length;
		},
		load(update) {
			const d = yjsDoc() as Contender & { _index?: () => void };
			d.apply(update);
			return d;
		},
		transact(fn) {
			doc.transact(fn);
		},
		sizes() {
			const v2 = Y.encodeStateAsUpdateV2(doc);
			const v1 = Y.encodeStateAsUpdate(doc);
			return { raw: v2.length, gzip: gzipLength(v2), v1raw: v1.length, v1gzip: gzipLength(v1) };
		},
	};
	return self;
}
