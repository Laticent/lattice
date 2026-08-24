import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildStageDoc, createStageController } from './stage-window.js';

describe('stage-window — buildStageDoc', () => {
	it('wraps the deck HTML into a self-contained, postMessage-driven stage', () => {
		const doc = buildStageDoc({ html: '<article class="lattice"><section>A</section></article>', width: 1280, height: 720, bg: '#111', css: '.k{color:red}', runtimeUrl: '/runtime.js', katexUrl: '/katex.css', mermaidUrl: '/mermaid.js', a11yDefs: '<svg id="a11y"></svg>' });
		expect(doc).toContain('<section>A</section>');
		expect(doc).toContain('.k{color:red}');
		expect(doc).toContain('/runtime.js');
		expect(doc).toContain('/katex.css');
		expect(doc).toContain('/mermaid.js');
		expect(doc).toContain('<svg id="a11y"></svg>');
		// The pv-driven show() contract the console postMessages to.
		expect(doc).toContain('e.data.pv');
		expect(doc).toContain('background:#111');
	});
	it('omits the katex/mermaid tags when not supplied', () => {
		const doc = buildStageDoc({ html: '<i>x</i>', width: 100, height: 100, bg: '#000', css: '', runtimeUrl: '/r.js' });
		expect(doc).not.toContain('stylesheet');
		expect(doc).toContain('/r.js');
	});
	it('binds the inlined fit kernel to the names its call sites use (the stage-crop guard)', () => {
		// The fit inlines fitScale/padInset via Function.toString(); the bundler renames the
		// imports, so a BARE `${fn.toString()}` printed a renamed/anonymous body while the call
		// sites used the literal names → `fit()` threw "padInset is not defined" and the slide
		// never scaled (the long-standing stage crop). The `var name = …` binding is what
		// keeps the names alive — assert both the binding AND the call sites, so a revert to the
		// bare form fails here instead of silently re-cropping every projected deck.
		const doc = buildStageDoc({ html: '<article class="lattice"><section>A</section></article>', width: 1280, height: 720, bg: '#000', css: '', runtimeUrl: '/r.js' });
		expect(doc).toMatch(/var fitScale\s*=\s*function|var fitScale\s*=\s*\(/);
		expect(doc).toMatch(/var padInset\s*=\s*function|var padInset\s*=\s*\(/);
		expect(doc).toContain('padInset(');
		expect(doc).toContain('fitScale(');
	});
	it('drives a private #latt-film filmstrip clipped to the current slide (never the engine sections)', () => {
		// The stage scales + translates OUR OWN #latt-film wrapper and hides the non-current
		// sections, rather than transforming the engine's <section>s (which the engine re-manages).
		const doc = buildStageDoc({ html: '<article class="lattice"><section>A</section><section>B</section></article>', width: 1280, height: 720, bg: '#000', css: '', runtimeUrl: '/r.js' });
		expect(doc).toContain('id="latt-film"');
		expect(doc).toContain('scale(');
		expect(doc).toContain('translateY(');
		expect(doc).toContain('.style.visibility'); // only the current slide paints
	});
	it('fits the slide to #latt-view, so audience chrome cannot sit on top of it', () => {
		// The chrome row is a SIBLING of the fit box, not an overlay. Measuring the outer
		// #latt-stage would let the caption band and the rail cover the bottom of the slide
		// on the one surface where that is unrecoverable — the projected window.
		const doc = buildStageDoc({ html: '<i>x</i>', width: 1280, height: 720, bg: '#000', css: '', runtimeUrl: '/r.js', standalone: true });
		expect(doc).toContain('id="latt-view"');
		expect(doc).toContain('getElementById("latt-view")');
	});
});

describe('stage-window — buildStageDoc({ standalone })', () => {
	const plain = () => buildStageDoc({ html: '<i>x</i>', width: 1280, height: 720, bg: '#000', css: '', runtimeUrl: '/r.js' });
	const solo = () => buildStageDoc({ html: '<i>x</i>', width: 1280, height: 720, bg: '#000', css: '', runtimeUrl: '/r.js', standalone: true });

	it('adds the two empty audience-chrome hosts and their sheet', () => {
		const doc = solo();
		expect(doc).toContain('id="latt-cc"');
		expect(doc).toContain('id="latt-rail"');
		// EMPTY — the console portals React into them; nothing in this document writes there.
		expect(doc).toContain('<div id="latt-cc"></div>');
		expect(doc).toContain('.latt-cc-band');
		expect(doc).toContain('.latt-rail-seg');
	});
	it('announces itself to its opener and reports its own close', () => {
		const doc = solo();
		expect(doc).toContain('tell("ready")');
		expect(doc).toContain('tell("closed")');
		expect(doc).toContain('{stage:k}');
	});
	it('binds `f` for fullscreen — and NOTHING that turns the deck', () => {
		// The room does not drive the deck: the Stage has no navigation keys at all, which is
		// the whole difference between it and the presenter window it replaced.
		const doc = solo();
		expect(doc).toContain('requestFullscreen');
		expect(doc).not.toContain('PRESENT_KEYMAP');
		expect(doc).not.toContain('keyAction');
		expect(doc).not.toContain('swipeAction');
	});
	it('leaves the iframe hosts exactly as they were — every addition is opener-gated', () => {
		// ONE document, two hosts. `window.opener` is null in an iframe, so the handshake and
		// the `f` key are inert there — but the CHROME must not even be emitted, or the
		// console's own slide card would grow a rail inside itself.
		const doc = plain();
		expect(doc).not.toContain('id="latt-cc"');
		expect(doc).not.toContain('id="latt-rail"');
		expect(doc).not.toContain('.latt-rail-seg');
		expect(doc).toContain('if(window.opener)'); // the gate itself still ships
	});
});

// A fake second window, as window.open would return.
function fakeWindow() {
	return { document: { open: vi.fn(), write: vi.fn(), close: vi.fn(), getElementById: vi.fn(() => null), documentElement: { requestFullscreen: vi.fn(() => Promise.reject(new Error('no activation'))) } }, postMessage: vi.fn(), closed: false, moveTo: vi.fn(), resizeTo: vi.fn(), close: vi.fn(function (this: { closed: boolean }) { this.closed = true; }) };
}
// Deliver a message to the controller's window listener with a forgeable `source`
// (jsdom's MessageEvent coerces `source` to null, so build a plain event).
function postFromStage(data: unknown, source: unknown) {
	const ev = new Event('message');
	Object.defineProperty(ev, 'data', { value: data, configurable: true });
	Object.defineProperty(ev, 'source', { value: source, configurable: true });
	window.dispatchEvent(ev);
}
/** What was written into the window, newest last. */
const writes = (win: ReturnType<typeof fakeWindow>) => win.document.write.mock.calls.map((c) => String(c[0]));

describe('stage-window — createStageController', () => {
	afterEach(() => vi.restoreAllMocks());

	it('runs the open → holding → doc → ready → show → close lifecycle', async () => {
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onChange = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 2, onChange, onLost: vi.fn(), onPlaced: vi.fn() });

		// Open (user gesture). The HOLDING page goes up synchronously — the room must never
		// watch about:blank while the engine renders — and the deck follows it.
		ctl.toggle();
		expect(window.open).toHaveBeenCalledTimes(1);
		expect(writes(win)[0]).toContain('Preparing the stage');
		expect(writes(win).at(-1)).toBe('<stage/>');
		expect(ctl.isOpen()).toBe(true);
		// NOT yet a live surface: the console holds the window only once it says so.
		expect(onChange).not.toHaveBeenCalled();

		// Nothing is posted before the Stage's fit is listening — the runtime script it waits
		// on is parser-blocking and multi-megabyte, so an early index would land on nothing.
		ctl.show(1);
		expect(win.postMessage).not.toHaveBeenCalled();

		// The Stage announces itself → the current index goes over, and the console adopts it.
		postFromStage({ stage: 'ready' }, win);
		expect(win.postMessage).toHaveBeenCalledWith({ pv: 2 }, '*');
		expect(onChange).toHaveBeenLastCalledWith(win);

		// Navigation relays one way only: console → Stage.
		win.postMessage.mockClear();
		ctl.show(3);
		expect(win.postMessage).toHaveBeenCalledWith({ pv: 3 }, '*');

		// A message from a FOREIGN source is ignored (the handle check is the trust).
		onChange.mockClear();
		postFromStage({ stage: 'closed' }, {});
		expect(onChange).not.toHaveBeenCalled();

		// The Stage closing tears down.
		postFromStage({ stage: 'closed' }, win);
		expect(onChange).toHaveBeenLastCalledWith(null);
		expect(ctl.isOpen()).toBe(false);
	});

	it('writes the deck as soon as it lands when the render was still in flight at open', () => {
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		let doc = '';
		const ctl = createStageController({ getDoc: () => doc, getIndex: () => 0, onChange: vi.fn(), onLost: vi.fn(), onPlaced: vi.fn() });
		ctl.toggle();
		// Only the holding page so far — the engine has not finished.
		expect(writes(win)).toHaveLength(1);
		doc = '<deck/>';
		ctl.write(doc);
		expect(writes(win).at(-1)).toBe('<deck/>');
	});

	it('does not re-write an UNCHANGED doc — a rewrite reboots the engine in front of the room', () => {
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange: vi.fn(), onLost: vi.fn(), onPlaced: vi.fn() });
		ctl.toggle();
		const n = writes(win).length;
		ctl.write('<stage/>');
		expect(writes(win)).toHaveLength(n);
		ctl.write('<stage-v2/>');
		expect(writes(win)).toHaveLength(n + 1);
	});

	it('re-announces on a rewrite, so the console re-targets its portals at the NEW hosts', () => {
		// A rewrite replaces the whole document: the `#latt-cc` / `#latt-rail` nodes the
		// console was portalling into are detached, and rendering into them would silently
		// leave the room with no captions and no rail.
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onChange = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange, onLost: vi.fn(), onPlaced: vi.fn() });
		ctl.toggle();
		postFromStage({ stage: 'ready' }, win);
		expect(onChange).toHaveBeenCalledTimes(1);
		ctl.write('<stage-v2/>');
		// Silent in between — and nothing is posted at the old document either.
		win.postMessage.mockClear();
		ctl.show(4);
		expect(win.postMessage).not.toHaveBeenCalled();
		postFromStage({ stage: 'ready' }, win);
		expect(onChange).toHaveBeenCalledTimes(2);
		expect(win.postMessage).toHaveBeenCalledWith({ pv: 0 }, '*');
	});

	it('reports a Stage that went away on its own — and stays silent when WE closed it', () => {
		// §4's "Stage disconnected" state. The two closes need opposite treatment: the room
		// losing the deck mid-talk is worth a sentence, and the presenter pressing the pill
		// they just pressed is not. `close()` detaches the listener before the window's
		// unload beat can arrive, which is what makes the split hold rather than race.
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onLost = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange: vi.fn(), onLost, onPlaced: vi.fn() });
		ctl.toggle();
		postFromStage({ stage: 'ready' }, win);
		postFromStage({ stage: 'closed' }, win);
		expect(onLost).toHaveBeenCalledTimes(1);

		onLost.mockClear();
		ctl.toggle(); // re-open
		postFromStage({ stage: 'ready' }, win);
		ctl.close(); // WE closed it — the window's own unload beat must not announce anything
		postFromStage({ stage: 'closed' }, win);
		expect(onLost).not.toHaveBeenCalled();
	});

	it('toggling again closes the held window', () => {
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onChange = vi.fn();
		const ctl = createStageController({ getDoc: () => '', getIndex: () => 0, onChange, onLost: vi.fn(), onPlaced: vi.fn() });
		ctl.toggle();
		ctl.toggle();
		expect(win.close).toHaveBeenCalled();
		expect(onChange).toHaveBeenLastCalledWith(null);
		expect(ctl.isOpen()).toBe(false);
	});

	it('leaves the toggle off when the popup is blocked (window.open → null)', () => {
		vi.spyOn(window, 'open').mockReturnValue(null);
		const onChange = vi.fn();
		const ctl = createStageController({ getDoc: () => '', getIndex: () => 0, onChange, onLost: vi.fn(), onPlaced: vi.fn() });
		ctl.toggle();
		expect(onChange).not.toHaveBeenCalled();
		expect(ctl.isOpen()).toBe(false);
	});

	it('reports a placement that could not fill the screen, so the console can say which key does', () => {
		// DETECT to decide whether to OFFER; VERIFY to decide whether it WORKED (§7). A popup
		// has no transient activation of its own, so its self-requested fullscreen may simply
		// be declined — `full: false` is what turns that into a sentence a presenter can act on
		// rather than a windowed deck with no explanation.
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const screens = { screens: [{ isInternal: true, availLeft: 0, availTop: 0, availWidth: 1440, availHeight: 900 }, { isInternal: false, availLeft: 1440, availTop: 0, availWidth: 1920, availHeight: 1080 }], currentScreen: null };
		Object.defineProperty(window, 'getScreenDetails', { value: () => Promise.resolve(screens), configurable: true, writable: true });
		const onPlaced = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange: vi.fn(), onLost: vi.fn(), onPlaced });
		ctl.toggle();
		return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => {
			expect(win.moveTo).toHaveBeenCalledWith(1440, 0);
			expect(onPlaced).toHaveBeenCalledWith({ placed: true, full: false });
		});
	});
});
