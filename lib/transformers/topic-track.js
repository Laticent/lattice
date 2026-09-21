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
 * The last two are now caught on an AUTHORED track as well — `markAuthored`
 * picks exactly one item, and falls back to the slide's own heading when the
 * author marked none — but on a derived track they cannot arise at all.
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
const {
  eachTopLevelElement, findTopLevelElement, hasTopLevelTag, maskInert,
  readTopLevelH2Text, stripTags,
} = require('../core/top-level-h2');

const TRACK_CLASS = 'tile-track';

function tokens(cls) {
  return String(cls || '').trim().split(/\s+/).filter(Boolean);
}

const isDivider = (t) => t.includes('divider');
const isTopic = (t) => t.includes('topic');

/**
 * Our OWN emitted track, found by its tail rather than by a substring scan.
 *
 * This kernel always appends the track as the last thing in the section, so
 * "does it end with one?" is most of the question, and asking it that way fixes
 * the common shapes a raw `inner.includes('class="tile-track"')` got wrong — a
 * commented-out track, and one quoted inside a card — which made the engine
 * treat the slide as overridden while `:scope > ul.tile-track` did not.
 *
 * NOT "immune", which is what this said before. The tail test still mis-reads
 * two shapes, both needing hand-written raw HTML: a quoted `tile-track` inside a
 * card that is the LAST element in the section, and one hidden in an attribute
 * value (`<li data-x='<ul class="tile-track">'>`). Masking handles comments and
 * RAWTEXT; it does not make the tail test a parser. The residual is recorded
 * here rather than described away.
 *
 * The depth walk alone cannot replace it: a section whose inner HTML ends at
 * depth > 0 (author raw HTML with an unclosed tag) hides the appended `<ul>`
 * from `hasTopLevelTag`, so a second pass appended a second track — measured,
 * 3 tracks became 5. Idempotence is a contract this kernel states; inferring it
 * from depth balance is not the same as checking it.
 */
const TRACK_TAIL = new RegExp(`<ul class="${TRACK_CLASS}"[^>]*>[\\s\\S]*<\\/ul>\\s*$`);

function hasTrack(inner) {
  // MASKED first. The tail test alone is comment-BLIND and `[\\s\\S]*` is greedy,
  // so a commented-out track plus any later `</ul>` matched — the section then
  // looked already-tracked to the engine and did not to `:scope > ul.tile-track`,
  // the same split the raw `String.includes` form had.
  return TRACK_TAIL.test(maskInert(inner));
}

/**
 * An authored list this kernel must not rewrite the NAMES of.
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
function hasAuthoredList(inner) {
  return hasTrack(inner) || hasTopLevelTag(inner, 'ul');
}

/** Both questions at once — what pass 1 needs to know to skip a slide's name. */
function hasList(inner) {
  return hasAuthoredList(inner);
}

/* ── THE AUTHORED MARKER ─────────────────────────────────────────────────────
 *
 * On a DERIVED track this kernel stamps `class="on"` itself. On an AUTHORED one
 * it has to read the author's mark, and the manifest documents that mark as a
 * wholly bold item: `- **Payback**`.
 *
 * That test CANNOT live in CSS, and believing it could shipped a track that
 * lied. `li:has(> strong:only-child)` looks like "the item is nothing but bold",
 * but `:only-child` counts ELEMENT siblings and text nodes are invisible to it —
 * so `- Cost to **win**` renders `<li>Cost to <strong>win</strong></li>`, whose
 * `<strong>` is indeed the only element child, and it lit. Measured in Chromium
 * on a rendered slide: a `topic` headed "Overridden" drew its accent under the
 * column reading "Cost to win". Two partially-emphasized labels lit two columns,
 * which is the "an author who marks two gets two" failure the derivation exists
 * to remove, reintroduced by the very selector whose comment claimed it removed
 * it.
 *
 * So the marker is decided HERE, where the text is readable, and the CSS is left
 * with one selector it can actually honor: `li.on`. The test is exact — the
 * item's whole text must be the `<strong>`'s whole text.
 *
 * FALLBACK: an author who marks nothing gets the item whose label matches this
 * slide's own `<h2>`. That is the third silent failure from the header ("an
 * author who marks nothing gets a track with no current item"), and on an
 * overridden track it is now unreachable whenever the labels include the
 * heading. FIRST match only, so marking two still lights one.
 */
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

const plain = (v) => stripTags(String(v)).replace(/\s+/g, ' ').trim();

/**
 * Read one attribute off a tag's attribute string, walking name=value pairs.
 *
 * NOT `/\sclass\s*=\s*"/` over the whole string: that also matches text INSIDE
 * another attribute's value, so `<li data-x="a class=on b">` read as already
 * marked and the string arm marked nothing while the DOM arm marked correctly.
 * That is the `data-class` defect family `lib/core/section-walk.js` documents
 * (#1358), reached from the other direction — the value rather than the name.
 *
 * Walking pairs closes it because a quoted value is consumed whole.
 */
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

function readAttr(attrs, want) {
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(String(attrs)))) {
    if (m[1].toLowerCase() === want) {
      return { value: m[3] ?? m[4] ?? m[5] ?? '', start: m.index, end: m.index + m[0].length };
    }
    if (ATTR_RE.lastIndex === m.index) ATTR_RE.lastIndex += 1;   // zero-width guard
  }
  return null;
}

/**
 * Is `on` among this item's classes?
 *
 * A TOKEN test, not `\bon\b` over the attribute string: a word boundary also
 * sits inside `on-hold` and `add-on`, so an unrelated class made the string arm
 * read the list as already marked and mark nothing, while the DOM arm's
 * `classList.contains('on')` marked the right item.
 */
function hasOnClass(attrs) {
  const a = readAttr(attrs, 'class');
  return Boolean(a?.value.split(/\s+/).includes('on'));
}

/**
 * Add `on` to an item's classes, normalizing the quoting to double quotes.
 *
 * Appending ` class="on"` unconditionally emitted a SECOND `class` attribute on
 * `<li class='x'>` and `<li class=x>`. The first one wins in HTML, so the mark
 * silently never applied — and the DOM arm marked the item correctly, so the two
 * paths disagreed on a slide nobody would think to check.
 */
function withOnClass(attrs) {
  const a = readAttr(attrs, 'class');
  if (!a) return `${attrs} class="on"`;
  const next = a.value ? `${a.value} on` : 'on';
  return `${attrs.slice(0, a.start)}class="${next}"${attrs.slice(a.end)}`;
}

/**
 * The item's entire content is one `<strong>` — optionally wrapped in the `<p>`
 * a LOOSE list adds (a blank line between items makes CommonMark wrap each one).
 *
 * Masked first, so an authoring comment ahead of the mark
 * (`<li><!-- keep --><strong>G</strong></li>`) does not defeat the anchor here
 * while `domWhollyBold` — which reads elements, not text — sees straight past it.
 */
function whollyBold(liInner) {
  const m = maskInert(liInner)
    .match(/^\s*(?:<p[^>]*>\s*)?<strong>([\s\S]*?)<\/strong>\s*(?:<\/p>\s*)?$/);
  return Boolean(m) && plain(m[1]) !== '';
}

/** A direct-child `<li>` of the section's own list: its attributes and content. */
function trackItems(inner) {
  const ul = findTopLevelElement(inner, 'ul');
  if (!ul) return null;
  const body = inner.slice(ul.tagEnd, ul.innerEnd);
  const items = [...eachTopLevelElement(body, 'li')].map((li) => ({
    at: ul.tagEnd + li.start,
    openLen: li.tagEnd - li.start,
    attrs: body.slice(li.start + 3, li.tagEnd - 1),
    text: body.slice(li.tagEnd, li.innerEnd),
  }));
  return items.length ? items : null;
}

/**
 * Stamp `class="on"` on an authored track's current item. Leaves the labels
 * exactly as written — this adds a class and nothing else.
 *
 * DIRECT-CHILD ITEMS ONLY, and that is not a refinement. Scanning every `<li>`
 * in the list with a non-greedy `/<li\b([^>]*)>([\s\S]*?)<\/li>/g` also matched a
 * SUB-BULLET, so ordinary two-level markdown —
 *
 *     - Cost
 *       - detail
 *       - **Payback**
 *     - Other
 *
 * — stamped the mark on a nested `<li>` that `section.topic > ul > li.on` can
 * never match. Measured in Chromium: no accent over any column, because the pick
 * was spent on an invisible item and the heading fallback never ran. The slide
 * was strictly worse than having no marker rule at all.
 *
 * AN EARLIER VERSION OF THIS COMMENT added "and the DOM arm lit the right one."
 * It did not — run against that shape the old DOM arm marked NOTHING. The arms
 * did disagree (one marked an unreachable item, the other marked none), and they
 * agree now, but they agree at the RIGHT item because of the heading fallback,
 * not because the DOM arm was already correct. The embellishment made a real
 * defect sound like a one-sided one.
 *
 * Returns `inner` unchanged when the list already carries a mark, so a second
 * pass is a no-op.
 */
function markAuthored(inner) {
  const items = trackItems(inner);
  if (!items) return inner;
  if (items.some((i) => hasOnClass(i.attrs))) return inner;

  const heading = plain(readTopLevelH2Text(inner));
  let pick = items.find((i) => whollyBold(i.text));
  if (!pick && heading) pick = items.find((i) => plain(i.text) === heading);
  if (!pick) return inner;

  return inner.slice(0, pick.at)
    + `<li${withOnClass(pick.attrs)}>`
    + inner.slice(pick.at + pick.openLen);
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

  // NOT gated on `sections.length`. A deck with no `divider` derives nothing,
  // but its `topic` slides may still carry an AUTHORED track whose marker has
  // to be stamped — which is exactly the gallery, where every sample authors
  // its list because a gallery slide has no section around it. Returning early
  // there left the gallery's tracks with nothing lit.
  let si = -1;
  let ti = 0;
  return mapSections(html, (_openTag, cls, inner) => {
    const t = tokens(cls);
    if (isDivider(t)) { si += 1; ti = 0; return null; }
    if (!isTopic(t)) return null;
    // `ti` advances for EVERY topic slide the section counted, including the
    // ones that return early. `collectSections` pushes a slot for each of them,
    // so skipping the increment slid the name array out of register and every
    // LATER slide in that section silently lost its whole band — engine only.
    if (hasTrack(inner)) { if (si >= 0) ti += 1; return null; }
    if (hasAuthoredList(inner)) {                     // authored override
      if (si >= 0) ti += 1;
      return markAuthored(inner);
    }
    if (si < 0) return null;                          // no section, nothing to derive
    const names = sections[si] || [];
    const mine = ti;
    ti += 1;
    // No heading of its own → no position in the scale. Without this the slide
    // still got a track whose `on` landed on the NEXT topic, so two consecutive
    // slides claimed to be the same one.
    if (!names[mine]) return null;
    const shown = names.filter((n) => n);        // drop overridden siblings
    if (shown.length < 2) return null;           // a scale of one is not a scale
    const idx = names.slice(0, mine).filter((n) => n).length;
    const out = inner + trackHtml(shown, idx);
    // ONLY if the append lands where we mean it. A section whose raw HTML leaves
    // an element open — `<h2>Raw heading` with no `</h2>` — swallows whatever
    // follows, so the track would parse INSIDE the heading and render as heading
    // text. The DOM arm cannot hit this (`appendChild` places the node), so it is
    // also the one shape where a string rewriter and a DOM mutator genuinely
    // cannot agree; the string arm declines rather than emitting a visible defect.
    return hasTopLevelTag(out, 'ul') ? out : null;
  });
}

const domText = (el) => String(el.textContent || '').replace(/\s+/g, ' ').trim();

/** The DOM mirror of `whollyBold` — the item's whole text IS the `<strong>`'s. */
function domWhollyBold(li) {
  let host = li;
  const kids = [...li.children];
  if (kids.length === 1 && kids[0].tagName === 'P') host = kids[0];
  const inner = [...host.children];
  if (inner.length !== 1 || inner[0].tagName !== 'STRONG') return false;
  const whole = domText(host);
  return whole !== '' && whole === domText(inner[0]);
}

/** The DOM mirror of `markAuthored`. */
function markAuthoredDom(s, ul) {
  const items = [...ul.children].filter((el) => el.tagName === 'LI');
  if (!items.length || items.some((li) => li.classList.contains('on'))) return;
  const h2 = s.querySelector(':scope > h2');
  const heading = h2 ? domText(h2) : '';
  let pick = items.find((li) => domWhollyBold(li));
  if (!pick && heading) pick = items.find((li) => domText(li) === heading);
  if (pick) pick.classList.add('on');
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
    if (!s.classList.contains('topic')) continue;
    const authored = s.querySelector(':scope > ul');
    // Stamp the marker whether or not a section encloses this slide — the
    // string arm does, and the gallery has no `divider` at all.
    if (authored && !authored.classList.contains(TRACK_CLASS)) markAuthoredDom(s, authored);
    if (!cur) continue;
    if (authored) { cur.push(null); own.set(s, { names: cur, idx: -1 }); continue; }
    const h2 = s.querySelector(':scope > h2');
    cur.push(h2 ? domText(h2) : '');
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
