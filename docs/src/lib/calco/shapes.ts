/**
 * Native shapes, the part both writers share: a shape's outline as a path, where a label's
 * text sits inside its shape, and the order a slide's shapes and text are drawn in.
 *
 * Every length is in slide px, as in the deck model; a writer converts. Paths are relative
 * to the shape's own bounding box, which is what both office formats want.
 * Design: engineering/decisions/2026-10-07-calco-native-shapes.md.
 */
import type { PlacedBox } from './layout.js';
import type { Shape, Slide, TextFrame } from './types.js';

/** One step of a path: move, line, cubic Bézier, close. */
export type PathCmd = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

/** A shape's outline, ready to write. */
export interface ShapeGeometry {
	/** Bounding box of the path, px. */
	x: number;
	y: number;
	w: number;
	h: number;
	/**
	 * A preset both formats have, when the outline is one: `rect` (with `radius`, one for all
	 * four corners) or `line` (from the box's top-left to its bottom-right). A preset keeps
	 * the corners round when the shape is resized; a path stretches them.
	 */
	preset?: 'rect' | 'line';
	radius?: number;
	/** The outline, relative to the box. Always present, so a writer may ignore presets. */
	path: PathCmd[];
	/** False for an open path (a rule that wraps a corner): never filled. */
	closed: boolean;
}

const toMilli = (n: number) => Math.round(n * 1000) / 1000;

/** A circular arc from angle `a0` to `a1` (degrees, clockwise from +x, y down) as one cubic. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): PathCmd {
	const t0 = (a0 * Math.PI) / 180;
	const t1 = (a1 * Math.PI) / 180;
	const k = (4 / 3) * Math.tan((t1 - t0) / 4);
	const [x0, y0] = [cx + r * Math.cos(t0), cy + r * Math.sin(t0)];
	const [x3, y3] = [cx + r * Math.cos(t1), cy + r * Math.sin(t1)];
	return ['C', toMilli(x0 - k * r * Math.sin(t0)), toMilli(y0 + k * r * Math.cos(t0)), toMilli(x3 + k * r * Math.sin(t1)), toMilli(y3 - k * r * Math.cos(t1)), toMilli(x3), toMilli(y3)];
}

/** Where an arc starts. */
function arcStart(cx: number, cy: number, r: number, a: number): [number, number] {
	const t = (a * Math.PI) / 180;
	return [toMilli(cx + r * Math.cos(t)), toMilli(cy + r * Math.sin(t))];
}

/** Shift every point of a path. */
function shift(path: PathCmd[], dx: number, dy: number): PathCmd[] {
	return path.map((c): PathCmd => {
		if (c[0] === 'Z') return c;
		if (c[0] === 'C') return ['C', toMilli(c[1] + dx), toMilli(c[2] + dy), toMilli(c[3] + dx), toMilli(c[4] + dy), toMilli(c[5] + dx), toMilli(c[6] + dy)];
		return [c[0], toMilli(c[1] + dx), toMilli(c[2] + dy)];
	});
}

/**
 * The outline of a shape. A box's outline straddles its path in both formats, so the path
 * runs along the middle of the border band: the box inset by half the stroke, its corner
 * radii shrunk by as much. A rule's path is the middle of its band already.
 */
export function shapeGeometry(shape: Shape): ShapeGeometry {
	if (shape.kind === 'line') {
		const half = (shape.stroke?.width || 0) / 2;
		const [r0, r1] = (shape.wrap || [0, 0]).map((r) => Math.max(0, r - half));
		const { x, y, w, h } = shape;
		if (!r0 && !r1) {
			return { x, y, w, h, preset: 'line', path: [['M', 0, 0], ['L', toMilli(w), toMilli(h)]], closed: false };
		}
		// Each end wraps 45° of its corner (see Shape.wrap); the corner centers sit inward.
		const path: PathCmd[] = [];
		const ends = {
			top: [[x, y + r0, 225, 270], [x + w, y + r1, 270, 315]],
			bottom: [[x, y - r0, 135, 90], [x + w, y - r1, 90, 45]],
			left: [[x + r0, y, 225, 180], [x + r1, y + h, 180, 135]],
			right: [[x - r0, y, 315, 360], [x - r1, y + h, 0, 45]],
		}[shape.side || (h ? 'left' : 'top')];
		const [[ax, ay, a0, a1], [bx, by, b0, b1]] = ends;
		if (r0) {
			path.push(['M', ...arcStart(ax, ay, r0, a0)], arc(ax, ay, r0, a0, a1));
		} else path.push(['M', toMilli(x), toMilli(y)]);
		path.push(['L', toMilli(x + w), toMilli(y + h)]);
		if (r1) path.push(arc(bx, by, r1, b0, b1));
		const pts = path.flatMap((c) => (c[0] === 'Z' ? [] : c[0] === 'C' ? [[c[1], c[2]], [c[3], c[4]], [c[5], c[6]]] : [[c[1], c[2]]]));
		const minX = Math.min(...pts.map((p) => p[0]));
		const minY = Math.min(...pts.map((p) => p[1]));
		const maxX = Math.max(...pts.map((p) => p[0]));
		const maxY = Math.max(...pts.map((p) => p[1]));
		return { x: minX, y: minY, w: toMilli(maxX - minX), h: toMilli(maxY - minY), path: shift(path, -minX, -minY), closed: false };
	}
	const c = (shape.stroke?.width || 0) / 2;
	const x = shape.x + c;
	const y = shape.y + c;
	const w = Math.max(0, shape.w - 2 * c);
	const h = Math.max(0, shape.h - 2 * c);
	const limit = Math.min(w, h) / 2;
	const [tl, tr, br, bl] = (shape.radii || [0, 0, 0, 0]).map((r) => Math.min(limit, Math.max(0, r - c)));
	const path: PathCmd[] = [['M', toMilli(tl), 0], ['L', toMilli(w - tr), 0]];
	if (tr) path.push(arc(w - tr, tr, tr, 270, 360));
	path.push(['L', toMilli(w), toMilli(h - br)]);
	if (br) path.push(arc(w - br, h - br, br, 0, 90));
	path.push(['L', toMilli(bl), toMilli(h)]);
	if (bl) path.push(arc(bl, h - bl, bl, 90, 180));
	path.push(['L', 0, toMilli(tl)]);
	if (tl) path.push(arc(tl, tl, tl, 180, 270));
	path.push(['Z']);
	const uniform = Math.abs(tl - tr) < 0.01 && Math.abs(tl - br) < 0.01 && Math.abs(tl - bl) < 0.01;
	return { x, y, w, h, ...(uniform ? { preset: 'rect' as const, radius: toMilli(tl) } : {}), path, closed: true };
}

/** Insets of a label's text inside its shape, px: left, top, right (bottom is always 0). */
export interface Insets {
	l: number;
	t: number;
	r: number;
}

/**
 * Where a label's text goes inside its shape, as insets from the shape's outline box, so the
 * office suite draws it where a free text box `placed` would have been. Null when the text
 * reaches outside the shape (a negative inset, which neither format allows): the writer then
 * draws the shape and a text box, grouped, instead.
 *
 * The text does not wrap, so only the edge its alignment grows from matters: the left inset
 * for left-aligned text, the right one for right-aligned, and for centered text a text area
 * centered on the text's own center.
 */
export function labelInsets(geom: ShapeGeometry, placed: PlacedBox, align: TextFrame['align']): Insets | null {
	const t = placed.y - geom.y;
	let l = 0;
	let r = 0;
	if (align === 'center') {
		const cx = placed.x + placed.w / 2;
		const m = Math.min(cx - geom.x, geom.x + geom.w - cx);
		l = cx - m - geom.x;
		r = geom.x + geom.w - (cx + m);
		if (m < 0) return null;
	} else if (align === 'right') r = geom.x + geom.w - (placed.x + placed.w);
	else l = placed.x - geom.x;
	if (t < -0.5 || l < -0.5 || r < -0.5) return null;
	return { l: Math.max(0, l), t: Math.max(0, t), r: Math.max(0, r) };
}

/** One thing to draw: a shape (with or without text inside), or a free text box. */
export type Drawn = { shape: Shape; index: number; label?: TextFrame } | { frame: TextFrame; index: number };

/** A run of things drawn together: a group, or a single item. */
export interface DrawnGroup {
	/** The card's index in `slide.shapes`, for a group. */
	group?: number;
	items: Drawn[];
}

/**
 * The order a slide is drawn in, over its picture: shapes back to front, each group whole
 * where its card first paints (its shapes, then its text), then the text that belongs to no
 * group, on top. `carries(shape, frame)` says whether a label's shape can hold its text
 * (`labelInsets` is not null); when it cannot, the shape and its text are grouped instead.
 */
export function drawOrder(slide: Slide, carries: (shape: Shape, frame: TextFrame) => boolean): DrawnGroup[] {
	const shapes = slide.shapes || [];
	const frames = slide.frames || [];
	const hasText = (f: TextFrame | undefined) => !!f && f.lines.some((l) => l.length);
	// A label's text: carried inside its shape, or (when it cannot be) a member beside it.
	const carried = new Set<number>();
	const loose = new Map<number, number>(); // frame index → the label shape it belongs with
	shapes.forEach((s, i) => {
		if (s.text === undefined || !hasText(frames[s.text])) return;
		if (carries(s, frames[s.text])) carried.add(s.text);
		else loose.set(s.text, i);
	});
	// The group a loose label's text joins: its label's group, or the label itself.
	const groupOf = (i: number) => (shapes[i].group !== undefined ? shapes[i].group : i);
	const memberGroup = (fi: number): number | undefined => (loose.has(fi) ? groupOf(loose.get(fi) as number) : frames[fi].group);
	const groupsWithMembers = new Set<number>();
	shapes.forEach((s, i) => {
		if (s.group !== undefined && s.group !== i) groupsWithMembers.add(s.group);
	});
	frames.forEach((_f, fi) => {
		const g = memberGroup(fi);
		if (g !== undefined && !carried.has(fi) && hasText(frames[fi])) groupsWithMembers.add(g);
	});
	const effective = (i: number): number | undefined => {
		const g = shapes[i].group !== undefined ? shapes[i].group : loose.size && [...loose.values()].includes(i) ? i : undefined;
		return g !== undefined && groupsWithMembers.has(g) ? g : undefined;
	};
	const shapeItem = (i: number): Drawn => {
		const s = shapes[i];
		return s.text !== undefined && carried.has(s.text) ? { shape: s, index: i, label: frames[s.text] } : { shape: s, index: i };
	};
	const out: DrawnGroup[] = [];
	const done = new Set<number>();
	shapes.forEach((_s, i) => {
		if (done.has(i)) return;
		const g = effective(i);
		if (g === undefined) {
			out.push({ items: [shapeItem(i)] });
			done.add(i);
			return;
		}
		const items: Drawn[] = [];
		shapes.forEach((_o, j) => {
			if (effective(j) === g && !done.has(j)) {
				items.push(shapeItem(j));
				done.add(j);
			}
		});
		frames.forEach((f, fi) => {
			if (!carried.has(fi) && hasText(f) && memberGroup(fi) === g) items.push({ frame: f, index: fi });
		});
		out.push({ group: g, items });
	});
	frames.forEach((f, fi) => {
		if (carried.has(fi) || !hasText(f)) return;
		const g = memberGroup(fi);
		if (g === undefined || !groupsWithMembers.has(g)) out.push({ items: [{ frame: f, index: fi }] });
	});
	return out;
}
