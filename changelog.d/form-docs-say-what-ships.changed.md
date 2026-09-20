- **Changed: the documentation now says Form is unconditional, everywhere it used
  to describe a toggle.** `design/forms.md` leads with a new §0 setting out the
  three levels — Form (unconditional) over Medium (`2d` today, a renderer's choice)
  over Frame (the component's choice) — and its §7, §8, §10 claims are corrected.
  `README.md`, `engineering/architecture.md` and the docs-site craft pages follow.
- **Fixed: three docs-site pages said "ten layouts are sovereign" and listed
  `math`.** It is nine, and math left the sovereign set in 2026-09 — so a reader
  anchoring a rule on `section.math` was told to write one that cannot fire. They
  also described sovereign layouts as taking "neither cell", which is the exact
  conflation being removed: a sovereign Frame declares `cells: ["stage"]`.
- **Fixed: `README.md` and `design/forms.md` both claimed the browser runtime reads
  no front matter**, contradicting the shipped runtime and its own changelog entry
  since 2026-07-08. Both are moot now and both are corrected.
