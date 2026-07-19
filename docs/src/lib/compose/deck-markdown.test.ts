import { describe, expect, it } from 'vitest';
import { parseSlideProse, roundTripSlideProse } from './deck-markdown';

// The lossless round-trip proof — on REAL Lattice slide prose, the exact grammar
// Lexical flattened. Each case asserts the round-trip preserves structure (and
// serializes bullets as `-`). This is the durable version of the spike that
// settled the ProseMirror decision.

// Normalize trailing whitespace / final newline for structural comparison.
const norm = (s: string) => s.replace(/[ \t]+$/gm, '').replace(/\n+$/, '').trim();

describe('slide-prose round-trip — structure is preserved (the Lexical killer)', () => {
	it('KPI: nested `- ` detail lines under numbered items survive', () => {
		const kpi = [
			'`Financial · Q4 2026`',
			'',
			'## Revenue ahead of plan; margin and cash both expanded.',
			'',
			'1. $2.4B',
			'   - Total revenue',
			'   - target $2.2B · +9% `On plan` `Board`',
			'2. 42%',
			'   - Gross margin',
			'   - +2pp QoQ `On plan` `Audit`',
			'3. $1.1B',
			'   - Cash & equivalents',
			'   - +$180M QoQ `On plan` `Investor`',
		].join('\n');
		const out = roundTripSlideProse(kpi);
		// The nested bullet under item 1 is preserved (this is what Lexical flattened).
		expect(/1\.\s+\$2\.4B\n\s+-\s+Total revenue/.test(out)).toBe(true);
		// Bullets are `-`, never `*`.
		expect(out).not.toContain('* Total revenue');
		// Byte-identical after whitespace normalization.
		expect(norm(out)).toBe(norm(kpi));
	});

	it('cards: nested Title / body survives (HARD RULE #5 card grammar)', () => {
		const cards = ['## The framework has four parts.', '', '- Intake', '  - Signals arrive and are triaged.', '- Scoring', '  - Each item gets a weight.'].join('\n');
		const out = roundTripSlideProse(cards);
		expect(/- Intake\n\s+-\s+Signals arrive/.test(out)).toBe(true);
		expect(norm(out)).toBe(norm(cards));
	});

	it('content slide: eyebrow + heading + bullets + key-insight blockquote + emphasis', () => {
		const content = [
			'`Context · Competitive`',
			'',
			'## Revenue ahead of plan.',
			'',
			'Growth held across **every region** this quarter.',
			'',
			'- Enterprise renewals up 14%',
			'- Two new logos over $1M',
			'',
			'> The base is compounding, not spiking.',
		].join('\n');
		const out = roundTripSlideProse(content);
		expect(out).toContain('`Context · Competitive`');
		expect(out).toContain('**every region**');
		expect(out).toContain('> The base is compounding, not spiking.');
		expect(norm(out)).toBe(norm(content));
	});

	it('title slide: heading + inline-code eyebrow + subtitle', () => {
		const title = ['# Q4 board review', '', '`Financial · Q4 2026`', '', 'Steady execution, compounding advantage.'].join('\n');
		expect(norm(roundTripSlideProse(title))).toBe(norm(title));
	});

	it('big-number + ordered list preserves the numbering', () => {
		const md = ['## Everything you need to ship.', '', '1. 53', '   - components', '2. 14', '   - themes'].join('\n');
		const out = roundTripSlideProse(md);
		expect(/1\.\s+53\n\s+-\s+components/.test(out)).toBe(true);
		expect(/2\.\s+14\n\s+-\s+themes/.test(out)).toBe(true);
	});

	it('a thematic break serializes as `***`, never `---` (never a phantom slide split)', () => {
		// `***`, `___`, `- - -` are all valid engine `<hr>` forms; a bare `---` line, by
		// contrast, IS the deck separator, so the serializer must never emit one inside a
		// slide (else the first Compose touch splits the slide and drops the next `_class`).
		for (const hr of ['***', '___', '- - -']) {
			const out = roundTripSlideProse(`## A\n\nfoo\n\n${hr}\n\nbar`);
			expect(out).toContain('***');
			// No bare `---` separator line anywhere in a single slide's prose.
			expect(/\n-{3,}\n/.test(`\n${out}\n`)).toBe(false);
		}
	});
});

// GFM tables become real, editable, round-trippable nodes (2026-07-19-compose-table-editing.md).
// The serializer has a CANONICAL output form (delimiter row `:---`/`:---:`/`---:`/`---`), so the
// contract is idempotence to that form — a table the author edits re-serializes to render-equivalent
// GFM, and re-parsing is stable. (An UNTOUCHED table slide never runs the serializer at all — it emits
// its `raw` bytes via emitDeck — so arbitrary source spacing is preserved there, tested in deck-doc.)
describe('table round-trip — the reason table slides stop locking', () => {
	// Each fixture is written in the serializer's canonical form, so a byte-exact round-trip
	// IS the idempotence proof. Drawn from the real gallery / examples decks.
	const canonical: Record<string, string> = {
		'compare-table with an empty cell': ['| Capability | Ours | Theirs |', '| --- | --- | --- |', '| Speed | ✓ | ✗ |', '| Cost | Low |  |'].join('\n'),
		'obligation-matrix: centered marker columns, [-] marker': ['| Regime | Access | Erasure |', '| --- | :---: | :---: |', '| GDPR | [x] | [x] |', '| CCPA/CPRA | [x] | [-] |'].join('\n'),
		'roadmap: marker + trailing text + inline-code header': ['| Workstream | Foundation `Q2` | Scale |', '| --- | --- | --- |', '| Framework | [x] Signal taxonomy | [ ] Weighting |', '| Tooling | [/] Dashboards | [ ] Exports |'].join('\n'),
		'inline marks in cells + right alignment': ['| Metric | Value |', '| --- | ---: |', '| **Revenue** | $400M |', '| *Growth* | 12% |'].join('\n'),
		'literal pipe inside a cell (escaped)': ['| Expr | Meaning |', '| --- | --- |', '| \\| | pipe |', '| a \\| b | or |'].join('\n'),
	};
	for (const [name, md] of Object.entries(canonical)) {
		it(`round-trips byte-exact: ${name}`, () => {
			expect(norm(roundTripSlideProse(md))).toBe(norm(md));
		});
		it(`is idempotent (a second pass changes nothing): ${name}`, () => {
			const once = roundTripSlideProse(md);
			expect(roundTripSlideProse(once)).toBe(once);
		});
	}

	it('all four LFM state markers survive verbatim in cells (never escaped to \\[x\\])', () => {
		const out = roundTripSlideProse('| A | B |\n| --- | --- |\n| [x] | [-] |\n| [ ] | [/] |');
		for (const marker of ['[x]', '[-]', '[ ]', '[/]']) expect(out).toContain(`| ${marker}`);
		expect(out).not.toContain('\\[');
	});

	it('non-canonical delimiter widths normalize but preserve alignment (only ever hits an edited slide)', () => {
		// `:----:` (4 dashes) → canonical `:---:`; the center alignment is what matters and is kept.
		const out = roundTripSlideProse('| A | B |\n| :----: | ----: |\n| 1 | 2 |');
		expect(out).toContain('| :---: | ---: |');
	});

	// Regressions from the maker-checker pass on the round-trip kernel.
	const bodyCellCount = (md: string) => {
		let n = 0;
		parseSlideProse(md).descendants((node) => {
			if (node.type.name === 'table_cell') n++;
			return true;
		});
		return n;
	};

	it('a literal backslash-then-pipe in a cell does NOT split the cell, and is idempotent (Bug 1)', () => {
		// Source cell content is the literal text `x\|y` (backslash, pipe): `\\` = literal backslash,
		// `\|` = literal pipe. The old lookbehind saw the escaped backslash and left the pipe raw.
		const src = ['| a | b |', '| --- | --- |', String.raw`| x\\\|y | z |`].join('\n');
		const once = roundTripSlideProse(src);
		expect(roundTripSlideProse(once)).toBe(once); // fixed point — emit caching depends on it
		expect(bodyCellCount(once)).toBe(2); // the `z` column survived (cell did not split into 3)
	});

	it('a user-escaped bracket in a cell stays literal — never becomes a live link (Bug 2)', () => {
		const src = ['| a | b |', '| --- | --- |', '| \\[text\\](http://x.com) | z |'].join('\n');
		const out = roundTripSlideProse(src);
		expect(out).toContain('\\[text\\]'); // still escaped literal
		expect(out).not.toContain('[text](http://x.com)'); // NOT a live link
		expect(roundTripSlideProse(out)).toBe(out); // idempotent
	});

	it('state markers still survive while other escaped brackets do not (Bug 2 boundary)', () => {
		const out = roundTripSlideProse('| A | B |\n| --- | --- |\n| [x] done | \\[n\\] |');
		expect(out).toContain('| [x] done |'); // the leading marker is un-escaped
		expect(out).toContain('\\[n\\]'); // a non-marker escaped bracket stays escaped
	});
});
