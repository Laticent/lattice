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
/** A string a URL parser would read as a network address: a scheme, `//`, or a backslash pair (leading control characters and spaces are skipped, as a parser skips them). */
const ADDRESS_START = /^(?:(?:https?|wss?|ftp|file|blob|javascript|vbscript):|\/\/|\\\\|\\\/|\/\\)/i;
function isAddressString(v) {
  let k = 0;
  while (k < v.length && v.charCodeAt(k) <= 32) k++; // a URL parser skips leading control characters and spaces
  return ADDRESS_START.test(v.slice(k));
}

export function cssRefTargets(css) {
  const s = String(css ?? '');
  const out = [];
  let depth = 0;
  let i = 0;
  // A string held in a custom property is text until something reads it where an address goes:
  // `--q:"https://x/y"` on a parent and `background:image-set(var(--q) 1x)` on a CHILD fetches it
  // (the red team and the checker, 2026-10-18). Inheritance crosses attributes and elements, so no
  // look at the same value can tell whether it will be read. An ADDRESS-SHAPED string (a network
  // scheme, or `//` or a backslash pair, which a URL parser reads as one) is therefore listed from
  // any custom property. A label that merely holds `/` or `:` (`--sep:"/"`, `--t:"10:30"`) is text.
  let custom = false;
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
      else if (custom && isAddressString(v)) out.push(v.trim());
    } else if (c === ';' || c === '}' || c === '{') {
      custom = false;
      i++;
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
      if (depth === 0 && name.startsWith('--') && /^(?:\s|\/\*[\s\S]{0,200}?\*\/)*:/.test(s.slice(i, i + 240))) custom = true;
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
  // `--` too: a custom property may hold an address with no function in sight.
  if (v.includes('(') || v.includes('--')) out.push(...cssRefTargets(v));
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

/**
 * The fence door's last step, the same in both doors: sanitize what a PLUGIN's fence renderer
 * returned (code-door-fence.mjs). It goes through `doorFinish` wrapped in a bare `<section>` and
 * handed an EMPTY one as what the renderer held, so no address it invents survives (a fence is
 * handed text, not a slide) and a result that closes the wrapper and opens markup of its own is not
 * one section and is refused. The wrapper comes off again. Two more refusals a slide does not need:
 * a `<section>` inside the result (a plugin draws inside a slide, and a nested one takes the slide's
 * own page chrome and every pass that walks `section`), and a result the sanitizer reduced to nothing.
 * @returns {{ html: string } | { error: string }}
 */
export function doorFinishFence(doc, sanitize, html, pkg) {
  const done = doorFinish(doc, sanitize, `<section>${html}</section>`, '<section></section>', pkg);
  if ('error' in done) return { error: /one <section>|not one <section>/.test(done.error) ? 'the renderer returned markup that closes its own container' : done.error };
  // Our wrapper has no attributes, so the sanitized text opens with exactly `<section>`.
  if (!done.html.startsWith('<section>') || !done.html.endsWith('</section>')) return { error: "the sanitized output is not the renderer's markup alone" };
  const inner = done.html.slice('<section>'.length, -'</section>'.length);
  const t = doc.createElement('template');
  t.innerHTML = inner;
  if (t.content.querySelector('section')) return { error: 'the renderer returned a <section>: a plugin draws inside a slide, not another one' };
  // `querySelector` does not look inside a template's content, which holds an inert <section> a script could clone out.
  if (t.content.querySelector('template')) return { error: 'the renderer returned a <template>, which can hold markup the checks above cannot see' };
  // A renderer is handed no address, so a media element it returns can hold none that the sanitizer
  // keeps (a `data:` image survives, a remote one does not): what is left is a dead box. The Studio's PDF
  // writer draws each slide into an image and fails, or ships "without at least one image", on an empty
  // `<video>` or an `<img>` / SVG `<image>` with no source (found driving Share → PDF on the real Studio,
  // 2026-10-12). Dropped here, in both doors, rather than in the exporter: the exporter is right that a
  // slide's image with no source is a defect, and a plugin's is not the author's to fix.
  const dead = [...t.content.querySelectorAll('video, audio, source, track, img, image')].filter((el) => {
    const n = el.localName;
    // No usable address: absent, empty, or a bare `#` (a same-page fragment loads nothing).
    const none = (v) => v === null || v.trim() === '' || v.trim() === '#';
    if (n === 'img') return none(el.getAttribute('src'));
    if (n === 'image') return none(el.getAttribute('href')) && none(el.getAttribute('xlink:href'));
    return true;
  });
  for (const el of dead) el.remove();
  // A `name` on an <img>, <form> or <embed> becomes a property of `window` (named access), which can shadow a
  // runtime global another slide's pass reads (red team, 2026-10-12: `name="__latticeDagreNotNeeded"` stopped every
  // flowchart in the deck from drawing). A renderer has no use for one: ids are its own namespace.
  const named = [...t.content.querySelectorAll('[name]')];
  for (const el of named) el.removeAttribute('name');
  const kept = dead.length || named.length ? t.innerHTML : inner;
  if (!kept.trim()) return { error: 'the renderer returned nothing the sanitizer kept' };
  return { html: kept };
}

/**
 * Elements an inline span's output may hold (the inline door, 2026-10-14-plugin-inline-door.md §4.4): HTML's phrasing
 * content, the elements that stand inside a line of text, and an `<svg>` with its drawing. A span stands where a word
 * stood, so a `<div>`, a list or a table would break the sentence it sits in, and the slide's layout with it. No `<a>`:
 * a span may sit in link text, and a link inside a link is re-parsed by the browser into a different tree (the checker).
 * No `<code>`: the runtime's inline pass draws any `<code>` it finds, so a plugin's would be drawn as a host kind.
 */
const PHRASING = new Set(['abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'data', 'dfn', 'em', 'i', 'img', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr', 'svg']);
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The inline door's last step, the same in both doors: everything `doorFinishFence` does, then PHRASING content only.
 * Inside an `<svg>` any SVG element is a drawing, except `foreignObject`, which would carry HTML (blocks included)
 * back into the line.
 * @returns {{ html: string } | { error: string }}
 */
export function doorFinishInline(doc, sanitize, html, pkg) {
  const done = doorFinishFence(doc, sanitize, html, pkg);
  if ('error' in done) return done;
  const t = doc.createElement('template');
  t.innerHTML = done.html;
  for (const el of t.content.querySelectorAll('*')) {
    const n = el.localName;
    if (el.namespaceURI === SVG_NS && n !== 'svg') {
      if (n.toLowerCase() === 'foreignobject') return { error: 'the renderer returned an SVG <foreignObject>, which would put HTML back into a line of text' };
      continue;
    }
    if (!PHRASING.has(n)) return { error: `the renderer returned a <${n}>, which cannot stand inside a line of text (an inline kind draws phrasing content: a <span>, an <svg>, text)` };
  }
  // A span stands in the author's sentence, so two more things the tag names cannot see (the red team, 2026-10-14):
  // a bidi control in its text runs on past the span and reverses the author's words after it, and a `style` can lift
  // it out of the line (`position:fixed`, `display:block`, a `100vw` box) over the whole slide.
  let changed = false;
  const walker = doc.createTreeWalker(t.content, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const clean = n.data.replace(BIDI_CONTROLS, '');
    if (clean !== n.data) {
      n.data = clean;
      changed = true;
    }
  }
  for (const el of t.content.querySelectorAll('[style]')) {
    const kept = inlineStyle(el.getAttribute('style'));
    if (kept !== el.getAttribute('style')) {
      changed = true;
      if (kept) el.setAttribute('style', kept);
      else el.removeAttribute('style');
    }
  }
  if (!changed) return done;
  return t.innerHTML.trim() ? { html: t.innerHTML } : { error: 'the renderer returned nothing the sanitizer kept' };
}

/** Every bidi embedding, override, isolate and mark: in a span's text they reorder the sentence around it. */
const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/g;

/**
 * The declarations of a `style` an inline span may keep: paint and type that stay inside its own box. Anything that
 * moves the box (`position`, `float`, `z-index`, `transform`, `margin`), changes how it flows (`display` other than an
 * inline one), or sizes it by the viewport (`vw`, `vh`, `vmin`, `vmax`) is dropped, as is anything unparsed.
 * The root's CSS (`lib/base/base.modifiers.css`) contains its paint as well, so this is the first wall, not the only one.
 */
const INLINE_STYLE_KEEP = new Set(['color', 'background-color', 'background', 'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom', 'border', 'border-color', 'border-width', 'border-style', 'border-radius', 'font-weight', 'font-style', 'font-variant', 'font-size', 'letter-spacing', 'text-decoration', 'text-transform', 'vertical-align', 'opacity', 'white-space', 'line-height', 'display', 'fill', 'stroke', 'stroke-width']);
const INLINE_DISPLAY = new Set(['inline', 'inline-block', 'inline-flex', 'none']);
function inlineStyle(text) {
  const kept = [];
  for (const decl of String(text ?? '').split(';')) {
    const at = decl.indexOf(':');
    if (at < 0) continue;
    const prop = decl.slice(0, at).trim().toLowerCase();
    const value = decl.slice(at + 1).trim();
    if (!INLINE_STYLE_KEEP.has(prop) || !value || /\b\d*\.?\d+v(?:w|h|min|max|i|b)\b|url\s*\(|expression/i.test(value)) continue;
    if (prop === 'display' && !INLINE_DISPLAY.has(value.toLowerCase())) continue;
    kept.push(`${prop}:${value}`);
  }
  return kept.join(';');
}

