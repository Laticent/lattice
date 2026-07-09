/**
 * Fence-aware slide splitter for Lattice / Marp source.
 *
 * Marp splits on top-level `---` (and on h1..hN when `headingDivider: N`
 * is set in front matter). The naive regex split that the emulator
 * previously used was incorrect inside fenced code blocks — any `---`
 * line inside a ``` … ``` or ~~~ … ~~~ block was mis-treated as a slide
 * boundary, which broke decks that demonstrate Markdown samples (the
 * templates docs and authoring-proposals notes routinely do this).
 *
 * Algorithm: walk lines, track open-fence state (``` or ~~~ with
 * matching closer length), and split only when an `---` line appears
 * outside a fence. When `headingDivider` is set, also split on
 * heading-of-level ≤ N at the start of a line outside a fence.
 *
 * Mirrors what markdown-it/Marpit do without pulling them in for just
 * the splitter — fence tracking is small and self-contained, and the
 * authoritative cross-check is the semantic-invariant suite's
 * expected-page-count fixtures for the gallery.
 *
 * Front matter (the leading `---\n…\n---\n` block) should be stripped
 * by the caller before invoking this; this splitter operates on the
 * body only.
 */
function splitSlides(text, headingDivLevel) {
  const out = [];
  const lines = text.split('\n');
  let cur = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  const flushIfNonEmpty = () => {
    const joined = cur.join('\n').trim();
    if (joined.length > 0) out.push(joined);
    cur = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFence) {
      const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (open) {
        inFence = true;
        fenceChar = open[1][0];
        fenceLen = open[1].length;
        cur.push(line);
        continue;
      }
      if (/^---\s*$/.test(line)) {
        flushIfNonEmpty();
        continue;
      }
      if (headingDivLevel) {
        const h = line.match(/^(#{1,6})\s/);
        if (h && h[1].length <= headingDivLevel && cur.some(l => l.trim().length > 0)) {
          flushIfNonEmpty();
          cur.push(line);
          continue;
        }
      }
      cur.push(line);
    } else {
      cur.push(line);
      const close = line.match(new RegExp(`^\\s{0,3}(${fenceChar}{${fenceLen},})\\s*$`));
      if (close) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }
    }
  }
  flushIfNonEmpty();
  return out;
}

module.exports = { splitSlides };
