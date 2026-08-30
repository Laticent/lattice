---
status: shipped
summary: >
  A shell block on a slide is usually a LIST OF COMMANDS, and hljs's stock bash grammar
  renders that monochrome — it knows POSIX built-ins and coreutils, so `npm`, `docker`,
  `kubectl` and every flag are unknown words. Measured: 1 token across 6 lines. The
  proposed fix was to re-point `bash` at a grammar that paints more (`powershell` reads
  `-flag` as a parameter, so a command list lights up); testing it against real scripts
  killed that — powershell paints `-dist` inside `${OUT_DIR:-dist}` as a flag, drops
  quoted strings, and reads `v1.4.0` as the number `1.4`. SHIPPED INSTEAD: Lattice owns
  an augmented bash grammar (modern CLI tools as built_ins, a lookbehind-free flag rule),
  registered through the same kernel seam as the Mermaid grammar so every surface agrees.
  Deliberately NOT annexed: ```shell, whose script-under-a-session-tag defect already
  belongs to `shellFenceFindings` — one mechanism per symptom.
---

# Shell highlighting — own the grammar, don't borrow one

**Date:** 2026-08-30 · **Status:** shipped
**Trigger:** owner, on the `code` component: *"bash highlighting is terrible but
crystal or powershell highlighting on bash is pretty good … some languages do a
poor job of syntax highlighting and in those instances we should adopt another
language as the syntax highlighter."*

Reads alongside `2026-08-25-on-demand-fence-grammars.md`, which answers the
adjacent question (WHICH grammars a build carries). This one is about what a
grammar we do carry actually paints.

---

## 1. The complaint is real, but only for one content shape

Two shapes of shell block reach a slide, and stock bash treats them very
differently. Measured through the real engine, same source, only the fence tag
changing:

| Source shape | Under stock `bash` | Under `powershell` | Under `crystal` |
|---|---|---|---|
| **Command list** (6 lines: npm / npx / docker / git / kubectl / curl) | **1 token** — effectively monochrome | flags + `curl` color; strings lost | worse than bash |
| **Real script** (shebang, `set -euo`, `for`/`if`, `${VAR:-default}`) | 24 tokens, 83% coverage — **the best of the three** | `-dist` inside `${OUT_DIR:-dist}` painted as a FLAG; `v1.4.0` → number `1.4`; strings lost | loses every shell built-in (`set`, `echo`, `exit`, `fi`, `done`) |

So the owner's read was right about what he was looking at — a command list is
the common case on a deck, and bash gives it nothing — and the proposed remedy
would have traded a visible defect for an invisible one. **A wrong color is a
false claim about the code**, and it fails in the direction that survives review:
the slide looks *more* alive, not less.

The cause is not a bad grammar. It is a missing vocabulary: hljs's bash knows
POSIX built-ins and GNU coreutils, and `npm`/`docker`/`kubectl`/`terraform`
post-date that list by decades.

## 2. What shipped

**An augmented grammar, not a substitution** — `lib/integrations/highlight-js/shell.hljs.js`.
hljs's own bash definition plus exactly two things:

1. **Modern CLI tools as `built_in`** — package managers, container/cloud/infra
   CLIs, language toolchains, build tools. Curated: every entry costs a false
   positive when the same word appears as a bare argument, so generic English
   words that happen to be commands (`next`, `bundle`) are deliberately omitted.
2. **Flags as `params`** — `-d`, `--build`, `-sSL`.

Both reuse token roles the theme already styles, so **no CSS, no token, and no
theme changed.**

**The flag rule is deliberately lookbehind-free.** `(?<=\s)--?\w+` is the obvious
spelling and is barred: lookbehind is a SyntaxError on Safari < 16.4, and this
grammar is bundled into the browser preview, where a regex that throws at
construction takes down the whole bundle rather than just the highlighting. A
two-part `begin` array with `beginScope: {2: 'params'}` states the same
constraint through hljs's own API and compiles everywhere.

**What may precede a flag is a deliberate set** — start-of-line plus ` ([|,;&` —
and that set is what keeps powershell's bug out: it excludes word characters (so
`-file` in `my-file.txt` is not a flag) and `:` and `=` (so `-dist` in
`${OUT_DIR:-dist}` and a `--opt=-value` tail are not). It began as whitespace
alone, which was too narrow in a way that showed on a slide — see §6.

**Registered at the one seam every path shares.** `registerShellHljs` sits beside
`registerMermaidHljs` in `lib/integrations/markdown-it/plugins.js` and is called
once in `createEngine`, so the CLI, the emulator, every export path and the
browser preview get the same grammar (HARD RULE #1).

**The grammar is INJECTED into that function, not required at the top of
plugins.js**, and that is load-bearing. `lib/runtime/index.js` imports three small
helpers from plugins.js, so everything plugins.js requires is pulled into the
browser RUNTIME bundle — which never highlights anything, because spans are baked
at render time. A top-level require put **4,509 bytes** of dead highlight.js into
`lattice-runtime.min.js`, shipped to every exported deck and every marp-kit user.
Injecting brought that to **234 bytes** (the function body itself). Same shape as
`createSlideSanitizer(DOMPurify, window)`.

## 3. What it deliberately does NOT take: the `shell` tag

` ```shell ` on a script colors almost nothing, because upstream `shell` (aliases
`console`, `shellsession`) is a terminal-SESSION grammar whose job is marking the
`$` prompt in pasted output. An early cut of this work fixed that by annexing the
`shell` NAME onto the script grammar.

**Reverted, because the defect already has an owner.** `shellFenceFindings` in
`lib/core/fence-languages.js` detects a script under a session tag and tells the
author to retag — shipped, tested, and reasoned in its own note. Annexing the name
fixes the same symptom by overriding what an upstream grammar means, and leaves
that lint pointing at a problem it had silently solved. One mechanism, one
message: **the lint owns the tag mix-up; this grammar owns what a correctly-tagged
block looks like.** The lint's advice also pays better now — retagging to ` ```sh `
buys the CLI built-ins and flags, not just the script grammar.

A pleasant side effect of leaving `console` alone: its grammar EMBEDS bash for the
command part of each line, so a transcript's `$ npm run build` gets the prompt
token *and* colors `npm`.

## 4. What was rejected, and why the record matters

| Move | Verdict | Reason |
|---|---|---|
| **`bash` → `powershell`** (the original proposal) | ❌ | Lively on command lists, wrong on scripts: `${OUT_DIR:-dist}` mis-flagged, strings dropped, `v1.4.0` → `1.4`. Trades a visible defect for an invisible one. |
| **`bash` → `crystal`** | ❌ | Strictly worse than bash on both shapes — loses every shell built-in. |
| **Annexing the `shell` name** | ❌ | Duplicates `shellFenceFindings` (§3). |
| **A per-deck grammar override** (` ```bash {grammar=powershell} `) | ⏸ | Real surface area for a problem the augmented grammar removes. Revisit only if a concrete deck still wants it. |

## 5. What a Marp export loses

`unmirrored` in the fidelity ledger, and verified so rather than assumed: a Marp
render highlights with **marp-core's own bundled highlight.js**, which Lattice
never touches. Observed on a real marp-cli 4.5.0 render of an exported bundle — a
command list comes out with **zero tokens**. Scripts are barely affected (stock
bash still colors keywords, strings and POSIX built-ins); what a recipient loses
is the modern-command and flag color.

## 6. What the maker-checker pass changed (HARD RULE #25)

An independent checker ran over the shipped diff and found three real defects and
a dead test. All are fixed; the record matters more than the fixes.

**A false premise in a comment cost the change its own headline example.** The
grammar's docblock asserted that stock bash already covered `find`, `sed`, `awk`,
`curl` and `make` as coreutils, so they were left out of the added list. It does
not: hljs's `GNU_CORE_UTILS` is the literal coreutils manifest, which has `wc`,
`cat` and `tr` and has never had `find`, `sed`, `awk`, `grep`, `curl`, `make`,
`ssh` or `tar`. The result was worse than the monochrome it replaced — in the
six-line corpus from §1, `curl` was **the one gray word among five colored
commands**, using the very command this file quotes as its flag example. Fourteen
everyday commands are now in the list, and the comment carries the one-line check
that would have caught it.

**`.git` rendered as a command.** bash's keyword `$pattern` is
`/\b[a-z][a-z0-9._-]+\b/`, and a leading `.` is a non-word character, so `\b`
holds and `git` matched inside `rm -rf .git` and `tar --exclude=.git`. `foo.git`
and `/path/.git` were always safe; the bare and `=`-prefixed forms were not. It
was already firing on committed content in `engineering/decisions/`. A dot rule
now consumes a dot-prefixed name as plain text before keyword matching sees it.

**The whitespace anchor was too narrow, and it showed.** Anchoring a flag on a
preceding `\s` meant the FIRST flag in a block — index 0, nothing before it —
never colored, so two identical adjacent lines (`-v, --verbose` / `-q, --quiet`)
came out differently for no reason a reader could see. `[-h]` in a usage line and
`-h|--help` in a `case` alternation were missed for the same reason. The set is
now start-of-line plus ` ([|,;&` — still excluding word characters, `:` and `=`,
which is what keeps `my-file.txt` and `--opt=-value` safe.

**The most reassuring test in the suite was dead.** The `${OUT_DIR:-dist}` case
was documented as pinning the flag rule and cited here as evidence for it. The
checker deleted the rule outright and the test still passed: bash's own
`BRACED_VAR` mode opens at the earlier `$` and swallows the braces whole, so that
assertion pins upstream behavior Lattice does not own. It is kept, honestly
relabeled, and the load-bearing guards (`my-file.txt`, strings, comments, `=-value`)
are now the ones asserted. **Every rule is mutation-proved**: removing the flag
guard fails 2 tests, the dot rule 1, the added commands 1.

Two smaller things: `registerShellHljs` swallowed a missing-argument
`TypeError` — a caller bug that would have silently dropped every shell fence
back to stock bash — and now throws; and the idempotence comment named the wrong
mechanism (`registerLanguage` stores the raw definition, compilation is lazy and
memoized via `isCompiled`).

**Accepted, not fixed:** a flag inside a QUOTED heredoc body (`<<-'EOF'`) still
colors — the quoted form never opens bash's `HERE_DOC` mode upstream, so the rule
sees literal text; unquoted `<<EOF` is safe. And on the print/grayscale finish,
`--hljs-built_in` and `--hljs-params` both resolve to `--print-text-body`
(`base.modifiers.css`), so a command list there is exactly as monochrome as
before — pre-existing token policy, not this change, but it bounds the claim.

## 7. Verification (HARD RULE #23)

- **Engine**: 14 unit tests (`test/unit/engine/shell-grammar.test.js`) drive the real
  `createEngine()` — built-ins, flags, the mis-flagging guards, the three §6
  regressions, and the tag routing including the negative case that pins ` ```shell `
  as NOT annexed (by grammar IDENTITY, not merely by absence of color).
- **Mutation-proved**, because a passing test is not evidence that it tests
  anything: each rule was removed in turn and the suite re-run — flag guard → 2
  failures, dot rule → 1, added commands → 1.
- **Rendered PDFs** via `lattice-emulator.js` + `tools/rasterize-for-review.sh`,
  inspected as images, for the before/after comparison in §1.
- **A real marp-cli render** for the §5 claim, not an inference from the
  dependency graph.
- **Bundle sizes** measured on the built artifacts for the injection fix in §2.
- **An independent checker** (HARD RULE #25's maker-checker rung) re-ran every gate
  and the integration tier (804 tests, 0 fail), rasterized the committed example PDF
  and inspected it, and independently confirmed the three clean bills that matter:
  `sh`/`zsh` re-point to the new grammar while `shell`/`console` keep 'Shell Session';
  `console`'s embedded bash resolves to the re-registered grammar; and nothing in
  main's on-demand grammar path can clobber it (`languages.register` refuses an
  existing name, `missingLanguages` never reports `bash`, and
  `build-hljs-languages.js` emits only non-`common` grammars, so no `bash.js` is
  ever generated).
