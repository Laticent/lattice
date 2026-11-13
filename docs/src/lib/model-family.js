// MODEL FAMILIES — what "the same model, a newer version" means, for version healing.
// Its own module, not provider-registry.js, because only the lazy model code (architect-model,
// voice-model) heals: the registry is on the Studio's boot path, and this table is not needed
// there (docs/route-budget.json).
//
// A FAMILY is defined here, not inferred from the pickers' curation patterns (those are
// preferences, and may group a Flash with a Flash Lite). `familyOf` places an id on
// vendor · line · tier from an explicit table, and an id the table cannot place is never healed:
// the selection reads "Model retired" and waits for the author. Healing moves a retired version to
// the newest live NEWER version of the same family on the same route, never to another family,
// provider or route, and never backward.

/** The tiers each line has. Adding a tier is an edit here, with a test; a new name is never guessed. */
const FAMILY_TIERS = Object.freeze({
	claude: ['opus', 'sonnet', 'haiku'],
	gemini: ['pro', 'flash', 'flash-lite', 'pro-tts', 'flash-tts', 'flash-lite-tts', 'flash-image', 'pro-image'],
	gpt: ['', 'mini', 'nano', 'pro'],
});
// Suffixes that name a build of a version, not a tier: a preview, a `-latest` alias, a dated snapshot.
const BUILD = /(?:-(?:preview|latest|exp|experimental)|-\d{4}-\d{2}-\d{2}|-\d{8}|-\d{2}-\d{4}|-\d{2}-\d{2}|-\d{3,4})+$/;

/**
 * The family of a model id, or null when the table cannot place it. Accepts OpenRouter ids
 * (`anthropic/claude-sonnet-5.5`, `~anthropic/claude-sonnet-latest`) and direct ones
 * (`claude-sonnet-5-5-20261001`, `gemini-3.8-flash-lite-tts`, `gpt-6.1-mini`).
 * @param {string} id
 * @returns {{ key: string, vendor: string, line: string, tier: string, version: number[] } | null}
 */
export function familyOf(id) {
	const bare = String(id || '').replace(/^~/, '').replace(/^[a-z0-9-]+\//i, '').toLowerCase();
	const place = (vendor, line, tier, ver) => {
		if (!FAMILY_TIERS[line].includes(tier)) return null;
		const version = (ver || '').split(/[.-]/).filter(Boolean).map(Number);
		return { key: `${vendor} · ${line} · ${tier || 'base'}`, vendor, line, tier, version };
	};
	// Claude: `claude-sonnet-5.5`, `claude-sonnet-4-5-20250929`, older `claude-3-5-sonnet-20241022`.
	let m = bare.match(/^claude-(opus|sonnet|haiku)(?:-(\d{1,3}(?:[.-]\d{1,3})?))?(?:-\d{8})?(?:-latest)?$/);
	if (m) return place('anthropic', 'claude', m[1], m[2]);
	m = bare.match(/^claude-(\d{1,3}(?:[.-]\d{1,3})?)-(opus|sonnet|haiku)(?:-\d{8})?(?:-latest)?$/);
	if (m) return place('anthropic', 'claude', m[2], m[1]);
	// Gemini: `gemini-3.8-flash-lite-tts`, `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-lite-preview-tts`.
	m = bare.match(/^gemini-(\d+(?:\.\d+)*)-(.+)$/);
	if (m) {
		const tier = m[2].replace(/-(?:preview|latest|exp|experimental)(?=-|$)/g, '').replace(BUILD, '');
		return place('google', 'gemini', tier, m[1]);
	}
	// OpenAI: `gpt-6.1`, `gpt-6.1-mini`, `gpt-5-nano-2025-08-07`.
	m = bare.replace(BUILD, '').match(/^gpt-(\d+(?:\.\d+)*)(?:-([a-z]+))?$/);
	if (m) return place('openai', 'gpt', m[2] ?? '', m[1]);
	return null;
}

const cmpVersion = (a, b) => {
	for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
	return 0;
};

/**
 * The model a retired id heals to on the same route: the newest live model of the SAME family
 * whose version is newer than the retired one's (a GA build before a preview of the same version).
 * Null when the id has no family, or its family has nothing newer live: the selection then reads
 * "Model retired" and stops.
 * @param {string} retired
 * @param {{ id: string, created?: number }[]} live the route's live list
 * @returns {string | null}
 */
export function healTarget(retired, live) {
	const fam = familyOf(retired);
	if (!fam) return null;
	const hits = (live || [])
		.filter((m) => m.id !== retired)
		.map((m) => ({ m, f: familyOf(m.id) }))
		.filter(({ f }) => f && f.key === fam.key && cmpVersion(f.version, fam.version) > 0)
		.sort((a, b) => cmpVersion(b.f.version, a.f.version) || Number(/preview|exp/.test(a.m.id)) - Number(/preview|exp/.test(b.m.id)) || (b.m.created ?? 0) - (a.m.created ?? 0));
	return hits[0]?.m.id ?? null;
}

/** Whether two ids are the same family (the test a silently rerouted reply is held to). */
export const sameFamily = (a, b) => {
	const fa = familyOf(a);
	const fb = familyOf(b);
	return !!fa && !!fb && fa.key === fb.key;
};
