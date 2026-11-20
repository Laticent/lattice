
/**
 * Agent cards — one validated source, one rendered layout.
 *
 * An agent that reports to the owner (the 🚦 pre-merge, 📋 standup, 🎯
 * continuation and ❓ decision cards) writes a small YAML file instead of
 * hand-wrapping text. `validateCard` checks it against a JSON Schema plus the
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
const REPO_URL = 'https://github.com/Laticent/lattice';

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
                },
              },
            },
          },
        },
      },
      actions: { type: 'array', items: str },
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
  const live = d.items.filter((x) => x.level !== 'done');
  const done = d.items.filter((x) => x.level === 'done');
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
  const loud = live.filter((x) => x.level === 'needs-you').length;
  page.field('needs you', loud ? `${loud} — the 🔴 cards below` : 'NOTHING — no 🔴 card', 'items');
  page.field('scope', d.scope, 'scope');
  if (d.hindsight || done.length) page.section('HINDSIGHT — since last board');
  page.field('done', done.map((x) => `${x.title}${x.pr ? ` #${x.pr}` : ''} ${x.state}`).join('; '), 'items[done]');
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
    .sort((a, b) => fleetRank(a.x.level) - fleetRank(b.x.level) || a.i - b.i)
    .map(({ x }) => x);
  page.blocks = [{ lines: page.lines }];
  for (const x of sorted) {
    const where = `items[${d.items.indexOf(x)}]`;
    if (x.level === 'needs-you' && !x.needs) {
      page.errors.push(`${where}: a needs-you card must say what it needs in "needs"`);
    }
    page.lines = [];
    header(page, fleetName(x), null, `${where}.title`);
    page.blank();
    page.section('BOTTOM LINE');
    page.field('state', x.state, `${where}.state`);
    page.field('needs you', x.needs, `${where}.needs`);
    page.field('why', x.why, `${where}.why`);
    const kids = x.children || [];
    if (kids.length) page.section('LINE OF WORK');
    kids.forEach((k, j) => {
      const at = `${where}.children[${j}]`;
      const name = `  ${fleetName(k)}`;
      if (displayWidth(name) > WIDTH) page.errors.push(`${at}.title: line is wider than ${WIDTH} columns`);
      page.lines.push(name);
      page.push(wrap(k.state, '    ', '    '), `${at}.state`, MAX_FIELD_LINES, 'state');
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
const cell = (text) => String(text).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

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
    .sort((a, b) => fleetRank(a.x.level) - fleetRank(b.x.level) || a.i - b.i);
  const lines = [
    `🛰️ **Fleet** · ${cell(card.as_of)}`,
    '',
    '| | Session | PR | CI | State |',
    '|:-:|---|---|---|---|',
  ];
  const row = (x, child) => {
    const name = cell(x.title);
    const named = x.session ? `[${name}](https://claude.ai/code/${x.session})` : name;
    lines.push(
      `| ${fleetIcon(x.level)} | ${child ? '· ' : ''}${named} | ${x.pr ? `[#${x.pr}](${REPO_URL}/pull/${x.pr})` : ''} | ${x.build ? `[run](${x.build})` : ''} | ${cell(x.state)}${x.needs ? ` — **needs:** ${cell(x.needs)}` : ''} |`,
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

module.exports = { renderCard, renderFleetTable, schemaErrors, displayWidth, WIDTH, SCHEMAS };
