<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import ChartPanel from '$lib/components/viz/ChartPanel.svelte';
	import ExplorationGraph, { type GraphNode } from '$lib/components/viz/ExplorationGraph.svelte';
	import type { PageData } from './$types';
	import type { AnalyticalPlan, QueryResult, BranchContext, ChartSelectDetail } from '$lib/types/toon';

	let { data }: { data: PageData } = $props();

	// Query state
	let question = $state('');
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let currentPlan = $state<AnalyticalPlan | null>(null);
	let results = $state<Record<number, QueryResult> | null>(null);
	let lastQuestion = $state('');
	let currentNodeContext = $state<BranchContext | null>(null);
	let currentDashboardId = $state<string | null>(null);

	// Graph-based branching state
	let graphNodes = $state<GraphNode[]>([]);
	let activeNodeId = $state<string | null>(null);
	let showBranchMenu = $state(false);
	let branchMenuX = $state(0);
	let branchMenuY = $state(0);
	let branchMenuDetail = $state<ChartSelectDetail | null>(null);
	let branchPrompt = $state('');

	// Node actions state
	let isRegenerating = $state(false);
	let deletingNodeId = $state<string | null>(null);

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

	// Initialize graph from saved dashboards on mount
	function initializeGraphFromDashboards() {
		if (data.dashboards.length === 0) return;

		// Build a map of dashboard ID to dashboard for easy lookup
		const dashboardMap = new Map(data.dashboards.map(d => [d.id, d]));

		// Convert saved dashboards to graph nodes
		const nodes: GraphNode[] = data.dashboards
			.filter(d => d.plan && d.results) // Only include dashboards with data
			.map(d => ({
				id: d.id,
				question: d.question,
				parentId: d.parentDashboardId || null,
				dashboardId: d.id,
				filters: d.nodeContext?.filters,
				timestamp: new Date(d.createdAt).getTime(),
				plan: d.plan!,
				results: d.results!
			}));

		if (nodes.length > 0) {
			graphNodes = nodes;
			// Set the most recent dashboard as active
			const mostRecent = nodes[0]; // Already sorted by createdAt desc
			activeNodeId = mostRecent.id;
			currentPlan = mostRecent.plan ?? null;
			results = mostRecent.results ?? null;
			lastQuestion = mostRecent.question;
			currentDashboardId = mostRecent.dashboardId || null;
			currentNodeContext = data.dashboards[0].nodeContext || null;
		}
	}

	// Run initialization when component mounts
	$effect(() => {
		// Only run once on initial mount when graphNodes is empty
		if (graphNodes.length === 0 && data.dashboards.length > 0) {
			initializeGraphFromDashboards();
		}
	});

	// Auto-fill question from ?q= URL param
	let hasProcessedUrlQuery = $state(false);
	$effect(() => {
		const q = $page.url.searchParams.get('q');
		if (q && !hasProcessedUrlQuery) {
			hasProcessedUrlQuery = true;
			question = q;
		}
	});

	// Auto-run branch context passed from saved dashboards
	let hasProcessedBranchPayload = $state(false);
	$effect(() => {
		if (hasProcessedBranchPayload) return;
		if (typeof sessionStorage === 'undefined') return;
		const raw = sessionStorage.getItem('siteseer.branchContext');
		if (!raw) return;
		try {
			const payload = JSON.parse(raw) as {
				contextId?: string;
				question?: string;
				branchContext?: BranchContext;
			};
			if (!payload.contextId || payload.contextId !== data.context.id) return;
			if (!payload.question || !payload.branchContext) return;

			hasProcessedBranchPayload = true;
			sessionStorage.removeItem('siteseer.branchContext');
			question = payload.question;
			void handleSubmit({ question: payload.question, branchContext: payload.branchContext });
		} catch {
			sessionStorage.removeItem('siteseer.branchContext');
		}
	});

	async function handleSubmit(payload?: { question: string; branchContext?: BranchContext }) {
		const submittedQuestion = payload?.question?.trim() ?? question.trim();
		if (!submittedQuestion || isLoading) return;

		const branchContext = payload?.branchContext;
		const isFollowup = !!branchContext;

		isLoading = true;
		error = null;
		currentPlan = null;
		results = null;

		try {
			const response = await fetch('/api/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question: submittedQuestion,
					contextId: data.context.id,
					branchContext
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Query failed');
			}

			currentPlan = result.plan;
			results = result.results;
			lastQuestion = submittedQuestion;
			currentNodeContext = branchContext || null;

			// Auto-save as dashboard
			const saveResponse = await fetch('/api/dashboards', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: submittedQuestion.slice(0, 100),
					question: submittedQuestion,
					plan: result.plan,
					panels: result.plan.viz || [],
					results: result.results,
					contextId: data.context.id,
					parentDashboardId: isFollowup ? currentDashboardId : undefined,
					nodeContext: branchContext || undefined
				})
			});

			const saveResult = await saveResponse.json();
			const dashboardId = saveResult?.dashboard?.id;

			// Create new graph node with stored plan and results
			const newNode: GraphNode = {
				id: dashboardId || crypto.randomUUID(),
				question: submittedQuestion,
				parentId: isFollowup ? activeNodeId : null,
				dashboardId: dashboardId,
				filters: branchContext?.filters,
				timestamp: Date.now(),
				plan: result.plan,
				results: result.results
			};

			if (isFollowup) {
				graphNodes = [...graphNodes, newNode];
			} else {
				// New root question - start fresh graph
				graphNodes = [newNode];
			}
			activeNodeId = newNode.id;
			currentDashboardId = dashboardId || null;
			question = ''; // Clear input after successful query
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

	function openBranchMenu(detail: ChartSelectDetail) {
		if (isLoading) return;
		if (!detail.field || detail.value == null) return;

		branchMenuDetail = detail;
		branchMenuX = detail.clientX;
		branchMenuY = detail.clientY;
		branchPrompt = '';
		showBranchMenu = true;
	}

	function closeBranchMenu() {
		showBranchMenu = false;
		branchMenuDetail = null;
		branchPrompt = '';
	}

	function submitBranchPrompt() {
		if (!branchMenuDetail) return;
		const prompt = branchPrompt.trim();
		if (!prompt) return;

		const detail = branchMenuDetail;
		const parentDashboardId = currentDashboardId || undefined;
		const filters = { [detail.field!]: detail.value! };

		const branchContext: BranchContext = {
			parentDashboardId,
			parentQuestion: lastQuestion,
			parentSql: currentPlan?.sql,
			filters,
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

		closeBranchMenu();
		void handleSubmit({ question: prompt, branchContext });
	}

	async function deleteNode(nodeId: string) {
		const node = graphNodes.find(n => n.id === nodeId);
		if (!node) return;

		deletingNodeId = nodeId;

		try {
			// Delete from database if it has a dashboard ID
			if (node.dashboardId) {
				await fetch(`/api/dashboards/${node.dashboardId}`, { method: 'DELETE' });
			}

			// Remove from graph (and any children)
			const nodesToRemove = new Set<string>([nodeId]);
			// Find all descendants
			let changed = true;
			while (changed) {
				changed = false;
				for (const n of graphNodes) {
					if (n.parentId && nodesToRemove.has(n.parentId) && !nodesToRemove.has(n.id)) {
						nodesToRemove.add(n.id);
						changed = true;
					}
				}
			}

			graphNodes = graphNodes.filter(n => !nodesToRemove.has(n.id));

			// If we deleted the active node, switch to another or clear
			if (nodesToRemove.has(activeNodeId || '')) {
				if (graphNodes.length > 0) {
					const newActive = graphNodes[0];
					activeNodeId = newActive.id;
					currentPlan = newActive.plan || null;
					results = newActive.results || null;
					lastQuestion = newActive.question;
					currentDashboardId = newActive.dashboardId || null;
				} else {
					activeNodeId = null;
					currentPlan = null;
					results = null;
					lastQuestion = '';
					currentDashboardId = null;
				}
			}

			invalidateAll();
		} finally {
			deletingNodeId = null;
		}
	}

	async function regenerateNode(nodeId: string) {
		const node = graphNodes.find(n => n.id === nodeId);
		if (!node || isRegenerating) return;

		isRegenerating = true;
		error = null;

		try {
			// Re-run the query
			const response = await fetch('/api/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question: node.question,
					contextId: data.context.id,
					branchContext: node.filters ? { filters: node.filters } : undefined
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Query failed');
			}

			// Update the dashboard in the database
			if (node.dashboardId) {
				await fetch(`/api/dashboards/${node.dashboardId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						plan: result.plan,
						panels: result.plan.viz || [],
						results: result.results
					})
				});
			}

			// Update the node in the graph
			graphNodes = graphNodes.map(n =>
				n.id === nodeId
					? { ...n, plan: result.plan, results: result.results }
					: n
			);

			// If this is the active node, update the display
			if (activeNodeId === nodeId) {
				currentPlan = result.plan;
				results = result.results;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to regenerate';
		} finally {
			isRegenerating = false;
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

		{#if currentNodeContext?.filters || currentNodeContext?.selectedMark}
			<div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/50">
				<span class="text-white/40">Context:</span>
				{#if currentNodeContext?.filters}
					{#each Object.entries(currentNodeContext.filters) as [field, value]}
						<span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">
							{field} = {String(value)}
						</span>
					{/each}
				{/if}
				{#if currentNodeContext?.selectedMark}
					<span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70">
						Selected {currentNodeContext.selectedMark.field} = {String(currentNodeContext.selectedMark.value)}
					</span>
				{/if}
			</div>
		{/if}
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
						onclick={() => handleSubmit()}
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
				<!-- Executive Summary -->
				{#if currentPlan.executiveSummary}
					<div class="mb-6 rounded-xl border border-[#64ff96]/20 bg-[#64ff96]/5 p-5">
						<div class="flex items-start gap-3">
							<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#64ff96]/10 border border-[#64ff96]/20 flex-shrink-0">
								<svg class="h-4 w-4 text-[#64ff96]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
								</svg>
							</div>
							<div>
								<h3 class="text-sm font-medium text-[#64ff96] mb-1">Executive Summary</h3>
								<p class="text-white/90 leading-relaxed">{currentPlan.executiveSummary}</p>
							</div>
						</div>
					</div>
				{/if}

				<!-- Suggested Investigations -->
				{#if currentPlan.suggestedInvestigations && currentPlan.suggestedInvestigations.length > 0}
					<div class="mb-6 flex flex-wrap gap-2">
						{#each currentPlan.suggestedInvestigations as investigation, i (i)}
							<button
								type="button"
								onclick={() => {
									question = investigation;
									handleSubmit();
								}}
								disabled={isLoading}
								class="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{investigation}
							</button>
						{/each}
					</div>
				{/if}

				{#if graphNodes.length > 0}
					<div class="mb-4">
						<div class="text-xs text-white/40 mb-2">Exploration Graph ({graphNodes.length} node{graphNodes.length !== 1 ? 's' : ''}) — click a node to view its results</div>
						<ExplorationGraph
							nodes={graphNodes}
							{activeNodeId}
							onNodeClick={(node) => {
								// Switch to the clicked node's results
								if (node.plan && node.results) {
									currentPlan = node.plan;
									results = node.results;
									lastQuestion = node.question;
									activeNodeId = node.id;
									currentDashboardId = node.dashboardId || null;
								}
							}}
							height={Math.min(200 + graphNodes.length * 20, 400)}
						/>
					</div>
				{/if}

				{#if activeNodeId}
					<div class="flex items-center justify-between mb-4">
						<div class="text-sm text-white/60">
							<span class="text-white/40">Current:</span> {lastQuestion}
						</div>
						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={() => activeNodeId && regenerateNode(activeNodeId)}
								disabled={isRegenerating || isLoading}
								class="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								title="Regenerate this query"
							>
								{#if isRegenerating}
									<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
									</svg>
								{:else}
									<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
									</svg>
								{/if}
								Regenerate
							</button>
							<button
								type="button"
								onclick={() => activeNodeId && deleteNode(activeNodeId)}
								disabled={deletingNodeId !== null || isLoading}
								class="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								title="Delete this exploration"
							>
								{#if deletingNodeId === activeNodeId}
									<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
									</svg>
								{:else}
									<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								{/if}
								Delete
							</button>
						</div>
					</div>
				{/if}

				<div class="grid gap-6 md:grid-cols-2">
					{#each currentPlan.viz as panel, i}
						{@const panelResult = results[i] || results[-1]}
						{#if panelResult}
							<ChartPanel
								{panel}
								result={panelResult}
								panelIndex={i}
								interactive={true}
								on:select={(event) => openBranchMenu(event.detail)}
							/>
						{/if}
					{/each}
				</div>
			{/if}
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
			
			{#if lastQuestion}
				<div class="text-xs text-white/50">
					<span class="text-white/40">Question:</span>
					<span class="text-white/80 italic"> "{lastQuestion}"</span>
				</div>
			{/if}
			
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
				<div class="text-xs text-white/50">{branchMenuDetail.field}: <span class="text-[#64ff96]">{String(branchMenuDetail.value)}</span></div>
				{#if branchMenuDetail.metricField && branchMenuDetail.metricValue != null}
					<div class="text-xs text-white/50">{branchMenuDetail.metricField}: <span class="text-white/80">{String(branchMenuDetail.metricValue)}</span></div>
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
				disabled={!branchPrompt.trim() || isLoading}
				class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-3 py-1.5 text-xs font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Ask
			</button>
		</div>
	</div>
{/if}

<!-- Add Datasets Dialog -->
{#if showAddDatasets}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onclick={() => { showAddDatasets = false; selectedDatasets = new Set(); }} onkeydown={(e) => e.key === 'Escape' && (showAddDatasets = false)} role="dialog" aria-modal="true" tabindex="-1">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="w-full max-w-md rounded-xl border border-white/10 bg-[#0a0d14] p-6 shadow-2xl" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
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
