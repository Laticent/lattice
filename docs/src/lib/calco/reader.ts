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
 * LABELS. A paragraph whose own block paints a plain box — a solid fill and/or one border
 * all round, any corner radii, and nothing else (no shadow, image, border image, tilt,
 * opacity, pseudo-element content or marker, or child that paints or is a picture) — and
 * holds no text but its own paragraph's, is a label: a pill, a tag. Its frame
 * carries that box as a `shape`, and `hide: true` also takes the box's own paint out of the
 * picture (fill and border colors to transparent, border widths kept so nothing moves), so a
 * writer can draw the box as a native shape under the text without leaving a ghost behind.
 *
 * RULES. A box with no fill that draws a solid border on one to three sides (a heading
 * underline, a table hairline, a list separator) gives each such side as a `line`, square to
 * the box at both ends, and `hide: true` makes that side's color transparent. A side whose
 * corners are rounded, or a box that is filled, faded by a filter or mask, tilted, scaled
 * apart from the slide, cut by a clipping ancestor, or bordered by an image, stays a picture.
 */
import type { Line, Shape, TextFrame, TextRun, TextStyle } from './types.js';

/** What `readSlide` returns. */
export interface ReadResult {
	width: number;
	height: number;
	frames: TextFrame[];
	/** Rules: single border sides drawn as native lines (see RULES in the header). */
	lines: Line[];
	/** True when the slide's read text is now hidden (call `restoreSlide` after capture). */
	hidden: boolean;
}

export interface ReadOptions {
	/** Hide the text that was read, for a text-free background capture. Default false. */
	hide?: boolean;
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

	// ── a label's box, or null. See LABELS in the header for what qualifies.
	const PICTURE = new Set(['svg', 'img', 'canvas', 'video', 'iframe', 'object', 'math', 'picture', 'input', 'select', 'textarea', 'button']);
	const visibleSide = (cs: CSSStyleDeclaration, side: string) => {
		const width = Number.parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0;
		const st = cs.getPropertyValue(`border-${side}-style`);
		const c = parseColor(cs.getPropertyValue(`border-${side}-color`));
		return width > 0 && st !== 'none' && st !== 'hidden' && c && c.a > 0 ? { width, st, color: cs.getPropertyValue(`border-${side}-color`), c } : null;
	};
	const paintsBox = (cs: CSSStyleDeclaration) => {
		const bg = parseColor(cs.backgroundColor);
		return (!!bg && bg.a > 0) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || ['top', 'right', 'bottom', 'left'].some((sd) => visibleSide(cs, sd));
	};
	const hasPseudo = (el: Element) =>
		(['::before', '::after'] as const).some((p) => {
			const c = win.getComputedStyle(el, p).content;
			return !!c && c !== 'none' && c !== 'normal';
		});
	const labelShape = (block: Element): Shape | null => {
		if (block === section) return null;
		const cs = win.getComputedStyle(block);
		const fx = cs as unknown as Record<string, string>;
		if (cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || tilted(block) || hasPseudo(block)) return null;
		// A border image paints over the hidden border colors; a fill clipped to the padding or
		// content box is not the border box a shape would fill; a visible list marker would sit
		// under the shape.
		if ((cs.borderImageSource && cs.borderImageSource !== 'none') || (cs.backgroundClip && cs.backgroundClip !== 'border-box')) return null;
		if (cs.display === 'list-item' && cs.listStyleType !== 'none' && win.getComputedStyle(block, '::marker').content !== 'none') return null;
		// Every word in the box must be this frame's: text the reader left in the picture (a
		// clipped child, a filtered subtree) would be hidden under the shape or lost with the
		// fill, and a nested paragraph (a card's body) would be drawn under it or left out of
		// the group. So a label holds one paragraph and nothing else.
		const own = new Set((blocks.get(block) || []).map((wd) => wd.node));
		const walker = doc.createTreeWalker(block, 4);
		for (let t = walker.nextNode(); t; t = walker.nextNode()) {
			if (/\S/.test(t.nodeValue || '') && !own.has(t as Text)) return null;
		}
		if (cs.outlineStyle !== 'none' && (Number.parseFloat(cs.outlineWidth) || 0) > 0) return null;
		if ((fx.backdropFilter && fx.backdropFilter !== 'none') || (cs.mixBlendMode && cs.mixBlendMode !== 'normal')) return null;
		const sides = ['top', 'right', 'bottom', 'left'].map((sd) => visibleSide(cs, sd));
		let stroke: Shape['stroke'];
		if (sides.some(Boolean)) {
			// One border all round, solid: anything else (an accent edge, a dashed rule) is not a label.
			const [a] = sides;
			if (!a || sides.some((sd) => !sd || Math.abs(sd.width - a.width) > 0.01 || sd.color !== a.color || sd.st !== 'solid')) return null;
			stroke = { width: a.width, color: hex(a.c), alpha: a.c.a };
		}
		const bg = parseColor(cs.backgroundColor);
		const fill = bg && bg.a > 0 ? { color: hex(bg), alpha: Math.round(bg.a * 100) / 100 } : undefined;
		if (!fill && !stroke) return null;
		for (const el of Array.from(block.querySelectorAll('*'))) {
			if (PICTURE.has(el.localName.toLowerCase())) return null;
			const ecs = win.getComputedStyle(el);
			if (ecs.display === 'none') continue;
			if (paintsBox(ecs) || hasPseudo(el)) return null;
		}
		// Opacity on the box or an ancestor fades the box and its text as ONE group; a shape and
		// a text box each faded would mix differently, so such a box stays a picture.
		for (let p: Element | null = block; p && p !== section.parentElement; p = p.parentElement) {
			if ((Number.parseFloat(win.getComputedStyle(p).opacity) || 0) < 1) return null;
		}
		const r = block.getBoundingClientRect();
		// A box scaled apart from the slide (a focus pop) draws its border and radii scaled too,
		// which the computed values do not say.
		const ow = (block as HTMLElement).offsetWidth;
		if (ow > 0 && Math.abs(r.width / scale - ow) > Math.max(1, 0.01 * ow)) return null;
		const x = (r.left - origin.left) / scale;
		const y = (r.top - origin.top) / scale;
		const w = r.width / scale;
		const h = r.height / scale;
		if (!(w > 0 && h > 0) || x < -0.5 || y < -0.5 || x + w > boxW + 0.5 || y + h > boxH + 0.5) return null;
		// Corner radii as CSS draws them: each corner's two radii, scaled down together when
		// adjacent corners would overlap, then the smaller of the two (an office shape's
		// corners are circular).
		const corner = (v: string) => {
			const parts = v.trim().split(/\s+/);
			const one = (part: string, ref: number) => (part.endsWith('%') ? (Number.parseFloat(part) / 100) * ref : Number.parseFloat(part) || 0);
			return [one(parts[0], w), one(parts[1] || parts[0], h)];
		};
		const c = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(corner);
		const f = Math.min(1, w / (c[0][0] + c[1][0] || 1), w / (c[3][0] + c[2][0] || 1), h / (c[0][1] + c[3][1] || 1), h / (c[1][1] + c[2][1] || 1));
		const radii = c.map(([rx, ry]) => Math.round(Math.min(rx, ry) * f * 100) / 100) as Shape['radii'];
		const round = (n: number) => Math.round(n * 100) / 100;
		const shape: Shape = { x: round(x), y: round(y), w: round(w), h: round(h), radii };
		if (fill) shape.fill = fill;
		if (stroke) shape.stroke = stroke;
		return shape;
	};
	const labels: Element[] = [];

	// ── words → lines → frames. An unplaceable block is dropped, and its text is not hidden.
	const frames: TextFrame[] = [];
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
		const shape = labelShape(block);
		if (shape) labels.push(block);
		frames.push({
			...(shape ? { shape } : {}),
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

	// ── rules: border sides of unfilled boxes, as lines. See RULES in the header.
	const lines: Line[] = [];
	const ruled: Array<[HTMLElement, string[]]> = [];
	const ruleSides = (el: Element): Array<[string, Line]> => {
		const cs = win.getComputedStyle(el);
		if (cs.display === 'none' || cs.visibility !== 'visible') return [];
		const sides = (['top', 'right', 'bottom', 'left'] as const).map((sd) => [sd, visibleSide(cs, sd)] as const).filter(([, v]) => v);
		if (!sides.length || sides.length === 4) return [];
		const bg = parseColor(cs.backgroundColor);
		if ((bg && bg.a > 0) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none') return [];
		if ((cs.borderImageSource && cs.borderImageSource !== 'none') || tilted(el)) return [];
		// Borders the browser does not paint: a row group, row or column in the separate-borders
		// model, an empty cell under `empty-cells: hide`. An inline box that wraps draws a border
		// per line fragment, not one along its union.
		const table = el.closest('table');
		const collapsed = !!table && win.getComputedStyle(table).borderCollapse === 'collapse';
		if (/^table-(row|row-group|header-group|footer-group|column|column-group)$/.test(cs.display) && !collapsed) return [];
		if (cs.display === 'table-cell' && !collapsed && cs.emptyCells === 'hide' && !/\S/.test(el.textContent || '') && !el.querySelector(Array.from(PICTURE).join(','))) return [];
		if (/^inline/.test(cs.display) && el.getClientRects().length > 1) return [];
		// A positioned `::before`/`::after` can sit on the border (a timeline dot); the native line
		// would be drawn over it.
		for (const ps of ['::before', '::after'] as const) {
			const q = win.getComputedStyle(el, ps);
			if (q.content && q.content !== 'none' && q.content !== 'normal' && (q.position === 'absolute' || q.position === 'fixed')) return [];
		}
		const r = el.getBoundingClientRect();
		const ow = (el as HTMLElement).offsetWidth;
		const oh = (el as HTMLElement).offsetHeight;
		// offsetWidth/Height round to whole pixels, so a short box reads up to a pixel off.
		const off = (got: number, layout: number) => Math.abs(got / scale - layout) > Math.max(1, 0.01 * layout);
		if (!(ow > 0) || off(r.width, ow) || (oh > 0 && off(r.height, oh))) return [];
		// Faded, filtered, masked or clipped by an ancestor: the picture's line is not one a
		// native line can be. A clipping ancestor must hold the whole box.
		let alpha = 1;
		for (let p: Element | null = el; p && p !== section.parentElement; p = p.parentElement) {
			const pcs = win.getComputedStyle(p);
			const pfx = pcs as unknown as Record<string, string>;
			if ((pcs.filter && pcs.filter !== 'none') || (pfx.maskImage && pfx.maskImage !== 'none') || (pfx.webkitMaskImage && pfx.webkitMaskImage !== 'none') || (pcs.clipPath && pcs.clipPath !== 'none') || (pcs.mixBlendMode && pcs.mixBlendMode !== 'normal') || (pcs.clip && pcs.clip !== 'auto')) return [];
			alpha *= Number.parseFloat(pcs.opacity) || 0;
			const paintContained = /paint|strict|content/.test(pfx.contain || '');
			if (p !== el && (paintContained || pcs.overflow !== 'visible' || pcs.overflowX !== 'visible' || pcs.overflowY !== 'visible')) {
				const c = p.getBoundingClientRect();
				if (r.left < c.left - 0.5 || r.top < c.top - 0.5 || r.right > c.right + 0.5 || r.bottom > c.bottom + 0.5) return [];
			}
		}
		if (!(alpha > 0)) return [];
		const corner = (v: string) => (Number.parseFloat(v) || 0) > 0;
		const rounded: Record<string, boolean> = {
			top: corner(cs.borderTopLeftRadius) || corner(cs.borderTopRightRadius),
			right: corner(cs.borderTopRightRadius) || corner(cs.borderBottomRightRadius),
			bottom: corner(cs.borderBottomLeftRadius) || corner(cs.borderBottomRightRadius),
			left: corner(cs.borderTopLeftRadius) || corner(cs.borderBottomLeftRadius),
		};
		const L = (r.left - origin.left) / scale;
		const T = (r.top - origin.top) / scale;
		const R = (r.right - origin.left) / scale;
		const B = (r.bottom - origin.top) / scale;
		if (L < -0.5 || T < -0.5 || R > boxW + 0.5 || B > boxH + 0.5) return [];
		const round = (n: number) => Math.round(n * 100) / 100;
		const out: Array<[string, Line]> = [];
		// Is the box itself on top all along this strip? Something painted over the border (a
		// positioned sibling) would end up under the native line. Sampled at the ends and in
		// between; skipped when the slide is not on screen, where no point can be tested.
		const onTop = (x1: number, y1: number, x2: number, y2: number) => {
			for (let k = 0; k <= 8; k++) {
				const t = Math.min(0.995, Math.max(0.005, k / 8));
				const px = origin.left + (x1 + (x2 - x1) * t) * scale;
				const py = origin.top + (y1 + (y2 - y1) * t) * scale;
				const hit = doc.elementFromPoint(px, py);
				if (!hit) return true;
				if (hit !== el && !(el.contains(hit) && !paintsBox(win.getComputedStyle(hit)))) return false;
			}
			return true;
		};
		for (const [sd, v] of sides) {
			if (!v || v.st !== 'solid' || rounded[sd]) continue;
			const w = v.width;
			const paint = { color: hex(v.c), alpha: Math.round(v.c.a * alpha * 100) / 100, width: w };
			// A collapsed table cell's box ends on the grid line, and the browser centers the
			// border on that line, not inside the box.
			const inset = collapsed ? 0 : w / 2;
			const line =
				sd === 'top' ? { x1: L, y1: T + inset, x2: R, y2: T + inset }
				: sd === 'bottom' ? { x1: L, y1: B - inset, x2: R, y2: B - inset }
				: sd === 'left' ? { x1: L + inset, y1: T, x2: L + inset, y2: B }
				: { x1: R - inset, y1: T, x2: R - inset, y2: B };
			// A collapsed cell border straddles the grid line, where a hit test lands on whichever
			// cell or row is tested first (a 1px hairline beside a striped row fails it every
			// time), so those skip it; who paints a shared edge is settled below instead.
			if (!collapsed && !onTop(line.x1, line.y1, line.x2, line.y2)) continue;
			out.push([sd, { x1: round(line.x1), y1: round(line.y1), x2: round(line.x2), y2: round(line.y2), ...paint }]);
		}
		return out;
	};
	// In a collapsed table cells (and rows) share each inner edge and the browser paints ONE
	// border there (CSS 2.1 §17.6.2.1): the wider; on a tie a cell's over a row's over a row
	// group's; then the earlier one. The losers are dropped, but their sides are still hidden,
	// since the browser drew the edge as the winner's.
	const sameEdge = (a: Line, b: Line) =>
		(a.y1 === a.y2) === (b.y1 === b.y2) &&
		(a.y1 === a.y2 ? Math.abs(a.y1 - b.y1) < 0.6 && Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > 1 : Math.abs(a.x1 - b.x1) < 0.6 && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > 1);
	const RANK: Record<string, number> = { 'table-cell': 3, 'table-row': 2, 'table-row-group': 1, 'table-header-group': 1, 'table-footer-group': 1 };
	type Entry = { el: HTMLElement; side: string; line: Line; rank: number };
	const entries: Entry[] = [];
	for (const el of Array.from(section.querySelectorAll('*'))) {
		if (el.closest('svg, math') || SKIP.has(el.localName.toLowerCase())) continue;
		const got = ruleSides(el);
		if (!got.length) continue;
		const tableOf = el.closest('table');
		const rank = tableOf && win.getComputedStyle(tableOf).borderCollapse === 'collapse' ? RANK[win.getComputedStyle(el).display] || 0 : 0;
		for (const [side, line] of got) entries.push({ el: el as HTMLElement, side, line, rank });
	}
	// Cluster the collapsed-table lines by shared edge. A cluster whose lines all span the same
	// stretch has one winner, drawn, and every member's side hidden; one whose spans differ
	// (a row's border across columns where only one cell also has one) is left to the picture.
	const keep = new Set<Entry>();
	const clusters: Entry[][] = [];
	for (const e of entries) {
		if (!e.rank) {
			keep.add(e);
			continue;
		}
		const home = clusters.find((c) => sameEdge(c[0].line, e.line));
		if (home) home.push(e);
		else clusters.push([e]);
	}
	const hiddenToo = new Set<Entry>();
	for (const c of clusters) {
		const span = (l: Line) => (l.y1 === l.y2 ? [l.x1, l.x2] : [l.y1, l.y2]);
		const [a0, a1] = span(c[0].line);
		if (!c.every((e) => Math.abs(span(e.line)[0] - a0) <= 1 && Math.abs(span(e.line)[1] - a1) <= 1)) continue;
		let win2 = c[0];
		for (const e of c.slice(1)) if (e.line.width > win2.line.width || (e.line.width === win2.line.width && e.rank > win2.rank)) win2 = e;
		keep.add(win2);
		for (const e of c) if (e !== win2) hiddenToo.add(e);
	}
	const sidesOf = new Map<HTMLElement, string[]>();
	for (const e of entries) {
		if (keep.has(e)) lines.push(e.line);
		if (!keep.has(e) && !hiddenToo.has(e)) continue;
		const list = sidesOf.get(e.el) || [];
		list.push(e.side);
		sidesOf.set(e.el, list);
	}
	for (const [el, sides] of sidesOf) ruled.push([el, sides]);

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
	// The labels' boxes and the rules go after the text, so the text hide's paint check sees
	// them as they were. Undone first, before the text, since each restore puts back the
	// style attribute it found.
	if (options?.hide && (labels.length || ruled.length)) {
		const undoText = host.__calcoRestore;
		const touched = [...new Set([...labels, ...ruled.map(([el]) => el)])];
		const saved = touched.map((el) => [el, el.getAttribute('style')] as const);
		// A transition on a border or background color would outrank the inline `!important`
		// for its duration, and the picture would still hold the box.
		for (const el of touched) (el as HTMLElement).style.setProperty('transition', 'none', 'important');
		for (const el of labels) {
			const st = (el as HTMLElement).style;
			st.setProperty('background-color', 'transparent', 'important');
			for (const sd of ['top', 'right', 'bottom', 'left']) st.setProperty(`border-${sd}-color`, 'transparent', 'important');
		}
		for (const [el, sides] of ruled) for (const sd of sides) el.style.setProperty(`border-${sd}-color`, 'transparent', 'important');
		host.__calcoRestore = () => {
			for (const [el, s] of saved) flushStyle(el, s);
			undoText?.();
		};
		hidden = true;
	}
	return { width: boxW, height: boxH, frames, lines, hidden };
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
