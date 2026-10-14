/**
 * The SHAPE of a code package (contract note §9): what a door can run at all, and the worker it
 * runs in. Split from the door's kernel (code-door-core.mjs, which re-exports all of it) so the
 * Studio's Library can check an import without loading the door: the door itself loads only when a
 * render meets a code package (docs/route-budget.json). Pure string work, like the kernel.
 */

/** How a package's bundle ends, as the export writes it (lib/packages/code-bundle.js, esbuild's ESM form). */
export const PACKAGE_TAIL = /export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}\s*;?\s*$/;
// Matched against the last few hundred characters only. On the whole text the pattern backtracks
// quadratically from every earlier `export` (160,000 spaces after a tail: 30 s on the host, before
// any size check or timer; found by the red team).
const TAIL_WINDOW = 256;

/**
 * The WORKER a code package runs in: the bundle, and a message handler that calls its default
 * export with the slide and a frozen kit holding `measure` and nothing else (contract note §8).
 * The slide is `{ html, facts, index, idPrefix, baseUrl }`: `facts` is the stable promise, the
 * slide's plain content (lib/packages/slide-facts.mjs), and `html` the engine's section, the
 * surface a package that tweaks our markup reads at its own risk (contract note §9).
 *
 * WHY A WORKER, in both doors. A sandboxed frame may always navigate ITSELF, and neither a sandbox
 * flag nor a content-security policy stops `location.href = 'https://…?slide=…'`: the CLI's page
 * refused that request by interception, and the Studio has no interception. A worker has no
 * `location` to assign, no document to write a `<meta refresh>` or a link into, and it inherits the
 * frame's policy, so `fetch`, WebSocket, EventSource, `importScripts`, `import()` and a nested
 * worker all reach nothing (measured, contract note §9). It also takes the package out of the realm
 * our runner lives in, so no bundle can redefine the runner or patch what it checks.
 * `measure(text, font)` is `OffscreenCanvas` text measurement, inside the worker.
 *
 * A code package is an ES module, and a worker made from a blob runs a classic script, so the
 * bundle's final `export { name as default }` (the only shape the export writes; any other is
 * refused) is taken off and the name bound instead. A static `import` or `import.meta` is a syntax
 * error here and never runs.
 * @param {string} code  the package's `transform.js`
 * @returns {string}  the worker's script (FRAME_BOOTSTRAP makes it a blob)
 */
/** What a worker could reach the network with; workerScript removes each before a package runs. */
export const WORKER_NETWORK = Object.freeze(['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport', 'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'Request', 'caches', 'indexedDB', 'FontFace', 'FontFaceSet', 'fonts']);
/** The same, on the worker's `navigator`: a storage bucket carries its own `caches`, whose `add(url)` fetches. */
export const WORKER_NAVIGATOR_NETWORK = Object.freeze(['storage', 'storageBuckets']);
/** What builds code from a string in a worker: workerScript removes `ShadowRealm` and makes `eval` and `Function` (and every function kind's `constructor`) throw. */
export const WORKER_CODE = Object.freeze(['eval', 'Function', 'ShadowRealm']);

export function workerScript(code, { fence = false } = {}) {
  const text = String(code);
  const offset = Math.max(0, text.length - TAIL_WINDOW);
  const m = text.slice(offset).match(PACKAGE_TAIL);
  if (!m) throw new Error('code sandbox: a code package must end in `export { name as default }`, as the export writes it');
  return (
    '"use strict";' +
    // SECOND WALL, before any of the package's code: every way a worker reaches the network is
    // taken off its global, for good (non-configurable). The inherited policy is the first wall,
    // and it is only as good as each engine's inheritance: Firefox let `EventSource` from the worker
    // reach a loopback server that fetch, WebSocket and importScripts could not (the Studio nightly,
    // gecko). A worker has one realm and, with `Worker` gone, no way to make another.
    // Every object on the global's prototype chain loses the name too, not only `self`: Chromium
    // defines `fetch`, `importScripts`, `indexedDB` and the `fonts` getter on
    // WorkerGlobalScope.prototype, not on `self`, so a wall on `self` only shadowed them and
    // `WorkerGlobalScope.prototype.fetch.call(self, …)` walked around it. `FontFace` and `fonts` are here because
    // `new FontFace(name, 'url(…)').load()` is a fetch; `kit.measure` needs neither.
    // A storage bucket's `caches` reaches the network without `fetch`, so the worker's `navigator`
    // loses `storage` and `storageBuckets` the same way (an opaque origin hides both today; the wall
    // does not lean on that). The wall then checks itself and FAILS CLOSED: a name some engine would
    // not let us redefine stops the package loading, rather than staying live in silence.
    '{const gone=(root,names)=>{const left=[];for(const n of names){for(let o=Object.getPrototypeOf(root);o;o=Object.getPrototypeOf(o)){if(Object.prototype.hasOwnProperty.call(o,n))try{Object.defineProperty(o,n,{value:undefined,writable:false,configurable:false})}catch(e){}}' +
    'try{Object.defineProperty(root,n,{value:undefined,writable:false,configurable:false})}catch(e){}' +
    // Every holder is checked, not the first: one left live on a prototype is reached with `.call(self)`.
    'for(let o=root;o;o=Object.getPrototypeOf(o)){const d=Object.getOwnPropertyDescriptor(o,n);if(d&&(d.get||d.set||d.value!==undefined||d.configurable||d.writable)){left.push(n);break}}}return left};' +
    `const left=gone(self,${JSON.stringify(WORKER_NETWORK)}).concat(self.navigator?gone(self.navigator,${JSON.stringify(WORKER_NAVIGATOR_NETWORK)}):[]);` +
    // NO CODE FROM STRINGS. A dynamic `import()` is syntax, not a name, so the gate refuses a package
    // whose source holds one (code-syntax.mjs); this keeps code built at run time from bringing it
    // back. `ShadowRealm` goes like the network names. `eval` and `Function` become STUBS that throw,
    // not `undefined`: library code reads `Function.prototype` and tests `x instanceof Function`
    // without ever building code (lodash, core-js; the inversion lens), so each stub keeps its
    // kind's `prototype`. `(()=>{}).constructor` is the same constructor, and async, generator and
    // async-generator functions each have their own, so every kind's prototype gets a stub as its
    // `constructor`. Timers keep a function and refuse a string. Each pin is checked like the network
    // names, and the helpers are taken now, before the bundle can replace `Function.prototype.call`
    // and catch an original on its way through.
    `left.push(...gone(self,${JSON.stringify(WORKER_CODE.filter((n) => n !== 'eval' && n !== 'Function'))}));` +
    '{const apply=Reflect.apply,defp=Object.defineProperty,own=Object.getOwnPropertyDescriptor,up=Object.getPrototypeOf,has=Object.prototype.hasOwnProperty;' +
    // `pin` puts `v` on `root` and on every holder of `n` above it (or on `root` alone), then checks them all.
    'const pin=(root,n,v,chain)=>{for(let o=root;o;o=chain?up(o):null){if(o===root||has.call(o,n))try{defp(o,n,{value:v,writable:false,configurable:false})}catch(e){}' +
    'const d=own(o,n);if(d&&(d.get||d.set||d.value!==v||d.writable||d.configurable)){left.push(n);return}}};' +
    'const refuse=(what,p)=>{const s=function(){throw new EvalError("a code package may not build code from a string ("+what+")")};if(p)defp(s,"prototype",{value:p,writable:false});return s};' +
    'const kinds=[function(){},async function(){},function*(){},async function*(){}].map(up);const F=refuse("Function",kinds[0]);' +
    'pin(self,"Function",F,true);pin(self,"eval",refuse("eval"),true);kinds.forEach((p,i)=>pin(p,"constructor",i?refuse("Function",p):F,false));' +
    'for(const n of ["setTimeout","setInterval"]){const orig=self[n];if(typeof orig!=="function")continue;' +
    'pin(self,n,function(h){if(typeof h!=="function")throw new TypeError("a code package may hand "+n+" a function, not a string");return apply(orig,self,arguments)},true)}}' +
    'if(left.length)throw new Error("the sandbox could not take "+left.join(", ")+" off the worker")}' +
    // `facts` (lib/packages/slide-facts.mjs) reaches the package frozen all the way down, as `slide`
    // itself is: input, not scratch space. Each slide's copy is fresh anyway (structured clone), so
    // this is about the one call, not a later slide. Built from `Object.freeze` and `Object.keys`
    // taken BEFORE the bundle runs, since its top level could replace either (the red team did,
    // with `Object.isFrozen`); plain data from the host has no cycles.
    'const __freeze=Object.freeze,__keys=Object.keys;const deepFreeze=(v)=>{if(v&&typeof v==="object"){__freeze(v);for(const k of __keys(v))deepFreeze(v[k])}return v};' +
    // The bundle gets a function scope of its own, so its minified names never meet the handler's.
    `const __transform=(()=>{${text.slice(0, offset + m.index)}\n;return ${m[1]}})();` +
    'let ctx=null;' +
    'const kit=__freeze({measure(text,font){ctx??=new OffscreenCanvas(1,1).getContext("2d");ctx.font=String(font??"");return ctx.measureText(String(text??"")).width}});' +
    (fence
      ? // A FENCE renderer (code-door-fence.mjs): `render({ body, id })`. The message still carries it under
        // `slide`, so the frame's one script, whose hash the page's policy names, is the same for both.
        // An INLINE kind (the inline door, 2026-10-14-plugin-inline-door.md §4.4) reaches the same one function
        // as `render({ kind, text, fields, id })`: `kind` is what tells the two apart, and a fence never has one.
        'self.onmessage=(e)=>{const{id,slide:f}=e.data||{};let reply;try{let input;' +
        'if(f&&typeof f.kind==="string"){if(typeof f.text!=="string"||typeof f.id!=="string")throw new TypeError("an inline span is a kind, its text and an id");' +
        'input=__freeze({kind:f.kind,text:f.text,fields:f.fields&&typeof f.fields==="object"?deepFreeze(f.fields):null,id:f.id})}' +
        'else{if(!f||typeof f.body!=="string"||typeof f.id!=="string")throw new TypeError("a fence is a text body and an id");input=__freeze({body:f.body,id:f.id})}' +
        'reply={id,out:__transform(input,kit)}}catch(err){reply={id,error:String(err&&err.message||err)}}' +
        'try{postMessage(reply)}catch(err){postMessage({id,error:"the renderer returned something that cannot be sent back: "+String(err&&err.message||err)})}};'
      :     'self.onmessage=(e)=>{const{id,slide:s}=e.data||{};let reply;try{if(!s||!Number.isInteger(s.index)||s.index<0)throw new RangeError("the slide index must be a whole number, 0 or more");' +
    'const slide=__freeze({html:String(s.html),facts:s.facts&&typeof s.facts==="object"?deepFreeze(s.facts):null,index:s.index,idPrefix:typeof s.idPrefix==="string"?s.idPrefix:"",baseUrl:typeof s.baseUrl==="string"?s.baseUrl:""});' +
    'reply={id,out:__transform(slide,kit)}}catch(err){reply={id,error:String(err&&err.message||err)}}' +
    'try{postMessage(reply)}catch(err){postMessage({id,error:"the transform returned something that cannot be sent back: "+String(err&&err.message||err)})}};') +
    'postMessage({ready:true});'
  );
}

// ── The facts version a package reads (contract note §11).

/** The shape of `slide.facts` this Lattice writes. Moves only when a field changes meaning or goes away. */
export const FACTS_VERSION = 1;
/** Every facts version a door can hand a package. A package declares the one it reads. */
export const FACTS_VERSIONS = Object.freeze([1]);

/**
 * Why a code package's declared facts version cannot run here, or null. A code package's manifest
 * says which `slide.facts` shape it was written for (`"facts": 1`), and the door hands it that
 * shape. Declared, not assumed: the day `facts` changes shape, a door keeps handing a v1 package v1
 * or refuses it in plain words, where an undeclared package would get the new shape and throw or,
 * worse, draw the wrong thing (owner decision 2026-09-28: no deferred version debt).
 */
export function factsRefusal(version) {
  const known = FACTS_VERSIONS.join(', ');
  if (version === undefined) return `its manifest does not say which slide facts it reads: add "facts": ${FACTS_VERSION} to ${'<name>'}.manifest.json`;
  if (!Number.isInteger(version) || version < 1) return `its manifest's "facts" must be a whole number (a slide-facts version), not ${JSON.stringify(version)}`;
  if (!FACTS_VERSIONS.includes(version)) return `it reads slide facts version ${version}, and this Lattice hands packages version ${known}${version > FACTS_VERSION ? ': it was made for a newer Lattice' : ''}`;
  return null;
}

// ── The shape: what a door can run at all (lib/packages/gate.js and the Studio's import).

// A script file of any spelling, as the spine counts code (read.js SCRIPT_RE).
const SCRIPT_RE = /\.(?:[cm]?jsx?|[cm]?tsx?|wasm)$/i;

/**
 * The largest `transform.js` a door runs. The largest bundle measured is `map`, 234 KB; a package
 * four times that is not a component, and the cap keeps an import, the consent text's digest and
 * every render's copy of the code bounded.
 */
export const MAX_TRANSFORM_CHARS = 1_000_000;

/**
 * Why a package that carries code is refused, or null when its code may be offered for consent
 * (contract note §9). Consent is a separate question (lib/packages/trust.js): this decides only
 * whether the code is the ONE shape a door can run.
 *   - only a component carries code; a theme, finish or motion package with a script is refused;
 *   - the one script is `<name>.transform.js`: any other script in the folder is refused, so
 *     nothing rides along that consent did not cover;
 *   - the transform ends the way the export writes it (`export { name as default }`), which is the
 *     only shape the runner accepts (workerScript, below);
 *   - it fits in the locked page;
 *   - its manifest declares a slide-facts version this Lattice hands packages (`factsRefusal`).
 */
export function refuseCode(pkg) {
  if (pkg.type !== 'component') return `it carries code (a script file), and only a component may: a ${pkg.type} package is data`;
  const transform = pkg.roles['transform.js'];
  const extra = Object.keys(pkg.files).filter((f) => SCRIPT_RE.test(f) && f !== transform);
  if (extra.length) return `it carries a script other than ${pkg.name}.transform.js (${extra.join(', ')}); a code package holds exactly one`;
  if (!transform) return 'it carries code but no transform.js';
  const body = pkg.files[transform];
  const code = typeof body === 'string' ? body : new TextDecoder().decode(body);
  if (code.length > MAX_TRANSFORM_CHARS) return `its transform.js is ${code.length.toLocaleString('en-US')} characters, past the ${MAX_TRANSFORM_CHARS.toLocaleString('en-US')} a code package may carry`;
  try {
    workerScript(code);
  } catch {
    return 'its transform.js does not end in `export { name as default }`, the one shape a code package runs in (bundle it as an ES module with one default export)';
  }
  // Last: a package with a real problem hears about that first, not about a missing line.
  const facts = factsRefusal(pkg.manifest?.facts);
  return facts ? facts.replace('<name>', pkg.name) : null;
}

/**
 * What a zip PLUGIN may carry of the contribution points (plugin-system §4.10): a fence renderer, the
 * inline kinds the same renderer draws (`@kind{…}`, 2026-10-14-plugin-inline-door.md), their CSS, and
 * the diagnostics it declares. Every other point runs code in a place the sandbox has no wall around (a
 * parser rule, viewer-page script, a build step with full Node privileges). An inline kind is not a parser
 * rule: the host finds `@kind{…}` in a code span markdown has already finished with, and the renderer
 * runs in the sandbox like a fence's.
 */
export const PLUGIN_DATA_CONTRIBUTIONS = Object.freeze(['fences', 'inline', 'styles', 'diagnostics']);

/**
 * The inline kinds a zip plugin's manifest declares, sorted, or [] (2026-10-14-plugin-inline-door.md §4.3).
 * @returns {string[]}
 */
export function pluginInlineKinds(manifest) {
  const inline = manifest?.contributes?.inline;
  return inline && typeof inline === 'object' && !Array.isArray(inline) ? Object.keys(inline).sort() : [];
}

/**
 * What consent for a plugin is pinned to: its `render.js` AND the one fence it owns, as the text
 * both doors hash (SHA-256, in hex). The fence name is part of it because the manifest alone says
 * which fence the renderer is handed: without it, editing the manifest's `fences` key would point
 * an approved renderer at another plugin's fence with no new consent, and once approvals sit in
 * users' browsers, widening what the digest covers would invalidate every one of them.
 * `styles.css` is not pinned: it is data, and scoped (plugin-system §9 decision 12).
 * @param {string} code   the plugin's `render.js`
 * @param {string} fence  the fence name the manifest declares
 */
export function pluginConsentText(code, fence, kinds = []) {
  // The fence's LENGTH leads, so no two (fence, code) pairs can be split differently into the same text:
  // without it `("C", "a\0x")` and `("x\0C", "a")` hashed alike (the checker, 2026-10-12).
  // The INLINE kinds the renderer is handed are pinned for the same reason the fence is: editing the
  // manifest's `inline` keys would otherwise point an approved renderer at kinds nobody consented to. They
  // join the text only when there are some, so every approval of a fence-only plugin keeps its digest.
  // Each kind leads with its length too, and a plugin with no fence pins the empty name.
  const f = fence || '';
  const head = `lattice-plugin-fence:${f.length}:${f}`;
  if (!kinds.length) return `${head}\u0000${code}`;
  return `${head}\u0000lattice-plugin-inline:${[...kinds].sort().map((k) => `${k.length}:${k}`).join(',')}\u0000${code}`;
}

/** What a fence name may be (plugin.schema.json's `fences` key pattern): lower-case, digits and hyphens. */
export const FENCE_NAME_RE = /^[a-z][a-z0-9-]*$/;

/** How many inline kinds one zip plugin may declare: a renderer that draws more is a library, not a plugin. */
export const MAX_PLUGIN_KINDS = 16;

/**
 * Why a PLUGIN package that carries code is refused, or null when its code may be offered for
 * consent. The plugin twin of `refuseCode`, with the same questions asked of `render.js`:
 *   - only a plugin, and only the contribution points a zip may carry (`PLUGIN_DATA_CONTRIBUTIONS`);
 *   - exactly ONE fence: the renderer is `render({ body, id })` with nothing to say which fence it
 *     was handed, so a second fence has no way to be told apart (a field added later, if one is needed);
 *   - the one script is `<name>.render.js`, ending as the export writes it, within the size cap.
 * Consent is a separate question (lib/packages/trust.js).
 */
export function refusePluginCode(pkg) {
  if (pkg.type !== 'plugin') return `it is a ${pkg.type} package, not a plugin`;
  if (!pkg.roles || !pkg.files) return 'it carries no files';
  const contributes = pkg.manifest?.contributes && typeof pkg.manifest.contributes === 'object' && !Array.isArray(pkg.manifest.contributes) ? pkg.manifest.contributes : {};
  const barred = Object.keys(contributes).filter((k) => !PLUGIN_DATA_CONTRIBUTIONS.includes(k));
  if (barred.length) return `it contributes ${barred.join(', ')}, and a plugin that arrives as data may carry only ${PLUGIN_DATA_CONTRIBUTIONS.join(', ')}: those run code outside the sandbox`;
  // The manifest's other code-running keys, refused by rule and not by prose: `render.exec` says where a
  // hydrate pass or a bake runs (`hydrate: "pass"` is bundled into every browser surface, and a bake
  // drives a subprocess), and `payload` / `vendor` name a library the host would load for the plugin.
  // plugin-system §4.10 and the 2026-10-04 inversion lens: LPM §10 said zips never carry them, and
  // nothing enforced it until the zip channel existed.
  const exec = pkg.manifest?.render && typeof pkg.manifest.render === 'object' ? pkg.manifest.render.exec : undefined;
  if (exec !== undefined && exec !== null && !(typeof exec === 'object' && !Object.keys(exec).length)) return `it declares render.exec, which says where code runs outside the sandbox (a hydrate pass, a bake); a plugin that arrives as data draws through its fence renderer only`;
  const loads = ['payload', 'vendor'].filter((k) => pkg.manifest?.[k] !== undefined && pkg.manifest[k] !== null);
  if (loads.length) return `it declares ${loads.join(' and ')}, a library the host would load for it; a plugin that arrives as data carries its own code or none`;
  const fences = contributes.fences && typeof contributes.fences === 'object' && !Array.isArray(contributes.fences) ? Object.keys(contributes.fences) : [];
  if (contributes.inline !== undefined && (!contributes.inline || typeof contributes.inline !== 'object' || Array.isArray(contributes.inline))) return 'its contributes.inline is not an object of kinds';
  const kinds = pluginInlineKinds(pkg.manifest);
  if (fences.length > 1) return `it declares ${fences.length} fences, and a plugin that arrives as data owns one at most`;
  if (!fences.length && !kinds.length) return 'it declares no fence and no inline kind, so it has nothing to draw';
  if (fences.length && !FENCE_NAME_RE.test(fences[0])) return `its fence name ${JSON.stringify(fences[0])} is not lower-case letters, digits and hyphens starting with a letter`;
  if (kinds.length > MAX_PLUGIN_KINDS) return `it declares ${kinds.length} inline kinds, and a plugin may declare ${MAX_PLUGIN_KINDS} at most`;
  for (const k of kinds) {
    if (!FENCE_NAME_RE.test(k)) return `its inline kind ${JSON.stringify(k.slice(0, 40))} is not lower-case letters, digits and hyphens starting with a letter`;
    const decl = contributes.inline[k];
    if (!decl || typeof decl !== 'object' || Array.isArray(decl)) return `its inline kind ${k} is not an object`;
    // An alias is a single character every plugin anywhere would compete for (the note, §2): a zip plugin's kind
    // is written `@kind{…}` only.
    if (decl.sigil !== undefined) return `its inline kind ${k} declares a sigil; a plugin that arrives as data is written \`@${k}{…}\` and has no short form`;
    const extra = Object.keys(decl).filter((key) => !['slot', 'placeholder', 'title'].includes(key));
    if (extra.length) return `its inline kind ${k} declares ${extra.join(', ')}, which an inline kind does not take (slot, placeholder, title)`;
    if (decl.slot !== undefined && (!decl.slot || typeof decl.slot !== 'object' || Array.isArray(decl.slot))) return `its inline kind ${k}'s slot is not an object`;
  }
  const render = pkg.roles['render.js'];
  if (!render) return `it declares ${fences.length ? 'a fence' : 'an inline kind'} but carries no render.js`;
  if (render !== `${pkg.name}.render.js`) return `its script is ${render}, and a plugin's one script is ${pkg.name}.render.js`;
  const extra = Object.keys(pkg.files).filter((f) => SCRIPT_RE.test(f) && f !== render);
  if (extra.length) return `it carries a script other than ${pkg.name}.render.js (${extra.join(', ')}); a plugin holds exactly one`;
  const body = pkg.files[render];
  const code = typeof body === 'string' ? body : new TextDecoder().decode(body);
  if (code.length > MAX_TRANSFORM_CHARS) return `its render.js is ${code.length.toLocaleString('en-US')} characters, past the ${MAX_TRANSFORM_CHARS.toLocaleString('en-US')} a plugin may carry`;
  // A lone surrogate decodes in a browser to a code unit TextEncoder turns into U+FFFD, so two different files would
  // share a consent digest in the Studio (red team, 2026-10-12). Text with one is not text a pin can name.
  if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(code)) return 'its render.js holds a lone UTF-16 surrogate, which two different files could share a digest through; save it as plain UTF-8';
  try {
    workerScript(code, { fence: true });
  } catch {
    return 'its render.js does not end in `export { name as default }`, the one shape a plugin runs in (bundle it as an ES module with one default export)';
  }
  return null;
}


/**
 * Class stems the viewer's runtime and the engine act on that no list of class NAMES holds: the pane
 * cells (`lat-panes`), the slide channels (`lattice-*`), a live plot (`functionplot`), a diagram
 * (`mermaid`, `language-*`), the typesetters (`katex`, `mjx`, `hljs`) and the verdict grid.
 */
export const RUNTIME_CLASS_STEMS = Object.freeze(['lat', 'lattice', 'functionplot', 'mermaid', 'language', 'katex', 'mjx', 'hljs', 'verdict']);

/**
 * Why a CODE package may not take this name, or null. A package may add classes in its own name
 * (`<name>`, `<name>-…`), so a name that is the start of a class Lattice uses would let it add that
 * class: `chart` would add `chart-frame`, `logo` would add `logo-wall`, which a pass after the door
 * acts on (the checker). `knownClasses` is every class and component name Lattice ships.
 */
export function codeNameRefusal(name, knownClasses) {
  const n = String(name);
  if (RUNTIME_CLASS_STEMS.includes(n)) return `"${n}" is a class stem Lattice uses, and a code package adds classes in its own name`;
  const hit = [...knownClasses].find((k) => typeof k === 'string' && k.startsWith(`${n}-`));
  return hit ? `a code package adds classes in its own name, and "${hit}" is a class Lattice uses that starts with "${n}-"` : null;
}
