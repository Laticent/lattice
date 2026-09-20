/**
 * topic-track — derive each `topic` slide's sibling track from the deck itself.
 *
 * A `topic` anchor locates the audience INSIDE a section: it shows the section's
 * topics as a scale with the current one lit. The names for that scale already
 * exist — every topic slide carries its own `<h2>` — so the author writes them
 * ONCE, on the slide they belong to, and this kernel assembles the scale.
 *
 * ── WHY DERIVED AND NOT AUTHORED ────────────────────────────────────────────
 *
 * An authored list has three failure modes, all of them silent:
 *   · renaming one topic means editing every topic slide in the section, and a
 *     missed edit leaves the track asserting a name that no longer exists;
 *   · an author who marks nothing gets a track with no current item;
 *   · an author who marks two gets two.
 * A derived track cannot go stale or lie, because it reads the headings that
 * are already on the slides.
 *
 * ── THE PRECEDENT, AND THE DIFFERENCE FROM THE REJECTED COUNTER ─────────────
 *
 * `lib/forms/tile/progress/progress.transform.js` already does exactly this one
 * level up: walk every section, count `divider` slides for the total, track the
 * current index, inject a position rail. This is that pattern at topic scale,
 * and it counts dividers the same way that kernel does — ANY `divider`, `light`
 * included — so the two agree about where a section starts.
 *
 * A derived sub-counter (`2 of 4`) was considered for this component and
 * REJECTED, so it is worth being precise about why a derived TRACK is not the
 * same bet. `lib/core/section-index.js` records the cost of deriving: where the
 * runtime does not run, the mark does not draw. For a numeral that loses a
 * corner label.
 *
 * An earlier revision of this comment claimed a trackless slide "renders as the
 * `fact` form, a composed layout, not a hole." THAT WAS FALSE — this kernel adds
 * no class, so the slide keeps the DEFAULT form, and the default reserved the
 * shelf unconditionally: the gallery PDF showed an empty band across the bottom
 * quarter. The claim was load-bearing for this whole derive-vs-author decision
 * and it was not true of the artifact the change shipped.
 *
 * What makes it true now is CSS, not prose: `section.topic:not(:has(> ul))`
 * drops the band, the seam and the shelf reserve, so a slide with no track
 * composes as a single dark canvas rather than reserving room for something
 * that is not there (topic.styles.css § no track).
 *
 * ── AUTHORED OVERRIDE ───────────────────────────────────────────────────────
 *
 * A `topic` slide that already carries a `<ul>` keeps it untouched. That covers
 * what derivation cannot reach: track labels shorter than the headings, or a
 * section whose later topics are not written yet.
 *
 * Idempotent (HARD RULE #1's registry contract): re-running finds the emitted
 * `<ul class="tile-track">` and returns the section unchanged.
 */

const { mapSections } = require('../core/section-walk');
const { hasTopLevelTag, readTopLevelH2Text } = require('../core/top-level-h2');

const TRACK_CLASS = 'tile-track';

function tokens(cls) {
  return String(cls || '').trim().split(/\s+/).filter(Boolean);
}

const isDivider = (t) => t.includes('divider');
const isTopic = (t) => t.includes('topic');

/**
 * Already has a track, or an authored list this kernel must not touch.
 *
 * DIRECT CHILD ONLY. A bare `/<ul[\s>]/` also matched a list nested inside a
 * blockquote or a card — neither of which is the section's own list — and the
 * DOM arm's `:scope > ul` did not, so the two adapters disagreed about whether a
 * slide was overridden (HARD RULE #1). Worse on the string path alone: an
 * author's `> - source note` blockquote silently deleted that slide's track AND
 * withheld its name from every sibling, so the remaining tracks asserted a
 * two-topic section that had three — exactly the "a track that lies" failure
 * this kernel's header says derivation makes impossible.
 *
 * `section.topic > ul` is what the CSS styles and `ul > li` is what the manifest
 * declares, so direct-child is also the only reading that matches the contract.
 */
function hasList(inner) {
  return hasTopLevelTag(inner, 'ul');
}

/**
 * `&` FIRST, or every entity this emits gets double-escaped. The heading text
 * arrives with its own entities already encoded (it came out of rendered HTML),
 * so this only has to be safe against a raw `<` or `&` that survived a tag
 * strip — it is belt-and-braces on text that is already markup-safe.
 */
function esc(s) {
  return String(s).replace(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function trackHtml(names, currentIdx) {
  const items = names.map((n, i) =>
    `<li${i === currentIdx ? ' class="on"' : ''}>${esc(n)}</li>`).join('');
  // `aria-hidden`: the track restates headings the reader already meets on the
  // surrounding slides, so a screen reader would hear every topic name N times
  // over a section. The same call the progress rail makes for the same reason.
  return `<ul class="${TRACK_CLASS}" aria-hidden="true">${items}</ul>`;
}

/**
 * Pass 1 — walk the deck and collect, per section, the topic headings in order.
 * Returns an array of name-arrays, one per section, in document order.
 */
function collectSections(walk) {
  const sections = [];
  let cur = null;
  walk((cls, inner) => {
    const t = tokens(cls);
    if (isDivider(t)) { cur = []; sections.push(cur); return; }
    if (!isTopic(t) || !cur) return;
    // An authored list opts the slide out of derivation, so it must not
    // contribute a name either — otherwise the derived tracks on its SIBLINGS
    // would list a topic whose own slide shows a different set.
    if (hasList(inner)) { cur.push(null); return; }
    cur.push(readTopLevelH2Text(inner));
  });
  return sections;
}

/** HTML-string adapter — the owned engine path (engine, CLI, Playground). */
function applyToHtml(html) {
  if (typeof html !== 'string' || !html.includes('topic')) return html;

  const sections = collectSections((visit) => {
    mapSections(html, (_openTag, cls, inner) => { visit(cls, inner); return null; });
  });
  if (!sections.length) return html;

  let si = -1;
  let ti = 0;
  return mapSections(html, (_openTag, cls, inner) => {
    const t = tokens(cls);
    if (isDivider(t)) { si += 1; ti = 0; return null; }
    if (!isTopic(t) || si < 0) return null;
    const names = sections[si] || [];
    const mine = ti;
    ti += 1;
    if (hasList(inner)) return null;            // authored override / idempotent
    // No heading of its own → no position in the scale. Without this the slide
    // still got a track whose `on` landed on the NEXT topic, so two consecutive
    // slides claimed to be the same one.
    if (!names[mine]) return null;
    const shown = names.filter((n) => n);        // drop overridden siblings
    if (shown.length < 2) return null;           // a scale of one is not a scale
    const idx = names.slice(0, mine).filter((n) => n).length;
    return inner + trackHtml(shown, idx);
  });
}

/** Live-DOM adapter — the runtime bundle (the only path reaching Marp). */
function applyToDom(root) {
  if (!root) return;
  const doc = root.ownerDocument || root;
  const slides = [...root.querySelectorAll('section[data-lattice-slide]')];
  if (!slides.length) return;

  // Pass 1 — the same partition, read off the live DOM.
  const sections = [];
  let cur = null;
  const own = new Map();   // slide -> { names, idx }
  for (const s of slides) {
    if (s.classList.contains('divider')) { cur = []; sections.push(cur); continue; }
    if (!s.classList.contains('topic') || !cur) continue;
    const authored = s.querySelector(':scope > ul');
    if (authored) { cur.push(null); own.set(s, { names: cur, idx: -1 }); continue; }
    const h2 = s.querySelector(':scope > h2');
    cur.push(h2 ? h2.textContent.replace(/\s+/g, ' ').trim() : '');
    own.set(s, { names: cur, idx: cur.length - 1 });
  }

  // Pass 2 — inject.
  for (const [s, { names, idx }] of own) {
    if (idx < 0) continue;                                   // authored override
    if (!names[idx]) continue;                               // no heading, no position
    if (s.querySelector(`:scope > ul.${TRACK_CLASS}`)) continue;  // idempotent
    const shown = names.filter((n) => n);
    if (shown.length < 2) continue;
    const at = names.slice(0, idx).filter((n) => n).length;
    const ul = doc.createElement('ul');
    ul.className = TRACK_CLASS;
    ul.setAttribute('aria-hidden', 'true');
    shown.forEach((n, i) => {
      const li = doc.createElement('li');
      if (i === at) li.className = 'on';
      li.textContent = n;
      ul.appendChild(li);
    });
    s.appendChild(ul);
  }
}

module.exports = {
  name: 'topic-track',
  selector: 'section.topic',
  applyToHtml,
  applyToDom,
};
