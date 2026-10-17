---
group: Lint & audit
---
Render tier of the component contract, report-only: every gallery slide (one per variant, all 75 components) rendered in pages, then overflow, axe, the card-row trigger and a contrast sweep over every shipped palette. Prints timing and findings by component; `--only=a,b` limits it, `--json=file` saves the report. Held out of `npm test` and the per-PR tier until the owner sets the render budget.
