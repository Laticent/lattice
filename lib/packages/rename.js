/**
 * Renaming a COMPONENT package's identity inside its own files — for the reserved-name
 * rule (engineering/decisions/2026-09-23-portable-packages.md §3.7): a user package that
 * would take a shipped component's name is saved as `<name>-custom`, and its CSS and its
 * gallery slide must follow, or the renamed package would still style `.kpi`.
 *
 * Shared by the Studio (docs/src/components/studio/library/reserved-names.ts) and the
 * CLI (lib/packages/cli.js). A dependency-free leaf, so the docs dev server can
 * default-import it.
 */

const esc = (s) => String(s).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

/**
 * Rewrite a component's class `.from` to `.to` in its CSS: the class token (`section.kpi`,
 * `:is(.kpi)`) and a class ATTRIBUTE selector whose value is exactly the name
 * (`[class~="kpi"]`). `.kpi-row` and `.kpis` are different classes and stay.
 */
function renameComponentSelectors(css, from, to) {
  if (!from || from === to) return css;
  const e = esc(from);
  return String(css == null ? '' : css)
    .replace(new RegExp(`\\.${e}(?![A-Za-z0-9_-])`, 'g'), `.${to}`)
    .replace(new RegExp(`(\\[\\s*class\\s*[~|^$*]?=\\s*)(["']?)${e}\\2(?=[\\s\\]])`, 'g'), `$1$2${to}$2`);
}

/**
 * Rewrite `from` → `to` as a whole token inside every `<!-- _class: … -->` and
 * `<!-- class: … -->` directive of a gallery slide. The Studio's deck-wide renamer
 * (asset-rename.ts) is fence-aware and splices spans; a package's gallery is one short
 * sample slide the package itself owns, so a directive-scoped token swap is enough here.
 */
function renameClassDirectives(md, from, to) {
  if (!from || from === to) return md;
  const e = esc(from);
  return String(md == null ? '' : md).replace(/<!--\s*_?class\s*:[^>]*-->/g, (dir) =>
    dir.replace(new RegExp(`(^|[\\s:])${e}(?=[\\s]|-->)`, 'g'), `$1${to}`),
  );
}

module.exports = { renameComponentSelectors, renameClassDirectives };
