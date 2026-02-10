<script lang="ts">
	import logoUrl from '$lib/assets/logo.svg';

	interface Props {
		class?: string;
		label?: string;
	}

	let { class: className = '', label = 'Loading' }: Props = $props();
</script>

<span class={`logo-spinner ${className}`} role="status" aria-label={label}>
	<span class="logo-spinner__radar" aria-hidden="true"></span>
	<img src={logoUrl} alt="" class="logo-spinner__logo" />
</span>

<style>
	.logo-spinner {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.logo-spinner__radar {
		position: absolute;
		inset: 6%;
		border-radius: 9999px;
		border: 1px solid rgba(100, 255, 150, 0.35);
	}

	.logo-spinner__radar::after {
		content: '';
		position: absolute;
		inset: -1px;
		border-radius: inherit;
		background: conic-gradient(
			from 0deg,
			rgba(100, 255, 150, 0) 0deg,
			rgba(100, 255, 150, 0.35) 70deg,
			rgba(100, 255, 150, 0) 140deg
		);
		animation: logo-spinner-radar 1.4s linear infinite;
	}

	.logo-spinner__logo {
		width: 72%;
		height: 72%;
		object-fit: contain;
		animation: logo-spinner-search 1.2s ease-in-out infinite;
		transform-origin: 54% 46%;
		filter: drop-shadow(0 0 8px rgba(100, 255, 150, 0.28));
	}

	@keyframes logo-spinner-search {
		0% {
			transform: translate(-12%, 5%) rotate(-20deg);
		}
		25% {
			transform: translate(10%, -6%) rotate(16deg);
		}
		50% {
			transform: translate(8%, 8%) rotate(12deg);
		}
		75% {
			transform: translate(-10%, -5%) rotate(-18deg);
		}
		100% {
			transform: translate(-12%, 5%) rotate(-20deg);
		}
	}

	@keyframes logo-spinner-radar {
		to {
			transform: rotate(1turn);
		}
	}
</style>
