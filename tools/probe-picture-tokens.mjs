#!/usr/bin/env node
/**
 * How many prompt tokens does ONE picture cost, per vision model on OpenRouter?
 *
 * The Studio chat's budget gate must charge a picture before the round is sent, and the answer
 * differs by 40x across the catalog (a 512 px picture is 212 tokens on GPT-5 mini, 1,290 on
 * Gemini 2.5 and 8,500 on GPT-4o mini). This tool measures it: for each vision model it sends the
 * same short prompt three times (no picture, a 512 px picture, a 1568 px picture) and records the
 * difference in `usage.prompt_tokens`. `docs/src/components/studio/picture-tokens.data.json` is its
 * output, and `docs/src/components/studio/picture-tokens.ts` reads it.
 *
 * 512 px is the thumbnail the agent's `view_asset` sends; 1568 px is `VISION_EDGE`, the copy of an
 * attached photo. Token counts follow pixel dimensions, not the encoding, so the pictures here are
 * generated PNGs (the repo has no JPEG encoder); `--limit 3` re-checks this against the live API.
 *
 * Usage:
 *   OPEN_ROUTER_KEY=… OPENROUTER_ALLOW_SPEND=1 node tools/probe-picture-tokens.mjs [--limit N] [--model ID] [--cap USD] [--out rows.json]
 *       Spends real credits on OUR key: one tiny call plus two picture calls per model. The whole
 *       catalog (~210 models) cost $1.41 on 2026-10-13, so the default --cap of 1.5 leaves little room: raise it as the catalog grows. Without OPENROUTER_ALLOW_SPEND=1 it prints
 *       the planned call count and exits. Validate with --limit 3 first. --cap stops the run (default 1.5).
 *   ... --write [--date YYYY-MM-DD] [--allow-lost]
 *       Rewrite picture-tokens.data.json from this run. Refused on a partial run (--model, --limit, a --cap stop), and when it
 *       would drop a model the current table lists unless --allow-lost. Rows are saved first (--out, or a temp file).
 *   node tools/probe-picture-tokens.mjs --from rows.json [--date YYYY-MM-DD] [--allow-lost]
 *       No spend: rebuild the data file from a saved probe (the rows file of an earlier run).
 * The key is read only from the environment and never printed. (HARD RULE #24, workflow.md §OpenRouter budget.)
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_FILE = path.join(ROOT, 'docs/src/components/studio/picture-tokens.data.json');
/** What the gate charges a model the table does not list: a 512 px thumbnail, and a 1568 px attachment. Each sits at or
 *  above the 90th percentile of the models measured, after the shape factor below. */
export const DEFAULTS = { thumb: 2000, photo: 3600 };
/** The pictures here are 3:2. A square one costs up to 1.51x as much on a model that prices by area (Claude, GPT-5,
 *  Qwen, Mistral, Kimi, GLM: 1.45 to 1.51 at both sizes, measured on 18 models spanning 14 vendors on 2026-10-13); a
 *  portrait one costs the same as a landscape one; the tiled models land from 0.69x to 1.43x. A photo and a thumbnail keep
 *  their own shape, so every measured figure is multiplied by this before it is listed. */
export const SHAPE = 1.55;

/** Round up to the next 50 so a table entry never sits just under what was measured. */
const up50 = (n) => Math.ceil(n / 50) * 50;
const quantile = (xs, p) => {
	const a = [...xs].sort((x, y) => x - y);
	return a[Math.min(a.length - 1, Math.floor(p * a.length))];
};

/**
 * Pure: probe rows `{ id, t512, t1568 }` (token cost of one picture, or an `ERR …` string) into the
 * data file. Every reading is multiplied by `shape` (see SHAPE). A model is listed only when that costs MORE than a
 * default at either size, because the defaults already cover the rest. A negative or non-numeric reading is unmeasured, not an exception.
 */
/**
 * Pure: the models the current data file lists as exceptions that `rows` no longer measures (an error, a timeout, a
 * missing row). A rerun that loses one would send it back to the default, so `--write` refuses unless told to.
 */
export function lostExceptions(previous, rows) {
	const measured = new Set(rows.filter((r) => Number.isFinite(r.t512) && Number.isFinite(r.t1568) && r.t512 > 0 && r.t1568 > 0).map((r) => r.id));
	return Object.keys(previous?.exceptions ?? {}).filter((id) => !measured.has(id));
}

export function summarize(rows, measured, defaults = DEFAULTS, shape = SHAPE) {
	const ok = rows.filter((r) => Number.isFinite(r.t512) && Number.isFinite(r.t1568) && r.t512 > 0 && r.t1568 > 0);
	const exceptions = {};
	for (const r of ok.sort((a, b) => a.id.localeCompare(b.id))) {
		const thumb = r.t512 * shape;
		const photo = r.t1568 * shape;
		if (thumb > defaults.thumb || photo > defaults.photo) exceptions[r.id] = [up50(Math.max(thumb, defaults.thumb)), up50(Math.max(photo, defaults.photo))];
	}
	return {
		measured,
		models: ok.length,
		unmeasured: rows.length - ok.length,
		defaults,
		shape,
		p50: ok.length ? [quantile(ok.map((r) => r.t512), 0.5), quantile(ok.map((r) => r.t1568), 0.5)] : [0, 0],
		p90: ok.length ? [quantile(ok.map((r) => r.t512), 0.9), quantile(ok.map((r) => r.t1568), 0.9)] : [0, 0],
		max: ok.length ? [Math.max(...ok.map((r) => r.t512)), Math.max(...ok.map((r) => r.t1568))] : [0, 0],
		exceptions,
	};
}

/** A deterministic w x h PNG, base64: bands plus seeded dots, so a vision model has something to tokenize. */
export function png(w, h) {
	const { PNG } = require('pngjs');
	const img = new PNG({ width: w, height: h });
	let s = 12345;
	const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (w * y + x) << 2;
			const left = x < w / 2;
			img.data[i] = left ? 200 : 40;
			img.data[i + 1] = left ? 40 : 64;
			img.data[i + 2] = left ? 40 : 208;
			img.data[i + 3] = 255;
		}
	}
	for (let k = 0; k < Math.floor((w * h) / 400); k++) {
		const cx = Math.floor(rnd() * w);
		const cy = Math.floor(rnd() * h);
		const r = 2 + Math.floor(rnd() * 8);
		const c = [Math.floor(rnd() * 256), Math.floor(rnd() * 256), Math.floor(rnd() * 256)];
		for (let y = Math.max(0, cy - r); y < Math.min(h, cy + r); y++) {
			for (let x = Math.max(0, cx - r); x < Math.min(w, cx + r); x++) {
				const i = (w * y + x) << 2;
				img.data[i] = c[0];
				img.data[i + 1] = c[1];
				img.data[i + 2] = c[2];
			}
		}
	}
	return PNG.sync.write(img).toString('base64');
}

async function probe(args) {
	const key = process.env.OPEN_ROUTER_KEY;
	if (!key) {
		console.error('probe-picture-tokens: OPEN_ROUTER_KEY is not set — nothing to do.');
		process.exit(2);
	}
	const flag = (n) => {
		const i = args.indexOf(n);
		return i >= 0 ? args[i + 1] : null;
	};
	const cap = Number(flag('--cap') ?? 1.5);
	const limit = Number(flag('--limit') ?? Infinity);
	const only = flag('--model');
	const cat = (await (await fetch('https://openrouter.ai/api/v1/models')).json()).data;
	let models = cat.filter((m) => (m.architecture?.input_modalities || []).includes('image') && !m.id.endsWith(':batch') && !m.id.startsWith('~') && Number(m.pricing?.prompt) >= 0).map((m) => m.id);
	if (only) models = models.filter((id) => id === only);
	models = models.slice(0, limit);
	console.log(`probe-picture-tokens: ${models.length} model(s), ${models.length * 3} calls, at most $${cap} (typically ~$0.007 a model).`);
	if (process.env.OPENROUTER_ALLOW_SPEND !== '1') {
		console.log('Set OPENROUTER_ALLOW_SPEND=1 to spend. Nothing was sent.');
		process.exit(0);
	}
	const pics = { 512: png(512, 341), 1568: png(1568, 1045) };
	const text = 'Reply with one word. The attached picture is labeled asset:shop-floor.';
	let total = 0;
	const call = async (model, b64) => {
		const content = b64 ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }] : text;
		for (let a = 0; a < 2; a++) {
			try {
				const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content }], usage: { include: true } }), signal: AbortSignal.timeout(60000) });
				const j = await res.json();
				if (j.usage) {
					total += j.usage.cost || 0;
					return j.usage.prompt_tokens;
				}
				if (a === 1) return `ERR ${res.status}`;
			} catch (e) {
				if (a === 1) return `ERR ${e.name}`;
			}
		}
	};
	const rows = [];
	let next = 0;
	const complete = () => !only && !Number.isFinite(limit) && rows.length === models.length;
	const worker = async () => {
		while (next < models.length && total < cap) {
			const id = models[next++];
			const none = await call(id, null);
			const a = await call(id, pics[512]);
			const b = await call(id, pics[1568]);
			// No baseline means no difference: a picture's own count would read as a (wildly inflated) per-picture cost.
			const d = (x) => (Number.isFinite(none) ? (Number.isFinite(x) ? x - none : x) : 'ERR no-baseline');
			rows.push({ id, none, t512: d(a), t1568: d(b) });
		}
	};
	await Promise.all(Array.from({ length: 6 }, worker));
	console.log(`probe-picture-tokens: ${rows.length}/${models.length} models, cost $${total.toFixed(4)}`);
	// Rows are always saved: they cost real money, and a refused --write must not throw them away.
	const out = flag('--out') ?? path.join(os.tmpdir(), `picture-tokens-rows-${Date.now()}.json`);
	fs.writeFileSync(out, JSON.stringify(rows, null, 1));
	console.log(`probe-picture-tokens: rows saved to ${out} (rebuild the table from them with --from ${out})`);
	if (args.includes('--write') && !complete()) {
		console.error('probe-picture-tokens: refusing --write on a partial run (--model, --limit, the --cap stop, or a model not reached). A partial table drops exceptions and sends their models back to the default. Rows were saved to --out if you gave one; rerun the whole catalog.');
		process.exit(1);
	}
	for (const r of rows.slice(0, 5)) console.log(JSON.stringify(r));
	return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2);
	const from = args.indexOf('--from');
	const rows = from >= 0 ? JSON.parse(fs.readFileSync(args[from + 1], 'utf8')) : await probe(args);
	if (from >= 0 || args.includes('--write')) {
		if (from >= 0 && rows.length < 150) {
			console.error(`probe-picture-tokens: ${args[from + 1]} has ${rows.length} rows — too few for a whole catalog. Refusing to write a table from a partial probe.`);
			process.exit(1);
		}
		const lost = fs.existsSync(DATA_FILE) ? lostExceptions(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')), rows) : [];
		if (lost.length && !args.includes('--allow-lost')) {
			console.error(`probe-picture-tokens: this run did not measure ${lost.length} model(s) the table lists as exceptions (${lost.join(', ')}). Writing it would send them back to the default. Rerun, or pass --allow-lost if they are gone from the catalog.`);
			process.exit(1);
		}
		const measuredAt = args.includes('--date') ? args[args.indexOf('--date') + 1] : new Date().toISOString().slice(0, 10);
		const data = summarize(rows, measuredAt);
		fs.writeFileSync(DATA_FILE, `${JSON.stringify(data, null, '\t')}\n`);
		console.log(`wrote ${path.relative(ROOT, DATA_FILE)}: ${data.models} measured, ${Object.keys(data.exceptions).length} exceptions, ${data.unmeasured} unmeasured`);
	} else {
		console.log('(pass --write to rewrite the data file from this run)');
	}
}
