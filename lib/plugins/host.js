/**
 * lib/plugins/host.js — the plugin host the ENGINE calls: it installs every active plugin's
 * grammar (host-grammar.mjs) and attaches each plugin's renderers to the tokens its rules emit.
 *
 * A plugin reaches the engine only through the `ctx` its renderers receive:
 *
 *   ctx.name     the plugin's own name
 *   ctx.options  install-time options for this plugin (math: `output`), frozen. They are fixed
 *                per engine and part of the parser memo key (lib/engine/index.js), so a memoized
 *                markdown-it instance is never reused across different options
 *   ctx.family   the deck's box family (`wide | square | tall | strip`), from the same geometry
 *                the slide pipeline stamps as `data-family`
 *
 * and `env`, markdown-it's per-render object, as a renderer's third argument. A plugin keeps no
 * state in closures: `buildMd` is memoized and test/unit/engine/parser-memo.test.js pins
 * cross-render byte determinism.
 *
 * FAIL-SOFT IS THE HOST'S JOB, AT THE RENDER STEP. Every renderer runs inside `failSoft`: a
 * throw or a non-string result becomes the plugin's declared `degradesTo`, and the rest of the
 * deck renders. The TOKENIZER rules are not wrapped — a rule that throws mid-scan leaves
 * markdown-it's position half-moved, and "degrade" has no meaning there — so the plugin harness
 * feeds every rule its malformed fixtures instead
 * (engineering/decisions/2026-09-27-plugin-system.md §4.6).
 */


const { PLUGINS, COMPONENT_PLUGINS } = require('./registry.generated.js');
const { installGrammar, activePlugins } = require('./host-grammar.mjs');

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** What a renderer that failed shows instead, per the plugin's `degradesTo`. */
function fallback(degradesTo, token, kind) {
  if (degradesTo === 'hidden') return '';
  const text = escapeHtml(token.content || '');
  if (degradesTo === 'code-block') return `<pre><code>${text}</code></pre>\n`;
  return kind === 'block' ? `<p>${text}</p>\n` : text; // 'source'
}

function failSoft(render, ctx, degradesTo, kind) {
  return (tokens, idx, _options, env) => {
    const token = tokens[idx];
    try {
      const out = render(token, ctx, env);
      if (typeof out === 'string') return out;
    } catch (_e) {
      /* fall through to the declared degradation */
    }
    return fallback(degradesTo, token, kind);
  };
}

/**
 * Install every active plugin on the engine's markdown-it instance.
 * @param {import('markdown-it')} md
 * @param {{ disabled?: Iterable<string>, options?: Record<string, object>, family?: string }} [opts]
 * @returns {string[]} the names of the plugins installed, in dependency order
 */
function installPlugins(md, { disabled = [], options = {}, family = 'wide' } = {}) {
  const active = installGrammar(md, { disabled });
  const byName = new Map(PLUGINS.map((p) => [p.name, p]));
  for (const g of active) {
    const plugin = byName.get(g.name);
    const ctx = Object.freeze({ name: g.name, options: Object.freeze({ ...(options[g.name] || {}) }), family });
    for (const [token, rule] of Object.entries(g.syntax)) {
      md.renderer.rules[token] = failSoft(plugin.renderers[token], ctx, g.degradesTo, rule.kind);
    }
  }
  return active.map((g) => g.name);
}

/**
 * The slides whose component REQUIRES a plugin that is not running — switched off
 * (`createEngine({ plugins: { disabled } })`, `math: false`) or disabled because something it
 * requires is. The slide itself still renders: the layout, and the plugin's own text fallback
 * (math shows its TeX). This is what keeps that degradation from being silent.
 *
 * Costs nothing on a normal render: with no plugin disabled every required plugin is active, so
 * it returns before reading the HTML.
 * @param {string} html  the rendered deck
 * @param {ReadonlyArray<string>} disabled
 * @returns {Array<{ id: string, component: string, plugin: string, message: string }>}
 */
function componentPluginDiagnostics(html, disabled) {
  if (!disabled.length) return [];
  const active = new Set(activePlugins(disabled).map((p) => p.name));
  const out = [];
  const seen = new Set();
  // SLIDE sections only — the ones the engine writes, which carry `data-form` ahead of `class`.
  // The engine renders with `html: true`, so an author's own `<section class="math">` inside a
  // slide must not read as a math slide (found by the HARD RULE #25 checker).
  for (const m of html.matchAll(/<section\b[^>]*?\sdata-form="[^"]*"[^>]*?\sclass="([^"]*)"/g)) {
    for (const cls of m[1].split(/\s+/)) {
      for (const plugin of COMPONENT_PLUGINS[cls] || []) {
        const key = `${cls}|${plugin}`;
        if (active.has(plugin) || seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: 'plugin/component-needs-plugin',
          component: cls,
          plugin,
          message: `The "${cls}" slide class needs the "${plugin}" plugin, which is switched off; its slides render without it.`,
        });
      }
    }
  }
  return out;
}

module.exports = { installPlugins, failSoft, componentPluginDiagnostics, PLUGINS, COMPONENT_PLUGINS };
