/**
 * lib/plugins/video/shared/fences.js — where a record line is DRAWN: the fence step the plugin's lint rules
 * (video.lint.js) and the Marp export (video-marp-export.js) share, and the lines of a slide that hold a record the
 * engine draws. Pure, fs-free.
 */

/**
 * One step of fence tracking for a line, STRICT where CommonMark is simple and CONSERVATIVE where it is not. A fence at the left margin
 * (up to three spaces) opens on three or more backticks or tildes (the info string may follow; a backtick fence's may not hold a
 * backtick) and closes only on the same character, at least as long, with nothing after it. A fence-looking run inside a quote, a list
 * item or an indented block (four spaces) is `container: true`: whether it opens a fence depends on how the container ends, so a caller
 * that rewrites text must treat everything after it as uncertain, and one that only reads may carry on.
 * @param {string} line
 * @param {{ ch: string, len: number } | null} state
 * @returns {{ state: { ch: string, len: number } | null, inside: boolean, container: boolean }}
 */
function fenceStep(line, state) {
  const text = String(line);
  const margin = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
  if (!state) {
    if (margin && !(margin[1][0] === '`' && margin[2].includes('`'))) return { state: { ch: margin[1][0], len: margin[1].length }, inside: true, container: false };
    return { state: null, inside: false, container: /^(?:\s*(?:>|[-*+]\s|\d+[.)]\s))*\s*(?:`{3,}|~{3,})/.test(text) };
  }
  const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(text);
  if (close && close[1][0] === state.ch && close[1].length >= state.len) return { state: null, inside: true, container: false };
  return { state, inside: true, container: false };
}

/**
 * The line indexes of the `@video{…}` records the engine DRAWS as a figure: a record that is a paragraph of its own, in the open, or
 * the sole content of a list item or a quote. Everything the engine leaves as code is left out: a record inside a code fence (any
 * marker, any length), an indented code block, a multi-line HTML comment, or a lazy continuation of a paragraph above or below it.
 * The lint rules about where a record may go read this so they say what the engine does, not what a line looks like.
 * @param {string[]} lines
 * @returns {number[]}
 */
function drawnRecordLines(lines) {
  const out = [];
  const RECORD = /^ {0,3}((?:>\s*)*)((?:[-*+]|\d+[.)])\s+)?`@video\{.*\}`\s*$/;
  const strip = (l) => String(l).trim().replace(/^(?:>\s*)+/, '');
  const ENDS = /^(?:#{1,6}(?:\s|$)|```|~~~|(?:-\s*){3,}$|(?:\*\s*){3,}$|(?:_\s*){3,}$)/;
  const CONTINUES_NOT = /^(?:#{1,6}(?:\s|$)|```|~~~|<|>|[-*+]\s|\d+[.)]\s|(?:-\s*){3,}$|(?:\*\s*){3,}$|(?:_\s*){3,}$)/;
  let fence = null;
  let comment = false;
  for (let i = 0; i < lines.length; i++) {
    const step = fenceStep(lines[i], fence);
    fence = step.state;
    if (step.inside || step.container) continue;
    if (comment) {
      if (lines[i].includes('-->')) comment = false;
      continue;
    }
    // A `<!--` inside an inline code span is text, not a comment.
    const bare = lines[i].replace(/`[^`]*`/g, '');
    if (/<!--/.test(bare) && !bare.includes('-->')) {
      comment = true;
      continue;
    }
    const m = RECORD.exec(lines[i]);
    if (!m) continue;
    const above = i === 0 ? '' : strip(lines[i - 1]);
    const below = strip(lines[i + 1] || '');
    const aboveEnds = above === '' || above.endsWith('-->') || ENDS.test(above) || (!!m[2] && (/^(?:[-*+]|\d+[.)])\s/.test(above) || /^>/.test(String(lines[i - 1] || '').trim())));
    const belowContinues = below !== '' && !CONTINUES_NOT.test(below);
    // A paragraph line over `---` or `===` is a setext heading, not a figure. (A list item over `---` is a thematic break.)
    const setext = !m[2] && /^(?:=+|-{2,})\s*$/.test(below);
    if (aboveEnds && !belowContinues && !setext) out.push(i);
  }
  return out;
}

module.exports = { fenceStep, drawnRecordLines };
