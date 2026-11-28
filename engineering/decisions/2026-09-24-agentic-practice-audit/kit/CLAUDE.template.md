# Agent instructions

Keep this file to one page. It is an index: one line per rule, and a link to the detail.
Every session reads all of it, so a paragraph here costs every session.

## Always

- Run the tests before you say anything is done.
- Ask for a failing test first, then fix, then show the same test passing.
- A "verified" claim names where it ran (real browser, real export, real device) and
  attaches proof from there. Mocks, emulation and "CI is green" are not verification.
  If you could not reach the real thing, write UNVERIFIED.
- Read the actual diff before you trust a summary of it, including your own.

## Ask first, even when a rule points at it

- Shared state outside this branch: labels, boards, settings other people read.
- The CI pipeline or git hooks: adding, removing or moving a job or step.
- A number a person set: "about 12" is a decision, not a suggestion.
- The meaning of a core doc, including this file.
- Anything irreversible or public: merges, releases, deploys, comments on others' work.

When you ask, bring options with what each costs, buys and risks, measured if it takes
under a minute. Lead with a recommendation, and ask everything in one round.

## Before you ask to merge

Post the evidence card from `docs/pre-merge-card.md` on the PR and in the chat.

## Pending work

Anything left undone gets a file in `followups/`, never only a line in chat.

## Read first

| Working on…                      | Read first                 |
| -------------------------------- | -------------------------- |
| Branching, merging, releases     | docs/workflow.md           |
| Something behaving strangely     | docs/gotchas.md            |
| About to write a new script      | docs/capabilities.md       |
| Why something is the way it is   | docs/decisions/            |
