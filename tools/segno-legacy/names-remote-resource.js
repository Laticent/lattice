/**
 * `namesRemoteResource` as lib/export/player-prune.js had it at a1b278c, before Segno R4 moved it onto
 * `cssRefSpans`. Frozen verbatim: test/unit/export/rehost-remote-ref.test.js holds the new reader to it
 * on the engine's real sheets, and test/integration/export/rehost-remote-oracle.test.js runs it as the
 * failing arm (`REHOST_ORACLE_LEGACY=1`). Nothing in `lib/` may read it. Do not fix bugs here.
 */
const URL_OR_STRING_RE = /(["'])((?:\\[\s\S]|(?!\1)[^\\])*)\1|url\(\s*([^"'\s)][^)]*)\)/gi;
function namesRemoteResource(valueText) {
	for (const m of valueText.matchAll(URL_OR_STRING_RE)) {
		const ref = (m[2] !== undefined ? m[2] : m[3] || '').trim();
		if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(ref)) return true;
	}
	return false;
}

module.exports = { namesRemoteResource };
