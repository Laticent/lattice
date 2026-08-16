// Post-build step: move each page's render-blocking `<link rel="stylesheet">` as
// early in `<head>` as it can go WITHOUT crossing a `<style>` element.
//
// WHY. Astro appends a page's bundled stylesheet link after the page's own head
// content. On `/studio/` that put it 51KB into a 58KB `<head>` — behind a 12.5KB
// inline `<style>` (the SSR shell CSS) and a 28KB parser-blocking inline `<script>`
// (the geometry seed). Two things follow, and both are the bug in #1653:
//
//   1. The request is DISCOVERED LATE and queued behind the inline script's parse.
//      Measured on the built artifact over a modeled 1.2Mbps/200ms link, the sheet
//      finished at 3553ms.
//   2. Nothing told the browser a render-blocking sheet was pending until the parser
//      got there — so it painted first. First contentful paint landed at 330ms, more
//      than three seconds before the stylesheet applied, and what it painted was the
//      raw DOM: the Lattice mark at its intrinsic size, browser-default form controls,
//      unstyled skeleton. Exactly the reporter's screenshot.
//
// Hoisting the link fixes both at once — the sheet arrived at 706ms and first paint
// moved to 731ms, i.e. AFTER it. Same bytes, same cascade, no flash. The same shape
// holds on a fast link (194ms/271ms → 303ms/277ms).
//
// WHY NOT `rel="preload"`. A preload starts the request early but does not make the
// browser hold the paint: the render-blocking `<link>` is still unparsed, so the
// browser has nothing telling it to wait, and it paints unstyled anyway. The paint
// hold is what this bug needs, and only the real link in early document order gives it.
//
// WHY NOT SIMPLY THE TOP OF `<head>`. Because that reorders the CASCADE. The page's
// inline `<style>` blocks currently sit before the sheet, so the sheet wins ties
// against them; hoisting past one silently flips that, which is a visual change
// dressed as a performance fix. The insertion point here is the end of the LAST
// `<style>` (or earlier stylesheet link) that already precedes the sheet, so every
// stylesheet-to-stylesheet ordering in the document is preserved exactly and only the
// script/meta ordering changes — and scripts do not participate in the cascade.
//
// Idempotent: a link already at its floor is left alone, so re-running is a no-op.
//
// Usage: node scripts/hoist-stylesheets.mjs (run after `astro build`)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(DOCS, 'dist');

const STYLE_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const SHEET_RE = /<link\b[^>]*\brel="stylesheet"[^>]*>/gi;

/**
 * Hoist every render-blocking stylesheet link in one HTML document's `<head>`.
 *
 * Returns `{ html, moved }` — `moved` is how many bytes earlier the FIRST sheet now
 * sits (0 when nothing moved), which is the number worth reporting: it is the size of
 * the head prefix the browser no longer has to parse before it knows to wait.
 */
export function hoistStylesheets(html) {
	const headEnd = String(html ?? '').indexOf('</head>');
	if (headEnd < 0) return { html, moved: 0 };
	let head = html.slice(0, headEnd);
	const rest = html.slice(headEnd);
	// The earliest a link may land: the front of the head's RESOURCE region — the first
	// `<script>` / `<style>` / `<link>` — never into the metadata run before it. Two
	// reasons, and the first alone is decisive: `<meta charset>` must come first (the spec
	// wants it in the document's first 1024 bytes), and a script whose whole job is to not
	// change rendering must not be the thing that pushes it down. Without a floor at all,
	// offset 0 would put a `<link>` in front of the doctype and hand the page quirks mode.
	const headOpen = head.match(/<head\b[^>]*>/i);
	const afterHead = headOpen ? headOpen.index + headOpen[0].length : 0;
	const firstResource = head.slice(afterHead).search(/<(?:script|style|link)\b/i);
	const minFloor = firstResource < 0 ? afterHead : afterHead + firstResource;

	let moved = 0;
	// One sheet at a time, re-scanning after each move: a later sheet's floor depends on
	// where the earlier ones landed, so sheets keep their relative order and stack up at
	// the floor in document order rather than leapfrogging each other. `nth` is the index
	// of the sheet under consideration, and it only ever advances — a sheet already at its
	// floor is skipped, not retried.
	for (let nth = 0; nth < 64; nth++) {
		const sheets = [...head.matchAll(SHEET_RE)].map((m) => ({ at: m.index, text: m[0] }));
		const sheet = sheets[nth];
		if (!sheet) break;
		// The floor: past the end of the last `<style>` that precedes this sheet, and past
		// every sheet already placed ahead of it. Never past either — that ordering IS the
		// cascade the page was authored against.
		const ends = [
			...[...head.matchAll(STYLE_RE)].map((m) => m.index + m[0].length),
			...sheets.slice(0, nth).map((s) => s.at + s.text.length),
		].filter((end) => end <= sheet.at);
		const floor = Math.max(minFloor, ...ends);
		if (floor >= sheet.at) continue; // already as early as it may go
		const without = head.slice(0, sheet.at) + head.slice(sheet.at + sheet.text.length);
		head = without.slice(0, floor) + sheet.text + without.slice(floor);
		if (nth === 0) moved = sheet.at - floor;
	}
	return { html: head + rest, moved };
}

function listHtml(dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) listHtml(p, out);
		else if (e.name.endsWith('.html')) out.push(p);
	}
	return out;
}

function main() {
	const pages = listHtml(DIST);
	if (!pages.length) {
		process.stdout.write('hoist-stylesheets: no built pages found — did `astro build` run?\n');
		return 0;
	}
	let changed = 0;
	let best = { page: '', moved: 0 };
	for (const p of pages) {
		const html = fs.readFileSync(p, 'utf8');
		const { html: out, moved } = hoistStylesheets(html);
		if (out === html) continue;
		fs.writeFileSync(p, out);
		changed += 1;
		if (moved > best.moved) best = { page: path.relative(DIST, p), moved };
	}
	process.stdout.write(
		`hoist-stylesheets: ${changed}/${pages.length} page(s) rewritten` +
			(best.moved ? `, largest gain ${best.page} (+${(best.moved / 1024).toFixed(1)}KB earlier)` : '') +
			'\n',
	);
	return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exit(main());
}
