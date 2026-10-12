---
group: Project queue
---
Audit the open issue QUEUE ITSELF — labels no .github/labels.json entry declares (a retired dimension nobody swept, a typo'd namespace, a non-taxonomy `type:` the intake gate accepts), cards missing a required axis, duplicate LEADS by stemmed title overlap, and cards holding an outsized share of all comments (a standing alarm that has become a dashboard). Sibling of audit:queue: that one asks whether a card can be PULLED, this one whether the board is telling the truth. The dupe arm is a lead generator with measured ~14% precision and a known un-tunable false positive — read every row, rank carries no truth (input: `gh issue list` JSON; see .claude/skills/queue-triage/SKILL.md for the judgment half).
