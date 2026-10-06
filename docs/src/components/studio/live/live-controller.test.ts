import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryNetwork, type MemoryNetwork } from '@/lib/tavola/memory';
import type { Transport } from '@/lib/tavola/types';
import type { LiveDeps, LiveHost } from './live-store';
import { takeLiveIntent } from './live-store';

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

const { LiveController } = await import('./live-controller');
type Ctl = InstanceType<typeof LiveController>;

const deps = (deckId: string): LiveDeps => ({ source: '# Q3 Board Review\n', deckId, deckTitle: 'Q3 Board Review', slideCount: 1, theme: 'indaco', activeSlide: 0 });
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

async function hostSession() {
	const sh = shell();
	// Each controller is its own browser tab: no chat-id prefixes inherited (jsdom shares storage).
	sessionStorage.removeItem('lattice-live-sids');
	const h = new LiveController(sh.host, deps('host-deck'));
	h.actions.start('Sharmarke');
	await until(() => h.view().status === 'live', h);
	return { h, notes: sh.notes };
}
async function guestOf(h: Ctl, name: string) {
	const sh = shell();
	// Each guest is its own browser: no rejoin token left by the one before (jsdom shares storage).
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
