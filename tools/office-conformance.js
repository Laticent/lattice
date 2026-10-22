#!/usr/bin/env node
/**
 * office-conformance — check `.pptx` / `.odp` files the way the office export is held to.
 *
 *   node tools/office-conformance.js deck.pptx other.odp
 *   node tools/office-conformance.js --no-openxml deck.pptx   # skip the .NET validator
 *
 * A `.pptx` runs through the ISO 29500 schema, the unique-shape-id rule and (when .NET is
 * installed) Microsoft's Open XML SDK validator; an `.odp` through the package-structure checks.
 * Exit 1 on any finding. The checks and what they do not prove: test/conformance/office/office-conformance.js.
 */
const fs = require('node:fs');
const { checkPptxSchema, checkOpenXml, checkOdp, openXmlAvailable } = require('../test/conformance/office/office-conformance');

async function main() {
  const args = process.argv.slice(2);
  const useOpenXml = !args.includes('--no-openxml');
  const files = args.filter((a) => !a.startsWith('--'));
  if (!files.length) {
    console.error('usage: office-conformance [--no-openxml] <file.pptx|file.odp>...');
    process.exit(2);
  }
  let bad = 0;
  const pptx = files.filter((f) => /\.pptx$/i.test(f));
  const openxml = useOpenXml && pptx.length ? (openXmlAvailable() ? checkOpenXml(pptx) : null) : [];
  if (openxml === null) console.warn('office-conformance: no .NET SDK, so the Open XML validator did not run (install dotnet-sdk-8.0)');
  for (const f of files) {
    const bytes = fs.readFileSync(f);
    let findings;
    if (/\.pptx$/i.test(f)) {
      findings = await checkPptxSchema(bytes);
      for (const e of (openxml || []).find((r) => r.file === f)?.errors || []) findings.push({ part: e.part || '', kind: 'openxml', message: `${e.id}: ${e.description}` });
    } else if (/\.odp$/i.test(f)) findings = await checkOdp(bytes);
    else {
      console.error(`${f}: not a .pptx or .odp`);
      bad++;
      continue;
    }
    console.log(`${findings.length ? 'FAIL' : 'ok  '} ${f}${findings.length ? ` (${findings.length})` : ''}`);
    for (const x of findings.slice(0, 10)) console.log(`     [${x.kind}] ${x.part}: ${x.message}`);
    if (findings.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
