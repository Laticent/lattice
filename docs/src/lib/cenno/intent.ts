// Cenno intent — when a card opens and closes for a real trigger (a button, a term, a chip).
//
// `attach(cenno, trigger, content, options)` wires one trigger and returns the detach function.
//   hover  a mouse or pen resting on the trigger opens the card after `openDelay`; leaving it
//          closes it after `closeDelay`, UNLESS the pointer is travelling toward the card through
//          the GRACE CORRIDOR (the triangle from where it left to the card's near edge), so moving
//          onto the card never closes it. Keyboard focus opens it too. On a device whose primary
//          pointer is coarse (a phone), hover has nothing to rest on, so it behaves as `press`.
//   press  a click or tap toggles the card; a press outside it or Escape closes it.
//   focus  focus alone opens and closes it.
//
// Accessibility follows the mode: hover and focus cards are tooltips (`aria-describedby` on the
// trigger); press cards are dialogs (`aria-haspopup`, `aria-expanded`, `aria-controls`). Cenno moves
// focus only into a press card opened from the keyboard; if focus was inside a card when it closes, it
// goes back to the trigger.
//
// The chart reveal does not use this: it drives `open`/`move`/`close` itself from its hit test.

import type { Cenno, CennoCard, Content, OpenOptions } from './cenno.js';

export type Intent = 'hover' | 'press' | 'focus';

export interface AttachOptions extends OpenOptions {
	intent?: Intent;
	/** Milliseconds a pointer rests before a hover card opens. Default 100. */
	openDelay?: number;
	/** Milliseconds before a hover card closes once the pointer has left. Default 120. */
	closeDelay?: number;
}

type Pt = { x: number; y: number };

/** True when `p` is inside the triangle a, b, c (edges included). */
export function inTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
	const s = (p1: Pt, p2: Pt, p3: Pt) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
	const d1 = s(p, a, b);
	const d2 = s(p, b, c);
	const d3 = s(p, c, a);
	const neg = d1 < 0 || d2 < 0 || d3 < 0;
	const pos = d1 > 0 || d2 > 0 || d3 > 0;
	return !(neg && pos);
}

/** The two corners of the card's edge that faces the anchor. */
export function nearEdge(card: DOMRect, side: CennoCard['side']): [Pt, Pt] {
	if (side === 'bottom') return [{ x: card.left, y: card.top }, { x: card.right, y: card.top }];
	if (side === 'top') return [{ x: card.left, y: card.bottom }, { x: card.right, y: card.bottom }];
	if (side === 'right') return [{ x: card.left, y: card.top }, { x: card.left, y: card.bottom }];
	return [{ x: card.right, y: card.top }, { x: card.right, y: card.bottom }];
}

export function attach(cenno: Cenno, trigger: Element, content: () => Content, options: AttachOptions = {}): () => void {
	const doc = cenno.document;
	const win = doc.defaultView as Window;
	const coarse = (() => {
		try {
			return win.matchMedia('(hover: none) and (pointer: coarse)').matches;
		} catch {
			return false;
		}
	})();
	const asked = options.intent ?? 'hover';
	const intent: Intent = asked === 'hover' && coarse ? 'press' : asked;
	const openDelay = options.openDelay ?? 100;
	const closeDelay = options.closeDelay ?? 120;
	const isDialog = intent === 'press';

	let card: CennoCard | null = null;
	let openTimer = 0;
	let closeTimer = 0;
	let exit: Pt | null = null;
	const clear = () => {
		win.clearTimeout(openTimer);
		win.clearTimeout(closeTimer);
		openTimer = closeTimer = 0;
	};

	if (isDialog) {
		trigger.setAttribute('aria-haspopup', 'dialog');
		trigger.setAttribute('aria-expanded', 'false');
	}

	function show(): void {
		clear();
		if (card?.isOpen) return;
		card = cenno.open(trigger, content(), { ...options, role: options.role ?? (isDialog ? 'dialog' : 'tooltip') });
		const id = card.element.id;
		if (isDialog) {
			trigger.setAttribute('aria-expanded', 'true');
			trigger.setAttribute('aria-controls', id);
		} else {
			const ids = (trigger.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
			trigger.setAttribute('aria-describedby', [...ids, id].join(' '));
		}
		card.element.addEventListener('pointerenter', onCardEnter);
		card.element.addEventListener('pointerleave', onLeave);
		card.element.addEventListener('focusout', onFocusOut);
	}

	function hide(): void {
		clear();
		exit = null;
		doc.removeEventListener('pointermove', onMove, true);
		if (!card) return;
		const el = card.element;
		const hadFocus = el.contains(doc.activeElement);
		if (isDialog) {
			trigger.setAttribute('aria-expanded', 'false');
			trigger.removeAttribute('aria-controls');
		} else {
			const ids = (trigger.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((t) => t && t !== el.id);
			if (ids.length) trigger.setAttribute('aria-describedby', ids.join(' '));
			else trigger.removeAttribute('aria-describedby');
		}
		card.close();
		card = null;
		if (hadFocus) (trigger as HTMLElement).focus?.();
	}

	const scheduleClose = () => {
		win.clearTimeout(closeTimer);
		closeTimer = win.setTimeout(hide, closeDelay);
	};

	// ── hover ──────────────────────────────────────────────────────────────────────
	function onEnter(e: Event): void {
		const pe = e as PointerEvent;
		if (pe.pointerType === 'touch') return;
		exit = null;
		win.clearTimeout(closeTimer);
		if (card?.isOpen) return;
		win.clearTimeout(openTimer);
		openTimer = win.setTimeout(show, openDelay);
	}
	function onCardEnter(): void {
		exit = null;
		win.clearTimeout(closeTimer);
		doc.removeEventListener('pointermove', onMove, true);
	}
	function onLeave(e: Event): void {
		const pe = e as PointerEvent;
		if (pe.pointerType === 'touch') return;
		win.clearTimeout(openTimer);
		if (!card?.isOpen) return;
		const to = pe.relatedTarget as Node | null;
		if (to && (trigger.contains(to) || card.element.contains(to))) return;
		// Leaving the trigger toward the card: keep it open while the pointer stays in the corridor.
		if (e.currentTarget === trigger) {
			exit = { x: pe.clientX, y: pe.clientY };
			doc.addEventListener('pointermove', onMove, true);
		}
		scheduleClose();
	}
	function onMove(e: PointerEvent): void {
		if (!card?.isOpen || !exit) return;
		const [a, b] = nearEdge(card.element.getBoundingClientRect(), card.side);
		if (inTriangle({ x: e.clientX, y: e.clientY }, exit, a, b)) scheduleClose();
		else {
			doc.removeEventListener('pointermove', onMove, true);
			hide();
		}
	}

	// ── focus ──────────────────────────────────────────────────────────────────────
	const onFocusIn = () => {
		if (!isDialog) show();
	};
	function onFocusOut(e: Event): void {
		const to = (e as FocusEvent).relatedTarget as Node | null;
		if (to && (trigger.contains(to) || card?.element.contains(to))) return;
		if (!isDialog || card?.element.contains(e.target as Node)) hide();
	}

	// ── press ──────────────────────────────────────────────────────────────────────
	// A press opened from the KEYBOARD (Enter or Space make a click with `detail` 0) moves focus into the
	// card, so a keyboard user can reach what it holds; leaving it closes it, Escape returns to the trigger.
	// A pointer press leaves focus where it is.
	const onClick = (e: Event) => {
		if (card?.isOpen) {
			hide();
			return;
		}
		show();
		if ((e as MouseEvent).detail === 0 && card) {
			card.element.setAttribute('tabindex', '-1');
			card.element.focus();
		}
	};
	function onOutside(e: Event): void {
		if (!card?.isOpen) return;
		const t = e.target as Node;
		if (trigger.contains(t) || card.element.contains(t)) return;
		hide();
	}
	// Escape closes an open card. It stops there only when the key came from this card or its trigger:
	// a tooltip the pointer happens to rest on must not swallow the Escape that belongs to whatever holds
	// focus (a host's dialog, say).
	function onKey(e: Event): void {
		if ((e as KeyboardEvent).key !== 'Escape' || !card?.isOpen) return;
		const from = e.target as Node | null;
		const ours = !!from && (trigger.contains(from) || card.element.contains(from));
		hide();
		if (ours) e.stopPropagation();
	}

	if (intent === 'hover') {
		trigger.addEventListener('pointerenter', onEnter);
		trigger.addEventListener('pointerleave', onLeave);
	}
	if (intent !== 'press') {
		trigger.addEventListener('focusin', onFocusIn);
		trigger.addEventListener('focusout', onFocusOut);
	}
	if (isDialog) {
		trigger.addEventListener('click', onClick);
		doc.addEventListener('pointerdown', onOutside, true);
	}
	doc.addEventListener('keydown', onKey, true);

	return () => {
		hide();
		trigger.removeEventListener('pointerenter', onEnter);
		trigger.removeEventListener('pointerleave', onLeave);
		trigger.removeEventListener('focusin', onFocusIn);
		trigger.removeEventListener('focusout', onFocusOut);
		trigger.removeEventListener('click', onClick);
		doc.removeEventListener('pointerdown', onOutside, true);
		doc.removeEventListener('keydown', onKey, true);
		if (isDialog) {
			trigger.removeAttribute('aria-haspopup');
			trigger.removeAttribute('aria-expanded');
		}
	};
}
