
/**
 * Agent cards — one validated source, one rendered layout.
 *
 * An agent that reports to the owner (the 🚦 pre-merge, 📋 standup, 🎯
 * continuation and ❓ decision cards, the 🛰️ fleet board, and a desk's 📶
 * completion meter) writes a small YAML file instead of hand-wrapping text.
 * `validateCard` checks it against a JSON Schema plus the
 * consistency rules in `engineering/workflow.md` §One layout for all four cards,
 * and `renderCard` prints the card: 38 columns, label line above value line,
 * CAPS on the critical value, fenced. The layout is correct by construction, so
 * nothing downstream has to lint it. The fleet board is the one exception to
 * "one fence": it prints several fenced cards, each with a link row under it,
 * because a link inside a fence cannot be clicked (workflow.md §🛰️ Fleet board).
 *
 * Lives in `tools/`, not `lib/`: `ajv` is a devDependency and `lib/` ships to every
 * consumer (HARD RULE-backed ownership gate). Pure and fs-free: the CLI
 * (`tools/card.js`) reads the YAML and calls this. Contract: `engineering/workflow.md`.
 */

const Ajv = require('ajv');
const { growthLines, KINDS } = require('./pr-growth');

const WIDTH = 38;
const MAX_FIELD_LINES = 2;
const MAX_NESTED_LINES = 3;

// One non-empty line: a block scalar or a blank value would print mangled.
const str = { type: 'string', pattern: '^[^\\r\\n]*\\S[^\\r\\n]*$' };

// The fleet board's loudness scale, loudest first (workflow.md §🛰️ Fleet board).
const FLEET_LEVELS = [
  { name: 'needs-you', icon: '🔴' },
  { name: 'at-risk', icon: '🟠' },
  { name: 'moving', icon: '🟢' },
  { name: 'review', icon: '🔵' },
  { name: 'done', icon: '✅' },
];
const FLEET_LEVEL_NAMES = FLEET_LEVELS.map((l) => l.name);
const fleetIcon = (level) => FLEET_LEVELS.find((l) => l.name === level).icon;
const fleetRank = (level) => FLEET_LEVEL_NAMES.indexOf(level);
/**
 * A line of work is as loud as its loudest session, child sessions included,
 * so a 🔴 child is never hidden under a ✅ or 🟢 parent.
 */
const fleetLoudest = (x) => Math.min(fleetRank(x.level), ...(x.children || []).map((k) => fleetRank(k.level)));
const REPO_URL = 'https://github.com/Laticent/lattice';

/**
 * Completion-meter stages (workflow.md §Desks, "Completion meter"). Weights are
 * in hundredths so the sum stays an integer and the percent never drifts with
 * float error. The first two belong to an item with no PR; the rest are read
 * from the item's PR on GitHub. A closed PR counts 1 only when it is marked
 * `dropped` with a reason. `order` is the count line's order: most done first.
 */
const METER_STAGES = [
  { name: 'not-started', label: 'not started', weight: 0, pr: false, order: 7 },
  { name: 'working', label: 'working', weight: 25, pr: false, order: 5 },
  { name: 'pr-open', label: 'PR open', weight: 50, pr: true, order: 4 },
  { name: 'green', label: 'green', weight: 75, pr: true, order: 3 },
  { name: 'queued', label: 'queued', weight: 90, pr: true, order: 2 },
  { name: 'merged', label: 'merged', weight: 100, pr: true, order: 0 },
  { name: 'closed', label: 'closed', weight: 0, pr: true, order: 8 },
];
const meterStage = (name) => METER_STAGES.find((s) => s.name === name);
const day = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const ledgerId = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,11}$' };
const METER_SCHEMA = {
  type: 'object',
  required: ['today', 'items'],
  additionalProperties: false,
  properties: {
    today: day,
    previous: {
      type: 'object',
      required: ['date', 'percent', 'ids'],
      additionalProperties: false,
      properties: {
        date: day,
        percent: { type: 'integer', minimum: 0, maximum: 100 },
        ids: { type: 'array', items: ledgerId },
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'stage'],
        additionalProperties: false,
        properties: {
          id: ledgerId,
          title: str,
          pr: { type: 'integer', minimum: 1 },
          stage: { enum: METER_STAGES.map((s) => s.name) },
          merged: day,
          dropped: str,
          blocking: { type: 'boolean' },
        },
      },
    },
  },
};

const SCHEMAS = {
  'pre-merge': {
    type: 'object',
    required: ['card', 'pr', 'pick', 'confidence', 'raise_it', 'raised', 'change', 'proof', 'risk'],
    additionalProperties: false,
    properties: {
      card: { const: 'pre-merge' },
      pr: { type: 'integer', minimum: 1 },
      title: str,
      ask: str,
      pick: {
        type: 'object',
        required: ['verdict', 'why'],
        additionalProperties: false,
        properties: { verdict: { enum: ['merge', 'hold'] }, why: str },
      },
      confidence: {
        type: 'object',
        required: ['level', 'limited_by', 'graded_by'],
        additionalProperties: false,
        properties: { level: { enum: ['low', 'medium', 'high', 'very high'] }, limited_by: str, graded_by: str },
      },
      raise_it: str,
      raised: str,
      change: {
        type: 'object',
        required: ['what', 'why'],
        additionalProperties: false,
        properties: { what: str, why: str, how: str },
      },
      proof: {
        type: 'object',
        required: ['ran'],
        additionalProperties: false,
        properties: { ran: str, read_by: str, not_run: str, gaps: str },
      },
      risk: {
        type: 'object',
        required: ['if_wrong', 'revert', 'left_behind'],
        additionalProperties: false,
        properties: { if_wrong: str, revert: str, left_behind: str },
      },
      // Filled by `npm run card` from git (tools/pr-growth.js), never typed by hand.
      growth: {
        type: 'object',
        required: ['base', 'rows'],
        properties: {
          base: { type: 'string' },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              required: ['kind', 'added', 'removed', 'files'],
              additionalProperties: false,
              properties: {
                kind: { enum: KINDS },
                added: { type: 'integer', minimum: 0 },
                removed: { type: 'integer', minimum: 0 },
                files: { type: 'integer', minimum: 0 },
              },
            },
          },
        },
      },
    },
  },
  standup: {
    type: 'object',
    required: ['card', 'pr', 'sha', 'state', 'thread'],
    additionalProperties: false,
    properties: {
      card: { const: 'standup' },
      pr: { type: 'integer', minimum: 1 },
      sha: { type: 'string', pattern: '^[0-9a-f]{7,40}$' },
      state: str,
      thread: {
        type: 'object',
        required: ['swimlane', 'card', 'branch', 'completed', 'on_deck'],
        additionalProperties: false,
        properties: {
          swimlane: str,
          card: str,
          branch: str,
          completed: str,
          on_deck: str,
          notes: str,
        },
      },
    },
  },
  continuation: {
    type: 'object',
    required: ['card', 'swimlane', 'context', 'priorities'],
    additionalProperties: false,
    properties: {
      card: { const: 'continuation' },
      swimlane: str,
      ask: str,
      first: str,
      agents: { type: 'integer', minimum: 1, maximum: 8 },
      context: {
        type: 'object',
        required: ['shipped', 'read_first', 'state'],
        additionalProperties: false,
        properties: { swimlane: str, shipped: str, read_first: str, state: str, decisions: str },
      },
      priorities: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['title', 'why', 'where', 'done_when', 'evidence', 'verify'],
          additionalProperties: false,
          properties: {
            title: str,
            ref: str,
            why: str,
            where: str,
            done_when: str,
            evidence: str,
            verify: str,
          },
        },
      },
    },
  },
  decision: {
    type: 'object',
    required: ['card', 'subject'],
    additionalProperties: false,
    properties: {
      card: { const: 'decision' },
      subject: str,
      merge: str,
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['question', 'why', 'options', 'pick', 'pick_why', 'default'],
          additionalProperties: false,
          properties: {
            question: str,
            why: str,
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 3,
              items: {
                type: 'object',
                required: ['label', 'gains', 'costs', 'next'],
                additionalProperties: false,
                properties: { label: str, gains: str, costs: str, next: str },
              },
            },
            pick: { enum: ['A', 'B', 'C'] },
            pick_why: str,
            default: str,
            ref: str,
          },
        },
      },
      defaults: {
        type: 'array',
        items: {
          type: 'object',
          required: ['question', 'default'],
          additionalProperties: false,
          properties: { question: str, default: str, change: str },
        },
      },
      vetoes: { type: 'array', items: str },
      questions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['question', 'yes', 'no'],
          additionalProperties: false,
          properties: { question: str, yes: str, no: str },
        },
      },
    },
  },
  fleet: {
    type: 'object',
    required: ['card', 'as_of', 'items'],
    additionalProperties: false,
    properties: {
      card: { const: 'fleet' },
      as_of: str,
      scope: str,
      spend: str,
      hindsight: str,
      insight: str,
      foresight: str,
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['level', 'title', 'state'],
          additionalProperties: false,
          properties: {
            level: { enum: FLEET_LEVEL_NAMES },
            title: str,
            pr: { type: 'integer', minimum: 1 },
            session: { type: 'string', pattern: '^session_[A-Za-z0-9]+$' },
            build: { type: 'string', pattern: '^https://\\S+$' },
            state: str,
            needs: str,
            why: str,
            meter: METER_SCHEMA,
            children: {
              type: 'array',
              items: {
                type: 'object',
                required: ['level', 'title', 'state'],
                additionalProperties: false,
                properties: {
                  level: { enum: FLEET_LEVEL_NAMES },
                  title: str,
                  pr: { type: 'integer', minimum: 1 },
                  session: { type: 'string', pattern: '^session_[A-Za-z0-9]+$' },
                  build: { type: 'string', pattern: '^https://\\S+$' },
                  state: str,
                  needs: str,
                },
              },
            },
          },
        },
      },
      actions: { type: 'array', items: str },
    },
  },
  meter: {
    type: 'object',
    required: ['card', 'title', 'meter'],
    additionalProperties: false,
    properties: {
      card: { const: 'meter' },
      title: str,
      meter: METER_SCHEMA,
    },
  },
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = Object.fromEntries(
  Object.entries(SCHEMAS).map(([name, schema]) => [name, ajv.compile(schema)]),
);

/** East Asian wide and full-width characters take two columns, like emoji. */
const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/u;

/** Display columns of a string: emoji take two, a variation selector none. */
function displayWidth(text) {
  let n = 0;
  for (const ch of text) {
    if (ch === '️') continue;
    n += WIDE.test(ch) || /\p{Extended_Pictographic}/u.test(ch) ? 2 : 1;
  }
  return n;
}

/** Split `word` so the head fits in `room` columns, preferring a / - _ . boundary. */
function breakWord(word, room) {
  let cut = 0;
  let used = 0;
  for (const ch of word) {
    const w = displayWidth(ch);
    if (used + w > room) break;
    used += w;
    cut += ch.length;
  }
  const head = word.slice(0, cut);
  const boundary = head.search(/[/\-_.][^/\-_.]*$/);
  if (boundary > 0) cut = boundary + 1;
  if (cut === 0) cut = Math.max(1, [...word][0].length);
  return [word.slice(0, cut), word.slice(cut)];
}

/**
 * Greedy word wrap. A word wider than a whole line (a path, a branch name) is
 * broken at the last / - _ . that fits, so nothing overflows the card.
 * Returns the lines, indent included.
 */
function wrap(text, firstIndent, restIndent) {
  const lines = [];
  let line = firstIndent;
  let empty = true;
  for (let word of String(text).trim().split(/\s+/)) {
    for (;;) {
      const candidate = empty ? line + word : `${line} ${word}`;
      if (displayWidth(candidate) <= WIDTH) {
        line = candidate;
        empty = false;
        break;
      }
      if (!empty && displayWidth(restIndent + word) <= WIDTH) {
        lines.push(line);
        line = restIndent + word;
        break;
      }
      // The word needs more than one line: fill what is left, carry the rest.
      const base = empty ? line : `${line} `;
      const room = WIDTH - displayWidth(base);
      if (!empty && room < 8) {
        lines.push(line);
        line = restIndent;
        empty = true;
        continue;
      }
      const [head, rest] = breakWord(word, room);
      lines.push(base + head);
      line = restIndent;
      empty = true;
      word = rest;
      if (!rest) break;
    }
  }
  if (!empty || !lines.length) lines.push(line);
  return lines;
}

/** Upper-case the first word: `merged, nothing needed` -> `MERGED, nothing needed`. */
function capFirstWord(text) {
  return String(text).replace(/^[A-Za-z]+/, (w) => w.toUpperCase());
}

// Template text left in: a bare <angle> token, "omit if none", a literal #N, or a value that is only TODO/TBD.
// `claude/<slug>` and `Map<String>` are real text, so an angle token must stand alone.
const PLACEHOLDER =
  /(^|\s)<[^<>\s][^<>]*>(?=[\s;,.)]|$)|\b(omit|leave out) if none\b|#N\b|^\s*(TODO|TBD)\s*$/i;

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

/** Schema errors, one readable line each, naming the field at fault. */
function schemaErrors(card) {
  if (!Object.hasOwn(SCHEMAS, card.card)) {
    return [`card: must be one of ${Object.keys(SCHEMAS).join(', ')}`];
  }
  const validate = validators[card.card];
  if (validate(card)) return [];
  return validate.errors.map((e) => {
    const at = e.instancePath || '(root)';
    if (e.keyword === 'additionalProperties') {
      return `${at} has an unknown field "${e.params.additionalProperty}"; check the spelling`;
    }
    if (e.keyword === 'enum') return `${at} must be one of: ${e.params.allowedValues.join(', ')}`;
    if (e.keyword === 'type' && e.params.type === 'string') {
      return `${at} must be text; put it in quotes so YAML keeps it as text`;
    }
    if (e.keyword === 'pattern' && e.params.pattern === str.pattern) {
      return `${at} must be one non-empty line (no line breaks, not blank)`;
    }
    if (e.keyword === 'pattern') return `${at} ${e.message}; put it in quotes`;
    return `${at} ${e.message}`;
  });
}

/** Accumulates lines and the problems found while laying them out. */
class Page {
  constructor() {
    this.lines = [];
    this.errors = [];
  }

  blank() {
    this.lines.push('');
  }

  raw(line, where) {
    if (displayWidth(line) > WIDTH) this.errors.push(`${where}: line is wider than ${WIDTH} columns`);
    this.lines.push(line);
  }

  section(name) {
    if (this.lines.length && this.lines[this.lines.length - 1] !== '') this.blank();
    this.lines.push(name);
  }

  /** A label line at `indent`, then the value wrapped one step in. */
  field(label, value, where, { indent = 2, maxLines = MAX_FIELD_LINES } = {}) {
    if (value === undefined || value === null || value === '') return;
    const pad = ' '.repeat(indent);
    const vpad = ' '.repeat(indent + 2);
    this.lines.push(pad + label);
    this.push(wrap(value, vpad, vpad), where, maxLines, label);
  }

  /** Wrapped lines from `wrap`, with the length and word-width checks. */
  push(lines, where, maxLines, label) {
    if (lines.length > maxLines) {
      this.errors.push(`${where}: "${label}" wraps to ${lines.length} lines (max ${maxLines}); split it into two fields`);
    }
    this.lines.push(...lines);
  }
}

function header(page, text, reply, field) {
  if (displayWidth(text) > WIDTH) {
    page.errors.push(
      `${field}: the header line is ${displayWidth(text)} columns (max ${WIDTH}); shorten ${field}`,
    );
  }
  page.lines.push(text);
  if (reply) page.lines.push(reply);
}

function renderPreMerge(d, page) {
  header(page, `🚦 Pre-merge — #${d.pr}${d.title ? ` ${d.title}` : ''}`, 'reply: merge | hold', 'title');
  page.blank();
  page.section('BOTTOM LINE');
  page.field('ask', d.ask || `squash-merge #${d.pr}?`, 'ask');
  page.field('pick', `${d.pick.verdict.toUpperCase()}: ${d.pick.why}`, 'pick');
  page.field(
    'confidence',
    `${d.confidence.level.toUpperCase()} · limited by: ${d.confidence.limited_by}`,
    'confidence',
  );
  page.field('graded by', d.confidence.graded_by, 'confidence.graded_by');
  // The maker does not grade its own card (workflow.md §Pre-merge card, "Who grades").
  if (/^\s*(self|maker|me|myself|the maker|this session|nobody|none)\s*([,.;:(]|$)/i.test(d.confidence.graded_by)) {
    page.errors.push('confidence.graded_by: the maker cannot grade its own card; name the checker that did');
  }
  page.field('raise it', d.raise_it, 'raise_it');
  if (/^\s*(nothing|none|n\/a)\b/i.test(d.raise_it) && d.proof.not_run) {
    page.errors.push('raise_it: says nothing is left to raise but proof.not_run is not empty');
  }
  page.field('raised', d.raised, 'raised');
  // Below VERY HIGH the raise loop must have run before the ask (workflow.md §The raise loop).
  if (d.confidence.level !== 'very high' && /^\s*(none|nothing|no\b|n\/a|0 rounds?|zero|not (attempted|tried|run)|did not run|skipped)/i.test(d.raised)) {
    page.errors.push('raised: the card is below VERY HIGH, so the raise loop must run before the ask; list the rounds and what stopped them');
  }
  page.section('CHANGE');
  page.field('what', d.change.what, 'change.what');
  page.field('why', d.change.why, 'change.why');
  page.field('how', d.change.how, 'change.how');
  page.section('PROOF');
  page.field('ran', d.proof.ran, 'proof.ran');
  page.field('read by', d.proof.read_by, 'proof.read_by');
  page.field('not run', d.proof.not_run, 'proof.not_run');
  page.field('gaps', d.proof.gaps, 'proof.gaps');
  page.section('RISK');
  page.field('if wrong', d.risk.if_wrong, 'risk.if_wrong');
  page.field('revert', d.risk.revert, 'risk.revert');
  page.field('left behind', d.risk.left_behind, 'risk.left_behind');
  if (d.growth) {
    // The base as given: `main` and `origin/main` can differ by a stale local branch.
    page.section(`GROWTH — vs ${d.growth.base}, from git`);
    for (const line of growthLines(d.growth)) page.raw(line, 'growth');
  }
}

function renderStandup(d, page) {
  header(page, `📋 Standup — merged #${d.pr} (${d.sha})`, null, 'pr/sha');
  page.blank();
  page.section('BOTTOM LINE');
  page.field('state', capFirstWord(d.state), 'state');
  page.section('THREAD');
  page.field('swimlane', d.thread.swimlane, 'thread.swimlane');
  page.field('card', d.thread.card, 'thread.card');
  page.field('branch', d.thread.branch, 'thread.branch');
  page.field('completed', d.thread.completed, 'thread.completed');
  page.field('on deck', d.thread.on_deck, 'thread.on_deck');
  page.field('notes', d.thread.notes, 'thread.notes');
}

function standingOrders(agents) {
  return [
    'I am away. Decide and proceed; a safe default beats a question.',
    'Gates are the floor. Look at visual work before handing it back.',
    "One branch claude/<slug>, one PR, one commit per priority (#13). Push only to your own branch; read another session's, never push to it (#31). Docs and changelog ride in the same commit (#10, #6).",
    "Attach each item's evidence in the PR body. If a surface cannot be reached, write UNVERIFIED (#23).",
    `Up to ${agents} agents are pre-approved. More needs the owner's OK.`,
    'Run the gates before each push. Rebase only on a real conflict (#16).',
    'If an item is blocked, finish the rest and say why in the PR body. Never ship a break you made (#18).',
    'STOP at the merge gate: green, no conflict, cards posted. Do not merge (#7).',
  ];
}

function renderContinuation(d, page) {
  header(page, `🎯 Continuation — ${d.swimlane}`, 'paste into a new session', 'swimlane');
  page.blank();
  const first = d.priorities[0];
  page.section('BOTTOM LINE');
  page.field(
    'ask',
    d.ask || `work P1 to P${d.priorities.length} top-down, one PR, one commit each`,
    'ask',
  );
  page.field('first', d.first || `P1: ${first.title}`, 'first');
  page.section('CONTEXT');
  page.field('swimlane', d.context.swimlane || d.swimlane, 'context.swimlane');
  page.field('shipped', d.context.shipped, 'context.shipped');
  page.field('read first', d.context.read_first, 'context.read_first');
  page.field('state', d.context.state, 'context.state');
  page.field('decisions', d.context.decisions || 'none', 'context.decisions');
  page.section('PRIORITIES — in this order');
  d.priorities.forEach((p, i) => {
    const id = `P${i + 1}`;
    const where = `priorities[${i}]`;
    page.push(wrap(`${id} · ${p.title}`, '  ', '       '), where, MAX_FIELD_LINES + 1, 'title');
    page.field('ref', p.ref, `${where}.ref`, { indent: 4 });
    page.field('why', p.why, `${where}.why`, { indent: 4 });
    page.field('where', p.where, `${where}.where`, { indent: 4 });
    page.field('done when', p.done_when, `${where}.done_when`, { indent: 4 });
    page.field('evidence', p.evidence, `${where}.evidence`, { indent: 4 });
    page.field('verify', p.verify, `${where}.verify`, { indent: 4 });
  });
  page.section('STANDING ORDERS');
  for (const order of standingOrders(d.agents || 8)) {
    page.push(wrap(`• ${order}`, '  ', '    '), 'standing orders', 6, order.slice(0, 20));
  }
  page.section('DELIVERABLE');
  page.push(
    wrap(
      'one green, conflict-free PR waiting for review, evidence under each item',
      '  ',
      '  ',
    ),
    'deliverable',
    3,
    'deliverable',
  );
}

function replyHint(d) {
  const parts = [];
  const dec = (d.decisions || [])[0];
  if (dec) parts.push(`D1 ${dec.pick}`);
  if ((d.defaults || []).length) parts.push('W1 keep');
  if ((d.questions || []).length) parts.push('Q1 yes');
  if (!parts.length) parts.push('V1 undo');
  return `reply: "${parts.join(', ')}"`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function renderDecision(d, page) {
  const decisions = d.decisions || [];
  const defaults = d.defaults || [];
  const vetoes = d.vetoes || [];
  const questions = d.questions || [];
  if (!(decisions.length + defaults.length + vetoes.length + questions.length)) {
    page.errors.push('decision card has no items: post nothing instead of an empty card');
    return;
  }
  header(page, `❓ Decisions — ${d.subject}`, replyHint(d), 'subject');
  page.blank();
  page.section('BOTTOM LINE');
  const counts = [
    decisions.length && plural(decisions.length, 'decision', 'decisions'),
    defaults.length && plural(defaults.length, 'default', 'defaults'),
    vetoes.length && `${vetoes.length} to veto`,
    questions.length && plural(questions.length, 'question', 'questions'),
  ].filter(Boolean);
  page.field('waiting', counts.join(', '), 'waiting');
  page.field(
    'ask',
    decisions.length ? 'ANSWER D1 first; the rest can wait' : 'nothing is blocked; answer when you can',
    'ask',
  );
  if (d.merge) page.field('merge', `${d.merge}, see the 🚦 card`, 'merge');

  if (decisions.length) page.section('NEED YOU — blocked until answered');
  decisions.forEach((dec, i) => {
    const where = `decisions[${i}]`;
    page.push(wrap(`D${i + 1} · ${dec.question}`, '  ', '       '), where, MAX_FIELD_LINES + 1, 'question');
    page.field('why', dec.why, `${where}.why`, { indent: 4 });
    dec.options.forEach((opt, j) => {
      const letter = 'ABC'[j];
      page.push(wrap(`${letter} — ${opt.label}`, '    ', '      '), `${where}.options[${j}]`, 2, 'label');
      for (const [key, label] of [['gains', 'gains'], ['costs', 'costs'], ['next', 'then']]) {
        page.push(
          wrap(`${label}: ${opt[key]}`, '      ', '        '),
          `${where}.options[${j}].${key}`,
          MAX_NESTED_LINES,
          key,
        );
      }
    });
    if (!'ABC'.slice(0, dec.options.length).includes(dec.pick)) {
      page.errors.push(`${where}.pick: "${dec.pick}" is not one of the options`);
    }
    page.field('pick', `${dec.pick}: ${dec.pick_why}`, `${where}.pick`, { indent: 4 });
    page.field('default', dec.default, `${where}.default`, { indent: 4 });
    page.field('ref', dec.ref, `${where}.ref`, { indent: 4 });
  });

  if (defaults.length) page.section('CAN WAIT — default picked');
  defaults.forEach((w, i) => {
    const where = `defaults[${i}]`;
    page.push(wrap(`W${i + 1} · ${w.question}`, '  ', '       '), where, MAX_FIELD_LINES + 1, 'question');
    page.field('default', w.default, `${where}.default`, { indent: 4 });
    page.field('reply', `keep, or "${w.change || 'change'}" to change it`, `${where}.reply`, { indent: 4 });
  });

  if (vetoes.length) page.section('TO VETO — tell me to undo any');
  vetoes.forEach((v, i) => {
    page.push(wrap(`V${i + 1} · ${v}`, '  ', '       '), `vetoes[${i}]`, MAX_FIELD_LINES + 1, 'veto');
  });

  if (questions.length) page.section('QUESTIONS — only you know');
  questions.forEach((q, i) => {
    const where = `questions[${i}]`;
    page.push(wrap(`Q${i + 1} · ${q.question}`, '  ', '       '), where, MAX_FIELD_LINES + 1, 'question');
    page.field('changes', `yes: ${q.yes}`, `${where}.yes`, { indent: 4 });
    page.lines.push(...wrap(`no: ${q.no}`, '      ', '      '));
  });
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-11-23` -> a whole UTC day number, or NaN for a date that does not exist. */
function dayNumber(text) {
  const [y, m, d] = text.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return NaN;
  return ms / DAY_MS;
}

/** A day as its weekday when it is within six days of today, else `Mon Dec 7`. */
function dayName(n, today) {
  const date = new Date(n * DAY_MS);
  const wd = WEEKDAYS[date.getUTCDay()];
  return Math.abs(n - today) <= 6 ? wd : `${wd} ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** The weight of one ledger item, in hundredths. */
const itemWeight = (x) => (x.stage === 'closed' && x.dropped ? 100 : meterStage(x.stage).weight);

/** Percent of `items` done, as an integer; a ledger that is neither empty nor finished never shows 0 or 100. */
function percentOf(items) {
  if (!items.length) return null;
  const sum = items.reduce((n, x) => n + itemWeight(x), 0);
  if (sum === 0) return 0;
  if (sum === items.length * 100) return 100;
  return Math.min(99, Math.max(1, Math.round(sum / items.length)));
}

/** Ten cells; full only at 100% and empty only at 0%, like the percent. */
function meterBar(percent) {
  if (percent === null) return '░'.repeat(10);
  let cells = Math.round(percent / 10);
  if (percent > 0 && percent < 100) cells = Math.min(9, Math.max(1, cells));
  return '▓'.repeat(cells) + '░'.repeat(10 - cells);
}

/**
 * The completion meter for one desk's ledger: a pure function of the ledger and
 * its `today`, so the same item states always give the same number. Returns the
 * problems found (`errors`) and everything the card prints. Contract:
 * engineering/workflow.md §Desks, "Completion meter".
 */
function computeMeter(m, where = 'meter') {
  const errors = [];
  const today = dayNumber(m.today);
  if (Number.isNaN(today)) errors.push(`${where}.today: "${m.today}" is not a real date`);
  const seen = new Set();
  m.items.forEach((x, i) => {
    const at = `${where}.items[${i}]`;
    const stage = meterStage(x.stage);
    if (seen.has(x.id)) errors.push(`${at}.id: "${x.id}" is used twice; ids must be unique`);
    seen.add(x.id);
    if (stage.pr && !x.pr) {
      errors.push(`${at}: stage "${x.stage}" belongs to a PR; add its pr number, or use not-started / working`);
    }
    if (!stage.pr && x.pr) {
      errors.push(`${at}: #${x.pr} exists, so its stage comes from GitHub (pr-open, green, queued, merged or closed), not "${x.stage}"`);
    }
    if (x.stage === 'merged' && !x.merged) errors.push(`${at}: a merged item needs its merged date (YYYY-MM-DD)`);
    if (x.stage !== 'merged' && x.merged) errors.push(`${at}: has a merged date but its stage is "${x.stage}"`);
    if (x.merged) {
      const n = dayNumber(x.merged);
      if (Number.isNaN(n)) errors.push(`${at}.merged: "${x.merged}" is not a real date`);
      else if (n > today) errors.push(`${at}.merged: ${x.merged} is after today (${m.today})`);
    }
    if (x.dropped && x.stage !== 'closed') {
      errors.push(`${at}: only a PR closed without merging can be dropped; its stage is "${x.stage}"`);
    }
    if (x.blocking && itemWeight(x) === 100) errors.push(`${at}: a finished item cannot be blocking`);
  });
  if (m.previous) {
    const prev = dayNumber(m.previous.date);
    if (Number.isNaN(prev)) errors.push(`${where}.previous.date: "${m.previous.date}" is not a real date`);
    else if (prev > today) errors.push(`${where}.previous.date: ${m.previous.date} is after today (${m.today})`);
  }
  if (errors.length) return { errors };

  const items = m.items;
  const percent = percentOf(items);
  // Most done first: merged, dropped, queued, green, PR open, working, not started, closed.
  const groups = [
    ...METER_STAGES.filter((s) => s.name !== 'closed').map((s) => [s.order, s.label, (x) => x.stage === s.name]),
    [1, 'dropped', (x) => x.stage === 'closed' && x.dropped],
    [8, 'closed', (x) => x.stage === 'closed' && !x.dropped],
  ];
  const counts = groups
    .sort((a, b) => a[0] - b[0])
    .map(([, label, match]) => [label, items.filter(match).length])
    .filter(([, n]) => n)
    .map(([label, n]) => `${n} ${label}`);

  // Scope: what changed since the previous report.
  let scope = [];
  if (m.previous) {
    const before = new Set(m.previous.ids);
    const added = items.filter((x) => !before.has(x.id)).length;
    const removed = m.previous.ids.filter((id) => !seen.has(id)).length;
    const prev = dayNumber(m.previous.date);
    const when = prev === today ? 'today' : prev === today - 1 ? 'since yesterday' : `since ${dayName(prev, today)}`;
    const grew = added ? `+${added} new ${when}` : null;
    const parts = [grew, removed ? `${removed} removed` : null];
    const was = m.previous.percent;
    if (percent !== null && percent < was) {
      // Scope growth alone explains the drop when the items the last report knew still score as well.
      const old = percentOf(items.filter((x) => before.has(x.id)));
      const byGrowth = grew && old !== null && old >= was;
      if (byGrowth) parts[0] = `down from ${was}%: ${grew}`;
      else parts.unshift(`down from ${was}%: an item went back a stage or left`);
    }
    scope = parts.filter(Boolean);
  }

  // Finish estimate: merges per day over the last two days of merge history.
  const remaining = items.filter((x) => itemWeight(x) < 100).length;
  const mergedDays = items.filter((x) => x.stage === 'merged').map((x) => dayNumber(x.merged));
  let estimate;
  if (!items.length) estimate = 'no estimate: the ledger is empty';
  else if (!remaining) estimate = 'all done';
  else if (!mergedDays.length) estimate = 'no estimate: no merges yet';
  else {
    const start = Math.max(today - 1, Math.min(...mergedDays));
    const days = today - start + 1;
    const merges = mergedDays.filter((n) => n >= start).length;
    if (!merges) estimate = 'no estimate: no merges in 2 days';
    else {
      const rate = merges / days;
      const finish = today + Math.ceil((remaining * days) / merges);
      const shown = Number.isInteger(rate) ? String(rate) : rate.toFixed(1);
      estimate = `~${shown} ${rate === 1 ? 'merge' : 'merges'}/day → done ${dayName(finish, today)}`;
    }
  }

  const blocking = items.filter((x) => x.blocking).map((x) => `${x.id} ${x.title}`);
  return {
    errors,
    percent,
    bar: `${meterBar(percent)} ${percent === null ? 'no items' : `${percent}%`}`,
    // The count line as parts: `9 items: 5 merged`, `1 queued`, … so a count never splits.
    summary: [`${items.length} ${items.length === 1 ? 'item' : 'items'}${counts.length ? `: ${counts[0]}` : ''}`, ...counts.slice(1)],
    scope,
    estimate,
    blocking: blocking.length ? blocking.join('; ') : null,
  };
}

/**
 * Pack ` · `-separated parts into lines, breaking only between parts, so a
 * count like `2 PR open` never splits. A line that breaks ends in ` ·`. A part
 * too wide for a line of its own falls back to the word wrap.
 */
function wrapParts(parts, firstIndent, restIndent) {
  const lines = [];
  let line = firstIndent;
  let empty = true;
  for (const part of parts) {
    const candidate = empty ? line + part : `${line} · ${part}`;
    if (displayWidth(candidate) <= WIDTH) {
      line = candidate;
      empty = false;
      continue;
    }
    if (!empty) lines.push(`${line} ·`);
    const words = wrap(part, empty ? line : restIndent, restIndent);
    line = words.pop();
    lines.push(...words);
    empty = false;
  }
  lines.push(line);
  return lines;
}

/** The meter's body lines under its header, each wrapped to the card width. */
function meterBody(page, r, where, indent = '   ') {
  const more = `${indent}  `;
  page.push(wrapParts(r.summary, indent, more), `${where}.items`, MAX_FIELD_LINES, 'items');
  page.push(wrapParts([...r.scope, r.estimate], indent, more), where, MAX_NESTED_LINES, 'scope');
  if (r.blocking) page.push(wrap(`blocking: ${r.blocking}`, indent, more), `${where}.blocking`, MAX_FIELD_LINES, 'blocking');
}

/** 📶 A desk's own meter report: the meter, then the ledger it was computed from. */
function renderMeter(d, page) {
  const r = computeMeter(d.meter);
  if (r.errors.length) {
    page.errors.push(...r.errors);
    return;
  }
  header(page, `${d.title}  ${r.bar}`, null, 'title');
  meterBody(page, r, 'meter');
  page.section('LEDGER');
  for (const x of d.meter.items) {
    const stage = x.stage === 'closed' && x.dropped ? `dropped: ${x.dropped}` : meterStage(x.stage).label;
    page.push(
      wrapParts([x.id, `${stage}${x.pr ? ` #${x.pr}` : ''}`, x.title], '  ', '    '),
      `meter.items[${x.id}]`,
      MAX_NESTED_LINES,
      'item',
    );
  }
}

/** The clickable link row printed under a fleet card, outside its fence. */
function fleetLinks(x) {
  const links = [];
  if (x.pr) links.push(`[Pull Request](${REPO_URL}/pull/${x.pr})`);
  if (x.session) links.push(`[Session](https://claude.ai/code/${x.session})`);
  if (x.build) links.push(`[Build](${x.build})`);
  return links.join(' | ');
}

const fleetName = (x) => `${fleetIcon(x.level)} ${x.title}${x.pr ? ` — #${x.pr}` : ''}`;

/**
 * 🛰️ Fleet board: one overview card, then one card per live line of work,
 * loudest first, each followed by its link row. `done` items fold into the
 * overview. Returns the blocks; the caller joins them.
 */
function renderFleet(d, page) {
  // A done parent with a live child stays live: the child still needs a card.
  const DONE = fleetRank('done');
  const live = d.items.filter((x) => fleetLoudest(x) !== DONE);
  const done = d.items.filter((x) => fleetLoudest(x) === DONE);
  const all = d.items.flatMap((x) => [x, ...(x.children || [])]);
  const counts = FLEET_LEVELS.map((l) => [l.icon, all.filter((x) => x.level === l.name).length])
    .filter(([, n]) => n)
    .map(([icon, n]) => `${icon} ${n}`)
    .join(' · ');
  const actions = d.actions || [];

  header(page, `🛰️ Fleet — ${d.as_of}`, actions.length ? 'reply: go A1 A2 … | hold' : null, 'as_of');
  page.blank();
  page.section('BOTTOM LINE');
  page.field('board', counts, 'items');
  const loud = all.filter((x) => x.level === 'needs-you').length;
  page.field('needs you', loud ? `${loud} — the 🔴 cards below` : 'NOTHING — no 🔴 card', 'items');
  page.field('scope', d.scope, 'scope');
  page.field('spend', d.spend, 'spend');
  if (d.hindsight || done.length) page.section('HINDSIGHT — since last board');
  // Every finished session, a child of a live line of work included, so the list
  // matches the ✅ count. A done parent that still has a live child keeps its card instead.
  const finished = all.filter((x) => x.level === 'done' && !live.includes(x));
  page.field('done', finished.map((x) => `${x.title}${x.pr ? ` #${x.pr}` : ''} ${x.state}`).join('; '), 'items[done]');
  page.field('notes', d.hindsight, 'hindsight');
  if (d.insight) page.section('INSIGHT — patterns');
  page.field('pattern', d.insight, 'insight');
  if (d.foresight) page.section('FORESIGHT — next');
  page.field('next', d.foresight, 'foresight');
  if (actions.length) page.section('ACTIONS — nothing runs until go');
  actions.forEach((a, i) => {
    page.field(`A${i + 1}`, a, `actions[${i}]`);
  });

  // Stable sort, loudest first, so a 🔴 never sits below a 🟢.
  const sorted = live
    .map((x, i) => ({ x, i }))
    .sort((a, b) => fleetLoudest(a.x) - fleetLoudest(b.x) || a.i - b.i)
    .map(({ x }) => x);
  page.blocks = [{ lines: page.lines }];
  for (const x of sorted) {
    const where = `items[${d.items.indexOf(x)}]`;
    if (x.level === 'needs-you' && !x.needs) {
      page.errors.push(`${where}: a needs-you card must say what it needs in "needs"`);
    }
    page.lines = [];
    // The header wears the loudest session's icon, so scanning headers for 🔴 finds every 🔴.
    header(page, `${FLEET_LEVELS[fleetLoudest(x)].icon}${fleetName(x).slice(fleetIcon(x.level).length)}`, null, `${where}.title`);
    page.blank();
    page.section('BOTTOM LINE');
    page.field('state', x.state, `${where}.state`);
    page.field('needs you', x.needs, `${where}.needs`);
    page.field('why', x.why, `${where}.why`);
    if (x.meter) {
      const r = computeMeter(x.meter, `${where}.meter`);
      page.errors.push(...r.errors);
      if (!r.errors.length) {
        page.section('METER');
        page.raw(`  ${r.bar}`, `${where}.meter`);
        meterBody(page, r, `${where}.meter`, '  ');
      }
    }
    const kids = x.children || [];
    if (kids.length) page.section('LINE OF WORK');
    kids.forEach((k, j) => {
      const at = `${where}.children[${j}]`;
      const name = `  ${fleetName(k)}`;
      if (displayWidth(name) > WIDTH) page.errors.push(`${at}.title: line is wider than ${WIDTH} columns`);
      page.lines.push(name);
      page.push(wrap(k.state, '    ', '    '), `${at}.state`, MAX_FIELD_LINES, 'state');
      if (k.needs) page.push(wrap(`needs you: ${k.needs}`, '    ', '    '), `${at}.needs`, MAX_FIELD_LINES, 'needs');
      if (k.level === 'needs-you' && !k.needs) {
        page.errors.push(`${at}: a needs-you session must say what it needs in "needs"`);
      }
    });
    const links = [fleetLinks(x), ...kids.filter((k) => fleetLinks(k)).map((k) => `${k.title}: ${fleetLinks(k)}`)]
      .filter(Boolean)
      .join('  \n');
    page.blocks.push({ lines: page.lines, links });
  }
  page.lines = page.blocks.flatMap((b) => b.lines);
}

/**
 * A table cell: one line, with `\` escaped first and then `|`, so neither a bare
 * `|` nor a `\|` already in the value can split the row.
 */
const cell = (text) => String(text).replace(/[\\|]/g, '\\$&');
/** Link text: as a cell, plus `[` and `]`, which would end the link early. One pass, so nothing is escaped twice. */
const linkText = (text) => String(text).replace(/[\\|[\]]/g, '\\$&');

/**
 * The fleet board as one markdown table: a row per session, loudest first,
 * child sessions right under their parent, done rows last. Same YAML and the
 * same validation as the cards, so the two views cannot disagree. Markdown,
 * not fenced, so every link can be clicked.
 */
function renderFleetTable(card) {
  const cards = renderCard(card);
  if (!cards.ok) return cards;
  if (card.card !== 'fleet') {
    return { ok: false, errors: ['--table works only on a fleet card'], lines: [], text: '' };
  }
  const order = card.items
    .map((x, i) => ({ x, i }))
    .sort((a, b) => fleetLoudest(a.x) - fleetLoudest(b.x) || a.i - b.i);
  const lines = [
    `🛰️ **Fleet** · ${cell(card.as_of)}`,
    '',
    '| | Session | PR | CI | State |',
    '|:-:|---|---|---|---|',
  ];
  const meters = new Map();
  for (const x of card.items) if (x.meter) meters.set(x, computeMeter(x.meter));
  const row = (x, child) => {
    const name = cell(x.title);
    const m = meters.get(x);
    const meter = m ? `\`${m.bar}\` ${cell(m.summary.join(' · '))} · ` : '';
    const named = x.session ? `[${linkText(x.title)}](https://claude.ai/code/${x.session})` : name;
    lines.push(
      `| ${fleetIcon(x.level)} | ${child ? '· ' : ''}${named} | ${x.pr ? `[#${x.pr}](${REPO_URL}/pull/${x.pr})` : ''} | ${x.build ? `[run](${x.build})` : ''} | ${meter}${cell(x.state)}${x.needs ? ` — **needs:** ${cell(x.needs)}` : ''} |`,
    );
  };
  for (const { x } of order) {
    row(x, false);
    for (const k of x.children || []) row(k, true);
  }
  return { ok: true, errors: [], lines, text: lines.join('\n') };
}

const RENDERERS = {
  'pre-merge': renderPreMerge,
  standup: renderStandup,
  continuation: renderContinuation,
  decision: renderDecision,
  fleet: renderFleet,
  meter: renderMeter,
};

/**
 * Validate and render one card.
 * @param {object} card the parsed YAML
 * @returns {{ok: boolean, errors: string[], lines: string[], text: string}}
 *   `text` is the fenced card, ready to post; it is empty when `ok` is false.
 */
function renderCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    return { ok: false, errors: ['the card must be a YAML mapping'], lines: [], text: '' };
  }
  const errors = schemaErrors(card);
  for (const s of collectStrings(card)) {
    if (PLACEHOLDER.test(s)) errors.push(`unfilled template text: "${s.slice(0, 40)}"`);
  }
  if (errors.length) return { ok: false, errors, lines: [], text: '' };
  const page = new Page();
  RENDERERS[card.card](card, page);
  if (page.errors.length) return { ok: false, errors: page.errors, lines: [], text: '' };
  const fence = (lines) => `\`\`\`\n${lines.join('\n')}\n\`\`\``;
  // A fleet board is several fenced cards, each with its links OUTSIDE the
  // fence, because a link inside a fence cannot be clicked.
  const text = page.blocks
    ? page.blocks.map((b) => fence(b.lines) + (b.links ? `\n${b.links}` : '')).join('\n\n')
    : fence(page.lines);
  return { ok: true, errors: [], lines: page.lines, text };
}

module.exports = { renderCard, renderFleetTable, computeMeter, schemaErrors, displayWidth, WIDTH, SCHEMAS, METER_STAGES };
