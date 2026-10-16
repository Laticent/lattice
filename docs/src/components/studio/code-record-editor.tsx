// THE CODE BLOCK'S OPTIONS — the fence's `@code{…}` record, point and click.
//
// A button beside the fence's language picker in the divider pill (code-controls.tsx `CodeControls`)
// opens this panel. Every field is the code plugin's record (lib/plugins/code/shared/record.js SPEC):
// numbers, focus and mark lines, diff, wrap, copy, format, and the formatter's width, indent, quotes
// and SQL dialect. Each change goes through the ENGINE's writer (`editRecord`, lib/plugins/code/
// shared/record-edit.js, loaded as esm/code-record.js), which replaces only the word that changed, so
// the author's spelling of every other field survives and an untouched deck round-trips byte for byte. A change
// the writer cannot make safely (a record that does not read, a field written twice) is refused and
// said, never guessed at.
//
// Lazy: its own chunk, which CodeControls loads with the authoring bundle and the writer once the caret
// is in a fence.
// Design: engineering/decisions/2026-10-15-code-plugin.md §7 and §11.

import { Cog } from 'lucide-react';
import type { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { currentFenceTag } from '@/lib/compose/code-commands';
import { type CodeRecordEdit, type CodeRecordFields, type CodeRecordKernel, fenceRecord, frontMatterOf, setFenceRecord } from '@/lib/compose/code-record';
import { cn } from '@/lib/utils';
import { ITEM } from './PillEditor';

const HEAD = 'font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';

/**
 * Scroll shadows: where the panel is shorter than its fields (a phone, a short window) a soft edge
 * shows there is more above or below, and goes when the list reaches that end. CSS only: the two
 * `local` covers scroll with the content and hide the `scroll` shades at each end.
 */
const SCROLL_SHADOWS: React.CSSProperties = {
	background: [
		'linear-gradient(var(--color-popover) 30%, transparent) top / 100% 24px no-repeat local',
		'linear-gradient(transparent, var(--color-popover) 70%) bottom / 100% 24px no-repeat local',
		'radial-gradient(farthest-side at 50% 0, color-mix(in srgb, var(--text-body) 16%, transparent), transparent) top / 100% 8px no-repeat scroll',
		'radial-gradient(farthest-side at 50% 100%, color-mix(in srgb, var(--text-body) 16%, transparent), transparent) bottom / 100% 8px no-repeat scroll',
	].join(', '),
};

/** Line targets as the author writes them: `3-5 9`. */
function linesText(lines: Set<number> | undefined): string {
	const ns = [...(lines ?? [])].sort((a, b) => a - b);
	const out: string[] = [];
	for (let i = 0; i < ns.length; i++) {
		let j = i;
		while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
		out.push(j > i ? `${ns[i]}-${ns[j]}` : String(ns[i]));
		i = j;
	}
	return out.join(' ');
}

/** A text field that writes when the author leaves it or presses Enter, not on every key. */
function FieldInput({ label, value, placeholder, onCommit, inputMode, mono }: { label: string; value: string; placeholder?: string; onCommit: (v: string) => void; inputMode?: 'numeric' | 'text'; mono?: boolean }) {
	const [text, setText] = React.useState(value);
	const ref = React.useRef<HTMLInputElement>(null);
	React.useEffect(() => {
		if (document.activeElement !== ref.current) setText(value);
	}, [value]);
	const id = React.useId();
	const commit = () => {
		if (text.trim() !== value) onCommit(text.trim());
	};
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className={HEAD}>
				{label}
			</label>
			<Input
				ref={ref}
				id={id}
				value={text}
				placeholder={placeholder}
				inputMode={inputMode}
				autoComplete="off"
				spellCheck={false}
				className={cn('h-8 text-[13px] placeholder:text-muted-foreground/60', mono && 'font-mono')}
				onChange={(e) => setText(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						commit();
					}
				}}
			/>
		</div>
	);
}

function SwitchRow({ label, hint, checked, disabled, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
	const id = React.useId();
	return (
		<div className="flex items-start justify-between gap-3">
			<label htmlFor={id} className="min-w-0 text-[13px] leading-tight">
				{label}
				{hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
			</label>
			<Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
		</div>
	);
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: readonly [string, string][]; onChange: (v: string) => void }) {
	const id = React.useId();
	return (
		<div className="flex flex-col gap-1">
			<span id={id} className={HEAD}>
				{label}
			</span>
			<ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v)} aria-labelledby={id} className="grid w-full gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
				{options.map(([v, name]) => (
					<ToggleGroupItem key={v} value={v} aria-label={`${label}: ${name}`} className={cn(ITEM, 'h-7 rounded-md px-1 text-[12px] font-normal')}>
						{name}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}

/**
 * The panel. `record` is the fence's `@code{…}` (or '' for none), `defaults` the deck's `code:`.
 * `onWrite` puts a new record in; it returns whether one was written.
 */
export function CodeRecordPanel({ record, defaults, lang, kernel, onWrite }: { record: string; defaults: CodeRecordFields; lang: string; kernel: CodeRecordKernel; onWrite: (text: string) => boolean }) {
	const read = record ? kernel.read(record) : { ok: true, value: {} as CodeRecordFields };
	const own: CodeRecordFields = read.value ?? {};
	const [refused, setRefused] = React.useState<string | null>(null);
	const send = (edit: CodeRecordEdit) => {
		const next = kernel.edit(record, edit);
		if (next === null) {
			// Say WHY: a value that does not read is the author's to fix here; anything else (a field
			// written twice, a record that does not read) is fixed in the Markdown source.
			const why = Object.entries(edit)
				.map(([k, v]) => kernel.problem(k, v))
				.find(Boolean);
			return setRefused(why ? `Not written: ${why}.` : 'This record cannot be changed here safely. Edit it in the Markdown source.');
		}
		setRefused(null);
		if (next !== record && !onWrite(next)) setRefused('Not written: the caret is no longer in this code block.');
	};
	/**
	 * A field that is on or off: written only where the block differs from the deck default. A flag
	 * (`numbers`, `wrap`, `diff`) has no "off" word, so a deck that turns one on for every block
	 * cannot turn it off for one: the switch says so and stays on.
	 */
	const flag = (key: 'numbers' | 'wrap' | 'diff') => ({
		checked: Boolean(own[key] ?? defaults[key]),
		// Locked by the deck default, unless the block also says it, which the switch can then take out.
		disabled: Boolean(defaults[key]) && !own[key],
		hint: defaults[key] ? 'On for every block (the deck’s code: default).' : undefined,
		onChange: (v: boolean) => send({ [key]: v || null }),
	});
	const onOff = (key: 'copy' | 'format') => ({
		checked: Boolean(own[key] ?? defaults[key]),
		onChange: (v: boolean) => send({ [key]: v === Boolean(defaults[key]) ? null : v }),
	});
	const numbersOn = Boolean(own.numbers ?? defaults.numbers);
	const sql = lang === 'sql';

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 text-[13px]">
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5" style={SCROLL_SHADOWS} data-testid="code-record-fields">
				{!read.ok ? (
					<p role="alert" className="text-[12px] text-[var(--warn)]">
						This record does not read: {(read.problems ?? []).join('; ')}. The slide ignores what it cannot read.
					</p>
				) : null}
				{refused ? (
					<p role="alert" className="text-[12px] text-[var(--warn)]">
						{refused}
					</p>
				) : null}
				<FieldInput label="Title" value={own.title ?? ''} placeholder="e.g. src/load.ts" onCommit={(v) => send({ title: v || null })} />

				<div className="flex flex-col gap-2.5">
					<SwitchRow label="Line numbers" {...flag('numbers')} />
					{numbersOn || own.start !== undefined ? <FieldInput label="First line number" value={own.start === undefined ? '' : String(own.start)} placeholder="1 (default)" inputMode="numeric" onCommit={(v) => send({ start: v ? Number(v) : null })} /> : null}
					<SwitchRow label="Wrap long lines" {...flag('wrap')} />
					<SwitchRow label="Diff markers" {...flag('diff')} hint={flag('diff').hint ?? 'A leading + or - marks a line added or removed.'} />
					<SwitchRow label="Copy buttons" hint="Shown where the deck is read in a browser." {...onOff('copy')} />
					<SwitchRow label="Keep formatted" hint="Format when you leave the editor." {...onOff('format')} />
				</div>

				<div className="grid grid-cols-2 gap-2">
					<FieldInput label="Focus lines" value={linesText(own.focus)} placeholder="e.g. 3-5 9" mono onCommit={(v) => send({ focus: v || null })} />
					<FieldInput label="Mark lines" value={linesText(own.mark)} placeholder="e.g. 4" mono onCommit={(v) => send({ mark: v || null })} />
				</div>

				<div className="flex flex-col gap-2.5 border-t border-border pt-3">
					<span className={HEAD}>Formatter</span>
					<Choice
						label="Indent"
						value={own.indent ?? 'default'}
						options={[['default', defaults.indent ? `Deck (${defaults.indent})` : 'Default'], ...kernel.INDENTS.map((i) => [i, i === 'tab' ? 'Tab' : `${i} spaces`] as [string, string])]}
						onChange={(v) => send({ indent: v === 'default' ? null : v })}
					/>
					<Choice
						label="Quotes"
						value={own.quotes ?? 'default'}
						options={[['default', defaults.quotes ? `Deck (${defaults.quotes})` : 'Default'], ['single', 'Single'], ['double', 'Double']]}
						onChange={(v) => send({ quotes: v === 'default' ? null : v })}
					/>
					<div className={cn('grid gap-2', sql ? 'grid-cols-2' : 'grid-cols-1')}>
						<FieldInput label="Width (columns)" value={own.width === undefined ? '' : String(own.width)} placeholder="60 (default)" inputMode="numeric" onCommit={(v) => send({ width: v ? Number(v) : null })} />
						{sql ? <FieldInput label="SQL dialect" value={own.dialect ?? ''} placeholder="postgresql (default)" mono onCommit={(v) => send({ dialect: v || null })} /> : null}
					</div>
				</div>
			</div>
			<p className="shrink-0 truncate border-t border-border pt-2 font-mono text-[11px] text-muted-foreground" title={record || 'No record'} data-testid="code-record-text">
				{record || 'No options set'}
			</p>
		</div>
	);
}

/** The button and its popover, for the divider pill while the caret is in a fence. */
export function CodeRecordButton({ view, source, kernel }: { view: EditorView; source: string; kernel: CodeRecordKernel }) {
	const [open, setOpen] = React.useState(false);
	// Re-read on every render: the host re-renders on each transaction (the `source` prop moves).
	const record = fenceRecord(view.state)?.text ?? '';
	const defaults = React.useMemo(() => kernel.deckDefaults(frontMatterOf(source)), [kernel, source]);
	const lang = currentFenceTag(view.state);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild onMouseDown={(e) => e.preventDefault()}>
				<button type="button" className="cs-codec-trigger" aria-label={record ? `Code block options: ${record}` : 'Code block options'} title="Code block options" data-set={record ? '' : undefined}>
					<Cog aria-hidden />
					{record ? <span className="cs-codec-dot" aria-hidden /> : null}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="center"
				collisionPadding={8}
				className="flex w-[min(20rem,92vw)] flex-col overflow-hidden p-3 max-h-[max(220px,min(760px,calc(var(--radix-popover-content-available-height)-12px)))]"
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<CodeRecordPanel
					record={record}
					defaults={defaults}
					lang={lang}
					kernel={kernel}
					onWrite={(text) => setFenceRecord(text)(view.state, view.dispatch)}
				/>
			</PopoverContent>
		</Popover>
	);
}
