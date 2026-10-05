/// <reference types="vite/client" />
// The Studio chat agent's reading shelf — the docs its read tools return.
//
// Every entry is a LAZY raw import: Vite emits each doc as its own small chunk and the
// browser fetches one only when the agent calls a read tool for it. Nothing here is on the
// Studio's startup path. The sources are the canonical docs themselves, not copies:
// `lib/components/<bucket>/<name>/<name>.docs.md` (HARD RULE #6's mandated read),
// `design/skills/*.md`, and the base docs for registers and universals. The agent kit
// (`dist/agent-kit/`) is generated from the same files; reading them directly means the
// Studio needs no build step to stay current.

import type { AgentLibrary } from './architect-agent';

type Loader = () => Promise<string>;

const componentDocs = import.meta.glob<string>('../../../../lib/components/*/*/*.docs.md', { query: '?raw', import: 'default' });
const skillDocs = import.meta.glob<string>('../../../../design/skills/*.md', { query: '?raw', import: 'default' });
const designDocs = import.meta.glob<string>(['../../../../design/editorial.md', '../../../../design/design-principles.md'], { query: '?raw', import: 'default' });
const baseDocs = import.meta.glob<string>(['../../../../lib/base/base.docs.md', '../../../../lib/base/base.registers.docs.md'], { query: '?raw', import: 'default' });

function byBasename(map: Record<string, Loader>, suffix: string): Map<string, Loader> {
	const out = new Map<string, Loader>();
	for (const [path, load] of Object.entries(map)) {
		const base = path.split('/').pop() ?? '';
		if (base.endsWith(suffix)) out.set(base.slice(0, -suffix.length), load);
	}
	return out;
}

const COMPONENTS = byBasename(componentDocs, '.docs.md');
const SKILLS = byBasename(skillDocs, '.md');
const DESIGN = byBasename(designDocs, '.md');
const BASE = byBasename(baseDocs, '.docs.md');

// read_guide topic → which doc. `principles` and `editorial` live in design/, the rest are
// the per-artifact skills.
const GUIDE_SOURCE: Record<string, Loader | undefined> = {
	deck: SKILLS.get('deck'),
	finish: SKILLS.get('finish'),
	theme: SKILLS.get('theme'),
	lens: SKILLS.get('lens'),
	'speaker-notes': SKILLS.get('speaker-notes'),
	editorial: DESIGN.get('editorial'),
	principles: DESIGN.get('design-principles'),
};

const memo = new Map<Loader, Promise<string | null>>();
function load(fn: Loader | undefined): Promise<string | null> {
	if (!fn) return Promise.resolve(null);
	let p = memo.get(fn);
	if (!p) {
		p = fn().then(
			(t) => String(t ?? ''),
			() => {
				memo.delete(fn); // a failed fetch (offline) may succeed next turn
				return null;
			},
		);
		memo.set(fn, p);
	}
	return p;
}

export const agentLibrary: AgentLibrary = {
	componentDoc: (name) => load(COMPONENTS.get(name)),
	guide: (topic) => load(GUIDE_SOURCE[topic]),
	registersDoc: () => load(BASE.get('base.registers')),
	universalsDoc: () => load(BASE.get('base')),
};

/** Test seam: which docs the shelf can reach, by kind. */
export function agentLibraryInventory() {
	return { components: [...COMPONENTS.keys()], skills: [...SKILLS.keys()], design: [...DESIGN.keys()], base: [...BASE.keys()] };
}
