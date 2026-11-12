/** Accordo behind the bake-off interface. States travel as JSON text, the way they would be stored. */

import { RecordList, type Wire } from './accordo.ts';
import type { Contender } from './contender.ts';
import { gzipLength } from './gzip.ts';

const enc = new TextEncoder();
export function accordoDoc(list: RecordList = new RecordList()): Contender {
	return {
		name: 'accordo',
		push: (fields) => list.push(fields),
		insertAfter: (afterId, fields) => list.insertAfter(afterId, fields),
		set: (id, key, value) => list.set(id, key, value),
		delete: (id) => list.delete(id),
		deleteRange(from, count) {
			for (const r of list.toArray().slice(from, from + count)) list.delete(r.id);
		},
		toArray: () => list.toArray(),
		encode: () => JSON.stringify(list.encode()),
		since: () => list.versionVector(),
		encodeSince: (token) => JSON.stringify(list.encode(token as Record<string, number>)),
		apply: (update) => list.apply(JSON.parse(update as string) as Wire),
		bytes: (update) => enc.encode(update as string).length,
		load: (update) => accordoDoc(RecordList.decode(JSON.parse(update as string) as Wire)),
		transact: (fn) => fn(),
		sizes() {
			const t = JSON.stringify(list.encode());
			return { raw: enc.encode(t).length, gzip: gzipLength(t) };
		},
	};
}
