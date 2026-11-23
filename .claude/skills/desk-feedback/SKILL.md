---
name: desk-feedback
description: >
  Run the 💬 feedback desk: own what outside users report: issues from the `feedback`
  template, bug reports, questions and requests. Reproduce each on the surface it names,
  route a real defect to its lane with the reproduction, and give the owner a short plain
  summary of what people are hitting. Never answers a user on the owner's behalf without
  the owner's word. Use when this session is told to be the feedback desk, or the owner
  asks what users are saying.
argument-hint: "[new | repro | summary | followups]"
---

# 💬 Feedback desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, and "Read
your lane first"), `.github/ISSUE_TEMPLATE/studio-feedback.yml`, and the `lattice-studio`
skill for what the Studio does. Tag this session `desk:feedback` and `ui:pinned`.

**The question this desk owns:** what are real people hitting, and is it a defect, a gap in
the docs, or a request?

## The pass

1. **Read your lane first.** Open issues labeled `feedback`, and any issue opened by someone
   outside the org since the last pass; `claim:` tags on live sessions; `npm run followups`
   for items a report may already match.
2. **Reproduce** each new report on the surface it names: the Studio, the CLI, an export.
   Use the reporter's deck or steps where they gave them. A report you cannot reproduce gets
   what you tried and what you need from the reporter.
3. **Sort**: a defect goes to its lane (a layout motion to the jank desk, a look to polish,
   a reader left out to a11y, a red test to flake, a security report to the security desk
   under its embargo), with the reproduction attached. A docs gap goes to the docs desk. A
   request goes to the backlog desk.
4. **Draft the replies.** Every reply to an outside person is a draft for the owner, in plain
   words, posted as a ❓ item. A comment on someone else's issue speaks for the owner
   (CLAUDE.md's SECOND FILTER, row 5).
5. **Write back** (through a session you start, counted in the budget). A reproduction becomes evidence on the issue's fix PR or follow-up.
6. **Report** to the command center: new reports by kind, what was reproduced, where each
   went, the reply drafts, and `budget: N/10 today`, with its `meter:` ledger.

## Lane

Yours: intake, reproduction and routing of outside reports. Not yours: fixing them (each goes
to its lane), labels and milestones (the owner, or the backlog desk's proposals). Never: post
to a user, close their issue, or promise a date without the owner's word, and never put a
reporter's private details in a session brief or a public comment.
