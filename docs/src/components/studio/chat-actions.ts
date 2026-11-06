// THE CHAT'S ACTION REGISTRY — what each chat tool may do, and which modes may use it.
//
// Every tool the Studio chat can call sits in one of three tiers
// (engineering/decisions/2026-11-06-skills-tools-and-chat-reach.md §4):
//
//   read   reads the deck, the docs or the Library; nothing to undo.
//   draft  changes a DRAFT the author applies from the diff card (or, in Auto, that applies at once
//          with a History checkpoint to undo it).
//   act    changes something outside the draft. The tool only QUEUES the action; the Studio draws a
//          confirm the author presses. The model can neither press it nor skip it, in any mode.
//
// The mode is enforced twice, in code, never by the prompt: `toolsForMode` decides which tool
// definitions a request carries, and `toolAllowed` is the host gate the toolbox checks on every call.
// A tool missing from TOOL_TIERS is refused in every mode, so a new tool cannot ride in untiered.

export type ToolTier = 'read' | 'draft' | 'act';
export type ChatMode = 'talk' | 'review' | 'auto';

export const CHAT_MODES: readonly ChatMode[] = ['talk', 'review', 'auto'];
export const DEFAULT_CHAT_MODE: ChatMode = 'review';

export const TOOL_TIERS: Readonly<Record<string, ToolTier>> = {
	read_component: 'read',
	read_front_matter: 'read',
	read_guide: 'read',
	read_slides: 'read',
	check_deck: 'read',
	list_assets: 'read',
	view_asset: 'read',
	// It writes a caption onto a Library photo, outside the draft. It is metadata the author can
	// edit, not deck content, so it is not an act; but Talk is reads only, so it is not a read.
	caption_asset: 'draft',
	edit_slides: 'draft',
	set_front_matter: 'draft',
	set_theme: 'draft',
	set_finish: 'draft',
	chart_from_data: 'draft',
	render_slide: 'read',
	create_deck: 'act',
};

const MODE_TIERS: Readonly<Record<ChatMode, ReadonlySet<ToolTier>>> = {
	talk: new Set<ToolTier>(['read']),
	review: new Set<ToolTier>(['read', 'draft', 'act']),
	auto: new Set<ToolTier>(['read', 'draft', 'act']),
};

/** The host gate: may this tool run in this mode? Unknown tools never may. */
export function toolAllowed(mode: ChatMode, name: string): boolean {
	// Own keys only: `constructor` or `toString` must not read as a tier off the prototype.
	if (!Object.hasOwn(TOOL_TIERS, name)) return false;
	return MODE_TIERS[mode].has(TOOL_TIERS[name]);
}

/** The tool definitions a request carries in this mode. */
export function toolsForMode<T extends { function: { name: string } }>(mode: ChatMode, tools: readonly T[]): T[] {
	return tools.filter((t) => toolAllowed(mode, t.function.name));
}

export function isChatMode(v: unknown): v is ChatMode {
	return typeof v === 'string' && (CHAT_MODES as readonly string[]).includes(v);
}

/** One line the model reads, so it knows what this mode lets it do. */
export function modeBrief(mode: ChatMode): string {
	if (mode === 'talk') return 'MODE — Talk: you can read and answer, but not change anything. If the author asks for a change or a new deck, describe it and say they can switch the chat to Review to have you make it.';
	const deck = 'When the author asks for a NEW deck (not a change to this one), draft the whole deck and call create_deck once; never rebuild the open deck to make a new one. The author confirms before it exists.';
	if (mode === 'auto') return `MODE — Auto: a clean edit applies as soon as the turn ends, and the author can undo it from History. An edit that deletes slides or rewrites most of the deck still waits for the author to apply it. ${deck}`;
	return `MODE — Review: your edits stage on a draft the author reviews and applies. ${deck}`;
}

// ── Act-tier actions ────────────────────────────────────────────────────────

/** An action the chat queued for the author to confirm. Stored on the assistant message. */
export type ChatAction = {
	kind: 'create_deck';
	title: string;
	markdown: string;
	/** The slide headings as a reader sees them (hidden comments and code left out), capped at 60. */
	outline: string[];
	/** How many slides the deck has, which the outline may not show in full. */
	slides: number;
	/** Errors the checker found in it when it was queued, shown on the confirm. */
	errors: number;
	/** Set once the author answers. */
	state?: 'done' | 'declined';
};

// One round of output is capped at 16,384 tokens (CHAT_MAX_TOKENS), about 65,000 characters.
export const CREATE_DECK_MAX_CHARS = 60_000;
export const CREATE_DECK_TITLE_MAX = 80;

export const CREATE_DECK_TOOL = {
	type: 'function',
	function: {
		name: 'create_deck',
		description:
			'Create a NEW deck from complete Lattice Markdown (front matter, then slides separated by ---), for when the author asks for a new deck rather than a change to this one. It does not happen yet: the author sees the title and outline and confirms. Call it once per turn, after drafting the whole deck; then tell the author it is ready for them to confirm. The open deck is not changed.',
		parameters: {
			type: 'object',
			properties: {
				title: { type: 'string', description: `The deck's title, under ${CREATE_DECK_TITLE_MAX} characters.` },
				markdown: { type: 'string', description: 'The whole deck in Lattice Markdown.' },
			},
			required: ['title', 'markdown'],
		},
	},
} as const;

/** A title as the author will see it: no format characters (zero-width, right-to-left overrides),
 *  one space between words. Empty when nothing visible is left. */
export function visibleTitle(raw: unknown): string {
	const t = String(raw ?? '')
		.replace(/\p{Cf}/gu, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, CREATE_DECK_TITLE_MAX);
	return /[\p{L}\p{N}]/u.test(t) ? t : '';
}

/** A slide's heading as a reader sees it: the first `#`–`###` line outside HTML comments and
 *  fenced code, which never render as headings. */
export function outlineTitle(slide: string): string {
	const shown = slide.replace(/<!--[\s\S]*?(?:-->|$)/g, '').replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, '');
	return (shown.match(/^#{1,3}[ \t]+(.+)$/m)?.[1] ?? '').replace(/\p{Cf}/gu, '').trim();
}

// ── Auto: when an edit may apply without the author ─────────────────────────

/** Why Auto must leave this turn's edits for the author to apply, or null when it may apply them.
 *  Auto skips the one moment the author reads a change, so it applies only the plainest case: a
 *  tool-agent turn that ran to its end with a clean draft, on a deck nobody touched meanwhile,
 *  outside a live session, that deletes nothing and leaves most of the deck as it was. */
export function autoHold(o: { via?: 'agent' | 'oneshot'; clean?: boolean; aborted: boolean; deckChanged: boolean; live: boolean; edits: readonly { action: string }[]; slideCount: number }): string | null {
	if (o.aborted) return 'the turn was stopped';
	if (o.via !== 'agent') return 'this model answers without tools, so its edits always wait for you';
	if (!o.clean) return 'the turn did not finish cleanly';
	if (o.deckChanged) return 'the deck changed while the chat was working';
	if (o.live) return 'a live session is open';
	if (o.edits.some((e) => e.action === 'delete')) return 'it deletes slides';
	const changed = o.edits.filter((e) => e.action === 'replace' || e.action === 'insert').length;
	if (changed > Math.max(2, Math.ceil(o.slideCount / 2))) return 'it rewrites most of the deck';
	return null;
}

// ── Look and chart tools (draft), and the slide render (read) ───────────────

/** set_theme / set_finish, with the names the Studio ships as an enum, so the model cannot invent one. */
export function makeLookTools(themes: readonly string[], finishes: readonly string[]) {
	return [
		{
			type: 'function',
			function: {
				name: 'set_theme',
				description: 'Change the deck\'s theme (its palette) on the draft. Same as setting the `theme:` front-matter key.',
				parameters: { type: 'object', properties: { name: { type: 'string', enum: [...themes] }, summary: { type: 'string' } }, required: ['name'] },
			},
		},
		{
			type: 'function',
			function: {
				name: 'set_finish',
				description: 'Change the deck\'s finish (the backdrop behind every slide) on the draft; "none" removes it. Same as setting `finish:`. read_guide finish first if unsure.',
				parameters: { type: 'object', properties: { name: { type: 'string', enum: ['none', ...finishes] }, summary: { type: 'string' } }, required: ['name'] },
			},
		},
	] as const;
}

export const RENDER_SLIDE_MAX_PER_TURN = 3;
export const RENDER_TOOL = {
	type: 'function',
	function: {
		name: 'render_slide',
		description: `Look at one slide of the draft, rendered the way export draws it. The picture arrives in the next message. Use it to judge a layout you are unsure of, not on every slide; at most ${RENDER_SLIDE_MAX_PER_TURN} per turn.`,
		parameters: { type: 'object', properties: { slide: { type: 'integer', description: 'The slide number, 1-based.' } }, required: ['slide'] },
	},
} as const;
