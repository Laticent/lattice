// The Drawing Board — the Converse editing protocol (Slice B).
//
// Converse can now propose concrete deck edits, not just advice: the model emits
// tagged EDIT BLOCKS, the app turns each into a reviewable diff + one-click Apply,
// and the deterministic engine re-scores the moment it lands (the model never owns
// correctness). This module is the pure core — protocol parsing, the surgical
// slide splice, and the line diff — all `fs`-free and dependency-free so it's
// fully verifiable headless. The DOM cards + wiring live in drawing-board-chat.js.
//
// Slides are addressed 1-based among the REAL slides — front matter excluded —
// so a `slide=N` here lines up with the preview's "Slide N", the finding's
// `slide`, the Reveal jump, and the [slide N] prompt markers. Front matter
// occupies the first two `---`-split chunks (the empty pre-fence text + the YAML
// body); fmChunks() translates a human slide number to the raw chunk index the
// splice machinery below works in, so that machinery stays untouched.

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;
function fmChunks(source) {
  return FRONT_MATTER.test(String(source || '')) ? 2 : 0;
}

// ── The prompt half ──────────────────────────────────────────────────────────

// Show the deck with unambiguous [slide N] markers so the model can address a
// slide reliably (counting `---` by hand on a long deck is error-prone). Front
// matter is dropped from the view — the model edits real slides, numbered from 1.
// The markers are stripped from any edit body it sends back (see EDIT_PROTOCOL).
export function numberSlides(source) {
  const slides = String(source || '').split(/^---$/m);
  if (slides.length === 1 && !slides[0].trim()) return '';
  const real = slides.slice(fmChunks(source));
  if (!real.length) return '';
  return real.map((s, i) => `[slide ${i + 1}]\n${s.trim()}`).join('\n\n---\n\n');
}

// The contract handed to the cloud model (rich tier only). Four-backtick fences
// so a slide containing ```chart / ```mermaid doesn't close the edit block early.
export const EDIT_PROTOCOL =
  'EDITING — you can change the deck, not just advise. When the author agrees to a ' +
  'change, propose it as an EDIT BLOCK; the app shows them a diff and an Apply button ' +
  '(nothing changes until they click). Rules:\n' +
  '- Use a FOUR-backtick fence (so ```chart / ```mermaid inside a slide don’t end it):\n' +
  '  ````lattice-edit slide=3\n' +
  '  <!-- _class: cards-grid -->\n' +
  '  ## Heading\n' +
  '  - Card title\n' +
  '    - body\n' +
  '  ````\n' +
  '- `slide=N` replaces slide N — give the WHOLE slide (the `_class` line through its ' +
  'last line). `after=N` inserts a NEW slide after slide N (`after=0` prepends, ' +
  '`after=end` appends). `delete=N` removes slide N.\n' +
  '- Address slides by the [slide N] markers in the deck below. NEVER include the ' +
  '[slide N] marker in the body.\n' +
  '- One block per slide changed. Keep your prose brief — the blocks carry the change. ' +
  'Only emit a block when the author actually wants the edit; otherwise just advise. ' +
  'Follow the Lattice authoring rules above (especially card-style nesting).';

// ── Protocol parsing ─────────────────────────────────────────────────────────

// Pull EDIT BLOCKS out of a model reply. Returns the prose (blocks removed) plus a
// list of structured edits. Tolerant: a malformed block is left in the prose
// rather than silently swallowed. `(\`{3,})…\1` matches the opening fence length
// to the close, so four-backtick blocks (with nested triple fences) parse cleanly.
const EDIT_RE = /(`{3,})lattice-edit([^\n]*)\n([\s\S]*?)\n?\1/g;

export function parseEdits(reply) {
  const src = String(reply || '');
  const edits = [];
  let text = '';
  let last = 0;
  let m;
  EDIT_RE.lastIndex = 0;
  while ((m = EDIT_RE.exec(src))) {
    text += src.slice(last, m.index);
    last = m.index + m[0].length;
    const attrs = m[2] || '';
    const body = m[3] || '';
    const del = /delete=(\d+)/.exec(attrs);
    const after = /(?:insert-)?after=(\d+|end)/.exec(attrs);
    const slide = /slide=(\d+)/.exec(attrs);
    if (del) edits.push({ action: 'delete', slide: Number(del[1]), body: '' });
    else if (after) edits.push({ action: 'insert', slide: after[1] === 'end' ? Number.MAX_SAFE_INTEGER : Number(after[1]), body });
    else if (slide) edits.push({ action: 'replace', slide: Number(slide[1]), body });
    else text += m[0]; // unrecognised — keep the raw block in the prose
  }
  text += src.slice(last);
  return { text: text.trim(), edits };
}

// ── The surgical splice ──────────────────────────────────────────────────────

// Line ranges [startLine, endLine] for each slide's CONTENT (separators excluded),
// so an edit touches only the target slide and leaves every other byte intact.
function slideRanges(lines) {
  const ranges = [];
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '---') { ranges.push([start, i - 1]); start = i + 1; }
  }
  ranges.push([start, lines.length - 1]);
  return ranges;
}

// How many real slides the deck has (front matter excluded; 1-based addressing
// tops out here).
export function slideCount(source) {
  return Math.max(0, String(source || '').split(/^---$/m).length - fmChunks(source));
}

// Read one slide's content (trimmed) — the "before" side of a diff. `n` is the
// human 1-based slide number; `+ fm` maps it to the raw chunk range.
export function sliceSlide(source, n) {
  const lines = String(source || '').split('\n');
  const ranges = slideRanges(lines);
  const raw = n + fmChunks(source);
  if (n < 1 || raw > ranges.length) return '';
  const [a, b] = ranges[raw - 1];
  return lines.slice(a, b + 1).join('\n').trim();
}

// Apply one edit, preserving every untouched byte (separators, other slides, and
// the edited slide's own blank-line cushion). Returns the new source; an
// out-of-range target returns the source unchanged.
export function applyEdit(source, edit) {
  if (!edit) return source;
  const fm = fmChunks(source);
  const lines = String(source || '').split('\n');
  const ranges = slideRanges(lines);
  const count = ranges.length; // raw chunk count (front matter included)

  if (edit.action === 'replace') {
    const n = edit.slide + fm; // human slide number → raw chunk index
    if (edit.slide < 1 || n > count) return source;
    const [a, b] = ranges[n - 1];
    const seg = lines.slice(a, b + 1);
    // Keep the original leading/trailing blank lines; swap only the content.
    let lead = 0;
    while (lead < seg.length && seg[lead].trim() === '') lead++;
    let trail = 0;
    while (trail < seg.length - lead && seg[seg.length - 1 - trail].trim() === '') trail++;
    const inner = edit.body.trim().split('\n');
    const repl = [...Array(lead).fill(''), ...inner, ...Array(trail).fill('')];
    lines.splice(a, b - a + 1, ...repl);
    return lines.join('\n');
  }

  if (edit.action === 'delete') {
    const n = edit.slide + fm; // human slide number → raw chunk index
    if (edit.slide < 1 || n > count) return source;
    // Drop the slide's lines AND one bordering separator so we don't leave `---\n---`.
    const [a, b] = ranges[n - 1];
    if (n < count) lines.splice(a, b - a + 2); // include the `---` that follows
    else if (a > 0) lines.splice(a - 1, b - a + 2); // last slide: take the leading `---`
    else lines.splice(a, b - a + 1);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  if (edit.action === 'insert') {
    // Insert among the REAL slides, keeping the front matter verbatim. after=N
    // lands after real slide N (after=0 prepends a new slide 1, after=end
    // appends). The old split/rejoin reformatted the `---…---` fence and broke
    // Marp's front-matter parsing, so the front matter is reattached untouched.
    const block = edit.body.trim();
    const all = String(source || '').split(/^---$/m);
    const real = all.slice(fm).map((s) => s.replace(/^\n+|\n+$/g, ''));
    const at = edit.slide === Number.MAX_SAFE_INTEGER ? real.length : Math.max(0, Math.min(real.length, edit.slide));
    real.splice(at, 0, block);
    const body = real.join('\n\n---\n\n');
    if (!fm) return `${body}\n`;
    const yaml = (all[1] || '').replace(/^\n+|\n+$/g, '');
    return `---\n${yaml}\n---\n\n${body}\n`;
  }

  return source;
}

// ── The line diff (review card) ──────────────────────────────────────────────

// A minimal LCS line diff → [{ type:'same'|'add'|'del', text }]. Pure; the card
// renders these as ± rows so "review a diff, then Apply" is a real diff.
export function diffLines(before, after) {
  const A = String(before ?? '').split('\n');
  const B = String(after ?? '').split('\n');
  const m = A.length;
  const n = B.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { out.push({ type: 'same', text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: A[i] }); i++; }
    else { out.push({ type: 'add', text: B[j] }); j++; }
  }
  while (i < m) out.push({ type: 'del', text: A[i++] });
  while (j < n) out.push({ type: 'add', text: B[j++] });
  return out;
}
