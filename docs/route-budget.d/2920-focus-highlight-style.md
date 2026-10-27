studio: +2
playground: +2
`_focusStyle` gained `highlight` and lost `pop` in `meta.manifest.json`, so the `focusStyle` enum in `_astro/meta-keys` is two gzipped bytes longer on the routes that ship the editor's value completions. Nothing else on the page moved. The two routes are already over their soft targets, so the bytes are declared.
