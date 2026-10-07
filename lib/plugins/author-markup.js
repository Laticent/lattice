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
 * before any engine rule synthesizes markup of its own; an Export-to-Marp bundle, which Marp
 * renders, gets the same refusal in its source — `refuseAuthorMarkupInSource`):
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
 * The drawn fences of the plugins OFF for a render, as `[fence, plugin]`: the fences a plugin
 * declares `as: "code"` — it draws them later from the code block, so the block is what a pass
 * reads, and its class is what an author's raw `<pre><code>` must not spell (`refuseAuthorMarkup`).
 * @param {ReadonlyArray<{ name: string, fences?: Record<string, { as?: string }> }>} grammar  the plugin grammar (grammar.generated.mjs)
 * @param {(name: string) => boolean} isOff
 */
function offDrawnFences(grammar, isOff) {
  return grammar.filter((g) => isOff(g.name))
    .flatMap((g) => Object.entries(g.fences || {}).filter(([, decl]) => decl.as === 'code').map(([fence]) => [fence, g.name]));
}

// The source's lines as markdown-it counts them: it turns `\r\n` and a lone `\r` into `\n` before it
// maps a token to its lines, so a split on `\n` alone drifted one line per lone CR and refused the
// wrong line (tier 1 checker).
const LINE_BREAK = /(?<=\r\n|\r(?!\n)|\n)/;

/**
 * What YAML decodes in a double-quoted scalar, undone: `\x2d`, `-`, `\U0000002d` and an escaped
 * line break. Marpit reads a directive (`header:`/`footer:` in the front matter or a comment) as
 * YAML and renders the decoded value with `html: true`, so `data-lattice\x2dhydrate` spells no marker
 * in the bytes and one on the page. Applied to a whole directive region, single-quoted and plain
 * scalars included, where it turns a backslash sequence into the character it names: a hostile deck
 * is over-refused, never under.
 * @param {string} s
 */
function decodeYamlEscapes(s) {
  return s
    .replace(/\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8}))/g, (all, x, u, U) => {
      const cp = Number.parseInt(x || u || U, 16);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : all;
    })
    .replace(/\\(?:\r\n|\r|\n)[ \t]*/g, '');
}

/**
 * The same refusal over a deck's Markdown SOURCE, for a render the engine does not do: an
 * Export-to-Marp bundle, which Marp renders with `html: true` (lib/core/marp-bundle.js). The producer
 * parses the deck with markdown-it, the parser Marp also uses, and refuses on two kinds of line:
 *
 *   - RAW HTML: the lines of every `html_block`, and of the block holding an `html_inline`, that
 *     spells a marker or an off fence — refused as written. Code fences and indented code keep their
 *     bytes, so a deck that documents the host in a code block still shows it. By lines because a
 *     name never spans one and an inline token knows its lines, not its offsets; the cost is that a
 *     code span on the SAME line as a forged tag is renamed too.
 *   - DIRECTIVES: the front matter and every HTML comment, which Marpit reads as YAML and renders
 *     (`header:`, `footer:`) — refused whole, after `decodeYamlEscapes`, because YAML decodes what
 *     markdown-it does not and an indented block scalar is not code to Marpit.
 *
 * A deck with nothing to refuse, in its bytes or decoded, comes back byte-identical.
 * @param {string} source  the deck's Markdown
 * @param {{ parse: (src: string, env: object) => Array<{ type: string, map?: [number, number] | null, content: string, children?: Array<{ type: string, content: string }> | null }> }} md  a markdown-it with `html: true`
 * @param {ReadonlyArray<[string, string]>} [offDrawn]
 * @returns {string}
 */
function refuseAuthorMarkupInSource(source, md, offDrawn = []) {
  const src = String(source ?? '');
  const refused = (s) => refuseAuthorMarkup(s, offDrawn) !== s;
  if (!refused(src) && !refused(decodeYamlEscapes(src))) return src;
  const lines = src.split(LINE_BREAK);
  const raw = new Set();
  const directive = new Set();
  // The front matter: a `---` first line through the next `---` or `...` line.
  if (/^---[ \t]*(?:\r\n?|\n|$)/.test(lines[0] ?? '')) {
    const end = lines.findIndex((l, i) => i > 0 && /^(?:---|\.\.\.)[ \t]*(?:\r\n?|\n)?$/.test(l));
    for (let i = 0; i <= (end < 0 ? lines.length - 1 : end); i++) directive.add(i);
  }
  let blockMap = null;
  for (const t of md.parse(src, {})) {
    if (t.map) blockMap = t.map;
    const map = t.map || blockMap;
    if (!map) continue;
    const html = t.type === 'html_block' ? [t.content]
      : t.type === 'inline' ? (t.children || []).filter((c) => c.type === 'html_inline').map((c) => c.content) : [];
    const into = html.some((h) => h.includes('<!--')) ? directive : html.some(refused) ? raw : null;
    if (into) for (let i = map[0]; i < map[1]; i++) into.add(i);
  }
  // Each run of directive lines is one region: an escaped line break joins two of them.
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!directive.has(i)) {
      out.push(raw.has(i) ? refuseAuthorMarkup(lines[i], offDrawn) : lines[i]);
      continue;
    }
    let j = i;
    while (j + 1 < lines.length && directive.has(j + 1)) j++;
    const region = lines.slice(i, j + 1).join('');
    const decoded = decodeYamlEscapes(region);
    out.push(refused(decoded) ? refuseAuthorMarkup(decoded, offDrawn) : refused(region) ? refuseAuthorMarkup(region, offDrawn) : region);
    i = j;
  }
  return out.join('');
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

module.exports = { refuseAuthorMarkup, refuseAuthorMarkupInSource, offDrawnFences, installAuthorMarkupRule, HOST_MARKERS, BAKE_WRITTEN };
