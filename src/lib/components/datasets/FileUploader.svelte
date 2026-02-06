<script lang="ts">
	import { LoaderCircle, CloudUpload } from '@lucide/svelte';

	interface Props {
		onUpload: (file: File) => void;
		uploading?: boolean;
	}

	let { onUpload, uploading = false }: Props = $props();
	let dragOver = $state(false);
	let fileInput: HTMLInputElement;

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;

		const file = e.dataTransfer?.files[0];
		if (file && file.name.endsWith('.csv')) {
			onUpload(file);
		}
	}

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			onUpload(file);
		}
	}
</script>

<div
	role="button"
	tabindex="0"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	onclick={() => fileInput.click()}
	onkeydown={(e) => e.key === 'Enter' && fileInput.click()}
	class="relative cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all {dragOver
		? 'border-[#64ff96] bg-[#64ff96]/5'
		: 'border-white/20 hover:border-white/40 hover:bg-white/[0.02]'}"
>
	<input
		bind:this={fileInput}
		type="file"
		accept=".csv"
		onchange={handleFileSelect}
		class="hidden"
	/>

	{#if uploading}
		<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center">
			<LoaderCircle class="h-12 w-12 animate-spin text-[#64ff96]" />
		</div>
		<p class="text-lg font-medium text-white">Uploading...</p>
	{:else}
		<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
			<CloudUpload class="h-8 w-8 text-white/40" />
		</div>
		<p class="text-lg font-medium text-white">
			{#if dragOver}
				Drop your CSV file here
			{:else}
				Drag & drop a CSV file here
			{/if}
		</p>
		<p class="mt-1 text-sm text-white/50">or click to browse</p>
	{/if}
</div>
