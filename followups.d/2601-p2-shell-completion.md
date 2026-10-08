---
origin: 2601
priority: P2
recorded: 2026-10-08
area: engine
severity: high
swimlane: engineering/decisions/2026-10-07-first-npm-release.md
---

# `lattice` has no shell completion: Tab completes nothing in bash, zsh, fish or PowerShell

why now   — the owner called this critical on 2026-10-08. The CLI takes 49 options plus the
            `packages` and `video` subcommands, and most option values come from a closed set
            the user has to remember: palette names, `--size` canvases, `--paper`, `--player-mode`.
            Today Tab completes only file names. 1.0.0 is when people install the command and
            meet it for the first time, so completion should ship with it or close behind it.
            Severity is `high`, not `critical`, because `followups.d/` refuses `critical`. If
            this must block the 1.0.0 publish (slice E), promote it to an issue.
where     — lattice.js: the `packages`/`video` dispatch (~line 482) and `parseArgs`. The value
            options are a table; the boolean flags are an if-chain, so completion cannot read
            them yet. Value sources: themes/ (palettes), lib/engine/sizes.js (`--size`), the
            package store (lib/packages/home.js) for installed package names, and
            lib/packages/cli.js and lib/export/video-cli.mjs for the subcommands' own options.
            User docs: docs/src/content/docs/guides/cli.md, reference/cli.md, README, and one
            line on the short `--help` screen.
            Proposed shape, to confirm in the design step:
            - `lattice completion <bash|zsh|fish|powershell>` prints a script to stdout. The
              user installs it with one line, the way gh, kubectl and npm do, for example
              `source <(lattice completion bash)` in ~/.bashrc. `lattice` never edits a dotfile.
            - Each script is a thin shim that calls a hidden `lattice __complete <words…>`. All
              the candidates come from that one place, so the four shells cannot drift apart.
            - Move the boolean flags into a table next to `opts`, so `parseArgs`, the help text
              and completion read one list.
            - `__complete` is dispatched before the engine loads, as `packages` is, so a Tab
              press costs one Node startup (~40 ms) and never a render.
            - Shells: bash (Linux, and macOS users who switched back), zsh (macOS default),
              fish, and PowerShell (Windows, which is why it is not optional). cmd.exe has no
              programmable completion, so it is out of scope.
            - The default file completion stays: `.md` for the input; for the output, the five
              extensions the output-format table in the help lists.
done when — `lattice completion <shell>` works for all four shells. Tab completes subcommands,
            every option, closed-set option values and installed package names. The docs show
            the one-line install per shell, and a `changelog.d/` fragment records it.
evidence  — a unit drift gate: every option `parseArgs` accepts is a completion candidate, and a
            failing arm proves the gate can fail. A bash test drives the real script through
            `compgen` (COMP_WORDS/COMP_CWORD, then the completion function) and asserts on
            COMPREPLY for `lattice --pa<Tab>`, `lattice -p <Tab>` and `lattice pack<Tab>`.
            Measure the time per Tab.
verify    — bash can run here. zsh, fish and pwsh are not installed in this sandbox, so a run
            here leaves them UNVERIFIED (HARD RULE #23). GitHub's ubuntu runners ship pwsh, not
            fish. A CI step that installs the other shells is a CI-contract change, so the owner
            decides it. Tier 1 checker, because it adds a public subcommand.
