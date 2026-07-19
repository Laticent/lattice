import { describe, expect, it } from 'vitest';
import { hasLossyConstruct } from './deck-source';

// `hasLossyConstruct` decides which slides Compose locks read-only (edited in Markdown
// mode). It must fire on constructs the CommonMark round-trip would flatten/escape, and
// NOT on prose or the constructs that round-trip byte-exact (inline HTML, `<!-- -->`).

describe('hasLossyConstruct — detects what Compose cannot round-trip', () => {
	it('does NOT fire on a plain GFM table (Compose models tables as real nodes and round-trips them)', () => {
		expect(hasLossyConstruct('## Data\n\n| A | B |\n| --- | --- |\n| 1 | 2 |')).toBe(false);
	});
	it('does NOT fire on a table with LFM state markers (they are literal cell text that round-trips)', () => {
		expect(hasLossyConstruct('| Regime | Access |\n| --- | :---: |\n| GDPR | [x] |\n| CCPA | [-] |')).toBe(false);
	});
	it('STILL fires on a table whose cell holds an unmodeled construct (math), locking the whole slide', () => {
		expect(hasLossyConstruct('| Shape | Area |\n| --- | --- |\n| Circle | $\\pi r^2$ |')).toBe(true);
	});
	it('fires on strikethrough', () => {
		expect(hasLossyConstruct('Price was ~~$5M~~ now $3M.')).toBe(true);
	});
	it('fires on a block-level HTML tag', () => {
		expect(hasLossyConstruct('<figure>\n  <img src="x">\n</figure>')).toBe(true);
	});
	it('fires on a task list', () => {
		expect(hasLossyConstruct('- [ ] todo\n- [x] done')).toBe(true);
	});
	it('fires on a footnote reference', () => {
		expect(hasLossyConstruct('A claim.[^1]\n\n[^1]: the source')).toBe(true);
	});

	it('does NOT fire on plain prose, headings, lists, blockquotes', () => {
		expect(hasLossyConstruct('# Title\n\n`Eyebrow`\n\n- one\n- two\n\n> insight')).toBe(false);
	});
	it('does NOT fire on inline HTML or HTML comments (they round-trip byte-exact)', () => {
		expect(hasLossyConstruct('A line with <br> inside it.')).toBe(false);
		expect(hasLossyConstruct('## Slide\n\n<!-- note: speaker aside -->\n\nBody.')).toBe(false);
	});
	it('does NOT fire on a big-number / KPI slide (dollar figures are not tables)', () => {
		expect(hasLossyConstruct('## Revenue\n\n1. $2.4B\n   - Total revenue\n2. 42%\n   - Margin')).toBe(false);
	});

	it('fires on inline / display math (the engine renders it, Compose cannot round-trip it)', () => {
		expect(hasLossyConstruct('The area is $A = \\pi r^2$ per shape.')).toBe(true);
		expect(hasLossyConstruct('## Model\n\n$$E = mc^2$$')).toBe(true);
	});
	it('does NOT fire on currency prose (the engine keeps $400M / $18M literal, so Compose can too)', () => {
		expect(hasLossyConstruct('Revenue was $400M, up 28% YoY, ahead by $18M.')).toBe(false);
	});
	it('does NOT fire on a $…$ shape / a pipe row inside code (the engine renders code literally)', () => {
		expect(hasLossyConstruct('Run this:\n\n```bash\necho "$A$B"\n```')).toBe(false); // shell var, not math
		expect(hasLossyConstruct('The `$x$` token is a placeholder.')).toBe(false); // inline code, not math
		expect(hasLossyConstruct('A grid sample:\n\n```\n| A | B |\n```')).toBe(false); // pipes in a fence, not a table
	});
});
