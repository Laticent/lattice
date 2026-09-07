/**
 * THE GUARD THAT HAD NO TEST.
 *
 * `test/unit/runtime/diagram-adoption.test.js` proves what the runtime does with a stamp.
 * Every one of its arms FEEDS the runtime a stamp. Nothing asserted that a host PRODUCES
 * the right one — so the adversarial trio's checker deleted the host-side answer outright
 * (an unconditional `'in-place'` in both preview hosts, i.e. the whole fix removed) and ran
 * everything: 9134 root tests, 3889 docs tests and `check:ownership` all stayed green.
 *
 * These arms are that gate. Each names the operation it stands for, and the first four are
 * defects the trio reproduced on the real surface before this module existed.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
	deckContextKey,
	SWAP_IN_PLACE,
	SWAP_REFLOW,
	sectionSwapKind,
	swapKindForSlide,
} from '../../../lib/core/swap-kind.mjs';

const FM = '---\ntheme: indaco\n---\n\n';
const deck = (...slides) => FM + slides.join('\n\n---\n\n');
/** What a host holds between renders: the shown index plus everything that is not it. */
const at = (source, index) => ({ index, key: deckContextKey(source, index) });
const kind = (before, after) => swapKindForSlide(before, after);

const A = '## Alpha\n\n```mermaid\nflowchart LR\n  A[Input] --> B[Plan]\n```';
const B = '## Bravo\n\n```mermaid\nflowchart LR\n  X[Zulu] --> Y[Yankee]\n```';
const C = '## Charlie\n\nJust prose.';

describe('swapKindForSlide — the four wrong answers the trio reproduced', () => {
	test('DELETING a slide is a reflow, though the index does not move', () => {
		// The Studio's own toolbar button. `deleteSlide` returns `clampIndex(i, len - 1)`, so
		// deleting slide 2 of 5 leaves the active index at 2 and a DIFFERENT slide under it.
		// Comparing indices said `in-place`, and the deleted slide's diagram painted on top of
		// its replacement for ~136ms — 10 frames, screenshotted on the built Studio.
		const before = deck(A, B, C);
		const after = deck(A, C);
		assert.equal(kind(at(before, 1), at(after, 1)), SWAP_REFLOW);
	});

	test('opening a DIFFERENT DECK at the same index is a reflow', () => {
		// `openDeck` does `setActiveSlide(0)` and the preview host is not remounted, so deck A
		// slide 0 → deck B slide 0 compared equal on index alone.
		assert.equal(kind(at(deck(A, B, C), 0), at(deck(B, C, A), 0)), SWAP_REFLOW);
	});

	test('REORDERING is a reflow, though every slide still sits at some index', () => {
		const before = deck(A, B, C);
		const after = deck(A, C, B);
		assert.equal(kind(at(before, 1), at(after, 1)), SWAP_REFLOW);
	});

	test('a checkpoint RESTORE that keeps the slide count is a reflow', () => {
		assert.equal(kind(at(deck(A, B, C), 1), at(deck(C, A, B), 1)), SWAP_REFLOW);
	});
});

describe('swapKindForSlide — what an edit is', () => {
	test('editing the shown slide is in-place, which is the whole point', () => {
		const before = deck(A, B, C);
		const after = deck(A, B.replace('Yankee', 'Yankeex'), C);
		assert.equal(kind(at(before, 1), at(after, 1)), SWAP_IN_PLACE);
	});

	test('an edit that leaves a fence UNTERMINATED is a reflow, and correctly so', () => {
		// An unclosed ``` swallows every later `---`, so the deck really does have fewer
		// slides than it did a keystroke ago and the slide at index 2 is not the one that was
		// there. The key sees that because it carries the count. This arm exists because the
		// first draft of this test file got it wrong the other way and blamed the module.
		const before = deck(A, B, C);
		const after = deck(A, `${B}x`, C);
		assert.equal(kind(at(before, 1), at(after, 1)), SWAP_REFLOW);
	});

	test('editing the shown slide is in-place however large the edit', () => {
		// There is no similarity threshold here and deliberately so: the refuted third design
		// scored all twelve pairs of examples/mermaid-init-merge.md at 0.68–0.82 and would
		// have held each one's ink for the others. Replacing the shown slide wholesale is
		// still that slide, edited.
		assert.equal(kind(at(deck(A, B, C), 1), at(deck(A, C, C), 1)), SWAP_IN_PLACE);
	});

	test('navigating to another slide is a reflow even with the deck untouched', () => {
		const d = deck(A, B, C);
		assert.equal(kind(at(d, 1), at(d, 2)), SWAP_REFLOW);
	});

	test('editing FRONT MATTER is a reflow — it changes how every slide draws', () => {
		const before = deck(A, B, C);
		const after = before.replace('indaco', 'cuoio');
		assert.equal(kind(at(before, 1), at(after, 1)), SWAP_REFLOW);
	});

	test('adding a slide AFTER the shown one is a reflow', () => {
		// Nothing about the shown slide changed, but the deck did; the key carries the count
		// and the other slides' text, so this cannot be mistaken for an edit.
		assert.equal(kind(at(deck(A, B), 0), at(deck(A, B, C), 0)), SWAP_REFLOW);
	});

	test('an unknown on either side is a reflow, and two unknowns never agree', () => {
		const d = deck(A, B, C);
		assert.equal(deckContextKey(d, undefined), null);
		assert.equal(deckContextKey(d, 9), null, 'an index the deck does not have is unknown');
		assert.equal(kind(at(d, undefined), at(d, undefined)), SWAP_REFLOW);
		assert.equal(kind(at(d, 1), at(d, 9)), SWAP_REFLOW);
		assert.equal(kind(null, at(d, 1)), SWAP_REFLOW, 'a first render has nothing to compare');
	});
});

describe('deckContextKey', () => {
	test('excludes the shown slide and nothing else', () => {
		const before = deck(A, B, C);
		assert.equal(deckContextKey(before, 1), deckContextKey(deck(A, B.replace('Yankee', 'Whiskey'), C), 1));
		assert.notEqual(deckContextKey(before, 1), deckContextKey(deck(A.replace('Plan', 'Programme'), B, C), 1));
	});

	test('records WHERE the shown slide sits, so moving it is visible', () => {
		// The shown slide is blanked rather than dropped. Without that, showing slide 0 of
		// [A,B,C] and slide 0 of [B,C] after a delete would both key as "B,C".
		assert.notEqual(deckContextKey(deck(A, B, C), 0), deckContextKey(deck(B, C, A), 2));
	});

	test('the encoding is injective — a moved separator cannot key equal', () => {
		// Length-prefixed, not joined on a delimiter. THIS is the case that kills a plain
		// join: two decks whose non-shown slides differ only in where a boundary falls
		// concatenate to the same text, and a plain join reported them `in-place`. An
		// earlier version of this arm used inputs that stayed distinct either way, so it
		// passed with the prefix removed — it pinned nothing.
		// Both decks' non-shown slides concatenate to the identical string `\na\n\nb\n\nc`;
		// only the boundary moves. Verified against a plain join, which keys them equal and
		// therefore reports a slide-boundary edit as `in-place`.
		const a = deckContextKey(deck('shown', 'a\n\nb', 'c'), 0, 'd1');
		const b = deckContextKey(deck('shown', 'a', 'b\n\nc'), 0, 'd1');
		assert.notEqual(a, b, 'the same text split at a different boundary must not key equal');
	});

	test('distinct decks get distinct keys, whatever an author types', () => {
		const sneaky = ['a/b', '2:cd', '', '|', '-'];
		const keys = new Set(sneaky.map((s) => deckContextKey(deck(s, 'tail'), 1)));
		assert.equal(keys.size, sneaky.length, 'every distinct deck must get a distinct key');
	});
});

describe('deckContextKey — a one-slide deck, and the deck id', () => {
	// `newDeckSource()` emits exactly one slide with no front matter, so this is the shape
	// every Studio deck starts life as — and a deck of one slide has NO context to compare,
	// because the shown slide is the one the key blanks.
	const one = (t) => `<!-- _class: title -->\n\n# ${t}\n\n\`Draft\``;
	const at1 = (src, id) => ({ index: 0, key: deckContextKey(src, 0, id) });

	test('a one-slide deck with NO deck id is unknown, so it can never hold', () => {
		assert.equal(deckContextKey(one('Alpha'), 0), null);
		assert.equal(kind(at1(one('Alpha')), at1(one('Bravo'))), SWAP_REFLOW, 'a deck switch');
		assert.equal(kind(at1(one('Alpha')), at1(one('Alphax'))), SWAP_REFLOW, 'and an edit, conservatively');
	});

	test('with a deck id, a one-slide EDIT holds and a one-slide SWITCH does not', () => {
		assert.equal(kind(at1(one('Alpha'), 'd1'), at1(one('Alphax'), 'd1')), SWAP_IN_PLACE);
		assert.equal(kind(at1(one('Alpha'), 'd1'), at1(one('Bravo'), 'd2')), SWAP_REFLOW);
	});

	test('the deck id alone is not enough — a delete inside one deck is still a reflow', () => {
		const before = { index: 1, key: deckContextKey(deck(A, B, C), 1, 'd1') };
		const after = { index: 1, key: deckContextKey(deck(A, C), 1, 'd1') };
		assert.equal(kind(before, after), SWAP_REFLOW);
	});

	test('the same deck id on a multi-slide deck does not mask a deck switch', () => {
		// A stale id (a host that reuses one) must not defeat the content half.
		const a = { index: 1, key: deckContextKey(deck(A, B, C), 1, 'same') };
		const b = { index: 1, key: deckContextKey(deck(B, C, A), 1, 'same') };
		assert.equal(kind(a, b), SWAP_REFLOW);
	});
});

describe('sectionSwapKind — the filmstrip host', () => {
	test('exactly one changed section is an edit', () => {
		assert.equal(sectionSwapKind(['a', 'b', 'c'], ['a', 'B', 'c']), SWAP_IN_PLACE);
	});

	test('a reorder changes two, so it is a reflow', () => {
		// `patchSections` used to ask only whether the slide COUNT changed. A reorder keeps
		// the count, so it was stamped `in-place` and one slide's diagram went into another
		// slide's box — the exact defect the stamp exists to stop.
		assert.equal(sectionSwapKind(['a', 'b', 'c'], ['a', 'c', 'b']), SWAP_REFLOW);
	});

	test('pasting a different deck of the same length is a reflow', () => {
		assert.equal(sectionSwapKind(['a', 'b', 'c'], ['x', 'y', 'z']), SWAP_REFLOW);
	});

	test('no change at all is a reflow — nothing arrives, so nothing may be held', () => {
		assert.equal(sectionSwapKind(['a', 'b', 'c'], ['a', 'b', 'c']), SWAP_REFLOW);
	});

	test('a different length, an empty deck or a missing previous render is a reflow', () => {
		assert.equal(sectionSwapKind(['a', 'b'], ['a', 'b', 'c']), SWAP_REFLOW);
		assert.equal(sectionSwapKind([], []), SWAP_REFLOW);
		assert.equal(sectionSwapKind(undefined, ['a']), SWAP_REFLOW, 'a first render has no previous sections');
	});
});
