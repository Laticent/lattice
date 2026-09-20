#!/usr/bin/env node
/**
 * Reader-mode extraction probe — re-derive the numbers behind the reader-mode work
 * (`engineering/decisions/2026-09-20-reader-mode-text-extraction.md`).
 *
 * WHY IT EXISTS. That work turns on figures a reviewer cannot otherwise reproduce: which
 * decks a reader mode considers eligible, how much of a deck actually reaches a
 * summarizer, and whether a document hands one copy or two. Quoting those in a PR body
 * with no way to re-run them is the thing HARD RULE #23 exists to stop, so the harness
 * ships instead of the anecdote.
 *
 * WHAT IT MEASURES, per file:
 *   readerable   `isProbablyReaderable` — whether the reader-mode ICON would appear.
 *   words        what `Readability.parse()` actually extracts, i.e. what a summarizer is
 *                handed. This is the number that matters; eligibility only decides the icon.
 *   copies       how many times a unique source sentence appears in that extraction.
 *                VERBATIM duplication only, and the limit is worth knowing: the player
 *                carries the slides AND the prose projection, but the projection rewords
 *                as it flattens, so the two copies are not textually identical and this
 *                column reads 1. `words` is the detector there — 2255 against a 1080-word
 *                deck — and comparing it to a single-copy build of the same deck is the
 *                reliable test. `n/a` means no sentence was unique in the source at all,
 *                which is itself a finding.
 *
 * WHAT IT CANNOT TELL YOU, and the distinction cost this project a defect: it runs the
 * library against the file AS DELIVERED. A real reader reaches a document by one of two
 * paths — Firefox for iOS readerizes the LIVE DOM, Firefox on the desktop re-fetches and
 * parses with no scripts run — so anything a page's own JavaScript does to the DOM is
 * invisible here. For a claim about the live path, drive a browser.
 *
 * `@mozilla/readability` is deliberately NOT a dependency: nothing we ship imports it, and
 * this is an on-demand diagnostic. Install it where you are running from.
 *
 * Usage:  node tools/reader-extraction-probe.mjs <file.html> [more.html …]
 */

import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (!files.length) {
	console.error('usage: node tools/reader-extraction-probe.mjs <file.html> [more.html …]');
	process.exit(1);
}

let JSDOM;
let Readability;
let isProbablyReaderable;
try {
	({ JSDOM } = await import('jsdom'));
	({ Readability, isProbablyReaderable } = await import('@mozilla/readability'));
} catch (e) {
	console.error(
		`reader-extraction-probe needs jsdom + @mozilla/readability (neither ships as a dependency):\n` +
			`  npm i --no-save @mozilla/readability\n\n(${e?.message})`,
	);
	process.exit(1);
}

/**
 * A sentence to count copies with, and an honest answer when there isn't one.
 *
 * The anchor has to occur EXACTLY ONCE in the source document, or counting it in the
 * extraction says nothing. That is not always possible — a document which already carries
 * the deck twice (the player ships the slides and the article at once) has no unique
 * sentence by construction, which is precisely the case the column exists to detect. So
 * this returns null there rather than silently anchoring on a duplicated sentence and
 * reporting a confident `1`, which is what an earlier version of this file did.
 */
function probeSentence(doc) {
	const body = doc.body.textContent.replace(/\s+/g, ' ');
	const count = (frag) => {
		let n = 0;
		for (let i = body.indexOf(frag); i !== -1; i = body.indexOf(frag, i + 1)) n++;
		return n;
	};
	const candidates = [...doc.querySelectorAll('p, li')]
		.map((n) => n.textContent.replace(/\s+/g, ' ').trim())
		.filter((t) => t.length >= 60)
		.map((t) => t.slice(0, 60));
	for (const frag of candidates) if (count(frag) === 1) return frag;
	return null;
}

const rows = [];
for (const f of files) {
	const html = fs.readFileSync(f, 'utf8');
	const url = 'https://probe.invalid/' + path.basename(f);
	const doc = new JSDOM(html, { url }).window.document;
	const probe = probeSentence(doc);

	let readerable = false;
	try {
		readerable = isProbablyReaderable(doc);
	} catch {
		/* treated as not readerable */
	}

	let words = 0;
	let copies = probe ? 0 : null;
	try {
		const article = new Readability(new JSDOM(html, { url }).window.document).parse();
		const text = article ? article.textContent.replace(/\s+/g, ' ').trim() : '';
		words = text ? text.split(' ').length : 0;
		if (probe && text) for (let i = text.indexOf(probe); i !== -1; i = text.indexOf(probe, i + 1)) copies++;
	} catch {
		/* leave at zero — an unparseable document extracts nothing */
	}

	rows.push({ file: path.basename(f), readerable, words, copies });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('file', 38)} ${pad('readerable', 11)} ${pad('words', 7)} copies`);
for (const r of rows) {
	// `n/a` is a FINDING, not a gap: the anchor must be unique in the source, and a document
	// that already carries the deck twice has no unique sentence. Compare `words` against a
	// single-copy build of the same deck to see the duplication.
	const copies = r.copies === null ? 'n/a (no unique anchor — the source itself repeats)' : r.copies;
	console.log(`${pad(r.file, 38)} ${pad(r.readerable, 11)} ${pad(r.words, 7)} ${copies}`);
}
