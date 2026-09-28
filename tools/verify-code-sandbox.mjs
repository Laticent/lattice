#!/usr/bin/env node
/**
 * A guided check, run by a tester, that the CLI sandboxes code packages on Linux, macOS or Windows.
 *
 * verify-code-sandbox walks a tester through the CLI's sandbox for CODE PACKAGES on THIS machine
 * (followups.d/2411-p2-cli-os-sandbox-other-platforms.md; contract note
 * engineering/decisions/2026-09-24-code-package-contract.md §9).
 *
 * Start it with the launcher for your system, from the repository folder:
 *   Linux, macOS   ./tools/verify-code-sandbox.sh
 *   Windows        tools\verify-code-sandbox.cmd
 * or directly:     node tools/verify-code-sandbox.mjs
 *
 * Each step says what it checks, shows the command, runs it, checks the result by itself, and asks
 * the tester to confirm before going on. At the end it writes a report file (Markdown) to send back.
 *
 * WHAT IT PROVES. A code package is someone else's JavaScript that Lattice runs on a slide. Lattice
 * contains it twice: a browser with no network, and under that, the operating system's sandbox for
 * the browser's renderer. Lattice tells the user which OS layer it got ("on", "OFF", or "on by the
 * platform's default, not measured"). This tool checks, on a real machine, that
 *   1. the approval prompt names that layer;
 *   2. a render refuses a package nobody approved;
 *   3. an approved package draws, from the slide's facts, and reaches no server even when it tries;
 *   4. the layer Lattice REPORTS matches what the operating system actually APPLIED, measured
 *      independently: Linux reads each renderer's seccomp mode; macOS and Windows read the renderer
 *      command lines and ask the tester to look at the sandbox column in the system's process viewer.
 *
 * Self-contained: it builds its own test package, deck and loopback log server in a temporary
 * folder, uses a temporary LATTICE_HOME (your real packages and approvals are never touched), and
 * removes everything at the end. It needs only this repository with its dependencies installed.
 */

import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'lattice-emulator.js');
const PKG = 'sandboxprobe';
const MIN_NODE = [22, 12];

const PLATFORM = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' }[process.platform] ?? process.platform;
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = paint('1');
const dim = paint('2');
const green = paint('32');
const red = paint('31');
const yellow = paint('33');
const cyan = paint('36');

// ── The terminal ────────────────────────────────────────────────────────────────────────────────

/**
 * `--non-interactive`: no one at the keyboard (a CI runner). Every question takes its default, the
 * approval uses `trust --yes`, the steps that need a person to read the system's own process viewer
 * are recorded as not checked, and the process exits 1 if any step failed. The automatic checks are
 * the same ones a tester's run makes.
 */
const AUTO = process.argv.includes('--non-interactive');

/** One question, one answer. A fresh interface each time, so a child process can own stdin between questions. */
function ask(question, auto = '') {
  if (AUTO) {
    console.log(`${question}${dim(`[non-interactive: "${auto}"]`)}`);
    return Promise.resolve(auto);
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Resolved BEFORE the close: `rl.close()` fires 'close' synchronously, and a close handler that
    // resolved first turned every answer into '' (measured, driving the tool through a terminal).
    rl.question(question, (a) => {
      resolve(a.trim());
      rl.close();
    });
    // Ctrl-D or a closed terminal: an empty answer, never a hang.
    rl.on('close', () => resolve(''));
  });
}

async function askYesNo(question) {
  if (AUTO) {
    console.log(`${question} ${dim('[non-interactive: y]')}`);
    return true;
  }
  for (;;) {
    const a = (await ask(`${question} ${dim('[y/n]')} `)).toLowerCase();
    if (process.stdin.readableEnded) throw new Error('the terminal closed (Ctrl-D); start the check again');
    if (a === 'y' || a === 'yes') return true;
    if (a === 'n' || a === 'no') return false;
    console.log(yellow('  Please type y or n.'));
  }
}

const rule = () => console.log(dim('─'.repeat(Math.min(process.stdout.columns || 80, 96))));

// ── Running commands ───────────────────────────────────────────────────────────────────────────

/**
 * Run `node <args>` from the repository, show its output as it arrives, and return it. With
 * `interactive`, the command reads the tester's keyboard (the approval prompt).
 */
function run(args, { env = {}, interactive = false, timeoutMs = 300000 } = {}) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: [interactive ? 'inherit' : 'ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const tee = (chunk) => {
      const s = chunk.toString();
      out += s;
      process.stdout.write(dim(s));
    };
    child.stdout.on('data', tee);
    child.stderr.on('data', tee);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: 1, out: `${out}\n${e.message}` });
    });
  });
}

/** Run a system command quietly and return its output (the process listings). */
function capture(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (e, stdout) => resolve(e ? '' : String(stdout)));
  });
}

/** How the step shows a command: the way a user types it. */
const shown = (args) => `lattice ${args.slice(1).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`;

// ── The report ─────────────────────────────────────────────────────────────────────────────────

const head = [];
const report = [];
const results = [];

function record(step, title, fields) {
  results.push({ step, title, result: fields.result });
  report.push(`## Step ${step}. ${title}`, '');
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === '') continue;
    if (k === 'output') report.push('```text', String(v).split('\n').slice(-120).join('\n').trimEnd(), '```', '');
    else report.push(`- **${k}:** ${v}`);
  }
  report.push('');
}

/**
 * The end of every step: show the automatic result, ask the tester to confirm, take a note.
 * Returns what to record.
 */
async function conclude(auto, confirmQuestion) {
  console.log();
  if (auto.pass === true) console.log(`  ${green('✔ Automatic check: PASS')} ${dim(`— ${auto.why}`)}`);
  else if (auto.pass === false) console.log(`  ${red('✘ Automatic check: FAIL')} — ${auto.why}`);
  else console.log(`  ${yellow('• Automatic check: not applicable')} ${dim(`— ${auto.why}`)}`);
  const confirmed = confirmQuestion ? await askYesNo(`  ${confirmQuestion}`) : null;
  const note = await ask(`  ${dim('Optional note for the report (Enter to skip):')} `);
  const result = auto.pass === false || confirmed === false ? 'FAIL' : auto.pass === null && confirmed === null ? 'SKIPPED' : 'PASS';
  return { result, automatic: `${auto.pass === true ? 'PASS' : auto.pass === false ? 'FAIL' : 'n/a'}: ${auto.why}`, tester: confirmed === null ? undefined : confirmed ? 'confirmed' : 'NOT confirmed', note };
}

function header(n, total, title, what) {
  console.log();
  rule();
  console.log(bold(`STEP ${n} of ${total}  ${title}`));
  rule();
  for (const line of what) console.log(`  ${line}`);
  console.log();
}

// ── The fixture: a package, decks, and a server that counts what reaches it ────────────────────

function probeTransform(origin) {
  // Written the way a stranger would: a self-contained ES module with one default export. It tries
  // the network on load and on every slide, sending the slide's facts, then draws from the facts
  // alone (`slide.facts`, contract note §11).
  return `
try { fetch("${origin}/at-load").catch(function(){}); } catch (e) {}
function ${PKG}(slide) {
  var f = slide.facts;
  try { fetch("${origin}/leak?d=" + encodeURIComponent(f.text)).catch(function(){}); } catch (e) {}
  try { new WebSocket("${origin.replace('http', 'ws')}/socket"); } catch (e) {}
  try { new EventSource("${origin}/events"); } catch (e) {}
  var list = f.blocks.find(function (b) { return b.type === "list"; });
  var rows = (list ? list.items : []).map(function (it) {
    return '<li class="${PKG}-row">' + String(it.text).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</li>";
  }).join("");
  return '<section class="${PKG}-drawn"><h2>' + String(f.title).replace(/</g, "&lt;") + '</h2><ol class="${PKG}-rows">' + rows + "</ol></section>";
}
export { ${PKG} as default };
`;
}

function writePackage(dir, origin) {
  const p = path.join(dir, PKG);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, `${PKG}.manifest.json`), JSON.stringify({ name: PKG, type: 'component', format: 1, facts: 1 }));
  fs.writeFileSync(path.join(p, `${PKG}.styles.css`), `section.${PKG} .${PKG}-rows { display: grid; gap: 0.25em; }\n`);
  fs.writeFileSync(path.join(p, `${PKG}.gallery.md`), `<!-- _class: ${PKG} -->\n\n## Probe\n\n- one\n`);
  fs.writeFileSync(path.join(p, `${PKG}.transform.js`), probeTransform(origin));
  return p;
}

const PROBE_DECK = `---\ntheme: indaco\n---\n\n<!-- _class: ${PKG} -->\n\n## Sandbox probe\n\n- First row\n- Second row\n- Third row\n`;

function startLogServer() {
  return new Promise((resolve) => {
    const hits = [];
    const server = http.createServer((req, res) => {
      hits.push(req.url);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' });
      res.end();
    });
    server.on('upgrade', (req, sock) => {
      hits.push(req.url);
      sock.destroy();
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, hits, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

const settle = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

// ── Measuring the OS layer, independently of Lattice ───────────────────────────────────────────

/** Every process as { pid, ppid, cmd }. */
async function processes() {
  if (process.platform === 'linux') {
    const out = [];
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      try {
        const stat = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
        const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
        const cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').replace(/\0/g, ' ');
        out.push({ pid: Number(d), ppid, cmd });
      } catch {
        /* exited */
      }
    }
    return out;
  }
  if (process.platform === 'win32') {
    const json = await capture('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress']);
    try {
      return [].concat(JSON.parse(json)).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, cmd: p.CommandLine || '' }));
    } catch {
      return [];
    }
  }
  const text = await capture('ps', ['-axww', '-o', 'pid=,ppid=,command=']);
  return text.split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] }));
}

function descendantsOf(all, root) {
  const kids = new Map();
  for (const p of all) kids.set(p.ppid, [...(kids.get(p.ppid) || []), p]);
  const out = [];
  const walk = (pid) => {
    for (const k of kids.get(pid) || []) {
      out.push(k);
      walk(k.pid);
    }
  };
  walk(root);
  return out;
}

/** Linux only: a renderer's seccomp mode and user, from /proc. */
function linuxStatus(pid) {
  try {
    const s = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    return { seccomp: /^Seccomp:\s*(\d)/m.exec(s)?.[1] ?? '?', uid: /^Uid:\s*(\d+)/m.exec(s)?.[1] ?? '?' };
  } catch {
    return { seccomp: '?', uid: '?' };
  }
}

// ── The steps ──────────────────────────────────────────────────────────────────────────────────

const TOTAL = 8;

async function main() {
  console.log();
  console.log(bold('Lattice — code-package sandbox check'));
  console.log(`  This guides you through ${TOTAL} steps. Each one shows a command, runs it, checks the result, and`);
  console.log('  asks you to confirm what you saw. It takes about 5 minutes. Nothing on your machine is changed:');
  console.log('  everything happens in a temporary folder that is removed at the end.');
  console.log(`  At the end it saves a report file. ${bold('Please send that file back.')}`);
  console.log();
  const tester = await ask('  Your name (for the report; Enter to skip): ', `non-interactive run on ${PLATFORM}`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-sandbox-check-'));
  const home = path.join(work, 'home');
  fs.mkdirSync(home);
  const env = { LATTICE_HOME: home };
  const log = await startLogServer();
  const started = new Date();
  head.push(
    '# Code-package sandbox check',
    '',
    `- **Tester:** ${tester || '(not given)'}`,
    `- **Date:** ${started.toISOString()}`,
    `- **System:** ${PLATFORM} ${os.release()} (${os.arch()})`,
    `- **Node:** ${process.version}`,
    `- **Running as:** ${(() => {
      try {
        return os.userInfo().username;
      } catch {
        return 'unknown';
      }
    })()}${process.getuid?.() === 0 ? ' (root)' : ''}`,
    `- **Repository:** ${ROOT}`,
    '',
  );

  let stopped = false;
  const gate = async () => {
    const a = (await ask(`\n  ${bold('Enter')} to go to the next step, or ${bold('q')} to stop here: `)).toLowerCase();
    if (a === 'q') stopped = true;
    return !stopped;
  };

  try {
    // 1 ─ The machine
    header(1, TOTAL, 'Check this machine', ['What it checks: Node.js is new enough, the repository has its dependencies, and a browser', 'Lattice can use is installed (Chromium 131 or newer).']);
    const [maj, min] = process.versions.node.split('.').map(Number);
    const nodeOk = maj > MIN_NODE[0] || (maj === MIN_NODE[0] && min >= MIN_NODE[1]);
    console.log(`  Node.js ${process.version} ${nodeOk ? green('ok') : red(`(need ${MIN_NODE.join('.')} or newer)`)}`);
    let browserPath = '';
    let browserVersion = '';
    let depsOk = true;
    try {
      const puppeteer = require('puppeteer');
      const { detectChromeExecutable } = require(path.join(ROOT, 'lib/core/chrome-exec.js'));
      browserPath = detectChromeExecutable() || puppeteer.executablePath();
      const b = await puppeteer.launch({ executablePath: browserPath, headless: true, args: process.getuid?.() === 0 ? ['--no-sandbox'] : [] });
      browserVersion = await b.version();
      await b.close();
    } catch (e) {
      depsOk = false;
      console.log(red(`  Could not start a browser: ${e.message.split('\n')[0]}`));
      console.log(yellow('  Fix: in the repository folder run "npm ci", or set CHROME_PATH to a Chrome or Chromium 131+.'));
    }
    const major = Number(/\/(\d+)\./.exec(browserVersion)?.[1]);
    if (browserVersion) console.log(`  Browser ${browserVersion} at ${browserPath} ${major >= 131 ? green('ok') : red('(need 131 or newer)')}`);
    const machineOk = nodeOk && depsOk && major >= 131;
    const r1 = await conclude({ pass: machineOk, why: machineOk ? `Node ${process.version}, ${browserVersion}` : 'see the message above' }, null);
    record(1, 'Check this machine', { ...r1, browser: browserVersion ? `${browserVersion} (${browserPath})` : 'none' });
    if (!machineOk) {
      console.log(red('\n  The other steps need this one. Fix it and start again.'));
      return;
    }
    if (!(await gate())) return;

    // 2 ─ Install; the approval prompt names the OS layer
    const src = writePackage(path.join(work, 'src'), log.origin);
    const addArgs = [CLI, 'packages', 'add', src];
    header(2, TOTAL, 'Install a test package and read the approval prompt', [
      'What it checks: installing a package that carries code shows what the code is and which OS',
      'sandbox this machine gives it, and asks before approving.',
      '',
      `${bold('When it asks "Run this code…? [y/N]", type n and press Enter.')}`,
      '',
      `Command:  ${cyan(shown(addArgs))}`,
    ]);
    const add = await run(addArgs, { env, interactive: true });
    const layerLine = /the OS sandbox on this machine: ([^\n]+)/.exec(add.out)?.[1] ?? '';
    const r2auto =
      add.code !== 0 ? { pass: false, why: `the command failed (exit ${add.code})` }
      : !/carries code: .*sha256 [0-9a-f]{64}/.test(add.out) ? { pass: false, why: 'the prompt did not show the code and its SHA-256' }
      : !layerLine ? { pass: false, why: 'the prompt did not name the OS sandbox layer' }
      : !/not approved/.test(add.out) ? { pass: false, why: 'it did not say the package is not approved (did you type n?)' }
      : { pass: true, why: 'the prompt shows the code, its SHA-256 and the OS layer; the package is installed, not approved' };
    console.log(`\n  The OS layer Lattice reported: ${bold(layerLine || '(none)')}`);
    const r2 = await conclude(r2auto, 'Was the prompt clear, and did it say which OS sandbox this machine gives the code?');
    record(2, 'Install a test package and read the approval prompt', { command: shown(addArgs), exit: add.code, ...r2, 'reported layer': layerLine, output: add.out });
    if (!(await gate())) return;

    // 3 ─ A render refuses an unapproved package
    const deck = path.join(work, 'deck.md');
    fs.writeFileSync(deck, PROBE_DECK);
    const out1 = path.join(work, 'refused.html');
    const refuseArgs = [CLI, deck, out1];
    header(3, TOTAL, 'Render a deck that uses the package, before approving it', ['What it checks: Lattice refuses to render with code nobody approved, names the package, and', 'writes no file.', '', `Command:  ${cyan(shown(refuseArgs))}`]);
    log.hits.length = 0;
    const refused = await run(refuseArgs, { env });
    await settle();
    const r3auto =
      refused.code === 0 ? { pass: false, why: 'the render succeeded; it should have been refused' }
      : !/you have not approved its code/.test(refused.out) ? { pass: false, why: 'the refusal did not say the code is not approved' }
      : fs.existsSync(out1) ? { pass: false, why: 'a file was written anyway' }
      : log.hits.length ? { pass: false, why: `something reached the log server: ${log.hits.join(', ')}` }
      : { pass: true, why: `refused (exit ${refused.code}), package named, no file, nothing reached the server` };
    const r3 = await conclude(r3auto, 'Did it refuse, and tell you how to approve the package?');
    record(3, 'Render before approving', { command: shown(refuseArgs), exit: refused.code, ...r3, output: refused.out });
    if (!(await gate())) return;

    // 4 ─ Approve
    // Non-interactive: the approval is given by flag, as `lattice packages trust --yes` would.
    const trustArgs = [CLI, 'packages', 'trust', `component/${PKG}`, ...(AUTO ? ['--yes'] : [])];
    header(4, TOTAL, 'Approve the package', ['What it checks: approving shows the same prompt and records the approval.', '', `${bold('When it asks "Run this code…? [y/N]", type y and press Enter.')}`, '', `Command:  ${cyan(shown(trustArgs))}`]);
    const trust = await run(trustArgs, { env, interactive: true });
    const r4auto = trust.code === 0 && /approved component\//.test(trust.out) ? { pass: true, why: 'approved' } : { pass: false, why: `not approved (exit ${trust.code}; did you type y?)` };
    const r4 = await conclude(r4auto, null);
    record(4, 'Approve the package', { command: shown(trustArgs), exit: trust.code, ...r4, output: trust.out });
    if (r4.result !== 'PASS') console.log(yellow('  The next steps need the approval; they will fail without it.'));
    if (!(await gate())) return;

    // 5 ─ Control: the log server is reachable, so a zero later means something
    const control = path.join(work, 'control.md');
    fs.writeFileSync(control, `---\ntheme: indaco\n---\n\n## Control\n\n![control](${log.origin}/control.png)\n`);
    const controlOut = path.join(work, 'control.pdf');
    const controlArgs = [CLI, control, controlOut, '--allow-remote'];
    header(5, TOTAL, 'Control: show the test server can be reached', [
      'What it checks: an ordinary deck with a web image, rendered with --allow-remote, DOES reach the',
      'test server. Without this, "nothing reached the server" in the next step would prove nothing.',
      '',
      `Command:  ${cyan(shown(controlArgs))}`,
    ]);
    log.hits.length = 0;
    const ctl = await run(controlArgs, { env });
    await settle();
    const r5auto = log.hits.length ? { pass: true, why: `the server saw ${log.hits.length} request(s): ${[...new Set(log.hits)].join(', ')}` } : { pass: false, why: `nothing reached the server (exit ${ctl.code}); the check in step 6 cannot be trusted on this machine` };
    const r5 = await conclude(r5auto, null);
    record(5, 'Control: the test server can be reached', { command: shown(controlArgs), exit: ctl.code, ...r5, output: ctl.out });
    if (!(await gate())) return;

    // 6 ─ The approved package draws, and reaches nothing
    const out2 = path.join(work, 'drawn.html');
    const drawArgs = [CLI, deck, out2, '--allow-remote'];
    header(6, TOTAL, 'Render with the approved package', [
      'What it checks: the package draws the slide from its facts, and every attempt it makes to reach',
      'the test server (fetch, WebSocket, EventSource) is blocked, even with --allow-remote.',
      '',
      `Command:  ${cyan(shown(drawArgs))}`,
    ]);
    log.hits.length = 0;
    const draw = await run(drawArgs, { env });
    await settle(2500);
    const html = fs.existsSync(out2) ? fs.readFileSync(out2, 'utf8') : '';
    const drew = new RegExp(`class="${PKG}-rows"[^>]*>(<li class="${PKG}-row">[^<]*</li>){3}`).test(html) && html.includes('Sandbox probe');
    const renderLayer = /code packages: [^\n]*? — OS sandbox ([^\n(]+)/.exec(draw.out)?.[1]?.trim() ?? '';
    const r6auto =
      draw.code !== 0 ? { pass: false, why: `the render failed (exit ${draw.code})` }
      : /did not draw/.test(draw.out) ? { pass: false, why: 'the package did not draw its slide (see the output)' }
      : !drew ? { pass: false, why: "the output does not hold the package's three rows" }
      : log.hits.length ? { pass: false, why: `the package reached the test server: ${log.hits.join(', ')}` }
      : html.includes(log.origin.replace('http://', '')) ? { pass: false, why: 'the output names the test server' }
      : { pass: true, why: 'drew three rows from the facts; 0 requests reached the server' };
    console.log(`\n  The OS layer this render reported: ${bold(renderLayer || '(none)')}`);
    const r6 = await conclude(r6auto, null);
    record(6, 'Render with the approved package', { command: shown(drawArgs), exit: draw.code, ...r6, 'requests seen by the server': String(log.hits.length), 'reported layer': renderLayer, output: draw.out });
    if (!(await gate())) return;

    // 7 ─ Does the reported layer match what the OS applied?
    header(7, TOTAL, 'Measure the OS sandbox directly', [
      'What it checks: Lattice starts its sandbox browser the way a render does, and this tool measures,',
      `without asking Lattice, whether the ${PLATFORM} sandbox is really on for the browser's renderer.`,
      ...(process.platform === 'darwin' ? ['', 'You will also be asked to look at Activity Monitor.'] : process.platform === 'win32' ? ['', 'You can also look at Process Explorer, if you have it (optional).'] : []),
    ]);
    const measured = await measureLayer();
    const r7 = await conclude(measured.auto, measured.question);
    record(7, 'Measure the OS sandbox directly', { ...r7, 'reported layer': measured.reported, measured: measured.detail, 'what the tester saw': measured.seen });
    if (!(await gate())) return;

    // 8 ─ The automated test, optional
    const testArgs = ['--test', path.join('test', 'integration', 'export', 'code-package-door.test.js')];
    header(8, TOTAL, "Run the project's own automated test (optional, about 2 minutes)", [
      'What it checks: the full door test, with a hostile package that tries every way out.',
      '',
      `Command:  ${cyan(`node ${testArgs.join(' ')}`)}`,
    ]);
    if (await askYesNo('  Run it now?')) {
      const t = await run(testArgs, { env, timeoutMs: 900000 });
      const pass = Number(/# pass (\d+)/.exec(t.out)?.[1] ?? 0);
      const fail = Number(/# fail (\d+)/.exec(t.out)?.[1] ?? 1);
      const r8 = await conclude(fail === 0 && pass > 0 ? { pass: true, why: `${pass} passed, 0 failed` } : { pass: false, why: `${pass} passed, ${fail} failed` }, null);
      record(8, 'Automated door test', { command: `node ${testArgs.join(' ')}`, exit: t.code, ...r8, output: t.out });
    } else {
      record(8, 'Automated door test', { result: 'SKIPPED', note: 'the tester chose not to run it' });
    }
  } finally {
    log.server.closeAllConnections?.();
    log.server.close();
    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {
      /* a browser still holding a file on Windows; the system cleans its temp folder */
    }
    finish(stopped);
  }
}

/** Step 7: launch the code sandbox as a render does, then measure the renderer's OS sandbox. */
async function measureLayer() {
  const puppeteer = require('puppeteer');
  const { launchCodeSandbox } = require(path.join(ROOT, 'lib/core/os-sandbox.js'));
  const { detectChromeExecutable } = require(path.join(ROOT, 'lib/core/chrome-exec.js'));
  let s;
  try {
    s = await launchCodeSandbox(puppeteer, { executablePath: detectChromeExecutable() || undefined });
  } catch (e) {
    return { auto: { pass: false, why: `the sandbox browser did not start: ${e.message.split('\n')[0]}` }, reported: '', detail: '' };
  }
  const reported = s.layer.summary;
  console.log(`  Lattice reports: ${bold(reported)}`);
  // A page, so a renderer process exists while we look.
  const page = await s.browser.newPage();
  await page.goto('data:text/html,<p>sandbox probe</p>').catch(() => {});
  await settle(500);
  const all = await processes();
  const tree = s.pid ? descendantsOf(all, s.pid) : [];
  const browserCmd = all.find((p) => p.pid === s.pid)?.cmd ?? '';
  const renderers = tree.filter((p) => /--type=renderer/.test(p.cmd));
  const noSandboxFlag = /--no-sandbox/.test(browserCmd) || renderers.some((p) => /--no-sandbox/.test(p.cmd));
  console.log(`  Browser process ${s.pid ?? '?'}; renderer processes: ${renderers.map((r) => r.pid).join(', ') || 'none found'}`);
  let auto;
  let detail;
  let question = null;
  let seen;
  try {
    if (process.platform === 'linux') {
      const st = renderers.map((r) => ({ pid: r.pid, ...linuxStatus(r.pid) }));
      detail = st.map((x) => `pid ${x.pid}: Seccomp ${x.seccomp}, uid ${x.uid}`).join('; ') || 'no renderer found';
      console.log(`  Measured: ${detail}`);
      const on = st.length > 0 && st.every((x) => x.seccomp === '2');
      const expected = s.layer.os === 'on';
      auto =
        !st.length ? { pass: false, why: 'no renderer process was found to measure' }
        : on === expected ? { pass: true, why: `Lattice reports "${s.layer.os}" and the renderers read Seccomp ${st.map((x) => x.seccomp).join(',')} (2 = filtered)` }
        : { pass: false, why: `MISMATCH: Lattice reports "${s.layer.os}" but the renderers read Seccomp ${st.map((x) => x.seccomp).join(',')}` };
    } else {
      detail = `${renderers.length} renderer(s); --no-sandbox on the browser or a renderer: ${noSandboxFlag ? 'YES' : 'no'}`;
      console.log(`  Measured: ${detail}`);
      const expectedOn = s.layer.os !== 'off';
      auto =
        !renderers.length ? { pass: false, why: 'no renderer process was found to measure' }
        : expectedOn === !noSandboxFlag ? { pass: true, why: `Lattice reports "${s.layer.os}", and the browser ${noSandboxFlag ? 'was' : 'was not'} started with --no-sandbox` }
        : { pass: false, why: `MISMATCH: Lattice reports "${s.layer.os}" but --no-sandbox is ${noSandboxFlag ? 'present' : 'absent'}` };
      console.log();
      if (process.platform === 'darwin') {
        console.log(`  ${bold('Please look now, while the browser is running:')}`);
        console.log('    1. Open Activity Monitor (Applications → Utilities).');
        console.log('    2. Menu View → Columns → tick "Sandbox".');
        console.log(`    3. Find the processes with PID ${renderers.map((r) => r.pid).join(', ') || '(see above)'} (use the search box, or sort by PID).`);
        console.log('       They are named like "Google Chrome for Testing Helper (Renderer)" or "Chromium Helper (Renderer)".');
        console.log('    4. Read their "Sandbox" column. It should say Yes.');
        question = 'Does the Sandbox column say "Yes" for those renderer processes?';
      } else if (process.platform === 'win32') {
        console.log(`  ${bold('Optional, if you have Sysinternals Process Explorer:')}`);
        console.log('    1. Open Process Explorer. Menu View → Select Columns → tick "Integrity Level".');
        console.log(`    2. Find the processes with PID ${renderers.map((r) => r.pid).join(', ') || '(see above)'} (chrome.exe, "--type=renderer").`);
        console.log('    3. Their Integrity should read "Untrusted" or "AppContainer" (NOT "Medium").');
        console.log('    If you do not have Process Explorer, answer y and write "not checked" in the note.');
        question = 'Did the renderers show Untrusted or AppContainer integrity (or you could not check)?';
      }
    }
    if (question && AUTO) {
      // Nobody can read Activity Monitor or Process Explorer on a runner: the automatic check stands
      // alone, and the report says the manual half was not done.
      seen = 'not checked (non-interactive run)';
      question = null;
    } else if (question) {
      const q = await ask(`  ${dim('Type what you saw (e.g. "Yes on 2 renderers"), then Enter:')} `);
      seen = q || undefined;
    }
  } finally {
    await page.close().catch(() => {});
    await s.close().catch(() => {});
  }
  return { auto, reported, detail, question, seen };
}

function finish(stopped) {
  // Where the tester started (the launchers pass it), else their home folder, else the temp folder:
  // the repository may not be writable for the account running the check.
  const name = `code-sandbox-report-${process.platform}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  const summary = ['## Summary', '', '| Step | Check | Result |', '|---|---|---|', ...results.map((r) => `| ${r.step} | ${r.title} | ${r.result} |`), ''];
  if (stopped) summary.push('_The tester stopped before the last step._', '');
  let file = '';
  for (const dir of [process.env.VERIFY_REPORT_DIR, os.homedir(), os.tmpdir()].filter(Boolean)) {
    try {
      fs.writeFileSync(path.join(dir, name), [...head, ...summary, ...report].join('\n'));
      file = path.join(dir, name);
      break;
    } catch {
      /* not writable here; the next place */
    }
  }
  console.log();
  rule();
  console.log(bold('Summary'));
  for (const r of results) console.log(`  ${r.step}. ${r.title.padEnd(58)} ${r.result === 'PASS' ? green(r.result) : r.result === 'FAIL' ? red(r.result) : yellow(r.result)}`);
  rule();
  console.log(`  Report saved to: ${bold(file)}`);
  console.log('  Please send that file back. Thank you!');
  console.log();
  // A run with no one watching must say so through its exit code (a CI job reads nothing else).
  if (results.some((r) => r.result === 'FAIL') || (AUTO && results.length < TOTAL)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(red(`\nThe check stopped with an error: ${e.stack || e.message}`));
  process.exitCode = 1;
});
