// Unit tests for the pure halves of scripts/md-twins.mjs. No build, no dist.

import { describe, expect, it } from 'vitest';
import { componentDoc, pageToMarkdown, twinProblems, withTwinLink } from './md-twins.mjs';

const article = (main, head = '') =>
	`<!doctype html><html><head><meta property="og:type" content="article">${head}</head><body><nav>Site nav</nav><main>${main}</main></body></html>`;

describe('pageToMarkdown', () => {
	it('returns null for a page that is not an article (an app shell)', () => {
		expect(pageToMarkdown('<html><head><meta property="og:type" content="website"></head><body><main><h1>Studio</h1></main></body></html>')).toBeNull();
	});

	it('keeps the content and drops the interface around it', () => {
		const md = pageToMarkdown(
			article(
				'<h1>Title<a class="sl-anchor-link" href="#t">Section titled Title</a></h1><p>Body <strong>text</strong>.</p><button>Copy</button><svg><text>x</text></svg><p hidden>gone</p><span class="sr-only">gone</span><!-- -->',
			),
		);
		expect(md).toBe('# Title\n\nBody **text**.\n');
	});

	it('keeps a code block’s language from Expressive Code', () => {
		const md = pageToMarkdown(article('<h1>T</h1><pre data-language="sh"><code><div class="ec-line">npm i</div><div class="ec-line">npx lattice a.md a.pdf</div></code></pre>'));
		expect(md).toContain('```sh\nnpm i\nnpx lattice a.md a.pdf\n```');
	});

	it('spaces side-by-side items and leaves inline formatting flush', () => {
		const md = pageToMarkdown(article('<h1>T</h1><p><a href="/a">One</a><a href="/b">Two</a></p><p><span>tag</span><span>tag2</span></p><p><strong>Bold</strong>.</p>'));
		expect(md).toContain('[One](/a) [Two](/b)');
		expect(md).toContain('tag tag2');
		expect(md).toContain('**Bold**.');
	});

	it('writes a definition list as one bullet per term', () => {
		const md = pageToMarkdown(article('<h1>T</h1><dl><div><dt>You write</dt><dd>$…$</dd></div><div><dt>Loaded</dt><dd>By default</dd></div></dl>'));
		expect(md).toContain('- **You write:** $…$\n- **Loaded:** By default');
	});

	it('turns a live CraftLab island into the code it would show, with a fence longer than any inside', () => {
		const props = JSON.stringify({ label: [0, 'Try a card'], hint: [0, 'Add one.'], css: [0, 'a{b:c}'], markdown: [0, '# Slide\n\n```js\nx()\n```'] });
		const island = `<astro-island component-url="/_astro/CraftLab.x.js" props="${props.replace(/"/g, '&quot;')}"></astro-island>`;
		const md = pageToMarkdown(article(`<h1>T</h1>${island}`));
		expect(md).toContain('**Try it: Try a card.** Add one.');
		expect(md).toContain('\n```css\na{b:c}\n```\n');
		expect(md).toContain('````markdown\n# Slide\n\n```js\nx()\n```\n````');
	});

	it('makes a Starlight card title a heading', () => {
		const md = pageToMarkdown(article('<h1>T</h1><article class="card"><p class="title">Card</p><div class="body"><p>Text.</p></div></article>'));
		expect(md).toContain('### Card\n\nText.');
	});
});

describe('componentDoc', () => {
	it('uses the component’s own .docs.md for a component page, including a chart kind', () => {
		expect(componentDoc('/components/statement/quote/')).toMatch(/^# quote\n/);
		expect(componentDoc('/components/chart/bar/')).toMatch(/^# bar\n/);
		expect(componentDoc('/guides/cli/')).toBeNull();
	});
});

describe('twinProblems', () => {
	it('passes markup inside code and flags it in prose', () => {
		const ok = '# Quote\n\nUse `<!-- _class: quote -->` like this:\n\n```markdown\n<!-- _class: quote -->\n<svg></svg>\n```\n' + 'x'.repeat(200);
		expect(twinProblems(ok)).toEqual([]);
		expect(twinProblems(`# T\n\n<!-- leaked -->\n${'x'.repeat(200)}`)).toContain('an HTML comment outside code');
		expect(twinProblems(`# T\n\n<astro-island></astro-island>\n${'x'.repeat(200)}`)).toContain('leftover interface markup outside code');
		expect(twinProblems('no heading')).toContain('no heading');
	});
});

describe('withTwinLink', () => {
	it('adds exactly one alternate link, even when run twice', () => {
		const once = withTwinLink('<html><head></head></html>', '/a.md');
		expect(withTwinLink(once, '/a.md')).toBe(once);
		expect(once).toContain('<link rel="alternate" type="text/markdown" href="/a.md"></head>');
	});
});
