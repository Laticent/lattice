---
group: Lint & audit
---
Rewrite `test/oracle/family-conformance.json` from a fresh run of `check:family-conformance`. Read the drift before blessing: `fires -> inert` is a tier that stopped firing, and `-> unexercised` may mean the sweep changed which gallery slide it picks rather than anything about the component. Refuses to write when the rule read looks broken (fewer than 100 family-scoped rules found), because this pass has failed by reading ZERO once already and a record of all-`n/a` would be green forever while asserting nothing.
