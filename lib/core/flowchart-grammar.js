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
 * THE ROW'S TEXT IS A SEGNO GRAMMAR, AND THE BUDGETS. The Studio lints untrusted Markdown in
 * the browser on the main thread (HARD RULE #22). Words and arrows are read by a parser that
 * Segno generates from flowchart-row-grammar.js (Segno phase 3); Segno only builds grammars it
 * can prove linear, and each arrow is tried on a window of at most 64 characters, so a row costs
 * linear time whatever it holds. The two steps that are not naturally linear carry explicit
 * limits instead: the
 * near-duplicate check stops after NEAR_DUP_BUDGET comparisons, and the back-edge walk
 * uses an explicit stack, so a 6,000-step chain cannot overflow the call stack. Both were
 * found by the maker-checker review (a 34 KB fan-out took 4.9 s; a 6,000-step chain threw).
 *
 * Pure: plain data in, plain data out. No DOM, no markdown-it, no fs.
 */

const { componentSlot } = require('./segno-slots.js');
const { escapedText } = require('./inline-code-directives.js');
// The generated row parser keeps its state and its tree in module variables: a tree is valid only
// until the next parse() call, so read it before parsing again (splitRow does).
const rowParser = require('./flowchart-row.generated.js');
const { service } = require('../plugins/services.js');

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
const NAME_MAX = 120;
const NEAR_DUP_BUDGET = 20000;


// ── small helpers ───────────────────────────────────────────────────────────

// An escaped `\&` survives the fan-out split as this placeholder, then turns back into `&`.
const ESC_AMP = '\u0001';
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

// The row parser's node kinds, as the integers its flat tree stores (fixed per generated parser).
const ROW_KIND = Object.fromEntries(rowParser.parse('').tree.kinds.map((k, i) => [k, i]));

/**
 * One arrow node of the row parser's flat tree (four integers per node: kind, from, to, the
 * index past its last descendant) as an arrow record. The node's kids say which form it is:
 * `dash` | `eq` for the shaft, then `doubled` (Mermaid's `-->`, with `third` for `---`),
 * `labeled` (`-label->`, the label being the text from the node's start to the closing shaft)
 * or neither (`->`, `<-`, `<->`), and `head` wherever a `>` closes it.
 *
 * Returns { heavy, label, dir, mermaid } with dir 'out' | 'in' | 'both' | 'none'.
 */
function arrowAt(s, buf, k) {
  const to = buf[k + 2];
  const left = s.charCodeAt(buf[k + 1]) === 60; // `<`
  const heavy = buf[k + 4] === ROW_KIND.eq;
  const end = buf[k + 3];
  let sub = -1;
  let subFrom = 0;
  let headed = false;
  let third = false;
  for (let j = k + 8; j < end; j += 4) {
    const kind = buf[j];
    if (kind === ROW_KIND.head) headed = true;
    else if (kind === ROW_KIND.third) third = true;
    else if (sub < 0 && (kind === ROW_KIND.doubled || kind === ROW_KIND.labeled)) { sub = kind; subFrom = buf[j + 1]; }
  }
  if (sub === ROW_KIND.labeled) {
    return { heavy, label: s.slice(subFrom, to - (headed ? 2 : 1)), dir: headed ? (left ? 'both' : 'out') : (left ? 'in' : 'none'), mermaid: false };
  }
  if (sub === ROW_KIND.doubled) {
    if (headed) return { heavy, label: '', dir: left ? 'both' : 'out', mermaid: true };
    return { heavy, label: '', dir: left ? 'in' : 'none', mermaid: left || third };
  }
  return { heavy, label: '', dir: headed ? (left ? 'both' : 'out') : 'in', mermaid: false };
}

/**
 * Split one row's segments into PARTS separated by arrows. Text is read by the generated row
 * parser (flowchart-row-grammar.js): an arrow opens only at a word start, and a backslash in
 * front of punctuation keeps it as text (the backslash is dropped, as CommonMark drops it).
 * Code spans stay attached to the part they sit in.
 *
 * Returns { parts: [{ text, spans: [string] }], arrows: [arrow] } with
 * parts.length === arrows.length + 1.
 */
function splitRow(segs) {
  const parts = [{ text: '', spans: [] }];
  const arrows = [];
  let atWordStart = true;
  // Text after a span means the span sat INSIDE the name (`Run \`npm test\` -> Deploy`):
  // it is part of the name, not a modifier (§2.4: the span that styles is the trailing one).
  const pushText = (ch) => {
    const part = parts[parts.length - 1];
    if (part.spans.length && !isSpace(ch)) { part.text += `${part.spans.join(' ')} `; part.spans = []; }
    part.text += ch;
  };
  const pushRun = (run) => {
    if (!run) return;
    if (!parts[parts.length - 1].spans.length) parts[parts.length - 1].text += run;
    else for (const ch of run) pushText(ch);
  };
  for (const seg of segs) {
    if (seg.kind === 'code') {
      parts[parts.length - 1].spans.push(seg.value);
      atWordStart = true;
      continue;
    }
    // An ESCAPED span (`\{LIVE}`) is name text exactly as written: no arrow, fan-out or escape
    // inside it is read, so `\{go -> stop}` cannot split the row. Both readers emit it.
    if (seg.kind === 'literal') {
      for (const ch of String(seg.value)) pushText(ch === '&' ? ESC_AMP : ch);
      atWordStart = false;
      continue;
    }
    const s = String(seg.value);
    if (!s) continue;
    // Text that follows an escaped span continues its word, so its first word is never an arrow.
    const r = rowParser.parse(s, atWordStart ? 'row' : 'rest');
    // The row grammar matches every string (a character is a space or part of a word), so a
    // refusal is a defect in the generated parser, not in the deck.
    if (!r.ok) throw new Error(`flowchart row parser refused ${JSON.stringify(s)} at ${r.error.at}: expected ${r.error.expected}`);
    const { buf, top } = r.tree;
    let at = 0;
    let last = -1; // the kind of a top-level node that ends the text, if one does
    for (let k = 0; k < top; k = buf[k + 3]) {
      const kind = buf[k];
      const from = buf[k + 1];
      const to = buf[k + 2];
      if (kind === ROW_KIND.arrow) {
        pushRun(s.slice(at, from));
        arrows.push(arrowAt(s, buf, k));
        parts.push({ text: '', spans: [] });
      } else {
        // `esc`: the punctuation after a backslash, kept as text without it (`\&` survives the
        // fan-out split as ESC_AMP).
        pushRun(s.slice(at, from - 1));
        pushText(s[from] === '&' ? ESC_AMP : s[from]);
      }
      at = to;
      last = to === s.length ? kind : -1;
    }
    pushRun(s.slice(at));
    if (last === ROW_KIND.arrow) atWordStart = true;
    else if (last >= 0) atWordStart = false;
    else atWordStart = isSpace(s[s.length - 1]);
  }
  return { parts, arrows };
}

// ── spans ───────────────────────────────────────────────────────────────────

/**
 * Parse one style span: a Segno record read by the flowchart's `style` slot (its manifest's
 * `segno` field) — `{#api, diamond, c2}`, `{dotted, cross}`, or one bare word (`doc`, `fail`).
 * Row 25 of the Segno note's grammar table; it replaced the colon chain `#api:diamond:c2`. Order
 * is free, and an id, a status, a shape, a color and the line words are told apart by type.
 * Returns { id, shape: {...}, line: {...}, unknown: [span], why }. `host` is the component whose
 * `style` slot reads the span: `flowchart` by default, or `state-chart`, whose slot (its manifest)
 * adds the lead words `start` / `end`. Each slot is declared `sits: "list-rows"`, which is what
 * makes the component own every span on its rows (`LIST_ROW_OWNERS`, resolve-inline-code.js).
 */
function parseSpan(span, host = 'flowchart') {
  const out = { id: null, shape: {}, line: {}, unknown: [], why: '' };
  const text = String(span).trim();
  if (!text) return out;
  const b = componentSlot(host, 'style').read(text);
  if (!b.ok) {
    out.unknown.push(text);
    out.why = b.diagnostics[0]?.message || '';
    return out;
  }
  const v = b.value;
  if (v.id != null) {
    if (/^[a-z0-9][a-z0-9-]*$/.test(v.id) && v.id.length <= 40) out.id = v.id;
    else { out.unknown.push(text); out.why = `\`#${v.id}\` is not a usable id — lowercase letters, digits and hyphens, up to 40`; return out; }
  }
  if (v.status) out.shape.status = v.status;
  if (v.lead) out.shape.lead = [v.lead];
  if (v.shape) out.shape.shape = v.shape;
  if (v.color) out.shape.slot = v.color;
  // `icon=` and `icon-only` (engineering/decisions/2026-09-29-inline-icons.md § 5.3): the name as
  // written; parseFlowchart resolves it against the icons plugin once every shape exists.
  if (v.icon !== undefined) out.shape.icon = String(v.icon).trim().toLowerCase();
  if (v['icon-only']) out.shape.iconOnly = true;
  for (const k of ['fill', 'border', 'text']) if (v[k]) out.shape[k] = v[k];
  if (v.head) out.line.head = v.head;
  if (v.pattern) out.line.pattern = v.pattern;
  if (v.loose) out.line.loose = true;
  return out;
}

const LIST_MARKER_LIKE = /^(?:\d+[.)]|[-*+])$/;

/**
 * Parse an outline into the flowchart model.
 *
 * @param {object[]} items  outline items (see the header)
 * @param {object} [opts]
 * @param {string|null} [opts.key]   the key span's inner text (`[{"=>", Happy path}]`), or null
 * @param {string} [opts.host] the component whose `style` slot reads the spans: `flowchart` (the
 *   default) or `state-chart`, whose slot adds the lead words `start` / `end`
 * @param {Set<string>|null} [opts.off] the plugins this deck did not load; with `icons` off a
 *   shape's `icon=` is kept as written and nothing draws it
 * @returns {{ shapes, groups, edges, notes, key, diagnostics }}
 */
function parseFlowchart(items, opts = {}) {
  const host = opts.host || 'flowchart';
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
        `\`${sp.unknown.join(' ')}\` is not a style — the span is ignored${sp.why ? `: ${sp.why}` : ''}`,
        'Shapes: `box` `square` `pill` `diamond` `circle` `cylinder` `io` `doc`; colors `c1`…`c8`; lines `dashed` `dotted` `open` `dot` `cross` `loose`; a status word such as `fail`. Several go in one record: `{#api, diamond, c2}`.', line);
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
      const row = { it, parts, arrows, isArrowRow, parentRow, thing: null, line: it.line || null, idx: rows.length };
      rows.push(row);
      walk(it.children || [], row);
    }
  };
  walk(items, null);

  // READING ORDER. A shape sits where the author first put it in sequence: the row it leads,
  // or its step in a CHAIN row (`A => B => C`, two arrows or more), whichever comes first.
  // A single connection (`- -approve-> Approved`) only refers to its target, so a forward
  // target keeps its own row's place. The output lists shapes in this order, which is the order the state chart
  // numbers and the order a wrapped layout reads in. (Before, every shape leading a row came
  // first, so a chain written on one row wrapped out of order.)
  const seat = (t, rowIdx, step) => { if (!t.at || rowIdx < t.at[0] || (rowIdx === t.at[0] && step < t.at[1])) t.at = [rowIdx, step]; };

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
      if (parseSpan(sp, host).unknown.length) {
        head.text += ` ${sp}`;
        diag('warning', 'flowchart-unknown-modifier', `\`${sp}\` is not a style, so it is read as part of the name`, 'Shapes: `box` `square` `pill` `diamond` `circle` `cylinder` `io` `doc`; colors `c1`…`c8`; a status word such as `fail`; several in one record: `{#api, diamond, c2}`. To keep code in a name, this is fine.', row.line);
      } else head.modSpans.push(sp);
    }
    const name = tidy(head.text).replaceAll(ESC_AMP, '&');
    if (!name || LIST_MARKER_LIKE.test(name) || name.length > NAME_MAX) {
      // An icon-only shape with no words would have no name to read aloud (§ 5.3 of the icons note).
      const iconOnly = !name && head.modSpans.some((sp) => parseSpan(sp, host).shape.iconOnly);
      diag('error', 'flowchart-empty-name', name ? `"${name}" is not a usable shape name` : iconOnly ? 'this icon-only shape has no name' : 'this row has no name',
        iconOnly ? 'Keep the words before the span: an icon-only shape shows the icon, and its name is what a screen reader says and what the hover title shows.' : 'Every list item names a shape.', row.line);
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
    seat(t, row.idx, 0);
    for (const q of row.it.quotes || []) if (tidy(q)) (t.notes = t.notes || []).push(tidy(q));
  }
  // Spans on shape rows (after every name exists, so ids resolve in any order).
  for (const row of rows) {
    if (row.isArrowRow || !row.thing) continue;
    for (const s of row.parts[0].modSpans || []) {
      const sp = parseSpan(s, host);
      if (Object.keys(sp.line).length) diag('error', 'flowchart-line-word-on-shape', `\`${s}\` styles a line, but it follows the shape "${row.thing.name}"`, 'Put line styles after the target of a connection.', row.line);
      applyShape(row.thing, sp, row.line);
    }
  }

  // Icons (engineering/decisions/2026-09-29-inline-icons.md § 5.3). The shape keeps the
  // CANONICAL name the icons plugin knows; a name it does not know is coached and dropped, so
  // the shape shows its text. With the plugin off there is no service: the name is kept as
  // written and the transform, which asks the same host, draws nothing.
  const known = service('icons', 'known', opts.off || null);
  const why = service('icons', 'whyUnknown', opts.off || null);
  for (const t of things) {
    if (t.isGroup && (t.meta.icon !== undefined || t.meta.iconOnly)) {
      diag('warning', 'flowchart-icon-on-group', `"${t.name}" is a group, and a group's title draws no icon`, 'Put the icon on a shape inside the group.', t.line);
      delete t.meta.icon;
      delete t.meta.iconOnly;
      continue;
    }
    if (t.meta.icon !== undefined && known) {
      const c = known(t.meta.icon);
      if (c) t.meta.icon = c;
      else {
        diag('warning', 'flowchart-unknown-icon', `"${t.name}" shows its text alone: ${why ? why(t.meta.icon) : `"${t.meta.icon}" is not an icon`}`,
          'Pick a name from the icon set: lib/plugins/icons/icons.docs.md lists every one.', t.line);
        delete t.meta.icon;
      }
    }
    if (t.meta.iconOnly && t.meta.icon === undefined) {
      diag('warning', 'flowchart-icon-only-without-icon', `"${t.name}" is \`icon-only\` but names no icon, so it shows its text`, 'Name the icon in the same record: `{icon=database, icon-only}`.', t.line);
      delete t.meta.iconOnly;
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
        const sp = parseSpan(s, 'flowchart');
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
        if (row.arrows.length >= 2) seat(t, row.idx, ai + 1);
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
    if (f.isGroup && e.from === e.to) {
      diag('error', 'flowchart-group-self-edge', `"${f.name}" connects to itself, and a group has no side to loop from`, 'Connect a member, or connect the group to something outside it.', e.line);
      continue;
    }
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

  // A shape with no seat (only ever a single connection's target) keeps its old place after
  // the seated ones, in the order first mentioned, so a chart with no chain row keeps the
  // order it always had.
  const rank = (t) => t.at || [Infinity, 0];
  things.sort((a, b) => { const x = rank(a), y = rank(b); return (x[0] - y[0]) || (x[1] - y[1]); });

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
const DEFAULT_WORDS = { '=>': 'Main path', dashed: 'Optional', dotted: 'Informal', cross: 'Stops here', 'on-track': 'On track', done: 'Done', live: 'Live', 'at-risk': 'At risk', warn: 'Warning', blocked: 'Blocked', fail: 'Failing', pilot: 'Pilot', decision: 'Decision', deferred: 'Deferred' };

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
  for (const p of PATTERNS) if (edges.some((e) => e.style.pattern === p)) add(p, DEFAULT_WORDS[p]);
  if (edges.some((e) => e.style.head === 'cross')) add('cross', DEFAULT_WORDS.cross);
  // A slot is a color, not a meaning: it enters the key only when a group wears it (the
  // group's name is the default word) or when the author names it.
  const slotOwners = new Map();
  for (const t of things) if (t.meta.slot && t.isGroup && !slotOwners.has(t.meta.slot)) slotOwners.set(t.meta.slot, t.name);
  for (const [slot, name] of slotOwners) add(`c${slot}`, name);

  if (authored) {
    const { parseInlineSet } = require('./label-set');
    // Every entity markdown-it writes, `&quot;` included: a key that quotes its word
    // (`{"=>", Main path}`) arrives from a rendered page as `{&quot;=&gt;&quot;, …}`.
    const set = parseInlineSet(decodeHtml(String(authored)));
    if (!set) {
      diag('warning', 'flowchart-key-shape', 'the key line is not a key set', 'Write `[{"=>", Main path}, {c2, Platform}]`.', authored);
    } else {
      const usedSlots = new Set(things.map((t) => t.meta.slot).filter(Boolean).map((n) => `c${n}`));
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
  // An autolink renders as its address, without the brackets.
  v = v.replace(/<((?:https?|mailto|ftp):[^<>\s]*)>/gi, '$1');
  // Until nothing changes: one pass over `<scr<b>ipt>` would leave `<script>` behind. The
  // name is escaped wherever it is painted, so this is about reading the same name as the
  // render, not about safety; but a stripper that can be walked round is a bad example.
  for (let prev = null; prev !== v;) { prev = v; v = v.replace(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g, ''); }
  v = v.replace(/\[([^\][]*)\]\([^()\s]*\)/g, '$1');
  v = v.replace(/(\*\*|__)(?=\S)([^*_]*?\S)\1/g, '$2');
  // `*` emphasis may sit inside a word (`A*x*`); `_` may not (`snake_case_name`).
  v = v.replace(/\*(?=\S)([^*]*?\S)\*/g, '$1');
  v = v.replace(/(^|[\s(])_(?=\S)([^_]*?\S)_(?=$|[\s).,;:!?])/g, '$1$2');
  // An entity that decodes to a backslash is a CHARACTER, never an escape: it is doubled,
  // so the grammar's unescape gives one backslash back, as the HTML reader's doubling does.
  const value = v.replace(/&(?:#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|#39|nbsp);/g, (m) => {
    const c = decodeHtml(m);
    return c === '\\' ? '\\\\' : c;
  });
  return { kind: 'text', value };
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
    const body = s.slice(i + n, c).trim();
    // An ESCAPED span (`\{LIVE}`) is read as written, backslash off, as part of the name — what
    // the render does (lib/core/inline-code-directives.js `escapedText`), so lint, the narrator
    // and the chart agree. A `literal` segment: `splitRow` reads nothing inside it.
    const escaped = escapedText(body);
    if (text) { segs.push({ kind: 'text', value: text }); text = ''; }
    if (escaped !== null) { segs.push({ kind: 'literal', value: escaped }); i = c + n; continue; }
    segs.push({ kind: 'code', value: body });
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
        // A row ending in a backslash, with a line after it, ends in a HARD BREAK, which
        // markdown-it renders as <br>, not as a backslash in the name.
        const last = top.item.segs[top.item.segs.length - 1];
        if (!top.item.detail && last?.kind === 'text' && /(^|[^\\])(\\\\)*\\$/.test(last.value)) last.value = last.value.slice(0, -1);
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

/**
 * Each shape's hidden detail, as `Map<shapeId, string[]>`. A blockquote may sit under a
 * GROUP too, and a group carries no mark to reveal it on, so its note rides on the group's
 * first shape (in list order), led by the group's name: "Payment: retried twice". Both
 * graph charts read their detail through this, so neither can drop a group's note.
 */
function shapeNotes(model) {
  const out = new Map();
  const shapes = model?.shapes || [];
  const parentOf = new Map([...(model?.groups || []), ...shapes].map((n) => [n.id, n.parent || null]));
  const nameOf = new Map((model?.groups || []).map((g) => [g.id, g.name]));
  const firstIn = (gid) => shapes.find((sh) => {
    for (let p = sh.parent, hops = 0; p && hops < 64; p = parentOf.get(p), hops++) if (p === gid) return true;
    return false;
  });
  const add = (id, text) => { if (!out.has(id)) out.set(id, []); out.get(id).push(text); };
  for (const n of model?.notes || []) {
    if (shapes.some((sh) => sh.id === n.on)) add(n.on, n.text);
    else if (nameOf.has(n.on)) { const host = firstIn(n.on); if (host) add(host.id, `${nameOf.get(n.on)}: ${n.text}`); }
  }
  return out;
}

module.exports = {
  shapeNotes,
  SHAPES, STATUS_WORDS, HEADS, PATTERNS, SLOT_COUNT,
  splitRow, parseSpan, parseFlowchart, outlineFromMarkdown, decodeHtml, inlineSegments, slug, tidy,
};
