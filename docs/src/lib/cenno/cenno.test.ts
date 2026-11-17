// The card lifecycle, the layer, the anatomy and the intents, in jsdom. jsdom lays nothing out, so
// sizes and rects are stubbed per test; real layout, the top layer and real pinch zoom are measured
// in docs/e2e/cenno-parity.spec.ts.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCard, CARD_PARTS } from './card.js';
import { createCenno } from './cenno.js';
import { attach, inTriangle } from './intent.js';

type Box = { x: number; y: number; width: number; height: number };
const rect = (b: Box) => ({ ...b, left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height, toJSON() {} }) as DOMRect;

function anchorAt(b: Box): HTMLElement {
	const el = document.createElement('button');
	el.textContent = 'anchor';
	el.getBoundingClientRect = () => rect(b);
	document.body.append(el);
	return el;
}

const restore: Array<() => void> = [];
/** Card size. With `rewrap`, a card whose width is capped (`--cenno-room-w`) reports that width and a taller height, as wrapped text does. */
function stubSize(width: number, height: number, rewrap?: (cap: number) => number): void {
	for (const key of ['offsetWidth', 'offsetHeight'] as const) {
		const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
		Object.defineProperty(HTMLElement.prototype, key, {
			configurable: true,
			get(this: HTMLElement) {
				if (this.classList.contains('cenno')) {
					const cap = Number.parseFloat(this.style.getPropertyValue('--cenno-room-w'));
					if (rewrap && cap < width) return key === 'offsetWidth' ? cap : rewrap(cap);
					return key === 'offsetWidth' ? width : height;
				}
				if (this.getAttribute('data-cenno-part') === 'content') return key === 'offsetWidth' ? width - 2 : height - 2;
				return 0;
			},
		});
		restore.push(() => (d ? Object.defineProperty(HTMLElement.prototype, key, d) : delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key]));
	}
}
/**
 * Report a drawn card where a browser would: its translate, plus the containing block's origin
 * (`origin`), which a transformed ancestor moves. jsdom itself reports every rect at (0, 0).
 */
function stubDrawn(origin = { x: 0, y: 0 }, cbScale = 1): void {
	const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
	HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
		if (!this.classList.contains('cenno')) return d?.value.call(this);
		const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)(?: scale\(([\d.]+)\))?/.exec(this.style.transform);
		const k = Number(m?.[3] ?? 1);
		const c = cbScale;
		return rect({ x: origin.x + c * Number(m?.[1] ?? 0), y: origin.y + c * Number(m?.[2] ?? 0), width: c * this.offsetWidth * k, height: c * this.offsetHeight * k });
	};
	restore.push(() => d && Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', d));
}
function stubViewport(vv: { scale: number; offsetLeft: number; offsetTop: number; width: number; height: number } | undefined): void {
	const d = Object.getOwnPropertyDescriptor(window, 'visualViewport');
	Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv ? Object.assign(new EventTarget(), vv) : undefined });
	restore.push(() => (d ? Object.defineProperty(window, 'visualViewport', d) : delete (window as unknown as Record<string, unknown>).visualViewport));
}
const translateOf = (el: HTMLElement) => el.style.transform;

beforeEach(() => {
	document.head.innerHTML = '';
	document.body.innerHTML = '';
});
afterEach(() => {
	for (const r of restore.splice(0).reverse()) r();
	vi.useRealTimers();
});

describe('card anatomy', () => {
	it('builds only the parts it is given, in order, each named', () => {
		const frag = buildCard(document, { title: 'Revenue', value: '$4.2M', body: 'Up 12%.' });
		const host = document.createElement('div');
		host.append(frag);
		expect([...host.querySelectorAll('[data-cenno-part]')].map((e) => e.getAttribute('data-cenno-part'))).toEqual(['header', 'title', 'value', 'body']);
		expect(host.querySelector('[part=title]')?.textContent).toBe('Revenue');
	});

	it('treats strings as text, never as markup', () => {
		const host = document.createElement('div');
		host.append(buildCard(document, { body: '<img src=x onerror=alert(1)>' }));
		expect(host.querySelector('img')).toBeNull();
		expect(host.textContent).toBe('<img src=x onerror=alert(1)>');
	});

	it('lists every public part name', () => {
		expect(CARD_PARTS).toEqual(['card', 'arrow', 'content', 'header', 'lead', 'title', 'value', 'body', 'footer']);
	});
});

describe('createCenno and open', () => {
	it('injects its stylesheet once per document', () => {
		createCenno();
		createCenno();
		expect(document.querySelectorAll('style[data-cenno-css]').length).toBe(1);
	});

	it('mounts a named, labelled card and removes it on close', () => {
		stubSize(200, 80);
		const cn = createCenno();
		const card = cn.open(anchorAt({ x: 100, y: 100, width: 50, height: 20 }), { title: 'A', body: 'B' }, { role: 'status', live: true, label: 'Detail', className: 'mine' });
		const el = card.element;
		expect(el.parentElement).toBe(document.body);
		expect(el.matches('.cenno.mine[role=status][aria-live=polite][aria-label=Detail][data-cenno-part=card]')).toBe(true);
		expect(el.id).toMatch(/^cenno-\d+$/);
		expect(cn.cards.has(card)).toBe(true);
		card.close();
		expect(el.isConnected).toBe(false);
		expect(card.isOpen).toBe(false);
		expect(cn.cards.size).toBe(0);
	});

	it('places in the same call that opens it, below and centered by default', () => {
		stubSize(200, 80);
		stubDrawn();
		stubViewport(undefined);
		const card = createCenno().open(anchorAt({ x: 400, y: 100, width: 100, height: 20 }), 'hi', { gap: 10 });
		expect(translateOf(card.element)).toBe('translate(350px, 130px)');
		expect(card.side).toBe('bottom');
	});

	it('without the top layer, corrects for a containing block a transformed ancestor moved', () => {
		stubSize(200, 80);
		stubDrawn({ x: 40, y: -25 });
		stubViewport(undefined);
		const card = createCenno().open(anchorAt({ x: 400, y: 100, width: 100, height: 20 }), 'hi', { gap: 10 });
		// Drawn 40px right and 25px up of where it was asked to be, so the translate compensates.
		expect(translateOf(card.element)).toBe('translate(310px, 155px)');
	});

	it('keeps its size on screen under pinch zoom, unless asked to follow', () => {
		stubSize(200, 80);
		stubDrawn();
		stubViewport({ scale: 2, offsetLeft: 0, offsetTop: 0, width: 512, height: 384 });
		const cn = createCenno();
		const a = anchorAt({ x: 200, y: 100, width: 40, height: 20 });
		const steady = cn.open(a, 'x');
		// Drawn at half size: 100 x 40 on screen, centered under the anchor.
		expect(translateOf(steady.element)).toBe('translate(170px, 120px) scale(0.5)');
		const follow = cn.open(a, 'x', { pinch: 'follow' });
		expect(translateOf(follow.element)).toBe('translate(120px, 120px)');
	});

	it('hides while the anchor is out of view and shows again when it returns', () => {
		stubSize(100, 40);
		stubViewport(undefined);
		const box = { x: -500, y: 100, width: 40, height: 20 };
		const a = anchorAt(box);
		const card = createCenno().open(a, 'x');
		expect(card.hidden).toBe(true);
		expect(card.element.hasAttribute('data-cenno-hidden')).toBe(true);
		box.x = 300;
		card.update();
		expect(card.hidden).toBe(false);
		expect(card.element.hasAttribute('data-cenno-hidden')).toBe(false);
	});

	it('without the top layer, corrects for a containing block a transformed ancestor SCALED, keeping screen size', () => {
		stubSize(200, 80);
		stubDrawn({ x: 30, y: 10 }, 0.5);
		stubViewport(undefined);
		const card = createCenno().open(anchorAt({ x: 400, y: 100, width: 100, height: 20 }), 'hi', { gap: 10 });
		const r = card.element.getBoundingClientRect();
		// Drawn where the placement says (centered under the anchor, 10px below), at its natural 200x80.
		expect(r.left).toBeCloseTo(350, 6);
		expect(r.top).toBeCloseTo(130, 6);
		expect(r.width).toBeCloseTo(200, 6);
	});

	it('a card capped in width is measured again at that width, so a taller wrap still clears its anchor', () => {
		// 600 wide naturally; capped to the room on its left side, it wraps to 3x the height.
		stubSize(600, 60, () => 180);
		stubDrawn();
		stubViewport(undefined);
		// Room on the left: 600 - 8 = 592 (spills 8); on the right: 1024 - 648 = 376 (spills 224), so it stays left.
		const a = { x: 600, y: 300, width: 40, height: 20 };
		const card = createCenno().open(anchorAt(a), 'a long line', { side: 'left', gap: 8 });
		const r = card.element.getBoundingClientRect();
		expect(card.side).toBe('left');
		expect(r.width).toBeCloseTo(592, 6);
		expect(r.height).toBe(180);
		// Centered on the anchor at its REAL height: 300 + (20 - 180) / 2 = 220.
		expect(r.top).toBeCloseTo(220, 6);
		expect(r.left + r.width).toBeCloseTo(a.x - 8, 6);
	});

	it('moves to a new anchor and replaces content without reopening', () => {
		stubSize(100, 40);
		stubDrawn();
		stubViewport(undefined);
		const card = createCenno().open(anchorAt({ x: 100, y: 100, width: 20, height: 20 }), 'one');
		const el = card.element;
		card.move(anchorAt({ x: 600, y: 300, width: 20, height: 20 }));
		card.set({ title: 'two' });
		expect(card.element).toBe(el);
		expect(translateOf(el)).toBe('translate(560px, 320px)');
		expect(card.content.textContent).toBe('two');
	});

	it('accepts a point anchor, such as a cursor', () => {
		stubSize(100, 40);
		stubDrawn();
		stubViewport(undefined);
		const card = createCenno().open({ x: 300, y: 200 }, 'x', { side: 'bottom', align: 'start', gap: 12 });
		expect(translateOf(card.element)).toBe('translate(300px, 212px)');
	});

	it('follows fullscreen: the card moves into the fullscreen element and back', () => {
		stubSize(100, 40);
		const cn = createCenno();
		const stage = document.createElement('section');
		document.body.append(stage);
		const card = cn.open(anchorAt({ x: 100, y: 100, width: 20, height: 20 }), 'x');
		Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => stage });
		document.dispatchEvent(new Event('fullscreenchange'));
		expect(card.element.parentElement).toBe(stage);
		Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
		document.dispatchEvent(new Event('fullscreenchange'));
		expect(card.element.parentElement).toBe(document.body);
		delete (document as unknown as Record<string, unknown>).fullscreenElement;
	});

	it('mounts into a host in a shadow root and styles that root', () => {
		const shadowHost = document.createElement('div');
		document.body.append(shadowHost);
		const root = shadowHost.attachShadow({ mode: 'open' });
		const inner = document.createElement('div');
		root.append(inner);
		const card = createCenno({ host: inner }).open(anchorAt({ x: 10, y: 10, width: 10, height: 10 }), 'x');
		expect(card.element.parentElement).toBe(inner);
		expect(root.querySelector('style[data-cenno-css]')).not.toBeNull();
		expect(card.element.hasAttribute('popover')).toBe(false);
	});

	it('destroy closes every card', () => {
		const cn = createCenno();
		const a = anchorAt({ x: 10, y: 10, width: 10, height: 10 });
		cn.open(a, 'x');
		cn.open(a, 'y');
		cn.destroy();
		expect(document.querySelectorAll('.cenno').length).toBe(0);
	});
});

describe('attach — intents', () => {
	const ev = (type: string, init: Record<string, unknown> = {}) => Object.assign(new Event(type, { bubbles: type !== 'pointerenter' && type !== 'pointerleave' }), init);

	it('hover opens after the delay, describes the trigger, and closes after leaving', () => {
		vi.useFakeTimers();
		const cn = createCenno();
		const t = anchorAt({ x: 100, y: 100, width: 40, height: 20 });
		attach(cn, t, () => 'tip', { openDelay: 50, closeDelay: 50 });
		t.dispatchEvent(ev('pointerenter', { pointerType: 'mouse' }));
		expect(cn.cards.size).toBe(0);
		vi.advanceTimersByTime(50);
		const card = [...cn.cards][0];
		expect(card.element.getAttribute('role')).toBe('tooltip');
		expect(t.getAttribute('aria-describedby')).toBe(card.element.id);
		t.dispatchEvent(ev('pointerleave', { pointerType: 'mouse', relatedTarget: document.body, clientX: 0, clientY: 0 }));
		vi.advanceTimersByTime(50);
		expect(cn.cards.size).toBe(0);
		expect(t.hasAttribute('aria-describedby')).toBe(false);
	});

	it('a touch never opens a hover card', () => {
		vi.useFakeTimers();
		const cn = createCenno();
		const t = anchorAt({ x: 100, y: 100, width: 40, height: 20 });
		attach(cn, t, () => 'tip', { openDelay: 0 });
		t.dispatchEvent(ev('pointerenter', { pointerType: 'touch' }));
		vi.advanceTimersByTime(10);
		expect(cn.cards.size).toBe(0);
	});

	it('keyboard focus opens a hover card at once; leaving focus closes it', () => {
		const cn = createCenno();
		const t = anchorAt({ x: 100, y: 100, width: 40, height: 20 });
		attach(cn, t, () => 'tip');
		t.dispatchEvent(ev('focusin'));
		expect(cn.cards.size).toBe(1);
		t.dispatchEvent(ev('focusout', { relatedTarget: null }));
		expect(cn.cards.size).toBe(0);
	});

	it('press toggles a dialog card and reports it on the trigger', () => {
		const cn = createCenno();
		const t = anchorAt({ x: 100, y: 100, width: 40, height: 20 });
		attach(cn, t, () => 'menu', { intent: 'press' });
		expect(t.getAttribute('aria-haspopup')).toBe('dialog');
		t.dispatchEvent(ev('click'));
		const card = [...cn.cards][0];
		expect(card.element.getAttribute('role')).toBe('dialog');
		expect(t.getAttribute('aria-expanded')).toBe('true');
		expect(t.getAttribute('aria-controls')).toBe(card.element.id);
		t.dispatchEvent(ev('click'));
		expect(cn.cards.size).toBe(0);
		expect(t.getAttribute('aria-expanded')).toBe('false');
	});

	it('Escape and a press outside close a press card', () => {
		const cn = createCenno();
		const t = anchorAt({ x: 100, y: 100, width: 40, height: 20 });
		attach(cn, t, () => 'menu', { intent: 'press' });
		t.dispatchEvent(ev('click'));
		document.dispatchEvent(Object.assign(new Event('keydown', { bubbles: true }), { key: 'Escape' }));
		expect(cn.cards.size).toBe(0);
		t.dispatchEvent(ev('click'));
		document.body.dispatchEvent(ev('pointerdown'));
		expect(cn.cards.size).toBe(0);
	});

	it('hover becomes press on a device with no hover', () => {
		const mm = window.matchMedia;
		window.matchMedia = ((q: string) => ({ matches: q.includes('coarse'), media: q })) as typeof window.matchMedia;
		try {
			const cn = createCenno();
			const t = anchorAt({ x: 100, y: 100, width: 40, height: 20 });
			attach(cn, t, () => 'tip', { intent: 'hover' });
			expect(t.getAttribute('aria-haspopup')).toBe('dialog');
			t.dispatchEvent(ev('click'));
			expect(cn.cards.size).toBe(1);
		} finally {
			window.matchMedia = mm;
		}
	});

	it('Escape closes a card and stops only when it came from the card or its trigger', () => {
		const cn = createCenno();
		const t = anchorAt({ x: 100, y: 100, width: 40, height: 20 });
		const field = document.createElement('input');
		document.body.append(field);
		attach(cn, t, () => 'tip');
		const seen: string[] = [];
		document.addEventListener('keydown', (e) => seen.push((e.target as HTMLElement).tagName));
		const esc = (target: Element) => target.dispatchEvent(Object.assign(new Event('keydown', { bubbles: true }), { key: 'Escape' }));
		// From elsewhere (a host dialog's field): the tooltip closes and the host still gets its Escape.
		t.dispatchEvent(ev('focusin'));
		esc(field);
		expect(cn.cards.size).toBe(0);
		expect(seen).toEqual(['INPUT']);
		// From the trigger: the card closes and the key stops there.
		t.dispatchEvent(ev('focusin'));
		esc(t);
		expect(cn.cards.size).toBe(0);
		expect(seen).toEqual(['INPUT']);
	});

	it('a press card opened from the keyboard takes focus; by a pointer or a script, it does not', () => {
		const cn = createCenno();
		const t = anchorAt({ x: 100, y: 100, width: 40, height: 20 });
		attach(cn, t, () => 'menu', { intent: 'press' });
		t.focus();
		const toggle = () => t.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
		// A pointer.
		t.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		expect(document.activeElement).toBe(t);
		toggle();
		// A script's element.click(): detail 0 too, but no key came first.
		toggle();
		expect(cn.cards.size).toBe(1);
		expect(document.activeElement).toBe(t);
		toggle();
		// The keyboard: Enter, then the click it makes.
		t.dispatchEvent(Object.assign(new Event('keydown', { bubbles: true }), { key: 'Enter' }));
		toggle();
		expect(document.activeElement).toBe([...cn.cards][0].element);
	});

	it('detach closes the card and clears what it set', () => {
		const cn = createCenno();
		const t = anchorAt({ x: 100, y: 100, width: 40, height: 20 });
		const detach = attach(cn, t, () => 'menu', { intent: 'press' });
		t.dispatchEvent(ev('click'));
		detach();
		expect(cn.cards.size).toBe(0);
		expect(t.hasAttribute('aria-haspopup')).toBe(false);
		expect(t.hasAttribute('aria-expanded')).toBe(false);
	});

	it('the grace corridor is a triangle, edges included', () => {
		const a = { x: 0, y: 0 };
		const b = { x: 10, y: 10 };
		const c = { x: -10, y: 10 };
		expect(inTriangle({ x: 0, y: 5 }, a, b, c)).toBe(true);
		expect(inTriangle({ x: 10, y: 10 }, a, b, c)).toBe(true);
		expect(inTriangle({ x: 8, y: 2 }, a, b, c)).toBe(false);
	});
});
