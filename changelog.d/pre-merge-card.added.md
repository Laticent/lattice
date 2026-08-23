- **Every merge ask now carries a fenced 🚦 pre-merge card — what, why, how, evidence, risk,
  what's unverified, and a confidence level.** The merge gate is the one place a human is
  required, and the ask used to arrive as a bare "it's green, may I merge?" — putting the
  decision on the human while the evidence stayed in the agent's head. Green CI is weak
  evidence by construction: it confirms only what CI exercises, and the things that should
  most often block a merge (an unverified surface, a claim resting on a proxy, a defect
  knowingly shipped) are exactly what it cannot see. The confidence level is **derived, not
  asserted** — five axes (evidence, blast radius, reversibility, unknowns, independent eyes)
  graded separately, and **the lowest one sets the level**, so a change with thorough tests
  and one unverified load-bearing claim reads `medium` rather than "high with a caveat".
  Every card also names the single thing that would raise it, which turns "are you sure?"
  into a decision the human can act on. (`engineering/workflow.md` §Pre-merge card)
