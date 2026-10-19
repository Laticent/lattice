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
        // as `render({ type: "inline", kind, text, record, fields, id })`, and a fence as `{ type: "fence", body, id }`:
        // `type` says which (the inversion lens: a discriminant by a key's absence does not survive a contract freeze).
        // `text` is the span as written (`@kind{…}`), `record` the `{…}` after the kind's name.
        'self.onmessage=(e)=>{const{id,slide:f}=e.data||{};let reply;try{let input;' +
        'if(f&&typeof f.kind==="string"){if(typeof f.text!=="string"||typeof f.id!=="string")throw new TypeError("an inline span is a kind, its text and an id");' +
        'input=__freeze({type:"inline",kind:f.kind,text:f.text,record:typeof f.record==="string"?f.record:"",fields:f.fields&&typeof f.fields==="object"?deepFreeze(f.fields):null,id:f.id})}' +
        'else{if(!f||typeof f.body!=="string"||typeof f.id!=="string")throw new TypeError("a fence is a text body and an id");input=__freeze({type:"fence",body:f.body,id:f.id})}' +
        // A renderer may return `{ html, data }` (the returns contribution): sent as one string, the envelope
        // lib/packages/plugin-returns.mjs reads, so the frame's string-only check and its hash stay as they are. A
        // plugin can forge the envelope as a string; that buys it nothing it could not return as the object.
        `const out=__transform(input,kit);reply={id,out:out&&typeof out==="object"&&!Array.isArray(out)?${JSON.stringify(RETURN_ENVELOPE)}+JSON.stringify({html:out.html,data:out.data}):out}}catch(err){reply={id,error:String(err&&err.message||err)}}` +
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
export const PLUGIN_DATA_CONTRIBUTIONS = Object.freeze(['fences', 'inline', 'styles', 'diagnostics', 'returns']);

// ── What a plugin may hand back besides its drawing (threat-model note 2026-10-16 §6, decisions 10 to 12) ──
//
// `contributes.returns.fields` declares each value a renderer may return as data: `{ name: { type, … } }`.
// The renderer then returns `{ html, data }` instead of a string, the host checks `data` against the
// declaration (lib/packages/plugin-returns.mjs), and the host, never the plugin, writes each value on the
// slide's own <section> as `data-returned-<plugin>--<name>` (`RETURN_ATTR_PREFIX`). Any value that breaks the declaration disables the plugin
// for the whole render, with an alert. The declaration is pinned into consent, like an inline kind's slot.

/** The prefix of the one string a renderer's `{ html, data }` return crosses the frame as (workerScript, plugin-returns.mjs). */
export const RETURN_ENVELOPE = '\u0000lattice-return\u0000';
/** A renderer's raw reply as `{ html, data }`: a plain string is html with no data. `error` when the envelope is malformed. */
export function splitReturn(raw) {
  if (typeof raw !== 'string') return { error: 'the renderer returned no text' };
  if (!raw.startsWith(RETURN_ENVELOPE)) return { html: raw, data: null };
  let v;
  try {
    v = JSON.parse(raw.slice(RETURN_ENVELOPE.length));
  } catch {
    return { error: 'the renderer returned an object the host could not read' };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'the renderer returned an object the host could not read' };
  if (v.html !== undefined && v.html !== null && typeof v.html !== 'string') return { error: 'the renderer returned an object whose html is not text' };
  if (v.data !== undefined && v.data !== null && (typeof v.data !== 'object' || Array.isArray(v.data))) return { error: 'the renderer returned data that is not an object of named values' };
  return { html: typeof v.html === 'string' ? v.html : '', data: v.data ?? null };
}

/** The value types a plugin may return (owner decision 11): words from a declared list, numbers, flags, plain text, and markdown with no HTML. */
export const RETURN_TYPES = Object.freeze(['word', 'number', 'flag', 'text', 'markdown']);
/** At most this many fields per plugin, and these lengths per value (owner decision 11, the proposed limits). */
export const MAX_RETURN_FIELDS = 16;
export const MAX_RETURN_TEXT = 256;
export const MAX_RETURN_MARKDOWN = 2000;
// A field name never holds `--` or ends in `-`: the `--` in `data-returned-<plugin>--<field>` then marks where the
// field begins, so two plugins can never write one attribute (`a` + `b-c` against `a-b` + `c`, the red team).
const RETURN_NAME_RE = /^(?=[a-z][a-z0-9-]{0,31}$)(?!.*--)(?!.*-$)/;
const RETURN_WORD_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
/**
 * Every returned value lands under this one host-owned prefix. A list of the engine's own prefixes to keep plugins
 * off was tried first and was already stale (`data-split-mods`, `data-build-at`, `data-focus-style` and the settle
 * protocol's `data-<plugin>-state` were all reachable, the red team and the inversion): a namespace nothing else
 * in the tree uses closes the hole by construction. `returnAttr` (plugin-returns.mjs) builds the name.
 */
export const RETURN_ATTR_PREFIX = 'data-returned-';

/**
 * The declared fields as one sentence for a consent prompt (the CLI's `consentText`, the Studio's approval strip), or
 * '' when there are none. The digest pins the declaration; this is what makes approving it an informed choice.
 * @param {string} plugin
 * @param {ReturnType<typeof pluginReturnFields>} fields
 */
export function returnsConsent(plugin, fields) {
  if (!fields?.length) return '';
  const one = (f) =>
    f.type === 'word' ? `${f.name} (one of ${f.values.join(', ')})`
    : f.type === 'number' ? `${f.name} (a number${f.min !== undefined ? ` from ${f.min}` : ''}${f.max !== undefined ? ` up to ${f.max}` : ''})`
    : f.type === 'flag' ? `${f.name} (true or false)`
    : `${f.name} (${f.type === 'text' ? 'plain text' : 'markdown with no HTML, links or images'}, up to ${f.max} characters)`;
  return `It may also return ${fields.map(one).join('; ')}. Lattice checks each value and writes it on its slide as ${RETURN_ATTR_PREFIX}${plugin}--<field>; a value outside this list stops the plugin for the render.`;
}

/**
 * The fields a plugin declares it may return, normalized and sorted by name: `[{ name, type, values?, min?, max? }]`,
 * or [] when it declares none. Reads only what `returnsRefusal` admits; call that first for a stranger's manifest.
 */
export function pluginReturnFields(manifest) {
  const fields = manifest?.contributes?.returns?.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return [];
  return Object.keys(fields)
    .sort()
    .map((name) => {
      const f = fields[name] ?? {};
      const out = { name, type: f.type };
      if (f.type === 'word') out.values = Array.isArray(f.values) ? f.values.filter((v) => typeof v === 'string') : [];
      if (f.type === 'number') {
        if (typeof f.min === 'number') out.min = f.min;
        if (typeof f.max === 'number') out.max = f.max;
      }
      if (f.type === 'text' || f.type === 'markdown') out.max = typeof f.max === 'number' ? f.max : f.type === 'text' ? MAX_RETURN_TEXT : MAX_RETURN_MARKDOWN;
      return out;
    });
}

/**
 * Why a plugin's `contributes.returns` is refused, or null. Every value lands as
 * `data-returned-<name>--<field>` (`RETURN_ATTR_PREFIX`), a namespace no engine or runtime code reads.
 */
export function returnsRefusal(manifest) {
  const r = manifest?.contributes?.returns;
  if (r === undefined) return null;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return 'its contributes.returns is not an object';
  const extra = Object.keys(r).filter((k) => k !== 'fields');
  if (extra.length) return `its contributes.returns declares ${extra.join(', ')}; it takes \`fields\` only`;
  const fields = r.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !Object.keys(fields).length) return 'its contributes.returns.fields is not an object of fields';
  const names = Object.keys(fields);
  if (names.length > MAX_RETURN_FIELDS) return `it declares ${names.length} return fields, and a plugin may declare ${MAX_RETURN_FIELDS} at most`;
  for (const n of names) {
    if (!RETURN_NAME_RE.test(n)) return `its return field ${JSON.stringify(n.slice(0, 40))} is not lower-case letters, digits and single hyphens, starting with a letter and not ending in a hyphen (32 at most)`;
    const f = fields[n];
    if (!f || typeof f !== 'object' || Array.isArray(f)) return `its return field ${n} is not an object`;
    if (!RETURN_TYPES.includes(f.type)) return `its return field ${n} has type ${JSON.stringify(String(f.type).slice(0, 20))}; a field is one of ${RETURN_TYPES.join(', ')}`;
    const allowed = { word: ['type', 'values'], number: ['type', 'min', 'max'], flag: ['type'], text: ['type', 'max'], markdown: ['type', 'max'] }[f.type];
    const more = Object.keys(f).filter((k) => !allowed.includes(k));
    if (more.length) return `its return field ${n} (${f.type}) declares ${more.join(', ')}, which a ${f.type} field does not take`;
    if (f.type === 'word' && (!Array.isArray(f.values) || !f.values.length || f.values.length > 64 || f.values.some((v) => typeof v !== 'string' || !RETURN_WORD_RE.test(v)))) {
      return `its return field ${n} is a word field, and needs \`values\`: 1 to 64 lower-case words`;
    }
    if (f.type === 'number' && ['min', 'max'].some((k) => f[k] !== undefined && !Number.isFinite(f[k]))) return `its return field ${n} has a min or max that is not a finite number`;
    if (f.type === 'number' && Number.isFinite(f.min) && Number.isFinite(f.max) && f.min > f.max) return `its return field ${n} has a min above its max`;
    const cap = f.type === 'text' ? MAX_RETURN_TEXT : f.type === 'markdown' ? MAX_RETURN_MARKDOWN : 0;
    if (cap && f.max !== undefined && !(Number.isInteger(f.max) && f.max >= 1 && f.max <= cap)) return `its return field ${n} has a max that is not a whole number from 1 to ${cap}`;
  }
  return null;
}

/**
 * What consent pins of a plugin's inline kinds (`pluginConsentText`): each kind's name and its slot spec, as the
 * manifest declares them. Every door builds the digest from these, so the Studio, the CLI and `trust` agree.
 * @returns {Array<{ name: string, slot?: object }>}
 */
export function pluginKindPins(manifest) {
  const inline = manifest?.contributes?.inline ?? {};
  return pluginInlineKinds(manifest).map((name) => {
    const slot = inline[name]?.slot;
    return slot && typeof slot === 'object' && !Array.isArray(slot) ? { name, slot } : { name };
  });
}

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
export function pluginConsentText(code, fence, kinds = [], returns = []) {
  // The fence's LENGTH leads, so no two (fence, code) pairs can be split differently into the same text:
  // without it `("C", "a\0x")` and `("x\0C", "a")` hashed alike (the checker, 2026-10-12).
  // The INLINE kinds the renderer is handed are pinned for the same reason the fence is: editing the
  // manifest's `inline` keys would otherwise point an approved renderer at kinds nobody consented to. So is each
  // kind's SLOT: it decides what the renderer is handed (`fields`) and it is compiled on the host, so swapping it
  // under an approval was both a new input and a way to hang the host (the red team, 2026-10-14). They join the text
  // only when there are some, so every approval of a fence-only plugin keeps its digest. Each kind leads with its
  // length, and its slot is canonical JSON (sorted keys) after it; a plugin with no fence pins the empty name.
  // `kinds`: names, or `{ name, slot }` as `inlineKindsOf` keeps them.
  // `returns`: the declared return fields (`pluginReturnFields`). They decide what the host writes on the page, so
  // they are pinned like a slot: editing them under an approval would let approved code write somewhere new. They
  // join the text only when there are some, so every approval of a plugin that returns nothing keeps its digest.
  const f = fence || '';
  const head = `lattice-plugin-fence:${f.length}:${f}`;
  const one = (k) => {
    const name = typeof k === 'string' ? k : String(k?.name ?? '');
    const slot = typeof k === 'object' && k?.slot !== undefined ? canonicalJson(k.slot) : '';
    return `${name.length}:${name}:${slot.length}:${slot}`;
  };
  const inline = kinds.length ? `\u0000lattice-plugin-inline:${kinds.map(one).sort().join(',')}` : '';
  const ret = returns.length ? canonicalJson(returns) : '';
  const returned = ret ? `\u0000lattice-plugin-returns:${ret.length}:${ret}` : '';
  return `${head}${inline}${returned}\u0000${code}`;
}

/** JSON with every object's keys sorted, so the same slot spec always hashes alike. */
function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

/**
 * Why a zip plugin's inline kind `slot` is refused, or null: a slot is a Segno slot spec the HOST compiles (on the
 * Studio's main thread, before any sandbox), and Segno's schema check costs sigils × vocabulary, so an unbounded one
 * hung a render for minutes (the red team: 682 KB took 21.9 s). Bounded here by its shape, before it is compiled; the
 * doors then compile it once at import (`lib/packages/gate.js`, the Studio's import) and refuse one that does not.
 */
export function slotRefusal(slot) {
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return 'is not an object';
  let json;
  try {
    json = JSON.stringify(slot);
  } catch {
    return 'is not plain data';
  }
  if (json.length > MAX_SLOT_CHARS) return `is ${json.length.toLocaleString('en-US')} characters, past the ${MAX_SLOT_CHARS.toLocaleString('en-US')} a slot may be`;
  let words = 0;
  const walk = (v, depth) => {
    if (depth > MAX_SLOT_DEPTH) return `nests deeper than ${MAX_SLOT_DEPTH} levels`;
    if (Array.isArray(v)) {
      words += v.length;
      for (const x of v) {
        const why = walk(x, depth + 1);
        if (why) return why;
      }
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        words++;
        const why = walk(v[k], depth + 1);
        if (why) return why;
      }
    }
    return null;
  };
  const deep = walk(slot, 0);
  if (deep) return deep;
  if (words > MAX_SLOT_WORDS) return `holds ${words.toLocaleString('en-US')} names and values, past the ${MAX_SLOT_WORDS.toLocaleString('en-US')} a slot may hold`;
  const params = slot.params && typeof slot.params === 'object' ? Object.keys(slot.params).length : 0;
  if (params > MAX_SLOT_PARAMS) return `declares ${params} parameters, past the ${MAX_SLOT_PARAMS} a slot may declare`;
  const sigils = slot.sigils && typeof slot.sigils === 'object' ? Object.keys(slot.sigils) : [];
  if (sigils.length > MAX_SLOT_SIGILS) return `declares ${sigils.length} sigils, past the ${MAX_SLOT_SIGILS} a slot may declare`;
  if (sigils.some((g) => g.length !== 1)) return 'declares a sigil that is not one character';
  return null;
}

/** The bounds of a zip plugin's slot (`slotRefusal`): generous for a real record, and far below what hurts. */
export const MAX_SLOT_CHARS = 20_000;
export const MAX_SLOT_WORDS = 1_000;
export const MAX_SLOT_DEPTH = 6;
export const MAX_SLOT_PARAMS = 32;
export const MAX_SLOT_SIGILS = 8;

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
  // `embedded` loads a plugin on every render with no off switch. It is Lattice's to grant, in this repository,
  // and a package that arrives as data never holds it (2026-10-17-pills-plugin.md § 4.5).
  if (pkg.manifest?.embedded !== undefined) return 'it declares `embedded`, which only a plugin in this repository may hold: it loads on every render with no off switch';
  const loads = ['payload', 'vendor'].filter((k) => pkg.manifest?.[k] !== undefined && pkg.manifest[k] !== null);
  if (loads.length) return `it declares ${loads.join(' and ')}, a library the host would load for it; a plugin that arrives as data carries its own code or none`;
  if (contributes.fences !== undefined && (!contributes.fences || typeof contributes.fences !== 'object' || Array.isArray(contributes.fences))) return 'its contributes.fences is not an object of fences';
  const fences = contributes.fences ? Object.keys(contributes.fences) : [];
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
    if (decl.slot !== undefined) {
      const why = slotRefusal(decl.slot);
      if (why) return `its inline kind ${k}'s slot ${why}`;
    }
  }
  const returned = returnsRefusal(pkg.manifest);
  if (returned) return returned;
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
