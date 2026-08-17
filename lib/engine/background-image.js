/**
 * lattice-engine — `![bg …]` background images (basic mode).
 *
 * Reproduces marp-core's NON-inline-SVG background handling (the `inlineSVG:
 * false` path the playground/web runtime use): an image whose alt begins with
 * the `bg` keyword is consumed out of the content flow and applied to the
 * section as a CSS background, emitting 0 `<img>` elements. The directional
 * `bg left` / `bg right` split and multi-image advanced backgrounds require
 * Marpit's inline-SVG container DOM — that is the P1.1 milestone (the PDF path);
 * in basic mode marp-core itself collapses them to a single full-bleed
 * background, which is what we match here.
 *
 * Style contract. The REAL declarations mirror marp-core's inlineSVG:false output exactly:
 *   background-image:url("…");background-position:center;
 *   background-repeat:no-repeat;background-size:<cover|contain>;
 *
 * The two CUSTOM PROPERTIES deliberately DIVERGE from marp-core, and this comment claimed
 * for a while that they did not. Every custom property the engine writes is emitted as a
 * quoted CSS string, so the pair is:
 *   --background-image:"url(\"…\")";[--background-size:"<fit>";]
 * — a string, not a `url()` token, and not usable as `background-image: var(--background-
 * image)`. That is the price of making a directive value structurally unable to inject a
 * declaration (see the block above `quoteDeclValue` in slides.js); the properties are
 * informational, nothing in the engine reads either one back, and the real declaration
 * beside them is what paints. An external consumer reading `--background-image` as a URL is
 * the one thing this breaks, which is why it is written down rather than left to be
 * rediscovered.
 *
 * Marp reference: @marp-team/marpit lib/markdown/background_image/*.
 */



const { styleFor } = require('./slides');

// Map the size keyword in a `bg` alt to its CSS background-size value.
function sizeKeyword(words) {
  if (words.includes('fit') || words.includes('contain')) return 'contain';
  if (words.includes('cover')) return 'cover';
  if (words.includes('auto')) return 'auto';
  return null; // default → cover, but only the explicit forms emit --background-size
}

function cssUrl(url) {
  // Store real double quotes; markdown-it's attribute renderer HTML-escapes
  // them to &quot; exactly once when it writes the style attribute. Pre-escaping
  // here would double-escape (&amp;quot;). Inner quotes are percent-encoded, as
  // marp-core does.
  //
  // True for the REAL `background-image` declaration only. The `--background-image` copy is
  // additionally backslash-escaped on its way into a CSS string, so the same bytes leave
  // here and land in two different shapes — see the contract note at the top of the file.
  return `url("${url.replace(/"/g, '%22')}")`;
}

/**
 * Install the background-image ruler. Runs after directive application so it can
 * append to any background already set by a `backgroundImage:` directive, and
 * removes the consumed image (and any paragraph it leaves empty) from the flow.
 */
function installBackgroundImage(md) {
  md.core.ruler.after('lattice_directives_apply', 'lattice_background_image', (state) => {
    if (state.inlineMode) return;
    let slide = null;
    const drop = new Set(); // indices of tokens to remove (emptied paragraphs)
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'lattice_slide_open') { slide = token; continue; }
      if (token.type === 'lattice_slide_close') { slide = null; continue; }
      if (!slide || token.type !== 'inline' || !token.children) continue;

      const kept = [];
      let bg = null;
      for (const child of token.children) {
        if (child.type === 'image' && isBackground(child)) {
          bg = readBackground(child);
        } else {
          kept.push(child);
        }
      }
      if (!bg) continue;

      token.children = kept;
      token.content = kept.map((c) => c.content || '').join('');
      applyBackground(slide, bg);

      // If the paragraph that held the bg image is now empty, drop it (open +
      // inline + close) so no empty <p> ships — matching marp-core.
      if (token.content.trim() === '' && kept.length === 0) {
        drop.add(i);
        if (tokens[i - 1] && tokens[i - 1].type === 'paragraph_open') drop.add(i - 1);
        if (tokens[i + 1] && tokens[i + 1].type === 'paragraph_close') drop.add(i + 1);
      }
    }

    if (drop.size) state.tokens = tokens.filter((_, i) => !drop.has(i));
  });
}

function isBackground(imageToken) {
  const alt = imageToken.content || '';
  return /^bg(\s|$)/.test(alt.trim());
}

function readBackground(imageToken) {
  const alt = (imageToken.content || '').trim();
  const words = alt.split(/\s+/).slice(1); // drop the leading `bg`
  return {
    url: imageToken.attrGet('src') || '',
    size: sizeKeyword(words),
  };
}

function applyBackground(slide, bg) {
  const style = styleFor(slide);
  style.set('--background-image', cssUrl(bg.url));
  if (bg.size) style.set('--background-size', bg.size);
  style.set('background-image', cssUrl(bg.url));
  style.set('background-position', 'center');
  style.set('background-repeat', 'no-repeat');
  style.set('background-size', bg.size || 'cover');
  slide.attrSet('style', style.toString());
}

module.exports = { installBackgroundImage };
