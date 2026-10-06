import * as decoding from 'lib0/decoding';
import { describe, expect, it } from 'vitest';
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { sanitizeAwareness } from './live-controller';

// What a member says about itself in awareness is rebuilt, not believed (red-team finding 4).
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

describe('sanitizeAwareness', () => {
	const amina = { name: 'Amina', color: 2 as const, role: 'edit' };

	it('rebuilds name, color and peer from the roster, ignoring what the peer claims', () => {
		const { u } = updateFrom({ peer: 'the-host', user: { name: 'Sharmarke (host)', color: 'red;position:fixed;inset:0', colorLight: 'x' }, slide: 3 });
		const out = sanitizeAwareness(u, 'amina-peer', new Map(), amina);
		const [s] = states(out as Uint8Array);
		expect(s.state.peer).toBe('amina-peer');
		expect(s.state.user).toEqual({ name: 'Amina', color: 'var(--chart-cat2)', colorLight: 'color-mix(in srgb, var(--chart-cat2) 28%, transparent)' });
		expect(s.state.slide).toBe(3);
	});

	it('drops a summon from anyone but the host', () => {
		const { u } = updateFrom({ summon: { slide: 9, n: 99 } });
		expect(states(sanitizeAwareness(u, 'a', new Map(), amina) as Uint8Array)[0].state.summon).toBeUndefined();
		const fromHost = states(sanitizeAwareness(u, 'h', new Map(), { name: 'H', color: 1, role: 'host' }) as Uint8Array)[0];
		expect(fromHost.state.summon).toEqual({ slide: 9, n: 99 });
	});

	it('refuses entries for a client another peer already owns (no hijacking or deleting carets)', () => {
		const { u, client } = updateFrom({ slide: 1 });
		const owner = new Map([[client, 'someone-else']]);
		expect(sanitizeAwareness(u, 'amina-peer', owner, amina)).toBeNull();
	});

	it('says nothing for a peer that is not a member', () => {
		const { u } = updateFrom({ slide: 1 });
		expect(sanitizeAwareness(u, 'stranger', new Map(), undefined)).toBeNull();
	});
});
