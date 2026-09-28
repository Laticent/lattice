/**
 * lib/core/card-tag-equalize.js
 *
 * Every boxed card tag on a slide takes ONE size: the widest tag's width and the tallest
 * tag's height. Without this, each tag is sized to its own text — `BUILD`, `WHY NOT DELAY`
 * and a two-line label side by side read as three different components.
 *
 * CSS cannot do it alone. The tags sit on different cards (absolute corners, or bands inside
 * separate grid cells), and CSS has no "max over siblings" outside one grid's tracks. So this
 * pass MEASURES each tag's content box and writes three custom properties that
 * lib/base/base.card-tag.css reads:
 *
 *   --card-tag-shim-x  on each card: extra right padding, so a shorter tag reaches the widest
 *                      (the text stays at the start, where the card's own text starts)
 *   --card-tag-shim-y  on each card: extra top AND bottom padding, half the height gap each,
 *                      so a one-line tag beside a two-line one grows to match, centered
 *   --card-tag-block   on the section: the equalized tag's border-box height, which the
 *                      corner placement's body reserve reads instead of an assumed one line
 *
 * It measures the CONTENT box (getComputedStyle, less padding for a border-box tag), which the
 * shims — padding — never change. So the pass converges in one step, and a second run computes the same values
 * and writes nothing. That matters: the runtime calls this from a MutationObserver that also
 * watches `style`, and an unconditional write would re-trigger it every frame.
 *
 * Only BOXED tags take part: an absolutely placed corner tag, or a `banner-tag` band. An
 * `axis` slide's label is the card's title, not a tag, and list-steps' label is inline text.
 * Width and height are both capped by the card: an absolute tag's shrink-to-fit width can
 * never pass its card, so neither can the widest one the rest are padded to.
 *
 * Pure and self-contained (no closure over module scope), so `.toString()` can inject it into
 * the export page (lattice-emulator.js, which strips the runtime) — one source of truth with
 * lib/runtime/index.js (HARD RULE #1), the lib/core/font-settle.js pattern.
 *
 * engineering/decisions/2026-09-27-card-tag-register.md §3.4.
 */
function equalizeCardTags(doc) {
  // Hosts whose tag is the ::before pseudo-element (a counter or the verdict word).
  const PSEUDO_HOSTS = [
    'section.cards-grid > .cell-stage > ol > li',
    'section.cards-grid .cards-grid-inner--ordered > .card',
    'section.cards-stack > .cell-stage > ol > li',
    'section.cards-stack .cards-stack-inner--ordered > .card',
    'section.split-compare .verdict',
  ].join(', ');
  // Hosts whose tag is the lifted first <strong> (a slot label).
  const STRONG_HOSTS = [
    'section.decision > .cell-stage > :is(ul, ol) > li:has(> strong:first-child)',
    'section.compare-prose:not(.axis) > .cell-stage > :is(ul, ol) > li:has(> strong:first-child)',
    'section.compare-prose:not(.axis) .compare-prose-inner .card:has(> strong:first-child)',
  ].join(', ');
  const view = doc.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return 0;
  const num = (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : Number.NaN; };
  const round = (n) => `${Math.round(n * 100) / 100}px`;
  let writes = 0;
  // Write only a change of at least half a pixel: sub-pixel layout noise must not re-trigger
  // the observer that calls this.
  const put = (el, name, value) => {
    const now = el.style.getPropertyValue(name);
    if (now !== '' && Math.abs(num(now) - num(value)) < 0.5) return;
    el.style.setProperty(name, value);
    writes++;
  };
  // The CONTENT box. A `border-box` tag (the band) reports its padding — shims included — in
  // width and height, so those are taken back out; otherwise a shimmed tag would measure as
  // tall as the tallest, and the next run would remove the shim it had just added.
  const contentBox = (cs) => {
    let w = num(cs.width);
    let h = num(cs.height);
    if (cs.boxSizing === 'border-box') {
      w -= num(cs.paddingLeft) + num(cs.paddingRight) + num(cs.borderLeftWidth) + num(cs.borderRightWidth);
      h -= num(cs.paddingTop) + num(cs.paddingBottom) + num(cs.borderTopWidth) + num(cs.borderBottomWidth);
    }
    return { w, h };
  };

  // A visible box: a fill, or an edge drawn with box-shadow (`tag: plain`).
  const hasBox = (cs) => {
    const bg = String(cs.backgroundColor || '').replace(/\s+/g, '');
    const clear = bg === '' || bg === 'transparent' || /^rgba\(\d+,\d+,\d+,0\)$/.test(bg);
    return !clear || (cs.boxShadow && cs.boxShadow !== 'none');
  };

  // One document-wide query per kind, grouped by the section each host sits in — not one
  // scoped query per section, which is both more work and, in some selector engines (jsdom's),
  // drops `:has()` matches whose leading compound is the scoping element itself.
  const groups = new Map();
  const collect = (host, cs) => {
    const section = host.closest('section');
    if (!section) return;
    const band = section.classList.contains('banner-tag');
    const boxed = cs.position === 'absolute' || (band && cs.display === 'block');
    if (!boxed) return;
    const { w, h } = contentBox(cs);
    if (!(w > 0) || !(h > 0)) return;      // not laid out (a hidden slide)
    if (!groups.has(section)) groups.set(section, { band, tags: [] });
    groups.get(section).tags.push({ host, cs, w, h });
  };
  for (const host of doc.querySelectorAll(PSEUDO_HOSTS)) collect(host, view.getComputedStyle(host, '::before'));
  for (const host of doc.querySelectorAll(STRONG_HOSTS)) {
    const label = host.querySelector(':scope > strong:first-child');
    if (label) collect(host, view.getComputedStyle(label));
  }

  for (const [section, { band, tags }] of groups) {
    const maxW = Math.max(...tags.map((t) => t.w));
    const tallest = tags.reduce((a, b) => (b.h > a.h ? b : a));
    for (const t of tags) {
      // A band is already the card's full width; only its height is equalized.
      put(t.host, '--card-tag-shim-x', round(band ? 0 : maxW - t.w));
      // A tag with no box (`tag-none`) is bare text: centering it in an invisible taller box
      // would only knock its first line out of line with its neighbors', so it stays at the top
      // and the section's block still reserves the tallest one.
      put(t.host, '--card-tag-shim-y', round(hasBox(t.cs) ? (tallest.h - t.h) / 2 : 0));
    }
    // The tallest tag's shim is now 0, and a computed style is LIVE, so its padding here is
    // the plain placement padding: content height plus that is the equalized border box.
    const padY = num(tallest.cs.paddingTop) + num(tallest.cs.paddingBottom)
      + num(tallest.cs.borderTopWidth) + num(tallest.cs.borderBottomWidth);
    if (Number.isFinite(padY)) put(section, '--card-tag-block', round(tallest.h + padY));
  }
  return writes;
}

module.exports = { equalizeCardTags, EQUALIZE_CARD_TAGS_SRC: equalizeCardTags.toString() };
