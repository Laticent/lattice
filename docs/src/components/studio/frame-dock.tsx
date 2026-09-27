import * as React from 'react';
import { createPortal } from 'react-dom';
import DeckPreview from '@/components/DeckPreview';
import { slideFrameStyle } from '@/lib/slide-frame';
import type { PooledPreviewProps } from './preview-pool';
import { hasMermaid } from './slide-thumb';

// ── THE FRAME DOCK: ONE SET OF PREVIEW FRAMES FOR THE WHOLE STUDIO ──────────────────
//
// WHY. `preview-pool.tsx` stops a grid minting a preview document per tile SCROLLED past,
// because WebKit never gives a destroyed preview document back. It could not stop a surface
// that CLOSES: the pool lived inside the grid, so closing the Add slide dialog, the deck
// panel, Present's overview or Reshape destroyed its frames, and every reopen minted a fresh
// set. Measured on real WebKit, six open/close cycles: the deck panel +128 → +276 MB, Add
// slide +169 → +391 MB (followups.d/2391-p3). Chromium reclaims and stays flat.
//
// WHAT. The frames live HERE, in one layer that is mounted for the Studio's lifetime and never
// unmounts. A grid's pool BORROWS slots from the dock and gives them back when the grid closes;
// a slot given back keeps its document, so the next open re-points it through
// `single-slide-render`'s patch path instead of minting a realm.
//
// HOW A FRAME STAYS ON ITS TILE: CSS anchor positioning. The tile is the anchor
// (`anchor-name`), the frame is placed with `anchor()` / `anchor-size()`, and the browser keeps
// it there through scrolling and layout with no script — the property the in-grid layer had by
// living inside the scroll content, which is exactly what a dock outside the grid would lose to
// a JS scroll sync. Measured in WebKit 26 and Chromium: the frame tracks a tile inside a scrolled
// fixed-position dialog exactly.
//
// FOUR CONDITIONS, each found by measurement:
//  1. TREE ORDER. A frame only resolves its anchor when the anchor comes BEFORE it in the
//     document (a fixed layer placed before the dialog resolved nothing, on both engines). Radix
//     portals a dialog to the END of `<body>` when it opens, which is after anything mounted
//     earlier. So the dock creates two roots at the end of `<body>`, in order — `surfacesRoot()`
//     then the dock — and the pooled surfaces portal into the first (`container` on
//     DialogContent / SheetContent / PopoverContent). Their own menus and tooltips still portal
//     to the end of `<body>`, after the dock, so they paint above the frames.
//  2. CLIPPING. A frame is not inside its tile's scroller any more, so nothing clips it: a tile
//     scrolled out of the dialog would paint its frame over the dialog's header. Wrapping the frame
//     in `overflow: hidden` boxes does not work — an anchored element only resolves an anchor
//     outside its own subtree when its containing block is the viewport, so the frame must be
//     `position: fixed`, and a fixed element escapes every ancestor's overflow (measured: nested
//     absolute wrappers resolved nothing, on both engines). What does clip it is `clip-path` on
//     the slot's viewport-sized root (measured on both engines): the root is set to the
//     intersection of the tile's clipping ancestors, in viewport coordinates — the scrollports,
//     which do not move when the grid scrolls. The pool recomputes it on resize, on any scroll
//     (a nested scroller moves its own clip), and when an animation settles.
//  3. NO TRANSFORMS. Anchor positioning places a frame by layout and ignores transforms, so a
//     grid under a lasting transform gets frames offset by it — see `underStaticTransform`.
//  4. STACKING. A frame must paint above its own surface and below anything opened over it.
//     Its root takes the z-index of the tile's outermost stacking ancestor (Present's overlay is
//     z-102, a dialog z-50, the inspector none); being later in tree order at that z puts it just
//     above the surface, and a later body-end overlay at the same z paints above it again.
//
// WHERE IT DOES NOT APPLY. `dockSupported()` is false without anchor positioning (Firefox
// before it shipped, Safari before 26, jsdom) and when no <FrameDockHost> is mounted; the pool
// then keeps its frames in the grid as before. Nothing changes for those engines.

/** A rectangle in viewport pixels. */
export type Clip = { top: number; left: number; right: number; bottom: number };

export type DockSlot = {
	id: number;
	/** The pool holding this slot, or null when it is free. */
	owner: number | null;
	/** What it shows — kept after release, so the document stays alive and patchable. */
	props: PooledPreviewProps | null;
	/** Where it goes: the tile's anchor name, or null to hide it. */
	anchor: string | null;
	/** The visible region of the tile's scrollers, in viewport pixels — the frame is clipped to it. */
	clip: Clip | null;
	/** Stacking: the z-index of the tile's surface. */
	z: number;
	/** Which surface, in the order surfaces opened (`surfaceLayer`): at an equal z, only the newest shows. */
	layer: number;
	/** Bumped when the slot must be rebuilt (see preview-pool's identity partition). */
	gen: number;
	/** The shape and identity the slot's document was built for (preview-pool's keys). */
	key: string;
	idk: string;
};

// The global ceiling across every pool — the same stop the per-grid pool used.
import { DOCK_MAX_SLOTS } from './frame-dock-limits';

export { DOCK_MAX_SLOTS };

let slots: DockSlot[] = [];
let nextSlotId = 1;
const listeners = new Set<() => void>();
let version = 0;
let hostMounted = 0;

function emit() {
	version++;
	for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
	listeners.add(l);
	return () => listeners.delete(l);
};
const snapshot = () => version;

let anchorsOk: boolean | null = null;
/** CSS anchor positioning, as the dock uses it. */
function anchorsSupported(): boolean {
	if (anchorsOk === null) {
		anchorsOk =
			typeof CSS !== 'undefined' &&
			typeof CSS.supports === 'function' &&
			CSS.supports('anchor-name: --a') &&
			CSS.supports('position-anchor: --a') &&
			CSS.supports('top: anchor(top)') &&
			CSS.supports('width: anchor-size(width)');
	}
	return anchorsOk;
}

/**
 * Whether the pool rooted at `el` may borrow from the dock: the dock is in use AND `el` comes
 * before it in the document — condition 1 above. Asked per pool, so a surface that was not routed
 * into `surfacesRoot()` (a future grid that forgets its `container`) keeps its frames in its own layer instead of
 * painting unanchored frames at the top-left of the page.
 */
export function canDock(el: Element | null): boolean {
	if (!el || !dockSupported()) return false;
	const r = ensureRoots();
	return !!r && !!(el.compareDocumentPosition(r.dock) & Node.DOCUMENT_POSITION_FOLLOWING) && !underStaticTransform(el);
}

/**
 * Is `el` under a transform that will STAY? Anchor positioning places a frame by LAYOUT, ignoring
 * transforms, so a grid inside a transformed box would get frames offset by the transform —
 * measured: every frame ~630 px down and right of its tile in a dialog centered with
 * `translate(-50%, -50%)`. Such a pool keeps its own frames. A transform that belongs to a running
 * animation (a dialog's zoom-in) is not a reason: it ends in a few hundred milliseconds.
 */
function underStaticTransform(el: Element): boolean {
	if (typeof getComputedStyle !== 'function') return false;
	for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
		const cs = getComputedStyle(a);
		// A zero translate, unit scale or identity matrix moves nothing (Tailwind's `translate-x-0`
		// computes to `0px 0px`, not `none`).
		const moved =
			(!!cs.transform && !/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(cs.transform)) ||
			(!!cs.translate && !/^(none|0px( 0px){0,2})$/.test(cs.translate)) ||
			(!!cs.scale && !/^(none|1( 1){0,2})$/.test(cs.scale));
		if (moved && !(typeof (a as HTMLElement).getAnimations === 'function' && (a as HTMLElement).getAnimations().length)) return true;
	}
	return false;
}

/** Whether pools should borrow from the dock right now. */
export function dockSupported(): boolean {
	return hostMounted > 0 && anchorsSupported();
}

let roots: { surfaces: HTMLElement; dock: HTMLElement } | null = null;
function ensureRoots() {
	if (roots || typeof document === 'undefined') return roots;
	// A hot reload of this module in dev leaves the previous roots in the page; replace them rather
	// than append a second pair with the same ids.
	document.getElementById('lattice-surfaces')?.remove();
	document.getElementById('lattice-frame-dock')?.remove();
	const surfaces = document.createElement('div');
	surfaces.id = 'lattice-surfaces';
	const dock = document.createElement('div');
	dock.id = 'lattice-frame-dock';
	dock.setAttribute('aria-hidden', 'true');
	document.body.append(surfaces, dock);
	roots = { surfaces, dock };
	return roots;
}

/**
 * The portal container for a surface whose tiles borrow dock frames. Undefined when the dock is
 * not in use, so the surface portals to `document.body` exactly as before.
 */
export function surfacesRoot(): HTMLElement | undefined {
	return dockSupported() ? (ensureRoots()?.surfaces ?? undefined) : undefined;
}

/** A free slot for `owner`: one whose document already has this identity (and ideally shape),
 *  else a new one under the ceiling, else — last resort — a free slot of another identity,
 *  rebuilt. Null when every slot is held. `exactOrNew`: a free slot of this exact identity AND shape,
 *  else a NEW one under the ceiling — never a rebuilt one, since a rebuild is the full rewrite the
 *  caller is trying to avoid. */
export function acquireSlot(owner: number, idk: string, key: string, exactOrNew = false): DockSlot | null {
	const free = slots.filter((s) => s.owner === null);
	if (exactOrNew) {
		let hit = free.find((s) => s.idk === idk && s.key === key);
		if (!hit && slots.length < DOCK_MAX_SLOTS) {
			hit = { id: nextSlotId++, owner: null, props: null, anchor: null, clip: null, z: 0, layer: 0, gen: 0, key, idk };
			slots = [...slots, hit];
		}
		if (hit) hit.owner = owner;
		return hit ?? null;
	}
	let slot = free.find((s) => s.idk === idk && s.key === key) ?? free.find((s) => s.idk === idk);
	if (!slot && slots.length < DOCK_MAX_SLOTS) {
		slot = { id: nextSlotId++, owner: null, props: null, anchor: null, clip: null, z: 0, layer: 0, gen: 0, key, idk };
		slots = [...slots, slot];
	}
	if (!slot) {
		const spare = free[0];
		if (!spare) return null;
		spare.idk = idk;
		spare.gen++;
		spare.props = null;
		slot = spare;
	}
	slot.owner = owner;
	return slot;
}

/** Point a held slot at a tile (or hide it with `anchor: null`). */
export function updateSlot(id: number, patch: Partial<Pick<DockSlot, 'props' | 'anchor' | 'clip' | 'z' | 'key' | 'layer'>>) {
	const i = slots.findIndex((s) => s.id === id);
	if (i < 0) return;
	slots = slots.map((s) => (s.id === id ? { ...s, ...patch } : s));
	emit();
}

/** A slot's current state, or undefined. */
export function dockSlot(id: number): DockSlot | undefined {
	return slots.find((s) => s.id === id);
}

/** Several `updateSlot`s in one change, so a pass re-renders the dock once. */
export function updateSlots(patches: { id: number; patch: Partial<Pick<DockSlot, 'props' | 'anchor' | 'clip' | 'z' | 'key' | 'layer'>> }[]) {
	if (!patches.length) return;
	const byId = new Map(patches.map((p) => [p.id, p.patch]));
	slots = slots.map((s) => (byId.has(s.id) ? { ...s, ...byId.get(s.id) } : s));
	emit();
}

/** Give back every slot `owner` holds. The DOCUMENT stays: props are kept, the frame is hidden. */
export function releaseSlots(owner: number) {
	let changed = false;
	slots = slots.map((s) => {
		if (s.owner !== owner) return s;
		changed = true;
		return { ...s, owner: null, anchor: null, clip: null };
	});
	if (changed) emit();
}

// ── Anchor names ────────────────────────────────────────────────────────────────────
const names = new WeakMap<Element, string>();
let nextName = 1;
/** Give `el` a stable anchor name of its own, appended to any it already carries. */
export function anchorNameOf(el: HTMLElement, prefix: string): string {
	let n = names.get(el);
	if (!n) {
		n = `--lat-${prefix}-${nextName++}`;
		names.set(el, n);
		const had = el.style.getPropertyValue('anchor-name');
		el.style.setProperty('anchor-name', had && had !== 'none' ? `${had}, ${n}` : n);
	}
	return n;
}

/**
 * The box a slot root (`fixed inset-0`) fills: the viewport WITHOUT its scrollbars, so the root
 * element's client box rather than `innerWidth`, or a page scrollbar shifts the clip's far edges.
 * jsdom reports a 0×0 client box, hence the fallback.
 */
function viewportBox(): { w: number; h: number } {
	if (typeof document === 'undefined') return { w: 0, h: 0 };
	const r = document.documentElement;
	return { w: r.clientWidth || window.innerWidth, h: r.clientHeight || window.innerHeight };
}

/** The part of the viewport `el`'s clipping ancestors leave visible, and the z-index of its surface. */
export function placementOf(el: HTMLElement): { clip: Clip; z: number } {
	const { w: vw, h: vh } = viewportBox();
	const clip: Clip = { top: 0, left: 0, right: vw, bottom: vh };
	let z = 0;
	if (typeof getComputedStyle !== 'function') return { clip, z };
	for (let a: HTMLElement | null = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
		const cs = getComputedStyle(a);
		if (/(auto|scroll|hidden|clip|overlay)/.test(`${cs.overflowX} ${cs.overflowY} ${cs.overflow}`)) {
			const r = a.getBoundingClientRect();
			clip.top = Math.max(clip.top, r.top);
			clip.left = Math.max(clip.left, r.left);
			clip.right = Math.min(clip.right, r.right);
			clip.bottom = Math.min(clip.bottom, r.bottom);
		}
		// The OUTERMOST z-indexed ancestor is the surface's stacking root; keep overwriting.
		if (cs.position !== 'static' && cs.zIndex !== 'auto') z = Number(cs.zIndex) || 0;
	}
	return { clip, z };
}

/**
 * The order a surface opened in — 0 for anything not in `surfacesRoot()` (the Studio page itself).
 *
 * Two surfaces at the SAME z-index (the phone's Settings sheet and Add slide's sheet are both z-50)
 * cannot be ordered by z. In `#lattice-surfaces` the newer one paints above the older, but every
 * frame lives in the dock, above both, so the older surface's frames showed through the newer one
 * (found by the red team at 390 px, both engines). A surface's number is fixed the first time a pool
 * inside it asks, which is when it opens; the host shows only the newest layer at each z.
 */
const layers = new WeakMap<Element, number>();
let nextLayer = 1;
export function surfaceLayer(el: Element | null): number {
	const surface = el?.closest('#lattice-surfaces > *');
	if (!surface) return 0;
	let n = layers.get(surface);
	if (n === undefined) {
		n = nextLayer++;
		layers.set(surface, n);
	}
	return n;
}

/**
 * The element inside dock slot `id` that a tile's overlay portals into — above the frame, clipped
 * with it. A tile's own chrome (Add slide's Insert bar, the overview's slide number) sits inside its
 * surface, and the dock paints above the whole surface, so a `z-10` in the tile no longer reaches
 * over the frame (found by the red team: every overview number and every Insert bar hidden).
 */
export function dockOverlayHost(id: number): HTMLElement | null {
	return document.querySelector<HTMLElement>(`#lattice-frame-dock [data-dock-overlay="${id}"]`);
}

export const sameClip = (a: Clip | null, b: Clip | null) =>
	a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.right === b.right && a.bottom === b.bottom);

// ── The host ────────────────────────────────────────────────────────────────────────
/**
 * Mount ONCE, for the Studio's lifetime. Renders every dock slot, portaled into the dock root at
 * the end of `<body>`. A free slot keeps its DeckPreview mounted — that is the whole point — and
 * is only hidden. The tree is the same three levels for every slot in every state (root → frame →
 * DeckPreview), because a changed tree would REMOUNT the DeckPreview, which is the destroyed
 * document this module exists to prevent.
 */
export function FrameDockHost() {
	React.useSyncExternalStore(subscribe, snapshot, snapshot);
	const [el, setEl] = React.useState<HTMLElement | null>(null);
	React.useEffect(() => {
		hostMounted++;
		setEl(anchorsSupported() ? (ensureRoots()?.dock ?? null) : null);
		emit();
		return () => {
			hostMounted--;
			emit();
		};
	}, []);
	if (!el) return null;
	const placed = (s: DockSlot) => s.owner !== null && s.anchor !== null && !!s.clip && s.clip.right > s.clip.left && s.clip.bottom > s.clip.top;
	// The newest surface at each z (see `surfaceLayer`).
	const top = new Map<number, number>();
	for (const s of slots) if (placed(s)) top.set(s.z, Math.max(top.get(s.z) ?? 0, s.layer));
	return createPortal(
		slots.map((s) => {
			const shown = placed(s) && s.layer === top.get(s.z);
			const c = s.clip;
			return (
				<div
					key={`${s.id}:${s.gen}`}
					data-dock-slot={s.id}
					// Which pool holds it and whether it is showing — the e2e oracles find a surface's
					// frames through these (docs/e2e/pool-frames.ts), since a docked frame is not inside
					// the surface it serves.
					data-dock-owner={s.owner ?? undefined}
					data-dock-shown={shown ? '' : undefined}
					className="pointer-events-none fixed inset-0"
					style={{
						zIndex: s.z,
						visibility: shown ? 'visible' : 'hidden',
						clipPath: shown && c ? `inset(${c.top}px ${Math.max(0, viewportBox().w - c.right)}px ${Math.max(0, viewportBox().h - c.bottom)}px ${c.left}px)` : 'inset(50%)',
					}}
				>
					<div
						data-slide-frame
						className="overflow-hidden"
						style={
							{
								position: 'fixed',
								...(shown && s.anchor
									? { positionAnchor: s.anchor, top: 'anchor(top)', left: 'anchor(left)', width: 'anchor-size(width)', height: 'anchor-size(height)' }
									: { top: 0, left: 0, width: 0, height: 0 }),
								...slideFrameStyle('flat'),
							} as React.CSSProperties
						}
					>
						{s.props ? <DeckPreview {...s.props} mermaid={s.props.mermaid ?? hasMermaid(s.props.sample)} active className="size-full" aria-hidden /> : null}
						{/* Always rendered, so the tree never changes shape and the frame never remounts. */}
						<div data-dock-overlay={s.id} className="absolute inset-0" />
					</div>
				</div>
			);
		}),
		el,
	);
}

/** Tests only. */
export function _resetDock() {
	slots = [];
	nextSlotId = 1;
	anchorsOk = null;
	emit();
}
export function _dockSlots(): readonly DockSlot[] {
	return slots;
}
