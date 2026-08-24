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

// A line that markdown treats as STRUCTURE (heading / list item / blockquote): it
// gets a synthetic terminator so the caption engine breathes between clauses.
const STRUCTURAL_LINE = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?)/;
// Already ends in sentence punctuation → no synthetic terminator needed.
const TERMINATED = /[.!?;:,…]\s*$/;

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
  let inFence = false;
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
    if (/^```/.test(raw.trim())) {
      inFence = !inFence;
      out.push(raw);
      continue;
    }
    if (inFence) {
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

/**
 * Flatten a slide's Markdown to plain readable narration text.
 * @param {string} markdown a single slide's Markdown
 * @returns {string} the readable narration (words only; '' when nothing to say)
 */
function slideToSpeech(markdown) {
  // Comments first, and BLOCK-aware — a note is a comment, and it is routinely
  // multi-line. See blankHtmlComments above for what the old line-prefix test leaked.
  const lines = blankHtmlComments(markdown).split('\n');
  const out = [];
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line) continue;
    if (/^!\[/.test(line)) continue; // ![bg](…) / images — nothing to say
    if (/^[-=*_]{3,}$/.test(line)) continue; // slide rule / hr
    // Give a structural line a terminator so Cadenza's punctuation-driven pause
    // (cadence.ts's PAUSE_MS) actually falls between clauses — otherwise a list
    // of bullets reads as one run-on sentence with no breath between them.
    out.push(STRUCTURAL_LINE.test(line) && !TERMINATED.test(line) ? `${line}.` : line);
  }
  let text = out.join(' ');
  // Inline syntax → words only.
  text = text
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links / images → label
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1') // emphasis
    .replace(/^#+\s*/g, '') // stray heading marks
    .replace(/(^|\s)[#>]+\s*/g, '$1') // blockquote / heading markers
    .replace(/(^|\s)[-*+]\s+/g, '$1') // list bullets
    .replace(/(^|\s)\d+\.\s+/g, '$1') // ordered markers
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

module.exports = { slideToSpeech, blankHtmlComments };
