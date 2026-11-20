// WHAT A PLUGIN BLOCK SHOWS BEFORE ITS DRAWING — the D1 benchmark arms (followups.d/3292-p1-plugin-reload-code-block.md).
//
// On a reload the Studio paints a deck before the plugin's code has loaded: the Library is read from IndexedDB, the door
// chunk loads, and the stamp the previews paint with is committed, each a moment the engine draws a plugin's fence as
// its source. This module holds the four candidate fixes behind ONE switch, so they can be measured on the same build
// (docs/scripts/bench/plugin-wait-bench.mjs). The switch is a localStorage value; absent, nothing here changes a render.
//
//   a      hold: the Studio shell hides the live preview until the block has drawn (StudioShell)
//   b      a quiet reserved box at the block's size
//   c      a chart skeleton at the block's size
//   cplus  the block's afterimage: the geometry of its last drawing in this browser, muted; else c
//
// Placeholders are built from numbers, never from stored markup, so nothing in browser storage reaches a slide as HTML.

export type WaitArm = 'off' | 'a' | 'b' | 'c' | 'cplus';

const ARM_KEY = 'lattice-d1-arm';
const REG_KEY = 'lattice-plugin-waits';
const AFTER_KEY = 'lattice-plugin-afterimages';
const AFTER_MAX = 100;
const BOX_MAX = 150;

let arm: WaitArm | null = null;
/** The arm this page runs, read once. */
export function waitArm(): WaitArm {
	if (arm) return arm;
	let v = '';
	try {
		v = localStorage.getItem(ARM_KEY) || '';
	} catch {}
	arm = v === 'a' || v === 'b' || v === 'c' || v === 'cplus' ? v : 'off';
	return arm;
}
/** True for the arms that draw a placeholder in the block's place. */
export const drawsWait = () => waitArm() === 'b' || waitArm() === 'c' || waitArm() === 'cplus';

type Entry = { name: string; placement: string; aspect?: string; sha: string };
type Reg = Record<string, Entry>;
let reg: Reg | null = null;
function registry(): Reg {
	if (reg) return reg;
	try {
		const v = JSON.parse(localStorage.getItem(REG_KEY) || '{}');
		reg = v && typeof v === 'object' ? (v as Reg) : {};
	} catch {
		reg = {};
	}
	return reg;
}

/** The door's plugins, by fence, kept for the next page load (door.ts `setPlugins`). */
export function rememberWaits(list: { fence: string; name: string; placement?: string; aspect?: string | null; sha256: string }[]): void {
	const next: Reg = {};
	for (const p of list) if (p.fence) next[p.fence] = { name: p.name, placement: p.placement || 'figure', ...(p.aspect ? { aspect: p.aspect } : {}), sha: p.sha256.slice(0, 16) };
	reg = next;
	try {
		localStorage.setItem(REG_KEY, JSON.stringify(next));
	} catch {}
}

const norm = (body: string) => body.replace(/\r\n?/g, '\n').trim();
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

type Shot = { w: number; h: number; b: number[][] };
function afterimages(): Record<string, Shot> {
	try {
		const v = JSON.parse(localStorage.getItem(AFTER_KEY) || '{}');
		return v && typeof v === 'object' ? v : {};
	} catch {
		return {};
	}
}

const MUTED = 'var(--text-muted)';
const n = (v: number) => Math.round(v);

/** The C skeleton: a faint bar chart with a baseline and gridlines, in muted ink, no words. */
function skeleton(): string {
	const H = 400;
	let s = `<svg viewBox="0 0 1000 ${H}" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">`;
	for (const y of [80, 160, 240, 320]) s += `<line x1="40" x2="960" y1="${y}" y2="${y}" style="stroke:${MUTED};opacity:0.18;stroke-width:1"/>`;
	s += `<line x1="40" x2="960" y1="360" y2="360" style="stroke:${MUTED};opacity:0.35;stroke-width:2"/>`;
	[230, 170, 200, 130, 190].forEach((top, i) => {
		s += `<rect x="${70 + i * 180}" y="${top}" width="140" height="${360 - top}" rx="6" style="fill:${MUTED};opacity:0.16"/>`;
	});
	return `${s}</svg>`;
}

/** The C+ afterimage: the boxes of the last drawing, muted; words become rounded bars. */
function afterimage(shot: Shot): string {
	const H = n((1000 * shot.h) / shot.w);
	let s = `<svg viewBox="0 0 1000 ${H}" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">`;
	for (const [x, y, w, h, k] of shot.b) {
		if (k === 0) s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" style="fill:${MUTED};opacity:0.07;stroke:${MUTED};stroke-opacity:0.22"/>`;
		else if (k === 3) s += `<rect x="${x}" y="${n(y + h * 0.22)}" width="${w}" height="${n(h * 0.56)}" rx="${n(h * 0.28)}" style="fill:${MUTED};opacity:0.22"/>`;
		else s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" style="fill:${MUTED};opacity:${k === 2 ? 0.32 : 0.16}"/>`;
	}
	return `${s}</svg>`;
}

/** The placeholder for one block of a plugin the deck lists, or null to leave the block as the engine draws it. */
export function waitMarkup(e: Entry, body: string): string | null {
	const a = waitArm();
	if (a !== 'b' && a !== 'c' && a !== 'cplus') return null;
	if (e.placement === 'chip') return null;
	const [w, h] = (e.aspect && /^\d+\/\d+$/.test(e.aspect) ? e.aspect : '16/9').split('/');
	const box =
		e.placement === 'stage'
			? 'position:relative;flex:1 1 auto;width:100%;min-height:8em;box-sizing:border-box'
			: `position:relative;width:min(100%, calc(30cqi * ${w} / ${h}));aspect-ratio:${w} / ${h};box-sizing:border-box`;
	let inner = '';
	let style = box;
	let shape = 'box';
	if (a === 'b') style += ';border:1px solid var(--border);border-radius:0.6em';
	else if (a === 'c') {
		inner = skeleton();
		shape = 'skeleton';
	} else {
		const shot = afterimages()[waitKey(e.sha, body)];
		inner = shot ? afterimage(shot) : skeleton();
		shape = shot ? 'afterimage' : 'skeleton';
		// An afterimage takes the size the drawing took (its measured width and height), not the placement's box.
		if (shot) style = `position:relative;width:100%;aspect-ratio:${shot.w} / ${shot.h};box-sizing:border-box`;
	}
	const name = e.name.replace(/[^a-z0-9-]/gi, '');
	return `<div data-lattice-plugin-wait="${name}" data-arm="${a}" data-wait-shape="${shape}" data-placement="${e.placement === 'stage' ? 'stage' : 'figure'}" role="img" aria-busy="true" aria-label="${name} is loading" style="${style}">${inner}</div>`;
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
 * engine renders BEFORE the door holds the plugins (code-packages/entry.ts, door.ts fast paths). Unchanged for arms
 * off and a, and for a deck that lists no plugin the registry knows.
 */
export function withWaits(source: string): string {
	if (!drawsWait()) return source;
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

/** Measure each keyed plugin drawing in a painted preview document and keep its boxes (arm cplus only). */
function capture(doc: Document): void {
	const roots = doc.querySelectorAll<HTMLElement>('[data-lattice-wait-key]');
	if (!roots.length) return;
	const all = afterimages();
	let changed = false;
	for (const root of roots) {
		const rr = root.getBoundingClientRect();
		if (rr.width < 8 || rr.height < 8) continue;
		const s = 1000 / rr.width;
		const boxes: number[][] = [];
		const shapes: { box: number[]; lum: number }[] = [];
		const win = doc.defaultView;
		const lumOf = (c: string) => {
			const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(c);
			return m ? (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 : 0.5;
		};
		const rel = (r: DOMRect) => [n((r.left - rr.left) * s), n((r.top - rr.top) * s), Math.max(1, n(r.width * s)), Math.max(1, n(r.height * s))];
		for (const el of root.querySelectorAll('*')) {
			if (boxes.length + shapes.length >= BOX_MAX) break;
			const r = el.getBoundingClientRect();
			if (r.width < 1 || r.height < 1) continue;
			const cs = win?.getComputedStyle(el);
			if (!cs || cs.visibility === 'hidden' || cs.display === 'none') continue;
			const tag = el.tagName.toLowerCase();
			if (['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line'].includes(tag)) {
				shapes.push({ box: rel(r), lum: lumOf(cs.fill !== 'none' ? cs.fill : cs.stroke) });
			} else if (!(el instanceof SVGElement)) {
				const filled = !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
				const bordered = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
				if (filled || bordered) boxes.push([...rel(r), filled ? 1 : 0]);
			}
		}
		// Words: one bar per line of text, from the text nodes' own line boxes.
		const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (let t = walker.nextNode(); t && boxes.length + shapes.length < BOX_MAX; t = walker.nextNode()) {
			if (!t.textContent?.trim()) continue;
			const range = doc.createRange();
			range.selectNodeContents(t);
			for (const r of range.getClientRects()) if (r.width >= 1 && r.height >= 1) boxes.push([...rel(r), 3]);
		}
		// The marks that differ most in tone from the rest (an emphasized bar) keep a step more weight.
		const lums = shapes.map((x) => x.lum).sort((a, b) => a - b);
		const median = lums[lums.length >> 1] ?? 0;
		for (const x of shapes) boxes.push([...x.box, Math.abs(x.lum - median) > 0.15 ? 2 : 1]);
		const key = root.getAttribute('data-lattice-wait-key') as string;
		all[key] = { w: n(rr.width), h: n(rr.height), b: boxes };
		changed = true;
	}
	if (!changed) return;
	const keys = Object.keys(all);
	for (const k of keys.slice(0, Math.max(0, keys.length - AFTER_MAX))) delete all[k];
	try {
		localStorage.setItem(AFTER_KEY, JSON.stringify(all));
	} catch {}
}

const watched = new WeakSet<Document>();
/** Keep the afterimages of a preview document's drawings current while it is shown (single-slide-render onFrameLoad). */
export function watchAfterimages(doc: Document | null | undefined): void {
	if (!doc?.documentElement || waitArm() !== 'cplus' || watched.has(doc)) return;
	watched.add(doc);
	let pending = false;
	const run = () => {
		if (pending) return;
		pending = true;
		const raf = doc.defaultView?.requestAnimationFrame ?? ((f: FrameRequestCallback) => setTimeout(f, 16));
		raf(() =>
			raf(() => {
				pending = false;
				try {
					capture(doc);
				} catch {}
			}),
		);
	};
	run();
	try {
		// The document element, not the body: a patch can replace the body, and an observer on the old one hears nothing.
		new MutationObserver(run).observe(doc.documentElement, { childList: true, subtree: true });
	} catch {}
}

/**
 * Arm a: whether the live preview stays hidden. It holds while the deck lists a plugin and the preview has not painted,
 * the Library has not been read, or the painted document still shows a listed plugin's fence as its source. The shell
 * also lets go after a deadline, so a plugin that never loads cannot hold the preview forever.
 */
export function holdsPreview(doc: Document | null | undefined, source: string, libraryRead: boolean): boolean {
	if (waitArm() !== 'a') return false;
	const listed = listedPlugins(source);
	if (!listed.size) return false;
	if (!doc?.querySelector('section') || !libraryRead) return true;
	const fences = Object.entries(registry())
		.filter(([, e]) => listed.has(e.name))
		.map(([f]) => f.replace(/[^a-z0-9-]/gi, ''));
	return fences.some((f) => !!doc.querySelector(`code.language-${f}`));
}

/**
 * The benchmark's per-frame record, for a browser the harness cannot script before load (Mobile Safari through WebDriver):
 * with `lattice-d1-bench` set, the Studio page records what the live preview shows on each frame into
 * `window.__waitBench`, the shape docs/scripts/bench/plugin-wait-bench.mjs records from outside. Off, it does nothing.
 */
export function benchRecorder(name: string): void {
	try {
		if (window.top !== window || localStorage.getItem('lattice-d1-bench') !== '1') return;
	} catch {
		return;
	}
	const log: { rows: unknown[][]; done: boolean } = { rows: [], done: false };
	(window as unknown as { __waitBench: typeof log }).__waitBench = log;
	let drawnRun = 0;
	const rel = (r: DOMRect, s: DOMRect) => [n(r.left - s.left), n(r.top - s.top), n(r.width), n(r.height)];
	const tick = () => {
		const t = n(performance.now());
		const fr = document.querySelector<HTMLIFrameElement>('[aria-label="Live deck preview"] iframe.live');
		let state = 'blank';
		let block: number[] | null = null;
		let coda: number[] | null = null;
		try {
			const doc = fr?.contentDocument;
			const sec = doc?.querySelector('section');
			if (fr && doc && sec && getComputedStyle(fr).visibility !== 'hidden') {
				const s = sec.getBoundingClientRect();
				const drawn = doc.querySelector(`[data-lattice-plugin="${name}"]`);
				const wait = doc.querySelector('[data-lattice-plugin-wait]');
				const off = doc.querySelector(`[data-lattice-plugin-off="${name}"]`);
				const code = doc.querySelector(`code.language-${name}`);
				let el: Element | null = null;
				if (drawn) {
					const bar = drawn.querySelector('rect');
					const fill = bar && fr.contentWindow ? fr.contentWindow.getComputedStyle(bar).fill : '';
					state = /^rgb\(0, 0, 0\)$|^#000/.test(fill) ? 'bare' : 'drawn';
					el = drawn;
				} else if (wait) {
					state = wait.getAttribute('data-wait-shape') || 'box';
					el = wait;
				} else if (off) {
					state = 'off';
					el = off;
				} else if (code) {
					state = 'source';
					el = code.closest('pre') || code;
				} else state = 'slide';
				block = el ? rel(el.getBoundingClientRect(), s) : null;
				const c = doc.querySelector('.cell-coda');
				coda = c ? rel(c.getBoundingClientRect(), s) : null;
			}
		} catch {}
		log.rows.push([t, state, block, coda]);
		drawnRun = state === 'drawn' ? drawnRun + 1 : 0;
		if (drawnRun >= 30 || t > 20000) log.done = true;
		else requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}
