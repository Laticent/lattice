#!/usr/bin/env node
/**
 * Shell completion for `lattice`: the candidates behind every Tab press, for all four shells.
 *
 *   lattice completion <bash|zsh|fish|powershell>   prints the script the user installs
 *   lattice __complete <word…> <current>            the hidden protocol each script calls
 *
 * ONE source of candidates. Each shell script is a thin shim that hands this module the words
 * before the cursor and the word under it, and prints what comes back, so bash, zsh, fish and
 * PowerShell cannot disagree about what `lattice` accepts. The render command's options come
 * from lib/cli/options.js, the table `parseArgs` itself reads; test/unit/cli/completion.test.js
 * fails when an option any of the three parsers accepts is not offered here.
 *
 * THE PROTOCOL. Arguments: the words after `lattice`, the last one being the word under the
 * cursor ('' after a space). PowerShell 5.1 drops an empty argument on its way to a native
 * command, so a first argument `--lattice-cur=<word>` may carry the current word instead, and then
 * every other argument is a word before it. Output, one per line:
 *
 *   line 1      a directive: `:values` (only the candidates), `:files <ext,…>` (also complete
 *               paths, keeping folders and files with these extensions; empty = any file),
 *               or `:dirs` (also complete folders)
 *   the rest    `candidate<TAB>description`, already filtered to the current word's prefix
 *
 * SPEED. A Tab press is a Node start plus this file, never the 18 MB CLI bundle: the scripts
 * call this file directly by its absolute path, and fall back to `lattice __complete` only when
 * the install moved. Everything below loads lazily, per the word being completed.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pkgRootFrom } = require('../core/pkg-root');
const { VALUE_OPTIONS, SWITCHES, EARLY_FLAGS, VALUE_BY_FLAG, SWITCH_BY_FLAG, OUTPUT_EXTS, PLAYER_MODES } = require('./options.js');

const PKG_ROOT = pkgRootFrom(__dirname);

/** An own key of a lookup table; never a word that merely names an Object.prototype member. */
const has = (table, key) => key !== undefined && Object.hasOwn(table, key);

const SHELLS = Object.freeze(['bash', 'zsh', 'fish', 'powershell']);

const SUBCOMMANDS = Object.freeze([
  ['packages', 'Install and manage themes, components, finishes and motion'],
  ['video', 'Render a deck to an MP4 with a voice-over'],
  ['completion', 'Print the shell completion script'],
]);

// `lattice packages …` (lib/packages/cli.js). Its parser is a short if-chain; the drift test
// reads that source and fails on any option missing here.
const PACKAGES_COMMANDS = Object.freeze([
  ['list', 'Shipped and installed packages'],
  ['add', 'Gate a package, then install it'],
  ['check', 'Gate a package; install nothing'],
  ['export', 'Zip one package'],
  ['remove', 'Remove an installed package'],
  ['trust', "Approve an installed code package's code"],
  ['untrust', 'Withdraw that approval'],
  ['new', 'Scaffold a plugin'],
]);
const PACKAGES_VALUE = Object.freeze({
  __proto__: null,
  '--type': () => require('../packages/kinds.js').TYPES,
  '--packages': 'dirs',
  '--dir': 'dirs',
  '-o': 'files:zip',
  '--output': 'files:zip',
});
const PACKAGES_OPTIONS = Object.freeze({
  __proto__: null,
  all: [['--packages', 'Package store for this run'], ['--help', 'Show help'], ['-h', 'Show help']],
  list: [['--type', 'Only this package type']],
  add: [['--replace', 'Replace an installed package'], ['--trust', "Approve a code package's code"]],
  export: [['-o', 'Output zip'], ['--output', 'Output zip']],
  trust: [['--yes', 'Approve without asking']],
  new: [['--dir', 'Scaffold under this folder']],
});

// `lattice video …` (lib/export/video-cli.mjs). Same drift test as above.
const VIDEO_VALUE = Object.freeze({
  __proto__: null,
  '--fps': null,
  '--lead-in': null,
  '--outro': null,
  '--size': () => Object.keys(require('../engine/sizes.js').SIZES),
  '--mode': PLAYER_MODES,
});
const VIDEO_OPTIONS = Object.freeze([
  ['--mode', 'Export a deck.md in light, dark or system'],
  ['--size', 'Lay a deck.md out on another canvas'],
  ['--no-guide', "Leave the Guide out of a deck.md's video"],
  ['--no-captions', 'No caption track and no .vtt'],
  ['--fps', 'Frames per second'],
  ['--lead-in', 'Hold on slide 1 (ms)'],
  ['--outro', 'Hold on the last slide (ms)'],
  ['-q', 'No progress output'],
  ['--quiet', 'No progress output'],
  ['-h', 'Show help'],
  ['--help', 'Show help'],
]);

/**
 * The package store this command line names (`--packages DIR`), else the default. The same
 * rule as `packagesRoot` in lib/packages/home.js, restated rather than required: home.js loads
 * the package reader (~19 ms), which would be a third of every Tab press. Change both together.
 * The word arrives as typed, so a leading `~` is expanded here, as the shell will at run time.
 */
function storeRoot(words) {
  let flag;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === '--packages' && words[i + 1] !== undefined) flag = words[i + 1];
    else if (w.startsWith('--packages=')) flag = w.slice('--packages='.length);
  }
  if (flag === '~' || flag?.startsWith('~/')) flag = path.join(require('node:os').homedir(), flag.slice(1));
  if (flag) return path.resolve(flag);
  const home = process.env.LATTICE_HOME ? path.resolve(process.env.LATTICE_HOME) : path.join(require('node:os').homedir(), '.lattice');
  return path.join(home, 'packages');
}

/** Installed package names of one type: the store's folder names. Read, never validated. */
function installed(words, type) {
  try {
    return fs.readdirSync(path.join(storeRoot(words), type), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name);
  } catch { return []; }
}

/** Every palette a render accepts: the shipped ones plus the installed theme packages. */
function palettes(words) {
  let shipped = [];
  try {
    shipped = require('../theme/files.js').themeEntries(path.join(PKG_ROOT, 'themes'))
      .filter((f) => f.endsWith('.css')).map((f) => f.slice(0, -4));
  } catch { /* themes/ unreadable: offer the installed ones */ }
  return [...new Set([...shipped, ...installed(words, 'theme')])].sort();
}

function pluginNames() {
  try { return require('../plugins/grammar.generated.mjs').PLUGIN_GRAMMAR.map((g) => g.name); }
  catch { return []; }
}

/** One result: a directive and the candidates. */
const result = (directive, candidates = []) => ({ directive, candidates });

/** `[value, desc]` rows → the ones starting with `cur`, each prefixed with `lead`. */
function matching(rows, cur, lead = '') {
  const out = [];
  for (const row of rows) {
    const [value, desc = ''] = Array.isArray(row) ? row : [row];
    const full = lead + value;
    if (full.startsWith(cur)) out.push([full, desc]);
  }
  return out;
}

/**
 * The values of a value option. `spec` is an options.js `complete` field (or a subcommand's);
 * `lead` is what precedes the value inside the current word (`--palette=`), `cur` that word.
 */
function values(spec, cur, lead, words, list) {
  if (spec == null) return result(':values');
  if (typeof spec === 'string' && spec.startsWith('files')) return result(`:files ${spec.slice(6)}`.trimEnd());
  if (spec === 'dirs') return result(':dirs');
  let choices;
  if (spec === 'palettes') choices = palettes(words);
  else if (spec === 'plugins' || spec === 'plugins+none') choices = [...pluginNames(), ...(spec === 'plugins+none' ? ['none'] : [])];
  else choices = typeof spec === 'function' ? spec() : spec;
  if (list) {
    // A comma list completes its LAST item; the earlier items ride along in the prefix.
    const typed = cur.slice(lead.length);
    const cut = typed.lastIndexOf(',') + 1;
    const done = new Set(typed.slice(0, cut).split(',').filter(Boolean));
    return result(':values', matching(choices.filter((c) => !done.has(c)), cur, lead + typed.slice(0, cut)));
  }
  return result(':values', matching(choices, cur, lead));
}

/** `--flag=partial` as `[flag, lead]`, else null. */
function splitEq(cur) {
  const m = /^(--?[A-Za-z][\w-]*)=/.exec(cur);
  return m ? [m[1], m[0]] : null;
}

function completeRender(prev, cur) {
  const eq = splitEq(cur);
  if (eq && VALUE_BY_FLAG[eq[0]]) {
    const row = VALUE_BY_FLAG[eq[0]];
    return values(row.complete, cur, eq[1], prev, row.list);
  }
  const last = prev.at(-1);
  if (last !== undefined && VALUE_BY_FLAG[last] && !splitEq(last)) {
    const row = VALUE_BY_FLAG[last];
    return values(row.complete, cur, '', prev, row.list);
  }
  if (cur.startsWith('-')) {
    const used = new Set(prev.filter((w) => SWITCH_BY_FLAG[w]).flatMap((w) => SWITCH_BY_FLAG[w].flags));
    const rows = [...VALUE_OPTIONS, ...SWITCHES, ...EARLY_FLAGS]
      .flatMap((r) => r.flags.filter((f) => !used.has(f)).map((f) => [f, r.desc]));
    return result(':values', matching(rows, cur));
  }
  // Positional: <deck.md> <output> [palette], or <deck.md> <custom.css> <output> [palette].
  const positional = [];
  for (let i = 0; i < prev.length; i++) {
    const w = prev[i];
    if (VALUE_BY_FLAG[w]) { i++; continue; }
    if (w.startsWith('-')) continue;
    positional.push(w);
  }
  const n = positional.length;
  if (n === 0) return result(':files md', matching(SUBCOMMANDS, cur));
  if (n === 1) return result(`:files ${[...OUTPUT_EXTS, 'css'].join(',')}`);
  const cssForm = /\.css$/i.test(positional[1]);
  if (n === 2 && cssForm) return result(`:files ${OUTPUT_EXTS.join(',')}`);
  if (n === 2 || (n === 3 && cssForm)) return result(':values', matching(palettes(prev), cur));
  return result(':values');
}

function completePackages(prev, cur) {
  // prev[0] is 'packages'.
  const rest = prev.slice(1);
  const eq = splitEq(cur);
  if (eq && has(PACKAGES_VALUE, eq[0])) return values(PACKAGES_VALUE[eq[0]], cur, eq[1], prev);
  const last = rest.at(-1);
  if (has(PACKAGES_VALUE, last) && !splitEq(last)) return values(PACKAGES_VALUE[last], cur, '', prev);
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (has(PACKAGES_VALUE, rest[i])) { i++; continue; }
    if (!rest[i].startsWith('-')) positional.push(rest[i]);
  }
  const cmd = positional[0];
  if (cur.startsWith('-')) {
    return result(':values', matching([...(PACKAGES_OPTIONS[cmd] || []), ...PACKAGES_OPTIONS.all], cur));
  }
  if (positional.length === 0) return result(':values', matching(PACKAGES_COMMANDS, cur));
  if (positional.length > 1) return result(':values');
  if (cmd === 'add' || cmd === 'check') return result(':files zip');
  if (cmd === 'new') return result(':values', matching([['plugin', 'Scaffold a plugin']], cur));
  if (cmd === 'export' || cmd === 'remove') {
    const { TYPES } = require('../packages/kinds.js');
    const names = TYPES.flatMap((t) => installed(prev, t).map((n) => [`${t}/${n}`, 'installed']));
    if (cmd === 'export') {
      try {
        for (const p of require('../packages/packages.generated.json').packages) names.push([`${p.type}/${p.name}`, 'shipped']);
      } catch { /* no shipped index: installed only */ }
    }
    return result(':values', matching(names, cur));
  }
  if (cmd === 'trust' || cmd === 'untrust') {
    return result(':values', matching(installed(prev, 'component').map((n) => [`component/${n}`, 'installed']), cur));
  }
  return result(':values');
}

function completeVideo(prev, cur) {
  const rest = prev.slice(1);
  const eq = splitEq(cur);
  if (eq && has(VIDEO_VALUE, eq[0])) return values(VIDEO_VALUE[eq[0]], cur, eq[1], prev);
  const last = rest.at(-1);
  if (has(VIDEO_VALUE, last) && !splitEq(last)) return values(VIDEO_VALUE[last], cur, '', prev);
  if (cur.startsWith('-')) return result(':values', matching(VIDEO_OPTIONS, cur));
  const positional = rest.filter((w, i) => !w.startsWith('-') && !has(VIDEO_VALUE, rest[i - 1]));
  if (positional.length === 0) return result(':files md,html');
  if (positional.length === 1) return result(':files mp4');
  return result(':values');
}

/**
 * The candidates for one Tab press.
 * @param {string[]} prev  the words after `lattice`, before the cursor
 * @param {string} cur     the word under the cursor ('' after a space)
 */
function complete(prev, cur) {
  const sub = prev[0];
  if (sub === 'packages') return completePackages(prev, cur);
  if (sub === 'video') return completeVideo(prev, cur);
  if (sub === 'completion') return result(':values', prev.length === 1 ? matching(SHELLS, cur) : []);
  if (sub === '__complete') return result(':values');
  return completeRender(prev, cur);
}

/** The protocol's argv → `{ prev, cur }`. */
function parseProtocol(args) {
  if (args[0]?.startsWith('--lattice-cur=')) return { prev: args.slice(1), cur: args[0].slice('--lattice-cur='.length) };
  return { prev: args.slice(0, -1), cur: args.at(-1) ?? '' };
}

/** `lattice __complete …` → the protocol's stdout text. */
function protocolOutput(args) {
  const { prev, cur } = parseProtocol(args);
  const { directive, candidates } = complete(prev, cur);
  return `${[directive, ...candidates.map(([c, d]) => (d ? `${c}\t${d}` : c))].join('\n')}\n`;
}

// ── The four scripts ────────────────────────────────────────────────────────────────────────
// Each embeds how to reach this file FAST (node + its absolute path, as resolved when the
// script was printed) and falls back to `lattice __complete` when either path is gone, e.g.
// after a reinstall moved the package. `eval "$(lattice completion bash)"` re-resolves on
// every new shell, so the fast path tracks the install.

const sq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`; // POSIX single quotes (bash, zsh)
const fishq = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;

function bashScript(node, self) {
  return `# lattice completion for bash 3.2 and newer. Install (one line, in ~/.bashrc):
#   eval "$(lattice completion bash)"
_lattice_complete_run() {
  if [[ -x ${sq(node)} && -f ${sq(self)} ]]; then
    ${sq(node)} ${sq(self)} "$@"
  else
    command lattice __complete "$@"
  fi
}
# One word as the shell will pass it: 'a b', "a b" and a\\ b all become a b.
_lattice_complete_unquote() {
  local w="$1"
  case "$w" in
    \\'*) w="\${w#\\'}"; w="\${w%\\'}" ;;
    \\"*) w="\${w#\\"}"; w="\${w%\\"}" ;;
    *) w="\${w//\\\\\\\\/$'\\001'}"; w="\${w//\\\\/}"; w="\${w//$'\\001'/\\\\}" ;;
  esac
  printf '%s' "$w"
}
_lattice_complete() {
  # bash splits a word at COMP_WORDBREAKS ('=' and ':' among them); lattice does not. Rejoin the
  # pieces that touch in the line, up to the cursor, so every word is whole again.
  local line="\${COMP_LINE:0:COMP_POINT}" pos=0 i w gap
  local -a raw=() args=()
  for ((i = 0; i <= COMP_CWORD; i++)); do
    gap=0
    while [[ "\${line:pos:1}" == [[:space:]] ]]; do pos=$((pos + 1)); gap=1; done
    if ((i == COMP_CWORD)); then w="\${line:pos}"; else w="\${COMP_WORDS[i]}"; fi
    if ((i > 0 && gap == 0)); then raw[\${#raw[@]}-1]="\${raw[\${#raw[@]}-1]}$w"; else raw[\${#raw[@]}]="$w"; fi
    pos=$((pos + \${#w}))
  done
  for ((i = 1; i < \${#raw[@]}; i++)); do args[\${#args[@]}]="$(_lattice_complete_unquote "\${raw[i]}")"; done
  ((\${#raw[@]} > 1)) || args[0]=""
  # What readline will replace: the piece after the last COMP_WORDBREAKS character (empty when
  # the cursor sits right after one), skipping a break the user escaped (c\\:d). Worked out from
  # the text, not from COMP_WORDS: bash 3.2 does not split COMP_WORDS at '=', yet its readline
  # still replaces only the piece.
  local full="\${raw[\${#raw[@]}-1]}" piece k c n
  piece="$full"
  case "$full" in
    \\'*|\\"*) ;;
    *)
      for ((k = \${#full} - 1; k >= 0; k--)); do
        c="\${full:k:1}"
        case "$c" in [[:space:]]|\\'|\\") continue ;; esac
        [[ "$COMP_WORDBREAKS" == *"$c"* ]] || continue
        n=0
        while ((k - n - 1 >= 0)) && [[ "\${full:k-n-1:1}" == '\\' ]]; do n=$((n + 1)); done
        ((n % 2)) && continue
        piece="\${full:k+1}"
        break
      done ;;
  esac
  local lead="\${full:0:\${#full}-\${#piece}}"
  local out
  out="$(_lattice_complete_run "\${args[@]}" 2>/dev/null)" || return 0
  local directive="\${out%%$'\\n'*}" body=""
  [[ "$out" == *$'\\n'* ]] && body="\${out#*$'\\n'}"
  COMPREPLY=()
  while IFS= read -r c; do
    [[ -z "$c" ]] && continue
    c="\${c%%$'\\t'*}"
    [[ -n "$lead" && "$c" == "$lead"* ]] && c="\${c:\${#lead}}"
    COMPREPLY[\${#COMPREPLY[@]}]="$c"
  done <<< "$body"
  # bash 4+ marks file replies with compopt (escaped, '/' on folders). bash 3.2 has no compopt,
  # so the script is registered with nospace and does both itself: it escapes a file reply,
  # ends a folder with '/' and every other reply with a space.
  local own=1 nvals=\${#COMPREPLY[@]} nfiles=0
  type compopt >/dev/null 2>&1 && own=0
  local value f t e j dup isdir exts nocase=0
  case "$directive" in
    ':files'*|':dirs')
      value="$(_lattice_complete_unquote "$piece")"
      # With '=' taken out of COMP_WORDBREAKS the piece still carries the --flag=.
      [[ "$value" == -*=* ]] && value="\${value#*=}"
      exts="\${directive#:files}"; exts="\${exts# }"; exts="\${exts//,/ }"
      shopt -q nocasematch && nocase=1
      shopt -s nocasematch
      while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        # compgen keeps a typed ~/ as is, and [[ -d ]] does not expand it.
        t="$f"
        [[ "$t" == "~/"* ]] && t="$HOME/\${t:2}"
        isdir=0
        [[ -d "$t" ]] && isdir=1
        if ((!isdir)); then
          [[ "$directive" == ':dirs' ]] && continue
          if [[ -n "$exts" ]]; then
            dup=1
            for e in $exts; do [[ "$f" == *."$e" ]] && { dup=0; break; }; done
            ((dup)) && continue
          fi
        fi
        # A folder named like a subcommand (packages/) must not shadow the subcommand.
        dup=0
        for ((j = 0; j < nvals; j++)); do [[ "\${COMPREPLY[j]}" == "$f" ]] && { dup=1; break; }; done
        ((dup)) && continue
        if ((own)); then
          case "$piece" in
            \\'*|\\"*) ;;
            "~/"*) f="~/$(printf '%q' "\${f:2}")" ;;
            *) f="$(printf '%q' "$f")" ;;
          esac
          if ((isdir)); then f="$f/"; else f="$f "; fi
        fi
        COMPREPLY[\${#COMPREPLY[@]}]="$f"
        nfiles=$((nfiles + 1))
      done <<< "$(compgen -f -- "$value")"
      ((nocase)) || shopt -u nocasematch ;;
  esac
  if ((own)); then
    for ((j = 0; j < nvals; j++)); do COMPREPLY[j]="\${COMPREPLY[j]} "; done
  elif ((nfiles)); then
    compopt -o filenames
  fi
  return 0
}
if type compopt >/dev/null 2>&1; then
  complete -F _lattice_complete lattice
else
  complete -o nospace -F _lattice_complete lattice
fi
`;
}

function zshScript(node, self) {
  return `#compdef lattice
# lattice completion for zsh. Install (one line, in ~/.zshrc, after compinit):
#   source <(lattice completion zsh)
_lattice_complete_run() {
  if [[ -x ${sq(node)} && -f ${sq(self)} ]]; then
    ${sq(node)} ${sq(self)} "$@"
  else
    command lattice __complete "$@"
  fi
}
_lattice() {
  local -a out vals
  local directive line exts
  out=("\${(@f)$(_lattice_complete_run "\${(@)words[2,CURRENT]}" 2>/dev/null)}")
  directive="\${out[1]}"
  for line in "\${(@)out[2,-1]}"; do
    [[ -z "$line" ]] && continue
    # _describe reads value:description, so a ':' inside the value is escaped.
    if [[ "$line" == *$'\\t'* ]]; then
      vals+=("\${\${line%%$'\\t'*}//:/\\\\:}:\${line#*$'\\t'}")
    else
      vals+=("\${line//:/\\\\:}")
    fi
  done
  local ret=1
  (( \${#vals} )) && _describe -t values 'lattice' vals && ret=0
  # A path after --flag= completes past the '=': the flag stays as typed.
  [[ "$directive" == :files* || "$directive" == :dirs ]] && [[ "\${words[CURRENT]}" == -*=* ]] && compset -P '*='
  case "$directive" in
    ':files')   _files && ret=0 ;;
    ':files '*) exts="\${directive#:files }"; _files -g "*.(\${exts//,/|})(-.)" && ret=0 ;;
    ':dirs')    _files -/ && ret=0 ;;
  esac
  return ret
}
compdef _lattice lattice
`;
}

function fishScript(node, self) {
  return `# lattice completion for fish. Install (one line):
#   mkdir -p ~/.config/fish/completions && lattice completion fish > ~/.config/fish/completions/lattice.fish
function __lattice_complete_run
    if test -x ${fishq(node)}; and test -f ${fishq(self)}
        ${fishq(node)} ${fishq(self)} $argv
    else
        command lattice __complete $argv
    end
end
function __lattice_complete
    set -l words (commandline -opc) (commandline -ct)
    set -e words[1]
    set -l out (__lattice_complete_run $words 2>/dev/null)
    or return
    set -l directive $out[1]
    for line in $out[2..-1]
        printf '%s\\n' $line
    end
    set -l cur (commandline -ct)
    switch $directive
        case ':files'
            __fish_complete_path $cur
        case ':files *'
            set -l exts (string split , (string replace ':files ' '' -- $directive))
            set -l re '(?:/|\\.(?:'(string join '|' -- $exts)'))(?:\\t.*)?$'
            __fish_complete_path $cur | string match -ri --entire -- $re
        case ':dirs'
            __fish_complete_directories $cur
    end
end
complete -c lattice -f -a '(__lattice_complete)'
`;
}

function powershellScript(node, self) {
  return `# lattice completion for PowerShell. Install (one line, in your $PROFILE):
#   lattice completion powershell | Out-String | Invoke-Expression
Register-ArgumentCompleter -Native -CommandName lattice -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    # A word as the program will receive it: 'a b' and "a b" become a b.
    $unquote = { param($t) if ($t -match '^([''"])(.*?)\\1?$') { $Matches[2] } else { $t } }
    $words = @($commandAst.CommandElements |
        Where-Object { $_.Extent.EndOffset -le $cursorPosition } |
        Select-Object -Skip 1 |
        ForEach-Object { $_.Extent.Text })
    # The word under the cursor, whole. PowerShell hands over only the part after a comma
    # (mermaid,m is an array to it), so the rest is a lead stripped back off each candidate.
    $cur = $wordToComplete
    if ($wordToComplete -ne '' -and $words.Count -gt 0) {
        $cur = $words[-1]
        $words = @($words | Select-Object -SkipLast 1)
    }
    $lead = if ($cur.EndsWith($wordToComplete)) { $cur.Substring(0, $cur.Length - $wordToComplete.Length) } else { '' }
    # --lattice-cur= carries the current word: Windows PowerShell drops an empty native argument.
    $argv = @("--lattice-cur=$(& $unquote $cur)") + @($words | ForEach-Object { & $unquote $_ })
    $node = ${psq(node)}
    $self = ${psq(self)}
    if ((Test-Path -LiteralPath $node) -and (Test-Path -LiteralPath $self)) {
        $out = @(& $node $self @argv 2>$null)
    } else {
        $out = @(& lattice __complete @argv 2>$null)
    }
    if ($out.Count -eq 0) { return }
    $directive = $out[0]
    $values = @{}
    foreach ($line in ($out | Select-Object -Skip 1)) {
        if (-not $line) { continue }
        $parts = $line -split "\`t", 2
        if ($lead -and $parts[0].StartsWith($lead)) { $parts[0] = $parts[0].Substring($lead.Length) }
        $values[$parts[0]] = $true
        $tip = if ($parts.Count -gt 1 -and $parts[1]) { $parts[1] } else { $parts[0] }
        [System.Management.Automation.CompletionResult]::new($parts[0], $parts[0], 'ParameterValue', $tip)
    }
    if ($directive -like ':files*' -or $directive -eq ':dirs') {
        $exts = @(($directive -replace '^:files ?', '') -split ',' | Where-Object { $_ })
        # A path after --flag= lists from past the '=', and the flag goes back on each result.
        $flag = ''
        $value = & $unquote $wordToComplete
        if ($value -match '^(-[^=]*=)(.*)$') { $flag = $Matches[1]; $value = & $unquote $Matches[2] }
        # Keep the folder as typed (~/, ../, an absolute path), and show dotfiles when asked for.
        $cut = [Math]::Max($value.LastIndexOf('/'), $value.LastIndexOf('\\'))
        $typedDir = if ($cut -ge 0) { $value.Substring(0, $cut + 1) } else { '' }
        $dot = $value.Substring($cut + 1).StartsWith('.')
        Get-ChildItem -Path "$value*" -Force:$dot -ErrorAction SilentlyContinue | ForEach-Object {
            $isDir = $_.PSIsContainer
            if ($directive -eq ':dirs' -and -not $isDir) { return }
            if (-not $isDir -and $exts.Count -and ($exts -notcontains $_.Extension.TrimStart('.').ToLower())) { return }
            # A folder named like a subcommand (packages) must not shadow it.
            if ($values.ContainsKey($_.Name) -and -not $flag -and -not $typedDir) { return }
            $text = "$flag$typedDir$($_.Name)"
            if ($text -match '[\\s''"$\`(){};&@#,|<>]') { $text = "'" + ($text -replace "'", "''") + "'" }
            [System.Management.Automation.CompletionResult]::new($text, $_.Name, 'ProviderItem', $_.FullName)
        }
    }
}
`;
}

const SCRIPTS = Object.freeze({ bash: bashScript, zsh: zshScript, fish: fishScript, powershell: powershellScript });

/** `lattice completion <shell>` → the script text, or null for an unknown shell. */
function script(shell, { node = process.execPath, self = path.join(PKG_ROOT, 'lib', 'cli', 'complete.js') } = {}) {
  const make = SCRIPTS[String(shell || '').toLowerCase()];
  return make ? make(node, self) : null;
}

/** `lattice completion …`: print the script, or usage on stderr. Returns the exit code. */
function completionCommand(args) {
  const shell = args[0];
  if (shell === '-h' || shell === '--help' || shell === undefined) {
    const usage = `usage: lattice completion <${SHELLS.join('|')}>

Prints a script that makes Tab complete lattice's subcommands, options, option values
and installed package names. Install it with one line:
  bash        eval "$(lattice completion bash)"                       # in ~/.bashrc
  zsh         source <(lattice completion zsh)              # in ~/.zshrc, after compinit
  fish        mkdir -p ~/.config/fish/completions && lattice completion fish > ~/.config/fish/completions/lattice.fish
  powershell  lattice completion powershell | Out-String | Invoke-Expression   # in $PROFILE
`;
    (shell === undefined ? process.stderr : process.stdout).write(usage);
    return shell === undefined ? 1 : 0;
  }
  const text = script(shell);
  if (text === null) {
    process.stderr.write(`error: no completion for ${JSON.stringify(shell)}: pick one of ${SHELLS.join(', ')}\n`);
    return 1;
  }
  process.stdout.write(text);
  return 0;
}

module.exports = {
  SHELLS, SUBCOMMANDS, PACKAGES_COMMANDS, PACKAGES_VALUE, PACKAGES_OPTIONS, VIDEO_VALUE, VIDEO_OPTIONS,
  complete, parseProtocol, protocolOutput, script, completionCommand, storeRoot,
};

// Run directly by the installed scripts: `node lib/cli/complete.js <words…>`.
if (require.main === module) process.stdout.write(protocolOutput(process.argv.slice(2)));
