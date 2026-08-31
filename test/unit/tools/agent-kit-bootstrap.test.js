/**
 * The agent kit's BOOTSTRAP.md — the small-context read path.
 *
 * WHY IT EXISTS. The kit shipped only aggregate surfaces: an agent that already
 * knew it wanted `matrix-2x2` still had to read `components.md` whole (~107k
 * tokens) to reach one ~1.8k-token entry, because that was the only prose the
 * kit carried. The bootstrap plus one per-component file is ~3.2k tokens for the
 * same job.
 *
 * WHAT THIS PINS, and why each one is a real failure rather than a style rule:
 *
 *  - EVERY component named in the bootstrap has a file. The bootstrap is an
 *    index; an index pointing at a file that is not there is worse than no index,
 *    because the agent spends a fetch to learn nothing. This is the same class of
 *    defect the kit already shipped once — `components.pick.md` routes readers to
 *    `lib/components/<bucket>/<name>/<name>.docs.md`, a repo path a kit consumer
 *    does not have.
 *  - The cheapest path stays cheap. If the bootstrap grows until reading it costs
 *    what it was meant to save, the artifact has quietly stopped working. The
 *    budget here is deliberately loose (it is a ceiling, not a target) — it exists
 *    to catch a tenfold regression, not to police prose.
 *  - The shared authoring rules are present. They are the half a per-component
 *    file cannot supply (card nesting, the title-slide shape, class composition),
 *    so an agent on the cheap path that never sees them writes a well-formed slide
 *    of the wrong kind.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const KIT = path.join(ROOT, 'dist', 'agent-kit');
const BOOTSTRAP = path.join(KIT, 'BOOTSTRAP.md');

const built = fs.existsSync(BOOTSTRAP);

test('agent kit bootstrap', { skip: built ? false : 'dist/agent-kit not built — run `npm run build`' }, async (t) => {
  const text = fs.readFileSync(BOOTSTRAP, 'utf8');

  await t.test('every component it names has a file in the kit', () => {
    // Backticked names inside the family list, minus the ones that are paths.
    const named = new Set();
    for (const line of text.split('\n')) {
      if (!/^\s{2}`/.test(line)) continue; // the member lines under each family
      for (const m of line.matchAll(/`([a-z0-9-]+)`/g)) named.add(m[1]);
    }
    assert.ok(named.size >= 50, `only ${named.size} components parsed out of the bootstrap`);
    const missing = [...named].filter((n) => !fs.existsSync(path.join(KIT, 'components', `${n}.md`)));
    assert.deepEqual(
      missing,
      [],
      'The bootstrap names components with no file in components/. An index that points ' +
        'at a missing file costs the agent a fetch and returns nothing.',
    );
  });

  await t.test('every components/ file is reachable from the bootstrap', () => {
    const onDisk = fs
      .readdirSync(path.join(KIT, 'components'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
    const unreferenced = onDisk.filter((n) => !text.includes(`\`${n}\``) && !text.includes(`${n}.md`));
    assert.deepEqual(
      unreferenced,
      [],
      'These component files ship but nothing in the bootstrap points at them, so an agent ' +
        'reading the bootstrap never learns they exist.',
    );
  });

  await t.test('the cheap path stays cheap', () => {
    const bytes = Buffer.byteLength(text, 'utf8');
    // ~4k tokens. The whole point is that this plus one component file beats the
    // ~107k-token catalog; a bootstrap that drifts past this has stopped earning
    // its place and should be split, not quietly grown.
    assert.ok(
      bytes < 16000,
      `BOOTSTRAP.md is ${bytes} B (~${Math.round(bytes / 4)} tokens). It is the file an agent ` +
        'reads INSTEAD of the catalog; past ~4k tokens the saving it exists for is eroding.',
    );
  });

  await t.test('it carries the cross-cutting authoring rules', async () => {
    const { AUTHORING_RULES } = await import(
      path.join(ROOT, 'docs', 'src', 'components', 'studio', 'ai', 'architect-knowledge.js')
    );
    for (const rule of AUTHORING_RULES) {
      assert.ok(
        text.includes(rule),
        'A shared authoring rule is missing from the bootstrap. These are the half a ' +
          'per-component file cannot supply, so an agent on the cheap path would never ' +
          `see it:\n  ${rule.slice(0, 90)}…`,
      );
    }
  });

  await t.test('it resolves the repo-path pointer components.pick.md hands out', () => {
    // pick.md is generated for people inside the repo and says to open
    // lib/components/<bucket>/<name>/<name>.docs.md. A kit consumer has no such
    // path, so the bootstrap must map it or the pick list dead-ends.
    assert.match(
      text,
      /lib\/components\/<bucket>\/<name>\/<name>\.docs\.md/,
      'The bootstrap no longer explains where `components.pick.md`\'s repo path maps to in ' +
        'the kit. Without it the pick list routes readers to a path they do not have.',
    );
    assert.match(text, /components\/<name>\.md/);
  });
});
