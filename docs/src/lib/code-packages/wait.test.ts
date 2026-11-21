// What a listed plugin's block shows before its plugin draws (wait.ts, D1): the afterimage kept in this browser, else a
// skeleton, and nothing at all for a deck that does not list the plugin. Stored values reach the slide only as numbers.
import MarkdownIt from 'markdown-it';
import { beforeEach, describe, expect, it } from 'vitest';
import { deckPluginList } from '../../../../lib/core/deck-plugins.mjs';
import { renderWithCodePackages, setPlugins, setWaits } from './entry';
import { AFTER_KEY, REG_KEY, waitKey, waitMarkup, withWaits } from './wait';

const keyed = (body: string) => JSON.stringify({ [waitKey(SHA, body)]: { w: 800, h: 300, b: [[1, 2, 3, 4, 1]] } });

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

describe('fences are found as the engine finds them (the checker on #3337)', () => {
	it('a plugin fence quoted inside another code block is left as text', () => {
		const deck = `---\nplugins: [bench-bars]\n---\n\n\`\`\`\`markdown\n\`\`\`bench-bars\n${BODY}\n\`\`\`\n\`\`\`\`\n`;
		expect(withWaits(deck)).toBe(deck);
	});

	it('a fence in a list item keeps its marker, and its afterimage key matches the body markdown-it hands the door', () => {
		const deck = `---\nplugins: [bench-bars]\n---\n\n- item\n\n  \`\`\`bench-bars\n  EMEA: 4.1\n    NA: 5.2\n  \`\`\`\n\n  more\n`;
		const fence = new MarkdownIt().parse(deck.split('---\n').slice(2).join('---\n'), {}).find((t) => t.type === 'fence');
		localStorage.setItem(AFTER_KEY, keyed(fence?.content ?? 'missing'));
		const out = withWaits(deck);
		expect(out).toMatch(/^ {2}<div data-lattice-plugin-wait="bench-bars" data-wait-shape="afterimage"/m);
		expect(out).toContain('\n  more');
		// Still one list: the wait sits inside the item, and "more" stays with it.
		const html = new MarkdownIt({ html: true }).render(out.split('---\n').slice(2).join('---\n'));
		expect(html.match(/<ul>/g)?.length).toBe(1);
		expect(html).toMatch(/<li>[\s\S]*data-lattice-plugin-wait[\s\S]*more[\s\S]*<\/li>/);
	});

	it('a fence under a quote marker is found and keeps the marker', () => {
		const deck = `---\nplugins: [bench-bars]\n---\n\n> \`\`\`bench-bars\n> ${BODY.split('\n').join('\n> ')}\n> \`\`\`\n`;
		const out = withWaits(deck);
		expect(out).toMatch(/^> <div data-lattice-plugin-wait="bench-bars"/m);
		expect(out).not.toContain('EMEA');
	});

	it('reads the plugins: list as the reader of record does (lib/core/deck-plugins.mjs deckPluginList)', () => {
		const cases = ['plugins: [bench-bars]', 'plugins: bench-bars', 'plugins:\n  # charts\n  - bench-bars', 'plugins:\n- bench-bars', 'plugins: [bench-bars]\nplugins: [math]', "plugins: ['bench-bars', math]", 'plugins: bench-bars # the chart', 'title: x'];
		for (const fm of cases) {
			const deck = `---\n${fm}\n---\n\n\`\`\`bench-bars\n${BODY}\n\`\`\`\n`;
			const waits = withWaits(deck).includes('data-lattice-plugin-wait');
			expect(waits, fm).toBe(deckPluginList(deck).includes('bench-bars'));
		}
	});

	it('reads the plugins: list in each written form', () => {
		const at = (fm: string) => withWaits(`---\n${fm}\n---\n\n\`\`\`bench-bars\n${BODY}\n\`\`\`\n`).includes('data-lattice-plugin-wait');
		expect(at('plugins: bench-bars')).toBe(true);
		expect(at('plugins:\n  # charts\n  - bench-bars')).toBe(true);
		expect(at('plugins: [bench-bars]\nplugins: [math]')).toBe(false);
	});
});

describe('a wait is for previews only, and only while a plugin can still draw', () => {
	const PG = { render: (s: string) => ({ html: s }) };
	const DECK_SHOWN = DECK;

	it('an export render (no codeStatus) carries no wait; a preview render does', async () => {
		setWaits({ withWaits, waitMarkup, waitKey });
		const exported = await renderWithCodePackages(PG, DECK_SHOWN, 'indaco', { baseUrl: 'b/' });
		const preview = await renderWithCodePackages(PG, DECK_SHOWN, 'indaco', { codeStatus: true });
		expect(exported.html).not.toContain('data-lattice-plugin-wait');
		expect(preview.html).toContain('data-lattice-plugin-wait');
	});

	it('an empty Library drops the fence registry, so no wait stands where nothing will draw', async () => {
		await setPlugins([]);
		expect(localStorage.getItem(REG_KEY)).toBeNull();
		expect(withWaits(DECK_SHOWN)).toBe(DECK_SHOWN);
	});
});
