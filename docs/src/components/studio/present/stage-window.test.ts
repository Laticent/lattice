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
		// BOTH halves. This asserted only `not.toContain('stylesheet')` — the KaTeX link — so
		// the mermaid half of its own name was unchecked, and a deck with no diagram could
		// have gone on pulling a multi-hundred-KB script into the room's window unnoticed.
		const doc = buildStageDoc({ html: '<i>x</i>', width: 100, height: 100, bg: '#000', css: '', runtimeUrl: '/r.js' });
		expect(doc).not.toContain('stylesheet');
		expect(doc).not.toContain('mermaid');
		expect(doc).toContain('/r.js');
		// …and the positive control, so the cell cannot pass by emitting nothing at all.
		const both = buildStageDoc({ html: '<i>x</i>', width: 100, height: 100, bg: '#000', css: '', runtimeUrl: '/r.js', katexUrl: '/k.css', mermaidUrl: '/m.js' });
		expect(both).toContain('/k.css');
		expect(both).toContain('/m.js');
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
		expect(doc).toContain('{stage:k,tok:TOK}');
		// pagehide AS WELL AS unload: `unload` is on Chrome's deprecation path and does not
		// fire for a discarded tab, and neither alone covers every way a window goes away.
		expect(doc).toContain('"pagehide"');
		// And it posts to a TARGETED origin, never `'*'` — the window may not be ours by then.
		expect(doc).toContain('OP.postMessage({stage:k,tok:TOK},OR)');
	});
	it('drives the deck with the SHARED input kernel, not a hand-rolled twin', () => {
		// REVERSED, deliberately. The first cut bound exactly one key on the theory that
		// "the room does not drive the deck" — which is wrong for the case that actually
		// happens: the presenter standing at the machine the Stage is on. A projected window
		// you cannot operate is not safer, it is just inert.
		//
		// What matters is WHICH implementation drives it. Two surfaces reading gestures from
		// two hand-rolled readers is exactly the drift `present-transport.mjs` exists to
		// prevent, so the kernel travels by `.toString()` — the same trip `fitScale` already
		// takes, kept viable by `test/unit/export/inlinable-kernels.test.js`.
		const doc = solo();
		expect(doc).toContain('requestFullscreen');
		for (const k of ['keyAction', 'swipeAction', 'createWheelGate', 'PRESENT_KEYMAP']) {
			expect(doc, `${k} must be inlined, not reimplemented`).toContain(k);
		}
		// The keymap is inlined BESIDE keyAction and passed explicitly, because keyAction
		// defaults that argument to a module-scope constant that does not survive inlining.
		expect(doc).toContain('keyAction(e.key,PRESENT_KEYMAP)');
		// And it posts an ACTION, never an index: the console owns `idx`, so a gesture here
		// and a keypress there cannot race to different answers.
		expect(doc).toContain('stage:"nav"');
		expect(doc).not.toMatch(/stage:"nav".{0,40}pv:/);
	});

	it('carries auto-hiding overlay controls — and the srcdoc hosts carry none', () => {
		// The video-player idiom: hidden at rest, summoned by pointer or key, gone after a
		// beat. A permanently-chromed projection is the defect the whole split exists to
		// remove; a projection nobody can operate is the one the first cut shipped.
		const doc = solo();
		expect(doc).toContain('id="latt-ctl"');
		expect(doc).toContain('aria-label="Full screen"');
		expect(doc).toContain('aria-label="Next slide"');
		// Hidden by OPACITY, not `display` — so the bar keeps its place in the tab order for
		// a keyboard user who has no pointer to summon it with, and `:focus-within` reveals
		// it for them. A `display:none` bar is unreachable, which is not an affordance.
		expect(doc).toContain('.latt-ctl:focus-within');
		expect(doc).toMatch(/\.latt-ctl\{[^}]*opacity:0/);
		// An in-page stage is already surrounded by the console's own transport; a second
		// set inside the frame would be two controls for one deck.
		expect(plain()).not.toContain(String.raw`id="latt-ctl"`);
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
//
// `getElementById` is not decoration. The controller decides whether the Stage is still
// OURS by looking for a marker every document it writes carries (`#latt-stage` for the
// deck, `#latt-holding` for the "Preparing the stage…" page) — because a URL cannot answer
// it: `window.open('')` reports `about:blank` at the instant it opens and the opener's href
// once written into. A page the window was NAVIGATED to carries neither marker, which is
// what `navigateSameOrigin` models below.
function fakeWindow() {
	const state = { ours: true };
	return {
		__state: state,
		document: {
			open: vi.fn(),
			write: vi.fn(),
			close: vi.fn(),
			getElementById: vi.fn((id: string) => (state.ours && (id === 'latt-stage' || id === 'latt-holding') ? ({} as HTMLElement) : null)),
			documentElement: { requestFullscreen: vi.fn(() => Promise.reject(new Error('no activation'))) },
		},
		postMessage: vi.fn(),
		closed: false,
		moveTo: vi.fn(),
		resizeTo: vi.fn(),
		close: vi.fn(function (this: { closed: boolean }) {
			this.closed = true;
		}),
	};
}
/** The presenter clicked a link in the deck, or pressed F5: a real document, none of ours. */
function navigateSameOrigin(win: ReturnType<typeof fakeWindow>) {
	win.__state.ours = false;
}
/** …or the link was off-site: touching `document` now THROWS, exactly as Chromium does. */
function navigateCrossOrigin(win: ReturnType<typeof fakeWindow>) {
	Object.defineProperty(win, 'document', {
		get() {
			throw new DOMException('Blocked a frame', 'SecurityError');
		},
		configurable: true,
	});
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
		expect(win.postMessage).toHaveBeenCalledWith({ pv: 2 }, location.origin);
		expect(onChange).toHaveBeenLastCalledWith(win);

		// Navigation relays one way only: console → Stage.
		win.postMessage.mockClear();
		ctl.show(3);
		expect(win.postMessage).toHaveBeenCalledWith({ pv: 3 }, location.origin);

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
		// THE CONSOLE LETS GO FIRST. `document.open()` detaches the `#latt-cc` / `#latt-rail`
		// nodes being portalled into, so between the rewrite and the new document's `ready`
		// there is no live host — and without this the caption crawl and the rail rendered
		// into limbo while the dock still refused to show them, leaving them on NEITHER
		// surface for the length of an engine boot.
		expect(onChange).toHaveBeenLastCalledWith(null);
		// Nothing is posted at the old document either.
		win.postMessage.mockClear();
		ctl.show(4);
		expect(win.postMessage).not.toHaveBeenCalled();
		postFromStage({ stage: 'ready' }, win);
		expect(onChange).toHaveBeenLastCalledWith(win);
		expect(win.postMessage).toHaveBeenCalledWith({ pv: 0 }, location.origin);
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

	it('notices a Stage that was NAVIGATED away — the case `e.source` cannot see', () => {
		// THE REGRESSION CELL. A deck's own `<a href>` survives sanitizing, so a click on the
		// projected copy navigated the window; F5 and Back do the same. The unload beat IS
		// posted, but Chromium delivers it with a different `e.source` — measured — so the
		// guard dropped the one message it exists to receive. `window.close()` was the only
		// teardown path that ever reported itself, and it is the only one the popup e2e cell
		// exercises. Downstream the console kept a dead handle: pill lit, captions and rail on
		// NEITHER surface, and the live slide index still being posted at a foreign page.
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onChange = vi.fn();
		const onLost = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange, onLost, onPlaced: vi.fn() });
		ctl.toggle();
		postFromStage({ stage: 'ready' }, win);
		expect(ctl.isOpen()).toBe(true);

		navigateSameOrigin(win);
		// The beat arrives from a source we cannot match — the TOKEN is what identifies it.
		postFromStage({ stage: 'closed', tok: ctl.token }, {});
		expect(onLost).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenLastCalledWith(null);
		expect(ctl.isOpen()).toBe(false);
	});

	it('a cross-origin Stage is gone, and asking about it never throws', () => {
		// Reading `location` on a cross-origin window THROWS (measured). Every path that
		// touches the handle has to treat that as "not ours" rather than propagate it: the
		// console dereferences this window during RENDER, and a SecurityError there took the
		// whole Studio down to its crash card.
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onLost = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange: vi.fn(), onLost, onPlaced: vi.fn() });
		ctl.toggle();
		postFromStage({ stage: 'ready' }, win);
		navigateCrossOrigin(win);
		expect(() => ctl.isOpen()).not.toThrow();
		expect(ctl.isOpen()).toBe(false);
		expect(() => ctl.show(2)).not.toThrow();
		expect(() => ctl.write('<v2/>')).not.toThrow();
	});

	it('a token-matched goodbye is ignored while the Stage is still demonstrably alive', () => {
		// The token outlives one window (it has to — the deck document is built before the
		// window exists), so an OLD document unloading just as a new one opens would otherwise
		// tear down the new one. Reality is the arbiter.
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onLost = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange: vi.fn(), onLost, onPlaced: vi.fn() });
		ctl.toggle();
		postFromStage({ stage: 'ready' }, win);
		postFromStage({ stage: 'closed', tok: ctl.token }, {}); // stale beat, window still ours
		expect(onLost).not.toHaveBeenCalled();
		expect(ctl.isOpen()).toBe(true);
	});

	it('a throwing write does not latch the document out of ever being replaced', () => {
		// `written = doc` used to be assigned BEFORE the try, so a write that threw left the
		// controller believing that doc was on screen — and `write(doc)` is idempotent on an
		// unchanged doc, so nothing could ever replace it again.
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const ctl = createStageController({ getDoc: () => '', getIndex: () => 0, onChange: vi.fn(), onLost: vi.fn(), onPlaced: vi.fn() });
		ctl.toggle();
		win.document.write.mockImplementationOnce(() => {
			throw new Error('gone');
		});
		ctl.write('<stage/>');
		const n = writes(win).length;
		ctl.write('<stage/>'); // the SAME doc must still be attempted
		expect(writes(win).length).toBeGreaterThan(n);
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
