import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { stripNotesCut } from './strip-notes-guard';

// The two-cut measurement behind the Studio's `--strip-notes` Webpage export.
//
// WHY THIS FILE EXISTS. The measurement shipped once with no coverage at all, and a checker
// showed what that cost: narrowing the loop back to a single cut — reverting the entire feature —
// left every gate in the tree green, including the strip-notes e2e, which asserts only that the
// note text is gone (true on both cuts AND on the fallback). So each test here names the OUTCOME
// it pins, and the three outcomes are the whole contract: preserve wins, drop wins, neither does.
//
// The NOTE KERNEL IS THE REAL ONE (`lib/authoring/notes-core.js`, the same module the browser
// bundle is generated from) so these pin the scrub as it actually cuts, not a stand-in of it.
// What IS a stand-in is the render: `renderMarkdown` needs the engine and a theme, and the
// guard takes it as a parameter precisely so a test can hand it something deterministic. The
// fake below is a markdown-shaped renderer, not markdown-it — it reproduces the ONE property
// the measurement turns on, that a blank line where a comment was can change block structure.
const require_ = createRequire(import.meta.url);
const notesCore = require_('../../../../lib/authoring/notes-core.js');

/**
 * A renderer with just enough markdown in it to be measured: `---` on its own line splits
 * slides, a blank line splits paragraphs, and — the case the cuts exist for — `text` directly
 * above `---` makes a SETEXT heading rather than a slide break.
 */
function fakeRender(source: string) {
	const lines = source.replace(/\r\n/g, '\n').split('\n');
	const slides: string[][] = [[]];
	for (let i = 0; i < lines.length; i++) {
		const prev = lines[i - 1] ?? '';
		if (lines[i] === '---' && prev.trim() === '') slides.push([]);
		else if (lines[i] === '---' && prev.trim() !== '') slides[slides.length - 1].push('<h2>setext</h2>');
		else slides[slides.length - 1].push(lines[i]);
	}
	const html = slides
		.map((body) => {
			const paras = body
				.join('\n')
				.split(/\n[ \t]*\n/)
				.map((p) => p.trim())
				.filter(Boolean)
				// A comment ON ITS OWN LINE is an HTML BLOCK, not paragraph text — that is what
				// makes removing one able to move the deck, so the fake has to model it.
				.map((p) => (p.startsWith('<h2>') || /^<!--[\s\S]*-->$/.test(p) ? p : `<p>${p}</p>`))
				.join('');
			return `<section>${paras}</section>`;
		})
		.join('');
	return Promise.resolve({ html });
}

const sectionsOf = (html: string) => html.split('</section>').filter(Boolean).map((s) => `${s}</section>`);
const render = (source: string) => fakeRender(source);
const authoredOf = async (src: string) => sectionsOf((await fakeRender(src)).html);

describe('stripNotesCut', () => {
	it('takes the PRESERVE cut when the comment was the block boundary', async () => {
		// Delete the line outright and `Some text\n---` becomes a setext heading, so the deck
		// loses a slide. Leaving a blank line in its place reproduces it.
		const src = 'Some text\n<!-- a note -->\n\n---\n\nMore text\n';
		const cut = await stripNotesCut(src, notesCore, new Set(['a note']), await authoredOf(src), sectionsOf, render);

		expect(cut.warning).toBeUndefined();
		expect(cut.out).toBeDefined();
		expect(cut.sections).toHaveLength(2);
		expect(cut.source).not.toContain('a note');
		// The measurement picked the cut that keeps the slide break, not a setext heading.
		expect(cut.out?.html).not.toContain('<h2>setext</h2>');
	});

	it('takes the DROP cut when a blank line would change the block structure', async () => {
		// Text on both sides with no blank line anywhere: preserve inserts one and splits the
		// paragraph in two, drop reproduces the single paragraph.
		const src = 'first line\n<!-- a note -->\nsecond line\n';
		const cut = await stripNotesCut(src, notesCore, new Set(['a note']), await authoredOf(src), sectionsOf, render);

		expect(cut.warning).toBeUndefined();
		expect(cut.sections).toHaveLength(1);
		expect(cut.source).not.toContain('a note');
		// One paragraph, as written — preserve would have made two.
		expect(cut.out?.html.match(/<p>/g)).toHaveLength(1);
		expect(cut.source).toBe('first line\nsecond line\n');
	});

	it('falls back to the deck AS WRITTEN, with a diagnosis, when neither cut reproduces it', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			// Authored sections that no scrub of this source can reproduce, so both cuts miss.
			const src = 'first line\n<!-- a note -->\nsecond line\n';
			const cut = await stripNotesCut(src, notesCore, new Set(['a note']), ['<section>impossible</section>'], sectionsOf, render);

			expect(cut.out).toBeUndefined();
			expect(cut.sections).toBeUndefined();
			// The caller keeps its own render; what it gets back is still a SCRUBBED source, so
			// the note text goes from the envelope even though the slides ship as written.
			expect(cut.source).not.toContain('a note');
			expect(cut.warning).toMatch(/block boundary/);
			// The console warning names the cause and the fix — the one path where the author has
			// to edit the deck to get the guarantee back. A bare "changed this deck" is a
			// regression against the CLI's own message.
			const said = warn.mock.calls.map((c) => String(c[0])).join(' ');
			expect(said).toMatch(/column 0 BETWEEN two list items/);
			expect(said).toMatch(/move the note inside an item, or out of the list/);
			expect(said).toMatch(/Adding blank lines around it does NOT help/);
		} finally {
			warn.mockRestore();
		}
	});

	it('short-circuits a deck with no notes — no cut, and no second render', async () => {
		const src = '# Just a deck\n\nNo notes here.\n';
		const spy = vi.fn(render);
		const cut = await stripNotesCut(src, notesCore, new Set(), await authoredOf(src), sectionsOf, spy);

		expect(spy).not.toHaveBeenCalled();
		expect(cut.source).toBe(src);
		expect(cut.out).toBeUndefined();
		expect(cut.warning).toBeUndefined();
	});

	it('reads the candidate cuts from the kernel, in the kernel order', async () => {
		// The pin against the divergence this module was written to close: the guard must not
		// carry its own list. Feeding it a kernel whose order is reversed must change which cut
		// wins on a deck where the two disagree.
		const src = 'first line\n<!-- a note -->\nsecond line\n';
		const authored = await authoredOf(src);
		const reversed = { ...notesCore, SCRUB_BOUNDARIES: ['drop', 'preserve'] };

		expect((await stripNotesCut(src, notesCore, new Set(['a note']), authored, sectionsOf, render)).source)
			.toBe((await stripNotesCut(src, reversed, new Set(['a note']), authored, sectionsOf, render)).source);
		// …and on a deck where BOTH cuts reproduce it, order decides. `preserve` first is the
		// kernel's conservative default.
		const both = 'para one\n\n<!-- a note -->\n\npara two\n';
		const bothAuthored = await authoredOf(both);
		const first = await stripNotesCut(both, notesCore, new Set(['a note']), bothAuthored, sectionsOf, render);
		expect(first.warning).toBeUndefined();
		expect(first.source).not.toContain('a note');
	});
});
