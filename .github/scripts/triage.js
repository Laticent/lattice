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
// a non-contributor uses.
//
// THIS COUPLES THREE FILES, and the join is a bare string in each: the label the
// template applies (.github/ISSUE_TEMPLATE/studio-feedback.yml `labels:`), the
// label the taxonomy creates (.github/labels.json — a label absent from there is
// never created by `npm run sync:labels`, and an issue form silently drops a
// label that does not exist), and this list. `feedback` was missing from the
// taxonomy when the bar was written, which meant every Studio bug report would
// have arrived unlabeled and been handed a demand for a governing decision doc.
// The three are pinned together in test/unit/tools/triage.test.js.
//
// The exemption follows the LABEL, so it holds for exactly as long as the label
// does: promoting a report into a work item means removing `feedback` (and
// adding the axes), which is what puts the card under the bar. Nothing automates
// that promotion — it is a human triage step.
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

/** Is this card exempt by intake path (today: an end-user studio-feedback report)? */
function dorExempt(labels = []) {
  return DOR_EXEMPT_LABELS.some((l) => labels.includes(l));
}

/**
 * Is this card NEW enough for the Definition-of-Ready arm — i.e. opened on or
 * after the cutoff?
 *
 * The compare is lexicographic, which is exact for the `YYYY-MM-DDTHH:MM:SSZ`
 * that GitHub's webhook always emits, and nonsense for anything else. So the
 * shape is CHECKED rather than assumed, and anything else is treated as OLD.
 * Without that check the guard fails in the EXPENSIVE direction: `String(new
 * Date(...))` is `"Mon Jan 01 2024…"`, which sorts ABOVE `"2026…"`, so a caller
 * that helpfully parsed the date first would grandfather nothing and flag all
 * ~218 legacy cards — the exact storm the cutoff exists to prevent. This
 * function is exported, so the next caller is the one to protect.
 */
function dorIsNew(createdAt) {
  if (typeof createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(createdAt)) {
    return false;
  }
  return createdAt >= DOR_CUTOFF;
}

/**
 * Is this card subject to the Definition-of-Ready arm at all? Two exits, and they
 * are NOT interchangeable — see computeTriage, where grandfathered and exempt are
 * handled differently on the way out.
 */
function dorApplies({ labels = [], createdAt } = {}) {
  return dorIsNew(createdAt) && !dorExempt(labels);
}

/**
 * The notices a card has NOT been told yet, given the text of its existing
 * comments. This is the dedup, and it lives here rather than in the workflow for
 * the same reason the rest does: the YAML is wiring, and a rule nobody can
 * unit-test is a rule that rots.
 *
 * The record is the COMMENT, not the label. Keying off the label instead would
 * strand a card flagged-but-never-explained whenever a run is cancelled between
 * the label write and the comment write — the re-run would see the label and stay
 * silent forever — and it would re-post one concern's explainer verbatim whenever
 * a different concern went fresh.
 *
 * @param {{sentinel: string, body: string}[]} notices
 * @param {string} seen concatenated bodies of the card's existing comments
 */
function freshNotices(notices = [], seen = '') {
  return notices.filter((n) => !String(seen).includes(n.sentinel));
}

/**
 * @param {{labels?: string[], form?: object, createdAt?: string}} input
 *   `form` is the parseForm() result — `area`/`type`/`priority` feed the label
 *   axes, `swimlane`/`acceptance` feed the Definition-of-Ready arm.
 * @returns {{add, remove: string[], notices: {sentinel,body}[], comment, sentinels}}
 *   `notices` carries one entry per concern the card is CURRENTLY short of, each
 *   with the hidden sentinel that marks it as explained. Deciding WHICH concerns
 *   are unmet is the pure part and lives here; deciding which have already been
 *   explained needs the card's existing comments, so the caller filters `notices`
 *   by sentinel and posts the fresh ones joined.
 *
 *   The record is therefore the COMMENT, not the label, and that matters twice.
 *   Gating on the label's absence instead would (a) re-post a concern's explainer
 *   verbatim whenever a DIFFERENT concern went fresh, since the two share one
 *   body, and (b) strand a card flagged-but-never-explained if the run were
 *   cancelled between the label write and the comment write — the re-run would
 *   see the label and stay silent forever.
 *
 *   `comment`/`sentinels` are the joined convenience view of `notices`.
 */
function computeTriage({ labels = [], form = {}, createdAt } = {}) {
  const current = new Set(labels);
  const add = [];
  const remove = [];
  const notices = [];

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
    if (!current.has(TRIAGE)) add.push(TRIAGE);
    notices.push({ sentinel: COMMENT_SENTINEL, body: triageComment(missing) });
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
      if (!current.has(DEFINITION)) add.push(DEFINITION);
      notices.push({ sentinel: DEFINITION_SENTINEL, body: definitionComment(missingDor) });
    } else if (current.has(DEFINITION)) {
      remove.push(DEFINITION); // both fields written — retire the flag
    }
  } else if (current.has(DEFINITION) && dorExempt(labels)) {
    // EXEMPT and flagged → clear. A card that gained `feedback` after filing is
    // not a work item, so the flag no longer describes anything.
    //
    // GRANDFATHERED and flagged is the opposite case and must NOT be cleared,
    // which is why these two exits are not one branch. The documented
    // remediation for the ~218 legacy cards is a deliberate labeling pass, and a
    // human applying `needs:definition` to a pre-cutoff card fires
    // `issues.labeled`, which re-enters this gate. Clearing there would delete
    // the label within seconds of it being applied, with no comment and nothing
    // a human would read — so the sweep would produce nothing, and the 📐 banner
    // (fed by this same label) could never list a legacy card at all. The cutoff
    // governs what the gate FLAGS, never what a human may flag.
    remove.push(DEFINITION);
  }

  return {
    add,
    remove,
    notices,
    // Everything the card is currently short of, as one body. The caller decides
    // what to POST from `notices` — see the returns-doc above.
    comment: notices.length ? notices.map((n) => n.body).join('\n\n---\n\n') : null,
    sentinels: notices.map((n) => n.sentinel),
  };
}

module.exports = {
  computeTriage,
  freshNotices,
  triageComment,
  definitionComment,
  dorApplies,
  dorExempt,
  dorIsNew,
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
