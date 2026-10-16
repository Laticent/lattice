import JSZip from 'jszip';

/** A zip plugin that owns the ```gantt fence, around the renderer text it is given. */
export async function ganttZip(code: string, name = 'gantt-plugin'): Promise<Buffer> {
	const zip = new JSZip();
	zip.file(`${name}/${name}.manifest.json`, JSON.stringify({ name, type: 'plugin', format: 1, api: 1, title: 'Gantt (zip)', description: 'Draws a ```gantt fence as bars.', contributes: { fences: { gantt: { body: 'text' } } } }));
	zip.file(`${name}/${name}.docs.md`, '# Gantt plugin\n');
	zip.file(`${name}/${name}.fixtures.md`, '```gantt\nDesign 2\nBuild 4\n```\n');
	zip.file(`${name}/${name}.render.js`, code);
	return zip.generateAsync({ type: 'nodebuffer' });
}

/** An honest renderer: bars from "Name 3" rows, drawn in the deck's own colors. */
export const BARS_RENDERER = `function render(fence) {
  var rows = fence.body.trim().split("\\n").filter(Boolean);
  var bars = rows.map(function (l, i) {
    var parts = l.split(/\\s+/); var n = Number(parts[parts.length - 1]) || 1;
    return '<rect x="96" y="' + (i * 26 + 6) + '" width="' + n * 60 + '" height="16" rx="3" fill="var(--accent)"></rect><text x="0" y="' + (i * 26 + 19) + '" fill="var(--text-body)" font-size="13">' + parts.slice(0, -1).join(" ").replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</text>';
  }).join("");
  return '<svg class="lp-gantt-plugin-chart" id="' + fence.id + '" viewBox="0 0 520 ' + (rows.length * 26 + 8) + '" width="520">' + bars + '</svg>';
}
export { render as default };
`;

/** A zip plugin of INLINE kinds only (2026-10-14-plugin-inline-door.md): `@tag-chip{Label, hot}`, read by its declared slot. */
export async function chipZip(code: string = CHIP_RENDERER, name = 'chip-plugin'): Promise<Buffer> {
	const zip = new JSZip();
	const inline = { 'tag-chip': { title: 'Tag chip', slot: { label: 'a tag chip', positional: [{ name: 'label', type: 'text' }], params: { tone: { type: 'oneOf', values: ['hot', 'cold'] } } }, placeholder: { size: 'sm' } } };
	zip.file(`${name}/${name}.manifest.json`, JSON.stringify({ name, type: 'plugin', format: 1, api: 1, title: 'Tag chips (zip)', description: 'Draws `@tag-chip{…}` as a small tag.', contributes: { inline } }));
	zip.file(`${name}/${name}.docs.md`, '# Tag chips\n');
	zip.file(`${name}/${name}.fixtures.md`, '- `@tag-chip{Launch, hot}`\n');
	zip.file(`${name}/${name}.render.js`, code);
	return zip.generateAsync({ type: 'nodebuffer' });
}

/** An inline renderer: a small tag from the fields its slot read, in the deck's own colors. */
export const CHIP_RENDERER = `function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
function render(input) {
  var f = input.fields || {};
  var hot = f.tone === "hot";
  return '<span class="lp-chip-plugin-tag" data-tone="' + esc(f.tone || "none") + '" style="padding:0 0.4em;border-radius:0.3em;background:' + (hot ? "var(--accent)" : "var(--bg-alt)") + ';color:' + (hot ? "var(--bg)" : "var(--text-body)") + '">' + esc(f.label || input.text) + '</span>';
}
export { render as default };
`;
