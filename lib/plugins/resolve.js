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
 *     belongs to one plugin and never to a code language (a highlight.js name or alias) — unless the plugin already SHIPPED that claim before the language
 *     took the name, when the plugin keeps it and the resolver warns instead (a highlight.js
 *     upgrade must not break decks authors already wrote); a deprecated alias has a diagnostic
 *     to report it with;
 *   - hydrate, styles and tokens agree with the files: a declared `hydrate` has a self-contained
 *     `<name>.hydrate.js` (no require, no import — it runs serialized on the CLI export page); a
 *     declared `styles` has `<name>.styles.css`, whose `var(--…)` reads are exactly `tokens`;
 *   - a fence rendered `as: "code"` has no renderer and no aliases; a declared `bake` has a
 *     `<name>.bake.js` and says where it runs (`render.exec.bake`); a plugin whose hydrate is a
 *     document PASS (`render.exec.hydrate: "pass"`) exports `createPass` instead of `hydrate`,
 *     may require (the runtime bundles it and nothing serializes it), and must bake, because the
 *     CLI export page carries no runtime;
 *   - diagnostics are namespaced to the plugin that declares them;
 *   - extension points (phase F): a slot's block (its `block`, default the slot name) is read
 *     by one plugin and is an object block the component manifest schema defines, and the slot
 *     claims a bucket no other slot claims, and the plugin ships the `<name>.dispatch.js` that
 *     calls the fillers (and no plugin without a slot ships one); a component
 *     that declares the block outside the slot's bucket is an error naming both. Every component
 *     in the bucket that declares the block FILLS the slot, and filling it is requiring the
 *     plugin: `fills` comes back as component → [plugin], which the build merges into the
 *     component requirements the host reads.
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
 * @param {{ components?: Array<{ name: string, requires?: string[], optional?: string[], uses?: string[] }>,
 *           reservedFences?: Set<string>, shippedFences?: Map<string, string>, hostClasses?: Set<string> }} [context]
 *   `components` — each component's `plugins` block, and `uses`: the plugins whose tokens its
 *   gallery parses into (the build computes that with each plugin's grammar).
 *   `reservedFences` — the names a code language owns. `shippedFences` — fence name or alias →
 *   the plugin that claimed it in the registry already committed; such a claim is grandfathered
 *   against a reserved name (a warning, not an error). `hostClasses` — every slide class a
 *   first-party modifier group owns, so a plugin register cannot stamp one.
 *   Each component may also carry `bucket` and `blocks` (the top-level keys of its manifest), which
 *   the extension-point arm reads. `componentBlocks` — the OBJECT-typed block names the component
 *   manifest schema defines; a slot's block must be one of them, or no component could fill it
 *   (and a scalar such as `name` would make every component in the bucket a filler).
 * @returns {{ errors: string[], warnings: string[], order: string[], fills: Record<string, string[]> }}
 *   `order` is every plugin name, dependencies first; it is empty when there are errors. `fills`
 *   is every component that fills a slot, with the plugin(s) that offer it.
 */
function resolvePlugins(plugins, context = {}) {
  const errors = [];
  const warnings = [];
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
  checkFenceClaims(byName, context.reservedFences || new Set(), context.shippedFences || new Map(), errors, warnings);
  checkPayloadFiles(byName, errors);
  checkInlineClaims(byName, errors);
  checkRegisterClaims(byName, errors, context.hostClasses);
  checkComponentDependencies(byName, context.components || [], errors);
  const fills = checkExtensionPoints(byName, context.components || [], context.componentBlocks, errors);

  const order = errors.length ? [] : topoOrder(byName, errors);
  return { errors, warnings, order: errors.length ? [] : order, fills: errors.length ? {} : fills };
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
  // A fence rendered `as: "code"` is the one exception: the engine's code renderer draws it (the
  // plugin draws it later, by `bake` or the runtime), so it has no renderer, and an alias would
  // be a second language class the plugin's other halves never look for.
  const codeFences = Object.entries(m.contributes?.fences || {}).filter(([, d]) => d.as === 'code').map(([f]) => f);
  for (const f of codeFences) {
    if ((m.contributes.fences[f].aliases || []).length) errors.push(`plugin "${name}" gives code fence "${f}" aliases; a fence rendered as code takes none`);
  }
  const fences = Object.keys(m.contributes?.fences || {}).filter((f) => !codeFences.includes(f));
  const haveFences = new Set(exp.fences || []);
  for (const f of codeFences) if (haveFences.has(f)) errors.push(`plugin "${name}" exports a renderer for fence "${f}", which its manifest renders as code`);
  for (const f of codeFences) haveFences.delete(f);
  for (const f of fences) if (!haveFences.has(f)) errors.push(`plugin "${name}" declares fence "${f}" but its render module's \`fences\` has no renderer for it`);
  for (const f of haveFences) if (!fences.includes(f)) errors.push(`plugin "${name}" exports a renderer for fence "${f}" that its manifest does not declare`);

  // HYDRATE: declared ⇔ `<name>.hydrate.js` exports `hydrate`. The module is ALSO run serialized
  // on the CLI export page (lib/plugins/hydrate-script.js), so it may not require or import.
  const wantsHydrate = Boolean(m.contributes?.hydrate);
  // `render.exec.hydrate: "pass"`: the browser half is a document PASS — `createPass(ctx)`, which
  // the runtime bundles and drives (lib/plugins/mermaid/mermaid.hydrate.js). It is never
  // serialized, so it may require the kernels it shares with its bake; and the CLI export page,
  // which carries no runtime, needs that `bake` to draw it at all.
  const isPass = m.render?.exec?.hydrate === 'pass';
  if (isPass && !wantsHydrate) errors.push(`plugin "${name}" says its hydrate is a pass (render.exec.hydrate "pass") but declares no hydrate`);
  if (isPass && m.contributes?.bake !== true) errors.push(`plugin "${name}" is drawn by a runtime pass but declares no bake; the CLI export page carries no runtime, so nothing would draw it there`);
  if (isPass && wantsHydrate && !exp.hasPass) errors.push(`plugin "${name}" declares a hydrate pass but has no ${name}.hydrate.js exporting createPass(ctx)`);
  if (isPass && exp.hasHydrate) errors.push(`plugin "${name}"'s ${name}.hydrate.js exports hydrate(el, ctx), but its manifest says its hydrate is a pass; export createPass(ctx) or drop "pass"`);
  if (!isPass && exp.hasPass) errors.push(`plugin "${name}"'s ${name}.hydrate.js exports createPass(ctx), but its manifest does not say its hydrate is a pass (render.exec.hydrate "pass")`);
  if (!isPass && wantsHydrate && !exp.hasHydrate) errors.push(`plugin "${name}" declares hydrate but has no ${name}.hydrate.js exporting hydrate(el, ctx)`);
  if (!wantsHydrate && (exp.hasHydrate || exp.hasPass)) errors.push(`plugin "${name}" ships ${name}.hydrate.js but its manifest declares no hydrate`);
  if (!isPass && exp.hydrateSource && /\brequire\s*\(|^\s*import\b|\bimport\s*\(/m.test(stripComments(exp.hydrateSource))) {
    errors.push(`plugin "${name}"'s ${name}.hydrate.js requires or imports a module; it runs serialized on the CLI export page, so everything it needs must come through ctx`);
  }
  if (exp.hydrateModuleScope) {
    errors.push(`plugin "${name}"'s ${name}.hydrate.js has code outside hydrate() (${JSON.stringify(exp.hydrateModuleScope.slice(0, 60))}); the CLI export page receives only the function's own text, so move it inside`);
  }
  if (m.payload && !wantsHydrate) errors.push(`plugin "${name}" declares a payload but no hydrate to use it`);
  if (Object.keys(m.payload || {}).length > 1) errors.push(`plugin "${name}" declares more than one payload file; the host loads one per plugin in api 1`);

  // HIGHLIGHT: declared ⇔ `<name>.highlight.js` exports `highlight(hljs)`, and the plugin has a code
  // fence to register it under — the grammar colors the source of a fence the engine renders as
  // code, so a plugin with none would install a language nothing ever names.
  const wantsHighlight = m.contributes?.highlight === true;
  if (wantsHighlight && !exp.hasHighlight) errors.push(`plugin "${name}" declares highlight but has no ${name}.highlight.js exporting highlight(hljs)`);
  if (!wantsHighlight && exp.hasHighlight) errors.push(`plugin "${name}" ships ${name}.highlight.js but its manifest declares no highlight`);
  if (wantsHighlight && !codeFences.length) errors.push(`plugin "${name}" declares highlight but no fence rendered as code (\`as: "code"\`) to register it under`);

  // BAKE: declared ⇔ `<name>.bake.js` exports `bake`, and says where it runs. Node-side only:
  // lib/plugins/host-bake.js loads it on the CLI, and no browser bundle ever does.
  const wantsBake = m.contributes?.bake === true;
  if (wantsBake && !exp.hasBake) errors.push(`plugin "${name}" declares bake but has no ${name}.bake.js exporting bake(source, ctx)`);
  if (!wantsBake && exp.hasBake) errors.push(`plugin "${name}" ships ${name}.bake.js but its manifest declares no bake`);
  if (wantsBake && !m.render?.exec?.bake) errors.push(`plugin "${name}" declares bake but not where it runs (render.exec.bake)`);
  if (!wantsBake && m.render?.exec?.bake) errors.push(`plugin "${name}" says where its bake runs but declares no bake`);

  // DISPATCH: a plugin that offers an extension point keeps the module that calls its fillers in
  // its own folder — `<name>.dispatch.js` (the chart family's section dispatch and chart frame) —
  // and only such a plugin ships one. A BUILD check, not a host contract: the host loads no module
  // by this role, and a first-party section transform (lib/transformers/) requires it, as §4.3 of
  // the plugin-system note keeps section transforms. What it rules out is the dispatch living in a
  // component folder, the arrangement phase F retired. In-tree only (kinds.js `code`).
  const offersSlot = Object.keys(m.contributes?.extensionPoints || {}).length > 0;
  if (offersSlot && !exp.hasDispatch) errors.push(`plugin "${name}" offers an extension point but has no ${name}.dispatch.js holding the code that calls its fillers`);
  if (!offersSlot && exp.hasDispatch) errors.push(`plugin "${name}" ships ${name}.dispatch.js but offers no extension point`);

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

  // INLINE, SERVICES, DATA: each declared ⇔ its role module exports it, key for key. An inline
  // kind is a usage the payload waits on, so a plugin with one needs `detect(source)` too.
  const kinds = Object.keys(m.contributes?.inline || {});
  const haveKinds = new Set(exp.inline || []);
  for (const k of kinds) if (!haveKinds.has(k)) errors.push(`plugin "${name}" declares inline kind "${k}" but its ${name}.inline.js exports none`);
  for (const k of haveKinds) if (!kinds.includes(k)) errors.push(`plugin "${name}" exports inline kind "${k}" that its manifest does not declare`);
  for (const k of kinds) {
    for (const fn of ['resolve', 'html', 'element', 'diagnose']) {
      if (haveKinds.has(k) && !(exp.inlineFns?.[k] || []).includes(fn)) errors.push(`plugin "${name}"'s inline kind "${k}" exports no ${fn}()`);
    }
  }
  if (kinds.length && !exp.detect) errors.push(`plugin "${name}" contributes an inline kind but its syntax module exports no detect(source)`);
  const services = m.contributes?.services || [];
  const haveServices = new Set(exp.services || []);
  for (const sv of services) if (!haveServices.has(sv)) errors.push(`plugin "${name}" declares service "${sv}" but its ${name}.services.js exports none`);
  for (const sv of haveServices) if (!services.includes(sv)) errors.push(`plugin "${name}" exports service "${sv}" that its manifest does not declare`);
  const wantsData = m.contributes?.data === true;
  if (wantsData && !exp.hasData) errors.push(`plugin "${name}" declares data but has no ${name}.data.generated.js`);
  if (!wantsData && exp.hasData) errors.push(`plugin "${name}" ships ${name}.data.generated.js but its manifest does not declare data`);

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
 *
 * The exception is time. The reserved set is read from the INSTALLED highlight.js, so a release
 * that adds a language named like a shipped fence (`math`, say) would otherwise fail every build
 * on a Dependabot bump, with no way out but renaming a fence authors already write. A claim the
 * committed registry already records for the SAME plugin (`shipped`) is grandfathered: the plugin
 * keeps the name — the host's fence table routes it before any code renderer — and the build
 * warns. A new claim, or a shipped name moving to another plugin, still fails.
 */
function checkFenceClaims(byName, reserved, shipped, errors, warnings) {
  const owner = new Map();
  for (const [name, p] of byName) {
    for (const [fence, decl] of Object.entries(p.manifest.contributes?.fences || {})) {
      for (const claim of [fence, ...(decl.aliases || []).map((a) => a.name)]) {
        if (reserved.has(claim)) {
          if (shipped.get(claim) === name) {
            warnings.push(`plugin "${name}" keeps fence "${claim}", which a code language now also names; the plugin shipped it first, so ${claim} code blocks render as the plugin's`);
          } else {
            errors.push(`plugin "${name}" claims fence "${claim}", which a code language already owns; pick another name`);
          }
        }
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

/**
 * The files the runtime's host stages BESIDE itself, flat, by file name — so a payload's file name
 * must not be another plugin's, nor one the host already serves. Two libraries both called
 * `index.js` would overwrite each other in docs/scripts/sync-playground-assets.mjs and share one
 * load state in the host, with no error anywhere (HARD RULE #25 inversion lens).
 */
const HOST_ASSET_FILES = Object.freeze(['lattice-runtime.js', 'lattice-dagre.js', 'lattice-playground.js', 'lattice-katex.js']);
/** A payload may not take a data plugin's on-demand file name either (tools/build-plugin-data-bundles.js). */
const DATA_FILE_PATTERN = /^lattice-plugin-[a-z][a-z0-9-]*\.js$/;

function checkPayloadFiles(byName, errors) {
  const owner = new Map();
  for (const [name, p] of byName) {
    for (const payload of Object.values(p.manifest.payload || {})) {
      const file = String(payload.from || '').split('/').pop();
      if (DATA_FILE_PATTERN.test(file)) errors.push(`plugin "${name}"'s payload file "${file}" is named like a data plugin's on-demand file`);
      if (HOST_ASSET_FILES.includes(file)) errors.push(`plugin "${name}"'s payload file "${file}" is a file the runtime host already serves beside itself`);
      const prev = owner.get(file);
      if (prev && prev !== name) errors.push(`plugins "${prev}" and "${name}" both load a payload file named "${file}"; the host stages payloads flat by file name`);
      owner.set(file, name);
    }
  }
}

/**
 * The tag characters a record may open with (Segno's TAGS, docs/src/lib/segno/notation-grammar.ts),
 * and the ones the host's own rows already claim: `~` is the spark's. Marks and pills take no tag.
 * Copied rather than imported so this file stays dependency-free;
 * test/unit/plugins/contribution-points.test.js holds the copy to Segno's own list, and
 * test/unit/core/inline-code-table.test.js holds HOST_INLINE to the dispatcher's own rows.
 */
const INLINE_TAGS = Object.freeze(['~', '^']);
const HOST_INLINE = Object.freeze({ kinds: Object.freeze(['state', 'pill', 'spark']), sigils: Object.freeze({ '~': 'spark' }) });

/** One dispatch table: an inline kind's name and its sigil each belong to one row. */
function checkInlineClaims(byName, errors) {
  const kindOwner = new Map(HOST_INLINE.kinds.map((k) => [k, 'the host']));
  const sigilOwner = new Map(Object.entries(HOST_INLINE.sigils).map(([s, k]) => [s, `the host's ${k}`]));
  for (const [name, p] of byName) {
    for (const [kind, decl] of Object.entries(p.manifest.contributes?.inline || {})) {
      const prevKind = kindOwner.get(kind);
      if (prevKind) errors.push(`plugin "${name}" declares inline kind "${kind}", which ${prevKind === 'the host' ? 'the host' : `plugin "${prevKind}"`} already owns`);
      kindOwner.set(kind, name);
      if (!INLINE_TAGS.includes(decl.sigil)) errors.push(`plugin "${name}"'s inline kind "${kind}" opens with ${JSON.stringify(decl.sigil)}, which is not a Segno tag character (${INLINE_TAGS.join(' ')})`);
      const prev = sigilOwner.get(decl.sigil);
      if (prev) errors.push(`plugin "${name}"'s inline kind "${kind}" claims the sigil ${JSON.stringify(decl.sigil)}, which ${prev.startsWith('the host') ? prev : `plugin ${prev}`} already claims`);
      sigilOwner.set(decl.sigil, `"${name}" (${kind})`);
    }
  }
}

/**
 * The register keys the host already owns: every first-party front-matter register whose words
 * become `<prefix>-<word>` slide classes. A plugin register under one of these names would stamp
 * classes the host's own register also stamps.
 */
const HOST_REGISTERS = Object.freeze(['spark', 'tag', 'finish', 'mode', 'split', 'stamp', 'tone', 'spectrum', 'rule',
  'eyebrow', 'headline', 'lift', 'corners', 'cards', 'backdrop', 'venue', 'chart-finish', 'inline-code', 'guards', 'plugins',
  // Front-matter keys the host reads that are not axis registers, and Marp's own: a plugin register
  // named like one would shadow it in the author's front matter.
  'fit', 'color-mode', 'preset', 'claim', 'theme', 'class', 'size', 'header', 'footer', 'paginate', 'motion', 'logo',
  'spectrum-card', 'spectrum-edge', 'spectrum-trim', 'pace', 'delivery', 'glossary', 'acronyms', 'say', 'lang', 'title']);

/**
 * One register per key, within one register a word names one axis, and no `<key>-<word>` class is
 * one the host already stamps. `hostClasses` (from the build: every first-party modifier token) is
 * what catches a key the HOST_REGISTERS list has not heard of — the list rots, the classes do not.
 */
function checkRegisterClaims(byName, errors, hostClasses = new Set()) {
  const owner = new Map(HOST_REGISTERS.map((r) => [r, 'the host']));
  for (const [name, p] of byName) {
    for (const [key, decl] of Object.entries(p.manifest.contributes?.registers || {})) {
      const prev = owner.get(key);
      if (prev) errors.push(`plugin "${name}" declares register "${key}", which ${prev === 'the host' ? 'the host' : `plugin "${prev}"`} already owns`);
      owner.set(key, name);
      const wordAxis = new Map();
      for (const [axis, words] of Object.entries(decl.axes || {})) {
        for (const w of words) {
          if (hostClasses.has(`${key}-${w}`)) errors.push(`plugin "${name}"'s register "${key}" would stamp "${key}-${w}", a class the host already owns`);
          const had = wordAxis.get(w);
          if (had) errors.push(`plugin "${name}"'s register "${key}" lists "${w}" on both "${had}" and "${axis}"`);
          wordAxis.set(w, axis);
        }
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

/**
 * EXTENSION POINTS — a slot a plugin offers and components fill (plugin-system §5, phase F: the
 * chart family's `kernel`). The slot's name is the manifest block a filler declares, so the
 * declaration a chart already carries is the fill; the slot adds only WHO may fill it (`bucket`)
 * and what the plugin calls (`role`, `entry`), which the chart registry generator reads.
 * `componentBlocks` is undefined in a synthetic test that does not exercise the schema arm.
 */
function checkExtensionPoints(byName, components, componentBlocks, errors) {
  const blocks = new Map(); // block → { plugin, slot, bucket }
  const buckets = new Map(); // bucket → `plugin.slot`
  for (const [name, p] of byName) {
    for (const [slot, point] of Object.entries(p.manifest.contributes?.extensionPoints || {})) {
      // The BLOCK a filler declares: the slot's name unless it names one. Slot names are the
      // plugin's own; a block is one global word in every component manifest, so it has one reader.
      const block = point.block || slot;
      const prev = blocks.get(block);
      if (prev) {
        errors.push(`plugins "${prev.plugin}" and "${name}" both offer an extension point filled by the \`${block}\` block`);
        continue;
      }
      if (componentBlocks && !componentBlocks.has(block)) {
        errors.push(`plugin "${name}"'s extension point "${slot}" is filled by the \`${block}\` block, which is not an object block the component manifest schema defines — no component could fill it`);
      }
      const other = buckets.get(point.bucket);
      if (other) errors.push(`extension points "${other}" and "${name}.${slot}" both claim the "${point.bucket}" bucket`);
      buckets.set(point.bucket, `${name}.${slot}`);
      blocks.set(block, { plugin: name, slot, bucket: point.bucket });
    }
  }
  const fills = {};
  for (const c of components) {
    for (const b of c.blocks || []) {
      const slot = blocks.get(b);
      if (!slot) continue;
      if (c.bucket !== slot.bucket) {
        errors.push(`component "${c.name}" declares a \`${b}\` block, but the "${slot.plugin}" plugin's extension point "${slot.slot}" is filled from the "${slot.bucket}" bucket and this component is in "${c.bucket}" — the block would be read by nothing`);
        continue;
      }
      (fills[c.name] ??= []).push(slot.plugin);
    }
  }
  return fills;
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

module.exports = { resolvePlugins, KNOWN_API, HOST_ANCHORS, TEXT_TERMINATORS, HOST_ASSET_FILES, INLINE_TAGS, HOST_INLINE, HOST_REGISTERS };
