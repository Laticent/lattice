/**
 * lib/plugins/video/shared/fences.js — where a record line is DRAWN: the lines of a slide that hold a record the engine
 * draws, for the plugin's lint rules (video.lint.js). The fence step it walks with is the host's (`ctx.fenceStep`,
 * lib/core/plugin-ctx.js), shared with the image plugin's Marp export. Pure, fs-free.
 */

/**
 * The line indexes of the `@video{…}` / `>{…}` records the engine DRAWS as a figure: a record that is a paragraph of its own, in the open, or
 * the sole content of a list item or a quote. Everything the engine leaves as code is left out: a record inside a code fence (any
 * marker, any length), an indented code block, a multi-line HTML comment, or a lazy continuation of a paragraph above or below it.
 * The lint rules about where a record may go read this so they say what the engine does, not what a line looks like.
 * @param {string[]} lines
 * @param {typeof import('../../../core/plugin-ctx.js').fenceStep} fenceStep  the host's (`ctx.fenceStep`)
 * @returns {number[]}
 */
function drawnRecordLines(lines, fenceStep) {
  const out = [];
  const RECORD = /^ {0,3}((?:>\s*)*)((?:[-*+]|\d+[.)])\s+)?`(?:@video|>)\{.*\}`\s*$/;
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

module.exports = { drawnRecordLines };
