/**
 * lib/plugins/code/code.render.js — the code plugin's renderer: every fenced block no other plugin
 * claims (engineering/decisions/2026-10-15-code-plugin.md §4).
 *
 * The host hands `render` a `base(highlight)`: markdown-it's own fence rule, run with the
 * `highlight` callback given (null for plain text). Going through it keeps the markup every
 * downstream reader keys on — `<pre><code class="language-x">`, the token's attributes, the
 * escaping of an unknown language — exactly what it was before highlighting moved into a plugin.
 *
 * A fence a zip plugin owns for this render (the code door, lib/packages/code-door-fence.mjs) stays
 * uncolored: the door finds its block by plain text inside `<pre><code>`, so a grammar that happened
 * to know the name (`tex`, `sql`, `r`) would decide, per body and per surface, whether the plugin
 * drew it. The engine names those fences on the render's `env.plainFences`.
 */

const highlighter = require('./shared/highlighter.js');

/** The class that gives a block the code panel (code.styles.css). */
const PANEL_CLASS = 'lat-code';

/**
 * Add the panel class to the `<pre>` markdown-it's fence rule opened. Its `<pre>` carries no
 * attribute of its own (a fence's attributes go on the `<code>`), so the open tag is exactly `<pre>`;
 * anything else is returned untouched rather than guessed at.
 */
function withPanel(html) {
  return html.startsWith('<pre>') ? `<pre class="${PANEL_CLASS}">${html.slice(5)}` : html;
}

function render(_token, _ctx, env, base, info = {}) {
  const plain = env?.plainFences;
  // A zip plugin's fence: UNCOLORED, so the code door finds plain text in it, but on the panel like
  // any other block. The door accepts any `<pre>` but an off-marked one (fenceBlocks), and a render
  // that attaches a door must match one that does not, byte for byte, until the door draws.
  if (info.name && plain?.has(info.name)) return withPanel(base(null));
  const html = base((code, lang) => (plain?.has(lang) ? '' : highlighter.highlight(code, lang)));
  // A fence a loaded plugin draws later keeps the plugin's own source styling.
  return info.drawn ? html : withPanel(html);
}

const codeRenderer = Object.freeze({ highlighter, render });

module.exports = { codeRenderer, PANEL_CLASS };
