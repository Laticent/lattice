studio: +96
Follow-ups to the Studio chat agent (#2518). Two eager pieces, both small. The shell's
`checkDraft` gains a third arm that renders the agent's draft to measure fit; the arm is a
dynamic import of `draft-fit.ts`, so the render path itself is not startup JavaScript and
only the import call and its arguments are. The chat header's cost readout now prices a
question and an edit (`agentTurnUsd`) in place of one worst-case figure. Measured +29 B
against `main` at eb88b64, both trees built with `measure-route-base.sh`; declared with the
same 64 B noise margin as 2508, rounded up.
