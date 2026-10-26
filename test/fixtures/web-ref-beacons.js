/**
 * Spellings of a web fetch that a regex scan of CSS or HTML reads differently from the browser,
 * each one measured to fetch in Chromium before the fix (2026-10-20; three more 2026-10-22; the attribute rows 2026-10-23, found by the red team; the `<base>` and refresh rows 2026-10-26, found by the seeded fuzz). One table for two tiers:
 * test/unit/core/web-css-bypass.test.js runs the scanners on it, and
 * test/integration/invariants/web-ref-beacon.test.js loads each one in Chromium, unrewritten (it
 * must fetch, or the probe cannot see) and rewritten (it must not).
 *
 * `base` is the origin the payload fetches from; each payload fetches `${base}/<name>`, so a hit
 * names the spelling that made it.
 *   `css`   a stylesheet body, for `blockWebCss` and (inside `<style>`) `blockWebImages`
 *   `html`  slide markup, for `blockWebImages` only
 *   `font`  fetched only as an `@font-face` source: refused where no policy is behind the rewrite
 * A row with `noPolicy: true` is likewise refused only with `{ fonts: true }`, the no-policy host.
 */
// rows whose address sits inside a data: page, so no scanner can list it as a web address; only the navigation is refused
// rows only one engine fetches (the others decode the CSS first): the Chromium control cannot expect them
const FIREFOX_ONLY = new Set(['import-undecoded-escape']);
const OPAQUE = new Set(['iframe-srcdoc', 'iframe-data-page', 'object-data-svg']);
const NO_POLICY = new Set(['iframe-srcdoc', 'iframe-data-page', 'smil-set-href', 'object-data-svg', 'svg-fill-attr', 'svg-mask-attr', 'svg-clip-path-attr', 'svg-marker-attr', 'feimage-href', 'table-background', 'td-background']);

function webRefBeacons(base) {
  const u = (name) => `${base}/${name}`;
  const css = [
    // CSS ends a string at a form feed or a carriage return, not only at `\n`.
    ['ff-string', `a{b:"x\f}p{background:url(${u('ff-string')})}"}`],
    ['cr-string', `a{b:"x\r}p{background:url(${u('cr-string')})}"}`],
    // An escape is decoded before the function name is read; CRLF after the hex is one space.
    ['escaped-url', `p{background:u\\72l(${u('escaped-url')})}`],
    ['escaped-url-crlf', `p{background:u\\72\r\nl(${u('escaped-url-crlf')})}`],
    // A string is a target wherever an image goes, not only inside `url()`.
    ['image-set-string', `p{background-image:image-set("${u('image-set-string')}" 1x)}`],
    ['paren-in-quoted-url', `p{background:url("${u('paren-in-quoted-url')}?a(b)")}`],
    // Firefox's preloader fetches an @import string as written: `/\127.0.0.1` is `//127.0.0.1` there, a letter in CSS.
    ['import-undecoded-escape', `@import "/\\${base.replace('http://', '')}/import-undecoded-escape";`],
    ['import-string', `@import "${u('import-string')}";`],
    // A `}` in a string does not end an `@font-face` block.
    ['font-face-smuggle', `@font-face{font-family:"}"} p{background:url(${u('font-face-smuggle')})}`],
    // A string in a custom property is fetched where a child reads it as an image.
    ['custom-property-string', `p{--q:"${u('custom-property-string')}"} p{background-image:image-set(var(--q) 1x)}`],
    // `@font-face` used as a word inside a selector is not a font rule.
    ['font-face-in-selector', `:is(@font-face, p){background:url(${u('font-face-in-selector')})}`],
  ].map(([name, text]) => ({ name, kind: 'css', text, ...(FIREFOX_ONLY.has(name) && { onlyIn: 'firefox' }) }));
  const font = [{ name: 'font-face-src', kind: 'font', text: `@font-face{font-family:q;src:url(${u('font-face-src')})} p{font-family:q}` }];
  const html = [
    // An attribute value is decoded by the HTML parser, every named reference included.
    ['entity-in-style-attr', `<p style="background:url&lpar;${u('entity-in-style-attr')}&rpar;">x</p>`],
    // A `/`, or nothing at all after a quoted value, separates attributes too.
    ['slash-before-style', `<p/style="background:url(${u('slash-before-style')})">x</p>`],
    ['no-space-before-style', `<p title="x"style="background:url(${u('no-space-before-style')})">x</p>`],
    ['no-space-before-src', `<img alt="x"src="${u('no-space-before-src')}">`],
    // `</style` then a space closes the element; no end tag runs to the end.
    ['style-end-tag-space', `<style>p{background:url(${u('style-end-tag-space')})}</style ><p>x</p>`],
    ['style-never-closed', `<p>x</p><style>p{background:url(${u('style-never-closed')})}`],
    ['style-gt-in-attribute', `<style title=">">p{background:url(${u('style-gt-in-attribute')})}</style><p>x</p>`],
    // Inside <svg>, a <style> is markup: references decode and comments drop out.
    ['svg-style-named-entity', `<svg><style>p{background:url&lpar;${u('svg-style-named-entity')}&rpar;}</style></svg><p>x</p>`],
    ['svg-style-numeric-entity', `<svg><style>p{background:url&#40;${u('svg-style-numeric-entity')})}</style></svg><p>x</p>`],
    ['svg-style-comment', `<svg><style>p{background:url(<!-- -->${u('svg-style-comment')})}</style></svg><p>x</p>`],
    // A quote inside an unquoted value is a character, not a quote.
    ['quote-in-unquoted-value', `<img alt=a'b src=${u('quote-in-unquoted-value')}>`],
    // An SVG paint attribute is CSS, and a url() in it is fetched for the paint server. These and
    // the two rows after them are refused only where no policy backs the rewrite (`noPolicy`).
    ['svg-fill-attr', `<svg width="9" height="9"><rect width="9" height="9" fill="url(${u('svg-fill-attr')}#p)"/></svg>`],
    ['svg-mask-attr', `<svg width="9" height="9"><rect width="9" height="9" mask="url(${u('svg-mask-attr')}#m)"/></svg>`],
    ['svg-clip-path-attr', `<svg width="9" height="9"><rect width="9" height="9" clip-path="url(${u('svg-clip-path-attr')}#c)"/></svg>`],
    ['svg-marker-attr', `<svg width="9" height="9"><path d="M0 0L9 9" stroke="black" marker-start="url(${u('svg-marker-attr')}#k)"/></svg>`],
    // Elements outside the media set that load an address of their own.
    ['feimage-href', `<svg width="9" height="9"><filter id="f"><feImage href="${u('feimage-href')}"/></filter><rect width="9" height="9" filter="url(#f)"/></svg>`],
    ['table-background', `<table background="${u('table-background')}"><tr><td>x</td></tr></table>`],
    ['td-background', `<table><tr><td background="${u('td-background')}">x</td></tr></table>`],
    // Found by the seeded fuzz (test/fixtures/web-ref-fuzz.js, 2026-10-26). A `<base href>` points every
    // relative address at its origin; the `src="?"` beside it names none and fetches the base itself. A refresh `<meta>` navigates.
    ['base-href-relative-src', `<base href="${u('base-href-relative-src')}"><img src="?">`],
    ['meta-refresh', `<meta http-equiv="refresh" content="0;url=${u('meta-refresh')}">`],
    // `http:host` and `http:/host` carry no `//` and are absolute to the URL parser on a page of another scheme.
    ['base-scheme-no-slashes', `<base href="${u('base-scheme-no-slashes').replace('://', ':')}"><img src="?">`],
    ['meta-refresh-scheme-no-slashes', `<meta http-equiv="refresh" content="0;url=${u('meta-refresh-scheme-no-slashes').replace('://', ':/')}">`],
    // A comment that never ends swallows the rest of the tree, yet Chromium's preload scanner still fetches the
    // image after it when the markup is a document (found by the seeded fuzz, 2026-10-26).
    ['svg-style-open-comment', `<svg><style><!--\n</style></svg><img src="${u('svg-style-open-comment')}">`],
    // A nested document built in place, or a link an animation points at the web, fetches from inside;
    // only the no-policy host refuses these (the preview frames' policy does).
    ['iframe-srcdoc', `<iframe srcdoc="&lt;img src=${u('iframe-srcdoc')}&gt;"></iframe>`],
    ['iframe-data-page', `<iframe src="data:text/html,&lt;img src=${u('iframe-data-page')}&gt;"></iframe>`],
    ['smil-set-href', `<svg width="9" height="9"><image width="9" height="9" href="x"><set attributeName="href" to="${u('smil-set-href')}"/></image></svg>`],
    ['object-data-svg', `<object data="data:image/svg+xml,&lt;svg xmlns='http://www.w3.org/2000/svg'&gt;&lt;image href='${u('object-data-svg')}' width='9' height='9'/&gt;&lt;/svg&gt;"></object>`],
    // A declarative shadow root holds live markup that a DOMParser does not attach.
    ['declarative-shadow-root', `<div><template shadowrootmode="open"><p style="background:url(${u('declarative-shadow-root')})">x</p></template></div>`],
  ].map(([name, text]) => ({ name, kind: 'html', text, ...(NO_POLICY.has(name) && { noPolicy: true }), ...(OPAQUE.has(name) && { opaque: true }) }));
  return [...css, ...font, ...html];
}

/** A payload as slide markup: CSS goes inside a `<style>`, beside a paragraph it styles. */
const asHtml = (p) => (p.kind === 'html' ? p.text : `<style>${p.text}</style><p>x</p>`);

module.exports = { webRefBeacons, asHtml };
