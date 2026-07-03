import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPresenterDoc, buildStageDoc, createPresenterController } from './presenter-window.js';

describe('presenter-window — buildStageDoc', () => {
	it('wraps the deck HTML into a self-contained, postMessage-driven stage', () => {
		const doc = buildStageDoc({ html: '<div class="lattice"><section>A</section></div>', width: 1280, height: 720, bg: '#111', css: '.k{color:red}', runtimeUrl: '/runtime.js', katexUrl: '/katex.css', mermaidUrl: '/mermaid.js', a11yDefs: '<svg id="a11y"></svg>' });
		expect(doc).toContain('<section>A</section>');
		expect(doc).toContain('.k{color:red}');
		expect(doc).toContain('/runtime.js');
		expect(doc).toContain('/katex.css');
		expect(doc).toContain('/mermaid.js');
		expect(doc).toContain('<svg id="a11y"></svg>');
		// The pv-driven show() contract the presenter (and main stage) postMessage to.
		expect(doc).toContain('e.data.pv');
		expect(doc).toContain('background:#111');
	});
	it('omits the katex/mermaid tags when not supplied', () => {
		const doc = buildStageDoc({ html: '<i>x</i>', width: 100, height: 100, bg: '#000', css: '', runtimeUrl: '/r.js' });
		expect(doc).not.toContain('stylesheet');
		expect(doc).toContain('/r.js');
	});
});

describe('presenter-window — buildPresenterDoc', () => {
	it('is a self-contained speaker view with the postMessage protocol', () => {
		const doc = buildPresenterDoc();
		expect(doc).toContain('Presenter view');
		expect(doc).toContain('id="cur"');
		expect(doc).toContain('id="next"');
		expect(doc).toContain('id="notes"');
		expect(doc).toContain('Reset timer');
		// Opener↔presenter protocol: announces ready, accepts ppInit/ppIndex, relays go.
		expect(doc).toContain("send(\"ready\")");
		expect(doc).toContain('d.ppInit');
		expect(doc).toContain('d.ppIndex');
		expect(doc).toContain('"go"');
	});
});

// A fake second window, as window.open would return.
function fakeWindow() {
	return { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() }, postMessage: vi.fn(), closed: false, close: vi.fn(function (this: { closed: boolean }) { this.closed = true; }) };
}
// Deliver a message to the controller's window listener with a forgeable `source`
// (jsdom's MessageEvent coerces `source` to null, so build a plain event).
function postFromPresenter(data: unknown, source: unknown) {
	const ev = new Event('message');
	Object.defineProperty(ev, 'data', { value: data, configurable: true });
	Object.defineProperty(ev, 'source', { value: source, configurable: true });
	window.dispatchEvent(ev);
}

describe('presenter-window — createPresenterController', () => {
	afterEach(() => vi.restoreAllMocks());

	it('runs the open → ready → init → sync → navigate → close lifecycle', () => {
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onGo = vi.fn();
		const onToggle = vi.fn();
		const ctl = createPresenterController({ buildDoc: () => '<stage/>', getState: () => ({ index: 2, total: 5, note: 'talk track' }), onGo, onToggle });

		// Open (user gesture) — writes the presenter doc, flips the button on.
		ctl.toggle();
		expect(window.open).toHaveBeenCalledTimes(1);
		expect(win.document.write).toHaveBeenCalledWith(expect.stringContaining('Presenter view'));
		expect(onToggle).toHaveBeenLastCalledWith(true);
		expect(ctl.isOpen()).toBe(true);

		// The presenter announces ready → we send it the stage doc + total, then sync.
		postFromPresenter({ pp: 'ready' }, win);
		expect(win.postMessage).toHaveBeenCalledWith({ ppInit: true, doc: '<stage/>', total: 5 }, '*');
		expect(win.postMessage).toHaveBeenCalledWith({ ppIndex: 2, note: 'talk track' }, '*');

		// A navigation message relays into onGo.
		postFromPresenter({ pp: 'go', v: 1 }, win);
		expect(onGo).toHaveBeenCalledWith(1);

		// A message from a FOREIGN source is ignored (the handle check is the trust).
		onGo.mockClear();
		postFromPresenter({ pp: 'go', v: 1 }, {});
		expect(onGo).not.toHaveBeenCalled();

		// The presenter closing tears down (button off, not open).
		postFromPresenter({ pp: 'closed' }, win);
		expect(onToggle).toHaveBeenLastCalledWith(false);
		expect(ctl.isOpen()).toBe(false);
	});

	it('sync() and refresh() no-op until the presenter is ready, then post', () => {
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		let note = 'first';
		const ctl = createPresenterController({ buildDoc: () => '<stage/>', getState: () => ({ index: 0, total: 3, note }), onGo: vi.fn(), onToggle: vi.fn() });
		ctl.toggle();
		// Before 'ready', sync/refresh stay silent (no postMessage yet).
		ctl.sync();
		ctl.refresh();
		expect(win.postMessage).not.toHaveBeenCalled();
		// After ready, refresh re-sends the (possibly updated) doc + re-syncs.
		postFromPresenter({ pp: 'ready' }, win);
		win.postMessage.mockClear();
		note = 'updated';
		ctl.refresh();
		expect(win.postMessage).toHaveBeenCalledWith({ ppInit: true, doc: '<stage/>', total: 3 }, '*');
		expect(win.postMessage).toHaveBeenCalledWith({ ppIndex: 0, note: 'updated' }, '*');
	});

	it('toggling again closes the held window', () => {
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onToggle = vi.fn();
		const ctl = createPresenterController({ buildDoc: () => '', getState: () => ({ index: 0, total: 1, note: '' }), onGo: vi.fn(), onToggle });
		ctl.toggle();
		ctl.toggle();
		expect(win.close).toHaveBeenCalled();
		expect(onToggle).toHaveBeenLastCalledWith(false);
		expect(ctl.isOpen()).toBe(false);
	});

	it('leaves the toggle off when the popup is blocked (window.open → null)', () => {
		vi.spyOn(window, 'open').mockReturnValue(null);
		const onToggle = vi.fn();
		const ctl = createPresenterController({ buildDoc: () => '', getState: () => ({ index: 0, total: 1, note: '' }), onGo: vi.fn(), onToggle });
		ctl.toggle();
		expect(onToggle).not.toHaveBeenCalled();
		expect(ctl.isOpen()).toBe(false);
	});
});
