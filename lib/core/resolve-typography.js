/**
 * lib/core/resolve-typography.js
 *
 * The deck front-matter `typography:` register picks one CURATED TYPE SET: the heading and
 * body faces, the eyebrow's voice and the chart's text voice, audited together. There is no
 * free font knob on purpose. The hierarchy study measured 54 free combinations of face,
 * chrome voice and eyebrow, and 30 of them broke its rules, so the axes stay inside the sets
 * (engineering/decisions/2026-11-09-type-voices.md § Decided, and
 * 2026-11-09-type-hierarchy-study.md §4 for the nine rules each set keeps).
 *
 *   typography: classic   → (no class)            Playfair Display + Outfit   the default
 *   typography: ledger    → `typography-ledger`   Newsreader + Inter          reports, government, academic
 *   typography: poster    → `typography-poster`   Barlow Condensed + Inter    launches, sales, brand
 *   typography: festival  → `typography-festival` Fraunces + Inter            culture, nonprofit, donors
 *
 * Every set keeps the chrome in today's mono capitals, sets the eyebrow in its heading face's
 * italic, and draws the chart's ticks, keys and categories in the body face with aligned
 * figures. Where a heading face has no tabular figures (Playfair Display, Fraunces) the
 * chart's data labels take the body face, and so do Barlow Condensed's, whose figures align only
 * through `tnum`, which the PPTX and ODP exports drop. Only Newsreader sets them.
 *
 * The CSS for each set is lib/base/base.typography.css. The faces ship through the one font
 * manifest (lib/fonts/text-faces.js), so a deck that names no set never fetches or embeds
 * them. `mode: sketch` owns its own type and wins over any set (base.sketch.css follows the
 * set CSS in the bundle).
 *
 * `preset:` carries a set (front-matter-key.js): editorial → ledger, brand → poster, and an
 * explicit `typography:` wins, as every other key beats a preset.
 *
 * Sibling of venue:/lift:/mode: — a thin map from a value to a class token appended to every
 * <section>, overridable per slide. Both render paths read the value with `frontMatterName`
 * (front-matter-key.js, which applies the preset) and map it here, so they produce identical
 * class lists (HARD RULE #1). A LEAF, deliberately: no `require`, so the Studio imports the set
 * list from this file (docs/src/plugins/vite-cjs-lib-dev.mjs serves only leaf modules).
 */

/**
 * The curated sets, in panel order. `families` names the faces a set draws, so an export can
 * embed only what a deck uses; `display` and `body` are the CSS family names.
 */
const TYPOGRAPHY_SETS = Object.freeze({
  classic: Object.freeze({
    label: 'Classic',
    desc: 'Playfair Display headings over Outfit — the house default.',
    display: 'Playfair Display',
    body: 'Outfit',
    cls: '',
  }),
  ledger: Object.freeze({
    label: 'Ledger',
    desc: 'Newsreader headings over Inter — quiet and exact, for reports.',
    display: 'Newsreader',
    body: 'Inter',
    figure: 'display',
    cls: 'typography-ledger',
  }),
  poster: Object.freeze({
    label: 'Poster',
    desc: 'Barlow Condensed headings over Inter — a campaign voice for launches.',
    display: 'Barlow Condensed',
    body: 'Inter',
    cls: 'typography-poster',
  }),
  festival: Object.freeze({
    label: 'Festival',
    desc: 'Fraunces headings over Inter — warm, for culture and donor decks.',
    display: 'Fraunces',
    body: 'Inter',
    cls: 'typography-festival',
  }),
});

/** The recognized set names (for the deck-lint vocabulary, completion and docs). */
const TYPOGRAPHY_NAMES = Object.freeze(Object.keys(TYPOGRAPHY_SETS));

/**
 * The per-slide class tokens: one per set. The deck-wide default stamps nothing, but a slide in a
 * `ledger` deck can still ask for classic type with `_class: typography-classic`, which
 * base.typography.css resets to the default faces.
 */
const TYPOGRAPHY_TOKENS = Object.freeze(TYPOGRAPHY_NAMES.map((n) => `typography-${n}`));

/** The default set — what a deck that names none (and no preset that names one) gets. */
const TYPOGRAPHY_DEFAULT = 'classic';

/** True when `token` is a typography-set class. */
function isTypographyToken(token) {
  return TYPOGRAPHY_TOKENS.includes(String(token || ''));
}

/** True if `value` names a curated set (case-insensitive). */
function isKnownTypography(value) {
  return typeof value === 'string' && Object.hasOwn(TYPOGRAPHY_SETS, value.trim().toLowerCase());
}

/** Map a set name to its class token ('' for classic, empty and unknown). */
function typographyClass(value) {
  if (!isKnownTypography(value)) return '';
  return TYPOGRAPHY_SETS[value.trim().toLowerCase()].cls;
}

/** The generic fallback after each face, by role and set. */
const FALLBACK = { display: { poster: "'Arial Narrow', sans-serif" }, body: {} };

/**
 * CSS for a host that lifts slide content OUT of its <section>s (the HTML player's Read · Article
 * view): one rule per set on `<scope>.typography-<set>`, re-pointing the faces and the chart's
 * figure face the way lib/base/base.typography.css does for a slide. The voice tokens that name a
 * face are re-declared on the scope itself, because on `:root` they resolved against the root's
 * faces. Built from the table above, so a new set reaches the article without an edit there.
 * @param {string} scope  a selector, e.g. `#lp-article`
 */
function articleTypographyCss(scope) {
  const stack = (role, name) => {
    const face = TYPOGRAPHY_SETS[name][role];
    const tail = FALLBACK[role][name] || (role === 'display' ? 'Georgia, serif' : 'system-ui, sans-serif');
    return `'${face}', ${tail}, 'Noto Color Emoji'`;
  };
  let css = `${scope}{--eyebrow-face:var(--font-display);--chart-text-face:var(--font-body);--chart-figure-face:var(--font-body)}`;
  for (const name of TYPOGRAPHY_NAMES) {
    const set = TYPOGRAPHY_SETS[name];
    css += `${scope}.typography-${name}{--font-display:${stack('display', name)};--font-body:${stack('body', name)}${set.figure === 'display' ? ';--chart-figure-face:var(--font-display)' : ''}}`;
  }
  return css;
}

/**
 * The families only a non-default set draws (Newsreader, Fraunces, Barlow Condensed, Inter): what
 * a deck that names no set must never load. Derived from the table, so a new set enrolls itself.
 */
const SET_ONLY_FAMILIES = Object.freeze([...new Set(
  TYPOGRAPHY_NAMES.filter((n) => n !== TYPOGRAPHY_DEFAULT).flatMap((n) => [TYPOGRAPHY_SETS[n].display, TYPOGRAPHY_SETS[n].body]),
)].filter((f) => f !== TYPOGRAPHY_SETS[TYPOGRAPHY_DEFAULT].display && f !== TYPOGRAPHY_SETS[TYPOGRAPHY_DEFAULT].body));

/**
 * The set-only families a deck draws, given its effective `typography:` value (a preset's
 * included) and its source, which may name a set per slide (`_class: typography-poster`).
 * A host that inlines fonts embeds these on top of the engine's own faces and nothing more.
 */
function setFamiliesFor(deckValue, source) {
  const names = new Set();
  if (isKnownTypography(deckValue)) names.add(deckValue.trim().toLowerCase());
  for (const m of String(source || '').matchAll(/\btypography-(ledger|poster|festival)\b/g)) names.add(m[1]);
  const fams = new Set();
  for (const n of names) for (const f of [TYPOGRAPHY_SETS[n].display, TYPOGRAPHY_SETS[n].body]) if (SET_ONLY_FAMILIES.includes(f)) fams.add(f);
  return [...fams];
}

module.exports = {
  SET_ONLY_FAMILIES,
  setFamiliesFor,
  articleTypographyCss,
  TYPOGRAPHY_SETS,
  TYPOGRAPHY_NAMES,
  TYPOGRAPHY_TOKENS,
  TYPOGRAPHY_DEFAULT,
  isTypographyToken,
  isKnownTypography,
  typographyClass,
};
