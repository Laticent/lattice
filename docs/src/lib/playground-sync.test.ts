import { describe, expect, it } from 'vitest';
import { buildDeckIndex, deckOutliner } from './deck-outline';
import { createFocusHub } from './fuoco/hub';
import { createPlaygroundSync, type SyncPorts } from './playground-sync';
import { buildRenderedIndex } from './rendered-index';

const deck = ['---', 'theme: indaco', '---', '', '# One', 'alpha', '', '---', '', '# Two', 'beta', '', '---', '', '# Three', 'gamma', ''].join('\n');
const pageOf = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));

function rig(source = deck) {
	const log: string[] = [];
	const state = { editing: true, editor: true, active: true, canPick: true, reading: null as number | null, showOk: true, now: 0 };
	const timers: Array<{ id: number; at: number; cb: () => void }> = [];
	const rafs: Array<{ id: number; cb: () => void }> = [];
	let ids = 0;
	const ports: SyncPorts = {
		editor: () =>
			state.editor
				? {
						setBand: (r) => log.push(`band ${r ? `${r.from}-${r.to}` : 'none'}`),
						revealSlide: (a) => log.push(`reveal caret=${a.caret} from=${a.from} to=${a.to} grab=${!!a.grab}`),
						showRange: (a) => log.push(`show ${a.from}-${a.to}`),
					}
				: null,
		reading: (_c, _n) => state.reading,
		show: (page, o) => {
			log.push(`page ${page} follow=${o.follow} instant=${o.instant}`);
			return state.showOk;
		},
		active: () => state.active,
		editing: () => state.editing,
		canPick: () => state.canPick,
		now: () => state.now,
		raf: (cb) => {
			rafs.push({ id: ++ids, cb });
			return ids;
		},
		cancelRaf: (id) => void rafs.splice(0, rafs.length, ...rafs.filter((r) => r.id !== id)),
		timeout: (cb, ms) => {
			timers.push({ id: ++ids, at: state.now + ms, cb });
			return ids;
		},
		clearTimeout: (id) => void timers.splice(0, timers.length, ...timers.filter((t) => t.id !== id)),
	};
	const hub = createFocusHub({ outliner: deckOutliner });
	hub.update(source, { by: 'editor' });
	const sync = createPlaygroundSync(hub, ports);
	const settle = async () => {
		await Promise.resolve();
		await Promise.resolve();
	};
	const land = async (src = source, n = 3, patched = true) => {
		const ix = buildRenderedIndex(pageOf(n), buildDeckIndex(src));
		sync.rendered(src, () => Promise.resolve(ix), patched);
		await settle();
	};
	const tick = (ms: number) => {
		state.now += ms;
		for (const t of timers.splice(0).sort((a, b) => a.at - b.at)) {
			if (t.at <= state.now) t.cb();
			else timers.push(t);
		}
	};
	const frame = () => {
		for (const r of rafs.splice(0)) r.cb();
		hub.flush();
	};
	return { hub, sync, log, state, land, tick, frame, settle, ports };
}

const at = (needle: string, from = 0) => deck.indexOf(needle, from);

describe('the caret parks while the preview is scrolled', () => {
  it('a scroll marks and shows the viewed slide and never moves the caret', async () => {
		const r = rig();
		await r.land();
		r.state.reading = 1;
		r.sync.scrolled();
		r.frame();
		r.frame();
		expect(r.hub.get()).toMatchObject({ origin: 'preview', flat: 1 });
		expect(r.log.some((l) => l.startsWith('show '))).toBe(true);
		expect(r.log.some((l) => l.startsWith('reveal'))).toBe(false);
		// The preview does not chase its own report.
		expect(r.log.some((l) => l.startsWith('page '))).toBe(false);
	});

	it('the next caret report returns the band and the preview to the caret slide', async () => {
		const r = rig();
		await r.land();
		r.sync.selected({ head: at('alpha'), anchor: at('alpha'), line: 'alpha', user: true });
		r.frame();
		r.state.reading = 2;
		r.sync.scrolled();
		r.frame();
		r.frame();
		expect(r.hub.get().flat).toBe(2);
		r.log.length = 0;
		r.sync.selected({ head: at('alpha') + 1, anchor: at('alpha') + 1, line: 'alpha', user: true });
		r.frame();
		r.tick(120);
		expect(r.hub.get()).toMatchObject({ origin: 'editor', flat: 0 });
		expect(r.log.some((l) => /^band/.test(l))).toBe(true);
		expect(r.log).toContain('page 0 follow=true instant=false');
		expect(r.log.some((l) => l.startsWith('reveal'))).toBe(false);
	});

	it('a scroll that is our own follow does not report back', async () => {
		const r = rig();
		await r.land();
		r.sync.selected({ head: at('gamma'), anchor: at('gamma'), line: 'gamma', user: true });
		r.frame();
		r.tick(120);
		r.state.reading = 1; // the preview passes through slide 2 on the way
		r.sync.scrolled();
		r.frame();
		expect(r.hub.get().flat).toBe(2);
		r.tick(400);
		r.state.reading = 2;
		r.sync.scrolled();
		r.frame();
		expect(r.hub.get().flat).toBe(2);
	});
});

describe('a pick moves the caret', () => {
	it('a map tile reveals the slide, caret at the end of its title, and scrolls the preview', async () => {
		const r = rig();
		await r.land();
		r.hub.go('rail', { flat: 1 });
		r.frame();
		const title = at('# Two') + '# Two'.length;
		const frameFrom = at('---', at('alpha'));
		const frameTo = at('---', at('beta')) + 3;
		expect(r.log).toContain(`reveal caret=${title} from=${frameFrom} to=${frameTo} grab=false`);
		expect(r.log).toContain('page 1 follow=false instant=false');
	});

	it('a click on a slide in the preview reveals it, grabs focus, and does not scroll the preview', async () => {
		const r = rig();
		await r.land();
		r.sync.picked(2, { grab: true });
		r.frame();
		const title = at('# Three') + '# Three'.length;
		expect(r.log.find((l) => l.startsWith('reveal'))).toMatch(`caret=${title}`);
		expect(r.log.find((l) => l.startsWith('reveal'))).toMatch('grab=true');
		expect(r.log.some((l) => l.startsWith('page '))).toBe(false);
	});

	it('a click while the editor is off screen places nothing', async () => {
		const r = rig();
		await r.land();
		r.state.canPick = false;
		r.sync.picked(2, { grab: true });
		r.frame();
		expect(r.log.some((l) => l.startsWith('reveal'))).toBe(false);
	});

	it('a walk step (origin preview, a go) shows the slide and never takes the caret', async () => {
		const r = rig();
		await r.land();
		r.hub.go('preview', { flat: 2 });
		r.frame();
		expect(r.log.some((l) => l.startsWith('reveal'))).toBe(false);
		expect(r.log.some((l) => l.startsWith('show '))).toBe(true);
	});
});

describe('two texts', () => {
	it('waits for the render of what was typed, then follows once, instantly after a full write', async () => {
		const r = rig();
		await r.land();
		const typed = `${deck}\n---\n\n# Four\n`;
		r.sync.edited(typed);
		r.sync.selected({ head: typed.length, anchor: typed.length, line: '', user: true });
		r.frame();
		r.tick(120);
		expect(r.log.some((l) => l.startsWith('page '))).toBe(false);
		expect(r.sync.pending()).toBe(true);
		await r.land(typed, 4);
		expect(r.log).toContain('page 3 follow=true instant=false');
		expect(r.sync.pending()).toBe(false);
	});

	it('does not read the preview while the text it shows is stale', async () => {
		const r = rig();
		await r.land();
		r.sync.edited(`${deck}x`);
		r.state.reading = 2;
		r.sync.scrolled();
		r.frame();
		expect(r.hub.get().origin).not.toBe('preview');
	});

	it('loaded() follows when a follow was owed, and says so', async () => {
		const r = rig();
		expect(r.sync.loaded()).toBe(false);
		r.sync.selected({ head: at('gamma'), anchor: at('gamma'), line: 'gamma', user: true });
		r.frame();
		r.tick(120);
		expect(r.sync.pending()).toBe(true);
		await r.land();
		expect(r.sync.loaded()).toBe(false);
	});
});

describe('outside Edit the render is the text of record', () => {
	it('feeds the hub the rendered source, and ignores the editor, until Edit returns', async () => {
		const r = rig();
		r.state.editing = false;
		const gallery = '# Only\n\n---\n\n# Two\n';
		r.sync.edited('typed while hidden');
		expect(r.hub.outline()?.source).toBe(deck);
		await r.land(gallery, 2);
		expect(r.hub.outline()?.source).toBe(gallery);
		r.hub.go('rail', { flat: 1 });
		r.frame();
		expect(r.log).toContain('page 1 follow=false instant=false');
		// The hidden editor holds other text: nothing is revealed, shown or marked in it.
		expect(r.log.some((l) => /^(band|reveal|show )/.test(l))).toBe(false);
		r.state.editing = true;
		r.sync.edited(deck);
		expect(r.hub.outline()?.source).toBe(deck);
	});
});

describe('the band', () => {
	it('marks the focused slide including its fences, and follows an edit that moves them', async () => {
		const r = rig();
		await r.land();
		r.sync.selected({ head: at('beta'), anchor: at('beta'), line: 'beta', user: true });
		r.frame();
		const first = r.log.filter((l) => l.startsWith('band'));
		expect(first.at(-1)).toBe(`band ${at('---', at('alpha'))}-${at('---', at('beta')) + 3}`);
		const split = `${deck.slice(0, at('beta'))}b\n\n---\n\nmore${deck.slice(at('beta') + 1)}`;
		r.log.length = 0;
		r.sync.edited(split, { from: at('beta'), toA: at('beta') + 1, toB: at('beta') + 10 });
		r.frame();
		expect(r.log.some((l) => l.startsWith('band'))).toBe(true);
	});
});
