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
 *   ctx.escape, ctx.escapeAttr        the host's HTML escaping, for author text
 *   ctx.encodeConfig(text)            a text payload packed for an attribute (base64 UTF-8,
 *                                     lib/core/base64-utf8.js); the browser half decodes it
 *   ctx.hydrateAttrs(text)            the placeholder contract for a plugin with a `hydrate`:
 *                                     `data-lattice-hydrate="<name>"`, the packed body, and
 *                                     `data-lattice-settle="pending"`, which every export
 *                                     capture waits on (lib/plugins/host-browser.mjs)
 *
 * THE FENCE TABLE. The host owns `md.renderer.rules.fence`, once: a fence whose name (the first
 * word of its info string) or alias a plugin declares goes to that plugin's renderer, and every
 * other fence to the code renderer (`contributes.codeRenderer`, `codeFence` below), which colors it
 * through markdown-it's own fence rule. It replaces the old WRAPPER CHAIN, in which
 * each fence plugin wrapped the previous `rules.fence`, so registration order decided who won
 * and nothing checked it. Names cannot collide here — the resolver fails the build on a name two
 * plugins claim, or one a code language owns. A DEPRECATED alias still renders, and the render
 * reports the rename through the plugin's declared diagnostic. A fence declared `as: "code"` is
 * claimed but not routed: it renders as the code block it always was, and the plugin draws it later.
 * With no code renderer active, every unclaimed fence is markdown-it's escaped plain code block.
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
const { installGrammar, activePlugins, admitPlugins } = require('./host-grammar.mjs');
const { splitSections } = require('../core/split-sections');
const { readClassAttr } = require('../core/section-walk');
const { toBase64 } = require('../core/base64-utf8');
const { installAuthorMarkupRule, offDrawnFences } = require('./author-markup.js');
const { ctxFor: baseCtxFor } = require('../core/plugin-ctx.js');
const { topLevelFrontMatterValue } = require('../core/front-matter-key.js');

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

/** What a renderer that failed shows instead, per the plugin's `degradesTo`. */
function fallback(degradesTo, token, kind) {
  if (degradesTo === 'hidden') return '';
  const text = escapeHtml(token.content || '');
  if (degradesTo === 'code-block') return `<pre><code>${text}</code></pre>\n`;
  return kind === 'block' ? `<p>${text}</p>\n` : text; // 'source'
}

/**
 * What a renderer reads of a token: its fields, frozen. Never the token itself, the token array or the
 * renderer, so a plugin cannot reach a later token or markdown-it's rules through them
 * (2026-11-01-plugin-contract-hollywood.md §4).
 */
function tokenView(token) {
  if (!token) return null;
  return Object.freeze({
    type: token.type,
    content: token.content,
    markup: token.markup,
    info: token.info,
    map: token.map ? Object.freeze([...token.map]) : null,
    block: token.block,
    hidden: token.hidden,
  });
}

/** Run `fn` with `live.env` set to the render call's env, restoring the previous one (renders nest). */
function withEnv(live, env, fn) {
  if (!live) return fn();
  const prev = live.env;
  live.env = env;
  try {
    return fn();
  } finally {
    live.env = prev;
  }
}

function failSoft(render, ctx, degradesTo, kind) {
  return (tokens, idx, _options, env) => {
    const token = tokens[idx];
    try {
      const out = withEnv(ctx[LIVE], env, () => render(tokenView(token), ctx));
      if (typeof out === 'string') return out;
    } catch (_e) {
      /* fall through to the declared degradation */
    }
    return fallback(degradesTo, token, kind);
  };
}

/**
 * A declared diagnostic, recorded on the render's `env` (the engine collects `env.pluginDiagnostics`
 * into `render().diagnostics`). An undeclared ID is a plugin bug, and it throws — inside a
 * renderer, which `failSoft` turns into the declared degradation, so it is loud in tests and
 * harmless in a deck.
 */
function reporterFor(name, declared) {
  return (env, id, detail) => {
    if (!Object.hasOwn(declared, id)) throw new Error(`plugin "${name}" reported undeclared diagnostic "${id}"`);
    if (!env || !Array.isArray(env.pluginDiagnostics)) return;
    const key = `${id}|${detail ?? ''}`;
    if (env.pluginDiagnostics.some((d) => d.key === key)) return;
    env.pluginDiagnostics.push({ key, id, plugin: name, message: declared[id], ...(detail === undefined ? {} : { detail: String(detail) }) });
  };
}

/**
 * THE WALLS THE HOST OWNS: a library a plugin vendors whose code runs on author text, run behind a wall the host
 * holds (2026-11-01-plugin-contract-hollywood.md §2, the `sanitize` row; 2026-10-19-first-party-plugins-in-the-sandbox.md).
 * Keyed by library, naming the one plugin whose vendored copy it walls. The require is lazy and literal, so a browser
 * bundle swaps the wall for its stub (tools/build-playground.js).
 */
const WALLS = Object.freeze({
  katex: Object.freeze({ plugin: 'math', load: () => require('./host-katex-wall.js') }),
});

function wallFor(plugin, lib) {
  const w = Object.hasOwn(WALLS, lib) ? WALLS[lib] : null;
  if (!w || w.plugin !== plugin) return null;
  try {
    return w.load();
  } catch (_e) {
    return null; // the library is unavailable on this surface; the plugin degrades
  }
}

/** The slot a render ctx keeps the env of the call in progress in; a symbol, so it is not part of the contract. */
const LIVE = Symbol('live');

/** The deck's top-level front matter value for `key`, read once per render and kept on the render's env. */
function frontMatterOf(env, key) {
  if (!env) return null;
  const cache = (env.__frontMatterValues ??= new Map());
  if (!cache.has(key)) {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(env.markdown || ''));
    cache.set(key, fm ? topLevelFrontMatterValue(fm[1], key) : null);
  }
  return cache.get(key);
}

/**
 * The ctx a RENDERER receives (2026-11-01-plugin-contract-hollywood.md §4): the plugin's base ctx
 * (lib/core/plugin-ctx.js: name, service, data, vocabulary) and the render point's members. A render ctx is
 * built once per memoized parser, so every per-render member is a function that reads the render in
 * progress (`ctx[LIVE].env`), never a captured value.
 *
 *   ctx.report(id, detail)        a declared diagnostic
 *   ctx.deck.frontMatter(key)     the deck's top-level front matter value, or null
 *   ctx.deck.plainFences()        the fence names a zip plugin owns for this render (the code door), or null
 *   ctx.scratch()                 this plugin's per-render object, for a memo that must not outlive the render
 *   ctx.wall(lib)                 the host's walled copy of a library this plugin vendors (`katex` for math), or null
 */
function ctxFor(g, options, family, off) {
  const base = baseCtxFor(g.name, off);
  const live = { env: null };
  const report = reporterFor(g.name, g.diagnostics);
  return Object.freeze({
    name: g.name,
    service: base.service,
    data: base.data,
    dataPending: base.dataPending,
    get vocabulary() {
      return base.vocabulary;
    },
    options: Object.freeze({ ...(options[g.name] || {}) }),
    family,
    escape: escapeHtml,
    escapeAttr,
    encodeConfig: toBase64,
    hydrateAttrs: (text) => `data-lattice-hydrate="${g.name}" data-lattice-config="${toBase64(text)}" data-lattice-settle="pending"`,
    report: (id, detail) => report(live.env, id, detail),
    deck: Object.freeze({
      frontMatter: (key) => frontMatterOf(live.env, key),
      plainFences: () => live.env?.plainFences || null,
    }),
    scratch: () => {
      const env = live.env;
      if (!env) return {};
      const all = (env.__pluginScratch ??= {});
      return (all[g.name] ??= {});
    },
    wall: (lib) => wallFor(g.name, lib),
    [LIVE]: live,
  });
}

/** The first word of a fence's info string — markdown-it's own reading of the language name. */
function fenceName(info) {
  return (info || '').trim().split(/\s+/, 1)[0];
}

/**
 * Take over `md.renderer.rules.fence` with ONE table: every name and alias the active plugins
 * declare → that plugin's renderer (fail-soft, like every renderer); anything else → the code
 * renderer, or markdown-it's plain fence rule with none active. The resolver has already proven the
 * names disjoint.
 */
function installFenceTable(md, active, byName, options, family, off) {
  const table = new Map();
  // A code fence of a plugin the deck did NOT load (`as: "code"`, so it renders the same code
  // block either way): the host stamps `data-lattice-off="<plugin>"` on its `<pre>`, and that
  // marker is the only thing that tells the browser half not to draw it — the runtime's pass,
  // the drawn-fence probes and the preview's ink-withholding rule all skip a marked `<pre>`
  // (spec/LPM.md §3.2.1). Only for a plugin that is OFF, so every render on the default set is
  // byte-identical to one before admission reached the browser.
  //
  // BY PREFIX, not by exact name: a pass recognizes its fence by `code[class*="language-<fence>"]`
  // (so the class it renames a fence to still matches), and that matches every fence whose name
  // STARTS with the fence's — ```mermaid-source, ```mermaidx, ```mermaid{.x}. Marking only the
  // exact name left those drawn for a deck that did not load the plugin (HARD RULE #25 red team).
  const activeNames = new Set(active.map((g) => g.name));
  const offPrefixes = [];
  for (const g of PLUGINS) {
    if (activeNames.has(g.name)) continue;
    for (const [fence, decl] of Object.entries(g.fences)) {
      if (decl.as === 'code') offPrefixes.push([fence, offFence(g.name)]);
    }
  }
  for (const g of active) {
    const plugin = byName.get(g.name);
    const ctx = ctxFor(g, options, family, off);
    const report = reporterFor(g.name, g.diagnostics);
    for (const [fence, decl] of Object.entries(g.fences)) {
      // A fence rendered `as: "code"` (Mermaid) stays with the code renderer: the plugin draws it later, from the highlighted block, by its bake on
      // the CLI or the runtime's pass in a browser. It has no renderer and no aliases (resolver).
      if (decl.as === 'code') continue;
      // A fence's SOURCE is a code block: a multi-line config or TeX body flattened into one
      // paragraph reads as nothing (HARD RULE #25 red team), so `source` degrades as `code-block`.
      const render = failSoft(plugin.fenceRenderers[fence], ctx, g.degradesTo === 'source' ? 'code-block' : g.degradesTo, 'block');
      table.set(fence, render);
      for (const alias of decl.aliases) {
        table.set(alias.name, alias.deprecated
          ? (tokens, idx, options_, env) => {
              report(env, `${g.name}/deprecated-alias`, `${alias.name} is now ${fence}`);
              return render(tokens, idx, options_, env);
            }
          : render);
      }
    }
  }
  const codePlugin = active.find((g) => byName.get(g.name).codeRenderer);
  if (!table.size && !offPrefixes.length && !codePlugin) return;
  const previous = md.renderer.rules.fence;
  // `base` is markdown-it's own fence rule, run with the `highlight` callback given: every fence's
  // markup (`<pre><code class="language-x">`, its attributes, the escaping) comes from it whoever
  // colors the code. With no code renderer active a fence is escaped plain text.
  const base = (tokens, idx, options_, env, self, highlight) => {
    const opts = highlight ? { ...options_, highlight } : options_;
    return previous ? previous(tokens, idx, opts, env, self) : self.renderToken(tokens, idx, opts);
  };
  // The fences an ACTIVE plugin draws later from their source (`as: "code"`, Mermaid's). The code
  // renderer colors them but does not give them its panel: the plugin styles its own source block.
  const drawn = new Set(active.flatMap((g) => Object.entries(g.fences).filter(([, d]) => d.as === 'code').map(([f]) => f)));
  const code = codePlugin ? codeFence(byName.get(codePlugin.name).codeRenderer, ctxFor(codePlugin, options, family, off), base, drawn) : base;
  md.renderer.rules.fence = (tokens, idx, options_, env, self) => {
    const name = fenceName(tokens[idx].info);
    const own = table.get(name);
    if (own) return own(tokens, idx, options_, env, self, code);
    for (const [prefix, off] of offPrefixes) if (name.startsWith(prefix)) return off(tokens, idx, options_, env, self, code);
    return code(tokens, idx, options_, env, self);
  };
}

/**
 * The fence renderer for every fence no plugin claims, from the code-renderer plugin
 * (`contributes.codeRenderer`, lib/plugins/code/). Fail-soft like every renderer: a throw or a
 * non-string becomes the plain code block, so a grammar bug costs a fence its color, never its text.
 * The renderer gets the fence's token view, its ctx, `base(highlight)` (markdown-it's own fence rule) and
 * `info`: the fence's name, whether an active plugin draws it later (`drawn`), and `record`, the view of
 * the token right before it when that is the plugin's own `code_record` (its `@code{…}` line). Never the
 * token array: the host hands over the one neighbor the plugin's grammar put there.
 */
function codeFence(renderer, ctx, base, drawn) {
  return (tokens, idx, options_, env, self) => {
    try {
      const name = fenceName(tokens[idx].info);
      const prev = idx > 0 ? tokens[idx - 1] : null;
      const info = Object.freeze({ name, drawn: drawn.has(name), record: prev?.type === 'code_record' ? tokenView(prev) : null });
      const out = withEnv(ctx[LIVE], env, () => renderer.render(tokenView(tokens[idx]), ctx, (highlight) => base(tokens, idx, options_, env, self, highlight || null), info));
      if (typeof out === 'string') return out;
    } catch (_e) {
      /* fall through to the plain code block */
    }
    return base(tokens, idx, options_, env, self, null);
  };
}

/**
 * The renderer for an OFF plugin's code fence: the code block every other fence becomes, with the
 * host's admission marker on its `<pre>`. A code renderer that does not open with `<pre` (none in
 * tree) is returned unmarked rather than wrapped: the marker belongs on the element a pass reads.
 */
function offFence(name) {
  return (tokens, idx, options_, env, self, code) => code(tokens, idx, options_, env, self).replace(/^<pre\b/, `<pre data-lattice-off="${name}"`);
}

/**
 * Register every plugin's highlight.js grammar (`contributes.highlight`) under each of its code
 * fences, on the code renderer's highlight.js (`codeHighlighter()`). Idempotent: a language
 * highlight.js already knows by that name is left alone.
 *
 * EVERY installed plugin, not only the active ones, and on purpose: a grammar colors SOURCE, and a
 * switched-off plugin's fence is exactly the fence that stays source — its code block is what the
 * author sees instead of the figure (`degradesTo: "code-block"`), so it should read as code.
 * With no code-renderer plugin in the build there is no highlight.js to teach, and nothing happens.
 */
function installHighlight() {
  const hl = codeHighlighter()?.hljs;
  if (!hl || typeof hl.registerLanguage !== 'function') return;
  for (const p of PLUGINS) {
    if (!p.highlight) continue;
    for (const [fence, decl] of Object.entries(p.fences)) {
      if (decl.as !== 'code') continue;
      try {
        if (!hl.getLanguage(fence)) hl.registerLanguage(fence, p.highlight);
      } catch (_e) {
        /* already registered */
      }
    }
  }
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
  // The plugins this parser does not run: a renderer's `ctx.service` answers null for them.
  const activeSet = new Set(active.map((g) => g.name));
  const off = new Set(PLUGINS.map((p) => p.name).filter((n) => !activeSet.has(n)));
  for (const g of active) {
    const plugin = byName.get(g.name);
    const ctx = ctxFor(g, options, family, off);
    for (const [token, rule] of Object.entries(g.syntax)) {
      md.renderer.rules[token] = failSoft(plugin.renderers[token], ctx, g.degradesTo, rule.kind);
    }
  }
  installFenceTable(md, active, byName, options, family, off);
  installHighlight();
  // An author's raw HTML may not speak the host's channel: no host marker (`HOST_MARKERS`) of its
  // own, and the `language-<fence>` class of a plugin this render did not load is defanged, so a
  // raw `<pre><code>` stays code as the fence would (./author-markup.js). The drawn fences are the ones declared
  // `as: "code"` — the plugin draws them later from the code block, so the block is what a pass reads.
  const activeNames = new Set(active.map((g) => g.name));
  installAuthorMarkupRule(md, offDrawnFences(PLUGINS, (name) => !activeNames.has(name)));
  return active.map((g) => g.name);
}

/**
 * The class tokens of every SLIDE — each top-level `<section>` of the rendered deck — read with
 * the repo's one section walker (`splitSections`, a real tag tokenizer) and its one class reader
 * (`readClassAttr`, which takes the RESOLVED `class`, never the raw `data-class` that precedes it,
 * #1358). Top-level only, so an author's own `<section class="math">` inside a slide is not a
 * slide (found by the HARD RULE #25 checker).
 *
 * The first cut was a hand-written regex with two lazy runs around a `data-form` test; CodeQL
 * flagged it as polynomial (js/polynomial-redos) and it was — 8,000 repeated attributes took
 * 299 ms, doubling the input quadrupled it — and deck text can come from a shared link. The
 * shared walker is also what the repo's gates require: a literal `indexOf('<section')` scan cannot
 * tell markup from a `<section` quoted in a comment or in `<style>` text.
 */
function slideClassTokens(html) {
  const out = [];
  for (const piece of splitSections(html)) {
    if (piece.type === 'gap') continue;
    for (const t of readClassAttr(piece.openTag).split(/\s+/)) if (t) out.push(t);
  }
  // A PANE renders as its component (lib/core/panes.js `<lat-pane class="bar form" …>`), so a chart
  // pane needs its plugin as a chart slide does (red team: a switched-off pane chart was silent).
  for (const m of String(html).matchAll(/<lat-pane\sclass="([^"]*)"/g)) {
    for (const t of m[1].split(/\s+/)) if (t) out.push(t);
  }
  return out;
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
  for (const cls of slideClassTokens(html)) {
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
  return out;
}

/**
 * The highlighter of the plugin that renders unclaimed fences (`contributes.codeRenderer`), or null
 * when the build has none. The engine's `languages` capability reads it, so the engine names no
 * plugin and imports no highlight.js. It is the build's answer, not a render's: a deck that switches
 * the plugin off still asks the same highlighter what this build could color.
 */
function codeHighlighter() {
  return PLUGINS.find((p) => p.codeRenderer)?.codeRenderer.highlighter || null;
}

/**
 * The render ctx for one plugin, for host code that calls a plugin's renderer outside a markdown-it render (the
 * Export-to-Marp bundle typesets math with the engine's own renderer, lib/export/marp-bundle-math.js). The same ctx
 * the engine hands it, so the renderer cannot tell the two callers apart.
 * @param {string} name
 * @param {{ options?: object, family?: string }} [opts]
 */
function renderCtx(name, { options = {}, family = 'wide' } = {}) {
  const g = PLUGINS.find((p) => p.name === name);
  if (!g) throw new Error(`no plugin "${name}"`);
  return ctxFor(g, { [name]: options }, family, null);
}

module.exports = { installPlugins, failSoft, fenceName, componentPluginDiagnostics, admitPlugins, codeHighlighter, renderCtx, PLUGINS, COMPONENT_PLUGINS };
