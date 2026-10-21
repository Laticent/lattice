import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryNetwork, type MemoryNetwork } from '@/lib/tavola/memory';
import type { Transport } from '@/lib/tavola/types';
import { followBus } from './follow-bus';
import type { LiveDeps, LiveFinish, LiveHost, LiveTheme } from './live-store';
import { NO_RECORDS, takeLiveIntent } from './live-store';

// The Studio's controller over the in-memory network: the real controller, Tavola and Yjs, with
// only the Trystero transport swapped. These pin the second-round trio findings that live in the
// controller rather than in Tavola (checker round 2, findings 2, 4 and 5; red-team round 2, 2).

const net = vi.hoisted(() => ({ current: null as MemoryNetwork | null, joins: 0, leaves: [] as number[] }));
vi.mock('@/lib/tavola/adapters/trystero', () => ({
	trysteroTransport: (room: string, secret: string): Transport => {
		const t = (net.current as MemoryNetwork).join(room, secret);
		net.joins++;
		return { ...t, selfId: t.selfId, leave: () => {
			net.leaves.push(Date.now());
			return t.leave();
		} };
	},
}));

// A short handoff grace, so the succession test runs in real time (the default is 20 s).
vi.mock('@/lib/tavola', async (importOriginal) => {
	const real = await importOriginal<typeof import('@/lib/tavola')>();
	return { ...real, createSession: (o: Parameters<typeof real.createSession>[0]) => real.createSession({ handoffGraceMs: 300, hostPollMs: 100, ...o }) };
});

const { LiveController } = await import('./live-controller');
type Ctl = InstanceType<typeof LiveController>;

const deps = (deckId: string, over: Partial<LiveDeps> = {}): LiveDeps => ({ source: '# Q3 Board Review\n', deckId, deckTitle: 'Q3 Board Review', slideCount: 1, theme: 'indaco', mode: 'light', activeSlide: 0, records: NO_RECORDS, siteTheme: null, panel: null, view: 'compose', presenting: false, asking: false, comments: [], ...over });
const shell = () => {
	const notes: string[] = [];
	const host: LiveHost = { setSource: () => {}, goToSlide: () => {}, openSharedDeck: () => 'shared-deck', notify: (m) => notes.push(m), notifyAction: (m) => notes.push(m), rerender: () => {} };
	return { host, notes };
};
// biome-ignore lint/suspicious/noExplicitAny: tests reach the private runtime to wait on its session.
const sessionOf = (c: Ctl) => (c as any).rt?.session as { idle(): Promise<void> } | undefined;
async function settle(...ctls: Ctl[]) {
	for (let i = 0; i < 60; i++) {
		await net.current?.settle();
		await Promise.all(ctls.map((c) => sessionOf(c)?.idle()));
		await new Promise((r) => setTimeout(r, 5));
		if (net.current?.pending() === 0) return;
	}
}
const until = async (ok: () => boolean, ...ctls: Ctl[]) => {
	for (let i = 0; i < 100 && !ok(); i++) await settle(...ctls);
	expect(ok()).toBe(true);
};

async function hostSession(over: Partial<LiveDeps> = {}) {
	const sh = shell();
	// Each controller is its own browser tab: no chat-id prefixes inherited (jsdom shares storage).
	sessionStorage.removeItem('lattice-live-sids');
	sessionStorage.removeItem('lattice-live-share');
	const h = new LiveController(sh.host, deps('host-deck', over));
	h.actions.start('Sharmarke');
	await until(() => h.view().status === 'live', h);
	return { h, notes: sh.notes };
}
async function guestOf(h: Ctl, name: string, over: Partial<LiveDeps> = {}) {
	const sh = shell();
	// Each guest is its own browser: no rejoin token left by the one before (jsdom shares storage).
	localStorage.removeItem('lattice-live-links');
	sessionStorage.removeItem('lattice-live-sids');
	sessionStorage.removeItem('lattice-live-share');
	location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
	takeLiveIntent();
	const g = new LiveController(sh.host, deps(`${name}-deck`, over));
	await g.resume();
	await until(() => g.lobby()?.stage === 'ready', h, g);
	g.lobbyActions.setName(name);
	g.lobbyActions.knock();
	await until(() => h.view().waiting.length > 0, h, g);
	h.actions.admit(h.view().waiting[0].id);
	await until(() => g.view().status === 'live', h, g);
	return { g, notes: sh.notes };
}

beforeEach(() => {
	net.current = createMemoryNetwork();
	net.joins = 0;
	net.leaves = [];
	sessionStorage.clear();
	localStorage.clear();
	Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true });
});
afterEach(() => {
	followBus.reset();
	location.hash = '';
});

describe('LiveController (second-round trio)', () => {
	it('End reaches the guest: the transport leaves a beat later, and the host gets only its own toast', async () => {
		const { h, notes } = await hostSession();
		const { g, notes: gNotes } = await guestOf(h, 'Amina');
		const before = net.leaves.length;
		h.actions.end();
		expect(net.leaves.length).toBe(before);
		await settle(h, g);
		await new Promise((r) => setTimeout(r, 600));
		expect(net.leaves.length).toBeGreaterThan(before);
		expect(notes.filter((n) => n.includes('ended'))).toEqual(['Live session ended. The deck stays as it is.']);
		await until(() => g.view().status === 'idle', g);
		expect(gNotes).toContain('The host ended the session. Your copy of the deck stays.');
	});

	it('resume() called twice at once (StrictMode) opens one session, not two', async () => {
		const { h } = await hostSession();
		location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
		takeLiveIntent();
		const g = new LiveController(shell().host, deps('g'));
		const joins = net.joins;
		await Promise.all([g.resume(), g.resume()]);
		expect(net.joins).toBe(joins + 1);
		expect(location.hash).toBe('');
	});

	it('chat: a line is authored by the member it arrived from, and a newcomer gets the history', async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		a.actions.sendChat('hello from Amina');
		h.actions.sendChat('agenda first');
		await until(() => h.view().chat.some((l) => l.kind === 'message' && l.text === 'hello from Amina'), h, a);
		const line = h.view().chat.find((l) => l.kind === 'message' && l.text === 'hello from Amina');
		expect(line && line.kind === 'message' && line.from).toBe('Amina');
		const { g: b } = await guestOf(h, 'Bo');
		await until(() => b.view().chat.filter((l) => l.kind === 'message').length === 2, h, a, b);
		expect(new Set(b.view().chat.flatMap((l) => (l.kind === 'message' ? [`${l.from}: ${l.text}`] : [])))).toEqual(new Set(['Amina: hello from Amina', 'Sharmarke: agenda first']));
	});

	it('without IndexedDB the session still starts, says it cannot survive a reload, and is not reported as failed', async () => {
		const idb = globalThis.indexedDB;
		// @ts-expect-error — a browser with IndexedDB blocked.
		globalThis.indexedDB = undefined;
		try {
			const sh = shell();
			const h = new LiveController(sh.host, deps('host-deck'));
			h.actions.start('Sharmarke');
			await until(() => sh.notes.length > 0, h);
			expect(h.view().status).toBe('live');
			expect(sh.notes.some((n) => n.includes("Couldn't start"))).toBe(false);
			expect(sh.notes.some((n) => n.includes("can't keep the session across a reload"))).toBe(true);
		} finally {
			globalThis.indexedDB = idb;
		}
	});

	it('a cut-off link says so, instead of blaming the network', async () => {
		location.hash = '#live=AAAAAAAAAAAAAAAAAAAAAA.BBBB';
		takeLiveIntent();
		const g = new LiveController(shell().host, deps('g'));
		await g.resume();
		expect(g.lobby()?.stage).toBe('bad-link');
	});

	it('the invite link carries no query string from the host page', async () => {
		history.replaceState(null, '', '/studio/?utm=private&deck=x');
		const { h } = await hostSession();
		expect(h.view().link).toMatch(/^http:\/\/localhost(:\d+)?\/studio\/#live=/);
		history.replaceState(null, '', '/');
	});

	it('a duplicated tab does not resume as a second host of the same room', async () => {
		const held = new Set<string>();
		const locks = {
			request: (name: string, _o: unknown, cb: (l: unknown) => unknown) => {
				if (held.has(name)) return Promise.resolve(cb(null));
				held.add(name);
				return Promise.resolve(cb({ name })).finally(() => held.delete(name));
			},
		};
		Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
		try {
			const { h } = await hostSession();
			await until(() => !!sessionStorage.getItem('lattice-live-host'), h);
			// The duplicate: same sessionStorage (a duplicated tab copies it), same deck.
			const sh = shell();
			const dup = new LiveController(sh.host, deps('host-deck'));
			const joins = net.joins;
			await dup.resume();
			expect(net.joins).toBe(joins);
			expect(sh.notes).toContain('This live session is already open in another tab.');
			expect(h.view().status).toBe('live');
		} finally {
			// @ts-expect-error — remove the stub.
			delete navigator.locks;
		}
	});

	it('a good link pasted after a cut-off one in the same tab gets to the lobby', async () => {
		const { h } = await hostSession();
		location.hash = '#live=AAAAAAAAAAAAAAAAAAAAAA.BBBB';
		takeLiveIntent();
		const g = new LiveController(shell().host, deps('g'));
		await g.resume();
		expect(g.lobby()?.stage).toBe('bad-link');
		location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
		takeLiveIntent();
		await g.resume();
		await until(() => g.lobby()?.stage === 'ready', h, g);
	});

	it('a dropped link shows as reconnecting, and coming back is not news: no "left" / "joined" churn', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		// biome-ignore lint/suspicious/noExplicitAny: the test reaches the transports' ids.
		const id = (c: Ctl) => (c as any).rt.session.getState().selfId as string;
		net.current?.cut(id(h), id(g));
		await until(() => h.view().people.some((p) => p.name === 'Amina' && p.away), h, g);
		net.current?.heal(id(h), id(g));
		await until(() => h.view().people.some((p) => p.name === 'Amina' && !p.away), h, g);
		const system = h.view().chat.flatMap((l) => (l.kind === 'system' ? [l.text] : []));
		expect(system).toEqual(['Amina joined']);
	});

	it('Leave says goodbye, so the others show "left" at once', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		g.actions.leave();
		await until(() => h.view().chat.some((l) => l.kind === 'system' && l.text === 'Amina left'), h);
		expect(h.view().people.some((p) => p.away)).toBe(false);
	});

	it('typing in the chat shows on the other side, and clears when the line arrives', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		g.actions.chatTyping();
		await until(() => h.view().typing.includes('Amina'), h, g);
		g.actions.sendChat('done');
		await until(() => h.view().typing.length === 0 && h.view().chat.some((l) => l.kind === 'message' && l.text === 'done' && !l.mine), h, g);
		expect(g.view().chat.find((l) => l.kind === 'message' && l.text === 'done')).toMatchObject({ mine: true });
	});

	it('a member whose link was down gets exactly the lines it missed, by number', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Mark');
		h.actions.sendChat('before the drop');
		await until(() => g.view().chat.some((l) => l.kind === 'message' && l.text === 'before the drop'), h, g);
		// biome-ignore lint/suspicious/noExplicitAny: the test reaches the transports' ids.
		const id = (c: Ctl) => (c as any).rt.session.getState().selfId as string;
		net.current?.cut(id(h), id(g));
		await until(() => h.view().people.some((p) => p.name === 'Mark' && p.away), h, g);
		// Watch what the host posts from here on.
		const posts: Array<{ k: string; lines?: Array<{ text: string; seq: number }> }> = [];
		// biome-ignore lint/suspicious/noExplicitAny: the test spies on the private post channel.
		const hp = h as any;
		const orig = hp.post.bind(hp);
		hp.post = (p: { k: string }, to?: string) => {
			posts.push(p);
			orig(p, to);
		};
		h.actions.sendChat("what's up");
		h.actions.sendChat('what');
		net.current?.heal(id(h), id(g));
		await until(() => g.view().chat.some((l) => l.kind === 'message' && l.text === 'what'), h, g);
		const texts = (c: Ctl) => c.view().chat.flatMap((l) => (l.kind === 'message' ? [l.text] : []));
		expect(texts(g)).toEqual(['before the drop', "what's up", 'what']);
		// Only the two missed lines went back, not the whole chat.
		expect(posts.filter((p) => p.k === 'lines').flatMap((p) => p.lines?.map((l) => l.text) ?? [])).toEqual(["what's up", 'what']);
	});

	it('everyone sees the chat in the same order, numbered by the host', async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		const { g: b } = await guestOf(h, 'Bo');
		a.actions.sendChat('a1');
		b.actions.sendChat('b1');
		h.actions.sendChat('h1');
		a.actions.sendChat('a2');
		const texts = (c: Ctl) => c.view().chat.flatMap((l) => (l.kind === 'message' && !l.pending ? [l.text] : []));
		await until(() => [h, a, b].every((c) => texts(c).length === 4), h, a, b);
		expect(texts(a)).toEqual(texts(h));
		expect(texts(b)).toEqual(texts(h));
	});

	it('a line sent while the host is away waits as "Sending…" and goes out when the host is back', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		// biome-ignore lint/suspicious/noExplicitAny: the test reaches the transports' ids.
		const id = (c: Ctl) => (c as any).rt.session.getState().selfId as string;
		net.current?.cut(id(h), id(g));
		await until(() => g.view().hostAway, h, g);
		g.actions.sendChat('while you were out');
		expect(g.view().chat.find((l) => l.kind === 'message' && l.text === 'while you were out')).toMatchObject({ pending: true });
		net.current?.heal(id(h), id(g));
		await until(() => h.view().chat.some((l) => l.kind === 'message' && l.text === 'while you were out'), h, g);
		await until(() => g.view().chat.some((l) => l.kind === 'message' && l.text === 'while you were out' && !l.pending), h, g);
		// Sent once, not twice.
		expect(h.view().chat.filter((l) => l.kind === 'message' && l.text === 'while you were out')).toHaveLength(1);
	});

	it("a guest's session timer counts from the host's start, not from when it joined", async () => {
		const { h } = await hostSession();
		await new Promise((res) => setTimeout(res, 300));
		const { g } = await guestOf(h, 'Amina');
		await until(() => g.view().startedAt === h.view().startedAt, h, g);
	});


	it('a line resent after a blip is kept once (the host drops a repeat by its id)', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		// biome-ignore lint/suspicious/noExplicitAny: the test drives the private post channel.
		const gp = g as any;
		const hostId = gp.hostId() as string;
		gp.post({ k: 'say', id: 'x:1', text: 'once' }, hostId);
		gp.post({ k: 'say', id: 'x:1', text: 'once' }, hostId);
		await until(() => h.view().chat.some((l) => l.kind === 'message' && l.text === 'once'), h, g);
		await settle(h, g);
		expect(h.view().chat.filter((l) => l.kind === 'message' && l.text === 'once')).toHaveLength(1);
	});

	it('a host that came back from a save a second old never hands a number out twice', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		h.actions.sendChat('one');
		g.actions.sendChat('two');
		const texts = (c: Ctl) => c.view().chat.flatMap((l) => (l.kind === 'message' && !l.pending ? [l.text] : []));
		await until(() => texts(g).length === 2 && texts(h).length === 2, h, g);
		// The host's restored state: the save missed line 2.
		// biome-ignore lint/suspicious/noExplicitAny: the test sets the host's private chat state.
		const hp = h as any;
		hp.chat = hp.chat.filter((l: { seq: number }) => l.seq === 1);
		hp.seq = 1;
		// The host's re-admission note (`tip`) carries its stale number; the guest, being AHEAD, must
		// answer with what it holds — the real path, not a direct call.
		hp.post({ k: 'tip', seq: hp.seq, startedAt: Date.now() }, hp.rt.session.getState().members.find((m: { name: string }) => m.name === 'Amina').id);
		await settle(h, g);
		// The HOST speaks first after its reload — no `have` from a guest's line to lean on.
		h.actions.sendChat('three');
		await until(() => texts(g).includes('three'), h, g);
		expect(texts(g)).toEqual(['one', 'two', 'three']);
		expect(g.view().chat.some((l) => l.kind === 'message' && l.pending)).toBe(false);
		// Numbered 3, not 2 again: the host took the guest's higher number as its floor.
		expect(g.view().chat.find((l) => l.kind === 'message' && l.text === 'three')?.id).toBe('c3');
	});

	it("nobody can claim another member's next line id and swallow it", async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		const { g: b } = await guestOf(h, 'Bo');
		// Amina speaks first; her line's id (which every member receives) shows her prefix.
		a.actions.sendChat('a1');
		await until(() => b.view().chat.some((l) => l.kind === 'message' && l.text === 'a1'), h, a, b);
		// biome-ignore lint/suspicious/noExplicitAny: read the prefix off the echoed line, as Bo could.
		const sid = ((b as any).chat.find((l: { text: string }) => l.text === 'a1').id as string).split(':')[0];
		// biome-ignore lint/suspicious/noExplicitAny: Bo posts under Amina's next id.
		const bp = b as any;
		for (let n = 2; n <= 6; n++) bp.post({ k: 'say', id: `${sid}:${n}`, text: `squat${n}` }, bp.hostId());
		await settle(h, a, b);
		a.actions.sendChat('real line');
		await until(() => h.view().chat.some((l) => l.kind === 'message' && l.text === 'real line'), h, a, b);
		await until(() => !a.view().chat.some((l) => l.kind === 'message' && l.pending), h, a, b);
	});

	it('made view-only with a line waiting: the line is dropped with a note, not stuck on "Sending…"', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		// A line the host has not taken yet (as if sent while it was away).
		// biome-ignore lint/suspicious/noExplicitAny: seed the guest's waiting line directly.
		(g as any).pending = [{ id: 'w:1', text: 'waiting', at: Date.now() }];
		const amina = h.view().people.find((p) => p.name === 'Amina');
		if (amina) h.actions.setRole(amina.id, 'view');
		await until(() => g.view().chat.some((l) => l.kind === 'system' && l.text.includes('unsent messages were not sent')), h, g);
		expect(g.view().chat.some((l) => l.kind === 'message' && l.pending)).toBe(false);
	});


	it('a line resent after a reload (new connection, same line id) is not posted twice, and its "Sending…" clears', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		g.actions.sendChat('sent just before the reload');
		await until(() => h.view().chat.some((l) => l.kind === 'message' && l.text === 'sent just before the reload'), h, g);
		// biome-ignore lint/suspicious/noExplicitAny: the host's numbered line, as a reloaded tab would hold it in its sealed queue.
		const taken = (h as any).chat.find((l: { text: string }) => l.text === 'sent just before the reload');
		// The reloaded tab: the old page goes, then a NEW controller (new connection id) that keeps the
		// rejoin token (localStorage) and still holds that line in its waiting queue.
		const link = (h.view().link ?? '').split('#live=')[1];
		g.dispose();
		await until(() => !h.view().people.some((p) => p.name === 'Amina' && !p.away), h);
		location.hash = `#live=${link}`;
		takeLiveIntent();
		const again = new LiveController(shell().host, deps('Amina-deck'));
		await again.resume();
		await until(() => again.view().status === 'live', h, again);
		// biome-ignore lint/suspicious/noExplicitAny: seed the restored queue and resend it.
		const ap = again as any;
		ap.pending = [{ id: taken.id, text: taken.text, at: Date.now() }];
		ap.catchUp();
		await until(() => !again.view().chat.some((l) => l.kind === 'message' && l.pending), h, again);
		expect(h.view().chat.filter((l) => l.kind === 'message' && l.text === 'sent just before the reload')).toHaveLength(1);
	});

	it('removing someone reads "was removed" at once, for the host and the others, not "Reconnecting…"', async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		const { g: b } = await guestOf(h, 'Bo');
		const amina = h.view().people.find((p) => p.name === 'Amina');
		if (amina) h.actions.remove(amina.id);
		const removedNote = (c: Ctl) => c.view().chat.some((l) => l.kind === 'system' && l.text === 'Amina was removed');
		await until(() => removedNote(h) && removedNote(b), h, a, b);
		expect(h.view().people.some((p) => p.away)).toBe(false);
		expect(b.view().people.some((p) => p.away)).toBe(false);
	});

	it("a guest's timer shows nothing until the host's start arrives (no 0:00 then a jump)", async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		// biome-ignore lint/suspicious/noExplicitAny: forget the start, as before the first answer.
		(g as any).hostStartedAt = null;
		expect(g.view().startedAt).toBeNull();
	});

	it('the first line after a reload is a new line, never mistaken for an old one', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		g.actions.sendChat('before reload');
		await until(() => h.view().chat.some((l) => l.kind === 'message' && l.text === 'before reload'), h, g);
		g.dispose();
		await until(() => !h.view().people.some((p) => p.name === 'Amina' && !p.away), h);
		localStorage.removeItem('lattice-live-links');
		const { g: again } = await guestOf(h, 'Amina');
		again.actions.sendChat('after reload');
		await until(() => h.view().chat.some((l) => l.kind === 'message' && l.text === 'after reload'), h, again);
	});

	it('two people with the same name keep their own "Reconnecting…"', async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Guest');
		const { g: b } = await guestOf(h, 'Guest');
		// biome-ignore lint/suspicious/noExplicitAny: the test reaches the transports' ids.
		const id = (c: Ctl) => (c as any).rt.session.getState().selfId as string;
		net.current?.cut(id(h), id(a));
		net.current?.cut(id(h), id(b));
		// Both dropped: two "Reconnecting…" rows, not one overwriting the other.
		await until(() => h.view().people.filter((p) => p.name === 'Guest' && p.away).length === 2, h);
	});

	it('an impostor under the same name and color cannot take over a member\'s line ids (red team round 3)', async () => {
		const { h } = await hostSession();
		const { g: amina } = await guestOf(h, 'Amina');
		amina.actions.sendChat('hi');
		await until(() => h.view().chat.some((l) => l.kind === 'message' && l.text === 'hi'), h, amina);
		// biome-ignore lint/suspicious/noExplicitAny: read Amina's prefix off the echoed line.
		const sid = ((h as any).chat.find((l: { text: string }) => l.text === 'hi').id as string).split(':')[0];
		// A second "Amina" (different token) posts under Amina's next id.
		const { g: fake } = await guestOf(h, 'Amina');
		// biome-ignore lint/suspicious/noExplicitAny: the impostor drives the post channel.
		const fp = fake as any;
		fp.post({ k: 'say', id: `${sid}:2`, text: 'Yes, approve the budget' }, fp.hostId());
		await settle(h, amina, fake);
		amina.actions.sendChat('NO, do not approve');
		const texts = h.view.bind(h);
		await until(() => texts().chat.some((l) => l.kind === 'message' && l.text === 'NO, do not approve'), h, amina, fake);
		expect(h.view().chat.some((l) => l.kind === 'message' && l.text === 'Yes, approve the budget')).toBe(false);
	});

	it('a long chat (past 125 KB) still seals and saves', async () => {
		const { h } = await hostSession();
		for (let i = 0; i < 140; i++) h.actions.sendChat(`${i} ${'x'.repeat(990)}`);
		// biome-ignore lint/suspicious/noExplicitAny: call the host save directly.
		expect(await (h as any).saveHost()).toBe(true);
	});

	it('a burst of "since" asks gets at most one answer now and one later', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		await new Promise((res) => setTimeout(res, 2100));
		let answers = 0;
		// biome-ignore lint/suspicious/noExplicitAny: count the host's replies.
		const hp = h as any;
		const orig = hp.post.bind(hp);
		hp.post = (p: { k: string }, to?: string) => {
			if (p.k === 'lines') answers++;
			orig(p, to);
		};
		// biome-ignore lint/suspicious/noExplicitAny: the guest floods asks.
		const gp = g as any;
		for (let n = 0; n < 10; n++) gp.post({ k: 'since', seq: 0 }, gp.hostId());
		await settle(h, g);
		await new Promise((res) => setTimeout(res, 2200));
		await settle(h, g);
		expect(answers).toBeLessThanOrEqual(2);
	});

	it('the numbering floor moves at most once per member per admission', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		// biome-ignore lint/suspicious/noExplicitAny: the guest posts inflated numbers.
		const gp = g as any;
		for (let n = 0; n < 40; n++) gp.post({ k: 'say', id: `${gp.rt.sid}:${100 + n}`, text: 'x', have: 1_000_000 }, gp.hostId());
		await settle(h, g);
		// biome-ignore lint/suspicious/noExplicitAny: read the host's number.
		expect((h as any).seq).toBeLessThan(600);
	});
});

describe('succession in the Studio (2026-10-07)', () => {
	it('when the host drops, the heir hosts: chat keeps flowing, numbered by the new host, with its owners and the session start', async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		const { g: c } = await guestOf(h, 'Chen');
		await settle(h, a, c);
		await until(() => h.view().heir === 'Amina' && a.view().heir === 'you' && c.view().heir === 'Amina', h, a, c);
		a.actions.sendChat('before, from Amina');
		await until(() => c.view().chat.some((l) => l.kind === 'message' && l.text === 'before, from Amina' && !l.pending), h, a, c);
		await settle(h, a, c);
		const started = c.view().startedAt;
		// biome-ignore lint/suspicious/noExplicitAny: the test drops the host's transport like a sleeping phone.
		net.current?.drop((h as any).rt.session.getState().selfId);
		await until(() => a.view().isHost && c.view().people.some((p) => p.name === 'Amina' && p.role === 'host') && !c.view().hostAway, a, c);
		expect(c.view().chat.some((l) => l.kind === 'system' && l.text === 'Amina is hosting now')).toBe(true);
		expect(a.view().startedAt).toBe(started);
		// One crown: the old host's "Reconnecting…" row shows it as the member it will rejoin as.
		expect(a.view().people.filter((p) => p.role === 'host').map((p) => p.name)).toEqual(['Amina']);
		c.actions.sendChat('after, from Chen');
		a.actions.sendChat('after, from Amina');
		await until(() => ['after, from Chen', 'after, from Amina'].every((t) => c.view().chat.some((l) => l.kind === 'message' && l.text === t && !l.pending)), a, c);
		const order = (v: Ctl) => v.view().chat.filter((l) => l.kind === 'message').map((l) => (l.kind === 'message' ? l.text : ''));
		expect(order(c)).toEqual(order(a));
		// Amina's earlier line is still hers on her own screen: its owner moved with the role.
		expect(a.view().chat.find((l) => l.kind === 'message' && l.text === 'before, from Amina')).toMatchObject({ mine: true });
		a.dispose();
		c.dispose();
	});

	it('a first host whose tab froze takes the session back, with the lines its regent numbered meanwhile', async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		const { g: c } = await guestOf(h, 'Chen');
		await until(() => a.view().heir === 'you', h, a, c);
		// biome-ignore lint/suspicious/noExplicitAny: the test cuts the host's links like a frozen tab.
		const id = (x: Ctl) => (x as any).rt.session.getState().selfId as string;
		net.current?.cut(id(h), id(a));
		net.current?.cut(id(h), id(c));
		await until(() => a.view().isHost && c.view().people.some((p) => p.name === 'Amina' && p.role === 'host') && !c.view().hostAway, a, c);
		c.actions.sendChat('during the regency');
		await until(() => a.view().chat.some((l) => l.kind === 'message' && l.text === 'during the regency' && !l.pending), a, c);
		net.current?.heal(id(h), id(a));
		net.current?.heal(id(h), id(c));
		await until(() => h.view().isHost && !a.view().isHost && a.view().people.some((p) => p.name === 'Sharmarke' && p.role === 'host'), h, a, c);
		// The host holds the regency's line now (handed back), and numbers the next one after it.
		await until(() => h.view().chat.some((l) => l.kind === 'message' && l.text === 'during the regency'), h, a, c);
		c.actions.sendChat('after the host is back');
		await until(() => a.view().chat.some((l) => l.kind === 'message' && l.text === 'after the host is back' && !l.pending), h, a, c);
		const order = (v: Ctl) => v.view().chat.filter((l) => l.kind === 'message').map((l) => (l.kind === 'message' ? l.text : ''));
		expect(order(h)).toEqual(order(a));
		expect(order(c)).toEqual(order(a));
		expect(a.view().chat.some((l) => l.kind === 'system' && l.text === 'The host is back, so you are no longer hosting')).toBe(true);
		a.dispose();
		c.dispose();
	});
});

describe('what you share (2026-10-12)', () => {
	// biome-ignore lint/suspicious/noExplicitAny: tests reach the private runtime's awareness.
	const awOf = (c: Ctl) => (c as any).rt.aw as { getLocalState(): Record<string, unknown> | null; setLocalStateField(f: string, v: unknown): void };
	const seen = (viewer: Ctl, name: string) => viewer.view().people.find((p) => p.name === name);

	it('your slide is shown by default, withheld on request, and shown again on request', async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		h.update({ ...deps('host-deck'), activeSlide: 3 });
		await until(() => seen(a, 'Sharmarke')?.slide === 3, h, a);
		h.actions.setShare({ slide: false });
		await until(() => seen(a, 'Sharmarke')?.slideHidden === true, h, a);
		expect(seen(a, 'Sharmarke')?.slide).toBeNull(); // not the old slide, not a guess
		h.update({ ...deps('host-deck'), activeSlide: 5 }); // moving while hidden shares nothing
		await settle(h, a);
		expect(seen(a, 'Sharmarke')?.slide).toBeNull();
		h.actions.setShare({ slide: true });
		await until(() => seen(a, 'Sharmarke')?.slide === 5, h, a);
		expect(seen(a, 'Sharmarke')?.slideHidden).toBeUndefined();
	});

	it('a cursor and a typing mark you have turned off never reach the awareness state; turned on again, they can', async () => {
		const { h } = await hostSession();
		const cursor = { anchor: { type: null, tname: 'source', item: null, assoc: 0 }, head: { type: null, tname: 'source', item: null, assoc: 0 } };
		h.actions.setShare({ cursor: false, typing: false });
		awOf(h).setLocalStateField('cursor', cursor);
		awOf(h).setLocalStateField('editingAt', Date.now());
		expect(awOf(h).getLocalState()).not.toHaveProperty('cursor');
		expect(awOf(h).getLocalState()).not.toHaveProperty('editingAt');
		h.actions.setShare({ cursor: true, typing: true });
		awOf(h).setLocalStateField('cursor', cursor);
		awOf(h).setLocalStateField('editingAt', 12345);
		expect(awOf(h).getLocalState()).toHaveProperty('cursor');
		expect(awOf(h).getLocalState()).toHaveProperty('editingAt', 12345);
	});

	it('turning typing off clears a mark already sent, and the chat typing line stops', async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		awOf(a).setLocalStateField('editingAt', Date.now());
		expect(awOf(a).getLocalState()).toHaveProperty('editingAt');
		a.actions.setShare({ typing: false });
		expect(awOf(a).getLocalState()).not.toHaveProperty('editingAt'); // withdrawn at once, not just stopped
		a.actions.chatTyping();
		await settle(h, a);
		expect(h.view().typing).toEqual([]); // the host never hears that Amina is typing
		a.actions.setShare({ typing: true });
		a.actions.chatTyping();
		await until(() => h.view().typing.includes('Amina'), h, a);
	});

	it('turning typing off still protects you from being moved while you type (checker, 2026-10-13)', async () => {
		const { h } = await hostSession();
		const { g, notes } = await guestOf(h, 'Amina');
		const go = vi.fn();
		// biome-ignore lint/suspicious/noExplicitAny: tests reach the private host shell and runtime.
		(g as any).host.goToSlide = go;
		g.actions.setShare({ typing: false });
		// biome-ignore lint/suspicious/noExplicitAny: tests reach the private runtime's shared text.
		(g as any).rt.ytext.insert(0, 'x');
		h.update({ ...deps('host-deck'), activeSlide: 1 });
		h.actions.bringEveryone();
		await until(() => notes.some((n) => /The host is on slide/.test(n)), h, g);
		expect(go).not.toHaveBeenCalled(); // a toast with a Go button, not a jump
	});

	it('with your slide hidden, Bring everyone is said once and then taken back, so a late joiner never carries it', async () => {
		const { h } = await hostSession();
		h.actions.setShare({ slide: false });
		vi.useFakeTimers({ toFake: ['setTimeout'] });
		try {
			h.actions.bringEveryone();
			expect(awOf(h).getLocalState()).toHaveProperty('summon');
			vi.advanceTimersByTime(6001);
		} finally {
			vi.useRealTimers();
		}
		expect(awOf(h).getLocalState()).not.toHaveProperty('summon');
		expect(awOf(h).getLocalState()).toHaveProperty('slideHidden', true);
	});

	it('what you hid survives a reload, and a session started afterwards in the same tab publishes nothing you hid', async () => {
		const { h } = await hostSession();
		h.actions.setShare({ slide: false, cursor: false });
		const reloaded = new LiveController(shell().host, deps('host-deck'));
		reloaded.actions.start('Sharmarke');
		await until(() => reloaded.view().status === 'live', reloaded);
		expect(reloaded.view().share).toEqual({ cursor: false, slide: false, typing: true, doing: true, pointer: true });
		expect(awOf(reloaded).getLocalState()).toHaveProperty('slideHidden', true);
		expect(awOf(reloaded).getLocalState()).not.toHaveProperty('slide');
		expect(awOf(reloaded).getLocalState()).not.toHaveProperty('cursor');
	});

	it('what you share is in your view, all on to begin with', async () => {
		const { h } = await hostSession();
		expect(h.view().share).toEqual({ cursor: true, slide: true, typing: true, doing: true, pointer: true });
		h.actions.setShare({ slide: false });
		expect(h.view().share).toEqual({ cursor: true, slide: false, typing: true, doing: true, pointer: true });
	});
});

// The session's look (2026-10-20-live-uniform-experience.md §5.1): an un-themed deck renders in the look the
// host froze when the session started, for every member, whatever their own site palette and mode.
describe('LiveController: the session look', () => {
	// biome-ignore lint/suspicious/noExplicitAny: the look a member holds, read where the Studio reads it.
	const lookOf = (c: Ctl) => (c as any).look as { palette: string | null; mode: string } | null;

	it('every member takes the host\'s frozen look, not its own palette and mode', async () => {
		const { h } = await hostSession({ theme: 'indaco', mode: 'dark' });
		const { g } = await guestOf(h, 'Amina', { theme: 'cuoio', mode: 'light' });
		await until(() => lookOf(g) !== null, h, g);
		expect(lookOf(h)).toEqual({ palette: 'indaco', mode: 'dark' });
		expect(lookOf(g)).toEqual({ palette: 'indaco', mode: 'dark' });
		expect(h.collab()?.look).toEqual({ palette: 'indaco', mode: 'dark' });
	});

	it('the look is frozen: the host changing its own palette later does not change it', async () => {
		const { h } = await hostSession({ theme: 'indaco', mode: 'dark' });
		h.update(deps('host-deck', { theme: 'onyx', mode: 'light' }));
		const { g } = await guestOf(h, 'Amina', { theme: 'cuoio' });
		await until(() => lookOf(g) !== null, h, g);
		expect(lookOf(g)).toEqual({ palette: 'indaco', mode: 'dark' });
	});

	it('a host whose palette is a saved theme shares no name: everyone gets the default, and the host is told', async () => {
		const { h, notes } = await hostSession({ theme: 'Acme Brand', mode: 'light' });
		const { g } = await guestOf(h, 'Amina', { theme: 'onyx', mode: 'dark' });
		await until(() => lookOf(g) !== null, h, g);
		expect(lookOf(h)).toEqual({ palette: null, mode: 'light' });
		expect(lookOf(g)).toEqual({ palette: null, mode: 'light' });
		expect(notes.some((n) => n.includes("saved theme isn't shared"))).toBe(true);
	});

	it('a look from a member who is not the host is ignored, and so is a name that is not a built-in', async () => {
		const { h } = await hostSession({ theme: 'indaco', mode: 'dark' });
		const { g: a } = await guestOf(h, 'Amina');
		const { g: b } = await guestOf(h, 'Bo');
		await until(() => lookOf(a) !== null && lookOf(b) !== null, h, a, b);
		// biome-ignore lint/suspicious/noExplicitAny: a modified client posting a forged tip to everyone.
		(a as any).post({ k: 'tip', seq: 0, startedAt: 0, look: { palette: 'onyx', mode: 'light' } });
		// biome-ignore lint/suspicious/noExplicitAny: the host itself sending a name no built-in carries.
		(h as any).post({ k: 'tip', seq: 0, startedAt: 0, look: { palette: 'evil</style>', mode: 'light' } });
		await settle(h, a, b);
		expect(lookOf(b)).toEqual({ palette: 'indaco', mode: 'dark' });
	});

	it('the heir keeps the look when the host drops, and a newcomer gets the same one from the heir', async () => {
		const { h } = await hostSession({ theme: 'indaco', mode: 'dark' });
		const { g: a } = await guestOf(h, 'Amina', { theme: 'cuoio', mode: 'light' });
		const { g: c } = await guestOf(h, 'Chen', { theme: 'onyx', mode: 'light' });
		await until(() => h.view().heir === 'Amina' && a.view().heir === 'you' && lookOf(a) !== null && lookOf(c) !== null, h, a, c);
		// biome-ignore lint/suspicious/noExplicitAny: the test drops the host's transport like a sleeping phone.
		net.current?.drop((h as any).rt.session.getState().selfId);
		await until(() => a.view().isHost && !c.view().hostAway, a, c);
		expect(lookOf(a)).toEqual({ palette: 'indaco', mode: 'dark' });
		expect(lookOf(c)).toEqual({ palette: 'indaco', mode: 'dark' });
		const { g: d } = await guestOf(a, 'Dee', { theme: 'cuoio', mode: 'light' });
		await until(() => lookOf(d) !== null, a, c, d);
		expect(lookOf(d)).toEqual({ palette: 'indaco', mode: 'dark' });
		a.dispose();
		c.dispose();
		d.dispose();
	});

	it('a host that reloads keeps the look it froze, not its palette now', async () => {
		const { h } = await hostSession({ theme: 'indaco', mode: 'dark' });
		// biome-ignore lint/suspicious/noExplicitAny: wait for the host save the reload resumes from.
		await (h as any).saveHost();
		h.dispose();
		const reloaded = new LiveController(shell().host, deps('host-deck', { theme: 'cuoio', mode: 'light' }));
		await reloaded.resume();
		await until(() => reloaded.view().status === 'live', reloaded);
		expect(lookOf(reloaded)).toEqual({ palette: 'indaco', mode: 'dark' });
	});

	it('the saved-theme note is not shown when the deck names a theme of its own', async () => {
		const { notes } = await hostSession({ theme: 'Acme Brand', source: '---\ntheme: onyx\n---\n\n# Q3\n' });
		expect(notes.some((n) => n.includes("saved theme isn't shared"))).toBe(false);
	});

	it('the lobby names the frozen look, never the host\'s palette now or a saved theme', async () => {
		const { h } = await hostSession({ theme: 'indaco', mode: 'dark' });
		h.update(deps('host-deck', { theme: 'onyx' }));
		// biome-ignore lint/suspicious/noExplicitAny: the invite the lobby reads, from the host's session.
		expect((h as any).rt.session.getState().invite?.theme).toBe('indaco');
		const { h: saved } = await hostSession({ theme: 'Acme Brand' });
		// biome-ignore lint/suspicious/noExplicitAny: as above.
		expect((saved as any).rt.session.getState().invite?.theme).toBe('');
	});

	it('a host holding no look keeps none across a reload, instead of freezing its palette now', async () => {
		const { h } = await hostSession({ theme: 'indaco', mode: 'dark' });
		// biome-ignore lint/suspicious/noExplicitAny: an heir that took over before its tip arrived holds no look.
		(h as any).look = null;
		// biome-ignore lint/suspicious/noExplicitAny: wait for the host save the reload resumes from.
		await (h as any).saveHost();
		h.dispose();
		const reloaded = new LiveController(shell().host, deps('host-deck', { theme: 'cuoio', mode: 'light' }));
		await reloaded.resume();
		await until(() => reloaded.view().status === 'live', reloaded);
		expect(lookOf(reloaded)).toBeNull();
	});

	it('a member that missed the tip gets the look with the lines it asks for', async () => {
		const { h } = await hostSession({ theme: 'indaco', mode: 'dark' });
		const { g } = await guestOf(h, 'Amina', { theme: 'cuoio' });
		await until(() => lookOf(g) !== null, h, g);
		// biome-ignore lint/suspicious/noExplicitAny: forget the look, then ask the host for lines as a returning member does.
		(g as any).look = null;
		// biome-ignore lint/suspicious/noExplicitAny: as above.
		(g as any).post({ k: 'since', seq: 0 }, (h as any).rt.session.getState().selfId);
		await until(() => lookOf(g) !== null, h, g);
		expect(lookOf(g)).toEqual({ palette: 'indaco', mode: 'dark' });
	});
});

// The host's Library records (2026-10-20-live-uniform-experience.md §5.2, §6 rules 5, 6, 8): a member renders the
// saved theme and finish the deck uses; nothing the host did not share leaves its Library; a member takes them
// only from the host, through the import gate, and holds them in memory.
describe('LiveController: Library records', () => {
	const acme = { name: 'acme-brand', css: ':root{--accent:#123456}' };
	const linen = { name: 'linen', label: 'Linen', recipe: { grain: { type: 'paper', strength: 0.3 } } };
	const recordsOf = (c: Ctl) => c.collab()?.records ?? NO_RECORDS;
	const withRecords = (themes: LiveTheme[] = [acme], finishes: LiveFinish[] = [linen], components: string[] = []) => ({ records: { themes, finishes, components } });

	it('a member gets the saved theme and finish the deck used when sharing started', async () => {
		const { h } = await hostSession(withRecords());
		const { g } = await guestOf(h, 'Amina');
		await until(() => recordsOf(g).themes.length === 1 && recordsOf(g).finishes.length === 1, h, g);
		expect(recordsOf(g).themes[0]).toEqual(acme);
		expect(recordsOf(g).finishes[0]).toMatchObject({ name: 'linen', label: 'Linen' });
	});

	it('a record the deck names later is not sent until the host agrees', async () => {
		const sh = shell();
		const actions: Array<{ m: string; go: () => void }> = [];
		sh.host.notifyAction = (m, o) => actions.push({ m, go: o.onClick });
		sessionStorage.removeItem('lattice-live-sids');
		const h = new LiveController(sh.host, deps('host-deck'));
		h.actions.start('Sharmarke');
		await until(() => h.view().status === 'live', h);
		const { g } = await guestOf(h, 'Amina');
		// An editor writes a private theme's name into the deck: the host's deck now resolves it.
		h.update(deps('host-deck', withRecords([{ name: 'private-brand', css: ':root{--accent:#000}' }], [])));
		await settle(h, g);
		expect(recordsOf(g).themes).toEqual([]);
		const ask = actions.find((a) => a.m.includes('private-brand'));
		expect(ask).toBeDefined();
		ask?.go();
		await until(() => recordsOf(g).themes.some((t) => t.name === 'private-brand'), h, g);
	});

	it('records from a member who is not the host are ignored, and so are shipped names and oversized CSS', async () => {
		const { h } = await hostSession(withRecords([], []));
		const { g: a } = await guestOf(h, 'Amina');
		const { g: b } = await guestOf(h, 'Bo');
		// biome-ignore lint/suspicious/noExplicitAny: a modified client posting records to everyone.
		(a as any).post({ k: 'records', themes: [acme], finishes: [linen], components: [] });
		// biome-ignore lint/suspicious/noExplicitAny: the host itself sending a shipped name and a huge sheet.
		(h as any).post({ k: 'records', themes: [{ name: 'indaco', css: ':root{}' }, { name: 'huge', css: 'x'.repeat(200 * 1024) }], finishes: [{ name: 'Bad Name!', recipe: {} }], components: ['ok-name', '<img>'] });
		await settle(h, a, b);
		await new Promise((r) => setTimeout(r, 50));
		expect(recordsOf(b).themes).toEqual([]);
		expect(recordsOf(b).finishes).toEqual([]);
		expect(recordsOf(b).components).toEqual(['ok-name']);
	});

	it('a theme that fetches off the device is refused by the import gate, with a note', async () => {
		const beacon = { name: 'beacon', css: "@font-face{font-family:x;src:url(https://evil.example/f.woff2)} :root{--accent:#111}" };
		const { h } = await hostSession(withRecords([beacon], []));
		const { g, notes } = await guestOf(h, 'Amina');
		await until(() => notes.some((n) => n.includes('"beacon"')), h, g);
		expect(recordsOf(g).themes).toEqual([]);
	});

	it('a finish travels as a recipe, coerced into the generator\'s vocabulary', async () => {
		const evil = { name: 'gloss', label: 'Gloss', recipe: { grain: { type: 'url(https://evil.example/x)' }, extra: '</style><script>' } };
		const { h } = await hostSession(withRecords([], [evil]));
		const { g } = await guestOf(h, 'Amina');
		await until(() => recordsOf(g).finishes.length === 1, h, g);
		expect(JSON.stringify(recordsOf(g).finishes[0].recipe)).not.toMatch(/evil|script/);
	});

	it('a deck with a custom component says so once, by name', async () => {
		const { h } = await hostSession(withRecords([], [], ['org-chart']));
		const { g, notes } = await guestOf(h, 'Amina');
		await until(() => notes.some((n) => n.includes('org-chart')), h, g);
		expect(notes.filter((n) => n.includes('org-chart'))).toHaveLength(1);
	});

	it('a host whose site palette is a saved theme can share it as the session look', async () => {
		const sh = shell();
		const actions: Array<{ m: string; go: () => void }> = [];
		sh.host.notifyAction = (m, o) => actions.push({ m, go: o.onClick });
		sessionStorage.removeItem('lattice-live-sids');
		const h = new LiveController(sh.host, deps('host-deck', { theme: 'acme-brand', mode: 'dark', siteTheme: acme }));
		h.actions.start('Sharmarke');
		await until(() => h.view().status === 'live', h);
		const { g } = await guestOf(h, 'Amina', { theme: 'cuoio', mode: 'light' });
		// biome-ignore lint/suspicious/noExplicitAny: the look the member holds.
		const lookOf = (c: Ctl) => (c as any).look;
		await until(() => lookOf(g) !== null, h, g);
		expect(lookOf(g)).toEqual({ palette: null, mode: 'dark' });
		actions.find((a) => a.m.includes('acme-brand'))?.go();
		await until(() => lookOf(g)?.palette === 'acme-brand', h, g);
		expect(recordsOf(g).themes).toEqual([acme]);
	});

	it('an heir relays the records it holds, but none of its own Library without asking', async () => {
		const { h } = await hostSession(withRecords());
		const { g: a } = await guestOf(h, 'Amina', withRecords([{ name: 'amina-private', css: ':root{--accent:#222}' }], []));
		const { g: c } = await guestOf(h, 'Chen');
		await until(() => h.view().heir === 'Amina' && a.view().heir === 'you' && recordsOf(a).themes.length === 1 && recordsOf(c).themes.length === 1, h, a, c);
		// biome-ignore lint/suspicious/noExplicitAny: the test drops the host's transport like a sleeping phone.
		net.current?.drop((h as any).rt.session.getState().selfId);
		await until(() => a.view().isHost && !c.view().hostAway, a, c);
		const { g: d } = await guestOf(a, 'Dee');
		await until(() => recordsOf(d).themes.length > 0, a, c, d);
		expect(recordsOf(d).themes.map((t) => t.name)).toEqual(['acme-brand']);
		a.dispose();
		c.dispose();
		d.dispose();
	});

	it('a component the deck names later is not named to anyone until the host shares it', async () => {
		const { h } = await hostSession(withRecords([], []));
		const { g } = await guestOf(h, 'Amina');
		h.update(deps('host-deck', withRecords([], [], ['acme-merger-org-chart'])));
		await settle(h, g);
		expect(recordsOf(g).components).toEqual([]);
		expect(h.view().unshared).toEqual([{ key: 'c:acme-merger-org-chart', kind: 'component', name: 'acme-merger-org-chart' }]);
		h.actions.shareRecord('c:acme-merger-org-chart');
		await until(() => recordsOf(g).components.includes('acme-merger-org-chart'), h, g);
		expect(h.view().unshared).toEqual([]);
	});

	it('an unshared record stays listed in the panel after its prompt is gone, and asks once', async () => {
		const sh = shell();
		const asks: string[] = [];
		sh.host.notifyAction = (m) => asks.push(m);
		sessionStorage.removeItem('lattice-live-sids');
		const h = new LiveController(sh.host, deps('host-deck'));
		h.actions.start('Sharmarke');
		await until(() => h.view().status === 'live', h);
		const both = deps('host-deck', withRecords([{ name: 'private-brand', css: ':root{}' }], [linen]));
		h.update(both);
		h.update(deps('host-deck', withRecords([{ name: 'private-brand', css: ':root{}' }], [linen])));
		expect(h.view().unshared.map((u) => u.key)).toEqual(['t:private-brand', 'f:linen']);
		expect(asks.filter((a) => a.includes('private-brand'))).toHaveLength(1);
		expect(asks[0]).toMatch(/^Someone in the session changed the deck/);
	});

	it('a shared site theme stays the look and stays sent after the host changes its site palette', async () => {
		const { h } = await hostSession({ theme: 'acme-brand', mode: 'dark', siteTheme: acme });
		const { g } = await guestOf(h, 'Amina', { theme: 'cuoio' });
		// biome-ignore lint/suspicious/noExplicitAny: the look the member holds.
		const lookOf = (c: Ctl) => (c as any).look;
		await until(() => lookOf(g) !== null, h, g);
		expect(h.view().unshared).toEqual([{ key: 'look', kind: 'look', name: 'acme-brand' }]);
		h.actions.shareRecord('look');
		await until(() => lookOf(g)?.palette === 'acme-brand', h, g);
		h.update(deps('host-deck', { theme: 'indaco', siteTheme: null, source: '# changed\n' }));
		await settle(h, g);
		expect(recordsOf(g).themes).toEqual([acme]);
		const { g: late } = await guestOf(h, 'Bo', { theme: 'onyx' });
		await until(() => lookOf(late)?.palette === 'acme-brand', h, g, late);
		expect(recordsOf(late).themes).toEqual([acme]);
	});

	it('a host that reloads keeps a shared site theme as the look, whatever its Library holds yet', async () => {
		const { h } = await hostSession({ theme: 'acme-brand', mode: 'dark', siteTheme: acme });
		h.actions.shareRecord('look');
		// biome-ignore lint/suspicious/noExplicitAny: wait for the host save the reload resumes from.
		await (h as any).saveHost();
		h.dispose();
		const reloaded = new LiveController(shell().host, deps('host-deck', { theme: 'cuoio', siteTheme: null }));
		await reloaded.resume();
		await until(() => reloaded.view().status === 'live', reloaded);
		// biome-ignore lint/suspicious/noExplicitAny: the look and the record the reloaded host holds.
		expect((reloaded as any).look).toEqual({ palette: 'acme-brand', mode: 'dark' });
		// biome-ignore lint/suspicious/noExplicitAny: as above.
		expect((reloaded as any).outgoing().themes).toEqual([acme]);
	});

	it('a shipped finish name is refused, and a refused theme is checked once however often it is sent', async () => {
		const gate = await import('../import-gate');
		const spy = vi.spyOn(gate, 'refuseImportedTheme');
		const { h } = await hostSession(withRecords([], []));
		const { g } = await guestOf(h, 'Amina');
		const beacon = { name: 'beacon', css: '@import url(https://evil.example/x.css); :root{}' };
		for (let i = 0; i < 4; i++) {
			// biome-ignore lint/suspicious/noExplicitAny: a hostile host sending the same heavy sheet again and again.
			(h as any).post({ k: 'records', themes: [beacon], finishes: [{ name: 'boardroom', recipe: {} }, { name: 'none', recipe: {} }], components: [] });
			await settle(h, g);
		}
		expect(recordsOf(g).finishes).toEqual([]);
		expect(recordsOf(g).themes).toEqual([]);
		expect(spy.mock.calls.filter((c) => c[1] === 'beacon')).toHaveLength(1);
		spy.mockRestore();
	});
});

// Activity, wide Follow and pointers (2026-10-20-live-uniform-experience.md §5.4, §6, §7.6).
describe('LiveController: activity, Follow and pointers', () => {
	it('everyone sees what a member is doing, and never their AI chat; a member can hide it', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		g.update(deps('shared-deck', { panel: 'coach', view: 'compose' }));
		await until(() => h.view().people.find((p) => p.name === 'Amina')?.doing?.panel === 'coach', h, g);
		g.update(deps('shared-deck', { panel: null, view: 'article', presenting: true }));
		await until(() => h.view().people.find((p) => p.name === 'Amina')?.doing?.presenting === true, h, g);
		g.actions.setShare({ doing: false });
		await until(() => h.view().people.find((p) => p.name === 'Amina')?.doing === undefined, h, g);
	});

	it('a forged activity is dropped: a panel or view outside the lists never arrives', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		// biome-ignore lint/suspicious/noExplicitAny: a modified client writing straight into its presence.
		(g as any).rt.aw.setLocalStateField('doing', { panel: 'chat', view: 'compose', presenting: false });
		// A change that is not a caret move is applied at most ten times a second and the latest is kept, so the
		// forged state replaces the real one a moment later, never the other way round.
		await until(() => h.view().people.find((p) => p.name === 'Amina')?.doing === undefined, h, g);
		// biome-ignore lint/suspicious/noExplicitAny: as above.
		(g as any).rt.aw.setLocalStateField('doing', { panel: '<img src=x>', view: 'settings', presenting: 'yes' });
		await settle(h, g);
		await new Promise((r) => setTimeout(r, 150));
		await settle(h, g);
		expect(h.view().people.find((p) => p.name === 'Amina')?.doing).toBeUndefined();
	});

	it('following someone opens their panel and view; opening another of your own stops following', async () => {
		const { h } = await hostSession();
		const sh = shell();
		const moves: Array<{ panel: string | null; view: string }> = [];
		sh.host.followDoing = (d) => moves.push(d);
		sh.host.canFollowDoing = () => true;
		localStorage.removeItem('lattice-live-links');
		sessionStorage.removeItem('lattice-live-sids');
		location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
		takeLiveIntent();
		const g = new LiveController(sh.host, deps('g-deck'));
		await g.resume();
		await until(() => g.lobby()?.stage === 'ready', h, g);
		g.lobbyActions.setName('Amina');
		g.lobbyActions.knock();
		await until(() => h.view().waiting.length > 0, h, g);
		h.actions.admit(h.view().waiting[0].id);
		await until(() => g.view().status === 'live', h, g);
		const hostId = g.view().people.find((p) => p.role === 'host')?.id as string;
		g.actions.follow(hostId);
		h.update(deps('host-deck', { panel: 'library', view: 'compose' }));
		await until(() => moves.some((m) => m.panel === 'library'), h, g);
		// The follow move arrives: this browser now has Library open, and still follows.
		g.update(deps('shared-deck', { panel: 'library', view: 'compose' }));
		expect(g.view().following).toBe(hostId);
		// Opening Coach yourself stops it.
		g.update(deps('shared-deck', { panel: 'coach', view: 'compose' }));
		expect(g.view().following).toBeNull();
	});

	it('pointers: a member\'s pointer reaches the others in slide coordinates, never from a hidden one, and a flood is dropped', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		const seen: Array<Array<{ name: string; x: number; y: number; slide: number }>> = [];
		const off = h.pointerSource.subscribe((p) => seen.push(p));
		g.pointerSource.send({ slide: 0, x: 0.25, y: 0.5 });
		await until(() => seen.at(-1)?.some((p) => p.name === 'Amina' && p.x === 0.25) ?? false, h, g);
		// Out of the slide or malformed: dropped (sent well past the flood gate, so only the range check can drop it).
		await new Promise((r) => setTimeout(r, 60));
		// biome-ignore lint/suspicious/noExplicitAny: a modified client posting a pointer off the slide.
		(g as any).post({ k: 'ptr', s: 0, x: 4, y: -1 });
		await settle(h, g);
		expect(seen.at(-1)?.find((p) => p.name === 'Amina')?.x).toBe(0.25);
		g.pointerSource.send(null);
		await until(() => (seen.at(-1)?.length ?? 1) === 0, h, g);
		g.actions.setShare({ pointer: false });
		// Past the send throttle, so a pointer that went out would have arrived.
		await new Promise((r) => setTimeout(r, 150));
		g.pointerSource.send({ slide: 0, x: 0.75, y: 0.5 });
		await new Promise((r) => setTimeout(r, 150));
		await settle(h, g);
		expect(seen.at(-1)).toEqual([]);
		off();
	});

	it('pointers leave with the member', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		let last: unknown[] = [];
		const off = h.pointerSource.subscribe((p) => {
			last = p;
		});
		g.pointerSource.send({ slide: 0, x: 0.5, y: 0.5 });
		await until(() => last.length === 1, h, g);
		g.actions.leave();
		await until(() => last.length === 0, h, g);
		off();
	});

	it('Follow never moves anyone into Fabricate, and asks instead of moving someone who is typing', async () => {
		const { h } = await hostSession();
		const sh = shell();
		const moves: Array<{ panel: string | null; view: string }> = [];
		const asks: string[] = [];
		sh.host.followDoing = (d) => moves.push(d);
		sh.host.canFollowDoing = () => true;
		sh.host.notifyAction = (m) => asks.push(m);
		localStorage.removeItem('lattice-live-links');
		sessionStorage.removeItem('lattice-live-sids');
		location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
		takeLiveIntent();
		const g = new LiveController(sh.host, deps('g-deck'));
		await g.resume();
		await until(() => g.lobby()?.stage === 'ready', h, g);
		g.lobbyActions.setName('Amina');
		g.lobbyActions.knock();
		await until(() => h.view().waiting.length > 0, h, g);
		h.actions.admit(h.view().waiting[0].id);
		await until(() => g.view().status === 'live', h, g);
		g.actions.follow(g.view().people.find((p) => p.role === 'host')?.id as string);
		h.update(deps('host-deck', { panel: null, view: 'fabricate' }));
		await settle(h, g);
		expect(moves.some((m) => m.view === 'fabricate')).toBe(false);
		// Typing now (a local edit to the shared text), then the host opens Coach: a Go, not a move.
		// biome-ignore lint/suspicious/noExplicitAny: a local keystroke on the shared text.
		(g as any).rt.ytext.insert(0, 'x');
		const before = moves.length;
		h.update(deps('host-deck', { panel: 'coach', view: 'compose' }));
		await until(() => asks.some((a) => a.includes('opened Coach')), h, g);
		expect(moves.length).toBe(before);
	});

	it('the declared view carries where a member is, beside `doing`, and the privacy switch withholds both', async () => {
		const { h } = await hostSession({ panel: 'coach' });
		const { g } = await guestOf(h, 'Amina');
		const hostId = g.view().people.find((p) => p.role === 'host')?.id as string;
		// biome-ignore lint/suspicious/noExplicitAny: reads the view Tavola kept for the host.
		const shown = () => (g as any).rt.view.of(hostId).all() as Record<string, unknown>;
		await until(() => shown().panel === 'coach', h, g);
		expect(shown()).toMatchObject({ panel: 'coach', view: 'compose', presenting: false });
		h.update(deps('host-deck', { panel: null, view: 'article', asking: true }));
		await until(() => shown().panel === 'none' && shown().asking === true, h, g);
		h.actions.setShare({ doing: false });
		await until(() => Object.keys(shown()).length === 0, h, g);
		h.actions.setShare({ doing: true });
		await until(() => shown().view === 'article', h, g);
	});

	it('a leader on an older tab, who sends only `doing`, is still followed', async () => {
		const { h } = await hostSession();
		const sh = shell();
		const moves: Array<{ panel: string | null; view: string }> = [];
		sh.host.followDoing = (d) => moves.push(d);
		sh.host.canFollowDoing = () => true;
		localStorage.removeItem('lattice-live-links');
		sessionStorage.removeItem('lattice-live-sids');
		location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
		takeLiveIntent();
		const g = new LiveController(sh.host, deps('g-deck'));
		await g.resume();
		await until(() => g.lobby()?.stage === 'ready', h, g);
		g.lobbyActions.setName('Amina');
		g.lobbyActions.knock();
		await until(() => h.view().waiting.length > 0, h, g);
		h.actions.admit(h.view().waiting[0].id);
		await until(() => g.view().status === 'live', h, g);
		g.actions.follow(g.view().people.find((p) => p.role === 'host')?.id as string);
		// An older tab: its awareness state has `doing` and no `view`.
		// biome-ignore lint/suspicious/noExplicitAny: replaces the leader's presence with the older tab's shape.
		const aw = (h as any).rt.aw;
		aw.setLocalState({ ...aw.getLocalState(), view: undefined, doing: { panel: 'live', view: 'compose', presenting: false } });
		delete aw.getLocalState().view;
		await until(() => moves.some((m) => m.panel === 'live'), h, g);
	});

	it('Follow opens the settings panel and section the leader has open; a typist is asked; a section of your own ends it', async () => {
		const { h } = await hostSession();
		const sh = shell();
		const asks: string[] = [];
		sh.host.followDoing = () => {};
		sh.host.canFollowDoing = () => true;
		sh.host.notifyAction = (m) => asks.push(m);
		localStorage.removeItem('lattice-live-links');
		sessionStorage.removeItem('lattice-live-sids');
		location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
		takeLiveIntent();
		const g = new LiveController(sh.host, deps('g-deck'));
		await g.resume();
		await until(() => g.lobby()?.stage === 'ready', h, g);
		g.lobbyActions.setName('Amina');
		g.lobbyActions.knock();
		await until(() => h.view().waiting.length > 0, h, g);
		h.actions.admit(h.view().waiting[0].id);
		await until(() => g.view().status === 'live', h, g);
		const hostId = g.view().people.find((p) => p.role === 'host')?.id as string;
		// This browser shows its own settings panel closed, as the Studio would report it.
		followBus.setLocal('inspector', 'none');
		const applied: string[] = [];
		// A screen does what the Studio's would: it moves, then reports where it is.
		const off = followBus.onApply((k, v) => {
			if (v === null) return;
			applied.push(`${k}:${v}`);
			(followBus.setLocal as (key: string, value: unknown) => void)(k, v);
		});
		g.actions.follow(hostId);
		// biome-ignore lint/suspicious/noExplicitAny: the leader's screen reports its settings panel and section.
		const lead = (h as any).rt.view;
		lead.set('inspector', 'deck');
		lead.set('section', 'brand');
		lead.flush();
		await until(() => applied.includes('section:brand'), h, g);
		expect(applied).toEqual(['inspector:deck', 'section:brand']);
		expect(g.view().following).toBe(hostId);
		// The screen is now where it was told; the leader moves on while this person types: a Go, not a move.
		// biome-ignore lint/suspicious/noExplicitAny: a local keystroke on the shared text.
		(g as any).rt.ytext.insert(0, 'x');
		lead.set('section', 'motion');
		lead.flush();
		await until(() => asks.some((a) => a.includes('is in Motion')), h, g);
		expect(applied).toEqual(['inspector:deck', 'section:brand']);
		// Choosing another section yourself, well after the last move, stops following.
		(g as unknown as { lastApplyAt: number }).lastApplyAt = 0;
		followBus.setLocal('section', 'look');
		expect(g.view().following).toBeNull();
		off();
	});

	it('Follow opens Present at the leader\'s place, moves with it, closes with it, and stays closed if you close it', async () => {
		const { h } = await hostSession();
		const sh = shell();
		const asks: string[] = [];
		sh.host.followDoing = () => {};
		sh.host.canFollowDoing = () => true;
		sh.host.notifyAction = (m) => asks.push(m);
		localStorage.removeItem('lattice-live-links');
		sessionStorage.removeItem('lattice-live-sids');
		location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
		takeLiveIntent();
		const g = new LiveController(sh.host, deps('g-deck'));
		await g.resume();
		await until(() => g.lobby()?.stage === 'ready', h, g);
		g.lobbyActions.setName('Amina');
		g.lobbyActions.knock();
		await until(() => h.view().waiting.length > 0, h, g);
		h.actions.admit(h.view().waiting[0].id);
		await until(() => g.view().status === 'live', h, g);
		const hostId = g.view().people.find((p) => p.role === 'host')?.id as string;
		const seen: Array<{ idx: number; by: string } | null> = [];
		const off = followBus.onApply((k, v) => {
			if (k === 'present') seen.push(v ? { idx: (v as { idx: number }).idx, by: (v as { by: string }).by } : null);
		});
		// biome-ignore lint/suspicious/noExplicitAny: the leader's Present reports its place.
		const lead = (h as any).rt.view;
		const place = (idx: number | null) => {
			if (idx === null) lead.clear('present');
			else lead.set('present', { idx, page: 0, lens: 'full', hash: 'abc123' });
			lead.flush();
		};
		g.actions.follow(hostId);
		place(2);
		await until(() => seen.length === 1, h, g);
		expect(seen[0]).toEqual({ idx: 2, by: 'Sharmarke' });
		place(3);
		await until(() => seen.length === 2, h, g);
		expect(seen[1]).toEqual({ idx: 3, by: 'Sharmarke' });
		// The leader stops: ours closes with it.
		place(null);
		await until(() => seen.length === 3, h, g);
		expect(seen[2]).toBeNull();
		// Open again, then close it ourselves: it stays closed while the leader goes on, and comes back for a new Present.
		g.update(deps('shared-deck', { presenting: false }));
		place(1);
		await until(() => seen.length === 4, h, g);
		g.update(deps('shared-deck', { presenting: true }));
		g.update(deps('shared-deck', { presenting: false }));
		place(4);
		await settle(h, g);
		expect(seen.length).toBe(4);
		place(null);
		await settle(h, g);
		// Past the gate's rate limit, so the end is seen before the next start.
		await new Promise((r) => setTimeout(r, 150));
		await settle(h, g);
		place(5);
		await until(() => seen.length === 5, h, g);
		expect(seen[4]).toEqual({ idx: 5, by: 'Sharmarke' });
		off();
	});

	it('Follow does not open Present over one you opened, over a typist (they get a Join), or over the room\'s', async () => {
		const { h } = await hostSession();
		const sh = shell();
		const asks: string[] = [];
		let joined: (() => void) | undefined;
		sh.host.followDoing = () => {};
		sh.host.canFollowDoing = () => true;
		sh.host.notifyAction = (m, a) => {
			asks.push(m);
			joined = a.onClick;
		};
		localStorage.removeItem('lattice-live-links');
		sessionStorage.removeItem('lattice-live-sids');
		location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
		takeLiveIntent();
		const g = new LiveController(sh.host, deps('g-deck'));
		await g.resume();
		await until(() => g.lobby()?.stage === 'ready', h, g);
		g.lobbyActions.setName('Amina');
		g.lobbyActions.knock();
		await until(() => h.view().waiting.length > 0, h, g);
		h.actions.admit(h.view().waiting[0].id);
		await until(() => g.view().status === 'live', h, g);
		const hostId = g.view().people.find((p) => p.role === 'host')?.id as string;
		const seen: unknown[] = [];
		const off = followBus.onApply((k, v) => k === 'present' && seen.push(v));
		// biome-ignore lint/suspicious/noExplicitAny: the leader's Present reports its place.
		const lead = (h as any).rt.view;
		const place = (idx: number) => {
			lead.set('present', { idx, page: 0, lens: 'full' });
			lead.flush();
		};
		g.actions.follow(hostId);
		// A Present of our own is left alone.
		g.update(deps('shared-deck', { presenting: true }));
		place(1);
		await settle(h, g);
		expect(seen).toEqual([]);
		g.update(deps('shared-deck', { presenting: false }));
		// Typing: a Join, not an open; pressing it opens at wherever the leader is.
		// biome-ignore lint/suspicious/noExplicitAny: a local keystroke on the shared text.
		(g as any).rt.ytext.insert(0, 'x');
		place(2);
		await until(() => asks.some((a) => a.includes('is presenting')), h, g);
		expect(seen).toEqual([]);
		joined?.();
		expect(seen).toHaveLength(1);
		off();
	});

	it('shows where a member is in the settings, the row they changed (once, never the first sight), and where the leader is looking', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		const hostId = g.view().people.find((p) => p.role === 'host')?.id as string;
		// biome-ignore lint/suspicious/noExplicitAny: the leader's screen reports where it is.
		const lead = (h as any).rt.view;
		const push = () => lead.flush();
		const atOf = () => g.view().people.find((p) => p.role === 'host');
		lead.set('shown', 'setup');
		lead.set('setupTab', 'AI');
		lead.set('changed', { what: 'theme', n: 1 });
		push();
		await until(() => atOf()?.at === 'in Setup · AI', h, g);
		// A change counter seen for the first time is history: nothing is announced.
		expect(atOf()?.changed).toBeUndefined();
		await new Promise((r) => setTimeout(r, 150));
		lead.set('changed', { what: 'theme', n: 2 });
		push();
		await until(() => atOf()?.changed === 'changed Theme', h, g);
		// The leader's focus reaches the screens of whoever follows, and ends with the follow.
		g.actions.follow(hostId);
		await new Promise((r) => setTimeout(r, 150));
		lead.set('focus', 'header');
		push();
		await until(() => followBus.getLeader()?.focus === 'header', h, g);
		expect(followBus.getLeader()?.name).toBe('Sharmarke');
		g.actions.follow(null as unknown as string);
		expect(followBus.getLeader()).toBeNull();
	});

	it('a view value outside its list is dropped, counted by key, and named in the connection log', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		// biome-ignore lint/suspicious/noExplicitAny: a modified client putting values outside the lists into its view.
		(g as any).rt.aw.setLocalStateField('view', { panel: 'chat', section: '<img src=x>', focus: 'not-a-row', inspector: 'deck' });
		// biome-ignore lint/suspicious/noExplicitAny: the host's view of the guest, as the gate left it.
		const guestId = h.view().people.find((p) => p.name === 'Amina')?.id as string;
		// biome-ignore lint/suspicious/noExplicitAny: reads the view the gate kept.
		const kept = () => (h as any).rt.view.of(guestId).all() as Record<string, unknown>;
		await until(() => kept().inspector === 'deck', h, g);
		expect(kept()).toEqual({ inspector: 'deck' });
		// biome-ignore lint/suspicious/noExplicitAny: the drops the gate counted.
		const drops = (h as any).viewDrops as Map<string, number>;
		expect([...drops.keys()].sort()).toEqual(['focus', 'panel', 'section']);
		// biome-ignore lint/suspicious/noExplicitAny: the log text a maintainer would be sent.
		expect(await (h as any).logText()).toContain('dropped view values: panel 1, section 1, focus 1');
	});

	it('a slide change moves nobody who is typing: they get a Go that takes them to where the leader is', async () => {
		const { h } = await hostSession();
		const sh = shell();
		const asks: string[] = [];
		const slides: number[] = [];
		sh.host.notifyAction = (m, a) => {
			asks.push(m);
			(sh as { go?: () => void }).go = a?.onClick;
		};
		sh.host.goToSlide = (n) => slides.push(n);
		localStorage.removeItem('lattice-live-links');
		sessionStorage.removeItem('lattice-live-sids');
		location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
		takeLiveIntent();
		const g = new LiveController(sh.host, deps('g-deck', { slideCount: 5 }));
		await g.resume();
		await until(() => g.lobby()?.stage === 'ready', h, g);
		g.lobbyActions.setName('Amina');
		g.lobbyActions.knock();
		await until(() => h.view().waiting.length > 0, h, g);
		h.actions.admit(h.view().waiting[0].id);
		await until(() => g.view().status === 'live', h, g);
		g.actions.follow(g.view().people.find((p) => p.role === 'host')?.id as string);
		// biome-ignore lint/suspicious/noExplicitAny: a local keystroke on the shared text.
		(g as any).rt.ytext.insert(0, 'x');
		h.update(deps('host-deck', { slideCount: 5, activeSlide: 3 }));
		await until(() => asks.some((a) => a.includes('is on slide 4')), h, g);
		expect(slides).toEqual([]);
		(sh as { go?: () => void }).go?.();
		expect(slides).toEqual([3]);
	});

	it('a leader who reconnects under a new id is still followed', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		const hostId = g.view().people.find((p) => p.role === 'host')?.id as string;
		g.actions.follow(hostId);
		// biome-ignore lint/suspicious/noExplicitAny: the roster after the leader rejoins: same name and color, a new id.
		const r = (g as any).rt;
		const state = r.session.getState();
		const host = state.members.find((m: { id: string }) => m.id === hostId);
		const spy = vi.spyOn(r.session, 'getState').mockReturnValue({ ...state, members: state.members.map((m: { id: string }) => (m.id === hostId ? { ...host, id: 'reconnected' } : m)) });
		// biome-ignore lint/suspicious/noExplicitAny: runs the awareness handler as an awareness change would.
		(g as any).onAwareness();
		expect(g.view().following).toBe('reconnected');
		spy.mockRestore();
	});

	it('a phone or tablet follows the slide only: it is never moved and never offered a Go it cannot use', async () => {
		const { h } = await hostSession();
		const sh = shell();
		const moves: unknown[] = [];
		const asks: string[] = [];
		sh.host.followDoing = (d) => moves.push(d);
		sh.host.canFollowDoing = () => false;
		sh.host.notifyAction = (m) => asks.push(m);
		localStorage.removeItem('lattice-live-links');
		sessionStorage.removeItem('lattice-live-sids');
		location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
		takeLiveIntent();
		const g = new LiveController(sh.host, deps('g-deck'));
		await g.resume();
		await until(() => g.lobby()?.stage === 'ready', h, g);
		g.lobbyActions.setName('Amina');
		g.lobbyActions.knock();
		await until(() => h.view().waiting.length > 0, h, g);
		h.actions.admit(h.view().waiting[0].id);
		await until(() => g.view().status === 'live', h, g);
		g.actions.follow(g.view().people.find((p) => p.role === 'host')?.id as string);
		// biome-ignore lint/suspicious/noExplicitAny: a local keystroke on the shared text.
		(g as any).rt.ytext.insert(0, 'x');
		h.update(deps('host-deck', { panel: 'coach', view: 'compose' }));
		await settle(h, g);
		expect(moves).toEqual([]);
		expect(asks.filter((a) => a.includes('opened'))).toEqual([]);
	});

	it('a flood of pointer clicks is dropped like a flood of moves', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		let calls = 0;
		const off = h.pointerSource.subscribe(() => calls++);
		const before = calls;
		// biome-ignore lint/suspicious/noExplicitAny: a modified client posting clicks in a tight loop.
		for (let i = 0; i < 200; i++) (g as any).post({ k: 'ptr', s: 0, x: 0.5, y: 0.5, c: 1 });
		await settle(h, g);
		expect(calls - before).toBeLessThan(5);
		off();
	});

	it('activity is published when the session starts, and again when the switch is turned back on', async () => {
		const { h } = await hostSession({ panel: 'coach' });
		const { g } = await guestOf(h, 'Amina');
		await until(() => g.view().people.find((p) => p.role === 'host')?.doing?.panel === 'coach', h, g);
		h.actions.setShare({ doing: false });
		await until(() => g.view().people.find((p) => p.role === 'host')?.doing === undefined, h, g);
		h.actions.setShare({ doing: true });
		await until(() => g.view().people.find((p) => p.role === 'host')?.doing?.panel === 'coach', h, g);
		expect(h.view().people.find((p) => p.me)?.doing).toBeUndefined();
	});

	it('hiding your slide sends no pointer, since a pointer names its slide', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		let last: unknown[] = [];
		const off = h.pointerSource.subscribe((p) => {
			last = p;
		});
		g.actions.setShare({ slide: false });
		await new Promise((r) => setTimeout(r, 150));
		g.pointerSource.send({ slide: 0, x: 0.5, y: 0.5 });
		await new Promise((r) => setTimeout(r, 150));
		await settle(h, g);
		expect(last).toEqual([]);
		off();
	});

	it('pointers go out at most about ten a second, the last position winning', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		const xs: number[] = [];
		const off = h.pointerSource.subscribe((p) => {
			const a = p.find((q) => q.name === 'Amina');
			if (a) xs.push(a.x);
		});
		for (let i = 1; i <= 20; i++) g.pointerSource.send({ slide: 0, x: i / 100, y: 0.5 });
		// The in-memory network delivers on settle: deliver the first now, the throttled last one later.
		await settle(h, g);
		await new Promise((r) => setTimeout(r, 200));
		await settle(h, g);
		expect(xs.length).toBeLessThanOrEqual(3);
		expect(xs.at(-1)).toBe(0.2);
		off();
	});

	it('moves arriving faster than the flood gate are dropped', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		let calls = 0;
		const off = h.pointerSource.subscribe(() => calls++);
		const before = calls;
		// biome-ignore lint/suspicious/noExplicitAny: a modified client posting moves in a tight loop.
		for (let i = 0; i < 200; i++) (g as any).post({ k: 'ptr', s: 0, x: i / 400, y: 0.5 });
		await settle(h, g);
		expect(calls - before).toBeLessThan(5);
		off();
	});
});

// Present together (2026-10-20-live-uniform-experience.md §5.5, §7.2).
describe('LiveController: present together', () => {
	async function member(h: Ctl, name: string) {
		const sh = shell();
		const opened: string[] = [];
		const asks: string[] = [];
		sh.host.openRoomPresent = () => opened.push('open');
		sh.host.closeRoomPresent = () => opened.push('close');
		sh.host.startTour = (id) => opened.push(`tour ${id}`);
		sh.host.notifyAction = (m) => asks.push(m);
		localStorage.removeItem('lattice-live-links');
		sessionStorage.removeItem('lattice-live-sids');
		location.hash = `#live=${(h.view().link ?? '').split('#live=')[1]}`;
		takeLiveIntent();
		const g = new LiveController(sh.host, deps(`${name}-deck`));
		await g.resume();
		await until(() => g.lobby()?.stage === 'ready', h, g);
		g.lobbyActions.setName(name);
		g.lobbyActions.knock();
		await until(() => h.view().waiting.length > 0, h, g);
		h.actions.admit(h.view().waiting[0].id);
		await until(() => g.view().status === 'live', h, g);
		return { g, opened, asks };
	}

	it('the host presents to everyone: an idle member opens Present where the host is, follows it, and closes with it', async () => {
		const { h } = await hostSession();
		const { g, opened } = await member(h, 'Amina');
		h.actions.presentTransport({ idx: 2, page: 0, lens: 'full' });
		h.actions.presentToEveryone(true);
		await until(() => opened.includes('open') && g.view().present?.idx === 2, h, g);
		expect(g.view().present).toEqual({ idx: 2, page: 0, lens: 'full', by: 'Sharmarke' });
		h.actions.presentTransport({ idx: 3, page: 1, lens: 'full' });
		await until(() => g.view().present?.idx === 3 && g.view().present?.page === 1, h, g);
		h.actions.presentToEveryone(false);
		await until(() => opened.includes('close') && g.view().present === null, h, g);
	});

	it('a member who is typing is asked to join instead of being moved', async () => {
		const { h } = await hostSession();
		const { g, opened, asks } = await member(h, 'Amina');
		// biome-ignore lint/suspicious/noExplicitAny: a local keystroke on the shared text.
		(g as any).rt.ytext.insert(0, 'x');
		h.actions.presentToEveryone(true);
		await until(() => asks.some((a) => a.includes('presenting to everyone')), h, g);
		expect(opened).toEqual([]);
	});

	it('a member cannot present to everyone, and a forged present from a member moves nobody', async () => {
		const { h } = await hostSession();
		const { g: a } = await member(h, 'Amina');
		const { g: b, opened } = await member(h, 'Bo');
		a.actions.presentToEveryone(true);
		// biome-ignore lint/suspicious/noExplicitAny: a modified client posting a room event.
		(a as any).post({ k: 'present', on: true, i: 0, p: 0, l: 'full' });
		await settle(h, a, b);
		expect(opened).toEqual([]);
		expect(b.view().present).toBeNull();
	});

	it('someone who joins during a presentation joins it where it is', async () => {
		const { h } = await hostSession();
		h.actions.presentTransport({ idx: 4, page: 0, lens: 'full' });
		h.actions.presentToEveryone(true);
		const { g, opened } = await member(h, 'Amina');
		await until(() => opened.includes('open') && g.view().present?.idx === 4, h, g);
	});

	it("a start carries where the host's Present is now, not where the last presentation ended", async () => {
		const { h } = await hostSession();
		const { g } = await member(h, 'Amina');
		const sent: number[] = [];
		// biome-ignore lint/suspicious/noExplicitAny: watching what the host posts.
		const hh = h as any;
		const post = hh.post.bind(hh);
		hh.post = (m: { k: string; on?: boolean; i?: number }, to?: string) => {
			if (m.k === 'present' && m.on) sent.push(m.i as number);
			return post(m, to);
		};
		h.actions.presentTransport({ idx: 5, page: 0, lens: 'full' });
		h.actions.presentToEveryone(true);
		// The host's Present opens and reports: that is the start.
		h.actions.presentTransport({ idx: 1, page: 0, lens: 'full' });
		await until(() => g.view().present?.idx === 1, h, g);
		expect(sent[0]).toBe(1);
		expect(sent).not.toContain(5);
	});

	it('a fast run of steps goes out as a few posts, ending where the host stopped', async () => {
		const { h } = await hostSession();
		const { g } = await member(h, 'Amina');
		h.actions.presentToEveryone(true);
		h.actions.presentTransport({ idx: 0, page: 0, lens: 'full' });
		await until(() => g.view().present !== null, h, g);
		let posts = 0;
		// biome-ignore lint/suspicious/noExplicitAny: watching what the host posts.
		const hh = h as any;
		const post = hh.post.bind(hh);
		hh.post = (m: { k: string }, to?: string) => {
			if (m.k === 'present') posts++;
			return post(m, to);
		};
		for (let i = 1; i <= 30; i++) h.actions.presentTransport({ idx: i, page: 0, lens: 'full' });
		await until(() => g.view().present?.idx === 30, h, g);
		expect(posts).toBeLessThanOrEqual(3);
	});

	it('a host who stops and starts again within the restart window still brings members back', async () => {
		const { h } = await hostSession();
		const { g, opened } = await member(h, 'Amina');
		// Past the newcomer's welcome (a beat after admission), which would otherwise carry the start again.
		await new Promise((r) => setTimeout(r, 3000));
		await settle(h, g);
		h.actions.presentToEveryone(true);
		h.actions.presentTransport({ idx: 2, page: 0, lens: 'full' });
		await until(() => g.view().present?.idx === 2, h, g);
		// Stop and start back to back: the start reaches the member well inside its window from the first one.
		h.actions.presentToEveryone(false);
		h.actions.presentToEveryone(true);
		h.actions.presentTransport({ idx: 2, page: 0, lens: 'full' });
		await until(() => g.view().present === null, h, g);
		// The first start lands inside the member's 2 s window and is dropped; the repeat, just past it, is not.
		await new Promise((r) => setTimeout(r, 2500));
		await until(() => g.view().present?.idx === 2, h, g);
		expect(opened.filter((o) => o === 'open').length).toBe(2);
	}, 20000);

	it('a transport outside any deck, by slide or by page, is dropped', async () => {
		const { h } = await hostSession();
		const { g } = await member(h, 'Amina');
		h.actions.presentToEveryone(true);
		h.actions.presentTransport({ idx: 1, page: 0, lens: 'full' });
		await until(() => g.view().present?.idx === 1, h, g);
		// biome-ignore lint/suspicious/noExplicitAny: the host sending positions no deck has.
		const hh = h as any;
		hh.post({ k: 'present', on: true, i: 1e9, p: 0, l: 'full' });
		hh.post({ k: 'present', on: true, i: 2, p: -1, l: 'full' });
		hh.post({ k: 'present', on: true, i: 2.5, p: 0, l: 'full' });
		await settle(h, g);
		expect(g.view().present?.idx).toBe(1);
	});

	describe('narration clips for a member off the call', () => {
		const HASH = 'aaaaaaaaaaaaaaaa';
		/** An mp3 as far as its first frame header goes (MPEG-2 layer III, 24 kHz, `idx` is the bitrate index: 8 is 64 kbps). */
		const clip = (n: number, fill = 7, idx = 8) => {
			const bytes = new Uint8Array(n).fill(fill);
			bytes.set([0xff, 0xf3, (idx << 4) | 0x04, 0x00]);
			return { bytes, mime: 'audio/mpeg' };
		};
		/** Asks and pumps the in-memory network until the answer is in. An ask nobody answers is canceled after
		 *  `ms`, so it ends the test instead of waiting out the retries. */
		const askFor = async (h: Ctl, g: Ctl, hash: string, len: number, ms = 600) => {
			const stop = new AbortController();
			setTimeout(() => stop.abort(), ms);
			let done = false;
			let out: Awaited<ReturnType<Ctl['actions']['askClip']>> = null;
			void g.actions.askClip(hash, len, stop.signal).then((c) => {
				out = c;
				done = true;
			});
			await until(() => done, h, g);
			return out as Awaited<ReturnType<Ctl['actions']['askClip']>>;
		};
		async function presenting(serve: (hash: string) => Promise<ReturnType<typeof clip> | null>) {
			const { h } = await hostSession();
			const m = await member(h, 'Amina');
			h.actions.serveClips(serve);
			h.actions.presentTransport({ idx: 0, page: 0, lens: 'full', voice: true });
			h.actions.presentToEveryone(true);
			await until(() => m.g.view().present?.voice === true, h, m.g);
			return { h, ...m };
		}

		it('the presenter says it narrates, and a member gets the clip it asks for', async () => {
			const asked: string[] = [];
			const { h, g } = await presenting(async (hash) => {
				asked.push(hash);
				return clip(900);
			});
			const got = await askFor(h, g, HASH, 40, 5000);
			expect(asked).toEqual([HASH]);
			expect(got?.bytes.length).toBe(900);
			expect(got?.mime).toBe('audio/mpeg');
			// Asked again, it is held: the presenter is not asked twice.
			await askFor(h, g, HASH, 40, 5000);
			expect(asked).toEqual([HASH]);
		});

		it('turning Voice on or off alone, with the slide unmoved, still tells the members', async () => {
			const { h, g } = await presenting(async () => null);
			h.actions.presentTransport({ idx: 0, page: 0, lens: 'full', voice: false });
			await until(() => g.view().present?.voice === undefined, h, g);
			h.actions.presentTransport({ idx: 0, page: 0, lens: 'full', voice: true });
			await until(() => g.view().present?.voice === true, h, g);
		});

		it('a clip nobody asked for, or from a member, is dropped', async () => {
			const { h, g, g: member } = await presenting(async () => clip(300, 9));
			// biome-ignore lint/suspicious/noExplicitAny: the host and a member posting clips unasked.
			const hh = h as any;
			hh.post({ k: 'clip', h: HASH, m: 'audio/mpeg', d: btoa('\x01\x02\x03') });
			// biome-ignore lint/suspicious/noExplicitAny: a forged clip from a member, to the other member.
			(member as any).post({ k: 'clip', h: HASH, m: 'audio/mpeg', d: btoa('\x01\x02\x03') });
			await settle(h, g);
			const got = await askFor(h, g, HASH, 40, 5000);
			expect(got?.bytes.length).toBe(300);
			expect(got?.bytes[4]).toBe(9);
		});

		it('a clip far larger than its text could be, and one of a wrong type, are refused', async () => {
			const { h, g } = await presenting(async () => clip(100_000));
			expect(await askFor(h, g, HASH, 10)).toBeNull();
			const { h: h2, g: g2 } = await presenting(async () => ({ bytes: new Uint8Array(500), mime: 'audio/wav' }));
			expect(await askFor(h2, g2, HASH, 40)).toBeNull();
		});

		it('a clip whose header makes it far longer than its sentence, or too low in bitrate to be speech, is refused before decoding', async () => {
			// 8 kbps for 80,000 bytes is 80 s of audio for a 10-character sentence.
			const { h, g } = await presenting(async () => clip(40_000, 7, 1));
			expect(await askFor(h, g, HASH, 10)).toBeNull();
			// 64 kbps for 40,000 bytes is 5 s, but the sentence is 10 characters: 6 s allowed, so it passes; 20 s does not.
			const { h: h2, g: g2 } = await presenting(async () => clip(160_000));
			expect(await askFor(h2, g2, HASH, 10)).toBeNull();
			// Not an mp3 at all.
			const { h: h3, g: g3 } = await presenting(async () => ({ bytes: new Uint8Array(900).fill(7), mime: 'audio/mpeg' }));
			expect(await askFor(h3, g3, HASH, 40)).toBeNull();
		});

		it('is not answered unless the host is presenting to everyone, and never from a hash the serve function does not know', async () => {
			const { h } = await hostSession();
			const { g } = await member(h, 'Amina');
			let served = 0;
			h.actions.serveClips(async () => {
				served++;
				return clip(200);
			});
			// Not presenting: the member has no presentation to ask about, and a forged ask is not answered.
			expect(await g.actions.askClip(HASH, 40)).toBeNull();
			// biome-ignore lint/suspicious/noExplicitAny: a modified client asking anyway.
			(g as any).post({ k: 'cw', h: HASH }, (h as any).rt.session.getState().me.id);
			await settle(h, g);
			expect(served).toBe(0);
			h.actions.presentToEveryone(true);
			await until(() => h.view().presentingToAll, h, g);
			// A hash that is not 16 hex digits is not even passed on.
			// biome-ignore lint/suspicious/noExplicitAny: a modified client sending a text key.
			(g as any).post({ k: 'cw', h: '["kokoro","m","v",1,"my other deck"]' }, (h as any).rt.session.getState().me.id);
			await settle(h, g);
			expect(served).toBe(0);
		});

		it('answers one member at a bounded rate', async () => {
			let served = 0;
			const { h, g } = await presenting(async () => {
				served++;
				return null;
			});
			// biome-ignore lint/suspicious/noExplicitAny: a modified client flooding asks.
			const gg = g as any;
			const hostId = gg.roomPresentHost as string;
			for (let i = 0; i < 60; i++) gg.post({ k: 'cw', h: i.toString(16).padStart(16, '0') }, hostId);
			await settle(h, g);
			expect(served).toBeGreaterThan(0);
			expect(served).toBeLessThanOrEqual(12);
		});

		it('a clip is not sent to the same member twice in a few seconds, however often they ask', async () => {
			const { h, g } = await presenting(async () => clip(200));
			let sent = 0;
			const real = (h as unknown as { post: (p: { k: string }, to?: string) => void }).post.bind(h);
			(h as unknown as { post: (p: { k: string }, to?: string) => void }).post = (p, to) => {
				if (p.k === 'clip') sent++;
				real(p, to);
			};
			// biome-ignore lint/suspicious/noExplicitAny: a retrying member asking again before the answer lands.
			const gg = g as any;
			const hostId = gg.roomPresentHost as string;
			for (let i = 0; i < 4; i++) gg.post({ k: 'cw', h: HASH }, hostId);
			await settle(h, g);
			gg.post({ k: 'cw', h: HASH }, hostId);
			await settle(h, g);
			expect(sent).toBe(1);
		});

		it('are forgotten when the presentation ends: a second run asks the presenter again', async () => {
			let served = 0;
			const { h, g } = await presenting(async () => {
				served++;
				return clip(400);
			});
			expect((await askFor(h, g, HASH, 40, 5000))?.bytes.length).toBe(400);
			expect(served).toBe(1);
			h.actions.presentToEveryone(false);
			await until(() => g.view().present === null, h, g);
			expect(await g.actions.askClip(HASH, 40)).toBeNull();
			// A new run, after the restart window: the member holds nothing from the last one.
			await new Promise((r) => setTimeout(r, 2300));
			h.actions.presentToEveryone(true);
			await until(() => g.view().present?.voice === true, h, g);
			expect((await askFor(h, g, HASH, 40, 5000))?.bytes.length).toBe(400);
			expect(served).toBe(2);
		}, 20000);
	});

	it('mixing into the call reaches the call audio, and a new stream takes the old one out', async () => {
		const { h } = await hostSession();
		const calls: string[] = [];
		// biome-ignore lint/suspicious/noExplicitAny: a stand-in for the call's audio.
		(h as any).audio = { mixIntoSend: (s: { id: string }) => calls.push(`mix ${s.id}`), unmix: (s: { id: string }) => calls.push(`unmix ${s.id}`) };
		h.actions.mixIntoCall({ id: 'a' } as unknown as MediaStream);
		h.actions.mixIntoCall({ id: 'b' } as unknown as MediaStream);
		h.actions.mixIntoCall(null);
		expect(calls).toEqual(['mix a', 'unmix a', 'mix b', 'unmix b']);
	});

	it('a malformed transport is dropped', async () => {
		const { h } = await hostSession();
		const { g } = await member(h, 'Amina');
		h.actions.presentToEveryone(true);
		await until(() => g.view().present !== null, h, g);
		// biome-ignore lint/suspicious/noExplicitAny: the host sending a slide past any deck and a lens with markup.
		(h as any).post({ k: 'present', on: true, i: 1e9, p: 0, l: '<img>' });
		await settle(h, g);
		expect(g.view().present?.idx).toBe(0);
	});

	// Show me together (§7.5).
	const hostTours = (h: Ctl) => {
		const started: string[] = [];
		// biome-ignore lint/suspicious/noExplicitAny: the host's own shell callback.
		(h as any).host.startTour = (id: string) => started.push(id);
		return started;
	};

	it('the host plays a shipped tour for everyone: the host and an idle member both start it', async () => {
		const { h } = await hostSession();
		const { g, opened } = await member(h, 'Amina');
		const started = hostTours(h);
		expect(h.actions.tourForEveryone('first-look')).toBe('sent');
		await until(() => opened.includes('tour first-look') && started.includes('first-look'), h, g);
	});

	it('alone in a session, or as a member, a tour plays here only', async () => {
		const { h } = await hostSession();
		expect(h.actions.tourForEveryone('first-look')).toBe('solo');
		const { g } = await member(h, 'Amina');
		expect(g.actions.tourForEveryone('first-look')).toBe('solo');
		expect(h.actions.tourForEveryone('not-a-tour')).toBe('solo');
	});

	it('a member typing is asked to watch instead of having a tour start under their cursor', async () => {
		const { h } = await hostSession();
		const { g, opened, asks } = await member(h, 'Amina');
		// biome-ignore lint/suspicious/noExplicitAny: a local keystroke on the shared text.
		(g as any).rt.ytext.insert(0, 'x');
		h.actions.tourForEveryone('first-look');
		await until(() => asks.some((a) => a.includes('is showing')), h, g);
		await settle(h, g);
		expect(opened.filter((o) => o.startsWith('tour'))).toEqual([]);
	});

	it('a tour waits while the host presents to everyone, and a member watching a presentation is asked', async () => {
		const { h } = await hostSession();
		const { g, opened, asks } = await member(h, 'Amina');
		hostTours(h);
		h.actions.presentToEveryone(true);
		h.actions.presentTransport({ idx: 1, page: 0, lens: 'full' });
		await until(() => g.view().present !== null, h, g);
		expect(h.actions.tourForEveryone('first-look')).toBe('presenting');
		// A tour that reaches someone watching a presentation (an older host) does not start under Present.
		// biome-ignore lint/suspicious/noExplicitAny: the host posting the tour as an older build would.
		(h as any).post({ k: 'tour', id: 'first-look', at: 0 });
		await until(() => asks.some((a) => a.includes('is showing')), h, g);
		expect(opened.filter((o) => o.startsWith('tour'))).toEqual([]);
	});

	it('the host keeps the same restart window as its members, so it never plays a tour the room dropped', async () => {
		const { h } = await hostSession();
		const { g, opened } = await member(h, 'Amina');
		const started = hostTours(h);
		expect(h.actions.tourForEveryone('first-look')).toBe('sent');
		await until(() => opened.includes('tour first-look') && started.length === 1, h, g);
		expect(h.actions.tourForEveryone('first-look')).toBe('wait');
		await new Promise((r) => setTimeout(r, 900));
		expect(started.length).toBe(1);
	});

	it('only the host starts a tour, only a shipped one, and not twice in quick succession', async () => {
		const { h } = await hostSession();
		const { g: a } = await member(h, 'Amina');
		const { g: b, opened } = await member(h, 'Bo');
		// biome-ignore lint/suspicious/noExplicitAny: a modified client posting a room event.
		(a as any).post({ k: 'tour', id: 'first-look', at: 0 });
		// biome-ignore lint/suspicious/noExplicitAny: the host sending an id that is not a shipped tour.
		(h as any).post({ k: 'tour', id: 'javascript:alert(1)', at: 0 });
		await settle(h, a, b);
		await new Promise((r) => setTimeout(r, 50));
		expect(opened.filter((o) => o.startsWith('tour'))).toEqual([]);
		h.actions.tourForEveryone('first-look');
		h.actions.tourForEveryone('first-look');
		await until(() => opened.includes('tour first-look'), h, a, b);
		await settle(h, a, b);
		await new Promise((r) => setTimeout(r, 900));
		expect(opened.filter((o) => o.startsWith('tour')).length).toBe(1);
	});
});

// AI activity and share (2026-10-20-live-uniform-experience.md §5.3).
describe('LiveController: AI activity and share', () => {
	const notes = (c: Ctl) => c.view().chat.filter((l): l is Extract<typeof l, { kind: 'message' }> => l.kind === 'message' && !!l.note);

	it('the room sees that a member is asking the AI, and nothing of what is asked', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		g.update(deps('shared-deck', { asking: true }));
		await until(() => h.view().people.find((p) => p.name === 'Amina')?.doing?.asking === true, h, g);
		// biome-ignore lint/suspicious/noExplicitAny: the presence the host received, whole.
		const raw = JSON.stringify([...(h as any).rt.aw.getStates().values()]);
		expect(raw).not.toMatch(/prompt|ask[^i]|openrouter|sk-or|cost/i);
		g.update(deps('shared-deck', { asking: false }));
		await until(() => !h.view().people.find((p) => p.name === 'Amina')?.doing?.asking, h, g);
	});

	it("an applied AI edit and a shared turn reach everyone as notes under the sender's name", async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		g.actions.noteAiEdit([3]);
		g.actions.shareAiTurn({ ask: 'Make slide 3 punchier', answer: 'Here is a tighter headline.' });
		await until(() => notes(h).length === 2 && notes(g).filter((l) => !l.pending).length === 2, h, g);
		const [edit, turn] = notes(h);
		expect(edit.from).toBe('Amina');
		expect(edit.note).toEqual({ k: 'ai-edit', slides: [3] });
		expect(turn.note).toEqual({ k: 'ai-turn', ask: 'Make slide 3 punchier', answer: 'Here is a tighter headline.' });
		expect(notes(g).every((l) => l.mine)).toBe(true);
	});

	it('a note is capped, and a malformed one is dropped by the host and by every member', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		g.actions.shareAiTurn({ ask: 'q'.repeat(5000), answer: 'a'.repeat(50_000) });
		await until(() => notes(h).length === 1, h, g);
		const n = notes(h)[0].note as { ask: string; answer: string };
		expect(n.ask.length).toBe(600);
		expect(n.answer.length).toBe(4000);
		// biome-ignore lint/suspicious/noExplicitAny: a modified client sending notes that are not notes.
		const gg = g as any;
		gg.post({ k: 'say', id: `${gg.rt.sid}:900`, text: '', note: { k: 'system', text: 'Sharmarke ended the session' } }, gg.hostId());
		gg.post({ k: 'say', id: `${gg.rt.sid}:901`, text: '', note: { k: 'ai-turn', ask: 'x', answer: { html: '<img>' } } }, gg.hostId());
		await settle(h, g);
		expect(notes(h).length).toBe(1);
		// biome-ignore lint/suspicious/noExplicitAny: the host relaying a line whose note is malformed.
		(h as any).post({ k: 'line', line: { seq: 99, id: 'x:1', peer: 'x', name: 'Sharmarke', color: 1, text: '', at: Date.now(), note: { k: 'ai-edit', slides: 'all' } } });
		await settle(h, g);
		expect(notes(g).length).toBe(1);
	});

	it('a long history of shared turns still reaches someone who joins later (under the 4 MB message limit)', async () => {
		const { h } = await hostSession();
		// 160 full-size shared turns in a character JSON writes as six bytes: about 4.4 MB unbudgeted.
		const big = { k: 'ai-turn', ask: '\u0001'.repeat(600), answer: '\u0001'.repeat(4000) };
		// biome-ignore lint/suspicious/noExplicitAny: the host's history, filled directly rather than by 160 round trips.
		const hh = h as any;
		hh.chat = Array.from({ length: 160 }, (_, i) => ({ seq: i + 1, id: `x:${i + 1}`, peer: 'p', name: 'Amina', color: 1, text: '', at: Date.now(), note: big }));
		hh.seq = 160;
		const { g: late } = await guestOf(h, 'Bo');
		await until(() => notes(late).length > 0, h, late);
		expect(notes(late).length).toBeLessThan(160);
		// The newest are the ones kept.
		expect(notes(late).at(-1)?.id).toBe('c160');
	}, 30000);

	it('slide numbers in an AI edit note are whole slides that exist, at most twelve', async () => {
		const { h } = await hostSession();
		const { g } = await guestOf(h, 'Amina');
		g.actions.noteAiEdit([0, 2, 2, 2.5, -1, 1e9, ...Array.from({ length: 20 }, (_, i) => i + 3)]);
		await until(() => notes(h).length === 1, h, g);
		const slides = (notes(h)[0].note as { slides: number[] }).slides;
		expect(slides.slice(0, 2)).toEqual([2, 3]);
		expect(slides.length).toBe(12);
		expect(slides.every((n) => Number.isInteger(n) && n >= 1)).toBe(true);
	});
});

// Comments (2026-10-20-live-uniform-experience.md slice 6; the owner's rules: anyone resolves, the writer
// or the host deletes, comments from before the session are shared on request).
describe('LiveController: comments', () => {
	type Applied = { deck: string; set: Array<{ id: string; author: string; resolved: boolean }>; del: string[] };
	const watch = (c: Ctl) => {
		const got: Applied[] = [];
		// biome-ignore lint/suspicious/noExplicitAny: the shell's callback.
		(c as any).host.applyComments = (deck: string, set: Applied['set'], del: string[]) => got.push({ deck, set, del });
		return got;
	};
	// biome-ignore lint/suspicious/noExplicitAny: what this browser's session holds.
	const held = (c: Ctl) => [...((c as any).cmts as Map<string, { id: string; author: string; resolved: boolean; owner: string }>).values()];
	const add = (c: Ctl, id: string, body = 'Check this number') => c.actions.commentAdded({ id, slide: 2, body, createdAt: Date.now() });

	it("a comment written in the session reaches everyone under the writer's name, and is 'You' on the writer's copy", async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		const { g: b } = await guestOf(h, 'Bo');
		const gotA = watch(a);
		const gotB = watch(b);
		add(a, 'c1');
		await until(() => held(h).length === 1 && held(b).length === 1 && held(a).length === 1, h, a, b);
		expect(held(h)[0].author).toBe('Amina');
		expect(gotB.at(-1)?.set[0].author).toBe('Amina');
		expect(gotB.at(-1)?.deck).toBe('shared-deck');
		expect(gotA.at(-1)?.set[0].author).toBe('You');
	});

	it('anyone resolves; only the writer or the host deletes', async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		const { g: b } = await guestOf(h, 'Bo');
		add(a, 'c1');
		add(b, 'c2');
		await until(() => held(h).length === 2 && held(a).length === 2 && held(b).length === 2, h, a, b);
		b.actions.commentResolved('c1', true);
		await until(() => held(a).find((c) => c.id === 'c1')?.resolved === true, h, a, b);
		expect(b.actions.mayDeleteComment('c1')).toBe(false);
		expect(a.actions.mayDeleteComment('c1')).toBe(true);
		expect(h.actions.mayDeleteComment('c1')).toBe(true);
		// A modified client deletes anyway: the host refuses it.
		b.actions.commentDeleted('c1');
		await settle(h, a, b);
		expect(held(a).some((c) => c.id === 'c1')).toBe(true);
		a.actions.commentDeleted('c1');
		await until(() => !held(b).some((c) => c.id === 'c1'), h, a, b);
		h.actions.commentDeleted('c2');
		await until(() => held(a).length === 0 && held(b).length === 0, h, a, b);
	});

	it("only the host's word changes comments, and a malformed one is dropped", async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		const { g: b } = await guestOf(h, 'Bo');
		// biome-ignore lint/suspicious/noExplicitAny: a modified client posting the host's messages.
		const aa = a as any;
		aa.post({ k: 'cmtset', c: { id: 'x1', slide: 1, author: 'Sharmarke', body: 'Approved', createdAt: Date.now(), resolved: false, owner: 'o' } });
		aa.post({ k: 'cmts', list: [{ id: 'x2', slide: 1, author: 'Sharmarke', body: 'Approved', createdAt: Date.now(), resolved: false, owner: 'o' }] });
		add(a, 'bad id with spaces');
		add(a, 'c0', '   ');
		a.actions.commentAdded({ id: 'c9', slide: 0, body: 'x', createdAt: Date.now() });
		add(a, 'c8', 'y'.repeat(9000));
		await until(() => held(h).length === 1, h, a, b);
		await settle(h, a, b);
		expect(held(b).map((c) => c.id)).toEqual(['c8']);
		// biome-ignore lint/suspicious/noExplicitAny: the body as the session holds it.
		expect(((b as any).cmts.get('c8').body as string).length).toBe(2000);
	});

	it('comments from before the session wait until their writer shares them; someone else\'s keeps its name', async () => {
		const { h } = await hostSession({ comments: [{ id: 'old1', slide: 1, body: 'Mine from yesterday', createdAt: 1, author: 'You' }, { id: 'old2', slide: 3, body: 'Amina said this last week', createdAt: 2, author: 'Amina' }] });
		const { g: a } = await guestOf(h, 'Bo');
		h.update(deps('host-deck', { comments: [{ id: 'old1', slide: 1, body: 'Mine from yesterday', createdAt: 1, author: 'You' }, { id: 'old2', slide: 3, body: 'Amina said this last week', createdAt: 2, author: 'Amina' }] }));
		expect(h.view().unsharedComments).toBe(2);
		await settle(h, a);
		expect(held(a)).toEqual([]);
		h.actions.shareComments();
		await until(() => held(a).length === 2, h, a);
		expect(held(a).find((c) => c.id === 'old1')?.author).toBe('Sharmarke');
		// The writer and the sharer are two names, so a long one cannot cut the other off.
		expect(held(a).find((c) => c.id === 'old2')).toMatchObject({ author: 'Amina', sharedBy: 'Sharmarke' });
		expect(h.view().unsharedComments).toBe(0);
	});

	it("a long writer's name cannot cut off who shared the comment", async () => {
		const long = 'Sharmarke Aden, Chief Executive Officer';
		const kept = [{ id: 'old9', slide: 1, body: 'Signed off', createdAt: 1, author: long }];
		const { h } = await hostSession();
		const { g: m } = await guestOf(h, 'Mallory', { comments: kept });
		const { g: b } = await guestOf(h, 'Bo');
		m.update(deps('shared-deck', { comments: kept }));
		m.actions.shareComments();
		await until(() => held(b).length === 1, h, m, b);
		expect(held(b)[0]).toMatchObject({ author: long, sharedBy: 'Mallory' });
	});

	it('someone who joins later gets every shared comment', async () => {
		const { h } = await hostSession();
		const { g: a } = await guestOf(h, 'Amina');
		add(a, 'c1');
		add(a, 'c2');
		await until(() => held(h).length === 2, h, a);
		const { g: b } = await guestOf(h, 'Bo');
		await until(() => held(b).length === 2, h, a, b);
	});
});

