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
 *   • no swimlane / no acceptance  → add `needs:definition` + comment once; clear
 *     check (the two DoR fields)     it once both are written.
 *
 * Add-only on the dimensions (a human owns re-triage); `needs:triage` and
 * `needs:definition` are the two labels this gate also removes — automatically,
 * when the card becomes complete.
 *
 * WHY THE SECOND FLAG EXISTS. The Definition of Ready is checked by dor-gate.yml,
 * but only when someone applies `status:ready` — a transition nobody performs.
 * Measured 2026-09-14 over all 318 open cards: 100 meet the DoR and 218 do not,
 * and every one of those 218 is missing the SWIMLANE (zero fail on the acceptance
 * check alone). That is the queue reaching 318 open with 6 pickable. The work-item
 * FORM already makes both fields required, so the entire gap is the non-form
 * paths — a blank web issue, `gh issue create`, a REST/MCP agent — which is where
 * the 218 came from. This moves the check from the promotion nobody performs to
 * the creation everybody performs.
 *
 * WHY IT IS GRANDFATHERED. Flagging on age-blind rules would comment on and flag
 * up to 218 existing cards as they are touched, burying the 29-card `needs:triage`
 * banner and comment-storming whoever finally grooms the backlog. So the DoR arm
 * applies only to cards opened on or after DOR_CUTOFF. Sweeping the legacy 218 is
 * a deliberate labeling pass, not a side effect of landing this.
 */

const AXES = ['area', 'type', 'priority'];
const TRIAGE = 'needs:triage';
const DEFINITION = 'needs:definition';
const DEFAULT_STATUS = 'status:backlog';

// Cards opened before this are grandfathered out of the DoR arm (see the
// docblock). ISO-8601 UTC; compared lexicographically against `created_at`,
// which GitHub emits in the same format, so no Date parsing is involved.
const DOR_CUTOFF = '2026-09-14T00:00:00Z';

// Intake paths that are NOT work items and must never be asked for a swimlane.
// `studio-feedback.yml` files an end-user bug report ("What happened?" /
// "Context"); the reporter cannot name the decision doc it belongs to, and
// demanding one would turn the bar into a wall in front of the only intake path
// a non-contributor uses. Triage turns such a report into a card; the bar then
// applies to the card, not to the report.
const DOR_EXEMPT_LABELS = ['feedback'];

// Hidden marker carried by the triage comment. The gate checks for it before
// posting so the card is commented exactly once — even across a concurrent
// open+edit, or a remove-axis → re-flag cycle (which both re-enter the flag
// path). Invisible in rendered markdown.
const COMMENT_SENTINEL = '<!-- triage-gate:needs-triage -->';
const DEFINITION_SENTINEL = '<!-- triage-gate:needs-definition -->';

/** Does the set hold any `<dim>:*` label? */
function hasDimension(set, dim) {
  for (const name of set) if (name.startsWith(`${dim}:`)) return true;
  return false;
}

/** The `needs:triage` half — which of the four label axes are still missing. */
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

/** The `needs:definition` half — which of the two Definition-of-Ready fields are missing. */
function definitionComment(missing) {
  const pretty = missing.map((f) => `**${f}**`).join(' and ');
  return [
    `📐 **Needs definition.** This card is missing ${pretty}.`,
    '',
    'A card is pickable only with both: the governing decision doc it belongs to, and a ' +
      'concrete acceptance check. Without them nobody can pull this off the queue without ' +
      'first asking you what it means — which is why the Ready column stays empty while the ' +
      'backlog grows.',
    '',
    'Add two headings to the body (or refile through the **Work item** form) and ' +
      '`needs:definition` clears automatically:',
    '',
    '```markdown',
    '## Swimlane / governing decision doc',
    'engineering/decisions/YYYY-MM-DD-<topic>.md',
    '',
    '## Acceptance check',
    '<the concrete, checkable condition that means this is done>',
    '```',
    '',
    'Contract: `engineering/workflow.md` § Definition of Ready.',
    '',
    DEFINITION_SENTINEL,
  ].join('\n');
}

/**
 * Is this card subject to the Definition-of-Ready arm at all? Two exits, both
 * deliberate: a card opened before the cutoff is grandfathered, and a card from a
 * non-work-item intake path (today: studio feedback) is never a work item. An
 * ABSENT `createdAt` also exits — an unknown-age card is treated as old, so a
 * caller that forgets to pass it under-flags rather than storming the backlog.
 */
function dorApplies({ labels = [], createdAt } = {}) {
  if (!createdAt || String(createdAt) < DOR_CUTOFF) return false;
  return !DOR_EXEMPT_LABELS.some((l) => labels.includes(l));
}

/**
 * @param {{labels?: string[], form?: object, createdAt?: string}} input
 *   `form` is the parseForm() result — `area`/`type`/`priority` feed the label
 *   axes, `swimlane`/`acceptance` feed the Definition-of-Ready arm.
 * @returns {{add: string[], remove: string[], comment: (string|null), sentinels: string[]}}
 *   A concern is explained on the FLAG TRANSITION only — the label's absence is
 *   the proxy for "not yet commented" — so the decision stays pure and the YAML
 *   stays wiring. Both concerns share ONE comment when a bare card trips both at
 *   once, which is the common case; `sentinels` names the concerns that comment
 *   covers so the caller can still guard against a duplicate post across a
 *   concurrent open+edit.
 */
function computeTriage({ labels = [], form = {}, createdAt } = {}) {
  const current = new Set(labels);
  const add = [];
  const remove = [];
  const parts = [];
  const sentinels = [];

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

  if (missing.length > 0) {
    if (!current.has(TRIAGE)) {
      add.push(TRIAGE);
      parts.push(triageComment(missing)); // explain on the FIRST flag only — no spam
      sentinels.push(COMMENT_SENTINEL);
    }
  } else if (current.has(TRIAGE)) {
    remove.push(TRIAGE); // axes complete — retire the flag
  }

  // 3. Definition of Ready — the two fields that decide whether anyone can PULL
  //    this card, checked at creation rather than at the `status:ready`
  //    transition nobody performs. parseForm() already accepts both the form
  //    headings and the ones hand-written cards use, so this asks for substance,
  //    not a template.
  if (dorApplies({ labels, createdAt })) {
    const missingDor = [];
    if (!form.swimlane) missingDor.push('a Swimlane / governing decision doc');
    if (!form.acceptance) missingDor.push('an Acceptance check');
    if (missingDor.length > 0) {
      if (!current.has(DEFINITION)) {
        add.push(DEFINITION);
        parts.push(definitionComment(missingDor));
        sentinels.push(DEFINITION_SENTINEL);
      }
    } else if (current.has(DEFINITION)) {
      remove.push(DEFINITION); // both fields written — retire the flag
    }
  } else if (current.has(DEFINITION)) {
    // Grandfathered or exempt, yet flagged: clear it rather than strand a label
    // no rule would apply again (e.g. a card that gained `feedback` after filing).
    remove.push(DEFINITION);
  }

  return { add, remove, comment: parts.length ? parts.join('\n\n---\n\n') : null, sentinels };
}

module.exports = {
  computeTriage,
  triageComment,
  definitionComment,
  dorApplies,
  hasDimension,
  AXES,
  TRIAGE,
  DEFINITION,
  DEFAULT_STATUS,
  DOR_CUTOFF,
  DOR_EXEMPT_LABELS,
  COMMENT_SENTINEL,
  DEFINITION_SENTINEL,
};
