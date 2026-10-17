/**
 * chart-values-speech — how a chart pill is SAID: `spokenValue`, the names a currency is
 * spoken by, and the magnitude words. Split from chart-values.js (#2714) because the
 * lint core loads that module to READ numbers and never speaks them, and the speech
 * tables pushed it past its route-budget ceiling. Narration (chart-narration.js), the
 * read-along core and the Present guide take `spokenValue` from here; the reading is
 * still chart-values.js's, so a pill is read one way whether it is drawn or said.
 */

const { isCurrency, malformedNumber, readNumber } = require('@laticent/segno/values');
const { MAGNITUDE, MAGNITUDE_ONLY, normalizeSeparators, parseValue, isValuePill } = require('./chart-values.js');

/**
 * The name a currency is spoken by, singular and plural. The speech reader (`toSpokenText`) says
 * `$`, `€` and `£` itself; every other currency a deck can now carry (an ISO code, `US$`, a symbol
 * after the number, `¥`, `₹`) it read out as glyphs, and `4,2 Mio. €` as "forty-two Mio. €".
 */
const CURRENCY_WORDS = Object.freeze((() => {
  const t = {};
  const add = (keys, one, many) => { for (const k of keys) t[k] = [one, many]; };
  add(['$'], 'dollar', 'dollars');
  add(['USD', 'US$'], 'US dollar', 'US dollars');
  add(['€', 'EUR'], 'euro', 'euros');
  add(['£', 'GBP'], 'pound', 'pounds');
  add(['¥', 'JPY'], 'yen', 'yen');
  add(['CNY'], 'yuan', 'yuan');
  add(['CHF'], 'Swiss franc', 'Swiss francs');
  add(['₹', 'INR'], 'rupee', 'rupees');
  add(['A$', 'AU$', 'AUD'], 'Australian dollar', 'Australian dollars');
  add(['C$', 'CA$', 'CAD'], 'Canadian dollar', 'Canadian dollars');
  add(['HK$', 'HKD'], 'Hong Kong dollar', 'Hong Kong dollars');
  add(['S$', 'SG$', 'SGD'], 'Singapore dollar', 'Singapore dollars');
  add(['NZ$', 'NZD'], 'New Zealand dollar', 'New Zealand dollars');
  add(['NT$', 'TWD'], 'Taiwan dollar', 'Taiwan dollars');
  add(['R$', 'BRL'], 'real', 'reais');
  add(['MX$', 'MXN'], 'Mexican peso', 'Mexican pesos');
  add(['ZAR'], 'rand', 'rand');
  add(['SEK'], 'Swedish krona', 'Swedish kronor');
  add(['NOK'], 'Norwegian krone', 'Norwegian kroner');
  add(['DKK'], 'Danish krone', 'Danish kroner');
  add(['KRW', '₩'], 'won', 'won');
  add(['AED'], 'dirham', 'dirhams');
  add(['SAR'], 'riyal', 'riyals');
  return t;
})());
// `Mio`/`Mrd` always scale; `mn`, `Md` and `Cr` only beside a currency, as in the reader (`15mn` is minutes).
const WORD_ALWAYS = /\d\s?(?:Mio|Mrd)\b/;
const WORD_WITH_MONEY = /\d\s?(?:mn|Md|Cr)\b/;
const ANY_MAGNITUDE = /\d\s?(?:bn|Bn|BN|Mio|Mrd|mn|Md|Cr|[kKmMBbT])(?![A-Za-z])/;

/**
 * A money amount or a magnitude word, spoken as the number it plots, or null when the speech reader
 * already says it (`$4.2M`, `€3`, `12%`, a bare number). The number and its sign are said by
 * `toSpokenText` with `$` standing in, so "down four point two million" reads as it always has, and
 * only the currency name is swapped. A currency with no name here is said as written, before the
 * number: "ISK four point two million".
 */
function moneySpeech(typed, toSpokenText) {
  const read = readNumber(typed);
  if (!read || !Number.isFinite(read.value)) return null;
  // Only a REAL currency counts: `>50%`, `±3%`, `§5`, `#616` and `250 FTE` are said as they always
  // were. A unit the reader kept (`%`, `kg`) means this is not a money amount either.
  const at = typed.search(/\d/);
  const before = typed.slice(0, at).replace(/[()+\-\u2212~\u2248\s]/g, '');
  const lead = isCurrency(before) ? before : '';
  const tail = isCurrency(read.unit) ? read.unit : '';
  if (read.unit && !tail) return null;
  if (before && !lead) return null;
  const currency = lead || tail;
  const word = WORD_ALWAYS.test(typed) || (currency !== '' && WORD_WITH_MONEY.test(typed));
  if (!word && (!currency || (!tail && ['$', '€', '£'].includes(lead)))) return null;
  // Only a value written WITH a magnitude is re-scaled, as below: `4200€` is "four thousand two
  // hundred euros", never "four point two thousand".
  const magnitude = ANY_MAGNITUDE.test(typed) ? SPOKEN_MAGNITUDES.find(([n]) => Math.abs(read.value) >= n) : undefined;
  const scaled = Number((magnitude ? Math.abs(read.value) / magnitude[0] : Math.abs(read.value)).toPrecision(12));
  const sign = read.value < 0 ? '-' : '';
  const amount = `${scaled}${magnitude ? magnitude[1] : ''}`;
  if (!currency) return toSpokenText(`${sign}${amount}`);
  const names = CURRENCY_WORDS[currency];
  // A symbol after the number with no name here (`99¢`) is said as it always was.
  if (!names && !lead) return null;
  if (!names) return `${currency} ${toSpokenText(`${sign}${amount}`)}`;
  return toSpokenText(`${sign}$${amount}`).replace(/dollars?$/, (d) => (d === 'dollar' ? names[0] : names[1]));
}

/**
 * THE SPOKEN FORM OF AN AUTHORED VALUE — canonical, so the same quantity is read
 * the same way however the author spelled it.
 *
 * ── THE DEFECT THIS FIXES ────────────────────────────────────────────────────
 *
 * Narration used to hand `toSpokenText` the author's RAW pill, so it was reading a
 * SPELLING rather than a NUMBER. Measured:
 *
 *   900k     -> "nine hundred thousand"            } the same quantity,
 *   0.9M     -> "zero point nine million"          } read two ways
 *
 *   1.2M     -> "one point two million"            } the same quantity,
 *   1200k    -> "one thousand two hundred thousand"} read three ways, and the
 *   1200000  -> "one million two hundred thousand" } second is not English
 *
 *   1,25M    -> "one hundred twenty-five million"  <- A HUNDRED TIMES TOO MUCH
 *
 * That last one is the serious one and it is not hypothetical: `1,25M` is what a
 * deck pasted out of a French, German, Italian or Swedish spreadsheet contains, and
 * `normalizeSeparators` exists precisely because this repo has had those decks. The
 * PICTURE reads it correctly — `parseValue` gives 1 250 000 and the bar is drawn
 * there — while the VOICE read the comma as a thousands separator and said
 * "one hundred twenty-five million" over a chart showing 1.25M. A confidently wrong
 * number is the worst thing narration can do, and it was doing it on the one input
 * class the parser was hardened for.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 *
 * Parse to the VALUE, then say it the way a person would: the largest magnitude
 * whose mantissa is at least one. 900 000 is "nine hundred thousand" rather than
 * "zero point nine million"; 1 200 000 is "one point two million" rather than
 * "one thousand two hundred thousand". The author's affix is preserved, because
 * `$` and `%` are what the number MEANS and not how it was spelled.
 *
 * It deliberately does NOT reproduce the chart's printed form. `fmtFor` normalizes
 * every row on a chart to ONE magnitude so a reader's eye does not re-scale between
 * rows — a whole-chart decision, entangled with the axis, that a per-value function
 * cannot make and should not guess at. So a chart mixing `900k` and `1.2M` still
 * prints "0.9M" while the voice says "nine hundred thousand". Both are correct
 * readings of the same number; only the CHART has a reason to prefer one unit.
 */
const SPOKEN_MAGNITUDES = Object.freeze([
  [1e12, 'T'],
  [1e9, 'bn'],
  [1e6, 'M'],
  [1e3, 'k'],
]);

function spokenValue(raw, toSpokenText) {
  const typed = String(raw == null ? '' : raw).trim();
  // A MALFORMED number (`--5`, `(5`, `1,2,3`) is said exactly as typed. The chart draws no value for
  // it, and the spoken-text reader would turn its digits into one ("one hundred twenty-three"), so
  // the voice would state a figure the picture does not show.
  if (malformedNumber(typed)) return typed;
  const money = moneySpeech(typed, toSpokenText);
  if (money !== null) return money;
  // A value is said as the number it plots, so its separators are read the way the chart reads
  // them: `1,5` is "one point five" (a decimal comma), `1.234,5` is one thousand two hundred
  // thirty-four point five. Only a value pill; anything else, a malformed value such as `(0,2,2)`
  // included, is said as typed.
  const s = isValuePill(typed) ? normalizeSeparators(typed) : typed;
  if (!isValuePill(s)) return toSpokenText(s);

  // ONLY A PILL THAT CARRIES A MAGNITUDE LETTER IS REWRITTEN, and that narrow scope
  // is the fix for a defect this function introduced on its first draft: a bare
  // `2024` — which the pill grammar documents as legitimate data ("Closed `2024`
  // plots at 2024") — was re-scaled into "two point zero two four thousand". A YEAR.
  //
  // The divergence this exists to close is entirely within the SUFFIXED forms:
  // `900k` against `0.9M`, `1.2M` against `1200k`. A bare number has only one
  // spelling, so there is nothing to canonicalize and every reason not to touch it.
  const body = normalizeSeparators(s.replace(/^\(|\)$/g, '').replace(/^[-\u2212+]\s*/, ''));
  const numeric = body.match(/\d[\d.]*/);
  if (!numeric) return toSpokenText(s);
  const after = body.slice(numeric.index + numeric[0].length).trim();
  if (!MAGNITUDE_ONLY.test(after)) return toSpokenText(s);

  const value = parseValue(s);
  if (!Number.isFinite(value)) return toSpokenText(s);

  // THE SIGN RIDES IN FRONT OF EVERYTHING, including a currency prefix, and it is
  // stripped from BOTH places an author can write it. `-$0.8M` loses it above, with
  // the brackets; `$-0.8M` carries it INSIDE the prefix, and leaving it there
  // rebuilt the literal string "-$-800k" — two signs, one of them mid-token, which
  // `toSpokenText` cannot read and passed through as glyphs. Both spellings mean
  // "down", and `parseValue` already reads all four of them.
  const prefix = body.slice(0, numeric.index).replace(/[-\u2212+]\s*$/, '').trim();
  const sign = value < 0 ? '-' : '';

  // BELOW THE SMALLEST MAGNITUDE THE LETTER IS DROPPED, NOT THE REWRITE. `0.5k` is
  // five hundred, and handing the pill back untouched read it as "zero point five
  // thousand" — the exact shape this function exists to remove, surviving because
  // the magnitude table starts at a thousand and 500 is under it. The same applies
  // to a plain `0M`, which used to take an early return and say "zero million".
  // Trim the float noise `value / 1e6` introduces (1.2000000000000002) without
  // inventing precision the author did not type.
  const magnitude = SPOKEN_MAGNITUDES.find(([n]) => Math.abs(value) >= n);
  const scaled = magnitude ? Math.abs(value) / magnitude[0] : Math.abs(value);
  const shown = Number(scaled.toPrecision(12));
  return toSpokenText(`${sign}${prefix}${shown}${magnitude ? magnitude[1] : ''}`);
}

module.exports = { SPOKEN_MAGNITUDES, spokenValue };
