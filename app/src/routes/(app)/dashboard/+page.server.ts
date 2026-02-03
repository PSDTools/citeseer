import type { PageServerLoad } from './$types';
import { db, datasets, settings, contexts, contextDatasets, dashboards } from '$lib/server/db';
import { eq, desc, count } from 'drizzle-orm';

export const load: PageServerLoad = async ({ parent }) => {
	const { org } = await parent();

	// Get datasets count
	const [datasetStats] = await db
		.select({ count: count() })
		.from(datasets)
		.where(eq(datasets.orgId, org.id));

	// Get contexts with dashboard counts
	const orgContexts = await db
		.select({
			id: contexts.id,
			name: contexts.name,
			description: contexts.description,
			createdAt: contexts.createdAt
		})
		.from(contexts)
		.where(eq(contexts.orgId, org.id))
		.orderBy(desc(contexts.createdAt))
		.limit(6);

	const contextsWithStats = await Promise.all(
		orgContexts.map(async (ctx) => {
			const [datasetCount] = await db
				.select({ count: count() })
				.from(contextDatasets)
				.where(eq(contextDatasets.contextId, ctx.id));

			const [dashboardCount] = await db
				.select({ count: count() })
				.from(dashboards)
				.where(eq(dashboards.contextId, ctx.id));

			const recentDashboards = await db
				.select({ id: dashboards.id, name: dashboards.name })
				.from(dashboards)
				.where(eq(dashboards.contextId, ctx.id))
				.orderBy(desc(dashboards.createdAt))
				.limit(3);

			return {
				...ctx,
				datasetCount: datasetCount.count,
				dashboardCount: dashboardCount.count,
				recentDashboards
			};
		})
	);

	// Check if org has API key configured
	const [orgSettings] = await db
		.select({ geminiApiKey: settings.geminiApiKey })
		.from(settings)
		.where(eq(settings.orgId, org.id));

	return {
		totalDatasets: datasetStats.count,
		totalContexts: orgContexts.length,
		contexts: contextsWithStats,
		hasApiKey: !!orgSettings?.geminiApiKey
	};
};
