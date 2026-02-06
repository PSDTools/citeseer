<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import FileUploader from '$lib/components/datasets/FileUploader.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let uploading = $state(false);
	let error = $state<string | null>(null);

	// Delete state
	let deleteTarget = $state<{ id: string; name: string } | null>(null);
	let isDeleteProcessing = $state(false);

	// Mass normalize state
	let showNormalizeAllModal = $state(false);
	let isNormalizingAll = $state(false);
	let normalizeProgress = $state<{ current: number; total: number; results: Array<{ name: string; success: boolean; message: string }> }>({ current: 0, total: 0, results: [] });

	// Clean all columns state
	let showCleanModal = $state(false);
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

	async function handleDelete() {
		if (!deleteTarget) return;
		isDeleteProcessing = true;

		try {
			const response = await fetch(`/api/datasets/${deleteTarget.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Delete failed');
			}

			deleteTarget = null;
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Delete failed';
		} finally {
			isDeleteProcessing = false;
		}
	}

	async function cleanAllColumns() {
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
	<title>Datasets - CiteSeer</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-white">Datasets</h1>
		<p class="mt-1 text-white/50">Manage your uploaded data</p>
	</div>

	{#if error}
		<div class="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex items-center justify-between">
			<span>{error}</span>
			<button onclick={() => (error = null)} class="text-red-400/70 hover:text-red-400 ml-2">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/if}

	{#if cleanAllResult}
		<div class="mb-6 rounded-lg {cleanAllResult.success ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'} border px-4 py-3 text-sm flex items-center justify-between">
			<span>{cleanAllResult.message}</span>
			<button onclick={() => (cleanAllResult = null)} class="opacity-70 hover:opacity-100 ml-2">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/if}

	<FileUploader onUpload={handleUpload} {uploading} />

	{#if data.datasets.length > 0}
		<div class="mt-8">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-white">Uploaded Datasets</h2>
				<div class="flex gap-2">
					<button
						onclick={() => showCleanModal = true}
						disabled={isCleaningAll}
						class="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
					>
						Clean Column Names
					</button>
					<button
						onclick={() => showNormalizeAllModal = true}
						class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
					>
						Normalize All Dates
					</button>
				</div>
			</div>
			<div class="overflow-hidden rounded-xl border border-white/10">
				<table class="w-full">
					<thead class="border-b border-white/10 bg-white/[0.02]">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/40">Name</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/40">Rows</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/40">Columns</th>
							<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/40">Uploaded</th>
							<th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/40">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-white/5">
						{#each data.datasets as dataset}
							<tr class="hover:bg-white/[0.02] transition-colors">
								<td class="px-6 py-4">
									<a href="/datasets/{dataset.id}" class="font-medium text-white hover:text-[#64ff96] transition-colors">
										{dataset.name}
									</a>
									<p class="text-sm text-white/40">{dataset.fileName}</p>
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
										onclick={() => deleteTarget = { id: dataset.id, name: dataset.name }}
										class="rounded-lg p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
	{:else}
		<div class="mt-8 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
			<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
				<svg class="h-7 w-7 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
				</svg>
			</div>
			<h3 class="text-base font-medium text-white">No datasets yet</h3>
			<p class="mt-1 text-sm text-white/50">Upload a CSV file above to get started</p>
		</div>
	{/if}
</div>

<!-- Delete Confirmation Dialog -->
<Modal open={deleteTarget !== null} onclose={() => deleteTarget = null} maxWidth="max-w-sm">
	<h2 class="text-lg font-semibold text-white mb-2">Delete Dataset</h2>
	<p class="text-white/50 text-sm mb-6">
		Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
	</p>

	<div class="flex justify-end gap-3">
		<button
			type="button"
			onclick={() => deleteTarget = null}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={handleDelete}
			disabled={isDeleteProcessing}
			class="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{#if isDeleteProcessing}Deleting...{:else}Delete{/if}
		</button>
	</div>
</Modal>

<!-- Clean Column Names Confirmation -->
<Modal open={showCleanModal} onclose={() => showCleanModal = false} maxWidth="max-w-sm">
	<h2 class="text-lg font-semibold text-white mb-2">Clean Column Names</h2>
	<p class="text-white/50 text-sm mb-6">
		This will remove pipe characters (|) and trim spaces from all column names in all datasets.
	</p>

	<div class="flex justify-end gap-3">
		<button
			type="button"
			onclick={() => showCleanModal = false}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={() => { showCleanModal = false; cleanAllColumns(); }}
			class="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-amber-400"
		>
			Clean All
		</button>
	</div>
</Modal>

<!-- Normalize All Modal -->
<Modal open={showNormalizeAllModal} onclose={() => { if (!isNormalizingAll) { showNormalizeAllModal = false; normalizeProgress = { current: 0, total: 0, results: [] }; } }}>
	{#if normalizeProgress.results.length > 0}
		<div>
			<h3 class="text-lg font-semibold text-white mb-4">Normalization Results</h3>
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
				class="w-full rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 transition-colors"
			>
				Close
			</button>
		</div>
	{:else if isNormalizingAll}
		<div class="text-center py-4">
			<div class="mb-4 inline-flex h-12 w-12 items-center justify-center">
				<svg class="h-8 w-8 animate-spin text-[#64ff96]" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
				</svg>
			</div>
			<h3 class="text-lg font-semibold text-white mb-2">Normalizing Datasets...</h3>
			<p class="text-white/50 text-sm">
				Processing {normalizeProgress.current} of {normalizeProgress.total}
			</p>
			<div class="mt-4 w-full bg-white/10 rounded-full h-1.5">
				<div
					class="bg-[#64ff96] h-1.5 rounded-full transition-all"
					style="width: {(normalizeProgress.current / normalizeProgress.total) * 100}%"
				></div>
			</div>
		</div>
	{:else}
		<div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
			<svg class="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
			</svg>
		</div>
		<h3 class="text-lg font-semibold text-white mb-2">Normalize All Datasets</h3>
		<p class="text-white/50 text-sm mb-4">
			This will normalize date columns across all {data.datasets.length} dataset(s). This includes:
		</p>
		<ul class="text-white/50 text-sm mb-4 space-y-1 list-disc list-inside">
			<li>Cleaning column names (removing pipes/spaces)</li>
			<li>Detecting date columns using AI</li>
			<li>Converting dates to ISO format</li>
		</ul>
		<div class="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 mb-4">
			<p class="text-amber-400 text-xs font-medium mb-1">AI Usage Warning</p>
			<p class="text-amber-400/70 text-xs">
				This will make {data.datasets.length} API call(s) to Gemini for date detection.
			</p>
		</div>
		<div class="flex gap-3">
			<button
				onclick={() => showNormalizeAllModal = false}
				class="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
			>
				Cancel
			</button>
			<button
				onclick={normalizeAllDatasets}
				class="flex-1 rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20"
			>
				Normalize All
			</button>
		</div>
	{/if}
</Modal>
