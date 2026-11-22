// WHAT A PLUGIN BLOCK SHOWS BEFORE ITS DRAWING (D1, engineering/decisions/2026-11-20-plugin-reload-wait.md).
//
// On a reload the Studio paints a deck before the plugin's code has loaded: the Library is read from IndexedDB, the door
// chunk loads, and the stamp the previews paint with is committed, each a moment the engine would draw a plugin's fence
// as its source. Instead, a block of a plugin the deck lists shows its AFTERIMAGE: the shapes of its last drawing in this
// browser, in muted ink, at the size it drew. A block with no afterimage yet (a first draw, changed data) shows a muted
// chart skeleton. This module is on the Studio's first load only: StudioShell hands it to entry.ts `setWaits`, and the
// door reaches it there (`getWaits`), so no other route and no door chunk carries it. Recording a drawing's shapes is
// wait-capture.ts, which loads with the door.
//
// Placeholders are built from numbers, never from stored markup: every stored value is forced to a number before it is
// written into the SVG, so nothing in browser storage reaches a slide as HTML.

export const REG_KEY = 'lattice-plugin-waits';
export const AFTER_KEY = 'lattice-plugin-afterimages';


export type Entry = { name: string; placement: string; aspect?: string; sha: string };
/** A stored JSON object, or {} when it is missing or unreadable. */
function stored<T>(key: string): Record<string, T> {
	try {
		const v = JSON.parse(localStorage.getItem(key) || '{}');
		return v && typeof v === 'object' ? v : {};
	} catch {
		return {};
	}
}
const registry = () => stored<Entry>(REG_KEY);
/** The Library holds no plugin, or could not be read: drop the fence registry, or a wait would stand where nothing
 *  will draw (StudioShell, after the Library read; never on the empty list a reload starts from). */
export function forgetWaits(): void {
	try {
		localStorage.removeItem(REG_KEY);
	} catch {}
}

// The deck text is already LF: the Studio folds line endings where it reads a deck in (normalizeSourceText).
const norm = (body: string) => body.trim();
/** FNV-1a over the block's body: which drawing an afterimage belongs to. */
function fnv(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}
/** A block's afterimage key: the plugin's code (16 hex of its digest) and the block's body. */
export const waitKey = (sha16: string, body: string) => `${sha16}-${fnv(norm(body))}`;

export type Shot = { w: number; h: number; b: number[][] };
export const afterimages = () => stored<Shot>(AFTER_KEY);

/** A stored or measured value as a whole number; anything that is not a finite number becomes 0. */
export const n = (v: unknown) => {
	const x = Math.round(Number(v));
	return Number.isFinite(x) ? x : 0;
};

// Every mark is filled with the wrapper's color (muted ink, set once on the wait's box) at its own opacity.
const SVG = (h: number) => `<svg viewBox="0 0 1000 ${h}" fill="currentColor" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">`;
const rect = (x: number, y: number, w: number, h: number, r: number, o: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" opacity="${o}"/>`;

/** The fallback skeleton: a faint bar chart on a baseline and gridlines, no words. */
function skeleton(): string {
	let s = SVG(400);
	for (const y of [80, 160, 240, 320]) s += rect(40, y, 920, 1, 0, 0.18);
	s += rect(40, 359, 920, 2, 0, 0.35);
	[230, 170, 200, 130, 190].forEach((top, i) => {
		s += rect(70 + i * 180, top, 140, 360 - top, 6, 0.16);
	});
	return `${s}</svg>`;
}

/** The afterimage: the boxes of the last drawing, muted; words become rounded bars. */
function afterimage(shot: Shot): string {
	let s = SVG(n((1000 * n(shot.h)) / Math.max(1, n(shot.w))));
	for (const box of Array.isArray(shot.b) ? shot.b : []) {
		if (!Array.isArray(box)) continue;
		const [x, y, w, h, k] = box.map(n);
		// k: 0 a bordered box, 1 a mark, 2 an emphasized mark, 3 a line of text.
		s += k === 3 ? rect(x, n(y + h * 0.22), w, n(h * 0.56), n(h * 0.28), 0.22) : rect(x, y, w, h, k ? 3 : 6, k === 2 ? 0.32 : k ? 0.16 : 0.08);
	}
	return `${s}</svg>`;
}

/** The wait for one block of a plugin the deck lists, or null to leave the block as the engine draws it (a chip). */
export function waitMarkup(e: Entry, body: string): string | null {
	if (e.placement === 'chip') return null;
	const shot = afterimages()[waitKey(e.sha, body)];
	const sw = shot ? n(shot.w) : 0;
	const sh = shot ? n(shot.h) : 0;
	let style: string;
	if (sw > 0 && sh > 0) {
		// An afterimage takes the size the drawing took (its measured width and height), not the placement's box.
		style = `position:relative;width:100%;aspect-ratio:${sw} / ${sh};box-sizing:border-box`;
	} else {
		const [w, h] = (e.aspect && /^\d+\/\d+$/.test(e.aspect) ? e.aspect : '16/9').split('/');
		style =
			e.placement === 'stage'
				? 'position:relative;flex:1 1 auto;width:100%;min-height:8em;box-sizing:border-box'
				: `position:relative;width:min(100%, calc(30cqi * ${w} / ${h}));aspect-ratio:${w} / ${h};box-sizing:border-box`;
	}
	const drawn = sw > 0 && sh > 0;
	const name = String(e.name).replace(/[^a-z0-9-]/gi, '');
	return `<div data-lattice-plugin-wait="${name}" data-wait-shape="${drawn ? 'afterimage' : 'skeleton'}" data-placement="${e.placement === 'stage' ? 'stage' : 'figure'}" role="img" aria-busy="true" aria-label="${name} is loading" style="${style};color:var(--text-muted)">${drawn ? afterimage(shot as Shot) : skeleton()}</div>`;
}

/**
 * The deck's `plugins:` list. lib/core/deck-plugins.mjs `deckPluginList` is the reader of record, but importing it would
 * put about 2.2 KB on the Studio's first load (it brings plugin admission with it), so this is a small copy of its rules:
 * the LAST top-level `plugins:` key wins; a flow list, a scalar, or a block list (comment lines skipped, items at any
 * indent). wait.test.ts holds it to `deckPluginList` case by case. A miss only costs the old source flash, and a false
 * hit a wait the door then replaces with its "not listed" placeholder.
 */
function deckPluginList(source: string): string[] {
	const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(source);
	if (!m) return [];
	const lines = m[1].split(/\r?\n/);
	let at = -1;
	for (let i = 0; i < lines.length; i++) if (/^plugins:/.test(lines[i])) at = i;
	if (at < 0) return [];
	const out: string[] = [];
	const add = (x: string) => {
		const t = x.trim().replace(/^['"]|['"]$/g, '');
		if (t && !out.includes(t)) out.push(t);
	};
	const v = lines[at].slice(8).replace(/\s+#.*$/, '').trim();
	if (v.startsWith('[')) for (const x of v.slice(1).replace(/\].*$/, '').split(',')) add(x);
	else if (v) add(v);
	else
		for (const l of lines.slice(at + 1)) {
			if (/^\s*(#|$)/.test(l)) continue;
			const item = /^\s*-\s+([^\s#]+)/.exec(l);
			if (!item) break;
			add(item[1]);
		}
	return out;
}

/**
 * The deck with each block of a plugin it lists, whose fence the registry knows, replaced by its wait: what the engine
 * renders BEFORE the door holds the plugins (code-packages/entry.ts, door.ts fast paths), for a PREVIEW only (an export
 * never draws a wait). Unchanged for a deck that lists no plugin the registry knows.
 *
 * Every fence's body is skipped, so a sample inside another code block is left alone, and a fence under `>` or a list
 * marker is found. (lib/core/fence-languages.js `scanFences` walks fences the same way, but it ships in a lazy chunk with
 * its shell heuristics, about 850 bytes this first load cannot spend.) The wait keeps that line's prefix,
 * so the block stays where the engine would put it, and the body is dedented by the fence's indent, as markdown-it does,
 * so its key matches the one door-run.ts stamps on the drawing.
 */
export function withWaits(source: string): string {
	const reg = registry();
	if (!Object.keys(reg).length) return source;
	const listed = new Set(deckPluginList(source));
	if (!listed.size) return source;
	const lines = source.split('\n');
	// Quote markers removed, a list marker turned into spaces: the column a fence's content starts at is kept.
	const quote = (l: string) => /^(?:[ \t]*>)+[ \t]?/.exec(l)?.[0] ?? '';
	const flat = lines.map((l) => l.slice(quote(l).length).replace(/^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(?=`{3,}|~{3,})/, (_m, a, b, c) => a + ' '.repeat(b.length + c.length)));
	const out = lines.slice();
	const GONE = '\u0000';
	for (let o = 0; o < flat.length; o++) {
		const open = /^( *)(`{3,}|~{3,})\s*([^\s`]*)/.exec(flat[o]);
		if (!open) continue;
		const ch = open[2][0];
		const closes = (l: string) => {
			const t = l.trim();
			return t.length >= open[2].length && t === ch.repeat(t.length);
		};
		let j = o + 1;
		while (j < flat.length && !closes(flat[j])) j++;
		// An unclosed fence runs to the end of the deck in the engine too: the rest is code, left as it is.
		if (j >= flat.length) break;
		const e = reg[open[3].toLowerCase()];
		const html = e && listed.has(e.name) ? waitMarkup(e, flat.slice(o + 1, j).map((l) => l.replace(new RegExp(`^ {0,${open[1].length}}`), '')).join('\n')) : null;
		if (html !== null) {
			// The opener's own prefix (quote, list marker, indent) carries the wait; the fence's other lines go.
			const q = quote(lines[o]);
			const rest = lines[o].slice(q.length);
			out[o] = q + rest.slice(0, rest.indexOf(open[2])) + html;
			for (let k = o + 1; k <= j; k++) out[k] = GONE;
			// A raw HTML block runs to the next blank line: when text follows the fence at once, the closing line becomes
			// that blank line, inside the same quote.
			if (j + 1 < lines.length && lines[j + 1].slice(quote(lines[j + 1]).length).trim()) out[j] = q.trimEnd();
		}
		// Every fence's body is skipped, so a fence quoted inside another code block is never read as one.
		o = j;
	}
	return out.filter((l) => l !== GONE).join('\n');
}
