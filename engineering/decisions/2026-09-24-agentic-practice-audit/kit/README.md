# Agentic engineering starter kit

Copy-paste pieces from the talk "Agentic engineering: five practices". Each one came out of a
real incident; adapt the wording to your team, then let your own incidents grow it.

| Piece | Copy it to | What it does |
|---|---|---|
| `CLAUDE.template.md` | `CLAUDE.md` at your repo root | Standing instructions, written as an index |
| `claude/settings.json` | `.claude/settings.json` | Allow, ask and deny lists, plus a Stop hook |
| `claude/hooks/tests-must-pass.sh` | `.claude/hooks/tests-must-pass.sh` | Keeps the agent working until the tests pass |
| `claude/agents/checker.md` | `.claude/agents/checker.md` | A read-only reviewer that re-derives claims |
| `templates/pre-merge-card.md` | Your PR template, or the instruction file | The evidence card posted before every merge |
| `templates/decision-note.md` | `docs/decisions/YYYY-MM-DD-<slug>.md` | One dated note per incident or decision |
| `templates/followup.md` | `followups/<n>-<slug>.md` | Pending work as a file, never only in chat |

## Install in five minutes

1. Copy `CLAUDE.template.md` to `CLAUDE.md` and replace the paths in "Read first" with yours.
2. Copy the `claude/` folder to `.claude/` and make the hook executable:
   `chmod +x .claude/hooks/tests-must-pass.sh`.
3. Change `npm test` in the hook and the allow list to your own test command.
4. Commit `.claude/` so the whole team shares the same setup.
5. Start `docs/decisions/` with one note: why you adopted this kit.

The file names and settings keys follow the Claude Code docs as of September 2026
(`CLAUDE.md`, `.claude/settings.json`, `.claude/agents/`, `Stop` hooks with exit code 2).
The practices themselves work with any agent tool.
