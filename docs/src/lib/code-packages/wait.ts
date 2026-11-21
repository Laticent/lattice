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

/** The deck's `plugins:` list, read from its front matter (flow or block form). */
function listedPlugins(source: string): Set<string> {
	const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
	const out = new Set<string>();
	if (!m) return out;
	const flow = /^plugins:\s*\[([^\]]*)\]/m.exec(m[1]);
	if (flow) for (const x of flow[1].split(',')) out.add(x.trim().replace(/^['"]|['"]$/g, ''));
	const block = /^plugins:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m.exec(m[1]);
	if (block) for (const line of block[1].split('\n')) {
		const v = /-\s*(\S+)/.exec(line)?.[1];
		if (v) out.add(v.replace(/^['"]|['"]$/g, ''));
	}
	return out;
}

/**
 * The deck with each block of a plugin it lists, whose fence the registry knows, replaced by its placeholder: what the
 * engine renders BEFORE the door holds the plugins (code-packages/entry.ts, door.ts fast paths). Unchanged for a deck
 * that lists no plugin the registry knows.
 */
export function withWaits(source: string): string {
	const r = registry();
	if (!Object.keys(r).length) return source;
	const listed = listedPlugins(source);
	if (!listed.size) return source;
	const lines = source.split('\n');
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const open = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]+)?/.exec(lines[i]);
		const e = open?.[2] ? r[open[2]] : undefined;
		if (!open || !e || !listed.has(e.name)) {
			out.push(lines[i]);
			continue;
		}
		const fence = open[1];
		let j = i + 1;
		const closes = (line: string) => {
			const t = line.trim();
			return t.length >= fence.length && t === fence[0].repeat(t.length);
		};
		while (j < lines.length && !closes(lines[j])) j++;
		const body = lines.slice(i + 1, j).join('\n');
		const html = waitMarkup(e, body);
		if (html === null) {
			out.push(lines[i]);
			continue;
		}
		out.push('', html, '');
		i = j;
	}
	return out.join('\n');
}
