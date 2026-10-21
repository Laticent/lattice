// Conformance checks for the office export (`.pptx`, `.odp`): does a file that Calco wrote
// open in the apps that read it? Three independent readers, because each catches what the
// others pass (engineering/decisions/2026-10-21-calco-lift-what-can-be-lifted.md §10):
//
//   schema   every slide, layout, master, notes part, the presentation part and the theme against
//            the ISO/IEC 29500-4 transitional XSD (vendored in test/conformance/office/schemas,
//            run through `xmllint-wasm`, no system binary), plus the one rule the schema cannot state: a shape id is
//            unique within its slide. The pptx skill's `validate.py` passed a file whose `a:rPr`
//            children were out of order; this does not.
//   openxml  Microsoft's Open XML SDK validator (tools/office-conformance/openxml-check, .NET):
//            the schema plus the semantic rules Office applies on open. It does not open
//            PowerPoint, but it is the closest thing to PowerPoint's own reader that runs here.
//   odp      the structure LibreOffice and Collabora rely on: the mimetype entry is first and
//            stored, the manifest lists every part, every part is well-formed XML, and every
//            slide names a master page and styles that exist.
//
// Nothing here opens PowerPoint, Google Slides or Collabora. A clean report is evidence about the
// file, not about those apps.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const SCHEMAS = path.join(__dirname, 'schemas');
const CHECKER_DIR = path.join(ROOT, 'tools', 'office-conformance', 'openxml-check');
const PPTX_PARTS = /^ppt\/(slides|slideLayouts|slideMasters|notesSlides|notesMasters|theme)\/[^/]+\.xml$|^ppt\/presentation\.xml$/;

/** Whether `cmd` runs here (`--version` exits 0). */
function has(cmd, args = ['--version']) {
  return spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
}

let schemaFiles;
/** The vendored schemas, read once: the main schema first, then every file it imports (xmllint-wasm does no I/O of its own). */
function loadSchemas() {
  if (schemaFiles) return schemaFiles;
  const preload = [];
  for (const dir of ['ISO-IEC29500-4_2016', 'mce']) {
    for (const f of fs.readdirSync(path.join(SCHEMAS, dir))) {
      if (f.endsWith('.xsd')) preload.push({ fileName: `${dir}/${f}`, contents: fs.readFileSync(path.join(SCHEMAS, dir, f), 'utf8') });
    }
  }
  const main = { fileName: 'ISO-IEC29500-4_2016/pml.xsd', contents: fs.readFileSync(path.join(SCHEMAS, 'ISO-IEC29500-4_2016', 'pml.xsd'), 'utf8') };
  schemaFiles = { main, preload };
  return schemaFiles;
}

/**
 * Schema-validate XML parts in one call. Returns, per part name, the first lines of the validator's complaint
 * (an empty list when the part is valid). A validator that cannot run THROWS: a check that returns "no findings"
 * because it did not look is the failure this harness exists to catch.
 * @param {Array<{name: string, xml: string}>} parts
 * @returns {Promise<Map<string, string[]>>}
 */
async function schemaErrors(parts) {
  const { validateXML } = require('xmllint-wasm');
  const { main, preload } = loadSchemas();
  const out = new Map(parts.map((p) => [p.name, []]));
  if (!parts.length) return out;
  const res = await validateXML({ xml: parts.map((p) => ({ fileName: p.name, contents: p.xml })), schema: [main], preload });
  if (!res.valid && !res.errors.length) throw new Error('the schema validator reported invalid XML but no errors');
  for (const e of res.errors) {
    const name = e.loc?.fileName || parts[0].name;
    (out.get(name) || out.set(name, []).get(name)).push(String(e.message).slice(0, 300));
  }
  return out;
}

/** The first well-formedness error of an XML string, or null. */
function wellFormedError(xml) {
  const { JSDOM } = require('jsdom');
  try {
    new JSDOM(xml, { contentType: 'text/xml' });
    return null;
  } catch (e) {
    return String(e.message).split('\n')[0].slice(0, 160);
  }
}

/** Shape ids that repeat within one slide-like part (`p:cNvPr id`). */
function duplicateIds(xml) {
  const seen = new Set();
  const dup = new Set();
  for (const m of xml.matchAll(/<p:cNvPr\b[^>]*?\bid="(\d+)"/g)) {
    if (seen.has(m[1])) dup.add(m[1]);
    seen.add(m[1]);
  }
  return [...dup];
}

/**
 * Check a `.pptx` against the schema and the unique-id rule.
 * @param {Uint8Array|Buffer} bytes
 * @returns {Promise<Array<{part: string, kind: 'schema'|'id', message: string}>>}
 */
async function checkPptxSchema(bytes) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const findings = [];
  const parts = [];
  for (const name of Object.keys(zip.files).filter((n) => PPTX_PARTS.test(n))) parts.push({ name, xml: await zip.file(name).async('string') });
  for (const [name, messages] of await schemaErrors(parts)) for (const message of messages) findings.push({ part: name, kind: 'schema', message });
  for (const { name, xml } of parts) for (const id of duplicateIds(xml)) findings.push({ part: name, kind: 'id', message: `shape id ${id} is used more than once` });
  return findings;
}

/** Build the Open XML SDK checker once per source hash; returns the dll path. */
function openXmlChecker() {
  const src = ['OpenXmlCheck.csproj', 'Program.cs'].map((f) => fs.readFileSync(path.join(CHECKER_DIR, f), 'utf8')).join('\n');
  const out = path.join(os.tmpdir(), `lattice-openxml-check-${crypto.createHash('sha1').update(src).digest('hex').slice(0, 12)}`);
  const dll = path.join(out, 'OpenXmlCheck.dll');
  if (!fs.existsSync(dll)) {
    const r = spawnSync('dotnet', ['build', CHECKER_DIR, '-c', 'Release', '-o', out, '--nologo', '-v', 'q'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`the Open XML checker did not build:\n${String(r.stdout).slice(-800)}${String(r.stderr).slice(-400)}`);
  }
  return dll;
}

/** Whether the Open XML SDK checker can run here (a .NET SDK is installed). */
function openXmlAvailable() {
  return has('dotnet');
}

/**
 * Run the Open XML SDK validator over `.pptx` files on disk.
 * @param {string[]} files
 * @returns {Array<{file: string, errors: Array<{part: string|null, path: string|null, id: string, description: string}>}>}
 */
function checkOpenXml(files) {
  const r = spawnSync('dotnet', [openXmlChecker(), ...files], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`the Open XML checker failed (exit ${r.status}): ${String(r.stderr).slice(-600)}`);
  return JSON.parse(r.stdout);
}

/**
 * Check an `.odp`: the package structure and the references LibreOffice resolves.
 * @param {Uint8Array|Buffer} bytes
 * @returns {Promise<Array<{part: string, kind: 'odp', message: string}>>}
 */
async function checkOdp(bytes) {
  const JSZip = require('jszip');
  const buf = Buffer.from(bytes);
  const findings = [];
  const add = (part, message) => findings.push({ part, kind: 'odp', message });
  // The mimetype entry is the first local file header, stored (method 0), and says presentation.
  if (buf.readUInt32LE(0) !== 0x04034b50) add('mimetype', 'not a zip');
  else {
    const method = buf.readUInt16LE(8);
    const nameLen = buf.readUInt16LE(26);
    const extraLen = buf.readUInt16LE(28);
    const name = buf.toString('utf8', 30, 30 + nameLen);
    if (name !== 'mimetype') add('mimetype', `the first entry is ${name}, not mimetype`);
    else if (method !== 0) add('mimetype', 'the mimetype entry is compressed');
    else if (buf.toString('utf8', 30 + nameLen + extraLen, 30 + nameLen + extraLen + 39) !== 'application/vnd.oasis.opendocument.presentation'.slice(0, 39)) add('mimetype', 'the mimetype is not a presentation');
  }
  const zip = await JSZip.loadAsync(bytes);
  const parts = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const manifest = zip.file('META-INF/manifest.xml') ? await zip.file('META-INF/manifest.xml').async('string') : '';
  if (!manifest) add('META-INF/manifest.xml', 'missing');
  const listed = new Set([...manifest.matchAll(/manifest:full-path="([^"]+)"/g)].map((m) => m[1]));
  for (const p of parts) {
    if (p === 'mimetype' || p === 'META-INF/manifest.xml') continue;
    if (!listed.has(p)) add(p, 'not listed in the manifest');
  }
  for (const p of listed) if (p !== '/' && !p.endsWith('/') && !zip.file(p)) add(p, 'listed in the manifest but missing from the package');
  for (const p of parts.filter((n) => /\.xml$/.test(n))) {
    const bad = wellFormedError(await zip.file(p).async('string'));
    if (bad) add(p, `not well-formed: ${bad}`);
  }
  // Every page names a master page and a style that exist.
  const content = zip.file('content.xml') ? await zip.file('content.xml').async('string') : '';
  const styles = zip.file('styles.xml') ? await zip.file('styles.xml').async('string') : '';
  const masters = new Set([...styles.matchAll(/<style:master-page\b[^>]*\bstyle:name="([^"]+)"/g)].map((m) => m[1]));
  const defined = new Set([...(content + styles).matchAll(/<style:style\b[^>]*\bstyle:name="([^"]+)"/g)].map((m) => m[1]));
  for (const m of content.matchAll(/<draw:page\s[^>]*>/g)) {
    const master = m[0].match(/draw:master-page-name="([^"]+)"/)?.[1];
    if (!master || !masters.has(master)) add('content.xml', `a slide names the master page ${master}, which styles.xml does not define`);
    const style = m[0].match(/draw:style-name="([^"]+)"/)?.[1];
    if (style && !defined.has(style)) add('content.xml', `a slide names the style ${style}, which is not defined`);
  }
  return findings;
}

module.exports = { checkPptxSchema, checkOpenXml, checkOdp, openXmlAvailable, schemaErrors, duplicateIds, has };
