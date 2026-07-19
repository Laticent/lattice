// Fence-aware top-level slide split — the shared authoring-kernel primitive.
//
// Marp splits a deck into slides on a `---` line. The naive `source.split(/^---$/m)`
// the authoring cores used is fence-BLIND: a `---` inside a ``` … ``` or ~~~ … ~~~
// code block (routine in decks that show Markdown/diff/YAML samples) was mis-read as
// a slide boundary, so every slide number AFTER it desynced — which in turn made the
// Coach's per-finding AI fix target the wrong slide. This heals that without changing
// any other behavior.
//
// `splitTopLevel` is BYTE-FAITHFUL to `source.split(/^---$/m)` for any deck with no
// fenced `---`: it starts from that exact naive split and only RE-MERGES the chunks
// whose boundary `---` fell inside an open fence (re-inserting the removed `---`, which
// reconstructs the original bytes exactly). So the front-matter chunk model, the empty
// leading chunk, and every consumer's index math are preserved untouched; the only
// decks whose chunking changes are the ones that were being mis-split.
//
// The `lib/core/split-slides.js` splitter is also fence-aware but has a different
// contract (front matter pre-stripped, trimmed, empties dropped) tuned for the render
// emulator; the authoring cores need the raw-chunk contract, hence this sibling.

// Does `text` end with an OPEN code fence (a ``` / ~~~ opened and not yet closed)?
// Tracks the opener's char + run length so a shorter inner fence can't close it, and
// allows up to 3 leading spaces (CommonMark), mirroring lib/core/split-slides.js.
function fenceOpen(text) {
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  const lines = String(text).split('\n');
  for (const line of lines) {
    if (!inFence) {
      const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (open) {
        inFence = true;
        fenceChar = open[1][0];
        fenceLen = open[1].length;
      }
    } else {
      const close = line.match(new RegExp(`^\\s{0,3}(\\${fenceChar}{${fenceLen},})\\s*$`));
      if (close) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }
    }
  }
  return inFence;
}

// Split `source` into the same chunk array `source.split(/^---$/m)` yields, EXCEPT a
// `---` sitting inside an open fence does not split (its chunk is re-merged with the
// next, re-inserting the exact `---` the naive split removed → byte-identical output
// for fence-free decks).
function splitTopLevel(source) {
  const naive = String(source || '').split(/^---$/m);
  if (naive.length < 2) return naive;
  const out = [];
  let cur = naive[0];
  for (let k = 1; k < naive.length; k++) {
    if (fenceOpen(cur)) cur = `${cur}---${naive[k]}`; // boundary was inside a fence — undo the split
    else {
      out.push(cur);
      cur = naive[k];
    }
  }
  out.push(cur);
  return out;
}

// The line indices that are TOP-LEVEL slide separators (a `---` line outside any
// fence) — the line-based analog of `splitTopLevel`, for consumers that walk lines
// (e.g. the autofix chunk-scope). Matches `/^---$/m`'s set exactly: fence-skipping
// AND CRLF-tolerant (a `---\r` line splits under `/^---$/m`, so it must here too),
// so a line walk and a regex split never disagree on where a boundary is.
function separatorLines(lines) {
  const set = new Set();
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFence) {
      const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (open) { inFence = true; fenceChar = open[1][0]; fenceLen = open[1].length; continue; }
      if (/^---\r?$/.test(line)) set.add(i);
    } else if (line.match(new RegExp(`^\\s{0,3}(\\${fenceChar}{${fenceLen},})\\s*$`))) {
      inFence = false;
      fenceChar = '';
      fenceLen = 0;
    }
  }
  return set;
}

module.exports = { splitTopLevel, fenceOpen, separatorLines };
