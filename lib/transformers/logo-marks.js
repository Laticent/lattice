/**
 * logo-marks transformer — render `logo-wall` marks as token-colored masks.
 *
 * A `logo-wall` mark is authored as a prose image (`- ![Acme](acme.svg)`), which
 * the engine renders as `<img src>`. An `<img>` shows its own pixels, so its
 * color can't follow our palette — the old treatment could only desaturate it
 * with a CSS `filter`, which is a luminance-derived gray, not a token, and on a
 * dark canvas it fell below AA. This transform converts each mark into a
 * `<span class="logo-mark">` whose silhouette rides as a CSS `mask` and whose
 * fill is `background: var(--logo-ink)` — a real palette token that resolves per
 * theme and per color-mode (`light-dark()`), so every mark is AA on both
 * grounds. The `color` variant cycles the categorical `--cat-*-mark` tokens for
 * per-mark on-palette hues. See logo-wall.styles.css + logo-wall.docs.md.
 *
 * The mask source is the SAME SVG the author referenced — only its ROLE changes
 * (rendered image → alpha stencil). The mark's accessible name moves from the
 * img `alt` to the span's `aria-label` (role="img"), so the credential still
 * reads to a screen reader.
 *
 * URL resolution mirrors the inline-image rule (lib/core/bg-image.js): the web
 * preview passes a `baseUrl`, against which the relative `acme.svg` resolves to
 * an absolute, same-origin URL the mask can fetch from inside the srcdoc iframe.
 * The CLI/emulator passes no baseUrl (Chromium blocks `file://` mask resources
 * anyway), so it leaves the URL relative and inlines the SVG as a data-URI mask
 * in a post-pass — see lattice-emulator.js.
 *
 * Two render forms, one behavior:
 *   - applyToHtml — the engine render path (playground + emulator), full HTML
 *     string. Scoped to `section.logo-wall`; rewrites each `<img>` to a span.
 *   - applyToDom  — the live runtime (marp-vscode preview), where `img.src` is
 *     already DOM-resolved to an absolute URL.
 *
 * Idempotent: once a section's marks are spans there are no `<img>` left, so a
 * second pass (engine then runtime, during a preview refresh) is a no-op.
 */

const { resolveAssetUrl } = require('../core/bg-image');

// One `<section …>…</section>` (slides don't nest sections in Lattice).
const SECTION_RE = /<section\b([^>]*)>([\s\S]*?)<\/section>/g;
// An `<img …>` (self-closing or not); captures its attribute run.
const IMG_RE = /<img\b([^>]*?)\/?>/gi;

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

// Only a genuine MARK becomes a mask: a plain `<img src alt>` from `- ![Acme](…)`.
// Chrome the engine injects into a logo-wall section — the corner `img.deck-logo`
// (aria-hidden) or an `img.emoji` in the title — carries a class or aria-hidden
// and must be left alone (masking it would recolour it and strip its role). A
// srcless `![]()` is skipped too (an empty mask paints nothing).
function isMark(attrs) {
  return Boolean(attr(attrs, 'src')) && !/\sclass\s*=|\saria-hidden\b/i.test(attrs);
}

function markSpan(imgAttrs, baseUrl) {
  const src = resolveAssetUrl(attr(imgAttrs, 'src'), baseUrl).replace(/'/g, '%27');
  const alt = attr(imgAttrs, 'alt');
  const label = alt ? ` aria-label="${alt}"` : '';
  return `<span class="logo-mark" role="img"${label} style="--logo-mask:url('${src}')"></span>`;
}

function applyToHtml(html, ctx) {
  if (typeof html !== 'string' || html.indexOf('logo-wall') === -1) return html;
  const baseUrl = ctx?.baseUrl;
  return html.replace(SECTION_RE, (whole, attrs, inner) => {
    if (!/\blogo-wall\b/.test(attrs) || inner.indexOf('<img') === -1) return whole;
    return `<section${attrs}>${inner.replace(IMG_RE, (m, a) => (isMark(a) ? markSpan(a, baseUrl) : m))}</section>`;
  });
}

function applyToDom(root) {
  const scope = root?.querySelectorAll ? root : root?.ownerDocument;
  if (!scope?.querySelectorAll) return;
  for (const section of scope.querySelectorAll('section.logo-wall')) {
    // Only genuine marks (a plain `<img src alt>`) are masked. The deck-logo and
    // any emoji img carry a class (and the deck-logo is aria-hidden), so the
    // guard leaves them — and the mark's role/color — untouched.
    for (const img of [...section.querySelectorAll('img')]) {
      if (!img.getAttribute('src') || img.className || img.hasAttribute('aria-hidden')) continue;
      const span = section.ownerDocument.createElement('span');
      span.className = 'logo-mark';
      span.setAttribute('role', 'img');
      if (img.getAttribute('alt')) span.setAttribute('aria-label', img.getAttribute('alt'));
      // img.src is the DOM-resolved absolute URL — exactly what the mask needs.
      span.setAttribute('style', `--logo-mask:url('${img.src.replace(/'/g, '%27')}')`);
      img.replaceWith(span);
    }
  }
}

module.exports = {
  name: 'logo-marks',
  selector: 'section.logo-wall img',
  applyToHtml,
  applyToDom,
  markSpan, // exported for unit tests
};
