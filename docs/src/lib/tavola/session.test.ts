import { beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createHostKey, type HostKey, signHello } from './hostkey';
import { formatLink, mintLink, parseFragment, toBase64Url } from './link';
import { createMemoryNetwork, type MemoryNetwork } from './memory';
import { cleanName, encodeControl, frame, PROTOCOL_VERSION, TAG_AWARENESS, TAG_DOC, TAG_POST } from './protocol';
import { createSession, MAX_WAITING, type Session, type SessionOptions } from './session';
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
function fakeClock(start = 0): Clock & { advance(ms: number): void } {
	let now = start;
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
/** Every session a test made, so `settle` can wait for their async work (signing, verifying). */
const made: Session[] = [];
const track = (s: Session) => {
	made.push(s);
	return s;
};
/** Deliver everything and let every session finish its async work, until nothing moves. */
async function settle(net: MemoryNetwork) {
	for (let i = 0; i < 100; i++) {
		await net.settle();
		await Promise.all(made.map((s) => s.idle()));
		if (net.pending() === 0) {
			await new Promise((r) => setTimeout(r, 0));
			await Promise.all(made.map((s) => s.idle()));
			if (net.pending() === 0) return;
		}
	}
}
const LINK = { room: 'room', secret: 'secret' };
let KEY: HostKey;
let OTHER: HostKey;
beforeAll(async () => {
	KEY = await createHostKey();
	OTHER = await createHostKey();
});

function host(net: MemoryNetwork, extra: Partial<SessionOptions> = {}, link = LINK): Peer {
	const doc = new Y.Doc();
	const text = doc.getText('source');
	text.insert(0, '# Q3 Board Review\n');
	const t = net.join(link.room, link.secret);
	const s = track(createSession({ transport: t, doc: yStream(doc), ...extra, host: { name: 'Sharmarke', invite: { title: 'Q3 Board Review', hostName: 'Sharmarke', slides: 12 }, key: KEY, ...extra.host } }));
	return { s, doc, text, t };
}

function guest(net: MemoryNetwork, extra: Partial<SessionOptions> = {}, link = LINK): Peer {
	const doc = new Y.Doc();
	const t = net.join(link.room, link.secret);
	const s = track(createSession({ transport: t, doc: yStream(doc), hostFingerprint: KEY.fingerprint, ...extra }));
	return { s, doc, text: doc.getText('source'), t };
}

async function joined(net: MemoryNetwork, h: Peer, name: string, extra: Partial<SessionOptions> = {}): Promise<Peer> {
	const g = guest(net, extra);
	await settle(net);
	g.s.knock(name);
	await settle(net);
	const k = h.s.getState().waiting.find((w) => w.name === name);
	if (k) h.s.admit(k.id);
	await settle(net);
	return g;
}

describe('link', () => {
	it('round-trips a minted link through the fragment', () => {
		const parts = mintLink(KEY.fingerprint);
		const url = formatLink('https://laticent.github.io/lattice/studio/?x=1#old', parts);
		expect(url.startsWith('https://laticent.github.io/lattice/studio/?x=1#live=')).toBe(true);
		expect(parseFragment(new URL(url).hash)).toEqual(parts);
	});
	it('rejects anything that is not exactly a Tavola fragment', () => {
		const { room, secret, host } = mintLink(KEY.fingerprint);
		for (const bad of ['', '#', '#live=', `#live=${room}`, `#live=${room}.${secret}`, `#live=${room}.${secret}.${host}.x`, `#live=${room}.short.${host}`, `#live=${room.slice(1)}.${secret}.${host}`, `#live=${room}.${secret}.${host.slice(1)}`, `#live=${room}.${secret.slice(0, -1)}!.${host}`, `#other=${room}.${secret}.${host}`]) {
			expect(parseFragment(bad), bad).toBeNull();
		}
		expect(parseFragment(`#live=${room}.${secret}.${host}`)).toEqual({ room, secret, host });
	});
});

describe('handshake', () => {
	it('hello → lobby → knock → waiting → admit → live, with the deck synced', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = guest(net);
		expect(g.s.getState().stage).toBe('connecting');
		await settle(net);
		expect(g.s.getState().stage).toBe('lobby');
		expect(g.s.getState().invite).toEqual({ title: 'Q3 Board Review', hostName: 'Sharmarke', slides: 12 });
		// Nothing of the deck reaches the lobby.
		expect(g.text.toString()).toBe('');
		g.s.knock('  Amina  ');
		await settle(net);
		expect(g.s.getState().stage).toBe('waiting');
		expect(h.s.getState().waiting.map((w) => w.name)).toEqual(['Amina']);
		h.s.admit(h.s.getState().waiting[0].id);
		await settle(net);
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
		await settle(net);
		expect(h.text.toString()).toContain('guest edit');
		h.text.insert(h.text.length, 'host edit\n');
		await settle(net);
		expect(g.text.toString()).toContain('host edit');
	});

	it('deny ends the guest in `denied` and sends no state', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = guest(net);
		await settle(net);
		g.s.knock('Mallory');
		await settle(net);
		h.s.deny(h.s.getState().waiting[0].id);
		await settle(net);
		expect(g.s.getState().stage).toBe('denied');
		expect(g.text.toString()).toBe('');
		expect(h.s.getState().waiting).toEqual([]);
	});

	it('auto-admit lets people in without a click, under the link role', async () => {
		const net = createMemoryNetwork();
		const h = host(net, { host: { name: 'Sharmarke', invite: { title: 'T', hostName: 'Sharmarke' }, key: KEY, autoAdmit: true, linkRole: 'view' } });
		const g = guest(net);
		await settle(net);
		g.s.knock('Chen');
		await settle(net);
		expect(g.s.getState().stage).toBe('live');
		expect(g.s.getState().me?.role).toBe('view');
		expect(h.s.getState().waiting).toEqual([]);
	});

	it('autoKnockName knocks as soon as the host says hello', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = guest(net, { autoKnockName: 'Amina' });
		await settle(net);
		expect(g.s.getState().stage).toBe('waiting');
		expect(h.s.getState().waiting[0].name).toBe('Amina');
	});

	it('times out to `host-absent` when nobody hosts, and retry() waits again', async () => {
		const net = createMemoryNetwork();
		const clock = fakeClock();
		const g = guest(net, { clock, lobbyTimeoutMs: 5000 });
		await settle(net);
		clock.advance(5000);
		expect(g.s.getState().stage).toBe('host-absent');
		g.s.retry();
		expect(g.s.getState().stage).toBe('connecting');
		host(net);
		await settle(net);
		expect(g.s.getState().stage).toBe('lobby');
	});
});

describe('the gate', () => {
	it('drops stream bytes from a peer that holds the link but never knocked', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		await settle(net);
		// A raw intruder: joins with the link and pushes an edit straight at the host.
		const intruder = net.join(LINK.room, LINK.secret);
		const ids: string[] = [];
		intruder.onPeerJoin((id) => ids.push(id));
		intruder.onMessage(() => {});
		await settle(net);
		const evil = new Y.Doc();
		evil.getText('source').insert(0, 'INTRUDER ');
		for (const id of ids) intruder.send(frame(TAG_DOC, Y.encodeStateAsUpdate(evil)), id);
		await settle(net);
		expect(h.text.toString()).not.toContain('INTRUDER');
	});

	it('drops stream bytes from a knocker still in the waiting room', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = guest(net);
		await settle(net);
		g.s.knock('Mallory');
		await settle(net);
		const evil = new Y.Doc();
		evil.getText('source').insert(0, 'EARLY ');
		g.t.send(frame(TAG_DOC, Y.encodeStateAsUpdate(evil)), h.t.selfId);
		await settle(net);
		expect(h.text.toString()).not.toContain('EARLY');
	});

	it("ignores a view-only member's document edits on every honest peer", async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const c = await joined(net, h, 'Chen');
		h.s.setRole(c.s.getState().selfId, 'view');
		await settle(net);
		expect(c.s.getState().me?.role).toBe('view');
		// Even a modified client that sends anyway is refused by host and members.
		const evil = new Y.Doc();
		evil.getText('source').insert(0, 'VIEWER ');
		for (const target of [h, a]) c.t.send(frame(TAG_DOC, Y.encodeStateAsUpdate(evil)), target.t.selfId);
		await settle(net);
		expect(h.text.toString()).not.toContain('VIEWER');
		expect(a.text.toString()).not.toContain('VIEWER');
		// And the honest client does not even send.
		c.text.insert(0, 'LOCAL ');
		await settle(net);
		expect(h.text.toString()).not.toContain('LOCAL');
	});

	it('accepts a roster only from the host', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const c = await joined(net, h, 'Chen');
		// Chen forges a roster that removes the host.
		c.t.send(encodeControl({ t: 'roster', members: [{ id: c.t.selfId, name: 'Chen', role: 'host', color: 1 }] }), a.t.selfId);
		await settle(net);
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
		await settle(net);
		e.s.knock('E');
		await settle(net);
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
		await settle(net);
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
		await settle(net);
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
		await settle(net);
		expect(a.s.getState().hostAway).toBe(true);
		a.text.insert(0, 'while away ');
		await settle(net);
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
		await settle(net);
		expect(c.s.getState().stage).toBe('removed');
		expect(a.s.getState().members.map((m) => m.name)).toEqual(['Sharmarke', 'Amina']);
		// Its old token no longer re-admits it.
		const back = guest(net, { token: 'whatever', autoKnockName: 'Chen' });
		await settle(net);
		expect(back.s.getState().stage).toBe('waiting');
	});

	it('a dropped member rejoins with its token, keeping name, role and color, without a knock', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const token = a.s.getState().token;
		expect(token).toBeTruthy();
		net.drop(a.t.selfId);
		await settle(net);
		const again = guest(net, { token: token as string });
		await settle(net);
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
		await settle(net);
		expect(a.s.getState().stage).toBe('ended');
		expect(h.s.getState().stage).toBe('ended');
	});

	it('two rooms on one network never meet', async () => {
		const net = createMemoryNetwork();
		host(net);
		const other = guest(net, {}, { room: 'room', secret: 'different' });
		await settle(net);
		expect(other.s.getState().stage).toBe('connecting');
	});
});

describe('links that come and go (checker findings, 2026-10-06)', () => {
	it('a member link that forms late still syncs both ways', async () => {
		const net = createMemoryNetwork();
		const h = host(net, { host: { name: 'H', invite: { title: 'T', hostName: 'H' }, key: KEY, autoAdmit: true } });
		const a = guest(net, { autoKnockName: 'A' });
		await settle(net);
		// B arrives with its link to A cut, so the roster sync between them is lost.
		const b = guest(net, { autoKnockName: 'B' });
		net.cut(a.t.selfId, b.t.selfId);
		await settle(net);
		a.text.insert(0, 'A1 ');
		await settle(net);
		net.heal(a.t.selfId, b.t.selfId);
		await settle(net);
		a.text.insert(0, 'A2 ');
		await settle(net);
		expect(b.text.toString()).toBe(h.text.toString());
		expect(b.text.toString()).toContain('A2 A1');
	});

	it('a blip that keeps the same ids re-admits the guest instead of splitting the session', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = await joined(net, h, 'Amina');
		net.cut(h.t.selfId, g.t.selfId);
		await settle(net);
		net.heal(h.t.selfId, g.t.selfId);
		await settle(net);
		expect(h.s.getState().members.map((m) => m.name)).toEqual(['Sharmarke', 'Amina']);
		expect(g.s.getState().stage).toBe('live');
		g.text.insert(0, 'after ');
		h.text.insert(h.text.length, ' host');
		await settle(net);
		expect(g.text.toString()).toBe(h.text.toString());
	});

	it('a rejoin token never breaks the cap or doubles a color', async () => {
		const net = createMemoryNetwork();
		const h = host(net, { cap: 2 });
		const a = await joined(net, h, 'A');
		const token = a.s.getState().token as string;
		net.drop(a.t.selfId);
		await settle(net);
		await joined(net, h, 'B');
		const back = guest(net, { token });
		await settle(net);
		expect(back.s.getState().stage).toBe('full');
		expect(h.s.getState().members).toHaveLength(2);
		const colors = h.s.getState().members.map((m) => m.color);
		expect(new Set(colors).size).toBe(colors.length);
	});

	it('a guest waiting at the door learns the host left', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = guest(net);
		await settle(net);
		g.s.knock('Amina');
		await settle(net);
		net.drop(h.t.selfId);
		await settle(net);
		expect(g.s.getState().stage).toBe('host-absent');
	});

	it('an ending host lets nobody in', async () => {
		const net = createMemoryNetwork();
		const h = host(net, { host: { name: 'H', invite: { title: 'T', hostName: 'H' }, key: KEY, autoAdmit: true } });
		const g = guest(net);
		await settle(net);
		h.s.end();
		g.s.knock('Late');
		await settle(net);
		expect(g.s.getState().stage).not.toBe('live');
		expect(h.s.getState().members).toHaveLength(1);
	});
});

describe('host reload', () => {
	it('a host that reloads with its tokens re-admits members without a knock', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const tokens = h.s.exportTokens();
		net.drop(h.t.selfId);
		await settle(net);
		expect(a.s.getState().hostAway).toBe(true);
		// The reloaded host: a new peer id, the same room, its tokens and its document state.
		const doc = new Y.Doc();
		Y.applyUpdate(doc, Y.encodeStateAsUpdate(h.doc));
		const t = net.join(LINK.room, LINK.secret);
		const h2 = track(createSession({ transport: t, host: { name: 'Sharmarke', invite: { title: 'T', hostName: 'Sharmarke' }, key: KEY, tokens }, doc: yStream(doc) }));
		await settle(net);
		expect(h2.getState().members.map((m) => m.name)).toEqual(['Sharmarke', 'Amina']);
		expect(a.s.getState()).toMatchObject({ stage: 'live', hostAway: false });
		// Same document lineage, so nothing doubles.
		expect(doc.getText('source').toString()).toBe('# Q3 Board Review\n');
		expect(a.text.toString()).toBe('# Q3 Board Review\n');
	});
});

describe('the host is whoever holds the key (red-team, 2026-10-06)', () => {
	/** A link holder posing as host: a session signed with a DIFFERENT key, same room and secret. */
	const impostor = (net: MemoryNetwork) => {
		const doc = new Y.Doc();
		doc.getText('source').insert(0, 'PWNED');
		const t = net.join(LINK.room, LINK.secret);
		const s = track(createSession({ transport: t, host: { name: 'Sharmarke', invite: { title: 'Q3 Board Review', hostName: 'Sharmarke' }, key: OTHER, autoAdmit: true }, doc: yStream(doc) }));
		return { s, doc, t };
	};

	it('a fake host in the lobby is never believed', async () => {
		const net = createMemoryNetwork();
		impostor(net);
		const g = guest(net, { autoKnockName: 'Amina' });
		await settle(net);
		expect(g.s.getState().stage).toBe('connecting');
		const h = host(net);
		await settle(net);
		expect(g.s.getState().stage).toBe('waiting');
		expect(h.s.getState().waiting.map((w) => w.name)).toEqual(['Amina']);
	});

	it('a fake host cannot take over while the real host is away, and never sees the token', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = await joined(net, h, 'Amina');
		net.drop(h.t.selfId);
		await settle(net);
		expect(g.s.getState().hostAway).toBe(true);
		const fake = impostor(net);
		const seen: string[] = [];
		fake.t.onMessage((d) => seen.push(new TextDecoder().decode(d.subarray(1))));
		await settle(net);
		expect(g.s.getState().hostAway).toBe(true);
		expect(g.text.toString()).not.toContain('PWNED');
		expect(seen.some((m) => m.includes('token'))).toBe(false);
	});

	it('a hello signed for someone else is refused (no replay across recipients)', async () => {
		const net = createMemoryNetwork();
		const g = guest(net, { autoKnockName: 'Amina' });
		const raw = net.join(LINK.room, LINK.secret);
		raw.onMessage(() => {});
		raw.onPeerJoin(() => {});
		await settle(net);
		const sig = await signHello(KEY, raw.selfId, 'somebody-else');
		raw.send(encodeControl({ t: 'hello', v: 1, invite: { title: 'T', hostName: 'H' }, key: toBase64Url(KEY.publicRaw), sig }), g.t.selfId);
		await settle(net);
		expect(g.s.getState().stage).toBe('connecting');
	});

	it('a copied token cannot evict a member who is still connected', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const thief = guest(net, { token: a.s.getState().token as string });
		await settle(net);
		expect(thief.s.getState().stage).toBe('denied');
		expect(h.s.getState().members.map((m) => m.id)).toContain(a.t.selfId);
		a.text.insert(0, 'still here ');
		await settle(net);
		expect(h.text.toString()).toContain('still here');
	});

	it('a denied peer cannot knock its way back into the waiting room', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = guest(net);
		await settle(net);
		g.s.knock('Mallory');
		await settle(net);
		h.s.deny(h.s.getState().waiting[0].id);
		await settle(net);
		for (let i = 0; i < 5; i++) g.t.send(encodeControl({ t: 'knock', name: 'Mallory' }), h.t.selfId);
		await settle(net);
		expect(h.s.getState().waiting).toEqual([]);
	});

	it('a promoted viewer resyncs, so its later edits are not stranded', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const v = await joined(net, h, 'Chen');
		h.s.setRole(v.t.selfId, 'view');
		await settle(net);
		// While view-only, Chen's local changes go nowhere (here: a stray local edit).
		v.text.insert(0, 'while viewing ');
		await settle(net);
		h.s.setRole(v.t.selfId, 'edit');
		await settle(net);
		v.text.insert(0, 'after promotion ');
		await settle(net);
		expect(h.text.toString()).toContain('after promotion');
		expect(h.text.toString()).toBe(v.text.toString());
	});

	it('malformed or oversized stream bytes from a member are dropped without breaking the session', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		a.t.send(frame(TAG_DOC, new Uint8Array([1, 2, 3])), h.t.selfId);
		a.t.send(frame(TAG_DOC, new Uint8Array(4 * 1024 * 1024 + 1)), h.t.selfId);
		await settle(net);
		a.text.insert(0, 'fine ');
		await settle(net);
		expect(h.text.toString()).toContain('fine');
	});
});

describe('round 2 (red-team + checker, 2026-10-06)', () => {
	/** A raw transport that answers nothing: a link holder with its own code. */
	const raw = (net: MemoryNetwork, id?: string) => {
		const t = net.join(LINK.room, LINK.secret, id);
		const got: Uint8Array[] = [];
		t.onMessage((d) => got.push(d));
		t.onPeerJoin(() => {});
		t.onPeerLeave(() => {});
		return { t, got };
	};
	const text = (s: string) => new TextEncoder().encode(s);

	it("a link holder reconnecting under the host's old id is obeyed in nothing until a fresh signed hello", async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = await joined(net, h, 'Amina');
		const hostId = h.t.selfId;
		net.drop(hostId);
		await settle(net);
		const squat = raw(net, hostId);
		await settle(net);
		const evil = new Y.Doc();
		Y.applyUpdate(evil, Y.encodeStateAsUpdate(g.doc));
		evil.getText('source').insert(0, 'PWNED ');
		squat.t.send(frame(TAG_DOC, Y.encodeStateAsUpdate(evil)), g.t.selfId);
		squat.t.send(encodeControl({ t: 'roster', members: [{ id: hostId, name: 'Sharmarke', role: 'host', color: 1 }, { id: g.t.selfId, name: 'Amina', role: 'view', color: 2 }] }), g.t.selfId);
		squat.t.send(encodeControl({ t: 'sync' }), g.t.selfId);
		squat.t.send(encodeControl({ t: 'removed' }), g.t.selfId);
		await settle(net);
		const st = g.s.getState();
		expect(st.stage).toBe('live');
		expect(st.me?.role).toBe('edit');
		expect(g.text.toString()).not.toContain('PWNED');
		g.text.insert(0, 'typed while the host is away ');
		await settle(net);
		// The guest's deck never went to the squatter.
		expect(squat.got.some((d) => d[0] === TAG_DOC)).toBe(false);
	});

	it('a link holder reconnecting under a departed MEMBER id gets nothing from the others', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const b = await joined(net, h, 'Bo');
		const aId = a.t.selfId;
		net.drop(aId);
		await settle(net);
		expect(b.s.getState().members.some((m) => m.id === aId)).toBe(false);
		const squat = raw(net, aId);
		await settle(net);
		squat.t.send(encodeControl({ t: 'sync' }), b.t.selfId);
		await settle(net);
		b.text.insert(0, 'secret ');
		await settle(net);
		expect(squat.got.some((d) => d[0] === TAG_DOC)).toBe(false);
	});

	it('a member whose seat was taken while its link was down is told so, not left editing into nothing', async () => {
		const net = createMemoryNetwork();
		const h = host(net, { cap: 2 });
		const a = await joined(net, h, 'Amina');
		net.cut(h.t.selfId, a.t.selfId);
		await settle(net);
		await joined(net, h, 'Bo');
		net.heal(h.t.selfId, a.t.selfId);
		await settle(net);
		expect(a.s.getState().stage).toBe('full');
		expect(a.s.getState().members).toEqual([]);
	});

	it('a hello from another protocol version says so instead of timing out as a network problem', async () => {
		const net = createMemoryNetwork();
		const g = guest(net);
		const r = raw(net);
		await settle(net);
		r.t.send(encodeControl({ t: 'hello', v: PROTOCOL_VERSION + 1, invite: { title: '', hostName: '' }, key: '', sig: '' }), g.t.selfId);
		await settle(net);
		expect(g.s.getState().stage).toBe('outdated');
		// A real host of this version still takes the guest on.
		host(net);
		await settle(net);
		expect(g.s.getState().stage).toBe('lobby');
	});

	it(`the host holds at most ${MAX_WAITING} knocks at once`, async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		for (let i = 0; i < MAX_WAITING + 3; i++) guest(net, { autoKnockName: `G${i}` });
		await settle(net);
		expect(h.s.getState().waiting.length).toBe(MAX_WAITING);
	});

	it('names lose bidi overrides and zero-width characters', () => {
		expect(cleanName('Ann\u202Eeb\u200B')).toBe('Anneb');
		expect(cleanName('\u200B\u200F')).toBe('Guest');
	});

	it('the roster binds each member to the client id it knocked with, and refuses a taken one', async () => {
		const net = createMemoryNetwork();
		const h = host(net, { client: 111 });
		const a = await joined(net, h, 'Amina', { client: 222 });
		const m = await joined(net, h, 'Mallory', { client: 111 });
		const byName = Object.fromEntries(a.s.getState().members.map((x) => [x.name, x.client]));
		expect(byName).toEqual({ Sharmarke: 111, Amina: 222, Mallory: undefined });
		expect(m.s.getState().stage).toBe('live');
	});

	it('posts reach members only, with the transport sender, never from a stranger', async () => {
		const net = createMemoryNetwork();
		const posts: Array<[string, string]> = [];
		const h = host(net, { onPost: (d, from) => posts.push([new TextDecoder().decode(d), from]) });
		const a = await joined(net, h, 'Amina');
		const r = raw(net);
		await settle(net);
		a.s.post(text('hi'));
		r.t.send(frame(TAG_POST, text('spam')), h.t.selfId);
		await settle(net);
		expect(posts).toEqual([['hi', a.t.selfId]]);
		// ...and a stranger is never sent one.
		h.s.post(text('to all'));
		await settle(net);
		expect(r.got.some((d) => d[0] === TAG_POST)).toBe(false);
	});

	it('awareness bytes are gated like the document', async () => {
		const net = createMemoryNetwork();
		const seen: string[] = [];
		const hDoc = new Y.Doc();
		const t = net.join(LINK.room, LINK.secret);
		track(createSession({ transport: t, doc: yStream(hDoc), awareness: { encodeAll: () => new Uint8Array(), applyRemote: (_u, from) => seen.push(from), onLocal: () => () => {} }, host: { name: 'H', invite: { title: 'T', hostName: 'H' }, key: KEY } }));
		const r = raw(net);
		await settle(net);
		r.t.send(frame(TAG_AWARENESS, new Uint8Array([0])), t.selfId);
		await settle(net);
		expect(seen).toEqual([]);
	});

	it("after a host reload, the host's OLD id is nobody: a squatter on it gets nothing and is obeyed in nothing", async () => {
		const net = createMemoryNetwork();
		const h1 = host(net);
		const g = await joined(net, h1, 'Amina');
		const oldId = h1.t.selfId;
		net.drop(oldId);
		await settle(net);
		// The host reloads WITHOUT the guest's token (its save was older than the admission).
		const h2 = host(net);
		await settle(net);
		expect(g.s.getState().members.some((m) => m.id === oldId)).toBe(false);
		const squat = raw(net, oldId);
		await settle(net);
		const evil = new Y.Doc();
		Y.applyUpdate(evil, Y.encodeStateAsUpdate(g.doc));
		evil.getText('source').insert(0, 'PWNED ');
		squat.t.send(frame(TAG_DOC, Y.encodeStateAsUpdate(evil)), g.t.selfId);
		g.text.insert(0, 'secret ');
		await settle(net);
		expect(g.text.toString()).not.toContain('PWNED');
		expect(squat.got.some((d) => d[0] === TAG_DOC)).toBe(false);
		expect(h2.s.getState().waiting.map((w) => w.name)).toEqual(['Amina']);
	});

	it('a hello whose link dropped while it was being verified is not trusted', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const g = await joined(net, h, 'Amina');
		const hostId = h.t.selfId;
		net.drop(hostId);
		await settle(net);
		// The real host's link comes back and says hello, then drops before the guest has verified it…
		const back = raw(net, hostId);
		await net.settle();
		const sig = await signHello(KEY, hostId, g.t.selfId);
		// Sent and dropped in the same turn: the guest is still verifying when the leave lands.
		back.t.send(encodeControl({ t: 'hello', v: PROTOCOL_VERSION, invite: { title: 'T', hostName: 'H' }, key: toBase64Url(KEY.publicRaw), sig }), g.t.selfId);
		net.drop(hostId);
		await settle(net);
		// …and a squatter takes the id.
		const squat = raw(net, hostId);
		await settle(net);
		squat.t.send(encodeControl({ t: 'removed' }), g.t.selfId);
		await settle(net);
		expect(g.s.getState().stage).toBe('live');
		expect(g.s.getState().hostAway).toBe(true);
	});

	it('two guests whose own link blips converge again, vouched for by the host', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		const b = await joined(net, h, 'Bo');
		net.cut(a.t.selfId, b.t.selfId);
		await settle(net);
		net.heal(a.t.selfId, b.t.selfId);
		await settle(net);
		b.text.insert(0, 'from Bo ');
		await settle(net);
		expect(a.text.toString()).toBe(b.text.toString());
		expect(a.s.getState().members.map((m) => m.name).sort()).toEqual(['Amina', 'Bo', 'Sharmarke']);
	});

	it('a host that sees a member join again without a leave treats it as a fresh link', async () => {
		const net = createMemoryNetwork();
		const h = host(net);
		const a = await joined(net, h, 'Amina');
		// Trystero's "peer replaced": the guest saw the host's link go and come back, but the host
		// gets only a join for a member it still counts — so without handling it, nobody would ever
		// say hello again and the guest would stay "host away" for good.
		net.announce(a.t.selfId, h.t.selfId, 'leave');
		net.announce(a.t.selfId, h.t.selfId, 'join');
		net.announce(h.t.selfId, a.t.selfId, 'join');
		await settle(net);
		expect(a.s.getState().hostAway).toBe(false);
		expect(a.s.getState().stage).toBe('live');
		expect(h.s.getState().members.map((m) => m.name)).toEqual(['Sharmarke', 'Amina']);
		a.text.insert(0, 'still here ');
		await settle(net);
		expect(h.text.toString()).toContain('still here');
	});

	it('the session clock: a member whose own clock is 90 s off reads the host\'s time', async () => {
		const net = createMemoryNetwork();
		const hostClock = fakeClock(1_000_000);
		const guestClock = fakeClock(1_000_000 - 90_000);
		const h = host(net, { clock: hostClock });
		const g = await joined(net, h, 'Amina', { clock: guestClock });
		await settle(net);
		expect(g.s.getState().stage).toBe('live');
		expect(g.s.now()).toBe(h.s.now());
		// It keeps tracking as both clocks run.
		hostClock.advance(5000);
		guestClock.advance(5000);
		expect(g.s.now()).toBe(h.s.now());
	});
});
