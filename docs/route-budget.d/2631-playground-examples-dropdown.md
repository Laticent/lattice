playground: +700
The Playground's Galleries sheet gains an "All examples" section: a searchable list of every
`examples/*.md` deck (273 today). Measured against main: +0.6 KB eager JS gz (620.8 → 621.4 KB) and
+0.1 KB page HTML (555.4 → 555.5 KB). That is the section's component and the lazy index/deck
fetchers; the 273 decks and their index (1.6 MB raw) are static files under `playground/v/<hash>/galleries/`,
fetched on demand, so the route does not carry them. Declared +700 over the measured ~600 for gzip variation.
