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

Requiring that leading whitespace is also what keeps powershell's bug out:
`-dist` in `${OUT_DIR:-dist}` is preceded by `:`, and `-file` in `my-file.txt` by
a word character. Neither is a flag. (Belt and braces — bash's variable mode opens
at the earlier `$` and swallows `${…}` whole before the flag rule is offered the
position.)

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

## 6. Verification (HARD RULE #23)

- **Engine**: 9 unit tests (`test/unit/engine/shell-grammar.test.js`) drive the real
  `createEngine()` — built-ins, flags, the two mis-flagging regressions, and the
  tag routing including the negative case that pins ` ```shell ` as NOT annexed.
- **Rendered PDFs** via `lattice-emulator.js` + `tools/rasterize-for-review.sh`,
  inspected as images, for the before/after comparison in §1.
- **A real marp-cli render** for the §5 claim, not an inference from the
  dependency graph.
- **Bundle sizes** measured on the built artifacts for the injection fix in §2.
