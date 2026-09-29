- **Fixed: `split-compare`'s verdict and `split-panel pullquote`'s quote are the first TOP-LEVEL
  blockquote on the export path too.** The string kernel (`lib/core/split-panels.js`) took the first
  `<blockquote>` anywhere and stopped at the first `</blockquote>`. A quote inside a raw `<div>`, a table or a list
  item above the slot became the slot, and a quote nested in the verdict or pull quote cut it short,
  while the preview's DOM path already read `:scope > blockquote`. A speaker note that mentioned
  `<blockquote>` above a pull quote no longer breaks it either. No committed deck changes.
