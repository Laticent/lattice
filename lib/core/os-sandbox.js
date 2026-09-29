/**
 * The OS layer under the code sandbox (owner decision 2026-09-26, followups.d/2314-p4-code-packages.md:
 * "(c) where the CLI can arrange it, else (b)").
 *
 * lib/core/code-sandbox.js builds two walls out of BROWSER policy: an always-offline browser and a
 * locked page. Both sit over a renderer process, and a Chromium exploit that escapes the renderer
 * gets whatever that process can reach. Chromium's own OS sandbox (a seccomp-bpf filter and fresh
 * namespaces on Linux) is the layer that contains such an escape, and the deck render launches
 * with `--no-sandbox` because as root, in a container, Chromium refuses to start its sandbox.
 *
 * This launches the code sandbox's browser with that layer ON wherever the machine allows it, and
 * says which layer it got, MEASURED rather than assumed:
 *
 *   root on Linux   (c) start Chromium as an unprivileged user (`nobody`) WITHOUT `--no-sandbox`,
 *                   driven over a pipe (no debugging port for other local processes to attach to).
 *                   Where the OS sandbox still can't start (no user namespaces), the same
 *                   unprivileged user with `--no-sandbox`: an escape then lands in `nobody`, not
 *                   root. Where `nobody` can't run the browser at all (the binary sits under
 *                   `/root`, mode 700), fall through to (b).
 *   anyone else     launch WITHOUT `--no-sandbox`; if the sandbox can't start, (b).
 *   (b)             run with `--no-sandbox` as the current user, and the layer reads OFF, which the
 *                   consent text and the render both say in plain words.
 *
 * "ON" is a measurement on Linux: every renderer process under the browser runs with
 * `Seccomp: 2` in /proc. On macOS and Windows Chromium's sandbox is on by default without root and
 * there is no /proc to read, so the layer reads "on (platform default, not measured)".
 *
 * A MINIMUM CHROMIUM. The walls were measured on Chromium 131 (contract note §4); `CHROME_EXEC`
 * accepts any system Chrome, and an older one has not been measured, so it is refused for code.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { SANDBOX_LAUNCH_ARGS, launchSandboxBrowser } = require('./code-sandbox.js');

/** The oldest Chromium the code sandbox's walls were measured on. */
const MIN_CHROMIUM_MAJOR = 131;

/** How long a launch may take before it counts as failed and the next rung is tried. */
const LAUNCH_TIMEOUT_MS = 20000;

/** The unprivileged account, from /etc/passwd; `nobody` is 65534 on every mainstream distribution. */
function unprivilegedUser(passwd = '/etc/passwd') {
  try {
    const line = fs.readFileSync(passwd, 'utf8').split('\n').find((l) => l.startsWith('nobody:'));
    const [, , uid, gid] = line.split(':');
    if (Number(uid) > 0 && Number(gid) > 0) return { name: 'nobody', uid: Number(uid), gid: Number(gid) };
  } catch {
    /* no passwd entry */
  }
  return { name: 'nobody', uid: 65534, gid: 65534 };
}

/**
 * Does AppArmor stop unprivileged programs from creating user namespaces? Ubuntu 23.10 and later
 * set this sysctl to 1, and Chrome's Linux sandbox needs a user namespace, so an ordinary user's
 * Chrome cannot start its sandbox there unless an AppArmor profile allows it. Measured on an
 * ubuntu-latest (24.04) runner in PR #2459: the sandboxed launch failed, the layer read OFF.
 */
function apparmorRestrictsUserns(file = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns') {
  try {
    return fs.readFileSync(file, 'utf8').trim() === '1';
  } catch {
    return false;
  }
}

/**
 * Is THIS process already under a seccomp filter? Chromium never filters its own browser process,
 * and neither does an ordinary Linux host, so a filter here is the runtime's: a container's profile
 * (Docker's default) or a service manager's. Docker's default profile refuses the user namespace
 * Chrome's sandbox needs whatever AppArmor says: measured on ubuntu-latest (p7, runs 36554214907
 * and 36554842708), `nobody` in a node:22 container could not `unshare -U` under the default profile
 * with the AppArmor sysctl at 0, and could under `--security-opt seccomp=unconfined` with it at 1.
 */
function processSeccompFiltered(file = '/proc/self/status') {
  try {
    return /^Seccomp:\s*2/m.test(fs.readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Why the layer reads OFF, as one key. The consent text turns it into a remedy (`offRemedy`), and
 * the key exists because one remedy did not fit every machine: "set CHROME_PATH" is the answer when
 * `nobody` cannot run a browser that sits under /root, and the wrong answer on Ubuntu 24.04, where
 * AppArmor blocks the sandbox for every unprivileged user whatever browser they pick.
 * @param {{ platform: string, uid?: number, skipped?: 'root-outside-linux'|'no-browser-path'|null, failures: string[], userRan?: boolean, filtered?: boolean, apparmor?: boolean }} o
 *   `skipped` names why no launch WITH the sandbox was tried; `failures` holds the messages of the
 *   ones that were. `userRan` is false when, as root on Linux, the unprivileged user could not run
 *   the browser even WITHOUT the sandbox: then the sandbox was never the obstacle. `filtered` is
 *   `processSeccompFiltered()`: a container's seccomp profile, which outranks AppArmor.
 * @returns {'container-seccomp'|'apparmor-userns'|'unprivileged-user-cannot-run'|'sandbox-did-not-start'|'root-outside-linux'|'no-browser-path'|null}
 */
function offReason({ platform, uid, skipped = null, failures, userRan = true, filtered = platform === 'linux' && processSeccompFiltered(), apparmor = platform === 'linux' && apparmorRestrictsUserns() }) {
  if (skipped) return skipped;
  if (!failures.length) return null;
  // First, because it is the obstacle whatever AppArmor says: a root container on an Ubuntu 24.04
  // host reads the host's sysctl as 1, and its browser under /root (mode 700) is out of `nobody`'s
  // reach with the sandbox or without it (the checker).
  if (platform === 'linux' && uid === 0 && !userRan) return 'unprivileged-user-cannot-run';
  // Next, a container's seccomp filter: a container on an Ubuntu 24.04 host reads the host's
  // AppArmor sysctl as 1, and blaming AppArmor there sent the user to a fix that changed nothing.
  if (platform === 'linux' && filtered) return 'container-seccomp';
  // The sysctl, not Chromium's message: its "No usable sandbox!" text points at AppArmor as a
  // general hint, so a box with user namespaces switched off another way could read the same.
  if (platform === 'linux' && apparmor) return 'apparmor-userns';
  return 'sandbox-did-not-start';
}

/** The chromium doc that explains the AppArmor restriction and the profile that lifts it. */
const APPARMOR_DOC = 'https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md';

/** What the user can do to put the layer on, for each `offReason` key; `null` when nothing we can name helps. */
function offRemedy(reason) {
  switch (reason) {
    case 'apparmor-userns':
      return `to put it on, let this browser create user namespaces: AppArmor blocks them for unprivileged programs here (the kernel.apparmor_restrict_unprivileged_userns sysctl is 1). Give the browser an AppArmor profile that allows userns (${APPARMOR_DOC}), or, for the whole system, set that sysctl to 0; then approve again`;
    case 'container-seccomp':
      return "to put it on, let the container create user namespaces: this process runs under a seccomp filter (a container's profile, such as Docker's default) that refuses the ones Chrome's sandbox needs. Start the container with a seccomp profile that allows them (Docker: --security-opt seccomp=<profile>; seccomp=unconfined also works, but drops the container's filter), then approve again";
    case 'unprivileged-user-cannot-run':
      return 'to put it on, set CHROME_PATH to a Chromium the unprivileged user can run, then approve again';
    case 'no-browser-path':
      return 'to put it on, set CHROME_PATH to a Chromium 131 or later, then approve again';
    case 'root-outside-linux':
      return 'to put it on, run Lattice as an ordinary user rather than as root, then approve again';
    case 'sandbox-did-not-start':
      return "to put it on, fix what stopped Chrome's sandbox from starting (the reason above), then approve again";
    default:
      return null;
  }
}

/** Chromium's DevTools pipe: NUL-delimited JSON on fds 3 (to the browser) and 4 (from it). */
class PipeTransport {
  constructor(toBrowser, fromBrowser) {
    this.toBrowser = toBrowser;
    this.pending = '';
    fromBrowser.on('data', (chunk) => {
      this.pending += chunk.toString('utf8');
      for (let i = this.pending.indexOf('\0'); i >= 0; i = this.pending.indexOf('\0')) {
        const message = this.pending.slice(0, i);
        this.pending = this.pending.slice(i + 1);
        this.onmessage?.(message);
      }
    });
    fromBrowser.on('close', () => this.onclose?.());
    toBrowser.on('error', () => {});
    fromBrowser.on('error', () => {});
  }
  send(message) {
    this.toBrowser.write(`${message}\0`);
  }
  close() {
    this.toBrowser.end();
  }
}

/** The pids under `root` (Linux /proc), so the renderers of THIS browser are the ones read. */
function descendants(root) {
  const parent = new Map();
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      // `pid (comm) state ppid …`; comm can hold spaces and parentheses, so read after the last `)`.
      const stat = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      parent.set(Number(d), Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]));
    } catch {
      /* exited */
    }
  }
  const out = [];
  for (const [pid] of parent) {
    for (let p = parent.get(pid); p; p = parent.get(p)) {
      if (p === root) {
        out.push(pid);
        break;
      }
    }
  }
  return out;
}

/**
 * Is Chromium's OS sandbox on for the renderers of the browser at `pid`? Opens one page so a
 * renderer exists, then reads each renderer's seccomp mode. `true` only when every renderer found
 * is filtered; `null` when none could be read (a /proc that hides them).
 */
async function rendererSandboxed(browser, pid) {
  if (process.platform !== 'linux' || !pid) return null;
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.goto('data:text/html,<p>probe</p>', { timeout: 10000 });
    const renderers = descendants(pid).filter((p) => {
      try {
        return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').includes('--type=renderer');
      } catch {
        return false;
      }
    });
    const modes = renderers.map((p) => {
      try {
        return /^Seccomp:\s*(\d)/m.exec(fs.readFileSync(`/proc/${p}/status`, 'utf8'))?.[1] ?? null;
      } catch {
        return null;
      }
    });
    if (!modes.length || modes.includes(null)) return null;
    return modes.every((m) => m === '2');
  } finally {
    await context.close().catch(() => {});
  }
}

/** Start Chromium as `user` over a pipe, and connect. Rejects if it has not answered within the launch timeout. */
async function launchAsUser(puppeteer, { executablePath, user, noSandbox, onLaunch }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-sandbox-'));
  fs.chownSync(dir, user.uid, user.gid);
  const args = [
    ...puppeteer.defaultArgs({ headless: true, userDataDir: dir }).filter((a) => a !== '--disable-popup-blocking' && !a.startsWith('--remote-debugging') && a !== 'about:blank'),
    '--remote-debugging-pipe',
    ...(noSandbox ? ['--no-sandbox'] : []),
    '--disable-dev-shm-usage',
    // Puppeteer's defaults already end with the start page; a second one is a second target,
    // which headless Chromium refuses by exiting.
    ...SANDBOX_LAUNCH_ARGS,
    'about:blank',
  ];
  const child = spawn(executablePath, args, {
    uid: user.uid,
    gid: user.gid,
    // The unprivileged browser gets nothing of the invoking user's environment: no proxy
    // settings, tokens or display, only a home it owns and the search path.
    env: { HOME: dir, PATH: process.env.PATH || '/usr/bin:/bin', TMPDIR: dir },
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
    // Its own process group, so whoever outlives us can end the browser and every child it forked.
    detached: true,
  });
  onLaunch?.({ pid: child.pid, dir });
  let stderr = '';
  child.stderr.on('data', (d) => {
    if (stderr.length < 4000) stderr += d.toString('utf8');
  });
  const cleanup = () => {
    for (const kill of [() => process.kill(-child.pid, 'SIGKILL'), () => child.kill('SIGKILL')]) {
      try {
        kill();
      } catch {
        /* already gone */
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  };
  try {
    const exited = new Promise((_, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => reject(new Error(`the browser exited (${signal || code}) as ${user.name}: ${stderr.trim().split('\n').pop() || 'no message'}`)));
    });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`the browser did not answer within ${LAUNCH_TIMEOUT_MS} ms as ${user.name}`)), LAUNCH_TIMEOUT_MS).unref());
    const browser = await Promise.race([puppeteer.connect({ transport: new PipeTransport(child.stdio[3], child.stdio[4]), defaultViewport: null, protocolTimeout: LAUNCH_TIMEOUT_MS * 3 }), exited, timeout]);
    // Probe that pages open before committing to this rung: a browser that connects but whose
    // renderer can't start (the zygote refused) fails here, not on the first real slide.
    exited.catch(() => {});
    return { browser, pid: child.pid, close: async () => { await browser.close().catch(() => {}); cleanup(); } };
  } catch (e) {
    cleanup();
    throw e;
  }
}

/**
 * Launch the code sandbox's browser with the strongest OS layer this machine allows.
 * @param {object} puppeteer
 * @param {{ executablePath?: string, uid?: number, platform?: string, apparmor?: boolean, onLaunch?: (p: { pid: number, dir?: string }) => void }} [opts]
 *   `uid`, `platform`, `apparmor` (the userns sysctl) and `filtered` (this process's seccomp) are
 *   this machine's, read by default;
 *   tests pass them to reach each rung and each reason. `onLaunch`
 *   hears each browser process as it starts, so a caller killed mid-run can be cleaned up after.
 * @returns {Promise<{ browser: object, close: () => Promise<void>, layer: { os: 'on'|'off'|'unmeasured', user: string, summary: string, tried: string[], reason: string|null }, version: string }>}
 *   `reason` is set when the layer is OFF (`offReason`); `offRemedy` turns it into the fix.
 */
async function launchCodeSandbox(puppeteer, { executablePath, uid = process.getuid?.(), platform = process.platform, apparmor, filtered, onLaunch } = {}) {
  // With no browser detected, puppeteer's own: the rung that starts a browser as another user needs
  // a path, and skipping it for want of one read the layer OFF for no stated reason (the checker).
  const exe = executablePath || (() => {
    try {
      return puppeteer.executablePath();
    } catch {
      return undefined;
    }
  })();
  // A uid with no passwd entry (OpenShift's arbitrary uids) makes `os.userInfo()` throw.
  const whoami = () => {
    try {
      return os.userInfo().username;
    } catch {
      return `uid ${uid}`;
    }
  };
  const tried = [];
  // The launches that tried WITH the OS sandbox and failed; offReason reads why.
  const sandboxFailures = [];
  let skipped = null;
  let userRan = true;
  const accept = async (launched, user, noSandbox) => {
    try {
      const version = await launched.browser.version();
      const major = Number(/\/(\d+)\./.exec(version)?.[1]);
      if (!(major >= MIN_CHROMIUM_MAJOR)) {
        throw new Error(`code packages need Chromium ${MIN_CHROMIUM_MAJOR} or later, the oldest their sandbox was measured on; this browser is ${version} (set CHROME_PATH to a newer one)`);
      }
      let layer = noSandbox ? 'off' : 'unmeasured';
      if (!noSandbox && platform === 'linux') {
        const on = await rendererSandboxed(launched.browser, launched.pid);
        layer = on === true ? 'on' : on === false ? 'off' : 'unmeasured';
      }
      const summary =
        layer === 'on' ? `on: Chromium's OS sandbox confines the renderer, running as ${user}`
        : layer === 'unmeasured' ? `on by the platform's default, running as ${user} (not measured here)`
        : `OFF: the renderer runs as ${user} without Chromium's OS sandbox, so a browser exploit in a package's code would reach what ${user} can`;
      const reason = layer === 'off' ? offReason({ platform, uid, skipped, failures: sandboxFailures, userRan, ...(apparmor === undefined ? {} : { apparmor }), ...(filtered === undefined ? {} : { filtered }) }) : null;
      return { ...launched, version, layer: { os: layer, user, summary, tried: [...tried], reason } };
    } catch (e) {
      // A browser that started but failed its check is closed before the next rung starts another.
      await launched.close().catch(() => {});
      throw e;
    }
  };
  /** Puppeteer's launch, with a profile of ours the host can find and remove if it must kill us. */
  const launchHere = async (args) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-sandbox-'));
    try {
      const browser = await launchSandboxBrowser(puppeteer, { headless: true, executablePath: exe, userDataDir: dir, args: [...args, '--disable-dev-shm-usage'], timeout: LAUNCH_TIMEOUT_MS });
      const pid = browser.process()?.pid;
      onLaunch?.({ pid, dir });
      return {
        browser,
        pid,
        close: async () => {
          await browser.close().catch(() => {});
          fs.rmSync(dir, { recursive: true, force: true });
        },
      };
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  };

  if (platform === 'linux' && uid === 0 && exe) {
    const user = unprivilegedUser();
    for (const noSandbox of [false, true]) {
      try {
        return await accept(await launchAsUser(puppeteer, { executablePath: exe, user, noSandbox, onLaunch }), user.name, noSandbox);
      } catch (e) {
        if (/need Chromium/.test(e.message)) throw e;
        if (noSandbox) userRan = false;
        else sandboxFailures.push(e.message);
        tried.push(`as ${user.name}${noSandbox ? ' without the OS sandbox' : ''}: ${e.message.split('\n')[0]}`);
      }
    }
  } else if (uid !== 0) {
    try {
      return await accept(await launchHere([]), whoami(), false);
    } catch (e) {
      if (/need Chromium/.test(e.message)) throw e;
      sandboxFailures.push(e.message);
      tried.push(`with the OS sandbox: ${e.message.split('\n')[0]}`);
    }
  } else {
    skipped = exe ? 'root-outside-linux' : 'no-browser-path';
    tried.push(exe ? 'running as root outside Linux' : 'no browser path to start as another user');
  }
  return accept(await launchHere(['--no-sandbox', '--disable-setuid-sandbox']), uid === 0 ? 'root' : whoami(), true);
}

module.exports = { MIN_CHROMIUM_MAJOR, launchCodeSandbox, unprivilegedUser, PipeTransport, apparmorRestrictsUserns, processSeccompFiltered, offReason, offRemedy };
