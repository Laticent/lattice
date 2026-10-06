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

export function workerScript(code) {
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
    'self.onmessage=(e)=>{const{id,slide:s}=e.data||{};let reply;try{if(!s||!Number.isInteger(s.index)||s.index<0)throw new RangeError("the slide index must be a whole number, 0 or more");' +
    'const slide=__freeze({html:String(s.html),facts:s.facts&&typeof s.facts==="object"?deepFreeze(s.facts):null,index:s.index,idPrefix:typeof s.idPrefix==="string"?s.idPrefix:"",baseUrl:typeof s.baseUrl==="string"?s.baseUrl:""});' +
    'reply={id,out:__transform(slide,kit)}}catch(err){reply={id,error:String(err&&err.message||err)}}' +
    'try{postMessage(reply)}catch(err){postMessage({id,error:"the transform returned something that cannot be sent back: "+String(err&&err.message||err)})}};' +
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
