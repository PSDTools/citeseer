import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, contextDatasets, contexts, dashboards } from '$lib/server/db';
import { replaceWorkspaceSnapshot, type DemoWorkspaceData } from './config';

export async function mirrorLiveWorkspaceToDemo(orgId: string): Promise<void> {
	const liveContexts = await db
		.select({
			id: contexts.id,
			name: contexts.name,
			description: contexts.description,
			createdAt: contexts.createdAt,
		})
		.from(contexts)
		.where(and(eq(contexts.orgId, orgId), eq(contexts.mode, 'live')))
		.orderBy(desc(contexts.createdAt));

	const contextIds = liveContexts.map((context) => context.id);
	const datasetLinks =
		contextIds.length > 0
			? await db
					.select({
						contextId: contextDatasets.contextId,
						datasetId: contextDatasets.datasetId,
					})
					.from(contextDatasets)
					.where(inArray(contextDatasets.contextId, contextIds))
			: [];

	const datasetIdsByContext = new Map<string, string[]>();
	for (const link of datasetLinks) {
		const list = datasetIdsByContext.get(link.contextId) || [];
		list.push(link.datasetId);
		datasetIdsByContext.set(link.contextId, list);
	}

	const liveDashboards = await db
		.select()
		.from(dashboards)
		.where(and(eq(dashboards.orgId, orgId), eq(dashboards.mode, 'live')))
		.orderBy(desc(dashboards.createdAt));

	const workspace: DemoWorkspaceData = {
		contexts: liveContexts.map((context) => ({
			id: context.id,
			name: context.name,
			description: context.description,
			datasetIds: datasetIdsByContext.get(context.id) || [],
			createdAt: context.createdAt.toISOString(),
		})),
		dashboards: liveDashboards.map((dashboard) => ({
			id: dashboard.id,
			name: dashboard.name,
			question: dashboard.question,
			description: dashboard.description,
			contextId: dashboard.contextId,
			parentDashboardId: dashboard.parentDashboardId,
			rootDashboardId: dashboard.rootDashboardId,
			plan: dashboard.plan || undefined,
			panels: dashboard.panels,
			results: dashboard.results || undefined,
			nodeContext: dashboard.nodeContext,
			createdAt: dashboard.createdAt.toISOString(),
		})),
		updatedAt: new Date().toISOString(),
	};

	await replaceWorkspaceSnapshot(workspace);
}
