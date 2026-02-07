<script lang="ts">
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

	// svelte-ignore state_referenced_locally
	let containerWidth = $state(width);
	let simulation: d3.Simulation<D3Node, D3Link> | null = null;

	function truncateText(text: string, maxLength: number = 30): string {
		return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
	}

	function buildLinks(nodeList: D3Node[]): D3Link[] {
		const nodeMap = new Map(nodeList.map((node) => [node.id, node]));
		const links: D3Link[] = [];

		for (const node of nodeList) {
			if (node.parentId) {
				const parent = nodeMap.get(node.parentId);
				if (parent) {
					links.push({ source: parent, target: node });
				}
			}
		}

		return links;
	}

	function d3GraphAttachment(params: {
		nodes: GraphNode[];
		activeNodeId: string | null;
		onNodeClick: (node: GraphNode) => void;
		containerWidth: number;
		width: number;
		height: number;
	}) {
		return (container: HTMLDivElement) => {
			const w = params.containerWidth || params.width;
			const svg = d3
				.select(container)
				.append('svg')
				.attr('width', w)
				.attr('height', params.height)
				.attr('viewBox', [0, 0, w, params.height]);

			svg
				.append('defs')
				.append('marker')
				.attr('id', 'exploration-arrowhead')
				.attr('viewBox', '-0 -5 10 10')
				.attr('refX', 20)
				.attr('refY', 0)
				.attr('orient', 'auto')
				.attr('markerWidth', 6)
				.attr('markerHeight', 6)
				.append('path')
				.attr('d', 'M 0,-5 L 10 ,0 L 0,5')
				.attr('fill', 'rgba(100, 255, 150, 0.4)');

			const graphGroup = svg.append('g').attr('class', 'graph-content');

			const zoomBehavior = d3
				.zoom<SVGSVGElement, unknown>()
				.scaleExtent([0.3, 3])
				.on('zoom', (event) => {
					graphGroup.attr('transform', event.transform);
				});

			svg.call(zoomBehavior);

			const nextWidth = params.containerWidth || params.width;
			svg
				.attr('width', nextWidth)
				.attr('height', params.height)
				.attr('viewBox', [0, 0, nextWidth, params.height]);

			graphGroup.selectAll('*').remove();

			if (params.nodes.length === 0) {
				simulation?.stop();
				return () => {
					simulation?.stop();
					svg.remove();
				};
			}

			const d3Nodes: D3Node[] = params.nodes.map((node) => ({ ...node }));
			const d3Links = buildLinks(d3Nodes);

			simulation?.stop();
			simulation = d3
				.forceSimulation<D3Node>(d3Nodes)
				.force(
					'link',
					d3
						.forceLink<D3Node, D3Link>(d3Links)
						.id((node) => node.id)
						.distance(80)
				)
				.force('charge', d3.forceManyBody().strength(-200))
				.force('center', d3.forceCenter(nextWidth / 2, params.height / 2))
				.force('collision', d3.forceCollide().radius(40));

			const link = graphGroup
				.append('g')
				.attr('class', 'links')
				.selectAll('line')
				.data(d3Links)
				.join('line')
				.attr('stroke', 'rgba(100, 255, 150, 0.3)')
				.attr('stroke-width', 2)
				.attr('marker-end', 'url(#exploration-arrowhead)');

			const node = graphGroup
				.append('g')
				.attr('class', 'nodes')
				.selectAll<SVGGElement, D3Node>('g')
				.data(d3Nodes)
				.join('g')
				.attr('class', 'node')
				.style('cursor', 'pointer')
				.call(
					d3
						.drag<SVGGElement, D3Node>()
						.on('start', (event, draggedNode) => {
							if (!event.active && simulation) simulation.alphaTarget(0.3).restart();
							draggedNode.fx = draggedNode.x;
							draggedNode.fy = draggedNode.y;
						})
						.on('drag', (event, draggedNode) => {
							draggedNode.fx = event.x;
							draggedNode.fy = event.y;
						})
						.on('end', (event, draggedNode) => {
							if (!event.active && simulation) simulation.alphaTarget(0);
							draggedNode.fx = null;
							draggedNode.fy = null;
						})
				)
				.on('click', (event, clickedNode) => {
					event.stopPropagation();
					params.onNodeClick(clickedNode);
				});

			node
				.append('circle')
				.attr('r', 12)
				.attr('fill', (nodeDatum) => (nodeDatum.id === params.activeNodeId ? '#64ff96' : '#1a1f2e'))
				.attr('stroke', (nodeDatum) =>
					nodeDatum.id === params.activeNodeId ? '#64ff96' : 'rgba(100, 255, 150, 0.5)'
				)
				.attr('stroke-width', 2);

			node
				.append('text')
				.attr('dy', 28)
				.attr('text-anchor', 'middle')
				.attr('fill', (nodeDatum) =>
					nodeDatum.id === params.activeNodeId ? '#64ff96' : 'rgba(255, 255, 255, 0.7)'
				)
				.attr('font-size', '10px')
				.attr('pointer-events', 'none')
				.text((nodeDatum) => truncateText(nodeDatum.question, 25));

			node
				.append('text')
				.attr('dy', 4)
				.attr('text-anchor', 'middle')
				.attr('fill', (nodeDatum) => (nodeDatum.id === params.activeNodeId ? '#0a0d14' : '#64ff96'))
				.attr('font-size', '10px')
				.attr('font-weight', 'bold')
				.attr('pointer-events', 'none')
				.text((_nodeDatum, index) => index + 1);

			simulation.on('tick', () => {
				link
					.attr('x1', (linkDatum) => linkDatum.source.x ?? 0)
					.attr('y1', (linkDatum) => linkDatum.source.y ?? 0)
					.attr('x2', (linkDatum) => linkDatum.target.x ?? 0)
					.attr('y2', (linkDatum) => linkDatum.target.y ?? 0);

				node.attr('transform', (nodeDatum) => `translate(${nodeDatum.x ?? 0},${nodeDatum.y ?? 0})`);
			});

			return () => {
				simulation?.stop();
				svg.remove();
			};
		};
	}
</script>

<div
	{@attach d3GraphAttachment({ nodes, activeNodeId, onNodeClick, containerWidth, width, height })}
	bind:clientWidth={containerWidth}
	class="w-full overflow-hidden rounded-lg border border-white/10 bg-[#0a0d14]/50"
	style="height: {height}px;"
></div>
