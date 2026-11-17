// Cenno — open a card next to an anchor and keep it there.
//
// What this file owns, past the arithmetic in place.ts and the reading in measure.ts:
//   - the LAYER: the card goes in the browser's top layer (`popover="manual"`), above every
//     z-index and above a fullscreen element. Without the Popover API it is a fixed element inside
//     the fullscreen element (or <body>), and a transformed containing block is corrected for.
//     When fullscreen starts or ends, the card moves with it and is raised again.
//   - SAME-FRAME placement: `open`, `move` and `update` measure and place synchronously, so a card
//     is never painted at (0, 0) or at last frame's spot.
//   - STEADY SIZE under pinch zoom: the reader zoomed to see the page, not the card, so by default
//     the card is scaled by 1 / visualViewport.scale and keeps its size on screen. Page zoom
//     (Ctrl/Cmd and +) is left alone: a reader who asks for everything bigger gets it.
//   - TRACKING: scroll (any ancestor, any frame), resize, pinch, fullscreen and size changes re-place
//     the card once per frame. A host that moves things with a transform (a zoomed slide) calls
//     `update()`, or opens with `watch: 'frame'`.
//
// Cenno never paints a color of its own (styles.ts), and `open` never moves focus (intent.ts moves it
// into a press card the keyboard opened, so its contents are reachable).

import { buildCard, type CardParts, isParts, markPart } from './card.js';
import { type Anchor, anchorRect, pinchScale, viewBounds, visiblePart } from './measure.js';
import { type PlaceOptions, place, type Side } from './place.js';
import { CENNO_CSS } from './styles.js';

export type Content = Node | CardParts | string;

export interface OpenOptions extends PlaceOptions {
	/** ARIA role of the card. Default `tooltip`. */
	role?: string;
	/** Accessible name, when the content does not name itself. */
	label?: string;
	/** Announce content changes politely (`aria-live`). For a card that follows a pointer over data. */
	live?: boolean;
	/** `steady` keeps the card's size on screen under pinch zoom (default); `follow` lets it zoom. */
	pinch?: 'steady' | 'follow';
	/** `frame` re-measures the anchor every animation frame while open, for hosts that cannot call `update()`. */
	watch?: 'events' | 'frame';
	/** Let the pointer pass through the card (a card that follows a hover must not steal it). */
	inert?: boolean;
	/** Extra class names on the card, for host styling. */
	className?: string;
}

export interface CennoCard {
	/** The card element (`.cenno`, part `card`). */
	readonly element: HTMLElement;
	/** The scrolling content box (part `content`) the content lives in. */
	readonly content: HTMLElement;
	/** The side the card is on after the last placement. */
	readonly side: Side;
	/** True while the anchor is out of view and the card is hidden. */
	readonly hidden: boolean;
	/** False once closed. */
	readonly isOpen: boolean;
	/** Replace the content, keeping the card where it is (re-placed in the same frame). */
	set(content: Content): void;
	/** Point at a new anchor without a close-and-open flash. */
	move(anchor: Anchor, options?: OpenOptions): void;
	/** Re-measure and re-place now. */
	update(): void;
	/** Remove the card. */
	close(): void;
}

export interface CennoOptions {
	/** The document to work in. Default: the global `document`. */
	document?: Document;
	/** Mount cards here instead of the top layer's default parent (an element, possibly in a shadow root). */
	host?: Element;
	/** Inject `CENNO_CSS` once into the root the cards live in. Default true. */
	css?: boolean;
}

export interface Cenno {
	readonly document: Document;
	open(anchor: Anchor, content: Content, options?: OpenOptions): CennoCard;
	/** Every card still open. */
	readonly cards: ReadonlySet<CennoCard>;
	/** Close every card and stop listening. */
	destroy(): void;
}

const STYLE_MARK = 'data-cenno-css';
let nextId = 0;

function injectCss(root: Document | ShadowRoot): void {
	const doc = root instanceof Document ? root : root.ownerDocument;
	const container = root instanceof Document ? root.head || root.documentElement : root;
	if (container.querySelector(`style[${STYLE_MARK}]`)) return;
	const style = doc.createElement('style');
	style.setAttribute(STYLE_MARK, '');
	style.textContent = CENNO_CSS;
	container.prepend(style);
}

function supportsPopover(el: HTMLElement): boolean {
	return typeof (el as HTMLElement & { showPopover?: unknown }).showPopover === 'function';
}

function fill(doc: Document, box: HTMLElement, content: Content): void {
	box.replaceChildren(typeof content === 'string' ? doc.createTextNode(content) : isParts(content) ? buildCard(doc, content) : content);
}

export function createCenno(options: CennoOptions = {}): Cenno {
	const doc = options.document ?? document;
	const fixedHost = options.host ?? null;
	if (options.css !== false) injectCss(fixedHost ? (fixedHost.getRootNode() as Document | ShadowRoot) : doc);
	const cards = new Set<CennoCard & { remount(): void }>();
	const fullscreenElement = () => doc.fullscreenElement ?? (doc as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ?? null;
	const parentNow = () => fixedHost ?? fullscreenElement() ?? doc.body;

	const onFullscreen = () => {
		for (const c of cards) c.remount();
	};
	doc.addEventListener('fullscreenchange', onFullscreen);
	doc.addEventListener('webkitfullscreenchange', onFullscreen);

	function open(anchor0: Anchor, content: Content, opts0: OpenOptions = {}): CennoCard {
		let anchor = anchor0;
		let opts = opts0;
		const win = doc.defaultView as Window;
		const el = doc.createElement('div');
		el.className = `cenno${opts.className ? ` ${opts.className}` : ''}`;
		el.id = `cenno-${++nextId}`;
		markPart(el, 'card');
		el.setAttribute('role', opts.role ?? 'tooltip');
		if (opts.label) el.setAttribute('aria-label', opts.label);
		if (opts.live) el.setAttribute('aria-live', 'polite');
		if (opts.inert) el.setAttribute('data-cenno-inert', '');
		let arrowEl: HTMLElement | null = null;
		if (opts.arrow) {
			arrowEl = doc.createElement('div');
			markPart(arrowEl, 'arrow');
			el.append(arrowEl);
		}
		const box = doc.createElement('div');
		markPart(box, 'content');
		el.append(box);
		fill(doc, box, content);

		let side: Side = opts.side ?? 'bottom';
		let hidden = false;
		let isOpen = true;
		const popover = supportsPopover(el) && !fixedHost;
		if (popover) el.setAttribute('popover', 'manual');

		const show = () => {
			if (!popover) return;
			try {
				if (el.matches(':popover-open')) el.hidePopover();
				el.showPopover();
			} catch {
				/* not connected yet, or the browser refused: the fixed fallback still positions it */
			}
		};

		function position(): void {
			if (!isOpen) return;
			const s = opts.pinch === 'follow' ? 1 : 1 / pinchScale(win);
			// The natural size, free of last frame's room limits.
			el.style.removeProperty('--cenno-room-w');
			el.style.removeProperty('--cenno-room-h');
			let w = el.offsetWidth * s;
			let h = el.offsetHeight * s;
			// The content box scrolls, so its room is the card's room less the card's own border.
			const borders = el.offsetHeight - box.offsetHeight;
			const a = anchorRect(anchor, doc);
			const bounds = viewBounds(win);
			let p = place(a, { width: w, height: h }, bounds, opts);
			// A card wider than its room is capped, and capping the width re-wraps its text, so it grows
			// TALLER: measure it at the capped width before placing again, or a card on the top side
			// overlaps its anchor by the height it gained.
			// (Once. Measured at the cap, the card fits its side exactly, and `place` never flips a card that
			// fits, so the re-place cannot move it into a narrower room.)
			if (w > p.maxWidth) {
				el.style.setProperty('--cenno-room-w', `${p.maxWidth / s}px`);
				w = el.offsetWidth * s;
				h = el.offsetHeight * s;
				p = place(a, { width: w, height: h }, bounds, opts);
			}
			// A card taller (or still wider) than its room is capped, so place it again at the capped size.
			if (h > p.maxHeight || w > p.maxWidth) {
				p = place(a, { width: Math.min(w, p.maxWidth), height: Math.min(h, p.maxHeight) }, bounds, { ...opts, side: p.side });
			}
			side = p.side;
			hidden = p.hidden || !visiblePart(anchor, doc);
			el.setAttribute('data-cenno-side', side);
			if (hidden) el.setAttribute('data-cenno-hidden', '');
			else el.removeAttribute('data-cenno-hidden');
			el.style.setProperty('--cenno-room-w', `${p.maxWidth / s}px`);
			el.style.setProperty('--cenno-room-h', `${Math.max(0, p.maxHeight / s - borders)}px`);
			if (arrowEl && p.arrow != null) el.style.setProperty('--cenno-arrow-offset', `${p.arrow / s}px`);
			const draw = (x: number, y: number, scale: number) => {
				el.style.transform = `translate(${x}px, ${y}px)${scale === 1 ? '' : ` scale(${scale})`}`;
			};
			draw(p.x, p.y, s);
			if (!popover) {
				// A fixed element is positioned against its containing block, which a transformed or
				// filtered ancestor MOVES and may SCALE. Read both off what the browser drew: the drawn
				// left is origin + k·x, and the drawn width is k·s·offsetWidth. Then solve for the
				// translate that lands on the placement, and the scale that keeps the card's screen size.
				const r = el.getBoundingClientRect();
				// The UNROUNDED layout width: `offsetWidth` is rounded to a whole pixel, so dividing the
				// drawn width by it read a scale of ~1.003 for an unscaled block and moved the card a pixel
				// or two. The card is `box-sizing: border-box`, so its computed width is the border box.
				const layoutW = Number.parseFloat(win.getComputedStyle(el).width) || el.offsetWidth;
				const k = layoutW ? r.width / (layoutW * s) : 1;
				if (Math.abs(k - 1) > 0.001 || Math.abs(p.x - r.left) > 0.5 || Math.abs(p.y - r.top) > 0.5) {
					const ox = r.left - k * p.x;
					const oy = r.top - k * p.y;
					draw((p.x - ox) / k, (p.y - oy) / k, s / k);
				}
			}
		}

		// ── tracking ─────────────────────────────────────────────────────────────────
		let raf = 0;
		const kick = () => {
			if (!raf && isOpen) raf = win.requestAnimationFrame(() => {
				raf = 0;
				position();
			});
		};
		const listen: Array<() => void> = [];
		const on = (target: EventTarget | null | undefined, type: string, opt?: AddEventListenerOptions) => {
			if (!target) return;
			target.addEventListener(type, kick, opt);
			listen.push(() => target.removeEventListener(type, kick, opt));
		};
		let ro: ResizeObserver | null = null;
		let frameLoop = 0;
		const cancel = (id: number) => win.cancelAnimationFrame(id);
		let lastRect = '';
		function watchAnchor(): void {
			for (const off of listen.splice(0)) off();
			ro?.disconnect();
			cancel(frameLoop);
			const passive = { capture: true, passive: true };
			// Every window between the anchor and the top: a scroll inside an iframe moves the anchor too.
			const wins = new Set<Window>([win]);
			let d: Document | null = 'nodeType' in anchor ? (anchor as Element).ownerDocument : (anchor.frame?.contentDocument ?? null);
			while (d?.defaultView && d.defaultView !== win) {
				wins.add(d.defaultView);
				const f = d.defaultView.frameElement;
				d = f ? f.ownerDocument : null;
			}
			for (const w of wins) {
				on(w, 'scroll', passive);
				on(w, 'resize', passive);
			}
			on(win.visualViewport, 'resize', passive);
			on(win.visualViewport, 'scroll', passive);
			if (typeof ResizeObserver === 'function') {
				ro = new ResizeObserver(kick);
				ro.observe(box);
				if ('nodeType' in anchor) ro.observe(anchor as Element);
			}
			if (opts.watch === 'frame') {
				const tick = () => {
					if (!isOpen) return;
					const r = anchorRect(anchor, doc);
					const key = `${r.x},${r.y},${r.width},${r.height}`;
					if (key !== lastRect) {
						lastRect = key;
						position();
					}
					frameLoop = win.requestAnimationFrame(tick);
				};
				frameLoop = win.requestAnimationFrame(tick);
			}
		}

		const card: CennoCard & { remount(): void } = {
			get element() {
				return el;
			},
			get content() {
				return box;
			},
			get side() {
				return side;
			},
			get hidden() {
				return hidden;
			},
			get isOpen() {
				return isOpen;
			},
			set(next) {
				if (!isOpen) return;
				fill(doc, box, next);
				position();
			},
			move(next, nextOpts) {
				if (!isOpen) return;
				const anchorChanged = next !== anchor;
				anchor = next;
				if (nextOpts) opts = { ...opts, ...nextOpts };
				if (anchorChanged || nextOpts?.watch) watchAnchor();
				position();
			},
			update: position,
			close() {
				if (!isOpen) return;
				isOpen = false;
				cancel(raf);
				cancel(frameLoop);
				for (const off of listen.splice(0)) off();
				ro?.disconnect();
				if (popover) {
					try {
						el.hidePopover();
					} catch {
						/* already hidden */
					}
				}
				el.remove();
				cards.delete(card);
			},
			remount() {
				const parent = parentNow();
				if (el.parentNode !== parent) parent.append(el);
				show();
				position();
			},
		};

		parentNow().append(el);
		show();
		position();
		el.setAttribute('data-cenno-enter', '');
		watchAnchor();
		cards.add(card);
		return card;
	}

	return {
		document: doc,
		open,
		get cards() {
			return cards;
		},
		destroy() {
			for (const c of [...cards]) c.close();
			doc.removeEventListener('fullscreenchange', onFullscreen);
			doc.removeEventListener('webkitfullscreenchange', onFullscreen);
		},
	};
}
