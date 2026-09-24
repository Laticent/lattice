/**
 * Label-set key — draws the key for a component that declares one but has no
 * section transform of its own.
 *
 * WHY THIS EXISTS AT ALL. A component with a figure builder draws its own key:
 * it already knows which members its cells carry and where the key belongs
 * relative to the figure, so `roadmap` builds one inside its transform and
 * `matrix-grid` and `journey` inside theirs. `obligation-matrix` has neither a
 * transform nor a figure builder — it is a stylesheet plus a markdown-it cell
 * rule — so there was nowhere for a key to be built, which is why its "key" was
 * a prose paragraph the author retyped on every slide and nothing parsed. This
 * post-pass is that missing place.
 *
 * WHO IT SERVES IS DECLARED, NOT LISTED HERE. A manifest says
 * `labelSet.keyedBy: "transformer"`, and this module reads the generated
 * catalog. A hand-maintained list of component names inside this file is the
 * exact shape the label-set construct replaced, and it would drift the same way:
 * a component could grow its own key and leave its name behind here, and the
 * slide would carry two.
 *
 * HOW IT KNOWS WHICH MEMBERS ARE PRESENT. By the time a transformer runs, the
 * markdown-it cell rule has already rewritten every marker cell to
 * `<span class="state {sem} {shape}">`, so the SHAPE class is the marker's
 * fingerprint — `state-full` is `[x]`, `state-half` is `[-]`, and so on. That
 * mapping lives in `lib/core/state-marks.js` and is imported rather than
 * restated, because a second copy of it is a second thing to keep true.
 *
 * Two render forms, one kernel (HARD RULE #1):
 *   - applyToHtml (the engine render path + lattice-emulator.js)
 *   - applyToDom  (lattice-runtime.js — live DOM, marp-vscode preview)
 * Keep the string and DOM forms in sync.
 *
 * IDEMPOTENT, and it has to be: the engine and runtime paths can both fire on
 * one document during a preview refresh. Both forms return early when the
 * section already carries a key — and the guard matters more than usual here,
 * because a second pass would also read the FIRST key's own swatches as
 * "markers present" and could not tell them from cells.
 */

const {
  labelSetFor, derivedFrom, resolveLabelSet, parseInlineSet,
} = require('../core/label-set');
const { liftLabelSet } = require('../core/lift-label-set');
const { buildHtmlLegend } = require('../core/html-legend');
const { stateClassesFor, MARKERS } = require('../core/state-marks');
const { mapSectionHtml } = require('../core/section-walk');

const KEY_CLASS = 'label-set-key';

/** Marker → the `{sem, shape}` the cell rule stamps, from the one kernel that
 *  decides it. Each marker has one meaning in every layout, so the key needs no
 *  per-component reading. */
const MARKER_STATE = Object.freeze(Object.fromEntries(
  MARKERS.map((m) => [`[${m}]`, stateClassesFor(m)]),
));

/** The component names this transformer draws for, from the generated catalog. */
function servedComponents() {
  const out = [];
  for (const name of Object.keys(require('../core/label-set-catalog.generated.js'))) {
    if (labelSetFor(name)?.keyedBy === 'transformer') out.push(name);
  }
  return out;
}

const SERVED = servedComponents();


function componentOf(sectionHtml) {
  const m = /<section\b[^>]*\sclass="([^"]*)"/.exec(sectionHtml);
  if (!m) return null;
  const tokens = m[1].split(/\s+/);
  return SERVED.find((name) => tokens.includes(name)) || null;
}

/** Which markers this section's cells actually carry, in no particular order. */
function presentMarkers(sectionHtml) {
  return Object.keys(MARKER_STATE).filter((key) => {
    const { shape } = MARKER_STATE[key];
    // The shape class, as the cell rule writes it: `class="state {sem} {shape}"`.
    return new RegExp(`class="state\\b[^"]*\\b${shape}\\b`).test(sectionHtml);
  });
}

/** Build the key's HTML for one section, or '' when it should have none. */
function keyFor(component, sectionHtml, authored) {
  const set = labelSetFor(component);
  if (!set) return '';
  const derived = derivedFrom(component, presentMarkers(sectionHtml));
  const rows = resolveLabelSet(derived, authored).map((m) => ({
    // The swatch takes the cell's OWN classes, so the component's one disc
    // recipe paints the key and the cells alike and the two cannot drift.
    markState: `state ${MARKER_STATE[m.key].sem} ${MARKER_STATE[m.key].shape}`,
    label: m.label,
    detail: m.detail,
  }));
  return buildHtmlLegend({
    listClass: `${KEY_CLASS} ${component}-legend`,
    itemClass: 'label-set-key-item',
    markClass: 'label-set-key-mark',
    labelClass: 'label-set-key-label',
    rows,
    ariaLabel: set.aria,
  });
}

function applyToHtml(html) {
  if (!SERVED.length || typeof html !== 'string') return html;
  // `mapSectionHtml`, not a lazy `<section…</section>` regex: a `</section>`
  // quoted in a comment ended the slide there, and the key landed in the gap.
  return mapSectionHtml(html, (section) => {
    const component = componentOf(section);
    if (!component) return section;
    if (section.includes(KEY_CLASS)) return section;   // idempotence
    const lifted = liftLabelSet(section);
    const key = keyFor(component, lifted.html, lifted.set);
    if (!key) return lifted.html;
    // Directly after the grid, so the key sits under what it decodes and the
    // author's own trailing paragraph still reads as the closing caption.
    const close = lifted.html.lastIndexOf('</table>');
    if (close === -1) return lifted.html;
    const at = close + '</table>'.length;
    return lifted.html.slice(0, at) + key + lifted.html.slice(at);
  });
}

function applyToDom(root) {
  if (!SERVED.length || !root || typeof root.querySelectorAll !== 'function') return;
  for (const component of SERVED) {
    for (const section of root.querySelectorAll(`section.${component}`)) {
      if (section.querySelector(`.${KEY_CLASS}`)) continue;   // idempotence
      // LIFT BEFORE THE TABLE CHECK, matching the HTML arm's order exactly. The
      // two used to disagree here: a section whose set paragraph was authored
      // before the grid had the paragraph eaten by the exporter and PRINTED RAW
      // by the preview, because this arm returned early on the missing table and
      // never lifted. Same input, two slides.
      let authored = null;
      for (const p of section.querySelectorAll('p')) {
        const code = p.querySelector(':scope > code');
        if (!code || p.textContent.trim() !== code.textContent.trim()) continue;
        // `parseInlineSet` on the DOM's OWN text, never a synthetic
        // `<p><code>…</code></p>` round trip through `liftLabelSet`. That round
        // trip ran `plainText` over text that had ALREADY been decoded by the
        // parser, so it decoded a second time and stripped tags that are literal
        // in a code span: an author writing `A &amp; B` got "A &amp; B" from the
        // exporter and "A & B" from the preview, and `<b>bold</b>` lost its tags
        // on one path only. `plainText` is an extractor for markdown-it OUTPUT;
        // DOM text is already past that stage.
        const parsed = parseInlineSet(code.textContent);
        if (parsed) { authored = parsed; p.remove(); break; }
      }
      const table = [...section.querySelectorAll('table')].pop();
      if (!table) continue;
      const key = keyFor(component, section.innerHTML, authored);
      if (!key) continue;
      // `section.ownerDocument`, NOT `root.ownerDocument`: the runtime passes the
      // DOCUMENT itself as root, and `document.ownerDocument` is null — which threw
      // on the real preview surface while every jsdom arm passed, because they hand
      // in `body`. A section is always an element, so its ownerDocument always
      // resolves. (The house idiom `root.ownerDocument || root` works too; this is
      // the shorter version of the same fix.)
      const holder = section.ownerDocument.createElement('div');
      holder.innerHTML = key;
      const list = holder.firstElementChild;
      if (list) table.after(list);
    }
  }
}

module.exports = {
  name: 'label-set-key',
  selector: SERVED.map((n) => `section.${n}`).join(', '),
  applyToHtml,
  applyToDom,
  // exported for tests
  KEY_CLASS,
  MARKER_STATE,
};
