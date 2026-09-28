/**
 * THE CLI'S DOOR FOR CODE PACKAGES (portable-packages phase 6, step 3; contract note §9).
 *
 * A code package is a component whose `transform.js` someone else wrote. The door is the one
 * place the CLI render runs one, and it carries every obligation the follow-up listed
 * (followups.d/2314-p4-code-packages.md, "the doors must carry"):
 *
 *   CONSENT FIRST, AT THE LAYER APPROVED. The render refuses, naming the package, any code
 *     package a slide claims that the user has not approved at exactly these bytes
 *     (lib/packages/trust.js), before anything runs; and it refuses a package approved with
 *     Chromium's OS sandbox on when this render's browser can't give it that layer.
 *   ONE SLOT, IN THE ENGINE. Packages run in the registry's code-packages slot, right after the
 *     charts (lib/transformers/code-packages.js says why). The engine's render is synchronous and
 *     a package runs asynchronously, so `renderWithCodePackages` renders TWICE: the first render
 *     captures the sections the packages claim, the worker runs them, and the second render puts
 *     their sanitized output in at the same slot. A deck no package claims renders once.
 *   FIRST MATCH (code-door-core.mjs `claimedSlides`). The chart dispatch's rule: shipped
 *     components with a transform first, then the installed code packages by name.
 *   CONTAINED. The worker (code-door-worker.js) runs each package in its own locked page, in the
 *     code sandbox's browser, with the OS layer lib/core/os-sandbox.js could arrange.
 *   SANITIZED, KEEPING ONLY WHAT IT WAS HANDED. The output goes through the slide sanitizer with
 *     the door's attribute rule (lib/core/door-attr.mjs `doorFilterAttr`): an address survives
 *     only if the section the package was handed held it, and an engine channel marker only if it
 *     was handed.
 *   BOUNDED. 2 s per slide (the contract), the sanitizer timed the same way, and one budget for
 *     the whole render, across every pass, that the host enforces by killing the worker.
 *   NEVER BLANK, NEVER SILENT. A slide whose package failed keeps the engine's section with a
 *     visible note naming the package and the reason; the terminal gets the same, one printable
 *     line at a time. A slide that names a package but that a shipped component claims is named.
 *   THE AUTHOR'S NOTES AND STYLES SURVIVE (code-door-core.mjs `spliced`).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { captureHook: coreCapture, substituteHook: coreSubstitute, claimKey: keyOf, engineClaimsOf, printableLine, slideInput, spliced, withFailureNote, SLIDE_MS, NOTE_CHARS } = require('./code-door-core.mjs');
const { requiredTokenList } = require('../theme/derive.js');

/** The palette token names every theme defines: handed to a package in its slide's facts. */
const TOKENS = Object.freeze(requiredTokenList());
const { codeDigest, readTrust, trustFile } = require('./trust.js');
const { pkgRootFrom } = require('../core/pkg-root.js');
const SHIPPED = require('./packages.generated.json');

/** Every shipped component whose own transform draws its slides: the engine's claims come first. */
const ENGINE_CLAIMS = engineClaimsOf(SHIPPED);

// Resolved from the package root, not `__dirname`: bundled into dist/lattice-emulator.js this
// module's `__dirname` is dist/, and the worker ships as a loose file under lib/.
const WORKER = path.join(pkgRootFrom(__dirname), 'lib', 'packages', 'code-door-worker.js');

/** The whole render's budget for code packages, after the browser has started, across every pass. */
const RENDER_BUDGET_MS = 30000;
/** What the host allows the worker beyond the budget: a browser launch, and its OS-sandbox probe. */
const LAUNCH_ALLOWANCE_MS = 30000;
/** The OS layers, weakest first (lib/core/os-sandbox.js). */
const LAYER_RANK = { off: 0, unmeasured: 1, on: 2 };

/**
 * The installed code packages the user has not approved at their current bytes.
 * @param {Array<{ name: string, pkg?: object, sha256?: string }>} codePackages
 * @returns {Array<{ name: string, sha256: string }>}
 */
function untrustedCodePackages(codePackages, { file = trustFile() } = {}) {
  const trusted = readTrust(file);
  return codePackages.map((p) => ({ name: p.name, sha256: p.sha256 ?? codeDigest(p.pkg) })).filter((p) => trusted[`component/${p.name}`]?.sha256 !== p.sha256);
}

// ONE RENDER, ONE BUDGET. `--strip-notes` and `--strip-captions` render the deck more than once, and
// each render comes through here, so the budget and the results are this process's, not each
// call's: a section a package already drew is not run again, and the time a package burned on the
// first pass is not handed to it fresh on the next (the red team).
const memo = new Map();
let spentMs = 0;

/** Kill any browser a killed worker left behind, and remove its profile (the state file it wrote). */
function reap(scratch) {
  let launched = [];
  try {
    launched = JSON.parse(fs.readFileSync(path.join(scratch, 'state.json'), 'utf8'));
  } catch {
    /* the worker never launched a browser, or closed it itself and removed the file */
  }
  for (const { pid, dir } of Array.isArray(launched) ? launched : []) {
    if (Number.isInteger(pid) && pid > 1) {
      for (const target of [-pid, pid]) {
        try {
          process.kill(target, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    }
    if (typeof dir === 'string' && path.basename(dir).startsWith('lattice-code-sandbox-')) fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}

/** The worker's answer, read from its line stream: whatever it said before it ended or was killed. */
function readAnswer(r, limitMs) {
  const answer = { results: [], console: {} };
  for (const line of String(r.stdout || '').split('\n')) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.t === 'launch') Object.assign(answer, { launchMs: msg.launchMs, layer: msg.layer, version: msg.version });
    else if (msg.t === 'result') answer.results.push(msg);
    else if (msg.t === 'console') (answer.console[msg.name] ??= []).push(String(msg.text));
    else if (msg.t === 'refused') answer.refused = msg.names;
    else if (msg.t === 'fatal') answer.fatal = msg.message;
  }
  if (!answer.fatal && r.status !== 0) {
    answer.fatal =
      r.error?.code === 'ENOBUFS' ? 'the code packages returned more output than a render takes'
      : r.error?.code === 'ETIMEDOUT' ? `the render's ${limitMs / 1000} s limit for code packages ran out`
      : `the code sandbox stopped (${r.signal || r.status})`;
  }
  return answer;
}

/** A package's sanitized section spliced in, or the engine's slide with a note if it can't be. */
function splicedOrNote(c, got) {
  try {
    return spliced(c.html, got.html, got.classes || [], c.pkg);
  } catch (e) {
    return withFailureNote(c.html, c.pkg, `its output could not be put in place (${e.message})`);
  }
}

/** The kernel's hooks, with the engine claims of the shipped index as the default. */
const captureHook = (names, { baseUrl = '', engineClaims = ENGINE_CLAIMS } = {}) => coreCapture(names, { baseUrl, engineClaims });
const substituteHook = (names, sections, codeOf, { baseUrl = '', engineClaims = ENGINE_CLAIMS } = {}) => coreSubstitute(names, sections, codeOf, { baseUrl, engineClaims });

/**
 * Run the captured claims in the worker. Returns each claim's replacement section by key, or a
 * refusal that must stop the render (a package approved at a stronger OS layer than this browser
 * gives it).
 */
function runClaims(claims, { packages, executablePath, budgetMs, slideMs, warn, info }) {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const key = (c) => keyOf(c, byName.get(c.pkg).code);
  const errors = new Map();
  // Each slide's plain facts (slide-facts.mjs) are read here, on the host, in no realm a package runs
  // in. A slide whose facts cannot be read fails alone, with its note, never the whole render (the
  // first cut let a throw end the CLI; the red team).
  const inputs = new Map();
  for (const c of claims) {
    if (memo.has(key(c)) || inputs.has(key(c)) || errors.has(key(c))) continue;
    try {
      inputs.set(key(c), slideInput(c, TOKENS, byName.get(c.pkg).facts));
    } catch (e) {
      errors.set(key(c), `its slide's facts could not be read (${e.message})`);
    }
  }
  const todo = [...new Map(claims.filter((c) => inputs.has(key(c))).map((c) => [key(c), c])).values()];
  const left = budgetMs - spentMs;
  if (todo.length && left <= 0) {
    for (const c of todo) errors.set(key(c), `the render's ${budgetMs / 1000} s budget for code packages ran out`);
  } else if (todo.length) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-door-'));
    const names = [...new Set(todo.map((c) => c.pkg))];
    const job = {
      executablePath,
      slideMs,
      budgetMs: left,
      state: path.join(scratch, 'state.json'),
      packages: Object.fromEntries(names.map((n) => [n, { code: byName.get(n).code, minLayer: byName.get(n).layer ?? null }])),
      slides: todo.map((c, k) => ({ i: k, pkg: c.pkg, ...inputs.get(key(c)) })),
    };
    const t0 = Date.now();
    let r;
    try {
      r = spawnSync(process.execPath, [WORKER], {
        input: JSON.stringify(job),
        encoding: 'utf8',
        timeout: left + LAUNCH_ALLOWANCE_MS,
        killSignal: 'SIGKILL',
        maxBuffer: 256 * 1024 * 1024,
        // The worker's own stderr is Chromium's chatter; the door reports what matters itself.
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } finally {
      reap(scratch);
    }
    const answer = readAnswer(r, left + LAUNCH_ALLOWANCE_MS);
    spentMs += Math.max(0, Date.now() - t0 - (Number(answer.launchMs) || 0));
    if (answer.layer) {
      const line = `code packages: ${names.join(', ')} — OS sandbox ${answer.layer.summary}`;
      if (answer.layer.os === 'on') info(`  ${line}`);
      // Never hidden by --quiet: the user approved code, and this is how much of it is contained.
      else warn(`warning: ${line}${answer.layer.tried?.length ? ` (${answer.layer.tried.join('; ')})` : ''}. To put it on, set CHROME_PATH to a Chromium the unprivileged user can run.`);
    }
    if (answer.refused?.length) {
      return {
        refusal: answer.refused.map((n) => `error: you approved the code package ${n} with the OS sandbox ${byName.get(n).layer}, and this render's browser gives it ${answer.layer?.os}: ${answer.layer?.summary}.\n       run it where you approved it (set CHROME_PATH to that browser), or approve it again here: lattice packages trust component/${n}`),
      };
    }
    const byI = new Map((answer.results || []).map((x) => [x.i, x]));
    todo.forEach((c, k) => {
      const got = byI.get(k);
      if (got?.html) memo.set(key(c), got);
      else errors.set(key(c), got?.error || answer.fatal || 'it returned nothing');
    });
    for (const n of names) {
      const failed = todo.filter((c) => c.pkg === n && errors.has(key(c)));
      if (!failed.length) continue;
      warn(`warning: the code package ${n} did not draw ${failed.length} slide${failed.length > 1 ? 's' : ''} (${failed.map((c) => c.index + 1).join(', ')}); each carries a note instead: ${String(errors.get(key(failed[0]))).slice(0, NOTE_CHARS)}`);
      for (const line of answer.console?.[n] || []) warn(`         [${n} console] ${line}`);
    }
  }
  const sections = new Map();
  for (const c of claims) {
    const got = memo.get(key(c));
    sections.set(key(c), got ? splicedOrNote(c, got) : withFailureNote(c.html, c.pkg, errors.get(key(c)) || 'it did not run'));
  }
  return { sections };
}

/**
 * Render a deck with its code packages. `render(hook)` renders the deck once, with `hook` as the
 * registry's code-packages hook, and returns the engine's result. Renders once when no package
 * claims a slide, twice when one does. Returns the result, or a refusal to print before exiting.
 * @param {(hook: Function) => object} render
 * @param {{ packages: Array<{ name: string, code: string, facts?: number, layer?: string|null }>, baseUrl?: string,
 *   executablePath?: string, budgetMs?: number, slideMs?: number, engineClaims?: string[],
 *   warn?: (line: string) => void, info?: (line: string) => void }} opts
 * @returns {{ rendered?: object, claimed: string[], refusal?: string[] }}
 */
function renderWithCodePackages(render, opts) {
  const { packages, baseUrl = '', executablePath, budgetMs = RENDER_BUDGET_MS, slideMs = SLIDE_MS, engineClaims = ENGINE_CLAIMS } = opts;
  // Every line can carry a stranger's text (a package name, a thrown message, its console): one
  // printable line each, so none can clear the screen or pose as a line of ours.
  const warn = (s) => (opts.warn ?? (() => {}))(String(s).split('\n').map(printableLine).join('\n'));
  const info = (s) => (opts.info ?? (() => {}))(printableLine(s));
  const names = packages.map((p) => p.name);
  const cap = captureHook(names, { baseUrl, engineClaims });
  const first = render(cap.hook);
  for (const s of cap.shadowed) warn(`warning: slide ${s.slide} names the code package ${s.pkg}, and the shipped component ${s.engine} draws it instead`);
  const claimed = [...new Set(cap.claims.map((c) => c.pkg))];
  if (!cap.claims.length) return { rendered: first, claimed };
  const untrusted = untrustedCodePackages(packages.filter((p) => claimed.includes(p.name)).map((p) => ({ name: p.name, sha256: p.sha256 })));
  if (untrusted.length) {
    return {
      claimed,
      refusal: untrusted.map((u) => `error: the deck uses the code package ${u.name}, and you have not approved its code (sha256 ${u.sha256})\n       to read what it runs and approve it: lattice packages trust component/${u.name}`),
    };
  }
  const ran = runClaims(cap.claims, { packages, executablePath, budgetMs, slideMs, warn, info });
  if (ran.refusal) return { claimed, refusal: ran.refusal };
  const codeOf = new Map(packages.map((p) => [p.name, p.code]));
  return { claimed, rendered: render(substituteHook(names, ran.sections, codeOf, { baseUrl, engineClaims })) };
}

module.exports = { ENGINE_CLAIMS, RENDER_BUDGET_MS, LAYER_RANK, untrustedCodePackages, captureHook, substituteHook, renderWithCodePackages };
