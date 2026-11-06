import { KeyRound, Loader2 } from 'lucide-react';
import * as React from 'react';
import { notify } from '@/lib/notify';
import { openRouterKeyHint } from '@/lib/openrouter-key.js';
import { saveOpenRouterKey } from './api-key';
import { type ArchitectStatus, disconnectOpenRouter } from './architect';

/**
 * Workspace → AI → API key: paste an OpenRouter key instead of the one-click sign-in.
 *
 * The same OpenRouter backend serves both, so every AI feature, the spend tab and the cloud voice
 * behave identically; only how the key arrived differs. The key is checked against OpenRouter
 * before it is stored, never shown again (only its last four characters), and lives in this
 * browser through lib/openrouter-key.js. Direct OpenAI / Gemini / Anthropic keys are a later
 * slice (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §7).
 */
export function ApiKeyPanel({ status }: { status: ArchitectStatus }) {
	const [value, setValue] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [replacing, setReplacing] = React.useState(false);
	// Re-read on every status change (a save, a disconnect, a rejection fires db-model-changed).
	// biome-ignore lint/correctness/useExhaustiveDependencies: status is the refresh trigger
	const hint = React.useMemo(() => openRouterKeyHint(), [status]);
	const saved = status.openRouterReady && !!hint;
	const inputId = React.useId();

	const save = async () => {
		setBusy(true);
		setError(null);
		const out = await saveOpenRouterKey(value);
		setBusy(false);
		if (out.ok) {
			setValue('');
			setReplacing(false);
			notify('OpenRouter key saved — Cloud is active.');
		} else setError(out.note);
	};
	const remove = async () => {
		await disconnectOpenRouter();
		notify('OpenRouter key removed from this browser.');
	};

	if (saved && !replacing) {
		return (
			<div>
				<div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
					<span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
						<KeyRound className="size-4" />
					</span>
					<span className="min-w-0">
						<div className="text-[13px] font-semibold text-[var(--text-heading)]">OpenRouter key {hint}</div>
						<div className="text-[11px] text-muted-foreground">{status.openRouterKeyInvalid ? 'Rejected by OpenRouter — replace it.' : 'Saved in this browser.'}</div>
					</span>
					<span className="ml-auto flex shrink-0 gap-1.5">
						<button type="button" onClick={() => setReplacing(true)} className="rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)]">
							Replace
						</button>
						<button type="button" onClick={remove} className="rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)]">
							Remove
						</button>
					</span>
				</div>
				<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Pick a model and see spend under Cloud; a pasted key and a signed-in one work the same way.</p>
			</div>
		);
	}

	return (
		<div>
			<label htmlFor={inputId} className="text-[12px] font-semibold text-[var(--text-heading)]">
				OpenRouter API key
			</label>
			<div className="mt-1.5 flex gap-2">
				<input
					id={inputId}
					type="password"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && value.trim() && !busy) save();
					}}
					placeholder="sk-or-v1-…"
					// Chrome ignores `off` on a password field and offers to save the key as a synced
					// password once the field disappears after a request; `new-password` and the
					// managers' own opt-outs keep it out of the vault.
					autoComplete="new-password"
					data-1p-ignore=""
					data-lpignore="true"
					data-bwignore=""
					data-form-type="other"
					spellCheck={false}
					aria-invalid={!!error}
					aria-describedby={`${inputId}-help`}
					className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2.5 py-1.5 font-mono text-[12.5px] text-[var(--text-heading)] outline-none focus-visible:border-[var(--accent)]"
				/>
				<button type="button" onClick={save} disabled={busy || !value.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50">
					{busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
					{busy ? 'Checking…' : 'Check & save'}
				</button>
			</div>
			{error ? (
				<p role="alert" className="mt-1.5 text-[11px] text-[var(--fail)]">
					{error}
				</p>
			) : null}
			<p id={`${inputId}-help`} className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
				Create a key at{' '}
				<a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--accent)]">
					openrouter.ai/keys
				</a>
				. It is checked with OpenRouter, then kept in this browser only. Using AI sends your deck text to OpenRouter on this key.
			</p>
			{replacing ? (
				<button type="button" onClick={() => { setReplacing(false); setError(null); setValue(''); }} className="mt-1 text-[11px] font-semibold text-[var(--accent)]">
					Keep the current key
				</button>
			) : null}
		</div>
	);
}
