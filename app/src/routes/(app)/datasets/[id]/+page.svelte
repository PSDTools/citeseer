<script lang="ts">
	import type { PageData } from './$types';
	import type { ColumnSchema } from '$lib/server/db/schema';

	let { data }: { data: PageData } = $props();

	const columns = $derived(data.dataset.schema as ColumnSchema[]);
	
	let showNormalizeModal = $state(false);
	let isNormalizing = $state(false);
	let normalizeResult = $state<{
		success: boolean;
		message: string;
		dateColumns?: { name: string; format: string }[];
	} | null>(null);

	async function normalizeDates() {
		isNormalizing = true;
		normalizeResult = null;

		try {
			const response = await fetch(`/api/datasets/${data.dataset.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'normalize-dates' })
			});

			const result = await response.json();
			
			if (!response.ok) {
				normalizeResult = {
					success: false,
					message: result.message || 'Failed to normalize dates'
				};
			} else {
				normalizeResult = result;
				// Refresh page to show updated data
				if (result.normalized > 0) {
					setTimeout(() => {
						window.location.reload();
					}, 2000);
				}
			}
		} catch (e) {
			normalizeResult = {
				success: false,
				message: e instanceof Error ? e.message : 'An error occurred'
			};
		} finally {
			isNormalizing = false;
		}
	}
</script>

<svelte:head>
	<title>{data.dataset.name} - CiteSeer</title>
</svelte:head>

<div class="p-8">
	<div class="mb-8">
		<a href="/datasets" class="text-sm text-white/50 hover:text-white/70 mb-2 inline-block">
			← Back to Datasets
		</a>
		<div class="flex items-start justify-between">
			<div>
				<h1 class="text-2xl font-bold text-white">{data.dataset.name}</h1>
				<p class="mt-1 text-white/60">
					{data.dataset.rowCount.toLocaleString()} rows · {columns.length} columns
				</p>
			</div>
			<button
				onclick={() => showNormalizeModal = true}
				class="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.05] hover:text-white transition-colors"
			>
				Normalize Dates
			</button>
		</div>
	</div>

	<!-- Schema -->
	<div class="mb-8">
		<h2 class="text-lg font-medium text-white mb-4">Schema</h2>
		<div class="overflow-hidden rounded-xl border border-white/10">
			<table class="w-full text-sm">
				<thead class="border-b border-white/10 bg-white/[0.02]">
					<tr>
						<th class="px-4 py-3 text-left font-medium text-white/50">Column</th>
						<th class="px-4 py-3 text-left font-medium text-white/50">Type</th>
						<th class="px-4 py-3 text-left font-medium text-white/50">Role</th>
						<th class="px-4 py-3 text-left font-medium text-white/50">Sample Values</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-white/5">
					{#each columns as col}
						<tr class="hover:bg-white/[0.02]">
							<td class="px-4 py-3 font-mono text-white">{col.name}</td>
							<td class="px-4 py-3 text-white/70">{col.dtype}</td>
							<td class="px-4 py-3">
								{#if col.isTimestamp}
									<span class="rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">timestamp</span>
								{:else if col.isMetric}
									<span class="rounded bg-green-500/20 px-2 py-0.5 text-xs text-green-400">metric</span>
								{:else if col.isEntityId}
									<span class="rounded bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400">entity_id</span>
								{:else if col.isCategorical}
									<span class="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">categorical</span>
								{:else}
									<span class="text-white/40">-</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-white/50 text-xs">
								{col.sampleValues?.slice(0, 3).join(', ') || '-'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Sample Data -->
	<div>
		<h2 class="text-lg font-medium text-white mb-4">Sample Data</h2>
		<div class="overflow-x-auto rounded-xl border border-white/10">
			<table class="w-full text-sm">
				<thead class="border-b border-white/10 bg-white/[0.02]">
					<tr>
						{#each columns.slice(0, 8) as col}
							<th class="px-4 py-3 text-left font-medium text-white/50 whitespace-nowrap">{col.name}</th>
						{/each}
						{#if columns.length > 8}
							<th class="px-4 py-3 text-left font-medium text-white/50">...</th>
						{/if}
					</tr>
				</thead>
				<tbody class="divide-y divide-white/5">
					{#each data.sampleRows.slice(0, 20) as row}
						<tr class="hover:bg-white/[0.02]">
							{#each columns.slice(0, 8) as col}
								<td class="px-4 py-2 text-white/70 whitespace-nowrap max-w-[200px] truncate">
									{row[col.name] ?? '-'}
								</td>
							{/each}
							{#if columns.length > 8}
								<td class="px-4 py-2 text-white/40">...</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if data.sampleRows.length >= 20}
			<p class="mt-2 text-center text-xs text-white/40">
				Showing first 20 rows of {data.dataset.rowCount.toLocaleString()}
			</p>
		{/if}
	</div>
</div>

<!-- Normalize Dates Modal -->
{#if showNormalizeModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
		<div class="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0e17] p-6 shadow-2xl">
			{#if normalizeResult}
				<!-- Result State -->
				<div class="text-center">
					{#if normalizeResult.success}
						<div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
							<svg class="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
						</div>
						<h3 class="text-lg font-medium text-white mb-2">Normalization Complete</h3>
						<p class="text-white/60 mb-4">{normalizeResult.message}</p>
						{#if normalizeResult.dateColumns && normalizeResult.dateColumns.length > 0}
							<div class="text-left bg-white/[0.02] rounded-lg p-3 mb-4">
								<p class="text-xs text-white/50 mb-2">Detected date columns:</p>
								{#each normalizeResult.dateColumns as col}
									<p class="text-sm text-white/70">
										<span class="font-mono text-green-400">{col.name}</span>
										<span class="text-white/40"> — {col.format}</span>
									</p>
								{/each}
							</div>
							<p class="text-xs text-white/40">Page will refresh shortly...</p>
						{/if}
					{:else}
						<div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
							<svg class="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</div>
						<h3 class="text-lg font-medium text-white mb-2">Error</h3>
						<p class="text-white/60 mb-4">{normalizeResult.message}</p>
					{/if}
					<button
						onclick={() => { showNormalizeModal = false; normalizeResult = null; }}
						class="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
					>
						Close
					</button>
				</div>
			{:else if isNormalizing}
				<!-- Loading State -->
				<div class="text-center py-4">
					<div class="mb-4 inline-flex h-12 w-12 items-center justify-center">
						<svg class="h-8 w-8 animate-spin text-green-400" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
					</div>
					<h3 class="text-lg font-medium text-white mb-2">Analyzing with AI...</h3>
					<p class="text-white/60 text-sm">Detecting date columns and normalizing values</p>
				</div>
			{:else}
				<!-- Confirmation State -->
				<div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
					<svg class="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
				</div>
				<h3 class="text-lg font-medium text-white mb-2">Normalize Date Columns</h3>
				<p class="text-white/60 text-sm mb-4">
					This will use AI to analyze your dataset and detect date/time columns, then convert them to a standard ISO format (YYYY-MM-DD).
				</p>
				<div class="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 mb-4">
					<p class="text-amber-400 text-xs font-medium mb-1">⚠️ AI Usage Warning</p>
					<p class="text-amber-400/70 text-xs">
						This operation will send sample data from your columns to the Gemini API for analysis. This will consume API credits.
					</p>
				</div>
				<div class="flex gap-3">
					<button
						onclick={() => showNormalizeModal = false}
						class="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/[0.05]"
					>
						Cancel
					</button>
					<button
						onclick={normalizeDates}
						class="flex-1 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-black hover:bg-green-400"
					>
						Normalize Dates
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
