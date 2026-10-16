// The LTT JSON Schema, served at the URL its own `$id` names
// (https://lattice.style/schemas/ltt-1.0.schema.json), so a validator that fetches a schema by
// its id finds it. The file is the one @laticent/ltt ships, generated from its types by
// tools/build-ltt-schema.js; this route only serves it. Prerendered by `astro build`.
import schema from '../../lib/ltt/ltt.schema.json';

export const prerender = true;

export function GET() {
	return new Response(`${JSON.stringify(schema, null, 2)}\n`, { headers: { 'content-type': 'application/schema+json; charset=utf-8' } });
}
