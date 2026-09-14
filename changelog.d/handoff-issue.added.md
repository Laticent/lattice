- **Added: the handoff issue — a continuation brief that survives the session.**
  A session leaving work pending now files one GitHub issue carrying the brief, so
  the next session pulls it from the queue instead of being handed it. The
  contract is `engineering/workflow.md` § The handoff issue, and it names the two
  traps that make the obvious shape fail: `maskFences` blanks a fenced block
  before the Definition-of-Ready gate looks for headings, so a brief pasted
  verbatim inside a fence reads as having no swimlane and no acceptance check and
  the gate strips `status:ready`; and `pr-autoclose-issues.yml` closes every issue
  under a closing keyword, so a nine-item handoff referenced as `Closes #N` by a
  six-item PR loses three items silently.
  The contract was then tested by handing a real handoff issue to a session with
  no transcript. It found the card wanting in two ways the rules now cover: a
  base that named only a sha left it unable to tell whether to continue the
  unmerged PR's branch or cut a fresh one from `main` (the card's constants and
  evidence script existed only on that branch), and an item added by comment sat
  outside the body's own "every item below is ticked" acceptance check.
