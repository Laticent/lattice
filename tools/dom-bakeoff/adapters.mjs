/**
 * dom-bakeoff adapters — one shim per candidate HTML parser, all speaking the
 * contract `lib/core/dom-provider.js` already defines: `parse(html)` returns
 * `{ doc, root, window }`, and `root.innerHTML` gives the content back.
 *
 * Only `jsdom` is a repo dependency. Every other candidate is loaded lazily and
 * reports itself missing rather than throwing, so the harness runs out of the box
 * and gets richer when you install the competition:
 *
 *     npm i --no-save happy-dom linkedom domino basichtml \
 *         node-html-parser cheerio htmlparser2 domhandler jsdom30@npm:jsdom@30
 *
 * They are deliberately NOT dependencies. Nothing ships against them, and a
 * devDependency implies a support commitment the bake-off's own verdict refuses.
 */
import { readFileSync } from 'node:fs';

/** dom-provider's wrap: parse a WHOLE document, read back `body`. Fragment parsing
 *  is where parsers quietly disagree, and the skeleton removes the disagreement. */
const DOC_OPEN = '<!DOCTYPE html><html><head></head><body>';
const DOC_CLOSE = '</body></html>';
export const wrap = (html) => DOC_OPEN + html + DOC_CLOSE;

const version = (name) => {
  for (const base of [new URL('../../node_modules/', import.meta.url), new URL('./node_modules/', import.meta.url)]) {
    try { return JSON.parse(readFileSync(new URL(`${name}/package.json`, base), 'utf8')).version; } catch { /* next */ }
  }
  return 'unknown';
};

/** Build one adapter, or `null` when the library is not installed here. */
async function tryLoad(name, kind, build) {
  try { return { name, kind, version: version(name), ...(await build()) }; }
  catch { return null; }
}

export async function loadAdapters() {
  const out = {};
  const add = (a) => { if (a) out[a.name] = a; };

  add(await tryLoad('jsdom', 'full-dom', async () => {
    const { JSDOM } = await import('jsdom');
    return { parse(html) { const w = new JSDOM(wrap(html)).window; return { doc: w.document, root: w.document.body, window: w }; } };
  }));

  add(await tryLoad('happy-dom', 'full-dom', async () => {
    const { Window } = await import('happy-dom');
    return { parse(html) { const w = new Window(); w.document.write(wrap(html)); return { doc: w.document, root: w.document.body, window: w }; } };
  }));

  add(await tryLoad('linkedom', 'full-dom', async () => {
    const { parseHTML } = await import('linkedom');
    return { parse(html) { const w = parseHTML(wrap(html)); return { doc: w.document, root: w.document.body, window: w }; } };
  }));

  // A SECOND jsdom major, because the incumbent's own version is a candidate: the
  // repo pins ^29.1.1 and 30.x is out. Installed under an alias so both can load.
  add(await tryLoad('jsdom30', 'full-dom', async () => {
    const { JSDOM } = await import('jsdom30');
    return { parse(html) { const w = new JSDOM(wrap(html)).window; return { doc: w.document, root: w.document.body, window: w }; } };
  }));

  // domino — Mozilla's dom.js, the DOM behind Angular's server-side rendering.
  // The most serious omission from the first field: a real, maintained, mutable
  // DOM that is not a browser emulator, so it carries none of the window plumbing.
  add(await tryLoad('domino', 'full-dom', async () => {
    const mod = await import('domino');
    const domino = mod.default ?? mod;
    return { parse(html) {
      // createWindow, not createDocument: DOMPurify needs a window to host on, and
      // grading domino without one would have scored our own adapter, not the library.
      const w = domino.createWindow(wrap(html));
      return { doc: w.document, root: w.document.body, window: w };
    } };
  }));

  // basichtml — the linkedom author's earlier DOM. Deprecated upstream in favor of
  // linkedom, and last published 2022; measured to show whether it inherited the
  // SVG-casing defect rather than to propose it.
  add(await tryLoad('basichtml', 'full-dom', async () => {
    const mod = await import('basichtml');
    const basichtml = mod.default ?? mod;
    return { parse(html) {
      const { document } = basichtml.init({});
      document.documentElement.innerHTML = wrap(html);
      return { doc: document, root: document.body, window: null };
    } };
  }));

  // htmlparser2 + domhandler — the fastest pure-JS parser in wide use. No selector
  // engine and no DOM API; it produces its own node tree.
  add(await tryLoad('htmlparser2', 'parse-only', async () => {
    const { parseDocument } = await import('htmlparser2');
    const { default: render } = await import('dom-serializer');
    return { parse(html) {
      const doc = parseDocument(wrap(html));
      const find = (n, tag) => {
        if (n.name === tag) return n;
        for (const c of n.children || []) { const r = find(c, tag); if (r) return r; }
        return null;
      };
      const bodyNode = find(doc, 'body');
      const root = {
        get innerHTML() { return bodyNode ? render(bodyNode.children, { encodeEntities: false }) : ''; },
        querySelector: () => { throw new Error('htmlparser2 ships no selector engine'); },
        querySelectorAll: () => { throw new Error('htmlparser2 ships no selector engine'); },
      };
      return { doc, root, window: null };
    } };
  }));

  add(await tryLoad('node-html-parser', 'parse-only', async () => {
    const { parse } = await import('node-html-parser');
    return { parse(html) { const doc = parse(wrap(html)); return { doc, root: doc.querySelector('body'), window: null }; } };
  }));

  add(await tryLoad('cheerio', 'parse-only', async () => {
    const cheerio = await import('cheerio');
    return { parse(html) {
      const $ = cheerio.load(wrap(html));
      const body = $('body');
      const root = {
        get innerHTML() { return body.html(); },
        querySelector: (s) => { const r = $(s); return r.length ? r[0] : null; },
        querySelectorAll: (s) => $(s).toArray(),
      };
      return { doc: $, root, window: null };
    } };
  }));

  add(await tryLoad('parse5', 'parse-only', async () => {
    const parse5 = await import('parse5');
    const find = (n, tag) => { if (n.tagName === tag) return n; for (const c of n.childNodes || []) { const r = find(c, tag); if (r) return r; } return null; };
    return { parse(html) {
      const doc = parse5.parse(wrap(html));
      const bodyNode = find(doc, 'body');
      const root = {
        get innerHTML() { return parse5.serialize(bodyNode); },
        querySelector: () => { throw new Error('parse5 ships no selector engine'); },
        querySelectorAll: () => { throw new Error('parse5 ships no selector engine'); },
      };
      return { doc, root, window: null };
    } };
  }));

  return out;
}

/** Release a parsed window. jsdom's does not fully free, which is why the speed
 *  driver isolates each measurement in its own process. */
export const closeWindow = (w) => {
  try { w?.close?.(); } catch { /* not closeable */ }
  try { w?.happyDOM?.close?.(); } catch { /* not happy-dom */ }
};
