/**
 * lib/authoring/front-matter-scans.js — the two front-matter LINE SCANS only lib/authoring/lint-core.js still runs.
 *
 * They lived in lib/core/front-matter-key.js, which every docs page that reads a register ships. The engine and the
 * register readers now read the front-matter island's keys (lib/core/front-matter-island.mjs) and never call these, so
 * they moved here, beside their one caller, out of the pages' startup bytes. Step 6 of the Squadra rewrite deletes
 * lint-core and these with it (engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §11).
 */

const { BLOCK_SCALAR_HEAD } = require('../core/front-matter-keys.mjs');

function escapeKey(key) {
  return String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The front-matter body with every block scalar's BODY blanked out, so a loose line
 * reader cannot read a line of it as a key.
 *
 * `^[ \t]*key:` matches any indented line, and the indented lines under `style: |` are the
 * author's CSS, not keys. A deck with `style: |\n  lift: on` rendered with `lift: on` while
 * the Studio, which skips those lines, showed no `lift` override: one deck, two readings.
 * The rule is YAML's and the island's (`frontMatterKeys`): a header's body is every
 * following line that is blank or indented deeper than the header. The header line itself
 * stays. The register readers (lib/core/front-matter-key.js) and the engine's `parseFrontMatter` read the island's keys,
 * which skip those lines already; this text form is for the line scans lint-core still runs
 * until step 6 of the Squadra rewrite deletes it.
 *
 * @param {string} fm front-matter body
 * @returns {string}
 */
let lastFm = null;
let lastBlanked = null;
function withoutBlockScalarBodies(fm) {
  // Fast path: no `: |` or `: >` anywhere means no block scalar, and most decks have none.
  if (!/:[ \t]+[|>]/.test(fm)) return fm;
  // lint-core reads it several times per lint, so keep the last answer.
  if (fm === lastFm) return lastBlanked;
  const lines = fm.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const head = BLOCK_SCALAR_HEAD.exec(lines[i]);
    if (!head) continue;
    const base = head[1].length;
    while (i + 1 < lines.length && (!lines[i + 1].trim() || lines[i + 1].match(/^[ \t]*/)[0].length > base)) lines[++i] = '';
  }
  lastFm = fm;
  lastBlanked = lines.join('\n');
  return lastBlanked;
}

/**
 * `text.match(re)` for a front-matter KEY regex, with the reading every reader shares since #3050 (D1):
 * the LAST match that starts at column 0 wins, and only when the key appears nowhere at column 0 does
 * the first match at any indent stand in (the loose read these call sites always had). `re` is a
 * line regex anchored at `^` with the `m` flag; it is run globally here, so the caller's regex keeps
 * no `lastIndex` state. Returns the match array, or null. `frontMatterValue` applies the same rule.
 *
 * @param {string} text
 * @param {RegExp} re
 * @returns {RegExpMatchArray|null}
 */
function lastFrontMatterMatch(text, re) {
  const src = String(text ?? '');
  // The KEY the regex reads, from its own head (`^\\s*mode[ \\t]*:`, `^[ \\t]*pace:` …). With it, the
  // winning LINE is picked first and only that line is tested, so a last line whose value the regex
  // cannot parse reads as unparseable, exactly as a single line would, rather than letting an earlier,
  // dead line stand in for it.
  const head = /^\^(?:\\s\*|\[ \\t\]\*)?([A-Za-z_][\w-]*)/.exec(re.source);
  if (head) {
    const keyLine = new RegExp(`^${escapeKey(head[1])}[ \\t]*:`);
    const lines = src.split('\n');
    const top = lines.findLastIndex((l) => keyLine.test(l));
    // `key :` is the key: the picked line is normalized to `key:` so the caller's regex reads it.
    if (top >= 0) return new RegExp(re.source, re.flags.replace('g', '')).exec(lines[top].replace(/^(\s*[\w-]+)[ \t]+:/, '$1:'));
  }
  // No column-0 line for the key: the first match at any indent stands in, as it always did.
  return new RegExp(re.source, re.flags.replace('g', '')).exec(src);
}

module.exports = { withoutBlockScalarBodies, lastFrontMatterMatch };
