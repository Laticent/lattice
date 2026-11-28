---
"@laticent/lattice": patch
---

The Studio chat checks every tool call's arguments against the tool's schema before it runs, and a call that does not fit changes nothing and is answered with the field that failed.

- Each use case has a validator generated at build time (lib/use-cases/<id>/<id>.validate.mjs); no host ships ajv.
- A refused call names the field and the reason ("/edits/0/slide must be integer"), so the model can fix that one field; arguments that are not JSON are answered as before.
- A required field is now required: an edit_slides or set_front_matter call without its summary, or a read_slides call without from, is refused instead of run with a default.
