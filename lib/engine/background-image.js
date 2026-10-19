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
const { resolveAssetUrl } = require('../core/bg-image');
const { assetName } = require('../core/remote-ref');
const { classify } = require('../core/media-sources');
const { urlVerdict } = require('../core/url-scheme');

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
/**
 * `sample:<name>` image targets become the samples folder's URL right after inline parsing,
 * before any other rule or transform reads them (lib/core/bg-image.js resolveAssetUrl). Doing
 * it ONCE here means every consumer downstream — the section background below, a component
 * transform in the repo, or the same transform running as a sandboxed code package that only
 * receives the slide's `baseUrl` (lib/packages/code-shape.mjs) — sees the same absolute URL, so
 * the in-repo render and the package render cannot differ. A no-op without `env.samplesUrl`.
 *
 * `asset:<name>` (a Library photo) resolves in the same rule, through `env.assetUrls`: the host's
 * name → URL map. One rule for both, so a `collage` photo list, an image slide and a prose image
 * all read the same resolved target (engineering/decisions/2026-10-12-library-media-assets.md).
 *
 * The same rule fills an EMPTY alt on an `asset:<name>` image from `env.assetAlts` (the host's
 * name → description map, from the photo's description in the Library). It runs here, at the
 * token, so a component transform that reads alt text later (a collage's lightbox caption and
 * narration, an image slide) sees what the prose image sees. An alt the author wrote is never
 * replaced, and a `![bg …]` directive is never an empty alt. Without `env.assetAlts` nothing
 * changes, so a deck that names no described photo exports the same bytes as before.
 */
function installSampleImages(md) {
  md.core.ruler.after('inline', 'lattice_sample_images', (state) => {
    const samplesUrl = state.env?.samplesUrl;
    const assetUrls = state.env?.assetUrls;
    const assetAlts = state.env?.assetAlts;
    for (const token of state.tokens) {
      if (!token.children) continue;
      for (const child of token.children) {
        if (child.type !== 'image') continue;
        const src = child.attrGet('src');
        // SCHEME ALLOWLIST, asked of what the author WROTE, before any host resolution below turns a `sample:`
        // or `asset:` name into the `blob:`, `file:` or https: URL the host owns (lib/core/url-scheme.js).
        if (src && isBackground(child)) {
          const verdict = urlVerdict(src);
          if (!verdict.ok) child.meta = { ...(child.meta || {}), schemeRefused: { raw: src, reason: verdict.reason } };
        }
        if (!samplesUrl && !assetUrls) continue;
        const row = src ? classify(src) : null;
        if (!row || (row.id !== 'sample' && row.id !== 'asset')) continue;
        if (assetAlts && row.id === 'asset' && !(child.content || '').trim()) {
          const key = assetName(src);
          const alt = key && Object.hasOwn(assetAlts, key) ? assetAlts[key] : '';
          if (typeof alt === 'string' && alt) {
            const text = new state.Token('text', '', 0);
            text.content = alt;
            child.content = alt;
            child.children = [text];
            // A description is not a directive: marked so `![](asset:x)` described as "bg contain" stays a picture.
            child.meta = { ...(child.meta || {}), assetAlt: true };
          }
        }
        child.attrSet('src', resolveAssetUrl(src, undefined, samplesUrl, assetUrls));
      }
    }
  });
}

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
          bg = readBackground(child, state.env);
        } else {
          kept.push(child);
        }
      }
      if (!bg) continue;

      token.children = kept;
      token.content = kept.map((c) => c.content || '').join('');
      applyBackground(slide, bg, state.env);

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
  // The alt an `asset:` photo was given from its description is text for a reader, never a `![bg …]` directive.
  if (imageToken.meta?.assetAlt) return false;
  const alt = imageToken.content || '';
  return /^bg(\s|$)/.test(alt.trim());
}

// The env carries the render's asset bases (lib/engine/index.js renderHtml), so a
// `sample:` background and a deck-relative one resolve here as they do in an image slide.
function readBackground(imageToken, env) {
  const alt = (imageToken.content || '').trim();
  const words = alt.split(/\s+/).slice(1); // drop the leading `bg`
  return {
    url: resolveAssetUrl(imageToken.attrGet('src') || '', env?.baseUrl, env?.samplesUrl, env?.assetUrls),
    size: sizeKeyword(words),
    // Set by the `lattice_sample_images` rule, which sees the src before the host resolves it.
    refused: imageToken.meta?.schemeRefused || null,
  };
}

function applyBackground(slide, bg, env) {
  if (bg.refused) {
    const diags = env?.pluginDiagnostics;
    const key = `meta/url-scheme|${bg.refused.raw}`;
    if (Array.isArray(diags) && !diags.some((d) => d.key === key)) {
      diags.push({ key, id: 'meta/url-scheme', plugin: 'meta', message: `![bg] was dropped: ${bg.refused.reason}.`, detail: String(bg.refused.raw).slice(0, 120) });
    }
    return;
  }
  const style = styleFor(slide);
  style.set('--background-image', cssUrl(bg.url));
  if (bg.size) style.set('--background-size', bg.size);
  style.set('background-image', cssUrl(bg.url));
  style.set('background-position', 'center');
  style.set('background-repeat', 'no-repeat');
  style.set('background-size', bg.size || 'cover');
  slide.attrSet('style', style.toString());
}

module.exports = { installBackgroundImage, installSampleImages };
