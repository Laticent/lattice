import { describe, expect, it } from 'vitest';
import { buildDeckIndex, deckOutliner } from './deck-outline';
import { centeredAt, createScrollMap, maxScroll, sectionAt } from './fuoco/align';
import { createFocusHub } from './fuoco/hub';
import { createPlaygroundSync, type ScrolledLayout, type SyncPorts } from './playground-sync';
import { buildRenderedIndex } from './rendered-index';

const deck = ['---', 'theme: indaco', '---', '', '# One', 'alpha', '', '---', '', '# Two', 'beta', '', '---', '', '# Three', 'gamma', '', '---', '', '# Four', 'delta', '', '---', '', '# Five', 'epsilon', ''].join('\n');
const SLIDES = 5;
const pageOf = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));
const at = (needle: string, from = 0) => deck.indexOf(needle, from);

/** Editor sections are 300px apart in a 500px window; preview pages are 400px apart in a 700px window. */
function layoutOf(n: number, pitch: number, height: number, viewport: number, scroll: number, lead: number): ScrolledLayout {
	const tops = Array.from({ length: n }, (_, i) => lead + i * pitch);
	return { tops, bottoms: tops.map((t) => t + height), viewport, content: lead + n * pitch + 200, scroll };
}

function rig(source = deck) {
	const log: string[] = [];
	const state = { editing: true, editor: true, active: true, canPick: true, now: 0, ed: 0, pv: 0, previewOk: true };
	const rafs: Array<{ id: number; cb: () => void }> = [];
	let ids = 0;
	const clamp = (y: number, l: ScrolledLayout) => Math.max(0, Math.min(y, l.content - l.viewport));
	const edLayout = (n: number) => layoutOf(n, 300, 260, 500, state.ed, 40);
	const pvLayout = (n: number) => layoutOf(n, 400, 380, 700, state.pv, 18);
	let parts = SLIDES;
	const ports: SyncPorts = {
		editor: () =>
			state.editor
				? {
						setBand: (r) => log.push(`band ${r ? `${r.from}-${r.to}` : 'none'}`),
						revealSlide: (a) => log.push(`reveal caret=${a.caret} grab=${!!a.grab} frame=${a.frame}`),
						getLayout: (ranges) => ({ ...edLayout(ranges.length), scroll: state.ed }),
						getScroll: () => state.ed,
						setScroll: (y) => {
							state.ed = clamp(y, edLayout(parts));
							log.push(`editor-scroll ${Math.round(state.ed)}`);
							return state.ed;
						},
					}
				: null,
		previewScroll: () => state.pv,
		previewLayout: (groups) => (state.previewOk ? { ...pvLayout(groups.length), scroll: state.pv } : null),
		setPreviewScroll: (y) => {
			state.pv = clamp(y, pvLayout(parts));
			log.push(`preview-scroll ${Math.round(state.pv)}`);
			return state.pv;
		},
		markPages: (p) => log.push(`mark ${p ? p.join(',') : 'none'}`),
		show: (page, o) => {
			log.push(`page ${page} instant=${o.instant}`);
			return true;
		},
		editing: () => state.editing,
		active: () => state.active,
		canPick: () => state.canPick,
		now: () => state.now,
		raf: (cb) => {
			rafs.push({ id: ++ids, cb });
			return ids;
		},
		cancelRaf: (id) => void rafs.splice(0, rafs.length, ...rafs.filter((r) => r.id !== id)),
	};
	const hub = createFocusHub({ outliner: deckOutliner });
	hub.update(source, { by: 'editor' });
	const sync = createPlaygroundSync(hub, ports);
	const settle = async () => {
		await Promise.resolve();
		await Promise.resolve();
	};
	const land = async (src = source, n = SLIDES, patched = true) => {
		parts = n;
		const ix = buildRenderedIndex(pageOf(n), buildDeckIndex(src));
		sync.rendered(src, () => Promise.resolve(ix), patched);
		await settle();
	};
	const frame = () => {
		for (const r of rafs.splice(0)) r.cb();
		hub.flush();
		for (const r of rafs.splice(0)) r.cb();
		hub.flush();
	};
	const map = () => createScrollMap(edLayout(parts), pvLayout(parts));
	/** The reader scrolls the preview to `y`. */
	const scrollPreview = (y: number) => {
		state.pv = clamp(y, pvLayout(parts));
		sync.previewScrolled();
		frame();
	};
	/** The reader scrolls the editor to `y`. */
	const scrollEditor = (y: number) => {
		state.ed = clamp(y, edLayout(parts));
		sync.editorScrolled();
		frame();
	};
	return { hub, sync, log, state, land, frame, settle, map, scrollPreview, scrollEditor, edLayout, pvLayout };
}

describe('either pane drives the other', () => {
	it('scrolling the preview scrolls the editor to the mapped place and names the slide it is on', async () => {
		const r = rig();
		await r.land();
		r.scrollPreview(1000);
		expect(r.state.ed).toBeCloseTo(r.map().toA(r.state.pv), 6);
		expect(r.state.ed).toBeGreaterThan(0);
		expect(r.hub.get().origin).toBe('preview');
		expect(r.hub.get().flat).toBe(sectionAt(r.pvLayout(SLIDES), r.state.pv));
	});

	it('scrolling the editor scrolls the preview to the mapped place and names the slide it is on', async () => {
		const r = rig();
		await r.land();
		r.scrollEditor(700);
		expect(r.state.pv).toBeCloseTo(r.map().toB(r.state.ed), 6);
		expect(r.state.pv).toBeGreaterThan(0);
		expect(r.hub.get().origin).toBe('editor-view');
		expect(r.hub.get().flat).toBe(sectionAt(r.edLayout(SLIDES), r.state.ed));
	});

	it('a scroll never moves the caret', async () => {
		const r = rig();
		await r.land();
		r.scrollPreview(1100);
		r.scrollEditor(300);
		expect(r.log.some((l) => l.startsWith('reveal'))).toBe(false);
	});

	it('a scroll that is the caret being brought into view does not take the focus from the caret', async () => {
		const r = rig();
		await r.land();
		r.scrollEditor(900);
		r.state.now += 1000;
		// An arrow key: the caret is on slide 1, and CodeMirror scrolls the editor to it.
		r.sync.selected({ head: at('alpha'), anchor: at('alpha'), line: 'alpha', user: true });
		r.scrollEditor(0);
		expect(r.hub.get()).toMatchObject({ origin: 'editor', flat: 0 });
		// A moment later the reader scrolls the editor themselves, and that names the slide again.
		r.state.now += 1000;
		r.scrollEditor(900);
		expect(r.hub.get().origin).toBe('editor-view');
	});

	it('ends meet: the top is the first slide in both, the bottom the last', async () => {
		const r = rig();
		await r.land();
		r.scrollPreview(1e9);
		expect(r.state.ed).toBeCloseTo(r.edLayout(SLIDES).content - 500, 6);
		expect(r.hub.get().flat).toBe(SLIDES - 1);
		r.scrollPreview(0);
		expect(r.state.ed).toBe(0);
		expect(r.hub.get().flat).toBe(0);
	});

	it("a move's own echo does not drive the other pane back", async () => {
		const r = rig();
		await r.land();
		r.scrollPreview(1000);
		const moved = r.log.filter((l) => l.startsWith('editor-scroll')).length;
		// The editor's scroll event for the move the sync just made arrives at the position it set.
		r.log.length = 0;
		r.sync.editorScrolled();
		r.frame();
		expect(r.log.filter((l) => l.startsWith('preview-scroll')).length).toBe(0);
		expect(moved).toBe(1);
	});
});

describe('a page that is dropping frames', () => {
	it('moves the follower every other frame and still lands where the reader stopped', async () => {
		const r = rig();
		await r.land();
		r.log.length = 0;
		for (let k = 1; k <= 8; k++) {
			r.state.now += 28;
			r.scrollPreview(150 * k);
		}
		const moves = r.log.filter((l) => l.startsWith('editor-scroll')).length;
		expect(moves).toBeLessThan(8);
		expect(moves).toBeGreaterThan(0);
		// The reader stops: the frame that was skipped runs, and the editor ends level with the preview.
		for (let k = 0; k < 4; k++) {
			r.state.now += 40;
			r.frame();
		}
		expect(r.state.ed).toBeCloseTo(r.map().toA(r.state.pv), 6);
	});

	it('follows on every frame while frames are on time', async () => {
		const r = rig();
		await r.land();
		r.log.length = 0;
		for (let k = 1; k <= 8; k++) {
			r.state.now += 16;
			r.scrollPreview(150 * k);
		}
		expect(r.log.filter((l) => l.startsWith('editor-scroll')).length).toBe(8);
	});
});

describe('the slide in focus is marked in both panes', () => {
	it('marks the focused slide in the preview and the band in the editor, whoever moved', async () => {
		const r = rig();
		await r.land();
		r.log.length = 0;
		r.sync.selected({ head: at('gamma'), anchor: at('gamma'), line: 'gamma', user: true });
		r.frame();
		expect(r.log).toContain('mark 2');
		expect(r.log.some((l) => l.startsWith('band'))).toBe(true);
		r.log.length = 0;
		r.state.now += 1000;
		r.scrollEditor(0);
		expect(r.log).toContain('mark 0');
	});

	it('puts the mark back when the filmstrip mounts the slide', async () => {
		const r = rig();
		await r.land();
		r.scrollEditor(700);
		r.log.length = 0;
		r.sync.remark();
		expect(r.log.some((l) => /^mark \d/.test(l))).toBe(true);
	});

	it('a click in another slide centers it in the preview and leaves the editor where it is', async () => {
		const r = rig();
		await r.land();
		r.log.length = 0;
		r.state.now += 1000;
		r.sync.selected({ head: at('delta'), anchor: at('delta'), line: 'delta', user: true });
		r.frame();
		expect(r.log.some((l) => l.startsWith('editor-scroll') || l.startsWith('page '))).toBe(false);
		expect(r.state.pv).toBeCloseTo(Math.max(0, Math.min(centeredAt(r.pvLayout(SLIDES), 3), maxScroll(r.pvLayout(SLIDES)))), 6);
		expect(r.hub.get()).toMatchObject({ origin: 'editor', flat: 3 });
		// The scroll the move caused is its own echo: it does not drive the editor.
		expect(r.state.ed).toBe(0);
	});

	it('the editor scrolling to show that caret does not pull the centered preview elsewhere', async () => {
		const r = rig();
		await r.land();
		r.scrollEditor(900);
		r.state.now += 1000;
		r.sync.selected({ head: at('alpha'), anchor: at('alpha'), line: 'alpha', user: true });
		r.frame();
		const centered = r.state.pv;
		expect(centered).toBeCloseTo(0, 6);
		// CodeMirror then scrolls the editor up to the caret.
		r.state.now += 20;
		r.scrollEditor(60);
		expect(r.state.pv).toBe(centered);
		expect(r.hub.get()).toMatchObject({ origin: 'editor', flat: 0 });
	});

	it('a caret move inside the slide in focus scrolls nothing, and neither does typing across a slide edge', async () => {
		const r = rig();
		await r.land();
		r.state.now += 1000;
		r.sync.selected({ head: at('alpha'), anchor: at('alpha'), line: 'alpha', user: true });
		r.frame();
		r.log.length = 0;
		r.sync.selected({ head: at('alpha') + 2, anchor: at('alpha') + 2, line: 'alpha', user: true });
		r.frame();
		expect(r.log.some((l) => l.includes('scroll'))).toBe(false);
		const typed = `${deck.slice(0, at('beta'))}x${deck.slice(at('beta'))}`;
		r.sync.edited(typed, { from: at('beta'), toA: at('beta'), toB: at('beta') + 1 });
		r.sync.selected({ head: at('beta') + 1, anchor: at('beta') + 1, line: 'xbeta', user: true });
		r.frame();
		expect(r.log.some((l) => l.includes('scroll'))).toBe(false);
	});
});

describe('Explore and Edit are two views of one deck', () => {
	it('opens Explore on the slide the caret is in, and leaves the caret alone', async () => {
		const r = rig();
		await r.land();
		r.state.now += 1000;
		r.sync.selected({ head: at('delta'), anchor: at('delta'), line: 'delta', user: true });
		r.frame();
		r.log.length = 0;
		expect(r.sync.enterExplore()).toBe(3);
		expect(r.log.some((l) => l.startsWith('reveal'))).toBe(false);
	});

	it('a click on another slide in Explore puts the caret at the end of its title when the reader goes back', async () => {
		const r = rig();
		await r.land();
		r.state.now += 1000;
		r.sync.selected({ head: at('alpha'), anchor: at('alpha'), line: 'alpha', user: true });
		r.frame();
		r.sync.enterExplore();
		r.state.editing = false;
		r.sync.exploreClicked(4);
		r.state.editing = true;
		r.log.length = 0;
		r.sync.leaveExplore();
		r.frame();
		const title = at('# Five') + '# Five'.length;
		expect(r.log.some((l) => l.startsWith(`reveal caret=${title}`))).toBe(true);
	});

	it('going back without a click, or after a click on the caret slide, moves nothing', async () => {
		const r = rig();
		await r.land();
		r.state.now += 1000;
		r.sync.selected({ head: at('beta'), anchor: at('beta'), line: 'beta', user: true });
		r.frame();
		r.sync.enterExplore();
		r.log.length = 0;
		r.sync.leaveExplore();
		r.sync.enterExplore();
		r.sync.exploreClicked(1);
		r.sync.leaveExplore();
		r.frame();
		expect(r.log.some((l) => l.startsWith('reveal'))).toBe(false);
	});
});

describe('a pick moves the caret', () => {
	it('a click on a slide puts the caret at the end of its title, centers it in the preview and brings the editor level', async () => {
		const r = rig();
		await r.land();
		r.state.pv = 900;
		r.sync.picked(2, { grab: true });
		r.frame();
		const title = at('# Three') + '# Three'.length;
		expect(r.log).toContain(`reveal caret=${title} grab=true frame=false`);
		expect(r.state.pv).toBeCloseTo(centeredAt(r.pvLayout(SLIDES), 2), 6);
		expect(r.state.ed).toBeCloseTo(r.map().toA(r.state.pv), 6);
		expect(r.log.some((l) => l.startsWith('page '))).toBe(false);
	});

	it('a map tile asks the preview to scroll and the editor follows it, without naming a focus on the way', async () => {
		const r = rig();
		await r.land();
		r.hub.go('rail', { flat: 3 });
		r.frame();
		const title = at('# Four') + '# Four'.length;
		expect(r.log).toContain(`reveal caret=${title} grab=false frame=false`);
		expect(r.log).toContain('page 3 instant=false');
		// The preview's smooth scroll passes through slide 2 and 3: the editor moves along, the focus stays the tile's.
		r.state.now += 20;
		r.scrollPreview(600);
		expect(r.hub.get()).toMatchObject({ origin: 'rail', flat: 3 });
		expect(r.state.ed).toBeCloseTo(r.map().toA(600), 6);
	});

	it('once a pick has settled, the reader scrolling the preview to another slide names that slide', async () => {
		const r = rig();
		await r.land();
		r.hub.go('rail', { flat: 1 });
		r.frame();
		r.state.now += 20;
		r.scrollPreview(400);
		expect(r.hub.get()).toMatchObject({ origin: 'rail', flat: 1 });
		// Still inside the pick's window, the reader scrolls on to the last slide and stops.
		r.state.now += 200;
		r.scrollPreview(1700);
		r.state.now += 300;
		r.frame();
		expect(r.hub.get()).toMatchObject({ origin: 'preview', flat: sectionAt(r.pvLayout(SLIDES), r.state.pv) });
		expect(r.hub.get().flat).not.toBe(1);
	});

	it('frames the slide itself when the panes cannot be aligned yet', async () => {
		const r = rig();
		r.state.previewOk = false;
		await r.land();
		r.sync.picked(1, { grab: false });
		r.frame();
		// Nothing to align with yet, so the editor frames the slide itself.
		expect(r.log.find((l) => l.startsWith('reveal'))).toMatch(/frame=true$/);
	});

	it('a click while the editor is off screen places nothing', async () => {
		const r = rig();
		await r.land();
		r.state.canPick = false;
		r.sync.picked(2, { grab: true });
		r.frame();
		expect(r.log.some((l) => l.startsWith('reveal'))).toBe(false);
	});

	it('a walk step (origin preview) shows the slide and never takes the caret', async () => {
		const r = rig();
		await r.land();
		r.hub.go('preview', { flat: 2 });
		r.frame();
		expect(r.log.some((l) => l.startsWith('reveal'))).toBe(false);
	});
});

describe('feedback between the panes', () => {
	it("a stale event on the pane being moved does not eat the next move's echo", async () => {
		const r = rig();
		await r.land();
		// The reader wheels the editor; each frame moves the preview and records its echo.
		r.scrollEditor(300);
		const pv1 = r.state.pv;
		r.state.now += 16;
		r.scrollEditor(340);
		const pv2 = r.state.pv;
		expect(pv2).toBeGreaterThan(pv1);
		// The preview's scroll events for both moves arrive late: neither drives the editor back.
		r.sync.previewScrolled();
		r.frame();
		r.sync.previewScrolled();
		r.frame();
		expect(r.state.ed).toBe(340);
	});

	it("the editor re-anchoring itself while a pick's smooth scroll is in flight does not cancel the pick", async () => {
		const r = rig();
		await r.land();
		r.hub.go('rail', { flat: 4 });
		r.frame();
		r.state.now += 20;
		r.scrollPreview(500);
		const before = r.log.filter((l) => l.startsWith('preview-scroll')).length;
		// CodeMirror measures the lines it had only estimated and moves its own scroll.
		r.state.now += 20;
		r.scrollEditor(r.state.ed + 600);
		expect(r.log.filter((l) => l.startsWith('preview-scroll')).length).toBe(before);
	});
});

describe('two texts', () => {
	it('leaves the panes alone while typing runs ahead of the render, and the render realigns nothing it did not owe', async () => {
		const r = rig();
		await r.land();
		const typed = `${deck}\n---\n\n# Six\n`;
		r.sync.edited(typed);
		r.sync.selected({ head: typed.length, anchor: typed.length, line: '', user: true });
		r.frame();
		r.log.length = 0;
		r.scrollPreview(1000);
		expect(r.log.some((l) => l.startsWith('editor-scroll'))).toBe(false);
		await r.land(typed, SLIDES + 1);
		expect(r.sync.pending()).toBe(false);
	});

	it('realigns the preview when the render lands after typing scrolled the editor', async () => {
		const r = rig();
		await r.land();
		const typed = `${deck}\n---\n\n# Six\n`;
		r.sync.edited(typed);
		r.sync.selected({ head: typed.length, anchor: typed.length, line: '', user: true });
		r.frame();
		r.state.now += 1000;
		// A paste scrolls the editor while the render is behind: the preview cannot follow yet.
		r.scrollEditor(700);
		expect(r.state.pv).toBe(0);
		expect(r.sync.pending()).toBe(true);
		await r.land(typed, SLIDES + 1);
		expect(r.state.pv).toBeGreaterThan(0);
		expect(r.state.pv).toBeCloseTo(r.map().toB(r.state.ed), 6);
		expect(r.sync.pending()).toBe(false);
	});

	it('keeps the mark on the slide while typing runs ahead of the render', async () => {
		const r = rig();
		await r.land();
		r.sync.selected({ head: at('beta'), anchor: at('beta'), line: 'beta', user: true });
		r.frame();
		expect(r.log.filter((l) => l.startsWith('mark')).at(-1)).toBe('mark 1');
		const typed = `${deck.slice(0, at('beta'))}x${deck.slice(at('beta'))}`;
		r.log.length = 0;
		r.sync.edited(typed, { from: at('beta'), toA: at('beta'), toB: at('beta') + 1 });
		r.sync.selected({ head: at('beta') + 1, anchor: at('beta') + 1, line: 'xbeta', user: true });
		r.frame();
		expect(r.log).not.toContain('mark none');
	});

	it('a full write opens its document at the top, so it is realigned with the editor once it has loaded', async () => {
		const r = rig();
		await r.land();
		r.state.ed = 700;
		r.state.pv = 0;
		await r.land(deck, SLIDES, false);
		expect(r.sync.pending()).toBe(true);
		expect(r.log.some((l) => l.startsWith('preview-scroll'))).toBe(false);
		expect(r.sync.loaded()).toBe(true);
		expect(r.state.pv).toBeCloseTo(r.map().toB(700), 6);
		expect(r.sync.pending()).toBe(false);
	});

	it('a full write that lands before its index waits for the index', async () => {
		const r = rig();
		r.state.ed = 700;
		r.sync.rendered(deck, null, false);
		expect(r.sync.loaded()).toBe(true);
		expect(r.sync.pending()).toBe(true);
		await r.land(deck, SLIDES, true);
		expect(r.state.pv).toBeCloseTo(r.map().toB(700), 6);
		expect(r.sync.pending()).toBe(false);
	});

	it('a whole-document replace moves nothing the reader did not move', async () => {
		const r = rig();
		await r.land();
		r.scrollEditor(900);
		r.log.length = 0;
		const next = deck.replace('indaco', 'cuoio');
		r.sync.edited(next, { from: 0, toA: deck.length, toB: next.length });
		r.sync.selected({ head: 0, anchor: 0, line: '---', user: false });
		r.frame();
		expect(r.log.some((l) => l.startsWith('preview-scroll') || l.startsWith('editor-scroll'))).toBe(false);
	});
});

describe('outside Edit the render is the text of record', () => {
	it('feeds the hub the rendered source, ignores the editor, and leaves the hidden editor alone', async () => {
		const r = rig();
		r.state.editing = false;
		const gallery = '# Only\n\n---\n\n# Two\n';
		r.sync.edited('typed while hidden');
		expect(r.hub.outline()?.source).toBe(deck);
		await r.land(gallery, 2);
		expect(r.hub.outline()?.source).toBe(gallery);
		r.hub.go('rail', { flat: 1 });
		r.frame();
		expect(r.log).toContain('page 1 instant=false');
		expect(r.log.some((l) => /^(band|reveal|editor-scroll)/.test(l))).toBe(false);
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
