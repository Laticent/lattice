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

import { slideBoundaries, splitSlideChunks } from '../../../../../lib/core/slide-boundaries.mjs';

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;
function fmChunks(source) {
  return FRONT_MATTER.test(String(source || '')) ? 2 : 0;
}

// ── Slide boundaries ──────────────────────────────────────────────────────────
// WHERE A SLIDE ENDS, asked of the module that knows — `lib/core/slide-boundaries.mjs`,
// which reproduces the engine's own top-level `hr` set from source text.
//
// This file used to carry its OWN copy of a `/^---$/m` splitter, on the stated grounds
// that staying dependency-free kept it headless-verifiable. The copy recognized a slide
// break only when it was written as exactly three hyphens with nothing after them, and
// the cost of that was not a miscount — it was DATA LOSS reported as success:
//
//   deck:  `# Slide One`  ·  `--- ` (trailing space)  ·  `# Slide Two`
//   the engine renders 2 sections;  `slideCount()` returned 1
//   applyEditChecked(deck, { action: 'replace', slide: 1, … })  ->  { ok: true }
//
// The replacement overwrote the WHOLE deck — `# Slide Two` and its body gone, with the
// chat's green "Applied" tick painted over it. Six separator forms reproduced that:
// `--- `, `---\t`, `***`, `___`, `- - -`, `----` and a `---` indented one to three
// spaces. The shared module is still pure and still headless-verifiable; it just is not
// a second opinion about what a slide is.

/**
 * Does `text` carry a code fence that never closes?
 *
 * Read from the TEXT, not inferred from a boundary scan's "reason" slot. The scanner this
 * module used to call reported one reason per scan, first-write-wins, so a body that first
 * tripped some other note MASKED its own unclosed fence and this returned false —
 * defeating the guard that stops a spliced fence from swallowing the deck's next separator
 * and trapping the following slide inside a code block. Reproduced by the red team:
 * `ok: true`, two sections in and one out.
 */
export function fenceOpen(text) {
  let marker = null;
  let len = 0;
  for (const line of String(text ?? '').split('\n')) {
    const m = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    if (!marker) {
      if (m) { marker = m[1][0]; len = m[1].length; }
    } else if (m && m[1][0] === marker && m[1].length >= len && /^[ \t]{0,3}[`~]+[ \t]*$/.test(line)) {
      marker = null;
      len = 0;
    }
  }
  return marker !== null;
}

/**
 * The deck's chunks in the shape this module's index math expects: front matter occupies
 * the first two, real slides follow.
 *
 * The two front-matter chunks are RECONSTRUCTED rather than derived, because the boundary
 * scanner is not allowed to look inside front matter — a YAML block's closing `---` is a
 * thematic break to anything that reads it, and its opening `---` makes the first key a
 * setext heading. `fmChunks()` translates a human slide number into this list, exactly as
 * it always did, so every caller below is untouched.
 */
export function splitTopLevel(source) {
  const src = String(source || '');
  const fm = FRONT_MATTER.exec(src);
  if (!fm) return splitSlideChunks(src).chunks;
  // The `['', <yaml>]` prefix `source.split(/^---$/m)` produced for a front-matter block.
  return ['', fm[0].replace(/^---\r?\n/, '').replace(/\r?\n---[ \t]*(\r?\n|$)/, ''), ...splitSlideChunks(src.slice(fm[0].length)).chunks];
}

// (`bodySplitsSlides` lived here: one predicate covering both "the body smuggles a
// top-level `---`" and "the body's fence never closes". It was split into the two
// checks it always was, inline in `applyEditChecked`, because the two now diverge —
// each needs its OWN author-facing reason, and a multi-slide body is legal on an
// insert and illegal on a replace. An unclosed fence remains fatal to both: it
// swallows the deck's next real `---` on reparse, trapping a later slide inside this
// one's code block. Contract unchanged — refuse rather than corrupt (trio red team).)

/**
 * Line indices that are TOP-LEVEL slide separators — the line-based analog the surgical
 * splice reads, and the same derivation `splitTopLevel` uses, so a line walk and a chunk
 * split can never disagree about where a boundary is.
 *
 * `lines` is the WHOLE document including front matter, because that is what the splice
 * works in. The scan runs on the body and its answers are shifted back by the number of
 * front-matter lines.
 */
export function separatorLines(lines) {
  const all = Array.isArray(lines) ? lines : [];
  const src = all.join('\n');
  const fm = FRONT_MATTER.exec(src);
  const set = new Set();
  let skip = 0;
  if (fm) {
    // The front matter's OWN two `---` lines stay in the set. They are not slide boundaries —
    // nothing renders between them — but they are what produces the leading `['', <yaml>]`
    // chunks that `fmChunks()` counts past, and every index calculation in this file is
    // written against that shape. Dropping them silently shifted every real slide by two.
    skip = fm[0].replace(/\n$/, '').split('\n').length;
    set.add(0);
    set.add(skip - 1);
  }
  // The SAME leading-empty rule `splitSlideChunks` applies, so a line walk and a chunk split
  // cannot land on different slide numbers. They diverged here once: the chunk side dropped a
  // body-leading empty chunk and this side kept it, so a replace on a deck whose body opens
  // with a separator INSERTED instead of replacing and duplicated slide one — a regression
  // against `main`, found by the red team.
  const body = fm ? src.slice(fm[0].length) : src;
  const bodyLines = body.split('\n');
  let seps = slideBoundaries(body).lines;
  if (seps.length && bodyLines.slice(0, seps[0]).join('\n').trim() === '') seps = seps.slice(1);
  for (const ln of seps) set.add(ln + skip);
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
// The `(?![\w-])` is load-bearing: without it `~~~lattice-edit-example slide=2` and
// `~~~lattice-editslide=2` both parsed as LIVE EDITS (red team). The token has to end.
const EDIT_OPEN = /^[ \t]{0,3}(~{3,}|`{3,})lattice-edit(?![\w-])([^\n]*)$/;

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
  // Fence state for the model's OWN prose. An opener inside a ``` block is an EXAMPLE, not
  // an instruction — and, worse, a reply that quotes a slide from an untrusted shared deck
  // could otherwise turn a planted `~~~lattice-edit delete=1` line into a live proposal
  // card (red team). Track the prose's fences and skip openers inside them.
  let proseFence = null;
  for (let i = 0; i < lines.length; i++) {
    if (proseFence) {
      prose.push(lines[i]);
      if (new RegExp(`^[ \\t]{0,3}[${proseFence[0]}]{${proseFence.length},}[ \\t]*$`).test(lines[i])) proseFence = null;
      continue;
    }
    const open = EDIT_OPEN.exec(lines[i]);
    if (!open) {
      const fenced = /^[ \t]{0,3}(~{3,}|`{3,})/.exec(lines[i]);
      if (fenced) proseFence = fenced[1];
      prose.push(lines[i]);
      continue;
    }
    const [, fence, rawAttrs] = open;
    const attrs = rawAttrs || '';
    const closes = fenceCloser(fence);
    let end = i + 1;
    while (end < lines.length && !closes.test(lines[end])) end++;
    if (end >= lines.length) {
      // The block never closed. Report it — but KEEP the remaining lines as prose rather
      // than dropping them: a stray opener mid-reply (planted, or echoed from a deck) would
      // otherwise silently swallow the real answer and blame a truncation that never
      // happened (red team). Say what is known, not what is guessed.
      problems.push({ kind: 'unterminated', target: describeTarget(attrs), message: `The edit block for ${describeTarget(attrs)} was never closed, so nothing was applied from it. The reply may have been cut off.` });
      prose.push(...lines.slice(i));
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
      // The WRAPPER's real closer is still out there, after the payload's. Left in the
      // prose it reads as an unterminated fence opener, and chat-markdown then swallows
      // everything after it — including this very explanation, which rendered as an
      // unlabelled code block (checker). Consume it.
      const closer = new RegExp(`^[ \\t]{0,3}[${fence[0]}]{${fence.length},}[ \\t]*$`);
      let orphan = i + 1;
      while (orphan < lines.length && !closer.test(lines[orphan])) orphan++;
      if (orphan < lines.length) i = orphan;
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
  // NO BOUNDARY-DOUBT GUARD, and removing it is deliberate. This used to refuse when the
  // boundary SCANNER reported it could not settle a deck. Boundaries now come from the
  // engine's own parser, which has no undecided answer: a deck caught mid-keystroke parses
  // exactly as the engine parses it, so the splice lands where the render says it should.
  // The guards that remain are about the EDIT's own content — an empty body, a multi-slide
  // body on a single-slide replace, an unclosed fence — which are properties of what the
  // model sent rather than of what a scanner could work out.
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
    // An empty body is not "replace with nothing" — it is a block whose payload went
    // missing (a truncated reply, an off-by-one in the fence scan). It used to blank the
    // slide and report success, which is the mirror of the bug this module exists to fix.
    if (!String(edit.body || '').trim()) return refuse(`The replacement for slide ${edit.slide} is empty — nothing was applied. Ask again if you meant to clear the slide.`);
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
    // Take the LEADING separator only when the line before this slide is really a slide
    // separator. On a deck whose last slide is also its FIRST, that line is the front
    // matter's closing `---`, and eating it turned the YAML into body text and dropped the
    // deck's theme — reported as "Applied" (red team). `n - 1 > fm` is the test.
    else if (a > 0 && n - 1 > fm) lines.splice(a - 1, b - a + 2);
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
    // `after=end` is the sanctioned append. Any OTHER number past the deck's end is a
    // hallucinated slide reference, and silently clamping it to append put the slides
    // somewhere the author never asked for (red team).
    if (edit.slide !== Number.MAX_SAFE_INTEGER && edit.slide > real.length) return refuse(`Can't insert after slide ${edit.slide} — the deck has ${real.length} slide${real.length === 1 ? '' : 's'}. Use \`after=end\` to append.`);
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
