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
	const h = new LiveController(sh.host, deps('host-deck'));
	h.actions.start('Sharmarke');
	await until(() => h.view().status === 'live', h);
	return { h, notes: sh.notes };
}
async function guestOf(h: Ctl, name: string) {
	const sh = shell();
	// Each guest is its own browser: no rejoin token left by the one before (jsdom shares storage).
	localStorage.removeItem('lattice-live-links');
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
});
