/**
 * Unit: tools/apt-mirror-probe.mjs — the pure half (`mirrorsFrom`, `rank`, `report`). The probe ranks Ubuntu mirrors
 * measured from a GitHub runner, to set apt-setup.sh's order (followups.d 3139-p3). `measure` reaches the network and is
 * exercised by apt-mirror-probe.yml, never here (HARD RULE #32).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = () => import('../../../tools/apt-mirror-probe.mjs');
const APT_SETUP = path.join(__dirname, '..', '..', '..', '.github', 'actions', 'apt-cached', 'apt-setup.sh');

const A = 'http://a.example/ubuntu/';
const B = 'http://b.example/ubuntu/';
const SEC = 'http://security.ubuntu.com/ubuntu/';
const ok = (mirror, ttfbMs, mbps = 5) => ({ mirror, ok: true, dnsOk: true, dnsMs: 3, ttfbMs, mbps });
const dnsFail = (mirror) => ({ mirror, ok: false, dnsOk: false, dnsMs: 40, ttfbMs: null, mbps: null });

test('reads the mirror list from apt-setup.sh, in its order, security last', async () => {
  const { mirrorsFrom } = await load();
  const list = mirrorsFrom(fs.readFileSync(APT_SETUP, 'utf8'));
  assert.ok(list.length >= 4, list.join(' '));
  assert.equal(list[list.length - 1], SEC);
  assert.ok(list.map((m) => new URL(m).hostname).some((h) => h === 'azure.archive.ubuntu.com'), list.join(' '));
});

test('ranks by failure share first, then median time to first byte', async () => {
  const { rank } = await load();
  // A is faster but failed DNS once in three; B never failed.
  const rows = rank([ok(A, 50), ok(A, 60), dnsFail(A), ok(B, 200), ok(B, 220), ok(B, 210)], [A, B]);
  assert.deepEqual(rows.map((r) => r.mirror), [B, A]);
  assert.equal(rows[1].dnsFailed, 1);
  assert.equal(rows[1].ttfbMs, 55); // median of the successful samples only
  assert.equal(rows[0].ttfbMs, 210);
});

test('a listed mirror with no samples still shows, last', async () => {
  const { rank } = await load();
  const rows = rank([ok(B, 100)], [A, B]);
  assert.deepEqual(rows.map((r) => [r.mirror, r.samples]), [[B, 1], [A, 0]]);
});

test('the report keeps security.ubuntu.com last and says when the order differs', async () => {
  const { report } = await load();
  const probes = [{ at: '2026-11-12T00:00:00Z', samples: [ok(SEC, 10), ok(A, 100), ok(B, 50)] }];
  const text = report(probes, [A, B, SEC]);
  assert.match(text, /\*\*1 probe run\(s\), 3 samples\*\*/);
  const measured = text.split('\n').find((l) => l.startsWith('Measured order: '));
  assert.equal(measured.split('. apt-setup.sh')[0], `Measured order: \`${B}\` → \`${A}\` → \`${SEC}\``);
  assert.match(report([{ samples: [ok(A, 10), ok(B, 50), ok(SEC, 5)] }], [A, B, SEC]), /matches apt-setup\.sh/);
});
