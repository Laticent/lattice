studio: +64
playground: +64
The Studio's Export to Marp now writes `.vscode/extensions.json` and `.vscode/tasks.json` into the bundle (deck-export.js `exportMarp`, with `vscodeExtensions()` / `vscodeTasks()` from lib/core/marp-bundle.js). CI measured +4 B gz of eager JS against main; the README text itself already ships in the same module. Declared with headroom for gzip spread. The Playground's +2 B (CI, against main) is gzip variation: it imports the same marp-bundle.js, and only the README text changed in this PR's later commits, so its compressed size moved by bytes, not by code.
