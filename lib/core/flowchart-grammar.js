/**
 * flowchart-grammar — the ONE grammar kernel for the flowchart's authoring, shared by
 * every reader: the chart transform, `validate()`, the browser linter and the narrator
 * (HARD RULE #1 / #7). The design record is
 * engineering/decisions/2026-09-25-flowchart-authoring.md.
 *
 * WHAT IT READS. Not Markdown and not HTML: an OUTLINE, which two thin adapters build.
 * The transform reads the rendered list (HTML strings, like every chart kernel); lint
 * and narration read raw Markdown (`outlineFromMarkdown` below). An outline item is
 *
 *     { segs: [{ kind: 'text' | 'code', value }], children: [item], quotes: [string],
 *       detail?: string, line?: string }
 *
 * `detail` is the row's soft-broken second line (a subtitle under the shape's name).
 *
 * with text already decoded (no HTML entities) and code spans in the order they sit on
 * the row. Everything that gives the row a MEANING — names, arrows, spans, placement —
 * lives here, once, so the picture and the voice cannot disagree about what a source says.
 *
 * THE GRAMMAR, in one screen (§2 of the note has the reasons):
 *   - every list item is a shape, named by its text (case-insensitive) or by `#id`;
 *   - a sub-item that starts with a NAME is a member, which makes the parent a group;
 *   - a sub-item that starts with an ARROW is a connection from its parent; a row may
 *     also continue with arrows after its own name (`Storefront => Payments`);
 *   - an arrow is a separate word: `->` `<-` `<->` `--`, heavy `=>` `<=` `<=>` `==`,
 *     with an optional label inside (`-SEV1->`); `\` escapes one;
 *   - `&` fans out, but only in the target list after an arrow;
 *   - a trailing code span styles what it FOLLOWS (the shape after its name, the line
 *     after its target), order-free after an optional `#id` / status lead.
 *
 * WHY A HAND-WRITTEN SCAN, AND THE BUDGETS. The Studio lints untrusted Markdown in the
 * browser on the main thread (HARD RULE #22). The arrow scan is linear: a label is capped at
 * LABEL_MAX characters and every loop moves forward (measured: 50 KB of `- - - -` in 20 ms).
 * The two steps that are not naturally linear carry explicit limits instead: the
 * near-duplicate check stops after NEAR_DUP_BUDGET comparisons, and the back-edge walk
 * uses an explicit stack, so a 6,000-step chain cannot overflow the call stack. Both were
 * found by the maker-checker review (a 34 KB fan-out took 4.9 s; a 6,000-step chain threw).
 *
 * Pure: plain data in, plain data out. No DOM, no markdown-it, no fs.
 */

// ── vocabulary ──────────────────────────────────────────────────────────────

const SHAPES = Object.freeze(['box', 'square', 'pill', 'diamond', 'circle', 'cylinder', 'io', 'doc']);
// CHART_STATUS (lib/core/chart-status.js) — repeated here only as a lookup set; the
// frozen list there stays the authority, and a unit test pins the two equal.
const STATUS_WORDS = Object.freeze(['on-track', 'done', 'live', 'at-risk', 'warn', 'blocked', 'fail', 'pilot', 'decision', 'deferred']);
const HEADS = Object.freeze(['open', 'dot', 'cross']);
const PATTERNS = Object.freeze(['dashed', 'dotted']);
// The chart family's categorical slots are `--chart-cat-1..8` (design/skills/chart-component.md
// "The color story"), not the twelve engine-wide `--cat-N` a pill uses.
const SLOT_COUNT = 8;
const LABEL_MAX = 60;
const NAME_MAX = 120;
const NEAR_DUP_BUDGET = 20000;

const SHAPE_SET = new Set(SHAPES);
const STATUS_SET = new Set(STATUS_WORDS);
const HEAD_SET = new Set(HEADS);
const PATTERN_SET = new Set(PATTERNS);

// ── small helpers ───────────────────────────────────────────────────────────

// An escaped `\&` survives the fan-out split as this placeholder, then turns back into `&`.
const ESC_AMP = '\u0001';
// CommonMark's escapable set: a backslash before any of these is an escape.
const ASCII_PUNCT = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** Collapse runs of whitespace and trim, in one pass. */
function tidy(s) {
  let out = '';
  let pend = false;
  for (const ch of String(s)) {
    if (isSpace(ch)) { pend = out.length > 0; continue; }
    if (pend) { out += ' '; pend = false; }
    out += ch;
  }
  return out;
}

const nameKey = (s) => tidy(s).toLowerCase();

/** A readable, stable id from a name: lowercase ascii letters and digits, hyphen-joined. */
function slug(s) {
  let out = '';
  let dash = false;
  for (const ch of String(s).toLowerCase()) {
    const ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (ok) { if (dash && out) out += '-'; out += ch; dash = false; } else dash = true;
  }
  return out || 'shape';
}

/** Bounded edit distance (returns max+1 when over). */
function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// ── arrows ──────────────────────────────────────────────────────────────────

/**
 * Read one arrow starting at `s[p]`, or null. The caller guarantees `p` is at the start
 * of a word (start of the string or after whitespace); an arrow must also END at a word
 * boundary. Forms: [<] shaft [label shaft] [> | shaft], shaft `-` (normal) or `=` (heavy).
 * Mermaid's doubled shaft (`-->`, `==>`, `<--`, `<-->`, `---`) reads as the house form.
 *
 * Returns { end, heavy, label, dir, mermaid } with dir 'out' | 'in' | 'both' | 'none'.
 */
function readArrow(s, p) {
  let i = p;
  const left = s[i] === '<';
  if (left) i++;
  const c = s[i];
  if (c !== '-' && c !== '=') return null;
  i++;
  const boundary = (k) => k >= s.length || isSpace(s[k]);
  let mermaid = false;
  // Mermaid doubled / tripled shaft: `-->`, `---`, `<-->`, `==>`.
  if (s[i] === c) {
    let k = i;
    while (s[k] === c && k - i < 2) k++;
    if (s[k] === '>' && boundary(k + 1)) return { end: k + 1, heavy: c === '=', label: '', dir: left ? 'both' : 'out', mermaid: true };
    if (boundary(k)) {
      // `--` / `==` is the house none-arrow; `---` is Mermaid's.
      mermaid = k - i >= 2;
      if (left) return { end: k, heavy: c === '=', label: '', dir: 'in', mermaid: true };
      return { end: k, heavy: c === '=', label: '', dir: 'none', mermaid };
    }
    return null;
  }
  // Unlabeled: `->` `=>` `<-` `<=` `<->` `<=>`.
  if (s[i] === '>') return boundary(i + 1) ? { end: i + 1, heavy: c === '=', label: '', dir: left ? 'both' : 'out', mermaid: false } : null;
  if (boundary(i)) return left ? { end: i, heavy: c === '=', label: '', dir: 'in', mermaid: false } : null;
  // Labeled: the label runs to the next closing shaft that ends the word (`-label->`,
  // `-label-`). It may hold spaces; it may not hold `<`, `>` or a newline, and it is capped.
  if (isSpace(s[i])) return null;
  for (let j = i + 1; j < s.length && j - i <= LABEL_MAX + 1; j++) {
    const ch = s[j];
    if (ch === '<' || ch === '>' || ch === '\n') return null;
    if (ch !== c) continue;
    if (isSpace(s[j - 1])) continue; // the label ends on a non-space
    const label = s.slice(i, j);
    if (s[j + 1] === '>' && boundary(j + 2)) return { end: j + 2, heavy: c === '=', label, dir: left ? 'both' : 'out', mermaid: false };
    if (boundary(j + 1)) return { end: j + 1, heavy: c === '=', label, dir: left ? 'in' : 'none', mermaid: false };
  }
  return null;
}

/**
 * Split one row's segments into PARTS separated by arrows. Text is scanned for arrows at
 * word starts; a backslash in front of an arrow keeps it as text (the backslash is
 * dropped). Code spans stay attached to the part they sit in.
 *
 * Returns { parts: [{ text, spans: [string] }], arrows: [arrow] } with
 * parts.length === arrows.length + 1.
 */
function splitRow(segs) {
  const parts = [{ text: '', spans: [] }];
  const arrows = [];
  let atWordStart = true;
  for (const seg of segs) {
    if (seg.kind === 'code') {
      parts[parts.length - 1].spans.push(seg.value);
      atWordStart = true;
      continue;
    }
    // Text after a span means the span sat INSIDE the name (`Run \`npm test\` -> Deploy`):
    // it is part of the name, not a modifier (§2.4: the span that styles is the trailing one).
    const pushText = (ch) => {
      const part = parts[parts.length - 1];
      if (part.spans.length && !isSpace(ch)) { part.text += `${part.spans.join(' ')} `; part.spans = []; }
      part.text += ch;
    };
    const s = String(seg.value);
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\\' && ASCII_PUNCT.has(s[i + 1])) {
        // A grammar escape (`\->`, `\&`) keeps the character out of an arrow or a
        // fan-out; any other escaped punctuation just loses its backslash, as
        // CommonMark does, so this reader and the rendered HTML agree on every name.
        pushText(s[i + 1] === '&' ? ESC_AMP : s[i + 1]);
        i += 2;
        atWordStart = false;
        continue;
      }
      if (atWordStart && (ch === '-' || ch === '=' || ch === '<')) {
        const a = readArrow(s, i);
        if (a) {
          arrows.push(a);
          parts.push({ text: '', spans: [] });
          i = a.end;
          atWordStart = true;
          continue;
        }
      }
      pushText(ch);
      atWordStart = isSpace(ch);
      i++;
    }
  }
  return { parts, arrows };
}

// ── spans ───────────────────────────────────────────────────────────────────

/**
 * Parse one modifier span. `#id` or a status word may lead; everything after a colon is
 * order-free. Returns { id, shape: {...}, line: {...}, unknown: [word] }. `extraLead` is
 * the host component's own lead words (the state chart's `start` / `end`).
 */
function parseSpan(span, extraLead) {
  const out = { id: null, shape: {}, line: {}, unknown: [] };
  const words = String(span).split(':');
  words.forEach((raw, idx) => {
    const w = raw.trim();
    if (!w) return;
    if (idx === 0 && w[0] === '#') {
      const id = w.slice(1);
      if (/^[a-z0-9][a-z0-9-]*$/.test(id) && id.length <= 40) out.id = id;
      else out.unknown.push(w);
      return;
    }
    let m;
    if (STATUS_SET.has(w)) out.shape.status = w;
    else if (extraLead?.has(w)) (out.shape.lead = out.shape.lead || []).push(w);
    else if (idx === 0) out.unknown.push(w);
    else if (SHAPE_SET.has(w)) out.shape.shape = w;
    else if (HEAD_SET.has(w)) out.line.head = w;
    else if (PATTERN_SET.has(w)) out.line.pattern = w;
    else if (w === 'loose') out.line.loose = true;
    else if ((m = /^c([1-9])$/.exec(w)) && +m[1] <= SLOT_COUNT) out.shape.slot = +m[1];
    else if ((m = /^(fill|border|text)-c([1-9])$/.exec(w)) && +m[2] <= SLOT_COUNT) out.shape[m[1]] = +m[2];
    else out.unknown.push(w);
  });
  return out;
}

// ── the parse ───────────────────────────────────────────────────────────────

const LIST_MARKER_LIKE = /^(?:\d+[.)]|[-*+])$/;

/**
 * Parse an outline into the flowchart model.
 *
 * @param {object[]} items  outline items (see the header)
 * @param {object} [opts]
 * @param {string|null} [opts.key]   the key span's inner text (`[{=>, Happy path}]`), or null
 * @param {string[]} [opts.leadWords] extra lead words the host allows (state chart: start, end)
 * @returns {{ shapes, groups, edges, notes, key, diagnostics }}
 */
function parseFlowchart(items, opts = {}) {
  const extraLead = opts.leadWords ? new Set(opts.leadWords) : null;
  const diagnostics = [];
  const diag = (severity, rule, message, fix, line) => diagnostics.push({ severity, rule, message, fix: fix || null, line: line || null });

  const things = [];                 // shapes and groups, in authored order
  const byKey = new Map();           // name key or #id → thing
  const usedIds = new Set();

  const newThing = (name, parent, line) => {
    let id = slug(name);
    if (usedIds.has(id)) { let n = 2; while (usedIds.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
    usedIds.add(id);
    const t = { id, name, key: nameKey(name), parent, isGroup: false, placed: false, meta: {}, line: line || null, order: things.length };
    things.push(t);
    byKey.set(t.key, t);
    return t;
  };
  const lookup = (text) => {
    const k = nameKey(text);
    if (k[0] === '#') return byKey.get(k) || null;
    return byKey.get(k) || null;
  };

  const applyShape = (t, sp, line) => {
    if (sp.id) {
      const k = `#${sp.id}`;
      const other = byKey.get(k);
      if (other && other !== t) diag('error', 'flowchart-duplicate-id', `the id \`#${sp.id}\` is already "${other.name}"`, 'Give each shape its own id.', line);
      else { byKey.set(k, t); t.explicitId = sp.id; }
    }
    for (const [k, v] of Object.entries(sp.shape)) {
      if (k === 'lead') { t.meta.lead = [...new Set([...(t.meta.lead || []), ...v])]; continue; }
      if (t.meta[k] !== undefined && t.meta[k] !== v) {
        diag('error', 'flowchart-conflicting-style', `"${t.name}" is styled twice with different values (${k}: ${t.meta[k]} and ${v})`, 'Style a shape in one place.', line);
        continue;
      }
      t.meta[k] = v;
    }
  };

  const reportUnknown = (sp, line) => {
    if (sp.unknown.length) {
      diag('warning', 'flowchart-unknown-modifier',
        `unknown modifier ${sp.unknown.map((w) => `\`${w}\``).join(', ')} — the span is ignored`,
        'Shapes: `:box` `:square` `:pill` `:diamond` `:circle` `:cylinder` `:io` `:doc`; slots `:c1`…`:c8`; lines `:dashed` `:dotted` `:open` `:dot` `:cross` `:loose`; a status word such as `fail`.', line);
      return true;
    }
    return false;
  };

  // A row is split once; both passes read the same split.
  const rows = [];
  const walk = (list, parentRow) => {
    for (const it of list) {
      const { parts, arrows } = splitRow(it.segs || []);
      const head = parts[0];
      const isArrowRow = arrows.length > 0 && tidy(head.text) === '' && head.spans.length === 0;
      const row = { it, parts, arrows, isArrowRow, parentRow, thing: null, line: it.line || null };
      rows.push(row);
      walk(it.children || [], row);
    }
  };
  walk(items, null);

  // ── pass 1: shape rows define shapes, groups and placement ─────────────────
  for (const row of rows) {
    if (row.isArrowRow) {
      if (!row.parentRow) diag('error', 'flowchart-orphan-connection', 'a connection row needs a shape above it', 'Indent it under the shape it starts from.', row.line);
      continue;
    }
    if (row.parentRow?.isArrowRow) {
      diag('error', 'flowchart-nested-under-connection', 'a row nested under a connection is neither a member nor a connection', 'Nest members and connections under a shape, not under an arrow row.', row.line);
      continue;
    }
    // A trailing span that does not parse as modifiers is literal code (§2.4): it stays in
    // the name, so `Run \`npm test\` -> Deploy` names "Run npm test". It is still reported.
    const head = row.parts[0];
    head.modSpans = [];
    for (const sp of head.spans) {
      if (parseSpan(sp, extraLead).unknown.length) {
        head.text += ` ${sp}`;
        diag('warning', 'flowchart-unknown-modifier', `\`${sp}\` is not a modifier, so it is read as part of the name`, 'Shapes: `:box` `:square` `:pill` `:diamond` `:circle` `:cylinder` `:io` `:doc`; slots `:c1`…`:c8`; a status word such as `fail`. To style, use those; to keep code in a name, this is fine.', row.line);
      } else head.modSpans.push(sp);
    }
    const name = tidy(head.text).replaceAll(ESC_AMP, '&');
    if (!name || LIST_MARKER_LIKE.test(name) || name.length > NAME_MAX) {
      diag('error', 'flowchart-empty-name', name ? `"${name}" is not a usable shape name` : 'this row has no name', 'Every list item names a shape.', row.line);
      continue;
    }
    // The parent GROUP is the nearest ancestor shape row (which, by having this row as a
    // shape child, is a group).
    let pr = row.parentRow;
    while (pr && (pr.isArrowRow || !pr.thing)) pr = pr.parentRow;
    const parentThing = pr ? pr.thing : null;
    if (parentThing) parentThing.isGroup = true;
    let t = lookup(name);
    if (!t) t = newThing(name, parentThing ? parentThing.id : null, row.line);
    if (!t.placed) { t.placed = true; t.parent = parentThing ? parentThing.id : null; t.line = row.line; }
    if (row.it.detail) t.detail = tidy(row.it.detail);
    if (parentThing && t.parent !== parentThing.id) {
      diag('error', 'flowchart-two-groups', `"${t.name}" is placed in two groups`, 'A shape sits in one group; connect it from the other instead.', row.line);
    }
    row.thing = t;
    for (const q of row.it.quotes || []) if (tidy(q)) (t.notes = t.notes || []).push(tidy(q));
  }
  // Spans on shape rows (after every name exists, so ids resolve in any order).
  for (const row of rows) {
    if (row.isArrowRow || !row.thing) continue;
    for (const s of row.parts[0].modSpans || []) {
      const sp = parseSpan(s, extraLead);
      if (Object.keys(sp.line).length) diag('error', 'flowchart-line-word-on-shape', `\`${s}\` styles a line, but it follows the shape "${row.thing.name}"`, 'Put line styles after the target of a connection.', row.line);
      applyShape(row.thing, sp, row.line);
    }
  }

  // ── pass 2: connections ────────────────────────────────────────────────────
  const edges = [];
  let nearDupBudget = NEAR_DUP_BUDGET;
  const firstSource = new Map(); // target-only thing → its first source
  for (const row of rows) {
    if (!row.arrows.length) continue;
    if (row.parentRow?.isArrowRow) {
      if (row.isArrowRow) diag('error', 'flowchart-nested-under-connection', 'a connection nested under another connection has no shape to start from', 'Put it under the shape it starts from.', row.line);
      continue;
    }
    let src;
    if (row.isArrowRow) {
      let pr = row.parentRow;
      while (pr && (pr.isArrowRow || !pr.thing)) pr = pr.parentRow;
      if (!pr) continue;
      src = [pr.thing];
    } else {
      if (!row.thing) continue;
      src = [row.thing];
    }
    row.arrows.forEach((a, ai) => {
      if (a.mermaid) diag('info', 'flowchart-mermaid-arrow', 'a Mermaid-style arrow is read as the house form', 'Use the house arrows: `->`, `=>`, `<->`, `--`.', row.line);
      const part = row.parts[ai + 1];
      const targetsText = part.text.split(/\s+&\s+/);
      if (targetsText.length === 1 && !tidy(part.text)) {
        diag('error', 'flowchart-missing-target', 'an arrow with no target', 'Name the shape the arrow points at.', row.line);
        return;
      }
      // Code spans in a target part style the LINE: every line of that hop when it fans out.
      const lineStyle = {};
      for (const s of part.spans) {
        const sp = parseSpan(s, null);
        if (reportUnknown(sp, row.line)) continue;
        if (sp.id) diag('error', 'flowchart-shape-word-on-line', `\`#${sp.id}\` names a shape, but it follows a connection`, 'Give the shape its id on its own row.', row.line);
        const { slot, ...shapeOnly } = sp.shape;
        const stray = Object.keys(shapeOnly);
        if (stray.length) {
          diag('error', 'flowchart-shape-word-on-line', `\`${s}\` styles a shape, but it follows a connection`, `Style "${tidy(targetsText[targetsText.length - 1])}" on its own row.`, row.line);
        }
        if (slot) lineStyle.slot = slot;
        Object.assign(lineStyle, sp.line);
      }
      const next = [];
      for (const raw of targetsText) {
        const tname = tidy(raw).replaceAll(ESC_AMP, '&');
        if (!tname) continue;
        if (/^\d/.test(tname) && !a.label && (a.heavy || a.dir === 'in')) {
          diag('warning', 'flowchart-comparison-arrow', `this reads as a connection to a shape named "${tname}"`, 'If it is a comparison inside a name, escape the arrow with a backslash: `Balance \\<= 0?`.', row.line);
        }
        let t = lookup(tname);
        if (!t) {
          for (const o of things) {
            if (nearDupBudget <= 0) break;
            nearDupBudget--;
            if (o.key.length > 4 && tname.length > 4 && editDistance(o.key, nameKey(tname)) <= 2) {
              diag('warning', 'flowchart-near-duplicate', `"${tname}" is a new shape, but looks like "${o.name}"`, `If you meant "${o.name}", use its exact name.`, row.line);
              break;
            }
          }
          t = newThing(tname, null, row.line);
        }
        if (!t.placed && !firstSource.has(t)) firstSource.set(t, src[0]);
        next.push(t);
      }
      for (const s0 of src) for (const t of next) {
        const [from, to] = a.dir === 'in' ? [t, s0] : [s0, t];
        edges.push({ from: from.id, to: to.id, label: tidy(a.label), heavy: a.heavy, dir: a.dir === 'in' ? 'out' : a.dir, style: { ...lineStyle }, line: row.line });
      }
      if (next.length) src = next;
    });
  }

  // Placement for target-only names: beside the first source — inside its group when the
  // source is a shape, next to the group when the source IS the group. Both are the
  // source's own parent.
  const byId = new Map(things.map((t) => [t.id, t]));
  for (const [t, s0] of firstSource) if (!t.placed) { t.parent = s0.parent; t.placed = true; }

  // A shape's parent is set only by nesting (which cannot loop) or by its first source's
  // own parent, so no group can contain itself; there is nothing to check for here.
  const isInside = (id, groupId) => { let p = byId.get(id)?.parent; while (p) { if (p === groupId) return true; p = byId.get(p)?.parent; } return false; };
  const keptEdges = [];
  for (const e of edges) {
    const f = byId.get(e.from), t = byId.get(e.to);
    if ((f.isGroup && isInside(e.to, e.from)) || (t.isGroup && isInside(e.from, e.to))) {
      diag('error', 'flowchart-group-self-edge', `"${f.name}" and "${t.name}" are a group and its own member`, 'Connect the member to something outside the group.', e.line);
      continue;
    }
    keptEdges.push(e);
  }

  // Back edges: our own depth-first walk in authored order (never dagre's cycle breaker),
  // so reordering two rows cannot silently turn a forward edge into a loop.
  const out = new Map(things.map((t) => [t.id, []]));
  keptEdges.forEach((e) => { if (e.dir !== 'none') out.get(e.from).push(e); });
  // Iterative, so a 6,000-step chain cannot overflow the call stack.
  const state = new Map();
  const roots = things.filter((t) => t.meta.lead?.includes('start'));
  for (const root of [...roots, ...things]) {
    if (state.get(root.id)) continue;
    const stack = [[root.id, 0]];
    state.set(root.id, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const list = out.get(top[0]);
      if (top[1] >= list.length) { state.set(top[0], 2); stack.pop(); continue; }
      const e = list[top[1]++];
      const st = state.get(e.to);
      if (st === 1) e.back = true;
      else if (!st) { state.set(e.to, 1); stack.push([e.to, 0]); }
    }
  }

  // ── key ──────────────────────────────────────────────────────────────────
  const key = deriveKey(things, keptEdges, opts.key, diag);

  const notes = [];
  for (const t of things) for (const text of t.notes || []) notes.push({ on: t.id, text });

  const shapeOut = (t) => ({ id: t.id, name: t.name, parent: t.parent, explicitId: t.explicitId || null, detail: t.detail || null, ...t.meta });
  return {
    shapes: things.filter((t) => !t.isGroup).map(shapeOut),
    groups: things.filter((t) => t.isGroup).map(shapeOut),
    edges: keptEdges.map(({ line, ...e }) => e),
    notes,
    key,
    diagnostics,
  };
}

// ── key ─────────────────────────────────────────────────────────────────────

const ARROW_KEY = { '->': (e) => !e.heavy && e.dir !== 'none', '=>': (e) => e.heavy && e.dir !== 'none', '--': (e) => !e.heavy && e.dir === 'none', '==': (e) => e.heavy && e.dir === 'none', '<->': (e) => !e.heavy && e.dir === 'both', '<=>': (e) => e.heavy && e.dir === 'both' };
const DEFAULT_WORDS = { '=>': 'Main path', ':dashed': 'Optional', ':dotted': 'Informal', ':cross': 'Blocked', 'on-track': 'On track', done: 'Done', live: 'Live', 'at-risk': 'At risk', warn: 'Warning', blocked: 'Blocked', fail: 'Failing', pilot: 'Pilot', decision: 'Decision', deferred: 'Deferred' };

/**
 * The key is DERIVED from what the chart uses (the chart family's rule: color-coded
 * meaning gets a key). An authored key only RENAMES entries; it never hides or adds one,
 * and a word the chart does not use is reported.
 */
function deriveKey(things, edges, authored, diag) {
  const entries = [];
  const add = (k, label) => { if (!entries.some((e) => e.key === k)) entries.push({ key: k, label }); };
  const statuses = new Set(things.map((t) => t.meta.status).filter(Boolean));
  for (const s of STATUS_WORDS) if (statuses.has(s)) add(s, DEFAULT_WORDS[s]);
  if (edges.some((e) => e.heavy)) add('=>', DEFAULT_WORDS['=>']);
  for (const p of PATTERNS) if (edges.some((e) => e.style.pattern === p)) add(`:${p}`, DEFAULT_WORDS[`:${p}`]);
  if (edges.some((e) => e.style.head === 'cross')) add(':cross', DEFAULT_WORDS[':cross']);
  // A slot is a color, not a meaning: it enters the key only when a group wears it (the
  // group's name is the default word) or when the author names it.
  const slotOwners = new Map();
  for (const t of things) if (t.meta.slot && t.isGroup && !slotOwners.has(t.meta.slot)) slotOwners.set(t.meta.slot, t.name);
  for (const [slot, name] of slotOwners) add(`:c${slot}`, name);

  if (authored) {
    const { parseInlineSet } = require('./label-set');
    const set = parseInlineSet(String(authored).replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'));
    if (!set) {
      diag('warning', 'flowchart-key-shape', 'the key line is not a key set', 'Write `[{=>, Main path}, {:c2, Platform}]`.', authored);
    } else {
      const usedSlots = new Set(things.map((t) => t.meta.slot).filter(Boolean).map((n) => `:c${n}`));
      for (const { key: k, label } of set) {
        const hit = entries.find((e) => e.key === k);
        if (hit) { hit.label = label; continue; }
        if (usedSlots.has(k)) { entries.push({ key: k, label }); continue; }
        if (ARROW_KEY[k] && edges.some(ARROW_KEY[k])) { entries.push({ key: k, label }); continue; }
        diag('warning', 'flowchart-key-unbound', `the key names \`${k}\`, which this chart does not use`, 'A key entry renames a word the chart already uses.', authored);
      }
    }
  }
  return entries;
}

// ── the Markdown adapter (lint and narration) ───────────────────────────────

/**
 * Split an inline Markdown string into text and code segments. Backtick runs of any
 * length open and close as CommonMark does; an unmatched run is text.
 */
/**
 * What a text segment reads as once rendered: markdown-it turns `**x**`, `_x_`,
 * `[x](url)` and raw `<b>x</b>` into markup, and the HTML reader keeps only their text,
 * so this reader drops the same syntax. Deliberately light, and linear: a raw tag must
 * start `<letter` (so `<-` is never a tag, as CommonMark agrees), a link is `[text](…)`
 * with no nesting, and emphasis markers are dropped when they wrap a word. Entities are
 * decoded as the HTML reader decodes them, so `&amp;` is a fan-out in both.
 */
function plainSeg(seg) {
  if (seg.kind !== 'text') return seg;
  let v = seg.value;
  v = v.replace(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g, '');
  v = v.replace(/\[([^\][]*)\]\([^()\s]*\)/g, '$1');
  v = v.replace(/(\*\*|__)(?=\S)([^*_]*?\S)\1/g, '$2');
  v = v.replace(/(^|[\s(])([*_])(?=\S)([^*_]*?\S)\2(?=$|[\s).,;:!?])/g, '$1$3');
  return { kind: 'text', value: decodeHtml(v) };
}

function inlineSegments(s) {
  const segs = [];
  let text = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '`') { text += s[i++]; continue; }
    let n = 0;
    while (s[i + n] === '`') n++;
    const fence = '`'.repeat(n);
    const close = s.indexOf(fence, i + n);
    // A longer run is not a close.
    let c = close;
    while (c >= 0 && s[c + n] === '`') c = s.indexOf(fence, c + n + 1);
    if (c < 0) { text += fence; i += n; continue; }
    if (text) { segs.push({ kind: 'text', value: text }); text = ''; }
    segs.push({ kind: 'code', value: s.slice(i + n, c).trim() });
    i = c + n;
  }
  if (text) segs.push({ kind: 'text', value: text });
  return segs;
}

/** Expand tabs to 4-column stops, as CommonMark does for block structure. */
function expandTabs(line) {
  if (!line.includes('\t')) return line;
  let out = '';
  for (const ch of line) out += ch === '\t' ? ' '.repeat(4 - (out.length % 4)) : ch;
  return out;
}

const THEMATIC_BREAK = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/;

/**
 * Build the outline from a slide's Markdown: the first list, its nesting, a `>` blockquote
 * under an item as that item's note, and — after the list — a lone bracketed code span as
 * the key and a single emphasized line as the caption.
 *
 * It follows CommonMark where the two readers could disagree (the transform reads what
 * markdown-it rendered): a line nests only at or past its parent's CONTENT column; tabs
 * expand to 4-column stops; a lazy continuation line belongs to the open item; a change of
 * bullet character or ordered delimiter starts a new list, so the chart ends there (the
 * transform reads the first list); a thematic break ends it too; consecutive `>` lines are
 * one note. Input is expected LF-normalized; a trailing `\r` on a line is tolerated.
 *
 * @returns {{ items, key: string|null, caption: string|null }}
 */
function outlineFromMarkdown(md) {
  const lines = String(md).split('\n');
  const items = [];
  const stack = []; // { contentCol, item }
  let listKind = null;
  let inList = false;
  let ended = false;
  let blank = false;
  let key = null;
  let caption = null;
  let fence = null;
  let lastQuote = null; // { host, note index } of the quote line just read
  const kindOf = (marker) => (/\d/.test(marker) ? marker.slice(-1) : marker);
  for (const raw of lines) {
    const line = expandTabs(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
    const fm = /^ *(```+|~~~+)/.exec(line);
    if (fm) { fence = fence ? (line.trim().startsWith(fence) ? null : fence) : fm[1]; lastQuote = null; continue; }
    if (fence) continue;
    const trimmed = line.trim();
    if (!ended && THEMATIC_BREAK.test(line)) { if (inList) ended = true; lastQuote = null; continue; }
    const li = ended ? null : LIST_ITEM.exec(line);
    if (li) {
      const indent = li[1].length;
      const spaces = li[3].length;
      const contentCol = indent + li[2].length + (spaces >= 1 && spaces <= 4 ? spaces : 1);
      // Four or more columns past the open item's content is indented code inside it.
      if (stack.length && indent >= stack[stack.length - 1].contentCol + 4) { blank = false; continue; }
      while (stack.length && indent < stack[stack.length - 1].contentCol) stack.pop();
      if (!stack.length) {
        const kind = kindOf(li[2]);
        if (listKind && kind !== listKind) { ended = true; lastQuote = null; continue; }
        listKind = kind;
      }
      inList = true;
      const item = { segs: inlineSegments(li[4]).map(plainSeg), children: [], quotes: [], line: trimmed };
      (stack.length ? stack[stack.length - 1].item.children : items).push(item);
      stack.push({ contentCol, item });
      blank = false;
      lastQuote = null;
      continue;
    }
    if (inList && !ended) {
      if (trimmed === '') { blank = true; lastQuote = null; continue; }
      const indent = line.length - line.trimStart().length;
      const bq = /^ *>\s?(.*)$/.exec(line);
      if (bq && stack.length) {
        let host = null;
        for (let k = stack.length - 1; k >= 0; k--) if (indent >= stack[k].contentCol) { host = stack[k].item; break; }
        if (host) {
          const text = bq[1].trim();
          if (lastQuote && lastQuote.host === host) {
            if (text) host.quotes[lastQuote.at] = host.quotes[lastQuote.at] ? `${host.quotes[lastQuote.at]} ${text}` : text;
          } else {
            host.quotes.push(text);
            lastQuote = { host, at: host.quotes.length - 1 };
          }
          blank = false;
          continue;
        }
      }
      lastQuote = null;
      const top = stack[stack.length - 1];
      // A lazy continuation (no blank line before it) or an indented paragraph belongs to
      // the open item: it is that shape's second line.
      if (top && (!blank || indent >= top.contentCol)) {
        top.item.detail = top.item.detail ? `${top.item.detail} ${trimmed}` : trimmed;
        blank = false;
        continue;
      }
      ended = true;
    }
    if (inList) {
      const k = /^`(\[[\s\S]*\])`$/.exec(trimmed);
      if (k && key === null) { key = k[1]; continue; }
      // A caption is one emphasis around the whole line: `*…*` or `_…_`, nothing outside it.
      const c = /^([*_])([^*_][\s\S]*)\1$/.exec(trimmed);
      if (c && caption === null && !c[2].includes(c[1])) caption = c[2].trim();
    }
  }
  return { items, key, caption };
}

/**
 * Build the outline from a slide's RENDERED HTML — the reader the transform uses, and
 * the second adapter §2 promises. It must produce exactly what `outlineFromMarkdown`
 * produces for the same source, so lint and render parse one grammar; the unit suite
 * holds the two equal on a shared corpus.
 *
 * `html` starts at (or before) the first list and may run on past it; the list, the
 * key paragraph after it and the caption paragraph are read. Returns the outline plus
 * `start` / `end` offsets of the list and `keyEnd`, the offset just past the key
 * paragraph (or the list's end when there is no key), so the caller can splice.
 *
 * Mapping from HTML to the Markdown reader's terms:
 *   - an escape markdown-it consumed arrives as `<span data-esc>X</span>` (the
 *     `escapeMarks` plugin) and goes back to `\X`; every other literal backslash is
 *     doubled, so the grammar's CommonMark unescape restores it;
 *   - a line break inside an item (a lazy continuation) or a second paragraph in a
 *     loose item is the item's `detail`;
 *   - every other inline element (emphasis, links, raw HTML) contributes its text.
 * A single pass over a linear tokenizer: no regex here can backtrack.
 */
function outlineFromHtml(html) {
  const src = String(html);
  const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[^<]+|</g;
  const toks = [];
  for (let m = TOKEN.exec(src); m; m = TOKEN.exec(src)) {
    if (m[0].startsWith('<!--')) continue;
    if (m[2]) toks.push({ tag: m[2].toLowerCase(), close: m[1] === '/', attrs: m[3] || '', at: m.index, end: m.index + m[0].length });
    else toks.push({ text: m[0], at: m.index, end: m.index + m[0].length });
  }
  const items = [];
  let key = null;
  let caption = null;
  let start = -1;
  let end = -1;
  let keyEnd = -1;
  let k = 0;
  while (k < toks.length && !(toks[k].tag === 'ul' || toks[k].tag === 'ol') ) k++;
  if (k >= toks.length || toks[k].close) return { items, key, caption, start, end, keyEnd };
  start = toks[k].at;

  // Read a run of inline tokens into { segs, rest } until a block boundary.
  const STOP = new Set(['ul', 'ol', 'li', 'blockquote']);
  const readInline = (from, until) => {
    let text = '';
    const segs = [];
    let i = from;
    const flush = () => { if (text) { segs.push({ kind: 'text', value: text }); text = ''; } };
    for (; i < toks.length; i++) {
      const t = toks[i];
      if (t.tag && STOP.has(t.tag)) break;
      if (until?.(t)) break;
      if (t.text !== undefined) { text += t.text.replace(/\\/g, '\\\\'); continue; }
      if (t.tag === 'code' && !t.close) {
        let j = i + 1;
        let v = '';
        while (j < toks.length && !(toks[j].tag === 'code' && toks[j].close)) { if (toks[j].text !== undefined) v += toks[j].text; j++; }
        flush();
        segs.push({ kind: 'code', value: decodeHtml(v).trim() });
        i = j;
        continue;
      }
      if (t.tag === 'span' && !t.close && /\sdata-esc\b/.test(t.attrs)) {
        const nx = toks[i + 1];
        if (nx && nx.text !== undefined && toks[i + 2] && toks[i + 2].tag === 'span' && toks[i + 2].close) {
          text += `\\${decodeHtml(nx.text)}`;
          i += 2;
          continue;
        }
      }
      if (t.tag === 'br' || (t.tag === 'p' && t.close)) text += '\n';
    }
    flush();
    // Decode entities in text AFTER the backslash doubling, so an entity can never
    // manufacture an escape.
    for (const sg of segs) if (sg.kind === 'text') sg.value = decodeHtml(sg.value);
    return { segs, next: i };
  };

  // Split segments at the first newline: the row, then the detail.
  const splitDetail = (segs) => {
    const row = [];
    let detail = '';
    let inDetail = false;
    for (const sg of segs) {
      if (inDetail) { detail += sg.kind === 'code' ? `\`${sg.value}\`` : sg.value; continue; }
      if (sg.kind === 'text' && sg.value.includes('\n')) {
        const at = sg.value.indexOf('\n');
        const head = sg.value.slice(0, at);
        if (head) row.push({ kind: 'text', value: head });
        detail += sg.value.slice(at + 1);
        inDetail = true;
        continue;
      }
      row.push(sg);
    }
    detail = detail.replace(/\s+/g, ' ').trim();
    return { row, detail };
  };

  // Walk the list tree.
  const readList = (at, into) => {
    // toks[at] is an open ul/ol; returns the index just past its close.
    let i = at + 1;
    const tag = toks[at].tag;
    while (i < toks.length) {
      const t = toks[i];
      if (t.tag === tag && t.close) return i + 1;
      if (t.tag === 'li' && !t.close) {
        const item = { segs: [], children: [], quotes: [] };
        into.push(item);
        let j = i + 1;
        while (j < toks.length && toks[j].text !== undefined && !toks[j].text.trim()) j++;
        // A loose item wraps its row in a paragraph; the row is that paragraph.
        const loose = toks[j] && toks[j].tag === 'p' && !toks[j].close;
        const r = loose ? readInline(j + 1, (x) => x.tag === 'p' && x.close) : readInline(j);
        const { row, detail } = splitDetail(r.segs);
        item.segs = row;
        if (detail) item.detail = detail;
        j = loose ? r.next + 1 : r.next;
        while (j < toks.length && !(toks[j].tag === 'li' && toks[j].close)) {
          const u = toks[j];
          if ((u.tag === 'ul' || u.tag === 'ol') && !u.close) { j = readList(j, item.children); continue; }
          if (u.tag === 'blockquote' && !u.close) {
            let q = j + 1;
            let depth = 1;
            let qt = '';
            for (; q < toks.length; q++) {
              const w = toks[q];
              if (w.tag === 'blockquote') depth += w.close ? -1 : 1;
              if (!depth) break;
              if (w.text !== undefined) qt += w.text;
              else if (w.tag === 'p' || w.tag === 'br') qt += ' ';
            }
            item.quotes.push(decodeHtml(qt).replace(/\s+/g, ' ').trim());
            j = q + 1;
            continue;
          }
          if (u.tag === 'p' && !u.close) {
            // A later paragraph in a loose item: more detail.
            const more = readInline(j + 1, (x) => x.tag === 'p' && x.close);
            const txt = more.segs.map((sg) => (sg.kind === 'code' ? `\`${sg.value}\`` : sg.value)).join('').replace(/\s+/g, ' ').trim();
            if (txt) item.detail = item.detail ? `${item.detail} ${txt}` : txt;
            j = more.next + 1;
            continue;
          }
          j++;
        }
        i = j + 1;
        continue;
      }
      i++;
    }
    return i;
  };
  const after = readList(k, items);
  end = after < toks.length ? toks[after].at : src.length;
  keyEnd = end;

  // After the list: the key (a paragraph that is one bracketed code span), then a caption
  // (a paragraph that is one emphasis). Only paragraphs are looked at, in order.
  let i = after;
  for (let n = 0; n < 2 && i < toks.length; n++) {
    while (i < toks.length && toks[i].text !== undefined && !toks[i].text.trim()) i++;
    const t = toks[i];
    if (!t || t.tag !== 'p' || t.close) break;
    let j = i + 1;
    while (j < toks.length && !(toks[j].tag === 'p' && toks[j].close)) j++;
    const inner = toks.slice(i + 1, j);
    const bare = inner.filter((x) => !(x.text !== undefined && !x.text.trim()));
    if (key === null && bare.length === 3 && bare[0].tag === 'code' && !bare[0].close && bare[1].text !== undefined && bare[2].tag === 'code' && bare[2].close) {
      const v = decodeHtml(bare[1].text).trim();
      if (/^\[[\s\S]*\]$/.test(v)) { key = v; keyEnd = j < toks.length ? toks[j].end : src.length; i = j + 1; continue; }
    }
    if (caption === null && bare.length >= 3 && (bare[0].tag === 'em') && !bare[0].close && bare[bare.length - 1].tag === 'em' && bare[bare.length - 1].close) {
      caption = decodeHtml(inner.map((x) => x.text || '').join('')).trim();
    }
    break;
  }
  return { items, key, caption, start, end, keyEnd };
}

/** Decode the entities markdown-it writes (and numeric ones an author typed). */
function decodeHtml(s) {
  return String(s).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|#39|nbsp);/g, (m, e) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos' || e === '#39') return "'";
    if (e === 'nbsp') return ' ';
    const code = e[1] === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

module.exports = {
  SHAPES, STATUS_WORDS, HEADS, PATTERNS, SLOT_COUNT, LABEL_MAX,
  readArrow, splitRow, parseSpan, parseFlowchart, outlineFromMarkdown, outlineFromHtml, decodeHtml, inlineSegments, slug, tidy,
};
