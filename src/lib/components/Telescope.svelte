<script lang="ts">
	import telescopeSvg from '$lib/assets/telescope.svg';
</script>

<!-- Hill -->
<div class="hill" aria-hidden="true"></div>

<!-- Telescope silhouette -->
<img src={telescopeSvg} class="telescope" alt="" aria-hidden="true" />

<style>
	.hill {
		position: absolute;
		z-index: 4;
		pointer-events: none;
		left: -20vw;
		bottom: -38vh;
		width: 80vw;
		height: 50vh;
		border-radius: 50%;
		background: black;
	}

	.telescope {
		position: absolute;
		z-index: 5;
		pointer-events: none;
		width: 90px;
		height: 90px;
		left: 8vw;
		bottom: 11vh;
	}

	@media (max-width: 1024px) {
		.telescope {
			width: 75px;
			height: 75px;
			left: 7vw;
			bottom: 10vh;
		}
	}

	@media (max-width: 768px) {
		.telescope {
			width: 60px;
			height: 60px;
			left: 5vw;
			bottom: 8vh;
		}

		.hill {
			width: 70vw;
			height: 45vh;
			bottom: -35vh;
		}
	}

	@media (max-width: 480px) {
		.telescope {
			width: 50px;
			height: 50px;
			left: 4vw;
			bottom: 6vh;
		}
	}
</style>
