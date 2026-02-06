<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showCreateDialog = $state(false);
	let name = $state('');
	let description = $state('');
	let selectedDatasets = $state<Set<string>>(new Set());
	let isCreating = $state(false);
	let createError = $state<string | null>(null);

	// Delete state
	let deleteTarget = $state<{ id: string; name: string } | null>(null);
	let isDeleting = $state(false);

	async function handleCreate() {
		isCreating = true;
		createError = null;

		try {
			let contextName = name.trim();

			if (!contextName) {
				const genResponse = await fetch('/api/contexts/generate-name', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ datasetIds: Array.from(selectedDatasets) })
				});

				if (genResponse.ok) {
					const genResult = await genResponse.json();
					contextName = genResult.name;
				} else {
					contextName = 'New Context';
				}
			}

			const response = await fetch('/api/contexts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: contextName,
					description: description.trim() || undefined,
					datasetIds: Array.from(selectedDatasets)
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.message || 'Failed to create context');
			}

			const result = await response.json();
			showCreateDialog = false;
			goto(`/contexts/${result.context.id}`);
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Failed to create context';
		} finally {
			isCreating = false;
		}
	}

	async function handleDelete() {
		if (!deleteTarget) return;
		isDeleting = true;

		try {
			await fetch(`/api/contexts/${deleteTarget.id}`, { method: 'DELETE' });
			deleteTarget = null;
			invalidateAll();
		} finally {
			isDeleting = false;
		}
	}

	function openCreateDialog() {
		name = '';
		description = '';
		selectedDatasets = new Set();
		createError = null;
		showCreateDialog = true;
	}

	function formatDate(date: string | Date) {
		return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Contexts - CiteSeer</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="flex items-center justify-between mb-8">
		<div>
			<h1 class="text-2xl font-bold text-white">Contexts</h1>
			<p class="mt-1 text-white/50">Each context groups datasets together for focused analysis</p>
		</div>
		{#if data.pageDatasets.length > 0}
			<button
				type="button"
				onclick={openCreateDialog}
				class="flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				New Context
			</button>
		{/if}
	</div>

	{#if data.pageDatasets.length === 0}
		<div class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center">
			<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
				<svg class="h-7 w-7 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
				</svg>
			</div>
			<h3 class="text-base font-medium text-white">Upload data first</h3>
			<p class="mt-1 text-sm text-white/50">You need at least one dataset before creating a context.</p>
			<a
				href="/datasets"
				class="mt-4 inline-flex items-center gap-1.5 text-sm text-[#64ff96] hover:text-[#64ff96]/80 transition-colors"
			>
				Go to Datasets
				<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</a>
		</div>
	{:else if data.pageContexts.length === 0}
		<div class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center">
			<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
				<svg class="h-7 w-7 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
				</svg>
			</div>
			<h3 class="text-base font-medium text-white">No contexts yet</h3>
			<p class="mt-1 text-sm text-white/50">Create a context to group your datasets and start analyzing.</p>
			<button
				type="button"
				onclick={openCreateDialog}
				class="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Create your first context
			</button>
		</div>
	{:else}
		<!-- Context table -->
		<div class="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
			{#each data.pageContexts as context}
				<div class="group flex items-center gap-4 px-5 py-4 hover:bg-white/[0.03] transition-colors">
					<a href="/contexts/{context.id}" class="flex-1 min-w-0 flex items-center gap-5">
						<div class="flex-1 min-w-0">
							<h3 class="font-medium text-white group-hover:text-[#64ff96] transition-colors truncate">{context.name}</h3>
							{#if context.description}
								<p class="mt-0.5 text-sm text-white/40 truncate">{context.description}</p>
							{/if}
						</div>
						<div class="flex items-center gap-6 flex-shrink-0 text-xs text-white/40">
							<span>{context.datasetCount} dataset{context.datasetCount !== 1 ? 's' : ''}</span>
							<span>{context.questionCount} question{context.questionCount !== 1 ? 's' : ''}</span>
							<span class="w-16 text-right">{formatDate(context.createdAt)}</span>
						</div>
					</a>
					<button
						type="button"
						onclick={() => deleteTarget = { id: context.id, name: context.name }}
						class="rounded-lg p-1.5 opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
						title="Delete context"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Delete Confirmation Dialog -->
<Modal open={deleteTarget !== null} onclose={() => deleteTarget = null} maxWidth="max-w-md">
	<div class="flex items-center gap-3 mb-4">
		<div class="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
			<svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
			</svg>
		</div>
		<div>
			<h2 class="text-lg font-semibold text-white">Delete Context</h2>
			<p class="text-sm text-white/50">This action cannot be undone</p>
		</div>
	</div>

	<p class="text-white/70 mb-6">
		Are you sure you want to delete <span class="font-medium text-white">{deleteTarget?.name}</span>?
		This will also delete all saved dashboards in this context.
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
			disabled={isDeleting}
			class="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{#if isDeleting}Deleting...{:else}Delete Context{/if}
		</button>
	</div>
</Modal>

<!-- Create Context Dialog -->
<Modal open={showCreateDialog} onclose={() => showCreateDialog = false}>
	<h2 class="text-lg font-semibold text-white mb-4">Create Context</h2>

	{#if createError}
		<div class="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
			{createError}
		</div>
	{/if}

	<div class="space-y-4">
		<div>
			<div class="flex items-center gap-2 mb-1.5">
				<label for="context-name" class="text-sm text-white/70">Name</label>
				<div class="group relative">
					<svg class="h-4 w-4 text-[#64ff96]/60 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
					</svg>
					<div class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-[#1a1f2e] border border-white/10 rounded-lg text-xs text-white/80 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all shadow-xl z-10">
						<p class="font-medium text-[#64ff96] mb-1">AI-Powered Naming</p>
						<p>Leave empty and we'll generate a smart name based on your selected datasets.</p>
						<div class="absolute left-1/2 -translate-x-1/2 top-full -mt-1 border-4 border-transparent border-t-[#1a1f2e]"></div>
					</div>
				</div>
			</div>
			<input
				id="context-name"
				type="text"
				bind:value={name}
				class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/30 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96]"
				placeholder="Optional — AI generates if empty"
			/>
		</div>

		<div>
			<label for="context-description" class="block text-sm text-white/70 mb-1.5">Description (optional)</label>
			<textarea
				id="context-description"
				bind:value={description}
				rows="2"
				class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/30 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96] resize-none"
				placeholder="What is this context for?"
			></textarea>
		</div>

		<div>
			<label class="block text-sm text-white/70 mb-2">Datasets</label>
			<div class="space-y-2 max-h-48 overflow-y-auto">
				{#each data.pageDatasets as dataset}
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
		</div>
	</div>

	<div class="mt-6 flex justify-end gap-3">
		<button
			type="button"
			onclick={() => showCreateDialog = false}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={handleCreate}
			disabled={isCreating}
			class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{#if isCreating}Creating...{:else}Create Context{/if}
		</button>
	</div>
</Modal>
