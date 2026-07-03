// The Architect — deterministic live review (Phase 1, Slice 5).
//
// The Architect is tooling-first (proposal §4): its findings come from the
// SAME pure lint-core the Node CLI runs (lib/authoring/lint-core.js), not from a
// model — so they can't hallucinate a component or a fix. Only the name/modifier
// vocabulary is data, computed at docs-build time and handed in. This is the
// zero-model floor: it works on every browser, offline, with nothing downloaded.
// Generation tiers + guided onboarding (the conversational half of Slice 5 / the
// Phase 2 model ladder) layer on top of this.
//
// Voiced as "the Architect" per the naming decision.

import Fuse from 'fuse.js';
import { applyEdit, diffLines, sliceSlide } from '../components/studio/ai/architect-edits.js';
import { requestSlideFix } from '../components/studio/ai/architect-fix.js';
import { orSupportsCache } from '../components/studio/ai/architect-model.js';
import { cosineRank } from '../components/studio/ai/architect-retrieval.js';
// The pure authoring cores (lib/authoring/*) are CommonJS; consume them through
// the esbuild bundle so they load in `astro dev` too (a direct /@fs import of a
// source CJS file has no `default` export in dev — see tools/build-authoring-core.js).
import { lintCore, reviewCore, scorecard } from './authoring-core.generated.js';
import { isCapableTier } from './drawing-board-chat.js';
import { budgetStatus, readBudgetCap, readBudgetMode, readCachingEnabled, readSpend, recordSpend } from './drawing-board-settings.js';
import { buildVocabSets, chunkStartLines } from './editor-diagnostics.js';
// The pure exemplar tier-filter (lib/exemplars/tier-filter.js), bundled for the
// browser so the Drafting picker can trim a worked deck to the chosen length.
import { filterToTier, tierCounts } from './exemplar-core.generated.js';

// `chunkStartLines` (the 1-based slide→line map shared with the editor's inline
// validation, so the panel's "Reveal" and the editor's underline land on the same
// line) lives in ./editor-diagnostics.js — imported above.
const SEV_RANK = { error: 0, warning: 1, suggestion: 2 };
function hasContent(src) {
	// At least one classed slide (after front matter) or some real prose.
	return /<!--\s*_class:/.test(src) && src.split(/^---$/m).filter((s) => s.trim()).length > 1;
}

export function createArchitect({ vocab, catalog, mount, reveal, applyFix, model }) {
	// The cost/quality gate for the per-finding model "Fix" — the SAME discipline as
	// the chat and Practice: only a strong tier is offered (a tiny WASM model rambles
	// on a slide rewrite), cloud calls respect the session budget cap, the prompt is
	// cached when the provider supports it, and spend lands in the session tally.
	// Local tiers are free → no budget gate. Null when no model was wired (the
	// deterministic floor: How-to-fix + the exact mechanical Apply fix still stand).
	const fixGate = model
		? {
				available: () => isCapableTier(model.availability().generation),
				allow: () => {
					const a = model.availability();
					if (a.generation !== 'openrouter') return true;
					return !budgetStatus({ sessionSpend: readSpend().session, cap: readBudgetCap(), mode: readBudgetMode() }).blocked;
				},
				cache: () => {
					const a = model.availability();
					return a.generation === 'openrouter' && readCachingEnabled() && orSupportsCache(model.openRouterModel?.() || '');
				},
				onUsage: (u) => recordSpend(u?.cost, u?.total_tokens ?? ((u?.prompt_tokens || 0) + (u?.completion_tokens || 0))),
			}
		: null;
	let fixAbort = null; // aborts an in-flight Fix when the deck changes (stale + wasteful)
	// Rehydrate the build-time lint vocabulary into the Sets lint-core expects (names,
	// modifiers, map regions, finish/split registers, the capacity contract). The
	// SAME builder feeds the editor's inline validation, so the panel and the inline
	// underlines judge a `_class`/region/capacity identically. See editor-diagnostics.js.
	const vocabSets = buildVocabSets(vocab);
	const bucketByName = new Map((catalog || []).map((c) => [c.name, c.bucket]));
	const bucketOf = (n) => bucketByName.get(n) || null;
	// Per-element prose-density budget for the layouts that declare one (the
	// `density` manifest block, carried through components.json into the catalog).
	// Feeds review-core's density suggestion — see 2026-06-30-prose-density-budget.md.
	const densityByName = new Map((catalog || []).filter((c) => c.density).map((c) => [c.name, c.density]));
	const densityOf = (n) => densityByName.get(n) || null;
	let lastSource = '';
	let timer = null;

	function cleanState() {
		const d = document.createElement('div');
		d.className = 'db-review-clean';
		d.innerHTML = '<span class="ico ico-check" aria-hidden="true"></span> Clean — every slide follows the authoring contract.';
		return d;
	}

	function card(f, starts) {
		const wrap = document.createElement('div');
		wrap.className = 'db-finding sev-' + f.severity;

		const head = document.createElement('div');
		head.className = 'db-finding-head';
		const dot = document.createElement('span');
		dot.className = 'db-finding-dot';
		dot.setAttribute('aria-hidden', 'true');
		const msg = document.createElement('span');
		msg.className = 'db-finding-msg';
		msg.textContent = f.message;
		head.append(dot, msg);

		const meta = document.createElement('div');
		meta.className = 'db-finding-meta';
		const tag = document.createElement('span');
		tag.className = 'db-finding-rule';
		tag.textContent = f.rule + (f.slide ? ' · slide ' + f.slide : '');
		meta.appendChild(tag);

		if (f.line) {
			const code = document.createElement('code');
			code.className = 'db-finding-line';
			code.textContent = f.line.length > 80 ? f.line.slice(0, 79) + '…' : f.line;
			wrap.appendChild(head);
			wrap.appendChild(code);
		} else {
			wrap.appendChild(head);
		}
		wrap.appendChild(meta);

		const actions = document.createElement('div');
		actions.className = 'db-finding-actions';

		// One-click fix for the mechanical footguns (the bold card-style inline
		// shape). Computed by the shared lint-core, applied through the editor so
		// it re-renders + re-lints. Other rules need author content -> guidance only.
		if (f.autofixable && applyFix) {
			const applyBtn = document.createElement('button');
			applyBtn.type = 'button';
			applyBtn.className = 'db-finding-btn db-finding-apply';
			applyBtn.textContent = 'Apply fix';
			applyBtn.addEventListener('click', () => {
				const out = lintCore.applyFix(lastSource, f);
				if (out != null) applyFix(out);
			});
			actions.appendChild(applyBtn);
		}

		const revealBtn = document.createElement('button');
		revealBtn.type = 'button';
		revealBtn.className = 'db-finding-btn';
		revealBtn.textContent = 'Reveal';
		revealBtn.addEventListener('click', () => {
			if (reveal) reveal(starts[f.slide] || 1);
		});
		const fixBtn = document.createElement('button');
		fixBtn.type = 'button';
		fixBtn.className = 'db-finding-btn';
		fixBtn.textContent = 'How to fix';
		const fix = document.createElement('pre');
		fix.className = 'db-finding-fix';
		fix.hidden = true;
		fix.textContent = f.fix || '';
		fixBtn.addEventListener('click', () => {
			fix.hidden = !fix.hidden;
			fixBtn.textContent = fix.hidden ? 'How to fix' : 'Hide';
		});
		actions.append(revealBtn, fixBtn);

		// AI Fix — the model rewrites the flagged slide; the author reviews a diff and
		// clicks Apply (the deterministic engine re-scores). Only offered for JUDGEMENT
		// findings on a real slide and only when a strong tier is connected: the
		// mechanical footguns above already get the exact, free "Apply fix", and a
		// deck-level finding (slide 0) has no single slide to rewrite. The How-to-fix
		// guidance stays regardless, so the floor never loses a capability.
		if (fixGate && applyFix && f.slide >= 1 && !f.autofixable && fixGate.available()) {
			const aiBtn = document.createElement('button');
			aiBtn.type = 'button';
			aiBtn.className = 'db-finding-btn db-finding-fixai';
			aiBtn.innerHTML = '<span class="ico ico-wand" aria-hidden="true"></span> Fix';
			aiBtn.addEventListener('click', () => runAiFix(f, aiBtn, wrap));
			actions.append(aiBtn);
		}

		wrap.appendChild(actions);
		if (f.fix) wrap.appendChild(fix);
		return wrap;
	}

	// Clear any prior Fix diff/note on a finding before a new attempt (or on Discard).
	function clearFixUI(wrap) {
		for (const n of wrap.querySelectorAll('.db-edit-card, .db-finding-note')) n.remove();
	}
	function noteEl(text) {
		const p = document.createElement('p');
		p.className = 'db-finding-note';
		p.setAttribute('role', 'status'); // announce the outcome to assistive tech
		p.textContent = text;
		return p;
	}

	// The reviewable diff card for a model fix — reuses the Converse edit-card chrome
	// (.db-edit-*) so a fix looks identical wherever it's offered. No undo/persist
	// state machine here: it's a one-shot (Apply re-renders the panel and clears it;
	// Discard removes it). Apply splices against the CURRENT source via applyEdit.
	function fixCardEl(finding, { edit, before, after }) {
		const card = document.createElement('div');
		card.className = 'db-edit-card';
		card.dataset.state = 'open';
		const head = document.createElement('div');
		head.className = 'db-edit-head';
		head.append(
			Object.assign(document.createElement('span'), { className: 'db-edit-icon ico ico-wand' }),
			Object.assign(document.createElement('span'), { className: 'db-edit-title', textContent: `Rewrite slide ${finding.slide}` }),
		);
		card.appendChild(head);
		const body = document.createElement('div');
		body.className = 'db-edit-body';
		const diff = document.createElement('div');
		diff.className = 'db-edit-diff';
		for (const row of diffLines(before, after)) {
			const sign = row.type === 'add' ? '+ ' : row.type === 'del' ? '− ' : '  ';
			diff.appendChild(Object.assign(document.createElement('div'), { className: 'db-diff-' + row.type, textContent: sign + row.text }));
		}
		body.appendChild(diff);
		const acts = document.createElement('div');
		acts.className = 'db-edit-actions';
		const apply = Object.assign(document.createElement('button'), { type: 'button', className: 'db-btn db-btn-primary', textContent: 'Apply' });
		const discard = Object.assign(document.createElement('button'), { type: 'button', className: 'db-btn', textContent: 'Discard' });
		apply.addEventListener('click', () => {
			// Guard the race where the deck changed between proposing this fix and the
			// click (before the 250ms re-render wiped the card): if the target slide no
			// longer matches what we diffed against, applying would splice onto shifted
			// content. Refuse and ask for a re-run rather than mangle the deck.
			if (sliceSlide(lastSource, finding.slide).trim() !== before.trim()) {
				card.replaceWith(noteEl('The slide changed since this fix was proposed — re-run Fix to refresh it.'));
				return;
			}
			const out = applyEdit(lastSource, edit);
			if (out != null) applyFix(out); // setValue → re-render replaces the panel
		});
		discard.addEventListener('click', () => card.remove());
		acts.append(apply, discard);
		body.appendChild(acts);
		card.appendChild(body);
		return card;
	}

	// Run a model fix for one finding: gate on budget, show a busy state, request the
	// rewrite, then render the diff (or an honest note). Aborts any prior in-flight
	// fix (and run() aborts this one) so a stale, already-paid fix never lands.
	async function runAiFix(finding, btn, wrap) {
		if (btn.dataset.busy === '1') return;
		clearFixUI(wrap);
		if (!fixGate.allow()) {
			wrap.appendChild(noteEl('You’ve hit your session budget — raise or clear the cap in Settings to use Fix.'));
			return;
		}
		const label = btn.innerHTML;
		btn.dataset.busy = '1';
		btn.disabled = true;
		btn.setAttribute('aria-busy', 'true');
		btn.innerHTML = '<span class="ico ico-loader" aria-hidden="true"></span> Fixing…';
		if (fixAbort) fixAbort.abort();
		const ctrl = new AbortController();
		fixAbort = ctrl;
		let result = null;
		let failed = false;
		try {
			result = await requestSlideFix({ model, gate: fixGate, source: lastSource, finding, catalog, signal: ctrl.signal });
		} catch (_e) {
			failed = true;
		} finally {
			if (fixAbort === ctrl) fixAbort = null;
		}
		if (!btn.isConnected) return; // panel re-rendered mid-flight — the button is gone
		// Restore the button on EVERY outcome (success, failure, or abort-by-another
		// fix) so it never sticks on "Fixing…". An aborted run was superseded, so bail
		// before rendering its now-stale note/card.
		btn.dataset.busy = '';
		btn.disabled = false;
		btn.removeAttribute('aria-busy');
		btn.innerHTML = label;
		if (ctrl.signal.aborted) return;
		// One honest note for "no usable fix": a transport error and an empty/no-op
		// reply are indistinguishable here, because the model adapter floors on error
		// (returns templated text, never an edit block) rather than throwing — so we
		// don't claim to know which happened. The deterministic guidance still stands.
		if (failed || !result) {
			wrap.appendChild(noteEl('No fix came back — the guidance above still applies. Try Converse to talk it through.'));
			return;
		}
		wrap.appendChild(fixCardEl(finding, result));
	}

	// Read the scorecard aloud via the browser's built-in TTS (no model, no dep).
	function speakCard(sc) {
		if (!('speechSynthesis' in window)) return;
		const synth = window.speechSynthesis;
		if (synth.speaking) { synth.cancel(); return; } // toggle off
		let text = `Your deck scores ${sc.band}, ${sc.overall} out of 100. `;
		const issues = sc.categories.filter((c) => c.notes.length);
		if (!issues.length) text += 'Every category is strong — nicely done.';
		else for (const c of issues) text += `${c.label}, ${c.score}: ${c.notes.join(', ')}. `;
		const u = new SpeechSynthesisUtterance(text);
		u.rate = 1.02;
		synth.speak(u);
	}

	function scorecardEl(sc) {
		const wrap = document.createElement('div');
		wrap.className = 'db-scorecard';
		const head = document.createElement('div');
		head.className = 'db-sc-head';
		const grade = document.createElement('span');
		grade.className = 'db-sc-grade q-' + (sc.overall >= 80 ? 'good' : sc.overall >= 60 ? 'ok' : 'bad');
		grade.textContent = sc.band;
		const overall = document.createElement('span');
		overall.className = 'db-sc-overall';
		overall.append(String(sc.overall), Object.assign(document.createElement('small'), { textContent: '/100' }));
		const label = document.createElement('span');
		label.className = 'db-sc-label';
		label.textContent = 'the Architect’s scorecard';
		const speak = document.createElement('button');
		speak.type = 'button';
		speak.className = 'db-sc-speak';
		speak.setAttribute('aria-label', 'Read the assessment aloud');
		speak.title = 'Read aloud';
		// glyph drawn by CSS: .db-sc-speak::before (Lucide volume-2 mask)
		if (!('speechSynthesis' in window)) speak.hidden = true;
		speak.addEventListener('click', () => speakCard(sc));
		head.append(grade, overall, label, speak);
		wrap.appendChild(head);
		const cats = document.createElement('div');
		cats.className = 'db-sc-cats';
		for (const c of sc.categories) {
			const row = document.createElement('div');
			row.className = 'db-sc-cat';
			if (c.notes.length) row.title = c.notes.join(' · ');
			const lbl = Object.assign(document.createElement('span'), { className: 'db-sc-cat-label', textContent: c.label });
			const bar = document.createElement('span');
			bar.className = 'db-sc-bar';
			const fill = document.createElement('i');
			fill.className = 'q-' + (c.score >= 80 ? 'good' : c.score >= 60 ? 'ok' : 'bad');
			fill.style.width = c.score + '%';
			bar.appendChild(fill);
			const score = Object.assign(document.createElement('span'), { className: 'db-sc-cat-score', textContent: String(c.score) });
			row.append(lbl, bar, score);
			cats.appendChild(row);
		}
		wrap.appendChild(cats);
		return wrap;
	}

	function render(sc, findings) {
		if (!mount) return;
		mount.innerHTML = '';
		if (!sc) {
			const d = document.createElement('div');
			d.className = 'db-review-clean';
			d.textContent = 'Start a deck and I’ll score it and flag anything off.';
			mount.appendChild(d);
			return;
		}
		mount.appendChild(scorecardEl(sc));
		if (!findings.length) {
			mount.appendChild(cleanState());
			return;
		}
		findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.slide - b.slide);
		const errs = findings.filter((f) => f.severity === 'error').length;
		const head = document.createElement('div');
		head.className = 'db-review-head';
		const n = findings.length;
		const label = document.createElement('span');
		label.textContent =
			'the Architect flags ' + n + ' item' + (n === 1 ? '' : 's') + (errs ? ' · ' + errs + ' to fix' : '');
		head.appendChild(label);
		// Fix all — apply every mechanically-fixable finding in one undoable pass
		// (the SAME lint-core applyAllFixes the CLI uses). Shown only when there's
		// something to fix; the per-finding "Apply fix" buttons remain for one-offs.
		const fixableCount = findings.filter((f) => f.autofixable).length;
		if (fixableCount && applyFix) {
			const fixAll = document.createElement('button');
			fixAll.type = 'button';
			fixAll.className = 'db-finding-btn db-finding-apply db-review-fixall';
			fixAll.textContent = `Fix all ${fixableCount}`;
			fixAll.addEventListener('click', () => {
				const out = lintCore.applyAllFixes(lastSource, vocabSets);
				if (out != null && out !== lastSource) applyFix(out);
			});
			head.appendChild(fixAll);
		}
		mount.appendChild(head);
		const starts = chunkStartLines(lastSource);
		for (const f of findings) mount.appendChild(card(f, starts));
	}

	// The latest deterministic assessment, exposed so the chat can ground the model
	// in the SAME findings the panel shows (the model phrases; it never re-derives).
	let assessment = { source: '', findings: [], scorecard: null };

	function run() {
		// A deck change invalidates any in-flight fix (its slide may have moved); abort
		// it so a stale, already-billed rewrite can't land on the wrong slide.
		if (fixAbort) { fixAbort.abort(); fixAbort = null; }
		try {
			const has = hasContent(lastSource);
			// Let the onboarding collapse its doors when a real deck is being worked on.
			window.dispatchEvent(new CustomEvent('db-deck-content', { detail: has }));
			if (!has) { assessment = { source: lastSource, findings: [], scorecard: null }; render(null, []); return; }
			const lint = lintCore.lintTextWith(lastSource, vocabSets);
			const review = reviewCore.reviewText(lastSource, { bucketOf, densityOf });
			const sc = scorecard.scoreDeck({ source: lastSource, lintFindings: lint, reviewFindings: review });
			assessment = { source: lastSource, findings: [...lint, ...review], scorecard: sc };
			render(sc, [...lint, ...review]);
		} catch (_e) {
			// Never let a review error break the editor.
			if (mount) mount.innerHTML = '';
		}
	}

	function update(source) {
		lastSource = source || '';
		clearTimeout(timer);
		timer = setTimeout(run, 250);
	}

	// Teach the linter the author's saved local components (component bridge), so
	// a valid `_class: <local>` isn't flagged "unknown class". The names join the
	// live vocab Set; the caller re-runs update() to re-lint. See
	// engineering/decisions/2026-06-12-workbench-component-bridge.md.
	function addNames(names) {
		for (const n of names || []) if (n) vocabSets.names.add(n);
	}

	// Connecting / disconnecting / swapping a model changes which findings can
	// offer "Fix" (it's gated on a capable tier). The gate is read when a finding
	// renders, so without this a mid-session connect wouldn't surface Fix until the
	// next deck edit. Re-render on the model-change event so the buttons track the
	// live tier immediately. (architect-model.js dispatches db-model-changed.)
	if (fixGate && typeof window !== 'undefined') {
		// Route through update() (not run() directly) so rapid tier toggles inherit
		// the 250ms debounce instead of forcing a synchronous re-lint each time.
		window.addEventListener('db-model-changed', () => update(lastSource));
	}

	return { update, addNames, getAssessment: () => assessment };
}

// ── Onboarding: two modes — Drafting & Freehand (deterministic, zero-model) ───
// Drafting: pick a presentation archetype (searchable, grouped by setting) → the
// Architect scaffolds a framework-grounded spine. Freehand: a blank canvas; the
// live review runs and (Phase 2) conversational help arrives on request. Spec +
// the spine table: engineering/decisions/2026-06-08-architect-modes.md (App. A).

// Each archetype carries its structural `spine` (the empty scaffold) AND the path
// to its worked `exemplar` deck under exemplars/<bucket>/<slug> — the filled-in,
// boardroom-grade example the Drafting picker offers alongside the bare structure
// (fetched on demand, trimmed to the chosen tier). The exemplar path is the join
// key to the staged asset; docs/test/exemplar-archetypes.test.js gates that every
// one resolves to a real file, so the mapping can't silently drift.
const ARCHETYPES = {
	'General / Team': {
		'Status update': { spine: ['title', 'kpi', 'roadmap', 'decision', 'closing'], exemplar: 'general-team/status-update' },
		'Project kickoff': { spine: ['title', 'content', 'roadmap', 'actors', 'decision', 'closing'], exemplar: 'general-team/project-kickoff' },
		'Project status': { spine: ['title', 'kpi', 'roadmap', 'matrix-2x2', 'closing'], exemplar: 'general-team/project-status' },
		'Retrospective / post-mortem': { spine: ['title', 'timeline-list', 'matrix-2x2', 'list-steps', 'closing'], exemplar: 'general-team/retrospective' },
		'All-hands': { spine: ['title', 'big-number', 'kpi', 'roadmap', 'quote', 'closing'], exemplar: 'general-team/all-hands' },
		'Team meeting': { spine: ['title', 'agenda', 'content', 'decision', 'closing'], exemplar: 'general-team/team-meeting' },
		'Training / onboarding': { spine: ['title', 'agenda', 'list-steps', 'checklist', 'closing'], exemplar: 'general-team/training-onboarding' },
		'Workshop': { spine: ['title', 'agenda', 'content', 'cards-grid', 'list-steps', 'closing'], exemplar: 'general-team/workshop' },
		'Decision memo': { spine: ['title', 'content', 'compare-table', 'matrix-2x2', 'decision', 'closing'], exemplar: 'general-team/decision-memo' },
		'Proposal': { spine: ['title', 'content', 'list-criteria', 'kpi', 'decision', 'closing'], exemplar: 'general-team/proposal' },
		'Roadmap review': { spine: ['title', 'roadmap', 'kpi', 'matrix-2x2', 'closing'], exemplar: 'general-team/roadmap-review' },
	},
	Corporate: {
		'Board update': { spine: ['title', 'kpi', 'roadmap', 'decision', 'matrix-2x2', 'closing'], exemplar: 'corporate/board-update' },
		'Investor pitch': { spine: ['title', 'content', 'content', 'big-number', 'kpi', 'roadmap', 'actors', 'decision', 'closing'], exemplar: 'corporate/investor-pitch' },
		'Sales deck': { spine: ['title', 'content', 'content', 'verdict-grid', 'kpi', 'decision', 'closing'], exemplar: 'corporate/sales-deck' },
		'Quarterly business review': { spine: ['title', 'kpi', 'roadmap', 'matrix-2x2', 'decision', 'closing'], exemplar: 'corporate/quarterly-business-review' },
		'Strategy proposal': { spine: ['title', 'content', 'verdict-grid', 'matrix-2x2', 'decision', 'roadmap', 'closing'], exemplar: 'corporate/strategy-proposal' },
		'Product launch': { spine: ['title', 'content', 'cards-stack', 'cards-grid', 'kpi', 'roadmap', 'closing'], exemplar: 'corporate/product-launch' },
		'Customer case study': { spine: ['title', 'content', 'split-compare', 'kpi', 'quote', 'closing'], exemplar: 'corporate/customer-case-study' },
		'Budget request': { spine: ['title', 'big-number', 'content', 'list-tabular', 'kpi', 'decision', 'closing'], exemplar: 'corporate/budget-request' },
		'OKR / goals review': { spine: ['title', 'kpi', 'progress', 'roadmap', 'closing'], exemplar: 'corporate/okr-goals-review' },
	},
	Academic: {
		Lecture: { spine: ['title', 'agenda', 'content', 'diagram', 'list-criteria', 'closing'], exemplar: 'academic/lecture' },
		'Conference talk': { spine: ['title', 'content', 'content', 'radar', 'content', 'closing'], exemplar: 'academic/conference-talk' },
		'Thesis / dissertation defense': { spine: ['title', 'content', 'content', 'stats', 'content', 'roadmap', 'closing'], exemplar: 'academic/thesis-defense' },
		'Research findings': { spine: ['title', 'content', 'content', 'stats', 'content', 'closing'], exemplar: 'academic/research-findings' },
		'Journal club': { spine: ['title', 'citation-card', 'content', 'stats', 'matrix-2x2', 'closing'], exemplar: 'academic/journal-club' },
		'Grant proposal': { spine: ['title', 'content', 'list-criteria', 'roadmap', 'kpi', 'closing'], exemplar: 'academic/grant-proposal' },
		Seminar: { spine: ['title', 'agenda', 'content', 'diagram', 'list-steps', 'closing'], exemplar: 'academic/seminar' },
		'Poster walkthrough': { spine: ['title', 'content', 'diagram', 'stats', 'content', 'closing'], exemplar: 'academic/poster-walkthrough' },
		'Literature review': { spine: ['title', 'content', 'timeline-list', 'compare-table', 'content', 'closing'], exemplar: 'academic/literature-review' },
		'Course overview': { spine: ['title', 'agenda', 'roadmap', 'list-criteria', 'checklist', 'closing'], exemplar: 'academic/course-overview' },
	},
	'Government / Public': {
		'Policy briefing': { spine: ['title', 'content', 'content', 'verdict-grid', 'matrix-2x2', 'decision', 'closing'], exemplar: 'government-public/policy-briefing' },
		'Budget proposal': { spine: ['title', 'big-number', 'list-tabular', 'kpi', 'matrix-2x2', 'decision', 'closing'], exemplar: 'government-public/budget-proposal' },
		'Public hearing / testimony': { spine: ['title', 'content', 'list-criteria', 'stats', 'quote', 'closing'], exemplar: 'government-public/public-hearing' },
		'Agency / program update': { spine: ['title', 'kpi', 'roadmap', 'matrix-2x2', 'closing'], exemplar: 'government-public/agency-program-update' },
		'Inter-agency briefing': { spine: ['title', 'content', 'actors', 'roadmap', 'decision', 'closing'], exemplar: 'government-public/inter-agency-briefing' },
		'RFP / proposal response': { spine: ['title', 'content', 'list-criteria', 'gantt', 'actors', 'kpi', 'closing'], exemplar: 'government-public/rfp-response' },
		'Town hall': { spine: ['title', 'big-number', 'content', 'kpi', 'content', 'closing'], exemplar: 'government-public/town-hall' },
		'Compliance / audit report': { spine: ['title', 'content', 'obligation-matrix', 'matrix-2x2', 'list-steps', 'closing'], exemplar: 'government-public/compliance-audit-report' },
	},
	'Nonprofit / Mission-driven': {
		'Donor pitch': { spine: ['title', 'content', 'quote', 'big-number', 'roadmap', 'decision', 'closing'], exemplar: 'nonprofit/donor-pitch' },
		'Fundraising / capital campaign': { spine: ['title', 'content', 'big-number', 'progress', 'cards-grid', 'decision', 'closing'], exemplar: 'nonprofit/fundraising-capital-campaign' },
		'Impact / annual report': { spine: ['title', 'kpi', 'journey', 'quote', 'stats', 'roadmap', 'closing'], exemplar: 'nonprofit/impact-annual-report' },
		'Grant report': { spine: ['title', 'content', 'kpi', 'list-criteria', 'stats', 'closing'], exemplar: 'nonprofit/grant-report' },
		'Nonprofit board meeting': { spine: ['title', 'kpi', 'stats', 'roadmap', 'decision', 'closing'], exemplar: 'nonprofit/nonprofit-board-meeting' },
		'Program overview': { spine: ['title', 'content', 'diagram', 'kpi', 'actors', 'closing'], exemplar: 'nonprofit/program-overview' },
		'Volunteer onboarding': { spine: ['title', 'agenda', 'content', 'list-steps', 'checklist', 'closing'], exemplar: 'nonprofit/volunteer-onboarding' },
	},
};

// Flat list for fuzzy search (fuse.js) — preserves group order for grouping.
/** @type {Array<{ name: string; group: string; spine: string[]; exemplar: string }>} */
const ARCHETYPE_LIST = [];
for (const [group, items] of Object.entries(ARCHETYPES)) {
	for (const [name, entry] of Object.entries(items)) {
		ARCHETYPE_LIST.push({ name, group, spine: entry.spine, exemplar: entry.exemplar });
	}
}

// Exposed for the docs test that gates the archetype→exemplar mapping against the
// files on disk (no second source of truth).
export { ARCHETYPE_LIST };

export function createOnboarding({ catalog, mount, onBuild, model, say, exemplarBase }) {
	if (!mount) return { reset() {} };
	const byName = new Map((catalog || []).map((c) => [c.name, c]));

	// Fetch + cache the full worked exemplar deck for an archetype (the authored
	// `full` deck; the browser trims it to the chosen tier). Returns null when no
	// exemplar base is configured or the fetch fails, so the picker degrades to the
	// structure-only scaffold rather than breaking.
	const exemplarCache = new Map(); // 'bucket/slug' -> Promise<string|null>
	function fetchExemplar(path) {
		if (!exemplarBase || !path) return Promise.resolve(null);
		if (!exemplarCache.has(path)) {
			const p = fetch(`${exemplarBase}${path}.md`)
				.then((r) => (r.ok ? r.text() : null))
				.catch(() => null)
				// Don't pin a transient failure for the session — drop the cache entry on
				// a miss so a later re-pick retries (a hit caches the deck text for reuse).
				.then((text) => {
					if (text == null) exemplarCache.delete(path);
					return text;
				});
			exemplarCache.set(path, p);
		}
		return exemplarCache.get(path);
	}

	const el = (tag, cls, text) => {
		const e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text != null) e.textContent = text;
		return e;
	};

	const fuse = new Fuse(ARCHETYPE_LIST, { keys: ['name'], threshold: 0.4, ignoreLocation: true });
	let inFlow = false; // user is actively choosing a new deck (doors / picker)
	let everChose = false; // a mode has been chosen this session

	// Semantic archetype retrieval (Slice 6): when on-device embeddings are ready,
	// rank archetypes by cosine similarity to the free-text query so "pitch our
	// Series B" finds the investor-pitch spine without lexical overlap. Falls back
	// to fuse.js (lexical, typo-tolerant) whenever embeddings aren't available —
	// which is every browser until Transformers.js loads, and CI. The cosine math
	// is unit-tested (architect-model.test.js); this is the thin glue.
	const corpusText = (it) => `${it.name}. ${it.group}.`;
	let corpusVecs = null; // archetype embeddings, computed once
	let corpusPending = false;
	let searchToken = 0; // drops stale async re-ranks when keystrokes outrun embeds
	let rerank = null; // set by startDrafting so a late corpus load re-runs the query
	async function ensureCorpus() {
		if (corpusVecs || corpusPending || !model?.embed) return;
		corpusPending = true;
		const vecs = await model.embed(ARCHETYPE_LIST.map(corpusText));
		corpusPending = false;
		if (vecs && vecs.length === ARCHETYPE_LIST.length) { corpusVecs = vecs; rerank?.(); }
	}
	// Returns ranked ARCHETYPE_LIST entries for a query, or null if a newer query
	// superseded this one. Empty query → the full curated, grouped list.
	async function rankItems(q) {
		if (!q) return ARCHETYPE_LIST;
		if (corpusVecs && model?.embed) {
			const mine = ++searchToken;
			const out = await model.embed([q]);
			if (mine !== searchToken) return null; // a newer keystroke won
			const qv = out?.[0];
			if (qv) {
				const ranked = cosineRank(qv, corpusVecs, { limit: 12 })
					.filter((r) => r.score > 0.2)
					.map((r) => ARCHETYPE_LIST[r.index]);
				if (ranked.length) return ranked;
			}
		}
		return fuse.search(q).map((r) => r.item); // lexical fallback
	}

	// Remember the last door the author walked through (persists across reloads)
	// so a returning user's eye lands on it — without hijacking the choice.
	const MODE_KEY = 'lattice-db-last-mode';
	const readMode = () => { try { return localStorage.getItem(MODE_KEY); } catch { return null; } };
	const rememberMode = (m) => { try { localStorage.setItem(MODE_KEY, m); } catch {} };

	// Once a real deck is being worked on, collapse the doors to a compact
	// "✦ New deck" affordance so the scorecard is the focus; expand on an empty deck.
	function compactView() {
		mount.innerHTML = '';
		const b = el('button', 'db-onboard-compact'); b.innerHTML = '<span class="ico ico-plus" aria-hidden="true"></span> New deck';
		b.type = 'button';
		b.addEventListener('click', () => { inFlow = true; doors(); });
		mount.appendChild(b);
	}
	window.addEventListener('db-deck-content', (e) => {
		if (inFlow) return;
		if (e.detail || everChose) compactView();
		else doors();
	});

	// ── The two doors ─────────────────────────────────────────────────────────
	function doors() {
		mount.innerHTML = '';
		const last = readMode();
		const wrap = el('div', 'db-modes');
		wrap.append(
			modeCard('Drafting', 'I lay out the structure; you fill it in.', startDrafting, last === 'Drafting'),
			modeCard('Freehand', 'Your blank canvas; I review and help on request.', startFreehand, last === 'Freehand'),
		);
		mount.appendChild(wrap);
	}
	function modeCard(title, sub, onClick, isLast) {
		const b = el('button', isLast ? 'db-mode-card is-last' : 'db-mode-card');
		b.type = 'button';
		const head = el('span', 'db-mode-title', title);
		if (isLast) head.appendChild(el('span', 'db-mode-last', 'last used'));
		b.append(head, el('span', 'db-mode-sub', sub));
		b.addEventListener('click', onClick);
		return b;
	}

	// ── Freehand — blank canvas ───────────────────────────────────────────────
	async function startFreehand() {
		everChose = true;
		inFlow = false;
		rememberMode('Freehand');
		// Await the deck creation so the greeting lands in the NEW deck's thread.
		if (onBuild) await onBuild('<!-- _class: title silent -->\n\n# New deck\n\nStart writing — I’ll review as you go.\n');
		if (say) await say(
			'Blank canvas — go. I score every edit and flag anything off up here as you write. ' +
			'Tap the chips for your top fixes, the weakest slide, or the ask; select text and hit Refine to tighten a line. ' +
			'Want to talk it through? Switch to Converse.');
		compactView();
	}

	// ── Drafting — archetype picker → framework-grounded spine ────────────────
	function startDrafting() {
		mount.innerHTML = '';
		const head = el('div', 'db-draft-head');
		const back = el('button', 'db-ob-cancel'); back.innerHTML = '<span class="ico ico-arrow-left" aria-hidden="true"></span> Modes';
		back.type = 'button';
		back.addEventListener('click', doors);
		head.append(back, el('p', 'db-draft-say', 'What are you presenting? I’ll lay out the structure.'));
		const search = el('input', 'db-draft-search');
		search.type = 'search';
		search.placeholder = 'Search presentation types…';
		head.appendChild(search);
		mount.appendChild(head);
		const list = el('div', 'db-draft-list');
		mount.appendChild(list);
		const paint = (items) => {
			list.innerHTML = '';
			const groups = {};
			for (const it of items) (groups[it.group] ||= []).push(it);
			for (const [group, arr] of Object.entries(groups)) {
				list.appendChild(el('div', 'db-draft-group', group));
				for (const it of arr) {
					const item = el('button', 'db-draft-item', it.name);
					item.type = 'button';
					item.addEventListener('click', () => proposeArchetype(it));
					list.appendChild(item);
				}
			}
			if (!list.children.length) {
				list.appendChild(el('p', 'db-rail-note', 'Not in the list? Go Freehand — I don’t template specialized or long-form work.'));
			}
		};
		const renderList = async () => {
			const items = await rankItems(search.value.trim());
			if (items) paint(items); // null = superseded by a newer keystroke
		};
		rerank = renderList; // a late corpus-embed load re-runs the current query
		search.addEventListener('input', renderList);
		ensureCorpus(); // warm the embeddings in the background (no-op without a model)
		renderList();
		setTimeout(() => search.focus(), 0);
	}

	function proposeArchetype(it) {
		const name = it.name;
		const spine = it.spine;
		mount.innerHTML = '';
		const back = el('button', 'db-ob-cancel'); back.innerHTML = '<span class="ico ico-arrow-left" aria-hidden="true"></span> Types';
		back.type = 'button';
		back.addEventListener('click', startDrafting);
		mount.appendChild(back);
		mount.appendChild(el('p', 'db-draft-say', `${name} — start from a worked example, or just the structure.`));

		// ── Worked example (primary) — the filled-in, boardroom-grade deck, trimmed
		// to a chosen length. Rendered as a placeholder, then populated once the deck
		// is fetched (and removed entirely if there's no exemplar / the fetch fails,
		// so the structure path below always stands).
		const exBox = el('div', 'db-ex');
		exBox.appendChild(el('div', 'db-ex-loading', 'Loading the worked example…'));
		mount.appendChild(exBox);

		// ── Structure (secondary) — the empty scaffold the Architect would lay out.
		const structWrap = el('div', 'db-struct');
		structWrap.appendChild(el('p', 'db-struct-label', 'Or just the structure'));
		const ol = el('ol', 'db-ob-outline');
		for (const comp of spine) {
			const item = el('li');
			item.appendChild(el('strong', null, comp));
			ol.appendChild(item);
		}
		structWrap.appendChild(ol);
		const buildStruct = el('button', 'db-btn db-btn-ghost db-ex-build');
		buildStruct.type = 'button';
		buildStruct.innerHTML = 'Build the structure <span class="ico ico-arrow-right" aria-hidden="true"></span>';
		buildStruct.addEventListener('click', async () => {
			everChose = true;
			inFlow = false;
			rememberMode('Drafting');
			if (onBuild) await onBuild(assemble(name, spine), name);
			if (say) await say(
				`Built the ${name} structure — ${spine.length} slides scaffolded, ` +
				'starting from the title. Fill them in and I review as you type. ' +
				'Tap the chips for top fixes or pacing; switch to Converse to talk it through.');
			compactView();
		});
		structWrap.appendChild(buildStruct);
		mount.appendChild(structWrap);

		const row = el('div', 'db-ob-chips');
		const other = el('button', 'db-ob-chip', 'Pick another');
		other.type = 'button';
		other.addEventListener('click', startDrafting);
		row.append(other);
		mount.appendChild(row);

		// Fetch the worked deck and, once it lands, replace the placeholder with the
		// tier chooser + Open button. If it's gone (the user navigated on) or the deck
		// is unavailable, leave only the structure path.
		fetchExemplar(it.exemplar).then((full) => {
			if (!exBox.isConnected) return; // navigated away mid-fetch
			if (full) { renderExemplar(exBox, name, full); return; }
			if (exemplarBase && it.exemplar) {
				// The archetype HAS a worked example but it didn't load (offline /
				// transient) — say so rather than silently hiding it, so the author
				// knows it exists; the structure path below still stands.
				exBox.innerHTML = '';
				exBox.appendChild(el('p', 'db-ex-loading', 'Couldn’t load the worked example — start from the structure below, or pick another.'));
			} else {
				exBox.remove(); // no exemplar configured at all → structure-only
			}
		});
	}

	// Build the worked-example block: a Short · Standard · Full chooser (with live
	// slide counts) and an Open button that loads the deck trimmed to the choice.
	function renderExemplar(box, name, full) {
		box.innerHTML = '';
		box.appendChild(el('p', 'db-ex-label', 'A worked example — fill in your own, or learn from it.'));
		const counts = tierCounts(full); // { short, standard, full }
		const TIER_DEFS = [
			['short', 'Short', 'the essentials'],
			['standard', 'Standard', 'the full arc'],
			['full', 'Full', 'every slide'],
		];
		let chosen = 'standard';
		const seg = el('div', 'db-ex-tiers');
		seg.setAttribute('role', 'radiogroup');
		seg.setAttribute('aria-label', 'Example length');
		const segBtns = {};
		for (const [tier, label, hint] of TIER_DEFS) {
			const b = el('button', 'db-ex-tier');
			b.type = 'button';
			b.setAttribute('role', 'radio');
			b.dataset.tier = tier;
			b.title = hint;
			b.append(
				el('span', 'db-ex-tier-name', label),
				el('span', 'db-ex-tier-count', `${counts[tier]} slide${counts[tier] === 1 ? '' : 's'}`),
			);
			b.addEventListener('click', () => setTier(tier));
			segBtns[tier] = b;
			seg.appendChild(b);
		}
		function setTier(tier) {
			chosen = tier;
			for (const [t, b] of Object.entries(segBtns)) {
				const on = t === tier;
				b.classList.toggle('is-active', on);
				b.setAttribute('aria-checked', on ? 'true' : 'false');
			}
		}
		setTier(chosen);
		box.appendChild(seg);

		const open = el('button', 'db-btn db-btn-primary db-ex-open');
		open.type = 'button';
		open.innerHTML = 'Open the example <span class="ico ico-arrow-right" aria-hidden="true"></span>';
		open.addEventListener('click', async () => {
			everChose = true;
			inFlow = false;
			rememberMode('Drafting');
			const deck = filterToTier(full, chosen);
			if (onBuild) await onBuild(deck, name);
			if (say) await say(
				`Loaded a worked ${name} — the ${chosen} cut, ${counts[chosen]} slides. ` +
				'It’s a real, finished example: read how it’s built, then make it yours. ' +
				'I review every edit; switch to Converse to talk it through.');
			compactView();
		});
		box.appendChild(open);
	}

	// Scaffold the deck from the spine, using each component's catalog skeleton.
	function assemble(label, spine) {
		const slides = spine.map((name, i) => {
			if (i === 0 && name === 'title') {
				return `<!-- _class: title silent -->\n\n\`${label}\`\n\n# New deck\n\nYour subtitle`;
			}
			const c = byName.get(name);
			return c?.skeleton || `<!-- _class: ${name} -->\n`;
		});
		return `${slides.join('\n\n---\n\n')}\n`;
	}

	doors();
	return { reset: doors };
}
