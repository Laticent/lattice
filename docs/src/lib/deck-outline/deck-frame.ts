// WHERE A SLIDE IS IN THE EDITOR: the lines a page occupies (fences included) and where the caret goes
// when it is picked. Split from deck-outline.ts so only the Playground's focus sync carries it; the
// Studio's eager bundle, which imports the outliner, does not (docs/route-budget.json).

import { type Outline, partEnd, partStart } from '../fuoco/outline';
import { type Extent, extentOf } from '../fuoco/place';
import type { DeckIndex } from './deck-outline';

/** Where a reader expects the caret when a slide is picked: the end of its title, the first line of
 *  content (a directive comment never counts, as in `deckEditableOffset`). A page with no content line
 *  (empty, or directives only) lands where `deckEditableOffset` puts it, pulled back inside the page so
 *  it does not sit on the `---` that closes it when the page has a blank line to rest on. */
export function deckTitleEnd(ix: Outline, c: number, k = 0): number {
	const src = ix.source;
	const start = partStart(ix, c, k);
	const end = partEnd(ix, c, k);
	for (let at = start; at < end; ) {
		const nl = src.indexOf('\n', at);
		const lineEnd = nl === -1 || nl > end ? end : nl;
		const line = src.slice(at, lineEnd).trim();
		if (line && !/^<!--(?:(?!-->).)*-->$/.test(line)) return lineEnd;
		if (nl === -1) break;
		at = nl + 1;
	}
	const from = k <= 0 ? (ix.units[c]?.from ?? start) : start;
	return Math.min(start, Math.max(from, end - 1));
}

/** The lines a page occupies in the editor, INCLUDING the `---` that opens and closes it. Slide 1
 *  opens on the front matter's closing fence; a page inside a heading-split slide has no
 *  separator of its own, so its frame is its text. This is the extent a view highlights, and the
 *  one it must keep on screen when the page is picked. */
export function deckFrame(ix: DeckIndex, c: number, k = 0): Extent | null {
	const unit = ix.units[c];
	if (!unit) return null;
	let from = k <= 0 ? unit.from : partStart(ix, c, k);
	let to = partEnd(ix, c, k);
	if (k <= 0) {
		const open = ix.seps.find((s) => s.index + s.length === unit.from);
		if (open) from = open.index;
		else if (c === 0 && ix.bodyStart > 0) {
			// The front matter's closing fence: the last non-blank line before the body.
			let at = ix.bodyStart;
			while (at > 0 && /\s/.test(ix.source[at - 1])) at--;
			from = ix.source.lastIndexOf('\n', at - 1) + 1;
		}
	}
	if (k >= unit.parts.length - 1) {
		const close = ix.seps.find((s) => s.index === unit.end);
		if (close) to = close.index + close.length;
	}
	return extentOf(ix, from, to);
}

