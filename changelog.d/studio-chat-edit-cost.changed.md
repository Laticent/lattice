- **A Studio chat edit costs no more than the old chat did.** An edit that checks clean now
  ends the turn with its own summary instead of a third model call, the agent reads the core
  of a layout's doc instead of every variant's example, and long guides come back as a table
  of contents. Measured on the same six asks: edits $0.083 against the old chat's $0.093,
  questions 40% cheaper. (`docs/src/components/studio/architect-agent.ts`)
