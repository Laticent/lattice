/**
 * Package the Lattice layouts extension (`extension.js`) as a `.vsix`, the file VS Code installs
 * with "Extensions: Install from VSIX…" or `code --install-extension`.
 *
 * A `.vsix` is a zip holding `extension.vsixmanifest`, `[Content_Types].xml` and the extension
 * under `extension/`. It is written here, synchronously and byte-for-byte deterministic (fixed
 * timestamps, a fixed file order, raw deflate), because tools/build-marp-kit.js builds the kit
 * synchronously and its `--check` compares every file's bytes. No packager dependency: the format
 * is twenty lines of headers, and `zlib.crc32` is in Node 22.2+ (the repo's floor is 22.13).
 *
 * The layout list is generated, never typed: one entry per component manifest, name, the
 * manifest's one-line `description`, and its bucket.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ID = 'lattice-layouts';
const PUBLISHER = 'laticent';
const VERSION = '0.1.0';
const ENGINE = '^1.75.0';
const FILE_NAME = `${ID}.vsix`;

/** `{ name, summary, bucket }` per layout, sorted by name. */
function layoutsOf(manifests) {
  return manifests
    .map((m) => ({ name: m.name, summary: m.description || '', bucket: m.bucket || m.function || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function packageJson() {
  return {
    name: ID,
    displayName: 'Lattice layouts',
    description: 'Completes Lattice layout names inside <!-- _class: --> and nowhere else, so prose never opens a menu.',
    publisher: PUBLISHER,
    version: VERSION,
    license: 'AGPL-3.0-only',
    repository: { type: 'git', url: 'https://github.com/Laticent/lattice' },
    engines: { vscode: ENGINE },
    categories: ['Other'],
    activationEvents: ['onLanguage:markdown'],
    main: './extension.js',
  };
}

function readme(count) {
  return `# Lattice layouts

Completes the ${count} Lattice layout names where a layout name goes, and nowhere else.

Type \`<!-- _class: \` on a slide and the menu opens with every layout and its one-line summary.
It opens again after a space, for a second class (\`<!-- _class: kpi \`). Typing ordinary prose
opens nothing, whatever your \`editor.quickSuggestions\` setting.

Built from the component manifests by \`kit/vscode/vsix.js\` in the Lattice repository.
`;
}

function vsixManifest(count) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${ID}" Version="${VERSION}" Publisher="${PUBLISHER}" />
    <DisplayName>Lattice layouts</DisplayName>
    <Description xml:space="preserve">${esc(packageJson().description)} ${count} layouts.</Description>
    <Categories>Other</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${ENGINE}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
  </Assets>
</PackageManifest>
`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json" /><Default Extension=".js" ContentType="application/javascript" /><Default Extension=".md" ContentType="text/markdown" /><Default Extension=".vsixmanifest" ContentType="text/xml" /></Types>
`;

/** The extension's files, in zip order, as `[path, Buffer]`. */
function vsixEntries(manifests) {
  const layouts = layoutsOf(manifests);
  const src = fs.readFileSync(path.join(__dirname, 'extension.js'));
  return [
    ['[Content_Types].xml', Buffer.from(CONTENT_TYPES)],
    ['extension.vsixmanifest', Buffer.from(vsixManifest(layouts.length))],
    ['extension/package.json', Buffer.from(`${JSON.stringify(packageJson(), null, 2)}\n`)],
    ['extension/extension.js', src],
    ['extension/layouts.json', Buffer.from(`${JSON.stringify(layouts, null, 1)}\n`)],
    ['extension/README.md', Buffer.from(readme(layouts.length))],
  ];
}

/** A deflated zip of `entries`, deterministic: DOS time 1980-01-01 00:00 on every entry. */
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const body = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4); // version needed
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(0, 10); // time
    head.writeUInt16LE(0x21, 12); // date: 1980-01-01
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    head.writeUInt16LE(0, 28);
    locals.push(head, nameBuf, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); // version made by
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0x21, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    centrals.push(cen, nameBuf);
    offset += head.length + nameBuf.length + body.length;
  }
  const cdir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdir, end]);
}

/** The `.vsix` bytes for these manifests (default: the whole catalog). */
function buildVsix(manifests) {
  return zip(vsixEntries(manifests || require('../../lib/components').loadAll()));
}

module.exports = { buildVsix, vsixEntries, FILE_NAME };
