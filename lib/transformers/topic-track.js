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
 * What makes it true now is CSS, not prose: `section.topic:not(:has(> ul.tile-track))`
 * drops the band, the seam and the shelf reserve, so a slide with no track
 * composes as a single dark canvas rather than reserving room for something
 * that is not there (topic.styles.css § no track).
 *
 * ── THE OVERRIDE IS A DIRECTIVE, NOT A LIST ─────────────────────────────────
 *
 * `<!-- _track: Cost to win | Lifetime value | [Payback] -->` names the scale
 * outright, for what derivation cannot reach: labels shorter than the headings,
 * or a section whose later topics are not written yet. The engine stamps it as
 * `data-track` on the section, this kernel reads that ONE string on both arms,
 * and then emits the same `<ul class="tile-track">` it emits for a derived
 * track — same markup, same `class="on"`.
 *
 * So there is no author markup to interpret, and both questions the old
 * authored-`<ul>` shape forced the engine to infer are gone rather than
 * re-answered: *is this list the track?* (it never is — a track is something
 * this kernel writes) and *which item is marked?* (the one in brackets). Those
 * two questions were roughly half the defects five review rounds found on
 * #2245, and each was a place where the string arm and the DOM arm could read
 * the same slide differently. The grammar, and what it deliberately does not
 * do, is `lib/core/track-spec.js`.
 *
 * ON THE EXPORT-TO-MARP ROUTE the override is expected to fall back rather than
 * carry: marp-core reads a non-directive comment as a presenter note, so nothing
 * stamps `data-track` there and the DOM arm derives from the headings instead.
 * The track still says WHERE the reader is; it is the custom LABELS that are
 * lost. UNVERIFIED (HARD RULE #23) — marp-core is not installed in this sandbox,
 * so that is read off Marpit's documented comment handling and not measured on a
 * render. `_focus` and `_build` reach that route the same way, through a
 * `data-` attribute the engine stamps, and carry the same exposure.
 *
 * A `topic` slide that carries a stray top-level `<ul>` is NOT an override any
 * more — it is content, it derives like any other slide, and `npm run lint:deck`
 * says so (`topic-track-list`). That is the migration cost of removing the
 * ambiguity, and it is paid once, visibly, rather than on every topic slide.
 *
 * Idempotent (HARD RULE #1's registry contract): re-running finds the emitted
 * `<ul class="tile-track">` and returns the section unchanged.
 */

const { mapSections } = require('../core/section-walk');
const {
  findTopLevelTag, hasTopLevelTag, maskInert, readTopLevelH2Text,
} = require('../core/top-level-h2');
const { parseTrackSpec, MIN_TRACK_LABELS } = require('../core/track-spec');

const TRACK_CLASS = 'tile-track';
const TRACK_ATTR = 'data-track';

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
 * treat the slide as already tracked while `:scope > ul.tile-track` did not.
 *
 * NOT "immune", which is what this said before. The tail test still mis-reads
 * two shapes, both needing hand-written raw HTML: a quoted `tile-track` inside a
 * card that is the LAST element in the section, and one hidden in an attribute
 * value (`<li data-x='<ul class="tile-track">'>`). Masking handles comments and
 * RAWTEXT; it does not make the tail test a parser. The residual is recorded
 * here rather than described away.
 *
 * A depth walk alone cannot replace it either: a section whose inner HTML ends
 * at depth > 0 (author raw HTML with an unclosed tag) hides the appended `<ul>`
 * from the walk, so a second pass appended a second track — measured, 3 tracks
 * became 5. Idempotence is a contract this kernel states; inferring it from
 * depth balance is not the same as checking it.
 *
 * SO IT IS BOTH, AND THE TAIL TEST ALONE WAS A REGRESSION. While the authored
 * `<ul>` was still an override, `hasAuthoredList` asked the depth walk as well,
 * and that second question is what actually recognized the emitted track on the
 * engine's OWN output — where the track is never last: the pipeline appends a
 * pagination span and the berth divs after it
 * (`…</ul><span class="lat-pagination">3</span><div class="marker-rail" …>`).
 * Deleting the authored arm took the belt with it and left the tail test
 * deciding alone, so `applyToHtml` stopped recognizing its own work: measured on
 * `examples/topic.md`, a second pass turned 6 tracks into 12, while the DOM
 * arm's `:scope > ul.tile-track` was unmoved — the exact HARD RULE #1 split this
 * module exists to prevent, reintroduced by removing the check that hid it.
 *
 * The suite did not catch it because its decks are synthetic and their track IS
 * the last element, i.e. the one shape that cannot fail (HARD RULE #23). The
 * test that pins this now uses the shape the engine really emits.
 */
const TRACK_TAIL = new RegExp(`<ul class="${TRACK_CLASS}"[^>]*>[\\s\\S]*<\\/ul>\\s*$`);

const TRACK_CLASS_RE = new RegExp(`(?:^|\\s)${TRACK_CLASS}(?:\\s|$)`);

/**
 * Read one attribute off a tag, the way the HTML tokenizer does.
 *
 * A LOOP, NOT A REGEX, and it is the third attempt — each earlier one was a
 * pattern that had to guess where an attribute begins, and each guessed wrong in
 * a way that split the two render arms:
 *
 *   · `section-walk`'s `readAttr` is quote-blind, so ` class="tile-track"` INSIDE
 *     another attribute's value matched;
 *   · an un-anchored pair walker let a name carrying an out-of-charset character
 *     (`@class`, `9class`) resync mid-name, so the `class` tail matched alone;
 *   · anchoring it to whitespace then missed `<ul data-x="a"class="tile-track">`,
 *     which a parser accepts — after a QUOTED value any character re-enters the
 *     before-attribute-name state — and which every HTML minifier emits.
 *
 * The loop has no such guess: it walks name, `=`, value, and the value's own
 * quoting tells it where the next name starts. Linear, no backtracking.
 *
 * Every shape above, and thirteen more, are checked against jsdom in
 * `test/unit/transformers/topic-track.test.js` — the rewrite shipped with no
 * test at all, and the regex it replaced survived the whole suite as a mutant,
 * so this comment described a pin that did not exist.
 */
function tagAttr(tag, want) {
  const s = String(tag);
  const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
  // Past `<name`, which is not an attribute.
  let i = 0;
  while (i < s.length && s[i] !== '<') i += 1;
  i += 1;
  while (i < s.length && !isSpace(s[i]) && s[i] !== '>' && s[i] !== '/') i += 1;

  while (i < s.length) {
    while (i < s.length && (isSpace(s[i]) || s[i] === '/')) i += 1;
    if (i >= s.length || s[i] === '>') return null;
    const nameAt = i;
    while (i < s.length && !isSpace(s[i]) && s[i] !== '=' && s[i] !== '>' && s[i] !== '/') i += 1;
    const name = s.slice(nameAt, i).toLowerCase();
    while (i < s.length && isSpace(s[i])) i += 1;
    let value = '';
    if (s[i] === '=') {
      i += 1;
      while (i < s.length && isSpace(s[i])) i += 1;
      const quote = s[i];
      if (quote === '"' || quote === "'") {
        i += 1;
        const close = s.indexOf(quote, i);
        value = close === -1 ? s.slice(i) : s.slice(i, close);
        i = close === -1 ? s.length : close + 1;
      } else {
        const valueAt = i;
        while (i < s.length && !isSpace(s[i]) && s[i] !== '>') i += 1;
        value = s.slice(valueAt, i);
      }
    }
    if (name === want) return value;
  }
  return null;
}

function hasTrack(inner) {
  // MASKED first, for both questions. The tail test is comment-BLIND and
  // `[\s\S]*` is greedy, so a commented-out track plus any later `</ul>`
  // matched — the section then looked already-tracked to the engine and did not
  // to `:scope > ul.tile-track`, the same split the raw `String.includes` had.
  const masked = maskInert(inner);
  if (TRACK_TAIL.test(masked)) return true;
  // …and a DIRECT-CHILD `<ul class="tile-track">` anywhere in the section, which
  // is where the engine's own output puts it once the berth divs follow.
  return Boolean(findTopLevelTag(masked, 'ul', ({ start, tagEnd }) => {
    const cls = tagAttr(masked.slice(start, tagEnd), 'class') || '';
    return TRACK_CLASS_RE.test(cls) ? { start } : null;
  }));
}

/**
 * `&` FIRST, or every entity this emits gets double-escaped. Both label sources
 * arrive with their entities already encoded — the heading came out of rendered
 * HTML, and `data-track` is an attribute value the renderer escaped — so this
 * only has to be safe against a raw `<` or `&` that survived a tag strip.
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
 * Append a track to one section's inner HTML — ONLY if the append lands where we
 * mean it.
 *
 * A section whose raw HTML leaves an element open — `<h2>Raw heading` with no
 * `</h2>` — swallows whatever follows, so the track would parse INSIDE the
 * heading and render as heading text. The DOM arm cannot hit this (`appendChild`
 * places the node), so it is also the one shape where a string rewriter and a
 * DOM mutator genuinely cannot agree; the string arm declines rather than
 * emitting a visible defect.
 *
 * @returns the new inner HTML, or `null` for "leave this section alone".
 */
function appendTrack(inner, names, currentIdx) {
  const out = inner + trackHtml(names, currentIdx);
  return hasTopLevelTag(out, 'ul') ? out : null;
}

/** The override this slide declares, or `null` — one reader for both arms. */
function overrideOf(spec) {
  if (!spec) return null;
  const { labels, current } = parseTrackSpec(spec);
  // Fewer than two labels is not a scale, exactly as for a derived track. The
  // slide then composes as one canvas rather than drawing a one-column band,
  // and `lint:deck` names it (`topic-track-spec`).
  return labels.length >= MIN_TRACK_LABELS ? { labels, current } : null;
}

/**
 * Pass 1 — walk the deck and collect, per section, the topic headings in order.
 * Returns an array of name-arrays, one per section, in document order.
 */
function collectSections(walk) {
  const sections = [];
  let cur = null;
  walk((cls, resolved, inner) => {
    const t = tokens(cls);
    if (isDivider(t)) { cur = []; sections.push(cur); return; }
    if (!isTopic(t) || !cur) return;
    // A slide that resolves its own track — by `_track`, or because a previous
    // pass already gave it one — must not contribute a name either, or the
    // derived tracks on its SIBLINGS would list a topic whose own slide shows a
    // different set.
    if (resolved) { cur.push(null); return; }
    cur.push(readTopLevelH2Text(inner));
  });
  return sections;
}

/** HTML-string adapter — the owned engine path (engine, CLI, Playground). */
function applyToHtml(html) {
  if (typeof html !== 'string' || !html.includes('topic')) return html;

  const sections = collectSections((visit) => {
    mapSections(html, (openTag, cls, inner) => {
      visit(cls, hasTrack(inner) || Boolean(tagAttr(openTag, TRACK_ATTR)), inner);
      return null;
    });
  });

  // NOT gated on `sections.length`. A deck with no `divider` derives nothing,
  // but its `topic` slides may still declare an OVERRIDE, which has to be drawn
  // — which is exactly the gallery, where every sample names its own track
  // because a gallery slide has no section around it. Returning early there
  // left the gallery's samples with no band at all.
  let si = -1;
  let ti = 0;
  return mapSections(html, (openTag, cls, inner) => {
    const t = tokens(cls);
    if (isDivider(t)) { si += 1; ti = 0; return null; }
    if (!isTopic(t)) return null;
    // `ti` advances for EVERY topic slide the section counted, including the
    // ones that return early. `collectSections` pushes a slot for each of them,
    // so skipping the increment slid the name array out of register and every
    // LATER slide in that section silently lost its whole band — engine only.
    if (hasTrack(inner)) { if (si >= 0) ti += 1; return null; }      // idempotent
    // DECLARING `_track` opts the slide out of derivation whether or not the
    // value is usable. A degenerate one (a single label, or nothing but
    // separators) therefore draws NO track rather than quietly falling back to
    // the derived one — which would show the author a scale they did not write
    // and could not see was not theirs. `lint:deck` names it instead.
    const declared = tagAttr(openTag, TRACK_ATTR);
    if (declared) {
      if (si >= 0) ti += 1;
      const own = overrideOf(declared);
      return own ? appendTrack(inner, own.labels, own.current) : null;
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
    if (shown.length < MIN_TRACK_LABELS) return null;   // a scale of one is not a scale
    const idx = names.slice(0, mine).filter((n) => n).length;
    return appendTrack(inner, shown, idx);
  });
}

const domText = (el) => String(el.textContent || '').replace(/\s+/g, ' ').trim();

/** Live-DOM adapter — the runtime bundle (the only path reaching Marp). */
function applyToDom(root) {
  if (!root) return;
  const doc = root.ownerDocument || root;
  const slides = [...root.querySelectorAll('section[data-lattice-slide]')];
  if (!slides.length) return;

  // Pass 1 — the same partition, read off the live DOM.
  const sections = [];
  let cur = null;
  const own = new Map();   // slide -> { names, idx } | { labels, current }
  for (const s of slides) {
    if (s.classList.contains('divider')) { cur = []; sections.push(cur); continue; }
    if (!s.classList.contains('topic')) continue;
    if (s.querySelector(`:scope > ul.${TRACK_CLASS}`)) {             // idempotent
      if (cur) cur.push(null);
      continue;
    }
    // An override is drawn whether or not a section encloses this slide — the
    // string arm does, and the gallery has no `divider` at all. DECLARING it is
    // what opts the slide out of derivation, so a degenerate value draws nothing
    // rather than falling back to a scale the author did not write.
    const declared = s.getAttribute(TRACK_ATTR);
    if (declared) {
      const spec = overrideOf(declared);
      if (spec) own.set(s, spec);
      if (cur) cur.push(null);
      continue;
    }
    if (!cur) continue;
    const h2 = s.querySelector(':scope > h2');
    cur.push(h2 ? domText(h2) : '');
    own.set(s, { names: cur, idx: cur.length - 1 });
  }

  // Pass 2 — inject.
  for (const [s, spec] of own) {
    let labels;
    let at;
    if (spec.labels) {
      ({ labels, current: at } = spec);
    } else {
      const { names, idx } = spec;
      if (!names[idx]) continue;                             // no heading, no position
      labels = names.filter((n) => n);
      if (labels.length < MIN_TRACK_LABELS) continue;
      at = names.slice(0, idx).filter((n) => n).length;
    }
    const ul = doc.createElement('ul');
    ul.className = TRACK_CLASS;
    ul.setAttribute('aria-hidden', 'true');
    labels.forEach((n, i) => {
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
