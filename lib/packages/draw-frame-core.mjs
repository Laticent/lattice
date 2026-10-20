/**
 * THE DRAW FRAME'S KERNEL: what a sandboxed frame needs to draw Mermaid or function-plot for a preview, and what the host
 * checks of what comes back (owner decision D1 A, 2026-10-20; engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md).
 *
 * WHY A SECOND FRAME. The code door's pool runs a package in a WORKER, which has no screen, so it cannot measure a word or
 * lay out an SVG. Mermaid and function-plot do both. A draw frame is a document of the same sandbox as the pool's
 * (`sandbox="allow-scripts"` with no `allow-same-origin`, so an opaque origin: no storage, no cookies, no reach into the
 * Studio page; the same policy shape as `sandboxCsp`: no network, no frames, no workers) with ONE inline script, named
 * by its hash: the library, then this file's bootstrap.
 *
 * WHAT DIFFERS FROM THE POOL'S FRAME, and why each difference is safe:
 *   - the script is a FIRST-PARTY library, pinned by SHA-256 against its manifest before it is inlined. A frame holds
 *     only that library and the bootstrap, never a deck's text beyond the one drawing it is asked for, so it stays open
 *     for the page's life (opening Mermaid's 3 MB costs about 2 s; the worker pool's per-render rule exists to stop a
 *     THIRD PARTY's package carrying one deck's content into another's, which does not apply here);
 *   - function-plot compiles each expression to a function, so ITS frame (and only its frame) allows `'unsafe-eval'`.
 *     That is measured, not assumed: without it the library throws "Refused to evaluate a string as JavaScript".
 *
 * THE PROTOCOL. Parent to frame: `{ t: 'draw', id, kind, … }`. Frame to parent: `{ t: 'ready' }` once, then one
 * `{ t: 'result', id, out }` or `{ t: 'result', id, error }` per draw. The frame answers only its parent, only for its
 * own kind, and never sends more than MAX_DRAW_CHARS. `checkDrawReply` is the host's side of the same rule.
 *
 * Pure and fs-free: the Studio's host (docs/src/lib/code-packages/draw-host.ts) and a real-browser test both use it.
 */

import { inlineScript } from './code-door-core.mjs';

/** What each frame kind runs: the library's global, and whether its policy allows `'unsafe-eval'`. */
export const DRAW_KINDS = Object.freeze({
  mermaid: Object.freeze({ global: 'mermaid', evalOk: false }),
  'function-plot': Object.freeze({ global: 'functionPlot', evalOk: true }),
});

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
 * The frame's bootstrap for one kind, as script text. `hydrateSource` is function-plot's own `hydrate` function as text
 * (lib/plugins/function-plot/function-plot.hydrate.js: self-contained, which the registry build enforces), so the plot a
 * preview shows is drawn by the same code the CLI and the runtime run (HARD RULE #1).
 * @param {{ kind: 'mermaid' | 'function-plot', hydrateSource?: string }} p
 */
export function drawBootstrap({ kind, hydrateSource }) {
  if (!Object.hasOwn(DRAW_KINDS, kind)) throw new Error(`no draw frame for ${String(kind)}`);
  if (kind === 'function-plot' && !/^\s*(?:async\s+)?function\b/.test(String(hydrateSource || ''))) throw new Error('the function-plot frame needs the hydrate function as text');
  return `(()=>{"use strict";
const KIND=${JSON.stringify(kind)},MAX=${MAX_DRAW_CHARS},PX=${MAX_DRAW_PX};
const box=document.createElement("div");box.style.cssText="position:absolute;left:0;top:0;width:1200px";document.body.appendChild(box);
const hydrate=${kind === 'function-plot' ? `(${String(hydrateSource)})` : 'null'};
const px=(n)=>typeof n==="number"&&Number.isInteger(n)&&n>0&&n<=PX;
const draw=async(m)=>{
box.textContent="";
if(KIND==="mermaid"){
const lib=globalThis.mermaid;
if(!lib||typeof lib.render!=="function")throw new Error("mermaid did not load");
if(typeof m.definition!=="string"||typeof m.svgId!=="string"||!m.config||typeof m.config!=="object")throw new Error("a mermaid draw needs a definition, an id and a config");
lib.initialize(m.config);
const r=await lib.render(m.svgId,m.definition,box);
box.innerHTML=r.svg;
const el=box.querySelector("svg");
if(!el)throw new Error("mermaid resolved without producing an SVG");
return new XMLSerializer().serializeToString(el)}
const lib=globalThis.functionPlot;
if(typeof lib!=="function")throw new Error("function-plot did not load");
if(typeof m.configB64!=="string"||typeof m.configText!=="string"||!px(m.width)||!px(m.height)||!Number.isInteger(m.index)||m.index<0||m.index>999)throw new Error("a function-plot draw needs its config, a size and its place");
const els=[];
for(let i=0;i<=m.index;i++){const d=document.createElement("div");d.setAttribute("data-lattice-hydrate","function-plot");box.appendChild(d);els.push(d)}
const el=els[m.index];
el.setAttribute("data-lattice-config",m.configB64);
el.style.cssText="width:"+m.width+"px;height:"+m.height+"px";
let state="";
hydrate(el,{lib,decodeConfig:()=>m.configText,settle:(n,s)=>{state=s},token:(n,k)=>getComputedStyle(n).getPropertyValue(k).trim()});
if(state==="error")throw new Error(el.textContent||"function-plot failed");
return el.innerHTML};
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
catch(err){say({t:"result",id:m.id,error:String(err&&err.message?err.message:err).split("\\n")[0].slice(0,300)})}});
say({t:"ready"})})();`;
}

/**
 * The frame's one script: the library, a `;`, then the bootstrap, written so the HTML parser cannot end it early
 * (`inlineScript`). Hash THIS text, and put exactly this text in the document.
 * @param {{ kind: 'mermaid' | 'function-plot', library: string, hydrateSource?: string }} p
 */
export function drawFrameScript({ kind, library, hydrateSource }) {
  return inlineScript(`${String(library)}\n;${drawBootstrap({ kind, hydrateSource })}`);
}

/** The frame's document: the policy, and the script it allows by hash. `hash` is the base64 SHA-256 of `script`. */
export function drawFrameDocument({ kind, script, hash }) {
  if (!Object.hasOwn(DRAW_KINDS, kind)) throw new Error(`no draw frame for ${String(kind)}`);
  if (!/^[A-Za-z0-9+/]{43}=$/.test(hash)) throw new Error('the hash is not a base64 SHA-256');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${drawFrameCsp(hash, { evalOk: DRAW_KINDS[kind].evalOk })}"></head><body><script>${script}</script></body></html>`;
}

/**
 * The host's check of one message from a frame. Returns `{ out }`, `{ error }`, `{ ready: true }` or `{ ignore: true }`
 * for anything that is not a well-formed reply (a stray message is never an answer).
 * @returns {{ ready: true } | { id: number, out: string } | { id: number, error: string } | { ignore: true }}
 */
export function checkDrawReply(data) {
  if (!data || typeof data !== 'object') return { ignore: true };
  if (data.t === 'ready') return { ready: true };
  if (data.t !== 'result' || typeof data.id !== 'number') return { ignore: true };
  if (typeof data.error === 'string') return { id: data.id, error: data.error.slice(0, 300) };
  if (typeof data.out !== 'string') return { id: data.id, error: `the frame returned ${data.out === null ? 'null' : typeof data.out}, not text` };
  if (data.out.length > MAX_DRAW_CHARS) return { id: data.id, error: `the frame returned ${data.out.length} characters, past the ${MAX_DRAW_CHARS} limit` };
  return { id: data.id, out: data.out };
}
