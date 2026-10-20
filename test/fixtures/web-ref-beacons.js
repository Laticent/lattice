/**
 * Spellings of a web fetch that a regex scan of CSS or HTML reads differently from the browser,
 * each one measured to fetch in Chromium before the fix (2026-10-20). One table for two tiers:
 * test/unit/core/web-css-bypass.test.js runs the scanners on it, and
 * test/integration/invariants/web-ref-beacon.test.js loads each one in Chromium, unrewritten (it
 * must fetch, or the probe cannot see) and rewritten (it must not).
 *
 * `base` is the origin the payload fetches from; each payload fetches `${base}/<name>`, so a hit
 * names the spelling that made it.
 *   `css`   a stylesheet body, for `blockWebCss` and (inside `<style>`) `blockWebImages`
 *   `html`  slide markup, for `blockWebImages` only
 *   `font`  fetched only as an `@font-face` source: refused where no policy is behind the rewrite
 */
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
    ['import-string', `@import "${u('import-string')}";`],
    // A `}` in a string does not end an `@font-face` block.
    ['font-face-smuggle', `@font-face{font-family:"}"} p{background:url(${u('font-face-smuggle')})}`],
    // A string in a custom property is fetched where a child reads it as an image.
    ['custom-property-string', `p{--q:"${u('custom-property-string')}"} p{background-image:image-set(var(--q) 1x)}`],
  ].map(([name, text]) => ({ name, kind: 'css', text }));
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
  ].map(([name, text]) => ({ name, kind: 'html', text }));
  return [...css, ...font, ...html];
}

/** A payload as slide markup: CSS goes inside a `<style>`, beside a paragraph it styles. */
const asHtml = (p) => (p.kind === 'html' ? p.text : `<style>${p.text}</style><p>x</p>`);

module.exports = { webRefBeacons, asHtml };
