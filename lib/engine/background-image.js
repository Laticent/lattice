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
const { resolveAssetUrl, bgPanel } = require('../core/bg-image');
const { assetName } = require('../core/media-sources');
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
        if (!row || !row.named) continue;
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

/**
 * ON AN `image` SLIDE THE PICTURE IS THE LAYOUT'S PANEL, not the section's background: the rule writes
 * the `.lattice-bg` div the `image` layout positions (lib/core/bg-image.js `bgPanel`) where the picture
 * stood. It reads the slide's class as `lattice_directives_apply` resolved it, so the engine's own
 * slide boundaries and directives decide which slide a `![bg]` is on: a setext heading, a `***` rule, a
 * `---` inside math, a directive indented as code. A source pre-pass used to guess that with a line walk
 * and disagreed with the engine on 506 of 1,463 fuzzed pictures (followups.d/2739-p10). One parse, no
 * source offsets. A split pane's page is an ordinary `image` slide by now (lib/core/panes.js), so its
 * picture lifts too (followups.d/2739-p13).
 *
 * A paragraph that holds nothing but pictures becomes one HTML block, the markup a pre-pass would have
 * produced from the same lines; a picture inside prose becomes inline HTML in its place, and the line
 * break after it goes with it. A `![bg]` written inside a raw HTML block is text to markdown-it, as any
 * markdown there is, so it stays text (the pre-pass used to lift it; no committed deck has the shape, and
 * the branch cost more engine bytes than the budget leaves). The Marp export, which ships Markdown, keeps
 * the source lift (lib/core/bg-image-lift.js, loaded on its own as esm/bg-image-lift.js).
 */

// Mutates the tokens in place (an image becomes `html_inline`, a pictures-only paragraph's inline token
// becomes the `html_block`): no new token objects, and fewer engine bytes.
function liftToPanels(tokens, i, drop, env) {
  const token = tokens[i];
  const isBg = (c) => c.type === 'image' && isBackground(c);
  // A URL the scheme allowlist refuses draws nothing, as the source lift did (the section background reports it).
  const panel = (c) => {
    const bg = readBackground(c, env);
    return bg.refused ? '' : bgPanel(c.content.trim().slice(2), bg.url);
  };
  const br = (c) => c?.type === 'softbreak' || c?.type === 'hardbreak';
  if (!tokens[i - 1].hidden && tokens[i - 1].type === 'paragraph_open' && token.children.every((c) => isBg(c) || br(c) || !c.content.trim())) {
    token.type = 'html_block';
    token.content = `${token.children.map((c) => (isBg(c) ? panel(c) : br(c) ? '\n' : c.content)).join('')}\n`;
    token.children = null;
    drop.add(i - 1).add(i + 1);
    return;
  }
  // In prose, the line break after a picture goes with it: it would open the text panel with an empty line.
  token.children = token.children.filter((c, k, all) => !(br(c) && isBg(all[k - 1])));
  for (const c of token.children) if (isBg(c)) [c.type, c.content, c.children] = ['html_inline', panel(c), null];
}

function installBackgroundImage(md) {
  md.core.ruler.after('lattice_directives_apply', 'lattice_background_image', (state) => {
    if (state.inlineMode) return;
    let slide = null;
    let panels = false;
    const drop = new Set(); // indices of tokens to remove (emptied paragraphs)
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'lattice_slide_open') { slide = token; panels = /(^| )image( |$)/.test(token.attrGet('class') || ''); continue; }
      if (token.type === 'lattice_slide_close') { slide = null; continue; }
      if (!slide || token.type !== 'inline' || !token.children) continue;
      if (panels) {
        if (token.children.some((c) => c.type === 'image' && isBackground(c))) liftToPanels(tokens, i, drop, state.env);
        continue;
      }

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
