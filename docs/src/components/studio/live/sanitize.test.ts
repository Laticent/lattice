import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { describe, expect, it } from 'vitest';
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { sanitizeAwareness } from './live-controller';

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
		expect(kept).toEqual({ anchor: { type: { client: 1, clock: 0 }, item: { client: 7, clock: 3 }, assoc: 0 }, head: { item: { client: 7, clock: 4 }, assoc: 0 } });
		for (const bad of [{ anchor: {}, head: {} }, { anchor: { item: { client: 'x', clock: 1 } }, head: good.head }, 'nope']) {
			const s = states(sanitizeAwareness(updateFrom({ cursor: bad }).u, 'a', boundTo('a'), amina) as Uint8Array)[0].state;
			expect(s.cursor).toBeUndefined();
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
