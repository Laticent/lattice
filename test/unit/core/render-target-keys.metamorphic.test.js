const test = require('node:test');
const assert = require('node:assert/strict');

const {
	RENDER_TARGET_KEY_NAMES,
	ON_WORDS,
	OFF_WORDS,
	readRenderTargetKey,
} = require('../../../lib/core/render-target-keys');

/**
 * METAMORPHIC tests for the render-target reader.
 *
 * Every other arm in render-target-keys.test.js is EXAMPLE-BASED: a block someone thought
 * of, next to the answer they expected. That shape is why this module needed three rounds
 * of review — the first parity arm varied only the value's case, so six divergences sat
 * behind a green suite, and each later round found more inputs nobody had thought to write
 * down. An example test can only fail on an input its author already imagined.
 *
 * A metamorphic test needs no oracle. It states a RELATION between two runs — "this edit
 * must not change the verdict", "this edit can only move the verdict one way" — and then
 * generates the inputs, so it covers blocks nobody wrote by hand. For a front-matter reader
 * that is the right instrument, because almost every defect found here was a REWRITE of the
 * same deck that read differently: the same key capitalized, quoted, commented, indented,
 * duplicated, or CRLF'd.
 *
 * The generator is seeded, so a failure reproduces exactly rather than being a CI ghost.
 */

// xorshift32 — seeded, so the corpus is identical on every machine and every run.
function makeRng(seed) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13; s >>>= 0;
		s ^= s >> 17;
		s ^= s << 5; s >>>= 0;
		return s / 0x100000000;
	};
}

const KEYS = [...RENDER_TARGET_KEY_NAMES];
const VALUES = [...ON_WORDS, ...OFF_WORDS, 'ture', 'maybe', '1', ''];
const OTHER_KEYS = ['theme', 'title', 'size', 'paginate', 'header'];

/** A plausible front-matter block: a few key: value lines, some ours, some not. */
function randomBlock(rnd) {
	const lines = [];
	const n = 1 + Math.floor(rnd() * 5);
	for (let i = 0; i < n; i++) {
		if (rnd() < 0.45) {
			const key = KEYS[Math.floor(rnd() * KEYS.length)];
			const value = VALUES[Math.floor(rnd() * VALUES.length)];
			lines.push(`${key}: ${value}`);
		} else {
			const key = OTHER_KEYS[Math.floor(rnd() * OTHER_KEYS.length)];
			lines.push(`${key}: ${Math.floor(rnd() * 100)}`);
		}
	}
	return lines.join('\n');
}

/** Run one relation over a generated corpus. `relate` gets (block, key) and asserts. */
function overCorpus(seed, relate, iterations = 4000) {
	const rnd = makeRng(seed);
	for (let i = 0; i < iterations; i++) {
		const block = randomBlock(rnd);
		for (const key of KEYS) relate(block, key);
	}
}

/** Rewrite only the KEY of `key:` lines, leaving values and other keys alone. */
const mapKeyLines = (block, key, fn) =>
	block.split('\n').map((line) => {
		const m = line.match(new RegExp(`^([ \\t]*)(${key})(:[ \\t]*)(.*)$`, 'i'));
		return m ? fn(m[1], m[2], m[3], m[4]) : line;
	}).join('\n');

// ── MR1 · CASE ───────────────────────────────────────────────────────────────────────
// The reader lowercases the value and the legacy arm carries /i, so neither the key's case
// nor the value's may change the verdict. This is the relation the FIRST parity arm was
// missing: it varied the value's case (where /i is irrelevant) and never the key's, which
// is where the divergence actually was.

test('MR1: the verdict is invariant under the case of the KEY', () => {
	overCorpus(0x1a2b3c4d, (block, key) => {
		const upper = mapKeyLines(block, key, (i, k, c, v) => `${i}${k.toUpperCase()}${c}${v}`);
		const title = mapKeyLines(block, key, (i, k, c, v) => `${i}${k[0].toUpperCase()}${k.slice(1)}${c}${v}`);
		const base = readRenderTargetKey(block, key);
		assert.equal(readRenderTargetKey(upper, key), base, `KEY upper changed the verdict:\n${block}`);
		assert.equal(readRenderTargetKey(title, key), base, `KEY capitalized changed the verdict:\n${block}`);
	});
});

test('MR1b: the verdict is invariant under the case of the VALUE', () => {
	overCorpus(0x2b3c4d5e, (block, key) => {
		const upper = mapKeyLines(block, key, (i, k, c, v) => `${i}${k}${c}${v.toUpperCase()}`);
		assert.equal(readRenderTargetKey(upper, key), readRenderTargetKey(block, key), `VALUE upper changed the verdict:\n${block}`);
	});
});

// ── MR2 · TRAILING NOISE ─────────────────────────────────────────────────────────────
// A trailing YAML comment and trailing horizontal whitespace are not part of the value.
// The comment relation is the bug this whole module exists for, stated as a law instead of
// as one example.

test('MR2: appending a trailing YAML comment never changes the verdict', () => {
	overCorpus(0x3c4d5e6f, (block, key) => {
		const commented = mapKeyLines(block, key, (i, k, c, v) => `${i}${k}${c}${v}  # a note`);
		assert.equal(readRenderTargetKey(commented, key), readRenderTargetKey(block, key), `a comment changed the verdict:\n${block}`);
	});
});

test('MR2b: trailing spaces and tabs never change the verdict', () => {
	overCorpus(0x4d5e6f70, (block, key) => {
		const padded = mapKeyLines(block, key, (i, k, c, v) => `${i}${k}${c}${v} \t `);
		assert.equal(readRenderTargetKey(padded, key), readRenderTargetKey(block, key), `trailing whitespace changed the verdict:\n${block}`);
	});
});

// ── MR3 · QUOTING ────────────────────────────────────────────────────────────────────
// Quoting a scalar is a YAML no-op. It was NOT a no-op for the old export (the $-anchored
// regex rejected every quoted value), so this relation holds only because of the union's
// scalar arm — which makes it worth pinning: it is the one widening stated as a law.

test('MR3: quoting the value never changes the verdict', () => {
	overCorpus(0x5e6f7081, (block, key) => {
		const base = readRenderTargetKey(block, key);
		for (const q of ['"', "'"]) {
			const quoted = mapKeyLines(block, key, (i, k, c, v) => (v === '' ? `${i}${k}${c}` : `${i}${k}${c}${q}${v}${q}`));
			assert.equal(readRenderTargetKey(quoted, key), base, `${q}-quoting changed the verdict:\n${block}`);
		}
	});
});

// ── MR4 · LAYOUT ─────────────────────────────────────────────────────────────────────

test('MR4: indenting the key never changes the verdict', () => {
	overCorpus(0x6f708192, (block, key) => {
		const indented = mapKeyLines(block, key, (i, k, c, v) => `  ${i}${k}${c}${v}`);
		assert.equal(readRenderTargetKey(indented, key), readRenderTargetKey(block, key), `indenting changed the verdict:\n${block}`);
	});
});

test('MR4b: CRLF and LF read identically', () => {
	// The repo takes line endings seriously enough to have a decision record
	// (2026-08-04-line-endings-lf-boundaries.md); a reader that disagreed with itself across
	// the two would render a Windows-authored deck differently from the same bytes on Linux.
	overCorpus(0x708192a3, (block, key) => {
		const crlf = block.replace(/\n/g, '\r\n');
		assert.equal(readRenderTargetKey(crlf, key), readRenderTargetKey(block, key), `CRLF changed the verdict:\n${JSON.stringify(block)}`);
	});
});

test('MR4c: blank lines around the block never change the verdict', () => {
	overCorpus(0x8192a3b4, (block, key) => {
		const padded = `\n\n${block}\n\n`;
		assert.equal(readRenderTargetKey(padded, key), readRenderTargetKey(block, key), `blank lines changed the verdict:\n${block}`);
	});
});

// ── MR5 · NON-INTERFERENCE ───────────────────────────────────────────────────────────

test('MR5: an unrelated key never changes the verdict', () => {
	overCorpus(0x92a3b4c5, (block, key) => {
		const base = readRenderTargetKey(block, key);
		assert.equal(readRenderTargetKey(`theme: cuoio\n${block}`, key), base, `a prepended unrelated key changed the verdict:\n${block}`);
		assert.equal(readRenderTargetKey(`${block}\nfooter: x`, key), base, `an appended unrelated key changed the verdict:\n${block}`);
	});
});

test('MR5b: the three keys never answer for each other', () => {
	// Each key is read independently, so writing one must not move another. The three are
	// deliberately near-identical in shape, which is exactly when a copy-paste reader starts
	// matching the wrong one.
	overCorpus(0xa3b4c5d6, (block, key) => {
		const base = readRenderTargetKey(block, key);
		for (const other of KEYS) {
			if (other === key) continue;
			for (const word of [...ON_WORDS, ...OFF_WORDS]) {
				assert.equal(readRenderTargetKey(`${block}\n${other}: ${word}`, key), base, `${other}: ${word} moved ${key}:\n${block}`);
			}
		}
	}, 400);
});

// ── MR6 · MONOTONICITY ───────────────────────────────────────────────────────────────
// The union's safety argument in the kernel docblock is a monotonicity claim: a false ON is
// a visible surprise, a false OFF is silent, so the reader must never lose an ON. Appending
// cannot move the scalar arm's first match and can only add legacy matches — so ON is
// absorbing under append. THIS IS THE CLAIM THE DOCBLOCK MAKES; here it is as a law.

test('MR6: ON is absorbing — appending any line can never turn a target off', () => {
	overCorpus(0xb4c5d6e7, (block, key) => {
		if (!readRenderTargetKey(block, key)) return;
		for (const suffix of [`${key}: false`, `${key}: ture`, `${key}:`, 'theme: x', `  ${key}: no`]) {
			assert.equal(readRenderTargetKey(`${block}\n${suffix}`, key), true, `appending ${JSON.stringify(suffix)} turned ${key} OFF:\n${block}`);
		}
	});
});

test('MR6b: appending an ON line always turns the target on', () => {
	overCorpus(0xc5d6e7f8, (block, key) => {
		for (const word of ON_WORDS) {
			assert.equal(readRenderTargetKey(`${block}\n${key}: ${word}`, key), true, `appending ${key}: ${word} did not turn it on:\n${block}`);
		}
	});
});

test('MR6c: duplicating a line never changes the verdict', () => {
	overCorpus(0xd6e7f809, (block, key) => {
		const doubled = block.split('\n').flatMap((l) => [l, l]).join('\n');
		assert.equal(readRenderTargetKey(doubled, key), readRenderTargetKey(block, key), `duplicating every line changed the verdict:\n${block}`);
	});
});

// ── MR7 · THE RELATION THAT DOES NOT HOLD ────────────────────────────────────────────

test('MR7: reordering is invariant for COMPLETE lines, and folded values are the exception', () => {
	// This arm has now been wrong in BOTH directions, which is worth recording once.
	//
	// It was first written asserting order-SENSITIVITY, pinning `fluid: false` above
	// `fluid: "true"` as a known non-invariance. That was a symptom of the first-match /
	// any-match split, not a law, and fixing that made reordering invariant — so the arm was
	// inverted to assert invariance. Unqualified. That was wrong too: the legacy arm's middle
	// `\s*` spans newlines on purpose (it is what reads a folded value), so it is NOT
	// line-local, and reordering can destroy a cross-line match:
	//
	//     fluid:            reorder ->    true
	//       true                          fluid:
	//     => ON                           => OFF
	//
	// The generator never produced this because `randomBlock` emits only complete
	// `key: value` lines, so the relation passed vacuously over the case that breaks it. A
	// metamorphic test is only as wide as its generator, and a law stated wider than the
	// generator reaches is a claim, not a result.
	//
	// So: invariance is asserted over the shape the generator actually covers, and the
	// exception is pinned as a counterexample beside it.
	const rnd = makeRng(0xe7f8091a);
	for (let i = 0; i < 3000; i++) {
		const block = randomBlock(rnd);
		const lines = block.split('\n');
		for (let j = lines.length - 1; j > 0; j--) {
			const k = Math.floor(rnd() * (j + 1));
			[lines[j], lines[k]] = [lines[k], lines[j]];
		}
		const shuffled = lines.join('\n');
		for (const key of KEYS) {
			assert.equal(
				readRenderTargetKey(shuffled, key),
				readRenderTargetKey(block, key),
				`reordering changed ${key}:\n${block}\n---\n${shuffled}`,
			);
		}
	}

	// The pair that used to disagree and now does not.
	assert.equal(readRenderTargetKey('fluid: false\nfluid: "true"', 'fluid'), true);
	assert.equal(readRenderTargetKey('fluid: "true"\nfluid: false', 'fluid'), true);

	// THE EXCEPTION, pinned. A folded value is read by the legacy arm spanning the newline;
	// reorder the two lines and there is nothing to span.
	assert.equal(readRenderTargetKey('fluid:\n  true\ntheme: cuoio', 'fluid'), true);
	assert.equal(readRenderTargetKey('  true\nfluid:\ntheme: cuoio', 'fluid'), false);
});

test('MR8: the relations COMPOSE — each one alone hid a real asymmetry', () => {
	// Every relation above is applied to a fresh block, one transform at a time. That is how
	// the key-case asymmetry survived: MR1 rewrote the key, MR2 and MR3 rewrote the value,
	// and the blocks where MR1 failed were exactly the ones MR2 and MR3 produced
	// (`FLUID: "true"` read OFF while `fluid: "true"` read ON). Composing pairs is cheap and
	// covers the corner no single relation reaches.
	const rnd = makeRng(0x1b2c3d4e);
	for (let i = 0; i < 2000; i++) {
		const block = randomBlock(rnd);
		for (const key of KEYS) {
			const base = readRenderTargetKey(block, key);
			const upperKey = mapKeyLines(block, key, (ind, k, c, v) => `${ind}${k.toUpperCase()}${c}${v}`);
			const composed = [
				mapKeyLines(upperKey, key, (ind, k, c, v) => `${ind}${k}${c}${v}  # note`),
				mapKeyLines(upperKey, key, (ind, k, c, v) => (v === '' ? `${ind}${k}${c}` : `${ind}${k}${c}"${v}"`)),
				mapKeyLines(upperKey, key, (ind, k, c, v) => `  ${ind}${k}${c}${v.toUpperCase()} \t`),
			];
			for (const variant of composed) {
				assert.equal(readRenderTargetKey(variant, key), base, `a composed rewrite changed ${key}:\n${block}\n---\n${variant}`);
			}
		}
	}
});
