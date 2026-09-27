/**
 * lib/plugins/resolve.js — the plugin resolver: every rule that turns a set of plugin manifests
 * into one ordered, checked registry, and fails BY NAME when it cannot.
 *
 * Pure: no filesystem, no `require` of plugin code. `tools/build-plugin-registry.js` reads the
 * manifests and the export keys of each plugin's role modules and hands both in; the unit tests
 * hand in synthetic plugins to prove each failure arm. So the build and the tests run the same
 * checks, and a check exists once.
 *
 * What it enforces (engineering/decisions/2026-09-27-plugin-system.md §4.2–§4.5):
 *
 *   - the manifest and the modules agree ONE-TO-ONE: every declared syntax token has a rule in
 *     `<name>.syntax.mjs` and a renderer in `<name>.render.js`, and `renderers` holds nothing
 *     the manifest does not declare. (A syntax module exports each rule under its token name, so
 *     the build passes in only the declared ones it found; an undeclared exported function is
 *     never installed, so it cannot lie.) This is what stops a manifest from lying — the failure
 *     mode of every hand-kept roster the plugin system replaces;
 *   - dependencies: a `requires` name that no plugin has is an error; an `optional` one is
 *     simply absent; a cycle through either is an error naming the path;
 *   - syntax: an anchor names a rule the HOST owns (markdown-it's own), never another plugin's;
 *     two plugins claiming one trigger character in one ruler, or one token type, is an error
 *     naming both; an inline trigger markdown-it's `text` rule does not stop at is refused,
 *     because `text` would swallow it mid-word and the rule would never run;
 *   - components that depend on plugins: a component's `plugins.requires` must name a plugin
 *     that exists, and a component whose GALLERY uses a plugin's syntax must declare that plugin.
 *     The dependency points from the component to the plugin — a plugin is a capability that
 *     works on any slide, and never names a component;
 *   - fences: every declared fence has a renderer and no renderer is undeclared; a name or alias
 *     belongs to one plugin and never to a code language (a highlight.js name or alias, or a
 *     host-reserved one); a deprecated alias has a diagnostic to report it with;
 *   - hydrate, styles and tokens agree with the files: a declared `hydrate` has a self-contained
 *     `<name>.hydrate.js` (no require, no import — it runs serialized on the CLI export page); a
 *     declared `styles` has `<name>.styles.css`, whose `var(--…)` reads are exactly `tokens`;
 *   - diagnostics are namespaced to the plugin that declares them.
 *
 * The ORDER is topological over `requires` and `optional`, ties broken by name, so the output is
 * a function of the manifests alone. The order decides three things and nothing else: rule
 * installation, CSS order and hydrate order.
 */


/** The host contract versions this Lattice understands. */
const KNOWN_API = Object.freeze([1]);

/**
 * markdown-it's own rule names — the only anchors a plugin rule may name. Read off a stock
 * `commonmark` instance (markdown-it 14); `test/unit/plugins/resolve.test.js` re-derives both
 * lists from the installed markdown-it, so an upgrade that renames a rule goes red there.
 */
const HOST_ANCHORS = Object.freeze({
  inline: Object.freeze(['text', 'linkify', 'newline', 'escape', 'backticks', 'strikethrough',
    'emphasis', 'link', 'image', 'autolink', 'html_inline', 'entity']),
  block: Object.freeze(['table', 'code', 'fence', 'blockquote', 'hr', 'list', 'reference',
    'html_block', 'heading', 'lheading', 'paragraph']),
});

/**
 * The characters markdown-it's inline `text` rule stops at (`isTerminatorChar` in
 * markdown-it/lib/rules_inline/text.mjs). Any other character is consumed as plain text before
 * a plugin's inline rule is ever asked, so an inline trigger outside this set can never fire.
 * The resolve test re-derives the set from markdown-it itself.
 */
const TEXT_TERMINATORS = Object.freeze(new Set(['\n', '!', '#', '$', '%', '&', '*', '+', '-',
  ':', '<', '=', '>', '@', '[', '\\', ']', '^', '_', '`', '{', '}', '~']));

/**
 * @param {Array<{ manifest: object, folder?: string,
 *                 exports?: { rules?: string[], renderers?: string[], detect?: boolean } }>} plugins
 * @param {{ components?: Array<{ name: string, requires?: string[], optional?: string[], uses?: string[] }> }} [context]
 *   `components` — each component's `plugins` block, and `uses`: the plugins whose tokens its
 *   gallery parses into (the build computes that with each plugin's grammar).
 * @returns {{ errors: string[], order: string[] }}
 *   `order` is every plugin name, dependencies first; it is empty when there are errors.
 */
function resolvePlugins(plugins, context = {}) {
  const errors = [];
  const byName = new Map();

  for (const p of plugins) {
    const m = p.manifest || {};
    const name = m.name;
    if (byName.has(name)) {
      errors.push(`plugin "${name}" is declared twice`);
      continue;
    }
    byName.set(name, p);
    if (p.folder !== undefined && p.folder !== name) {
      errors.push(`plugin "${name}" lives in folder "${p.folder}" — the folder must match the manifest's name`);
    }
    if (!KNOWN_API.includes(m.api)) {
      errors.push(`plugin "${name}" is written for host api ${JSON.stringify(m.api)}; this Lattice knows api ${KNOWN_API.join(', ')}`);
    }
    checkOneToOne(name, m, p.exports || {}, errors);
    for (const id of Object.keys(m.contributes?.diagnostics || {})) {
      if (!id.startsWith(`${name}/`)) errors.push(`plugin "${name}" declares diagnostic "${id}" outside its own namespace "${name}/"`);
    }
  }

  checkDependencies(byName, errors);
  checkSyntaxClaims(byName, errors);
  checkFenceClaims(byName, context.reservedFences || new Set(), errors);
  checkComponentDependencies(byName, context.components || [], errors);

  const order = errors.length ? [] : topoOrder(byName, errors);
  return { errors, order: errors.length ? [] : order };
}

function checkOneToOne(name, m, exp, errors) {
  const declared = Object.keys(m.contributes?.syntax || {});
  const compare = (what, exported) => {
    const have = new Set(exported || []);
    for (const t of declared) if (!have.has(t)) errors.push(`plugin "${name}" declares syntax "${t}" but its ${what} exports none`);
    for (const t of have) if (!declared.includes(t)) errors.push(`plugin "${name}" exports ${what} "${t}" that its manifest does not declare`);
  };
  if (declared.length || exp.rules?.length) compare('syntax rule', exp.rules);
  if (declared.length || exp.renderers?.length) compare('renderer', exp.renderers);
  if (declared.length && !exp.detect) errors.push(`plugin "${name}" contributes syntax but its syntax module exports no detect(source)`);

  // FENCES: every declared fence has a renderer in `<name>.render.js`'s `fences`, and `fences`
  // holds nothing undeclared — an exported fence renderer is installed by name, so an undeclared
  // one would be a fence no manifest admits to.
  const fences = Object.keys(m.contributes?.fences || {});
  const haveFences = new Set(exp.fences || []);
  for (const f of fences) if (!haveFences.has(f)) errors.push(`plugin "${name}" declares fence "${f}" but its render module's \`fences\` has no renderer for it`);
  for (const f of haveFences) if (!fences.includes(f)) errors.push(`plugin "${name}" exports a renderer for fence "${f}" that its manifest does not declare`);

  // HYDRATE: declared ⇔ `<name>.hydrate.js` exports `hydrate`. The module is ALSO run serialized
  // on the CLI export page (lib/plugins/hydrate-script.js), so it may not require or import.
  const wantsHydrate = Boolean(m.contributes?.hydrate);
  if (wantsHydrate && !exp.hasHydrate) errors.push(`plugin "${name}" declares hydrate but has no ${name}.hydrate.js exporting hydrate(el, ctx)`);
  if (!wantsHydrate && exp.hasHydrate) errors.push(`plugin "${name}" ships ${name}.hydrate.js but its manifest declares no hydrate`);
  if (exp.hydrateSource && /\brequire\s*\(|^\s*import\b|\bimport\s*\(/m.test(stripComments(exp.hydrateSource))) {
    errors.push(`plugin "${name}"'s ${name}.hydrate.js requires or imports a module; it runs serialized on the CLI export page, so everything it needs must come through ctx`);
  }
  if (m.payload && !wantsHydrate) errors.push(`plugin "${name}" declares a payload but no hydrate to use it`);
  if (Object.keys(m.payload || {}).length > 1) errors.push(`plugin "${name}" declares more than one payload file; the host loads one per plugin in api 1`);

  // STYLES and TOKENS: `styles: true` ⇔ `<name>.styles.css`, and `tokens` is exactly the set of
  // `var(--…)` reads in it — so the manifest's token list is a checked fact, not a promise.
  const wantsStyles = m.contributes?.styles === true;
  if (wantsStyles && !exp.hasStyles) errors.push(`plugin "${name}" declares styles but has no ${name}.styles.css`);
  if (!wantsStyles && exp.hasStyles) errors.push(`plugin "${name}" ships ${name}.styles.css but its manifest does not declare styles`);
  if (exp.hasStyles) {
    const read = new Set([...stripComments(exp.stylesSource || '').matchAll(/var\(\s*(--[a-z][a-z0-9-]*)/g)].map((x) => x[1]));
    const listed = new Set(m.tokens || []);
    for (const t of read) if (!listed.has(t)) errors.push(`plugin "${name}"'s stylesheet reads ${t}, which its manifest's \`tokens\` does not list`);
    for (const t of listed) if (!read.has(t)) errors.push(`plugin "${name}" lists token ${t}, which its stylesheet never reads`);
  } else if ((m.tokens || []).length) {
    errors.push(`plugin "${name}" lists tokens but ships no stylesheet`);
  }

  for (const [token, rule] of Object.entries(m.contributes?.syntax || {})) {
    const [side, anchor] = Object.entries(rule.anchor || {})[0] || [];
    if (!HOST_ANCHORS[rule.kind]?.includes(anchor)) {
      errors.push(`plugin "${name}" anchors syntax "${token}" ${side} "${anchor}", which is not a host ${rule.kind} rule (${(HOST_ANCHORS[rule.kind] || []).join(', ')})`);
    }
    if (rule.opaque && rule.kind !== 'block') errors.push(`plugin "${name}" marks inline syntax "${token}" opaque; only a block can be`);
    if (rule.kind === 'inline') {
      for (const ch of rule.triggers || []) {
        if (!TEXT_TERMINATORS.has(ch)) {
          errors.push(`plugin "${name}" triggers inline syntax "${token}" on ${JSON.stringify(ch)}, which markdown-it's text rule consumes before any plugin rule runs; pick one of ${[...TEXT_TERMINATORS].join(' ')}`);
        }
      }
    }
  }
}

function checkDependencies(byName, errors) {
  for (const [name, p] of byName) {
    const m = p.manifest;
    for (const dep of [...(m.requires || []), ...(m.optional || [])]) {
      if (dep === name) errors.push(`plugin "${name}" depends on itself`);
    }
    for (const dep of m.requires || []) {
      if (!byName.has(dep)) errors.push(`plugin "${name}" requires "${dep}", which is not installed`);
    }
    for (const dep of m.requires || []) {
      if ((m.optional || []).includes(dep)) errors.push(`plugin "${name}" lists "${dep}" as both required and optional`);
    }
  }
}

function checkSyntaxClaims(byName, errors) {
  const tokenOwner = new Map();
  const triggerOwner = new Map(); // `${kind}:${char}` → plugin
  for (const [name, p] of byName) {
    for (const [token, rule] of Object.entries(p.manifest.contributes?.syntax || {})) {
      const prev = tokenOwner.get(token);
      if (prev && prev !== name) errors.push(`plugins "${prev}" and "${name}" both emit token "${token}"`);
      tokenOwner.set(token, name);
      for (const ch of rule.triggers || []) {
        const key = `${rule.kind}:${ch}`;
        const owner = triggerOwner.get(key);
        if (owner && owner !== name) errors.push(`plugins "${owner}" and "${name}" both claim the ${rule.kind} trigger ${JSON.stringify(ch)}`);
        triggerOwner.set(key, name);
      }
    }
  }
}

/**
 * One fence table: a name or alias belongs to one plugin, and never to a code language — a
 * plugin that claimed `json` would take over every JSON code block in every deck.
 */
function checkFenceClaims(byName, reserved, errors) {
  const owner = new Map();
  for (const [name, p] of byName) {
    for (const [fence, decl] of Object.entries(p.manifest.contributes?.fences || {})) {
      for (const claim of [fence, ...(decl.aliases || []).map((a) => a.name)]) {
        if (reserved.has(claim)) errors.push(`plugin "${name}" claims fence "${claim}", which a code language already owns; pick another name`);
        const prev = owner.get(claim);
        if (prev) errors.push(`plugins "${prev}" and "${name}" both claim fence "${claim}"`);
        owner.set(claim, name);
      }
    }
    for (const a of Object.values(p.manifest.contributes?.fences || {}).flatMap((d) => d.aliases || [])) {
      if (a.deprecated && !Object.hasOwn(p.manifest.contributes?.diagnostics || {}, `${name}/deprecated-alias`)) {
        errors.push(`plugin "${name}" has a deprecated fence alias "${a.name}" but declares no "${name}/deprecated-alias" diagnostic to report it with`);
      }
    }
  }
}

/** Block and line comments out, so a word in prose cannot satisfy or trip a source check. */
function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function checkComponentDependencies(byName, components, errors) {
  for (const c of components) {
    for (const dep of c.requires || []) {
      if (!byName.has(dep)) errors.push(`component "${c.name}" requires plugin "${dep}", which is not installed`);
    }
    const declared = new Set([...(c.requires || []), ...(c.optional || [])]);
    for (const used of c.uses || []) {
      if (!declared.has(used)) {
        errors.push(`component "${c.name}"'s gallery uses the "${used}" plugin, but its manifest does not declare it — add "plugins": { "requires": ["${used}"] } (or "optional")`);
      }
    }
  }
}

/** Kahn's algorithm over requires + optional (present ones), ready set kept sorted by name. */
function topoOrder(byName, errors) {
  const deps = new Map();
  for (const [name, p] of byName) {
    deps.set(name, new Set([...(p.manifest.requires || []), ...(p.manifest.optional || [])].filter((d) => byName.has(d))));
  }
  const order = [];
  const done = new Set();
  while (order.length < byName.size) {
    const ready = [...deps.keys()].filter((n) => !done.has(n) && [...deps.get(n)].every((d) => done.has(d))).sort();
    if (!ready.length) {
      const stuck = [...deps.keys()].filter((n) => !done.has(n)).sort();
      errors.push(`plugin dependency cycle among: ${describeCycle(stuck, deps)}`);
      return [];
    }
    order.push(ready[0]);
    done.add(ready[0]);
  }
  return order;
}

function describeCycle(stuck, deps) {
  // Walk from the first stuck plugin until a name repeats; that loop is the cycle.
  const seen = [];
  let at = stuck[0];
  while (!seen.includes(at)) {
    seen.push(at);
    at = [...deps.get(at)].filter((d) => stuck.includes(d)).sort()[0];
  }
  return [...seen.slice(seen.indexOf(at)), at].join(' → ');
}

module.exports = { resolvePlugins, KNOWN_API, HOST_ANCHORS, TEXT_TERMINATORS };
