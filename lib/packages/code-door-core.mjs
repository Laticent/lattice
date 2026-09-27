/**
 * The code-package DOOR's shared kernel (contract note §9): what the CLI's door
 * (lib/packages/code-door.js) and the Studio's (docs/src/lib/code-packages/) must do the same
 * way, so they cannot drift (HARD RULE #1). Pure string work, no DOM and no Node built-ins: ESM,
 * so the docs bundle imports it directly, and the CLI `require`s it (Node 22 loads ESM that way).
 *
 *   claimedSlides   which slides a package runs on — the chart dispatch's first-match rule
 *   spliced         a package's sanitized section put back: the engine's tag, the package's
 *                   classes and body, the engine's comments and styles
 *   withFailureNote the engine's slide, kept, with a visible note saying why the package did not draw it
 *   printableLine   a stranger's text flattened to one line safe for a terminal or a note
 *
 * The sanitizing and the address rule are the sanitizer's (lib/core/sanitize-slide-html.mjs with
 * lib/core/remote-ref.js `doorFilterAttr`), which both doors run in a page.
 */

import { splitSections } from '../core/split-sections.mjs';

/** The contract's limit per slide. */
export const SLIDE_MS = 2000;
/** The longest reason a note on a slide carries. */
export const NOTE_CHARS = 300;

/**
 * Every shipped component whose own transform draws its slides, from the generated package index
 * (lib/packages/packages.generated.json): the engine's claims, which come before any package's.
 * @param {{ packages: Array<{ type: string, name: string, code?: boolean }> }} index
 */
export function engineClaimsOf(index) {
  return Object.freeze(index.packages.filter((p) => p.type === 'component' && p.code).map((p) => p.name));
}

/** Text safe to print to a terminal: control characters (an ESC sequence in a file name) become `?`. */
export function printable(s) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
  return String(s).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '?');
}

/**
 * A stranger's text as ONE printable line: `printable`, and also newlines, tabs, the Unicode line
 * and paragraph separators and the direction controls, each a `?`. A package's thrown message or
 * console line could otherwise start a line of its own that reads like ours ("approved", "OS
 * sandbox on"), or reverse the text around it (the red team).
 */
export function printableLine(s) {
  return printable(s).replace(/[\t\n\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '?');
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Which slides a door runs: walk ONE ordered list, as the chart dispatch does, and take the first
 * name the section's classes hold. The list is the engine's claims (shipped components with a
 * transform: the engine already drew those slides), then the installed code packages by name. So
 * `bar tally` is a bar chart and `tally` never runs, and a slide naming two packages goes to the
 * first by name, never to both. Only TRANSFORM components claim: the engine stamps `content` on
 * ordinary sections and `content` is a shipped component, so a list of every shipped name claimed
 * every slide (the CLI door's first run).
 * @param {string} html  the engine's finished deck render
 * @param {{ packages: string[], engineClaims: Iterable<string> }} opts
 * @returns {Array<{ i: number, pkg: string, index: number, html: string }>}  `i` indexes splitSections' parts
 */
export function claimedSlides(html, { packages, engineClaims }) {
  const order = [...engineClaims, ...[...packages].sort()];
  const isPackage = new Set(packages);
  const out = [];
  let index = 0;
  splitSections(html).forEach((part, i) => {
    if (part.type !== 'section') return;
    const cls = new Set(String(part.cls || '').split(/\s+/).filter(Boolean));
    const first = order.find((n) => cls.has(n));
    if (first && isPackage.has(first)) out.push({ i, pkg: first, index, html: part.openTag + part.inner + part.close });
    index++;
  });
  return out;
}

/** One claim's identity across the two renders and across renders: the package, its code, and what it was handed. */
export const claimKey = (c, code) => `${c.pkg}\u0000${c.index}\u0000${c.idPrefix}\u0000${c.baseUrl}\u0000${code}\u0000${c.html}`;

/** Each top-level section's position among the sections of `parts`. */
function positions(parts) {
  const pos = new Map();
  let n = 0;
  parts.forEach((p, i) => {
    if (p.type === 'section') pos.set(i, n++);
  });
  return pos;
}

/**
 * A hook for the registry's code-packages slot that records every section a package claims, with
 * the position and id prefix the render gives it, and changes nothing. It also records a section
 * that names a package but that a shipped component claims, so the render can say so.
 */
export function captureHook(names, { baseUrl = '', engineClaims }) {
  const claims = [];
  const shadowed = [];
  const hook = (html, { slideIndex, idPrefix }) => {
    const parts = splitSections(html);
    const pos = positions(parts);
    for (const c of claimedSlides(html, { packages: names, engineClaims })) claims.push({ ...c, index: slideIndex(pos.get(c.i)), idPrefix, baseUrl });
    parts.forEach((p, i) => {
      if (p.type !== 'section') return;
      const cls = String(p.cls || '').split(/\s+/);
      const pkg = names.find((nm) => cls.includes(nm));
      const engine = pkg && engineClaims.find((nm) => cls.includes(nm));
      if (engine) shadowed.push({ slide: slideIndex(pos.get(i)) + 1, pkg, engine });
    });
    return html;
  };
  return { hook, claims, shadowed };
}

/** A hook for the registry's code-packages slot that puts each claimed section's result in. */
export function substituteHook(names, sections, codeOf, { baseUrl = '', engineClaims }) {
  return (html, { slideIndex, idPrefix }) => {
    const parts = splitSections(html);
    const pos = positions(parts);
    const replacements = new Map();
    for (const c of claimedSlides(html, { packages: names, engineClaims })) {
      const claim = { ...c, index: slideIndex(pos.get(c.i)), idPrefix, baseUrl };
      // A section the first render did not hand over (the render is deterministic, so this is a
      // defect, not a race): the engine's slide with a note, never a stranger's output out of place.
      replacements.set(c.i, sections.get(claimKey(claim, codeOf.get(c.pkg))) ?? withFailureNote(c.html, c.pkg, 'the slide changed between the two renders'));
    }
    return replacements.size ? replaceParts(html, replacements) : html;
  };
}

/** Replace some of `html`'s top-level parts (by splitSections index) and join it back. */
export function replaceParts(html, replacements) {
  return splitSections(html)
    .map((p, i) => (replacements.has(i) ? replacements.get(i) : p.type === 'section' ? p.openTag + p.inner + p.close : p.text))
    .join('');
}

/**
 * What the engine put in a section that the sanitizer removes from a package's output: the
 * author's comments (speaker notes, captions) and the deck's `<style>` blocks, in order.
 */
const carriedOf = (section) => section.match(/<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi) || [];

/** The engine's section, kept, with a visible note saying why the package did not draw it. */
export function withFailureNote(section, pkg, why) {
  const name = escapeHtml(printableLine(pkg));
  const note = `<p data-package-error="${name}" role="note">The code package “${name}” did not draw this slide: ${escapeHtml(printableLine(String(why).slice(0, NOTE_CHARS)))}</p>`;
  return section.replace(/<\/section>\s*$/i, `${note}</section>`);
}

/**
 * Put a package's sanitized section in place of the engine's. The `<section>` TAG stays the
 * engine's: its id, slide attributes and style are what the export, the player and the notes
 * read, so a package may not rewrite them. The package gives only the class list (which kept
 * every class the engine gave; the sanitizer page checked) and the body; the engine's comments
 * and styles go back in after it.
 * The CLASS LIST is the one thing of the tag a package shapes, and only within its own name: it
 * keeps every class it was handed and may add `<name>` or `<name>-…`, nothing else. A later registry
 * pass keys on a section's classes (`video` builds a poster and a QR from the address in a bullet),
 * so a package that added `video` had a pass AFTER the door write an address the door never saw (the
 * red team, on the CLI).
 * @param {string} original  the section the package was handed
 * @param {string} clean     the sanitized output
 * @param {string[]} classes the output section's classes
 * @param {string} pkg       the package's name
 */
export function spliced(original, clean, classes, pkg) {
  const openOrig = /^<section\b[^>]*>/i.exec(original)?.[0];
  // Trimmed first: whitespace around the one section is not content (a template literal's newline
  // around the output crashed the first splice; the checker).
  const out = String(clean).trim();
  const openClean = /^<section\b[^>]*>/i.exec(out)?.[0];
  if (!openOrig || !openClean || !/<\/section>$/i.test(out)) throw new Error('not one <section>');
  const handed = new Set((/\sclass="([^"]*)"/i.exec(openOrig)?.[1] || '').split(/\s+/).filter(Boolean));
  const own = (c) => c === pkg || (typeof pkg === 'string' && c.startsWith(`${pkg}-`));
  const cls = classes.filter((c) => /^[A-Za-z0-9_-]+$/.test(c) && (handed.has(c) || own(c))).join(' ');
  const tag = /\sclass="[^"]*"/i.test(openOrig) ? openOrig.replace(/\sclass="[^"]*"/i, ` class="${cls}"`) : openOrig.replace(/^<section\b/i, `<section class="${cls}"`);
  const body = out.slice(openClean.length).replace(/<\/section>$/i, '');
  return `${tag}${body}${carriedOf(original).join('')}</section>`;
}

// ── The runner: shared by the CLI's locked page (lib/core/code-sandbox.js) and the Studio's
// sandboxed iframe (docs/src/lib/code-packages/). Moved here from code-sandbox.js unchanged.

/** The page's policy: the one script whose hash it names, inline styles, and data: images. */
export function sandboxCsp(scriptHash) {
  return [
    "default-src 'none'",
    `script-src 'sha256-${scriptHash}'`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "media-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    // The package runs in a Worker made from a blob: URL (FRAME_BOOTSTRAP), and nothing else may
    // start one. A worker made that way inherits this whole policy, so it has no network either.
    'worker-src blob:',
    "object-src 'none'",
    "manifest-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

// Script text inlined into an HTML document is parsed as HTML first. `</script` ends the element,
// and `<!--` followed by `<script` puts the parser in its escaped state and swallows the real
// closing tag, so the script text no longer matches its hash and the transform silently never runs
// (found by the checker). A `<` before any of the three is written `\x3C`, which every JavaScript
// string, template and regular expression reads as `<`; esbuild's minified output never has one
// outside those.
export const inlineScript = (code) => String(code).replace(/<(?=\/script|script|!--)/gi, '\\x3C');
/** How a package's bundle ends, as the export writes it (lib/packages/code-bundle.js, esbuild's ESM form). */
export const PACKAGE_TAIL = /export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}\s*;?\s*$/;
// Matched against the last few hundred characters only. On the whole text the pattern backtracks
// quadratically from every earlier `export` (160,000 spaces after a tail: 30 s on the host, before
// any size check or timer; found by the red team).
const TAIL_WINDOW = 256;

/** The longest output the page hands back, checked in the page before it crosses to the host. */
export const MAX_OUTPUT_CHARS = 4_000_000;

/**
 * The WORKER a code package runs in: the bundle, and a message handler that calls its default
 * export with the slide and a frozen kit holding `measure` and nothing else (contract note §8).
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
export const WORKER_NETWORK = Object.freeze(['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport', 'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'Request', 'caches', 'indexedDB']);

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
    `for(const n of ${JSON.stringify(WORKER_NETWORK)}){try{Object.defineProperty(self,n,{value:undefined,writable:false,configurable:false})}catch(e){}}` +
    // The bundle gets a function scope of its own, so its minified names never meet the handler's.
    `const __transform=(()=>{${text.slice(0, offset + m.index)}\n;return ${m[1]}})();` +
    'let ctx=null;' +
    'const kit=Object.freeze({measure(text,font){ctx??=new OffscreenCanvas(1,1).getContext("2d");ctx.font=String(font??"");return ctx.measureText(String(text??"")).width}});' +
    'self.onmessage=(e)=>{const{id,slide:s}=e.data||{};let reply;try{if(!s||!Number.isInteger(s.index)||s.index<0)throw new RangeError("the slide index must be a whole number, 0 or more");' +
    'const slide=Object.freeze({html:String(s.html),index:s.index,idPrefix:typeof s.idPrefix==="string"?s.idPrefix:"",baseUrl:typeof s.baseUrl==="string"?s.baseUrl:""});' +
    'reply={id,out:__transform(slide,kit)}}catch(err){reply={id,error:String(err&&err.message||err)}}' +
    'try{postMessage(reply)}catch(err){postMessage({id,error:"the transform returned something that cannot be sent back: "+String(err&&err.message||err)})}};' +
    'postMessage({ready:true});'
  );
}

/**
 * The frame's ONE script, the same bytes in both doors, allowed by its hash (sandboxCsp). It runs
 * nothing of the package's: it makes the package's worker from the text it is handed, runs one slide
 * at a time with a deadline (queued, so a slide's clock starts when the worker gets it, not while it
 * waits behind another render's slide; the checker), ends the worker at the deadline, and checks
 * every reply is a string of at most MAX_OUTPUT_CHARS before handing it on. An error the package
 * throws later, from a timer, is its own business: it neither ends the worker nor the package (the
 * first cut let it kill the package for every later slide; the checker). Because only our code runs in this realm, its
 * checks are the wall they look like (in the first runner the bundle shared the realm and could
 * redefine the runner; the red team did). Two ways in:
 *   - the CLI calls `__latticeLoad(text, ms)` and `__latticeRun(slide, ms)` in the frame;
 *   - the Studio posts `{ t: 'load', text, ms }` and `{ t: 'run', id, slide, ms }` from the parent
 *     page and is answered `{ t: 'loaded' | 'result', id, out | error }`.
 */
export const FRAME_BOOTSTRAP = `(()=>{"use strict";
const MAX=${MAX_OUTPUT_CHARS};let w=null,seq=0;const waiting=new Map();
const fail=(why)=>{for(const[,p]of waiting)p.reject(new Error(why));waiting.clear();if(w){w.terminate();w=null}};
const load=(text,ms)=>new Promise((resolve,reject)=>{if(w)return reject(new Error("the package is already loaded"));
const url=URL.createObjectURL(new Blob([String(text)],{type:"text/javascript"}));w=new Worker(url);URL.revokeObjectURL(url);
const t=setTimeout(()=>{fail("the package did not finish loading within "+ms+" ms");reject(new Error("the package did not finish loading within "+ms+" ms"))},ms);
w.onerror=(e)=>{e.preventDefault();clearTimeout(t);const why="the package failed to load: "+String(e.message||"an error");fail(why);reject(new Error(why))};
w.onmessage=(e)=>{const d=e.data;if(d&&d.ready===true&&!waiting.size){clearTimeout(t);w.onmessage=answer;w.onerror=(er)=>er.preventDefault();return resolve(true)}}});
const answer=(e)=>{const d=e.data||{};const p=waiting.get(d.id);if(!p)return;waiting.delete(d.id);clearTimeout(p.timer);
if(typeof d.error==="string")return p.reject(new Error(d.error));const out=d.out;
if(typeof out!=="string")return p.reject(new TypeError("the transform returned "+(out===null?"null":typeof out)+", not a string"));
if(out.length>MAX)return p.reject(new RangeError("the transform returned "+out.length+" characters, past the "+MAX+"-character limit"));p.resolve(out)};
const one=(slide,ms)=>new Promise((resolve,reject)=>{if(!w)return reject(new Error("the package is not loaded"));const id=++seq;
const timer=setTimeout(()=>{waiting.delete(id);reject(new Error("the transform did not finish within "+ms+" ms"));fail("the package was stopped")},ms);
waiting.set(id,{resolve,reject,timer});w.postMessage({id,slide})});
let queue=Promise.resolve();const run=(slide,ms)=>{const p=queue.then(()=>one(slide,ms));queue=p.catch(()=>{});return p};
Object.defineProperty(window,"__latticeLoad",{value:load});Object.defineProperty(window,"__latticeRun",{value:run});
window.addEventListener("message",(e)=>{if(e.source!==parent)return;const m=e.data||{};const reply=(r)=>parent.postMessage(r,"*");
if(m.t==="load")load(m.text,m.ms).then(()=>reply({t:"loaded"}),(err)=>reply({t:"loaded",error:String(err.message)}));
else if(m.t==="run")run(m.slide,m.ms).then((out)=>reply({t:"result",id:m.id,out}),(err)=>reply({t:"result",id:m.id,error:String(err.message)}))});
parent.postMessage({t:"ready"},"*")})();`;

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
 *     only shape the runner accepts (lib/packages/code-door-core.mjs workerScript);
 *   - it fits in the locked page.
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
