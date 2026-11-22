---
group: Project queue
---
The relay board (engineering/workflow.md §Relay): one markdown row per open PR that has a `<!-- relay-handoff -->` living comment, with branch, holder, baton state, lease left and next step, across both people's accounts. `npm run relay -- sign` prints this session's signature line from LATTICE_ACTOR and `.github/actors.json`, or exits 1 with how to set it.
