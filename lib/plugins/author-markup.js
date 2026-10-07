/**
 * lib/plugins/author-markup.js — what the plugin host refuses in an AUTHOR's raw HTML.
 *
 * The host speaks to the browser half through markup it writes itself: `data-lattice-hydrate`,
 * `data-lattice-config` and `data-lattice-settle` on a placeholder a plugin draws,
 * `data-lattice-final` when a capture gave up, and `data-lattice-off` on a fence whose plugin the
 * deck did not load (spec/LPM.md §3.2.1, §6). A deck may carry raw HTML, so without this an author
 * could write the same markers by hand: forge a pending figure that a plugin's hydrate draws from a
 * config the author packed, or mark a fence off. (`data-lattice-figure` is the exception: see
 * `BAKE_WRITTEN`.) And a raw-HTML `<pre><code class="language-<fence>">` — no fence,
 * so the host's fence table never sees it — is drawn by the runtime's pass even when the deck did
 * not load that plugin.
 *
 * So, in author raw HTML only (`html_block` and `html_inline` tokens straight out of the parse,
 * before any engine rule synthesizes markup of its own):
 *
 *   - every host marker NAME (`HOST_MARKERS`) is renamed `data-author-…`, always. Only these:
 *     other `data-lattice-*` attributes are author vocabulary (`data-lattice-motion` names a motion
 *     asset's drawing, examples/motion-asset.md), so the whole prefix is NOT refused;
 *   - when a plugin that draws a fence from its code block is OFF for this render, every
 *     `language-<fence>` is renamed `language-off-<fence>`, so no pass, probe or capture — each of
 *     which finds such a block by the substring `language-<fence>` (the pass's
 *     `code[class*="language-<fence>"]`) — reads it as one. It stays a code block.
 *
 * WHY BY NAME, NOT BY TAG. The first cut walked start tags and removed attributes, which meant
 * re-implementing the HTML tokenizer with regexes: a quote or a `<!--` inside an attribute value,
 * a `<script>` end tag with an attribute, or a comment closed by `--!>` put the walker and the
 * browser out of step, and the browser saw a marker the walker had skipped; and a deck of unclosed
 * `<script ` took 48 s to render at 160 KB (the HARD RULE #25 checker measured both). An attribute
 * selector matches an attribute NAME exactly, so a name that is not the marker's cannot be read as
 * one, wherever it sits — inside a tag, a value, a comment or text. The cost: author raw HTML that
 * SPELLS a marker name as text (a `<pre>` documenting the host) shows the renamed word. No tracked
 * deck does (engine byte identity, plugin-system note §11). One pass, linear.
 */

/**
 * The plugin host's figure channel: the placeholder contract (`ctx.hydrateAttrs`, ./host.js), the
 * settle states and the give-up stamp (./host-browser.mjs), and the
 * admission marker (spec/LPM.md §3.2.1, §3.4). test/unit/plugins/author-markup.test.js fails if the
 * host writes one this list lacks.
 */
const HOST_MARKERS = Object.freeze(['data-lattice-hydrate', 'data-lattice-config', 'data-lattice-settle', 'data-lattice-final', 'data-lattice-off']);

/**
 * The host marker a BAKE writes into the deck's Markdown, which the engine then reads as raw HTML
 * like any author's: a bake (`<name>.bake.js`, the CLI half) draws each figure into the source and
 * stamps it `data-lattice-figure` (Mermaid's bake), and the engine cannot tell that markup from an
 * author's. Refusing it erased the marker from every baked diagram on the CLI (7 integration arms
 * caught it). It is NOT refused, deliberately: forging it makes an author's own markup count as a
 * drawn figure in that author's own export, while the forgery that matters — a pending figure a
 * plugin hydrates from a config the author packed — needs `hydrate`, `config` and `settle`, which are.
 */
const BAKE_WRITTEN = Object.freeze(['data-lattice-figure']);

// A marker's name, not a longer name it begins (`data-lattice-offset` is not `data-lattice-off`).
// Case-insensitive, because the HTML parser lowercases attribute names.
const MARKER_NAME = new RegExp(`data-(lattice-(?:${HOST_MARKERS.map((m) => m.slice('data-lattice-'.length)).join('|')}))(?![a-z0-9_-])`, 'gi');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} html  one raw-HTML token's content, as the author wrote it
 * @param {ReadonlyArray<[string, string]>} offDrawn  [fence, plugin] for each drawn fence of a plugin OFF for this render
 * @returns {string} the same markup with no host marker name, and off plugins' fence classes defanged
 */
function refuseAuthorMarkup(html, offDrawn = []) {
  let out = String(html ?? '').replace(MARKER_NAME, 'data-author-$1');
  if (offDrawn.length) {
    const fences = new RegExp(`language-(${offDrawn.map(([fence]) => escapeRe(fence)).join('|')})`, 'gi');
    out = out.replace(fences, 'language-off-$1');
  }
  return out;
}

/**
 * Install the refusal on an engine's markdown-it: one core rule, straight after the inline parse,
 * over every raw-HTML token the author wrote. `offDrawn` is fixed per markdown-it instance (the
 * engine memoizes one per plugin configuration), so the rule keeps no per-render state.
 * @param {import('markdown-it')} md
 * @param {ReadonlyArray<[string, string]>} offDrawn
 */
function installAuthorMarkupRule(md, offDrawn) {
  md.core.ruler.after('inline', 'lattice_author_markup', (state) => {
    for (const t of state.tokens) {
      if (t.type === 'html_block') t.content = refuseAuthorMarkup(t.content, offDrawn);
      else if (t.type === 'inline' && t.children) {
        for (const c of t.children) if (c.type === 'html_inline') c.content = refuseAuthorMarkup(c.content, offDrawn);
      }
    }
  });
}

module.exports = { refuseAuthorMarkup, installAuthorMarkupRule, HOST_MARKERS, BAKE_WRITTEN };
