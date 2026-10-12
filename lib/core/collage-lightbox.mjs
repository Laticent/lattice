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
 *   - opens one photo, centered, fit to the screen, and steps through the collage's other photos
 *     in written order: ArrowLeft / ArrowRight / PageUp / PageDown, Home and End, a horizontal
 *     swipe, or the two arrow buttons (shown only when there is more than one photo);
 *   - glides from the tile's rect to the enlarged rect and back, driven by `requestAnimationFrame`
 *     so a close mid-glide reverses from wherever the photo is;
 *   - closes on Escape, a click on the backdrop, or the close button;
 *   - traps Tab, locks background scroll, and returns focus to whatever had it;
 *   - writes the caption with `textContent` only, and rebuilds the image source from an allowlist
 *     (http, https, blob, `data:image/`) — it never trusts the source it is handed (HARD RULE #22).
 *
 * THE INPUT RULES ARE NOT HERE. The swipe and key rules live in `lib/core/present-transport.mjs`
 * (`swipeAction`, `keyAction`) and the host hands them in as
 * `o.kernel`, because this function is inlined into the player and cannot import. A host that
 * passes no kernel still gets the two arrow buttons, but no step keys or swipe. One copy of
 * each rule, per the input-verb parity record (2026-08-10-input-verb-parity.md).
 *
 * Under `useDialog` it mounts a native `<dialog>` and calls `showModal()`, which supplies the
 * focus trap, the inert background and the top layer. The exported player sets it, because the
 * player's CSP leaves no room for a z-index fight with the deck. A parent document that cannot
 * rely on `<dialog>` gets a `role="dialog"` div instead.
 *
 * @param {Document} doc  the document that will host the overlay
 * @param {object} o
 * @param {Array<{src:string, alt?:string, from?:object, getFrom?:Function}>} [o.items]  every photo of the
 *   collage in written order; each may carry its own tile rect (`from`) and a re-measure (`getFrom`).
 *   Omit it for a single photo and pass `src`, `alt`, `from` and `getFrom` directly.
 * @param {number} [o.index=0]  which item opens first
 * @param {string} [o.src]      the photo's image source (checked against the allowlist)
 * @param {string} [o.alt]      the photo's alt text, shown as the caption
 * @param {{left:number,top:number,width:number,height:number}} [o.from]  the tile's rect in `doc`'s
 *   viewport; omit it and the photo fades in with no glide
 * @param {() => ({left:number,top:number,width:number,height:number}|null)} [o.getFrom]  re-measures the
 *   tile when closing, so a scrolled or resized host does not glide to a stale rect
 * @param {{swipeAction?:Function, keyAction?:Function}} [o.kernel]
 *   the shared input rules from `lib/core/present-transport.mjs`
 * @param {boolean} [o.useDialog=false]
 * @param {boolean} [o.reducedMotion]  skip the glide; defaults to the user's `prefers-reduced-motion`
 * @param {boolean} [o.restoreFocus=true]  return focus to the element that had it on close. A pointer
 *   open passes false: the focus the click gave a photo would otherwise come back as keyboard focus
 *   (the Escape that closed the lightbox makes it look like one), and Space would reopen the photo
 *   instead of advancing the deck.
 * @param {() => void} [o.onClose]
 * @returns {{ close: () => void, closeNow: () => void, step: (to: string|number) => void, index: () => number, el: HTMLElement }|null}
 *   null when no item passes the source allowlist
 */
export function openCollageLightbox(doc, o) {
	o = o || {};
	var win = doc.defaultView || window;
	// The allowlist. `data:image/` covers the player's embedded photos; `javascript:`, `data:text/`,
	// `file:` and a protocol-relative `//host` all fail it. Applied to EVERY item, so a bad photo is
	// dropped from the set rather than reachable by stepping.
	var allowed = (v) => /^(https?:|blob:|data:image\/)/i.test(String(v || '').trim());
	var given = o.items && o.items.length ? o.items : [{ src: o.src, alt: o.alt, from: o.from, getFrom: o.getFrom }];
	var items = [];
	var start = 0;
	for (let n = 0; n < given.length; n++) {
		const src = String(given[n].src || '').trim(); // read once: the value checked is the value kept
		if (!allowed(src)) continue;
		if (n === (o.index || 0)) start = items.length;
		items.push({ src: src, alt: String(given[n].alt || ''), from: given[n].from || null, getFrom: given[n].getFrom || null });
	}
	if (!items.length) return null;
	// The opened item was dropped: open the first that survived.
	if (!allowed(given[o.index || 0] && given[o.index || 0].src)) start = 0;
	var cur = start;
	var K = o.kernel || {};

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
	img.draggable = false;
	img.style.cssText =
		'display:block;max-width:100%;max-height:calc(100% - 3rem);width:auto;height:auto;object-fit:contain;' +
		'border-radius:6px;box-shadow:0 24px 70px rgba(0,0,0,.6);transform-origin:0 0;will-change:transform;';
	root.appendChild(img);

	var caption = doc.createElement('p');
	caption.style.cssText =
		'margin:0;max-width:min(90vw,60ch);color:rgba(255,255,255,.88);font:500 15px/1.4 system-ui,sans-serif;text-align:center;';
	root.appendChild(caption);

	var count = doc.createElement('p');
	count.setAttribute('aria-live', 'polite');
	count.style.cssText = 'margin:0;color:rgba(255,255,255,.6);font:500 12px/1 system-ui,sans-serif;letter-spacing:.04em;';
	root.appendChild(count);

	var btn = doc.createElement('button');
	btn.type = 'button';
	btn.setAttribute('aria-label', 'Close photo');
	btn.textContent = '✕';
	var CTRL =
		'position:absolute;width:40px;height:40px;border:0;border-radius:50%;cursor:pointer;' +
		'background:rgba(0,0,0,.65);color:#fff;font-size:18px;line-height:40px;padding:0;';
	btn.style.cssText = CTRL + 'top:12px;right:12px;';
	root.appendChild(btn);

	// Previous and next, only when there is something to step to. Real buttons, so a keyboard or
	// screen-reader user reaches them with Tab and a pointer user needs no gesture.
	var prevBtn = null;
	var nextBtn = null;
	if (items.length > 1) {
		prevBtn = doc.createElement('button');
		prevBtn.type = 'button';
		prevBtn.setAttribute('aria-label', 'Previous photo');
		prevBtn.textContent = '‹';
		prevBtn.style.cssText = CTRL + 'top:50%;left:12px;margin-top:-20px;font-size:26px;';
		nextBtn = doc.createElement('button');
		nextBtn.type = 'button';
		nextBtn.setAttribute('aria-label', 'Next photo');
		nextBtn.textContent = '›';
		nextBtn.style.cssText = CTRL + 'top:50%;right:12px;margin-top:-20px;font-size:26px;';
		root.appendChild(prevBtn);
		root.appendChild(nextBtn);
	}

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

	// ── Stepping.
	function label() {
		var it = items[cur];
		caption.textContent = it.alt; // textContent only: the alt text is author-controlled
		caption.style.display = it.alt ? '' : 'none';
		img.alt = it.alt;
		count.textContent = items.length > 1 ? cur + 1 + ' / ' + items.length : '';
		count.style.display = items.length > 1 ? '' : 'none';
	}
	function show(i) {
		cur = i;
		var it = items[cur];
		// A step during the open glide must not keep painting the old photo's transform on the new one.
		if (raf0) {
			cancelRaf(raf0);
			raf0 = 0;
		}
		p = 1;
		img.style.transform = '';
		label();
		// Swap the source at once and re-measure when it has dimensions: the box takes the new
		// photo's shape, so the rect a close glides from is measured again.
		enlarged = null;
		img.src = it.src;
		var settle = () => {
			if (done || closing) return;
			enlarged = measureEnlarged();
		};
		if (img.complete && img.naturalWidth) settle();
		else {
			img.addEventListener('load', settle, { once: true });
			img.addEventListener('error', settle, { once: true });
		}
	}
	function step(to) {
		if (items.length < 2 || closing || done) return;
		var next = cur;
		if (to === 'next') next = (cur + 1) % items.length;
		else if (to === 'prev') next = (cur + items.length - 1) % items.length;
		else if (to === 'first') next = 0;
		else if (to === 'last') next = items.length - 1;
		else if (typeof to === 'number') next = Math.max(0, Math.min(items.length - 1, Math.floor(to) || 0));
		if (next !== cur) show(next);
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
			if (o.restoreFocus !== false) {
				if (prevFocus && prevFocus.focus) prevFocus.focus();
			} else if (prevFocus && doc.activeElement === prevFocus && prevFocus.blur) {
				// A native <dialog> hands focus back to the opener by itself on close; a pointer open
				// wants it dropped, so the photo is not left keyboard-focused behind the deck.
				prevFocus.blur();
			}
		} catch (_e) {
			/* focus is best-effort */
		}
		if (o.onClose) o.onClose();
	}

	function close() {
		if (closing || done) return;
		closing = true;
		root.style.opacity = '0';
		caption.style.opacity = '0';
		var it = items[cur];
		var from = (it.getFrom && it.getFrom()) || it.from || null;
		glide(0, from, enlarged || measureEnlarged(), teardown);
		// The fade is the backstop: if the glide never reports back, the overlay still leaves.
		win.setTimeout(teardown, reduced ? 0 : GLIDE_MS + 120);
	}

	// The keys this overlay answers, over the shared `keyAction` rule. Space is deliberately absent: it
	// does not step, and `onKey` swallows it so the deck behind (where Space advances) never hears it.
	var STEP_KEYS = { ArrowRight: 'next', PageDown: 'next', ArrowLeft: 'prev', PageUp: 'prev', Home: 'first', End: 'last' };
	function onKey(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close();
			return;
		}
		if (e.key === 'Tab') {
			// Focus cycles through the controls and never leaves the overlay.
			e.preventDefault();
			const ring = [btn, prevBtn, nextBtn].filter((b) => b);
			const at = ring.indexOf(doc.activeElement);
			const to = e.shiftKey ? (at <= 0 ? ring.length - 1 : at - 1) : (at + 1) % ring.length;
			ring[to].focus();
			return;
		}
		// While open the lightbox owns the keyboard: no key reaches the deck behind it, so Home, End,
		// `n` and the rest cannot move or toggle anything under the photo. Only the keys that would
		// scroll or page the lightbox itself have their default action cancelled.
		var act = K.keyAction ? K.keyAction(e.key, STEP_KEYS) : undefined;
		if (act && !e.metaKey && !e.ctrlKey && !e.altKey) step(act);
		if (e.key === ' ' || e.key.indexOf('Arrow') === 0 || e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'Home' || e.key === 'End') e.preventDefault();
		e.stopPropagation();
	}

	var prevOverflow = doc.documentElement.style.overflow;
	doc.documentElement.style.overflow = 'hidden';
	doc.addEventListener('keydown', onKey, true);

	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		close();
	});
	if (prevBtn) {
		prevBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			step('prev');
		});
		nextBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			step('next');
		});
	}
	// A click on the backdrop closes; a click on the photo does not. The ghost-click guard: the tap
	// that opened this is followed ~300 ms later by a synthesized click at the same point, which
	// would land on the new backdrop and close it straight away (the same iOS trap video-overlay
	// documents), so a backdrop close inside the first 400 ms is ignored.
	var openedAt = now();
	root.addEventListener('click', (e) => {
		if (e.target === img || e.target === caption || e.target === count || e.target === btn || e.target === prevBtn || e.target === nextBtn) return;
		if (now() - openedAt < 400) return;
		close();
	});
	// Wheel and touch-move on the overlay must not scroll or swipe the deck behind it. A one-finger
	// horizontal move steps, through the shared `swipeAction`. A gesture that ever held two fingers
	// is a pinch and never a swipe (the finger-count rule of `createZoomGesture`, which this file
	// cannot import, so the one flag it needs is kept here until zoom lands).
	root.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });
	var t0 = null;
	var multi = false;
	root.addEventListener(
		'touchstart',
		(e) => {
			if (e.touches.length > 1) multi = true;
			if (!t0) t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
		},
		{ passive: true },
	);
	root.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
	root.addEventListener('touchend', (e) => {
		if (e.touches && e.touches.length > 0) return;
		var from = t0;
		var pinched = multi;
		t0 = null;
		multi = false;
		var c = e.changedTouches && e.changedTouches[0];
		if (!from || !c || pinched || !K.swipeAction) return;
		var act = K.swipeAction({ dx: c.clientX - from.x, dy: c.clientY - from.y });
		if (act) step(act);
	});
	root.addEventListener('touchcancel', () => {
		t0 = null;
		multi = false;
	});

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
	label();
	img.src = items[cur].src;
	var begin = () => {
		if (done || closing) return;
		enlarged = measureEnlarged();
		var from = items[cur].from;
		p = 0;
		paint(from, enlarged);
		glide(1, from, enlarged, () => {
			img.style.transform = '';
		});
	};
	if (img.complete && img.naturalWidth) begin();
	else {
		img.addEventListener('load', begin, { once: true });
		img.addEventListener('error', begin, { once: true });
	}

	// closeNow tears down at once, with no glide: a second open replaces this one without two scroll
	// locks overlapping.
	return { close: close, closeNow: teardown, step: step, index: () => cur, el: root };
}
