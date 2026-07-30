/**
 * meta Tile — kernel (single source of truth for all render paths).
 *
 * The Form `meta:` directive (design/forms.md §8): one deck-wide line — date ·
 * owner · classification — that docks at the top of every masthead-lifted
 * (`form`) slide's reserved `.masthead-bay`. ` | ` splits it into stacked,
 * right-aligned lines.
 *
 * SELF-CONTAINED FORM TILE (issue #356): the Tile owns its logic, CSS (meta.css)
 * and manifest in one folder, and exposes the adapters for all three render
 * paths from this single file (mirrors lib/components/<b>/<c>/<c>.transform.js):
 *
 *   · applyToHtml(html, markdown) — the HTML-string render path (the owned engine,
 *                                   lib/engine). Reads `meta:` from the deck front
 *                                   matter and fills every empty `.masthead-bay`.
 *   · applyToDom(doc, metaString) — the live-DOM render path (runtime/preview). The
 *                                   caller supplies the already-read `meta:`
 *                                   string (the runtime fetches the source `.md`).
 *   · readFrontMatter(src)        — the shared `meta:` front-matter reader, so the
 *                                   HTML path and the runtime fetch-wrapper parse
 *                                   it ONE way (was duplicated in lib/runtime/index.js).
 *
 * Both adapters are idempotent (only an EMPTY `.masthead-bay` / a bay without a
 * `.tile-meta` matches) so a preview re-render is a no-op.
 */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Read the Form `meta:` directive from a deck's front matter. One deck-wide
 * string; returns the trimmed value, or null when unset / no front matter.
 */
function readFrontMatter(src) {
  if (typeof src !== 'string' || !src.length) return null;
  const fmMatch = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fmMatch) return null;
  const m = fmMatch[1].match(/^[ \t]*meta:[ \t]*["']?(.*?)["']?[ \t]*$/m);
  const meta = m ? m[1].trim() : '';
  return meta || null;
}

/** Render a `meta:` string as the `.tile-meta` Tile markup. */
function toHtml(meta) {
  const lines = meta.split('|').map((s) => esc(s.trim())).filter(Boolean).join('<br>');
  return `<div class="tile-meta">${lines}</div>`;
}

/**
 * HTML-string adapter. Fill every still-empty `.masthead-bay` (built by the
 * masthead-lift pass) with the meta Tile. No-op without `meta:`. Idempotent —
 * only an empty bay matches, so a second pass does nothing.
 */
function applyToHtml(html, markdown) {
  const meta = readFrontMatter(markdown);
  if (!meta) return html;
  const block = toHtml(meta);
  return html.replace(/<div class="masthead-bay"><\/div>/g, `<div class="masthead-bay">${block}</div>`);
}

/**
 * Live-DOM adapter. `metaString` is the raw front-matter value (the caller reads
 * it); ` | ` splits into stacked lines. Fills each masthead bay that has no
 * `.tile-meta` yet. No-op without a value. Idempotent.
 */
function applyToDom(doc, metaString) {
  if (!doc || !metaString) return;
  const lines = String(metaString).split('|').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return;
  for (const bay of doc.querySelectorAll('section.form .cell-masthead .masthead-bay')) {
    if (bay.querySelector(':scope > .tile-meta')) continue; // idempotent
    const el = doc.createElement('div');
    el.className = 'tile-meta';
    el.innerHTML = lines.map(esc).join('<br>');
    bay.appendChild(el);
  }
}

module.exports = { readFrontMatter, toHtml, applyToHtml, applyToDom };
