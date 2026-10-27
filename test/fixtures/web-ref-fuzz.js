/**
 * A seeded generator of CSS and HTML that names a web address, built from the tokenizer rules of the
 * two specs rather than from known bypasses. test/fixtures/web-ref-beacons.js lists spellings
 * someone found; this makes the ones nobody has written down, so a scanner that agrees with the
 * browser on all of them has been tested on more than its authors' imagination.
 *
 * `fuzzInputs(seed, count, base)` returns `{ name, kind, text }` rows in the beacons table's shape,
 * so `asHtml` (web-ref-beacons.js) turns one into a document. Each input fetches `${base}/<name>`
 * when the browser takes it as written, and `name` is unique to the input, so a request in a
 * loopback server's log names the input that made it. Most inputs do NOT fetch as written (a
 * random mutation breaks the syntax as often as it keeps it); `test/helpers/web-ref-fuzz.js`
 * counts how many do, because a fuzz whose inputs never fetch has proved nothing.
 *
 * Same seed, count and base, same inputs, on every machine: the PRNG is mulberry32 and nothing reads the
 * clock, so a failure reproduces from its seed and index. The address is consumed character by character, so the
 * base's LENGTH is part of the input (a 4-digit port changes every input; ephemeral ports are 5 digits).
 *
 * Generation, in layers:
 *   1. a REFERENCE: where a fetch can come from (CSS: `url()`, `image-set()`, `@import`,
 *      `@font-face src`, a custom property read back; HTML: an attribute that loads, a `style`
 *      attribute, a `<style>`, an SVG paint attribute, a `<base>` plus a relative address);
 *   2. SPELLING of the address and the syntax round it, within what the spec allows: CSS escapes
 *      (`\72 `), line continuations in strings, comments between tokens; HTML character references
 *      (named, decimal, hex, with and without the semicolon), tabs and newlines the URL parser
 *      strips, odd attribute separators and quotes;
 *   3. a CONTEXT around it: nested at-rules and rules, junk before it (an unterminated string,
 *      comment or block), raw-text and foreign-content elements, comments of every closing shape.
 */

/** mulberry32: 32 bits of state, deterministic, well distributed enough for a fuzzer. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX = /[0-9a-fA-F]/;

function makeKit(next, wide = false) {
  const int = (n) => Math.floor(next() * n);
  const chance = (p) => next() < p;
  const pick = (a) => a[int(a.length)];

  // ── CSS spelling ────────────────────────────────────────────────────────────────────────────
  /** What ends a CSS hex escape: one whitespace, which `\r\n` counts as, or nothing if the next char is no hex digit. */
  const hexEnd = (nextCh) => (nextCh !== undefined && !HEX.test(nextCh) && chance(0.3) ? '' : pick([' ', ' ', '\t', '\n', '\r\n', '\f']));

  /** The address as written in a CSS context: unquoted `url(` or inside a string. */
  function cssAddress(url, ctx, p = 0.18) {
    let out = '';
    for (let i = 0; i < url.length; i++) {
      const ch = url[i];
      if (chance(p)) {
        // an escape: hex with its terminator, or (for a non-hex, non-newline char) the identity escape
        if (!HEX.test(ch) && chance(0.4)) out += `\\${ch}`;
        else out += `\\${ch.codePointAt(0).toString(16)}${hexEnd(url[i + 1])}`;
        continue;
      }
      out += ch;
      // a line continuation is only valid inside a string
      if (ctx !== 'bare' && chance(0.03)) out += pick(['\\\n', '\\\r\n', '\\\f', '\\\r']);
    }
    return out;
  }

  /** `url` spelled with escapes, case changes and (rarely) a comment where one is not allowed. */
  function cssFunctionName(name) {
    let out = '';
    for (let i = 0; i < name.length; i++) {
      const ch = name[i];
      const r = next();
      if (r < 0.2) out += `\\${ch.codePointAt(0).toString(16)}${hexEnd(name[i + 1])}`;
      else if (r < 0.3) out += ch.toUpperCase();
      else if (r < 0.34 && !HEX.test(ch)) out += `\\${ch}`;
      else out += ch;
    }
    return out;
  }

  const ws = () => pick(['', '', '', ' ', '  ', '\n', '\t', '\r\n', '\f', ' /**/ ', '/**/']);
  const comment = () => (chance(0.1) ? pick(['/**/', '/* x */', '/*\n*/', '/* } */', '/* " */']) : '');

  /** A CSS value that fetches `url` when taken as written, in a randomly chosen spelling. */
  function cssValue(url) {
    const bare = () => `${cssFunctionName('url')}(${ws()}${cssAddress(url, 'bare')}${ws()})`;
    const dq = () => `${cssFunctionName('url')}(${ws()}"${cssAddress(url, 'dq')}"${ws()})`;
    const sq = () => `${cssFunctionName('url')}(${ws()}'${cssAddress(url, 'sq')}'${ws()})`;
    const str = () => pick([`"${cssAddress(url, 'dq')}"`, `'${cssAddress(url, 'sq')}'`]);
    const anyUrl = () => pick([bare, bare, dq, sq])();
    const forms = [
      anyUrl,
      () => `image-set(${ws()}${str()} 1x)`,
      () => `-webkit-image-set(${anyUrl()} ${pick(['1x', '2x', '96dpi'])})`,
      () => `image-set(${anyUrl()} 1x, ${anyUrl()} 2x)`,
      () => `image(${str()})`,
      () => `src(${str()})`,
      () => `cross-fade(${anyUrl()}, ${anyUrl()}, 50%)`,
      () => `${pick(['linear-gradient(red, blue)', 'none'])}, ${anyUrl()}`,
      () => `${anyUrl()} no-repeat center / cover`,
      () => `${anyUrl()} format("woff2")`,
      () => `${anyUrl()}${pick([' ', ''])}${comment()}`,
      () => `${anyUrl()}, auto`,
      () => `${anyUrl()} 4 4, pointer`,
      () => `${anyUrl()}#frag`,
    ];
    return pick(forms)();
  }

  const PROPS = ['background', 'background-image', 'border-image', 'border-image-source', 'list-style-image', 'list-style', 'content', 'cursor', 'mask', 'mask-image', '-webkit-mask-image', 'mask-border-source', 'shape-outside', 'filter', 'clip-path', 'offset-path', 'font-family', '-webkit-border-image', 'cursor', 'src'];

  /** One declaration holding a fetch. */
  function declaration(url) {
    const prop = pick(PROPS);
    const sep = pick([':', ' :', ': ', ':\n', ':\f']);
    const imp = chance(0.08) ? pick([' !important', '!important', ' ! important']) : '';
    return `${comment()}${prop}${sep}${cssValue(url)}${imp}`;
  }

  /** A custom property that holds a string or URL, read back through `var()` in a fetching position. */
  function customProperty(url) {
    const v = pick([`"${cssAddress(url, 'dq')}"`, cssValue(url)]);
    return `p{--q:${v}} p{${pick(['background-image', 'background', 'list-style-image', 'content'])}:${pick(['image-set(var(--q) 1x)', 'var(--q)', 'image-set(url(var(--q)) 1x)', 'image-set(var(--q))'])}}`;
  }

  const SELECTOR = ['p', 'p', 'p', '*', ':root', 'p, div', 'p:not(.x)', ':is(p, div)', 'p::before', 'p::after', 'p:hover', '[class]', ':where(p)', 'body > p', '@font-face'];

  /** A rule or at-rule holding the reference, with junk-free syntax. */
  function cssCore(url) {
    const kind = int(10);
    if (kind === 0) return `@import ${pick([`"${cssAddress(url, 'dq')}"`, `'${cssAddress(url, 'sq')}'`, cssValue(url)])}${pick(['', ' screen', ' layer(x)', ' supports(display:grid)', ' (min-width:0)'])};`;
    if (kind === 1) return `@font-face${ws()}{${pick(['font-family:q;', 'font-family:"}";', 'font-family:a b;', ''])}src:${cssValue(url)};${pick(['', 'unicode-range:U+0-10FFFF;', 'font-display:block;'])}} p{font-family:q}`;
    if (kind === 2) return customProperty(url);
    const sel = pick(SELECTOR);
    if (sel === '@font-face') return `@font-face{font-family:q;src:${cssValue(url)}} p{font-family:q}`;
    const body = [declaration(url)];
    if (chance(0.4)) body.unshift(`${pick(['color:red', 'x:y', '--a:"', 'margin:0'])};`);
    if (chance(0.3)) body.push(`;${pick(['color:blue', '--b:}', 'top:0'])}`);
    return `${sel}${ws()}{${ws()}${body.join(pick([';', ';', '; ']))}${pick(['', ';', ' ;'])}${ws()}}`;
  }

  const WRAPPERS = [
    (x) => `@media ${pick(['screen', 'all', '(min-width:0)', 'not print'])}{${x}}`,
    (x) => `@supports (display:block){${x}}`,
    (x) => `@layer ${pick(['a', 'a.b', ''])}{${x}}`,
    (x) => `@container (min-width:0){${x}}`,
    (x) => `@scope (div){${x}}`,
    // `@starting-style` is left out: Chrome 131 (the puppeteer build) hangs its renderer on `p::after{content:"x"}` inside one (measured
    // 2026-10-26, with no address involved), and a hung page tells the fuzz nothing about the scanners.
    (x) => `@document url-prefix(){${x}}`,
    (x) => `@keyframes k{from{${x.replace(/^[^{]*\{|\}[^}]*$/g, '')}}}`,
    (x) => `p{${x}}`,
    (x) => `p{&{${x}}}`,
    (x) => `@font-feature-values q{${x}}`,
    (x) => `@page{${x}}`,
    (x) => `@unknown ${pick(['x', '(', '[', '"'])}{${x}}`,
  ];

  /** Syntax that breaks the tokenizer's state just before the reference. */
  const CSS_JUNK = [
    '"unterminated', "'unterminated", '/* unterminated', '(', ')', ']', '[', '}', '{', ';', '\\', '\\\n', 'url(', 'url("', '@', '@x', '<!--', '-->', '\u0000', '﻿', '\\0 ', '"\n', "'\n", 'a{b:"', '}}', ';;;', '!important', ':', '#', '.', '~', 'u+', '1e', '--', '-', 'u\\72l(', '@import', "@charset 'x';", '\f', '"\r', 'url(\\"'];

  function cssInput(url) {
    let text = cssCore(url);
    for (let i = int(3); i > 0; i--) if (chance(0.5)) text = pick(WRAPPERS)(text);
    if (chance(0.45)) text = `${pick(CSS_JUNK)}${chance(0.5) ? '\n' : ''}${text}`;
    if (chance(0.25)) text = `${text}${pick(CSS_JUNK)}`;
    if (chance(0.15)) text = `${cssCore(`${url}-d`)}${text}`;
    return text;
  }

  // ── HTML spelling ───────────────────────────────────────────────────────────────────────────
  const NAMED = { ':': ['&colon;', '&#58;', '&#x3a;'], '/': ['&sol;', '&#47;', '&#x2F;'], '.': ['&period;', '&#46;'], '(': ['&lpar;', '&#40;'], ')': ['&rpar;', '&#41;'], '"': ['&quot;', '&#34;', '&QUOT'], "'": ['&apos;', '&#39;'], '#': ['&num;', '&#35;'], '&': ['&amp;', '&amp'], '<': ['&lt;', '&lt'], '>': ['&gt;', '&gt'] };

  /** The address as written in an HTML attribute value, with character references and URL-stripped chars. */
  function htmlAddress(url, ctx, p = 0.15) {
    let out = '';
    for (let i = 0; i < url.length; i++) {
      const ch = url[i];
      if (chance(p)) {
        const forms = [`&#${ch.codePointAt(0)};`, `&#x${ch.codePointAt(0).toString(16)};`, `&#x${ch.codePointAt(0).toString(16).toUpperCase()};`];
        // without the semicolon only when the next character cannot continue the number
        if (url[i + 1] === undefined || !/[0-9a-fA-F]/.test(url[i + 1])) forms.push(`&#${ch.codePointAt(0)}`);
        if (NAMED[ch]) forms.push(...NAMED[ch]);
        out += pick(forms);
      } else out += ch;
      // the URL parser removes tabs and newlines wherever they are
      if (chance(0.03)) out += pick(['\t', '\n', '\r', '&Tab;', '&NewLine;', '&#9;', '&#10;', '&#13;']);
    }
    // leading and trailing C0 controls and spaces are stripped too
    if (chance(0.1)) out = pick([' ', '\u0001', '\n', '\t', '\f', '&#32;', '&#1;', '&NewLine;']) + out;
    if (chance(0.06)) out += pick([' ', '\n', '&#32;']);
    if (ctx === 'bare') out = out.replace(/[\s"'`=<>]/g, '');
    return out;
  }

  const SEPARATORS = [' ', ' ', ' ', '\t', '\n', '\r', '\f', '\r\n', '/', ' / ', '//'];
  const attrName = (n) => (chance(0.15) ? n.toUpperCase() : chance(0.05) ? n.replace(/./, (c) => c.toUpperCase()) : n);

  /** `name=value` with a random quoting and a random gap round the `=`. */
  function attr(name, valueInner, { allowBare = true } = {}) {
    const eq = `${pick(['', '', '', ' ', '\n'])}=${pick(['', '', '', ' ', '\n'])}`;
    const q = pick(allowBare ? ['"', '"', "'", "'", ''] : ['"', "'"]);
    // the inner text was spelled for double quotes; a quote of the other kind would end the value early
    const inner = q === '"' ? valueInner.replace(/"/g, '&quot;') : q === "'" ? valueInner.replace(/'/g, '&#39;') : valueInner;
    return `${attrName(name)}${eq}${q}${inner}${q}`;
  }

  const LOADING = [
    ['img', 'src'], ['img', 'srcset'], ['image', 'src'], ['video', 'poster'], ['video', 'src'], ['audio', 'src'], ['source', 'src'], ['source', 'srcset'], ['track', 'src'], ['embed', 'src'], ['object', 'data'], ['iframe', 'src'], ['input type=image', 'src'], ['link rel=stylesheet', 'href'], ['link rel=icon', 'href'], ['link rel=preload as=image', 'href'], ['link rel=prefetch', 'href'], ['link rel=modulepreload', 'href'], ['script', 'src'], ['body', 'background'], ['table', 'background'], ['td', 'background'], ['th', 'background'], ['tr', 'background'], ['frame', 'src'], ['bgsound', 'src'], ['isindex', 'src'], ['meta http-equiv=refresh', 'content'], ['applet', 'code'], ['img', 'lowsrc'], ['img', 'dynsrc'], ['body', 'style'],
  ];
  const SVG_LOADING = [
    ['image', 'href'], ['image', 'xlink:href'], ['feImage', 'href'], ['feImage', 'xlink:href'], ['use', 'href'], ['use', 'xlink:href'], ['script', 'href'], ['pattern', 'href'], ['mpath', 'href'], ['rect fill', 'fill'], ['rect style', 'style'], ['rect mask', 'mask'], ['rect clip-path', 'clip-path'], ['rect filter', 'filter'], ['path marker-start', 'marker-start'], ['path marker-end', 'marker-end'], ['rect stroke', 'stroke'], ['text fill', 'fill'], ['circle cursor', 'cursor'],
  ];

  function tagWithAttr([tagAndFixed, attrName0], url, svg) {
    const [tag, ...fixed] = tagAndFixed.split(' ');
    const paint = ['fill', 'stroke', 'mask', 'clip-path', 'filter', 'marker-start', 'marker-end', 'cursor'].includes(attrName0);
    let value;
    if (paint || attrName0 === 'style') value = `${paint ? '' : `${pick(PROPS.filter((p) => p !== 'src'))}:`}${htmlAddress(cssValue(url), 'dq')}`;
    else if (attrName0 === 'srcset') value = `${htmlAddress(url, 'dq')} ${pick(['1x', '2x', '100w'])}`;
    else if (attrName0 === 'content') {
      const a = htmlAddress(url, 'dq');
      // the refresh grammar: a time, `;` `,` or space, an optional `url=`, an optional quote; or a data: page that fetches itself
      value = pick([`0;url=${a}`, `0; URL = ${a}`, `1,${a}`, `0 ${a}`, `0;url='${a.replace(/'/g, '&#39;')}'`, `;${a}`, `0;url=data:text/html,&lt;img src=${a}&gt;`]);
    }
    else value = htmlAddress(url, 'dq');
    const sep = () => pick(SEPARATORS);
    const fixedAttrs = fixed.map((f) => sep() + f).join('');
    const extra = chance(0.3) ? sep() + attr(pick(['class', 'id', 'title', 'alt', 'data-x', 'width']), pick(['x', '', 'a b', '>', '<']), {}) : '';
    // an `href` on a non-SVG element is not a load; keep the SVG ones in SVG
    const body = `<${svg ? tag : attrName(tag)}${fixedAttrs}${extra}${sep()}${attr(attrName0, value)}${chance(0.2) ? pick(['/', ' /', '//', '\n']) : ''}>`;
    return body;
  }

  const HTML_JUNK = ['<!--', '<!-->', '<!--->', '--!>', '-->', '<?x', '<!x', '</>', '</ x>', '<![CDATA[', ']]>', '<', '<<', '<a<b', '<a "', "<a '", '<a b="', '&', '&#', '&#x', '\u0000', '<plaintext>', '<xmp>', '<textarea>', '<title>', '<noembed>', '<noframes>', '<iframe>', '<noscript>', '<template>', '<select>', '<table>', '<math>', '<svg>', '<form>', '<p>', '</p>', '<br/>', '<a href="', '<img src=', '<style>', '</style>', '<script>', '</script>', '</svg>', '</math>', '</template>', '<base href="http://127.0.0.1:1/">'];

  const END_TAG = (name) => pick([`</${name}>`, `</${name.toUpperCase()}>`, `</${name} >`, `</${name}\n>`, `</${name}/>`, `</${name}\f>`, `</${name} x=y>`, `</${name}`, '']);

  /** A `<style>` (or SVG/MathML `<style>`) whose text holds a CSS fetch. */
  function styleElement(url) {
    const css = cssInput(url);
    const wrap = pick(['html', 'html', 'svg', 'math', 'svg-desc', 'select', 'template', 'table']);
    const body = (txt) => `<style${chance(0.2) ? ` ${attr('title', pick(['>', '</style>', 'x']))}` : ''}>${txt}${END_TAG('style')}`;
    // in foreign content the text is parsed as markup, so references in it are decoded
    const spelled = wrap === 'svg' || wrap === 'math' ? css.replace(/[(:/.)]/g, (c) => (chance(0.3) && NAMED[c] ? pick(NAMED[c]) : c)) : css;
    switch (wrap) {
      case 'svg': return `<svg>${body(spelled)}</svg>`;
      case 'math': return `<math>${body(spelled)}</math>`;
      case 'svg-desc': return `<svg><desc>${body(css)}</desc></svg>`;
      case 'select': return `<select>${body(css)}</select>`;
      case 'template': return `<template>${body(css)}</template>`;
      case 'table': return `<table>${body(css)}</table>`;
      default: return body(css);
    }
  }

  /** A raw-text or escapable-raw-text element that carries markup as text and then ends oddly. */
  function rawTextWrap(inner) {
    const name = pick(['textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'script', 'plaintext', 'template']);
    return `<${name}>${inner}${END_TAG(name)}`;
  }

  /** `<picture>`: a source chosen by media or type, with the address in `srcset` (or in the fallback image). */
  function pictureElement(url) {
    const a = htmlAddress(url, 'dq');
    const sources = [`<source ${attr('srcset', `${a} ${pick(['1x', '2x', '100w'])}`)}${chance(0.5) ? ` ${attr('media', pick(['all', '(min-width:0)', 'not all', '(min-width:1px)']))}` : ''}${chance(0.5) ? ` ${attr('type', pick(['image/png', 'image/webp', 'image/svg+xml', 'video/mp4']))}` : ''}>`];
    const img = chance(0.5) ? `<img ${attr('src', a)}>` : `<img ${attr('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=')}${chance(0.5) ? ` ${attr('srcset', `${a} 1x`)}` : ''}>`;
    return `<picture>${sources[0]}${img}</picture>`;
  }

  /** `xml:base`: the base an SVG or XHTML reference resolves against, with the relative reference apart from it. */
  function xmlBaseElement(url) {
    const dir = htmlAddress(url.replace(/[^/]+$/, ''), 'dq');
    const file = htmlAddress(url.replace(/^.*\//, ''), 'dq');
    const el = pick([`<image ${attr('href', file)}/>`, `<image ${attr('xlink:href', file)}/>`, `<use ${attr('href', file)}/>`, `<feImage ${attr('href', file)}/>`]);
    return chance(0.6) ? `<svg ${attr('xml:base', dir)}>${el}</svg>` : `<svg><g ${attr('xml:base', dir)}>${el}</g></svg>`;
  }

  /** A refresh that fires after a delay: the request arrives after the load settles, which a short wait misses. */
  function delayedRefresh(url) {
    const a = htmlAddress(url, 'dq');
    return `<meta http-equiv="refresh" content="${pick(['1', '1.0', '1 ;', '1;'])}${pick(['url=', ' url=', '; URL=', ', '])}${a}">`;
  }

  /** An address that is used only on a click, a submit or a hint: the harness clicks and submits, and counts idle connections. */
  function actionElement(url) {
    const a = htmlAddress(url, 'dq');
    return pick([
      () => `<a ${attr('ping', a)} ${attr('href', '#')}>x</a>`,
      () => `<area ${attr('ping', a)} ${attr('href', '#')} shape=rect coords="0,0,9,9">`,
      () => `<form ${attr('action', a)}${chance(0.5) ? ` ${attr('method', pick(['get', 'post', 'POST', 'dialog']))}` : ''}><input name=q value=1><input type=submit></form>`,
      () => `<form><button ${attr('formaction', a)}>x</button></form>`,
      () => `<form><input type=image ${attr('formaction', a)} ${attr('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=')}></form>`,
      () => `<link ${attr('rel', pick(['preconnect', 'dns-prefetch', 'prefetch', 'prerender', 'preload']))} ${attr('href', a)}${chance(0.5) ? ` ${attr('as', pick(['image', 'fetch', 'style', 'script']))}` : ''}>`,
    ])();
  }

  function htmlCore(url) {
    const kind = int(wide ? 18 : 14);
    if (kind >= 14) return actionElement(url);
    if (kind === 10) return pictureElement(url);
    if (kind === 11) return xmlBaseElement(url);
    if (kind === 12) return delayedRefresh(url);
    if (kind === 13) return `<img ${attr('srcset', `${htmlAddress(`${url}-a`, 'dq')} 1x, ${htmlAddress(url, 'dq')} 2x`)}>`;
    if (kind <= 1) return styleElement(url);
    if (kind === 2) return `<base ${attr('href', htmlAddress(url.replace(/[^/]+$/, ''), 'dq'))}><img ${attr('src', htmlAddress(url.replace(/^.*\//, ''), 'dq'))}>`;
    if (kind === 3) return `<svg ${pick(['', 'xmlns="http://www.w3.org/2000/svg" ', 'xmlns:xlink="http://www.w3.org/1999/xlink" '])}width="9" height="9">${tagWithAttr(pick(SVG_LOADING), url, true)}${pick(['', '</rect>', '</image>', '</feImage>'])}</svg>`;
    if (kind === 4) return `<math ${attr('href', htmlAddress(url, 'dq'))}><mi ${attr('style', `background:${htmlAddress(cssValue(url), 'dq')}`)}>x</mi></math>`;
    if (kind === 5) return `<div ${attr('style', `${htmlAddress(declaration(url), 'dq')}`)}>x</div>`;
    return tagWithAttr(pick(LOADING), url, false);
  }

  const HTML_WRAPPERS = [
    (x) => `<div>${x}</div>`,
    (x) => `<table><tr><td>${x}</td></tr></table>`,
    (x) => `<table>${x}</table>`,
    (x) => `<template>${x}</template>`,
    (x) => `<template shadowrootmode="open">${x}</template>`,
    (x) => `<div><template ${pick(['shadowrootmode', 'shadowroot'])}="open">${x}</template></div>`,
    (x) => `<svg>${x}</svg>`,
    (x) => `<svg><foreignObject>${x}</foreignObject></svg>`,
    (x) => `<svg><desc>${x}</desc></svg>`,
    (x) => `<math><mtext>${x}</mtext></math>`,
    (x) => `<math><annotation-xml encoding="text/html">${x}</annotation-xml></math>`,
    (x) => `<select>${x}</select>`,
    (x) => `<noscript>${x}</noscript>`,
    (x) => `<details>${x}</details>`,
    (x) => `<p>${x}`,
    (x) => `<a>${x}</a>`,
    (x) => `<form>${x}</form>`,
    (x) => `<!--${x}-->`,
    (x) => `<!--${x}--!>`,
    (x) => `<![CDATA[${x}]]>`,
    (x) => `<?x ${x}>`,
    (x) => `<!${x}>`,
    (x) => `</x ${x}>`,
    (x) => `<x ${x}>`,
    (x) => `<x y="${x.replace(/"/g, '&quot;')}">`,
    (x) => rawTextWrap(x),
  ];

  function htmlInput(url) {
    let text = htmlCore(url);
    for (let i = int(3); i > 0; i--) if (chance(0.55)) text = pick(HTML_WRAPPERS)(text);
    if (chance(0.4)) text = pick(HTML_JUNK) + text;
    if (chance(0.2)) text += pick(HTML_JUNK);
    if (chance(0.2)) text = htmlCore(`${url}-d`) + text;
    return text;
  }

  return { int, chance, pick, cssInput, htmlInput };
}

/**
 * @param {number} seed
 * @param {number} count
 * @param {string} base  the origin each input fetches from
 * @param {{ from?: number, wide?: boolean }} [opts]  `wide` adds the classes that act on a click, a submit or a hint
 *   (`ping`, `action`, `formaction`, `rel=preconnect`) and spells the host more ways; off, the stream is the one every
 *   published run used.  `from` skips the first inputs without generating them differently:
 *   input i depends only on (seed, i), so a failing index replays on its own
 * @returns {Array<{ name: string, kind: 'css' | 'html', text: string }>}
 */
function fuzzInputs(seed, count, base, { from = 0, wide = false } = {}) {
  const out = [];
  for (let i = from; i < from + count; i++) {
    // one stream per input: replaying index i never needs the i inputs before it (it does need the same base length)
    const next = prng((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
    const kit = makeKit(next, wide);
    const name = `f${(seed >>> 0).toString(36)}-${i}`;
    const kind = kit.chance(0.5) ? 'css' : 'html';
    // The scheme without its slashes, in capitals, or protocol-relative: absolute to the URL parser all the
    // same. A backslash is a slash in HTML but an escape in CSS, so only HTML gets those spellings.
    // (`http:host` and `http:/host` are absolute only on a page of another scheme; on the harness's http page they
    // are relative to it and fetch nothing from the beacon, so they are rare here and covered in the unit tests)
    const schemes = ['http://', 'http://', 'http://', 'http://', 'http://', 'http://', 'HTTP://', '//', '//', 'http:/', 'http:'];
    if (kind === 'html') schemes.push('Http:\\\\', 'http:\\/', '\\\\', '/\\');
    // The host spelled four ways the URL parser reads as the same loopback (`127.1`, a decimal, a hex), a second loopback
    // address (another origin), and `localhost`.
    const host = wide ? kit.pick(['127.0.0.1', '127.0.0.1', '127.0.0.1', '127.0.0.1', '127.0.0.1', '127.0.0.1', '127.1', '2130706433', '0x7f000001', '127.0.0.2', '127.0.0.2', 'localhost']) : '127.0.0.1';
    const url = `${base}/${name}`.replace('127.0.0.1', host).replace(/^http:\/\//, kit.pick(schemes));
    out.push({ name, kind, text: kind === 'css' ? kit.cssInput(url) : kit.htmlInput(url) });
  }
  return out;
}

module.exports = { fuzzInputs, prng };
