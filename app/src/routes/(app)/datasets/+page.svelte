<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import FileUploader from '$lib/components/datasets/FileUploader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let uploading = $state(false);
	let error = $state<string | null>(null);
	
	// Mass normalize state
	let showNormalizeAllModal = $state(false);
	let isNormalizingAll = $state(false);
	let normalizeProgress = $state<{ current: number; total: number; results: Array<{ name: string; success: boolean; message: string }> }>({ current: 0, total: 0, results: [] });

	// Clean all columns state
	let isCleaningAll = $state(false);
	let cleanAllResult = $state<{ success: boolean; message: string } | null>(null);

	async function handleUpload(file: File) {
		uploading = true;
		error = null;

		try {
			const formData = new FormData();
			formData.append('file', file);

			const response = await fetch('/api/datasets', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Upload failed');
			}

			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	async function handleDelete(id: string, name: string) {
		if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

		try {
			const response = await fetch(`/api/datasets/${id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Delete failed');
			}

			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Delete failed';
		}
	}

	async function cleanAllColumns() {
		if (!confirm('This will remove pipe characters (|) and trim spaces from all column names in all datasets. Continue?')) return;

		isCleaningAll = true;
		cleanAllResult = null;

		try {
			const response = await fetch('/api/datasets', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'clean-all-columns' })
			});

			const result = await response.json();
			cleanAllResult = {
				success: response.ok,
				message: result.message || (response.ok ? 'Cleaned successfully' : 'Failed to clean')
			};

			if (response.ok) {
				await invalidateAll();
			}
		} catch (e) {
			cleanAllResult = {
				success: false,
				message: e instanceof Error ? e.message : 'Error'
			};
		} finally {
			isCleaningAll = false;
		}
	}

	async function normalizeAllDatasets() {
		isNormalizingAll = true;
		const datasets = data.datasets;
		normalizeProgress = { current: 0, total: datasets.length, results: [] };

		for (const dataset of datasets) {
			normalizeProgress.current++;
			
			try {
				const response = await fetch(`/api/datasets/${dataset.id}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'normalize-dates' })
				});

				const result = await response.json();
				normalizeProgress.results = [...normalizeProgress.results, {
					name: dataset.name,
					success: response.ok,
					message: result.message || (response.ok ? 'Success' : 'Failed')
				}];
			} catch (e) {
				normalizeProgress.results = [...normalizeProgress.results, {
					name: dataset.name,
					success: false,
					message: e instanceof Error ? e.message : 'Error'
				}];
			}
		}

		isNormalizingAll = false;
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>Datasets - SiteSeer</title>
</svelte:head>

<div class="p-8">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-white">Datasets</h1>
		<p class="mt-1 text-white/60">Manage your uploaded data</p>
	</div>

	{#if error}
		<div class="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
			{error}
			<button onclick={() => (error = null)} class="ml-2 underline">Dismiss</button>
		</div>
	{/if}

	{#if cleanAllResult}
		<div class="mb-6 rounded-lg {cleanAllResult.success ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'} border px-4 py-3 text-sm">
			{cleanAllResult.message}
			<button onclick={() => (cleanAllResult = null)} class="ml-2 underline">Dismiss</button>
		</div>
	{/if}

	<FileUploader onUpload={handleUpload} {uploading} />

	{#if data.datasets.length > 0}
		<div class="mt-8">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-medium text-white">Uploaded Datasets</h2>
				<div class="flex gap-2">
					<button
						onclick={cleanAllColumns}
						disabled={isCleaningAll}
						class="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
					>
						{isCleaningAll ? 'Cleaning...' : 'Clean Column Names'}
					</button>
					<button
						onclick={() => showNormalizeAllModal = true}
						class="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-white/70 hover:bg-white/[0.05] hover:text-white transition-colors"
					>
						Normalize All Dates
					</button>
				</div>
			</div>
			<div class="overflow-hidden rounded-xl border border-white/10">
				<table class="w-full">
					<thead class="border-b border-white/10 bg-white/[0.02]">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/50">Name</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/50">Rows</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/50">Columns</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/50">Uploaded</th>
							<th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/50">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-white/5">
						{#each data.datasets as dataset}
							<tr class="hover:bg-white/[0.02]">
								<td class="px-6 py-4">
									<a href="/datasets/{dataset.id}" class="font-medium text-white hover:text-[#64ff96]">
										{dataset.name}
									</a>
									<p class="text-sm text-white/50">{dataset.fileName}</p>
								</td>
								<td class="px-6 py-4 text-white/70">
									{dataset.rowCount.toLocaleString()}
								</td>
								<td class="px-6 py-4 text-white/70">
									{dataset.columnCount}
								</td>
								<td class="px-6 py-4 text-white/50 text-sm">
									{new Date(dataset.createdAt).toLocaleDateString()}
								</td>
								<td class="px-6 py-4 text-right">
									<button
										onclick={() => handleDelete(dataset.id, dataset.name)}
										class="text-red-400 hover:text-red-300"
										aria-label="Delete dataset"
									>
										<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<!-- Normalize All Modal -->
{#if showNormalizeAllModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
		<div class="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a0e17] p-6 shadow-2xl">
			{#if normalizeProgress.results.length > 0}
				<!-- Results State -->
				<div>
					<h3 class="text-lg font-medium text-white mb-4">Normalization Results</h3>
					<div class="max-h-64 overflow-y-auto space-y-2 mb-4">
						{#each normalizeProgress.results as result}
							<div class="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2">
								{#if result.success}
									<svg class="h-5 w-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									</svg>
								{:else}
									<svg class="h-5 w-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01" />
									</svg>
								{/if}
								<div class="flex-1 min-w-0">
									<p class="text-sm text-white truncate">{result.name}</p>
									<p class="text-xs text-white/50">{result.message}</p>
								</div>
							</div>
						{/each}
					</div>
					<button
						onclick={() => { showNormalizeAllModal = false; normalizeProgress = { current: 0, total: 0, results: [] }; }}
						class="w-full rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
					>
						Close
					</button>
				</div>
			{:else if isNormalizingAll}
				<!-- Progress State -->
				<div class="text-center py-4">
					<div class="mb-4 inline-flex h-12 w-12 items-center justify-center">
						<svg class="h-8 w-8 animate-spin text-green-400" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
					</div>
					<h3 class="text-lg font-medium text-white mb-2">Normalizing Datasets...</h3>
					<p class="text-white/60 text-sm">
						Processing {normalizeProgress.current} of {normalizeProgress.total}
					</p>
					<div class="mt-4 w-full bg-white/10 rounded-full h-2">
						<div 
							class="bg-green-400 h-2 rounded-full transition-all"
							style="width: {(normalizeProgress.current / normalizeProgress.total) * 100}%"
						></div>
					</div>
				</div>
			{:else}
				<!-- Confirmation State -->
				<div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
					<svg class="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
				</div>
				<h3 class="text-lg font-medium text-white mb-2">Normalize All Datasets</h3>
				<p class="text-white/60 text-sm mb-4">
					This will normalize date columns across all {data.datasets.length} dataset(s). This includes:
				</p>
				<ul class="text-white/60 text-sm mb-4 space-y-1 list-disc list-inside">
					<li>Cleaning column names (removing pipes/spaces)</li>
					<li>Detecting date columns using AI</li>
					<li>Converting dates to ISO format</li>
				</ul>
				<div class="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 mb-4">
					<p class="text-amber-400 text-xs font-medium mb-1">⚠️ AI Usage Warning</p>
					<p class="text-amber-400/70 text-xs">
						This will make {data.datasets.length} API call(s) to Gemini for date detection. This will consume API credits.
					</p>
				</div>
				<div class="flex gap-3">
					<button
						onclick={() => showNormalizeAllModal = false}
						class="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/[0.05]"
					>
						Cancel
					</button>
					<button
						onclick={normalizeAllDatasets}
						class="flex-1 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-black hover:bg-green-400"
					>
						Normalize All
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
