<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		Plus,
		CloudUpload,
		ChevronRight,
		Package,
		Trash2,
		TriangleAlert,
		Zap
	} from '@lucide/svelte';
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
	<div class="mb-8 flex items-center justify-between">
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
				<Plus class="h-4 w-4" />
				New Context
			</button>
		{/if}
	</div>

	{#if data.pageDatasets.length === 0}
		<div
			class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center"
		>
			<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
				<CloudUpload class="h-7 w-7 text-white/30" />
			</div>
			<h3 class="text-base font-medium text-white">Upload data first</h3>
			<p class="mt-1 text-sm text-white/50">
				You need at least one dataset before creating a context.
			</p>
			<a
				href="/datasets"
				class="mt-4 inline-flex items-center gap-1.5 text-sm text-[#64ff96] transition-colors hover:text-[#64ff96]/80"
			>
				Go to Datasets
				<ChevronRight class="h-3.5 w-3.5" />
			</a>
		</div>
	{:else if data.pageContexts.length === 0}
		<div
			class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center"
		>
			<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
				<Package class="h-7 w-7 text-white/30" />
			</div>
			<h3 class="text-base font-medium text-white">No contexts yet</h3>
			<p class="mt-1 text-sm text-white/50">
				Create a context to group your datasets and start analyzing.
			</p>
			<button
				type="button"
				onclick={openCreateDialog}
				class="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20"
			>
				<Plus class="h-4 w-4" />
				Create your first context
			</button>
		</div>
	{:else}
		<!-- Context table -->
		<div class="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
			{#each data.pageContexts as context}
				<div
					class="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]"
				>
					<a href="/contexts/{context.id}" class="flex min-w-0 flex-1 items-center gap-5">
						<div class="min-w-0 flex-1">
							<h3
								class="truncate font-medium text-white transition-colors group-hover:text-[#64ff96]"
							>
								{context.name}
							</h3>
							{#if context.description}
								<p class="mt-0.5 truncate text-sm text-white/40">{context.description}</p>
							{/if}
						</div>
						<div class="flex flex-shrink-0 items-center gap-6 text-xs text-white/40">
							<span>{context.datasetCount} dataset{context.datasetCount !== 1 ? 's' : ''}</span>
							<span>{context.questionCount} question{context.questionCount !== 1 ? 's' : ''}</span>
							<span class="w-16 text-right">{formatDate(context.createdAt)}</span>
						</div>
					</a>
					<button
						type="button"
						onclick={() => (deleteTarget = { id: context.id, name: context.name })}
						class="flex-shrink-0 rounded-lg p-1.5 text-white/30 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
						title="Delete context"
					>
						<Trash2 class="h-4 w-4" />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Delete Confirmation Dialog -->
<Modal open={deleteTarget !== null} onclose={() => (deleteTarget = null)} maxWidth="max-w-md">
	<div class="mb-4 flex items-center gap-3">
		<div
			class="flex h-10 w-10 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10"
		>
			<TriangleAlert class="h-5 w-5 text-red-400" />
		</div>
		<div>
			<h2 class="text-lg font-semibold text-white">Delete Context</h2>
			<p class="text-sm text-white/50">This action cannot be undone</p>
		</div>
	</div>

	<p class="mb-6 text-white/70">
		Are you sure you want to delete <span class="font-medium text-white">{deleteTarget?.name}</span
		>? This will also delete all saved dashboards in this context.
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
			disabled={isDeleting}
			class="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if isDeleting}Deleting...{:else}Delete Context{/if}
		</button>
	</div>
</Modal>

<!-- Create Context Dialog -->
<Modal open={showCreateDialog} onclose={() => (showCreateDialog = false)}>
	<h2 class="mb-4 text-lg font-semibold text-white">Create Context</h2>

	{#if createError}
		<div
			class="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
		>
			{createError}
		</div>
	{/if}

	<div class="space-y-4">
		<div>
			<div class="mb-1.5 flex items-center gap-2">
				<label for="context-name" class="text-sm text-white/70">Name</label>
				<div class="group relative">
					<Zap class="h-4 w-4 cursor-help text-[#64ff96]/60" />
					<div
						class="invisible absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-[#1a1f2e] px-3 py-2 text-xs text-white/80 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100"
					>
						<p class="mb-1 font-medium text-[#64ff96]">AI-Powered Naming</p>
						<p>Leave empty and we'll generate a smart name based on your selected datasets.</p>
						<div
							class="absolute top-full left-1/2 -mt-1 -translate-x-1/2 border-4 border-transparent border-t-[#1a1f2e]"
						></div>
					</div>
				</div>
			</div>
			<input
				id="context-name"
				type="text"
				bind:value={name}
				class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/30 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
				placeholder="Optional — AI generates if empty"
			/>
		</div>

		<div>
			<label for="context-description" class="mb-1.5 block text-sm text-white/70"
				>Description (optional)</label
			>
			<textarea
				id="context-description"
				bind:value={description}
				rows="2"
				class="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/30 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
				placeholder="What is this context for?"
			></textarea>
		</div>

		<div>
			<span class="mb-2 block text-sm text-white/70">Datasets</span>
			<div class="max-h-48 space-y-2 overflow-y-auto">
				{#each data.pageDatasets as dataset}
					<label
						class="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10"
					>
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
						<div class="min-w-0 flex-1">
							<p class="truncate text-white">{dataset.name}</p>
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
			onclick={() => (showCreateDialog = false)}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={handleCreate}
			disabled={isCreating}
			class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if isCreating}Creating...{:else}Create Context{/if}
		</button>
	</div>
</Modal>
