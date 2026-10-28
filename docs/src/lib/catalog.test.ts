// @vitest-environment node
// The catalog content (src/content/catalog/) is the single source for the two hubs, every
// library demo's bar and every Learn page. Astro's loader DROPS a file whose front matter fails
// to parse or validate — with no build error — so a typo removes a page and its hub card in
// silence (a `syntax:` value starting with a backtick did exactly that). These tests read each
// file the way the loader does and fail loudly instead, and they hold every Learn page to the
// fixed teaching order, so a reader who learned one page can skim the next.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { REQUIRED_SECTIONS, wrapTables } from './catalog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../content/catalog');
const files = ['libraries', 'plugins'].flatMap((kind) =>
	readdirSync(join(root, kind))
		.filter((f) => f.endsWith('.md'))
		.map((f) => ({ kind, slug: f.slice(0, -3), text: readFileSync(join(root, kind, f), 'utf8') })),
);

function split(text: string) {
	const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
	if (!m) throw new Error('no front matter');
	return { data: parse(m[1]) as Record<string, unknown>, body: m[2] };
}

describe('catalog content', () => {
	it('has the thirteen libraries and nine plugins', () => {
		expect(files.filter((f) => f.kind === 'libraries')).toHaveLength(13);
		expect(files.filter((f) => f.kind === 'plugins')).toHaveLength(9);
	});

	for (const f of files) {
		describe(`${f.kind}/${f.slug}`, () => {
			const { data, body } = split(f.text);

			it('parses, with every field a page needs', () => {
				expect(data.kind).toBe(f.kind === 'libraries' ? 'library' : 'plugin');
				for (const k of ['name', 'promise', 'intro', 'useWhen']) expect(typeof data[k], k).toBe('string');
				expect(typeof data.order).toBe('number');
				expect((data.promise as string).length).toBeLessThanOrEqual(80);
				expect(Array.isArray(data.facts) && data.facts.length).toBeTruthy();
				expect(Array.isArray(data.reference) && data.reference.length).toBeTruthy();
			});

			it('teaches in the fixed order: problem, idea, how, where else, Lattice, limits', () => {
				// Headings outside code only: a sample slide in a fence has its own `##` lines.
				const prose = body.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
				const h2 = [...prose.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
				expect(h2).toEqual(REQUIRED_SECTIONS);
			});

			if (f.kind === 'plugins') {
				it('gives the live demo at least one example, each a slide of Markdown', () => {
					const ex = data.examples as { key: string; label: string; caption: string; sample: string }[];
					expect(ex?.length).toBeGreaterThan(0);
					for (const e of ex) {
						expect(e.label && e.caption && e.sample.trim()).toBeTruthy();
						expect(e.sample).toMatch(/^##\s|^<!-- _class:/m);
					}
				});
			} else {
				it('opens its demo page on the same promise as its Learn page and hub card', () => {
					// The demos keep their own markup (each stands alone), so the promise is written twice;
					// this keeps the two copies from drifting.
					const demo = readFileSync(resolve(root, '../../pages/libraries', f.slug, 'index.astro'), 'utf8');
					expect(demo).toContain(`<p class="promise">${data.promise}</p>`);
					expect(demo).toContain(`<DemoBar slug="${f.slug}" />`);
				});

				it('names its hub group and where Lattice uses it', () => {
					expect(typeof data.group).toBe('string');
					expect(typeof data.inLattice).toBe('string');
				});
			}
		});
	}
});

describe('wrapTables', () => {
	it('frames every Markdown table, so a Learn page table reads as a table and scrolls on its own', () => {
		const html = '<p>a</p><table><tr><td>1</td></tr></table><table><tr><td>2</td></tr></table>';
		const out = wrapTables(html);
		expect(out.match(/<div class="cat-prose-table"><div class="cat-prose-table-frame" tabindex="0"><table>/g)).toHaveLength(2);
		expect(out.match(/<\/table><\/div><\/div>/g)).toHaveLength(2);
		expect(wrapTables('<p>no table</p>')).toBe('<p>no table</p>');
	});
});
