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
 * Flatten a slide's Markdown to plain readable narration text.
 * @param {string} markdown a single slide's Markdown
 * @returns {string} the readable narration (words only; '' when nothing to say)
 */
function slideToSpeech(markdown) {
  const lines = String(markdown || '').split('\n');
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
    if (/^<!--/.test(line)) continue; // _class / directive comments
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

module.exports = { slideToSpeech };
