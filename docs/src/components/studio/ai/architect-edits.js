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

// ── Fence-aware slide boundaries ───────────────────────────────────────────────
// A `---` INSIDE a ```/~~~ code fence (routine in decks that show Markdown / diff /
// YAML samples) is not a slide boundary. Treating it as one desynced every slide
// number after it — and so made the Coach's per-finding AI fix target the wrong
// slide. These mirror lib/authoring/slide-split.js but are kept LOCAL so this module
// stays dependency-free + headless-verifiable (its stated contract).

// Does `text` end with an unclosed code fence? (opener char + run length tracked so a
// shorter inner fence can't close it; up to 3 leading spaces per CommonMark.)
export function fenceOpen(text) {
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  for (const line of String(text).split('\n')) {
    if (!inFence) {
      const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (open) { inFence = true; fenceChar = open[1][0]; fenceLen = open[1].length; }
    } else if (line.match(new RegExp(`^\\s{0,3}(\\${fenceChar}{${fenceLen},})\\s*$`))) {
      inFence = false; fenceChar = ''; fenceLen = 0;
    }
  }
  return inFence;
}

// Byte-faithful to `source.split(/^---$/m)` EXCEPT a fenced `---` doesn't split (the
// chunk is re-merged, re-inserting the exact `---` the naive split removed). So the
// front-matter chunk model + every index calc below are preserved for fence-free decks.
export function splitTopLevel(source) {
  const naive = String(source || '').split(/^---$/m);
  if (naive.length < 2) return naive;
  const out = [];
  let cur = naive[0];
  for (let k = 1; k < naive.length; k++) {
    if (fenceOpen(cur)) cur = `${cur}---${naive[k]}`;
    else { out.push(cur); cur = naive[k]; }
  }
  out.push(cur);
  return out;
}

// (`bodySplitsSlides` lived here: one predicate covering both "the body smuggles a
// top-level `---`" and "the body's fence never closes". It was split into the two
// checks it always was, inline in `applyEditChecked`, because the two now diverge —
// each needs its OWN author-facing reason, and a multi-slide body is legal on an
// insert and illegal on a replace. An unclosed fence remains fatal to both: it
// swallows the deck's next real `---` on reparse, trapping a later slide inside this
// one's code block. Contract unchanged — refuse rather than corrupt (trio red team).)

// Line indices that are TOP-LEVEL slide separators (a `---` line outside any fence) —
// the line-based analog the surgical splice reads.
export function separatorLines(lines) {
  const set = new Set();
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFence) {
      const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (open) { inFence = true; fenceChar = open[1][0]; fenceLen = open[1].length; continue; }
      if (/^---\r?$/.test(line)) set.add(i); // CRLF-tolerant so it agrees with splitTopLevel (/^---$/m splits `---\r\n`)
    } else if (line.match(new RegExp(`^\\s{0,3}(\\${fenceChar}{${fenceLen},})\\s*$`))) {
      inFence = false; fenceChar = ''; fenceLen = 0;
    }
  }
  return set;
}

// ── The prompt half ──────────────────────────────────────────────────────────

// Show the deck with unambiguous [slide N] markers so the model can address a
// slide reliably (counting `---` by hand on a long deck is error-prone). Front
// matter is dropped from the view — the model edits real slides, numbered from 1.
// The markers are stripped from any edit body it sends back (see EDIT_PROTOCOL).
export function numberSlides(source) {
  const slides = splitTopLevel(source);
  if (slides.length === 1 && !slides[0].trim()) return '';
  const real = slides.slice(fmChunks(source));
  if (!real.length) return '';
  return real.map((s, i) => `[slide ${i + 1}]\n${s.trim()}`).join('\n\n---\n\n');
}

// The contract handed to the cloud model (rich tier only).
//
// TILDE fences, not backticks. The payload is a SLIDE, and Lattice slides routinely
// carry ```mermaid / ```chart blocks — so the wrapper has to differ from the payload
// in MARKER, not merely in length. Length is the fragile axis: it asks the model to
// hold a counting invariant (four ticks out, three in) against its single strongest
// habit, and CommonMark then lets the payload's own bare ``` legally close a
// same-marker wrapper. A model emits ~~~ essentially never, so the collision goes
// away by marker class. `parseEdits` still ACCEPTS a backtick wrapper (a model that
// ignores this shouldn't lose its edit) and reports the collision when one bites.
// See engineering/decisions/2026-08-04-chat-edit-protocol.md.
export const EDIT_PROTOCOL =
  'EDITING — you can change the deck, not just advise. When the author agrees to a ' +
  'change, propose it as an EDIT BLOCK; the app shows them a diff and an Apply button ' +
  '(nothing changes until they click). Rules:\n' +
  '- Wrap the block in a TILDE fence — NEVER backticks. The slide inside will contain ' +
  '```mermaid / ```chart fences, and a backtick wrapper collides with them:\n' +
  '  ~~~lattice-edit slide=3\n' +
  '  <!-- _class: cards-grid -->\n' +
  '  ## Heading\n' +
  '  - Card title\n' +
  '    - body\n' +
  '  ~~~\n' +
  '- `slide=N` replaces slide N — give the WHOLE slide (the `_class` line through its ' +
  'last line). `after=N` inserts new slides after slide N (`after=0` prepends, ' +
  '`after=end` appends). `delete=N` removes slide N.\n' +
  '- An `after=` body MAY carry SEVERAL slides, separated by a `---` line on its own — ' +
  'that is how you add a run of slides in one block. A `slide=` body is exactly ONE ' +
  'slide: never put a `---` separator in it.\n' +
  '- Address slides by the [slide N] markers in the deck below. NEVER include the ' +
  '[slide N] marker in the body.\n' +
  '- One block per slide changed. Keep your prose brief — the blocks carry the change. ' +
  'Only emit a block when the author actually wants the edit; otherwise just advise. ' +
  'Follow the Lattice authoring rules above (especially card-style nesting).\n' +
  '- You have NO tools. You cannot run commands, render the deck, compile a diagram, or ' +
  'check your own output — there is no shell here. Never say you tested, ran, rendered, ' +
  'or verified anything. Describe what you changed and let the author look.';

// ── Protocol parsing ─────────────────────────────────────────────────────────

// An edit-block OPENER, anchored to its own line: a run of 3+ tildes or backticks
// followed immediately by `lattice-edit` and its attributes. Line-anchoring matters —
// the old expression was unanchored and could start its match ONE CHARACTER INTO a
// four-backtick fence, degrading it to a three-backtick match that the payload's own
// ```mermaid then closed. See the decision doc.
const EDIT_OPEN = /^[ \t]{0,3}(~{3,}|`{3,})lattice-edit([^\n]*)$/;

// CommonMark's closing-fence rule: same marker, run at least as long as the opener,
// and NOTHING else on the line. An info-string line (```mermaid) is an OPENER and can
// never close anything — the old backreference ignored that and let it close ours.
// The marker goes in a character class so both `` ` `` and `~` stay literal.
function fenceCloser(fence) {
  return new RegExp(`^[ \\t]{0,3}[${fence[0]}]{${fence.length},}[ \\t]*$`);
}

// A NOUN PHRASE naming what a block was aiming at, so a problem message reads as a
// sentence ("The edit block for the new slides at the end was never closed…").
function describeTarget(attrs) {
  const del = /delete=(\d+)/.exec(attrs);
  const after = /(?:insert-)?after=(\d+|end)/.exec(attrs);
  const slide = /slide=(\d+)/.exec(attrs);
  if (del) return `the deletion of slide ${del[1]}`;
  if (after) return after[1] === 'end' ? 'the new slides at the end' : `the new slide after slide ${after[1]}`;
  if (slide) return `slide ${slide[1]}`;
  return 'an unlabeled slide';
}

// Attributes → a structured edit, or null when none is recognized.
function editFromAttrs(attrs, body) {
  const del = /delete=(\d+)/.exec(attrs);
  const after = /(?:insert-)?after=(\d+|end)/.exec(attrs);
  const slide = /slide=(\d+)/.exec(attrs);
  if (del) return { action: 'delete', slide: Number(del[1]), body: '' };
  if (after) return { action: 'insert', slide: after[1] === 'end' ? Number.MAX_SAFE_INTEGER : Number(after[1]), body };
  if (slide) return { action: 'replace', slide: Number(slide[1]), body };
  return null;
}

// Pull EDIT BLOCKS out of a model reply. Returns the prose (blocks removed), the list
// of structured edits, and a list of PROBLEMS — blocks that were recognizably meant as
// edits but can't be trusted as one. Tolerant where tolerance is safe (an unrecognized
// attribute leaves the raw block in the prose); LOUD where it isn't.
//
// The two problems that matter, both of which used to produce a silently mangled slide:
//   - UNTERMINATED — the reply was cut off (max_tokens) before the closing fence. The
//     old expression recovered by matching a SHORTER fence and cutting the body at the
//     payload's first ```, so a truncated deck became a heading with its diagram
//     amputated, applied without a word.
//   - FENCE COLLISION — a backtick wrapper closed early on the payload's own bare ```,
//     leaving an unclosed fence in the body. Same corruption, different trigger.
// Neither yields an edit. The caller reports them; nothing is applied on a guess.
export function parseEdits(reply) {
  // LINE ENDINGS: a model reply is EXTERNAL INPUT, and this is the funnel every edit body
  // crosses — so it normalizes here rather than per-edit in `applyEdit`. `applyEdit` splits on
  // '\n' and splices `body` VERBATIM into deck source, so a model that emits CRLF (they do)
  // produced a MIXED-EOL deck that was then persisted and shared out that way, against the
  // LF-out-of-every-export claim. Normalizing the whole reply also covers the prose half, which
  // is rendered as chat. `\r\n?` covers CRLF and classic-Mac lone CR; it is a no-op on LF.
  const src = String(reply || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n'); // LF boundary — see SANCTIONED_EOL_BOUNDARIES
  const lines = src.split('\n');
  const edits = [];
  const problems = [];
  const prose = [];
  for (let i = 0; i < lines.length; i++) {
    const open = EDIT_OPEN.exec(lines[i]);
    if (!open) {
      prose.push(lines[i]);
      continue;
    }
    const [, fence, rawAttrs] = open;
    const attrs = rawAttrs || '';
    const closes = fenceCloser(fence);
    let end = i + 1;
    while (end < lines.length && !closes.test(lines[end])) end++;
    if (end >= lines.length) {
      // Everything after the opener is this block's body, so there is nothing left to scan.
      problems.push({ kind: 'unterminated', target: describeTarget(attrs), message: `The edit block for ${describeTarget(attrs)} was never closed — the reply looks cut off, so nothing was applied from it.` });
      break;
    }
    const body = lines.slice(i + 1, end).join('\n');
    const edit = editFromAttrs(attrs, body);
    const start = i;
    i = end;
    if (!edit) {
      prose.push(...lines.slice(start, end + 1)); // unrecognized attributes — keep the raw block
      continue;
    }
    // A body whose own fence never closes means the wrapper was closed by the PAYLOAD's
    // fence — the block is truncated at that point, whatever the rest of the reply says.
    if (fenceOpen(body)) {
      // Name the ACTUAL marker. A tilde wrapper is the fix for the common case (a ```
      // payload), but it is not immune: a slide carrying its own ~~~ fence collides with
      // it just the same, and there the answer is a LONGER wrapper, not a different one.
      const marker = fence[0] === '~' ? 'tildes' : 'backticks';
      const remedy = fence[0] === '~' ? `a longer tilde fence than the slide's own ${fence.length}` : 'a tilde fence (~~~)';
      problems.push({ kind: 'fence-collision', target: describeTarget(attrs), message: `The edit block for ${describeTarget(attrs)} was wrapped in ${marker}, so the slide's own code fence closed it early and it came through incomplete — it needs ${remedy}. Nothing was applied from it.` });
      continue;
    }
    edits.push(edit);
  }
  return { text: prose.join('\n').trim(), edits, problems };
}

// ── The surgical splice ──────────────────────────────────────────────────────

// Line ranges [startLine, endLine] for each slide's CONTENT (separators excluded),
// so an edit touches only the target slide and leaves every other byte intact.
function slideRanges(lines) {
  const seps = separatorLines(lines);
  const ranges = [];
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (seps.has(i)) { ranges.push([start, i - 1]); start = i + 1; }
  }
  ranges.push([start, lines.length - 1]);
  return ranges;
}

// How many real slides the deck has (front matter excluded; 1-based addressing
// tops out here).
export function slideCount(source) {
  return Math.max(0, splitTopLevel(source).length - fmChunks(source));
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

// Apply one edit, preserving every untouched byte (separators, other slides, and the
// edited slide's own blank-line cushion). Returns the new source; a refused edit
// returns the source unchanged.
//
// SILENT REFUSAL WAS THE BUG. Every guard below is correct — refusing beats corrupting —
// but returning the input is indistinguishable from succeeding, and the whole chain
// above (applyProposedEdits → the Apply button → the green "Applied" tick) took that
// for success and told the author their edit had landed. `applyEditChecked` is the
// honest form: it says WHETHER it applied and WHY not. `applyEdit` stays as the
// source-returning wrapper for callers that genuinely don't branch on the outcome.
export function applyEdit(source, edit) {
  return applyEditChecked(source, edit).source;
}

/** Apply one edit, reporting the outcome: `{ source, ok, reason }`. `reason` is a
 *  short author-facing sentence when `ok` is false, else null. */
export function applyEditChecked(source, edit) {
  const refuse = (reason) => ({ source, ok: false, reason });
  if (!edit) return refuse('No edit to apply.');
  const fm = fmChunks(source);
  const lines = String(source || '').split('\n');
  const ranges = slideRanges(lines);
  const count = ranges.length; // raw chunk count (front matter included)

  const realCount = Math.max(0, count - fm); // how many REAL slides the deck has

  if (edit.action === 'replace') {
    const n = edit.slide + fm; // human slide number → raw chunk index
    if (edit.slide < 1 || n > count) return refuse(`Slide ${edit.slide} doesn't exist — the deck has ${realCount} slide${realCount === 1 ? '' : 's'}.`);
    // A replace targets ONE slide; a body that would split slides (top-level `---` or an
    // unclosed fence) corrupts the deck, so refuse rather than corrupt (trio red team).
    if (splitTopLevel(String(edit.body || '').trim()).length > 1) return refuse(`The replacement for slide ${edit.slide} contains a \`---\` separator, so it is more than one slide. A \`slide=\` block replaces exactly one.`);
    if (fenceOpen(String(edit.body || '').trim())) return refuse(`The replacement for slide ${edit.slide} has a code fence that never closes — it came through incomplete.`);
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
    const next = lines.join('\n');
    // An edit that reproduces the slide byte-for-byte changed nothing. Saying "Applied"
    // over it is the same false claim as saying it over a refusal — the refine paths
    // already guard this (`refineSelection`'s `next === text`); the edit path didn't.
    if (next === source) return refuse(`That rewrite of slide ${edit.slide} is identical to what's already there.`);
    return { source: next, ok: true, reason: null };
  }

  if (edit.action === 'delete') {
    const n = edit.slide + fm; // human slide number → raw chunk index
    if (edit.slide < 1 || n > count) return refuse(`Slide ${edit.slide} doesn't exist — the deck has ${realCount} slide${realCount === 1 ? '' : 's'}.`);
    // Drop the slide's lines AND one bordering separator so we don't leave `---\n---`.
    const [a, b] = ranges[n - 1];
    if (n < count) lines.splice(a, b - a + 2); // include the `---` that follows
    else if (a > 0) lines.splice(a - 1, b - a + 2); // last slide: take the leading `---`
    else lines.splice(a, b - a + 1);
    return { source: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n', ok: true, reason: null };
  }

  if (edit.action === 'insert') {
    // Insert among the REAL slides, keeping the front matter verbatim. after=N
    // lands after real slide N (after=0 prepends a new slide 1, after=end
    // appends). The old split/rejoin reformatted the `---…---` fence and broke
    // Marp's front-matter parsing, so the front matter is reattached untouched.
    const block = edit.body.trim();
    // An unclosed fence still corrupts (it swallows the deck's next real `---` on
    // reparse), so that guard stays. The `---` guard does NOT: an insert body carrying
    // several slides is the shape a model reaches for on "add these slides", and
    // refusing it was the single most common silent no-op. Split it (fence-aware, so a
    // `---` inside ```mermaid front matter isn't a boundary) and insert the run.
    if (fenceOpen(block)) return refuse('That new slide has a code fence that never closes — it came through incomplete.');
    const blocks = splitTopLevel(block).map((s) => s.trim()).filter(Boolean);
    if (!blocks.length) return refuse('That edit block is empty.');
    const all = splitTopLevel(source);
    const real = all.slice(fm).map((s) => s.replace(/^\n+|\n+$/g, ''));
    const at = edit.slide === Number.MAX_SAFE_INTEGER ? real.length : Math.max(0, Math.min(real.length, edit.slide));
    real.splice(at, 0, ...blocks);
    const body = real.join('\n\n---\n\n');
    const next = fm ? `---\n${(all[1] || '').replace(/^\n+|\n+$/g, '')}\n---\n\n${body}\n` : `${body}\n`;
    return { source: next, ok: true, reason: null, inserted: blocks.length };
  }

  return refuse(`Unknown edit action "${edit.action}".`);
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
