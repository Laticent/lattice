/**
 * lib/core/collage-lightbox — enlarge one collage photo over the page.
 *
 * ONE host-agnostic opener. Every surface that shows a collage calls it: the Playground and the
 * Studio call it from the parent document (their slide frame cannot receive or show the overlay),
 * and the exported HTML player has this function's SOURCE inlined into its single CSP-hashed
 * script (`.toString()`), so the function must close over nothing at module scope. Every helper
 * is nested inside it for that reason. DOM only, no imports.
 *
 * What it does, and the limits that keep it small (spec 2026-10-11-collage-component.md §5.4):
 *   - opens one photo, centered, fit to the screen; no stepping, zoom or digit keys in v1;
 *   - glides from the tile's rect to the enlarged rect and back, driven by `requestAnimationFrame`
 *     so a close mid-glide reverses from wherever the photo is;
 *   - closes on Escape, a click on the backdrop, or the close button;
 *   - traps Tab, locks background scroll, and returns focus to whatever had it;
 *   - writes the caption with `textContent` only, and rebuilds the image source from an allowlist
 *     (http, https, blob, `data:image/`) — it never trusts the source it is handed (HARD RULE #22).
 *
 * Under `useDialog` it mounts a native `<dialog>` and calls `showModal()`, which supplies the
 * focus trap, the inert background and the top layer. The exported player sets it, because the
 * player's CSP leaves no room for a z-index fight with the deck. A parent document that cannot
 * rely on `<dialog>` gets a `role="dialog"` div instead.
 *
 * @param {Document} doc  the document that will host the overlay
 * @param {object} o
 * @param {string} o.src       the photo's image source (checked against the allowlist)
 * @param {string} [o.alt]     the photo's alt text, shown as the caption
 * @param {{left:number,top:number,width:number,height:number}} [o.from]  the tile's rect in `doc`'s
 *   viewport; omit it and the photo fades in with no glide
 * @param {() => ({left:number,top:number,width:number,height:number}|null)} [o.getFrom]  re-measures the
 *   tile when closing, so a scrolled or resized host does not glide to a stale rect
 * @param {boolean} [o.useDialog=false]
 * @param {boolean} [o.reducedMotion]  skip the glide; defaults to the user's `prefers-reduced-motion`
 * @param {() => void} [o.onClose]
 * @returns {{ close: () => void, el: HTMLElement }|null}  null when the source fails the allowlist
 */
export function openCollageLightbox(doc, o) {
	var win = doc.defaultView || window;
	var raw = String((o && o.src) || '').trim();
	// The allowlist. `data:image/` covers the player's embedded photos; `javascript:`, `data:text/`,
	// `file:` and a protocol-relative `//host` all fail it.
	if (!/^(https?:|blob:|data:image\/)/i.test(raw)) return null;

	var reduced =
		o.reducedMotion !== undefined
			? o.reducedMotion
			: !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
	var raf = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : null;
	var cancelRaf = win.cancelAnimationFrame ? win.cancelAnimationFrame.bind(win) : (() => {});
	var now = () => win.performance && win.performance.now ? win.performance.now() : Date.now();
	var GLIDE_MS = 240;
	var prevFocus = doc.activeElement;
	var root = o.useDialog && typeof win.HTMLDialogElement === 'function' ? doc.createElement('dialog') : doc.createElement('div');
	var isDialog = root.nodeName === 'DIALOG';
	root.className = 'collage-lightbox';
	root.setAttribute('aria-label', 'Photo');
	if (!isDialog) {
		root.setAttribute('role', 'dialog');
		root.setAttribute('aria-modal', 'true');
	}
	root.style.cssText =
		'position:fixed;inset:0;margin:0;padding:0;border:0;width:100%;height:100%;max-width:none;max-height:none;' +
		'z-index:2147483000;background:rgba(6,10,18,.86);display:flex;flex-direction:column;align-items:center;' +
		'justify-content:center;gap:12px;box-sizing:border-box;padding:4vmin;opacity:0;transition:opacity .18s ease;';

	var img = doc.createElement('img');
	img.src = raw;
	img.alt = String(o.alt || '');
	img.draggable = false;
	img.style.cssText =
		'display:block;max-width:100%;max-height:calc(100% - 3rem);width:auto;height:auto;object-fit:contain;' +
		'border-radius:6px;box-shadow:0 24px 70px rgba(0,0,0,.6);transform-origin:0 0;will-change:transform;';
	root.appendChild(img);

	var caption = null;
	if (o.alt) {
		caption = doc.createElement('p');
		caption.textContent = String(o.alt); // textContent only: the alt text is author-controlled
		caption.style.cssText =
			'margin:0;max-width:min(90vw,60ch);color:rgba(255,255,255,.88);font:500 15px/1.4 system-ui,sans-serif;text-align:center;';
		root.appendChild(caption);
	}

	var btn = doc.createElement('button');
	btn.type = 'button';
	btn.setAttribute('aria-label', 'Close photo');
	btn.textContent = '✕';
	btn.style.cssText =
		'position:absolute;top:12px;right:12px;width:40px;height:40px;border:0;border-radius:50%;cursor:pointer;' +
		'background:rgba(0,0,0,.65);color:#fff;font-size:18px;line-height:40px;padding:0;';
	root.appendChild(btn);

	// ── The glide. The photo's enlarged rect is measured once it has laid out; the glide is a
	// transform from the tile's rect to that one, advanced by rAF so it can reverse mid-flight.
	var p = 1; // 0 = at the tile, 1 = enlarged
	var raf0 = 0;
	var closing = false;
	var done = false;

	function rectOf(el) {
		var r = el.getBoundingClientRect();
		return { left: r.left, top: r.top, width: r.width, height: r.height };
	}
	function paint(from, to) {
		if (!from || !to || !to.width || !to.height || !from.width || !from.height) {
			img.style.transform = '';
			return;
		}
		// Interpolate the box (position and size) and express it as translate + scale from the
		// enlarged rect, so the layout never changes while it moves.
		var l = from.left + (to.left - from.left) * p;
		var t = from.top + (to.top - from.top) * p;
		var w = from.width + (to.width - from.width) * p;
		var h = from.height + (to.height - from.height) * p;
		img.style.transform =
			'translate(' + (l - to.left) + 'px,' + (t - to.top) + 'px) scale(' + w / to.width + ',' + h / to.height + ')';
	}
	function glide(toward, from, to, after) {
		if (raf0) cancelRaf(raf0);
		if (reduced || !raf || !from || !to) {
			p = toward;
			paint(from, to);
			if (after) after();
			return;
		}
		var p0 = p;
		var t0 = now();
		var step = () => {
			var k = Math.min(1, (now() - t0) / (GLIDE_MS * Math.max(0.25, Math.abs(toward - p0))));
			var e = 1 - (1 - k) ** 3;
			p = p0 + (toward - p0) * e;
			paint(from, to);
			if (k < 1) raf0 = raf(step);
			else {
				raf0 = 0;
				if (after) after();
			}
		};
		raf0 = raf(step);
	}

	var enlarged = null;
	function measureEnlarged() {
		// The transform must be off while measuring, or the box measured is the glide's.
		var prev = img.style.transform;
		img.style.transform = '';
		var r = rectOf(img);
		img.style.transform = prev;
		return r;
	}

	function teardown() {
		if (done) return;
		done = true;
		if (raf0) cancelRaf(raf0);
		doc.removeEventListener('keydown', onKey, true);
		doc.documentElement.style.overflow = prevOverflow;
		if (isDialog && root.open && root.close) {
			try {
				root.close();
			} catch (_e) {
				/* already closed */
			}
		}
		if (root.parentNode) root.parentNode.removeChild(root);
		try {
			if (prevFocus && prevFocus.focus) prevFocus.focus();
		} catch (_e) {
			/* focus is best-effort */
		}
		if (o.onClose) o.onClose();
	}

	function close() {
		if (closing || done) return;
		closing = true;
		root.style.opacity = '0';
		if (caption) caption.style.opacity = '0';
		var from = (o.getFrom && o.getFrom()) || o.from || null;
		glide(0, from, enlarged || measureEnlarged(), teardown);
		// The fade is the backstop: if the glide never reports back, the overlay still leaves.
		win.setTimeout(teardown, reduced ? 0 : GLIDE_MS + 120);
	}

	function onKey(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close();
			return;
		}
		if (e.key === 'Tab') {
			// Native <dialog> traps focus itself; the div form has one control, so Tab stays on it.
			e.preventDefault();
			btn.focus();
			return;
		}
		// While open the lightbox owns the keyboard: the deck behind it must not advance.
		if (e.key === ' ' || e.key.indexOf('Arrow') === 0 || e.key === 'PageDown' || e.key === 'PageUp') {
			e.preventDefault();
			e.stopPropagation();
		}
	}

	var prevOverflow = doc.documentElement.style.overflow;
	doc.documentElement.style.overflow = 'hidden';
	doc.addEventListener('keydown', onKey, true);

	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		close();
	});
	// A click on the backdrop closes; a click on the photo does not. The ghost-click guard: the tap
	// that opened this is followed ~300 ms later by a synthesized click at the same point, which
	// would land on the new backdrop and close it straight away (the same iOS trap video-overlay
	// documents), so a backdrop close inside the first 400 ms is ignored.
	var openedAt = now();
	root.addEventListener('click', (e) => {
		if (e.target === img || e.target === caption || e.target === btn) return;
		if (now() - openedAt < 400) return;
		close();
	});
	// Wheel and touch-move on the overlay must not scroll or swipe the deck behind it.
	root.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });
	root.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });

	(doc.body || doc.documentElement).appendChild(root);
	if (isDialog && root.showModal) {
		try {
			root.showModal();
		} catch (_e) {
			/* already open or detached */
		}
	}
	try {
		btn.focus();
	} catch (_e) {
		/* focus is best-effort */
	}
	root.style.opacity = '1';

	// Open once the photo has dimensions, so the enlarged rect is the real one.
	var start = () => {
		if (done || closing) return;
		enlarged = measureEnlarged();
		p = 0;
		paint(o.from || null, enlarged);
		glide(1, o.from || null, enlarged, () => {
			img.style.transform = '';
		});
	};
	if (img.complete && img.naturalWidth) start();
	else {
		img.addEventListener('load', start, { once: true });
		img.addEventListener('error', start, { once: true });
	}

	return { close: close, el: root };
}
