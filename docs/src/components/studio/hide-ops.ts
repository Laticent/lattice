import { buildDeckIndex } from '@/lib/deck-outline';
import { unitText } from '@/lib/fuoco/outline';
import { boundaryParser } from '../../../../lib/core/boundary-parser.mjs';
import { hideOfComment } from '../../../../lib/core/hide-directive.mjs';
import { slideSourceHidden } from '../../../../lib/diagnostics/slice-equivalence-core.mjs';
import { type DeckOpResult, replaceSlide, type SlideAt } from './deck-ops';

// Hide Slide / Show Slide, the WRITE half of hidden slides (engineering/decisions/2026-11-06-hidden-slides.md). Loaded on
// the click (StudioShell `opHide`), so it costs the Studio's startup JavaScript nothing; the READ (`isHiddenAt`) stays in
// ./deck-ops.
//
// Both directions first remove every line that IS a hide directive, found the way the engine finds one: the shared
// boundary parser's TOP-LEVEL comment blocks that are only a comment, read by the one reader (lib/core/hide-directive.mjs)
// as on or off. So a note such as `<!-- hide: if short on time -->`, a sample in code, and a comment in a list item, a
// blockquote or an HTML block all survive both (a line regex took the list-item one, a checker found). A removed line
// takes one adjacent blank line with it, so Hide then Show gives the slide back byte for byte. Hiding then writes the
// authored form, `<!-- hide -->`, as the slide's first line; since every other hide line is gone, no older
// `_hide: false` can outvote it. A hide written some other way that survives the removal is outvoted at the end:
// `<!-- hide -->` to hide, `<!-- _hide: false -->` to show, the last hide on a slide winning.

function withoutHideLines(text: string): string {
	if (!/hide/.test(text)) return text;
	const lines = text.split('\n');
	const cut: [number, number][] = [];
	for (const t of boundaryParser.parse(text, {}) as { type: string; level: number; map: [number, number] | null; content: string }[]) {
		if (t.type !== 'html_block' || t.level || !t.map) continue;
		if (!/^\s*<!--[\s\S]*?-->\s*$/.test(t.content) || !hideOfComment(t.content.trim())) continue;
		cut.push(t.map);
	}
	const blank = (i: number) => i < 0 || i >= lines.length || lines[i].trim() === '';
	for (const [a, b] of cut.reverse()) {
		// Take one blank line along, but only one the slide does not need: a blank that is the only thing between two
		// blocks (the comment sat flush against text on its other side) stays, or the two would merge (a checker found
		// "Para one.\n\n<!-- hide -->\nPara two." becoming one paragraph). So: the blank after, when the line before the
		// comment is blank or the slide's edge; else the blank before, when the line after is.
		const end = b < lines.length && blank(b) && blank(a - 1) ? b + 1 : b;
		const start = end === b && a > 0 && blank(a - 1) && blank(b) ? a - 1 : a;
		lines.splice(start, end - start);
	}
	return lines.join('\n');
}

/** The slide's markdown with its hide state set to `hidden`. */
export function withHidden(content: string, hidden: boolean): string {
	if (slideSourceHidden(content) === hidden) return content;
	// A removed last line leaves its blank lines behind: trim them, as the deck's slots hold trimmed content.
	const removed = withoutHideLines(content).replace(/\s+$/, '');
	if (hidden) {
		const written = `<!-- hide -->\n${removed}`;
		return slideSourceHidden(written) ? written : `${removed}\n\n<!-- hide -->`;
	}
	return slideSourceHidden(removed) ? `${removed}\n\n<!-- _hide: false -->` : removed;
}


/** Hide (`hidden` true) or show rendered slide `s`'s `---` block, through `replaceSlide`, which changes only that block's
 *  content. No block is cut, even under `split: headings`. Active stays on the block. */
export function setHiddenAt(source: string, s: SlideAt, hidden: boolean): DeckOpResult {
	const ix = buildDeckIndex(source);
	if (!ix.units[s.unit]) return { source, active: s.unit };
	const text = unitText(ix, s.unit);
	if (slideSourceHidden(text) === hidden) return { source, active: s.unit };
	return replaceSlide(source, s.unit, withHidden(text, hidden), true);
}
