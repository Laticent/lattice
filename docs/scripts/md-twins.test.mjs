// Unit tests for the pure halves of scripts/md-twins.mjs. No build, no dist.

import { describe, expect, it } from 'vitest';
import { componentDoc, pageToMarkdown, pointLinksAtTwins, rebaseLinks, twinProblems, withTwinLink } from './md-twins.mjs';

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

	it('leaves code exactly as written: highlight tokens unspaced, blank lines single', () => {
		// Expressive Code's real shape: one .ec-line per line, one <span> per token, and an
		// empty line as a div holding a bare newline.
		const line = (...tokens) => `<div class="ec-line"><div class="code">${tokens.map((t) => `<span style="--0:#000">${t}</span>`).join('')}</div></div>`;
		const pre = `<pre data-language="json"><code>${line('{')}${line('  ', '"name"', ':', ' ', '"dateline"', ',')}<div class="ec-line"><div class="code">\n</div></div>${line('}')}</code></pre>`;
		const md = pageToMarkdown(article(`<h1>T</h1>${pre}<p>Inline <code><span>a</span><span>b</span></code>.</p>`));
		expect(md).toContain('```json\n{\n  "name": "dateline",\n\n}\n```');
		expect(md).toContain('Inline `ab`.');
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

describe('rebaseLinks', () => {
	const SRC = 'lib/components/anchor/closing/closing.docs.md';
	it('points a link to another component’s doc at that component’s copy on the site', () => {
		expect(rebaseLinks('[t](../../anchor/title/title.docs.md#slots)', SRC)).toBe('[t](/components/anchor/title.md#slots)');
		expect(rebaseLinks('[b](../../../plugins/chart-family/kinds/bar/bar.docs.md)', SRC)).toBe('[b](/components/chart/bar.md)');
	});
	it('points any other repo file at GitHub, and keeps absolute links and anchors', () => {
		expect(rebaseLinks('[d](../../../../design/design-system.md#x)', SRC)).toBe('[d](https://github.com/Laticent/lattice/blob/main/design/design-system.md#x)');
		expect(rebaseLinks('![p](./closing.gallery.light.pdf)', SRC)).toBe('![p](https://github.com/Laticent/lattice/blob/main/lib/components/anchor/closing/closing.gallery.light.pdf)');
		expect(rebaseLinks('[w](https://x.y) [a](#k) [s](/guides/)', SRC)).toBe('[w](https://x.y) [a](#k) [s](/guides/)');
	});
	it('rewrites a link whose text is code, and leaves a link written inside code alone', () => {
		expect(rebaseLinks('[`title`](../../anchor/title/title.docs.md)', SRC)).toBe('[`title`](/components/anchor/title.md)');
		expect(rebaseLinks('write `- ![Alt](path.jpg)` here', SRC)).toBe('write `- ![Alt](path.jpg)` here');
		expect(rebaseLinks('```md\n[f](./keep.md)\n```\n', SRC)).toBe('```md\n[f](./keep.md)\n```\n');
	});
});

describe('pointLinksAtTwins', () => {
	const twins = new Set(['/guides/cli/', '/spec/lfm/', '/components/']);

	it('points a link at a page with a copy to the copy, keeping the anchor', () => {
		expect(pointLinksAtTwins('[cli](/guides/cli/) and [b](/guides/cli/#flags)', twins)).toBe('[cli](/guides/cli.md) and [b](/guides/cli.md#flags)');
	});

	it('leaves a page with no copy, an image, code, and the whole component reference alone', () => {
		const md = '[p](/playground/) ![i](/spec/lfm/) `[c](/guides/cli/)` [r](/components/)\n```\n[c](/guides/cli/)\n```\n';
		expect(pointLinksAtTwins(md, twins)).toBe(md);
	});
});

describe('twinProblems', () => {
	it('passes markup inside code and flags it in prose', () => {
		const ok = '# Quote\n\nUse `<!-- _class: quote -->` like this:\n\n```markdown\n<!-- _class: quote -->\n<svg></svg>\n```\n' + 'x'.repeat(200);
		expect(twinProblems(ok)).toEqual([]);
		expect(twinProblems(`# T\n\n<!-- leaked -->\n${'x'.repeat(200)}`)).toContain('an HTML comment outside code');
		expect(twinProblems(`# T\n\n<astro-island></astro-island>\n${'x'.repeat(200)}`)).toContain('leftover interface markup outside code');
		expect(twinProblems('no heading')).toContain('no heading');
		expect(twinProblems(`# T\n\nSee [x](../../a/a.docs.md).\n${'x'.repeat(200)}`)).toContain('a repo-relative link: ../../a/a.docs.md');
	});
});

describe('withTwinLink', () => {
	it('adds exactly one alternate link, even when run twice', () => {
		const once = withTwinLink('<html><head></head></html>', '/a.md');
		expect(withTwinLink(once, '/a.md')).toBe(once);
		expect(once).toContain('<link rel="alternate" type="text/markdown" href="/a.md"></head>');
	});
});
