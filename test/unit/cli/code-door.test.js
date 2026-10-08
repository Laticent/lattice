/**
 * The door for code packages, the parts that need no browser: the registry slot and its hook
 * (lib/transformers/code-packages.js), the shared kernel (lib/packages/code-door-core.mjs), the
 * CLI's capture and substitute hooks (lib/packages/code-door.js), consent (lib/packages/trust.js),
 * the gate (lib/packages/gate.js refuseCode), the attribute rule (lib/core/door-attr.mjs
 * doorFilterAttr) and the OS layer's user (lib/core/os-sandbox.js). The door run through the real
 * CLI, with a network log, is test/integration/export/code-package-door.test.js.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { claimedSlides, spliced, withFailureNote, printableLine, engineClaimsOf, slideInput } = require('../../../lib/packages/code-door-core.mjs');
const { ENGINE_CLAIMS, untrustedCodePackages, captureHook, substituteHook } = require('../../../lib/packages/code-door.js');
const { codeDigest, isTrusted, grantTrust, revokeTrust, readTrust, trustFile } = require('../../../lib/packages/trust.js');
const { refuseCode } = require('../../../lib/packages/gate.js');
const { unprivilegedUser, apparmorRestrictsUserns, processSeccompFiltered, offReason, offRemedy } = require('../../../lib/core/os-sandbox.js');
const { cssRefTargets, doorFilterAttr, handedOf } = require('../../../lib/core/door-attr.mjs');
const engine = require('../../../lib/engine');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `lattice-door-${p}-`));
const pkg = (code, name = 'tally', extra = {}, manifest = { facts: 1 }) => ({
  type: 'component',
  name,
  manifest: { name, type: 'component', ...manifest },
  roles: { 'transform.js': `${name}.transform.js` },
  files: { [`${name}.transform.js`]: code, ...extra },
  code: true,
});
const deck = (...classes) => `<article>${classes.map((c) => `<section class="${c}"><p>${c}</p></section>`).join('\n')}</article>`;

describe('the registry slot', () => {
  const md = '---\ntheme: indaco\n---\n\n<!-- _class: tally -->\n\n## Three wins\n\n- 3\n\n---\n\n<!-- _class: bar -->\n\n## Bars\n\n- A `1`\n- B `2`\n';

  test('without a hook the render is byte-identical', () => {
    const e = engine.createEngine();
    assert.equal(e.render(md, 'indaco', { codePackages: undefined }).html, e.render(md, 'indaco').html);
  });

  test('the hook sees the deck after the charts and before the masthead lift, with positions and the id prefix', () => {
    const seen = [];
    engine.createEngine().render(md, 'indaco', {
      codePackages: (html, ctx) => {
        seen.push({ html, index: ctx.slideIndex(1), idPrefix: ctx.idPrefix });
        return html;
      },
    });
    assert.equal(seen.length, 1);
    assert.match(seen[0].html, /class="bar[^"]*chart-frame/, 'the bar chart has already been drawn');
    assert.doesNotMatch(seen[0].html.slice(0, seen[0].html.indexOf('</section>')), /cell-masthead/, 'the masthead lift has not run yet');
    assert.equal(seen[0].index, 1);
    assert.equal(seen[0].idPrefix, '');
  });

  test('what the hook returns is what the rest of the registry frames', () => {
    const out = engine.createEngine().render(md, 'indaco', { codePackages: (html) => html.replace('<li>3</li>', '<li>DRAWN</li>') }).html;
    assert.match(out, /<li>DRAWN<\/li>/);
    assert.match(out, /cell-masthead[\s\S]*Three wins/, 'the masthead lift still frames the slide');
  });

  test('it runs inside a pane, at the host slide’s position', () => {
    const paned = '---\ntheme: indaco\n---\n\n## Intro\n\n---\n\n## Host\n\n<!-- panes: 50/50 -->\n<!-- pane: list -->\n\n- one\n\n<!-- pane: table -->\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    const calls = [];
    engine.createEngine().render(paned, 'indaco', {
      codePackages: (html, ctx) => {
        calls.push({ sections: (html.match(/<section\b/g) || []).length, index: ctx.slideIndex(0) });
        return html;
      },
    });
    const panes = calls.filter((c) => c.sections === 1);
    assert.ok(panes.length >= 2, `each pane renders through the slot (${JSON.stringify(calls)})`);
    assert.ok(panes.every((c) => c.index === 1), `a pane is handed its host slide’s position (${JSON.stringify(calls)})`);
  });
});

describe('routing: the chart dispatch first-match rule', () => {
  test('the engine claims come from the shipped components that have a transform', () => {
    assert.ok(ENGINE_CLAIMS.includes('bar') && ENGINE_CLAIMS.includes('state-chart'));
    // `content` is a shipped component the engine stamps on ordinary sections; it draws with CSS
    // alone, so it must not claim: the first run of the door lost every slide to it.
    assert.ok(!ENGINE_CLAIMS.includes('content'));
    assert.deepEqual(engineClaimsOf({ packages: [{ type: 'component', name: 'a', code: true }, { type: 'component', name: 'b' }, { type: 'theme', name: 'c', code: true }] }), ['a']);
  });

  test('a package takes its own slides; a slide also naming a shipped transform is the engine’s', () => {
    const got = claimedSlides(deck('tally content form', 'bar tally', 'tally bar', 'plain'), { packages: ['tally'], engineClaims: ENGINE_CLAIMS });
    assert.deepEqual(got.map((c) => [c.index, c.pkg]), [[0, 'tally']]);
  });

  test('two packages on one slide: the first by name, never both', () => {
    const got = claimedSlides(deck('zeta alpha', 'zeta'), { packages: ['zeta', 'alpha'], engineClaims: [] });
    assert.deepEqual(got.map((c) => [c.index, c.pkg]), [[0, 'alpha'], [1, 'zeta']]);
  });
});

describe('the two passes: capture, then substitute', () => {
  const slideIndex = (i) => i + 3;

  test('capture records each claim with the render’s position and prefix, and names a shadowed slide', () => {
    const cap = captureHook(['tally'], { engineClaims: ['bar'] });
    const html = deck('a', 'tally', 'bar tally');
    assert.equal(cap.hook(html, { slideIndex, idPrefix: 'lat-r1-' }), html, 'capture changes nothing');
    assert.deepEqual(cap.claims.map((c) => [c.pkg, c.index, c.idPrefix]), [['tally', 4, 'lat-r1-']]);
    assert.deepEqual(cap.shadowed, [{ slide: 6, pkg: 'tally', engine: 'bar' }]);
  });

  test('substitute puts each result in by the same key, and a slide the first pass never saw gets a note', () => {
    const html = deck('tally', 'tally');
    const cap = captureHook(['tally'], { engineClaims: [] });
    cap.hook(html, { slideIndex, idPrefix: '' });
    const code = 'function t(s){return s.html}export{t as default};';
    const first = cap.claims[0];
    const keyed = new Map([[`tally\u0000${first.index}\u0000\u0000\u0000${code}\u0000${first.html}`, '<section class="tally">DRAWN</section>']]);
    const out = substituteHook(['tally'], keyed, new Map([['tally', code]]), { engineClaims: [] })(html, { slideIndex, idPrefix: '' });
    assert.match(out, /<section class="tally">DRAWN<\/section>/);
    assert.match(out, /did not draw this slide: the slide changed between the two renders/);
  });
});

describe('splicing the output back', () => {
  const original = '<section class="tally" id="3"><style>section.tally{gap:1em}</style><ul><li>3</li></ul><!-- a speaker note --></section>';

  test("the engine's tag, styles and notes stay; the package gives only the classes and the body", () => {
    const clean = '<section data-lattice-slide="9" id="evil" style="--theme:x" class="tally extra"><div>drawn</div></section>';
    assert.equal(spliced(original, clean, ['tally', 'tally-wide', 'bad"quote'], 'tally'), '<section class="tally tally-wide" id="3"><div>drawn</div><style>section.tally{gap:1em}</style><!-- a speaker note --></section>');
  });

  test('a package adds no class outside its own name: a later pass keys on section classes', () => {
    const clean = '<section class="tally video qr chart-frame tally-x"><div>drawn</div></section>';
    assert.match(spliced(original, clean, ['tally', 'video', 'qr', 'chart-frame', 'tally-x'], 'tally'), /^<section class="tally tally-x" id="3">/);
  });

  test('whitespace around the section is not content; anything but one section throws, for the door to catch', () => {
    assert.equal(spliced(original, '\n  <section class="tally"><b>x</b></section>\n', ['tally'], 'tally'), '<section class="tally" id="3"><b>x</b><style>section.tally{gap:1em}</style><!-- a speaker note --></section>');
    assert.throws(() => spliced(original, '<div>no section</div>', ['tally'], 'tally'), /not one <section>/);
  });

  test('a failure keeps the engine’s slide and says why, escaped, on one line', () => {
    const out = withFailureNote(original, 'tally', '\u001b[2J<img src=x onerror=alert(1)>\nOS sandbox on');
    assert.ok(out.startsWith(original.slice(0, -'</section>'.length)), 'the engine’s section is kept');
    assert.match(out, /<p data-package-error="tally" role="note">The code package “tally” did not draw this slide: \?\[2J&lt;img src=x onerror=alert\(1\)&gt;\?OS sandbox on<\/p><\/section>$/);
  });

  test('a stranger’s text is one printable line', () => {
    assert.equal(printableLine('a\nb‮\u001bc d\te'), 'a?b??c?d?e');
  });
});

describe('consent, pinned to the bytes and the layer', () => {
  test('the digest is the SHA-256 of transform.js, and an approval is for exactly that', () => {
    const file = path.join(tmp('home'), 'trust.json');
    const p = pkg('function t(s){return s.html}export{t as default};');
    const d = codeDigest(p);
    assert.match(d, /^[0-9a-f]{64}$/);
    assert.equal(isTrusted('component', 'tally', d, file), false);
    grantTrust('component', 'tally', d, { file, now: new Date('2026-09-27T00:00:00Z'), layer: 'on' });
    assert.equal(isTrusted('component', 'tally', d, file), true);
    assert.deepEqual(readTrust(file), { 'component/tally': { sha256: d, at: '2026-09-27T00:00:00.000Z', layer: 'on' } });
    const changed = codeDigest(pkg('function t(s){return s.html}export{t as default}; '));
    assert.equal(isTrusted('component', 'tally', changed, file), false, 'changed code asks again');
    assert.equal(isTrusted('component', 'other', d, file), false, 'the same code under another name asks again');
    assert.deepEqual(untrustedCodePackages([{ name: 'tally', pkg: p }], { file }), []);
    assert.equal(revokeTrust('component', 'tally', { file }), true);
    assert.deepEqual(untrustedCodePackages([{ name: 'tally', pkg: p }], { file }), [{ name: 'tally', sha256: d }]);
  });

  test('consent lives in $LATTICE_HOME, not in the package store; a foreign file grants nothing', () => {
    assert.equal(trustFile({ env: { LATTICE_HOME: '/x/home' } }), path.resolve('/x/home/trust.json'));
    const file = path.join(tmp('home'), 'trust.json');
    fs.writeFileSync(file, '{"trusted":{"component/tally":{"sha256":"x"}}}');
    assert.deepEqual(readTrust(file), {});
    fs.writeFileSync(file, 'not json');
    assert.deepEqual(readTrust(file), {});
  });
});

describe('the gate: the one shape a door runs', () => {
  test('accepts the export form, refuses the rest by name', () => {
    assert.equal(refuseCode(pkg('function t(s){return s.html}export{t as default};')), null);
    assert.match(refuseCode(pkg('module.exports = () => ""')), /does not end in `export \{ name as default \}`/);
    assert.match(refuseCode(pkg('function t(){}export{t as default};', 'tally', { 'x.mjs': '' })), /a script other than tally\.transform\.js \(x\.mjs\)/);
    assert.match(refuseCode({ ...pkg('function t(){}export{t as default};'), type: 'theme' }), /only a component may/);
    assert.match(refuseCode(pkg(`${'x'.repeat(1_000_001)}function t(){}export{t as default};`)), /past the 1,000,000 a code package may carry/);
  });

  test('a code package declares the slide-facts version it reads, and only a known one runs', () => {
    const ok = 'function t(s){return s.html}export{t as default};';
    assert.match(refuseCode(pkg(ok, 'tally', {}, {})), /does not say which slide facts it reads: add "facts": 1 to tally\.manifest\.json/);
    assert.match(refuseCode(pkg(ok, 'tally', {}, { facts: 2 })), /reads slide facts version 2, and this Lattice hands packages version 1: it was made for a newer Lattice/);
    assert.match(refuseCode(pkg(ok, 'tally', {}, { facts: '1' })), /must be a whole number/);
    assert.match(refuseCode(pkg(ok, 'tally', {}, { facts: 0 })), /must be a whole number/);
    // The door refuses the same way at run time, so a package saved before the declaration existed
    // gets a note on its slide rather than facts it did not ask for.
    assert.throws(() => slideInput({ html: '<section></section>', index: 0 }, [], undefined), /does not say which slide facts it reads/);
    assert.equal(slideInput({ html: '<section></section>', index: 0 }, [], 1).facts.version, 1);
  });
});

describe('the attribute rule: a package keeps only what it was handed', () => {
  test('every address in a CSS value, decoded; text outside a function is not an address', () => {
    assert.deepEqual(cssRefTargets(`--logo-mask:url('/etc/x'); content:"Q3"; background:image-set("a.png" 1x), \\75 rl(b.png) /* url(c) */`), ['/etc/x', 'a.png', 'b.png']);
  });

  test('handed addresses pass byte for byte; invented ones do not; data: and #fragment always pass', () => {
    const filter = doorFilterAttr({ refs: new Set(['photo.png', 'https://author.example/pic.png', 'file:///deck/bg.png']), attrs: new Set(), classes: new Set() });
    assert.equal(filter('img', 'src', 'photo.png'), true, "the author's own image passes through");
    assert.equal(filter('img', 'src', 'https://author.example/pic.png'), true, "the author's own web image too: --allow-remote decides about it");
    assert.equal(filter('div', 'style', "background-image:url('file:///deck/bg.png')"), true, "the author's background");
    assert.equal(filter('img', 'src', 'other.png'), false);
    assert.equal(filter('img', 'src', 'https://evil.example/?slide=secret'), false);
    assert.equal(filter('img', 'src', '//evil.example/x'), false);
    assert.equal(filter('span', 'style', "--logo-mask:url('/etc/passwd')"), false);
    assert.equal(filter('span', 'style', '--label:"Q3";color:var(--accent)'), true);
    assert.equal(filter('img', 'src', 'data:image/png;base64,AA'), true);
    assert.equal(filter('rect', 'fill', 'url(#grad-1)'), true);
    assert.equal(filter('a', 'href', 'https://evil.example/?d=1'), false, 'an invented link target too');
    assert.equal(filter('iframe', 'srcdoc', '<p>x</p>'), false);
  });

  test('engine channel markers: only the handed ones survive', () => {
    const handed = handedOf([{ localName: 'section', attributes: [{ name: 'class', value: 'tally lattice-bg-host' }, { name: 'data-lattice-berth', value: '' }] }]);
    const filter = doorFilterAttr(handed);
    assert.equal(filter('aside', 'class', 'lattice-notes speaker'), 'speaker', 'a forged notes channel loses its marker');
    assert.equal(filter('div', 'class', 'lattice-bg-host tally-marks'), 'lattice-bg-host tally-marks');
    assert.equal(filter('div', 'data-lattice-slide', '7'), false);
    assert.equal(filter('div', 'data-lattice-berth', ''), true);
  });
});

describe('the OS layer', () => {
  test('the unprivileged user comes from passwd, else 65534', () => {
    const dir = tmp('passwd');
    fs.writeFileSync(path.join(dir, 'passwd'), 'root:x:0:0::/root:/bin/sh\nnobody:x:99:98::/:/sbin/nologin\n');
    assert.deepEqual(unprivilegedUser(path.join(dir, 'passwd')), { name: 'nobody', uid: 99, gid: 98 });
    assert.deepEqual(unprivilegedUser(path.join(dir, 'missing')), { name: 'nobody', uid: 65534, gid: 65534 });
  });

  // Measured on ubuntu-latest (24.04), PR #2459: AppArmor blocked the sandbox for the ordinary
  // runner user, and the consent text told them to set CHROME_PATH, which cannot help there.
  test('AppArmor’s userns restriction is read from its sysctl', () => {
    const dir = tmp('apparmor');
    fs.writeFileSync(path.join(dir, 'on'), '1\n');
    fs.writeFileSync(path.join(dir, 'off'), '0\n');
    assert.equal(apparmorRestrictsUserns(path.join(dir, 'on')), true);
    assert.equal(apparmorRestrictsUserns(path.join(dir, 'off')), false);
    assert.equal(apparmorRestrictsUserns(path.join(dir, 'missing')), false, 'a kernel without the sysctl has no restriction');
  });

  test('a container is a seccomp filter on this process AND on pid 1', () => {
    const dir = tmp('seccomp');
    const at = (n) => path.join(dir, n);
    fs.writeFileSync(at('filtered'), 'Name:\tnode\nSeccomp:\t2\nSeccomp_filters:\t1\n');
    fs.writeFileSync(at('plain'), 'Name:\tsystemd\nSeccomp:\t0\nSeccomp_filters:\t0\n');
    assert.equal(processSeccompFiltered([at('filtered'), at('filtered')]), true, 'Docker: both filtered');
    // A hardened systemd unit (SystemCallFilter=) filters the service, not systemd: not a container,
    // and AppArmor may be the obstacle there (the checker).
    assert.equal(processSeccompFiltered([at('filtered'), at('plain')]), false);
    assert.equal(processSeccompFiltered([at('plain'), at('plain')]), false);
    assert.equal(processSeccompFiltered([at('filtered'), at('missing')]), false);
  });

  test('each OFF reason maps to its own remedy, and AppArmor never gets the CHROME_PATH advice', () => {
    const failed = ['Failed to launch the browser process!'];
    const cases = [
      [{ platform: 'linux', uid: 1001, failures: failed, filtered: false, apparmor: true }, 'apparmor-userns', /AppArmor profile.*sysctl to 0/],
      // Root: `nobody` ran the browser without the sandbox, so the sandbox was the obstacle.
      [{ platform: 'linux', uid: 0, failures: failed, userRan: true, filtered: false, apparmor: true }, 'apparmor-userns', /apparmor_restrict_unprivileged_userns/],
      [{ platform: 'linux', uid: 0, failures: failed, userRan: true, filtered: false, apparmor: false }, 'sandbox-did-not-start', /the reason above/],
      // Root: `nobody` could not run it at all (a browser under /root). AppArmor is beside the
      // point, even when a container reads its host's sysctl as 1 (the checker).
      [{ platform: 'linux', uid: 0, failures: failed, userRan: false, filtered: false, apparmor: true }, 'unprivileged-user-cannot-run', /CHROME_PATH to a Chromium the unprivileged user can run/],
      [{ platform: 'linux', uid: 0, failures: failed, userRan: false, filtered: false, apparmor: false }, 'unprivileged-user-cannot-run', /CHROME_PATH to a Chromium the unprivileged user can run/],
      [{ platform: 'linux', uid: 1001, failures: failed, filtered: false, apparmor: false }, 'sandbox-did-not-start', /the reason above/],
      [{ platform: 'darwin', uid: 501, failures: failed, filtered: false, apparmor: true }, 'sandbox-did-not-start', /the reason above/],
      [{ platform: 'darwin', uid: 0, skipped: 'root-outside-linux', failures: [], filtered: false, apparmor: false }, 'root-outside-linux', /ordinary user/],
      [{ platform: 'linux', uid: 0, skipped: 'no-browser-path', failures: [], filtered: false, apparmor: false }, 'no-browser-path', /CHROME_PATH to a Chromium 131/],
      // Inside Docker (measured, p7): the container's seccomp filter is the obstacle, whatever the
      // host's AppArmor sysctl says, and the AppArmor remedy changed nothing there.
      [{ platform: 'linux', uid: 0, failures: failed, userRan: true, filtered: true, apparmor: true }, 'container-seccomp', /seccomp profile that allows them/],
      [{ platform: 'linux', uid: 1001, failures: failed, filtered: true, apparmor: false }, 'container-seccomp', /seccomp=unconfined/],
      // …but a browser `nobody` cannot run at all is still that, first.
      [{ platform: 'linux', uid: 0, failures: failed, userRan: false, filtered: true, apparmor: true }, 'unprivileged-user-cannot-run', /CHROME_PATH/],
    ];
    for (const [input, reason, text] of cases) {
      assert.equal(offReason(input), reason, JSON.stringify(input));
      assert.match(offRemedy(reason), text, reason);
    }
    assert.doesNotMatch(offRemedy('apparmor-userns'), /CHROME_PATH/);
    assert.doesNotMatch(offRemedy('container-seccomp'), /AppArmor|CHROME_PATH/);
    assert.equal(offReason({ platform: 'linux', uid: 1001, failures: [], filtered: false, apparmor: true }), null, 'measured OFF with no failed launch names no reason');
    assert.equal(offRemedy(null), null);
  });

  test('the consent text carries the remedy for the reason the layer is off', () => {
    const { consentText } = require('../../../lib/packages/cli.js');
    const p = pkg('export default () => {}');
    const off = (reason) => ({ summary: 'OFF: the renderer runs as runner without Chromium’s OS sandbox', layer: { os: 'off', tried: ['with the OS sandbox: Failed to launch the browser process!'], reason } });
    const line = (probed) => consentText('component', 'tally', p, probed).find((l) => l.includes('the OS sandbox on this machine'));
    assert.match(line(off('apparmor-userns')), /Failed to launch the browser process!\); to put it on, let this browser create user namespaces/);
    assert.doesNotMatch(line(off('apparmor-userns')), /CHROME_PATH/);
    assert.match(line(off('unprivileged-user-cannot-run')), /set CHROME_PATH/);
    assert.doesNotMatch(line({ summary: 'on: confined', layer: { os: 'on', tried: [], reason: null } }), /to put it on/);
  });

  test('the render’s notice: OFF warns with the reason’s remedy; the platform default is a plain line', () => {
    const { sandboxNotice } = require('../../../lib/packages/code-door.js');
    const off = sandboxNotice(['tally'], { os: 'off', summary: 'OFF: the renderer runs as runner without Chromium’s OS sandbox', tried: ['with the OS sandbox: Failed to launch the browser process!'], reason: 'apparmor-userns' });
    assert.equal(off.warn, true);
    assert.match(off.text, /^warning: code packages: tally — OS sandbox OFF: .*\(with the OS sandbox: Failed to launch the browser process!\)\. To put it on, let this browser create user namespaces/);
    assert.doesNotMatch(off.text, /CHROME_PATH/, 'the render repeated the old remedy after the prompt gave the right one');
    const root = sandboxNotice(['tally'], { os: 'off', summary: 'OFF', tried: ['as nobody: EACCES'], reason: 'unprivileged-user-cannot-run' });
    assert.match(root.text, /To put it on, set CHROME_PATH to a Chromium the unprivileged user can run/);
    const mac = sandboxNotice(['tally'], { os: 'unmeasured', summary: "on by the platform's default, running as ann (not measured here)", tried: [], reason: null });
    assert.deepEqual(mac, { warn: false, text: "  code packages: tally — OS sandbox on by the platform's default, running as ann (not measured here)" });
  });

  // launchCodeSandbox, driven with a stub puppeteer whose sandboxed launch fails: the wiring from
  // the rung that failed to the reason the layer carries, which the table above cannot see.
  test('launchCodeSandbox gives an OFF layer the reason of the rung that failed', async () => {
    const { launchCodeSandbox } = require('../../../lib/core/os-sandbox.js');
    const launches = [];
    const stub = {
      executablePath: () => '/stub/chrome',
      launch: async (opts) => {
        launches.push(opts.args.includes('--no-sandbox') ? 'no-sandbox' : 'sandbox');
        if (!opts.args.includes('--no-sandbox')) throw new Error('Failed to launch the browser process!\nNo usable sandbox!');
        return { version: async () => 'HeadlessChrome/141.0.0.0', process: () => ({ pid: 0 }), close: async () => {} };
      },
    };
    const run = async (opts) => {
      launches.length = 0;
      const s = await launchCodeSandbox(stub, { executablePath: '/stub/chrome', ...opts });
      await s.close();
      return s.layer;
    };
    const userns = await run({ uid: 1001, platform: 'linux', apparmor: true, filtered: false });
    assert.deepEqual(launches, ['sandbox', 'no-sandbox']);
    assert.equal(userns.os, 'off');
    assert.equal(userns.reason, 'apparmor-userns');
    assert.match(userns.tried[0], /^with the OS sandbox: Failed to launch/);
    assert.equal((await run({ uid: 1001, platform: 'linux', apparmor: false, filtered: false })).reason, 'sandbox-did-not-start');
    assert.equal((await run({ uid: 1001, platform: 'linux', apparmor: true, filtered: true })).reason, 'container-seccomp');
    assert.equal((await run({ uid: 501, platform: 'darwin', apparmor: true, filtered: true })).reason, 'sandbox-did-not-start', 'AppArmor is a Linux cause only');
    const rootMac = await run({ uid: 0, platform: 'darwin' });
    assert.deepEqual(launches, ['no-sandbox'], 'root outside Linux tries no sandboxed launch');
    assert.equal(rootMac.reason, 'root-outside-linux');
    const fine = { ...stub, launch: async () => ({ version: async () => 'HeadlessChrome/141.0.0.0', process: () => ({ pid: 0 }), close: async () => {} }) };
    const s = await launchCodeSandbox(fine, { executablePath: '/stub/chrome', uid: 501, platform: 'darwin' });
    await s.close();
    assert.deepEqual([s.layer.os, s.layer.reason], ['unmeasured', null], 'a layer that is not OFF carries no reason');
  });
});

describe('the final checker: what a later pass or the runtime acts on', () => {
  const { codeNameRefusal } = require('../../../lib/packages/code-door-core.mjs');
  const filterFor = (pkg, handedAttrs = []) => doorFilterAttr(handedOf([{ localName: 'section', attributes: [{ name: 'class', value: pkg }, ...handedAttrs] }], pkg));

  test('an own-name class that merely contains a runtime selector is not the package’s to add', () => {
    assert.equal(filterFor('acme')('code', 'class', 'acme-language-mermaid acme-box'), 'acme-box');
    assert.equal(filterFor('acme')('div', 'class', 'acme-functionplot'), false);
  });

  test('ids live in the package’s name or were handed; runtime data markers only as handed', () => {
    const f = filterFor('acme', [{ name: 'id', value: '3' }, { name: 'data-mermaid-state', value: 'done' }]);
    assert.equal(f('rect', 'id', 'acme-grad'), true);
    assert.equal(f('rect', 'id', '3'), true);
    assert.equal(f('rect', 'id', 'lattice-notes'), false);
    // A package cannot forge a plugin figure's placeholder or mark one settled (lib/plugins/host-browser.mjs).
    for (const attr of ['data-lattice-hydrate', 'data-lattice-config', 'data-lattice-settle', 'data-lattice-final']) {
      assert.equal(f('div', attr, '1'), false, attr);
    }
    assert.equal(f('div', 'data-mermaid-state', 'done'), true);
    assert.equal(f('div', 'data-acme-count', '3'), true, "the package's own data attributes are its own");
  });

  test('a code package may not take a name that starts a class Lattice uses', () => {
    const known = ['chart-frame', 'logo-wall', 'kpi'];
    assert.match(codeNameRefusal('chart', known), /"chart-frame"/);
    assert.match(codeNameRefusal('logo', known), /"logo-wall"/);
    assert.match(codeNameRefusal('lat', known), /class stem/);
    assert.equal(codeNameRefusal('tally', known), null);
  });
});

describe('doorFinish: a diagram names only the addresses a handed diagram did', () => {
  test('an invented image node in a Mermaid block refuses the output', async () => {
    const { JSDOM } = require('jsdom');
    const DOMPurify = require('dompurify');
    const { doorFinish } = require('../../../lib/core/door-attr.mjs');
    const { createSlideSanitizer } = await import('../../../lib/core/sanitize-slide-html.mjs');
    const win = new JSDOM('').window;
    let f = () => false;
    const sanitize = createSlideSanitizer(DOMPurify, win, { filterAttr: (a, b, c) => f(a, b, c) });
    const withFilter = (h, filter) => {
      f = filter;
      try {
        return sanitize(h);
      } finally {
        f = () => false;
      }
    };
    const handed = '<section class="acme"><pre><code class="language-mermaid">flowchart LR\n A</code></pre></section>';
    const out = '<section class="acme"><pre><code class="language-mermaid">flowchart LR\n A@{ img: "https://evil.example/x" }</code></pre></section>';
    assert.match(doorFinish(win.document, withFilter, out, handed, 'acme').error, /its diagram names an address the slide did not hold/);
    assert.equal(doorFinish(win.document, withFilter, handed, handed, 'acme').error, undefined);
  });
});

describe('doorFinish: the handed classes come back', () => {
  test('a section built fresh (from `slide.facts`) keeps every class it was handed, and adds only its own', async () => {
    const { JSDOM } = require('jsdom');
    const DOMPurify = require('dompurify');
    const { doorFinish } = require('../../../lib/core/door-attr.mjs');
    const { createSlideSanitizer } = await import('../../../lib/core/sanitize-slide-html.mjs');
    const win = new JSDOM('').window;
    let f = () => false;
    const sanitize = createSlideSanitizer(DOMPurify, win, { filterAttr: (a, b, c) => f(a, b, c) });
    const withFilter = (h, filter) => {
      f = filter;
      try {
        return sanitize(h);
      } finally {
        f = () => false;
      }
    };
    const handed = '<section class="acme content form"><ul><li>3</li></ul></section>';
    const done = doorFinish(win.document, withFilter, '<section class="acme acme-drawn video"><p>drawn</p></section>', handed, 'acme');
    assert.equal(done.error, undefined);
    assert.deepEqual(done.classes, ['acme', 'content', 'form', 'acme-drawn']);
    // And the splice keeps exactly that: the engine's classes back, the invented `video` gone.
    const out = spliced(handed, done.html, done.classes, 'acme');
    assert.match(out, /^<section class="acme content form acme-drawn">/);
  });
});

describe('workerScript: the second wall', () => {
  const { workerScript, WORKER_NETWORK } = require('../../../lib/packages/code-door-core.mjs');
  const vm = require('node:vm');
  // In a context of its own: the wall takes `Function` off every function's prototype, and in this
  // process that would break every test after it. Returns the context, to look at its builtins.
  const run = (self) => {
    const ctx = vm.createContext({ self, postMessage: () => {}, OffscreenCanvas: undefined });
    vm.runInContext(workerScript('function t(s){return s.html}export{t as default};'), ctx);
    return ctx;
  };
  // A stand-in global shaped like Chromium's: a name on `self` and again on a prototype above it.
  const globalWith = (lock) => {
    const top = { fetch() {}, importScripts() {} };
    Object.defineProperty(top, 'fonts', { get: () => ({}), configurable: true });
    const self = Object.create(Object.create(top));
    for (const n of WORKER_NETWORK) Object.defineProperty(self, n, { value: () => {}, configurable: true, writable: true });
    if (lock) Object.defineProperty(top, 'fetch', { value: () => {}, configurable: false, writable: false });
    self.navigator = Object.create({ get storage() { return {}; } });
    return { self, top };
  };

  test('every holder on the prototype chain loses the name, and so does the navigator', () => {
    const { self, top } = globalWith(false);
    run(self);
    for (const n of WORKER_NETWORK) assert.equal(self[n], undefined, n);
    assert.equal(top.fetch, undefined);
    assert.equal(Object.getOwnPropertyDescriptor(top, 'fonts').get, undefined, 'the fonts getter is gone from the prototype');
    assert.equal(self.navigator.storage, undefined);
  });

  test('no code from strings: eval, Function (every kind), ShadowRealm, and a timer handed a string', () => {
    const { self } = globalWith(false);
    const ran = [];
    for (const n of ['eval', 'Function', 'ShadowRealm']) self[n] = () => {};
    self.setTimeout = function (h) { ran.push(this === self && h); return 1; };
    const ctx = run(self);
    const inCtx = (code) => vm.runInContext(code, ctx);
    assert.equal(self.ShadowRealm, undefined);
    assert.throws(() => self.eval('1'), /may not build code from a string \(eval\)/);
    assert.throws(() => self.Function('return 1'), /may not build code from a string \(Function\)/);
    for (const f of ['(function(){})', '(async function(){})', '(function*(){})', '(async function*(){})', '(()=>{})']) {
      assert.throws(() => inCtx(`${f}.constructor("return 1")`), (e) => e.name === 'EvalError' && /from a string/.test(e.message), `${f}.constructor`);
    }
    // Stubs, not `undefined`: library code that reads `Function.prototype` or tests
    // `instanceof Function` without building code still runs (lodash, core-js).
    ctx.F = self.Function;
    assert.equal(inCtx('F.prototype === Function.prototype && (() => 1) instanceof F && (async () => 1).constructor.prototype === Object.getPrototypeOf(async () => 1)'), true);
    assert.throws(() => self.setTimeout('import("http://x/")', 0), /may hand setTimeout a function, not a string/);
    const fn = () => {};
    assert.equal(self.setTimeout(fn, 0), 1, 'a function still reaches the real timer, on the worker');
    assert.deepEqual(ran, [fn]);
    // The guard's own `apply` was taken before the bundle runs: replacing `call` later changes nothing.
    inCtx('Function.prototype.call = () => { throw new Error("caught") }');
    assert.equal(self.setTimeout(fn, 0), 1);
  });

  test('a name an engine will not let it redefine stops the package loading (fails closed)', () => {
    const { self } = globalWith(true);
    assert.throws(() => run(self), /could not take fetch off the worker/);
  });
});

describe('codeSyntaxRefusal: a dynamic import(), parsed', () => {
  const { codeSyntaxRefusal, checkedWorkerScript } = require('../../../lib/packages/code-syntax.mjs');
  const pkgCode = (body) => `function t(s){${body};return s.html}export{t as default};`;

  test('refused wherever it sits, however it is spelled', () => {
    for (const body of ['import("http://x/")', 'import /* gap */ ("http://x/")', 'const u="http://x/";import(u).catch(()=>{})', 'async function f(){await import("h"+"ttp://x/")}', 'import(\n"http://x/")']) {
      assert.match(codeSyntaxRefusal(pkgCode(body)), /holds a dynamic `import\(\)`/, body);
    }
  });

  test('the word in a string, a comment, a property or a regex is not one', () => {
    for (const body of ['const a="import(x)"', '/* import("x") */0', '// import("x")\n0', 'const o={import(){}};o.import(1)', 'const r=/import\\(/']) {
      assert.equal(codeSyntaxRefusal(pkgCode(body)), null, body);
    }
  });

  test('it parses the script the worker runs: an HTML comment hides nothing from it', () => {
    // In a classic script `<!--` starts a comment; parsed as a module it would be `<`, `!`, `--`.
    assert.equal(codeSyntaxRefusal(pkgCode('0 <!-- import("http://x/")\n')), null, 'commented out where it runs');
    assert.match(codeSyntaxRefusal(pkgCode('0\n--> x\nimport("http://x/")')), /dynamic `import\(\)`/, 'only the `-->` line is a comment');
  });

  test('the refusal names the line and column in the author\'s file, whatever ends its lines', () => {
    for (const nl of ['\n', '\r\n', '\r', '\u2028']) {
      assert.match(codeSyntaxRefusal(`function t(s){${nl}const a=1;${nl}  return import("x")}export{t as default};`), /at 3:10, ` {2}return import\("x"\)\}/, JSON.stringify(nl));
    }
    assert.match(codeSyntaxRefusal('function t(s){return 1}}export{t as default};'), /at the end of the file/);
  });

  test('what does not parse is refused, not run unread; and the runners refuse on the text they load', () => {
    assert.match(codeSyntaxRefusal(pkgCode('import.meta.url')), /does not parse/);
    assert.match(codeSyntaxRefusal(`${'('.repeat(100_000)}0${')'.repeat(100_000)};${pkgCode('')}`), /does not parse|^$/);
    assert.throws(() => checkedWorkerScript(pkgCode('import("http://x/")')), /^Error: code sandbox: the package's transform\.js holds a dynamic `import\(\)`/);
    assert.match(checkedWorkerScript(pkgCode('')), /"use strict"/);
  });

  test('the CLI gate refuses it at add and at render', () => {
    const { refusePackage } = require('../../../lib/packages/gate.js');
    const p = pkg(pkgCode('import("http://x/")'));
    assert.match(refusePackage(p), /dynamic `import\(\)`/);
    assert.match(refusePackage(p, { forRender: true }), /dynamic `import\(\)`/);
  });

  test('a plugin package is refused by name, with the string the Studio import uses too', () => {
    const { refusePackage } = require('../../../lib/packages/gate.js');
    const { PLUGIN_REFUSAL } = require('../../../lib/packages/plugin-refusal.js');
    // Code-free and with code alike: the name decides, before any file is judged.
    assert.equal(refusePackage({ type: 'plugin', name: 'glow', code: false, files: {}, roles: {} }), PLUGIN_REFUSAL);
    assert.equal(refusePackage({ type: 'plugin', name: 'glow', code: true, files: {}, roles: {} }), PLUGIN_REFUSAL);
  });
});
