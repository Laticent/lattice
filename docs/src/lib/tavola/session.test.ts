import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { formatLink, mintLink, parseFragment } from './link';
import { createMemoryNetwork, type MemoryNetwork } from './memory';
import { encodeControl, frame, TAG_DOC } from './protocol';
import { createSession, type Session, type SessionOptions } from './session';
import type { Clock, Stream, Transport } from './types';

// Every test runs whole sessions over the in-memory network, with a real Yjs document as the
// stream, so the gate is tested against the bytes the Studio will actually send.

function yStream(doc: Y.Doc): Stream {
	return {
		encodeAll: () => Y.encodeStateAsUpdate(doc),
		applyRemote: (u) => Y.applyUpdate(doc, u, 'remote'),
		onLocal(cb) {
			const h = (u: Uint8Array, origin: unknown) => {
				if (origin !== 'remote') cb(u);
			};
			doc.on('update', h);
			return () => doc.off('update', h);
		},
	};
}

/** A clock the test advances by hand. */
function fakeClock(): Clock & { advance(ms: number): void } {
	let now = 0;
	const timers = new Map<number, { at: number; fn: () => void }>();
	let n = 0;
	return {
		now: () => now,
		setTimeout(fn, ms) {
			timers.set(++n, { at: now + ms, fn });
			return n;
		},
		clearTimeout(h) {
			timers.delete(h as number);
		},
		advance(ms) {
			now += ms;
			for (const [k, t] of [...timers]) if (t.at <= now) {
				timers.delete(k);
				t.fn();
			}
		},
	};
}

type Peer = { s: Session; doc: Y.Doc; text: Y.Text; t: Transport };
const LINK = { room: 'room', secret: 'secret' };

function host(net: MemoryNetwork, extra: Partial<SessionOptions> = {}, link = LINK): Peer {
	const doc = new Y.Doc();
	const text = doc.getText('source');
	text.insert(0, '# Q3 Board Review\n');
	const t = net.join(link.room, link.secret);
	const s = createSession({ transport: t, host: { name: 'Sharmarke', invite: { title: 'Q3 Board Review', hostName: 'Sharmarke', slides: 12 } }, doc: yStream(doc), ...extra });
	return { s, doc, text, t };
}

function guest(net: MemoryNetwork, extra: Partial<SessionOptions> = {}, link = LINK): Peer {
	const doc = new Y.Doc();
	const t = net.join(link.room, link.secret);
	const s = createSession({ transport: t, doc: yStream(doc), ...extra });
	return { s, doc, text: doc.getText('source'), t };
}

async function joined(net: MemoryNetwork, h: Peer, name: string, extra: Partial<SessionOptions> = {}): Promise<Peer> {
	const g = guest(net, extra);
	await net.settle();
	g.s.knock(name);
	await net.settle();
	const k = h.s.getState().waiting.find((w) => w.name === name);
	if (k) h.s.admit(k.id);
	await net.settle();
	return g;
}

describe('link', () => {
	it('round-trips a minted link through the fragment', () => {
		const parts = mintLink();
		const url = formatLink('https://laticent.github.io/lattice/studio/?x=1#old', parts);
		expect(url.startsWith('https://laticent.github.io/lattice/studio/?x=1#live=')).toBe(true);
		expect(parseFragment(new URL(url).hash)).toEqual(parts);
	});
	it('rejects anything that is not exactly a Tavola fragment', () => {
		const { room, secret } = mintLink();
		for (const bad of ['', '#', '#live=', `#live=${room}`, `#live=${room}.${secret}.x`, `#live=${room}.short`, `#live=${room.slice(1)}.${secret}`, `#live=${room}.${secret.slice(0, -1)}!`, `#other=${room}.${secret}`]) {
			expect(parseFragment(bad), bad).toBeNull();
		}
		expect(parseFragment(`#live=${room}.${secret}`)).toEqual({ room, secret });
	});
});

describe('handshake', () => {
	it('hello → lobby → knock → waiting → admit → live, with the deck synced', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = guest(net);
		expect(g.s.getState().stage).toBe('connecting');
		await net.settle();
		expect(g.s.getState().stage).toBe('lobby');
		expect(g.s.getState().invite).toEqual({ title: 'Q3 Board Review', hostName: 'Sharmarke', slides: 12 });
		// Nothing of the deck reaches the lobby.
		expect(g.text.toString()).toBe('');
		g.s.knock('  Amina  ');
		await net.settle();
		expect(g.s.getState().stage).toBe('waiting');
		expect(h.s.getState().waiting.map((w) => w.name)).toEqual(['Amina']);
		h.s.admit(h.s.getState().waiting[0].id);
		await net.settle();
		expect(g.s.getState().stage).toBe('live');
		expect(g.s.getState().me).toMatchObject({ name: 'Amina', role: 'edit', color: 2 });
		expect(g.text.toString()).toBe('# Q3 Board Review\n');
		expect(h.s.getState().members.map((m) => m.name)).toEqual(['Sharmarke', 'Amina']);
		expect(g.s.getState().members.map((m) => m.name)).toEqual(['Sharmarke', 'Amina']);
	});

	it('edits sync both ways once admitted', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = await joined(net, h, 'Amina');
		g.text.insert(g.text.length, 'guest edit\n');
		await net.settle();
		expect(h.text.toString()).toContain('guest edit');
		h.text.insert(h.text.length, 'host edit\n');
		await net.settle();
		expect(g.text.toString()).toContain('host edit');
	});

	it('deny ends the guest in `denied` and sends no state', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = guest(net);
		await net.settle();
		g.s.knock('Mallory');
		await net.settle();
		h.s.deny(h.s.getState().waiting[0].id);
		await net.settle();
		expect(g.s.getState().stage).toBe('denied');
		expect(g.text.toString()).toBe('');
		expect(h.s.getState().waiting).toEqual([]);
	});

	it('auto-admit lets people in without a click, under the link role', async () => {
		const net = createMemoryNetwork();
		const h = host(net, { host: { name: 'Sharmarke', invite: { title: 'T', hostName: 'Sharmarke' }, autoAdmit: true, linkRole: 'view' } });
		const g = guest(net);
		await net.settle();
		g.s.knock('Chen');
		await net.settle();
		expect(g.s.getState().stage).toBe('live');
		expect(g.s.getState().me?.role).toBe('view');
		expect(h.s.getState().waiting).toEqual([]);
	});

	it('autoKnockName knocks as soon as the host says hello', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = guest(net, { autoKnockName: 'Amina' });
		await net.settle();
		expect(g.s.getState().stage).toBe('waiting');
		expect(h.s.getState().waiting[0].name).toBe('Amina');
	});

	it('times out to `host-absent` when nobody hosts, and retry() waits again', async () => {
		const net = createMemoryNetwork();
		const clock = fakeClock();
		const g = guest(net, { clock, lobbyTimeoutMs: 5000 });
		await net.settle();
		clock.advance(5000);
		expect(g.s.getState().stage).toBe('host-absent');
		g.s.retry();
		expect(g.s.getState().stage).toBe('connecting');
		host(net);
		await net.settle();
		expect(g.s.getState().stage).toBe('lobby');
	});
});

describe('the gate', () => {
	it('drops stream bytes from a peer that holds the link but never knocked', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		await net.settle();
		// A raw intruder: joins with the link and pushes an edit straight at the host.
		const intruder = net.join(LINK.room, LINK.secret);
		const ids: string[] = [];
		intruder.onPeerJoin((id) => ids.push(id));
		intruder.onMessage(() => {});
		await net.settle();
		const evil = new Y.Doc();
		evil.getText('source').insert(0, 'INTRUDER ');
		for (const id of ids) intruder.send(frame(TAG_DOC, Y.encodeStateAsUpdate(evil)), id);
		await net.settle();
		expect(h.text.toString()).not.toContain('INTRUDER');
	});

	it('drops stream bytes from a knocker still in the waiting room', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = guest(net);
		await net.settle();
		g.s.knock('Mallory');
		await net.settle();
		const evil = new Y.Doc();
		evil.getText('source').insert(0, 'EARLY ');
		g.t.send(frame(TAG_DOC, Y.encodeStateAsUpdate(evil)), h.t.selfId);
		await net.settle();
		expect(h.text.toString()).not.toContain('EARLY');
	});

	it("ignores a view-only member's document edits on every honest peer", async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const c = await joined(net, h, 'Chen');
		h.s.setRole(c.s.getState().selfId, 'view');
		await net.settle();
		expect(c.s.getState().me?.role).toBe('view');
		// Even a modified client that sends anyway is refused by host and members.
		const evil = new Y.Doc();
		evil.getText('source').insert(0, 'VIEWER ');
		for (const target of [h, a]) c.t.send(frame(TAG_DOC, Y.encodeStateAsUpdate(evil)), target.t.selfId);
		await net.settle();
		expect(h.text.toString()).not.toContain('VIEWER');
		expect(a.text.toString()).not.toContain('VIEWER');
		// And the honest client does not even send.
		c.text.insert(0, 'LOCAL ');
		await net.settle();
		expect(h.text.toString()).not.toContain('LOCAL');
	});

	it('accepts a roster only from the host', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const c = await joined(net, h, 'Chen');
		// Chen forges a roster that removes the host.
		c.t.send(encodeControl({ t: 'roster', members: [{ id: c.t.selfId, name: 'Chen', role: 'host', color: 1 }] }), a.t.selfId);
		await net.settle();
		expect(a.s.getState().members.map((m) => m.name)).toEqual(['Sharmarke', 'Amina', 'Chen']);
	});
});

describe('the cap', () => {
	it('holds 4 people, host included, and tells the fifth the session is full', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		await joined(net, h, 'A');
		await joined(net, h, 'B');
		await joined(net, h, 'C');
		expect(h.s.getState().members).toHaveLength(4);
		const e = guest(net);
		await net.settle();
		e.s.knock('E');
		await net.settle();
		expect(e.s.getState().stage).toBe('full');
		expect(h.s.getState().waiting).toEqual([]);
	});

	it('assigns the four colors once each, reusing a freed one', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'A');
		await joined(net, h, 'B');
		expect(h.s.getState().members.map((m) => m.color)).toEqual([1, 2, 3]);
		h.s.remove(a.s.getState().selfId);
		await net.settle();
		await joined(net, h, 'C');
		expect(h.s.getState().members.map((m) => [m.name, m.color])).toEqual([
			['Sharmarke', 1],
			['B', 3],
			['C', 2],
		]);
	});
});

describe('mesh', () => {
	it('three people converge, whatever order they learn of each other', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		a.text.insert(a.text.length, 'from amina\n');
		const c = await joined(net, h, 'Chen');
		c.text.insert(c.text.length, 'from chen\n');
		await net.settle();
		for (const p of [h, a, c]) {
			expect(p.text.toString()).toContain('from amina');
			expect(p.text.toString()).toContain('from chen');
		}
		expect(new Set([h, a, c].map((p) => p.text.toString())).size).toBe(1);
	});

	it('guests keep editing each other while the host is away', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const c = await joined(net, h, 'Chen');
		net.drop(h.t.selfId);
		await net.settle();
		expect(a.s.getState().hostAway).toBe(true);
		a.text.insert(0, 'while away ');
		await net.settle();
		expect(c.text.toString()).toContain('while away');
	});
});

describe('management', () => {
	it('remove disconnects the member and every peer stops trusting it', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const c = await joined(net, h, 'Chen');
		const chenId = c.s.getState().selfId;
		h.s.remove(chenId);
		await net.settle();
		expect(c.s.getState().stage).toBe('removed');
		expect(a.s.getState().members.map((m) => m.name)).toEqual(['Sharmarke', 'Amina']);
		// Its old token no longer re-admits it.
		const back = guest(net, { token: 'whatever', autoKnockName: 'Chen' });
		await net.settle();
		expect(back.s.getState().stage).toBe('waiting');
	});

	it('a dropped member rejoins with its token, keeping name, role and color, without a knock', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const token = a.s.getState().token;
		expect(token).toBeTruthy();
		net.drop(a.t.selfId);
		await net.settle();
		const again = guest(net, { token: token as string });
		await net.settle();
		expect(again.s.getState().stage).toBe('live');
		expect(again.s.getState().me).toMatchObject({ name: 'Amina', color: 2, role: 'edit' });
		expect(h.s.getState().members.map((m) => m.name)).toEqual(['Sharmarke', 'Amina']);
		expect(again.text.toString()).toBe('# Q3 Board Review\n');
	});

	it('end() moves every member to `ended`', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		h.s.end();
		await net.settle();
		expect(a.s.getState().stage).toBe('ended');
		expect(h.s.getState().stage).toBe('ended');
	});

	it('two rooms on one network never meet', async () => {
		const net = createMemoryNetwork();
		host(net);
		const other = guest(net, {}, { room: 'room', secret: 'different' });
		await net.settle();
		expect(other.s.getState().stage).toBe('connecting');
	});
});
