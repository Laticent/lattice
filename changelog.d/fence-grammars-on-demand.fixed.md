- **Fixed: the Playground and Studio now color every language the CLI does.**
  The preview bundle carried highlight.js's 36-language `common` build while the
  CLI export carried all 192, so the same deck rendered differently in the two
  places with nothing logged — a `powershell` fence measured 11 highlight spans in
  an exported PDF and 0 in the Playground. The preview now fetches the grammars a
  deck's fences actually name, one small file each (median 1.9 KB), so coverage
  matches the export without putting the full build in front of first paint: a deck
  using only common languages fetches nothing at all, and the bundle grew 2.4 KB
  rather than the 259 KB (gzipped) the full build would have cost.
- **Added: `lint:deck` flags a shell script tagged with a terminal-session
  grammar.** In highlight.js, `bash` (aliases `sh`, `zsh`) parses shell scripts
  while `shell` (aliases `console`, `shellsession`) marks the `$` prompt in pasted
  output and leaves the rest plain — so a script fenced ```` ```shell ```` renders
  almost uncolored and reads as broken highlighting. The new `shell-fence-is-script`
  suggestion names the tag and the one-word fix. It stays silent on a genuine
  transcript: any prompt-prefixed line means the block is a session.
- **Added: the engine declares which fenced-code languages it can color.**
  `engine.languages` answers `has` / `list` / `needed(markdown)` / `missing(markdown)`
  and registers a grammar at runtime. Which languages a build supports used to be
  decided by an esbuild hook in a build script and observable nowhere, which is why
  the preview/export gap went unnoticed.
