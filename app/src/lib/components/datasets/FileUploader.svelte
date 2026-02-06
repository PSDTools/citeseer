<script lang="ts">
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
			<svg class="h-12 w-12 animate-spin text-[#64ff96]" fill="none" viewBox="0 0 24 24">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				/>
			</svg>
		</div>
		<p class="text-lg font-medium text-white">Uploading...</p>
	{:else}
		<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
			<svg class="h-8 w-8 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
				/>
			</svg>
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
