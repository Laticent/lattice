/**
 * hub-spoke-model — the ONE reading of a `hub-spoke` slide: its pill grammar, its
 * channel rule, its text estimate, the hub's fit, and every lint the component owns.
 *
 * ── WHY IT LIVES IN lib/core ──────────────────────────────────────────────────
 *
 * Three consumers ask the same questions of the same Markdown, and each would
 * otherwise answer them its own way (HARD RULE #7, HARD RULE #1):
 *   · the kernel (`lib/components/chart/hub-spoke/hub-spoke.transform.js`), which
 *     draws what this module decides;
 *   · the linter (`lib/authoring/lint-core.js`), which warns about what this module
 *     decides before anything renders;
 *   · the voice (`lib/core/chart-narration.js`), which says what this module decides.
 * `lib/core` never imports a component, and the linter is shared by the CLI, the
 * `validate()` API and the browser, so the shared rules have to sit here. The prototype
 * this replaces carried a private value parser that disagreed with the family's on eight
 * spellings (`1,25M`, `20 mg`, `($5M)` …); every value question here goes to
 * `chart-values.js` instead, and every status question to `chart-status.js`.
 *
 * ── THE GRAMMAR ──────────────────────────────────────────────────────────────
 *
 *   - Hub name `$48M`                      one top-level item: the hub (+ one value)
 *     - Satellite `$18M` `at-risk` `Retail`   a child: name, then pills in any order
 *       - a detail bullet                     (flat) mark-detail for this satellite
 *
 * A satellite's pills are read ONE rule at a time, first match wins:
 *   1. a CHART_STATUS word is the status (a second one is linted, then dropped);
 *   2. `flow:in` / `flow:out` / `flow:both` sets this spoke's arrowhead, and nothing else;
 *   3. a VALUE pill (`isValuePill`, the family test) is the value — at most one;
 *   4. a pill that LOOKS like a value — a digit before any letter (`$18M+`, `1.2e6`,
 *      `~40%?`) — but fails the value test is refused: it is a figure the chart cannot
 *      read, and printing it as a group would file a number under a category;
 *   5. anything else is the group (a second one is linted, then dropped). A digit
 *      AFTER a letter is a name, not a figure: `Wave 1`, `Q3`, `Tier 1`, `H1` and
 *      `FY26` are all groups.
 * A group name that STARTS with a digit (`3PL`, `5G`) passes the family's value test,
 * so it reads as a value: spell it out. That is the family rule, stated here rather
 * than bent for one member.
 *
 * ── THE CHANNEL RULE ─────────────────────────────────────────────────────────
 *
 * Values print by default and NOTHING scales. Scaling is the author's opt-in:
 *   · `sized`      node AREA carries the value (sqrt, with a floor), at most 8 spokes;
 *   · `flow-out|flow-in|flow-both`  connector WEIGHT in stepped classes, and the
 *                  class's direction becomes every spoke's default arrowhead.
 * A channel draws only when every DRAWN spoke has a positive value in one unit. The
 * spokes past the drawing cap are sliced off BEFORE the channel is computed, so an
 * undrawn thirteenth spoke can neither switch the channel off nor set the maximum.
 * A per-spoke `flow:` pill is an arrowhead only; it never turns on a channel.
 *
 * Pure: no fs, no DOM. Safe in every browser bundle.
 */

const { parseValue, isValuePill, unitKey } = require('./chart-values');
const { chartStatus, spokenStatus } = require('./chart-status');
const { firstListTree, trailingPills } = require('./first-list-tree');

// ── Limits (documented in hub-spoke.docs.md; each one has a lint) ────────────────
const LIMITS = Object.freeze({
  satellites: 12,     // flat spokes drawn; the rest are linted and dropped
  sized: 8,           // past 8, area comparison is noise — the lint suggests a bar
  groups: 6,          // the categorical cap (spend-rules.md §2)
  branches: 6,        // tiered
  leaves: 18,         // tiered, across all branches
  hubName: 40,        // characters the hub name may carry before it overflows the cap
  hubValue: 12,       // characters the hub value may carry
});

// THE CERTIFIED ENVELOPE. Inside it the seeded fuzz in
// test/unit/components/hub-spoke.test.js places every label with zero collisions and
// every disc on its floors. Outside it the kernel still draws — it falls back to a label
// column with leaders — but `hub-spoke-crowded` warns, because nothing proves the result
// is clean. Two measures, both per drawn spoke count and per stage shape:
//   · the longest satellite name, in characters;
//   · the LABEL LOAD: every row the labels print, summed — a name's lines at 19
//     characters a line, plus one for a value and one for a status. It is the measure
//     the fuzz found to separate clean layouts from crowded ones; name length alone
//     does not (twelve short names each with a value and a status crowd a wing).
// Rows: [max spokes, max name characters, max label load].
const ENVELOPE = Object.freeze({
  landscape: Object.freeze([[7, 40, 22], [8, 34, 22], [10, 28, 22], [12, 22, 24]]),
  tall: Object.freeze([[8, 20, 18], [10, 18, 18], [12, 16, 18]]),
});
const NAME_ENVELOPE = Object.freeze(ENVELOPE.landscape.map(([n, c]) => [n, c]));
const LEAF_NAME_ENVELOPE = 14;
const BRANCH_NAME_ENVELOPE = 16;
// A tiered figure on a tall stage is certified only this small.
const TALL_TIER = Object.freeze({ branches: 3, leaves: 9, name: 12 });
// A landscape tiered figure is proven clean up to this many leaves (it draws up to 18),
// and fewer as the branches fill both wings: [max branches, max leaves]. Measured with the
// seeded fuzz once the kernel checked disc overlap — the earlier 14-for-everyone figure
// passed six-branch slides only because nothing noticed their keyed layout drew discs
// over each other.
const WIDE_TIER_LEAVES = 14;
const WIDE_TIER = Object.freeze([[4, 14], [5, 11], [6, 9]]);
// On a square stage, `tiered flow-both` with a flagged branch needs two arrowheads AND a
// halo on the branch's neck and a halo on its twigs; a hub text wider than this radius
// leaves the twigs no room (the portrait stage is tall enough to keep them).
const SQUARE_TIER_BOTH_HUB = 31.5;

const FLOW_CLASSES = Object.freeze(['flow-out', 'flow-in', 'flow-both']);
const MODIFIERS = Object.freeze(['sized', 'tiered', ...FLOW_CLASSES]);
const FLOW_PILL = /^flow\s*:\s*(in|out|both)$/i;
// The statuses that EMPHASIZE (halo, strong edge, larger value). The rest recolor
// their spoke's node and print the word, and nothing more.
const ALARM = Object.freeze(new Set(['at-risk', 'warn', 'blocked', 'fail']));

// The stepped connector classes. Four steps, never a hairline; a value within
// TIE_TOLERANCE of a stronger value shares its class, so 75 and 75.1 draw alike.
const FLOW_STEPS = 4;
const TIE_TOLERANCE = 0.02;
// Two values this close that still land a step apart get a lint, so the author
// knows the picture shows a difference the numbers barely have.
const STEP_SPLIT_WARN = 0.06;

// ── The text estimate ──────────────────────────────────────────────────────────
//
// A pure kernel cannot ask the browser how wide a string paints, so it estimates,
// conservatively. `--font-label` is the monospace face (base.tokens.css), which paints
// 0.6em a character; under `mode: sketch` it is the proportional hand face, billed at
// 0.66em (its measured mixed-case average sits under that; tracked uppercase is not a
// voice this chart uses). A wide character — CJK, fullwidth forms, most emoji — paints a
// full em in either face, and billing it at 0.6 is how the prototype clipped Japanese
// names. Bold is billed 3% wider.
const ADVANCE_MONO = 0.6;
const ADVANCE_HAND = 0.66;

function isWide(cp) {
  return (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd);
}

/** Width of `text` at `fs` user units. */
function textWidth(text, fs, { hand = false, bold = false } = {}) {
  const adv = hand ? ADVANCE_HAND : ADVANCE_MONO;
  let em = 0;
  for (const ch of String(text == null ? '' : text)) em += isWide(ch.codePointAt(0)) ? 1 : adv;
  return em * fs * (bold ? 1.03 : 1);
}

// Where a token too wide for its line may break: after one of these, before the next
// character. `know-your-customer` breaks at its hyphen, a URL at its slashes; only a
// token with none of them is cut mid-run.
const BREAK_AFTER = /[-/_.:\\]/;

function breakToken(token, maxW, fs, opts) {
  const out = [];
  let rest = token;
  while (rest && textWidth(rest, fs, opts) > maxW) {
    const chars = [...rest];
    let fit = 0;
    let w = 0;
    for (const ch of chars) {
      const cw = textWidth(ch, fs, opts);
      if (w + cw > maxW && fit > 0) break;
      w += cw;
      fit += 1;
    }
    let cut = fit;
    for (let i = fit - 1; i >= Math.ceil(fit / 3); i--) {
      if (BREAK_AFTER.test(chars[i])) { cut = i + 1; break; }
    }
    out.push(chars.slice(0, cut).join(''));
    rest = chars.slice(cut).join('');
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Wrap `text` to `maxW` user units at `fs`. Words stay whole where they fit; a word
 * wider than the line breaks at a hyphen, slash, dot or colon, and only then mid-run.
 * Never ellipsizes — every character the author typed is drawn.
 */
function wrapText(text, maxW, fs, opts = {}) {
  const words = String(text == null ? '' : text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let cur = '';
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (textWidth(trial, fs, opts) <= maxW) { cur = trial; continue; }
    if (cur) { lines.push(cur); cur = ''; }
    if (textWidth(word, fs, opts) <= maxW) { cur = word; continue; }
    const parts = breakToken(word, maxW, fs, opts);
    cur = parts.pop();
    lines.push(...parts);
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── The hub's text, and its ceiling ─────────────────────────────────────────────
//
// The hub is the whole, so it is the heaviest mark — and it must stay a hub, not a
// planet: its radius is capped at HUB_RATIO_MAX × the largest satellite and at the
// stage. The prototype sized the disc to whatever the name needed, so a long hub name
// grew a disc past the stage with the satellites drawn inside it. Here the TEXT gives
// way instead: it wraps (mid-token if it must), then the type steps down to a floor,
// and only past that floor is the hub reported as overflowing (`hub-spoke-hub-overflow`,
// an error, because the last line is then cut short with an ellipsis).
const HUB_RATIO_MIN = 1.6;
const HUB_RATIO_MAX = 3.0;
const HUB_FS = 11;
const HUB_FT = 20;
const HUB_FS_FLOOR = 8.5;
const HUB_FT_FLOOR = 12;
const HUB_LH = 1.2;
const HUB_INSET = 4;

function hubBlock(lines, value, fsN, ft, opts) {
  const w = Math.max(0, ...lines.map((l) => textWidth(l, fsN, { ...opts, bold: true })),
    value ? textWidth(value, ft, { ...opts, bold: true }) : 0);
  const h = lines.length * fsN * HUB_LH + (value ? ft * 1.05 : 0);
  return { w, h, r: Math.hypot(w / 2, h / 2) + HUB_INSET };
}

/**
 * Fit the hub's name and value inside a disc of radius at most `rMax`.
 * @returns {{ lines: string[], fsN: number, ft: number, r: number, overflow: boolean }}
 */
function fitHubText(name, value, rMax, opts = {}) {
  const text = String(name == null ? '' : name).trim();
  const val = String(value == null ? '' : value).trim();
  let best = null;
  for (let step = 0; step <= 10; step++) {
    const k = 1 - step * 0.05;
    const fsN = Math.max(HUB_FS_FLOOR, HUB_FS * k);
    const ft = Math.max(HUB_FT_FLOOR, HUB_FT * k);
    // Try each line width from the longest word down to the whole name, keeping the
    // block with the smallest enclosing circle. Always at least one candidate, so an
    // empty or one-letter name cannot fall through (the prototype's crash: its loop
    // started at 5 characters and never ran for a 4-character name).
    // A word is never split while it fits the disc whole: the narrowest line tried is
    // the longest word. Only a word wider than the disc itself is broken (at a hyphen
    // or slash first), which is what the prototype did to every hub ("Servic/e desk").
    const widths = new Set();
    const bold = { ...opts, bold: true };
    const whole = textWidth(text, fsN, bold);
    const longest = Math.max(0, ...text.split(/\s+/).map((w) => textWidth(w, fsN, bold)));
    const lineCap = Math.max(fsN * 3, (rMax - HUB_INSET) * 1.9);
    const floor = Math.max(fsN * 3, Math.min(longest, lineCap));
    for (let f = 0; f <= 1.0001; f += 0.05) widths.add(floor + (Math.max(floor, whole) - floor) * f);
    let stepBest = null;
    for (const w of widths) {
      const lines = text ? wrapText(text, w, fsN, { ...opts, bold: true }) : [];
      if (lines.length > 3) continue;
      const b = hubBlock(lines, val, fsN, ft, opts);
      if (!stepBest || b.r < stepBest.r) stepBest = { lines, fsN, ft, r: b.r };
    }
    if (!stepBest) {
      // Even the widest line needs four or more rows: cut to three at the cap width.
      const lines = wrapText(text, (rMax - HUB_INSET) * 1.6, fsN, { ...opts, bold: true });
      stepBest = { lines, fsN, ft, r: hubBlock(lines, val, fsN, ft, opts).r };
    }
    best = stepBest;
    if (best.r <= rMax && best.lines.length <= 3) return { ...best, overflow: false };
  }
  // Past the type floor. Keep the floor sizes, cap at three lines and cut the last one
  // short with an ellipsis until the block fits: visible truncation, and linted.
  let lines = best.lines.slice(0, 3);
  const maxW = Math.max(best.fsN * 3, (rMax - HUB_INSET) * 1.55);
  lines = lines.map((l) => {
    if (textWidth(l, best.fsN, { ...opts, bold: true }) <= maxW) return l;
    let s = [...l];
    while (s.length > 1 && textWidth(`${s.join('')}…`, best.fsN, { ...opts, bold: true }) > maxW) s = s.slice(0, -1);
    return `${s.join('')}…`;
  });
  if (best.lines.length > 3) {
    let last = [...lines[2]].filter((c) => c !== '…');
    while (last.length > 1 && textWidth(`${last.join('')}…`, best.fsN, { ...opts, bold: true }) > maxW) last = last.slice(0, -1);
    lines[2] = `${last.join('')}…`;
  }
  const b = hubBlock(lines, val, best.fsN, best.ft, opts);
  return { lines, fsN: best.fsN, ft: best.ft, r: Math.min(b.r, rMax), overflow: true };
}

// The satellite radius ladder, by drawn count: [max n, hub target R, satellite r].
// Shared by the kernel's solve and the hub-fit prediction the linter makes, so the
// two agree about the ceiling a hub name is measured against.
const LADDER = Object.freeze([
  [2, 62, 30], [3, 62, 30], [4, 60, 28], [6, 56, 25], [8, 52, 21], [10, 48, 18], [12, 46, 16],
]);
function ladderFor(n) {
  return LADDER.find((r) => n <= r[0]) || LADDER[LADDER.length - 1];
}
// The stage is 200 user units tall; the hub never reaches its edge.
const STAGE_H = 200;
const TIER_BRANCH_R = 13;

// The hub's GEOMETRIC ceiling by drawn count, on the 200-unit stage: past it the
// spokes nearest 12 and 6 o'clock cannot keep their connector floor. Measured with the
// seeded fuzz (test/unit/components/hub-spoke.test.js), not derived from the ratio.
const HUB_GEOM = Object.freeze([[4, 66], [6, 60], [8, 54], [10, 48], [12, 44]]);

/** The largest radius the hub may take for `n` drawn spokes. */
function hubCeiling(n, { tiered = false, sized = false, stage = 'landscape' } = {}) {
  // A tall stage is narrower, so its spokes run out of room sooner: the hub gives way.
  const k = stage === 'landscape' ? 1 : 0.85;
  if (tiered) return Math.min(HUB_RATIO_MAX * TIER_BRANCH_R, 40) * k;
  const rs = sized ? sizedRadiusMax(n) : ladderFor(n)[2];
  const geom = (HUB_GEOM.find((r) => n <= r[0]) || HUB_GEOM[HUB_GEOM.length - 1])[1];
  return Math.min(HUB_RATIO_MAX * rs, geom, STAGE_H / 2 - 12) * k;
}

// ── Modifiers ────────────────────────────────────────────────────────────────
function modifiersOf(classTokens) {
  const t = new Set(classTokens || []);
  const flows = FLOW_CLASSES.filter((c) => t.has(c));
  return {
    sized: t.has('sized'),
    tiered: t.has('tiered'),
    flow: flows.length ? flows[0].slice('flow-'.length) : '',
    flowClasses: flows,
  };
}

// ── The pill grammar ──────────────────────────────────────────────────────────
// A pill that reaches a digit before any letter is trying to be a figure (`$18M+`,
// `1.2e6`, `~40%?`). One with a letter first (`Wave 1`, `Q3`, `FY26`) is a name.
const LOOKS_NUMERIC = /^[^\p{L}]*\d/u;
/**
 * Read one item's trailing pills (already decoded to plain text).
 * @returns {{ value, status, dir, group, issues: Array<{kind, pill}> }}
 */
function readPills(pills) {
  const out = { value: '', status: '', dir: '', group: '', issues: [] };
  for (const raw of pills || []) {
    const p = String(raw == null ? '' : raw).trim();
    if (!p) continue;
    const s = chartStatus(p);
    if (s) {
      if (!out.status) out.status = s;
      else out.issues.push({ kind: 'extra-status', pill: p });
      continue;
    }
    const f = p.match(FLOW_PILL);
    if (f) {
      if (!out.dir) out.dir = f[1].toLowerCase();
      continue;
    }
    if (isValuePill(p)) {
      if (!out.value) out.value = p;
      else out.issues.push({ kind: 'extra-value', pill: p });
      continue;
    }
    if (LOOKS_NUMERIC.test(p)) { out.issues.push({ kind: 'numeric-group', pill: p }); continue; }
    if (!out.group) out.group = p;
    else out.issues.push({ kind: 'extra-group', pill: p });
  }
  return out;
}

/**
 * Build the model from a list tree. `tree` is the slide's first list, top-level items
 * first: `[{ label, pills, children: [...] , detail? }]`, labels and pills as plain text.
 * Detail (a flat satellite's sublist, a tiered leaf's sublist) is carried through
 * opaquely on `detail`, which the kernel sets from its HTML and the linter ignores.
 */
function buildModel(tree, classTokens) {
  const mods = modifiersOf(classTokens);
  const items = Array.isArray(tree) ? tree : [];
  const hubItem = items[0];
  if (!hubItem) return null;
  const hp = readPills(hubItem.pills);
  const read = (item) => {
    const p = readPills(item.pills);
    const num = p.value ? parseValue(p.value) : NaN;
    return {
      label: String(item.label || '').trim(),
      value: p.value,
      num,
      unit: p.value ? unitKey(p.value) : null,
      status: p.status,
      alarm: ALARM.has(p.status),
      dir: p.dir,
      group: p.group,
      issues: p.issues,
      detail: item.detail || '',
      line: item.line,
    };
  };
  const spokesAll = (hubItem.children || []).map((c, k) => {
    const s = read(c);
    s.k = k;
    s.leavesAll = mods.tiered ? (c.children || []).map((g, j) => ({ ...read(g), k: j })) : [];
    return s;
  });
  const hub = {
    label: String(hubItem.label || '').trim(),
    value: hp.value,
    num: hp.value ? parseValue(hp.value) : NaN,
    unit: hp.value ? unitKey(hp.value) : null,
    status: hp.status,
    dir: hp.dir,
    group: hp.group,
    issues: hp.issues,
    line: hubItem.line,
  };
  const cap = mods.tiered ? LIMITS.branches : LIMITS.satellites;
  const spokes = spokesAll.slice(0, cap);
  // Tiered: cap the leaves across the whole figure, in authored order.
  let leafBudget = LIMITS.leaves;
  for (const s of spokes) {
    s.leaves = s.leavesAll.slice(0, Math.max(0, leafBudget));
    leafBudget -= s.leaves.length;
  }
  return {
    hub,
    spokes,
    spokesAll,
    extraTop: items.slice(1).map((i) => ({ label: i.label, line: i.line })),
    mods,
  };
}

/** The authored groups on the drawn spokes, in first-seen order. */
function groupsOf(model) {
  if (model.mods.tiered) return [];
  return [...new Set(model.spokes.map((s) => s.group).filter(Boolean))];
}

/** Stepped flow classes 1..FLOW_STEPS, with the tie tolerance. */
function flowClasses(nums) {
  const vmax = Math.max(...nums);
  const raw = nums.map((v) => Math.min(FLOW_STEPS, Math.max(1, Math.ceil((FLOW_STEPS * v) / vmax - 1e-9))));
  const order = nums.map((_v, i) => i).sort((a, b) => nums[b] - nums[a]);
  const cls = raw.slice();
  let leader = -1;
  for (const i of order) {
    if (leader >= 0 && nums[i] >= nums[leader] * (1 - TIE_TOLERANCE)) cls[i] = cls[leader];
    else leader = i;
  }
  return cls;
}

/**
 * THE CHANNEL RULE. One magnitude channel per slide, and only when the author asked.
 * @returns {{ channel: 'none'|'size'|'flow', vmax, flowCls: number[], why: string }}
 */
function channelOf(model) {
  const { mods } = model;
  const sp = model.spokes;
  const none = (why) => ({ channel: 'none', vmax: 0, flowCls: sp.map(() => 0), why });
  if (mods.tiered) return none(mods.sized || mods.flow ? 'tiered' : '');
  const wantFlow = !!mods.flow;
  const wantSize = mods.sized && !wantFlow;
  if (!wantFlow && !wantSize) return none('');
  if (!sp.length) return none('empty');
  if (sp.some((s) => !s.value)) return none('missing');
  if (sp.some((s) => !(s.num > 0))) return none('nonpositive');
  if (new Set(sp.map((s) => s.unit)).size > 1) return none('units');
  if (wantSize && sp.length > LIMITS.sized) return none('sized-many');
  const nums = sp.map((s) => s.num);
  const vmax = Math.max(...nums);
  if (wantFlow) return { channel: 'flow', vmax, flowCls: flowClasses(nums), why: '' };
  return { channel: 'size', vmax, flowCls: sp.map(() => 0), why: '' };
}

/** The arrowhead direction a spoke draws: its own pill, else the slide's class. */
function directionOf(spoke, mods) {
  return spoke.dir || mods.flow || '';
}

// ── Size channel ───────────────────────────────────────────────────────────────
// Area, not radius: r = rmax·√(v/vmax), floored so the smallest disc still reads as a
// node. A floored disc no longer compares, so it is CLAMPED — stamped on the mark and,
// past one, linted.
function sizeRadii(nums, rmax, floor) {
  const vmax = Math.max(...nums);
  return nums.map((v) => {
    const r = rmax * Math.sqrt(v / vmax);
    return r < floor ? { r: floor, clamped: true } : { r, clamped: false };
  });
}
const sizeFloor = (rmax) => Math.max(rmax * 0.42, 7);
// `sized` draws its largest disc this much larger than the ladder's satellite.
const SIZED_BOOST = 1.18;
/** The largest disc `sized` starts from for `n` drawn spokes — the kernel's and the lint's. */
const sizedRadiusMax = (n) => ladderFor(n)[2] * SIZED_BOOST;
/** The discs `sized` draws at a largest radius `rsMax`: the ONE call the kernel and the
 *  `hub-spoke-sized-floor` lint both make, so the lint counts exactly the clamped discs. */
const sizedDiscs = (nums, rsMax) => sizeRadii(nums, rsMax, sizeFloor(rsMax));

// ── The crowding envelope ─────────────────────────────────────────────────────
function envelopeRow(n, stage = 'landscape') {
  const rows = ENVELOPE[stage === 'landscape' ? 'landscape' : 'tall'];
  return rows.find((r) => n <= r[0]) || rows[rows.length - 1];
}
function nameEnvelope(n, stage = 'landscape') {
  return envelopeRow(n, stage)[1];
}
/** Every row the drawn labels print: name lines (19 characters each), value, status. */
function labelLoad(spokes) {
  return spokes.reduce((a, s) => a + Math.max(1, Math.ceil([...s.label].length / 19)) + (s.value ? 1 : 0) + (s.status ? 1 : 0), 0);
}

// ── Lint ─────────────────────────────────────────────────────────────────────
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(6))));

/**
 * Every hub-spoke finding for one slide's model. Each finding is
 * `{ rule, severity, message, fix, line? }`; `line` is the authored line when one
 * item is to blame. Rule ids are flat kebab-case (`hub-spoke-crowded`).
 */
function lintModel(model, opts = {}) {
  const { hand = false, stage = 'landscape' } = opts;
  const out = [];
  const add = (rule, severity, message, fix, line) => out.push({ rule, severity, message, fix, ...(line ? { line } : {}) });
  const { mods, hub } = model;
  const sp = model.spokes;

  if (!model.spokesAll.length) {
    add('hub-spoke-empty', 'warning', 'hub-spoke draws nothing: the hub item has no nested satellites.',
      'Nest the satellites under the one hub item: `- Hub` then `  - Satellite`.', hub.line);
    return out;
  }
  for (const x of model.extraTop) {
    add('hub-spoke-extra-hub', 'warning', `hub-spoke draws ONE hub; the second top-level item "${x.label}" is not drawn.`,
      'Nest it under the hub as a satellite, or give it its own slide.', x.line);
  }
  if (hub.status) {
    add('hub-spoke-hub-status', 'warning', `the hub's status \`${hub.status}\` is not drawn — status marks a spoke, and the hub is the whole.`,
      'Move the status to the satellite it is about, or say it in the heading.', hub.line);
  }
  const n = model.spokesAll.length;
  if (n < 2) {
    add('hub-spoke-too-few', 'warning', `hub-spoke with ${n} satellite reads as a caption, not a structure.`,
      'Use big-number or a split panel for one relationship; a hub needs two or more spokes.', hub.line);
  }
  if (!mods.tiered && n > LIMITS.satellites) {
    add('hub-spoke-too-many', 'warning', `${n} satellites; the first ${LIMITS.satellites} are drawn and the rest are dropped.`,
      'Group the tail into one "Other" satellite, or use `tiered` to nest them under branches.', hub.line);
  }
  if (mods.tiered) {
    if (n > LIMITS.branches) {
      add('hub-spoke-tiered-branches', 'warning', `${n} branches; \`tiered\` draws the first ${LIMITS.branches}.`,
        'Merge branches until there are six or fewer.', hub.line);
    }
    const leaves = model.spokesAll.reduce((a, s) => a + s.leavesAll.length, 0);
    if (leaves > LIMITS.leaves) {
      add('hub-spoke-tiered-leaves', 'warning', `${leaves} leaves; \`tiered\` draws the first ${LIMITS.leaves} and drops the rest.`,
        'Cut the leaves to eighteen or fewer, or split the slide by branch.', hub.line);
    }
    if (mods.sized || mods.flow) {
      add('hub-spoke-tiered-channel', 'warning', '`tiered` prints values but does not scale them — `sized` / `flow-*` weight is off (a flow class still draws arrowheads).',
        'Drop `sized`, or flatten the figure to one tier to size it.', hub.line);
    }
  }
  if (mods.flowClasses.length > 1) {
    add('hub-spoke-two-flows', 'warning', `the slide carries ${mods.flowClasses.join(' and ')}; only \`${mods.flowClasses[0]}\` applies.`,
      'Keep one flow class; mark the exceptions with a per-spoke `flow:` pill.', hub.line);
  }
  if (mods.sized && mods.flow && !mods.tiered) {
    add('hub-spoke-two-channels', 'warning', '`sized` and a `flow-*` class both ask to scale; one slide shows magnitude one way, so connector weight wins and `sized` is off.',
      'Keep `flow-*` when the value moves along the spoke, `sized` when it belongs to the satellite.', hub.line);
  }

  // The pill grammar's refusals, per item.
  const items = [hub, ...sp, ...sp.flatMap((s) => s.leaves || [])];
  for (const it of items) {
    for (const is of it.issues) {
      if (is.kind === 'extra-value') {
        add('hub-spoke-extra-value', 'warning', `"${it.label}" carries a second value \`${is.pill}\`; a spoke prints one value, so it is dropped.`,
          'Keep one value pill per satellite; put the other figure in its detail sublist.', it.line);
      } else if (is.kind === 'numeric-group') {
        add('hub-spoke-numeric-group', 'warning', `\`${is.pill}\` on "${it.label}" looks like a figure but is not a value the chart can read, so it is dropped (a group name starts with a letter: \`Wave 1\`, \`Q3\`).`,
          'Write the value plainly (`$18M`, `1.2M`, `62%`), or start the group name with a word.', it.line);
      } else if (is.kind === 'extra-status') {
        add('hub-spoke-extra-status', 'warning', `"${it.label}" carries a second status \`${is.pill}\`; a spoke shows one state, so only \`${it.status}\` is drawn.`,
          `Keep the one status that matters now; if \`${is.pill}\` names a group, rename it — ${['live', 'pilot', 'done', 'decision'].join(', ')} are statuses.`, it.line);
      } else if (is.kind === 'extra-group') {
        add('hub-spoke-extra-group', 'warning', `"${it.label}" carries a second group \`${is.pill}\`; a satellite belongs to one group.`,
          'Keep one group pill per satellite.', it.line);
      }
    }
  }
  // Every satellite carries a non-alarm status: likely categories written as statuses.
  const statuses = sp.map((s) => s.status);
  if (sp.length >= 3 && statuses.every((s) => s && !ALARM.has(s)) && new Set(statuses).size >= 2 && !groupsOf(model).length) {
    add('hub-spoke-status-group', 'warning', `every satellite carries a status (${[...new Set(statuses)].join(', ')}); statuses paint state colors, not groups.`,
      'If these are categories, name them with words that are not statuses so they read as groups with a key.', hub.line);
  }

  const groups = groupsOf(model);
  // A status word standing where the other spokes carry a group: the author most likely
  // meant a group (`Live` beside `Planned`), and the spoke instead paints a state and
  // joins no group, so the key and the picture disagree with the list.
  if (!mods.tiered && groups.length) {
    for (const s of sp) {
      if (!s.status || s.group) continue;
      add('hub-spoke-status-group', 'warning', `\`${s.status}\` on "${s.label}" is a status word, not a group: this spoke paints a state color and joins no group, while the others carry groups (${groups.join(', ')}).`,
        `If \`${s.status}\` names a group, rename it so it is not a status word (${['live', 'pilot', 'done', 'decision'].join(', ')} are statuses); if it is a state, give "${s.label}" its group as well.`, s.line);
    }
  }
  if (groups.length > LIMITS.groups) {
    add('hub-spoke-too-many-groups', 'warning', `${groups.length} groups exceed the ${LIMITS.groups}-hue cap, so the satellites stay neutral and no key is drawn.`,
      'Merge groups until there are six or fewer.', hub.line);
  }

  // Values and the channel.
  const withVal = sp.filter((s) => s.value);
  const C = channelOf(model);
  const asked = !mods.tiered && (mods.sized || mods.flow);
  const what = mods.flow ? `\`flow-${mods.flow}\` weight` : '`sized`';
  if (withVal.length && withVal.length < sp.length) {
    const missing = sp.length - withVal.length;
    add('hub-spoke-missing-value', 'warning',
      asked
        ? `${missing} of ${sp.length} satellites have no value, so ${what} is off (the values that are there still print).`
        : `${missing} of ${sp.length} satellites have no value, so the figure prints numbers on some spokes and not others.`,
      'Give every satellite a value, or none.', hub.line);
  } else if (asked && !withVal.length) {
    add('hub-spoke-missing-value', 'warning', `${what} is on but no satellite carries a value, so nothing scales.`,
      'Add one value pill per satellite, or drop the modifier.', hub.line);
  }
  if (asked && C.why === 'nonpositive') {
    const bad = sp.filter((s) => s.value && !(s.num > 0));
    add('hub-spoke-nonpositive-value', 'warning', `${bad.map((s) => `"${s.label}" \`${s.value}\``).join(', ')} ${bad.length === 1 ? 'is' : 'are'} zero or negative, which no area or weight can show, so ${what} is off.`,
      'Size only positive quantities; show a change or a deficit with a bar or a waterfall.', hub.line);
  }
  const units = [...new Set(withVal.map((s) => s.unit))];
  if (asked && units.length > 1) {
    add('hub-spoke-mixed-units', 'warning', `satellite values mix units (${units.map((u) => (u ? `\`${u}\`` : 'plain numbers')).join(', ')}), so ${what} is off.`,
      'Put every value in one unit — `$18M` beside `$900k` is fine, `$18M` beside `12%` is not.', hub.line);
  }
  if (mods.sized && !mods.flow && !mods.tiered && sp.length > LIMITS.sized) {
    add('hub-spoke-sized-many', 'warning', `\`sized\` compares areas across ${sp.length} satellites; past ${LIMITS.sized} the eye cannot rank them, so sizing is off.`,
      'Use `bar` for a ranking, or `stacked-bar` for a share; keep hub-spoke for the structure.', hub.line);
  }
  if (C.channel === 'size') {
    const clamped = sizedDiscs(sp.map((s) => s.num), sizedRadiusMax(sp.length)).filter((x) => x.clamped).length;
    if (clamped > 1) {
      add('hub-spoke-sized-floor', 'warning', `${clamped} satellites are too small to draw to scale and sit at the minimum size, so their areas no longer compare.`,
        'Print the share (`12%`) as the value, or use `bar` when the small values matter.', hub.line);
    }
  }
  if (C.channel === 'flow') {
    const nums = sp.map((s) => s.num);
    for (let i = 0; i < sp.length; i++) {
      for (let j = i + 1; j < sp.length; j++) {
        const hi = Math.max(nums[i], nums[j]);
        const lo = Math.min(nums[i], nums[j]);
        if (C.flowCls[i] !== C.flowCls[j] && lo >= hi * (1 - STEP_SPLIT_WARN)) {
          add('hub-spoke-flow-step', 'warning', `"${sp[i].label}" (${sp[i].value}) and "${sp[j].label}" (${sp[j].value}) are within ${Math.round(STEP_SPLIT_WARN * 100)}% of each other but draw a weight step apart.`,
            'Check the values; if they are meant to read as equal, round them to the same figure.', hub.line);
          i = sp.length; break;
        }
      }
    }
  }
  // The sum check: a satellite total ABOVE the hub is a contradiction; a total below it
  // is a subset (the "top five partners" slide) and is fine.
  if (hub.value && !mods.tiered && withVal.length === sp.length && sp.length && units.length === 1 && units[0] === hub.unit && hub.num > 0) {
    const counts = (s) => {
      const d = directionOf(s, mods);
      if (mods.flow === 'out' && d === 'in') return false;
      if (mods.flow === 'in' && d === 'out') return false;
      return true;
    };
    const sum = sp.filter(counts).reduce((a, s) => a + s.num, 0);
    if (sum > hub.num * 1.005) {
      add('hub-spoke-sum', 'warning', `the satellites add up to ${fmt(sum)}, more than the hub's ${hub.value} (${fmt(hub.num)}).`,
        'Check the figures: spokes that are parts of the hub cannot exceed it.', hub.line);
    }
  }

  // Fit: the hub's text, and the crowding envelope.
  const ceiling = hubCeiling(sp.length || 1, { tiered: mods.tiered, sized: C.channel === 'size', stage });
  const ht = fitHubText(hub.label, hub.value, ceiling, { hand });
  if (ht.overflow) {
    add('hub-spoke-hub-overflow', 'error', `the hub text "${hub.label}${hub.value ? ` ${hub.value}` : ''}" does not fit the hub at the smallest type, so its last line is cut short.`,
      `Shorten the hub name (about ${LIMITS.hubName} characters) or its value (about ${LIMITS.hubValue}); say the rest in the heading.`, hub.line);
  }
  for (const f of crowding(model, stage, { hand })) add('hub-spoke-crowded', 'warning', f, 'Shorten the names, drop a pill, or cut a spoke; put the long form in a detail sublist. On a portrait deck the figure is narrower, so the limits are lower.', hub.line);
  return out;
}

/**
 * Why a slide sits outside the certified envelope, as sentences; empty when inside.
 * The unit fuzz holds the kernel to exactly this predicate.
 */
function crowding(model, stage = 'landscape', { hand = false } = {}) {
  const out = [];
  const sp = model.spokes;
  const tall = stage !== 'landscape';
  if (model.mods.tiered) {
    const leaves = sp.flatMap((s) => s.leaves);
    const leafMax = tall ? TALL_TIER.name : LEAF_NAME_ENVELOPE;
    const branchMax = tall ? TALL_TIER.name : BRANCH_NAME_ENVELOPE;
    const longLeaf = leaves.filter((l) => [...l.label].length > leafMax).length;
    const longBranch = sp.filter((b) => [...b.label].length > branchMax).length;
    if (longLeaf) out.push(`${longLeaf} leaf name${longLeaf > 1 ? 's run' : ' runs'} past ${leafMax} characters, outside what the tiered layout is proven to place cleanly.`);
    if (longBranch) out.push(`${longBranch} branch name${longBranch > 1 ? 's run' : ' runs'} past ${branchMax} characters, outside what the tiered layout is proven to place cleanly.`);
    const wideCap = (WIDE_TIER.find((r) => sp.length <= r[0]) || WIDE_TIER[WIDE_TIER.length - 1])[1];
    if (!tall && leaves.length > wideCap) {
      out.push(`\`tiered\` with ${sp.length} branch${sp.length === 1 ? '' : 'es'} is proven clean up to ${wideCap} leaves; this slide draws ${leaves.length}, so some labels or discs may touch.`);
    }
    if (stage === 'square' && model.mods.flow === 'both' && sp.some((b) => b.alarm)) {
      const ht = fitHubText(model.hub.label, model.hub.value, hubCeiling(sp.length, { tiered: true, stage }), { hand });
      if (ht.r > SQUARE_TIER_BOTH_HUB) {
        out.push('on a square deck, `tiered flow-both` with a flagged branch is proven clean only with a shorter hub name: the arrowheads and halos leave the twigs no room.');
      }
    }
    if (tall && (sp.length > TALL_TIER.branches || leaves.length > TALL_TIER.leaves)) {
      out.push(`on a portrait or square deck, \`tiered\` is proven clean up to ${TALL_TIER.branches} branches and ${TALL_TIER.leaves} leaves; this slide has ${sp.length} and ${leaves.length}.`);
    }
    return out;
  }
  const [, nameMax, loadMax] = envelopeRow(sp.length, stage);
  const long = sp.filter((s) => [...s.label].length > nameMax).length;
  if (long) out.push(`${long} satellite name${long > 1 ? 's run' : ' runs'} past ${nameMax} characters at ${sp.length} spokes, outside what the layout is proven to place cleanly (labels may fall back to a column).`);
  const load = labelLoad(sp);
  if (load > loadMax) out.push(`the labels print ${load} rows at ${sp.length} spokes (name lines, values, statuses), past the ${loadMax} the layout is proven to place cleanly.`);
  return out;
}

// ── Markdown tree (the linter's and the narrator's reading of the list) ─────────
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };

/**
 * A satellite's Markdown name as the kernel will print it — the text `plainText` reads
 * off the rendered HTML. Emphasis markers go, but an INTRAWORD underscore stays
 * (`snake_case_name` renders literally in CommonMark), links keep their text, inline
 * code keeps its content, and a backslash escape keeps the escaped character.
 */
function plainLabel(md) {
  return String(md == null ? '' : md)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '$1')
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}_])/gu, '$1$2')
    .replace(/~~([\s\S]*?)~~/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!~|])/g, '$1')
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (_m, k) => ENTITIES[k])
    .trim();
}

/**
 * The slide's first list, read by the SHARED list reader (`first-list-tree.js`, the one
 * chart-narration uses), as the model's tree. Each node:
 * `{ label, pills, children, line, raw }` — `label` with trailing inline-code pills
 * stripped (the kernel's `stripTrailingPills` rule) and emphasis resolved, `line` the
 * trimmed source line, `raw` the reader's own node. Returns the reader's `consumed`
 * line set too, for the narrator.
 */
function readListTree(md) {
  const src = String(md || '');
  const lines = src.split('\n');
  const { roots, consumed } = firstListTree(src);
  const toNode = (n) => {
    const { lead, pills } = trailingPills(n.text);
    return { label: plainLabel(lead), pills, children: n.children.map(toNode), line: lines[n.line].trim(), raw: n };
  };
  return { tree: roots.map(toNode), roots, consumed };
}

/** The linter's entry: just the tree. */
function markdownTree(md) {
  return readListTree(md).tree;
}

module.exports = {
  LIMITS, NAME_ENVELOPE, LEAF_NAME_ENVELOPE, FLOW_CLASSES, MODIFIERS, ALARM, FLOW_STEPS, TIE_TOLERANCE,
  HUB_RATIO_MIN, HUB_RATIO_MAX, LADDER, STAGE_H, TIER_BRANCH_R,
  textWidth, wrapText, isWide, fitHubText, hubCeiling, ladderFor,
  modifiersOf, readPills, buildModel, groupsOf, channelOf, flowClasses, directionOf,
  sizeRadii, sizeFloor, nameEnvelope, envelopeRow, labelLoad, crowding, ENVELOPE, TALL_TIER, WIDE_TIER_LEAVES, WIDE_TIER,
  BRANCH_NAME_ENVELOPE, lintModel, markdownTree, readListTree, plainLabel, spokenStatus,
  SIZED_BOOST, sizedRadiusMax, sizedDiscs, LOOKS_NUMERIC,
};
