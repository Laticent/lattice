// Which fences in a chat reply are FIGURES — a diagram, an equation, a plot or a slide the chat
// draws instead of printing — and the one-slide deck each becomes.
//
// Pure and DOM-free so it is unit-tested alone. How the figure is drawn, and why a pool of frames
// rather than a frame per figure or a bake, is `engineering/decisions/2026-10-12-chat-figures-bakeoff.md`.

/** The fence languages the chat draws, and what each one is. `latticeplot` is the deprecated alias
 *  of `functionplot`, accepted because a model trained on older docs still writes it. */
export const FIGURE_LANGS: Readonly<Record<string, 'mermaid' | 'math' | 'functionplot' | 'slide'>> = {
	mermaid: 'mermaid',
	math: 'math',
	functionplot: 'functionplot',
	latticeplot: 'functionplot',
	lattice: 'slide',
};

/** A figure larger than this stays a code block. A model that pastes a whole deck into a fence
 *  should read as source, not as a slow draw. */
export const MAX_FIGURE_CHARS = 8000;

export const isFigureLang = (lang: string): boolean => Object.hasOwn(FIGURE_LANGS, lang.toLowerCase());

/** A fence long enough that nothing inside it can close it early. */
function fenceFor(code: string): string {
	const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((r) => r.length));
	return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * The one-slide deck that draws a figure, with the open deck's front matter in front so the theme,
 * mode and size match the deck the author is looking at. `null` when the fence is not a figure or is
 * too large to draw.
 */
export function figureSample(lang: string, code: string, frontMatter: string): string | null {
	const kind = FIGURE_LANGS[lang.toLowerCase()];
	if (!kind || !Object.hasOwn(FIGURE_LANGS, lang.toLowerCase()) || code.length > MAX_FIGURE_CHARS || !code.trim()) return null;
	const body = code.replace(/\s+$/, '');
	switch (kind) {
		case 'slide': {
			// One slide: a model that writes several is shown the first. The author's own `---` rule
			// would otherwise start a second slide that the tile cannot show.
			const first = body.split(/^---\s*$/m)[0].trim();
			return first ? `${frontMatter}${first}\n` : null;
		}
		case 'mermaid': {
			const f = fenceFor(body);
			return `${frontMatter}<!-- _class: diagram -->\n\n${f}mermaid\n${body}\n${f}\n`;
		}
		case 'math':
			// The `math` layout is the one built to give a hero equation the room; `content` set it as small
			// text in a corner.
			return `${frontMatter}<!-- _class: math -->\n\n$$\n${body}\n$$\n`;
		case 'functionplot': {
			const f = fenceFor(body);
			return `${frontMatter}<!-- _class: content -->\n\n${f}functionplot\n${body}\n${f}\n`;
		}
	}
}

/** What the caption says the figure is. */
export const figureLabel = (lang: string): string => {
	const kind = FIGURE_LANGS[lang.toLowerCase()];
	return kind === 'slide' ? 'Slide' : kind === 'mermaid' ? 'Diagram' : kind === 'math' ? 'Equation' : kind === 'functionplot' ? 'Plot' : lang;
};
