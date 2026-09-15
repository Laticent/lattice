/**
 * pagination Tile — kernel (single source of truth for all render paths).
 *
 * THE PAGE NUMBER IS ONE MARK NOW. It used to be two, chosen by the frame's
 * `kind` and invisible to the author (#2206): a chrome-hosting frame
 * (`minimal`, `standard`) got a real `<span class="lat-pagination">` inside the
 * footer Cell, and the other NINE — every sovereign frame — got the
 * `section::after` pagination PSEUDO instead. Different box models, different
 * styling surfaces, and nothing on the slide or in the source said which one you
 * had. This Tile closes that: every paginated section that does not already
 * carry the real element gets one, as a DIRECT CHILD of the section, and the
 * pseudo retires wherever the element exists.
 *
 * WHY A DIRECT CHILD RATHER THAN A FOOTER CELL. A sovereign frame owns its own
 * grid — that is what `exemptFromChrome` means — so injecting a `.cell-footer`
 * DIV would hand its grid a new item and move its content. The bare span is
 * absolutely positioned (pagination.css), so it is out of flow: it creates no
 * grid or flex item and nothing on the slide moves. The berth it takes is the
 * one the pseudo had, to the pixel — same `--frame-inset-*` corner, same
 * `--pagination-inset` hook, same appearance tokens.
 *
 * WHAT THE UNIFICATION BUYS, beyond one predictable answer:
 *   · ONE styling surface. The split cover chrome needed three arms for one mark
 *     (`> .lat-pagination`, `> .cell-footer > .lat-pagination`, and `::after`);
 *     a rule reaching the number now reaches it everywhere.
 *   · Rules that keyed on the pseudo alone stop silently dying. The chart family's
 *     hero/bleed recolor (`section.chart-frame…::after`) was already dead code —
 *     a chart frame emits a footer Cell, so its pseudo was retired before that
 *     rule could ever paint. It is an element arm now and works.
 *   · Suppression survives the theme packer. `packTheme` (lib/engine/css.js)
 *     mirrors Marpit's pagination plugin and COMMENTS OUT every `content`
 *     declaration on a slide-own `section…::after` rule — including
 *     `section.silent.silent::after { content: none }`. So the pseudo's own
 *     suppression is inert on the packed path the Playground, the Studio and
 *     lib/runtime all load. `section.silent .lat-pagination { display: none }`
 *     carries a descendant combinator, is not a pagination target, and is
 *     therefore honored on every path.
 *
 * WHAT IT DOES NOT BUY, struck after measurement rather than left because it read well: an
 * earlier draft of this list claimed the number now "lands in the exported text layer and
 * the a11y tree as content, which a pseudo's generated text does not reliably do." On the
 * renderer Lattice actually ships that is false. Measured against the pinned Chromium, a
 * pseudo's `content` string appears in `page.pdf()`'s text layer under `pdftotext` AND as a
 * StaticText node in the CDP accessibility tree — and `pdftotext` on the PRE-change
 * `bloom-engineering-journey.pdf` already contains the sovereign slides' page numbers.
 * Chromium is the only PDF producer here, so the claim bought nothing.
 *
 * FAIL-SAFE BY CONSTRUCTION. The retirement rule keys on the ELEMENT's presence
 * (`section[data-lattice-pagination]:has(> .lat-pagination)::after`, stage.css — which
 * empties the pseudo rather than deleting its box, for a reason stated there), never on a
 * frame kind — so
 * a render path that does not run this Tile keeps the pseudo and still shows a
 * number. That is what keeps the export-to-Marp bundle (lib/core/marp-bundle.js),
 * where Marp draws its own `data-marpit-pagination` pseudo and no Lattice Tile
 * runs, rendering exactly as before.
 *
 * ONE LIMIT ON THAT FAIL-SAFE, recorded rather than fixed. The player / Studio CSS pruner
 * (lib/export/player-prune.js) keeps a rule by matching its selector's BASE — pseudo
 * stripped, `:has()` kept — against the document it is freezing. On a deck with no
 * sovereign frame, arm 1's base matches nothing at prune time and the arm is dropped from
 * the frozen artifact. That is harmless today, because both arms are measured against a
 * DOM the Tile has already run over, so anything that needs retiring is already there to
 * be seen. It stops being harmless if something ever mints a section-level span INTO an
 * already-pruned document. Raised by the maker-checker pass on #2206.
 *
 * SELF-CONTAINED FORM TILE (issue #356): logic, CSS (pagination.css) and manifest
 * in one folder, both adapters from this one file — like the sibling meta,
 * progress and watermark Tiles:
 *
 *   · applyToHtml(html) — the HTML-string render path (the owned engine,
 *                         lib/engine — the CLI, the emulator, the docs playground).
 *   · applyToDom(doc)   — the live-DOM render path (lib/runtime/index.js).
 *
 * ORDER. Both adapters must run LATE, after every transform that folds loose
 * section children into a cell (`applyImageStructure`'s `.image-text`, the Form
 * sweep into `.cell-stage`, `applyBackdropToHtml`) — the same reason the overflow
 * berth runs last (lib/core/fit-berth.js). The span has to be a DIRECT child to
 * take the section's padding box as its containing block.
 *
 * NUMBERING. The span is seeded from the section's own `data-lattice-pagination`
 * — the number that page actually holds — exactly as `buildFooterCell` seeds the
 * footer-Cell one. Auto-split's `repaginate` (lib/core/auto-split.js) already
 * rewrites both the attribute and the first `<span class="lat-pagination">` in a
 * run's 2nd..Nth page, so a split sovereign page renumbers with everything else.
 *
 * Both adapters are pure and idempotent (guarded on the class), so a preview
 * re-render that re-fires them is a no-op.
 */

const { splitSections } = require('../../../core/split-sections');

const MARKER = 'lat-pagination';
// The marker as a CLASS TOKEN inside a class attribute — see the note at its use. The
// LEADING `\s` is required, not cosmetic: without it the pattern also matches
// `data-class="…"`, which carries the author's RAW `_class:` payload rather than the
// resolved class list (#1358, lib/core/section-walk.js). `\b` is no guard there — the
// boundary inside `data-class` is itself a word boundary. The ownership gate enforces this
// and caught the first draft of this line.
const HAS_MARKER = new RegExp(`\\sclass="[^"]*\\b${MARKER}\\b[^"]*"`);

/** The page number a section carries, or '' when it is not paginated. */
function pageNumberOf(openTag) {
  const m = openTag.match(/\sdata-lattice-pagination="([^"]*)"/);
  return m ? m[1] : '';
}

/**
 * HTML-string adapter. Give every paginated section that has no real page-number
 * element one, as the section's last direct child. Idempotent.
 */
function applyToHtml(html) {
  if (typeof html !== 'string') return html;
  if (!html.includes('data-lattice-pagination=')) return html;
  const pieces = splitSections(html);
  return pieces.map((p) => {
    if (p.type === 'gap') return p.text;
    const n = pageNumberOf(p.openTag);
    // Not paginated, or a footer Cell (or a split envelope) already minted the real
    // element — either way there is nothing to add. This is the idempotence guard too.
    //
    // A CLASS-TOKEN test, not a substring one. `includes('class="lat-pagination"')` only
    // sees a span whose class attribute is EXACTLY that, so a future producer emitting
    // `class="lat-pagination cover"` would get a second mark minted over it — while the
    // DOM adapter below, which asks `querySelector('.lat-pagination')`, would not. Two
    // adapters of one kernel disagreeing on their own predicate is the drift HARD RULE #1
    // exists to stop, so they are made to agree here rather than left to.
    if (!n || HAS_MARKER.test(p.inner)) return p.openTag + p.inner + '</section>';
    return `${p.openTag}${p.inner}<span class="${MARKER}">${n}</span></section>`;
  }).join('');
}

/**
 * Live-DOM adapter. Same rule against a `document`. Idempotent.
 */
function applyToDom(doc) {
  if (!doc) return;
  for (const s of doc.querySelectorAll('section[data-lattice-pagination]')) {
    const n = s.getAttribute('data-lattice-pagination');
    if (!n) continue;
    if (s.querySelector(`.${MARKER}`)) continue; // idempotent — footer Cell or a prior run
    const span = doc.createElement('span');
    span.className = MARKER;
    span.textContent = n;
    s.appendChild(span);
  }
}

module.exports = { MARKER, pageNumberOf, applyToHtml, applyToDom };
