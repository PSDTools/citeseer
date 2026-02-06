<script lang="ts">
	import type { ChartSelectDetail } from '$lib/types/toon';

	interface Props {
		detail: ChartSelectDetail;
		x: number;
		y: number;
		lastQuestion?: string;
		disabled?: boolean;
		onsubmit: (prompt: string) => void;
		onclose: () => void;
	}

	let { detail, x, y, lastQuestion, disabled = false, onsubmit, onclose }: Props = $props();

	let branchPrompt = $state('');

	function handleSubmit() {
		const prompt = branchPrompt.trim();
		if (!prompt) return;
		onsubmit(prompt);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} onclick={onclose} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed z-50 w-[360px] rounded-xl border border-white/10 bg-[#0a0d14] p-4 shadow-2xl"
	style="left: {x}px; top: {y}px;"
	onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => e.stopPropagation()}
>
	<div class="mb-3 space-y-2">
		<div class="text-xs font-medium text-white/70">Selected Context</div>

		{#if lastQuestion}
			<div class="text-xs text-white/50">
				<span class="text-white/40">Question:</span>
				<span class="text-white/80 italic"> "{lastQuestion}"</span>
			</div>
		{/if}

		{#if detail.panelTitle}
			<div class="text-xs text-white/50">
				<span class="text-white/40">Panel:</span>
				<span class="text-white/80"> {detail.panelTitle}</span>
			</div>
		{/if}

		{#if detail.datum && Object.keys(detail.datum).length > 0}
			<div class="max-h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
				<div class="mb-1 text-[10px] tracking-wide text-white/40 uppercase">Data Point</div>
				<div class="space-y-0.5">
					{#each Object.entries(detail.datum) as [key, val]}
						<div class="flex justify-between gap-2 text-xs">
							<span class="truncate text-white/50">{key}</span>
							<span class="text-right font-mono text-[#64ff96]"
								>{val != null ? String(val) : '—'}</span
							>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="text-xs text-white/50">
				{detail.field}: <span class="text-[#64ff96]">{String(detail.value)}</span>
			</div>
			{#if detail.metricField && detail.metricValue != null}
				<div class="text-xs text-white/50">
					{detail.metricField}: <span class="text-white/80">{String(detail.metricValue)}</span>
				</div>
			{/if}
		{/if}
	</div>

	<label class="mb-1 block text-xs text-white/50" for="branch-prompt"
		>Ask a question about this data</label
	>
	<textarea
		id="branch-prompt"
		bind:value={branchPrompt}
		rows="3"
		class="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
		placeholder="Ask about this…"
	></textarea>

	<div class="mt-3 flex justify-end gap-2">
		<button
			type="button"
			onclick={onclose}
			class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={handleSubmit}
			disabled={!branchPrompt.trim() || disabled}
			class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-3 py-1.5 text-xs font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:cursor-not-allowed disabled:opacity-50"
		>
			Ask
		</button>
	</div>
</div>
