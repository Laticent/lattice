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
const { captureFences, substituteFences, fenceInput, fenceKey, fenceMarkup, inlineInput, inlineMarkup, withFenceNote, planFencePlugins, fenceCaptureNotes, fenceOutputNote, FENCE_OUTPUT_MAX } = require('./code-door-fence.mjs');
const { compileSlot } = require('../core/segno-spec.js');

/**
 * The fields an inline span's record holds, read by its kind's declared slot (2026-10-14-plugin-inline-door.md §4.3),
 * as plain data, and whether the kind declares a slot at all: `fields` is null when it declares none, the slot does
 * not compile (the gate refused that at add), or the record does not read, which the caller refuses to run. The
 * Studio's door reads the same way (docs/src/lib/code-packages/door-run.ts `inlineFields`).
 */
const inlineSlots = new Map();
function inlineFields(plugin, kind, text) {
  const key = `${plugin?.sha256}\u0000${kind}`;
  if (!inlineSlots.has(key)) {
    const spec = (plugin?.kinds ?? []).find((k) => k && k.name === kind)?.slot;
    let compiled = null;
    try {
      compiled = spec && typeof spec === 'object' ? compileSlot(spec, `${plugin.name}.inline.${kind}`) : null;
    } catch {
      compiled = null;
    }
    if (inlineSlots.size > 400) inlineSlots.clear();
    inlineSlots.set(key, compiled);
  }
  const slot = inlineSlots.get(key);
  const declared = !!(plugin?.kinds ?? []).find((k) => k && k.name === kind)?.slot;
  if (!slot) return { declared, fields: null };
  const read = slot.read(text.slice(kind.length + 1));
  return { declared, fields: read.ok && read.value && typeof read.value === 'object' ? JSON.parse(JSON.stringify(read.value)) : null };
}
const { rebuiltBy } = require('../transformers/rebuilt-classes.js');
const { requiredTokenList } = require('../theme/derive.js');

/** The palette token names every theme defines: handed to a package in its slide's facts. */
const TOKENS = Object.freeze(requiredTokenList());
const crypto = require('node:crypto');
const { codeDigest, pluginDigest, readTrust, trustFile } = require('./trust.js');
const { pkgRootFrom } = require('../core/pkg-root.js');
const SHIPPED = require('./packages.generated.json');
/** Every highlight.js language and alias (generated, tools/build-packages-index.js): a plugin fence of one would take over its code blocks. */
const HIGHLIGHT_LANGUAGES = new Set(require('./fence-door.generated.json').highlightLanguages);

/**
 * What a render says about the OS layer its code packages ran under. OFF is a warning that
 * `--quiet` never hides (the user approved code, and this is how much of it is contained), with the
 * consent text's remedy for its reason: one fixed sentence told an ordinary user on Ubuntu 24.04 to
 * set CHROME_PATH, which cannot lift AppArmor (os-sandbox.js offReason). 'unmeasured' means the
 * probe could not read the layer on any platform (macOS and Windows are measured since decision 13),
 * so nothing confirms the sandbox: a warning too, without a remedy to offer.
 * @returns {{ warn: boolean, text: string }}
 */
function sandboxNotice(names, layer) {
  const line = `code packages: ${names.join(', ')} — OS sandbox ${layer.summary}`;
  if (layer.os === 'unmeasured') return { warn: true, text: `warning: ${line}.` };
  if (layer.os !== 'off') return { warn: false, text: `  ${line}` };
  const remedy = require('../core/os-sandbox.js').offRemedy(layer.reason);
  const why = layer.tried?.length ? ` (${layer.tried.join('; ')})` : '';
  return { warn: true, text: `warning: ${line}${why}.${remedy ? ` ${remedy[0].toUpperCase()}${remedy.slice(1)}.` : ''}` };
}

/** Every shipped component whose own transform draws its slides: the engine's claims come first. */
const ENGINE_CLAIMS = engineClaimsOf(SHIPPED);

// Resolved from the package root, not `__dirname`: bundled into dist/lattice.js this
// module's `__dirname` is dist/, and the worker ships as a loose file under lib/.
const { admitNpmBundle } = require('./npm-plugin-admission.js');
const WORKER = path.join(pkgRootFrom(__dirname), 'lib', 'packages', 'code-door-worker.js');

/** The slide numbers of a failure warning: each once, in order, and not more than ten. */
function slideList(numbers) {
  const all = [...new Set(numbers)];
  return all.length > 10 ? `${all.slice(0, 10).join(', ')} and ${all.length - 10} more` : all.join(', ');
}

/** The fence names the shipped plugins own, aliases included: the engine's fence table takes those blocks before the door sees them. */
function shippedFenceNames() {
  const names = new Set();
  for (const p of require('../plugins/host.js').PLUGINS) {
    for (const [fence, decl] of Object.entries(p.fences || {})) {
      names.add(fence);
      for (const a of decl.aliases || []) names.add(a.name);
    }
  }
  return names;
}

/** The whole render's budget for code packages, after the browser has started, across every pass. */
const RENDER_BUDGET_MS = 30000;
/** What the host allows the worker beyond the budget: a browser launch, and its OS-sandbox probe. */
const LAUNCH_ALLOWANCE_MS = 30000;
/** The OS layers, weakest first (lib/core/os-sandbox.js). */
const LAYER_RANK = { off: 0, unmeasured: 1, on: 2 };

/**
 * The installed code packages the user has not approved at their current bytes. A component's
 * approval is under `component/<name>`; a plugin's, under `plugin/<name>` (`type: 'plugin'`).
 * @param {Array<{ name: string, type?: 'component'|'plugin', pkg?: object, sha256?: string }>} codePackages
 * @returns {Array<{ name: string, type?: 'plugin', sha256: string }>}
 */
function untrustedCodePackages(codePackages, { file = trustFile() } = {}) {
  const trusted = readTrust(file);
  return codePackages
    .map((p) => ({ name: p.name, type: p.type ?? 'component', sha256: p.sha256 ?? codeDigest(p.pkg) }))
    .filter((p) => trusted[`${p.type}/${p.name}`]?.sha256 !== p.sha256)
    // A component's entry keeps its shape; only a plugin says what it is.
    .map(({ name, type, sha256 }) => (type === 'component' ? { name, sha256 } : { name, type, sha256 }));
}

/** The worker's name for a claim's package: a plugin shares no namespace with a component of the same name. */
const unitOf = (c) => (c.kind === 'fence' ? `plugin/${c.pkg}` : c.pkg);
/** What `lattice packages trust` takes for a unit. */
const trustName = (unit) => (unit.includes('/') ? unit : `component/${unit}`);

// ONE RENDER, ONE BUDGET. `--strip-notes` and `--strip-say` render the deck more than once, and
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
    else if (msg.t === 'refused') Object.assign(answer, { refused: msg.names, npmReasons: msg.npm ?? {} });
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
  // Keyed by unit (`unitOf`): a slide package by its name, a plugin's fence renderer as `plugin/<name>`.
  const byName = new Map(packages.map((p) => [p.fence ? `plugin/${p.name}` : p.name, p]));
  // Keys carry each code's DIGEST, never its text: a key per fence that held 300 KB of code was 7.6 GB for 8,000 fences.
  const key = (c) => (c.kind === 'fence' ? fenceKey(c, byName.get(unitOf(c)).sha256) : keyOf(c, byName.get(c.pkg).sha256));
  const errors = new Map();
  // Each slide's plain facts (slide-facts.mjs) are read here, on the host, in no realm a package runs
  // in. A slide whose facts cannot be read fails alone, with its note, never the whole render (the
  // first cut let a throw end the CLI; the red team).
  const inputs = new Map();
  for (const c of claims) {
    if (memo.has(key(c)) || inputs.has(key(c)) || errors.has(key(c))) continue;
    try {
      // A fence is handed its text and an id; a slide, its section and facts (decision 10).
      // An inline span, its kind, its text, the fields its declared slot reads, and an id.
      if (c.kind === 'fence' && c.inline) {
        const read = inlineFields(byName.get(unitOf(c)), c.inline, c.body);
        // A kind that declares a slot is handed only a record the slot reads: one that does not read stays code, with why.
        if (read.declared && !read.fields) {
          errors.set(key(c), `\`${c.body.slice(0, 60)}\` does not read as the kind's declared slot`);
          continue;
        }
        const input = inlineInput(c, read.fields);
        inputs.set(key(c), { kind: 'fence', inlineKind: input.kind, text: input.text, record: input.record, fields: input.fields, id: input.id });
      } else inputs.set(key(c), c.kind === 'fence' ? { kind: 'fence', ...fenceInput(c) } : slideInput(c, TOKENS, byName.get(c.pkg).facts));
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
    const names = [...new Set(todo.map(unitOf))];
    const job = {
      executablePath,
      slideMs,
      budgetMs: left,
      state: path.join(scratch, 'state.json'),
      packages: Object.fromEntries(names.map((n) => [n, { code: byName.get(n).code, minLayer: byName.get(n).layer ?? null, fence: !!byName.get(n).fence, npm: byName.get(n).source === 'npm' }])),
      slides: todo.map((c, k) => ({ i: k, pkg: unitOf(c), ...inputs.get(key(c)) })),
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
      const notice = sandboxNotice(names, answer.layer);
      if (notice.warn) warn(notice.text);
      else info(notice.text);
    }
    if (answer.refused?.length) {
      return {
        refusal: answer.refused.map((n) =>
          answer.npmReasons?.[n]
            ? `error: the npm plugin ${n.replace(/^plugin\//, '')} does not run here: ${answer.npmReasons[n]}.\n       an npm plugin is never run where the OS sandbox is off or cannot be measured (code packages may be). ${(require('../core/os-sandbox.js').offRemedy(answer.layer?.reason) ?? 'run Lattice where the browser can start its OS sandbox').replace(/, then approve again$/, '')}`
            : `error: you approved the code package ${n} with the OS sandbox ${byName.get(n).layer}, and this render's browser gives it ${answer.layer?.os}: ${answer.layer?.summary}.\n       run it where you approved it (set CHROME_PATH to that browser), or approve it again here: lattice packages trust ${trustName(n)}`,
        ),
      };
    }
    const byI = new Map((answer.results || []).map((x) => [x.i, x]));
    todo.forEach((c, k) => {
      const got = byI.get(k);
      if (got?.html) memo.set(key(c), got);
      else errors.set(key(c), got?.error || answer.fatal || 'it returned nothing');
    });
    for (const n of names) {
      const failed = todo.filter((c) => unitOf(c) === n && errors.has(key(c)));
      if (!failed.length) continue;
      const what = failed[0].kind === 'fence' ? (failed[0].inline ? 'span' : 'block') : 'slide';
      const where = slideList(failed.map((c) => (c.kind === 'fence' ? c.slide : c.index) + 1));
      const plugin = what !== 'slide';
      warn(`warning: the ${plugin ? 'plugin' : 'code package'} ${n.replace(/^plugin\//, '')} did not draw ${failed.length} ${what}${failed.length > 1 ? 's' : ''} (${plugin ? 'on slide ' : ''}${where}); ${what === 'span' ? 'each stays code' : 'each carries a note instead'}: ${String(errors.get(key(failed[0]))).slice(0, NOTE_CHARS)}`);
      for (const line of answer.console?.[n] || []) warn(`         [${n} console] ${line}`);
    }
  }
  const sections = new Map();
  let fenceOut = 0;
  for (const c of claims) {
    const got = memo.get(key(c));
    const why = errors.get(key(c)) || 'it did not run';
    // A span that cannot draw keeps its code: a note is a block, and a block in a sentence breaks it.
    const notDrawn = (note) => (c.inline ? c.block : withFenceNote(c.block, c.pkg, note));
    if (c.kind === 'fence' && got && (fenceOut += got.html.length) > FENCE_OUTPUT_MAX) {
      sections.set(key(c), notDrawn(fenceOutputNote()));
      continue;
    }
    if (c.kind === 'fence') sections.set(key(c), got ? (c.inline ? inlineMarkup(c.pkg, c.inline, got.html) : fenceMarkup(c.pkg, got.html)) : notDrawn(why));
    else sections.set(key(c), got ? splicedOrNote(c, got) : withFailureNote(c.html, c.pkg, why));
  }
  return { sections };
}

/**
 * Render a deck with its code packages and plugins. `render(hook)` renders the deck once, with
 * `hook` as the registry's code-packages hook, and returns the engine's result. Renders once when
 * nothing is claimed, twice when something is. Returns the result, or a refusal to print before exiting.
 *
 * A code package owns a SLIDE (a component's `transform.js`). A plugin owns a FENCE (a data-layer
 * plugin's `render.js`, plugin-system §9 decisions 3 and 10), named by `fence`, which need not be
 * the plugin's own name. Both run in the one worker, under the one budget, with consent pinned to
 * each one's code.
 * @param {(hook: Function, more: { codeFences: object }) => object} render  renders the deck once; the caller passes `hook` as
 *   the engine's `codePackages` and the second argument's `codeFences` on, both as render options
 * @param {{ packages: Array<{ name: string, code: string, facts?: number, layer?: string|null }>,
 *   plugins?: Array<{ name: string, fence: string, code: string, layer?: string|null, source?: 'npm', pin?: string }>, baseUrl?: string,
 *   executablePath?: string, budgetMs?: number, slideMs?: number, engineClaims?: string[],
 *   warn?: (line: string) => void, info?: (line: string) => void }} opts
 * @returns {{ rendered?: object, claimed: string[], refusal?: string[] }}
 */
function renderWithCodePackages(render, opts) {
  const { baseUrl = '', executablePath, budgetMs = RENDER_BUDGET_MS, slideMs = SLIDE_MS, engineClaims = ENGINE_CLAIMS } = opts;
  // Every line can carry a stranger's text (a package name, a thrown message, its console): one
  // printable line each, so none can clear the screen or pose as a line of ours.
  const warn = (s) => (opts.warn ?? (() => {}))(String(s).split('\n').map(printableLine).join('\n'));
  const info = (s) => (opts.info ?? (() => {}))(printableLine(s));
  // THE DOOR HASHES THE CODE ITSELF. A digest the caller states is a digest it could state for other
  // code: approval was checked against the stated hash, so approved code's hash on different code ran
  // the different code (the red team). Both the consent check and every key use this one.
  const sha = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
  // A malformed plugin entry is refused with a line, never a throw that takes the render with it.
  opts = {
    ...opts,
    plugins: (opts.plugins ?? []).filter((p) => {
      const ok = p && typeof p === 'object' && typeof p.name === 'string' && p.name && typeof p.fence === 'string' && (p.kinds === undefined || Array.isArray(p.kinds)) && (typeof p.code === 'string' || p.code instanceof Uint8Array);
      if (!ok) warn(`warning: a plugin entry${p && typeof p.name === 'string' ? ` (${p.name})` : ''} is missing its name, fence or code, so it is not run`);
      // An npm plugin is admitted as BYTES against the hash pinned in the project's plugin list, before
      // anything else looks at it (lib/packages/npm-plugin-admission.js; note §5.1 G2).
      if (ok && p.source === 'npm') {
        const admitted = admitNpmBundle({ name: p.name, code: p.code, sha256: p.pin });
        if (!admitted.ok) {
          warn(`warning: the npm plugin ${p.name} is refused: ${admitted.reason}, so it is not run`);
          return false;
        }
      }
      return ok;
    }).map((p) => (p.code instanceof Uint8Array ? { ...p, code: Buffer.from(p.code).toString('utf8') } : p)), // admitted as bytes, run as text (the worker's job is JSON)
  };
  // A plugin's inline kinds (2026-10-14-plugin-inline-door.md), by name: what the plan, the digest and the capture read.
  const kindNames = (p) => (p.kinds ?? []).map((k) => (typeof k === 'string' ? k : k?.name)).filter((k) => typeof k === 'string');
  const packages = opts.packages.map((p) => ({ ...p, sha256: sha(p.code) }));
  const names = packages.map((p) => p.name);
  // Which plugins run, and a line for each that does not (the rules both doors share: code-door-fence.mjs).
  const planned = planFencePlugins(
    opts.plugins.map((p) => ({ ...p, kinds: kindNames(p) })),
    { shipped: shippedFenceNames(), isLanguage: (n) => HIGHLIGHT_LANGUAGES.has(n), shippedKinds: require('./fence-door.generated.json').shippedKinds },
  );
  for (const n of planned.notes) warn(n);
  const runSet = new Set(planned.run.map((p) => p.name));
  const plugins = opts.plugins.filter((p) => runSet.has(p.name)).map((p) => ({ ...p, sha256: pluginDigest(p.code, p.fence, (p.kinds ?? []).map((k) => (typeof k === 'string' ? { name: k } : { name: k.name, ...(k.slot ? { slot: k.slot } : {}) }))) }));
  // What runs by what it draws: a fence or a kind two plugins share is in neither map.
  const fences = planned.fences;
  const kinds = planned.kinds;
  const cap = captureHook(names, { baseUrl, engineClaims });
  const capFences = captureFences(fences, { names, engineClaims, rebuilt: rebuiltBy, kinds });
  const first = render(cap.hook, { codeFences: capFences });
  for (const s of cap.shadowed) warn(`warning: slide ${s.slide} names the code package ${s.pkg}, and the shipped component ${s.engine} draws it instead`);
  for (const n of fenceCaptureNotes(capFences, fences)) warn(n);
  // A plugin's inline span rides the fence path (the same renderer, sandbox and budget), marked by `inline`.
  const fenceClaims = capFences.claims.map((c) => ({ ...c, kind: 'fence' }));
  const claimedSlidePackages = [...new Set(cap.claims.map((c) => c.pkg))];
  const claimedPlugins = [...new Set(fenceClaims.map((c) => c.pkg))];
  const claimed = [...claimedSlidePackages, ...claimedPlugins.map((n) => `plugin/${n}`)];
  if (!cap.claims.length && !fenceClaims.length && !capFences.escapes) return { rendered: first, claimed };
  const ofKind = (list, type) => list.map((p) => ({ name: p.name, type, sha256: p.sha256 }));
  const untrusted = untrustedCodePackages([
    ...ofKind(packages.filter((p) => claimedSlidePackages.includes(p.name)), 'component'),
    ...ofKind(plugins.filter((p) => claimedPlugins.includes(p.name)), 'plugin'),
  ]);
  if (untrusted.length) {
    // An npm plugin is approved from its list's folder, and only where the OS sandbox lets npm plugins run.
    const npmNames = new Set(plugins.filter((p) => p.source === 'npm').map((p) => p.name));
    return {
      claimed,
      refusal: untrusted.map((u) =>
        `error: the deck uses the ${u.type === 'plugin' ? (npmNames.has(u.name) ? 'npm plugin' : 'plugin') : 'code package'} ${u.name}, and you have not approved its code (sha256 ${u.sha256})\n       to read what it runs and approve it: lattice packages trust ${u.type ?? 'component'}/${u.name}${npmNames.has(u.name) ? ' <the deck’s folder> (npm plugins are approved only where the OS sandbox is on)' : ''}`,
      ),
    };
  }
  const runnable = [...packages, ...plugins.map((p) => ({ ...p, fence: true }))];
  const ran = runClaims([...cap.claims, ...fenceClaims], { packages: runnable, executablePath, budgetMs, slideMs, warn, info });
  if (ran.refusal) return { claimed, refusal: ran.refusal };
  const slideDigestOf = new Map(packages.map((p) => [p.name, p.sha256]));
  const pluginDigestOf = new Map(plugins.map((p) => [p.name, p.sha256]));
  const slides = substituteHook(names, ran.sections, slideDigestOf, { baseUrl, engineClaims });
  const blocks = substituteFences(fences, ran.sections, pluginDigestOf, { names, engineClaims, rebuilt: rebuiltBy, kinds });
  return { claimed, rendered: render(slides, { codeFences: blocks }) };
}

module.exports = { ENGINE_CLAIMS, RENDER_BUDGET_MS, LAYER_RANK, untrustedCodePackages, captureHook, substituteHook, renderWithCodePackages, sandboxNotice };
