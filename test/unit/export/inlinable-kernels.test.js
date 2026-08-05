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
	({ makeCursor, buildTrack } = await import('@slidewright/cadenza'));
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
	});
});
