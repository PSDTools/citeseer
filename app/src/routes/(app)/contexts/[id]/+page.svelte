<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import ChartPanel from '$lib/components/viz/ChartPanel.svelte';
	import type { PageData } from './$types';
	import type { AnalyticalPlan, QueryResult } from '$lib/types/toon';

	let { data }: { data: PageData } = $props();

	// Query state
	let question = $state('');
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let currentPlan = $state<AnalyticalPlan | null>(null);
	let results = $state<Record<number, QueryResult> | null>(null);

	// Save dashboard state
	let showSaveDialog = $state(false);
	let saveName = $state('');
	let saveDescription = $state('');
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);

	// Add datasets state
	let showAddDatasets = $state(false);
	let selectedDatasets = $state<Set<string>>(new Set());

	// Edit context state
	let showEditDialog = $state(false);
	let editName = $state('');
	let editDescription = $state('');
	let isEditing = $state(false);
	let editError = $state<string | null>(null);

	// Delete context state
	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);

	async function handleSubmit() {
		if (!question.trim() || isLoading) return;

		isLoading = true;
		error = null;
		currentPlan = null;
		results = null;

		try {
			const response = await fetch('/api/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question,
					contextId: data.context.id
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Query failed');
			}

			currentPlan = result.plan;
			results = result.results;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to execute query';
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function openSaveDialog() {
		saveName = question.slice(0, 100);
		saveDescription = '';
		saveError = null;
		showSaveDialog = true;
	}

	async function handleSave() {
		if (!saveName.trim() || !currentPlan) return;

		isSaving = true;
		saveError = null;

		try {
			const response = await fetch('/api/dashboards', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: saveName.trim(),
					question,
					description: saveDescription.trim() || undefined,
					plan: currentPlan,
					panels: currentPlan.viz || [],
					contextId: data.context.id
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.message || 'Failed to save');
			}

			showSaveDialog = false;
			invalidateAll();
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Failed to save dashboard';
		} finally {
			isSaving = false;
		}
	}

	async function removeDataset(datasetId: string) {
		await fetch(`/api/contexts/${data.context.id}/datasets`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ datasetId })
		});
		invalidateAll();
	}

	async function addSelectedDatasets() {
		if (selectedDatasets.size === 0) return;

		await fetch(`/api/contexts/${data.context.id}/datasets`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ datasetIds: Array.from(selectedDatasets) })
		});

		selectedDatasets = new Set();
		showAddDatasets = false;
		invalidateAll();
	}

	function openEditDialog() {
		editName = data.context.name;
		editDescription = data.context.description || '';
		editError = null;
		showEditDialog = true;
	}

	async function handleEdit() {
		if (!editName.trim()) return;

		isEditing = true;
		editError = null;

		try {
			const response = await fetch(`/api/contexts/${data.context.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: editName.trim(),
					description: editDescription.trim() || null
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.message || 'Failed to update');
			}

			showEditDialog = false;
			invalidateAll();
		} catch (e) {
			editError = e instanceof Error ? e.message : 'Failed to update context';
		} finally {
			isEditing = false;
		}
	}

	async function handleDelete() {
		isDeleting = true;

		try {
			const response = await fetch(`/api/contexts/${data.context.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete');
			}

			goto('/dashboard');
		} catch (e) {
			isDeleting = false;
			showDeleteConfirm = false;
		}
	}

	// Get datasets not already in this context
	const availableDatasets = $derived(
		data.allDatasets.filter((d) => !data.datasets.some((cd) => cd.id === d.id))
	);
</script>

<svelte:head>
	<title>{data.context.name} - SiteSeer</title>
</svelte:head>

<div class="p-8">
	<!-- Header -->
	<div class="mb-8">
		<a href="/dashboard" data-sveltekit-reload class="text-sm text-white/50 hover:text-white/70 mb-4 inline-flex items-center gap-1.5 transition-colors">
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Dashboard
		</a>
		<div class="flex items-start justify-between gap-4">
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-3">
					<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#64ff96]/20 to-[#3dd977]/10 border border-[#64ff96]/20">
						<svg class="h-6 w-6 text-[#64ff96]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
						</svg>
					</div>
					<div class="min-w-0">
						<h1 class="text-2xl font-bold text-white truncate">{data.context.name}</h1>
						{#if data.context.description}
							<p class="mt-0.5 text-white/60 line-clamp-2">{data.context.description}</p>
						{:else}
							<p class="mt-0.5 text-white/40 italic">No description</p>
						{/if}
					</div>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={openEditDialog}
					class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
					</svg>
					Edit
				</button>
				<button
					type="button"
					onclick={() => showDeleteConfirm = true}
					class="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-colors"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
					</svg>
					Delete
				</button>
			</div>
		</div>
	</div>

	<!-- Datasets in Context -->
	<div class="mb-8 rounded-xl border border-white/10 bg-white/[0.02] p-5">
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<svg class="h-5 w-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
				</svg>
				<h2 class="text-sm font-medium text-white">Data Sources</h2>
				<span class="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full">{data.datasets.length}</span>
			</div>
			<button
				type="button"
				onclick={() => { console.log('Add clicked', availableDatasets.length); showAddDatasets = true; }}
				class="flex items-center gap-1.5 text-sm text-[#64ff96] hover:text-[#7dffab] transition-colors cursor-pointer z-10 relative"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Add ({availableDatasets.length} available)
			</button>
		</div>

		{#if data.datasets.length === 0}
			<div class="rounded-lg border border-dashed border-white/20 bg-white/[0.02] p-6 text-center">
				<svg class="h-10 w-10 mx-auto text-white/20 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
				</svg>
				<p class="text-white/50 text-sm mb-2">No datasets in this context yet</p>
				{#if availableDatasets.length > 0}
					<button
						type="button"
						onclick={() => showAddDatasets = true}
						class="text-sm text-[#64ff96] hover:underline"
					>
						Add datasets to get started
					</button>
				{:else}
					<a href="/datasets" class="inline-block text-sm text-[#64ff96] hover:underline">
						Upload datasets first
					</a>
				{/if}
			</div>
		{:else}
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.datasets as dataset}
					<div class="group flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20 transition-colors">
						<div class="flex items-center gap-3 min-w-0">
							<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#64ff96]/10 border border-[#64ff96]/20 flex-shrink-0">
								<svg class="h-4 w-4 text-[#64ff96]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
							</div>
							<div class="min-w-0">
								<p class="text-sm text-white font-medium truncate">{dataset.name}</p>
								<p class="text-xs text-white/40">{dataset.rowCount.toLocaleString()} rows</p>
							</div>
						</div>
						<button
							type="button"
							onclick={() => removeDataset(dataset.id)}
							class="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-2"
							title="Remove from context"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Query Input -->
	{#if data.datasets.length > 0 && data.hasApiKey}
		<div class="mb-8">
			<div class="rounded-xl border border-white/10 bg-white/[0.02] p-5">
				<div class="flex items-center gap-2 mb-3">
					<svg class="h-5 w-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<h2 class="text-sm font-medium text-white">Ask a Question</h2>
				</div>
				<div class="relative">
					<input
						type="text"
						bind:value={question}
						onkeydown={handleKeydown}
						placeholder="What would you like to know about your data?"
						class="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 pr-14 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96]"
					/>
					<button
						type="button"
						onclick={handleSubmit}
						disabled={!question.trim() || isLoading}
						class="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] p-2.5 text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{#if isLoading}
							<svg class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
							</svg>
						{:else}
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
							</svg>
						{/if}
					</button>
				</div>
				<p class="mt-2 text-xs text-white/40">Press Enter to submit • AI will analyze your data and create visualizations</p>
			</div>
		</div>
	{:else if !data.hasApiKey}
		<div class="mb-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
			<div class="flex items-start gap-3">
				<svg class="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
				<div>
					<p class="text-sm font-medium text-amber-400 mb-1">API Key Required</p>
					<p class="text-sm text-white/60">
						<a href="/settings" class="text-[#64ff96] hover:underline">Add your Gemini API key</a> in settings to start asking questions about your data.
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Error Display -->
	{#if error}
		<div class="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
			{error}
		</div>
	{/if}

	<!-- Results Display -->
	{#if currentPlan}
		<div class="mb-8">
			{#if !currentPlan.feasible}
				<div class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 mb-6">
					<h3 class="font-medium text-amber-400">Unable to Answer</h3>
					<p class="mt-2 text-white/70">{currentPlan.reason}</p>
				</div>
			{:else if currentPlan.validationError}
				<div class="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 mb-6">
					Query Error: {currentPlan.validationError}
				</div>
			{/if}

			{#if currentPlan.feasible && currentPlan.viz && results}
				<div class="flex justify-end mb-4">
					<button
						type="button"
						onclick={openSaveDialog}
						class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
						</svg>
						Save
					</button>
				</div>

				<div class="grid gap-6 md:grid-cols-2">
					{#each currentPlan.viz as panel, i}
						{@const panelResult = results[i] || results[-1]}
						{#if panelResult}
							<ChartPanel {panel} result={panelResult} />
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Saved Dashboards -->
	{#if data.dashboards.length > 0}
		<div class="mt-8 pt-8 border-t border-white/10">
			<h2 class="text-lg font-medium text-white mb-4">Saved in this context</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.dashboards as dashboard}
					<a
						href="/saved/{dashboard.id}"
						class="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-[#64ff96]/30 hover:bg-white/[0.04] transition-all"
					>
						<p class="font-medium text-white truncate">{dashboard.name}</p>
						<p class="mt-1 text-sm text-white/50 truncate">{dashboard.question}</p>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>

<!-- Add Datasets Dialog -->
{#if showAddDatasets}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onclick={() => { showAddDatasets = false; selectedDatasets = new Set(); }}>
		<div class="w-full max-w-md rounded-xl border border-white/10 bg-[#0a0d14] p-6 shadow-2xl" onclick={(e) => e.stopPropagation()}>
			<h2 class="text-lg font-semibold text-white mb-4">Add Datasets</h2>

			{#if availableDatasets.length === 0}
				<div class="text-center py-8">
					<svg class="h-12 w-12 mx-auto text-white/20 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<p class="text-white/60 mb-2">All datasets are already in this context</p>
					<a href="/datasets" class="text-sm text-[#64ff96] hover:underline">Upload more datasets</a>
				</div>
			{:else}
				<div class="space-y-2 max-h-64 overflow-y-auto">
					{#each availableDatasets as dataset}
						<label class="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 cursor-pointer hover:bg-white/10 transition-colors">
							<input
								type="checkbox"
								checked={selectedDatasets.has(dataset.id)}
								onchange={() => {
									const newSet = new Set(selectedDatasets);
									if (newSet.has(dataset.id)) {
										newSet.delete(dataset.id);
									} else {
										newSet.add(dataset.id);
									}
									selectedDatasets = newSet;
								}}
								class="rounded border-white/20 bg-white/5 text-[#64ff96] focus:ring-[#64ff96]"
							/>
							<div class="flex-1 min-w-0">
								<p class="text-white truncate">{dataset.name}</p>
								<p class="text-xs text-white/50">{dataset.rowCount.toLocaleString()} rows</p>
							</div>
						</label>
					{/each}
				</div>
			{/if}

			<div class="mt-6 flex justify-end gap-3">
				<button
					type="button"
					onclick={() => { showAddDatasets = false; selectedDatasets = new Set(); }}
					class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={addSelectedDatasets}
					disabled={selectedDatasets.size === 0}
					class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Add {selectedDatasets.size || ''} Dataset{selectedDatasets.size !== 1 ? 's' : ''}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Save Dashboard Dialog -->
{#if showSaveDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="w-full max-w-md rounded-xl border border-white/10 bg-[#0a0d14] p-6 shadow-2xl">
			<h2 class="text-lg font-semibold text-white mb-4">Save Dashboard</h2>

			{#if saveError}
				<div class="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
					{saveError}
				</div>
			{/if}

			<div class="space-y-4">
				<div>
					<label for="save-name" class="block text-sm text-white/70 mb-1">Name</label>
					<input
						id="save-name"
						type="text"
						bind:value={saveName}
						class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96]"
						placeholder="Dashboard name..."
					/>
				</div>

				<div>
					<label for="save-description" class="block text-sm text-white/70 mb-1">Description (optional)</label>
					<textarea
						id="save-description"
						bind:value={saveDescription}
						rows="3"
						class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96] resize-none"
						placeholder="What does this dashboard show?"
					></textarea>
				</div>
			</div>

			<div class="mt-6 flex justify-end gap-3">
				<button
					type="button"
					onclick={() => showSaveDialog = false}
					class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleSave}
					disabled={!saveName.trim() || isSaving}
					class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if isSaving}Saving...{:else}Save{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Context Dialog -->
{#if showEditDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="w-full max-w-md rounded-xl border border-white/10 bg-[#0a0d14] p-6 shadow-2xl">
			<h2 class="text-lg font-semibold text-white mb-4">Edit Context</h2>

			{#if editError}
				<div class="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
					{editError}
				</div>
			{/if}

			<div class="space-y-4">
				<div>
					<label for="edit-name" class="block text-sm text-white/70 mb-1">Name</label>
					<input
						id="edit-name"
						type="text"
						bind:value={editName}
						class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96]"
						placeholder="Context name..."
					/>
				</div>

				<div>
					<label for="edit-description" class="block text-sm text-white/70 mb-1">Description (optional)</label>
					<textarea
						id="edit-description"
						bind:value={editDescription}
						rows="3"
						class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96] resize-none"
						placeholder="What is this context for?"
					></textarea>
				</div>
			</div>

			<div class="mt-6 flex justify-end gap-3">
				<button
					type="button"
					onclick={() => showEditDialog = false}
					class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleEdit}
					disabled={!editName.trim() || isEditing}
					class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if isEditing}Saving...{:else}Save Changes{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Context Confirm Dialog -->
{#if showDeleteConfirm}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="w-full max-w-md rounded-xl border border-white/10 bg-[#0a0d14] p-6 shadow-2xl">
			<div class="flex items-center gap-3 mb-4">
				<div class="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
					<svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
				</div>
				<div>
					<h2 class="text-lg font-semibold text-white">Delete Context</h2>
					<p class="text-sm text-white/60">This action cannot be undone</p>
				</div>
			</div>

			<p class="text-white/70 mb-6">
				Are you sure you want to delete <span class="font-medium text-white">{data.context.name}</span>? 
				This will remove the context and all saved dashboards associated with it.
			</p>

			<div class="flex justify-end gap-3">
				<button
					type="button"
					onclick={() => showDeleteConfirm = false}
					class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleDelete}
					disabled={isDeleting}
					class="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if isDeleting}Deleting...{:else}Delete Context{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
