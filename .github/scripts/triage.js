/**
 * Pure intake-triage logic for the Issue triage gate workflow
 * (.github/workflows/triage-gate.yml). Kept here — and unit-tested — so the
 * "what must this card still get?" decision lives in exactly one place, the way
 * issue-form.js owns form parsing.
 *
 * The board's contract: every card carries the four-axis taxonomy
 * (`area:` · `type:` · `priority:` · `status:`). The work-item FORM covers the
 * web path; this is the backstop for every other intake (blank web issue,
 * `gh issue create`, the REST API, an MCP/app agent). Given a card's current
 * labels and its optionally-parsed form, decide the minimal label delta:
 *
 *   • no `status:` lane            → add `status:backlog` (the entry column)
 *   • `area:`/`type:`/`priority:`  → if any is missing from BOTH the labels and
 *     missing                        the form, add `needs:triage` + comment once;
 *                                     once all three are present, clear it.
 *
 * Add-only on the dimensions (a human owns re-triage); `needs:triage` is the one
 * label this gate also removes — automatically, when the card becomes complete.
 */

const AXES = ['area', 'type', 'priority'];
const TRIAGE = 'needs:triage';
const DEFAULT_STATUS = 'status:backlog';

// Hidden marker carried by the triage comment. The gate checks for it before
// posting so the card is commented exactly once — even across a concurrent
// open+edit, or a remove-axis → re-flag cycle (which both re-enter the flag
// path). Invisible in rendered markdown.
const COMMENT_SENTINEL = '<!-- triage-gate:needs-triage -->';

/** Does the set hold any `<dim>:*` label? */
function hasDimension(set, dim) {
  for (const name of set) if (name.startsWith(`${dim}:`)) return true;
  return false;
}

/** The one-time comment posted when a card is first flagged `needs:triage`. */
function triageComment(missing) {
  const pretty = missing.map((a) => `\`${a}:*\``).join(', ');
  const noun = missing.length > 1 ? 'labels' : 'a label';
  return [
    `🏷️ **Needs triage.** This card is missing ${noun}: ${pretty}.`,
    '',
    'Every card on the board carries all four axes — `area:` (swimlane) · `type:` · ' +
      '`priority:` · `status:`. Add the missing label(s) — or edit the issue using the ' +
      '**Work item** form fields — and `needs:triage` clears automatically.',
    '',
    'Taxonomy: `.github/labels.json`. Model: `engineering/workflow.md` § Work queue.',
    '',
    COMMENT_SENTINEL,
  ].join('\n');
}

/**
 * @param {{labels?: string[], form?: {area?,type?,priority?:string}}} input
 * @returns {{add: string[], remove: string[], comment: (string|null)}}
 */
function computeTriage({ labels = [], form = {} } = {}) {
  const current = new Set(labels);
  const add = [];
  const remove = [];

  // 1. Floor: every card sits in a lane. Default new/unlaned cards to backlog.
  if (!hasDimension(current, 'status')) add.push(DEFAULT_STATUS);

  // 2. Required axes — present if already labeled OR selected in the form (the
  //    Apply-form-labels workflow will materialize that pick, so don't double-
  //    flag a form-filed card whose dropdown already carries the axis).
  const missing = AXES.filter((dim) => {
    if (hasDimension(current, dim)) return false;
    const picked = form[dim];
    if (picked && new RegExp(`^${dim}:[a-z0-9-]+$`).test(picked)) return false;
    return true;
  });

  let comment = null;
  if (missing.length > 0) {
    if (!current.has(TRIAGE)) {
      add.push(TRIAGE);
      comment = triageComment(missing); // comment only on the first flag — no spam
    }
  } else if (current.has(TRIAGE)) {
    remove.push(TRIAGE); // axes complete — retire the flag
  }

  return { add, remove, comment };
}

module.exports = {
  computeTriage,
  triageComment,
  hasDimension,
  AXES,
  TRIAGE,
  DEFAULT_STATUS,
  COMMENT_SENTINEL,
};
