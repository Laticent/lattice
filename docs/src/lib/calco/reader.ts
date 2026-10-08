/**
 * The reader: a laid-out slide element → editable text frames, and the switch that hides
 * that text so the slide can be photographed without it.
 *
 * SELF-CONTAINED ON PURPOSE. `readSlide` and `restoreSlide` close over nothing: no import,
 * no module-level constant, every helper inside. A headless browser receives them as
 * source (`elementHandle.evaluate(readSlide)` serializes `fn.toString()`), so a free
 * variable would be undefined in the page. test/unit/calco/serialization.test.js runs the
 * built functions through `new Function` to hold this.
 *
 * WHAT IS READ. Every visible text node in the HTML part of the slide, one WORD at a time
 * with the box the browser gave it, grouped into paragraphs (the nearest block ancestor)
 * and lines (a word that starts left of the previous one and lower opens a line). Each
 * word carries the style it was drawn in: the font the browser actually used, its weight,
 * slant, size, color and opacity, letter-spacing, transform and decoration.
 *
 * WHAT IS LEFT IN THE PICTURE, deliberately: SVG and MathML (a chart or an equation is a
 * drawing, and its labels stay in it); pseudo-element text (`::before`/`::after` content,
 * list markers, slide numbers); rotated or vertical text; text drawn transparent with a
 * background behind it (gradient text); and anything clipped off the slide. A reader that
 * cannot place a word faithfully leaves it where the picture already has it.
 *
 * HOW TEXT IS HIDDEN (`hide: true`). Not with `color: transparent` alone: a code pill whose
 * background is `color-mix(in srgb, currentColor 10%, transparent)` would lose its pill,
 * an SVG icon with `fill: currentColor` would vanish, and a slide number drawn by
 * `::after` would go with its parent's text. So the reader first FREEZES every color that
 * hangs off `currentColor` — on each element, on its pseudo-elements, and at every SVG
 * root — to the value the browser already resolved, and only then turns the text
 * transparent. Freezing is plain inline style plus one stylesheet, so it survives any
 * capture that copies computed style (a headless screenshot, html-to-image). Everything
 * is undone by `restoreSlide`.
 *
 * SHAPES (`shapes: true`). Plain boxes and rules are lifted too, as native shapes: a box
 * with a solid fill, solid borders, round corners and at most one outer shadow, unless it
 * would cover something the picture keeps above it. Their paint is hidden with the text and
 * restored with it. See the SHAPES block below and
 * engineering/decisions/2026-10-07-calco-native-shapes.md §7.
 */
import type { Paint, Shadow, Shape, TextFrame, TextRun, TextStyle } from './types.js';

/** What `readSlide` returns. */
export interface ReadResult {
	width: number;
	height: number;
	frames: TextFrame[];
	/** Boxes and rules lifted out of the picture, back to front. Empty unless `shapes` was asked for. */
	shapes: Shape[];
	/** True when the slide's read text (and lifted shapes) is now hidden (call `restoreSlide` after capture). */
	hidden: boolean;
}

export interface ReadOptions {
	/** Hide the text that was read, for a text-free background capture. Default false. */
	hide?: boolean;
	/**
	 * Also lift plain boxes and rules out of the picture as native shapes (see SHAPES below).
	 * With `hide`, their paint is hidden too. Default false.
	 */
	shapes?: boolean;
}

/**
 * Read one slide. `section` must be laid out and visible (its fonts loaded).
 */
export function readSlide(section: HTMLElement, options?: ReadOptions): ReadResult {
	const doc = section.ownerDocument;
	const win = doc.defaultView as Window & typeof globalThis;
	const boxW = section.offsetWidth;
	const boxH = section.offsetHeight;
	const origin = section.getBoundingClientRect();
	// A fit-to-viewport transform scales the slide; client rects are in that scaled space.
	const scale = boxW > 0 && origin.width > 0 ? origin.width / boxW : 1;
	const SKIP = new Set(['script', 'style', 'noscript', 'template', 'title', 'head', 'svg', 'math', 'canvas', 'video', 'audio', 'iframe', 'object', 'img', 'textarea', 'input', 'select', 'button']);
	const INLINE = /^(inline|inline-block|inline-flex|inline-grid|contents|ruby|ruby-text)$/;

	// ── color: any CSS color → { hex, alpha }, via a 1px canvas (handles oklch, color(),
	// color-mix and every named color the browser knows).
	const canvas = doc.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
	const parseColor = (css: string): { r: number; g: number; b: number; a: number } | null => {
		if (!ctx || !css) return null;
		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = '#000';
		ctx.fillStyle = css;
		// The fill is the color at its own alpha; read it back un-premultiplied.
		ctx.fillRect(0, 0, 1, 1);
		const d = ctx.getImageData(0, 0, 1, 1).data;
		if (d[3] === 0) return { r: 0, g: 0, b: 0, a: 0 };
		return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
	};
	const hex = (c: { r: number; g: number; b: number }) =>
		`#${[c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

	// ── the width a string takes in a style (letter-spacing included), for gap arithmetic.
	const advance = (text: string, s: TextStyle): number => {
		if (!ctx) return 0;
		// A generic family is a keyword: quoted, it names a font nobody has.
		const fam = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+)$/.test(s.family) ? s.family : `"${s.family}"`;
		ctx.font = `${s.italic ? 'italic ' : ''}${s.weight} ${s.size}px ${fam}`;
		return ctx.measureText(text).width + s.letterSpacing * text.length;
	};

	// ── the font the browser actually drew with: the first family in the stack that is
	// either a LOADED web font or an installed system font.
	const familyCache = new Map<string, string>();
	const installed = (family: string): boolean => {
		if (!ctx) return false;
		const probe = 'mmmmmmmmmmlli1WQ@';
		for (const generic of ['monospace', 'serif']) {
			ctx.font = `72px ${generic}`;
			const base = ctx.measureText(probe).width;
			ctx.font = `72px "${family}", ${generic}`;
			if (ctx.measureText(probe).width !== base) return true;
		}
		return false;
	};
	const usedFamily = (stack: string): string => {
		const hit = familyCache.get(stack);
		if (hit) return hit;
		const families = stack.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
		const loaded = new Set<string>();
		doc.fonts.forEach((f) => {
			if (f.status === 'loaded') loaded.add(f.family.replace(/^["']|["']$/g, ''));
		});
		// Nothing in the stack is available: the browser drew its default, which is the last
		// generic in the stack, or serif when there is none. Never a name nothing has.
		const generic = [...families].reverse().find((f) => /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(f));
		let pick = generic || 'serif';
		for (const f of families) {
			if (loaded.has(f) || /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+)$/.test(f) || installed(f)) {
				pick = f;
				break;
			}
		}
		familyCache.set(stack, pick);
		return pick;
	};

	// ── rotation/skew on the element or any ancestor up to the slide: such text cannot be
	// placed as an upright box, so it stays in the picture.
	const tiltCache = new Map<Element, boolean>();
	const tilted = (el: Element | null): boolean => {
		if (!el || el === section) return false;
		const hit = tiltCache.get(el);
		if (hit !== undefined) return hit;
		const tcs = win.getComputedStyle(el);
		const t = tcs.transform;
		// The individual `rotate` property turns text without touching `transform`.
		const rot = (tcs as unknown as Record<string, string>).rotate;
		let v = !!rot && rot !== 'none' && !/^0(deg|rad|turn)?$/.test(rot);
		if (t && t !== 'none') {
			const m = t.match(/matrix(3d)?\(([^)]+)\)/);
			if (m) {
				const n = m[2].split(',').map(Number);
				const [b, c] = m[1] ? [n[1], n[4]] : [n[1], n[2]];
				v = Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6;
			}
		}
		v = v || tilted(el.parentElement);
		tiltCache.set(el, v);
		return v;
	};

	// ── the nearest block that owns an element's inline content.
	const blockOf = (el: Element): Element => {
		let b: Element = el;
		while (b !== section && b.parentElement) {
			const cs = win.getComputedStyle(b);
			if (!INLINE.test(cs.display) || cs.position === 'absolute' || cs.position === 'fixed' || cs.cssFloat !== 'none') break;
			b = b.parentElement;
		}
		return b;
	};

	// ── the color text appears as over the nearest opaque, image-free background.
	// `overGradient`: a gradient layer counts as its background color. Only letter-spaced
	// text asks for that, because LibreOffice clips letter-spaced text drawn with opacity
	// (its last letters vanish), so a near color beats a lost word. A url() image never does.
	const flatten = (el: Element, c: { r: number; g: number; b: number; a: number }, overGradient = false): string | undefined => {
		for (let p: Element | null = el; p; p = p.parentElement) {
			const cs = win.getComputedStyle(p);
			const image = cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : '';
			if (image && (!overGradient || /url\(/i.test(image))) return undefined;
			const bg = parseColor(cs.backgroundColor);
			if (!bg || bg.a === 0) {
				if (p === section || image) return undefined;
				continue;
			}
			if (bg.a < 1) return undefined;
			return hex({ r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a) });
		}
		return undefined;
	};

	interface Word {
		node: Text;
		x: number;
		y: number;
		w: number;
		h: number;
		text: string;
		lead: boolean;
		/** The lead space is the trailing space of the PREVIOUS text node, drawn in its font. */
		leadFromPrev?: boolean;
		/** Preformatted: the word carries its own spaces and never gets a separator. */
		pre: boolean;
		/** Offsets in `node`, to measure the word again after hiding. */
		start: number;
		end: number;
		style: TextStyle;
	}
	const blocks = new Map<Element, Word[]>();
	const range = doc.createRange();
	const sectionRect = { left: origin.left, top: origin.top, right: origin.right, bottom: origin.bottom };
	type Clip = { left: number; top: number; right: number; bottom: number };
	const intersect = (a: Clip, b: Clip): Clip | null => {
		const r = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
		return r.right > r.left && r.bottom > r.top ? r : null;
	};

	const isPre = (cs: CSSStyleDeclaration) =>
		/^pre/.test(cs.whiteSpace) || /^(preserve|break-spaces)/.test((cs as unknown as Record<string, string>).whiteSpaceCollapse || '');

	// A block the reader cannot reproduce faithfully stays in the picture whole: a word cut
	// by a clip (an ellipsized footer shows `--mut…`, and a text box would show the word).
	const unplaceable = new Set<Element>();
	const owners = new Map<Element, Set<Element>>();
	// A whitespace-only text node between two inline elements (`<b>a</b> <i>b</i>`) is the
	// space between their words. It carries no word of its own, so it is remembered here and
	// given to the next word read in the same block.
	const pendingSpace = new Set<Element>();

	const emit = (node: Text, el: Element, cs: CSSStyleDeclaration, opacity: number, clip: Clip) => {
		if (tilted(el) || !/^horizontal/.test(cs.writingMode || 'horizontal-tb')) return;
		// Stroked text: the stroke would stay in the picture under the box's text.
		if (Number.parseFloat((cs as unknown as Record<string, string>).webkitTextStrokeWidth || '0') > 0) return;
		const c = parseColor(cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color);
		if (!c || c.a === 0) return; // transparent text (gradient text, already hidden) stays put
		// Two decimals: the canvas reads alpha back as a byte, so 0.5 returns as 128/255.
		const alpha = Math.round(c.a * opacity * 100) / 100;
		const spaced = cs.letterSpacing !== 'normal' && Number.parseFloat(cs.letterSpacing) !== 0;
		const flat = alpha < 1 ? flatten(el, { ...c, a: alpha }, spaced) : undefined;
		const style: TextStyle = {
			family: usedFamily(cs.fontFamily),
			weight: Number(cs.fontWeight) || 400,
			italic: cs.fontStyle !== 'normal',
			size: Number.parseFloat(cs.fontSize) || 16,
			color: hex(c),
			alpha,
			letterSpacing: cs.letterSpacing === 'normal' ? 0 : Number.parseFloat(cs.letterSpacing) || 0,
			transform: cs.textTransform || 'none',
			underline: (cs.textDecorationLine || '').includes('underline'),
			strike: (cs.textDecorationLine || '').includes('line-through'),
			// Chrome draws letter-spaced text without ligatures (CSS Text 3 §8.2), so an "fi"
			// in a tracked heading is two letters, and the office file must not join them.
			ligatures: cs.fontVariantLigatures !== 'none' && !(cs.letterSpacing !== 'normal' && Number.parseFloat(cs.letterSpacing) !== 0),
		};
		const caps = cs.fontVariantCaps || '';
		if (caps === 'small-caps' || caps === 'all-small-caps' || /small-caps/.test(cs.fontVariant || '')) style.smallCaps = true;
		if (flat) style.flatColor = flat;
		const pre = isPre(cs);
		const value = node.nodeValue || '';
		// Preformatted text is cut into words WITH their trailing spaces (and runs of
		// indentation on their own), so a soft wrap still falls between two tokens and every
		// space survives exactly.
		const re = pre ? /[^\S\n]+|\S+[^\S\n]*/g : /\S+/g;
		const block = blockOf(el);
		let list = blocks.get(block);
		const words: Word[] = [];
		let m: RegExpExecArray | null;
		while ((m = re.exec(value))) {
			range.setStart(node, m.index);
			range.setEnd(node, m.index + m[0].length);
			const rects = range.getClientRects();
			if (!rects.length) continue;
			const r = rects[0];
			if (!(r.width > 0 && r.height > 0)) continue;
			// A word broken across two lines (overflow-wrap, hyphenation) cannot be one run in a
			// box whose lines are fixed: the paragraph stays in the picture.
			for (let k = 1; k < rects.length; k++) if (Math.abs(rects[k].top - r.top) > r.height / 2) unplaceable.add(block);
			const seen = intersect(clip, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
			if (!seen) continue;
			// Cut by the clip: not reproducible as a box. Horizontally a pixel of tolerance;
			// vertically a quarter of the glyph box, because the box is the font's whole ascent
			// + descent, taller than the ink and the line, and overhangs a clipping cell that
			// shows every glyph whole.
			const slackY = r.height / 4;
			if (seen.left > r.left + 1 || seen.right < r.right - 1 || seen.top > r.top + slackY || seen.bottom < r.bottom - slackY) unplaceable.add(block);
			const before = m.index > 0 ? value[m.index - 1] : '';
			const lead = pre ? false : (m.index === 0 ? /^\s/.test(value) : /\s/.test(before)) || (!words.length && pendingSpace.has(block));
			if (!words.length) pendingSpace.delete(block);
			words.push({
				node,
				text: m[0],
				lead,
				pre,
				start: m.index,
				end: m.index + m[0].length,
				x: (r.left - origin.left) / scale,
				y: (r.top - origin.top) / scale,
				w: r.width / scale,
				h: r.height / scale,
				style,
			});
		}
		if (!words.length) return;
		if (!list) {
			list = [];
			blocks.set(block, list);
		}
		list.push(...words);
		let set = owners.get(block);
		if (!set) {
			set = new Set();
			owners.set(block, set);
		}
		set.add(el);
		// An ellipsized element hides part of its text behind the `…` it draws.
		if (cs.textOverflow === 'ellipsis' && (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1) unplaceable.add(block);
	};

	const visit = (el: Element, opacity: number, clip: Clip) => {
		const cs = win.getComputedStyle(el);
		if (cs.display === 'none') return;
		const op = opacity * (Number.parseFloat(cs.opacity) || (cs.opacity === '0' ? 0 : 1));
		if (op <= 0) return;
		// Screen-reader-only text (the 1px clipped box) is not ink on the slide.
		const tiny = el.getBoundingClientRect();
		if (cs.overflow === 'hidden' && tiny.width <= 1 && tiny.height <= 1) return;
		// Effects that change how the text LOOKS beyond what a text box can carry — a filter,
		// a mask, a clip shape — or that can hide it outright: the subtree stays in the picture.
		// (A text box would draw readable text the slide never showed.)
		const fx = cs as unknown as Record<string, string>;
		if ((cs.filter && cs.filter !== 'none') || (fx.maskImage && fx.maskImage !== 'none') || (fx.webkitMaskImage && fx.webkitMaskImage !== 'none') || (cs.clip && cs.clip !== 'auto') || (cs.clipPath && cs.clipPath !== 'none')) return;
		const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
		const inner = clips ? intersect(clip, { left: tiny.left, top: tiny.top, right: tiny.right, bottom: tiny.bottom }) : clip;
		if (!inner) return;
		const shown = cs.visibility === 'visible';
		for (let child = el.firstChild; child; child = child.nextSibling) {
			if (child.nodeType === 1) {
				if (!SKIP.has(String((child as Element).localName).toLowerCase())) visit(child as Element, op, inner);
			} else if (child.nodeType === 3 && shown && (/\S/.test(child.nodeValue || '') || (isPre(cs) && /[^\n]/.test(child.nodeValue || '')))) {
				// In code, the spaces between two highlighted tokens are a text node of their own.
				emit(child as Text, el, cs, op, inner);
			} else if (child.nodeType === 3 && shown && /\s/.test(child.nodeValue || '')) {
				pendingSpace.add(blockOf(el));
			}
		}
	};
	visit(section, 1, sectionRect);
	range.detach();

	// ── words → lines → frames. An unplaceable block is dropped, and its text is not hidden.
	const frames: TextFrame[] = [];
	const frameBlocks: Element[] = [];
	const textOwners = new Set<Element>();
	const kept: Word[] = [];
	for (const [block, words] of blocks) {
		if (unplaceable.has(block)) continue;
		kept.push(...words);
		for (const el of owners.get(block) || []) textOwners.add(el);
		const bcs = win.getComputedStyle(block);
		const rtl = bcs.direction === 'rtl';
		const lines: Word[][] = [];
		let prev: Word | null = null;
		for (const w of words) {
			// A new line: lower, AND back toward the line start (left in LTR, right in RTL).
			// "Lower" alone would split a line whose words differ in size.
			const lower = !!prev && w.y > prev.y + prev.h * 0.5;
			const back = !!prev && (rtl ? w.x + w.w > prev.x + 1 : w.x < prev.x + prev.w - 1);
			if (!prev || (lower && back)) lines.push([]);
			else if (!w.pre && !w.lead && prev.node !== w.node && /\s$/.test(prev.node.nodeValue || '')) {
				w.lead = true;
				w.leadFromPrev = true;
			}
			lines[lines.length - 1].push(w);
			prev = w;
		}
		const left = Math.min(...words.map((w) => w.x));
		const right = Math.max(...words.map((w) => w.x + w.w));
		const firstTop = Math.min(...lines[0].map((w) => w.y));
		const firstH = Math.max(...lines[0].map((w) => w.h));
		const last = lines[lines.length - 1];
		const lastTop = Math.min(...last.map((w) => w.y));
		const bottom = Math.max(...last.map((w) => w.y + w.h));
		const br = block.getBoundingClientRect();
		const padL = Number.parseFloat(bcs.paddingLeft) || 0;
		const padR = Number.parseFloat(bcs.paddingRight) || 0;
		const bordL = Number.parseFloat(bcs.borderLeftWidth) || 0;
		const bordR = Number.parseFloat(bcs.borderRightWidth) || 0;
		let x = (br.left - origin.left) / scale + padL + bordL;
		let w = br.width / scale - padL - padR - bordL - bordR;
		// Words outside the block's column (an overflowing line, a shrink-wrapped flex item)
		// hug the words instead.
		if (!(w > 0) || left < x - 2 || right > x + w + 2) {
			x = left;
			w = right - left;
		}
		let align: TextFrame['align'] = 'left';
		const ta = bcs.textAlign;
		if (ta === 'center' || ta === '-webkit-center') align = 'center';
		else if (ta === 'right' || ta === '-webkit-right' || (ta === 'end' && !rtl) || (ta === 'start' && rtl)) align = 'right';
		// A left-aligned box starts where its earliest line starts. A line that starts later
		// (pushed right by a `::before` marker or counter, which stays in the picture) gets a
		// spacer of the difference below, so its words never land on the marker.
		if (align === 'left') {
			const start = Math.min(...lines.filter((l) => l.length).map((l) => l[0].x));
			if (start > x + 1) {
				w -= start - x;
				x = start;
			}
		}
		// A centered box is centered on its TEXT, not on its block. An icon or marker drawn by
		// `::before` / `::after` (which stays in the picture) takes room on one side, so the
		// words sit off the block's middle; centering them on the block in the office file
		// slides them under the icon (measured: verdict pills, "peed" under a check mark).
		// When every line shares one center, the box is narrowed around that center.
		if (align === 'center') {
			const centers = lines.filter((l) => l.length).map((l) => (Math.min(...l.map((wd) => wd.x)) + Math.max(...l.map((wd) => wd.x + wd.w))) / 2);
			const c = centers.reduce((a, b) => a + b, 0) / centers.length;
			if (centers.every((v) => Math.abs(v - c) <= 1) && Math.abs(c - (x + w / 2)) > 1) {
				const half = Math.min(c - x, x + w - c);
				x = c - half;
				w = 2 * half;
			}
		}
		// A right-aligned box ends where its lines end, for the same reason on the other side.
		if (align === 'right' && !rtl) {
			const end = Math.max(...lines.filter((l) => l.length).map((l) => Math.max(...l.map((wd) => wd.x + wd.w))));
			if (end < x + w - 1) w = end - x;
		}
		// The line pitch is the SMALLEST step between two lines; a step of several pitches is
		// blank lines (an empty line in code has no word to read), which go back in as empty
		// lines so everything after them keeps its place.
		const tops = lines.map((l) => Math.min(...l.map((wd) => wd.y)));
		const steps = tops.slice(1).map((t, k) => t - tops[k]).filter((d) => d > firstH * 0.5);
		// Only preformatted text has blank lines, and its line height is uniform, so its own
		// computed line-height is a pitch even when no two lines sit one step apart. (Prose is
		// not given this: an inline child can make a line taller than the block's line-height.)
		const declared = Number.parseFloat(bcs.lineHeight);
		const preformatted = words.some((wd) => wd.pre);
		if (preformatted && declared > firstH * 0.5) steps.push(declared);
		const lineHeight = steps.length ? Math.min(...steps) : lines.length > 1 ? (lastTop - firstTop) / (lines.length - 1) : firstH;
		// A tall inline in prose makes an uneven step, not a blank line: only code gets them.
		for (let k = lines.length - 1; preformatted && k > 0; k--) {
			const blanks = Math.round((tops[k] - tops[k - 1]) / lineHeight) - 1;
			if (blanks > 0 && blanks < 50) lines.splice(k, 0, ...Array.from({ length: blanks }, () => [] as Word[]));
		}
		frameBlocks.push(block);
		frames.push({
			x,
			y: firstTop,
			w,
			h: bottom - firstTop,
			firstLineHeight: firstH,
			lineHeight,
			align,
			lines: lines.map((line) => {
				const runs: TextRun[] = [];
				// One undecorated copy per style, so consecutive spaces merge into one run.
				const plain = new Map<TextStyle, TextStyle>();
				const plainOf = (st: TextStyle) => {
					let hit = plain.get(st);
					if (!hit) plain.set(st, (hit = { ...st, underline: false, strike: false }));
					return hit;
				};
				const push = (text: string, style: TextStyle) => {
					const tail = runs[runs.length - 1];
					if (tail && tail.style === style) tail.text += text;
					else runs.push({ text, style });
				};
				// A spacer: a no-break space at 2px whose letter-spacing is the gap. It is how a
				// box with no inline padding reproduces the room a padded pill or a marker took.
				const spacer = (px: number, like: TextStyle) => {
					const width = px - advance(' ', { ...like, size: 2, letterSpacing: 0 });
					if (width > 0) runs.push({ text: '\u00A0', style: { ...like, size: 2, letterSpacing: width, underline: false, strike: false, transform: 'none' } });
				};
				// Below this a gap is kerning or rounding, not room something else took. Where the
				// style changes (a padded code chip, a pill), the padding is often smaller than
				// that, so the bar there is a pixel.
				const minGap = (s: TextStyle, boundary = false) => (boundary ? 1 : Math.max(2, 0.15 * s.size));
				if (!line.length) return runs;
				if (align === 'left' && line[0].x - x > minGap(line[0].style)) spacer(line[0].x - x, line[0].style);
				line.forEach((word, i) => {
					if (i) {
						const before = line[i - 1];
						// The separator is drawn in the font of the text node it came from: a space
						// that starts " now render" is the body font, not the code chip's before it
						// (a monospace space is twice as wide: "roadmap  now"). It never carries an
						// underline or strike, so a link is not underlined under its outer space.
						const sep = word.lead ? ' ' : '';
						const from = word.leadFromPrev ? before.style : word.style;
						const sepStyle = from.underline || from.strike ? plainOf(from) : from;
						if (sep) push(sep, sepStyle);
						const expected = sep ? advance(' ', sepStyle) : 0;
						const gap = rtl ? before.x - (word.x + word.w) : word.x - (before.x + before.w);
						if (gap - expected > minGap(word.style, before.style !== word.style)) spacer(gap - expected, word.style);
					}
					push(word.text, word.style);
				});
				return runs;
			}),
		});
	}

	// ── SHAPES (`shapes: true`). A box whose paint an office shape can carry exactly — a solid
	// fill, solid borders, circular corners, one outer shadow — is lifted out of the picture:
	// read here, hidden below with the text, drawn by the writer as a native shape. A border
	// that differs from its box's outline is a rule: a line along the middle of its band.
	// Design: engineering/decisions/2026-10-07-calco-native-shapes.md.
	//
	// The rule that decides everything: a shape is drawn OVER the picture, so it may not
	// cover anything the picture still holds that the slide painted above it. Text that was
	// not read, an icon, a chart, a `::before` tag or a list marker inside a card would be
	// covered by the card's fill — and if the card were moved, would stay behind as a ghost.
	// So a box that overlaps picture content painted above it stays in the picture, and that
	// refusal is itself picture content, which can refuse the box around it in turn.
	const shapes: Shape[] = [];
	const shapeEls: Element[] = [];
	if (options?.shapes) {
		const keptNodes = new Set<Node>(kept.map((wd) => wd.node));
		const px = (v: string) => Number.parseFloat(v) || 0;
		// A color as the page wrote it. rgb() and color(srgb) are read from the string: the
		// canvas returns a faint color (a 4% row wash) premultiplied to a byte, which moves its hue.
		const paintOf = (css: string, opacity: number): Paint | null => {
			const m = css.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/) || css.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/);
			let c: { r: number; g: number; b: number; a: number } | null;
			if (m) {
				const k = css.startsWith('color(') ? 255 : 1;
				c = { r: Number(m[1]) * k, g: Number(m[2]) * k, b: Number(m[3]) * k, a: m[4] === undefined ? 1 : Number(m[4]) };
			} else c = parseColor(css);
			if (!c || !(c.a > 0)) return null;
			const alpha = Math.round(c.a * opacity * 1000) / 1000;
			return alpha > 0 ? { color: hex(c), alpha } : null;
		};
		const opacityCache = new Map<Element, number>();
		const opacityOf = (el: Element): number => {
			const hit = opacityCache.get(el);
			if (hit !== undefined) return hit;
			const v = el === section || !el.parentElement ? 1 : opacityOf(el.parentElement) * Number.parseFloat(win.getComputedStyle(el).opacity || '1');
			opacityCache.set(el, v);
			return v;
		};
		// Anything that changes how a subtree LOOKS beyond its boxes — a transform, a filter, a
		// mask, a clip, a blend — keeps every box in it in the picture.
		const fxCache = new Map<Element, boolean>();
		const effected = (el: Element | null): boolean => {
			if (!el || el === section) return false;
			const hit = fxCache.get(el);
			if (hit !== undefined) return hit;
			const cs = win.getComputedStyle(el) as CSSStyleDeclaration & Record<string, string>;
			const set = (v: string | undefined) => !!v && v !== 'none' && v !== 'auto' && v !== 'normal';
			const v =
				set(cs.transform) || set(cs.rotate) || set(cs.scale) || set(cs.translate) || set(cs.filter) || set(cs.backdropFilter) || set(cs.webkitBackdropFilter) ||
				set(cs.maskImage) || set(cs.webkitMaskImage) || set(cs.clipPath) || (cs.clip !== '' && set(cs.clip)) || set(cs.mixBlendMode) || effected(el.parentElement);
			fxCache.set(el, v);
			return v;
		};
		// Painting LEVEL, the part of CSS's stacking order that matters here: under the flow
		// (negative z-index), the flow, positioned, then above by z-index.
		// Measured from `stop` down: two things are only ordered by the stacking contexts BELOW
		// their common ancestor (a static child under an absolute `::before` of its parent is
		// in the flow there, whatever positions the parent).
		const levelOf = (el: Element, stop: Element = section): number => {
			let level = 1;
			for (let p: Element | null = el; p && p !== section && p !== stop; p = p.parentElement) {
				const cs = win.getComputedStyle(p) as CSSStyleDeclaration & Record<string, string>;
				const parent = p.parentElement ? win.getComputedStyle(p.parentElement).display : '';
				// A flex or grid item takes z-index without being positioned; and opacity, a
				// transform, a filter, a mask, a clip, a blend or isolation make a stacking context
				// that paints with the positioned boxes, in tree order.
				const zStatic = cs.zIndex !== 'auto' && /flex|grid/.test(parent);
				const layer =
					Number.parseFloat(cs.opacity || '1') < 1 ||
					['transform', 'filter', 'maskImage', 'webkitMaskImage', 'clipPath'].some((k) => cs[k] && cs[k] !== 'none') ||
					(cs.mixBlendMode && cs.mixBlendMode !== 'normal') ||
					cs.isolation === 'isolate';
				if (cs.position === 'static' && !zStatic && !layer) continue;
				const z = cs.zIndex === 'auto' || (cs.position === 'static' && !zStatic) ? Number.NaN : Number(cs.zIndex);
				level = Number.isNaN(z) ? Math.max(level, 2) : z < 0 ? -1 : 2 + z;
			}
			return level;
		};
		const commonAncestor = (a: Element, b: Element): Element => {
			let c: Element | null = a;
			while (c && !c.contains(b)) c = c.parentElement;
			return c || section;
		};
		type Rect = { x: number; y: number; w: number; h: number };
		const relRect = (r: { left: number; top: number; width: number; height: number }): Rect => ({ x: (r.left - origin.left) / scale, y: (r.top - origin.top) / scale, w: r.width / scale, h: r.height / scale });
		const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
		// Inside every box that clips it, and on the slide: a clipped box is not a shape.
		const unclipped = (el: Element, r: Rect): boolean => {
			if (r.x < -0.5 || r.y < -0.5 || r.x + r.w > boxW + 0.5 || r.y + r.h > boxH + 0.5) return false;
			for (let p = el.parentElement; p && p !== section; p = p.parentElement) {
				const cs = win.getComputedStyle(p);
				if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
				const c = relRect(p.getBoundingClientRect());
				if (r.x < c.x - 0.5 || r.y < c.y - 0.5 || r.x + r.w > c.x + c.w + 0.5 || r.y + r.h > c.y + c.h + 0.5) return false;
			}
			return true;
		};

		// What the picture keeps, with where it sits in paint order. `node` orders it in the
		// tree; `pseudo` marks a `::before` (painted as a first child) or `::after` (a last one).
		interface Item {
			node: Node;
			owner: Element;
			rect: Rect;
			pseudo?: 'before' | 'after';
			text?: boolean;
			/** The box this item IS, when it is a box that was refused. */
			paintOf?: Element;
		}
		const items: Item[] = [];
		interface Candidate {
			el: Element;
			rect: Rect;
			alpha: number;
			fill: Paint | null;
			radii: [number, number, number, number];
			sides: Array<(Paint & { width: number }) | null>;
			shadow: Shadow | null;
			/** Fill, outline or shadow: the box covers its area, not just its edges. */
			covers: boolean;
		}
		const candidates: Candidate[] = [];
		const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;
		const CORNERS = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const;
		const splitTop = (v: string) => {
			const out: string[] = [];
			let depth = 0;
			let cur = '';
			for (const ch of v) {
				if (ch === '(') depth++;
				if (ch === ')') depth--;
				if (ch === ',' && !depth) {
					out.push(cur.trim());
					cur = '';
				} else cur += ch;
			}
			if (cur.trim()) out.push(cur.trim());
			return out;
		};
		// One outer shadow an office suite can draw: the visible layer with the widest blur. An
		// inset ring (no offset, no blur, a spread) is a border drawn inside the edge, which is
		// how a tag outlines itself without moving its text: it comes back as `ring`. `false`
		// when a layer is neither (an inner glow, an outer spread).
		const shadowOf = (v: string, opacity: number): { outer: Shadow | null; ring: (Paint & { width: number }) | null } | false => {
			const out: { outer: Shadow | null; ring: (Paint & { width: number }) | null } = { outer: null, ring: null };
			if (!v || v === 'none') return out;
			for (const layer of splitTop(v)) {
				const color = layer.match(/^((?:rgba?|color|oklab|oklch|lab|lch|hsla?|hwb)\([^)]*\)|#[0-9a-f]+|[a-z]+)\s*/i);
				const rest = (color ? layer.slice(color[0].length) : layer).trim();
				const paint = paintOf(color ? color[1] : 'currentcolor', opacity);
				if (!paint) continue;
				const [x, y, blur, spread] = rest.replace(/\binset\b/, '').trim().split(/\s+/).map(px);
				if (/\binset\b/.test(rest)) {
					if (x || y || blur || !(spread > 0) || out.ring) return false;
					out.ring = { ...paint, width: spread };
					continue;
				}
				if (spread) return false;
				// Two outer layers (a tight shadow under a soft one) are not one office shadow.
				if (out.outer) return false;
				out.outer = { ...paint, x, y, blur };
			}
			return out;
		};
		// Where a pseudo-element paints: its own box when it is absolutely placed in its
		// element (a corner tag, an icon), else the element's box.
		const pseudoRect = (el: Element, which: '::before' | '::after', box: Rect): Rect => {
			const ps = win.getComputedStyle(el, which);
			const ecs = win.getComputedStyle(el);
			if (ps.position !== 'absolute' || ecs.position === 'static') return box;
			const n = [ps.left, ps.top, ps.width, ps.height].map((v) => (/px$/.test(v) ? Number.parseFloat(v) : Number.NaN));
			if (n.some((v) => Number.isNaN(v))) return box;
			const extra = ps.boxSizing === 'border-box' ? [0, 0] : [px(ps.paddingLeft) + px(ps.paddingRight) + px(ps.borderLeftWidth) + px(ps.borderRightWidth), px(ps.paddingTop) + px(ps.paddingBottom) + px(ps.borderTopWidth) + px(ps.borderBottomWidth)];
			return { x: box.x + px(ecs.borderLeftWidth) + n[0], y: box.y + px(ecs.borderTopWidth) + n[1], w: n[2] + extra[0], h: n[3] + extra[1] };
		};
		const pseudoPaints = (el: Element, which: '::before' | '::after'): boolean => {
			const ps = win.getComputedStyle(el, which) as CSSStyleDeclaration & Record<string, string>;
			const content = ps.content;
			if (!content || content === 'none' || content === 'normal' || ps.display === 'none') return false;
			if (content !== '""' && content !== "''" && paintOf(ps.color, 1)) return true;
			if (paintOf(ps.backgroundColor, 1) || ps.backgroundImage !== 'none' || (ps.boxShadow && ps.boxShadow !== 'none')) return true;
			if ((ps.maskImage && ps.maskImage !== 'none') || (ps.webkitMaskImage && ps.webkitMaskImage !== 'none')) return true;
			return SIDES.some((sd) => px(ps[`border${sd}Width`]) > 0 && ps[`border${sd}Style`] !== 'none' && !!paintOf(ps[`border${sd}Color`], 1));
		};

		const DRAWN = new Set(['svg', 'math', 'img', 'canvas', 'video', 'iframe', 'object', 'embed', 'input', 'select', 'textarea', 'button', 'picture']);
		const walk = (el: Element) => {
			const cs = win.getComputedStyle(el) as CSSStyleDeclaration & Record<string, string>;
			if (cs.display === 'none') return;
			const tag = String(el.localName).toLowerCase();
			const shown = cs.visibility === 'visible' && opacityOf(el) > 0;
			const rect = relRect(el.getBoundingClientRect());
			if (el !== section && DRAWN.has(tag)) {
				if (shown && rect.w > 0 && rect.h > 0) items.push({ node: el, owner: el, rect });
				return;
			}
			if (el !== section && shown) {
				for (const which of ['::before', '::after'] as const) {
					if (pseudoPaints(el, which)) items.push({ node: el, owner: el, rect: pseudoRect(el, which, rect), pseudo: which === '::before' ? 'before' : 'after' });
				}
				if (cs.display === 'list-item' && (cs.listStyleType !== 'none' || cs.listStyleImage !== 'none')) {
					const em = px(cs.fontSize) * 2;
					items.push({ node: el, owner: el, rect: { x: rect.x - em, y: rect.y, w: rect.w + em, h: rect.h }, pseudo: 'before' });
				}
				const op = opacityOf(el);
				const fill = paintOf(cs.backgroundColor, op);
				let sides = SIDES.map((sd) => {
					const width = px(cs[`border${sd}Width`]);
					const st = cs[`border${sd}Style`];
					if (!(width > 0) || st === 'none' || st === 'hidden') return null;
					const p = paintOf(cs[`border${sd}Color`], op);
					return p ? { ...p, width, style: st } : null;
				});
				let shadow: Shadow | null | false = null;
				const shadows = shadowOf(cs.boxShadow, op);
				if (shadows === false) shadow = false;
				else {
					shadow = shadows.outer;
					// A ring inside a border would be a second outline: that box stays a picture.
					if (shadows.ring && sides.some(Boolean)) shadow = false;
					else if (shadows.ring) {
						const ring = { ...shadows.ring, style: 'solid' };
						sides = SIDES.map(() => ring);
					}
				}
				// A shadow under a translucent fill or no fill would show THROUGH it in an office
				// suite, where CSS clips it to outside the box.
				if (shadow && !(fill && fill.alpha >= 1)) shadow = false;
				const image = (cs.backgroundImage && cs.backgroundImage !== 'none') || (cs.borderImageSource && cs.borderImageSource !== 'none');
				const outline = cs.outlineStyle !== 'none' && px(cs.outlineWidth) > 0 && !!paintOf(cs.outlineColor, 1);
				if (fill || image || outline || shadow !== null || sides.some(Boolean)) {
					// Corner radii: circular only, `%` resolved, scaled down as CSS scales them.
					const rx = CORNERS.map((c) => {
						const parts = (cs[`border${c}Radius`] || '0px').split(/\s+/);
						const h = parts[0].endsWith('%') ? (px(parts[0]) / 100) * rect.w : px(parts[0]);
						const v = parts[1] ? (parts[1].endsWith('%') ? (px(parts[1]) / 100) * rect.h : px(parts[1])) : parts[0].endsWith('%') ? (px(parts[0]) / 100) * rect.h : h;
						return [h, v];
					});
					const circular = rx.every(([h, v]) => Math.abs(h - v) <= 0.5);
					const r = rx.map(([h]) => h);
					const f = Math.min(1, rect.w / (r[0] + r[1] || 1), rect.w / (r[3] + r[2] || 1), rect.h / (r[0] + r[3] || 1), rect.h / (r[1] + r[2] || 1));
					let radii = r.map((v) => Math.round(v * f * 100) / 100) as Candidate['radii'];
					// A fill clipped to the padding or content box (a short accent rule drawn as a
					// padded segment) paints a smaller box than the border box. Borders around it
					// would need two boxes: that stays a picture.
					let shape = rect;
					let clipBad = false;
					if (fill && cs.backgroundClip !== 'border-box') {
						const content = cs.backgroundClip === 'content-box';
						const ins = SIDES.map((sd) => px(cs[`border${sd}Width`]) + (content ? px(cs[`padding${sd}`]) : 0));
						if (ins.some((v) => v > 0)) {
							if (sides.some(Boolean) || shadow) clipBad = true;
							shape = { x: rect.x + ins[3], y: rect.y + ins[0], w: rect.w - ins[1] - ins[3], h: rect.h - ins[0] - ins[2] };
							radii = radii.map((v, i) => Math.max(0, Math.round((v - Math.max(ins[i === 0 || i === 3 ? 3 : 1], ins[i < 2 ? 0 : 2])) * 100) / 100)) as Candidate['radii'];
							if (!(shape.w > 0 && shape.h > 0)) clipBad = true;
						}
					}
					const plain =
						!image && !outline && !clipBad && shadow !== false && circular && rect.w >= 1 && rect.h >= 1 && sides.every((sd) => !sd || sd.style === 'solid') &&
						cs.backgroundClip !== 'text' && !effected(el) && unclipped(el, rect) && tag !== 'html' && tag !== 'body';
					const box = { el, rect: shape, alpha: op, fill, radii, sides: sides.map((sd) => (sd ? { color: sd.color, alpha: sd.alpha, width: sd.width } : null)), shadow: shadow || null, covers: false };
					box.covers = !!fill || !!box.shadow || box.sides.every(Boolean);
					if (plain) candidates.push(box);
					else items.push({ node: el, owner: el, rect, paintOf: el });
				}
			}
			for (let child = el.firstChild; child; child = child.nextSibling) {
				if (child.nodeType === 1) {
					if (!SKIP.has(String((child as Element).localName).toLowerCase()) || DRAWN.has(String((child as Element).localName).toLowerCase())) walk(child as Element);
				} else if (child.nodeType === 3 && shown && !keptNodes.has(child) && /\S/.test(child.nodeValue || '')) {
					// Text the picture keeps (not read, or left whole): its ink is picture content.
					range2.selectNodeContents(child);
					const r = range2.getBoundingClientRect();
					if (r.width > 0 && r.height > 0) items.push({ node: child, owner: el, rect: relRect(r), text: true });
				}
			}
		};
		const range2 = doc.createRange();
		walk(section);
		range2.detach();

		// The section's own paint is the slide's background: never a shape, always beneath.
		const lifted = new Set(candidates.filter((c) => c.el !== section));
		// What a lifted box covers: its whole box, or just the bands of its borders.
		const coverOf = (c: Candidate): Rect[] => {
			if (c.covers) return [c.rect];
			const { x, y, w, h } = c.rect;
			const [t, r, b, l] = c.sides;
			return [t && { x, y, w, h: t.width }, r && { x: x + w - r.width, y, w: r.width, h }, b && { x, y: y + h - b.width, w, h: b.width }, l && { x, y, w: l.width, h }].filter(Boolean) as Rect[];
		};
		// Is picture item `p` painted ABOVE lifted box `el`?
		const above = (p: Item, el: Element): boolean => {
			if (p.paintOf && p.node !== el && p.node.contains(el)) return false; // an ancestor's own paint
			if (p.node === el) return true; // the box's own pseudo-element or marker
			const common = commonAncestor(p.owner, el);
			let lp = p.owner === common ? 1 : levelOf(p.owner, common);
			// An absolutely placed `::before`/`::after` paints at its own level, not its owner's.
			if (p.pseudo && !p.text) {
				const ps = win.getComputedStyle(p.owner, p.pseudo === 'before' ? '::before' : '::after');
				if (ps.position !== 'static') {
					const z = ps.zIndex === 'auto' ? Number.NaN : Number(ps.zIndex);
					lp = Number.isNaN(z) ? Math.max(lp, 2) : z < 0 ? Math.min(lp, -1) : Math.max(lp, 2 + z);
				}
			}
			const le = levelOf(el, common);
			if (lp !== le) return lp > le;
			if (p.text) return true; // inline content paints after every block background in its level
			if (p.node === el) return true; // the box's own pseudo-element or marker
			if (p.pseudo && p.node.contains(el)) return p.pseudo === 'after';
			return !!(p.node.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
		};
		for (let changed = true; changed; ) {
			changed = false;
			for (const c of lifted) {
				const cover = coverOf(c);
				if (!items.some((p) => cover.some((r) => overlaps(r, p.rect)) && above(p, c.el))) continue;
				lifted.delete(c);
				items.push({ node: c.el, owner: c.el, rect: c.rect, paintOf: c.el });
				changed = true;
			}
		}

		// Back to front: a parent before its children, else by painting level below their common
		// ancestor, then tree order.
		const order = [...lifted].sort((a, b) => {
			if (a.el.contains(b.el)) return -1;
			if (b.el.contains(a.el)) return 1;
			const common = commonAncestor(a.el, b.el);
			const d = levelOf(a.el, common) - levelOf(b.el, common);
			return d || (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
		});
		const same = (a: Paint & { width: number }, b: Paint & { width: number }) => a.color === b.color && Math.abs(a.alpha - b.alpha) < 0.01 && Math.abs(a.width - b.width) < 0.01;
		for (const c of order) {
			const { x, y, w, h } = c.rect;
			// The outline is the border most sides share; a side that differs is a rule over it.
			let stroke: (Paint & { width: number }) | undefined;
			if (c.sides.every(Boolean)) {
				const all = c.sides as Array<Paint & { width: number }>;
				stroke = all.map((sd) => ({ sd, n: all.filter((o) => same(o, sd)).length })).sort((p, q) => q.n - p.n)[0].sd;
				// A side thinner than the outline would show the outline on both sides of it.
				if (all.some((sd) => sd.width < (stroke as Paint & { width: number }).width)) stroke = undefined;
			}
			if (c.fill || stroke || c.shadow) {
				const box: Shape = { kind: 'box', x, y, w, h, radii: c.radii };
				if (c.fill) box.fill = c.fill;
				if (stroke) box.stroke = stroke;
				if (c.shadow) box.shadow = c.shadow;
				shapes.push(box);
				shapeEls.push(c.el);
			}
			const [rTL, rTR, rBR, rBL] = c.radii;
			c.sides.forEach((sd, i) => {
				if (!sd || (stroke && same(sd, stroke))) return;
				const half = sd.width / 2;
				// A rule runs between the corners it meets; on a rounded corner it wraps 45° of the
				// arc, where the browser hands the corner to the next side.
				const line: Shape =
					i === 0
						? { kind: 'line', x: x + rTL, y: y + half, w: w - rTL - rTR, h: 0, stroke: sd, side: 'top', wrap: [rTL, rTR] }
						: i === 1
							? { kind: 'line', x: x + w - half, y: y + rTR, w: 0, h: h - rTR - rBR, stroke: sd, side: 'right', wrap: [rTR, rBR] }
							: i === 2
								? { kind: 'line', x: x + rBL, y: y + h - half, w: w - rBL - rBR, h: 0, stroke: sd, side: 'bottom', wrap: [rBL, rBR] }
								: { kind: 'line', x: x + half, y: y + rTL, w: 0, h: h - rTL - rBL, stroke: sd, side: 'left', wrap: [rTL, rBL] };
				if (!(line.wrap as number[]).some((v) => v > half)) delete line.wrap;
				shapes.push(line);
				shapeEls.push(c.el);
			});
		}

		// LABELS: a box with no shadow that holds nothing lifted but ONE paragraph of its own
		// carries that text inside it: one object, which moves and resizes with its words.
		const carried = new Set<number>();
		shapes.forEach((sh, i) => {
			if (sh.kind !== 'box' || sh.shadow) return;
			const el = shapeEls[i];
			if (shapeEls.some((o, j) => j !== i && (o === el || el.contains(o)))) return;
			const inside = frames.map((_f, j) => j).filter((j) => el.contains(frameBlocks[j]));
			if (inside.length === 1 && frameBlocks[inside[0]] === el) {
				sh.text = inside[0];
				carried.add(inside[0]);
			}
		});
		// GROUPS: a box that covers its area is a card; everything lifted inside it — its rules,
		// its labels, its text — moves with it. Groups are flat: the outermost card wins.
		const cardOf = (el: Element, self: boolean): number => {
			let best = -1;
			shapes.forEach((sh, i) => {
				if (sh.kind !== 'box') return;
				const box = shapeEls[i];
				if ((box === el ? self : box.contains(el)) && (best < 0 || shapeEls[i].contains(shapeEls[best]))) best = i;
			});
			return best;
		};
		const groups = new Set<number>();
		shapes.forEach((sh, i) => {
			const g = cardOf(shapeEls[i], sh.kind !== 'box');
			if (g >= 0 && g !== i) {
				sh.group = g;
				groups.add(g);
			}
		});
		frames.forEach((f, i) => {
			if (carried.has(i)) return;
			const g = cardOf(frameBlocks[i], true);
			if (g >= 0) {
				f.group = g;
				groups.add(g);
			}
		});
		for (const g of groups) shapes[g].group = g;
	}

	// ── hide. FIRST CHOICE: wrap each text node that was read in an inline element that is
	// itself transparent. Nothing else changes — not the owner's color, so its `::marker`,
	// `::before`/`::after` and every `currentColor` background or icon stay exactly as drawn,
	// in any capture (a screenshot, or html-to-image, which clones neither markers nor
	// document stylesheets). A wrapper can change layout through a selector (`> *`,
	// `:first-child`), so every word is measured again; if one moved, the wrappers come out
	// and the FALLBACK below freezes colors instead.
	let hidden = false;
	const host = section as unknown as { __calcoRestore?: () => void };
	const flushStyle = (el: Element, saved: string | null) => {
		// Read first: Chrome writes CSSOM changes back to the attribute lazily, and a
		// removeAttribute before that flush comes back as `style=""` (measured).
		el.getAttribute('style');
		if (saved === null) el.removeAttribute('style');
		else el.setAttribute('style', saved);
	};
	const wrapHide = (): boolean => {
		const wrappers: Element[] = [];
		const deco: Array<() => void> = [];
		const undo = () => {
			for (const wrap of wrappers) {
				const n = wrap.firstChild;
				if (n && wrap.parentNode) wrap.parentNode.insertBefore(n, wrap);
				wrap.remove();
			}
			for (const r of deco) r();
		};
		// A wrapper is an element, so it can also change PAINT without moving a word: it flips
		// `:first-child`, `:only-child` or `:has(> x:only-child)` for the elements around it.
		// Snapshot what such a rule paints on the parents, grandparents and element siblings
		// of every wrapped node, and fall back if any of it changes.
		const PAINT = [
			'background-color', 'background-image', 'border-top-color', 'border-top-width', 'border-bottom-color', 'border-bottom-width',
			'border-left-color', 'border-left-width', 'border-right-color', 'border-right-width', 'outline-style', 'outline-width',
			'outline-color', 'box-shadow', 'display', 'visibility', 'opacity', 'color',
		];
		const watched = new Set<Element>();
		for (const wd of kept) {
			const parent = wd.node.parentElement;
			if (!parent) continue;
			watched.add(parent);
			if (parent.parentElement) watched.add(parent.parentElement);
			for (const child of Array.from(parent.children)) watched.add(child);
		}
		const paintOf = (el: Element) => {
			const cs = win.getComputedStyle(el);
			return PAINT.map((p) => cs.getPropertyValue(p)).join('|');
		};
		const paintBefore = new Map<Element, string>();
		for (const el of watched) paintBefore.set(el, paintOf(el));
		for (const node of new Set(kept.map((wd) => wd.node))) {
			if (!node.parentNode) continue;
			const wrap = doc.createElement('calco-hide');
			wrap.setAttribute(
				'style',
				'color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important;-webkit-text-stroke-width:0!important',
			);
			node.parentNode.insertBefore(wrap, node);
			wrap.appendChild(node);
			wrappers.push(wrap);
		}
		// A decoration (underline, strike) is painted by the element that declares it, in its
		// color, through every descendant: the owner's own decoration has to go too.
		for (const el of textOwners) {
			if ((win.getComputedStyle(el).textDecorationLine || 'none') === 'none') continue;
			const saved = el.getAttribute('style');
			(el as HTMLElement).style.setProperty('text-decoration-color', 'transparent', 'important');
			deco.push(() => flushStyle(el, saved));
		}
		const now = section.getBoundingClientRect();
		const k = boxW > 0 && now.width > 0 ? now.width / boxW : 1;
		const probe = doc.createRange();
		for (const wd of kept) {
			probe.setStart(wd.node, wd.start);
			probe.setEnd(wd.node, wd.end);
			const r = probe.getClientRects()[0];
			if (!r || Math.abs((r.left - now.left) / k - wd.x) > 0.5 || Math.abs((r.top - now.top) / k - wd.y) > 0.5) {
				undo();
				return false;
			}
		}
		for (const [el, before] of paintBefore) {
			if (paintOf(el) !== before) {
				undo();
				return false;
			}
		}
		host.__calcoRestore = undo;
		return true;
	};
	const freezeHide = () => {
		const FROZEN = [
			'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color',
			'border-left-color', 'outline-color', 'box-shadow', 'column-rule-color', 'fill', 'stroke', 'caret-color',
		];
		const restores: Array<() => void> = [];
		const sheet: string[] = [];
		let id = 0;
		const all = [section, ...Array.from(section.querySelectorAll('*'))] as HTMLElement[];
		// Read EVERYTHING before writing anything: one write would change what later reads see.
		const plan = all.map((el) => {
			const cs = win.getComputedStyle(el);
			const isOwner = textOwners.has(el);
			const pseudo = (['::before', '::after', '::marker'] as const).map((p) => {
				const ps = win.getComputedStyle(el, p);
				const live = p === '::marker' ? ps.content !== 'none' || el.matches('li') : ps.content && ps.content !== 'none' && ps.content !== 'normal';
				return live ? { p, color: ps.color, frozen: FROZEN.map((k) => [k, ps.getPropertyValue(k)] as const) } : null;
			});
			return { el, isOwner, color: cs.color, fillColor: cs.webkitTextFillColor, frozen: isOwner ? FROZEN.map((k) => [k, cs.getPropertyValue(k)] as const) : [], pseudo };
		});
		for (const p of plan) {
			const el = p.el;
			const saved = el.getAttribute('style');
			if (p.isOwner) {
				for (const [k, v] of p.frozen) if (v) el.style.setProperty(k, v, 'important');
				el.style.setProperty('color', 'transparent', 'important');
				el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
				el.style.setProperty('text-shadow', 'none', 'important');
				el.style.setProperty('text-decoration-color', 'transparent', 'important');
			} else {
				// Stop the transparent color inheriting into children that are not hidden
				// (an SVG with fill: currentColor, a nested element whose text was skipped).
				el.style.setProperty('color', p.color, 'important');
				el.style.setProperty('-webkit-text-fill-color', p.fillColor, 'important');
			}
			const live = p.pseudo.filter(Boolean) as Array<{ p: string; color: string; frozen: ReadonlyArray<readonly [string, string]> }>;
			if (live.length && p.isOwner) {
				const tag = `c${++id}`;
				el.setAttribute('data-calco-freeze', tag);
				for (const ps of live) {
					const decls = [`color:${ps.color} !important`, `-webkit-text-fill-color:${ps.color} !important`, ...ps.frozen.filter(([, v]) => v).map(([k, v]) => `${k}:${v} !important`)];
					sheet.push(`[data-calco-freeze="${tag}"]${ps.p}{${decls.join(';')}}`);
				}
			}
			restores.push(() => {
				// Read first: Chrome writes CSSOM changes back to the attribute lazily, and a
				// removeAttribute before that flush comes back as `style=""` (measured).
				el.getAttribute('style');
				if (saved === null) el.removeAttribute('style');
				else el.setAttribute('style', saved);
				el.removeAttribute('data-calco-freeze');
			});
		}
		const styleEl = doc.createElement('style');
		styleEl.setAttribute('data-calco', 'freeze');
		styleEl.textContent = sheet.join('\n');
		(doc.head || doc.documentElement).appendChild(styleEl);
		restores.push(() => styleEl.remove());
		(section as unknown as { __calcoRestore?: () => void }).__calcoRestore = () => {
			for (const r of restores) r();
		};
	};
	if (options?.hide && textOwners.size) {
		if (!wrapHide()) freezeHide();
		hidden = true;
	}
	// A lifted shape's paint goes the same way: transparent, inline and !important, every
	// border WIDTH kept so nothing moves. Undone first, before the text, because the color
	// freeze may have written inline styles on the same element.
	if (options?.hide && shapes.length) {
		const undo: Array<() => void> = [];
		for (const el of new Set(shapeEls) as Set<HTMLElement>) {
			const saved = el.getAttribute('style');
			for (const [k, v] of [
				['background-color', 'transparent'],
				['border-top-color', 'transparent'],
				['border-right-color', 'transparent'],
				['border-bottom-color', 'transparent'],
				['border-left-color', 'transparent'],
				['box-shadow', 'none'],
			]) {
				el.style.setProperty(k, v, 'important');
			}
			undo.push(() => flushStyle(el, saved));
		}
		const text = host.__calcoRestore;
		host.__calcoRestore = () => {
			for (const u of undo) u();
			if (typeof text === 'function') text();
		};
		hidden = true;
	}
	return { width: boxW, height: boxH, frames, shapes, hidden };
}

/** Undo `readSlide(section, { hide: true })`. Safe to call when nothing is hidden. */
export function restoreSlide(section: HTMLElement): void {
	const host = section as unknown as { __calcoRestore?: () => void };
	const restore = host.__calcoRestore;
	if (typeof restore === 'function') {
		host.__calcoRestore = undefined;
		restore();
	}
}
