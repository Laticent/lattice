/**
 * lib/core/web-ref-readers.js
 *
 * THE SECURITY SPINE'S SHARED READERS (engineering/decisions/2026-11-03-security-findings-spine.md §1, S2): the
 * readers both consumers ask, moved here unchanged from remote-ref.js so the linter can load them without the
 * scanner's rewrite logic (+16.5 KB gzip, measured in S1):
 *
 *   - `cssRefSpans`, `remoteCssRefs`: where a piece of CSS names a target (Segno R2);
 *   - `scanHtml`, `rawTextEnd`: the start tags of a piece of markup, and where the reader is unsure (Segno R3);
 *   - `decodeEntitiesMapped`, `decodeEntities`: the character references an HTML parser decodes;
 *   - `mermaidRemoteRefs`: the remote targets in a Mermaid diagram's source, read as the diagram reads it;
 *   - `refreshTarget`: the address a refresh `<meta>` navigates to.
 *
 * The RENDERER (remote-ref.js `blockWebImages`) reads its output through these and blocks; the LINTER (lint-core.js,
 * the S2 rules) reads the source through these and warns. Neither calls the other. remote-ref.js re-exports every
 * name, so no importer of it changed.
 */
const { isRemoteRef: isRemoteUrl } = require('./media-sources');

const { cssEscape, cssString } = require('./css-token-readers.js');

// The CSS tokens come from a parser generated from css-ref-grammar.js (Segno R2, 2026-10-29); the
// reader in css-ref-reader.js keeps the block stack. The hand-written tokenizer this replaced is frozen in
// tools/segno-legacy/css-ref-spans.js, and test/unit/core/css-ref-spans-differential.test.js holds the two
// to the same spans. The escape and string readers live in css-token-readers.js and are handed in, because the
// reader requires nothing (the docs dev server's rule for a CommonJS lib/ file, docs/src/plugins/vite-cjs-lib-dev.mjs).
/**
 * Every place a piece of CSS names a target, as spans of the source: each string token, and
 * each `url(…)`, unquoted or holding one string (then the span is the whole function). Read
 * with a tokenizer that follows CSS Syntax 3 where a fetch depends on it: newlines (above),
 * escapes (`u\72l(` is `url(`), comments, strings, and the stack of `(` `[` `{` blocks, so a
 * `}` inside a string or a `(` block does not end a rule.
 *   `kind`      'url' for a `url(…)`, 'string' for a bare string token
 *   `value`     the target, escapes decoded (a `url(…)` target trimmed)
 *   `fontFace`  inside an `@font-face` block (a font source, not a picture)
 *   `selector`  inside a `[…]` block: an attribute selector, which never fetches
 * @param {string} css
 * @returns {Array<{ from: number, to: number, kind: 'url'|'string', value: string, fontFace: boolean, selector: boolean }>}
 */
const cssRefSpans = require('./css-ref-reader.js').makeCssRefSpans(require('./css-ref.generated.js'), { cssEscape, cssString });

/**
 * The remote targets in a piece of CSS: every string token (which covers `url("…")`,
 * `image-set("…")`, `src("…")` and `@import "…"`) and every unquoted `url(…)`, read with
 * `cssRefSpans`' tokenizer rather than regexes so that a comment inside a string, a `)`
 * inside a string, an escaped `u\72l(` and a string a form feed ends all mean what they mean
 * to the browser. A remote string that is not a fetch (`content: "https://…"`) is reported
 * too: the safe direction, and rare.
 * @param {string} css  an inline `style`, a presentation attribute, or a `<style>` body
 * @returns {string[]}
 */
function remoteCssRefs(css) {
  // a string is also read as written (see cssReplacements): Firefox's preloader does not decode escapes in an `@import`
  return cssRefSpans(css).flatMap((sp) => (sp.kind === 'string' && css.slice(sp.from + 1, sp.to - 1).includes('\\') ? [sp.value, css.slice(sp.from + 1, sp.to - 1).replace(/\\/g, '/')] : [sp.value])).filter(isRemoteUrl);
}

// Mermaid decodes its OWN entity codes (`#58;` is `:`, `#colon;` too) into a label after
// the page has the fence, and an HTML label decodes `&#58;` once more, so the scan reads the
// text the way the diagram will: numeric and named codes in both spellings, twice over for a
// double encoding. The named table holds the characters a URL is built from; a letter can be
// typed as itself, so an attacker gains nothing from any other name.
const MERMAID_NAMED = { colon: ':', sol: '/', bsol: '\\', period: '.', tab: '', newline: '', lpar: '(', rpar: ')', quot: '"', apos: "'", amp: '&' };
function mermaidDecoded(text) {
  let t = String(text || '');
  for (let pass = 0; pass < 2; pass++) {
    t = t
      // `&#58` needs no `;` in HTML; Mermaid's own `#58;` does (its encoder matches `#\w+;`).
      .replace(/&#(?:x([0-9a-f]+)|(\d+));?|#(\d+);/gi, (m, hex, dec, mdec) => {
        const cp = Number.parseInt(hex ?? dec ?? mdec, hex ? 16 : 10);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      })
      .replace(/[&#]([a-z]+);/gi, (m, name) => MERMAID_NAMED[name.toLowerCase()] ?? m);
  }
  return t;
}

/** Mermaid constructs that can load a resource, refused in a sample slide whatever they point at. */
const MERMAID_FORBIDDEN = [
  ['an image shape (`img:`)', /\bimg\s*:/i],
  ['an HTML media tag in a label', /<\s*\/?\s*(?:img|image|svg|iframe|frame|object|embed|link|style|video|audio|source|picture|use|feimage|portal|meta|base)\b/i],
  ['a src/href/srcset attribute', /\b(?:src|href|srcset|xlink:href|data|poster|background)\s*=/i],
  ['a markdown image in a label', /!\[/],
  ['a `click` directive', /(?:^|[\n;])\s*click\s/i],
  ['a url()', /\burl\s*\(/i],
  ['an image-set()', /image-set\s*\(/i],
  ['`themeCSS`', /themeCSS/i],
  ['an `@import`', /@import/i],
  ['a protocol-relative or UNC path', /[/\\]{2}/],
  // Numeric needs no `;` in HTML; a named one does, so `R&D` in a label stays legal.
  ['an entity code', /&#x?[0-9a-f]+;?|&[a-z][a-z0-9]*;|#[a-z0-9]+;/i],
];

/**
 * The remote targets in a Mermaid diagram's SOURCE, read as the diagram will read it:
 * entity codes decoded first, then every `url()`/string, every `//host`, and every special
 * scheme with or without slashes — against a `file:` page the URL parser reads `http:host/x`
 * as `http://host/x`. A label that merely mentions a URL is the rare false positive, and the
 * safe direction. Used for the fence text in the rendered page AND for every fence the CLI
 * finds in the source (`lib/plugins/mermaid/shared/mermaid-fences.js`), which includes one inside an HTML block.
 * @param {string} text
 * @returns {string[]}
 */
function mermaidRemoteRefs(text) {
  const t = mermaidDecoded(text);
  const out = [];
  // ALLOWLIST FIRST. Four checker passes each found a new URL SPELLING the scan below missed,
  // all inside Mermaid text. So a sample slide's diagram may not use any construct that can
  // load something at all, however its target is spelled. Read raw AND with tab/newline
  // dropped, since the URL parser would drop them. Words alone never trip it (`src/` as a
  // label is fine): only the constructs, measured against the 163 fences in the tree.
  const raw = String(text || '');
  for (const body of [raw, raw.replace(/[\t\n\r]/g, ''), t, t.replace(/[\t\n\r]/g, '')]) {
    for (const [what, re] of MERMAID_FORBIDDEN) if (re.test(body)) out.push(`policy:${what}`);
  }
  out.push(...remoteCssRefs(t));
  for (const m of t.matchAll(/(?:[a-z][a-z0-9+.-]*:)?[/\\]{2}[^\s"'<>)\]]+|\b(?:https?|wss?|ftp|file):[^\s"'<>)\]]*/gi)) {
    if (isRemoteUrl(m[0])) out.push(m[0]);
  }
  // The URL parser drops tab and newline ANYWHERE in a URL, so `ht<TAB>tp:host` (or Mermaid's
  // `ht#9;tp:`) is `http:host`. Read the text again with those removed. The scheme still needs
  // no scheme character before it, or `profile:` would read as `file:`.
  const joined = t.replace(/[\t\n\r]/g, '');
  if (joined !== t) {
    for (const m of joined.matchAll(/(?<![a-z0-9+.-])(?:https?|wss?|ftp|file):[^\s"'<>)\]]*|[/\\]{2}[^\s"'<>)\]]+/gi)) {
      if (isRemoteUrl(m[0])) out.push(m[0]);
    }
  }
  return out;
}

// EVERY named character reference whose value is one ASCII character other than a letter or a
// digit: the characters a URL, a `url(` and a CSS escape are built from (a letter or a digit has
// no name, so it can only be typed as itself or as a number). From the HTML standard's
// entities.json; `test/unit/core/web-css-bypass.test.js` holds each value to the `entities`
// package's decoder. Names are case-sensitive, as the HTML parser reads them. `&Tab;` and `&NewLine;`
// decode to a real tab and newline, as `&#9;` does; the URL parser drops them from an address (`urlAsParsed`), after a list attribute is split on them.
const ASCII_NAMED = {
  AMP: '&', amp: '&', DiacriticalGrave: '`', grave: '`', GT: '>', gt: '>', Hat: '^', LT: '<', lt: '<',
  NewLine: '\n', QUOT: '"', quot: '"', Tab: '\t', UnderBar: '_', lowbar: '_', VerticalLine: '|', verbar: '|',
  vert: '|', apos: "'", ast: '*', midast: '*', bsol: '\\', colon: ':', comma: ',', commat: '@',
  dollar: '$', equals: '=', excl: '!', lbrace: '{', lcub: '{', lbrack: '[', lsqb: '[', lpar: '(',
  num: '#', percnt: '%', period: '.', plus: '+', quest: '?', rbrace: '}', rcub: '}', rbrack: ']',
  rsqb: ']', rpar: ')', semi: ';', sol: '/',
};
// Of those, the only ones the parser also reads WITHOUT a `;` (the standard's legacy names).
const LEGACY_NAMED = new Set(['AMP', 'amp', 'GT', 'gt', 'LT', 'lt', 'QUOT', 'quot']);

// A numeric reference to one of these code points decodes to the windows-1252 character instead,
// as the HTML parser decodes it: `&#x99;` is `™`, which a URL parser folds to `tm` in a host.
// Keyed by decimal code point (128-159 is 0x80-0x9F).
const WINDOWS_1252 = {
  128: 0x20ac, 130: 0x201a, 131: 0x0192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x02c6,
  137: 0x2030, 138: 0x0160, 139: 0x2039, 140: 0x0152, 142: 0x017d, 145: 0x2018, 146: 0x2019, 147: 0x201c,
  148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x02dc, 153: 0x2122, 154: 0x0161, 155: 0x203a,
  156: 0x0153, 158: 0x017e, 159: 0x0178,
};
const REFERENCE = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z]+))(;?)/g;

/**
 * Decode the character references an HTML parser decodes, keeping where each decoded character
 * came from: `map[k]` is the index in `v` where `text[k]` starts, and `map[text.length]` is
 * `v.length`, so a span of `text` maps back to a span of `v`.
 * `attribute`: the text is an attribute value, where a legacy name with no `;` followed by `=`
 * or a letter or digit stays as written (`&quot=` is literal there).
 * @param {string} v
 * @param {{ attribute?: boolean }} [opts]
 * @returns {{ text: string, map: number[] }}
 */
function decodeEntitiesMapped(v, { attribute = false } = {}) {
  const raw = String(v);
  let text = '';
  const map = [];
  let at = 0;
  const copy = (to) => {
    for (; at < to; at++) {
      map.push(at);
      text += raw[at];
    }
  };
  REFERENCE.lastIndex = 0;
  for (let m = REFERENCE.exec(raw); m; m = REFERENCE.exec(raw)) {
    const [whole, dec, hex, name, semi] = m;
    let out;
    if (dec || hex) {
      let cp = Number.parseInt(dec ?? hex, dec ? 10 : 16);
      cp = WINDOWS_1252[cp] ?? cp;
      out = cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? '�' : String.fromCodePoint(cp);
    } else if (Object.hasOwn(ASCII_NAMED, name) && (semi || (LEGACY_NAMED.has(name) && !(attribute && /[=A-Za-z0-9]/.test(raw[m.index + whole.length] ?? ''))))) {
      out = ASCII_NAMED[name];
    } else continue;
    copy(m.index);
    for (let k = 0; k < out.length; k++) map.push(m.index);
    text += out;
    at = m.index + whole.length;
  }
  copy(raw.length);
  map.push(raw.length);
  return { text, map };
}

/** Decode the character references an HTML parser decodes in an attribute value or text. */
function decodeEntities(v, opts) {
  const raw = String(v);
  return raw.includes('&') ? decodeEntitiesMapped(raw, opts).text : raw;
}

const { makeScanHtml, rawTextEnd } = require('./html-ref-reader.js');
const readHtml = makeScanHtml(require('./html-ref.generated.js'));
/**
 * Every start tag in `html`, in order, with its attributes, and the text span (`body`) of each
 * raw-text element in HTML content. `unsure` lists where tree construction could read the markup
 * differently from the reader (foreign content, an integration point, `<select>`, `<noscript>`, an
 * escaped script, a comment that never ends), each with its reason; `risky` is whether there is one, and
 * then the spec parser decides (fail closed). Comments and bogus comments are skipped where the
 * tokenizer ends them, so a quote inside one cannot hide the tags after it.
 * @param {string} html
 * @returns {{ tags: object[], risky: boolean, unsure: Array<{ from: number, to: number, why: string }> }}
 */
function scanHtml(html) {
  const { tags, unsure } = readHtml(html);
  return { tags, risky: unsure.length > 0, unsure };
}

/**
 * The address a refresh `<meta>`'s `content` navigates to, or '' when it names none: the HTML
 * "shared declarative refresh steps". A time (digits and dots), then `;`, `,` or space, then
 * the address, which may follow `url=` and may be quoted; the leading space and, in a quoted
 * address, everything after the closing quote is dropped.
 */
function refreshTarget(content) {
  const m = /^[\t\n\f\r ]*[0-9.]*[\t\n\f\r ]*[;,]?[\t\n\f\r ]*(?:url[\t\n\f\r ]*=[\t\n\f\r ]*)?(.*)$/is.exec(String(content));
  if (!m) return '';
  const rest = m[1];
  const q = rest[0];
  if (q === '"' || q === "'") {
    const end = rest.indexOf(q, 1);
    return (end < 0 ? rest.slice(1) : rest.slice(1, end)).trim();
  }
  return rest.trim();
}

module.exports = { cssEscape, cssString, cssRefSpans, remoteCssRefs, mermaidRemoteRefs, decodeEntitiesMapped, decodeEntities, ASCII_NAMED, scanHtml, rawTextEnd, refreshTarget };
