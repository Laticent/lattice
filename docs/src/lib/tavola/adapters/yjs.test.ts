import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { describe, expect, it } from 'vitest';
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { Member } from '../types.js';
import { bool, defineViewKeys, int, obj, oneOf } from '../view.js';
import { encodeEntries, MAX_CLOCK_JUMP, MAX_ENTRY_BYTES, MAX_UPDATE_BYTES, RATE_MIN_MS, SEND_MIN_MS, sanitizeAwarenessUpdate, sanitizeEntries, yjsAwareness } from './yjs.js';

// The awareness gate, written once for every app. What a peer says about itself is rebuilt, bounded before
// it is parsed, and filed under the transport sender; it can never name another member.
const amina: Member = { id: 'a', name: 'Amina', role: 'edit', color: 2, client: 7 };
const host: Member = { id: 'h', name: 'Sharmarke', role: 'host', color: 1, client: 1 };
const keys = defineViewKeys({ panel: oneOf(['coach', 'deck', 'setup']), present: obj({ idx: int(0, 10_000) }), typing: bool });
const identity = (m: Member) => ({ user: { name: m.name, color: m.color } });
const fields = {
	slide: (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? v : undefined),
	summon: (v: unknown, sender: Member) => (sender.role === 'host' && v && typeof v === 'object' ? v : undefined),
	cursor: (v: unknown) => (v && typeof v === 'object' ? v : undefined),
};
const raw = (entries: Array<[number, number, string | Uint8Array]>) => {
	const enc = encoding.createEncoder();
	encoding.writeVarUint(enc, entries.length);
	for (const [client, clock, body] of entries) {
		encoding.writeVarUint(enc, client);
		encoding.writeVarUint(enc, clock);
		if (typeof body === 'string') encoding.writeVarString(enc, body);
		else encoding.writeVarUint8Array(enc, body);
	}
	return encoding.toUint8Array(enc);
};
const decode = (u: Uint8Array) => {
	const d = decoding.createDecoder(u);
	const n = decoding.readVarUint(d);
	return Array.from({ length: n }, () => ({ client: decoding.readVarUint(d), clock: decoding.readVarUint(d), state: JSON.parse(decoding.readVarString(d)) }));
};
const opts = (member: Member | undefined, owns: (c: number) => string | undefined) => ({ ownerOf: owns, member, identity, fields, view: { keys } });

describe('sanitizeAwarenessUpdate: bounds before the parse', () => {
	it('refuses a message over the byte cap, an entry over the entry cap, and too many entries, without parsing', () => {
		const big = raw([[7, 1, JSON.stringify({ slide: 1, pad: 'x'.repeat(MAX_UPDATE_BYTES) })]]);
		expect(big.length).toBeGreaterThan(MAX_UPDATE_BYTES);
		expect(sanitizeAwarenessUpdate(big, 'a', opts(amina, () => 'a'))).toBeNull();
		const fatEntry = raw([[7, 1, JSON.stringify({ slide: 1, pad: 'x'.repeat(MAX_ENTRY_BYTES) })]]);
		expect(fatEntry.length).toBeLessThanOrEqual(MAX_UPDATE_BYTES);
		expect(sanitizeAwarenessUpdate(fatEntry, 'a', opts(amina, () => 'a'))).toBeNull();
		const many = raw(Array.from({ length: 65 }, (_, i) => [7, i, '{"slide":1}'] as [number, number, string]));
		expect(sanitizeAwarenessUpdate(many, 'a', opts(amina, () => 'a'))).toBeNull();
	});

	it('the byte cap alone refuses a message whose entries are each small and few', () => {
		const pad = (n: number) => JSON.stringify({ slide: 1, pad: 'x'.repeat(n) });
		const u = raw([[7, 1, pad(3000)], [8, 1, pad(3000)], [9, 1, pad(3000)]]);
		expect(u.length).toBeGreaterThan(MAX_UPDATE_BYTES);
		expect(sanitizeAwarenessUpdate(u, 'a', opts(amina, () => 'a'))).toBeNull();
		expect(sanitizeAwarenessUpdate(raw([[7, 1, pad(3000)]]), 'a', opts(amina, () => 'a'))).not.toBeNull();
	});

	it('a 4 MB message of 250,000 entries is refused at once (it used to cost 727 ms and 36 MB)', () => {
		const flood = raw(Array.from({ length: 250_000 }, () => [7, 1, '{"slide":1}'] as [number, number, string]));
		const t = performance.now();
		expect(sanitizeAwarenessUpdate(flood, 'a', opts(amina, () => 'a'))).toBeNull();
		expect(performance.now() - t).toBeLessThan(100);
	});

	it('keeps a client once, and only the client the roster binds to the sender', () => {
		const u = raw([[7, 1, '{"slide":1}'], [7, 2, '{"slide":2}'], [9, 1, '{"slide":3}']]);
		const out = decode(sanitizeAwarenessUpdate(u, 'a', opts(amina, (c) => (c === 7 ? 'a' : 'b'))) as Uint8Array);
		expect(out.map((e) => [e.client, e.state.slide])).toEqual([[7, 1]]);
	});

	it('says nothing without a roster row, for an unowned client, or for undecodable bytes', () => {
		const u = raw([[7, 1, '{"slide":1}']]);
		expect(sanitizeAwarenessUpdate(u, 'a', opts(undefined, () => 'a'))).toBeNull();
		expect(sanitizeAwarenessUpdate(u, 'a', opts(amina, () => undefined))).toBeNull();
		expect(sanitizeAwarenessUpdate(u.subarray(0, u.length - 3), 'a', opts(amina, () => 'a'))).toBeNull();
	});
});

describe('sanitizeAwarenessUpdate: identity and fields', () => {
	it('writes peer and user from the roster; a peer cannot set them', () => {
		const u = raw([[7, 1, JSON.stringify({ peer: 'h', user: { name: 'Sharmarke (host)', color: 'red' }, slide: 3 })]]);
		const [e] = decode(sanitizeAwarenessUpdate(u, 'a', opts(amina, () => 'a')) as Uint8Array);
		expect(e.state).toEqual({ slide: 3, user: { name: 'Amina', color: 2 }, peer: 'a' });
	});

	it('a field cleaner sees the sender: a summon counts only from the host', () => {
		const u = raw([[7, 1, '{"summon":{"slide":9}}']]);
		expect(decode(sanitizeAwarenessUpdate(u, 'a', opts(amina, () => 'a')) as Uint8Array)[0].state.summon).toBeUndefined();
		const h = raw([[1, 1, '{"summon":{"slide":9}}']]);
		expect(decode(sanitizeAwarenessUpdate(h, 'h', opts(host, () => 'h')) as Uint8Array)[0].state.summon).toEqual({ slide: 9 });
	});

	it('a cleaner cannot be named peer, user or the view field', () => {
		const u = raw([[7, 1, '{}']]);
		for (const name of ['peer', 'user', 'view']) expect(() => sanitizeAwarenessUpdate(u, 'a', { ...opts(amina, () => 'a'), fields: { [name]: () => 1 } })).toThrow();
	});

	it('a removal passes for the bound client, and a non-object state is dropped', () => {
		expect(decode(sanitizeAwarenessUpdate(raw([[7, 5, 'null']]), 'a', opts(amina, () => 'a')) as Uint8Array)).toEqual([{ client: 7, clock: 5, state: null }]);
		for (const body of ['"nope"', '3', '[1]', 'true']) expect(sanitizeAwarenessUpdate(raw([[7, 1, body]]), 'a', opts(amina, () => 'a'))).toBeNull();
	});

	it('keeps only declared view keys, reports what it dropped, and omits an empty view', () => {
		const dropped: string[][] = [];
		const u = raw([[7, 1, JSON.stringify({ view: { panel: 'deck', secret: 'x', typing: 'yes', constructor: 1 } })]]);
		const [e] = decode(sanitizeAwarenessUpdate(u, 'a', { ...opts(amina, () => 'a'), onDrop: (_from, k) => dropped.push(k) }) as Uint8Array);
		expect(e.state.view).toEqual({ panel: 'deck' });
		expect(dropped).toEqual([['typing']]);
		const empty = raw([[7, 1, JSON.stringify({ view: { nothing: 1 }, slide: 1 })]]);
		expect(decode(sanitizeAwarenessUpdate(empty, 'a', opts(amina, () => 'a')) as Uint8Array)[0].state.view).toBeUndefined();
	});

	it('round-trips through encodeEntries', () => {
		const entries = sanitizeEntries(raw([[7, 3, '{"slide":2}']]), 'a', opts(amina, () => 'a')) as NonNullable<ReturnType<typeof sanitizeEntries>>;
		expect(decode(encodeEntries(entries))).toEqual([{ client: 7, clock: 3, state: { slide: 2, user: { name: 'Amina', color: 2 }, peer: 'a' } }]);
	});
});

/** A stream over a fresh awareness, with a fake clock and timers. */
function rig(over: Partial<Parameters<typeof yjsAwareness>[1]> = {}) {
	const aw = new Awareness(new Y.Doc());
	let t = 1000;
	const timers: Array<{ at: number; fn: () => void; id: number }> = [];
	let n = 0;
	const roster = new Map<string, Member>([['a', amina], ['h', host]]);
	const dropped: string[][] = [];
	const y = yjsAwareness(aw, {
		ownerOf: (c) => [...roster.values()].find((m) => m.client === c)?.id,
		memberOf: (p) => roster.get(p),
		identity,
		fields,
		view: { keys },
		onDrop: (_f, k) => dropped.push(k),
		now: () => t,
		setTimeout: (fn, ms) => {
			const id = ++n;
			timers.push({ at: t + ms, fn, id });
			return id;
		},
		clearTimeout: (id) => {
			const i = timers.findIndex((x) => x.id === id);
			if (i >= 0) timers.splice(i, 1);
		},
		...over,
	});
	const advance = (ms: number) => {
		t += ms;
		for (const x of [...timers].filter((x) => x.at <= t)) {
			timers.splice(timers.indexOf(x), 1);
			x.fn();
		}
	};
	const send = (client: number, clock: number, state: unknown, from = 'a') => y.stream.applyRemote(raw([[client, clock, JSON.stringify(state)]]), from);
	return { aw, y, send, advance, dropped, roster, setNow: (v: number) => (t = v) };
}

describe('yjsAwareness: rate, without losing the last update', () => {
	it('applies a change at once, holds a quicker one, and applies the LATEST on the trailing timer', () => {
		const r = rig();
		r.send(7, 1, { view: { panel: 'coach' } });
		expect(r.y.view.of('a').get('panel')).toBe('coach');
		r.advance(10);
		r.send(7, 2, { view: { panel: 'deck' } });
		r.advance(10);
		r.send(7, 3, { view: { panel: 'setup' } });
		expect(r.y.view.of('a').get('panel')).toBe('coach'); // held
		r.advance(RATE_MIN_MS);
		expect(r.y.view.of('a').get('panel')).toBe('setup'); // the last one, not the first held
	});

	it('never holds a caret-only change, so a fast typist is never frozen', () => {
		const r = rig();
		r.send(7, 1, { slide: 1, cursor: { anchor: 1, head: 1 } });
		for (let i = 2; i < 30; i++) {
			r.advance(5);
			r.send(7, i, { slide: 1, cursor: { anchor: i, head: i } });
		}
		expect((r.aw.getStates().get(7) as { cursor: { head: number } }).cursor.head).toBe(29);
	});

	it('never holds a removal', () => {
		const r = rig();
		r.send(7, 1, { slide: 1 });
		r.advance(5);
		r.send(7, 2, { slide: 2 });
		r.advance(5);
		r.y.stream.applyRemote(raw([[7, 3, 'null']]), 'a');
		expect(r.aw.getStates().has(7)).toBe(false);
	});
});

describe('yjsAwareness: the clock', () => {
	it('refuses a clock that jumps past the bound, so one forged update cannot out-rank the owner', () => {
		const r = rig();
		r.send(7, 5, { slide: 1 });
		r.advance(RATE_MIN_MS);
		r.send(7, 5 + MAX_CLOCK_JUMP + 1, { slide: 99 });
		r.advance(RATE_MIN_MS);
		r.send(7, 6, { slide: 2 });
		expect((r.aw.getStates().get(7) as { slide: number }).slide).toBe(2);
	});

	it('a client id that changes owner starts from nothing; a forged high clock under the old owner does not mute the new one', () => {
		const r = rig();
		// The old owner's record sits at a high clock (within the jump bound, repeatedly).
		let c = 1;
		for (let i = 0; i < 4; i++) {
			c += MAX_CLOCK_JUMP;
			r.send(7, c, { slide: 1 + i });
			r.advance(RATE_MIN_MS);
		}
		expect(r.aw.meta.get(7)?.clock).toBeGreaterThan(300_000);
		// The client id is now bound to someone else (the roster changed hands).
		r.roster.set('b', { id: 'b', name: 'Bo', role: 'edit', color: 3, client: 7 });
		r.roster.delete('a');
		r.send(7, 1, { slide: 5 }, 'b');
		expect((r.aw.getStates().get(7) as { slide: number; peer: string }).slide).toBe(5);
		expect((r.aw.getStates().get(7) as { peer: string }).peer).toBe('b');
	});

	it('forgetting a peer clears the clock record, so a returning member is heard', () => {
		const r = rig();
		r.send(7, 90_000, { slide: 1 });
		r.y.stream.forget?.('a');
		expect(r.aw.meta.has(7)).toBe(false);
		r.advance(RATE_MIN_MS);
		r.send(7, 2, { slide: 3 });
		expect((r.aw.getStates().get(7) as { slide: number }).slide).toBe(3);
	});
});

describe('yjsAwareness: sending a view', () => {
	it('checks the declared schema, coalesces to a few writes a second, and writes the field', () => {
		const r = rig();
		expect(r.y.view.set('panel', 'chat')).toBe(false); // not in the list
		expect(r.y.view.set('unknown', 1)).toBe(false); // not declared
		expect(r.y.view.set('panel', 'coach')).toBe(true);
		expect((r.aw.getLocalState() as { view: unknown }).view).toEqual({ panel: 'coach' });
		const writes: unknown[] = [];
		r.aw.on('update', () => writes.push(JSON.stringify(r.aw.getLocalState())));
		r.advance(10);
		r.y.view.set('panel', 'deck');
		r.advance(10);
		r.y.view.set('panel', 'setup');
		expect(writes.length).toBe(0); // held inside the send window
		r.advance(SEND_MIN_MS);
		expect(writes.length).toBe(1);
		expect((r.aw.getLocalState() as { view: { panel: string } }).view.panel).toBe('setup');
	});

	it('asks whether a key may leave at FLUSH time, so a queued write cannot put a withheld field back', () => {
		let allowed = true;
		const r = rig({ allow: () => allowed });
		r.y.view.set('panel', 'coach');
		r.advance(10);
		r.y.view.set('present', { idx: 4 });
		allowed = false; // the person turns sharing off after the write was queued
		r.advance(SEND_MIN_MS);
		expect((r.aw.getLocalState() as { view: unknown }).view).toEqual({});
	});

	it('reads what a peer shows, from what the gate left', () => {
		const r = rig();
		r.send(7, 1, { view: { panel: 'deck', present: { idx: 3 }, evil: 'x' } });
		expect(r.y.view.of('a').all()).toEqual({ panel: 'deck', present: { idx: 3 } });
		expect(r.y.view.of('nobody').all()).toEqual({});
		expect(r.y.view.of('a').get('constructor')).toBeUndefined();
	});

	it('its own encodeAll and onLocal are plain awareness bytes', () => {
		const r = rig();
		r.aw.setLocalState({ slide: 1 });
		expect(decode(r.y.stream.encodeAll())[0].client).toBe(r.aw.clientID);
		const seen: Uint8Array[] = [];
		const off = r.y.stream.onLocal((u) => seen.push(u));
		r.aw.setLocalStateField('slide', 2);
		off();
		expect(decode(seen[0])[0].state.slide).toBe(2);
		const peer = new Awareness(new Y.Doc());
		peer.setLocalState({ x: 1 });
		expect(encodeAwarenessUpdate(peer, [peer.clientID]).length).toBeGreaterThan(0);
	});
});
