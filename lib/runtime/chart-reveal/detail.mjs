// THE CHART DETAIL CARD'S BODY and contents — what a host draws once the model (./model.mjs) has
// said which mark is open. Kept out of the model on purpose: the model is loaded by every surface that
// HIT-TESTS a chart (the Studio's eager bundle included), while only a surface that draws the card
// itself needs this. Splitting it gave the Studio's eager JavaScript its 447 gzipped bytes back
// (the docs-site route budget, engineering/decisions/2026-11-16-cenno-popover-library.md §12).

import { detailFor, infoFor } from './model.mjs';

// ── THE DETAIL BODY, styled by the deck ──────────────────────────────────────────────────────────
//
// A row's description is rich Markdown (pills, sparks, lists) whose styling lives in the deck's
// stylesheets, scoped to the slide (`article.lattice > section …`). The card is drawn outside the
// slide (in the top layer), so the body is rendered inside a SHADOW ROOT that carries:
//   - the deck's CSS: one sheet built from the slide document's `<style>` text and same-origin
//     `<link>` rules, cached per document and per style text (a theme or light/dark flip restyles a
//     document IN PLACE, so a cache keyed on the document alone kept the old theme);
//   - the slide's ancestor chain as EMPTY copies (tag, classes and attributes; never an id, an
//     inline style or a handler), so the deck's scoped selectors match inside the card, with a reset
//     that takes those copies' boxes away;
//   - the slide's resolved custom properties, so `var(--…)` finds the value it has on the slide.
// Three guards keep it a card (HARD RULE #22): every `style` attribute in the content is removed
// (the engine writes none on a pill, a spark or a list, so any there is the author's, and an author
// style is what painted a 9000px fixed link over the page in the red team's repro); the shadow root
// keeps an `id` or `name` in it from clobbering page globals; and the light-DOM wrapper has paint
// containment, which no deck rule can reach. The content itself was sanitized before it reached
// the slide (`sanitizeSlideHtml` in the Studio, DOMPurify at export).

const CHAIN = 'lat-desc-chain';
const CHAIN_RESET =
	`.${CHAIN}{all:unset!important;display:block!important;color:inherit!important;font:inherit!important;line-height:1.45!important;}` +
	// The slide's own chrome hangs off its pseudo-elements: the page number is `section::after`, and it
	// drew a stray "2" in the card on a paginated deck. (Same reset as the Studio's card, chart-detail-layer.tsx.)
	`.${CHAIN}::before,.${CHAIN}::after{content:none!important;display:none!important}` +
	'section.lat-desc>:first-child{margin-top:0}section.lat-desc>:last-child{margin-bottom:0}' +
	// A list in a description reads as a plain list: the deck's list rules draw a column of dashes
	// and pills laid out for a full-width row, not a card.
	'section.lat-desc ul{list-style:disc outside!important;padding:0 0 0 1.2em!important;margin:0.25em 0 0!important}' +
	'section.lat-desc ol{list-style:decimal outside!important;padding:0 0 0 1.4em!important;margin:0.25em 0 0!important}' +
	'section.lat-desc li{display:list-item!important;padding:0!important;margin:0!important}' +
	'section.lat-desc li::before{content:none!important}';

const deckSheets = new WeakMap();

/** Every stylesheet's text (or a link's href), joined: the cache key where no MutationObserver exists. */
function styleKey(doc) {
	let key = '';
	for (const el of doc.querySelectorAll('style, link[rel~="stylesheet"]')) key += el.tagName === 'LINK' ? `@${el.href}\n` : `${el.textContent ?? ''}\n`;
	return key;
}

/** True when a mutation touched a stylesheet: a <style> or <link> added, removed, re-pointed or re-written. */
function touchesStyles(m) {
	const isSheet = (n) => n?.nodeType === 1 && (n.tagName === 'STYLE' || (n.tagName === 'LINK' && !!n.relList?.contains('stylesheet')));
	if (m.type === 'characterData') return m.target.parentNode?.tagName === 'STYLE';
	if (m.type === 'attributes') return isSheet(m.target);
	if (isSheet(m.target)) return true; // a <style>'s text node replaced
	for (const n of [...m.addedNodes, ...m.removedNodes]) {
		if (isSheet(n) || (n.nodeType === 1 && n.querySelector?.('style, link[rel~="stylesheet"]'))) return true;
	}
	return false;
}

/**
 * The deck's CSS as one text, plus the chain reset; cached per document. The cache is invalidated by a
 * MutationObserver that fires only when a stylesheet changes (a theme or light/dark flip restyles a
 * document IN PLACE in the Studio, and a cache that missed that kept the old theme), so a hover that
 * switches marks costs nothing. Comparing the style TEXT on every open, as the Studio's card did, cost a
 * join and compare of every <style> per reveal: 2.3 MB in a large exported player (the checker, PR #3259).
 * Without MutationObserver the text is compared, as before.
 */
function deckCss(doc) {
	let entry = deckSheets.get(doc);
	// A MutationObserver delivers LATER (a microtask), so a stylesheet rewritten in this same task has not
	// marked the cache yet: read the pending records now, so a card drawn right after a restyle is current.
	if (entry?.mo && !entry.dirty && entry.mo.takeRecords().some(touchesStyles)) entry.dirty = true;
	if (entry && !entry.dirty && (entry.observed || entry.key === styleKey(doc))) return entry;
	const parts = [];
	for (const sheet of [...doc.styleSheets]) {
		try {
			parts.push([...sheet.cssRules].map((r) => r.cssText).join('\n'));
		} catch {
			/* a cross-origin sheet (a webfont host) cannot be read; its fonts still load in the page */
		}
	}
	parts.push(CHAIN_RESET);
	const MO = doc.defaultView?.MutationObserver;
	const observed = !!(entry?.observed || MO);
	entry = { text: parts.join('\n'), sheet: null, realm: null, dirty: false, observed, key: observed ? '' : styleKey(doc), mo: entry?.mo ?? null };
	if (MO && !entry.mo) {
		const e = entry;
		e.mo = new MO((list) => {
			const cur = deckSheets.get(doc);
			if (cur && list.some(touchesStyles)) cur.dirty = true;
		});
		e.mo.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'rel', 'media', 'disabled'] });
	}
	deckSheets.set(doc, entry);
	return entry;
}

// `data-lattice-slide` is the hook every surface SIZES a slide with (the player's
// `section[data-lattice-slide]{width:1280px!important;…}`), so a copy that kept it was laid out as a whole
// slide inside the card. The card's chain needs the deck's SCOPE, never a slide's box.
const NEVER_COPIED = new Set(['id', 'style', 'data-lattice-slide']);

function shallowCopy(doc, el, extra, drop) {
	const copy = doc.createElement(el.tagName.toLowerCase());
	for (const { name, value } of [...el.attributes]) {
		if (NEVER_COPIED.has(name) || drop.has(name) || name.startsWith('on')) continue;
		copy.setAttribute(name, value);
	}
	copy.classList.add(CHAIN);
	if (extra) copy.classList.add(extra);
	return copy;
}

function copyVars(section, to) {
	const cs = section.ownerDocument.defaultView?.getComputedStyle(section);
	if (!cs) return;
	for (let i = 0; i < cs.length; i++) {
		const name = cs[i];
		if (name.startsWith('--')) to.style.setProperty(name, cs.getPropertyValue(name));
	}
}

/**
 * Render `content` (a fragment the caller owns, already a copy) into `host`, styled by the deck the
 * `section` belongs to. `drop` names host CHROME attributes to leave off the copied chain (the player's
 * `data-lp-view`, whose view rules would otherwise reach into the card). Returns `host`. Without a section, or where shadow DOM is missing, the
 * content is drawn unstyled but still contained.
 */
export function renderDeckDetail(host, content, section, { drop = [] } = {}) {
	const dropSet = new Set(drop);
	const doc = host.ownerDocument;
	for (const styled of content.querySelectorAll?.('[style]') ?? []) styled.removeAttribute('style');
	host.style.contain = 'paint';
	host.style.overflow = 'clip';
	const inner = doc.createElement('div');
	host.replaceChildren(inner);
	if (typeof inner.attachShadow !== 'function') {
		inner.append(content);
		return host;
	}
	const root = inner.attachShadow({ mode: 'open' });
	if (!section) {
		root.append(content);
		return host;
	}
	const css = deckCss(section.ownerDocument);
	const win = doc.defaultView;
	if (win?.CSSStyleSheet && 'adoptedStyleSheets' in root) {
		try {
			// A constructed sheet belongs to the document that made it, so build one per host realm.
			if (!css.sheet || css.realm !== win) {
				css.sheet = new win.CSSStyleSheet();
				css.sheet.replaceSync(css.text);
				css.realm = win;
			}
			root.adoptedStyleSheets = [css.sheet];
		} catch {
			const style = doc.createElement('style');
			style.textContent = css.text;
			root.append(style);
		}
	} else {
		const style = doc.createElement('style');
		style.textContent = css.text;
		root.append(style);
	}
	const wrap = shallowCopy(doc, section, 'lat-desc', dropSet);
	copyVars(section, wrap);
	wrap.append(content);
	let outer = wrap;
	for (let a = section.parentElement; a && a.tagName !== 'BODY' && a.tagName !== 'HTML'; a = a.parentElement) {
		const copy = shallowCopy(doc, a, '', dropSet);
		copy.appendChild(outer);
		outer = copy;
	}
	root.append(outer);
	return host;
}

/**
 * Everything a card needs for mark i, as plain values and fresh nodes: the title, value and color
 * (`infoFor`), whether it is lean, and copies of the description and meta items (empty fragments
 * when absent). The caller decides how to draw them.
 */
export function cardFor(sec, svg, detailsEl, i, doc) {
	const { label, value, dot } = infoFor(sec, svg, i);
	const d = detailFor(detailsEl, i);
	// Every copy loses its `style` attributes HERE, before any host draws it (HARD RULE #22): the engine
	// writes none on a pill, a spark or a list, so any style in a detail is the author's, and an author
	// style is what turned a footer link into a 9000px fixed overlay over the whole player (the checker's
	// repro, PR #3259). `renderDeckDetail` strips again; a host that draws the parts some other way is
	// still covered.
	const copy = (li) => {
		const f = doc.createDocumentFragment();
		for (const n of li.childNodes) f.append(doc.importNode(n, true));
		for (const styled of f.querySelectorAll('[style]')) styled.removeAttribute('style');
		return f;
	};
	const meta = doc.createDocumentFragment();
	d.meta.forEach((li, k) => {
		if (k) meta.append(doc.createTextNode(' · '));
		meta.append(copy(li));
	});
	return { label, value, dot, lean: d.lean, body: d.body ? copy(d.body) : null, meta: d.meta.length ? meta : null };
}
