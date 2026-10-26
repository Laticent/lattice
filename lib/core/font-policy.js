/**
 * lib/core/font-policy.js — how much of each typeface an export carries, decided ONCE for every host.
 *
 * The author writes one `fonts:` line (front matter) or `--fonts` flag of tier words:
 *
 *   exact    only the characters the deck shows. Smallest. For files nobody edits.
 *   used     the whole face as we ship it (the full Latin range: accents and punctuation included), so
 *            someone editing the file can type new text without a missing glyph. We ship no other script.
 *   full     the whole face, every script.
 *   system   embed nothing; the viewer's own fonts draw the text.
 *
 * A bare word sets the text faces. A word ending in `-emoji` sets Noto Color Emoji: `fonts: used exact-emoji`.
 * Text faces default to `used`, emoji to `exact` (nobody types new emoji in our face; PowerPoint cannot use it).
 * This is not CSS: it never changes which font a slide asks for, only how much of it the file carries.
 *
 * The kernel decides the PLAN (which tier applies to which class of face); a host supplies the subsetter. Same plan in the CLI and the Studio, so the same deck exports the same fonts.
 *
 * A LEAF, deliberately: no `require`, so the docs dev server can serve it to the browser. Pure.
 */

const FONT_TIERS = Object.freeze(['exact', 'used', 'full', 'system']);

const DEFAULTS = Object.freeze({ text: 'used', emoji: 'exact' });

/**
 * Read the `fonts:` value: tier words, a `-emoji` suffix for the emoji class. A repeated class keeps the last word.
 * @param {unknown} value  the front-matter text, a flag's value, or already `{ text, emoji }`
 * @returns {{ text: string, emoji: string, unknown: string[] }}  `text` and `emoji` are '' when not written
 */
function parseFontsSetting(value) {
  if (value && typeof value === 'object') {
    return { text: String(value.text ?? '').trim().toLowerCase(), emoji: String(value.emoji ?? '').trim().toLowerCase(), unknown: [] };
  }
  const out = { text: '', emoji: '', unknown: [] };
  for (const word of String(value ?? '').split(/[\s,]+/).filter(Boolean)) {
    const w = word.toLowerCase();
    const m = w.match(/^([a-z]+)-emoji$/);
    if (m && FONT_TIERS.includes(m[1])) out.emoji = m[1];
    else if (FONT_TIERS.includes(w)) out.text = w;
    else out.unknown.push(word);
  }
  return out;
}

/** A flag's words over the deck's line, class by class: `--fonts full` keeps the deck's emoji tier. */
function mergeFontsSettings(deck, over) {
  const d = parseFontsSetting(deck);
  const o = parseFontsSetting(over);
  return { text: o.text || d.text, emoji: o.emoji || d.emoji, unknown: [...d.unknown, ...o.unknown] };
}

/**
 * @param {unknown} [setting]  see `parseFontsSetting`
 * @returns {{ text: 'exact'|'used'|'full'|'system', emoji: 'exact'|'used'|'full'|'system' }}
 */
function resolveFontPolicy(setting = {}) {
  const p = parseFontsSetting(setting);
  return {
    text: FONT_TIERS.includes(p.text) ? p.text : DEFAULTS.text,
    emoji: FONT_TIERS.includes(p.emoji) ? p.emoji : DEFAULTS.emoji,
  };
}

module.exports = { FONT_TIERS, DEFAULTS, parseFontsSetting, mergeFontsSettings, resolveFontPolicy };
