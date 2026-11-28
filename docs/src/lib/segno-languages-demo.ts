// The /libraries/segno-languages/ demo's model, kept out of the page so a unit test can hold
// every claim the page makes (segno-languages-demo.test.ts). Everything here calls the REAL
// library, `@laticent/segno-languages/markdown` (docs/src/lib/segno-markdown, the folder keeps
// its old name): one parser, `deckModel` for a deck read from nothing, and `updateDeckModel`
// for each edit, which re-reads the slide the edit touched and reuses every other slide's
// share of the parse by reference.

import { BlockParser, type DeckModel, deckModel, deckModelStats, updateDeckModel } from './segno-markdown/index';

// A short deck with three `---` lines that are NOT slide breaks: two inside a fence and one
// under a line of text, where CommonMark reads it as a heading underline.
export const SAMPLE = `---
theme: indaco
pagination: true
---

# Quarterly review

Revenue, churn and the plan for Q3.

---

<!-- @meta{class=compare} -->

## Two ways to ship

- Ship weekly
- Ship when ready

---

## A fence keeps its dashes

\`\`\`yaml
---
title: not a slide break
---
\`\`\`

---

Under a line of text
---

A \`---\` under text underlines a heading.

---

## Next steps

1. Hire two engineers
2. Close the audit
`;

// commonmark + html + table: the package's defaults, which are the options Lattice gives markdown-it.
const parser = new BlockParser();

/** The deck model of `text`, read from nothing. */
export function build(text: string): DeckModel {
	return deckModel(text, { parser });
}

/** What one edit cost: the model after it, and how much of the deck the library read again. */
export interface Step {
	model: DeckModel;
	/** The edit fell in the front matter (or changed where it ends), so the whole deck was read again. */
	full: boolean;
	/** Body lines the update parsed again. */
	rereadLines: number;
	/** Indices of the slides whose parse is new; every other slide's was reused as it was. */
	reread: number[];
}

/** The model of `next` from `prev`, through `updateDeckModel`, with the library's own counters as the account. */
export function step(prev: DeckModel, next: string): Step {
	const before = { ...deckModelStats };
	const model = updateDeckModel(prev, next);
	const full = deckModelStats.full > before.full;
	const rereadLines = model === prev ? 0 : full ? model.lines : deckModelStats.reparsedLines - before.reparsedLines;
	// A slide the update did not touch keeps the very segment object the old model held.
	const old = new Set(prev.segs);
	const reread = model === prev ? [] : model.segs.flatMap((seg, i) => (old.has(seg) ? [] : [i]));
	return { model, full, rereadLines, reread };
}

/** One slide as the page lists it. Lines are the editor's: 1-based, front matter included. */
export interface SlideView {
	index: number;
	/** First and last line, or null for an empty slide. */
	from: number | null;
	to: number | null;
	/** The line of the break that opens it, or null for the first slide. */
	sep: number | null;
	title: string;
	directives: number;
	fences: number;
	leaves: number;
}

/** Lines of front matter above the body, so a body line converts to an editor line. */
export function frontMatterLines(model: DeckModel): number {
	return model.text.slice(0, model.bodyStart).split('\n').length - 1;
}

const MARKERS = /^\s{0,3}(?:#{1,6}\s+|(?:[-*+]|\d{1,9}[.)])\s+)?/;

/** The slides, each with its line range, the break above it, its first heading (or line) and what it holds. */
export function slideViews(model: DeckModel): SlideView[] {
	const fm = frontMatterLines(model);
	const line = (bodyLine: number) => bodyLine + fm + 1;
	const leaves = model.leaves;
	return model.slides.map((s, index) => {
		const mine = leaves.filter((l) => l.slide === index);
		const first = mine.find((l) => l.type === 'heading') ?? mine[0];
		let title = first ? model.body.slice(model.lineStart(first.fromLine), model.lineEnd(first.fromLine)).replace(MARKERS, '').trim() : '';
		if (title.length > 52) title = `${title.slice(0, 51)}…`;
		const empty = s.toLine <= s.fromLine;
		return {
			index,
			from: empty ? null : line(s.fromLine),
			to: empty ? null : line(s.toLine - 1),
			sep: s.sepLine < 0 ? null : line(s.sepLine),
			title,
			directives: model.directives.filter((r) => r.slide === index).length,
			fences: model.fences.filter((r) => r.slide === index).length,
			leaves: mine.length,
		};
	});
}

/** The slide breaks, as editor lines. */
export function breakLines(model: DeckModel): number[] {
	const fm = frontMatterLines(model);
	return Array.from(model.boundaries, (b) => b + fm + 1);
}

/** Source offset of the end of a slide's first line of text: where the page's "type here" button types. */
export function titleEnd(model: DeckModel, index: number): number {
	const first = model.leaves.find((l) => l.slide === index);
	const s = model.slides[index];
	const bodyLine = first ? first.fromLine : s.fromLine;
	return model.bodyStart + model.lineEnd(bodyLine);
}

/** Source offset just past a slide's last line: where a new break goes to split it. */
export function slideEnd(model: DeckModel, index: number): number {
	const s = model.slides[index];
	return model.bodyStart + model.lineEnd(Math.max(s.fromLine, s.toLine - 1));
}
