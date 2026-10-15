// Measures the plugin manifests before and after the field changes proposed in §5.3 of
// ../2026-10-15-bridges-and-two-hosts.md. Both versions are re-serialized at a 2-space indent, so
// the count compares content, not formatting. Run from the repo root:
//   node engineering/decisions/2026-10-15-bridges-and-two-hosts/measure-manifests.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PLUGINS = 'lib/plugins';
// Fields the build derives from the folder, or the host owns (§5.3 "derive" and "remove").
const DROP_TOP = ['$schema', 'type', 'format', 'api', 'tokens', 'vendor'];
const DROP_RENDER = ['exec', 'surfaces', 'figureClasses', 'parity'];
// `contributes` entries that only say "this file exists" or "this module exports X".
const DERIVED_CONTRIBUTES = ['styles', 'hydrate', 'bake', 'highlight', 'data', 'services', 'codeRenderer'];

const lines = (o) => JSON.stringify(o, null, 2).split('\n').length;
let before = 0;
let after = 0;
for (const name of readdirSync(PLUGINS).sort()) {
  const file = join(PLUGINS, name, `${name}.manifest.json`);
  if (!existsSync(file)) continue;
  const m = JSON.parse(readFileSync(file, 'utf8'));
  const n0 = lines(m);
  for (const k of DROP_TOP) delete m[k];
  // One version field replaces `type`, `format`, `api` and `$schema`.
  m.lattice = 1;
  // A plugin with no static form (anima's `surfaces.pdf: "none"`) keeps that fact (§5.1).
  const noStatic = m.render?.surfaces && Object.values(m.render.surfaces).includes('none');
  if (m.render) for (const k of DROP_RENDER) delete m.render[k];
  if (noStatic) m.render.staticForm = false;
  if (m.render && Object.keys(m.render).length === 0) delete m.render;
  if (m.contributes) for (const k of DERIVED_CONTRIBUTES) delete m.contributes[k];
  if (m.contributes && Object.keys(m.contributes).length === 0) delete m.contributes;
  const n1 = lines(m);
  before += n0;
  after += n1;
  console.log(`${name.padEnd(14)} ${String(n0).padStart(4)} -> ${String(n1).padStart(4)}`);
}
console.log(`${'total'.padEnd(14)} ${String(before).padStart(4)} -> ${String(after).padStart(4)}`);
