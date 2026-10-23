# Host slots demo

`host-slots.md` draws with `status-card`, a plugin whose renderer returns `{ html, data }`. Its `html` holds `${status}`,
`${title}` and `${detail}`; the host checks the returned values against the manifest's fields and fills the slots.

The plugin is an installed (zip) plugin, so the deck needs it in a package store and the user's approval of its code.
The demo lives beside the code it shows (the workflow note allows that for a code-level feature). CI renders `examples/*.md` against an empty package store and `lint:deck` would call the plugin unknown, so the deck is rendered by hand:

```bash
lattice packages add lib/packages/_demo-host-slots/status-card --packages .scratch/hs --trust
lattice lib/packages/_demo-host-slots/host-slots.md .scratch/hs/host-slots.pdf --packages .scratch/hs
```

Without the plugin the deck renders, and each `status-card` block stays a code block.
