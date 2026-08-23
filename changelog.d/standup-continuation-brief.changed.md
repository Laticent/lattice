- **The post-merge standup is now two fenced cards: the standup and a
  continuation brief.** The standup was drifting in and out of a code fence,
  which mattered more than cosmetics — the card is meant to be *copied*, and
  unfenced markdown is re-wrapped by the terminal renderer before it reaches the
  clipboard. Both cards are now always fenced, no exceptions. The new
  continuation brief is the second half: a paste-ready prompt that hands a fresh
  session everything the last one left pending — ticketed items and untracked
  ones alike, prioritized by downstream impact, each carrying where it lives,
  what "done" checks, the artifact that will prove it (a render, a pixel check,
  bench numbers — not "the tests pass", #23), and the verification tier it
  earned (gates, an independent checker, or the adversarial trio). The next
  session stacks the whole list into one PR with one commit per item, works it
  assuming nobody is at the keyboard, and stops at the merge gate with a green,
  review-ready PR. Its 8-agent budget is a pre-registered exemption to HARD RULE
  #25's ~10-agent human gate, which otherwise assumes a human is reachable.
  (`engineering/workflow.md` §Post-merge standup)
