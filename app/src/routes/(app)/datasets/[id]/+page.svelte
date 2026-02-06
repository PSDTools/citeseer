<script lang="ts">
	import type { PageData } from './$types';
	import type { ColumnSchema } from '$lib/server/db/schema';
	import Modal from '$lib/components/ui/Modal.svelte';

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

<div class="p-6 lg:p-8">
	<div class="mb-8">
		<a
			href="/datasets"
			class="mb-3 inline-flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-white/70"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Datasets
		</a>
		<div class="flex items-start justify-between">
			<div>
				<h1 class="text-2xl font-bold text-white">{data.dataset.name}</h1>
				<p class="mt-1 text-white/50">
					{data.dataset.rowCount.toLocaleString()} rows · {columns.length} columns
				</p>
			</div>
			<button
				onclick={() => (showNormalizeModal = true)}
				class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
			>
				Normalize Dates
			</button>
		</div>
	</div>

	<!-- Schema -->
	<div class="mb-8">
		<h2 class="mb-4 text-lg font-semibold text-white">Schema</h2>
		<div class="overflow-hidden rounded-xl border border-white/10">
			<table class="w-full text-sm">
				<thead class="border-b border-white/10 bg-white/[0.02]">
					<tr>
						<th class="px-4 py-3 text-left font-medium text-white/40">Column</th>
						<th class="px-4 py-3 text-left font-medium text-white/40">Type</th>
						<th class="px-4 py-3 text-left font-medium text-white/40">Role</th>
						<th class="px-4 py-3 text-left font-medium text-white/40">Sample Values</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-white/5">
					{#each columns as col}
						<tr class="transition-colors hover:bg-white/[0.02]">
							<td class="px-4 py-3 font-mono text-white">{col.name}</td>
							<td class="px-4 py-3 text-white/70">{col.dtype}</td>
							<td class="px-4 py-3">
								{#if col.isTimestamp}
									<span class="rounded-md bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400"
										>timestamp</span
									>
								{:else if col.isMetric}
									<span class="rounded-md bg-green-500/20 px-2 py-0.5 text-xs text-green-400"
										>metric</span
									>
								{:else if col.isEntityId}
									<span class="rounded-md bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400"
										>entity_id</span
									>
								{:else if col.isCategorical}
									<span class="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400"
										>categorical</span
									>
								{:else}
									<span class="text-white/30">-</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-xs text-white/50">
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
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-white">Sample Data</h2>
			{#if columns.length > 8}
				<span class="text-xs text-white/40">Showing 8 of {columns.length} columns</span>
			{/if}
		</div>
		<div class="overflow-x-auto rounded-xl border border-white/10">
			<table class="w-full text-sm">
				<thead class="border-b border-white/10 bg-white/[0.02]">
					<tr>
						{#each columns.slice(0, 8) as col}
							<th class="px-4 py-3 text-left font-medium whitespace-nowrap text-white/40"
								>{col.name}</th
							>
						{/each}
						{#if columns.length > 8}
							<th class="px-4 py-3 text-left font-medium text-white/30">...</th>
						{/if}
					</tr>
				</thead>
				<tbody class="divide-y divide-white/5">
					{#each data.sampleRows.slice(0, 20) as row}
						<tr class="transition-colors hover:bg-white/[0.02]">
							{#each columns.slice(0, 8) as col}
								<td class="max-w-[200px] truncate px-4 py-2 whitespace-nowrap text-white/70">
									{row[col.name] ?? '-'}
								</td>
							{/each}
							{#if columns.length > 8}
								<td class="px-4 py-2 text-white/30">...</td>
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
<Modal
	open={showNormalizeModal}
	onclose={() => {
		if (!isNormalizing) {
			showNormalizeModal = false;
			normalizeResult = null;
		}
	}}
	maxWidth="max-w-md"
>
	{#if normalizeResult}
		<div class="text-center">
			{#if normalizeResult.success}
				<div
					class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20"
				>
					<svg class="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>
				<h3 class="mb-2 text-lg font-semibold text-white">Normalization Complete</h3>
				<p class="mb-4 text-white/50">{normalizeResult.message}</p>
				{#if normalizeResult.dateColumns && normalizeResult.dateColumns.length > 0}
					<div class="mb-4 rounded-lg bg-white/[0.02] p-3 text-left">
						<p class="mb-2 text-xs text-white/50">Detected date columns:</p>
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
				<div
					class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20"
				>
					<svg class="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</div>
				<h3 class="mb-2 text-lg font-semibold text-white">Error</h3>
				<p class="mb-4 text-white/50">{normalizeResult.message}</p>
			{/if}
			<button
				onclick={() => {
					showNormalizeModal = false;
					normalizeResult = null;
				}}
				class="rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
			>
				Close
			</button>
		</div>
	{:else if isNormalizing}
		<div class="py-4 text-center">
			<div class="mb-4 inline-flex h-12 w-12 items-center justify-center">
				<svg class="h-8 w-8 animate-spin text-[#64ff96]" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
			</div>
			<h3 class="mb-2 text-lg font-semibold text-white">Analyzing with AI...</h3>
			<p class="text-sm text-white/50">Detecting date columns and normalizing values</p>
		</div>
	{:else}
		<div
			class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20"
		>
			<svg class="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
		</div>
		<h3 class="mb-2 text-lg font-semibold text-white">Normalize Date Columns</h3>
		<p class="mb-4 text-sm text-white/50">
			This will use AI to detect date/time columns and convert them to ISO format (YYYY-MM-DD).
		</p>
		<div class="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
			<p class="mb-1 text-xs font-medium text-amber-400">AI Usage Warning</p>
			<p class="text-xs text-amber-400/70">
				This will send sample data to the Gemini API for analysis.
			</p>
		</div>
		<div class="flex gap-3">
			<button
				onclick={() => (showNormalizeModal = false)}
				class="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
			>
				Cancel
			</button>
			<button
				onclick={normalizeDates}
				class="flex-1 rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20"
			>
				Normalize Dates
			</button>
		</div>
	{/if}
</Modal>
