const test = require('node:test');
const assert = require('node:assert/strict');

// THE INLINING CONTRACT.
//
// The exported `.html` player ships ONE script, pinned by a `sha256-` CSP hash, so it cannot
// `import` anything. Shared kernels reach it by having their SOURCE embedded verbatim via
// `.toString()` — the idiom `lib/core/present-transport.mjs` documents in its header:
//
//   "Keep every export self-contained — no module-scope references reachable only by
//    closure — so the inlining holds."
//
// A closure does not travel with the source. So a kernel that calls a module-scope helper
// inlines to code that throws `<helper> is not defined` — at RUNTIME, inside the player's own
// try/catch, which means a shared deck silently loses the feature rather than failing loudly.
// That is exactly the class of bug a reviewer cannot see in a diff.
//
// These tests do not inspect the source with a regex. They EVALUATE each kernel the way the
// player does — in a scope containing nothing else — and then drive it. A stray module-scope
// reference is a ReferenceError here, at the line that reintroduced it.

/** Inline `fn`'s source into an empty scope, exactly as the player's kernel block does. */
function inlineIntoEmptyScope(fn, name) {
	// `var <name> = <source>` rather than relying on `.toString()` emitting a named
	// declaration — a minifying bundler renames module functions, which is why the player
	// binds every inlined kernel to a stable `var` (see playerJs).
	return new Function(`"use strict"; var ${name} = ${fn.toString()}; return ${name};`)();
}

let makeCursor;
let buildTrack;
test.before(async () => {
	({ makeCursor, buildTrack } = await import('@workwel/cadenza'));
});

test('makeCursor survives being inlined into an empty scope, and still works', () => {
	const inlined = inlineIntoEmptyScope(makeCursor, 'makeCursor');
	const track = buildTrack('The first sentence runs a while. A second one follows it.');
	assert.ok(track.cues.length >= 2, 'fixture should produce at least two cues');

	// Constructing it is where a module-scope `cloneTrack(...)` would blow up.
	const cursor = inlined(track);

	// And it must still answer the two questions the player asks.
	const firstWord = track.cues[0].words[0];
	assert.deepEqual(cursor.at(firstWord.startMs), { cueIndex: 0, wordIndex: 0 }, 'at() finds the active word');
	assert.equal(cursor.at(-1), null, 'before the timeline there is no active word');

	// align() re-anchors a cue to a MEASURED clip span — the call the exported player makes on
	// each clip's `loadedmetadata`, and the one Present makes from Suono's measured onset.
	const before = track.cues[0].endMs;
	cursor.align(0, 0, before * 2);
	assert.equal(cursor.track().cues[0].endMs, before * 2, 'the measured span replaces the estimate');
	assert.ok(cursor.track().cues[1].startMs > track.cues[1].startMs, 'the un-anchored tail shifts to stay monotonic');
});

test('makeCursor does not mutate the track it was handed', () => {
	// The player builds one track per slide and may re-anchor it on replay; the clone is what
	// keeps a second play from compounding the first play's measurements.
	const inlined = inlineIntoEmptyScope(makeCursor, 'makeCursor');
	const track = buildTrack('One sentence here. And another.');
	const originalEnd = track.cues[0].endMs;
	inlined(track).align(0, 0, originalEnd * 3);
	assert.equal(track.cues[0].endMs, originalEnd, "the caller's track is untouched");
});

test('the present-transport kernels the player already inlines are still self-contained', () => {
	// Guards the kernels that were ALREADY being inlined before the cursor joined them, so a
	// refactor there fails here rather than in a shipped file.
	return import('../../../lib/core/present-transport.mjs').then((t) => {
		const fit = inlineIntoEmptyScope(t.fitScale, 'fitScale');
		assert.equal(fit({ stageW: 1000, stageH: 1000, slideW: 1000, slideH: 500 }), 1);

		const swipe = inlineIntoEmptyScope(t.swipeAction, 'swipeAction');
		assert.equal(swipe({ dx: -100, dy: 0 }), 'next');

		const transport = inlineIntoEmptyScope(t.createTransport, 'createTransport');
		const seen = [];
		const tr = transport({ count: 3, onShow: (i) => seen.push(i) });
		tr.next();
		tr.last();
		assert.deepEqual(seen, [1, 2]);

		// keyAction defaults its map argument to the module-scope PRESENT_KEYMAP, so it is only
		// self-contained when the caller passes the map — which the player always does, and
		// which its comment explains. Pin both halves of that contract.
		const keyAction = inlineIntoEmptyScope(t.keyAction, 'keyAction');
		assert.equal(keyAction('ArrowRight', t.PRESENT_KEYMAP), 'next');
		assert.throws(() => keyAction('ArrowRight'), ReferenceError, 'the no-map form is NOT inlinable — the player must pass the keymap');

		// The zoom rule joined the inlined set when the presenter screen gained pinch
		// (2026-08-10-preview-pinch-zoom.md). `createZoomGesture` is inlined AGAIN today, by
		// the Stage window, and for a reason worth stating: the Stage does not zoom, it uses
		// the gesture purely as the FINGER COUNTER that `swipeAction` has to consult first.
		// `zoomStep` still has no live caller, and the guard stays for it anyway —
		// `present-transport.mjs`'s header promises every export is self-contained, and a
		// promise re-verified only when someone needs it is not a promise. `createZoomGesture`
		// is the biggest kernel in the file and the easiest to break this way (it closes over
		// `emit`, `bound` and `about`, all of which must be INTERNAL, not module-scope).
		const zoomStep = inlineIntoEmptyScope(t.zoomStep, 'zoomStep');
		assert.ok(zoomStep(-100) > 1, 'the inlined step still zooms in on a push away');

		const zoom = inlineIntoEmptyScope(t.createZoomGesture, 'createZoomGesture')();
		zoom.down([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
		zoom.move([{ x: -50, y: 0 }, { x: 150, y: 0 }], { w: 1000, h: 600 });
		assert.equal(zoom.state().scale, 2, 'the inlined gesture still pinches');
		assert.equal(zoom.up(0).swipeBlocked, true, 'and still blocks the swipe it would otherwise fake');

		// `createWheelGate` and `padInset` are the two the Stage window added to the inlined
		// set, and neither was pinned here when it did — the gate this file IS was simply not
		// extended to the kernels the change inlined. `createWheelGate` is the riskier of the
		// two: it returns a CLOSURE over `last`, so a refactor that lifted that state to
		// module scope would keep working in the bundle and silently stop gating in the popup.
		const wheelGate = inlineIntoEmptyScope(t.createWheelGate, 'createWheelGate')();
		assert.equal(wheelGate(0, 60, 1000), 'next', 'the inlined gate still turns on a firm flick');
		assert.equal(wheelGate(0, 60, 1010), null, 'and its cooldown state survived the trip');
		assert.equal(wheelGate(0, 6, 9000), null, 'and so did its threshold');

		const pad = inlineIntoEmptyScope(t.padInset, 'padInset');
		assert.ok(pad(1280, 720, { factor: 0.05 }) > 0, 'the inlined inset still computes a pad');
	});
});

// ── the backtick trap ────────────────────────────────────────────────────────
// The player's script and CSS bodies are TEMPLATE LITERALS containing JavaScript and CSS. A
// raw backtick anywhere inside one — including in ordinary prose in a comment, where it is the
// natural way to write an identifier — terminates the literal early and turns the rest of the
// file into garbage.
//
// The failure MODE is what earns this a gate rather than care. The module stops PARSING, so
// every test that imports it fails at once, with a message naming a token from the middle of a
// comment and pointing nowhere near the cause. It cost three separate debugging rounds while
// the narration work was built.
//
// This checks the outcome rather than the source: a syntax check on the real file. It cannot
// false-positive on a legitimately nested or escaped backtick the way a regex over the text
// does, and when it fails the syntax error IS the report.
test('player-core.mjs parses — no template literal is terminated early', () => {
	const { execFileSync } = require('node:child_process');
	const file = require('node:path').join(__dirname, '../../../lib/export/player-core.mjs');
	try {
		execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
	} catch (err) {
		assert.fail(
			`lib/export/player-core.mjs does not parse. The usual cause is a raw backtick inside one of its template ` +
				`literal bodies (playerCss / playerJs / narrationJs) — write identifiers unquoted in that prose.\n\n` +
				String(err.stderr || err.message),
		);
	}
});
