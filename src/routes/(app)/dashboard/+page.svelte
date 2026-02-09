<script lang="ts">
	import { goto } from '$app/navigation';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { TriangleAlert, ChevronRight, CloudUpload, Plus, Package, Zap } from '@lucide/svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Create context dialog state
	let showCreateDialog = $state(false);
	let name = $state('');
	let description = $state('');
	let selectedDatasets = $state<Set<string>>(new Set());
	let isCreating = $state(false);
	let createError = $state<string | null>(null);

	async function handleCreate() {
		isCreating = true;
		createError = null;

		try {
			let contextName = name.trim();

			if (!contextName) {
				const genResponse = await fetch('/api/contexts/generate-name', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ datasetIds: Array.from(selectedDatasets) }),
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
					datasetIds: Array.from(selectedDatasets),
				}),
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

	function openCreateDialog() {
		name = '';
		description = '';
		selectedDatasets = new Set();
		createError = null;
		showCreateDialog = true;
	}
</script>

<svelte:head>
	<title>Home - CiteSeer</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-white">Home</h1>
		<p class="mt-1 text-white/50">Your data analysis workspace</p>
	</div>

	<!-- API key warning -->
	{#if !data.hasApiKey}
		<div class="mb-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
			<div class="flex items-start gap-4">
				<div
					class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10"
				>
					<TriangleAlert class="h-5 w-5 text-amber-400" />
				</div>
				<div class="flex-1">
					<h3 class="font-medium text-amber-400">Setup Required</h3>
					<p class="mt-1 text-sm text-white/50">
						Add your Gemini API key to start asking questions about your data.
					</p>
					<a
						href="/settings"
						class="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
					>
						Go to Settings
						<ChevronRight class="h-4 w-4" />
					</a>
				</div>
			</div>
		</div>
	{/if}

	{#if data.totalDatasets === 0 && data.contexts.length === 0}
		<!-- Brand new user onboarding -->
		<div class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-10">
			<div class="mx-auto max-w-sm text-center">
				<div
					class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-white/5"
				>
					<CloudUpload class="h-7 w-7 text-white/30" />
				</div>
				<h3 class="text-base font-medium text-white">Get started</h3>
				<p class="mt-2 text-sm text-white/50">
					Upload a CSV, create a context, and start asking questions with AI.
				</p>
				<a
					href="/datasets"
					class="mt-5 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20"
				>
					<CloudUpload class="h-4 w-4" />
					Upload your first dataset
				</a>
			</div>
		</div>
	{:else}
		<!-- Datasets section -->
		<section class="mb-10">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-white">Datasets</h2>
				<a href="/datasets" class="text-sm text-white/50 transition-colors hover:text-white/70">
					{#if data.allDatasets.length > 0}Manage{:else}Upload{/if}
				</a>
			</div>

			{#if data.allDatasets.length === 0}
				<div
					class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-8 text-center"
				>
					<p class="text-sm text-white/50">No datasets yet.</p>
					<a
						href="/datasets"
						class="mt-3 inline-flex items-center gap-1.5 text-sm text-[#64ff96] transition-colors hover:text-[#64ff96]/80"
					>
						Upload a CSV
						<ChevronRight class="h-3.5 w-3.5" />
					</a>
				</div>
			{:else}
				<div class="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
					{#each data.allDatasets as dataset}
						<a
							href="/datasets/{dataset.id}"
							class="group flex items-center justify-between px-5 py-3 transition-colors hover:bg-white/[0.03]"
						>
							<span class="truncate text-sm text-white transition-colors group-hover:text-[#64ff96]"
								>{dataset.name}</span
							>
							<span class="ml-4 flex-shrink-0 text-xs text-white/30"
								>{dataset.rowCount.toLocaleString()} rows</span
							>
						</a>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Contexts section -->
		<section>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-white">Contexts</h2>
				<div class="flex items-center gap-4">
					{#if data.contexts.length > 0}
						<a href="/contexts" class="text-sm text-white/50 transition-colors hover:text-white/70"
							>View all</a
						>
					{/if}
					{#if data.allDatasets.length > 0}
						<button
							type="button"
							onclick={openCreateDialog}
							class="inline-flex items-center gap-1.5 rounded-lg bg-[#64ff96]/10 px-3 py-1.5 text-sm font-medium text-[#64ff96] transition-colors hover:bg-[#64ff96]/20"
						>
							<Plus class="h-3.5 w-3.5" />
							New
						</button>
					{/if}
				</div>
			</div>

			{#if data.contexts.length === 0}
				<div
					class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-8 text-center"
				>
					<p class="text-sm text-white/50">No contexts yet.</p>
					{#if data.allDatasets.length > 0}
						<button
							type="button"
							onclick={openCreateDialog}
							class="mt-3 inline-flex items-center gap-1.5 text-sm text-[#64ff96] transition-colors hover:text-[#64ff96]/80"
						>
							Create your first context
							<ChevronRight class="h-3.5 w-3.5" />
						</button>
					{:else}
						<p class="mt-1 text-xs text-white/30">
							Upload a dataset first, then create a context to analyze it.
						</p>
					{/if}
				</div>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each data.contexts as context}
						<a
							href="/contexts/{context.id}"
							class="group rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-all hover:border-[#64ff96]/30 hover:bg-white/[0.04]"
						>
							<div class="mb-2 flex items-start justify-between">
								<h3 class="font-medium text-white transition-colors group-hover:text-[#64ff96]">
									{context.name}
								</h3>
								<ChevronRight
									class="h-4 w-4 flex-shrink-0 text-white/20 transition-all group-hover:translate-x-0.5 group-hover:text-[#64ff96]"
								/>
							</div>
							{#if context.description}
								<p class="mb-3 line-clamp-2 text-sm text-white/40">{context.description}</p>
							{/if}
							<div class="flex items-center gap-4 text-xs text-white/40">
								<span>{context.datasetCount} dataset{context.datasetCount !== 1 ? 's' : ''}</span>
								<span>{context.questionCount} question{context.questionCount !== 1 ? 's' : ''}</span
								>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

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

		{#if data.allDatasets.length > 0}
			<div>
				<span class="mb-2 block text-sm text-white/70">Add datasets (optional)</span>
				<div class="max-h-48 space-y-2 overflow-y-auto">
					{#each data.allDatasets as dataset}
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
		{/if}
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
