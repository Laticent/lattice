---
"@laticent/lattice": patch
---

The Studio chat's cost figures now say "unknown" when a provider sends no cache report instead of 0%, and a reply stopped mid-round is charged and listed as an estimate instead of nothing.

- The metrics dropdown's cache share reads "unknown" when the provider reported no figure, and Anthropic's own key now reports its cache reads, which always read 0 before.
- A cache write on a direct Anthropic key is priced by its own 5-minute / 1-hour split: 1.25× and 2× base input.
- A round stopped or cut off before it reported its usage is charged as an estimate, shown in the reply's usage and in Show work, and marked as one.
- The hard-stop budget cap and the Stop estimate count the tool definitions each round carries.
- Show work lists each model call's cost, input with its cached share, and output, and its total keeps cumulative input apart from the largest single call.
