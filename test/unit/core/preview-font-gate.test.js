// The preview font gate's CONTRACT, and the ORDER its two call sites depend on.
//
// The gate holds a preview document's reveal until its own faces land (#2095's
// root cause, one level up). Everything here guards a failure that is SILENT on
// the surface it governs: a gate that never resolves leaves a blank preview, and
// a gate injected after its revealer leaves the shift exactly where it was while
// every other check stays green.

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { fontGateAgent, onFontsReady, PREVIEW_FONT_GATE_MS } = require('../../../lib/core/preview-font-gate.mjs');

/** Run the agent source against a fake document + fonts set, and report when it
 *  resolved. No jsdom: the agent is deliberately dependency-free source, so a
 *  hand-built host is both sufficient and honest about what is being exercised. */
function runAgent(src, { fonts, throwOnFonts = false, readyState = 'complete' } = {}) {
	const timers = [];
	const win = {};
	const documentElement = { offsetHeight: 0 };
	let layoutReads = 0;
	// `readyState` defaults to 'complete' so the simple arms below run `start()` inline.
	// A REAL preview document is always 'loading' when the agent parses (it sits in
	// <head>), so the DOMContentLoaded arm is the branch that actually ships — hence
	// the listener registry and the `loading` cases further down. An earlier cut of this
	// harness had neither, and a typo in the event NAME survived all fifteen tests.
	const listeners = new Map();
	const doc = {
		readyState,
		addEventListener(type, fn) {
			if (!listeners.has(type)) listeners.set(type, []);
			listeners.get(type).push(fn);
		},
		get documentElement() {
			layoutReads++;
			return documentElement;
		},
	};
	if (throwOnFonts) {
		Object.defineProperty(doc, 'fonts', {
			get() {
				throw new Error('fonts API unusable in this host');
			},
		});
	} else {
		doc.fonts = fonts;
	}
	const setTimeoutStub = (fn, ms) => {
		timers.push({ fn, ms });
		return timers.length;
	};
	// eslint-disable-next-line no-new-func
	new Function('window', 'document', 'setTimeout', 'Promise', src)(win, doc, setTimeoutStub, Promise);
	return {
		win,
		timers,
		layoutReads: () => layoutReads,
		/** Fire the listeners registered for `type` — nothing if the agent registered
		 *  under a different name, which is exactly the mutation this catches. */
		fire(type) {
			for (const fn of listeners.get(type) ?? []) fn();
		},
		listenerTypes: () => [...listeners.keys()],
		/** Fire every timer whose delay is <= ms, oldest first. */
		advance(ms) {
			for (const t of timers) if (t.ms <= ms) t.fn();
		},
	};
}

const resolved = (promise) => {
	let done = false;
	promise.then(
		() => {
			done = true;
		},
		() => {
			done = true;
		},
	);
	// Two microtask drains: the agent chains `.then` onto fonts.ready, so the
	// resolution reaches our observer one turn after theirs.
	return Promise.resolve()
		.then(() => {})
		.then(() => {})
		.then(() => done);
};

describe('preview font gate — the agent', () => {
	it('publishes a promise that resolves once the document fonts settle', async () => {
		const host = runAgent(fontGateAgent(), { fonts: { ready: Promise.resolve() } });
		assert.ok(host.win.__latticeFontsReady, 'the agent must publish window.__latticeFontsReady');
		assert.equal(await resolved(host.win.__latticeFontsReady), true);
	});

	it('FORCES LAYOUT before reading fonts.ready', async () => {
		// The trap this gate exists around: a face is fetched only when text using it
		// is first laid out, so `fonts.ready` read before layout resolves immediately
		// over a document whose faces were never requested — certifying nothing.
		const host = runAgent(fontGateAgent(), { fonts: { ready: Promise.resolve() } });
		assert.ok(host.layoutReads() > 0, 'the agent must read documentElement to flush layout before awaiting fonts');
	});

	it('resolves on the BACKSTOP when the face fetches never answer', async () => {
		// A hung face fetch must cost a shift, never a preview that does not appear.
		const host = runAgent(fontGateAgent(), { fonts: { ready: new Promise(() => {}) } });
		assert.equal(await resolved(host.win.__latticeFontsReady), false, 'must not resolve before the backstop');
		host.advance(PREVIEW_FONT_GATE_MS);
		assert.equal(await resolved(host.win.__latticeFontsReady), true, 'the backstop timer must release the reveal');
	});

	it('resolves when the fonts API itself throws on access', async () => {
		// Not redundant with the backstop test: this is the arm that proves the
		// unconditional timer sits OUTSIDE the try, which is the only reason a host
		// whose `document.fonts` getter throws still reveals.
		const host = runAgent(fontGateAgent(), { throwOnFonts: true });
		assert.equal(await resolved(host.win.__latticeFontsReady), true);
	});

	it('resolves when the host has no fonts API at all', async () => {
		const host = runAgent(fontGateAgent(), { fonts: undefined });
		assert.equal(await resolved(host.win.__latticeFontsReady), true);
	});

	it('DEFERS its measurement to DOMContentLoaded while the document is still parsing', async () => {
		// The branch that runs in every real browser: the agent sits in <head>, so
		// readyState is 'loading' and the flush must not measure an empty shell.
		const host = runAgent(fontGateAgent(), { fonts: { ready: Promise.resolve() }, readyState: 'loading' });
		assert.deepEqual(host.listenerTypes(), ['DOMContentLoaded'], 'the agent must wait for DOMContentLoaded, spelled exactly');
		assert.equal(host.layoutReads(), 0, 'nothing may be measured before the DOM is parsed');
		assert.equal(await resolved(host.win.__latticeFontsReady), false, 'must not settle before DOMContentLoaded');

		host.fire('DOMContentLoaded');
		assert.ok(host.layoutReads() > 0, 'the layout flush must run once the DOM is parsed');
		assert.equal(await resolved(host.win.__latticeFontsReady), true);
	});

	it('publishes its flag and promise SYNCHRONOUSLY, before any measurement', () => {
		// The half that makes <head> placement work. A parent that polls decides "is
		// there a gate here?" by whether the flag EXISTS; publishing it late reads as
		// "no gate" and the reveal happens early. That shipped once and measured as no
		// fix at all, so it is pinned rather than trusted.
		const host = runAgent(fontGateAgent(), { fonts: { ready: new Promise(() => {}) }, readyState: 'loading' });
		assert.equal(host.win.__latticeFontsSettled, false, 'the flag must exist, and be false, before DOMContentLoaded');
		assert.ok(host.win.__latticeFontsReady, 'the promise must exist before DOMContentLoaded');
	});

	it('still releases on the backstop when DOMContentLoaded never fires', async () => {
		const host = runAgent(fontGateAgent(), { fonts: { ready: Promise.resolve() }, readyState: 'loading' });
		host.advance(PREVIEW_FONT_GATE_MS);
		assert.equal(await resolved(host.win.__latticeFontsReady), true);
	});

	it('arms exactly one backstop timer, at the configured bound', () => {
		const host = runAgent(fontGateAgent(750), { fonts: { ready: new Promise(() => {}) } });
		assert.deepEqual(
			host.timers.map((t) => t.ms),
			[750],
		);
	});

	it('falls back to the default bound on a nonsense value', () => {
		for (const bad of [0, -1, Number.NaN, undefined, null]) {
			const host = runAgent(fontGateAgent(bad), { fonts: { ready: new Promise(() => {}) } });
			assert.deepEqual(
				host.timers.map((t) => t.ms),
				[PREVIEW_FONT_GATE_MS],
				`bound ${String(bad)} should fall back to the default`,
			);
		}
	});
});

describe('preview font gate — the revealer idiom', () => {
	it('reveals IMMEDIATELY when the agent is absent', () => {
		// The whole reason the injection ORDER is load-bearing: a document that ships
		// without the gate must still paint, so a gate injected too late is a silent
		// no-op rather than a blank frame. The order pin below is what catches that.
		let revealed = 0;
		// eslint-disable-next-line no-new-func
		new Function('window', 'reveal', onFontsReady('reveal'))({}, () => {
			revealed++;
		});
		assert.equal(revealed, 1);
	});

	it('waits for the agent when it is present, and reveals on rejection too', async () => {
		for (const promise of [Promise.resolve(), Promise.reject(new Error('x'))]) {
			promise.catch(() => {});
			let revealed = 0;
			// eslint-disable-next-line no-new-func
			new Function('window', 'reveal', onFontsReady('reveal'))({ __latticeFontsReady: promise }, () => {
				revealed++;
			});
			assert.equal(revealed, 0, 'must not reveal synchronously when the gate is present');
			await Promise.resolve().then(() => {}).then(() => {});
			assert.equal(revealed, 1);
		}
	});
});

describe('preview font gate — the injection order at every call site', () => {
	// A CENSUS, not a spot check. Both builders reveal from INSIDE the document they
	// write, and both fall back to revealing immediately when the gate is missing —
	// so a gate emitted after the revealer produces a working preview with the shift
	// intact and nothing to see. Nothing else in the tree can tell those apart.
	const fs = require('node:fs');
	const path = require('node:path');
	const ROOT = path.join(__dirname, '../../..');

	// The revealer is matched at its INJECTION site, not by its bare name: the FIT
	// agent's own `function fitAgent(gap, clamp)` definition sits 300 lines above the
	// emission, so a bare-name match compares the gate against the wrong occurrence
	// and fails on a file that is correct. Match the concatenation idiom, which only
	// appears where the document is assembled.
	//
	// `waiter` is what actually consumes the gate, and it differs by revealer shape:
	// the two documents that reveal THEMSELVES use the `onFontsReady` idiom; the one
	// revealed by its PARENT polls the flag from `facesReady`. A site that injects the
	// gate and consumes it nowhere is the same silent no-op as a late injection.
	const SITES = [
		{
			file: 'docs/src/playground/deck-preview.js',
			revealer: '+ fitAgent(gap, clamp) +',
			waiter: 'onFontsReady(',
			what: "the filmstrip preview's FIT agent (Playground + Studio)",
		},
		{
			file: 'docs/src/components/studio/present/stage-window.js',
			revealer: 'function lattStageReveal()',
			waiter: 'onFontsReady(',
			what: 'the Stage window, which under `standalone` an audience watches',
		},
		{
			file: 'docs/src/lib/single-slide-render.ts',
			revealer: "fr.style.opacity = '1'",
			// The REVEAL CONDITION itself, not the flag name. `__latticeFontsSettled` also
			// appears in the `LiveHost` type declaration, so keying on it passed even with
			// `facesReady` deleted from the condition — a pin that certified the exact
			// deletion it exists to prevent.
			waiter: 'frameHasPainted(fr) && facesReady(fr, host)',
			what: 'the landing islands / specimens, revealed by the PARENT in scaleFrame',
		},
	];

	for (const site of SITES) {
		it(`${site.file} emits the gate BEFORE ${site.what}`, () => {
			const src = fs.readFileSync(path.join(ROOT, site.file), 'utf8');
			const gate = src.indexOf('fontGateAgent()');
			const reveal = src.indexOf(site.revealer);
			assert.ok(gate !== -1, `${site.file} no longer injects fontGateAgent() — the reveal is ungated again`);
			assert.ok(reveal !== -1, `${site.file} no longer contains its revealer (${site.revealer})`);
			assert.ok(
				src.includes(site.waiter),
				`${site.file} injects the gate but nothing consumes it (${site.waiter}) — the reveal is ungated`,
			);
		});

		it(`${site.file} emits the gate into <head>`, () => {
			// Placement is the contract, not a preference. The agent publishes its flag
			// synchronously and defers its measurement to DOMContentLoaded precisely so
			// <head> is correct everywhere — and for the parent-polled site it is
			// REQUIRED: `.lattice` parses before an end-of-body script runs, so a poll
			// would read `undefined`, conclude "no gate", and reveal early. That exact
			// mistake shipped in this change's first cut and measured as no fix at all.
			const src = fs.readFileSync(path.join(ROOT, site.file), 'utf8');
			const gate = src.indexOf('fontGateAgent()');
			const headClose = src.indexOf('</head>');
			assert.ok(headClose !== -1, `${site.file} no longer closes a <head> — the document shape changed`);
			assert.ok(
				gate < headClose,
				`${site.file} emits fontGateAgent() after </head>. A polling revealer cannot tell a not-yet-parsed ` +
					'gate from an absent one, so a body-placed gate reads as "no gate" and reveals early.',
			);
		});
	}
});
