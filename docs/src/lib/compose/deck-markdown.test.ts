import { describe, expect, it } from 'vitest';
import { roundTripSlideProse } from './deck-markdown';

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
});
