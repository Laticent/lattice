/**
 * html-ref-soups — seeded markup generators for the HTML reference readers (Segno R3): token soups built
 * from the pieces markup is made of, and foreign-content structures (an `<svg>`/`<math>`, integration
 * points, raw-text names, CDATA, comments, end tags of the foreign root where the browser ignores them).
 * test/unit/core/html-ref-differential.test.js and tools/check-html-ref-spans.mjs (`--fuzz`) read them.
 */
// Seeded, so a failure reproduces.
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const NAMES = ['img', 'IMG', 'p', 'br', 'a', 'svg', 'SVG', 'math', 'style', 'Style', 'script', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext', 'select', 'template', 'foreignObject', 'image', 'source', 'video', 'meta', 'base', 'styles', 'scripts', 'stylé', 'b', 'div', 'font', 'annotation-xml', 'mi'];
const PIECES = [
  '<', '</', '>', '/>', '/', ' ', '\t', '\n', '\r', '\f', '=', '"', "'", '`', '!', '?', '-', '--', '-->', '--!>', '--!', '->', '<!--', '<!---', '<!-->', '<!', '<?', '<!doctype html>',
  '<![CDATA[', ']]>', ']]', 'x', 'é', 'K', '&amp;', '&quot;', 'src=', 'src="https://x.test/a.png"', "href='//x.test/b'", 'srcset=a.png 2x', 'style="background:url(x)"', 'a', 'b=c', 'd e', '\u0000',
];
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const gen = (r) => {
  let out = '';
  const n = 1 + Math.floor(r() * 30);
  for (let k = 0; k < n; k++) {
    const p = r();
    if (p < 0.18) out += `<${pick(r, NAMES)}`;
    else if (p < 0.28) out += `</${pick(r, NAMES)}`;
    else out += pick(r, PIECES);
  }
  return out;
};
// Foreign content as a tree builder sees it: an `<svg>`/`<math>`, integration points, raw-text names and
// HTML inside them, CDATA and comments, and end tags of the foreign root where the browser ignores them.
const ROOTS = ['<svg>', '<math>', '<svg viewBox="0 0 1 1">', '<math display=block>'];
const POINTS = ['<desc>', '<title>', '<foreignObject>', '<mi>', '<mo>', '<mn>', '<ms>', '<mtext>', '<annotation-xml encoding=text/html>', '<desc/>', '<title/>'];
const INSIDE = [
  '<x>', '</x>', '<a href=h>', '</a>', '<p>', '</p>', '<b>', '<title>', '</title>', '<style>', '</style>', '<xmp>', '</xmp>', '<textarea>', '</textarea>', '<script>', '</script>',
  '<![CDATA[', ']]>', '<![CDATA[x]]>', '<![CDATA[>', '<!--', '-->', '<!-- c -->', '</svg>', '</math>', '</desc>', '</title>', '</mi>', '</mtext>', '</foreignObject>', '<g>', '</g>', '<path d=M0/>',
  '<img src=https://x.test/i.png>', '<image href="https://x.test/j.png"/>', '<source srcset=https://x.test/k.png>', 'text', '>', '<', '"', "'",
];
const genForeign = (r) => {
  let out = pick(r, ['', '<div>', '<p>', '<table>']) + pick(r, ROOTS);
  const n = 2 + Math.floor(r() * 14);
  for (let k = 0; k < n; k++) out += r() < 0.2 ? pick(r, POINTS) : r() < 0.08 ? pick(r, ROOTS) : pick(r, INSIDE);
  return out + pick(r, ['', '</svg>', '</math>', '<img src=https://x.test/after.png>']);
};

module.exports = { rng, gen, genForeign };
