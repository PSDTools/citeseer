<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
		children: Snippet;
		maxWidth?: string;
		closeOnBackdrop?: boolean;
	}

	let { open, onclose, children, maxWidth = 'max-w-lg', closeOnBackdrop = true }: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') onclose();
	}

	function handleBackdropClick() {
		if (closeOnBackdrop) onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full {maxWidth} mx-4 rounded-xl border border-white/10 bg-[#0a0d14] p-6 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			{@render children()}
		</div>
	</div>
{/if}
