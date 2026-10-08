/**
 * Unit: shell completion (lib/cli/complete.js) offers what the CLI accepts, and the real
 * scripts deliver it.
 *
 *   1. DRIFT — every option the three parsers accept (the render command's table in
 *      lib/cli/options.js, `lattice packages`' and `lattice video`'s if-chains) is a Tab
 *      candidate, and `parseArgs` carries no flag of its own outside that table. Both checks
 *      have a failing arm, so a green run means the check ran.
 *   2. VALUES — closed-set values, the palettes, plugins and installed package names.
 *   3. THE SCRIPTS — the bash script is sourced in a real bash and driven the way bash drives
 *      it (COMP_WORDS, COMP_CWORD, COMP_LINE, COMP_POINT → COMPREPLY). fish (`complete -C`) and
 *      PowerShell (`TabExpansion2`) run through their own completion engines where the shell
 *      is installed.
 *   4. INTERACTIVE — bash and zsh run in a pty: a line is typed, Tab pressed, and the line read
 *      back, so the shell's own word splitting, quoting and insertion are under test too.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const C = require('../../../lib/cli/complete.js');
const O = require('../../../lib/cli/options.js');

const FLAG = /'(--?[A-Za-z][\w-]*)'/g;
/** Flags parseArgs may still name itself: the retired ones it refuses with a pointer. */
const PARSEARGS_OWN = new Set(['--strip-captions']);

function between(src, start, end) {
  const from = src.indexOf(start);
  assert.ok(from >= 0, `could not find ${start}; the parser moved, so update this test`);
  return src.slice(from, src.indexOf(end, from));
}
const literals = (s) => new Set([...s.matchAll(FLAG)].map((m) => m[1]));
const offered = (prev, cur) => new Set(C.complete(prev, cur).candidates.map(([c]) => c));

/** Flags in `accepted` that Tab never offers under `prevs` (any of them). */
function missing(accepted, prevs) {
  const all = new Set(prevs.flatMap((p) => [...offered(p, '-')]));
  return [...accepted].filter((f) => !all.has(f));
}
/** Flag literals in a parseArgs body that bypass the options table. */
const strayInParseArgs = (body) => [...literals(body)].filter((f) => !PARSEARGS_OWN.has(f));

const PARSE_ARGS = between(read('lattice.js'), 'function parseArgs(argv)', 'return { flags, positional };');
const RENDER = new Set([...O.VALUE_OPTIONS, ...O.SWITCHES, ...O.EARLY_FLAGS].flatMap((r) => r.flags));
const PACKAGES = literals(between(read('lib/packages/cli.js'), 'function parse(argv)', 'return { flags, pos };'));
const VIDEO = new Set([...read('lib/export/video-cli.mjs').matchAll(/a === '(--?[A-Za-z][\w-]*)'/g)].map((m) => m[1]));
const PACKAGES_PREVS = [['packages'], ...C.PACKAGES_COMMANDS.map(([c]) => ['packages', c])];

describe('drift: Tab offers every option the CLI accepts', () => {
  test('the render command: every row of the options table', () => {
    assert.ok(RENDER.size >= 45, `only ${RENDER.size} render options read; the table moved`);
    assert.deepEqual(missing(RENDER, [[]]), []);
  });

  test('parseArgs takes its options from the table, not its own if-chain', () => {
    assert.deepEqual(strayInParseArgs(PARSE_ARGS), []);
  });

  test('lattice packages and lattice video', () => {
    assert.ok(PACKAGES.size >= 8 && VIDEO.size >= 8, 'the subcommand parsers moved');
    assert.deepEqual(missing(PACKAGES, PACKAGES_PREVS), []);
    assert.deepEqual(missing(VIDEO, [['video']]), []);
  });

  test('failing arms: an option Tab does not offer, and a flag parseArgs adds on its own', () => {
    assert.deepEqual(missing(new Set([...RENDER, '--not-an-option']), [[]]), ['--not-an-option']);
    const sneaky = PARSE_ARGS.replace('for (let i = 0;', "if (a === '--sneaky') flags.sneaky = true;\n  for (let i = 0;");
    assert.deepEqual(strayInParseArgs(sneaky), ['--sneaky']);
  });

  test('a switch already typed is not offered again; a repeatable value option is', () => {
    const o = offered(['--print', '--disable-plugin', 'math'], '--');
    assert.ok(!o.has('--print'));
    assert.ok(o.has('--disable-plugin') && o.has('--raster'));
  });
});

describe('robustness', () => {
  test('a word named after an Object.prototype member is just a word', () => {
    for (const w of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      for (const prev of [[w], ['packages', w], ['video', w], ['packages', 'export', w], ['-p', w]]) {
        assert.doesNotThrow(() => C.protocolOutput([...prev, '']), `${prev.join(' ')}`);
      }
      assert.equal(O.VALUE_BY_FLAG[w], undefined);
      assert.equal(O.SWITCH_BY_FLAG[w], undefined);
    }
    // A deck named `constructor` is still the first positional, so the output comes next.
    assert.equal(C.complete(['constructor'], '').directive, ':files pdf,pptx,odp,png,zip,html,css');
  });

  test('the store Tab reads is the store packagesRoot resolves', () => {
    const { packagesRoot } = require('../../../lib/packages/home.js');
    const saved = process.env.LATTICE_HOME;
    try {
      for (const home of [undefined, '/tmp/lh']) {
        if (home === undefined) delete process.env.LATTICE_HOME;
        else process.env.LATTICE_HOME = home;
        assert.equal(C.storeRoot([]), packagesRoot());
        assert.equal(C.storeRoot(['--packages', 'rel/dir']), packagesRoot({ flag: 'rel/dir' }));
        assert.equal(C.storeRoot(['--packages=/abs']), packagesRoot({ flag: '/abs' }));
      }
      assert.equal(C.storeRoot(['--packages', '~/store']), path.join(os.homedir(), 'store'));
    } finally {
      if (saved === undefined) delete process.env.LATTICE_HOME;
      else process.env.LATTICE_HOME = saved;
    }
  });
});

describe('values', () => {
  let home;
  before(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-complete-'));
    for (const d of ['packages/theme/my-brand', 'packages/component/kpi-strip', 'other/theme/elsewhere']) {
      fs.mkdirSync(path.join(home, d), { recursive: true });
    }
    process.env.LATTICE_HOME = home;
  });
  after(() => {
    delete process.env.LATTICE_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('palettes: shipped and installed, by -p, --palette= and the third positional', () => {
    const p = offered(['-p'], '');
    for (const name of ['indaco', 'cuoio', 'onyx-dark', 'my-brand']) assert.ok(p.has(name), name);
    assert.deepEqual([...offered([], '--palette=ind')], ['--palette=indaco', '--palette=indaco-dark']);
    assert.deepEqual([...offered(['deck.md', 'out.pdf'], 'my')], ['my-brand']);
    assert.deepEqual([...offered(['deck.md', 'x.css', 'out.pdf'], 'my')], ['my-brand']);
  });

  test('--packages DIR on the line picks the store Tab reads', () => {
    const p = offered(['--packages', path.join(home, 'other'), '-p'], 'e');
    assert.deepEqual([...p], ['elsewhere']);
  });

  test('closed sets come from the modules that validate them', () => {
    assert.deepEqual([...offered(['--paper'], '')], O.PAPER_CHOICES);
    assert.deepEqual([...offered(['--overflow-marker'], '')], ['author', 'reader', 'off']);
    assert.deepEqual([...offered(['--image-format'], '')], require('../../../lib/export/image-set.js').IMAGE_FORMATS);
    assert.ok(offered(['--size'], '').has('4K') && offered(['video', '--size'], '').has('story'));
    assert.deepEqual([...offered(['video', '--mode'], '')], ['light', 'dark', 'system']);
  });

  test('a comma list completes its last item and skips the ones typed', () => {
    const o = [...offered(['--disable-plugin'], 'mermaid,m')];
    assert.deepEqual(o, ['mermaid,math']);
    assert.ok(offered(['--default-plugins'], '').has('none'));
  });

  test('paths are left to the shell, with the extensions that fit', () => {
    assert.equal(C.complete([], '').directive, ':files md');
    assert.equal(C.complete(['deck.md'], '').directive, ':files pdf,pptx,odp,png,zip,html,css');
    assert.equal(C.complete(['--packages'], '').directive, ':dirs');
    assert.equal(C.complete(['--image-quality'], '').directive, ':values');
    assert.equal(C.complete(['video'], '').directive, ':files md,html');
    assert.equal(C.complete(['packages', 'add'], '').directive, ':files zip');
  });

  test('subcommands and installed package names', () => {
    assert.deepEqual([...offered([], 'pa')], ['packages']);
    assert.deepEqual([...offered(['packages'], 'ex')], ['export']);
    assert.deepEqual([...offered(['packages', 'remove'], '')], ['theme/my-brand', 'component/kpi-strip']);
    assert.deepEqual([...offered(['packages', 'trust'], '')], ['component/kpi-strip']);
    assert.ok(offered(['packages', 'export'], 'theme/').has('theme/indaco'), 'export also takes shipped packages');
    assert.deepEqual([...offered(['packages', '--type'], '')], require('../../../lib/packages/kinds.js').TYPES);
    assert.deepEqual([...offered(['completion'], '')], ['bash', 'zsh', 'fish', 'powershell']);
  });

  test('the protocol: the last word is the current one, or --lattice-cur= carries it', () => {
    assert.equal(C.protocolOutput(['--pal']), ':values\n--palette\tColor palette\n');
    assert.equal(C.protocolOutput(['--lattice-cur=--pal']), ':values\n--palette\tColor palette\n');
    assert.equal(C.protocolOutput(['--lattice-cur=', 'completion']), ':values\nbash\nzsh\nfish\npowershell\n');
  });

  test('lattice completion: a script per shell, an error for any other', () => {
    for (const s of C.SHELLS) assert.match(C.script(s), /lattice __complete/);
    assert.equal(C.script('cmd'), null);
    const ok = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), 'completion', 'bash'], { encoding: 'utf8' });
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /complete -F _lattice_complete lattice/);
    const bad = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), 'completion', 'cmd'], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /pick one of bash, zsh, fish, powershell/);
  });
});

const has = (bin) => spawnSync('sh', ['-c', `command -v ${bin}`]).status === 0;
/**
 * The shells to drive: the one on PATH, plus any binaries named in COMPLETION_TEST_BASH /
 * COMPLETION_TEST_FISH (colon lists), e.g. a bash 3.2 build, macOS's default, or fish 4.
 */
const shells = (name, envVar) => [...(has(name) ? [name] : []), ...(process.env[envVar] || '').split(':').filter(Boolean)];

describe('the real scripts', () => {
  let dir;
  let script;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-complete-sh-'));
    for (const f of ['deck.md', 'notes.txt', 'talk.html', 'my deck.md', 'out.pdf', 'style.css', "it's.pdf"]) fs.writeFileSync(path.join(dir, f), '');
    fs.mkdirSync(path.join(dir, 'decks'));
    fs.mkdirSync(path.join(dir, 'sp dir'));
    fs.mkdirSync(path.join(dir, 'packages'));
    script = (shell, opts) => {
      // PowerShell dot-sources only a .ps1.
      const file = path.join(dir, `lattice${opts ? '-alt' : ''}.${shell === 'powershell' ? 'ps1' : shell}`);
      fs.writeFileSync(file, C.script(shell, opts));
      return file;
    };
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  /**
   * COMPREPLY for `line` in a real bash with `file` sourced. `words` is COMP_WORDS exactly as an
   * interactive bash splits that line (at COMP_WORDBREAKS: `--palette=in` is three words, and a
   * quoted or escaped space stays inside its word); each split below was recorded from one.
   */
  function bash(bin, file, line, words, env = process.env) {
    const drive = `source "$1"
COMP_LINE="$2"; COMP_POINT=\${#COMP_LINE}
shift 2; COMP_WORDS=("$@"); COMP_CWORD=$((\${#COMP_WORDS[@]}-1))
_lattice_complete
for c in "\${COMPREPLY[@]}"; do printf '%s\\n' "$c"; done`;
    const r = spawnSync(bin, ['--norc', '--noprofile', '-c', drive, 'drive', file, line, ...words], { cwd: dir, encoding: 'utf8', env });
    assert.equal(r.status, 0, r.stderr);
    // bash 3.2 has no compopt, so the script escapes file replies and ends each reply with a
    // space or '/' itself; bash 4+ leaves that to readline. Compare the bare names.
    return r.stdout.split('\n').filter(Boolean)
      .map((c) => c.replace(/ $/, '').replace(/\/$/, '').replace(/\\(.)/g, '$1')).sort();
  }

  for (const bin of shells('bash', 'COMPLETION_TEST_BASH')) {
    test(`bash (${bin}): options, values, subcommands and paths`, () => {
      const f = script('bash');
      const t = (line, words) => bash(bin, f, line, words);
      assert.deepEqual(t('lattice --pa', ['lattice', '--pa']), ['--packages', '--palette', '--paper']);
      const p = t('lattice -p ', ['lattice', '-p', '']);
      assert.ok(p.includes('indaco') && p.includes('cuoio') && p.length >= 30, p.join(' '));
      assert.deepEqual(t('lattice pack', ['lattice', 'pack']), ['packages']);
      assert.deepEqual(t('lattice ', ['lattice', '']), ['completion', 'deck.md', 'decks', 'my deck.md', 'packages', 'sp dir', 'video']);
      assert.deepEqual(t('lattice video ', ['lattice', 'video', '']), ['deck.md', 'decks', 'my deck.md', 'packages', 'sp dir', 'talk.html']);
    });

    test(`bash (${bin}): a word bash splits at '=' or ':' is rejoined, and only the piece it replaces comes back`, () => {
      const f = script('bash');
      const t = (line, words) => bash(bin, f, line, words);
      assert.deepEqual(t('lattice --palette=ind', ['lattice', '--palette', '=', 'ind']), ['indaco', 'indaco-dark']);
      // The cursor right after the break: bash inserts after it, so the reply is the bare value.
      assert.ok(t('lattice --palette=', ['lattice', '--palette', '=']).includes('indaco'));
      assert.deepEqual(t('lattice --size 16:', ['lattice', '--size', '16', ':']), ['9']);
      assert.deepEqual(t('lattice --output=o', ['lattice', '--output', '=', 'o']), ['out.pdf']);
      assert.deepEqual(t('lattice --output=', ['lattice', '--output', '=']), ['decks', "it's.pdf", 'out.pdf', 'packages', 'sp dir', 'talk.html']);
      assert.deepEqual(t('lattice --css=', ['lattice', '--css', '=']), ['decks', 'packages', 'sp dir', 'style.css']);
      assert.deepEqual(t('lattice --packages=s', ['lattice', '--packages', '=', 's']), ['sp dir']);
    });

    test(`bash (${bin}): a quoted or escaped space stays inside its word`, () => {
      const f = script('bash');
      const t = (line, words) => bash(bin, f, line, words);
      // One positional (the deck) is typed, so the next is the output, not a palette.
      assert.deepEqual(t('lattice my\\ deck.md ', ['lattice', 'my\\ deck.md', '']), ['decks', "it's.pdf", 'out.pdf', 'packages', 'sp dir', 'style.css', 'talk.html']);
      assert.deepEqual(t("lattice 'my deck.md' out.pdf ind", ['lattice', "'my deck.md'", 'out.pdf', 'ind']), ['indaco', 'indaco-dark']);
      assert.deepEqual(t('lattice my\\ d', ['lattice', 'my\\ d']), ['my deck.md']);
    });

    test(`bash (${bin}): falls back to \`lattice __complete\` when the install moved`, () => {
      // Outside `dir`, so the fake `lattice` never shows up as a path candidate in another arm.
      const bin2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-complete-bin-'));
      fs.writeFileSync(path.join(bin2, 'lattice'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(ROOT, 'lattice.js')}" "$@"\n`, { mode: 0o755 });
      const moved = script('bash', { node: path.join(dir, 'gone', 'node'), self: path.join(dir, 'gone', 'complete.js') });
      const env = { ...process.env, PATH: `${bin2}:${process.env.PATH}` };
      try {
        assert.deepEqual(bash(bin, moved, 'lattice --pa', ['lattice', '--pa'], env), ['--packages', '--palette', '--paper']);
      } finally {
        fs.rmSync(bin2, { recursive: true, force: true });
      }
    });
  }

  for (const bin of shells('fish', 'COMPLETION_TEST_FISH')) {
    test(`fish (${bin}): through fish's own engine`, () => {
      const f = script('fish');
      const run = (line) => {
        const r = spawnSync(bin, ['--no-config', '-c', `source ${f}; complete -C${JSON.stringify(line)}`], { cwd: dir, encoding: 'utf8' });
        assert.equal(r.status, 0, r.stderr);
        return r.stdout.split('\n').filter(Boolean).map((l) => l.split('\t')[0]).sort();
      };
      assert.deepEqual(run('lattice --pa'), ['--packages', '--palette', '--paper']);
      assert.deepEqual(run('lattice --palette=indaco'), ['--palette=indaco', '--palette=indaco-dark']);
      assert.deepEqual(run('lattice de'), ['deck.md', 'decks/']);
      assert.deepEqual(run('lattice --output=o'), ['--output=out.pdf']);
      assert.deepEqual(run('lattice my\\ deck.md out.pdf ind'), ['indaco', 'indaco-dark']);
      assert.deepEqual(run('lattice packages un'), ['untrust']);
    });
  }

  test('PowerShell: through TabExpansion2', { skip: !has('pwsh') && 'pwsh is not installed' }, () => {
    const f = script('powershell');
    const lines = [
      'lattice --pa', 'lattice --palette=indaco', 'lattice --disable-plugin mermaid,m', 'lattice packages un',
      'lattice --output=o', 'lattice --css=st', "lattice 'my deck.md' out.pdf ind",
      'lattice --output=it', 'lattice pack',
    ];
    const ps = `. '${f}'\n${lines.map((l) => `(TabExpansion2 -inputScript '${l.replace(/'/g, "''")}' -cursorColumn ${l.length}).CompletionMatches.CompletionText -join ' '`).join('\n')}`;
    const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', ps], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.trim().split(/\r?\n/), [
      '--palette --paper --packages',
      '--palette=indaco --palette=indaco-dark',
      'math',
      'untrust',
      '--output=out.pdf',
      '--css=style.css',
      'indaco indaco-dark',
      "'--output=it''s.pdf'",
      'packages',
    ]);
  });
});

/**
 * A pty driver for an INTERACTIVE shell: for each case it types the line and a Tab, waits for the
 * completion function to say it is done (a TABDONE the setup's wrapper writes to the tty; zsh
 * drops keys typed while a completion runs, which a loaded CI box makes likely), then wraps
 * whatever the line now holds in a printf (Ctrl-A, Ctrl-E) and reads it back. This is the real
 * completion path end to end: the shell's own word splitting, quoting and insertion.
 */
const PTY_DRIVER = String.raw`import json, os, pty, re, select, sys, time
cfg = json.loads(sys.argv[1])
pid, fd = pty.fork()
if pid == 0:
    os.chdir(cfg['cwd'])
    os.execvpe(cfg['argv'][0], cfg['argv'], dict(os.environ, TERM='dumb', **cfg.get('env', {})))
buf = b''
def until(token, timeout=15):
    global buf
    end = time.time() + timeout
    while time.time() < end:
        if token in buf:
            i = buf.index(token) + len(token); out = buf[:i]; buf = buf[i:]; return out
        r, _, _ = select.select([fd], [], [], 0.05)
        if r:
            try: buf += os.read(fd, 65536)
            except OSError: break
    raise SystemExit('timeout waiting for %r; got %r' % (token, buf[-400:]))
def send(s): os.write(fd, s.encode())
for line in cfg['setup']:
    send(line + '\r')
send("PS1=READY'> '\r"); until(b'READY> ')
results = []
for typed in cfg['cases']:
    send(typed + '\t')
    if cfg.get('marker'):
        until(b'TABDONE', 60)
    # Wrap whatever the line now holds in a printf, run it, and read it back.
    send("\x01printf '%s%s%s\\n' '@''@' '\x05' '@''@'\r")
    out = until(b'@@\r\n')
    s = out.decode('utf-8', 'replace')
    m = re.findall(r'(?:^|\n)@@(.*?)@@\r\n', s)
    results.append(m[-1] if m else s[-300:])
os.kill(pid, 9)
print(json.dumps(results))
`;

describe('interactive shells, through a pty', () => {
  let dir;
  let file;
  const python = has('python3');
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-complete-pty-'));
    for (const f of ['deck.md', 'my deck.md', 'out.pdf', 'style.css', 'c:d.pdf']) fs.writeFileSync(path.join(dir, f), '');
    fs.mkdirSync(path.join(dir, 'sp dir'));
    fs.mkdirSync(path.join(dir, 'packages'));
    // HOME for the shells: a folder under ~/ must complete like any other.
    fs.mkdirSync(path.join(dir, 'home', 'talks', 'q3'), { recursive: true });
    file = (shell) => {
      const f = path.join(dir, `.lattice.${shell}`);
      fs.writeFileSync(f, C.script(shell));
      return f;
    };
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // [typed, the line after one Tab (or the lines any one of which is right)]. Trailing space and a folder's '/' are trimmed, since zsh
  // shows both as removable suffixes rather than putting them in the line.
  const CASES = [
    ['lattice --pale', 'lattice --palette'],
    ['lattice --palette=cuoio-d', 'lattice --palette=cuoio-dark'],
    ['lattice --size 16:', 'lattice --size 16:9'],
    ['lattice --output=ou', 'lattice --output=out.pdf'],
    ['lattice --css=st', 'lattice --css=style.css'],
    ['lattice --packages=sp', 'lattice --packages=sp\\ dir'],
    ['lattice my\\ d', 'lattice my\\ deck.md'],
    ['lattice my\\ deck.md out.pdf indaco-d', 'lattice my\\ deck.md out.pdf indaco-dark'],
    ['lattice "my deck.md" st', 'lattice "my deck.md" style.css'],
    ['lattice --overflow-marker=re', 'lattice --overflow-marker=reader'],
    ['lattice --disable-plugin mermaid,ma', 'lattice --disable-plugin mermaid,math'],
    ['lattice packages unt', 'lattice packages untrust'],
    // A folder named like the subcommand does not turn it into a path.
    ['lattice pack', 'lattice packages'],
    // An escaped ':' is part of the name, not a break. bash 5 keeps the escape, bash 3.2 and zsh
    // drop it; ':' is not special to the shell, so both name the same file.
    ['lattice deck.md c\\:d.p', ['lattice deck.md c\\:d.pdf', 'lattice deck.md c:d.pdf']],
    ['lattice ~/ta', 'lattice ~/talks'],
    ['lattice --packages ~/talks/q', 'lattice --packages ~/talks/q3'],
  ];

  /** Each line matches its case; a case with several right answers takes whichever came back. */
  function expectLines(got) {
    assert.deepEqual(got, CASES.map(([, want], i) => (Array.isArray(want) && want.includes(got[i]) ? got[i] : want)));
  }

  function drive(argv, setup, cases = CASES, marker = true) {
    const cfg = JSON.stringify({ argv, cwd: dir, setup, marker, env: { HOME: path.join(dir, 'home') }, cases: cases.map(([typed]) => typed) });
    const r = spawnSync('python3', ['-c', PTY_DRIVER, cfg], { encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    return JSON.parse(r.stdout).map((line) => line.replace(/\s+$/, '').replace(/\/$/, ''));
  }

  for (const bin of shells('bash', 'COMPLETION_TEST_BASH')) {
    test(`bash (${bin}), interactive`, { skip: !python && 'python3 is not installed' }, () => {
      const setup = [
        'set -o emacs',
        `source ${file('bash')}`,
        // A user's nounset must not cost them the line they typed.
        'set -u',
        `eval "$(declare -f _lattice_complete | sed '1s/_lattice_complete/_lattice_complete_inner/')"`,
        '_lattice_complete() { _lattice_complete_inner "$@"; local r=$?; printf TABDONE > /dev/tty; return $r; }',
      ];
      expectLines(drive([bin, '--norc', '--noprofile', '-i'], setup));
    });
  }
  test('failing arm: with no script loaded, the same Tab leaves the line as typed', { skip: (!has('bash') && 'bash is not installed') || (!python && 'python3 is not installed') }, () => {
    assert.deepEqual(drive(['bash', '--norc', '--noprofile', '-i'], ['complete -r lattice 2>/dev/null; :'], CASES.slice(0, 2), false), ['lattice --pale', 'lattice --palette=cuoio-d']);
  });
  test('zsh, interactive', { skip: (!has('zsh') && 'zsh is not installed') || (!python && 'python3 is not installed') }, () => {
    const got = drive(['zsh', '-f', '-i'], [
      // zsh picks vi keys when $EDITOR or $VISUAL names vi (npm sets EDITOR); the driver uses emacs keys.
      'bindkey -e',
      'autoload -Uz compinit && compinit -u',
      `source ${file('zsh')}`,
      'setopt nounset',
      'functions[_lattice_inner]=$functions[_lattice]',
      '_lattice() { _lattice_inner "$@"; local r=$?; print -n TABDONE > /dev/tty; return r; }',
    ]);
    expectLines(got);
  });
});
