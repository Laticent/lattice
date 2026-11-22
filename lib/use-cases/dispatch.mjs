// THE USE-CASE DISPATCHER: one path from "the model (or a person) asked for an action" to its result,
// for every host. engineering/decisions/2026-11-17-use-case-layer.md §6.1.
//
// Step 1 of that note's §10 runs the steps every host needs today and no more: look the use case up by
// its own key, gate it for this host and mode, parse its arguments, run its handler, and for a deck edit
// reset the turn's verdict first and run the host's check on the result. Validation against the
// manifest's schema (§7), limits, changesets and confirmation arrive with the steps that need them.
//
// The dispatcher never writes prose. It returns a code, and each host turns the code into its own words
// (the chat's are in architect-agent.ts), so the chat's measured wording never has to be shared with a
// host it would be wrong for. Pure: no DOM, no storage, no network.

/**
 * What the dispatcher reads from a use case's generated record (chat-tools.generated.ts `USE_CASES`).
 * @typedef {{ tier: 'read' | 'draft' | 'act', hosts: readonly string[], deckEdit: boolean }} UseCaseRecord
 */

/**
 * A handler's answer: its text, or its text with `check: false` when this result must not carry the
 * draft's check (a refusal that changed nothing, such as an unknown theme name).
 * @typedef {string | { text: string, check: false }} HandlerResult
 */

/**
 * A host: where the use case runs and what it may do there.
 * @typedef {object} Host
 * @property {string} id  The host's name in a manifest's `hosts` (`chat`).
 * @property {Readonly<Record<string, UseCaseRecord>>} catalog  Every use case, by id.
 * @property {(id: string, record: UseCaseRecord) => boolean} allowed  The mode gate: may this run now?
 * @property {Readonly<Record<string, (args: any) => HandlerResult | Promise<HandlerResult>>>} handlers
 * @property {{ begin(): void, refuse(): void, check(text: string): string | Promise<string> }} deckEdit
 *   A deck edit's verdict: reset before it runs, marked refused when it never ran, and its check.
 */

/**
 * @typedef {{ ok: true, text: string }
 *   | { ok: false, code: 'UNKNOWN' | 'NOT_OFFERED' | 'BAD_ARGS', id: string }} Dispatched
 */

/**
 * Run one use case for a host.
 * @param {Host} host
 * @param {string} id
 * @param {string} argsJson  The arguments as the caller sent them, unparsed.
 * @returns {Promise<Dispatched>}
 */
export async function dispatch(host, id, argsJson) {
	// By OWN key only: `constructor` or `__proto__` must not resolve to something off the prototype.
	const record = Object.hasOwn(host.catalog, id) ? host.catalog[id] : null;
	if (!record?.hosts.includes(host.id) || !Object.hasOwn(host.handlers, id)) return { ok: false, code: 'UNKNOWN', id };
	// THE GATE. A host's request already left out what this mode forbids; this refuses it again, so a
	// caller that asks for an action it was never offered still changes nothing.
	if (!host.allowed(id, record)) {
		if (record.deckEdit) host.deckEdit.refuse();
		return { ok: false, code: 'NOT_OFFERED', id };
	}
	let args;
	try {
		args = argsJson ? JSON.parse(argsJson) : {};
	} catch {
		// An edit whose arguments did not parse changed nothing, and must not inherit the previous edit's
		// clean verdict: the turn would end with this edit silently dropped.
		if (record.deckEdit) host.deckEdit.refuse();
		return { ok: false, code: 'BAD_ARGS', id };
	}
	if (!record.deckEdit) {
		const out = await host.handlers[id](args);
		return { ok: true, text: typeof out === 'string' ? out : out.text };
	}
	// A deck edit carries its own check, so the common turn is read → edit → answer, not one more
	// round that re-sends the whole conversation to ask for the check.
	host.deckEdit.begin();
	const out = await host.handlers[id](args);
	if (typeof out !== 'string') return { ok: true, text: out.text };
	return { ok: true, text: await host.deckEdit.check(out) };
}
