/**
 * chart-source-bridge — the narrators' view of a chart row written as one `{…}` record.
 *
 * `bridgeRecordsHtml` (chart-rows.js) rewrites a claimed record to the old spans for the HTML transforms; this
 * does the same on one slide's Markdown, for the narrators, which read the old spans from source lines. It
 * rewrites inside a line and never adds or removes one, because the narrator finds a row's description by line count.
 *
 * It decides nothing about place. The engine-configured block parser reads the slide, the shared place tracker
 * (chart-places.js) says which spans `ownsRecordSpan` claims and on which line they end, and this rewrites only
 * those. It used to walk lines with its own CommonMark approximation (lists, fences, paragraph ends, bullet
 * kinds), which disagreed with the engine on 49 of the 390 slides in the place oracle.
 *
 * It lives apart from chart-rows.js on purpose: the browser runtime imports chart-rows.js, and this needs the
 * parser (markdown-it, kept external in the bundles that carry it).
 */

const { boundaryParser, normalizeSource } = require('./boundary-parser');
const { recordChart, rowSchema, legacySpans, gridCellText } = require('./chart-rows');
const { ownedRecordSites } = require('./chart-places');

// What may follow a row's record on its line.
const TRAILING = /^(?:\s|&nbsp;|&#160;|&#xa0;)*$/i;

/**
 * The last code span of a line when only blanks follow it: `{ start, end, content }` with the span's own
 * backtick runs inside [start, end). A span opens with a run of n backticks and closes with the next run of
 * exactly n (CommonMark), so a double-backtick record is found as the engine reads it. Its content is trimmed
 * of one space on each side when both are there, as the engine does.
 */
function lastCodeSpan(line) {
  let found = null;
  for (let i = 0; i < line.length;) {
    if (line[i] === '\\') { i += 2; continue; }
    if (line[i] !== '`') { i++; continue; }
    let n = 0;
    while (line[i + n] === '`') n++;
    let j = i + n;
    let close = -1;
    while (j < line.length) {
      if (line[j] !== '`') { j++; continue; }
      let m = 0;
      while (line[j + m] === '`') m++;
      if (m === n) { close = j; break; }
      j += m;
    }
    if (close < 0) { i += n; continue; }
    let content = line.slice(i + n, close).replace(/\n/g, ' ');
    if (content.length > 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim()) content = content.slice(1, -1);
    found = { start: i, end: close + n, content };
    i = close + n;
  }
  return found && TRAILING.test(line.slice(found.end)) ? found : null;
}
// A table cell holding nothing but a backticked record, with or without the outer pipes.
const RECORD_CELL = /(^|\|)(\s*)`(\{[^`|]*\})`(\s*)(?=\||$)/g;

function bridgeLines(markdown, classTokens) {
  const chart = recordChart(classTokens);
  if (!chart || !markdown.includes('`{')) return markdown;
  const schema = rowSchema(chart);
  const grid = schema.slot === 'cell';
  if (!grid && !Array.isArray(schema.rows.legacy)) return markdown;
  // The parser's own input fold, so its line numbers are this array's indexes (boundary-parser.mjs `normalizeSource`).
  const lines = normalizeSource(markdown).split('\n');
  const sites = ownedRecordSites(boundaryParser.parse(lines.join('\n'), {}), classTokens);
  if (!sites.length) return markdown;
  const owned = new Map(); // line -> the record texts claimed on it
  for (const site of sites) {
    if (!owned.has(site.line)) owned.set(site.line, new Set());
    owned.get(site.line).add(site.text);
  }
  for (const [at, texts] of owned) {
    const line = lines[at];
    if (line === undefined) continue;
    if (grid) {
      lines[at] = line.replace(RECORD_CELL, (all, bar, a, rec, b) => {
        const text = texts.has(rec) ? gridCellText(chart, rec) : null;
        return text == null ? all : `${bar}${a}${text}${b}`;
      });
      continue;
    }
    // A list row: the record is the last span of the line.
    const span = lastCodeSpan(line);
    if (!span || !texts.has(span.content)) continue;
    const spans = legacySpans(chart, span.content);
    if (spans) lines[at] = line.slice(0, span.start) + spans.map((x) => `\`${x}\``).join(' ') + line.slice(span.end).replace(/^\s+$/, '');
  }
  return lines.join('\n');
}

/**
 * @param {string} markdown      one slide's source
 * @param {string[]} classTokens
 */
function bridgeRecordsSource(markdown, classTokens) {
  // A source with a lone CR (classic Mac line endings) reads as one line to the narrators; folding it to LF would
  // add lines they then read as rows. It stays as written, as it always did.
  if (/\r(?!\n)/.test(markdown)) return markdown;
  const body = bridgeLines(markdown, classTokens);
  // A source with no record to rewrite comes back untouched (bridgeLines hands back its input, or the same text with
  // the line endings and BOM folded), so a deck that writes none narrates as it always did.
  if (body === markdown || body === normalizeSource(markdown)) return markdown;
  // `body` comes from the folded source (no BOM, LF lines). A rewritten slide keeps its BOM, and a CRLF slide stays CRLF:
  // the narrators read it as they read the old spans (a CRLF slide narrates nothing either way).
  const out = (String(markdown).startsWith('\uFEFF') ? '\uFEFF' : '') + body;
  return String(markdown).includes('\r\n') ? out.replace(/\n/g, '\r\n') : out;
}

module.exports = { bridgeRecordsSource };
