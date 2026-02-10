<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import FileUploader from '$lib/components/datasets/FileUploader.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		X,
		Trash2,
		Database,
		Check,
		TriangleAlert,
		LoaderCircle,
		CircleAlert,
	} from '@lucide/svelte';
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
	let normalizeProgress = $state<{
		current: number;
		total: number;
		results: Array<{ name: string; success: boolean; message: string }>;
	}>({ current: 0, total: 0, results: [] });

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
				body: formData,
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
				method: 'DELETE',
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
				body: JSON.stringify({ action: 'clean-all-columns' }),
			});

			const result = await response.json();
			cleanAllResult = {
				success: response.ok,
				message: result.message || (response.ok ? 'Cleaned successfully' : 'Failed to clean'),
			};

			if (response.ok) {
				await invalidateAll();
			}
		} catch (e) {
			cleanAllResult = {
				success: false,
				message: e instanceof Error ? e.message : 'Error',
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
					body: JSON.stringify({ action: 'normalize-dates' }),
				});

				const result = await response.json();
				normalizeProgress.results = [
					...normalizeProgress.results,
					{
						name: dataset.name,
						success: response.ok,
						message: result.message || (response.ok ? 'Success' : 'Failed'),
					},
				];
			} catch (e) {
				normalizeProgress.results = [
					...normalizeProgress.results,
					{
						name: dataset.name,
						success: false,
						message: e instanceof Error ? e.message : 'Error',
					},
				];
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
		<div
			class="mb-6 flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
		>
			<span>{error}</span>
			<button
				onclick={() => (error = null)}
				class="ml-2 text-red-400/70 hover:text-red-400"
				aria-label="Dismiss error"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	{/if}

	{#if cleanAllResult}
		<div
			class="mb-6 rounded-lg {cleanAllResult.success
				? 'border-green-500/20 bg-green-500/10 text-green-400'
				: 'border-red-500/20 bg-red-500/10 text-red-400'} flex items-center justify-between border px-4 py-3 text-sm"
		>
			<span>{cleanAllResult.message}</span>
			<button
				onclick={() => (cleanAllResult = null)}
				class="ml-2 opacity-70 hover:opacity-100"
				aria-label="Dismiss message"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	{/if}

	<FileUploader onUpload={handleUpload} {uploading} />

	{#if data.datasets.length > 0}
		<div class="mt-8">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-white">Uploaded Datasets</h2>
				<div class="flex gap-2">
					<button
						onclick={() => (showCleanModal = true)}
						disabled={isCleaningAll}
						class="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
					>
						Clean Column Names
					</button>
					<button
						onclick={() => (showNormalizeAllModal = true)}
						class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
					>
						Normalize All Dates
					</button>
				</div>
			</div>
			<div class="overflow-hidden rounded-xl border border-white/10">
				<table class="w-full">
					<thead class="border-b border-white/10 bg-white/[0.02]">
						<tr>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-white/40 uppercase"
								>Name</th
							>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-white/40 uppercase"
								>Rows</th
							>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-white/40 uppercase"
								>Columns</th
							>
							<th
								class="px-6 py-3 text-left text-xs font-medium tracking-wider text-white/40 uppercase"
								>Uploaded</th
							>
							<th
								class="px-6 py-3 text-right text-xs font-medium tracking-wider text-white/40 uppercase"
								>Actions</th
							>
						</tr>
					</thead>
					<tbody class="divide-y divide-white/5">
						{#each data.datasets as dataset}
							<tr class="transition-colors hover:bg-white/[0.02]">
								<td class="px-6 py-4">
									<a
										href="/datasets/{dataset.id}"
										class="font-medium text-white transition-colors hover:text-[#64ff96]"
									>
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
								<td class="px-6 py-4 text-sm text-white/50">
									{new Date(dataset.createdAt).toLocaleDateString()}
								</td>
								<td class="px-6 py-4 text-right">
									<button
										onclick={() => (deleteTarget = { id: dataset.id, name: dataset.name })}
										class="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400"
										aria-label="Delete dataset"
									>
										<Trash2 class="h-5 w-5" />
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{:else}
		<div
			class="mt-8 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center"
		>
			<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
				<Database class="h-7 w-7 text-white/30" />
			</div>
			<h3 class="text-base font-medium text-white">No datasets yet</h3>
			<p class="mt-1 text-sm text-white/50">Upload a file above to get started</p>
		</div>
	{/if}
</div>

<!-- Delete Confirmation Dialog -->
<Modal open={deleteTarget !== null} onclose={() => (deleteTarget = null)} maxWidth="max-w-sm">
	<h2 class="mb-2 text-lg font-semibold text-white">Delete Dataset</h2>
	<p class="mb-6 text-sm text-white/50">
		Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
	</p>

	<div class="flex justify-end gap-3">
		<button
			type="button"
			onclick={() => (deleteTarget = null)}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={handleDelete}
			disabled={isDeleteProcessing}
			class="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if isDeleteProcessing}Deleting...{:else}Delete{/if}
		</button>
	</div>
</Modal>

<!-- Clean Column Names Confirmation -->
<Modal open={showCleanModal} onclose={() => (showCleanModal = false)} maxWidth="max-w-sm">
	<h2 class="mb-2 text-lg font-semibold text-white">Clean Column Names</h2>
	<p class="mb-6 text-sm text-white/50">
		This will remove pipe characters (|) and trim spaces from all column names in all datasets.
	</p>

	<div class="flex justify-end gap-3">
		<button
			type="button"
			onclick={() => (showCleanModal = false)}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={() => {
				showCleanModal = false;
				cleanAllColumns();
			}}
			class="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-all hover:bg-amber-400"
		>
			Clean All
		</button>
	</div>
</Modal>

<!-- Normalize All Modal -->
<Modal
	open={showNormalizeAllModal}
	onclose={() => {
		if (!isNormalizingAll) {
			showNormalizeAllModal = false;
			normalizeProgress = { current: 0, total: 0, results: [] };
		}
	}}
>
	{#if normalizeProgress.results.length > 0}
		<div>
			<h3 class="mb-4 text-lg font-semibold text-white">Normalization Results</h3>
			<div class="mb-4 max-h-64 space-y-2 overflow-y-auto">
				{#each normalizeProgress.results as result}
					<div class="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2">
						{#if result.success}
							<Check class="h-5 w-5 flex-shrink-0 text-green-400" />
						{:else}
							<CircleAlert class="h-5 w-5 flex-shrink-0 text-amber-400" />
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm text-white">{result.name}</p>
							<p class="text-xs text-white/50">{result.message}</p>
						</div>
					</div>
				{/each}
			</div>
			<button
				onclick={() => {
					showNormalizeAllModal = false;
					normalizeProgress = { current: 0, total: 0, results: [] };
				}}
				class="w-full rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
			>
				Close
			</button>
		</div>
	{:else if isNormalizingAll}
		<div class="py-4 text-center">
			<div class="mb-4 inline-flex h-12 w-12 items-center justify-center">
				<LoaderCircle class="h-8 w-8 animate-spin text-[#64ff96]" />
			</div>
			<h3 class="mb-2 text-lg font-semibold text-white">Normalizing Datasets...</h3>
			<p class="text-sm text-white/50">
				Processing {normalizeProgress.current} of {normalizeProgress.total}
			</p>
			<div class="mt-4 h-1.5 w-full rounded-full bg-white/10">
				<div
					class="h-1.5 rounded-full bg-[#64ff96] transition-all"
					style="width: {(normalizeProgress.current / normalizeProgress.total) * 100}%"
				></div>
			</div>
		</div>
	{:else}
		<div
			class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20"
		>
			<TriangleAlert class="h-6 w-6 text-amber-400" />
		</div>
		<h3 class="mb-2 text-lg font-semibold text-white">Normalize All Datasets</h3>
		<p class="mb-4 text-sm text-white/50">
			This will normalize date columns across all {data.datasets.length} dataset(s). This includes:
		</p>
		<ul class="mb-4 list-inside list-disc space-y-1 text-sm text-white/50">
			<li>Cleaning column names (removing pipes/spaces)</li>
			<li>Detecting date columns using AI</li>
			<li>Converting dates to ISO format</li>
		</ul>
		<div class="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
			<p class="mb-1 text-xs font-medium text-amber-400">AI Usage Warning</p>
			<p class="text-xs text-amber-400/70">
				This will make {data.datasets.length} API call(s) to Gemini for date detection.
			</p>
		</div>
		<div class="flex gap-3">
			<button
				onclick={() => (showNormalizeAllModal = false)}
				class="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
