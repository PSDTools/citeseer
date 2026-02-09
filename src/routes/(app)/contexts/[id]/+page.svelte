<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChartPanel from '$lib/components/viz/ChartPanel.svelte';
	import BranchMenu from '$lib/components/viz/BranchMenu.svelte';
	import ExplorationGraph, { type GraphNode } from '$lib/components/viz/ExplorationGraph.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { PageData } from './$types';
	import type {
		AnalyticalPlan,
		QueryResult,
		BranchContext,
		ChartSelectDetail,
	} from '$lib/types/toon';
	import {
		ChevronLeft,
		Pencil,
		Trash2,
		X,
		Plus,
		LoaderCircle,
		ArrowRight,
		TriangleAlert,
		Lightbulb,
		RefreshCw,
		ShieldCheck,
		CircleHelp,
		ChevronRight,
		CheckCircle,
	} from '@lucide/svelte';

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
	let loadingStep = $state(0);

	// Graph-based branching state
	let graphNodes = $state<GraphNode[]>([]);
	let activeNodeId = $state<string | null>(null);
	let showBranchMenu = $state(false);
	let branchMenuX = $state(0);
	let branchMenuY = $state(0);
	let branchMenuDetail = $state<ChartSelectDetail | null>(null);

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

	// Realign question state
	let realignSuggestions = $state<string[]>([]);
	let isRealigning = $state(false);

	// Delete context state
	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);

	const loadingSteps = [
		'Analyzing your question...',
		'Building SQL query...',
		'Executing against your data...',
		'Generating visualizations...',
	];

	// Initialize graph from saved dashboards on mount
	function initializeGraphFromDashboards() {
		if (data.dashboards.length === 0) return;

		const nodes: GraphNode[] = data.dashboards
			.filter((d) => d.plan && d.results)
			.map((d) => ({
				id: d.id,
				question: d.question,
				parentId: d.parentDashboardId || null,
				dashboardId: d.id,
				filters: d.nodeContext?.filters,
				timestamp: new Date(d.createdAt).getTime(),
				plan: d.plan!,
				results: d.results!,
			}));

		if (nodes.length > 0) {
			graphNodes = nodes;
			const mostRecent = nodes[0];
			activeNodeId = mostRecent.id;
			currentPlan = mostRecent.plan ?? null;
			results = mostRecent.results ?? null;
			lastQuestion = mostRecent.question;
			currentDashboardId = mostRecent.dashboardId || null;
			currentNodeContext = data.dashboards[0].nodeContext || null;
		}
	}

	$effect(() => {
		if (graphNodes.length === 0 && data.dashboards.length > 0) {
			initializeGraphFromDashboards();
		}
	});

	// Auto-fill question from ?q= URL param
	let hasProcessedUrlQuery = $state(false);
	$effect(() => {
		const q = page.url.searchParams.get('q');
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
		const raw = sessionStorage.getItem('citeseer.branchContext');
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
			sessionStorage.removeItem('citeseer.branchContext');
			question = payload.question;
			void handleSubmit({ question: payload.question, branchContext: payload.branchContext });
		} catch {
			sessionStorage.removeItem('citeseer.branchContext');
		}
	});

	// Advance loading steps on a timer
	let loadingInterval: ReturnType<typeof setInterval> | null = null;

	function startLoadingSteps() {
		loadingStep = 0;
		loadingInterval = setInterval(() => {
			if (loadingStep < loadingSteps.length - 1) {
				loadingStep++;
			}
		}, 2500);
	}

	function stopLoadingSteps() {
		if (loadingInterval) {
			clearInterval(loadingInterval);
			loadingInterval = null;
		}
	}

	async function handleSubmit(payload?: { question: string; branchContext?: BranchContext }) {
		const submittedQuestion = payload?.question?.trim() ?? question.trim();
		if (!submittedQuestion || isLoading) return;

		const branchContext = payload?.branchContext;
		const isFollowup = !!branchContext;

		isLoading = true;
		error = null;
		currentPlan = null;
		results = null;
		realignSuggestions = [];
		startLoadingSteps();

		try {
			const response = await fetch('/api/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question: submittedQuestion,
					contextId: data.context.id,
					branchContext,
				}),
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Query failed');
			}

			currentPlan = result.plan;
			results = result.results;
			lastQuestion = submittedQuestion;
			currentNodeContext = branchContext || null;

			if (result.plan.feasible) {
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
						nodeContext: branchContext || undefined,
					}),
				});

				const saveResult = await saveResponse.json();
				const dashboardId = saveResult?.dashboard?.id;

				const newNode: GraphNode = {
					id: dashboardId || crypto.randomUUID(),
					question: submittedQuestion,
					parentId: isFollowup ? activeNodeId : null,
					dashboardId: dashboardId,
					filters: branchContext?.filters,
					timestamp: Date.now(),
					plan: result.plan,
					results: result.results,
				};

				if (isFollowup) {
					graphNodes = [...graphNodes, newNode];
				} else {
					graphNodes = [newNode];
				}
				activeNodeId = newNode.id;
				currentDashboardId = dashboardId || null;
			}
			question = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to execute query';
		} finally {
			isLoading = false;
			stopLoadingSteps();
		}
	}

	async function handleRealign() {
		if (!currentPlan || isRealigning) return;

		isRealigning = true;
		try {
			const response = await fetch('/api/query/realign', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question: lastQuestion,
					reason: currentPlan.reason || 'Unable to answer',
					contextId: data.context.id,
				}),
			});

			const result = await response.json();
			if (response.ok && Array.isArray(result.suggestions)) {
				realignSuggestions = result.suggestions;
			}
		} catch {
			// Silently fail
		} finally {
			isRealigning = false;
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

		const menuW = 360;
		const menuH = 320;
		branchMenuX = Math.min(detail.clientX, window.innerWidth - menuW - 16);
		branchMenuY = Math.min(detail.clientY, window.innerHeight - menuH - 16);
		branchMenuX = Math.max(16, branchMenuX);
		branchMenuY = Math.max(16, branchMenuY);

		showBranchMenu = true;
	}

	function closeBranchMenu() {
		showBranchMenu = false;
		branchMenuDetail = null;
	}

	function submitBranchPrompt(prompt: string) {
		if (!branchMenuDetail) return;

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
				datum: detail.datum,
			},
		};

		closeBranchMenu();
		void handleSubmit({ question: prompt, branchContext });
	}

	async function deleteNode(nodeId: string) {
		const node = graphNodes.find((n) => n.id === nodeId);
		if (!node) return;

		deletingNodeId = nodeId;

		try {
			if (node.dashboardId) {
				await fetch(`/api/dashboards/${node.dashboardId}`, { method: 'DELETE' });
			}

			const nodesToRemove = new Set<string>([nodeId]);
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

			graphNodes = graphNodes.filter((n) => !nodesToRemove.has(n.id));

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
		const node = graphNodes.find((n) => n.id === nodeId);
		if (!node || isRegenerating) return;

		isRegenerating = true;
		error = null;

		try {
			const response = await fetch('/api/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question: node.question,
					contextId: data.context.id,
					branchContext: node.filters ? { filters: node.filters } : undefined,
				}),
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Query failed');
			}

			if (node.dashboardId) {
				await fetch(`/api/dashboards/${node.dashboardId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						plan: result.plan,
						panels: result.plan.viz || [],
						results: result.results,
					}),
				});
			}

			graphNodes = graphNodes.map((n) =>
				n.id === nodeId ? { ...n, plan: result.plan, results: result.results } : n,
			);

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
			body: JSON.stringify({ datasetId }),
		});
		invalidateAll();
	}

	async function addSelectedDatasets() {
		if (selectedDatasets.size === 0) return;

		await fetch(`/api/contexts/${data.context.id}/datasets`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ datasetIds: Array.from(selectedDatasets) }),
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
					description: editDescription.trim() || null,
				}),
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
				method: 'DELETE',
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

	const availableDatasets = $derived(
		data.allDatasets.filter((d) => !data.datasets.some((cd) => cd.id === d.id)),
	);
</script>

<svelte:head>
	<title>{data.context.name} - CiteSeer</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<!-- Header -->
	<div class="mb-6">
		<a
			href="/dashboard"
			data-sveltekit-reload
			class="mb-3 inline-flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-white/70"
		>
			<ChevronLeft class="h-4 w-4" />
			Home
		</a>
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				<h1 class="truncate text-2xl font-bold text-white">{data.context.name}</h1>
				{#if data.context.description}
					<p class="mt-0.5 line-clamp-1 text-white/50">{data.context.description}</p>
				{/if}
			</div>
			<div class="flex flex-shrink-0 items-center gap-2">
				<button
					type="button"
					onclick={openEditDialog}
					class="rounded-lg border border-white/10 bg-white/5 p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
					title="Edit context"
				>
					<Pencil class="h-4 w-4" />
				</button>
				<button
					type="button"
					onclick={() => (showDeleteConfirm = true)}
					class="rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
					title="Delete context"
				>
					<Trash2 class="h-4 w-4" />
				</button>
			</div>
		</div>

		<!-- Datasets as compact chips -->
		<div class="mt-3 flex flex-wrap items-center gap-2">
			{#if data.datasets.length > 0}
				{#each data.datasets as dataset}
					<span
						class="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pr-1 pl-2.5 text-xs text-white/60"
					>
						{dataset.name}
						<span class="text-white/30">{dataset.rowCount.toLocaleString()}</span>
						<button
							type="button"
							onclick={() => removeDataset(dataset.id)}
							class="rounded-full p-0.5 text-white/20 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
							title="Remove dataset"
						>
							<X class="h-3 w-3" />
						</button>
					</span>
				{/each}
			{/if}
			<button
				type="button"
				onclick={() => (showAddDatasets = true)}
				class="inline-flex items-center gap-1 rounded-full border border-dashed border-white/15 px-2.5 py-1 text-xs text-white/40 transition-colors hover:border-[#64ff96]/30 hover:text-[#64ff96]"
			>
				<Plus class="h-3 w-3" />
				{#if data.datasets.length === 0}Add datasets{:else}Add{/if}
			</button>
		</div>

		{#if currentNodeContext?.filters || currentNodeContext?.selectedMark}
			<div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/50">
				<span class="text-white/40">Filtered:</span>
				{#if currentNodeContext?.filters}
					{#each Object.entries(currentNodeContext.filters) as [field, value]}
						<span
							class="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/70"
						>
							{field} = {String(value)}
						</span>
					{/each}
				{/if}
				{#if currentNodeContext?.selectedMark}
					<span class="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/70">
						{currentNodeContext.selectedMark.field} = {String(
							currentNodeContext.selectedMark.value,
						)}
					</span>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Query Input — primary action, right after header -->
	{#if data.datasets.length > 0 && data.hasApiKey}
		<div class="mb-8">
			<div class="relative">
				<input
					type="text"
					bind:value={question}
					onkeydown={handleKeydown}
					placeholder="Ask a question about your data..."
					disabled={isLoading}
					class="w-full rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 pr-14 text-white placeholder-white/30 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none disabled:opacity-50"
				/>
				<button
					type="button"
					onclick={() => handleSubmit()}
					disabled={!question.trim() || isLoading}
					aria-label="Submit question"
					class="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] p-2.5 text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if isLoading}
						<LoaderCircle class="h-5 w-5 animate-spin" />
					{:else}
						<ArrowRight class="h-5 w-5" />
					{/if}
				</button>
			</div>
		</div>
	{:else if !data.hasApiKey}
		<div class="mb-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
			<div class="flex items-start gap-3">
				<TriangleAlert class="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
				<div>
					<p class="mb-1 text-sm font-medium text-amber-400">API Key Required</p>
					<p class="text-sm text-white/50">
						<a href="/settings" class="text-[#64ff96] hover:underline">Add your Gemini API key</a> in
						settings to start asking questions.
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Loading State -->
	{#if isLoading}
		<div class="mb-8 rounded-xl border border-[#64ff96]/20 bg-[#64ff96]/5 p-8">
			<div class="flex flex-col items-center text-center">
				<div class="relative mb-4">
					<LoaderCircle class="h-10 w-10 animate-spin text-[#64ff96]" />
				</div>
				<p class="mb-2 font-medium text-white">{loadingSteps[loadingStep]}</p>
				<div class="mt-3 flex items-center gap-2">
					{#each loadingSteps as _, i}
						<div
							class="h-1.5 w-8 rounded-full transition-colors duration-300 {i <= loadingStep
								? 'bg-[#64ff96]'
								: 'bg-white/10'}"
						></div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Error Display -->
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

	<!-- Results Display -->
	{#if currentPlan && !isLoading}
		<div class="mb-8">
			{#if !currentPlan.feasible}
				<div class="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
					<h3 class="font-medium text-amber-400">Unable to Answer</h3>
					<p class="mt-2 text-white/70">{currentPlan.reason}</p>

					{#if realignSuggestions.length === 0}
						<button
							type="button"
							onclick={handleRealign}
							disabled={isRealigning}
							class="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if isRealigning}
								<LoaderCircle class="h-4 w-4 animate-spin" />
								Thinking...
							{:else}
								<Lightbulb class="h-4 w-4" />
								Suggest questions I can ask
							{/if}
						</button>
					{:else}
						<div class="mt-4">
							<p class="mb-2 text-xs text-white/50">Try one of these instead:</p>
							<div class="space-y-2">
								{#each realignSuggestions as suggestion}
									<button
										type="button"
										onclick={() => {
											question = suggestion;
											handleSubmit();
										}}
										disabled={isLoading}
										class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-left text-sm text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
									>
										{suggestion}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{:else if currentPlan.validationError}
				<div
					class="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
				>
					Query Error: {currentPlan.validationError}
				</div>
			{/if}

			{#if currentPlan.feasible && currentPlan.viz && results}
				<!-- Executive Summary -->
				{#if currentPlan.executiveSummary}
					<div class="mb-6 rounded-xl border border-[#64ff96]/20 bg-[#64ff96]/5 p-5">
						<div class="flex items-start gap-3">
							<div
								class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[#64ff96]/20 bg-[#64ff96]/10"
							>
								<ShieldCheck class="h-4 w-4 text-[#64ff96]" />
							</div>
							<div>
								<h3 class="mb-1 text-sm font-medium text-[#64ff96]">Executive Summary</h3>
								<p class="leading-relaxed text-white/90">{currentPlan.executiveSummary}</p>
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
								class="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
							>
								{investigation}
							</button>
						{/each}
					</div>
				{/if}

				{#if graphNodes.length > 0}
					<div class="mb-4">
						<div class="mb-2 text-xs text-white/40">
							Exploration Graph ({graphNodes.length} node{graphNodes.length !== 1 ? 's' : ''}) —
							click a node to view its results
						</div>
						<ExplorationGraph
							nodes={graphNodes}
							{activeNodeId}
							onNodeClick={(node) => {
								if (node.dashboardId) {
									goto(`/saved/${node.dashboardId}`);
								}
							}}
							height={Math.min(200 + graphNodes.length * 20, 400)}
						/>
					</div>
				{/if}

				{#if activeNodeId}
					<div class="mb-4 flex items-center justify-between gap-4">
						<div class="truncate text-sm text-white/50">
							<span class="text-white/40">Current:</span>
							{lastQuestion}
						</div>
						<div class="flex flex-shrink-0 items-center gap-2">
							<button
								type="button"
								onclick={() => activeNodeId && regenerateNode(activeNodeId)}
								disabled={isRegenerating || isLoading}
								class="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
								title="Regenerate this query"
							>
								{#if isRegenerating}
									<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
								{:else}
									<RefreshCw class="h-3.5 w-3.5" />
								{/if}
								Regenerate
							</button>
							<button
								type="button"
								onclick={() => activeNodeId && deleteNode(activeNodeId)}
								disabled={deletingNodeId !== null || isLoading}
								class="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-400 transition-colors hover:border-red-500/30 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
								title="Delete this exploration"
							>
								{#if deletingNodeId === activeNodeId}
									<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
								{:else}
									<Trash2 class="h-3.5 w-3.5" />
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

				{#if graphNodes.length > 0}
					<div class="mt-8">
						<div class="mb-2 text-xs text-white/40">
							Exploration Graph ({graphNodes.length} node{graphNodes.length !== 1 ? 's' : ''}) —
							click a node to view its results
						</div>
						<ExplorationGraph
							nodes={graphNodes}
							{activeNodeId}
							onNodeClick={(node) => {
								if (node.dashboardId) {
									goto(`/saved/${node.dashboardId}`);
								}
							}}
							height={Math.min(200 + graphNodes.length * 20, 400)}
						/>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Empty state when context has datasets but no queries yet -->
	{#if data.datasets.length > 0 && data.hasApiKey && !currentPlan && !isLoading && graphNodes.length === 0 && data.dashboards.length === 0}
		<div class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
			<div
				class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#64ff96]/10"
			>
				<CircleHelp class="h-7 w-7 text-[#64ff96]" />
			</div>
			<h3 class="text-base font-medium text-white">Ready to analyze</h3>
			<p class="mt-1 text-sm text-white/50">Ask a question above to start exploring your data</p>
		</div>
	{/if}

	<!-- Saved Queries -->
	{#if data.dashboards.length > 0}
		<section class="mt-10">
			<h2 class="mb-3 text-sm font-medium text-white/60">Previous Questions</h2>
			<div class="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
				{#each data.dashboards as dashboard}
					<a
						href="/saved/{dashboard.id}"
						class="group flex items-center justify-between gap-4 py-3 transition-colors hover:bg-white/[0.03] {dashboard.parentDashboardId
							? 'pr-5 pl-10'
							: 'px-5'}"
					>
						<span
							class="truncate text-sm text-white/60 group-hover:text-white {dashboard.parentDashboardId
								? 'text-xs'
								: ''}">{dashboard.question}</span
						>
						<ChevronRight
							class="h-4 w-4 flex-shrink-0 text-white/10 transition-colors group-hover:text-white/30"
						/>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>

<!-- Branch Menu -->
{#if showBranchMenu && branchMenuDetail}
	<BranchMenu
		detail={branchMenuDetail}
		x={branchMenuX}
		y={branchMenuY}
		{lastQuestion}
		disabled={isLoading}
		onsubmit={submitBranchPrompt}
		onclose={closeBranchMenu}
	/>
{/if}

<!-- Add Datasets Dialog -->
<Modal
	open={showAddDatasets}
	onclose={() => {
		showAddDatasets = false;
		selectedDatasets = new Set();
	}}
	maxWidth="max-w-md"
>
	<h2 class="mb-4 text-lg font-semibold text-white">Add Datasets</h2>

	{#if availableDatasets.length === 0}
		<div class="py-8 text-center">
			<CheckCircle class="mx-auto mb-3 h-12 w-12 text-white/20" />
			<p class="mb-2 text-white/50">All datasets are already in this context</p>
			<a href="/datasets" class="text-sm text-[#64ff96] hover:underline">Upload more datasets</a>
		</div>
	{:else}
		<div class="max-h-64 space-y-2 overflow-y-auto">
			{#each availableDatasets as dataset}
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
	{/if}

	<div class="mt-6 flex justify-end gap-3">
		<button
			type="button"
			onclick={() => {
				showAddDatasets = false;
				selectedDatasets = new Set();
			}}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={addSelectedDatasets}
			disabled={selectedDatasets.size === 0}
			class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:cursor-not-allowed disabled:opacity-50"
		>
			Add {selectedDatasets.size || ''} Dataset{selectedDatasets.size !== 1 ? 's' : ''}
		</button>
	</div>
</Modal>

<!-- Edit Context Dialog -->
<Modal open={showEditDialog} onclose={() => (showEditDialog = false)} maxWidth="max-w-md">
	<h2 class="mb-4 text-lg font-semibold text-white">Edit Context</h2>

	{#if editError}
		<div
			class="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
		>
			{editError}
		</div>
	{/if}

	<div class="space-y-4">
		<div>
			<label for="edit-name" class="mb-1.5 block text-sm text-white/70">Name</label>
			<input
				id="edit-name"
				type="text"
				bind:value={editName}
				class="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/30 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
				placeholder="Context name..."
			/>
		</div>

		<div>
			<label for="edit-description" class="mb-1.5 block text-sm text-white/70"
				>Description (optional)</label
			>
			<textarea
				id="edit-description"
				bind:value={editDescription}
				rows="3"
				class="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-white/30 focus:border-[#64ff96] focus:ring-1 focus:ring-[#64ff96] focus:outline-none"
				placeholder="What is this context for?"
			></textarea>
		</div>
	</div>

	<div class="mt-6 flex justify-end gap-3">
		<button
			type="button"
			onclick={() => (showEditDialog = false)}
			class="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={handleEdit}
			disabled={!editName.trim() || isEditing}
			class="rounded-lg bg-gradient-to-r from-[#64ff96] to-[#3dd977] px-4 py-2 text-sm font-semibold text-[#050810] transition-all hover:shadow-lg hover:shadow-[#64ff96]/20 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if isEditing}Saving...{:else}Save Changes{/if}
		</button>
	</div>
</Modal>

<!-- Delete Context Confirm Dialog -->
<Modal open={showDeleteConfirm} onclose={() => (showDeleteConfirm = false)} maxWidth="max-w-md">
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
		Are you sure you want to delete <span class="font-medium text-white">{data.context.name}</span>?
		This will remove the context and all saved dashboards associated with it.
	</p>

	<div class="flex justify-end gap-3">
		<button
			type="button"
			onclick={() => (showDeleteConfirm = false)}
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
