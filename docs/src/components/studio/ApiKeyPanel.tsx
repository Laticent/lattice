import { KeyRound, Loader2 } from 'lucide-react';
import * as React from 'react';
import { notify } from '@/lib/notify';
import { openRouterKeyHint, providerKeyHint } from '@/lib/openrouter-key.js';
import { cn } from '@/lib/utils';
import { saveProviderKey } from './api-key';
import { type ArchitectStatus, type CloudProvider, removeProviderKey, switchProvider } from './architect';
import { KEY_PROVIDER_INFO } from './key-providers';

const ORDER: CloudProvider[] = ['openrouter', 'openai', 'anthropic', 'gemini'];
const hintFor = (p: CloudProvider) => (p === 'openrouter' ? openRouterKeyHint() : providerKeyHint(p));

/**
 * Workspace → AI → API key: paste your own key — OpenRouter (the default) or a direct OpenAI,
 * Anthropic or Gemini key (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §7).
 *
 * Every key is checked with its provider before it is stored, never shown again (only its last
 * four characters), and lives in this browser, sealed, through lib/openrouter-key.js. One provider
 * runs the cloud tier at a time; a saved key for another can be switched to with "Use".
 * "API key" is a way to CONNECT the cloud tier, not a third backend, so spend, standing
 * instructions and the model picker under Cloud all follow the provider in use.
 */
export function ApiKeyPanel({ status }: { status: ArchitectStatus }) {
	const [provider, setProvider] = React.useState<CloudProvider>(status.provider ?? 'openrouter');
	const [value, setValue] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [replacing, setReplacing] = React.useState(false);
	// Re-read on every status change (a save, a remove, a rejection fires db-model-changed).
	// biome-ignore lint/correctness/useExhaustiveDependencies: status is the refresh trigger
	const hints = React.useMemo(() => Object.fromEntries(ORDER.map((p) => [p, hintFor(p)])) as Record<CloudProvider, string | null>, [status]);
	const inputId = React.useId();
	const info = KEY_PROVIDER_INFO[provider];
	const active = status.openRouterReady ? (status.provider ?? 'openrouter') : null;
	const saved = ORDER.filter((p) => hints[p]);
	const showForm = !hints[provider] || replacing;

	const pick = (p: CloudProvider) => {
		setProvider(p);
		setReplacing(false);
		setError(null);
		setValue('');
	};
	const save = async () => {
		setBusy(true);
		setError(null);
		const out = await saveProviderKey(provider, value);
		setBusy(false);
		if (out.ok) {
			setValue('');
			setReplacing(false);
			notify(`${info.label} key saved — Cloud is active on ${info.label}.`);
		} else setError(out.note);
	};
	const remove = async (p: CloudProvider) => {
		await removeProviderKey(p);
		notify(`${KEY_PROVIDER_INFO[p].label} key removed from this browser.`);
	};
	const use = async (p: CloudProvider) => {
		await switchProvider(p);
		notify(`Cloud now runs on ${KEY_PROVIDER_INFO[p].label}.`);
	};

	return (
		<div>
			{saved.length ? (
				<ul className="mb-3 flex flex-col gap-1.5" aria-label="Saved keys">
					{saved.map((p) => {
						const isActive = active === p;
						const rejected = isActive && status.openRouterKeyInvalid;
						return (
							<li key={p} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5', isActive ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}>
								<span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
									<KeyRound className="size-4" />
								</span>
								{/* Wraps the buttons onto their own line on a phone rather than squeezing the name. */}
								<span className="min-w-[9rem] flex-1">
									<div className="text-[13px] font-semibold text-[var(--text-heading)]">
										{KEY_PROVIDER_INFO[p].label} key {hints[p]}
									</div>
									<div className="text-[11px] text-muted-foreground">{rejected ? `Rejected by ${KEY_PROVIDER_INFO[p].label} — replace it.` : isActive ? 'In use · saved in this browser.' : 'Saved in this browser.'}</div>
								</span>
								<span className="ml-auto flex shrink-0 gap-1.5">
									{!isActive ? (
										<button type="button" onClick={() => use(p)} className="rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)]">
											Use
										</button>
									) : null}
									<button
										type="button"
										onClick={() => {
											pick(p);
											setReplacing(true);
										}}
										className="rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)]"
										aria-label={`Replace the ${KEY_PROVIDER_INFO[p].label} key`}
									>
										Replace
									</button>
									<button type="button" onClick={() => remove(p)} className="rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)]" aria-label={`Remove the ${KEY_PROVIDER_INFO[p].label} key`}>
										Remove
									</button>
								</span>
							</li>
						);
					})}
				</ul>
			) : null}

			<fieldset className="m-0 flex min-w-0 gap-1 rounded-lg border border-border p-0.5" aria-label="Key provider">
				{ORDER.map((p) => (
					<button
						type="button"
						key={p}
						aria-pressed={provider === p}
						onClick={() => pick(p)}
						className={cn('flex-1 rounded-md px-1.5 py-1 text-[12px] font-semibold', provider === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-[var(--text-heading)]')}
					>
						{KEY_PROVIDER_INFO[p].label}
					</button>
				))}
			</fieldset>

			{showForm ? (
				<div className="mt-2.5">
					<label htmlFor={inputId} className="text-[12px] font-semibold text-[var(--text-heading)]">
						{info.label} API key
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
							placeholder={info.placeholder}
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
						<a href={info.keysUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--accent)]">
							{info.keysHost}
						</a>
						. It is checked with {info.label}, then kept in this browser only. Using AI sends your deck text to {info.label} on this key.
						{provider !== 'openrouter' ? ` ${info.label} cannot report a balance to the browser, so spend shows an estimate from token counts.` : ''}
					</p>
					{replacing ? (
						<button
							type="button"
							onClick={() => {
								setReplacing(false);
								setError(null);
								setValue('');
							}}
							className="mt-1 text-[11px] font-semibold text-[var(--accent)]"
						>
							Keep the current key
						</button>
					) : null}
				</div>
			) : (
				<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Pick a model and see spend under Cloud; a pasted key and a signed-in one work the same way.</p>
			)}
		</div>
	);
}
