import { describe, expect, it } from 'vitest';
import { embedFinishInMarkdown } from './share-export';

// The source-handoff finish embed (Markdown / Marp share). A saved finish renders
// only from its generated CSS, so the exported copy must carry that CSS inline —
// for a PER-SLIDE finish (`_class: … finish-<slug>`) as well as a deck-wide one.
describe('embedFinishInMarkdown', () => {
	const CSS = 'section.finish.finish-shu { --fin-wash: radial-gradient(circle, red, transparent); }';

	it('embeds the finish CSS as a global <style> after the front matter — PER-SLIDE (no deck-wide class)', () => {
		const src = '---\ntheme: indaco\n---\n\n<!-- _class: title finish-shu -->\n\n# Hi\n';
		// finishClass is empty (the finish is applied per-slide, not deck-wide).
		const out = embedFinishInMarkdown(src, '', CSS);
		expect(out).toContain('<style>');
		expect(out).toContain('--fin-wash'); // the CSS is inlined
		// the <style> lands right after the closing front-matter fence…
		expect(out.indexOf('<style>')).toBeGreaterThan(out.indexOf('\n---\n'));
		// …and BEFORE the first slide content, so it's a global rule.
		expect(out.indexOf('<style>')).toBeLessThan(out.indexOf('_class: title finish-shu'));
		// per-slide: the source's own class line is untouched (no deck-wide class merge).
		expect(out).not.toMatch(/^class:/m);
	});

	it('merges the deck-wide finish class AND strips the now-redundant finish: value', () => {
		const src = '---\nfinish: finish-shu\n---\n\n# Hi\n';
		const out = embedFinishInMarkdown(src, 'finish finish-shu', CSS);
		expect(out).toContain('<style>');
		expect(out).toMatch(/^class:.*\bfinish\b.*\bfinish-shu\b/m); // stamped deck-wide
		// the bare `finish: finish-shu` value is dropped — it names a finish the
		// recipient's register can't resolve (would trip unknown-finish), and the
		// class + embedded CSS already render it.
		expect(out).not.toMatch(/^finish:\s*finish-shu/m);
	});

	it('does not corrupt the sender\u2019s front matter on the way out (#1256)', () => {
		// The worst of the 24 whole-block writers: this one damages the artifact you HAND
		// SOMEONE ELSE. The drawer controls hit your own copy, where Undo is one click away;
		// this one shipped the recipient a silently shredded `.md` and surfaced nothing.
		const rich = ['---', '# legal signed off on this footer', 'theme: indaco', '_class: lead', 'style: |', '  section.title h1 { color: red; }', 'tags: [alpha, beta]', 'finish: finish-shu', '---', '', '# Q4', ''].join('\n');
		const out = embedFinishInMarkdown(rich, 'finish finish-shu', CSS);
		expect(out).toContain('# legal signed off on this footer'); // the YAML comment
		expect(out).toContain('_class: lead');
		expect(out).toContain('style: |');
		expect(out).toContain('  section.title h1 { color: red; }'); // the block scalar's body
		expect(out).toContain('tags: [alpha, beta]');
		expect(out).not.toContain('style: "|"');
		// …and it still did the two jobs it came to do.
		expect(out).toMatch(/^class:.*\bfinish-shu\b/m);
		expect(out).not.toMatch(/^finish:\s*finish-shu/m);
	});

	it('is a no-op when the deck references no saved finish (nothing to embed)', () => {
		const src = '---\ntheme: indaco\n---\n\n# Plain\n';
		expect(embedFinishInMarkdown(src, '', undefined)).toBe(src);
		expect(embedFinishInMarkdown(src, '', '')).toBe(src);
	});

	it('embeds combined CSS for multiple per-slide finishes', () => {
		const combined = `${CSS}\n\nsection.finish.finish-oct { --fin-texture: none; }`;
		const src = '---\ntheme: indaco\n---\n\n<!-- _class: a finish-shu -->\n\n# A\n\n---\n\n<!-- _class: b finish-oct -->\n\n# B\n';
		const out = embedFinishInMarkdown(src, '', combined);
		expect(out).toContain('finish-shu');
		expect(out).toContain('finish-oct'); // both finishes' CSS present
	});
});
