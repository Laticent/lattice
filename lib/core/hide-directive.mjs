/**
 * lib/core/hide-directive.mjs — THE `hide` directive, read once (engineering/decisions/2026-11-06-hidden-slides.md).
 *
 * Every reader of `hide` asks here: the engine (lib/engine/slides.js), the passes that cut one slide into several
 * (the heading split, the pane split), the source reader the Studio and Present use (`slideSourceHidden`), and the
 * Export-to-Marp bake. Two rules, kept in one place because readers that each spelled them drifted:
 *
 *   VALUE. A bare `hide`, or `true`/`yes`/`on`/`1`, is ON; `false`/`no`/`off`/`0` is OFF; anything else is NOT A HIDE
 *   DIRECTIVE at all, so `<!-- hide: if short on time -->` stays the speaker note it is rather than being swallowed.
 *   PLACE. Only a TOP-LEVEL comment block is read (`html_block` at level 0): `> <!-- hide -->` and a comment inside a
 *   list item, or inside a line of text, are not directives. The source reader parses with the shared boundary parser
 *   so it sees exactly the blocks the engine sees, code included.
 *
 * Within one authored slide the LAST hide wins.
 */
import { readDirectiveComment } from './comment-directive.mjs';

const HIDE_ONLY = { known: new Set(['hide']), flags: new Set(['hide']) };

/** 'on', 'off', or null when the value is not a hide value (the comment is then not a directive). */
export function hideValue(value) {
	const v = String(value ?? '').replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
	if (/^(?:|true|yes|on|1)$/i.test(v)) return 'on';
	if (/^(?:false|no|off|0)$/i.test(v)) return 'off';
	return null;
}

/** The hide state one comment's text sets ('on' | 'off'), or null when it is no hide directive. */
export function hideOfComment(content) {
	const dir = readDirectiveComment(String(content ?? ''), HIDE_ONLY);
	return dir ? hideValue(dir.value) : null;
}

/** The hide state a run of markdown-it tokens (one authored slide) resolves to: 'on', 'off', or null if it says nothing. */
export function tokensHideState(tokens) {
	let state = null;
	for (const t of tokens) {
		if (t.type !== 'html_block' || t.level) continue;
		const v = hideOfComment(t.content);
		if (v) state = v;
	}
	return state;
}

/** Does a run of tokens hide itself? */
export function tokensHide(tokens) {
	return tokensHideState(tokens) === 'on';
}
