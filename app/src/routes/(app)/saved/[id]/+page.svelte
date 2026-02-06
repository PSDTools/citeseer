<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ChartPanel from '$lib/components/viz/ChartPanel.svelte';
	import type { PageData } from './$types';
	import type { BranchContext, ChartSelectDetail } from '$lib/types/toon';

	let { data }: { data: PageData } = $props();

	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);
	let showBranchMenu = $state(false);
	let branchMenuX = $state(0);
	let branchMenuY = $state(0);
	let branchMenuDetail = $state<ChartSelectDetail | null>(null);
	let branchPrompt = $state('');

	async function handleDelete() {
		isDeleting = true;
		try {
			const response = await fetch(`/api/dashboards/${data.dashboard.id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await invalidateAll();
				goto(data.dashboard.contextId ? `/contexts/${data.dashboard.contextId}` : '/contexts');
			}
		} finally {
			isDeleting = false;
		}
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function openBranchMenu(detail: ChartSelectDetail) {
		if (!data.dashboard.contextId) return;
		if (!detail.field || detail.value == null) return;
		branchMenuDetail = detail;

		const menuW = 360;
		const menuH = 320;
		branchMenuX = Math.min(detail.clientX, window.innerWidth - menuW - 16);
		branchMenuY = Math.min(detail.clientY, window.innerHeight - menuH - 16);
		branchMenuX = Math.max(16, branchMenuX);
		branchMenuY = Math.max(16, branchMenuY);

		branchPrompt = '';
		showBranchMenu = true;
	}

	function closeBranchMenu() {
		showBranchMenu = false;
		branchMenuDetail = null;
		branchPrompt = '';
	}

	function submitBranchPrompt() {
		if (!branchMenuDetail || !data.dashboard.contextId) return;
		const prompt = branchPrompt.trim();
		if (!prompt) return;

		const detail = branchMenuDetail;
		const panel = data.dashboard.plan?.viz?.[detail.panelIndex ?? -1];
		const parentSql = panel?.sql || data.dashboard.plan?.sql;

		const branchContext: BranchContext = {
			parentDashboardId: data.dashboard.id,
			parentQuestion: data.dashboard.question,
			parentSql,
			filters: { [detail.field!]: detail.value! },
			selectedMark: {
				panelIndex: detail.panelIndex,
				panelTitle: detail.panelTitle,
				field: detail.field!,
				value: detail.value!,
				metricField: detail.metricField,
				metricValue: detail.metricValue,
				datum: detail.datum
			}
		};

		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem(
				'citeseer.branchContext',
				JSON.stringify({
					contextId: data.dashboard.contextId,
					question: prompt,
					branchContext
				})
			);
		}

		closeBranchMenu();
		goto(`/contexts/${data.dashboard.contextId}?q=${encodeURIComponent(prompt)}`);
	}
</script>

<svelte:head>
	<title>{data.dashboard.name} - CiteSeer</title>
</svelte:head>

<svelte:window
	on:click={() => {
		if (showBranchMenu) closeBranchMenu();
	}}
	on:keydown={(e) => {
		if (e.key === 'Escape' && showBranchMenu) closeBranchMenu();
	}}
/>

<div class="p-8">
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-start justify-between">
			<div>
				<a
					href={data.dashboard.contextId ? `/contexts/${data.dashboard.contextId}` : '/contexts'}
					class="text-sm text-white/50 hover:text-white/70 mb-2 inline-block"
				>
					← Back
				</a>
				{#if data.breadcrumb?.length}
					<nav class="mb-2 flex flex-wrap items-center gap-1 text-xs text-white/50">
						{#each data.breadcrumb as crumb, idx}
							<a href="/saved/{crumb.id}" class="hover:text-white/70">
								{crumb.name}
							</a>
							{#if idx < data.breadcrumb.length - 1}
								<span class="text-white/30">›</span>
							{/if}
						{/each}
					</nav>
				{/if}
				<h1 class="text-2xl font-bold text-white">{data.dashboard.name}</h1>
				<p class="mt-1 text-white/60">{data.dashboard.question}</p>
				{#if data.dashboard.description}
					<p class="mt-2 text-sm text-white/50">{data.dashboard.description}</p>
				{/if}
				{#if data.dashboard.nodeContext?.filters}
					<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/50">
						<span class="text-white/40">Inherited filters:</span>
						{#each Object.entries(data.dashboard.nodeContext.filters) as [field, value]}
							<span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">
								{field} = {String(value)}
							</span>
						{/each}
					</div>
				{/if}
				{#if data.dashboard.nodeContext?.selectedMark}
					<p class="mt-2 text-xs text-white/40">
						Selected: {data.dashboard.nodeContext.selectedMark.field} =
						{String(data.dashboard.nodeContext.selectedMark.value)}
					</p>
				{/if}
				<p class="mt-2 text-xs text-white/40">
					Saved {formatDate(data.dashboard.createdAt)}
				</p>
			</div>
			<button
				type="button"
				onclick={() => showDeleteConfirm = true}
				class="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
				</svg>
				Delete
			</button>
		</div>
	</div>

	<!-- Visualization Panels -->
	{#if data.dashboard.plan?.viz && Object.keys(data.results).length > 0}
		<!-- Executive Summary -->
		{#if data.dashboard.plan.executiveSummary}
			<div class="mb-6 rounded-xl border border-[#64ff96]/20 bg-[#64ff96]/5 p-5">
				<div class="flex items-start gap-3">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#64ff96]/10 border border-[#64ff96]/20 flex-shrink-0">
						<svg class="h-4 w-4 text-[#64ff96]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
						</svg>
					</div>
					<div>
						<h3 class="text-sm font-medium text-[#64ff96] mb-1">Executive Summary</h3>
						<p class="text-white/90 leading-relaxed">{data.dashboard.plan.executiveSummary}</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Suggested Investigations -->
		{#if data.dashboard.plan.suggestedInvestigations && data.dashboard.plan.suggestedInvestigations.length > 0}
			<div class="mb-6 flex flex-wrap gap-2">
				{#each data.dashboard.plan.suggestedInvestigations as investigation, i (i)}
					<a
						href="/contexts/{data.dashboard.contextId}?q={encodeURIComponent(investigation)}"
						class="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20 transition-colors no-underline"
					>
						{investigation}
					</a>
				{/each}
			</div>
		{/if}

		<div class="grid gap-6 md:grid-cols-2">
			{#each data.dashboard.plan.viz as panel, i}
				{@const result = data.results[i]}
				{#if result}
					{#if result.error}
						<div class="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
							<h3 class="font-medium text-white mb-2">{panel.title}</h3>
							<p class="text-sm text-red-400">Error: {result.error}</p>
						</div>
					{:else}
						<ChartPanel
							{panel}
							result={result}
							panelIndex={i}
							interactive={true}
							on:select={(event) => openBranchMenu(event.detail)}
						/>
					{/if}
				{/if}
			{/each}
		</div>
	{:else}
		<div class="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
			<p class="text-white/60">No visualizations available</p>
		</div>
	{/if}
</div>

<!-- Branch Menu -->
{#if showBranchMenu && branchMenuDetail}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed z-50 w-[360px] rounded-lg border border-white/10 bg-[#0a0d14] p-4 shadow-xl"
		style="left: {branchMenuX}px; top: {branchMenuY}px;"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<div class="mb-3 space-y-2">
			<div class="text-xs font-medium text-white/70">Selected Context</div>
			{#if branchMenuDetail.panelTitle}
				<div class="text-xs text-white/50">
					<span class="text-white/40">Panel:</span>
					<span class="text-white/80"> {branchMenuDetail.panelTitle}</span>
				</div>
			{/if}
			{#if branchMenuDetail.datum && Object.keys(branchMenuDetail.datum).length > 0}
				<div class="rounded border border-white/10 bg-white/5 p-2 max-h-32 overflow-y-auto">
					<div class="text-[10px] text-white/40 uppercase tracking-wide mb-1">Data Point</div>
					<div class="space-y-0.5">
						{#each Object.entries(branchMenuDetail.datum) as [key, val]}
							<div class="text-xs flex justify-between gap-2">
								<span class="text-white/50 truncate">{key}</span>
								<span class="text-[#64ff96] font-mono text-right">{val != null ? String(val) : '—'}</span>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="text-xs text-white/50">
					{branchMenuDetail.field}: <span class="text-[#64ff96]">{String(branchMenuDetail.value)}</span>
				</div>
				{#if branchMenuDetail.metricField && branchMenuDetail.metricValue != null}
					<div class="text-xs text-white/50">
						{branchMenuDetail.metricField}:
						<span class="text-white/80">{String(branchMenuDetail.metricValue)}</span>
					</div>
				{/if}
			{/if}
		</div>
		<label class="block text-xs text-white/60 mb-1" for="branch-prompt">Ask a question about this data</label>
		<textarea
			id="branch-prompt"
			bind:value={branchPrompt}
			rows="3"
			class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-[#64ff96] focus:outline-none focus:ring-1 focus:ring-[#64ff96] resize-none"
			placeholder="Ask about this…"
		></textarea>
		<div class="mt-3 flex justify-end gap-2">
			<button
				type="button"
				onclick={closeBranchMenu}
				class="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
			>
				Cancel
			</button>
			<button
				type="button"
				onclick={submitBranchPrompt}
				disabled={!branchPrompt.trim()}
				class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-3 py-1.5 text-xs font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Ask
			</button>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Dialog -->
{#if showDeleteConfirm}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="w-full max-w-sm rounded-xl border border-white/10 bg-[#0a0d14] p-6 shadow-2xl">
			<h2 class="text-lg font-semibold text-white mb-2">Delete Dashboard</h2>
			<p class="text-white/60 text-sm mb-6">
				Are you sure you want to delete "{data.dashboard.name}"? This action cannot be undone.
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
					class="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
				>
					{#if isDeleting}
						Deleting...
					{:else}
						Delete
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
