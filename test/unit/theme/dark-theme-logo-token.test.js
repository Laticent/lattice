/**
 * A dark-canvas THEME must be reachable by the rule that flips the deck logo (#2156).
 *
 * THE DEFECT. A `variant-dark` theme is a thin wrapper whose entire content is
 * `:root { color-scheme: dark }`. It makes the whole deck dark without touching a single
 * slide class, so every class-keyed rule in `base.modifiers.css` is blind to it and the
 * mark renders at the canvas's own lightness. Measured on `indaco-dark`: mean |ΔL|
 * between the logo box and its ground fell to 0.0015, against 0.1382 on plain `indaco`.
 *
 * The failure is SILENT — nothing errors, nothing is missing, the slide just looks as
 * though it has no logo — and no other gate can see it, because the contrast checkers
 * audit text runs and this mark is an aria-hidden decorative watermark.
 *
 * WHY THIS FILE TESTS A NAMING CONVENTION. The natural fix, declaring the token in each
 * wrapper beside its `color-scheme`, is barred by `checkThemeOwnership`: a `variant-dark`
 * "only pins the canvas", and a wrapper that declares tokens is a `derived-variant`. That
 * invariant is deliberate, so the flip lives in engine CSS instead, keyed on the
 * `data-theme` attribute — `section[data-theme$="-dark"]`.
 *
 * That selector is only correct while the suffix and the declared role agree. Today they
 * agree exactly: 33 manifests, 14 with `role: variant-dark`, 14 named `*-dark`, same 14.
 * This file is what keeps that true, so a dark theme named off-convention fails here
 * rather than shipping decks with an invisible logo.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const THEMES = path.join(ROOT, 'themes');

function manifests() {
  return fs.readdirSync(THEMES)
    .filter((f) => f.endsWith('.manifest.json'))
    .map((f) => ({
      name: f.replace('.manifest.json', ''),
      role: JSON.parse(fs.readFileSync(path.join(THEMES, f), 'utf8')).role,
    }));
}

test('every variant-dark theme is named *-dark, and nothing else is', () => {
  const all = manifests();

  // A FLOOR, so the arm cannot pass by finding nothing. If manifests move or the role is
  // renamed, this fails loudly rather than certifying an empty set — the failure mode the
  // rest of this repo's gates exist against.
  assert.ok(all.length >= 30, `expected at least 30 theme manifests, found ${all.length}`);

  const byRole = all.filter((t) => t.role === 'variant-dark').map((t) => t.name).sort();
  const bySuffix = all.filter((t) => t.name.endsWith('-dark')).map((t) => t.name).sort();

  assert.ok(byRole.length >= 14, `expected at least 14 variant-dark themes, found ${byRole.length}`);
  assert.deepEqual(byRole, bySuffix,
    'The deck logo\'s deck-wide flip is `section[data-theme$="-dark"]` in '
    + 'lib/base/base.modifiers.css, so a dark theme not named `*-dark` never gets it and '
    + 'its decks render the logo at the canvas\'s own lightness — silently. Either rename '
    + 'the theme to end in `-dark`, or replace that selector with one that reads the role.');
});

test('the engine rule that flips the logo for a dark theme is still there, and still above the per-slide overrides', () => {
  // POSITION IS THE RULE. The theme selector, `.print`, `.light` and `.color-light` are
  // all (0,1,1), so source order alone decides — and the theme rule must LOSE to all
  // three: paper is a light canvas whatever the theme, and a slide pinned light inside a
  // dark deck takes the light mark. Moving the block below any of them inverts that
  // silently, with no specificity change to notice in review.
  const css = fs.readFileSync(path.join(ROOT, 'lib', 'base', 'base.modifiers.css'), 'utf8');

  const theme = css.indexOf('section[data-theme$="-dark"]');
  assert.ok(theme > 0, 'the dark-theme logo rule is gone from base.modifiers.css');

  for (const later of ['section.print {', 'section.light {', 'section.color-light {']) {
    const at = css.indexOf(later);
    assert.ok(at > 0, `${later} not found`);
    assert.ok(theme < at,
      `section[data-theme$="-dark"] must be declared BEFORE ${later} — same specificity, `
      + 'so source order decides, and the per-slide modifier has to win.');
  }
});
