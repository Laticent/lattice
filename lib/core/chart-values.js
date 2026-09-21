/**
 * The CHART FAMILY's authored-value parser — what a pill in a chart's Markdown
 * means as a number.
 *
 * ── WHY IT LIVES IN lib/core ──────────────────────────────────────────────────
 *
 * It was `_chart-family/cartesian.js`'s, and every cartesian chart still reaches
 * it through that module's re-export, unchanged. It moved down one layer because
 * NARRATION needs the identical answer and could not have it: `lib/core` never
 * reaches into `lib/components` (measured — not one module did before this), and
 * a narrator that re-implemented `4.2M is 4 200 000` would be a second parser
 * free to disagree with the picture about what the author typed.
 *
 * The disagreement would not be theoretical. `parseValue` carries four sign
 * spellings, a magnitude table, and a separator rule written against real decks
 * pasted out of French and German spreadsheets; each is a defect note, and a
 * paraphrase of it in a second file is a defect waiting to come back. One parser,
 * two layers, no copy (HARD RULE #1).
 */

const MAGNITUDE_ONLY = /^(?:bn|[kKmMBbT])$/;

/**
 * The NUMBER inside an authored value pill, with the magnitude suffix APPLIED.
 *
 * `12k` is 12 000 and `1.2M` is 1 200 000 — the funnel's parser takes the first
 * numeric run and silently drops the suffix (its own manifest warns authors off
 * `$12k` for exactly this reason), which is fine for a chart whose values are
 * all the same magnitude and wrong for an axis. A Cartesian axis has to be able
 * to put `800k` and `1.2M` on one scale, so the suffix is scale, not decoration.
 * `%` is NOT a magnitude — it stays a plain number, so `12%` is 12.
 */
const MAGNITUDE = Object.freeze({ k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9, bn: 1e9, T: 1e12 });

/**
 * Normalize the thousands/decimal separators a spreadsheet exports.
 *
 * A deck pasted out of a French, German, Italian or Swedish sheet writes
 * `1.234.567` and `1,25M`. Stripping every comma read `1,25M` as 125M — a
 * hundredfold misplot with the author's own label printed beside it proving it
 * wrong — and the dot form failed the pill test outright, so three of four
 * points in a grouped chart silently became mark-detail.
 *
 * The rule is unambiguous rather than clever: a GROUP separator is always
 * followed by exactly three digits. So a comma followed by three digits groups
 * and anything else is a decimal comma, and two or more dots can only be
 * grouping. A single dot stays a decimal point, which is the common case.
 *
 * ONE case stays genuinely ambiguous and is resolved US-first: a lone
 * `900.000` is read as 900, not as nine hundred thousand. Nothing in the string
 * distinguishes the two, and this repo's house dialect is US (HARD RULE #21).
 * An author writing EU groups should carry them consistently — `1.234.567`
 * disambiguates itself — or use a magnitude suffix, which never does.
 */
function normalizeSeparators(s) {
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  if (commas && !dots) {
    // `1,234` groups; `1,25` and `1,5` are decimal commas.
    return /,\d{3}(?!\d)/.test(s) && !/,\d{1,2}(?!\d)/.test(s)
      ? s.replace(/,/g, '')
      : s.replace(/,/g, '.');
  }
  if (dots > 1 && !commas) return s.replace(/\./g, '');   // 1.234.567
  if (commas && dots) return s.replace(/,/g, '');          // 1,234.5 — US
  return s;
}

function parseValue(raw) {
  if (raw == null) return NaN;
  let s = normalizeSeparators(String(raw).trim());

  // The SIGN is read separately from the numeric run, because the run is not
  // where the sign necessarily is. `parseValue` used to take the first match of
  // /-?\d*\.?\d+/ over the whole string, so in `-$0.8M` the minus is not
  // adjacent to the digits and was silently dropped — which turns every
  // negative currency step of a waterfall into a positive one, closes the
  // bridge on the wrong number, and never crosses the zero rule the chart is
  // read against. Three forms all mean negative:
  //   `-$0.8M`  a minus before the currency symbol (what an author types)
  //   `−1.2M`   U+2212, what a paste from a spreadsheet or smart typography gives
  //   `($1.2M)` the accounting parenthesis
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  const lead = s.match(/^[-\u2212]\s*/);
  if (lead) { neg = !neg; s = s.slice(lead[0].length); }

  const m = s.match(/-?\d*\.?\d+/);
  if (!m) return NaN;
  const n = parseFloat(m[0]);
  if (!Number.isFinite(n)) return NaN;
  // The magnitude letter must sit immediately after the number, so a label-ish
  // suffix ("4 beds", "12kg") does not multiply anything.
  const after = s.slice(m.index + m[0].length).trim();
  const mag = after.match(/^(bn|[kKmMBbT])\b/);
  const val = mag ? n * MAGNITUDE[mag[1]] : n;
  return neg ? -Math.abs(val) : val;
}

/**
 * The value AND whether its sign was written down.
 *
 * `parseValue` answers "what number is this". A chart whose claim is DIRECTION
 * — a waterfall's floating step versus its zero-anchored level — also has to
 * know whether the author *said* which way, and that is a different question:
 * `12.0M` and `+12.0M` are the same number and mean different marks.
 *
 * It lives here rather than in the member because there are four ways to write
 * a sign and a member that re-derives it will find three. `waterfall` did
 * exactly that — it read a leading `+`/`-` itself, normalized U+2212, and
 * missed `($0.8M)`, so the accounting negative every finance system prints
 * became a zero-anchored LEVEL that reset the running total, with the right
 * figure on it and nothing to say the chart was wrong.
 *
 * @returns {{ value:number, signed:boolean, negative:boolean }}
 *          `signed` is false for a bare `12.0M`, true for `+12M`, `-12M`,
 *          `−12M` (U+2212) and `(12M)`.
 */
function signedValue(raw) {
  const s = String(raw == null ? '' : raw).trim();
  // A sign counts wherever it sits BEFORE the digits — `-$0.9M` and `$-0.9M`
  // are both an author saying "down", and only the first has it in front. The
  // accounting parenthesis is the fourth spelling.
  const paren = /^\(.*\)$/.test(s);
  const beforeDigits = s.replace(/^\(/, '').split(/\d/)[0];
  const signed = paren || /[+\-\u2212]/.test(beforeDigits);
  const value = parseValue(s);
  return { value, signed, negative: signed && value < 0 };
}

/**
 * Is this pill a VALUE, or is it prose that merely contains digits?
 *
 * `parseSeries` uses this to tell a data point from a mark-detail bullet, and
 * "does `parseValue` return a number" is not a strong enough test: `parseValue`
 * takes the first numeric run, so a ticket id `PROJ-42` parses as -42 and would
 * be plotted as a data point that drags the axis to -42. The pill has to be
 * WHOLLY a number — an optional sign, an optional symbol prefix, digits, and an
 * optional short unit — with no prose around it.
 *
 * A bare number IS data, deliberately: `Closed `2024`` plots at 2024. There is
 * nothing in the markup that distinguishes a year from a measurement, and
 * guessing would be worse than the documented rule.
 */
const NUMERIC_PILL =
  /^[(+\-\u2212]?\s*[^\w\s]{0,3}\s*[-\u2212]?\d[\d,.]*\s*(?:%|‰|[A-Za-z]{1,6})?\s*\)?$/;

function isValuePill(raw) {
  if (raw == null) return false;
  const s = String(raw).trim();
  return s !== '' && NUMERIC_PILL.test(s) && Number.isFinite(parseValue(s));
}

module.exports = { MAGNITUDE, MAGNITUDE_ONLY, normalizeSeparators, parseValue, signedValue, NUMERIC_PILL, isValuePill };
