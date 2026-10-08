/**
 * lib/core/marp-front-matter.js — where Marp's front matter ends, by Marp's own rule.
 *
 * The Export-to-Marp bundle checks a deck's markdown twice before Marp sees it: the script strip
 * (lib/core/live-author-html.js) and the plugin-marker refusal (lib/plugins/author-markup.js). Both
 * parse with plain markdown-it, which reads the front matter as Markdown, while Marp removes it
 * first. So both have to find the front matter exactly as Marp does: a YAML value that opens a code
 * fence otherwise turns the whole body into "code" for the check and live HTML for Marp
 * (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 12).
 *
 * THE RULE, measured on marp-core 4.4 (markdown-it-front-matter), not assumed:
 *   - it opens on the FIRST line, with three or more dashes at column 0; any text may follow them
 *     (`---x` opens one);
 *   - it closes on the first later line holding at least as many dashes as the opener, or `...`,
 *     indented by at most three spaces, with nothing after but spaces or tabs (`-----` closes
 *     `---`; `---` does not close `----`; `--- x` closes nothing);
 *   - with no closing line there is no body: Marp reads the whole file as front matter.
 */

/**
 * @param {readonly string[]} lines  the deck's lines, each with or without its line break
 * @returns {number} the index of the closing line; -1 when there is no front matter; and
 *   `lines.length - 1` when it opens and never closes (the whole file is front matter)
 */
function frontMatterEnd(lines) {
  const open = /^(-{3,})/.exec(lines[0] ?? '');
  if (!open) return -1;
  const close = new RegExp(`^ {0,3}(?:-{${open[1].length},}|\\.{3})[ \\t]*(?:\\r\\n?|\\n)?$`);
  for (let i = 1; i < lines.length; i++) if (close.test(lines[i])) return i;
  return lines.length - 1;
}

/** Split keeping each line's own break (CRLF, a lone CR or LF), as markdown-it counts lines. */
const LINE_BREAK = /(?<=\r\n|\r(?!\n)|\n)/;

/**
 * The deck with its front matter's lines EMPTIED (their breaks kept), so a parse of it maps the
 * same lines as the deck and reads the body as Marp does. A whole-file front matter empties all of it.
 * @param {string} src
 */
function withoutFrontMatterLines(src) {
  const lines = String(src ?? '').split(LINE_BREAK);
  const end = frontMatterEnd(lines);
  if (end < 0) return String(src ?? '');
  return lines.map((l, i) => (i <= end ? l.replace(/[^\r\n]/g, '') : l)).join('');
}

module.exports = { frontMatterEnd, withoutFrontMatterLines, LINE_BREAK };
