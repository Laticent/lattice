/**
 * hub-spoke-grammar — the GRAMMAR half of `hub-spoke-model.js`: how a `hub-spoke` slide's
 * first list reads as a hub, satellites and pills, and which magnitude channel it asks for.
 * No text estimate, no fit, no lint.
 *
 * ── WHY IT IS ITS OWN FILE ────────────────────────────────────────────────────
 *
 * It is still ONE reading (HARD RULE #1, #7): `hub-spoke-model.js` requires this file and
 * re-exports every name in it, so the kernel and the linter reach the grammar through the
 * model exactly as before. The split exists for the voice (`lib/core/chart-narration.js`),
 * which asks only what the slide SAYS. The docs site bundles the narrator into
 * `read-along-core.generated.js` on the Studio's eager path, and esbuild bundles a CommonJS
 * module whole, so requiring the full model there shipped the text estimate, the hub fit,
 * the crowding envelope and every lint to a reader that calls none of them.
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
const { chartStatus } = require('./chart-status');
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
  LIMITS, FLOW_CLASSES, MODIFIERS, ALARM, FLOW_STEPS, TIE_TOLERANCE, LOOKS_NUMERIC, modifiersOf, readPills, buildModel, groupsOf, channelOf, flowClasses, directionOf, plainLabel, readListTree, markdownTree,
};
