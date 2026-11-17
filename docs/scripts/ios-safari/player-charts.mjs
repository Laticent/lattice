/**
 * The player chart probe (PROBE=player-charts, #3259): chart detail cards in an EXPORTED HTML player, opened and closed by
 * real touches in Mobile Safari. docs/e2e/player-chart-reveal.spec.ts proves the same behavior in Playwright's WebKit,
 * which is not iOS Safari; this is the only check that reaches Safari itself.
 *
 * One sequence, two drivers: run.mjs taps through safaridriver in an iOS Simulator, and probe.selftest.mjs taps through
 * Playwright's touchscreen, so the sequence is proven before a macOS job runs it. A driver hands in three functions:
 *   go(url)       load a page;
 *   call(expr)    evaluate an expression over player-charts-probe.js in the page, and resolve to its value;
 *   tap(x, y)     a real touch at a CSS point of the viewport (no hold: a hold reads as a long press).
 * `players` names the two exported files: { deck, hostile }.
 *
 * The checks, each beside a control:
 *   - a tap on a funnel band pins its card (the touch log shows the tap landed on that band, so a failure names its point);
 *   - the card is in the top layer, inside the visible viewport, never under the finger, and takes touches;
 *   - a tap never turns the slide;
 *   - a second tap on the band closes the card, and a tap elsewhere closes it again after it reopens;
 *   - in a deck whose detail carries author styles, nothing the author styled covers the player.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PLAYER_CHARTS_SOURCE = fs.readFileSync(path.join(here, 'player-charts-probe.js'), 'utf8');
/** The decks the probe exports to players (paths from the repo root): the test deck and the checker's hostile deck. */
export const PLAYER_CHARTS_DECKS = { deck: 'examples/chart-detail-reveal.md', hostile: 'docs/scripts/ios-safari/player-charts-hostile.md' };

const where = (t) => (t ? `landed at ${t.x},${t.y} on ${t.mark === null ? `${t.at}, no mark` : `mark ${t.mark}`}` : 'no touch reached the page');

export async function runPlayerCharts({ go, call, tap, players }) {
	const steps = [];
	const step = (name, pass, detail = '') => steps.push({ name, pass: !!pass, detail: String(detail) });
	let page = {};
	try {
		await go(players.deck);
		page = await call('latticePlayerToFunnel()');
		step('the exported player reaches its funnel slide', page.ok, page.error || `slide ${page.index + 1}`);
		if (!page.ok) return done(steps, page);

		// OPEN: a tap on band 0. The CONTROL is the touch log: it says where the tap landed, so "no card" and "the tap
		// missed" read differently.
		const band = await call('latticePlayerBandPoint(0)');
		step('band 0 holds still under its tap point', band.hit, `${band.x},${band.y}, still ${band.still} frames, under ${band.under}`);
		if (!band.hit) return done(steps, page);
		let ms = await tap(band.x, band.y);
		let card = await call(`latticePlayerCard(true, ${JSON.stringify(band)})`);
		step('a tap on a band pins its card', card.open && card.title === 'Discovery', `${card.open ? `"${card.title}"` : 'no card'}; ${where(card.touch)}, gesture ${ms} ms`);
		if (card.open) {
			step('the card is in the top layer', card.popover);
			step('the card sits inside the visible viewport', card.inView, `card ${JSON.stringify(card.box)} in ${JSON.stringify(card.viewport)}`);
			step('the card is never under the finger', !card.underFinger, `finger ${band.x},${band.y}, card ${JSON.stringify(card.box)}`);
			step('a pinned card takes touches, so its body can scroll', card.pointerEvents !== 'none', `pointer-events: ${card.pointerEvents}`);
		}
		step('a tap on a band never turns the slide', card.index === page.index, `slide ${page.index + 1} to ${card.index + 1}`);

		// CLOSE by tapping the same band again.
		const again = await call('latticePlayerBandPoint(0)');
		ms = await tap(again.x, again.y);
		card = await call(`latticePlayerCard(false, ${JSON.stringify(again)})`);
		step('a second tap on the band closes the card', !card.open, `${where(card.touch)}, gesture ${ms} ms`);

		// REOPEN, then CLOSE by tapping elsewhere on the slide.
		const third = await call('latticePlayerBandPoint(0)');
		await tap(third.x, third.y);
		const reopened = await call(`latticePlayerCard(true, ${JSON.stringify(third)})`);
		step('a third tap opens it again', reopened.open, where(reopened.touch));
		const empty = await call('latticePlayerEmptyPoint()');
		ms = await tap(empty.x, empty.y);
		card = await call(`latticePlayerCard(false, ${JSON.stringify(empty)})`);
		step('a tap elsewhere on the slide closes it', reopened.open && !card.open, `heading at ${empty.x},${empty.y}; ${where(card.touch)}, gesture ${ms} ms`);
		step('no tap turned the slide', card.index === page.index, `slide ${page.index + 1} to ${card.index + 1}`);

		// CONTAINMENT (HARD RULE #22): the hostile deck's detail styles must stay inside the card.
		await go(players.hostile);
		const hostile = await call('latticePlayerToFunnel()');
		const hb = hostile.ok ? await call('latticePlayerBandPoint(0)') : { hit: false };
		if (hb.hit) await tap(hb.x, hb.y);
		const hcard = hb.hit ? await call(`latticePlayerCard(true, ${JSON.stringify(hb)})`) : { open: false };
		step('the hostile deck: a tap opens the card with the author-styled detail', hcard.open, hostile.error || where(hcard.touch));
		if (hcard.open) {
			const h = await call('latticePlayerHostile()');
			step('nothing the author styled covers the player', !h.hits.some((x) => x === 'metax' || x === 'bodyx'), `corners and edges: ${h.hits.join(', ')}`);
			step('the author-styled link is drawn inside the card, unstyled', !!h.link && h.link.style === null && h.link.position !== 'fixed', h.link ? `style ${h.link.style}, position ${h.link.position}` : 'no link in the footer');
		}
	} catch (e) {
		return done(steps, page, String(e.message || e));
	}
	return done(steps, page);
}

function done(steps, page, error) {
	const failed = steps.filter((s) => !s.pass).map((s) => s.name);
	return { ok: !error && steps.length > 0 && failed.length === 0, error: error || failed.join('; ') || undefined, ua: page.ua, width: page.width, steps };
}
