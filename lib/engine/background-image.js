/**
 * lattice-engine — picture addresses: `sample:` and `asset:` names resolved once, right after inline parsing.
 *
 * This file used to draw Marp's `![bg …]` keyword pictures: on an `image` slide as the `.lattice-bg` panel, anywhere else
 * as the section's CSS background. The engine stopped reading the keywords on 2026-11-13 (the engine break,
 * engineering/decisions/2026-10-16-media-plugins.md §8 decision 2 and §9): a `![bg](x)` is an ordinary picture now, the
 * image plugin's `image-marp-keyword` lint warns on it, and its fix writes Markdown's picture, which a slide that places a
 * picture (`image`, `bleed`) draws as its photo through the image record's path (lib/integrations/markdown-it/plugins.js).
 * The Marp export still WRITES `![bg]`, because Marp reads it (lib/plugins/image/shared/image-marp-export.js), and lifts it
 * in its own source (lib/core/bg-image-lift.js).
 */

const { resolveAssetUrl } = require('../core/bg-image');
const { assetName } = require('../core/media-sources');
const { classify } = require('../core/media-sources');

/**
 * `sample:<name>` image targets become the samples folder's URL right after inline parsing,
 * before any other rule or transform reads them (lib/core/bg-image.js resolveAssetUrl). Doing
 * it ONCE here means every consumer downstream — the section background below, a component
 * transform in the repo, or the same transform running as a sandboxed code package that only
 * receives the slide's `baseUrl` (lib/core/code-shape.mjs) — sees the same absolute URL, so
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
 * replaced. Without `env.assetAlts` nothing
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
        if (!samplesUrl && !assetUrls) continue;
        const row = src ? classify(src) : null;
        if (!row || !row.named) continue;
        if (assetAlts && row.id === 'asset' && !(child.content || '').trim()) {
          const key = assetName(src);
          const alt = key && Object.hasOwn(assetAlts, key) ? assetAlts[key] : '';
          if (typeof alt === 'string' && alt) {
            const text = new state.Token('text', '', 0);
            text.content = alt;
            child.content = alt;
            child.children = [text];
            // A description is not a directive: marked so `![](asset:x)` described as "BG team at the offsite" is still placed
            // (lib/core/placed-picture.mjs `isMarpKeywordPicture`).
            child.meta = { ...(child.meta || {}), assetAlt: true };
          }
        }
        // The name the author wrote rides on the token: a picture an `image` or `bleed` slide places is drawn by the image
        // record's path (lib/integrations/markdown-it/plugins.js), which reads the address the author wrote, never the host's URL.
        child.meta = { ...(child.meta || {}), authoredSrc: src };
        child.attrSet('src', resolveAssetUrl(src, undefined, samplesUrl, assetUrls));
      }
    }
  });
}

module.exports = { installSampleImages };
