import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useSettingsHit, useSettingsQuery } from '@/components/ui/settings-view';
import { cn } from '@/lib/utils';
import { deckPluginList, writeDeckPlugins } from '../../../../lib/plugins/deck-plugins.mjs';
import { PLUGIN_GRAMMAR } from '../../../../lib/plugins/grammar.generated.mjs';
import { admitPlugins } from '../../../../lib/plugins/host-grammar.mjs';

/**
 * THE PLUGINS TAB — the deck settings' view of what loads a plugin, and the one place an author
 * writes the deck's `plugins:` import list (engineering/decisions/2026-09-27-plugin-system.md §9
 * decision 6, owner 2026-10-05).
 *
 * Every plugin has one row: its name, the syntax it reads, and WHY it is on for this deck — the
 * routes `admitPlugins` reports (the default set, the deck's own list, a slide class that requires
 * it, a plugin that requires it). The checkbox is the LIST: it adds or removes the plugin's name
 * in the deck's front matter, so the choice travels with the deck and every export reproduces it.
 * Listing never turns a plugin on or off by itself here — every shipped plugin is on by default —
 * so the control is a checkbox with its own visible words ("In this deck's list"), never a switch
 * beside the plugin's name: a switch reads as the plugin's on/off state, and an unchecked switch
 * next to "On" said two things at once (HARD RULE #25 inversion lens, E0). A name in the list that no plugin has gets a row of its own with a Remove action, the
 * same finding `lint:deck` reports as `unknown-plugin`.
 *
 * Every name, title and syntax hint comes from the registry; this file names no plugin.
 */

type Reason = { kind: 'default' | 'listed' | 'component' | 'required'; component?: string; by?: string };
type GrammarEntry = (typeof PLUGIN_GRAMMAR)[number];

/** The syntax a plugin reads, as an author types it: its fences, then its syntax triggers. */
export function pluginSyntaxHint(g: GrammarEntry): string[] {
	const fences = Object.keys(g.fences || {}).map((f) => `\`\`\`${f}`);
	const triggers = Object.values(g.syntax || {}).flatMap((r: { kind: string; triggers: readonly string[] }) =>
		r.triggers.map((t) => (r.kind === 'block' ? `${t}${t}…${t}${t}` : `${t}…${t}`)),
	);
	return [...new Set([...triggers, ...fences])];
}

/** One reason, in words. */
export function reasonLabel(r: Reason, titleOf: (name: string) => string): string {
	if (r.kind === 'default') return 'On by default';
	if (r.kind === 'listed') return 'Listed in this deck';
	if (r.kind === 'component') return `Needed by ${r.component} slides`;
	return `Needed by ${titleOf(r.by ?? '')}`;
}

export function PluginsSettings({ source, onWrite }: { source: string; onWrite: (label: string, updater: (s: string) => string) => void }) {
	const admission = React.useMemo(() => admitPlugins(source, { explain: true }), [source]);
	const listed = React.useMemo(() => deckPluginList(source), [source]);
	const active = React.useMemo(() => new Set((admission.active as GrammarEntry[]).map((g) => g.name)), [admission]);
	const titleOf = React.useCallback((name: string) => PLUGIN_GRAMMAR.find((g) => g.name === name)?.title ?? name, []);
	const setListed = (name: string, on: boolean) =>
		onWrite(`Plugins → ${on ? 'list' : 'unlist'} ${name}`, (s) => {
			const now = deckPluginList(s);
			return writeDeckPlugins(s, on ? [...now, name] : now.filter((n: string) => n !== name));
		});
	return (
		<div className="space-y-0" data-plugins-settings="">
			{PLUGIN_GRAMMAR.map((g, i) => (
				<PluginRow
					key={g.name}
					grammar={g}
					on={active.has(g.name)}
					listed={listed.includes(g.name)}
					reasons={(admission as { reasons?: Record<string, Reason[]> }).reasons?.[g.name] ?? []}
					titleOf={titleOf}
					onListed={(on) => setListed(g.name, on)}
					last={i === PLUGIN_GRAMMAR.length - 1 && !admission.unknown.length}
				/>
			))}
			{admission.unknown.map(({ name }: { name: string }, i: number) => (
				<UnknownRow key={name} name={name} last={i === admission.unknown.length - 1} onRemove={() => setListed(name, false)} />
			))}
		</div>
	);
}

function PluginRow({ grammar: g, on, listed, reasons, titleOf, onListed, last }: { grammar: GrammarEntry; on: boolean; listed: boolean; reasons: Reason[]; titleOf: (n: string) => string; onListed: (on: boolean) => void; last: boolean }) {
	const hint = pluginSyntaxHint(g);
	const hit = useSettingsHit(g.title, g.name, hint.join(' '));
	const id = React.useId();
	if (!hit) return null;
	return (
		<div {...hit} data-plugin-row={g.name} className={cn('flex min-w-0 py-2.5', !last && 'border-b border-border')}>
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
					<span className="text-[12.5px] font-semibold text-foreground">{g.title}</span>
					<span className={cn('text-[11px] font-semibold', on ? 'text-[var(--accent)]' : 'text-muted-foreground')}>{on ? 'On' : 'Off'}</span>
				</div>
				<div className="mt-0.5 flex min-w-0 flex-wrap gap-1">
					{hint.map((h) => (
						<code key={h} className="rounded bg-muted px-1 py-px font-mono text-[10.5px] text-muted-foreground">{h}</code>
					))}
				</div>
				<p className="mt-1 text-[11px] leading-snug text-muted-foreground">{reasons.length ? reasons.map((r) => reasonLabel(r, titleOf)).join(' · ') : 'Not loaded for this deck'}</p>
				<div className="mt-1.5 flex items-center gap-1.5">
					<Checkbox id={id} checked={listed} onCheckedChange={(v) => onListed(v === true)} aria-label={`List ${g.title} in this deck's plugins`} />
					<label htmlFor={id} className="cursor-pointer text-[11.5px] text-foreground">
						In this deck's <code className="font-mono text-[10.5px]">plugins:</code> list
					</label>
				</div>
			</div>
		</div>
	);
}

function UnknownRow({ name, last, onRemove }: { name: string; last: boolean; onRemove: () => void }) {
	const query = useSettingsQuery();
	const hit = useSettingsHit(name, 'unknown plugin');
	if (query && !hit) return null;
	return (
		<div {...(hit ?? {})} data-plugin-unknown={name} className={cn('flex min-w-0 items-center gap-3 py-2.5', !last && 'border-b border-border')}>
			<p className="min-w-0 flex-1 text-[11px] leading-snug" style={{ color: 'var(--warn, #9a6a00)' }}>
				No plugin is named <code className="font-mono">{name}</code>; this deck lists it, and nothing loads.
			</p>
			<button type="button" onClick={onRemove} className="shrink-0 rounded-md border border-border px-2 py-1 text-[11.5px] font-semibold hover:bg-muted">
				Remove
			</button>
		</div>
	);
}
