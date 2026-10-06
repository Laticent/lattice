---
origin: 2558
priority: P1
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2558
---

# Export-to-Marp hands a recipient a renderer told to run the deck's raw HTML with local file access

why now   — found by the red team on #2558's P1 (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
            § 10). `lib/core/marp-bundle.js` writes `html: true, allowLocalFiles: true` into the bundle's
            `marp.config.cjs` and `markdown.marp.enableHtml: true` for VS Code, and the deck's
            `<script>` / `onerror=` ride into `deck/deck.md` unchanged. The Studio's Share sheet offers the
            same bundle from the editor source, unsanitized (`share-export.ts`), while the Studio preview
            sanitizes, so a deck whose script came from an AI edit or an import ships a payload its author
            never saw run. marp-cli's `allowLocalFiles` starts Chrome with `--allow-file-access-from-files`
            and nothing keeps it offline, so a deck script could read local files during the recipient's
            `npm run pdf` and send them out (reasoned, not run: marp-cli is not installed in the sandbox).
where     — lib/core/marp-bundle.js (`marpConfigCjs`, `vscodeSettings`, the deck it writes);
            docs/src/components/studio/share-export.ts (the Marp ZIP path); the bundle's runtime `<script>`
            tags, which are why `html: true` is on at all.
done when — the bundle keeps Lattice's own runtime tags and drops the deck's `<script>`, `on…=`,
            `srcdoc` and `javascript:` URLs (or the owner decides the bundle is the author's own and says so
            in the CLI guide and the Share sheet); whether `allowLocalFiles` can be narrowed is answered.
            It changes an exported artifact, so the owner signs off before merge.
evidence  — the bundle rendered with real marp-cli, before and after, with a deck carrying an `onerror`
            image and a `<script>`: what runs, and what the PDF shows.
verify    — tier 2 trio, because it is a security boundary on exported bytes.
