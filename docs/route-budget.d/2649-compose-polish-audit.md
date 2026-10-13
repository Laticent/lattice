studio: +246
The Studio shell gains the issue chip's hint text and button (it names the unknown layouts and opens the Coach), the rail's one-shot ResizeObserver centering, and the `code` mark's spellcheck opt-out; CI measured +246 B gz against main.
Given back first: the Coach card reuses the chip's hint string instead of carrying its own, and the rail observer disconnects after its first real width.
