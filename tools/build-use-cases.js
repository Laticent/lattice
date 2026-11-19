#!/usr/bin/env node
/**
 * Use cases → the Studio chat's tool catalog.
 *
 * Reads every lib/use-cases/<id>/<id>.use-case.json and writes
 * docs/src/components/studio/chat-tools.generated.ts: the tool definitions the chat sends the model
 * (in `chat.position` order), the tier table, the deck-edit set, the status labels and the runtime
 * catalog the dispatcher (lib/use-cases/dispatch.mjs) reads. One manifest per tool replaces the five
 * hand lists that had to agree (engineering/decisions/2026-11-17-use-case-layer.md §3.4, §10 step 1).
 *
 * PLACEHOLDERS. A value the Studio computes at runtime is named in the manifest and filled from the
 * `vars` argument of `chatToolCatalog(vars)`, so a manifest never copies a constant:
 *   "…up to {{FIND_MAX_CHARS}} characters"  → `…up to ${v.FIND_MAX_CHARS} characters`
 *   "Topics: {{guides|join}}."              → `Topics: ${v.guides.join(', ')}.`
 *   "{{=MAX_VIEWS_PER_TURN}}" (whole value) → v.MAX_VIEWS_PER_TURN
 *   ["none", "{{...finishes}}"]             → ['none', ...v.finishes]
 * Every name must be in CHAT_VARS below; an unknown one fails the build.
 *
 * Usage: node tools/build-use-cases.js [--check]   (--check: fail if the generated file is stale)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const USE_CASES = path.join(ROOT, 'lib', 'use-cases');
const STUDIO = path.join(ROOT, 'docs', 'src', 'components', 'studio');
// Two files on purpose. The tiers are read by chat-actions.ts, which the chat panel loads up front; the
// definitions and labels are read only by the lazily loaded chat agent. One file would put every tool
// schema in the Studio's startup bundle (docs/route-budget.json).
const OUT = path.join(STUDIO, 'chat-tools.generated.ts');
const OUT_TIERS = path.join(STUDIO, 'chat-tool-tiers.generated.ts');

/** The runtime values a chat manifest may name, and their TypeScript types. */
const CHAT_VARS = {
	guides: 'readonly string[]',
	themes: 'readonly string[]',
	finishes: 'readonly string[]',
	chartKinds: 'readonly string[]',
	FIND_MAX_CHARS: 'number',
	MAX_VIEWS_PER_TURN: 'number',
	PREVIEW_SPEECH_MAX_SLIDES: 'number',
	RENDER_SLIDE_MAX_PER_TURN: 'number',
	CREATE_DECK_TITLE_MAX: 'number',
};

/** Every manifest, by id, read from its own directory. */
function readManifests() {
	const out = [];
	for (const dir of fs.readdirSync(USE_CASES, { withFileTypes: true })) {
		if (!dir.isDirectory()) continue;
		const file = path.join(USE_CASES, dir.name, `${dir.name}.use-case.json`);
		if (!fs.existsSync(file)) continue;
		const m = JSON.parse(fs.readFileSync(file, 'utf8'));
		if (m.id !== dir.name) throw new Error(`${path.relative(ROOT, file)}: id "${m.id}" does not match its directory`);
		out.push(m);
	}
	return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** What the chat host can give a use case (manifest `requires`); a need outside this is never offered. */
const CHAT_CAPS = ['render', 'images', 'library'];

const isList = (name) => CHAT_VARS[name].endsWith('[]');

const varRef = (name, where) => {
	if (!Object.hasOwn(CHAT_VARS, name)) throw new Error(`${where}: unknown placeholder "${name}" (known: ${Object.keys(CHAT_VARS).join(', ')})`);
	return `v.${name}`;
};

/** A string as TypeScript: a plain literal, or a template literal when it holds placeholders. */
function emitString(s, where) {
	// A template literal turns CR and CRLF into LF, so a placeholder would change bytes no one wrote.
	if (s.includes('\r')) throw new Error(`${where}: a carriage return in ${JSON.stringify(s.slice(0, 60))}; manifests use LF only`);
	const whole = /^\{\{=([A-Za-z_]\w*)\}\}$/.exec(s);
	if (whole) return varRef(whole[1], where);
	if (!s.includes('{{')) return JSON.stringify(s);
	let out = '';
	let at = 0;
	for (const m of s.matchAll(/\{\{([A-Za-z_]\w*)(\|join)?\}\}/g)) {
		out += s.slice(at, m.index).replace(/[\\`]/g, '\\$&').replace(/\$\{/g, '\\${');
		const ref = varRef(m[1], where);
		// A list as text is `{{name|join}}`: bare, a template literal would print it as "a,b".
		if (isList(m[1]) !== !!m[2]) throw new Error(`${where}: "{{${m[1]}${m[2] || ''}}}" — ${isList(m[1]) ? 'a list inside text needs |join' : '|join is only for a list'}`);
		out += `\${${ref}${m[2] ? ".join(', ')" : ''}}`;
		at = m.index + m[0].length;
	}
	out += s.slice(at).replace(/[\\`]/g, '\\$&').replace(/\$\{/g, '\\${');
	if (out.includes('{{')) throw new Error(`${where}: a malformed placeholder in ${JSON.stringify(s)}`);
	return `\`${out}\``;
}

/** Any JSON value as a TypeScript expression, placeholders resolved, key order kept. */
function emit(value, where) {
	if (typeof value === 'string') return emitString(value, where);
	if (Array.isArray(value)) {
		return `[${value
			.map((x, i) => {
				const spread = typeof x === 'string' && /^\{\{\.\.\.([A-Za-z_]\w*)\}\}$/.exec(x);
				if (spread && !isList(spread[1])) throw new Error(`${where}[${i}]: "{{...${spread[1]}}}" spreads a value that is not a list`);
				return spread ? `...${varRef(spread[1], where)}` : emit(x, `${where}[${i}]`);
			})
			.join(', ')}]`;
	}
	if (value && typeof value === 'object') return `{ ${Object.entries(value).map(([k, x]) => `${JSON.stringify(k)}: ${emit(x, `${where}.${k}`)}`).join(', ')} }`;
	return JSON.stringify(value);
}

const isDeckEdit = (m) => m.tier === 'draft' && m.effects.some((e) => e.startsWith('deck.'));

function generate() {
	const all = readManifests();
	const chat = all.filter((m) => m.hosts.includes('chat'));
	const positions = new Map();
	for (const m of chat) {
		const p = m.chat?.position;
		if (!Number.isInteger(p)) throw new Error(`${m.id}: a chat-hosted use case needs an integer chat.position`);
		const cannot = m.requires.filter((r) => !CHAT_CAPS.includes(r));
		if (cannot.length) throw new Error(`${m.id}: the chat cannot provide ${cannot.join(', ')}, so it would never be offered there`);
		if (positions.has(p)) throw new Error(`${m.id}: chat.position ${p} is also ${positions.get(p)}'s`);
		positions.set(p, m.id);
	}
	chat.sort((a, b) => a.chat.position - b.chat.position);

	const entries = chat.map((m) => {
		const where = `${m.id}.use-case.json`;
		const description = m.describe.chat ?? m.describe.default;
		const tool = `{ type: 'function', function: { name: ${JSON.stringify(m.id)}, description: ${emitString(description, `${where} describe`)}, parameters: ${emit(m.input, `${where} input`)} } }`;
		return `\t\t{ requires: ${JSON.stringify(m.requires)}, tool: ${tool} },`;
	});
	const catalog = all.map((m) => `\t${JSON.stringify(m.id)}: ${JSON.stringify({ tier: m.tier, effects: m.effects, destructive: m.destructive, idempotent: m.idempotent, confirm: m.confirm, requires: m.requires, hosts: m.hosts, toolset: m.toolset, legacy: !!m.legacy, deckEdit: isDeckEdit(m) })},`);
	const labels = (key) => chat.filter((m) => m.chat?.[key]).map((m) => `\t${m.id}: ${JSON.stringify(m.chat[key])},`);

	const tiers = `// GENERATED by tools/build-use-cases.js from lib/use-cases/*/*.use-case.json. DO NOT EDIT.
// Only the tiers, so the chat panel's startup code does not carry the tool schemas (chat-tools.generated.ts).

import type { ToolTier } from './chat-actions';

/** The tier of every chat tool. A tool missing here is refused in every mode. */
export const TOOL_TIERS: Readonly<Record<string, ToolTier>> = {
${chat.map((m) => `\t${m.id}: ${JSON.stringify(m.tier)},`).join('\n')}
};
`;
	return { tiers, main: `// GENERATED by tools/build-use-cases.js from lib/use-cases/*/*.use-case.json. DO NOT EDIT.
// Change a manifest and run \`npm run build\`; \`build:check\` fails while this file is stale.
// What a chat request carries is held byte for byte by chat-tools.golden.test.ts.

import type { ToolTier } from './chat-actions';

/** The runtime values the manifests name as placeholders. */
export interface ChatToolVars {
${Object.entries(CHAT_VARS)
	.map(([k, t]) => `\t${k}: ${t};`)
	.join('\n')}
}

/** A host capability a use case needs before it is offered (manifest \`requires\`). */
export type ChatToolNeed = 'render' | 'images' | 'library' | 'network' | 'dom';

/** Every chat tool, in the order the model sees them, each with what it needs to be offered. */
export function chatToolCatalog(v: ChatToolVars) {
	return [
${entries.join('\n')}
	] as { requires: ChatToolNeed[]; tool: { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } } }[];
}

/** One record per use case: what the dispatcher gates and checks on. */
export const USE_CASES: Readonly<Record<string, { tier: ToolTier; effects: readonly string[]; destructive: boolean; idempotent: boolean; confirm: string; requires: readonly string[]; hosts: readonly string[]; toolset: string; legacy: boolean; deckEdit: boolean }>> = {
${catalog.join('\n')}
};

/** The tools that change the deck on the draft: their result carries the draft's check. */
export const DECK_EDIT_TOOLS: readonly string[] = ${JSON.stringify(chat.filter(isDeckEdit).map((m) => m.id))};

/** What the transcript says while a tool runs. */
export const TOOL_ACTIVITY: Record<string, string> = {
${labels('activity').join('\n')}
};

/** What the transcript says while a tool call is still ARRIVING (only where the arguments are the slow part). */
export const TOOL_DRAFTING: Record<string, string> = {
${labels('drafting').join('\n')}
};
` };
}

function main() {
	const check = process.argv.includes('--check');
	const { tiers, main: next } = generate();
	const stale = [];
	for (const [file, text] of [[OUT, next], [OUT_TIERS, tiers]]) {
		const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
		if (now === text) continue;
		if (check) stale.push(path.relative(ROOT, file));
		else fs.writeFileSync(file, text);
	}
	if (stale.length) {
		console.error(`${stale.join(', ')} stale: run \`npm run build\` (tools/build-use-cases.js).`);
		process.exit(1);
	}
	console.log(check ? 'use-cases OK — the chat tool files match the manifests.' : `[build-use-cases] ${path.relative(ROOT, OUT)}, ${path.relative(ROOT, OUT_TIERS)}`);
}

/**
 * A manifest value with every whole-value and spread placeholder replaced by a sample of its type
 * (1 for a number, ["x"] for a list), so the result can be compiled as JSON Schema. Placeholders inside
 * text stay as they are: they are only text.
 */
function sampleValue(value) {
	if (typeof value === 'string') {
		const whole = /^\{\{=([A-Za-z_]\w*)\}\}$/.exec(value);
		if (whole && Object.hasOwn(CHAT_VARS, whole[1])) return isList(whole[1]) ? ['x'] : 1;
		return value;
	}
	if (Array.isArray(value)) return value.map((x) => (typeof x === 'string' && /^\{\{\.\.\.[A-Za-z_]\w*\}\}$/.test(x) ? 'x' : sampleValue(x)));
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, sampleValue(x)]));
	return value;
}

if (require.main === module) main();
module.exports = { generate, readManifests, emitString, sampleValue, CHAT_VARS, CHAT_CAPS };
