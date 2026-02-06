<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
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

			// If no name provided, generate one with AI
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

<div class="p-8">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-white">Welcome to CiteSeer</h1>
		<p class="mt-1 text-white/60">AI-powered data analysis at your fingertips</p>
	</div>

	<!-- Setup Warning -->
	{#if !data.hasApiKey}
		<div class="mb-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
			<div class="flex items-start gap-4">
				<div class="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
					<svg class="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
				</div>
				<div class="flex-1">
					<h3 class="font-medium text-amber-400">Setup Required</h3>
					<p class="mt-1 text-sm text-white/60">
						Add your Gemini API key to start asking questions about your data.
					</p>
					<a
						href="/settings"
						class="mt-3 inline-flex items-center gap-1 text-sm text-[#64ff96] hover:underline"
					>
						Go to Settings
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</a>
				</div>
			</div>
		</div>
	{/if}

	<!-- Quick Actions -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
		<button
			type="button"
			onclick={openCreateDialog}
			class="group rounded-xl border border-white/10 bg-gradient-to-br from-[#64ff96]/10 to-transparent p-5 hover:border-[#64ff96]/30 transition-all text-left"
		>
			<div class="flex items-center gap-4">
				<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-[#64ff96]/10 text-[#64ff96] group-hover:bg-[#64ff96]/20 transition-colors">
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
					</svg>
				</div>
				<div>
					<h3 class="font-medium text-white">New Context</h3>
					<p class="text-sm text-white/50">Group datasets for analysis</p>
				</div>
			</div>
		</button>

		<a
			href="/datasets"
			class="group rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 hover:bg-white/[0.04] transition-all"
		>
			<div class="flex items-center gap-4">
				<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-white/60 group-hover:bg-white/10 transition-colors">
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
					</svg>
				</div>
				<div>
					<h3 class="font-medium text-white">Upload Data</h3>
					<p class="text-sm text-white/50">Import CSV files</p>
				</div>
			</div>
		</a>

		<a
			href="/settings"
			class="group rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 hover:bg-white/[0.04] transition-all"
		>
			<div class="flex items-center gap-4">
				<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-white/60 group-hover:bg-white/10 transition-colors">
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				</div>
				<div>
					<h3 class="font-medium text-white">Settings</h3>
					<p class="text-sm text-white/50">Configure API keys</p>
				</div>
			</div>
		</a>
	</div>

	<!-- Contexts Section -->
	<div class="mb-8">
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-lg font-semibold text-white">Your Contexts</h2>
		</div>

		{#if data.contexts.length === 0}
			<div class="rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-8 text-center">
				<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
					<svg class="h-7 w-7 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
					</svg>
				</div>
				<h3 class="text-base font-medium text-white">No contexts yet</h3>
				<p class="mt-1 text-sm text-white/50">Contexts help you organize datasets for focused analysis</p>
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
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.contexts as context}
					<a
						href="/contexts/{context.id}"
						class="group rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:border-[#64ff96]/30 hover:bg-white/[0.04] transition-all"
					>
						<div class="flex items-start justify-between mb-3">
							<h3 class="font-medium text-white group-hover:text-[#64ff96] transition-colors">{context.name}</h3>
							<svg class="h-4 w-4 text-white/30 group-hover:text-[#64ff96] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
							</svg>
						</div>
						{#if context.description}
							<p class="text-sm text-white/50 line-clamp-2 mb-3">{context.description}</p>
						{/if}
						<div class="flex items-center gap-4 text-xs text-white/40">
							<span class="flex items-center gap-1">
								<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
								</svg>
								{context.datasetCount} dataset{context.datasetCount !== 1 ? 's' : ''}
							</span>
							<span class="flex items-center gap-1">
								<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
								</svg>
								{context.dashboardCount} saved
							</span>
						</div>
						{#if context.recentDashboards.length > 0}
							<div class="mt-3 pt-3 border-t border-white/5">
								<p class="text-xs text-white/30 mb-1.5">Recent dashboards</p>
								<div class="space-y-1">
									{#each context.recentDashboards as dashboard}
										<span class="block text-xs text-white/50 truncate">{dashboard.name}</span>
									{/each}
								</div>
							</div>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Stats Footer -->
	{#if data.totalDatasets > 0 || data.totalContexts > 0}
		<div class="rounded-xl border border-white/10 bg-white/[0.02] p-4">
			<div class="flex items-center justify-center gap-8 text-sm">
				<div class="text-center">
					<p class="text-2xl font-bold text-white">{data.totalDatasets}</p>
					<p class="text-white/40">Dataset{data.totalDatasets !== 1 ? 's' : ''}</p>
				</div>
				<div class="h-8 w-px bg-white/10"></div>
				<div class="text-center">
					<p class="text-2xl font-bold text-white">{data.totalContexts}</p>
					<p class="text-white/40">Context{data.totalContexts !== 1 ? 's' : ''}</p>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Create Context Dialog -->
{#if showCreateDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="w-full max-w-lg rounded-xl border border-white/10 bg-[#0a0d14] p-6 shadow-2xl">
			<h2 class="text-lg font-semibold text-white mb-4">Create Context</h2>

			{#if createError}
				<div class="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
					{createError}
				</div>
			{/if}

			<div class="space-y-4">
				<div>
					<div class="flex items-center gap-2 mb-1">
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
						class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96]"
						placeholder="Optional — AI generates if empty ✨"
					/>
				</div>

				<div>
					<label for="context-description" class="block text-sm text-white/70 mb-1">Description (optional)</label>
					<textarea
						id="context-description"
						bind:value={description}
						rows="2"
						class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96] resize-none"
						placeholder="What is this context for?"
					></textarea>
				</div>

				{#if data.allDatasets.length > 0}
					<div>
						<label class="block text-sm text-white/70 mb-2">Add datasets (optional)</label>
						<div class="space-y-2 max-h-48 overflow-y-auto">
							{#each data.allDatasets as dataset}
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
				{/if}
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
		</div>
	</div>
{/if}
