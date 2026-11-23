// The /libraries/markup/ demo's data and its two comparisons, kept out of the page so a unit test
// can hold every number the page shows (markup-demo.test.ts). Both comparisons run the REAL
// library (src/lib/markup, the `@laticent/markup` workspace) beside the shortcut it replaces.
import { splitCodeLines } from './markup/code-lines';
import { splitSections } from './markup/sections';
import { readTopLevelH2Text } from './markup/tags';

/** Source with tokens that span lines: a block comment and a template string. */
export const SAMPLE_CODE = `/* Revenue by quarter.
   Figures are in millions,
   unaudited. */
const quarters = ['Q1', 'Q2', 'Q3'];
const note = \`Held in Q2,
grew in Q3\`;
export function total(rows) {
  return rows.reduce((sum, r) => sum + r.value, 0);
}`;

export interface LineComparison {
	/** `html.split('\\n')`: the shortcut. A span open at a newline is cut in two. */
	naive: string[];
	/** `splitCodeLines(html)`: each line closes what it opened and re-opens it on the next. */
	balanced: string[];
	/** Lines where the two differ, so the shortcut drew them wrong. */
	broken: number;
	/** Lines that start inside a token, so splitCodeLines re-opened its span. */
	reopened: number;
}

/** Split highlighted code both ways. The trailing newline markdown-it leaves ends the last line. */
export function compareLines(html: string): LineComparison {
	const balanced = splitCodeLines(html);
	const naive = html.replace(/\n$/, '').split('\n');
	let broken = 0;
	let reopened = 0;
	for (let i = 0; i < Math.max(naive.length, balanced.length); i++) {
		const b = balanced[i] ?? '';
		const n = naive[i] ?? '';
		if (n === b) continue;
		broken++;
		// A line that only CLOSES early still starts with the shortcut's text; a re-opened one does not.
		if (!b.startsWith(n)) reopened++;
	}
	return { naive, balanced, broken, reopened };
}

/** Rendered slide HTML with three traps a string search falls into. */
export const SAMPLE_SLIDES = `<!-- Draft kept for later: <section class="draft"><h2>Old title</h2></section> -->
<section class="title">
  <aside class="note"><h2>Speaker aside</h2><p>Open with the number.</p></aside>
  <h2>Revenue held in Q2</h2>
  <p>Flat against plan, ahead of last year.</p>
</section>
<section class="split">
  <h2>Q3 <span title="target > plan">beat the target</span></h2>
  <section class="detail"><h2>Inside the detail</h2><p>Three regions grew.</p></section>
</section>`;

export interface SlideRow {
	cls: string;
	title: string;
}

export interface SlideComparison {
	/** The library: top-level sections only, each with its OWN title. */
	slides: SlideRow[];
	/** The shortcut: `/<section[^>]*>[\\s\\S]*?<\\/section>/g`, then the first `<h2>` inside each match. */
	naive: { cls: string; title: string }[];
}

export function compareSlides(html: string): SlideComparison {
	const slides: SlideRow[] = [];
	for (const p of splitSections(html)) {
		if (p.type !== 'section') continue;
		slides.push({ cls: p.cls, title: readTopLevelH2Text(p.inner) });
	}
	const naive: { cls: string; title: string }[] = [];
	for (const m of html.matchAll(/<section([^>]*)>([\s\S]*?)<\/section>/g)) {
		const cls = /class="([^"]*)"/.exec(m[1])?.[1] ?? '';
		const h = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(m[2]);
		naive.push({ cls, title: h ? h[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '' });
	}
	return { slides, naive };
}
