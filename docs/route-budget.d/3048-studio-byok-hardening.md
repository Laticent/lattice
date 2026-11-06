studio: +620
playground: +100
home: +100
The Studio's first load now handles a failed OpenRouter sign-in: `resumePendingAuth` runs at boot on the OAuth return, so its refused/network split, its single-flight guard and the shell's Try again / Reload notice ship eagerly (architect +378 B gz, StudioIsland +115). CI measured the Studio at +574 B gz against main 56253e0; +620 covers gzip spread on this head.
Every route that loads the chart hover card pays +81 B gz for `escText` in `chart-interact.js`: the card wrote a chart mark's label into the parent document with `innerHTML`, so a shared deck's `data-label` could reach the page that holds the author's key (the red team's latent sink; decision note §5). That is the whole Playground and home growth; +100 covers spread.
Given back first: the per-cause failure sentences (`model-error.ts`) load only when a request fails, and the pasted-key check (`api-key.ts`) only with the Workspace sheet. Those two moves took the Studio from +1,607 B to the figure above.
