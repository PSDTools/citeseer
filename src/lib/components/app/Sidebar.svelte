<script lang="ts">
	import { page } from '$app/state';
	import logo from '$lib/assets/logo.svg';
	import {
		X,
		Package,
		ChevronDown,
		ChevronRight,
		BarChart3,
		Plus,
		Database,
		Settings,
		LogOut
	} from '@lucide/svelte';

	interface Dataset {
		id: string;
		name: string;
		rowCount: number;
	}

	interface Dashboard {
		id: string;
		name: string;
	}

	interface Context {
		id: string;
		name: string;
		dashboards: Dashboard[];
	}

	interface Props {
		user: { id: string; email: string };
		org: { id: string; name: string; slug: string };
		datasets: Dataset[];
		contexts: Context[];
		mobileOpen?: boolean;
		onclose?: () => void;
	}

	let { user, org, datasets, contexts, mobileOpen = false, onclose }: Props = $props();

	let contextsExpanded = $state(true);
	let datasetsExpanded = $state(false);
	let expandedContexts = $state<Set<string>>(new Set());

	function isActive(href: string) {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}

	function isContextActive(id: string) {
		return page.url.pathname.startsWith(`/contexts/${id}`);
	}

	function isDatasetActive(id: string) {
		return page.url.pathname === `/datasets/${id}`;
	}

	function isDashboardActive(id: string) {
		return page.url.pathname === `/saved/${id}`;
	}

	function toggleContext(id: string) {
		const newSet = new Set(expandedContexts);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		expandedContexts = newSet;
	}

	// Auto-expand context if we're on it
	$effect(() => {
		const pathname = page.url.pathname;
		const match = pathname.match(/\/contexts\/([^/]+)/);
		if (match && !expandedContexts.has(match[1])) {
			expandedContexts = new Set([...expandedContexts, match[1]]);
		}
	});
</script>

<aside
	class="fixed top-0 left-0 z-50 h-screen w-64 border-r border-white/10 bg-[#050810] transition-transform duration-200
		{mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:z-40 lg:translate-x-0"
>
	<div class="flex h-full flex-col">
		<!-- Logo -->
		<div class="flex h-14 items-center justify-between border-b border-white/10 px-5">
			<a href="/" class="flex items-center gap-2.5 text-lg font-bold" onclick={() => onclose?.()}>
				<img src={logo} alt="CiteSeer logo" class="h-5 w-5" />
				<span class="bg-gradient-to-r from-[#64ff96] to-[#3dd977] bg-clip-text text-transparent">
					CiteSeer
				</span>
			</a>
			<button
				type="button"
				onclick={() => onclose?.()}
				class="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
				aria-label="Close menu"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<!-- Organization -->
		<div class="border-b border-white/10 px-4 py-3">
			<div class="rounded-lg bg-white/5 px-3 py-2">
				<p class="text-xs text-white/40">Workspace</p>
				<p class="truncate text-sm font-medium text-white">{org.name}</p>
			</div>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 overflow-y-auto px-3 py-4">
			<!-- Contexts Section -->
			<div>
				<button
					type="button"
					onclick={() => (contextsExpanded = !contextsExpanded)}
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors {isActive(
						'/contexts'
					)
						? 'bg-[#64ff96]/10 text-[#64ff96]'
						: 'text-white/70 hover:bg-white/5 hover:text-white'}"
				>
					<Package class="h-5 w-5" />
					<span class="flex-1 text-left">Contexts</span>
					<ChevronDown
						class="h-4 w-4 transition-transform {contextsExpanded ? 'rotate-180' : ''}"
					/>
				</button>

				{#if contextsExpanded}
					<div class="mt-1 ml-2 space-y-0.5">
						{#if contexts.length === 0}
							<p class="px-3 py-2 text-xs text-white/40">No contexts yet</p>
						{:else}
							{#each contexts as context}
								<div>
									<div class="flex items-center">
										{#if context.dashboards.length > 0}
											<button
												type="button"
												onclick={() => toggleContext(context.id)}
												class="p-1 text-white/30 hover:text-white/60"
												aria-label={expandedContexts.has(context.id)
													? `Collapse ${context.name}`
													: `Expand ${context.name}`}
											>
												<ChevronRight
													class="h-3 w-3 transition-transform {expandedContexts.has(context.id)
														? 'rotate-90'
														: ''}"
												/>
											</button>
										{:else}
											<div class="w-5"></div>
										{/if}
										<a
											href="/contexts/{context.id}"
											onclick={() => onclose?.()}
											class="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors {isContextActive(
												context.id
											)
												? 'bg-[#64ff96]/10 text-[#64ff96]'
												: 'text-white/60 hover:bg-white/5 hover:text-white/80'}"
										>
											<span class="truncate">{context.name}</span>
										</a>
									</div>
									{#if expandedContexts.has(context.id) && context.dashboards.length > 0}
										<div class="mt-0.5 ml-6 space-y-0.5">
											{#each context.dashboards as dashboard}
												<a
													href="/saved/{dashboard.id}"
													onclick={() => onclose?.()}
													class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors {isDashboardActive(
														dashboard.id
													)
														? 'bg-[#64ff96]/10 text-[#64ff96]'
														: 'text-white/40 hover:bg-white/5 hover:text-white/60'}"
												>
													<BarChart3 class="h-3 w-3 flex-shrink-0" />
													<span class="truncate">{dashboard.name}</span>
												</a>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						{/if}
						<a
							href="/dashboard"
							onclick={() => onclose?.()}
							class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
						>
							<Plus class="h-4 w-4" />
							<span>New context</span>
						</a>
					</div>
				{/if}
			</div>

			<!-- Datasets Section -->
			<div class="mt-2">
				<button
					type="button"
					onclick={() => (datasetsExpanded = !datasetsExpanded)}
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors {isActive(
						'/datasets'
					)
						? 'bg-[#64ff96]/10 text-[#64ff96]'
						: 'text-white/70 hover:bg-white/5 hover:text-white'}"
				>
					<Database class="h-5 w-5" />
					<span class="flex-1 text-left">Datasets</span>
					<span class="text-xs text-white/30">{datasets.length}</span>
					<ChevronDown
						class="h-4 w-4 transition-transform {datasetsExpanded ? 'rotate-180' : ''}"
					/>
				</button>

				{#if datasetsExpanded}
					<div class="mt-1 ml-4 space-y-0.5">
						{#if datasets.length === 0}
							<p class="px-3 py-2 text-xs text-white/40">No datasets yet</p>
						{:else}
							{#each datasets as dataset}
								<a
									href="/datasets/{dataset.id}"
									onclick={() => onclose?.()}
									class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors {isDatasetActive(
										dataset.id
									)
										? 'bg-[#64ff96]/10 text-[#64ff96]'
										: 'text-white/50 hover:bg-white/5 hover:text-white/80'}"
								>
									<span class="flex-1 truncate">{dataset.name}</span>
									<span class="text-xs text-white/30">{dataset.rowCount.toLocaleString()}</span>
								</a>
							{/each}
						{/if}
						<a
							href="/datasets"
							onclick={() => onclose?.()}
							class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
						>
							<Plus class="h-4 w-4" />
							<span>Upload new</span>
						</a>
					</div>
				{/if}
			</div>

			<!-- Settings -->
			<a
				href="/settings"
				onclick={() => onclose?.()}
				class="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors {isActive(
					'/settings'
				)
					? 'bg-[#64ff96]/10 text-[#64ff96]'
					: 'text-white/70 hover:bg-white/5 hover:text-white'}"
			>
				<Settings class="h-5 w-5" />
				Settings
			</a>
		</nav>

		<!-- User -->
		<div class="border-t border-white/10 p-4">
			<div class="flex items-center gap-3">
				<div
					class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#64ff96] to-[#3dd977] text-sm font-semibold text-[#050810]"
				>
					{user.email[0].toUpperCase()}
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-white">{user.email}</p>
				</div>
				<a
					href="/logout"
					class="rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white"
					title="Sign out"
				>
					<LogOut class="h-5 w-5" />
				</a>
			</div>
		</div>
	</div>
</aside>
