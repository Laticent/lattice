/**
 * slide-speech — flatten a slide's Markdown to plain readable narration.
 *
 * The BASE narration a slide reads when nothing richer applies: strip fences,
 * directive comments, `![bg]` images, and slide rules; drop inline markup to its
 * words; give each structural line a terminator so Cadenza's punctuation-driven
 * pause falls between clauses (a bullet list otherwise reads as one run-on).
 *
 * SHARED KERNEL (HARD RULE #1): both narration producers call this so live Present
 * read-aloud and the CLI/export caption sidecar flatten a slide identically — it is
 * the base the chart narrators (lib/core/chart-narration.js) build on, and the
 * fallback the export projection defers to for a non-component slide. Pure + fs-free
 * (bundled to the browser via read-along-core; unit-tested in isolation). Moved here
 * from docs/src/components/studio/read-aloud.ts (2026-07-11, #902 Gap 1) so it stops
 * living only in the browser.
 */

const { LEADING_MARKER_PREFIX_RE } = require('./state-marks');

// A line that markdown treats as STRUCTURE (heading / list item / blockquote): it
// gets a synthetic terminator so the caption engine breathes between clauses.
const STRUCTURAL_LINE = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?)/;
// Already ends in sentence punctuation → no synthetic terminator needed.
const TERMINATED = /[.!?;:,…]\s*$/;

/**
 * ONE fence walker for every speech surface, because there were three and they disagreed.
 *
 * `blankHtmlComments`, `slideToSpeech` and `chart-narration.js`'s `withoutFences` each
 * tracked fence state with their own `/^```/` toggle. All three were backtick-only, so a
 * `~~~` fence's body was not fenced as far as speech was concerned: its source lines
 * narrated. That was invisible while the CLI substituted only backtick Mermaid fences —
 * a tilde fence was raw text on the slide too, so speaking it was at least honest. Once
 * the export draws a `~~~mermaid` diagram (lib/core/mermaid-fences.js), the deck shows a
 * picture and the voice reads its source code.
 *
 * The rules are CommonMark's: a run of three or more of one character opens; a run of the
 * SAME character, at least as long and alone on its line, closes; and a ``` fence's info
 * string may not itself contain a backtick, so one line of `` `inline code` `` cannot open a
 * fence that swallows the rest of the slide.
 *
 * IT IS NOT THE SAME READER AS `lib/core/mermaid-fences.js`, and an earlier version of this
 * docblock claimed it was. This one `.trim()`s, so it accepts a fence at ANY indent; that one
 * caps the indent at three, because CommonMark makes four spaces an indented code block and
 * substituting a picture over literal text is the unsafe direction. Here the generous reading
 * is the safe one: over-blanking under-narrates, which is what the conservative failure mode
 * below is already chosen for.
 *
 * An UNTERMINATED fence stays open to the end — deliberately conservative, and unchanged:
 * under-narrating is better than narrating a doc example as if it were the author's words.
 *
 * @returns {{ read: (line: string) => 'marker'|'inside'|'outside' }} a stateful reader.
 *   `marker` is the opening or closing line itself; `inside` is fence content; `outside` is
 *   ordinary prose. Each caller decides what to do with each — they differ, which is why
 *   this returns a classification rather than doing the blanking itself.
 */
function createFenceReader() {
  let openChar = null;
  let openLen = 0;
  let openQuoted = false;
  // A BLOCKQUOTE IS A CONTAINER, and its markers are not part of the line inside it.
  // `.trim()` alone leaves them, so `> ```mermaid ` read as ordinary prose and the whole
  // definition under it was narrated: measured, a blockquoted diagram spoke
  // "mermaid. flowchart LR. A[\"Alpha\"] --> B[\"Beta\"]" into the .vtt while the slide
  // showed the picture. The engine draws that fence — this reader was the only one of the
  // three surfaces that did not know it was one.
  const unquote = (line) => line.replace(/^(?:\s*>)+\s?/, '');
  return {
    read(raw) {
      let line = String(raw ?? '').trim();
      // Strip quote markers only where they can be markers: outside any fence, and inside
      // one THIS reader opened within a blockquote. Stripping unconditionally would let a
      // `> ``` ` line in an ordinary fence's BODY — Mermaid source is arbitrary text — read
      // as a closer and hand the rest of the slide back to the narrator as prose.
      if (openChar === null || openQuoted) line = unquote(line).trim();
      if (openChar === null) {
        const m = /^(`{3,}|~{3,})(.*)$/.exec(line);
        if (!m || (m[1][0] === '`' && m[2].includes('`'))) return 'outside';
        openChar = m[1][0];
        openLen = m[1].length;
        openQuoted = unquote(String(raw ?? '').trim()) !== String(raw ?? '').trim();
        return 'marker';
      }
      const c = /^(`{3,}|~{3,})\s*$/.exec(line);
      if (c && c[1][0] === openChar && c[1].length >= openLen) {
        openChar = null;
        openQuoted = false;
        return 'marker';
      }
      return 'inside';
    },
  };
}

/**
 * Blank every HTML comment span, PRESERVING THE LINE COUNT.
 *
 * A speaker note in this engine IS a non-directive HTML comment
 * (`docs/src/components/studio/slide-notes.ts`), and the Studio's own note editor
 * writes multi-line ones. Both narration entry points used to skip a comment by
 * testing whether a LINE STARTS with `<!--`, which sees only the opening line — so
 * every continuation line of a note was spoken, and a note trailing a content line
 * (`Body text <!-- note: … -->`) was spoken whole, comment markup included.
 *
 * That was the channel behind three separate leaks, all measured on real exported
 * bytes: a note reaching the `.vtt` with DEFAULT flags on a chart-family slide; a
 * note reaching the `.vtt` under `--strip-notes`, the privacy flag itself; and the
 * mirror-image case where `--strip-captions` failed to strip a multi-line caption
 * override. One line-prefix test, four symptoms
 * (`engineering/decisions/2026-08-24-stage-console-split.md` §10).
 *
 * WHY BLANKING AND NOT REMOVAL. `speakLeftover` (lib/core/chart-narration.js) filters
 * its lines by ORIGINAL INDEX against a `consumed` Set the narrator built. Deleting
 * lines here would shift every index and silently mis-drop real authored content, so
 * the contract is: same number of lines out as in, comment spans replaced by nothing.
 * That also fixes the second-order half of the bug — `isCommonlyConsumed` carried the
 * same `/^<!--/` test, so it dropped a note's OPENING line and let the body survive as
 * an orphan with no opener that a block-aware flattener alone could not recognize.
 *
 * Fences are passed through untouched: their content never narrates anyway, and a
 * `<!--` inside a code sample must not open a comment that swallows the rest of the
 * slide.
 *
 * @param {string} markdown a single slide's Markdown
 * @returns {string} the same text with comment spans blanked, line count unchanged
 */
function blankHtmlComments(markdown) {
  const lines = String(markdown || '').split('\n');
  const out = [];
  const fence = createFenceReader();
  let inComment = false;
  for (const raw of lines) {
    // A comment that opened earlier swallows lines until it closes — including a
    // line that merely looks like a fence marker.
    if (inComment) {
      const close = raw.indexOf('-->');
      if (close === -1) {
        out.push('');
        continue;
      }
      inComment = false;
      out.push(raw.slice(close + 3));
      continue;
    }
    // Fences pass through untouched, markers included — see the docblock above.
    if (fence.read(raw) !== 'outside') {
      out.push(raw);
      continue;
    }
    let kept = '';
    let i = 0;
    for (;;) {
      const open = raw.indexOf('<!--', i);
      if (open === -1) {
        kept += raw.slice(i);
        break;
      }
      kept += raw.slice(i, open);
      const close = raw.indexOf('-->', open + 4);
      if (close === -1) {
        inComment = true; // runs past the end of this line
        break;
      }
      i = close + 3;
    }
    out.push(kept);
  }
  return out.join('\n');
}

// A GFM table's delimiter row: cells of dashes, optionally colon-aligned, with or without the
// outer pipes — `| --- | :--: |` and `--- | ---` are both tables.
const TABLE_SEPARATOR = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/;

/**
 * The line indices that belong to a GFM table: a header row, its delimiter row, and the body
 * rows after it until a blank line or a line without a pipe. Found by the delimiter row, which
 * is what makes a table a table — so a table written without outer pipes is found too, and a
 * prose line that merely contains a `|` is not. Fenced code is left alone.
 */
function gfmTableLines(lines) {
  const found = new Set();
  const fence = createFenceReader();
  const outside = lines.map((l) => fence.read(l) === 'outside');
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!outside[i] || !outside[i - 1]) continue;
    if (!TABLE_SEPARATOR.test(t) || !lines[i - 1].includes('|')) continue;
    // GFM's own rule: the delimiter row has exactly as many cells as the header. Without it,
    // `Setext | heading` over `---` — a heading — would read as a one-row table.
    const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').length;
    if (cells(t) !== cells(lines[i - 1])) continue;
    found.add(i - 1);
    found.add(i);
    for (let j = i + 1; j < lines.length && outside[j] && lines[j].trim() && lines[j].includes('|'); j++) found.add(j);
  }
  return found;
}

/**
 * Flatten a slide's Markdown to plain readable narration text.
 * @param {string} markdown a single slide's Markdown
 * @returns {string} the readable narration (words only; '' when nothing to say)
 */
function slideToSpeech(markdown) {
  // Comments first, and BLOCK-aware — a note is a comment, and it is routinely
  // multi-line. See blankHtmlComments above for what the old line-prefix test leaked.
  const lines = blankHtmlComments(markdown).split('\n');
  const tableLines = gfmTableLines(lines);
  const out = [];
  const fence = createFenceReader();
  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const line = raw.trim();
    // A fence's markers and its body both say nothing — code is not read aloud.
    if (fence.read(raw) !== 'outside') continue;
    if (!line) continue;
    if (/^!\[/.test(line)) continue; // ![bg](…) / images — nothing to say
    if (/^[-=*_]{3,}$/.test(line)) continue; // slide rule / hr
    // A GFM TABLE ROW reads as its cells, a row per sentence. Before this the pipes and the
    // `| --- | :--: |` separator reached the voice verbatim — measured on roadmap and
    // matrix-grid through this flatten: ", ---------- , :--, , [ ] , - , x Distinguished".
    // It is the fallback Present speaks until the rendered projection lands, and the only
    // reader of a slide's raw Markdown, so a table has to survive it. A cell's leading state
    // mark (`[x]`, `[-]`, `[ ]`, …) is dropped rather than read as punctuation: its WORD is the
    // component's (roadmap's `[x]` is "Shipped", matrix-grid's is a filled cell), which only
    // the rendered projection knows.
    if (tableLines.has(idx)) {
      if (TABLE_SEPARATOR.test(line)) continue; // the `| --- | :--: |` row says nothing
      const cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim().replace(LEADING_MARKER_PREFIX_RE, '').trim())
        .filter(Boolean);
      if (cells.length) out.push(`${cells.join(', ')}.`);
      continue;
    }
    // STRIP THE MARKER HERE, where it is still anchored to the start of its own line.
    //
    // The marker strips used to run on the JOINED text, by which point "start of line" had
    // become "anywhere after a space" — and the synthetic terminator below had already turned
    // a chart bullet's own value into something shaped exactly like an ordered marker. So
    // `- First \`120\`` became "First 120." and then the `\d+\.\s+` strip ate "120. " as if it
    // were a list number. Measured: `- First \`120\` / - Second \`95\` / - Third \`31\`` narrated
    // as "First Second Third 31." — every whole-integer value silently deleted except the last,
    // which survived only because it had no trailing space to match. Decimals, percents and
    // signed values were unaffected, which is why it went unnoticed: it hit exactly the bare
    // integers that chart bullets are full of.
    //
    // Stripping per line also stops the joined-text passes from eating a legitimate mid-sentence
    // `-` or `>`, which they could not tell from a bullet or a quote marker either.
    const isStructural = STRUCTURAL_LINE.test(line);
    const body = line.replace(/^(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s?)+/, '');
    if (!body) continue; // a bare marker with nothing after it says nothing
    // Give a structural line a terminator so Cadenza's punctuation-driven pause
    // (cadence.ts's PAUSE_MS) actually falls between clauses — otherwise a list
    // of bullets reads as one run-on sentence with no breath between them.
    out.push(isStructural && !TERMINATED.test(body) ? `${body}.` : body);
  }
  let text = out.join(' ');
  // Inline syntax → words only.
  text = text
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links / images → label
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1') // emphasis
    // The four marker strips that used to live here are gone: every one of them ran on the
    // JOINED text, where they could not tell a line-start marker from the same characters in
    // the middle of a sentence. The markers are stripped per line above, at the only place
    // they are unambiguous. See the note there for the value-deletion bug this caused.
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

module.exports = { slideToSpeech, blankHtmlComments, createFenceReader };
