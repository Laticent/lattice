#!/usr/bin/env node
/**
 * Gift cards: make spend-capped OpenRouter keys on YOUR account and hand them out as gift links,
 * a CSV record and a printable deck of business cards with a QR code each.
 *
 * Design: engineering/decisions/2026-11-06-gift-link-cli.md §3–§5. The link format is
 * lib/core/gift-link.mjs, the same codec the Studio's /gift page reads with.
 *
 * NEVER IN CI OR TESTS. It creates real keys on someone's account. It needs that account's
 * OpenRouter MANAGEMENT key (openrouter.ai → Settings → Management API Keys), which can create,
 * cap, list and delete keys but cannot run a model. The key is read from
 * OPENROUTER_MANAGEMENT_KEY, or asked for at the terminal; it is never written to any file.
 *
 *   node tools/gift-cards.mjs make   [--count 1] [--cap 1] [--label gift-2026-11] [--expires 30d]
 *                                     [--size us|iso] [--pin] [--with-links] [--out ./gift-cards]
 *                                     [--site https://lattice.style] [--no-render]
 *   node tools/gift-cards.mjs report [--label gift-2026-11]
 *   node tools/gift-cards.mjs revoke --label gift-2026-11 [--yes]
 *
 * `make` with one key prints its gift link, ready to paste into a message. With `--count N` it
 * writes the batch: cards.csv (the giver's record; links only with --with-links), cards.md (the
 * deck, one card per slide) and cards.pdf (rendered with the normal `lattice` render, then laid
 * out on Letter or A4 with cut marks as cards-sheet.pdf). The PDFs hold working keys: treat
 * them like cash.
 */

import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { encodeGiftLink, isOpenRouterKey } from '../lib/core/gift-link.mjs';

const API = 'https://openrouter.ai/api/v1';
const ENV_KEY = 'OPENROUTER_MANAGEMENT_KEY';
export const DEFAULT_SITE = 'https://lattice.style';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── arguments ─────────────────────────────────────────────────────────────────────────────

const FLAGS = new Set(['pin', 'with-links', 'yes', 'no-render', 'help']);

/** Parse `<command> --flag value …` into `{ command, opts }`. Throws on an unknown flag. */
export function parseArgs(argv) {
	const [command = 'help', ...rest] = argv;
	const opts = {};
	for (let i = 0; i < rest.length; i++) {
		const arg = rest[i];
		if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
		const [name, inline] = arg.slice(2).split(/=(.*)/s);
		if (FLAGS.has(name)) {
			// `--yes=no` or `--with-links=false` must not quietly mean yes.
			if (inline !== undefined) throw new Error(`--${name} takes no value`);
			opts[name] = true;
		}
		else if (['count', 'cap', 'label', 'expires', 'size', 'out', 'site'].includes(name)) {
			const value = inline ?? rest[++i];
			if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`);
			opts[name] = value;
		} else throw new Error(`unknown flag: --${name}`);
	}
	return { command, opts };
}

/** `30d`, `12h` or `2027-01-31` → an ISO timestamp with seconds (OpenRouter refuses minute precision), or null. */
export function parseExpires(text, now = new Date()) {
	if (text == null || text === '' || text === 'never') return null;
	const rel = /^(\d+)([dh])$/.exec(text);
	let at;
	if (rel) at = new Date(now.getTime() + Number(rel[1]) * (rel[2] === 'd' ? 86_400_000 : 3_600_000));
	else if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
		at = new Date(`${text}T23:59:59Z`);
		// `2027-02-31` must not roll over to March 3 without a word.
		if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== text) throw new Error(`--expires: ${text} is not a real date`);
	}
	else throw new Error(`--expires takes 30d, 12h, a date like 2027-01-31, or never (got ${text})`);
	if (!(at > now)) throw new Error('--expires must be in the future');
	return at.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** The site a link opens: https only, since a typo here hands every key to whoever owns that host. */
export function checkSite(site) {
	let u;
	try {
		u = new URL(site);
	} catch {
		throw new Error(`--site is not a URL: ${site}`);
	}
	if (u.protocol !== 'https:') throw new Error('--site must be an https address');
	if (u.search || u.hash) throw new Error('--site takes no query or fragment');
	return u.href.replace(/\/+$/, '');
}

/** Validate and default the `make` options. */
export function makeOptions(opts, now = new Date()) {
	const count = Number(opts.count ?? 1);
	if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('--count is a whole number from 1 to 500');
	const cap = Number(opts.cap ?? 1);
	if (!(cap > 0 && cap <= 100)) throw new Error('--cap is a dollar amount above 0 and at most 100');
	const size = opts.size ?? 'us';
	if (!['us', 'iso'].includes(size)) throw new Error('--size is us (3.5 x 2 in) or iso (85 x 55 mm)');
	// The default carries the minute, so two batches made the same day never share names (a
	// revoke of one must never reach the other).
	const label = opts.label ?? `gift-${now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`;
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/.test(label)) throw new Error('--label is letters, digits, dots, dashes and underscores');
	return {
		count,
		cap,
		size,
		label,
		expiresAt: parseExpires(opts.expires ?? '90d', now),
		pin: !!opts.pin,
		withLinks: !!opts['with-links'],
		out: path.resolve(opts.out ?? './gift-cards'),
		site: checkSite(opts.site ?? DEFAULT_SITE),
		render: !opts['no-render'],
	};
}

// ── OpenRouter ────────────────────────────────────────────────────────────────────────────

async function call(fetchImpl, mgmtKey, method, url, body) {
	const res = await fetchImpl(`${API}${url}`, {
		method,
		headers: { Authorization: `Bearer ${mgmtKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	if (!res.ok) {
		let said = text.slice(0, 200);
		try {
			said = JSON.parse(text)?.error?.message ?? said;
		} catch {}
		const hint = res.status === 401 || res.status === 403 ? ' Check that this is a MANAGEMENT key (Settings → Management API Keys), not an ordinary API key.' : '';
		throw new Error(`OpenRouter answered ${res.status} to ${method} ${url}: ${said}.${hint}`);
	}
	return text ? JSON.parse(text) : {};
}

/** The card's name at OpenRouter: the batch label and a zero-padded card number. */
export const cardName = (label, n, count) => `${label}-${String(n).padStart(String(count).length, '0')}`;

/**
 * Create `count` capped keys. Returns one record per card: number, name, hash (the id that deletes
 * it), key (secret), cap, created, expires. Stops at the first failure and returns what it made,
 * so a half batch is still recorded and can be revoked.
 */
export async function createKeys({ fetch: fetchImpl = fetch, mgmtKey, count, cap, label, expiresAt, now = () => new Date() }) {
	const cards = [];
	let error = null;
	for (let n = 1; n <= count; n++) {
		const name = cardName(label, n, count);
		try {
			const j = await call(fetchImpl, mgmtKey, 'POST', '/keys', { name, limit: cap, ...(expiresAt ? { expires_at: expiresAt } : {}) });
			const key = j.key;
			const hash = j.data?.hash;
			if (typeof key !== 'string' || !hash) throw new Error('OpenRouter created a key but returned no key string or hash');
			// Record it before checking its shape, so a key we cannot encode is still revocable.
			if (!isOpenRouterKey(key)) {
				cards.push({ n, name, hash, key: null, cap, created: j.data?.created_at ?? now().toISOString(), expires: j.data?.expires_at ?? expiresAt ?? '' });
				throw new Error('OpenRouter returned a key in a shape gift links do not know (expected sk-or-v1- and 64 hex digits)');
			}
			cards.push({ n, name, hash, key, cap, created: j.data?.created_at ?? now().toISOString(), expires: j.data?.expires_at ?? expiresAt ?? '' });
		} catch (e) {
			error = e;
			break;
		}
	}
	return { cards, error };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every key on the account named exactly `<label>-<number>` (or every key, with no label), the
 * names `make` gives. Exact, not a prefix: `cafe` must never reach `cafe-2-01` or `cafe-menu-bot`.
 * Follows OpenRouter's offset paging, de-duplicated by hash, and stops when a page adds nothing
 * new, so a server that ignores the offset cannot loop it.
 */
export async function listKeys({ fetch: fetchImpl = fetch, mgmtKey, label }) {
	const byHash = new Map();
	for (let offset = 0; ; ) {
		const j = await call(fetchImpl, mgmtKey, 'GET', `/keys?offset=${offset}`);
		const page = Array.isArray(j.data) ? j.data : [];
		const before = byHash.size;
		for (const k of page) if (k?.hash && !byHash.has(k.hash)) byHash.set(k.hash, k);
		if (page.length === 0 || byHash.size === before) break;
		offset += page.length;
	}
	const out = [...byHash.values()];
	if (!label) return out;
	const exact = new RegExp(`^${escapeRe(label)}-\\d+$`);
	return out.filter((k) => typeof k.name === 'string' && exact.test(k.name));
}

/** Delete keys by hash. Returns how many went, and the failures. */
export async function revokeKeys({ fetch: fetchImpl = fetch, mgmtKey, keys }) {
	let deleted = 0;
	const failed = [];
	for (const k of keys) {
		try {
			await call(fetchImpl, mgmtKey, 'DELETE', `/keys/${encodeURIComponent(k.hash)}`);
			deleted++;
		} catch (e) {
			failed.push({ name: k.name, error: String(e.message ?? e) });
		}
	}
	return { deleted, failed };
}

// ── outputs ───────────────────────────────────────────────────────────────────────────────

/** A 6-digit PIN, as a string so a leading zero survives. */
export const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const csvCell = (v) => {
	const s = String(v ?? '');
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The giver's record. The gift links (working keys) only with `withLinks`. */
export function buildCsv(cards, { withLinks = false } = {}) {
	const hasPin = cards.some((c) => c.pin);
	const head = ['card', 'name', 'openrouter_hash', 'cap_usd', 'created', 'expires', ...(hasPin ? ['pin'] : []), ...(withLinks ? ['gift_link'] : [])];
	const rows = cards.map((c) => [c.n, c.name, c.hash, c.cap, c.created, c.expires, ...(hasPin ? [c.pin ?? ''] : []), ...(withLinks ? [c.link] : [])]);
	return `${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')}\n`;
}

/** Group a PIN for reading off a card: 482913 → "482 913". */
const spacedPin = (pin) => pin.replace(/(\d{3})(?=\d)/g, '$1 ');

/** The cards deck: one `gift-card` slide per key, at the business-card size. */
export function buildDeck(cards, { size = 'us', cap = 1 } = {}) {
	// No page numbers and no spectrum bar: a printed card has neither, and a bar on the edge is the
	// first thing a home cut gets wrong.
	const front = ['---', `size: ${size === 'iso' ? 'card-iso' : 'card'}`, 'theme: cuoio', 'paginate: false', 'spectrum: off', '---', ''].join('\n');
	const slides = cards.map((c) =>
		[
			'<!-- _class: gift-card -->',
			'',
			'`A deck on us`',
			'',
			'## Make your next deck with Lattice.',
			'',
			// In a code span, so Markdown cannot read an underscore in the token as emphasis.
			`- \`${c.link}\` \`link\``,
			...(c.pin ? [`- ${spacedPin(c.pin)} \`pin\``] : []),
			`- Scan to start. Up to $${cap} of AI is on the house. \`caption\``,
			`- No. ${c.n} \`number\``,
			'',
		].join('\n'),
	);
	return front + slides.join('\n---\n\n');
}

// ── the home print sheet ──────────────────────────────────────────────────────────────────

const PT = 72;
const SHEETS = {
	// Letter, 10 US cards (2 x 5); A4, 10 ISO cards (2 x 5). Cards butt together so one cut serves two.
	us: { page: [8.5 * PT, 11 * PT], card: [3.5 * PT, 2 * PT], cols: 2, rows: 5 },
	iso: { page: [595.28, 841.89], card: [(85 / 25.4) * PT, (55 / 25.4) * PT], cols: 2, rows: 5 },
};

/**
 * Lay the one-card-per-page PDF out on Letter (US cards) or A4 (ISO cards), ten to a sheet, at the
 * card's exact physical size, with crop marks in the margins. Returns the sheet PDF's bytes.
 */
export async function imposeSheet(cardsPdfBytes, { size = 'us' } = {}) {
	const { PDFDocument, rgb } = await import('pdf-lib');
	const spec = SHEETS[size];
	const src = await PDFDocument.load(cardsPdfBytes);
	const out = await PDFDocument.create();
	const pages = await out.embedPdf(src, src.getPageIndices());
	const [pw, ph] = spec.page;
	const [cw, ch] = spec.card;
	const x0 = (pw - spec.cols * cw) / 2;
	const y0 = (ph - spec.rows * ch) / 2;
	const perSheet = spec.cols * spec.rows;
	const mark = { thickness: 0.5, color: rgb(0.45, 0.45, 0.45) };
	for (let s = 0; s < pages.length; s += perSheet) {
		const page = out.addPage([pw, ph]);
		pages.slice(s, s + perSheet).forEach((emb, i) => {
			const col = i % spec.cols;
			const row = Math.floor(i / spec.cols);
			page.drawPage(emb, { x: x0 + col * cw, y: ph - y0 - (row + 1) * ch, width: cw, height: ch });
		});
		// Crop marks at every cut line, outside the card area, so no mark prints on a card.
		const len = 14;
		const gap = 4;
		for (let c = 0; c <= spec.cols; c++) {
			const x = x0 + c * cw;
			page.drawLine({ start: { x, y: ph - y0 + gap }, end: { x, y: ph - y0 + gap + len }, ...mark });
			page.drawLine({ start: { x, y: y0 - gap }, end: { x, y: y0 - gap - len }, ...mark });
		}
		for (let r = 0; r <= spec.rows; r++) {
			const y = y0 + r * ch;
			page.drawLine({ start: { x: x0 - gap, y }, end: { x: x0 - gap - len, y }, ...mark });
			page.drawLine({ start: { x: pw - x0 + gap, y }, end: { x: pw - x0 + gap + len, y }, ...mark });
		}
	}
	return out.save();
}

// ── the terminal ──────────────────────────────────────────────────────────────────────────

async function askHidden(question) {
	if (!process.stdin.isTTY) throw new Error(`set ${ENV_KEY}, or run this in a terminal so it can ask for the key`);
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
	// Echo nothing while the key is typed.
	rl._writeToOutput = (s) => {
		if (s.includes(question)) process.stdout.write(s);
	};
	const answer = await new Promise((resolve) => rl.question(question, resolve));
	rl.close();
	process.stdout.write('\n');
	return answer.trim();
}

async function managementKey() {
	const fromEnv = process.env[ENV_KEY]?.trim();
	return fromEnv || askHidden('OpenRouter management key (not shown): ');
}

async function confirm(question) {
	if (!process.stdin.isTTY) return false;
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await new Promise((resolve) => rl.question(`${question} [y/N] `, resolve));
	rl.close();
	return /^y(es)?$/i.test(answer.trim());
}

const HELP = fs
	.readFileSync(fileURLToPath(import.meta.url), 'utf8')
	.split('\n')
	.filter((l) => /^ \* {3}node tools\/gift-cards|^ \*\s{20,}\[/.test(l))
	.map((l) => l.replace(/^ \* {3}/, ''))
	.join('\n');

async function make(opts) {
	const o = makeOptions(opts);
	// Everything that can fail before a key exists fails now: a key made before the out folder
	// turns out unwritable would be live with no record.
	fs.mkdirSync(o.out, { recursive: true });
	fs.accessSync(o.out, fs.constants.W_OK);
	const csvPath = path.join(o.out, 'cards.csv');
	const mgmtKey = await managementKey();
	console.log(`Making ${o.count} key${o.count > 1 ? 's' : ''} capped at $${o.cap}, named ${cardName(o.label, 1, o.count)}…${o.expiresAt ? `, expiring ${o.expiresAt}` : ''}.`);
	const made = await createKeys({ mgmtKey, ...o });
	const cards = made.cards.filter((c) => c.key);
	let error = made.error;
	try {
		for (const c of cards) {
			c.pin = o.pin ? newPin() : null;
			c.link = await encodeGiftLink(c.key, o.site, c.pin ? { pin: c.pin } : {});
		}
	} catch (e) {
		error = e;
	}
	// The record is written whatever happened above, so every key made can be found and revoked.
	fs.writeFileSync(csvPath, buildCsv(made.cards, { withLinks: o.withLinks && !error }));
	console.log(`Wrote ${path.relative(process.cwd(), csvPath)} (${made.cards.length} row${made.cards.length === 1 ? '' : 's'}${o.withLinks ? ', WITH working links' : ', no links'}).`);
	if (error) {
		console.error(`\nStopped after ${made.cards.length} of ${o.count}: ${error.message}`);
		console.error(`The keys already made are in the CSV. Delete them with: node tools/gift-cards.mjs revoke --label ${o.label}`);
	}
	if (error || cards.length === 0) return 1;
	if (o.count === 1) {
		console.log(`\nGift link (it spends up to $${o.cap} on your account; share it like cash):\n\n  ${cards[0].link}\n`);
		if (cards[0].pin) console.log(`PIN (send it apart from the link): ${cards[0].pin}\n`);
	}
	const deckPath = path.join(o.out, 'cards.md');
	fs.writeFileSync(deckPath, buildDeck(cards, { size: o.size, cap: o.cap }));
	if (!o.render) {
		console.log(`Wrote ${path.relative(process.cwd(), deckPath)}. Render it with: node lattice.js ${deckPath} ${path.join(o.out, 'cards.pdf')}`);
		return error ? 1 : 0;
	}
	const pdfPath = path.join(o.out, 'cards.pdf');
	const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), deckPath, pdfPath], { stdio: 'inherit' });
	if (r.status !== 0) {
		console.error(`Rendering failed; the deck is at ${deckPath}. Set CHROME_PATH if no browser was found.`);
		return 1;
	}
	const sheetPath = path.join(o.out, 'cards-sheet.pdf');
	fs.writeFileSync(sheetPath, await imposeSheet(fs.readFileSync(pdfPath), { size: o.size }));
	console.log(`Wrote ${path.relative(process.cwd(), pdfPath)} (one card per page) and ${path.relative(process.cwd(), sheetPath)} (${o.size === 'iso' ? 'A4' : 'Letter'}, ten to a sheet, print at 100%).`);
	console.log('cards.md and both PDFs hold working keys (the deck in plain text, the PDFs in their QR codes). Treat them like cash.');
	return error ? 1 : 0;
}

async function report(opts) {
	const keys = await listKeys({ mgmtKey: await managementKey(), label: opts.label });
	if (keys.length === 0) {
		console.log(opts.label ? `No keys named ${opts.label}-…` : 'No keys on this account.');
		return 0;
	}
	let spent = 0;
	let capped = 0;
	console.log(['name', 'spent', 'cap', 'disabled', 'expires'].join('\t'));
	for (const k of keys.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
		spent += Number(k.usage) || 0;
		capped += Number(k.limit) || 0;
		console.log([k.name, `$${(Number(k.usage) || 0).toFixed(4)}`, k.limit == null ? 'none' : `$${k.limit}`, k.disabled ? 'yes' : 'no', k.expires_at ?? ''].join('\t'));
	}
	console.log(`\n${keys.length} key${keys.length === 1 ? '' : 's'}: $${spent.toFixed(4)} spent of $${capped.toFixed(2)} capped.`);
	return 0;
}

async function revoke(opts) {
	if (!opts.label) throw new Error('revoke needs --label, so it cannot delete every key on the account by accident');
	const mgmtKey = await managementKey();
	const keys = await listKeys({ mgmtKey, label: opts.label });
	if (keys.length === 0) {
		console.log(`No keys named ${opts.label}-…`);
		return 0;
	}
	console.log(`${keys.length} key${keys.length === 1 ? '' : 's'} named ${opts.label}-…`);
	if (!opts.yes && !(await confirm('Delete them at OpenRouter? Their gift links stop working at once.'))) {
		console.log('Nothing deleted.');
		return 1;
	}
	const { deleted, failed } = await revokeKeys({ mgmtKey, keys });
	console.log(`Deleted ${deleted}.`);
	for (const f of failed) console.error(`Could not delete ${f.name}: ${f.error}`);
	return failed.length ? 1 : 0;
}

export async function main(argv = process.argv.slice(2)) {
	const { command, opts } = parseArgs(argv);
	if (command === 'help' || opts.help) {
		console.log(HELP);
		return 0;
	}
	if (command === 'make') return make(opts);
	if (command === 'report') return report(opts);
	if (command === 'revoke') return revoke(opts);
	throw new Error(`unknown command: ${command} (make, report or revoke)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	main().then(
		(code) => process.exit(code),
		(e) => {
			console.error(`gift-cards: ${e.message ?? e}`);
			process.exit(1);
		},
	);
}
