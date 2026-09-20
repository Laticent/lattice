- **Added: `npm run audit:hygiene` and a `queue-triage` skill — the repeatable half of a backlog triage pass.**
  `tools/audit-queue-hygiene.js` audits the queue *itself* in four arms: labels no
  `.github/labels.json` entry declares (which is how 50 cards kept a `model:*` label for a
  dimension HARD RULE #27 retired), cards missing a required axis, duplicate leads, and cards
  holding an outsized share of all comments. It is the sibling of `audit:queue`: that one asks
  whether a card can be pulled, this one asks whether the board is telling the truth.
  `.claude/skills/queue-triage/SKILL.md` carries the judgment half — the cost-of-delay classes,
  the cross-cutting-view rule, and the discipline that label writes go to the owner in one
  batched round and are recorded in the note because they leave no diff.
