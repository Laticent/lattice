/**
 * The FENCE half of the code door's shared kernel (plugin-system §9 decisions 3 and 10, phase E).
 *
 * The door in code-door-core.mjs gives a code package a whole SLIDE. A zip plugin's code owns
 * something smaller: one FENCE, written ```` ```name ```` in a deck. A fence renderer is
 * `render({ body, id }) → html`, run in the same sandbox as a slide package and held to the same
 * walls (workerScript, consent pinned to the code's hash, the slide sanitizer on the way back).
 *
 * WHERE A FENCE IS FOUND. The engine needs no hook for it. A fence whose language no plugin
 * installed renders as the code block every fence does, `<pre><code class="language-name">`, so
 * the door reads those blocks out of the engine's finished HTML, the way `claimedSlides` reads
 * slides, and puts the plugin's result where the block was. `scanTags` (the repo's one tokenizer)
 * walks the HTML, so a block quoted inside a comment or `<style>` is not a fence, and the walk is
 * linear in the deck.
 *
 *   claimedFences   the fences a deck holds in the plugins' names, with their text and an id
 *   fenceInput      what a renderer is handed for one fence: `{ body, id }`, nothing else
 *   fenceKey        one fence's identity across the two renders
 *   fenceMarkup     a plugin's sanitized output in its root element
 *   withFenceNote   the engine's code block, kept, with a visible note saying why the plugin did not draw it
 *
 * Pure string work, no DOM and no Node built-ins, like the rest of the kernel.
 */

import { splitSections } from '../core/split-sections.mjs';
import { scanTags } from '../core/top-level-h2.mjs';
import { claimedSlides, NOTE_CHARS, printableLine } from './code-door-core.mjs';

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The root element's attribute: the scope a plugin's CSS is rewritten under (plugin-system §9 decision 12). */
export const PLUGIN_ROOT_ATTR = 'data-lattice-plugin';

/** The longest fence body a renderer is handed. A fence is authored text; a megabyte of it is not. */
export const MAX_FENCE_CHARS = 200_000;

/**
 * The text of a code block as the author wrote it. markdown-it's code renderer escapes four
 * characters and nothing else, so those four are what come back; `&amp;` goes last so `&amp;lt;`
 * reads as the author's `&lt;`.
 */
export function decodeFenceBody(text) {
  return String(text).replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

/** `class="a b"` out of one open tag's text, as a list of tokens. markdown-it writes the attribute double-quoted. */
function classTokens(tagText) {
  const m = /\sclass\s*=\s*"([^"]*)"/i.exec(tagText);
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

/**
 * Every `<pre><code class="language-NAME">text</code></pre>` in `html` whose NAME is in `names`,
 * in document order, as `{ name, start, end, body }` (offsets into `html`, `end` one past `</pre>`).
 *
 * A block is a fence only when it is exactly that shape: `<code>` directly inside `<pre>`, plain
 * text inside (a highlighter's `<span>` means some grammar already drew it, so it is left alone),
 * and `</pre>` directly after `</code>`. A `<pre>` the host marked `data-lattice-off` is a fence of
 * a plugin the deck did not load: it stays the code block it is.
 * @param {string} html
 * @param {Iterable<string>} names  the fence names the door runs (a plugin's fence, which need not be its name)
 */
export function fenceBlocks(html, names) {
  const want = new Set(names);
  if (!want.size) return [];
  const out = [];
  // 0 outside; 1 after a `<pre>`; 2 after its `<code>`; 3 after the `</code>`.
  let state = 0;
  let pre = null;
  let code = null;
  for (const t of scanTags(html)) {
    if (t.kind !== 'tag') {
      // A comment or RAWTEXT span inside the block means it is not the plain shape.
      state = 0;
      continue;
    }
    if (state === 0 || (t.name === 'pre' && !t.isClose)) {
      if (t.name === 'pre' && !t.isClose && !t.selfClose) {
        const text = html.slice(t.start, t.end);
        state = /\sdata-lattice-off\b/i.test(text) ? 0 : 1;
        pre = t;
      } else state = 0;
      continue;
    }
    if (state === 1) {
      if (t.name === 'code' && !t.isClose && t.start === pre.end) {
        const hit = classTokens(html.slice(t.start, t.end)).map((c) => (c.startsWith('language-') ? c.slice(9) : null)).find((n) => n && want.has(n));
        if (hit) {
          code = { tag: t, name: hit };
          state = 2;
          continue;
        }
      }
      state = 0;
    } else if (state === 2) {
      // The very next tag must close the code, so no tag sits in the text.
      if (t.name === 'code' && t.isClose) {
        code.closeStart = t.start;
        code.closeEnd = t.end;
        state = 3;
      } else state = 0;
    } else if (state === 3) {
      if (t.name === 'pre' && t.isClose && t.start === code.closeEnd) {
        out.push({ name: code.name, start: pre.start, end: t.end, body: decodeFenceBody(html.slice(code.tag.end, code.closeStart)) });
      }
      state = 0;
    }
  }
  return out;
}

/**
 * An id the renderer may put on an element: the plugin's name, then the render prefix, slide and
 * fence number, only `[A-Za-z0-9_-]`. It starts with the plugin's name because the sanitizer keeps
 * an id only in the package's own namespace (door-attr.mjs `doorFilterAttr`): an id is a target
 * that `url(#id)` and `href="#id"` anywhere in the deck resolve to, so a plugin's ids are its own.
 */
export function fenceId(pkg, idPrefix, slide, n) {
  return `${pkg}-${String(idPrefix ?? '').replace(/[^A-Za-z0-9_-]/g, '_')}s${slide}f${n}`;
}

/**
 * The fences the plugins in `names` own in the engine's finished deck render.
 *
 * `fences` maps each fence name the door runs to the plugin that owns it. `skip` is a set of
 * `splitSections` part indices to leave alone: the slides a code package
 * claims whole, which the package redraws, so a fence inside one is not run. A fence longer than
 * MAX_FENCE_CHARS is reported in `tooLong`, not claimed.
 * @param {string} html
 * @param {{ fences: Map<string, string>, slideIndex: (n: number) => number, idPrefix?: string, skip?: Set<number> }} opts
 *   `slideIndex` maps a section's position in this html to its deck position (the registry hook's own)
 * @returns {{ claims: Array<{ i: number, pkg: string, fence: string, slide: number, n: number, id: string, body: string, start: number, end: number, block: string }>, tooLong: Array<{ pkg: string, slide: number }> }}
 *   offsets are into the section part's text (`openTag + inner + close`), `i` its `splitSections` index
 */
export function claimedFences(html, { fences, slideIndex, idPrefix = '', skip = new Set() }) {
  const claims = [];
  const tooLong = [];
  let position = 0;
  splitSections(html).forEach((part, i) => {
    if (part.type !== 'section') return;
    const slide = slideIndex(position++);
    if (skip.has(i)) return;
    const text = part.openTag + part.inner + part.close;
    fenceBlocks(text, fences.keys()).forEach((b, n) => {
      const pkg = fences.get(b.name);
      if (b.body.length > MAX_FENCE_CHARS) tooLong.push({ pkg, slide });
      else claims.push({ i, pkg, fence: b.name, slide, n, id: fenceId(pkg, idPrefix, slide, n), body: b.body, start: b.start, end: b.end, block: text.slice(b.start, b.end) });
    });
  });
  return { claims, tooLong };
}

/** What a renderer is handed for one fence. Two strings: the author's text and an id, and nothing else. */
export function fenceInput(claim) {
  return { body: claim.body, id: claim.id };
}

/** One fence's identity across the two renders and across renders: the plugin, its code, and what it was handed. */
export const fenceKey = (c, code) => `${c.pkg}\u0000fence\u0000${c.id}\u0000${code}\u0000${c.body}`;

/**
 * A plugin's sanitized output in its root element. The root is ours, never the plugin's: it names
 * the plugin, which is what a plugin's scoped CSS keys on and what a reader of the HTML finds
 * when asking where a figure came from.
 */
export function fenceMarkup(pkg, html) {
  return `<div ${PLUGIN_ROOT_ATTR}="${escapeHtml(pkg)}">${html}</div>`;
}

/** The engine's code block, kept, with a visible note saying why the plugin did not draw it. */
export function withFenceNote(block, pkg, why) {
  const name = escapeHtml(printableLine(pkg));
  const note = `<p data-package-error="${name}" role="note">The plugin “${name}” did not draw this block: ${escapeHtml(printableLine(String(why).slice(0, NOTE_CHARS)))}</p>`;
  return `${block}${note}`;
}

/**
 * `html` with the fence at each `claims[k]` replaced by `replacements[k]`, in one pass.
 * The claims are the part-relative ones `claimedFences` returned, applied to the section they came from.
 * @param {string} html  the deck the claims were read from
 * @param {Array<{ i: number, start: number, end: number }>} claims
 * @param {string[]} replacements  same length and order as `claims`
 */
export function replaceFences(html, claims, replacements) {
  const byPart = new Map();
  claims.forEach((c, k) => {
    if (!byPart.has(c.i)) byPart.set(c.i, []);
    byPart.get(c.i).push({ ...c, text: replacements[k] });
  });
  if (!byPart.size) return html;
  return splitSections(html)
    .map((p, i) => {
      if (p.type !== 'section') return p.text;
      let text = p.openTag + p.inner + p.close;
      // Right to left, so an earlier offset is still where it was.
      for (const c of (byPart.get(i) || []).sort((a, b) => b.start - a.start)) text = text.slice(0, c.start) + c.text + text.slice(c.end);
      return text;
    })
    .join('');
}

/** The section parts a code package claims whole: a fence inside one is the package's to draw, not ours. */
const claimedParts = (html, names, engineClaims) => new Set(claimedSlides(html, { packages: names, engineClaims }).map((c) => c.i));

/**
 * A hook for the registry's code-packages slot that records every fence a plugin owns, with the
 * slide position and id prefix the render gives it, and changes nothing. Compose it after the
 * slide hook: `(html, info) => fences.hook(slides.hook(html, info), info)`.
 * @param {Map<string, string>} fences  fence name → owning plugin
 * @param {{ names: string[], engineClaims: Iterable<string> }} slides  the slide packages' names and the engine's claims
 */
export function captureFences(fences, { names, engineClaims }) {
  const claims = [];
  const tooLong = [];
  const hook = (html, { slideIndex, idPrefix }) => {
    const r = claimedFences(html, { fences, slideIndex, idPrefix, skip: claimedParts(html, names, engineClaims) });
    claims.push(...r.claims);
    tooLong.push(...r.tooLong);
    return html;
  };
  return { hook, claims, tooLong };
}

/**
 * A hook that puts each fence's result in. `results` maps `fenceKey(claim, code)` to the sanitized
 * markup the plugin returned (`fenceMarkup`), or to the note that stands in for it.
 * A fence the first render did not hand over (the render is deterministic, so that is a defect,
 * not a race) keeps its code block with a note, never a stranger's output out of place.
 * @param {Map<string, string>} fences  fence name → owning plugin
 * @param {Map<string, string>} results
 * @param {Map<string, string>} codeOf  plugin name → its code, the same text the first render keyed on
 */
export function substituteFences(fences, results, codeOf, { names, engineClaims }) {
  return (html, { slideIndex, idPrefix }) => {
    const { claims } = claimedFences(html, { fences, slideIndex, idPrefix, skip: claimedParts(html, names, engineClaims) });
    if (!claims.length) return html;
    return replaceFences(html, claims, claims.map((c) => results.get(fenceKey(c, codeOf.get(c.pkg))) ?? withFenceNote(c.block, c.pkg, 'the block changed between the two renders')));
  };
}
