- **Changed: the lens skill no longer describes a reader view as a redaction, or the
  approval hash as forgery-resistant.** Both claims were withdrawn on 2026-07-18 —
  `approvalHash` is an unkeyed SHA-256, so it detects drift, not forgery, and
  client-side projection hides rather than withholds — but `design/skills/lens.md` is
  an LLM prompt, so the retired wording kept propagating into generated decks and
  agent output. The behavior it prescribes is unchanged: still fail closed, still a
  content hash, still never `approved: true`; only the stated reason is corrected, and
  a *What it is not* section now pins both retirements against reintroduction.
