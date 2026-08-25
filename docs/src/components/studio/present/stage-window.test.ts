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
		for (const k of ['keyAction', 'swipeAction', 'createWheelGate', 'createZoomGesture', 'PRESENT_KEYMAP']) {
			expect(doc, `${k} must be inlined, not reimplemented`).toContain(k);
		}
		// NAME PRESENCE IS NOT THE TEST — that is what made the first draft of this cell
		// vacuous. `toContain('keyAction')` is satisfied by `var keyAction=function(k,m){return
		// m[k]}` — a twin with the exact defect the real kernel's `Object.hasOwn` exists to
		// prevent — and by a `swipeAction` with no threshold at all. Both were dropped in and
		// this cell stayed green. So RUN the emitted kernel and assert its BEHAVIOR, which is
		// the idiom `test/unit/export/inlinable-kernels.test.js` already uses.
		const block = doc.slice(doc.indexOf('var fitScale='), doc.indexOf('};\nvar PRESENT_KEYMAP') + 2);
		const map = JSON.parse(doc.slice(doc.indexOf('var PRESENT_KEYMAP=') + 'var PRESENT_KEYMAP='.length).slice(0, doc.slice(doc.indexOf('var PRESENT_KEYMAP=') + 'var PRESENT_KEYMAP='.length).indexOf('};') + 1));
		const k = new Function(`${block}; return { keyAction, swipeAction, createWheelGate, createZoomGesture };`)() as {
			keyAction: (key: string, map: Record<string, string>) => string | undefined;
			swipeAction: (o: { dx: number; dy: number }) => string | null;
			createWheelGate: () => (dx: number, dy: number, now: number) => string | null;
			createZoomGesture: (o: { min: number; max: number }) => {
				down: (p: { x: number; y: number }[]) => void;
				move: (p: { x: number; y: number }[], v: { w: number; h: number }) => string | null;
				up: (rest: number) => { swipeBlocked: boolean };
			};
		};
		// The real `keyAction` is own-property only; a raw `m[k]` twin returns a function here.
		expect(k.keyAction('ArrowRight', map)).toBe('next');
		expect(k.keyAction('toString', map)).toBeUndefined();
		// The real `swipeAction` has a threshold and an axis ratio; a twin that reads the sign
		// of `dx` turns the deck on every stray tap and on every vertical scroll.
		expect(k.swipeAction({ dx: -80, dy: 0 })).toBe('next');
		expect(k.swipeAction({ dx: -6, dy: 0 })).toBeNull();
		expect(k.swipeAction({ dx: 0, dy: -80 })).toBeNull();
		// The real wheel gate has a threshold AND a cooldown, so a scroll inertia tail cannot
		// run the deck to the end.
		const gate = k.createWheelGate();
		expect(gate(0, 60, 1000)).toBe('next');
		expect(gate(0, 60, 1010)).toBeNull();
		// And the finger counter refuses a swipe that was ever a pinch.
		const z = k.createZoomGesture({ min: 1, max: 1 });
		z.down([{ x: 0, y: 0 }]);
		z.down([
			{ x: 0, y: 0 },
			{ x: 90, y: 0 },
		]);
		z.move(
			[
				{ x: 0, y: 0 },
				{ x: 200, y: 0 },
			],
			{ w: 1280, h: 720 },
		);
		expect(z.up(1).swipeBlocked, 'a pinch must never be measured as a swipe').toBe(true);
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
		expect(plain()).not.toContain(`id="latt-ctl"`);
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
/**
 * A `message` the controller will see. `origin` defaults to OURS, because that is what a
 * real Stage posts with: the document is written into `about:blank`, which INHERITS the
 * opener's origin (measured in Chromium). Pass a foreign one to play the page that
 * navigated our Stage away.
 */
function postFromStage(data: unknown, source: unknown, origin: string = location.origin) {
	const ev = new Event('message');
	Object.defineProperty(ev, 'data', { value: data, configurable: true });
	Object.defineProperty(ev, 'source', { value: source, configurable: true });
	Object.defineProperty(ev, 'origin', { value: origin, configurable: true });
	window.dispatchEvent(ev);
}
/** What was written into the window, newest last. */
const writes = (win: ReturnType<typeof fakeWindow>) => win.document.write.mock.calls.map((c) => String(c[0]));

describe('stage-window — createStageController', () => {
	afterEach(() => {
		// TIMERS TOO, and in `afterEach` rather than at the end of each cell. `restoreAllMocks`
		// does not touch them, and a cell that installs fake timers and then FAILS never
		// reaches its own `useRealTimers()` — so one red cell would hang or corrupt every
		// later cell in the file, and the first real failure on this surface would arrive
		// disguised as a cascade. (`1324-test-order-independence` is the same lesson.)
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

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

	it('stays silent when WE closed the Stage — and when the PRESENTER closed the window', async () => {
		// §4's "Stage disconnected" state, narrowed by §13 to the losses NOBODY MEANT.
		//
		// Two deliberate closes, and neither is worth a sentence: the presenter pressing the
		// pill they just pressed, and the presenter closing the projected window by hand.
		// This cell used to assert the OPPOSITE of its second half — a hand-close announced
		// "Stage disconnected", which made the sentence as likely to mean "you closed it" as
		// "the room lost the deck", and a notice that fires for an act you just performed is
		// the one people learn to dismiss unread.
		//
		// The hand-close is modelled the way Chromium actually behaves: the unload beat
		// arrives while `closed` is STILL FALSE, and the flag flips a beat later (measured —
		// see the controller's table). A fake that sets `closed` up front would let a
		// synchronous read pass here and misfile every real hand-close in the browser.
		vi.useFakeTimers();
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onLost = vi.fn();
		const onChange = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange, onLost, onPlaced: vi.fn() });
		ctl.toggle();
		postFromStage({ stage: 'ready' }, win);

		postFromStage({ stage: 'closed' }, win); // the beat, with `closed` not yet flipped
		expect(onChange, 'the console must let go the moment the beat lands').toHaveBeenLastCalledWith(null);
		expect(ctl.isOpen()).toBe(false);
		win.closed = true; // …and now the platform catches up
		await vi.advanceTimersByTimeAsync(2000);
		expect(onLost, 'a window the presenter closed is not a loss to announce').not.toHaveBeenCalled();

		onChange.mockClear();
		ctl.toggle(); // re-open
		postFromStage({ stage: 'ready' }, win);
		ctl.close(); // WE closed it — the window's own unload beat must not announce anything
		postFromStage({ stage: 'closed' }, win);
		await vi.advanceTimersByTimeAsync(2000);
		expect(onLost).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it('announces a Stage that vanished with NO goodbye — the crash the beat cannot report', async () => {
		// The liveness poll, and the case the whole notice exists for: a renderer killed, a
		// tab discarded, a projector that lost power. There is no unload beat, so nothing but
		// the poll can notice — and unlike the beat path it does NOT consult `closed`, because
		// a deliberate close reliably sends a goodbye (measured: a hand-close fires both
		// `pagehide` and `unload`). A window that went without one is a death, and a `closed`
		// check here would silence exactly the case being tested.
		vi.useFakeTimers();
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onLost = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange: vi.fn(), onLost, onPlaced: vi.fn() });
		ctl.toggle();
		postFromStage({ stage: 'ready' }, win);

		win.closed = true; // gone, and it never said so
		await vi.advanceTimersByTimeAsync(2500);
		expect(onLost).toHaveBeenCalledTimes(1);
		expect(onLost, 'a beatless disappearance is a death, not a navigation').toHaveBeenCalledWith('gone');
		expect(ctl.isOpen()).toBe(false);
		vi.useRealTimers();
	});

	it('the poll tells a window that VANISHED from one that was taken over', async () => {
		// The poll's other arm. Every navigation fires `pagehide`, so in practice the beat
		// gets there first and this is the backstop — but the arm exists, and an arm no cell
		// can distinguish is an arm that reports whatever it likes. Here the beat is simply
		// never delivered (a script that never ran, a post that did not land) and the poll is
		// left to classify a window that is open and is not ours.
		vi.useFakeTimers();
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onLost = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange: vi.fn(), onLost, onPlaced: vi.fn() });
		ctl.toggle();
		postFromStage({ stage: 'ready' }, win);

		navigateSameOrigin(win); // open, reachable, someone else's document — and no beat
		await vi.advanceTimersByTimeAsync(2500);
		expect(onLost).toHaveBeenCalledWith('navigated');
		vi.useRealTimers();
	});

	it('does not report a loss once the presenter has already re-opened the Stage', async () => {
		// The classification is in flight for up to 600ms, and a presenter who presses S
		// inside that window would otherwise be told the Stage left the deck while looking at
		// the one that just came up. `ownSeq` is what makes the pending answer stale.
		vi.useFakeTimers();
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onLost = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange: vi.fn(), onLost, onPlaced: vi.fn() });
		ctl.toggle();
		postFromStage({ stage: 'ready' }, win);

		navigateSameOrigin(win); // a real loss — it WOULD be announced if left alone
		postFromStage({ stage: 'closed', tok: ctl.token }, {});
		await vi.advanceTimersByTimeAsync(100);
		const fresh = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(fresh as unknown as Window);
		ctl.toggle(); // the presenter puts it back before the grace window is out
		postFromStage({ stage: 'ready' }, fresh);
		await vi.advanceTimersByTimeAsync(2000);
		expect(onLost, 'the obituary of the old Stage must not land on the new one').not.toHaveBeenCalled();
		expect(ctl.isOpen()).toBe(true);
		vi.useRealTimers();
	});

	it('notices a Stage that was NAVIGATED away — the case `e.source` cannot see', async () => {
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

		vi.useFakeTimers();
		navigateSameOrigin(win);
		// The beat arrives from a source we cannot match — the TOKEN is what identifies it.
		postFromStage({ stage: 'closed', tok: ctl.token }, {});
		// THE REVERT IS IMMEDIATE. Only the sentence waits on the classification, and that
		// order is the point: the console must stop driving a window it no longer owns at the
		// instant it learns, whatever it later decides to say about it.
		expect(onChange).toHaveBeenLastCalledWith(null);
		expect(ctl.isOpen()).toBe(false);
		expect(onLost).not.toHaveBeenCalled();

		// …and then it is announced, as a NAVIGATION rather than a death. The window is still
		// open — it is sitting on the projector showing the room someone else's page, which
		// is a different thing for the presenter to do something about than a blank screen.
		await vi.advanceTimersByTimeAsync(1000);
		expect(onLost).toHaveBeenCalledTimes(1);
		expect(onLost).toHaveBeenCalledWith('navigated');
		vi.useRealTimers();
	});

	it('refuses a nav from a page that TOOK OVER the Stage — `e.source` cannot see it', () => {
		// THE GUARD THE `nav` BRANCH IS NAMED FOR, and it was unpinned: deleting `if (!ours)`
		// left the whole suite green, so the token-only path was one edit from driving the
		// presenter's deck.
		//
		// The subtle half is WHY `ours` alone is not the answer. A WindowProxy identifies a
		// BROWSING CONTEXT, not a document, so it survives navigation — measured in Chromium:
		// after a deck link carried our Stage to a foreign origin, that page posted back with
		// `e.source === stageWin` STILL TRUE. `ours` was granted to the attacker. What does
		// change is the ORIGIN, and a real Stage inherits ours (it is written into
		// `about:blank`), so the origin check costs the real one nothing.
		const win = fakeWindow();
		vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
		const onNav = vi.fn();
		const ctl = createStageController({ getDoc: () => '<stage/>', getIndex: () => 0, onChange: vi.fn(), onLost: vi.fn(), onPlaced: vi.fn(), onNav });
		ctl.toggle();
		postFromStage({ stage: 'ready' }, win);
		// Our own Stage drives, which is the behavior all of this has to leave intact.
		postFromStage({ stage: 'nav', act: 'next', tok: ctl.token }, win);
		expect(onNav).toHaveBeenCalledWith('next');
		onNav.mockClear();

		// A page that took the window over: SAME source (the proxy survived), foreign origin.
		postFromStage({ stage: 'nav', act: 'next', tok: ctl.token }, win, 'https://evil.example');
		expect(onNav, 'a navigated-away Stage must not drive the deck').not.toHaveBeenCalled();

		// And a stranger holding a handle to this tab, guessing the token, from anywhere.
		postFromStage({ stage: 'nav', act: 'next', tok: ctl.token }, {});
		expect(onNav, 'only the handle we hold may drive the deck').not.toHaveBeenCalled();

		// Even same-origin, once the window stopped being our document, a nav is refused —
		// `ours` is true again here, so `alive()` is the half that has to hold.
		navigateSameOrigin(win);
		postFromStage({ stage: 'nav', act: 'next', tok: ctl.token }, win);
		expect(onNav).not.toHaveBeenCalled();
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
