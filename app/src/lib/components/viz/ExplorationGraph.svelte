<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	// @ts-ignore - d3 types will be available after pnpm sync
	import * as d3 from 'd3';
	import type { AnalyticalPlan, QueryResult } from '$lib/types/toon';

	export interface GraphNode {
		id: string;
		question: string;
		parentId: string | null;
		dashboardId?: string;
		filters?: Record<string, unknown>;
		timestamp: number;
		// Store the plan and results for this node
		plan?: AnalyticalPlan;
		results?: Record<number, QueryResult>;
	}

	interface D3Node extends GraphNode {
		x?: number;
		y?: number;
		fx?: number | null;
		fy?: number | null;
		vx?: number;
		vy?: number;
		index?: number;
	}

	interface D3Link {
		source: D3Node;
		target: D3Node;
	}

	let {
		nodes = [],
		activeNodeId = null,
		onNodeClick = () => {},
		width = 400,
		height = 200
	}: {
		nodes: GraphNode[];
		activeNodeId: string | null;
		onNodeClick: (node: GraphNode) => void;
		width?: number;
		height?: number;
	} = $props();

	let container: HTMLDivElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let svg: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let simulation: any;

	function truncateText(text: string, maxLength: number = 30): string {
		return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
	}

	function buildLinks(nodes: D3Node[]): D3Link[] {
		const nodeMap = new Map(nodes.map((n) => [n.id, n]));
		const links: D3Link[] = [];

		for (const node of nodes) {
			if (node.parentId) {
				const parent = nodeMap.get(node.parentId);
				if (parent) {
					links.push({ source: parent, target: node });
				}
			}
		}

		return links;
	}

	function initGraph() {
		if (!container) return;

		// Clear existing
		d3.select(container).selectAll('*').remove();

		svg = d3.select(container)
			.append('svg')
			.attr('width', width)
			.attr('height', height)
			.attr('viewBox', [0, 0, width, height]);

		// Add arrow marker for links
		svg
			.append('defs')
			.append('marker')
			.attr('id', 'arrowhead')
			.attr('viewBox', '-0 -5 10 10')
			.attr('refX', 20)
			.attr('refY', 0)
			.attr('orient', 'auto')
			.attr('markerWidth', 6)
			.attr('markerHeight', 6)
			.append('path')
			.attr('d', 'M 0,-5 L 10 ,0 L 0,5')
			.attr('fill', 'rgba(100, 255, 150, 0.4)');

		updateGraph();
	}

	function updateGraph() {
		if (!svg || nodes.length === 0) return;

		const d3Nodes: D3Node[] = nodes.map((n) => ({ ...n }));
		const d3Links = buildLinks(d3Nodes);

		// Stop previous simulation
		if (simulation) simulation.stop();

		// Create force simulation
		simulation = d3.forceSimulation(d3Nodes)
			.force(
				'link',
				d3.forceLink(d3Links)
					.id((d: D3Node) => d.id)
					.distance(80)
			)
			.force('charge', d3.forceManyBody().strength(-200))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(40));

		// Clear and rebuild
		svg.selectAll('g.graph-content').remove();
		const g = svg.append('g').attr('class', 'graph-content');

		// Add zoom behavior
		const zoomBehavior = d3.zoom()
			.scaleExtent([0.3, 3])
			.on('zoom', (event: { transform: string }) => {
				g.attr('transform', event.transform);
			});
		svg.call(zoomBehavior);

		// Links
		const link = g
			.append('g')
			.attr('class', 'links')
			.selectAll('line')
			.data(d3Links)
			.join('line')
			.attr('stroke', 'rgba(100, 255, 150, 0.3)')
			.attr('stroke-width', 2)
			.attr('marker-end', 'url(#arrowhead)');

		// Node groups
		const node = g
			.append('g')
			.attr('class', 'nodes')
			.selectAll('g')
			.data(d3Nodes)
			.join('g')
			.attr('class', 'node')
			.style('cursor', 'pointer')
			.call(
				d3.drag()
					.on('start', (event: { active: boolean }, d: D3Node) => {
						if (!event.active) simulation.alphaTarget(0.3).restart();
						d.fx = d.x;
						d.fy = d.y;
					})
					.on('drag', (event: { x: number; y: number }, d: D3Node) => {
						d.fx = event.x;
						d.fy = event.y;
					})
					.on('end', (event: { active: boolean }, d: D3Node) => {
						if (!event.active) simulation.alphaTarget(0);
						d.fx = null;
						d.fy = null;
					})
			)
			.on('click', (event: MouseEvent, d: D3Node) => {
				event.stopPropagation();
				onNodeClick(d);
			});

		// Node circles
		node
			.append('circle')
			.attr('r', 12)
			.attr('fill', (d: D3Node) => (d.id === activeNodeId ? '#64ff96' : '#1a1f2e'))
			.attr('stroke', (d: D3Node) => (d.id === activeNodeId ? '#64ff96' : 'rgba(100, 255, 150, 0.5)'))
			.attr('stroke-width', 2);

		// Node labels
		node
			.append('text')
			.attr('dy', 28)
			.attr('text-anchor', 'middle')
			.attr('fill', (d: D3Node) => (d.id === activeNodeId ? '#64ff96' : 'rgba(255, 255, 255, 0.7)'))
			.attr('font-size', '10px')
			.attr('pointer-events', 'none')
			.text((d: D3Node) => truncateText(d.question, 25));

		// Node index numbers
		node
			.append('text')
			.attr('dy', 4)
			.attr('text-anchor', 'middle')
			.attr('fill', (d: D3Node) => (d.id === activeNodeId ? '#0a0d14' : '#64ff96'))
			.attr('font-size', '10px')
			.attr('font-weight', 'bold')
			.attr('pointer-events', 'none')
			.text((_d: D3Node, i: number) => i + 1);

		// Update positions on tick
		simulation.on('tick', () => {
			link
				.attr('x1', (d: D3Link) => d.source.x!)
				.attr('y1', (d: D3Link) => d.source.y!)
				.attr('x2', (d: D3Link) => d.target.x!)
				.attr('y2', (d: D3Link) => d.target.y!);

			node.attr('transform', (d: D3Node) => `translate(${d.x},${d.y})`);
		});
	}

	onMount(() => {
		initGraph();
	});

	onDestroy(() => {
		if (simulation) simulation.stop();
	});

	$effect(() => {
		// Re-run when nodes or activeNodeId changes
		nodes;
		activeNodeId;
		if (svg) updateGraph();
	});
</script>

<div
	bind:this={container}
	class="w-full rounded-lg border border-white/10 bg-[#0a0d14]/50 overflow-hidden"
	style="height: {height}px;"
></div>
