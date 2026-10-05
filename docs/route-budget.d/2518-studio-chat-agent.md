studio: +910
playground: +64
The Studio chat became a tool-using agent (#2518). The agent itself — the tool loop, the
doc shelf, the prompt builders — loads on the first chat turn and costs startup nothing; it
first shipped eager at +13,123 bytes. What stays eager is its wiring: the lazy loader and
the hand-over of startup modules into it (~640 B, cheaper than letting the bundler list the
whole Studio in its preload map, which cost ~2.2 KB), the shell's `check` hook that runs the
Coach's lint over the agent's draft (~120 B), and the composer row that stops the field
collapsing in the narrow desktop column (~50 B). Measured +830 to +846 against `main` at 60633a3 across builds;
declared with the same 64 B noise margin as 2508.
The Playground line is gzip noise from rebuilt chunk names: it measured −1 B and +1 B on
consecutive builds; nothing the Playground loads changed.
