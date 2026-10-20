// What the Architect did on a turn, as one sentence under its reply.
//
// The toolbox logs short phrases ("read about the kpi layout", "checked the deck"). They used to
// be joined with " · " and read as a row of labels in layout names; an author following along
// reads a sentence instead: "Read about the kpi layout, drafted changes to the slides and checked
// the deck." Older saved chats hold capitalized labels ("Read kpi"); they fold into the same shape.

/** The turn's activity phrases as one sentence, or '' when there are none. */
export function activitySentence(activity: readonly string[] | undefined): string {
	const parts = (activity ?? []).map((a) => String(a ?? '').trim().replace(/[.…]+$/, '')).filter(Boolean);
	if (!parts.length) return '';
	const lower = parts.map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1)));
	const list = lower.length === 1 ? lower[0] : `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
	return `${list.charAt(0).toUpperCase()}${list.slice(1)}.`;
}

/** The latest words of a streaming thought, for a two-line snippet: the tail of the text, started at a word boundary and marked
 *  with a leading ellipsis when anything was cut. The thought store keeps the last 200 characters, which can open mid-word. */
export function thoughtTail(text: string, max = 110): string {
	const t = String(text ?? '').replace(/\s+/g, ' ').trim();
	if (t.length <= max) return t;
	const cut = t.slice(-max);
	const space = cut.indexOf(' ');
	return `…${(space > -1 && space < 24 ? cut.slice(space + 1) : cut).trimStart()}`;
}
