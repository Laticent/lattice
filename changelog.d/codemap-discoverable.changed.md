- **The code map is now easy for agents to find.** A plain search for a folder or part name now
  lands on `dist/engineering/codemap.md`: a new root `.ignore`, which only search tools read,
  re-includes that one generated file, so ripgrep and the agent Grep tool see it while git still
  ignores it. `AGENTS.md` now points non-Claude agents at the map (with a `dist-kits` link for
  readers without a clone), every roster agent that locates code is told to grep it first, and
  `CLAUDE.md`'s "Where X lives" row says to grep the map first and that it is generated.
