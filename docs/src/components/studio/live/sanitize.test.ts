import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { describe, expect, it } from 'vitest';
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { cleanDoing, cleanRelPos, sanitizeAwareness } from './live-controller';
import { liveColor, liveColorLight } from './live-model';

// What a member says about itself in awareness is rebuilt, not believed (red-team finding 4), and
// it may speak only for the client id the host's roster bound to it (red-team round 2, finding 3).
const states = (u: Uint8Array) => {
	const d = decoding.createDecoder(u);
	const n = decoding.readVarUint(d);
	return Array.from({ length: n }, () => ({ client: decoding.readVarUint(d), clock: decoding.readVarUint(d), state: JSON.parse(decoding.readVarString(d)) }));
};
const updateFrom = (state: Record<string, unknown>, doc = new Y.Doc()) => {
	const aw = new Awareness(doc);
	aw.setLocalState(state);
	return { u: encodeAwarenessUpdate(aw, [doc.clientID]), client: doc.clientID };
};
/** A roster that binds every client id to `peer`. */
const boundTo = (peer: string) => () => peer;

describe('sanitizeAwareness', () => {
	const amina = { name: 'Amina', color: 2 as const, role: 'edit' };

	it('rebuilds name, color and peer from the roster, ignoring what the peer claims', () => {
		const { u } = updateFrom({ peer: 'the-host', user: { name: 'Sharmarke (host)', color: 'red;position:fixed;inset:0', colorLight: 'x' }, slide: 3 });
		const out = sanitizeAwareness(u, 'amina-peer', boundTo('amina-peer'), amina);
		const [s] = states(out as Uint8Array);
		expect(s.state.peer).toBe('amina-peer');
		expect(s.state.user).toEqual({ name: 'Amina', color: 'var(--chart-cat2)', colorLight: 'color-mix(in srgb, var(--chart-cat2) 28%, transparent)' });
		expect(s.state.slide).toBe(3);
	});

	it('drops a summon from anyone but the host', () => {
		const { u } = updateFrom({ summon: { slide: 9, n: 99 } });
		expect(states(sanitizeAwareness(u, 'a', boundTo('a'), amina) as Uint8Array)[0].state.summon).toBeUndefined();
		const fromHost = states(sanitizeAwareness(u, 'h', boundTo('h'), { name: 'H', color: 1, role: 'host' }) as Uint8Array)[0];
		expect(fromHost.state.summon).toEqual({ slide: 9, n: 99 });
	});

	it('keeps only the client id the roster binds to the sender — first arrival claims nothing', () => {
		const { u } = updateFrom({ slide: 1 });
		expect(sanitizeAwareness(u, 'amina-peer', boundTo('someone-else'), amina)).toBeNull();
		expect(sanitizeAwareness(u, 'amina-peer', () => undefined, amina)).toBeNull();
	});

	it('says nothing for a peer that is not a member', () => {
		const { u } = updateFrom({ slide: 1 });
		expect(sanitizeAwareness(u, 'stranger', boundTo('stranger'), undefined)).toBeNull();
	});

	it('returns null for bytes that do not decode, instead of throwing', () => {
		const { u } = updateFrom({ slide: 1 });
		expect(sanitizeAwareness(u.subarray(0, u.length - 3), 'a', boundTo('a'), amina)).toBeNull();
	});

	it('keeps a well-formed caret and drops one CodeMirror would choke on', () => {
		const good = { anchor: { type: { client: 1, clock: 0 }, tname: null, item: { client: 7, clock: 3 }, assoc: 0 }, head: { item: { client: 7, clock: 4 }, assoc: 0 } };
		const kept = states(sanitizeAwareness(updateFrom({ cursor: good }).u, 'a', boundTo('a'), amina) as Uint8Array)[0].state.cursor;
		expect(kept).toEqual({ anchor: { type: { client: 1, clock: 0 }, tname: null, item: { client: 7, clock: 3 }, assoc: 0 }, head: { type: null, tname: null, item: { client: 7, clock: 4 }, assoc: 0 } });
		for (const bad of [{ anchor: {}, head: {} }, { anchor: { item: { client: 'x', clock: 1 } }, head: good.head }, 'nope']) {
			const s = states(sanitizeAwareness(updateFrom({ cursor: bad }).u, 'a', boundTo('a'), amina) as Uint8Array)[0].state;
			expect(s.cursor).toBeUndefined();
		}
	});

	it('a caret at the end or start of the text survives the sanitizer in the form Yjs reads (no remote caret turns off)', () => {
		const doc = new Y.Doc();
		const text = doc.getText('source');
		text.insert(0, 'hello world');
		// Index 11 with assoc 0 and index 0 with assoc -1 are the two positions whose `item` is null.
		for (const [index, assoc] of [[11, 0], [0, -1], [5, 0]] as const) {
			const rel = JSON.parse(JSON.stringify(Y.createRelativePositionFromTypeIndex(text, index, assoc)));
			const kept = states(sanitizeAwareness(updateFrom({ cursor: { anchor: rel, head: rel } }).u, 'a', boundTo('a'), amina) as Uint8Array)[0].state.cursor as { anchor: unknown; head: unknown };
			expect(kept).toBeDefined();
			for (const end of [kept.anchor, kept.head]) {
				const abs = Y.createAbsolutePositionFromRelativePosition(end as Y.RelativePosition, doc);
				expect(abs?.index).toBe(index);
			}
		}
	});

	it('matches the previous hand-written gate on every input it kept or dropped (the adapter is the same gate, hardened)', () => {
		// The gate as it was before Tavola's Yjs adapter took it over, kept here as the reference.
		const legacy = (u: Uint8Array, from: string, ownerOf: (c: number) => string | undefined, member: { name: string; color: 1 | 2 | 3 | 4; role: string }) => {
			const d = decoding.createDecoder(u);
			const n = decoding.readVarUint(d);
			const out: Array<[number, number, string]> = [];
			for (let i = 0; i < n; i++) {
				const client = decoding.readVarUint(d);
				const clock = decoding.readVarUint(d);
				const body = decoding.readVarString(d);
				if (ownerOf(client) !== from) continue;
				const st = JSON.parse(body) as Record<string, unknown> | null;
				if (st === null || typeof st !== 'object') {
					if (st === null) out.push([client, clock, 'null']);
					continue;
				}
				const clean: Record<string, unknown> = { peer: from, user: { name: member.name, color: liveColor(member.color), colorLight: liveColorLight(member.color) } };
				if (Number.isInteger(st.slide) && (st.slide as number) >= 0) clean.slide = st.slide;
				if (st.slideHidden === true) clean.slideHidden = true;
				if (typeof st.editingAt === 'number') clean.editingAt = st.editingAt;
				const sm = st.summon as { slide?: unknown; n?: unknown } | undefined;
				if (member.role === 'host' && sm && Number.isInteger(sm.slide) && Number.isInteger(sm.n)) clean.summon = { slide: sm.slide, n: sm.n };
				const cur = st.cursor as { anchor?: unknown; head?: unknown } | undefined;
				const anchor = cleanRelPos(cur?.anchor);
				const head = cleanRelPos(cur?.head);
				if (anchor && head) clean.cursor = { anchor, head };
				const doing = cleanDoing(st.doing);
				if (doing) clean.doing = doing;
				out.push([client, clock, JSON.stringify(clean)]);
			}
			return out.map(([client, clock, json]) => ({ client, clock, state: JSON.parse(json) }));
		};
		const rel = { type: null, tname: 'source', item: { client: 7, clock: 3 }, assoc: 0 };
		const corpus: Array<Record<string, unknown> | null> = [
			{ slide: 3 }, { slide: -1 }, { slide: 1.5 }, { slide: 'x' }, { slideHidden: true }, { slideHidden: 'yes' }, { editingAt: 12345 }, { editingAt: 'now' },
			{ summon: { slide: 2, n: 4 } }, { summon: { slide: 'a', n: 1 } }, { cursor: { anchor: rel, head: rel } }, { cursor: { anchor: rel } }, { cursor: 'nope' },
			{ doing: { panel: 'coach', view: 'compose', presenting: true } }, { doing: { panel: 'chat', view: 'compose', presenting: false } }, { doing: 'x' },
			{ peer: 'h', user: { name: 'Sharmarke', color: 'red' }, slide: 2, junk: { deep: [1, 2, 3] } }, {}, null,
			{ slide: 2, slideHidden: true, editingAt: 9, cursor: { anchor: rel, head: rel }, doing: { panel: null, view: 'article', presenting: false, asking: true } },
		];
		for (const role of ['edit', 'host', 'view'] as const) {
			const member = { name: 'Amina', color: 2 as const, role };
			for (const state of corpus) {
				const { u } = updateFrom(state ?? {});
				const body = state === null ? encoding.createEncoder() : null;
				void body;
				const bytes = state === null ? (() => { const e = encoding.createEncoder(); encoding.writeVarUint(e, 1); encoding.writeVarUint(e, 7); encoding.writeVarUint(e, 4); encoding.writeVarString(e, 'null'); return encoding.toUint8Array(e); })() : u;
				const owns = () => 'a';
				const got = sanitizeAwareness(bytes, 'a', owns, member);
				const want = legacy(bytes, 'a', owns, member);
				expect(got ? states(got) : [], JSON.stringify({ role, state })).toEqual(want);
			}
		}
	});

	it('a removal (null state) passes through for the bound client', () => {
		const enc = encoding.createEncoder();
		encoding.writeVarUint(enc, 1);
		encoding.writeVarUint(enc, 42);
		encoding.writeVarUint(enc, 5);
		encoding.writeVarString(enc, 'null');
		const out = sanitizeAwareness(encoding.toUint8Array(enc), 'a', boundTo('a'), amina);
		expect(states(out as Uint8Array)).toEqual([{ client: 42, clock: 5, state: null }]);
	});
});
