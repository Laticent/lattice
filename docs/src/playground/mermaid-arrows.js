// Mermaid arrow families for the playground editor's highlighter (editor.js), after Prism's four
// `arrow` patterns. Each family returns how many characters of `rest` (the text from the stream's
// position) it reads as an arrow, or 0.
//
// Why functions and not one regex per family: the flowchart, sequence and class patterns each held
// both `<` and `>`, so CodeQL's js/bad-tag-filter read them as HTML comment filters that accept
// `-->` but miss `--!>` (#1958 §2, §7). They are not filters. Each family is still an ORDERED
// alternation anchored at the start, which is exactly "try each branch in order and take the first
// that matches". The branches are split so that no single pattern holds both brackets, and the
// flowchart's leading `[<ox]` is a character test. mermaid-arrows.test.ts pins every family to the
// lengths the old single regexes gave.

const ER = /^[|}][|o](?:--|\.\.)[|o][|{]/;
const FLOW_BODY_OPT_HEAD = /^(?:==+|--+|-\.*-)[>ox]?/;
const FLOW_BODY_HEAD = /^(?:==+|--+|-\.*-)[>ox]/;
const FLOW_LINE = /^(?:===+|---+|-\.+-)/;
const SEQ_RIGHT = /^--?(?:>>|[x>)])/;
const SEQ_LEFT = /^(?:<<|[x<(])--?(?!-)/;
const CLASS_LEFT = /^(?:[*o]--|--[*o]|<\|?(?:--|\.\.))/;
const CLASS_RIGHT = /^(?:(?:--|\.\.)\|?>|--|\.\.)/;

/** @param {RegExp} re @param {string} s */
const len = (re, s) => {
	const m = re.exec(s);
	return m ? m[0].length : 0;
};

/** The flowchart's first branch: one of `<`, `o`, `x`, then a body and an optional head. */
const flowHeaded = (s) => {
	if (s[0] !== '<' && s[0] !== 'o' && s[0] !== 'x') return 0;
	const n = len(FLOW_BODY_OPT_HEAD, s.slice(1));
	return n ? n + 1 : 0;
};

/** @type {Array<(rest: string) => number>} ER, flowchart, sequence, class: the order editor.js tries them in. */
export const ARROW_FAMILIES = [
	(s) => len(ER, s),
	(s) => flowHeaded(s) || len(FLOW_BODY_HEAD, s) || len(FLOW_LINE, s),
	(s) => len(SEQ_RIGHT, s) || len(SEQ_LEFT, s),
	(s) => len(CLASS_LEFT, s) || len(CLASS_RIGHT, s),
];

// Prism's prev-char guard per family: an arrow may not start right after one of these.
export const ARROW_PREV = [/[{}|o.-]/, /[<>ox.=-]/, /[<>()x-]/, /[<>|*o.-]/];
