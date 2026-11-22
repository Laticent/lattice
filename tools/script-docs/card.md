---
group: Meta
---
Build an agent card (🚦 pre-merge, 📋 standup, 🎯 continuation, ❓ decision) from a small YAML file: validates it, wraps it to 38 columns for a phone and prints the fenced card; a pre-merge card also gets a GROWTH section read from git by tools/pr-growth.js (contract: engineering/workflow.md §One layout for all four cards); with LATTICE_ACTOR set to a key in .github/actors.json it appends the relay signature line (`— <name> · session_<id>`), and refuses an unknown actor; `--living <PR>` creates or edits that PR's one living handoff comment (holder only).
