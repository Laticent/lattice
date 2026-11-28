// THE USE-CASE DISPATCHER: one path from "the model (or a person) asked for an action" to its result,
// for every host. engineering/decisions/2026-11-17-use-case-layer.md §6.1.
//
// It runs the steps every host needs today and no more: look the use case up by its own key, gate it for
// this host and mode, parse its arguments, validate them against the manifest's schema (§7, §10 step 2),
// run its handler, and for a deck edit reset the turn's verdict first and run the host's check on the
// result. Limits, changesets and confirmation arrive with the steps that need them.
//
// The dispatcher never writes prose. It returns a code, and each host turns the code into its own words
// (the chat's are in architect-agent.ts), so the chat's measured wording never has to be shared with a
// host it would be wrong for. Pure: no DOM, no storage, no network.

import { SCHEMAS, VALIDATORS } from './validators.generated.mjs';

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
 * A use case's input validator: the generated standalone ajv function (lib/use-cases/<id>/<id>.validate.mjs).
 * @typedef {((data: unknown) => boolean) & { errors?: { instancePath: string, keyword: string, message?: string, params?: Record<string, unknown> }[] | null }} Validator
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
 * @property {Readonly<Record<string, Validator>>} [validators]  Every use case's validator, by id. Omitted, the
 *   generated ones (validators.generated.mjs); a test host passes its own.
 * @property {Readonly<Record<string, object>>} [schemas]  Each validator's schema, for dropping a null left in an
 *   optional field. Omitted, the generated ones; a use case with no schema here is validated as sent.
 */

/**
 * `BAD_ARGS` carries `path` and `reason` when the arguments parsed but did not fit the schema: the JSON Pointer
 * of the first field that failed (`/edits/0/slide`, or `/from` for a missing required field) and the
 * validator's words for why (`must be integer`). Without them, the arguments were not JSON at all.
 * @typedef {{ ok: true, text: string }
 *   | { ok: false, code: 'UNKNOWN' | 'NOT_OFFERED', id: string }
 *   | { ok: false, code: 'BAD_ARGS', id: string, path?: string, reason?: string }} Dispatched
 */

const allowsNull = (schema) => schema?.type === 'null' || (Array.isArray(schema?.type) && schema.type.includes('null'));

/**
 * ONE RULE FOR ALL TOOLS: a null in an optional field means the field was left out. Models fill unused
 * optional parameters with null as often as they omit them, so this drops such a null, at any depth, before
 * the schema is checked, instead of every schema saying "or null" field by field. A null where the schema
 * allows one (set_front_matter's `value: null` removes a key) and a null in a REQUIRED field are kept, so the
 * first means what it says and the second is still refused. Returns new objects; `__proto__` stays an own field.
 */
export function dropNullOptionals(value, schema) {
	if (Array.isArray(value)) return schema?.items ? value.map((x) => dropNullOptionals(x, schema.items)) : value;
	if (!value || typeof value !== 'object' || !schema?.properties) return value;
	const required = new Set(schema.required ?? []);
	const entries = [];
	for (const key of Object.keys(value)) {
		const field = Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined;
		if (value[key] === null && field && !required.has(key) && !allowsNull(field)) continue;
		entries.push([key, field ? dropNullOptionals(value[key], field) : value[key]]);
	}
	return Object.fromEntries(entries);
}

/** The first validation error as a field and a reason. A missing required field is named by its own path. */
function firstError(validate) {
	const e = validate.errors?.[0];
	if (!e) return { path: '/', reason: 'does not fit the schema' };
	const missing = e.keyword === 'required' && typeof e.params?.missingProperty === 'string' ? `/${e.params.missingProperty}` : '';
	return { path: `${e.instancePath}${missing}` || '/', reason: missing ? 'is required' : (e.message ?? 'does not fit the schema') };
}

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
	const validators = host.validators ?? VALIDATORS;
	// No validator, no run: a use case whose arguments cannot be checked is not one this host can run
	// (checkUseCaseValidators keeps every manifest's validator, so this only refuses a broken build).
	if (!record?.hosts.includes(host.id) || !Object.hasOwn(host.handlers, id) || !Object.hasOwn(validators, id)) return { ok: false, code: 'UNKNOWN', id };
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
	// THE SCHEMA. Arguments that parsed but do not fit never reach the handler, so a refused edit changes
	// nothing in the deck, and is marked refused for the same reason as one that did not parse.
	const schemas = host.schemas ?? SCHEMAS;
	if (Object.hasOwn(schemas, id)) args = dropNullOptionals(args, schemas[id]);
	const validate = validators[id];
	if (!validate(args)) {
		if (record.deckEdit) host.deckEdit.refuse();
		return { ok: false, code: 'BAD_ARGS', id, ...firstError(validate) };
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
