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
