/**
 * The code-package DOOR's attribute rule (contract note §9), the same in both doors: what a
 * transform's output may keep of the addresses, classes, ids and engine markers in it, and the
 * door's last step (`doorFinish`). The CLI runs it in its sanitizer page
 * (lib/packages/code-door-worker.js), the Studio in docs/src/lib/code-packages/door-run.ts.
 *
 * Split from remote-ref.js, which the Studio loads at startup: this loads only when a render meets
 * a code package (docs/route-budget.json). It reads remote-ref.js's parsers rather than copying
 * them, so the door and the web-image gate agree on what an address is.
 */

import remoteRef from './remote-ref.js';

const { cssEscape, urlAsParsed, FETCH_ATTRS, mermaidRemoteRefs, isDrawnFenceClass } = remoteRef;

/**
 * EVERY address a CSS value holds, remote or not: each `url()` argument, and each quoted string
 * inside a function (`image-set("a.png" 1x)`, `url("a.png")`). A quoted string outside any function
 * (`content: "Q3"`, `--label: "x"`) is text, not an address. Escapes are decoded as the CSS parser
 * decodes them, so `\75 rl(` is `url(`. Used where a stranger's markup may keep only the addresses
 * it was handed (the code-package door), so it lists local targets too, which `remoteCssRefs` skips.
 * @param {string} css
 * @returns {string[]}
 */
export function cssRefTargets(css) {
  const s = String(css ?? '');
  const out = [];
  let depth = 0;
  let i = 0;
  const readString = (q) => {
    let v = '';
    i++;
    while (i < s.length && s[i] !== q && s[i] !== '\n') {
      if (s[i] === '\\') {
        const [d, n] = cssEscape(s, i);
        v += d === '\n' ? '' : d;
        i = n;
      } else v += s[i++];
    }
    i++;
    return v;
  };
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? s.length : end + 2;
    } else if (c === '"' || c === "'") {
      const v = readString(c);
      if (depth > 0) out.push(v.trim());
    } else if (c === '(') {
      depth++;
      i++;
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
      i++;
    } else if (/[A-Za-z_\\-]/.test(c)) {
      let name = '';
      while (i < s.length && /[A-Za-z0-9_\\-]/.test(s[i])) {
        if (s[i] === '\\') {
          const [d, n] = cssEscape(s, i);
          name += d;
          i = n;
        } else name += s[i++];
      }
      if (s[i] === '(' && name.toLowerCase() === 'url') {
        i++;
        while (/[ \t\n\r\f]/.test(s[i] ?? '')) i++;
        if (s[i] === '"' || s[i] === "'") {
          out.push(readString(s[i]).trim());
          while (i < s.length && s[i] !== ')') i++;
          i++;
          continue;
        }
        let v = '';
        while (i < s.length && s[i] !== ')') {
          if (s[i] === '\\') {
            const [d, n] = cssEscape(s, i);
            v += d;
            i = n;
          } else v += s[i++];
        }
        i++;
        out.push(v.trim());
      }
    } else i++;
  }
  return out;
}

/**
 * Every address ONE attribute holds (names lowercased, the value entity-decoded, as a parsed DOM
 * gives it): a fetch attribute's target (each `srcset` candidate), a link's target, and every
 * address in a value that can hold CSS.
 */
export function attrRefTargets(_tag, name, value) {
  const v = String(value ?? '');
  const out = [];
  if (FETCH_ATTRS.has(name)) out.push(...(name.endsWith('srcset') ? v.split(',').map((c) => c.trim().split(/\s+/)[0]) : [v.trim()]));
  if (v.includes('(')) out.push(...cssRefTargets(v));
  return out.filter(Boolean);
}

/** An address that stays inside the page: a `#fragment` or a `data:` URL. */
export function isPageOwnRef(raw) {
  const s = urlAsParsed(raw);
  return s.startsWith('#') || s.startsWith('data:');
}

/**
 * `data-*` names the engine and the viewer's runtime act on: a slide's own markers and a plugin
 * figure's placeholder and settled state (`data-lattice-*`, lib/plugins/host-browser.mjs — a
 * Mermaid fence's too, since phase D's browser half), the retired Mermaid state prefix
 * (`data-mermaid-*`, kept refused so an old marker can never be forged), an
 * image's measured bucket (`data-img-*`) and a pane (`data-pane*`). A package keeps one only as it
 * was handed (the checker: a package could mark its own block as already settled).
 */
const ENGINE_DATA = Object.freeze(['data-lattice-', 'data-mermaid-', 'data-img-', 'data-pane']);
/** A class the runtime would act on if it merely CONTAINED this, so no package may add one by name. */
const RUNTIME_CLASS_PART = /mermaid|language-|functionplot/i;

/**
 * What a section HANDED to a code package holds, for `doorFilterAttr`: every address its attributes
 * name, every `data-lattice-*` attribute (as `name=value`), and every `lattice-*` class.
 * @param {Iterable<{ localName: string, attributes: Iterable<{ name: string, value: string }> }>} elements
 */
export function handedOf(elements, pkg) {
  const refs = new Set();
  const attrs = new Set();
  const classes = new Set();
  const tokens = new Set();
  const ids = new Set();
  const diagramRefs = new Set();
  for (const el of elements) {
    const tag = String(el.localName || '').toLowerCase();
    for (const a of el.attributes || []) {
      const name = String(a.name).toLowerCase();
      for (const t of attrRefTargets(tag, name, a.value)) refs.add(t);
      if (ENGINE_DATA.some((pre) => name.startsWith(pre))) attrs.add(`${name}=${a.value}`);
      if (name === 'id') ids.add(a.value);
      if (name === 'class') {
        if (isDrawnFenceClass(a.value)) for (const r of mermaidRemoteRefs(el.textContent || '')) diagramRefs.add(r);
        for (const c of String(a.value).split(/\s+/)) {
          if (!c) continue;
          tokens.add(c);
          if (c.startsWith('lattice-')) classes.add(c);
        }
      }
    }
  }
  return { refs, attrs, classes, tokens, ids, diagramRefs, pkg: typeof pkg === 'string' ? pkg : null };
}

/**
 * The code-package door's attribute rule (contract note §9), for `createSlideSanitizer`'s
 * `filterAttr`. A transform's output keeps:
 *   - a CLASS only if the slide it was handed carried it, or it is in the package's own name;
 *   - an ADDRESS only if the section it was handed already held it, byte for byte, or it is a
 *     `data:` URL or a `#fragment`. The author's own image, link or background passes through, and
 *     the render's `--allow-remote` decides about those as about any; an address the package
 *     INVENTED is dropped, remote or local, because it is how a package would reach a server with
 *     the slide in the query, or name a file for a later pass to read (the red team had a logo mask
 *     read a local file into the export);
 *   - an ENGINE CHANNEL marker only if it was handed: a `data-lattice-*` attribute, and a
 *     `lattice-*` class (`lattice-notes` is the presenter channel; the inversion lens forged a
 *     speaker note, which `--strip-notes` then shipped);
 *   - never `srcdoc`.
 * @param {{ refs: Set<string>, attrs: Set<string>, classes: Set<string> }} handed  from `handedOf`
 * @returns {(tag: string, name: string, value: string) => boolean | string}
 */
export function doorFilterAttr(handed) {
  return (tag, name, value) => {
    if (name === 'srcdoc') return false;
    if (ENGINE_DATA.some((pre) => name.startsWith(pre)) && !handed.attrs.has(`${name}=${value}`)) return false;
    // An id is a target: `url(#id)` and `href="#id"` anywhere in the deck take the FIRST element with
    // it, so a package's ids live in its own name, or are the ones it was handed.
    if (name === 'id' && handed.pkg !== null && !(handed.ids?.has(value) || value.startsWith(`${handed.pkg}-`))) return false;
    if (attrRefTargets(tag, name, value).some((t) => !(isPageOwnRef(t) || handed.refs.has(t)))) return false;
    if (name === 'class') {
      // EVERY class, on every element: one the slide already carried, or one in the package's own
      // name (`<name>`, `<name>-…`). A later pass or the viewer's runtime acts on classes it knows
      // (`video` builds an address from a bullet; a `mermaid` block fetches its image nodes), so a
      // class the package invents is a way to have something after the door do what it may not
      // (the red team). Without a name (a caller that predates it) only the `lattice-*` rule holds.
      // The runtime matches some classes by substring (`[class*="language-mermaid"]`), so an
      // own-name class that merely CONTAINS one is not the package's to add (the checker).
      const own = (c) => handed.pkg !== null && (c === handed.pkg || c.startsWith(`${handed.pkg}-`)) && !RUNTIME_CLASS_PART.test(c);
      const kept = String(value).split(/\s+/).filter((c) => c && (c.startsWith('lattice-') ? handed.classes.has(c) : handed.pkg === null || handed.tokens?.has(c) || own(c)));
      return kept.length ? kept.join(' ') : false;
    }
    return true;
  };
}

/**
 * The code-package door's last step, the same in both doors (the CLI's sanitizer page and the
 * Studio): check a transform returned ONE `<section>`, sanitize it with `doorFilterAttr` built from
 * the section it was handed, and give back every class it was handed. `sanitize(html, filter)`
 * is the host's slide sanitizer with that filter for this one call (createSlideSanitizer's
 * `filterAttr`); `doc` is a document to parse in, inertly (a `<template>`).
 * @returns {{ html: string, classes: string[] } | { error: string }}
 */
export function doorFinish(doc, sanitize, html, handedHtml, pkg) {
  const oneSection = (text) => {
    const t = doc.createElement('template');
    t.innerHTML = text;
    const nodes = [...t.content.childNodes].filter((n) => n.nodeType === 1 || (n.nodeType === 3 && /\S/.test(n.data)));
    return nodes.length === 1 && nodes[0].nodeType === 1 && nodes[0].localName === 'section' ? nodes[0] : null;
  };
  const handed = oneSection(handedHtml);
  if (!handed) return { error: 'the door was handed no section' };
  if (!oneSection(html)) return { error: 'the transform must return exactly one <section>' };
  const clean = String(sanitize(html, doorFilterAttr(handedOf([handed, ...handed.querySelectorAll('*')], pkg)))).trim();
  const section = oneSection(clean);
  if (!section) return { error: 'the sanitized output is not one <section>' };
  // A Mermaid block reaches the viewer as TEXT and fetches the image nodes it names while it draws,
  // after the door. A block the package returns may name only the addresses a handed block did.
  const had = handedOf([handed, ...handed.querySelectorAll('*')], pkg).diagramRefs;
  for (const el of [section, ...section.querySelectorAll('*')]) {
    if (!isDrawnFenceClass(el.getAttribute('class') || '')) continue;
    const bad = mermaidRemoteRefs(el.textContent || '').find((r) => !had.has(r));
    if (bad) return { error: `its diagram names an address the slide did not hold (${bad})` };
  }
  // The section keeps every class it was handed, whatever the package returned: the door puts back
  // any it left off. A package that DRAWS from `slide.facts` builds its section fresh and cannot know
  // the classes the engine added (`content`, `form`: markup, not facts), so the first cut, which
  // refused such a slide, refused every drawing package (the facts conformance package, #2411-p1).
  // Putting them back reaches only the state a package that kept them reaches.
  const classes = [...new Set([...handed.classList, ...section.classList])];
  return { html: clean, classes };
}
