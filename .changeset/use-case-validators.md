---
"@laticent/lattice": patch
---

The Studio chat checks every tool call's arguments against the tool's schema before it runs, and a call that does not fit changes nothing and is answered with the field that failed.

- Each use case has a validator generated at build time (lib/use-cases/<id>/<id>.validate.mjs); no host ships ajv.
- A refused call names the field and the reason ("/edits/0/slide must be integer"), so the model can fix that one field; arguments that are not JSON are answered as before.
- A null in an optional field counts as left out, for every tool.
- A chart value may be a number, and a front-matter value a number or a boolean, as the tools always accepted.
- What a schema requires is now required: a missing summary on an editing tool, a missing `from` on read_slides, a single name where view_asset asks for a list, a string where a boolean or an integer belongs, or a value out of range is refused, by name, instead of guessed at.
