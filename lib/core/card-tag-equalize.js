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
 * Only BOXED tags take part: an absolutely placed tag (corner, foot, notch, the `tag-band`
 * strip), a `banner-tag` band, or an in-flow chip with a fill or an edge (`tag-inline`,
 * list-steps' capsule pill). An `axis` slide's label is the card's title, not a tag, and
 * list-steps' native label is bare inline text. Width and height are both capped by the
 * card: an absolute tag's shrink-to-fit width can never pass its card, so neither can the
 * widest one the rest are padded to. A band spans its card, so only its height is equalized.
 * The placement is the slide's own: a slide carries one placement word, so "one size per
 * slide" is one size per placement.
 *
 * `equalizeCardTags(doc, 'report')` measures the same tags and writes nothing: it returns the
 * slides where a tag, left at its own size, would cover its card's body (the plain `.html`
 * export, which has no script to run the pass, warns with it).
 *
 * Pure and self-contained (no closure over module scope), so `.toString()` can inject it into
 * the export page (lattice-emulator.js, which strips the runtime) — one source of truth with
 * lib/runtime/index.js (HARD RULE #1), the lib/core/font-settle.js pattern.
 *
 * engineering/decisions/2026-09-27-card-tag-register.md §3.4.
 */
function equalizeCardTags(doc, mode) {
  // Hosts whose tag is the ::before pseudo-element (a counter or the verdict word).
  const PSEUDO_HOSTS = [
    'section.cards-grid > .cell-stage > ol > li',
    'section.cards-grid .cards-grid-inner--ordered > .card',
    'section.cards-stack > .cell-stage > ol > li',
    'section.cards-stack .cards-stack-inner--ordered > .card',
    'section.split-compare .verdict',
    'section.list-steps:not(.timeline, .chevron, .converge, .ghost) ol > li',
  ].join(', ');
  // Hosts whose tag is the lifted first <strong> (a slot label).
  const STRONG_HOSTS = [
    'section.decision > .cell-stage > :is(ul, ol) > li:has(> strong:first-child)',
    'section.compare-prose:not(.axis) > .cell-stage > :is(ul, ol) > li:has(> strong:first-child)',
    'section.compare-prose:not(.axis) .compare-prose-inner .card:has(> strong:first-child)',
  ].join(', ');
  // A placement word on the slide wins over `banner-tag` (lib/base/base.card-tag.css).
  const PLACEMENTS = ['tag-corner', 'tag-foot', 'tag-notch', 'tag-band', 'tag-inline'];
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

  // A visible box: a fill, or an edge — box-shadow (`tag: plain`) or a border.
  const hasBox = (cs) => {
    const bg = String(cs.backgroundColor || '').replace(/\s+/g, '');
    const clear = bg === '' || bg === 'transparent' || /^rgba\(\d+,\d+,\d+,0\)$/.test(bg);
    const border = num(cs.borderTopWidth) > 0 && cs.borderTopStyle && cs.borderTopStyle !== 'none';
    return !clear || Boolean(cs.boxShadow && cs.boxShadow !== 'none') || Boolean(border);
  };

  // One document-wide query per kind, grouped by the section each host sits in — not one
  // scoped query per section, which is both more work and, in some selector engines (jsdom's),
  // drops `:has()` matches whose leading compound is the scoping element itself.
  const groups = new Map();
  const collect = (host, cs) => {
    const section = host.closest('section');
    if (!section) return;
    const cl = section.classList;
    const placed = PLACEMENTS.some((p) => cl.contains(p));
    const band = cl.contains('tag-band') || (cl.contains('banner-tag') && !placed);
    const boxed = cs.position === 'absolute' || (band && cs.display === 'block') || hasBox(cs);
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

  // REPORT MODE (`mode === 'report'`): write nothing; return the slides where a boxed tag, at its
  // own size, is taller than the room its card reserves, so it covers the body. That is the
  // plain `.html` export's case: it carries no script, so nothing equalizes it, and the static
  // reserve holds one line of tag. The export names these slides instead of shipping them
  // silently (followups.d/2433-p3-plain-html-export-reserves-one-tag-line.md).
  if (mode === 'report') {
    const tops = [...doc.querySelectorAll('section')].filter((sec) => !sec.parentElement?.closest('section'));
    const covered = [];
    for (const [section, { tags }] of groups) {
      const cl = section.classList;
      let worst = 0;
      for (const t of tags) {
        if (t.cs.position !== 'absolute') continue;   // in flow: the card grows around it
        const hs = view.getComputedStyle(t.host);
        const tag = t.h + num(t.cs.paddingTop) + num(t.cs.paddingBottom);
        const over = cl.contains('tag-foot') ? tag - num(hs.paddingBottom)
          : cl.contains('tag-notch') ? tag / 2 - num(hs.paddingTop)
            : tag - num(hs.paddingTop);
        if (over > worst) worst = over;
      }
      if (worst >= 0.5) covered.push({ slide: tops.indexOf(section) + 1, over: Math.round(worst * 10) / 10 });
    }
    return covered.sort((x, y) => x.slide - y.slide);
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
