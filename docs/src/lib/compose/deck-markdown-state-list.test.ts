// @vitest-environment node
// A checklist item (`- [x] done`) round-trips byte for byte, and its slide is no longer locked.
import { describe, expect, it } from 'vitest';
import { roundTripSlideProse } from './deck-markdown';
import { hasLossyConstruct } from './deck-source';

const rt = (md: string) => roundTripSlideProse(md).trimEnd();

describe('state-marker list items', () => {
	for (const m of ['x', '-', '!', '?', ' ', '/']) {
		it(`[${m}] keeps its brackets and its slide is not locked`, () => {
			const md = `- [${m}] Ship it\n- [${m}] **Bold** tail\n`;
			expect(rt(md)).toBe(md.trimEnd());
			expect(hasLossyConstruct(md)).toBe(false);
		});
	}
	it('an ordered list and a nested item keep the marker', () => {
		const md = '1. [x] one\n   - [!] inner\n2. [ ] two\n';
		expect(rt(md)).toBe(md.trimEnd());
	});
	it('[X] (a GFM checked box) still locks the slide', () => {
		expect(hasLossyConstruct('- [X] done')).toBe(true);
	});
	it('a literal bracket that is not a marker stays escaped', () => {
		expect(rt('- \\[note\\] hi')).toBe('- \\[note\\] hi');
	});
});

// The shipped corpus: every slide the lock used to hold for a state-marker item now round-trips
// with its marker intact (no `\[x\]` the engine would print as literal brackets).
import fs from 'node:fs';
import path from 'node:path';
import { parseDeck } from './deck-source';

describe('state-marker lists across the shipped decks', () => {
	const ROOT = path.resolve(__dirname, '../../../..');
	function mdIn(dir: string, out: string[] = []): string[] {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
			const full = path.join(dir, e.name);
			if (e.isDirectory()) mdIn(full, out);
			else if (e.name.endsWith('.md')) out.push(full);
		}
		return out;
	}
	const files = [
		...mdIn(path.join(ROOT, 'examples')),
		...mdIn(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.gallery.md')),
		...mdIn(path.join(ROOT, 'test/integration/baseline-decks')),
	];
	const MARKED = /^\s*(?:[-*+]|\d+[.)])\s+\[[x\-!? /]\]/m;

	it('keeps every marker, and never introduces an escaped bracket', () => {
		let checked = 0;
		for (const file of files) {
			let slides: ReturnType<typeof parseDeck>['slides'];
			try {
				slides = parseDeck(fs.readFileSync(file, 'utf8')).slides;
			} catch {
				continue;
			}
			for (const s of slides) {
				if (!MARKED.test(s.prose) || hasLossyConstruct(s.prose)) continue;
				checked++;
				const out = roundTripSlideProse(s.prose);
				const esc = (t: string) => (t.match(/\\\[[x\-!? /]\\?\]/g) ?? []).length;
				expect(esc(out), `${path.relative(ROOT, file)}`).toBeLessThanOrEqual(esc(s.prose));
				const marks = (t: string) => (t.match(/^\s*(?:[-*+]|\d+[.)])\s+\[[x\-!? /]\]/gm) ?? []).length;
				expect(marks(out), `${path.relative(ROOT, file)}`).toBe(marks(s.prose));
			}
		}
		expect(checked).toBeGreaterThan(20); // anti-vacuity: the corpus has marker slides
	});
});

// A list item whose text is `[x]: /u` must render its text. Unescaped it is a link reference definition and the item draws empty
// (followups.d/2875-p5). Rendered through the engine, since the string alone can look right.
import { createRequire } from 'node:module';

describe('a marker followed by a colon', () => {
	const require = createRequire(import.meta.url);
	const render = (md: string): string => {
		const { createEngine } = require('../../../../lib/engine/index.js');
		return createEngine().render(md).html;
	};
	it('keeps its escape and the item renders its text', () => {
		const md = '- \\[x\\]: /u\n- \\[x\\] real marker\n';
		const out = rt(md);
		expect(out).toContain('\\[x\\]: /u');
		expect(render(out)).toContain('[x]: /u');
		expect(rt('- [x] still a marker')).toBe('- [x] still a marker');
	});
});

describe('an escaped marker followed by a link destination', () => {
	const require2 = createRequire(import.meta.url);
	const html = (md: string): string => require2('../../../../lib/engine/index.js').createEngine().render(md).html;
	const same = (md: string) => expect(html(roundTripSlideProse(md))).toBe(html(md));
	it('a list item stays literal text', () => {
		same('- \\[x\\](/u) link-shaped\n');
		same('- \\[/\\](/u) link-shaped\n');
	});
	it('a table cell stays literal text', () => {
		same('| h |\n|---|\n| \\[x\\](/u) |\n');
		same('| h |\n|---|\n| \\[!\\][ref] |\n');
	});
});
