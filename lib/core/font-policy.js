/**
 * lib/core/font-policy.js — how much of each typeface an export carries, decided ONCE for every host.
 *
 * The author writes one `fonts:` line (front matter) or `--fonts` flag of tier words:
 *
 *   exact    only the characters the deck shows. Smallest. For files nobody edits.
 *   used     the whole face for each script the deck uses (a Latin deck gets the full Latin range, accents
 *            and punctuation included), so someone editing the file can type new text without a missing glyph.
 *   full     the whole face, every script.
 *   system   embed nothing; the viewer's own fonts draw the text.
 *
 * A bare word sets the text faces. A word ending in `-emoji` sets Noto Color Emoji: `fonts: used exact-emoji`.
 * Text faces default to `used`, emoji to `exact` (nobody types new emoji in our face; PowerPoint cannot use it).
 * This is not CSS: it never changes which font a slide asks for, only how much of it the file carries.
 *
 * The kernel decides the PLAN (which tier, which characters, which script ranges); a host supplies the
 * subsetter. Same plan in the CLI and the Studio, so the same deck exports the same fonts.
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

/** Script ranges a tier `used` keeps whole: a character's script picks the range, the range names the characters. */
const SCRIPT_RANGES = Object.freeze([
  { script: 'latin', ranges: [[0x20, 0x24f], [0x1e00, 0x1eff], [0x2000, 0x206f], [0x20a0, 0x20cf], [0x2100, 0x218f], [0x2190, 0x21ff], [0x2200, 0x22ff], [0xfb00, 0xfb06]] },
  { script: 'greek', ranges: [[0x370, 0x3ff], [0x1f00, 0x1fff]] },
  { script: 'cyrillic', ranges: [[0x400, 0x52f], [0x1c80, 0x1c8f], [0x2de0, 0x2dff], [0xa640, 0xa69f]] },
]);

const inRanges = (cp, ranges) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

/**
 * The code points a TEXT face keeps under a tier. `null` means the whole face (no subsetting).
 * @param {'exact'|'used'|'full'|'system'} tier
 * @param {string} text  everything the file shows
 * @returns {number[]|null|undefined}  code points to keep; `null` = whole face; `undefined` = embed nothing
 */
function textCodePoints(tier, text) {
  if (tier === 'system') return undefined;
  if (tier === 'full') return null;
  const shown = new Set(Array.from(String(text || ''), (c) => c.codePointAt(0)));
  if (tier === 'exact') return [...shown].sort((a, b) => a - b);
  // used: the shown characters plus the whole range of every script they touch (Latin is always kept: it is the editing floor).
  const scripts = SCRIPT_RANGES.filter((s) => s.script === 'latin' || [...shown].some((cp) => inRanges(cp, s.ranges)));
  const out = new Set(shown);
  for (const { ranges } of scripts) for (const [lo, hi] of ranges) for (let cp = lo; cp <= hi; cp++) out.add(cp);
  return [...out].sort((a, b) => a - b);
}

module.exports = { FONT_TIERS, DEFAULTS, parseFontsSetting, mergeFontsSettings, resolveFontPolicy, SCRIPT_RANGES, textCodePoints };
