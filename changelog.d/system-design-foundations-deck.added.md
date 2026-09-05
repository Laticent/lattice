- **Added: `examples/system-design-foundations.md`, a 219-slide system-design tutorial for
  engineers in their first years.** It opens on one engineer's Tuesday told wake-to-sleep with
  no vocabulary at all, then names each thing she met — system, purpose, boundary, environment,
  process, model, constraint, invariant, infrastructure, emergence — against the timestamp that
  taught it. A protagonist/antagonist frame turns that vocabulary into a design starting point
  and picks the rung on a five-type solution ladder (MVP, scaled, optimized, optimal,
  specialized), closing on a removal test drawn from Saint-Exupéry and Rams. Six reference kits
  follow — data, compute, network, scale, reliability, security — each opening with a pair of
  two-panel diagrams that split its four usage patterns and closing with its invariants, and covering the
  practices a junior meets in year one: ordering and identity, changing a schema without an
  outage, deleting across every derived copy, dependency supply chain, and quotas. The deck then
  designs Instagram end to end around the follow graph's asymmetry: bounded out-degree, unbounded
  in-degree, and super nodes that force the hybrid fan-out rather than it being a preference.
  Capacity is worked from a daily average up to a peak page-fetch rate, and the design's own
  fixes are checked against the promises that motivated them. The method is framed as four movements — discover, design,
  develop, deliver — of which the deck teaches the first two and hands the last two to the
  reader as the only honest check on their own design. Ten ask-then-answer exercises sit at
  the ends of Parts one to four and inside both designs, including a full discover-then-design
  pass on a course-registration spike. A second design then runs the whole method again from
  nothing — a parking app where drivers scan a sticker on the bay and pay — climbing the ladder
  from a one-table MVP through a scaled rung to an optimized one, where the card fee turns out
  to be the bill and the servers never were. Its payment path is bounded by the
  twenty-four-hour idempotency-key window Stripe documents, past which a retry is a second
  charge rather than a replay, so a waiting row carries a `created_at` and a correlation id
  in the provider's metadata and a stale sweep asks what happened instead of re-sending. Choosing a store runs in three passes — shape and
  access, then a capability no shape provides (similarity, ranked text, proximity, live push,
  retention, traversal), then the operational properties that break a tie — so a capability adds
  a store beside the source rather than replacing it. Part seven maps the feed design back to the
  kits, runs the removal test on it, and hands over a nine-field worksheet. Thirty-two Mermaid diagrams, each carrying a key insight,
  `profile: teaching`, and a generated glossary appendix from the deck's own acronym registry.
  Every diagram was sized against the deck's own smallest type token: the six kit-pattern
  diagrams that held four panels each are now twelve two-panel diagrams, which took their node
  labels from 51% of `--fs-meta` to 106%, and no diagram now draws a label below 81% of it.
