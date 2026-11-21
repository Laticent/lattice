// What a listed plugin's block shows before its plugin draws (wait.ts, D1): the afterimage kept in this browser, else a
// skeleton, and nothing at all for a deck that does not list the plugin. Stored values reach the slide only as numbers.
import { beforeEach, describe, expect, it } from 'vitest';
import { AFTER_KEY, REG_KEY, waitKey, waitMarkup, withWaits } from './wait';

const SHA = '0123456789abcdef';
const ENTRY = { name: 'bench-bars', placement: 'stage', sha: SHA };
const BODY = 'EMEA: 4.1\nNA: 5.2';
const DECK = `---\nplugins: [bench-bars]\n---\n\n## Q3\n\n\`\`\`bench-bars\n${BODY}\n\`\`\`\n`;

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem(REG_KEY, JSON.stringify({ 'bench-bars': ENTRY }));
});

describe('withWaits swaps a listed plugin block for its wait', () => {
	it('a listed block with no afterimage becomes the skeleton, and the fence source is gone', () => {
		const out = withWaits(DECK);
		expect(out).toContain('data-wait-shape="skeleton"');
		expect(out).not.toContain('```bench-bars');
		expect(out).not.toContain('EMEA');
	});

	it('a kept afterimage is drawn at the size it drew', () => {
		localStorage.setItem(AFTER_KEY, JSON.stringify({ [waitKey(SHA, BODY)]: { w: 800, h: 300, b: [[10, 20, 100, 200, 1]] } }));
		const out = withWaits(DECK);
		expect(out).toContain('data-wait-shape="afterimage"');
		expect(out).toContain('aspect-ratio:800 / 300');
		expect(out).toContain('<rect x="10" y="20" width="100" height="200"');
	});

	it('a deck that does not list the plugin is left as written', () => {
		const unlisted = DECK.replace('plugins: [bench-bars]', 'title: x');
		expect(withWaits(unlisted)).toBe(unlisted);
	});
});

describe('stored values reach the slide only as numbers (HARD RULE #22)', () => {
	it('markup planted in a stored afterimage is dropped, not written into the SVG', () => {
		const evil = '"/><script>alert(1)</script><rect x="';
		localStorage.setItem(AFTER_KEY, JSON.stringify({ [waitKey(SHA, BODY)]: { w: 800, h: 300, b: [[evil, 20, 100, 200, evil]] } }));
		const out = waitMarkup(ENTRY, BODY) ?? '';
		expect(out).not.toContain('<script');
		expect(out).not.toContain('alert');
		expect(out).toContain('<rect x="0" y="20"');
	});

	it('a stored size that is not a number falls back to the skeleton', () => {
		localStorage.setItem(AFTER_KEY, JSON.stringify({ [waitKey(SHA, BODY)]: { w: '9"><script>', h: 300, b: [] } }));
		const out = waitMarkup(ENTRY, BODY) ?? '';
		expect(out).toContain('data-wait-shape="skeleton"');
		expect(out).not.toContain('<script');
	});

	it('a stored plugin name is reduced to letters, digits and hyphens', () => {
		const out = waitMarkup({ ...ENTRY, name: 'x"><img src=y onerror=alert(1)>' }, BODY) ?? '';
		expect(out).not.toContain('<img');
		expect(out).toContain('data-lattice-plugin-wait="ximgsrcyonerroralert1"');
	});
});
