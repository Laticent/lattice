/**
 * Capture a deck's slides for the office writers: the part of an export that is neither reading
 * a slide (reader.ts) nor writing a file (pptx.ts, odp.ts). It decides, per slide, what the
 * photographs are: the slide's own paint (a BACKGROUND that slides drawing the same thing
 * share), its content over transparency (the FOREGROUND), and the pictures cropped out of
 * that foreground (sprites, each in paint order). A slide that reads the paint behind it keeps
 * one opaque picture when the layers do not add back up.
 *
 * Both hosts run this one function: the CLI (puppeteer, lib/export/office-export.js) and the
 * Studio (html-to-image, in the page). A host supplies two verbs, `run` (call a function in the
 * page that holds a slide) and `shoot` (photograph a slide as it now looks), so the two cannot
 * drift apart. The in-page helpers below are self-contained, like `readSlide`: a headless
 * browser receives them as `fn.toString()` source, so they close over nothing.
 *
 * Design: engineering/decisions/2026-10-21-calco-lift-what-can-be-lifted.md.
 */

import { readSlide, restoreSlide, restoreSplit, splitKey, splitSlide } from './reader.js';
import type { Background, Shape, Slide, TextFrame } from './types.js';

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}
interface PictureBox extends Box {
	photo?: boolean;
	/** One picture, never split into a photo core and strips (a logo). */
	lone?: boolean;
}
interface Piece extends Box {
	data: string;
	jpeg: boolean;
}
/**
 * How the host wants the pictures cropped from a slide (a photo, an icon) encoded. Calco holds no policy: leave `pictures` out and every crop is
 * a lossless PNG; pass these and a photographic crop is a JPEG when that wins by the sizes rule.
 */
export interface CropEncoding {
	/** Every crop a lossless PNG, none split into a photo core and strips. */
	lossless?: boolean;
	/** JPEG quality, 0 to 1 (a canvas's scale). */
	quality: number;
	/** A continuous-tone crop's JPEG at or over this many bytes is kept without taking the PNG. */
	toneBytes: number;
	/** A PNG at or under this many bytes is flat: kept lossless with no JPEG tried. */
	flatBytes: number;
	/** A JPEG must be under this share of its PNG to win. */
	share: number;
	/**
	 * The name of a function on the page's global object that writes a crop's bytes: `(canvas, { type: 'png' }
	 * | { type: 'jpeg', quality })`, quality 1 to 100, returning the bytes or a promise of them. A host that wants
	 * the same bytes in every browser installs one (the browser's own encoders differ by engine); absent, the
	 * canvas's own encoders write the crops. Named but missing on the page is an error, never a quiet fallback.
	 */
	encoder?: string;
}
interface CropRules extends CropEncoding {
	maxOutside: number;
}
interface CropResult {
	residual: (Box & { data: string }) | null;
	images: Piece[][];
}

/** Base64 of a byte array, in chunks `String.fromCharCode` can take (works in a browser and in Node). */
export function toBase64(bytes: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
	return btoa(bin);
}

function fromBase64(text: string): Uint8Array {
	const bin = atob(text);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/**
 * In the page: say what a slide's background photograph is. Runs through
 * `elementHandle.evaluate` on the slide, so it closes over nothing.
 *
 * The background is compared at the slide's CSS size (half the photograph), and every image
 * background seen so far stays decoded in the page (`__calcoBackgrounds`), so a deck of 100
 * slides decodes each background once. Returns whether `bg` is one flat color (`flat`,
 * `#rrggbb`) and which earlier image background it matches within `tol` per channel (`match`,
 * -1 for none). A new one is remembered (`stored`) until 32 are held; past that a new background
 * is never matched against, which costs a shared background, not correctness.
 */
export async function describeBackground(section: HTMLElement, { bg, tol, reset }: { bg: string; tol: number; reset?: boolean }): Promise<{ flat: string | null; match: number; stored: boolean }> {
  const win = section.ownerDocument.defaultView as unknown as { __calcoBackgrounds?: Uint8ClampedArray[] };
  if (reset || !win.__calcoBackgrounds) win.__calcoBackgrounds = [];
  const held = win.__calcoBackgrounds;
  const bmp = await createImageBitmap(await (await fetch(`data:${bg.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,` + bg)).blob());
  const w = Math.round(bmp.width / 2);
  const h = Math.round(bmp.height / 2);
  const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bmp, 0, 0, w, h);
  const a = ctx.getImageData(0, 0, w, h).data;
  let isFlat = true;
  for (let k = 4; k < a.length && isFlat; k += 4) {
    if (Math.abs(a[k] - a[0]) > tol || Math.abs(a[k + 1] - a[1]) > tol || Math.abs(a[k + 2] - a[2]) > tol) isFlat = false;
  }
  const flat = isFlat ? '#' + [a[0], a[1], a[2]].map((v) => v.toString(16).padStart(2, '0')).join('') : null;
  let match = -1;
  let stored = false;
  if (!flat) {
    match = held.findIndex((rep) => rep.length === a.length && rep.every((v, k) => Math.abs(v - a[k]) <= tol));
    // Bounded: a deck with a different picture on every slide would otherwise hold one decoded copy per slide.
    if (match < 0 && held.length < 32) {
      held.push(a);
      stored = true;
    }
  }
  return { flat, match, stored };
}

/**
 * In the page: whether anything in the slide reads the paint behind it (`mix-blend-mode`,
 * `backdrop-filter`), the one thing a transparent foreground cannot reproduce. Layers
 * composite exactly in every other case.
 */
export function readsBackdrop(section: HTMLElement): boolean {
  const win = section.ownerDocument.defaultView as Window;
  return [section, ...section.querySelectorAll('*')].some((el) =>
    [undefined, '::before', '::after'].some((p) => {
      const cs = win.getComputedStyle(el, p);
      return (cs.mixBlendMode && cs.mixBlendMode !== 'normal') || (cs.backdropFilter && cs.backdropFilter !== 'none');
    }),
  );
}

/**
 * In the page: the share of pixels where the foreground `fg` over the background `bg`
 * differs from the opaque picture `full` by more than `tol` per channel. Only asked of a slide
 * that `readsBackdrop`.
 */
export async function splitError(_section: HTMLElement, { bg, fg, full, tol }: { bg: string; fg: string; full: string; tol: number }): Promise<number> {
  const load = async (b64: string) => {
    const bmp = await createImageBitmap(await (await fetch(`data:${b64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,` + b64)).blob());
    const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  };
  const [f, o, b] = [await load(fg), await load(full), await load(bg)];
  let off = 0;
  for (let k = 0; k < o.length; k += 4) {
    const al = f[k + 3] / 255;
    for (let c = 0; c < 3; c++) if (Math.abs(f[k + c] * al + b[k + c] * (1 - al) - o[k + c]) > tol) { off++; break; }
  }
  return off / (o.length / 4);
}

/**
 * In the page: what the slide's deck logo looks like, as a key. Two slides whose logos have the same key
 * (the file, the size, the tint filter, the opacity, the plate) draw the same pixels, so one photograph of the
 * logo serves both. Null when the slide has no logo. Self-contained, like `readSlide`.
 */
export function logoKey(section: HTMLElement): string | null {
	const win = section.ownerDocument.defaultView as Window & typeof globalThis;
	const logo = (Array.from(section.children) as HTMLElement[]).find((el) => el.localName === 'img' && el.classList.contains('deck-logo')) as HTMLImageElement | undefined;
	if (!logo) return null;
	const cs = win.getComputedStyle(logo);
	const props = ['width', 'height', 'opacity', 'filter', 'background-color', 'background-image', 'backdrop-filter', 'padding', 'border-radius', 'box-sizing', 'object-fit', 'mix-blend-mode'];
	const tint = section.querySelector(':scope > svg.deck-logo-tint');
	return [logo.currentSrc || logo.src, ...props.map((k) => `${k}:${cs.getPropertyValue(k)}`), tint ? tint.innerHTML : ''].join('|');
}

/**
 * In the page: how much of the foreground picture `fg` is drawn outside the `boxes` (slide px) that its
 * pictures will cover (sprites are only safe when nothing is left outside them), and, when that is
 * little enough, each box cropped from `fg` as a picture of its own. A fully opaque crop of continuous
 * tone is a JPEG when that is much smaller, by the host's sizes rule (`CropEncoding`);
 * a crop with any transparency is a PNG, since a JPEG would paint it black. Cropping the capture
 * already taken costs a few milliseconds a picture; shooting each one again cost a render each.
 */
export async function cropPictures(section: HTMLElement, { fg, boxes, rules }: { fg: string; boxes: PictureBox[]; rules: CropRules }): Promise<CropResult> {
  // Layout size, not the transformed box: the reader's coordinates are in layout px.
  const w = section.offsetWidth;
  const h = section.offsetHeight;
  const bmp = await createImageBitmap(await (await fetch(`data:${fg.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,` + fg)).blob());
  // Inspect at slide-px resolution: the question is whether anything is uncovered, and the full capture is
  // four times the pixels for the same answer.
  const small = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  small.drawImage(bmp, 0, 0, w, h);
  const d = small.getImageData(0, 0, w, h).data;
  const inside = new Uint8Array(w * h);
  const solid = (x: number, y: number) => d[(y * w + x) * 4 + 3] >= 250;
  // The ink in a rectangle, as the smallest rectangle that holds it (null when there is none).
  const inkOf = (x0: number, y0: number, x1: number, y1: number): Box | null => {
    let ix0 = x1;
    let iy0 = y1;
    let ix1 = x0;
    let iy1 = y0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (d[(y * w + x) * 4 + 3] > 8) {
          if (x < ix0) ix0 = x;
          if (x >= ix1) ix1 = x + 1;
          if (y < iy0) iy0 = y;
          if (y >= iy1) iy1 = y + 1;
        }
      }
    }
    if (ix1 <= ix0 || iy1 <= iy0) return null;
    const x = Math.max(x0, ix0 - 1);
    const y = Math.max(y0, iy0 - 1);
    return { x, y, w: Math.min(x1, ix1 + 1) - x, h: Math.min(y1, iy1 + 1) - y };
  };
  const opaqueShare = (r: Box) => {
    let n = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (solid(x, y)) n++;
    return n / (r.w * r.h);
  };
  // The largest fully opaque rectangle inside r that keeps at least `keep` of its area, by trimming whichever
  // edge has the most clear pixels until none of the four has any. A photo beside a thin rule or a soft corner
  // is a JPEG of the photo and a PNG of the rest, not a PNG of both.
  const opaqueCore = (r: Box, keep: number): Box | null => {
    let [x0, y0, x1, y1] = [r.x, r.y, r.x + r.w, r.y + r.h];
    // The share of clear pixels along a column (`x` fixed) or a row (`y` fixed), between `from` and `to`.
    const column = (x: number, from: number, to: number) => {
      let n = 0;
      for (let y = from; y < to; y++) if (!solid(x, y)) n++;
      return n / Math.max(1, to - from);
    };
    const row = (y: number, from: number, to: number) => {
      let n = 0;
      for (let x = from; x < to; x++) if (!solid(x, y)) n++;
      return n / Math.max(1, to - from);
    };
    while (x1 > x0 && y1 > y0 && (x1 - x0) * (y1 - y0) >= keep * r.w * r.h) {
      const edges = [column(x0, y0, y1), column(x1 - 1, y0, y1), row(y0, x0, x1), row(y1 - 1, x0, x1)];
      const worst = Math.max(...edges);
      if (worst === 0) {
        // Edges alone do not make a rectangle opaque (a frame with a clear middle): look at all of it.
        const core = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        return opaqueShare(core) === 1 ? core : null;
      }
      const i = edges.indexOf(worst);
      if (i === 0) x0++;
      else if (i === 1) x1--;
      else if (i === 2) y0++;
      else y1--;
    }
    return null;
  };
  const k = bmp.width / w;
  // The host's picture writer, when it named one (CropEncoding.encoder); else the canvas's own encoders.
  type Writer = (canvas: OffscreenCanvas, format: { type: 'png' | 'jpeg'; quality?: number }) => Uint8Array | Promise<Uint8Array>;
  const writer = rules.encoder ? ((globalThis as unknown as Record<string, Writer | undefined>)[rules.encoder] ?? null) : null;
  if (rules.encoder && typeof writer !== 'function') throw new Error(`cropPictures: the page has no ${rules.encoder}() to write pictures with`);
  const write = async (canvas: OffscreenCanvas, type: 'png' | 'jpeg') => {
    const bytes = writer
      ? await writer(canvas, type === 'jpeg' ? { type, quality: Math.round(rules.quality * 100) } : { type })
      : new Uint8Array(await (await canvas.convertToBlob(type === 'jpeg' ? { type: 'image/jpeg', quality: rules.quality } : { type: 'image/png' })).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
    return { size: bytes.length, data: btoa(bin) };
  };
  const encode = async (r: Box, opaque: boolean, photo?: boolean): Promise<Piece> => {
    const sx = Math.round(r.x * k);
    const sy = Math.round(r.y * k);
    const sw = Math.max(1, Math.round(r.w * k));
    const sh = Math.max(1, Math.round(r.h * k));
    const canvas = new OffscreenCanvas(sw, sh);
    (canvas.getContext('2d') as OffscreenCanvasRenderingContext2D).drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
    let pick: { size: number; data: string };
    let jpeg = false;
    if (opaque && !rules.lossless) {
      const jpg = await write(canvas, 'jpeg');
      if (jpg.size >= rules.toneBytes) {
        pick = jpg;
        jpeg = true;
      } else {
        const png = await write(canvas, 'png');
        // A flat picture under the size threshold stays a lossless PNG; a photograph is a JPEG whenever that is much smaller.
        jpeg = (photo || png.size > rules.flatBytes) && jpg.size < png.size * rules.share;
        pick = jpeg ? jpg : png;
      }
    } else pick = await write(canvas, 'png');
    return { x: r.x, y: r.y, w: r.w, h: r.h, data: pick.data, jpeg };
  };
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x));
    const x1 = Math.min(w, Math.ceil(b.x + b.w));
    for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(h, Math.ceil(b.y + b.h)); y++) inside.fill(1, y * w + x0, y * w + x1);
  }
  const images: Piece[][] = [];
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x));
    const y0 = Math.max(0, Math.floor(b.y));
    const x1 = Math.min(w, Math.ceil(b.x + b.w));
    const y1 = Math.min(h, Math.ceil(b.y + b.h));
    // Each box shrinks to the ink in it: a photo that fills half the slide is half the slide, however wide the
    // transparent items around it made the cluster. A box with no ink is no picture.
    const t = inkOf(x0, y0, x1, y1);
    const parts: Piece[] = [];
    if (t) {
      // A JPEG paints a clear pixel black, so only a crop with none is one.
      const share = opaqueShare(t);
      const core = share < 1 && !b.lone && t.w * t.h >= 40000 ? opaqueCore(t, 0.4) : null;
      if (share === 1) parts.push(await encode(t, true, b.photo));
      else if (core) {
        // Splitting a picture exists to keep a photo a JPEG without painting its clear corners black. If the
        // core would not be a JPEG anyway, one PNG of the whole crop is one object, not five.
        const middle = await encode(core, true, b.photo);
        if (!middle.jpeg) parts.push(await encode(t, false));
        else {
          parts.push(middle);
          // What surrounds the core: four strips, each cut to its own ink.
          const around: Array<[number, number, number, number]> = [
            [t.x, t.y, t.x + t.w, core.y],
            [t.x, core.y + core.h, t.x + t.w, t.y + t.h],
            [t.x, core.y, core.x, core.y + core.h],
            [core.x + core.w, core.y, t.x + t.w, core.y + core.h],
          ];
          for (const [ax0, ay0, ax1, ay1] of around) {
            const r = ax1 > ax0 && ay1 > ay0 ? inkOf(ax0, ay0, ax1, ay1) : null;
            if (r) parts.push(await encode(r, false));
          }
        }
      } else parts.push(await encode(t, false));
    }
    images.push(parts);
  }
  // Ink outside every picture: what the reader did not see (a column rule, a stray overlay). More than a soft tail
  // of a shadow is one picture of its own, with the pictures' boxes cleared out of it.
  let outside = 0;
  let rx0 = w;
  let ry0 = h;
  let rx1 = 0;
  let ry1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (inside[i] || d[i * 4 + 3] <= 8) continue;
      outside++;
      if (x < rx0) rx0 = x;
      if (x >= rx1) rx1 = x + 1;
      if (y < ry0) ry0 = y;
      if (y >= ry1) ry1 = y + 1;
    }
  }
  let residual: (Box & { data: string }) | null = null;
  if (outside / (w * h) > rules.maxOutside) {
    const r = { x: Math.max(0, rx0 - 1), y: Math.max(0, ry0 - 1), w: Math.min(w, rx1 + 1) - Math.max(0, rx0 - 1), h: Math.min(h, ry1 + 1) - Math.max(0, ry0 - 1) };
    const sw = Math.max(1, Math.round(r.w * k));
    const sh = Math.max(1, Math.round(r.h * k));
    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bmp, Math.round(r.x * k), Math.round(r.y * k), sw, sh, 0, 0, sw, sh);
    for (const b of boxes) ctx.clearRect(Math.floor((b.x - r.x) * k), Math.floor((b.y - r.y) * k), Math.ceil(b.w * k) + 1, Math.ceil(b.h * k) + 1);
    residual = { x: r.x, y: r.y, w: r.w, h: r.h, data: (await write(canvas, 'png')).data };
  }
  return { residual, images };
}

/**
 * Put the cropped pictures into the slide's shapes. Each picture takes the box of its ink and becomes one
 * picture per piece (a photo, and the thin rule beside it); a box with no ink is no picture. Ink that no
 * picture accounts for is one more picture, placed first (under everything), which is where the old
 * whole-slide picture sat. Shapes refer to each other by index (`group`, `sub`, and a frame's `group` and `above`), so
 * every index is moved to where its shape went.
 */
export function placePictures(read: { shapes: Shape[]; frames: TextFrame[] }, pics: Shape[], got: CropResult): void {
  const pieces = new Map(pics.map((sh, k) => [sh, got.images[k] || []]));
  const next: Shape[] = [];
  if (got.residual) next.push({ kind: 'picture', x: got.residual.x, y: got.residual.y, w: got.residual.w, h: got.residual.h, image: fromBase64(got.residual.data) });
  const moved = new Map<number, number>();
  const lastPiece = new Map<number, number>(); // old index of a picture → where its last piece went
  // The pieces of one picture, so they can be one object (a group, or a part of their card's group).
  const whole: Array<{ first: number; count: number; inCard: boolean }> = [];
  read.shapes.forEach((sh, i) => {
    if (sh.kind !== 'picture') {
      moved.set(i, next.length);
      next.push(sh);
      return;
    }
    const list = pieces.get(sh) ?? [];
    const first = next.length;
    for (const [k, img] of list.entries()) {
      if (k === 0) moved.set(i, next.length);
      // The description belongs to the first piece; the strips beside a photo are the same picture.
      const piece = { ...sh, x: img.x, y: img.y, w: img.w, h: img.h, image: fromBase64(img.data) };
      if (k > 0) delete piece.alt;
      next.push(piece);
    }
    if (list.length) lastPiece.set(i, next.length - 1);
    if (list.length > 1) whole.push({ first, count: list.length, inCard: sh.group !== undefined });
  });
  const to = (old: number | undefined) => (old === undefined ? undefined : moved.get(old));
  for (const sh of next) {
    for (const key of ['group', 'sub'] as const) {
      if (sh[key] === undefined) continue;
      const at = to(sh[key]);
      if (at === undefined) delete sh[key];
      else sh[key] = at;
    }
  }
  for (const f of read.frames) {
    if (f.above !== undefined) {
      const over = lastPiece.get(f.above);
      if (over === undefined) delete f.above;
      else f.above = over;
    }
    if (f.group === undefined) continue;
    const at = to(f.group);
    if (at === undefined) delete f.group;
    else f.group = at;
  }
  // One picture in several pieces moves as one: its own group, or a nested part of the card it sits in.
  for (const { first, count, inCard } of whole) {
    for (let k = 0; k < count; k++) {
      if (inCard) next[first + k].sub = first;
      else next[first + k].group = first;
    }
  }
  read.shapes = next;
}


// Per channel, the most two backgrounds may differ and still be one: a gradient dithers by a
// level between slides that draw the same thing.
const BACKGROUND_TOLERANCE = 3;
// A slide that reads the paint behind it, and whose foreground over its background misses the
// opaque picture by more than this share of its pixels, keeps its own opaque picture instead
// of sharing a background.
const SPLIT_BAD_SHARE = 0.001;
// Ink in the foreground that no picture covers (a column rule, say) is one more picture when it is more than
// this share of the slide's pixels; less is the soft tail of a shadow past a picture's margin, and is dropped.
const SPRITE_OUTSIDE_SHARE = 0.0002;

/** Which photograph of a slide: its own paint alone, its content over transparency, or the whole slide opaque. */
export type Shot = 'background' | 'foreground' | 'full';

/** What a host gives the capture. `i` is the slide's index. */
export interface CaptureHost {
	/** Call `fn(section, arg)` in the page that holds slide `i`, and return what it returns. */
	run<T = unknown>(i: number, fn: (section: HTMLElement, arg: never) => unknown, arg?: unknown): Promise<T>;
	/** Photograph slide `i` as it now looks. `background`: opaque, a picture or a flat color. `foreground`: PNG with the slide's own paint transparent. `full`: opaque PNG. */
	shoot(i: number, kind: Shot): Promise<Uint8Array>;
	/** The render watchdog, applied per slide. One guard around a whole loop failed every deck past ~60 slides. */
	guard?<T>(i: number, fn: () => Promise<T>): Promise<T>;
}

/** The rules a crop is encoded by: the host's encoding, or lossless when it gave none. */
function cropRules(encoding?: CropEncoding): CropRules {
	if (!encoding) return { maxOutside: SPRITE_OUTSIDE_SHARE, lossless: true, quality: 1, toneBytes: 0, flatBytes: 0, share: 0 };
	// The rules travel into the page as JSON, where a NaN or an Infinity becomes null and every comparison against it turns false or true by accident.
	// A host written for an older shape (`{ mode, quality }`) lands here too: say so, loudly, rather than encode every crop twice and keep a PNG.
	for (const key of ['quality', 'toneBytes', 'flatBytes', 'share'] as const) {
		if (!encoding.lossless && !Number.isFinite(encoding[key])) throw new Error(`captureOfficeSlides: pictures.${key} must be a finite number (pictures is { lossless?, quality, toneBytes, flatBytes, share }; see CropEncoding)`);
	}
	if (encoding.encoder !== undefined && (typeof encoding.encoder !== 'string' || !encoding.encoder)) throw new Error('captureOfficeSlides: pictures.encoder must be the name of a page global');
	return { maxOutside: SPRITE_OUTSIDE_SHARE, ...encoding };
}

export interface CaptureOptions {
	/** `false` keeps the one slide-sized foreground picture instead of cropped pictures. */
	sprites?: boolean;
	/**
	 * What to do with a slide that reads the paint behind it (a blend, a backdrop blur). `'check'` (default) shoots its
	 * layers and keeps them when they add back up to the whole slide. `'whole'` keeps one picture without trying, for a
	 * host whose rasterizer cannot composite such layers exactly (the Studio's html-to-image), where the check would
	 * cost three photographs and fail.
	 */
	backdrop?: 'check' | 'whole';
	/** How the pictures cropped from a slide (photos, icons) are encoded; absent, each is a lossless PNG. */
	pictures?: CropEncoding;
	/** A slide fell back to a simpler capture; say why. */
	onWarn?(message: string): void;
}

export interface CapturedSlide extends Slide {
	approximated?: string[];
}

/**
 * Capture every slide in editable mode: each is READ (its text becomes frames) and photographed
 * twice, then handed back with its background index, ready for `writeOdp` / `writePptx`.
 */
export async function captureOfficeSlides(host: CaptureHost, count: number, options: CaptureOptions = {}): Promise<{ slides: CapturedSlide[]; backgrounds: Background[] }> {
	// Refuse a bad `pictures` shape before any slide is touched, not when the first crop is reached.
	const rules = cropRules(options.pictures);
	const slides: CapturedSlide[] = [];
	const backgrounds: Background[] = [];
	// Each image background the page remembers: its index in `backgrounds`, or null until a slide uses it.
	const imageIndexes: Array<number | null> = [];
	// Slides that paint the same background (same `splitKey`) share one photograph and one answer.
	const seen = new Map<string, { bg: Uint8Array; flat: string | null; slot: number; own?: number }>();
	// The deck logo is its own picture on every slide: shot once per look (file, size, tint, plate), placed per slide.
	const logos = new Map<string, { dx: number; dy: number; w: number; h: number; image: Uint8Array } | null>();
	const guard = host.guard ? host.guard.bind(host) : <T>(_i: number, fn: () => Promise<T>) => fn();
	// The whole slide, without its logo: the logo is a picture of its own.
	const shootWhole = async (i: number) => {
		await host.run(i, splitSlide, 'nologo');
		try {
			return await host.shoot(i, 'full');
		} finally {
			await host.run(i, restoreSplit);
		}
	};
	const addLogo = async (i: number, read: ReturnType<typeof readSlide>) => {
		if (!read.logo) return;
		const key = await host.run<string | null>(i, logoKey);
		if (!key) return;
		let look = logos.get(key);
		if (look === undefined) {
			// The logo alone over transparency, cropped to its own ink: its alpha is kept, and so is whatever plate it has.
			await host.run(i, splitSlide, 'logo');
			let shot: Uint8Array;
			try {
				shot = await host.shoot(i, 'foreground');
			} finally {
				await host.run(i, restoreSplit);
			}
			const got = await host.run<CropResult>(i, cropPictures, {
				fg: toBase64(shot),
				boxes: [{ x: read.logo.x, y: read.logo.y, w: read.logo.w, h: read.logo.h, lone: true }],
				rules,
			});
			const part = got.images[0]?.[0];
			look = part ? { dx: part.x - read.logo.x, dy: part.y - read.logo.y, w: part.w, h: part.h, image: fromBase64(part.data) } : null;
			logos.set(key, look);
		}
		if (!look) return;
		// Last, so it is above everything the slide draws but its text.
		read.shapes.push({ kind: 'picture', x: read.logo.x + look.dx, y: read.logo.y + look.dy, w: look.w, h: look.h, image: look.image, alt: read.logo.alt || 'Logo' });
	};
	for (let i = 0; i < count; i++) {
		slides.push(
			await guard(i, async () => {
				const reads = await host.run<boolean>(i, readsBackdrop);
				if (reads && options.backdrop === 'whole') {
					try {
						const whole = await host.run<ReturnType<typeof readSlide>>(i, readSlide, { hide: true, shapes: true, sprites: false, logo: true });
						const image = new Uint8Array(await shootWhole(i));
						await addLogo(i, whole);
						return { image, frames: whole.frames, shapes: whole.shapes, approximated: whole.approximated };
					} finally {
						await host.run(i, restoreSlide);
					}
				}
				const key = await host.run<string>(i, splitKey);
				let known = seen.get(key);
				if (!known) {
					// The slide's own paint, with everything inside it hidden.
					await host.run(i, splitSlide, 'background');
					let bg: Uint8Array;
					try {
						bg = await host.shoot(i, 'background');
					} finally {
						await host.run(i, restoreSplit);
					}
					const m = await host.run<{ flat: string | null; match: number; stored: boolean }>(i, describeBackground, { bg: toBase64(bg), tol: BACKGROUND_TOLERANCE, reset: i === 0 });
					// The page remembers a new image background as soon as it sees it, so the host keeps a slot for it too.
					if (m.stored) imageIndexes.push(null);
					known = { bg, flat: m.flat, slot: m.stored ? imageIndexes.length - 1 : m.match };
					seen.set(key, known);
				}
				// Pictures: what cannot be a shape is cropped out of the foreground as pictures of its own, each in paint
				// order (`sprites`). A slide that reads its backdrop, or whose foreground has ink outside every crop, keeps
				// the one foreground picture instead.
				let read!: ReturnType<typeof readSlide>;
				let fg!: Uint8Array;
				let withSprites = false;
				try {
					for (const trySprites of options.sprites !== false && !reads ? [true, false] : [false]) {
						read = await host.run(i, readSlide, { hide: true, shapes: true, sprites: trySprites, logo: true });
						await host.run(i, splitSlide, 'foreground');
						try {
							fg = await host.shoot(i, 'foreground');
							if (trySprites) {
								try {
									const pics = read.shapes.filter((sh) => sh.kind === 'picture');
									const got = await host.run<CropResult>(i, cropPictures, {
										fg: toBase64(fg),
										boxes: pics.map((sh) => ({ x: sh.x, y: sh.y, w: sh.w, h: sh.h, photo: !!sh.photo })),
										rules,
									});
									placePictures(read, pics, got);
									withSprites = true;
								} catch (e) {
									// Cropping failed (a capture too big to decode, say): undo this read and take the one-picture path.
									// The `finally` below ends the split before the next read.
									options.onWarn?.(`pictures of slide ${i + 1} failed (${e instanceof Error ? e.message : e}); keeping one whole-slide picture`);
									await host.run(i, restoreSlide);
									continue;
								}
							}
						} finally {
							await host.run(i, restoreSplit);
						}
						break;
					}
					if (reads) {
						// Something here reads what is behind it: prove the layers add back up, or keep the old picture.
						const full = await shootWhole(i);
						const bad = await host.run<number>(i, splitError, { bg: toBase64(known.bg), fg: toBase64(fg), full: toBase64(full), tol: 16 });
						if (bad > SPLIT_BAD_SHARE) {
							await addLogo(i, read);
							return { image: new Uint8Array(full), frames: read.frames, shapes: read.shapes, approximated: read.approximated };
						}
					}
					let index: number;
					if (known.flat) {
						const flat = known.flat;
						index = backgrounds.findIndex((b) => b.color === flat);
						if (index < 0) index = backgrounds.push({ color: flat }) - 1;
					} else if (known.slot < 0) {
						// The page was full and did not remember it; it stands alone.
						if (known.own === undefined) known.own = backgrounds.push({ image: new Uint8Array(known.bg) }) - 1;
						index = known.own;
					} else {
						// A remembered background, or the one this slide added; its slot is empty until a slide uses it.
						if (imageIndexes[known.slot] == null) imageIndexes[known.slot] = backgrounds.push({ image: new Uint8Array(known.bg) }) - 1;
						index = imageIndexes[known.slot] as number;
					}
					await addLogo(i, read);
					return { image: withSprites ? undefined : new Uint8Array(fg), frames: read.frames, shapes: read.shapes, background: index, approximated: read.approximated };
				} finally {
					await host.run(i, restoreSlide);
				}
			}),
		);
	}
	return { slides, backgrounds };
}
