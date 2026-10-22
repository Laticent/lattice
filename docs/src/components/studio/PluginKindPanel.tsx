// THE PLUGIN KIND PANEL — one panel for every inline kind an installed plugin declares.
//
// A plugin installed from a package can add a kind (`@gantt-bar{…}`) whose fields are data in its manifest: a Segno slot
// spec (`contributes.inline.<kind>.slot`). The host cannot run the plugin's code to draw the span, but it can read and
// write the record from the slot alone, and that is all a panel needs. So the controls are DRAWN FROM THE SPEC, never
// written per plugin: a text field for a text word, chips for a vocabulary, a toggle for a flag, slots for a deck color.
//
//   · It reports one change per pick (`{ size: 'lg' }`). The host writes it through `kernels.record.edit`
//     (lib/core/segno-edit.js `editRecord`), which replaces only the word that changed, or writes nothing.
//   · A parameter whose type the writer does not take (a list, a range, a nested record) is named, not hidden, and
//     "Edit as text" is the way to it.
//
// Design: engineering/decisions/2026-10-21-compose-point-and-click.md §4, §7.

import * as React from 'react';
import type { PluginKindEdit, PluginKindFields } from '@/lib/compose/inline-objects';
import type { ObjectPanelProps } from './InlineObjectEditor';
import { ChoiceRow, Field, PanelFooter, TextRow } from './object-controls';

type ParamType = { type: string; values?: readonly string[]; prefix?: string; max?: number };
const typeOf = (p: unknown): ParamType => (typeof p === 'string' ? { type: p } : (p as ParamType));

/** The types `editRecord` writes. Anything else is left to "Edit as text". */
const WRITABLE = new Set(['text', 'number', 'oneOf', 'indexed', 'flag']);

/** The most chips a numbered vocabulary (`c1` … `c12`) draws before it is left to the text. */
const MAX_INDEXED = 24;

const labelOf = (name: string) => name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function PluginKindPanel({ fields, onEdit, onEditAsText, onDone }: ObjectPanelProps & { fields: PluginKindFields }) {
	const [refused, setRefused] = React.useState<string | null>(null);
	const labelId = React.useId();
	const { entry, written } = fields;
	const send = (edit: PluginKindEdit, what: string) => setRefused((onEdit as unknown as (e: PluginKindEdit) => boolean)(edit) ? null : what);
	const controls: { name: string; type: ParamType }[] = [
		...(entry.slot.positional ?? []).map((p) => ({ name: p.name, type: typeOf(p.type) })),
		...Object.entries(entry.slot.params).map(([name, p]) => ({ name, type: typeOf(p) })),
	];
	const left: string[] = [];

	const rows = controls.map(({ name, type }) => {
		const id = `${labelId}-${name}`;
		const word = written[name];
		const nope = `That ${name} cannot be written here. Use Edit as text.`;
		if (!WRITABLE.has(type.type)) {
			left.push(name);
			return null;
		}
		if (type.type === 'text' || type.type === 'number') {
			return (
				<Field key={name} label={labelOf(name)} id={id}>
					<TextRow id={`${id}-input`} label={labelOf(name)} value={word === undefined || word === null ? '' : String(word)} onCommit={(v) => send({ [name]: v.trim() === '' ? null : v.trim() }, nope)} />
				</Field>
			);
		}
		if (type.type === 'flag') {
			return (
				<Field key={name} label={labelOf(name)} id={id} inline>
					<div className="min-w-0 flex-1">
						<ChoiceRow labeledBy={id} group={labelOf(name)} values={['on']} value={word === true ? 'on' : null} names={{ on: 'On' }} autoLabel="Off" onPick={(v) => send({ [name]: v === 'on' ? true : null }, nope)} />
					</div>
				</Field>
			);
		}
		if (type.type === 'indexed') {
			const prefix = type.prefix ?? 'c';
			const max = Math.min(type.max ?? 12, MAX_INDEXED);
			const values = Array.from({ length: max }, (_, i) => `${prefix}${i + 1}`);
			return (
				<Field key={name} label={labelOf(name)} id={id}>
					<ChoiceRow labeledBy={id} group={labelOf(name)} values={values} value={typeof word === 'number' ? `${prefix}${word}` : null} names={Object.fromEntries(values.map((v) => [v, v.slice(prefix.length)]))} onPick={(v) => send({ [name]: v }, nope)} />
				</Field>
			);
		}
		return (
			<Field key={name} label={labelOf(name)} id={id}>
				<ChoiceRow labeledBy={id} group={labelOf(name)} values={type.values ?? []} value={typeof word === 'string' ? word : null} onPick={(v) => send({ [name]: v }, nope)} />
			</Field>
		);
	});

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 text-[13px]">
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
				<p className="text-[12px] text-muted-foreground">
					<span className="font-mono">@{entry.name}</span> comes from the {entry.plugin} plugin. The preview shows it as written; the slide draws it.
				</p>
				{rows}
				{left.length ? <p className="text-[11px] text-muted-foreground">Not editable here: {left.map(labelOf).join(', ')}. Use Edit as text.</p> : null}
				{refused ? (
					<p role="alert" className="text-[12px] text-[var(--warn)]">
						{refused}
					</p>
				) : null}
			</div>
			<PanelFooter onEditAsText={onEditAsText} onDone={onDone} />
		</div>
	);
}
