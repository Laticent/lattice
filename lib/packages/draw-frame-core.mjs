/**
 * THE DRAW FRAME'S KERNEL: what a sandboxed frame needs to draw a first-party plugin's figures for a preview, and what the host
 * checks of what comes back. It names no plugin: a plugin declares a `draw` section in its manifest and ships the function that draws inside
 * the frame (`<name>.draw-frame.js`), and the registry build hands this kernel each kind's `meta` (lib/plugins/draw-frame-libraries.generated.mjs) (owner decision D1 A, 2026-10-20; engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md).
 *
 * WHY A SECOND FRAME. The code door's pool runs a package in a WORKER, which has no screen, so it cannot measure a word or
 * lay out an SVG. Mermaid and function-plot (the plugins this serves today) do both. A draw frame is a document of the same sandbox as the pool's
 * (`sandbox="allow-scripts"` with no `allow-same-origin`, so an opaque origin: no storage, no cookies, no reach into the
 * Studio page; the same policy shape as `sandboxCsp`: no network, no frames, no workers) with ONE inline script, named
 * by its hash: the library, then this file's bootstrap.
 *
 * TWO WAYS TO GET A LIBRARY INTO A FRAME. A small library (function-plot, 199 KB) is INLINED: one hashed script, the library then the
 * bootstrap. A big one (Mermaid, 3.1 MB) is LOADED as a module graph: inlining it made the page's HTML parser tokenize 3 MB (591 ms of
 * main-thread time, measured in a trace) and evaluate the whole bundle at once (a 350 to 500 ms task), where Mermaid's own ESM build
 * evaluates a 28 KB core and the chunks a diagram type needs, as it needs them. The frame is still a `srcdoc` and still opaque; its
 * policy names the exact directory the modules come from (not `'self'`, which is the whole site), and an import map's `integrity`
 * carries the SHA-256 of every file, which a browser that supports it enforces on each module it loads
 * (`drawFrameEsmScripts`, `drawFrameEsmDocument`). The vendored tree is also pinned at build time (lib/plugins/payload-path.js `treeSha`).
 *
 * WHAT DIFFERS FROM THE POOL'S FRAME, and why each difference is safe:
 *   - the script is a FIRST-PARTY library, pinned by SHA-256 against its manifest before it is inlined. A frame holds
 *     only that library and the bootstrap, never a deck's text beyond the one drawing it is asked for, so it stays open
 *     for the page's life (opening Mermaid's 3 MB costs about 2 s; the worker pool's per-render rule exists to stop a
 *     THIRD PARTY's package carrying one deck's content into another's, which does not apply here);
 *   - a library that compiles expressions to functions (function-plot) declares `draw.frame.unsafeEval`, and ITS frame (and only the frames
 *     of plugins that declare it) allows `'unsafe-eval'`. That is measured, not assumed: without it function-plot throws "Refused to evaluate
 *     a string as JavaScript". It is the one policy bit a plugin may widen; the manifest schema names it and nothing else.
 *
 * THE PROTOCOL. Parent to frame: `{ t: 'draw', id, kind, … }`. Frame to parent: `{ t: 'ready' }` once, then one
 * `{ t: 'result', id, out }` or `{ t: 'result', id, error }` per draw. The frame answers only its parent, only for its
 * own kind, and never sends more than MAX_DRAW_CHARS. `checkDrawReply` is the host's side of the same rule.
 *
 * Pure and fs-free: the Studio's host (docs/src/lib/code-packages/draw-host.ts) and a real-browser test both use it.
 */

import { inlineScript } from './code-door-core.mjs';

/**
 * What a frame for one kind needs, as the registry build writes it (lib/plugins/draw-frame-libraries.generated.mjs, from the plugin's
 * manifest `draw` section and its `<name>.draw-frame.js`): `global` (the library's window global), `unsafeEval` (the policy bit),
 * `adapter` (the text of the function that draws inside the frame) and, when the manifest says so, `hydrateSource` (the plugin's own
 * hydrate function as text). This kernel names no plugin: a kind is whatever `meta` describes.
 * @typedef {{ global: string, unsafeEval?: boolean, adapter: string, hydrateSource?: string, esm?: { dir: string, entry: string, integrity: Record<string, string>, preload: string[] } }} DrawMeta
 */

const KIND_NAME = /^[a-z][a-z0-9-]*$/;
const GLOBAL_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const FUNCTION_TEXT = /^\s*(?:async\s+)?function\b/;

/** Is this a kind and a `meta` a frame can be built from? Throws, naming the first thing wrong. */
function checkMeta(kind, meta) {
  if (!KIND_NAME.test(String(kind))) throw new Error(`no draw frame for ${String(kind)}`);
  if (!meta || typeof meta !== 'object') throw new Error(`no draw frame for ${String(kind)}`);
  if (!GLOBAL_NAME.test(String(meta.global))) throw new Error(`the ${kind} frame's library global is not a plain name`);
  if (!FUNCTION_TEXT.test(String(meta.adapter || ''))) throw new Error(`the ${kind} frame needs its draw function as text`);
  if (meta.hydrateSource !== undefined && !FUNCTION_TEXT.test(String(meta.hydrateSource))) throw new Error(`the ${kind} frame's hydrate function is not function text`);
}

/** The most characters one drawing may come back as: checked in the frame before it crosses, and again by the host. */
export const MAX_DRAW_CHARS = 8_000_000;
/** The most a drawing's width or height may be, in pixels. */
export const MAX_DRAW_PX = 8000;

/**
 * The frame's policy: `sandboxCsp` (lib/packages/code-door-core.mjs) with no `worker-src` (a draw frame makes none)
 * and `'unsafe-eval'` for the one kind that needs it. The script is allowed by hash alone.
 */
export function drawFrameCsp(scriptHash, { evalOk = false } = {}) {
  return [
    "default-src 'none'",
    `script-src 'sha256-${scriptHash}'${evalOk ? " 'unsafe-eval'" : ''}`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "media-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "manifest-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/**
 * The frame's bootstrap for one kind, as script text: the protocol, the limits and the helpers every kind shares (`env`), around the
 * plugin's own draw function (`meta.adapter`). The kernel validates a message and the size of an answer; the adapter validates its own
 * job and draws.
 * `env`, what the adapter receives with the job: `lib` (the library's global), `box` (a laid-out container, emptied before each job),
 * `faces(list)` (loads font faces, so text is measured in the deck's fonts), `px(n)` (is `n` a size a job may ask for), `PX` (the largest),
 * `token(node, name)` (a CSS value) and `hydrate` (the plugin's hydrate function, when its manifest asks for it).
 * @param {{ kind: string, meta: DrawMeta }} p
 */
export function drawBootstrap({ kind, meta }) {
  checkMeta(kind, meta);
  return `(()=>{"use strict";
const KIND=${inlineJson(kind)},GLOBAL=${inlineJson(meta.global)},MAX=${MAX_DRAW_CHARS},PX=${MAX_DRAW_PX};
const adapter=(${String(meta.adapter)});
const hydrate=${meta.hydrateSource === undefined ? 'null' : `(${String(meta.hydrateSource)})`};
const box=document.createElement("div");box.style.cssText="position:absolute;left:0;top:0;width:1200px";document.body.appendChild(box);
const px=(n)=>typeof n==="number"&&Number.isInteger(n)&&n>0&&n<=PX;
const token=(n,k)=>getComputedStyle(n).getPropertyValue(k).trim();
const seen=new Set();
const faces=async(list)=>{
if(!Array.isArray(list)||list.length>64)throw new Error("fonts must be a short list");
const todo=[];
for(const f of list){
const src=typeof f.data==="string"?f.data:f.url;
if(!f||typeof f.family!=="string"||!/^[A-Za-z0-9 _-]{1,64}$/.test(f.family)||!/^[1-9]00$/.test(String(f.weight))||(f.style!=="normal"&&f.style!=="italic")||typeof src!=="string"||!(/^data:font\\/(?:woff2|woff|ttf|otf);base64,[A-Za-z0-9+\\/=]+$/.test(src)||/^https?:\\/\\/[A-Za-z0-9.:[\\]-]+\\/[A-Za-z0-9._~%!$&*+,;=:@\\/-]{1,1000}\\.woff2?$/.test(src)))throw new Error("a font is not a well-formed face");
const key=f.family+"|"+f.weight+"|"+f.style+"|"+src;
if(seen.has(key))continue;seen.add(key);
const st=document.createElement("style");
st.textContent='@font-face{font-family:"'+f.family+'";font-weight:'+f.weight+';font-style:'+f.style+';src:url("'+src+'")}';
document.head.appendChild(st);
todo.push(document.fonts.load(f.style+" "+f.weight+' 16px "'+f.family+'"').catch(()=>{seen.delete(key)}))}
await Promise.all(todo)};
const draw=async(m)=>{
box.textContent="";
return adapter(m,{lib:globalThis[GLOBAL],box,faces,px,PX,token,hydrate})};
const say=(x)=>parent.postMessage(x,"*");
addEventListener("message",async(e)=>{
if(e.source!==parent)return;
const m=e.data;
if(!m||m.t!=="draw"||typeof m.id!=="number"||m.kind!==KIND)return;
try{
const out=await draw(m);
if(typeof out!=="string")throw new TypeError("the drawing is not text");
if(out.length>MAX)throw new RangeError("the drawing is "+out.length+" characters, past the "+MAX+" limit");
say({t:"result",id:m.id,out})}
catch(err){const msg=String(err&&err.message?err.message:err);say({t:"result",id:m.id,error:msg.split("\\n").slice(0,6).join("\\n").slice(0,600),...(err instanceof TypeError&&/^(?:Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed)/.test(msg)?{loadFailed:true}:{})})}});
say({t:"ready"})})();`;
}

/**
 * The frame's one script: the library, a `;`, then the bootstrap, written so the HTML parser cannot end it early
 * (`inlineScript`). Hash THIS text, and put exactly this text in the document.
 * @param {{ kind: string, library: string, meta: DrawMeta }} p
 */
export function drawFrameScript({ kind, library, meta }) {
  return inlineScript(`${String(library)}\n;${drawBootstrap({ kind, meta })}`);
}

/** The frame's document: the policy, and the script it allows by hash. `hash` is the base64 SHA-256 of `script`. */
export function drawFrameDocument({ kind, script, hash, meta }) {
  checkMeta(kind, meta);
  if (!/^[A-Za-z0-9+/]{43}=$/.test(hash)) throw new Error('the hash is not a base64 SHA-256');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${drawFrameCsp(hash, { evalOk: meta.unsafeEval === true })}"></head><body><script>${script}</script></body></html>`;
}

/** A JSON value safe to write inside an inline `<script>`: `<`, `>`, `&` and the two line separators leave as escapes, so no value can end the element or the line. */
const inlineJson = (value) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

const ESM_BASE_SHAPE = /^https?:\/\/[A-Za-z0-9.:[\]-]+(?:\/[A-Za-z0-9._~%!$&()*+,;=:@-]+)*\/$/;
const ESM_PATH_SHAPE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
// A `.` or `..` segment would walk out of the directory the policy names.
const noDots = (text) => !String(text).split('/').some((seg) => seg === '.' || seg === '..');
const ESM_BASE = { test: (v) => ESM_BASE_SHAPE.test(String(v)) && noDots(v) };
const ESM_PATH = { test: (v) => ESM_PATH_SHAPE.test(String(v)) && noDots(v) };
const ESM_INTEGRITY = /^sha256-[A-Za-z0-9+/]{43}=$/;

function checkEsm(kind, meta, base) {
  checkMeta(kind, meta);
  if (!meta.esm) throw new Error(`the ${String(kind)} frame does not load modules`);
  const { entry, integrity } = meta.esm;
  if (!ESM_BASE.test(String(base))) throw new Error('the module directory is not an http(s) URL ending in a slash');
  if (!ESM_PATH.test(String(entry))) throw new Error('the module entry is not a plain relative path');
  const map = integrity && typeof integrity === 'object' ? integrity : {};
  if (!Object.hasOwn(map, entry)) throw new Error('the module entry has no integrity');
  for (const [file, digest] of Object.entries(map)) {
    if (!ESM_PATH.test(file) || !ESM_INTEGRITY.test(String(digest))) throw new Error(`the integrity of ${file} is not a sha256 of a plain relative path`);
  }
  return map;
}

/**
 * The two inline scripts of a module-loaded frame, as text (hash each, and put exactly this text in the document):
 * the BOOT module, which imports the library's entry by its absolute URL, puts it where the bootstrap looks (`globalThis.<global>`) and
 * runs the bootstrap; and the IMPORT MAP, whose `integrity` holds the SHA-256 of every module the graph can load.
 * @param {{ kind: string, meta: DrawMeta, base: string }} p
 *   `base`: the absolute directory the modules are served from, ending in `/`; the entry and the per-file integrity
 *   (path under `base` to `sha256-<base64>`, for every file) come from `meta.esm`.
 */
export function drawFrameEsmScripts({ kind, meta, base }) {
  const map = checkEsm(kind, meta, base);
  const entry = meta.esm.entry;
  const abs = Object.fromEntries(Object.entries(map).map(([file, digest]) => [`${base}${file}`, digest]));
  return {
    // A dynamic import, so a library that cannot load (offline, a stale deploy, a blocked fetch) tells the host at once; a static one would leave the
    // host waiting out its whole open timeout.
    boot: inlineScript(`import(${inlineJson(`${base}${entry}`)}).then((m)=>{globalThis.${meta.global}=m.default;\n${drawBootstrap({ kind, meta })}},()=>{parent.postMessage({t:"failed"},"*")});`),
    importMap: inlineJson({ integrity: abs }),
  };
}

/**
 * The policy of a module-loaded frame: `drawFrameCsp`'s, with the scripts allowed by the hash of the two inline ones and by the
 * ONE directory the modules come from, and the fonts by the directories the host names (`fontBases`: the engine's own font folders, so the
 * frame measures text in the deck's faces without the host fetching and re-encoding them). No `'unsafe-eval'`: a library that needs it runs inline, where the policy bit is one the plugin declares.
 * @param {{ bootHash: string, mapHash: string, base: string, fontBases?: string[] }} p
 */
export function drawFrameEsmCsp({ bootHash, mapHash, base, fontBases = [] }) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(String(bootHash)) || !/^[A-Za-z0-9+/]{43}=$/.test(String(mapHash))) throw new Error('a hash is not a base64 SHA-256');
  if (!ESM_BASE.test(String(base))) throw new Error('the module directory is not an http(s) URL ending in a slash');
  for (const dir of fontBases) if (!ESM_BASE.test(String(dir))) throw new Error('a font directory is not an http(s) URL ending in a slash');
  return drawFrameCsp(bootHash, { evalOk: false })
    .replace(`script-src 'sha256-${bootHash}'`, `script-src 'sha256-${bootHash}' 'sha256-${mapHash}' ${base}`)
    .replace('font-src data:', ['font-src data:', ...fontBases].join(' '));
}

/**
 * A module-loaded frame's document. `preload` names files under `base` (each with an integrity) to fetch at once, so the chunks a
 * first drawing needs are already in flight when the entry asks for them.
 * @param {{ kind: string, meta: DrawMeta, base: string, boot: string, importMap: string, bootHash: string, mapHash: string, fontBases?: string[] }} p
 */
export function drawFrameEsmDocument({ kind, meta, base, boot, importMap, bootHash, mapHash, fontBases = [] }) {
  const map = checkEsm(kind, meta, base);
  const links = (meta.esm.preload || [])
    .filter((file) => Object.hasOwn(map, file))
    .map((file) => `<link rel="modulepreload" href="${base}${file}" integrity="${map[file]}">`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${drawFrameEsmCsp({ bootHash, mapHash, base, fontBases })}"><script type="importmap">${importMap}</script>${links}</head><body><script type="module">${boot}</script></body></html>`;
}

/**
 * The host's check of one message from a frame. Returns `{ out }`, `{ error }`, `{ ready: true }` or `{ ignore: true }`
 * for anything that is not a well-formed reply (a stray message is never an answer).
 * @returns {{ ready: true } | { id: number, out: string } | { id: number, error: string } | { ignore: true }}
 */
export function checkDrawReply(data) {
  if (!data || typeof data !== 'object') return { ignore: true };
  if (data.t === 'ready') return { ready: true };
  if (data.t === 'failed') return { failed: true };
  if (data.t !== 'result' || typeof data.id !== 'number') return { ignore: true };
  if (typeof data.error === 'string') return { id: data.id, error: data.error.slice(0, 600), ...(data.loadFailed === true ? { loadFailed: true } : {}) };
  if (typeof data.out !== 'string') return { id: data.id, error: `the frame returned ${data.out === null ? 'null' : typeof data.out}, not text` };
  if (data.out.length > MAX_DRAW_CHARS) return { id: data.id, error: `the frame returned ${data.out.length} characters, past the ${MAX_DRAW_CHARS} limit` };
  return { id: data.id, out: data.out };
}
