import type { PageServerLoad } from './$types';
import { db, datasets, settings, contexts, contextDatasets, dashboards } from '$lib/server/db';
import { eq, desc, count, and } from 'drizzle-orm';
import { isDemoActive, getDataMode } from '$lib/server/demo/runtime';
import { hasLlmConfig } from '$lib/server/llm/config';

export const load: PageServerLoad = async ({ parent }) => {
	const { org } = await parent();
	const dataMode = getDataMode();

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
			createdAt: contexts.createdAt,
		})
		.from(contexts)
		.where(and(eq(contexts.orgId, org.id), eq(contexts.mode, dataMode)))
		.orderBy(desc(contexts.createdAt))
		.limit(6);

	const contextsWithStats = await Promise.all(
		orgContexts.map(async (ctx) => {
			const [datasetCount] = await db
				.select({ count: count() })
				.from(contextDatasets)
				.where(eq(contextDatasets.contextId, ctx.id));

			const [questionCount] = await db
				.select({ count: count() })
				.from(dashboards)
				.where(and(eq(dashboards.contextId, ctx.id), eq(dashboards.mode, dataMode)));

			return {
				...ctx,
				datasetCount: datasetCount.count,
				questionCount: questionCount.count,
			};
		}),
	);

	const [orgSettings] = await db.select().from(settings).where(eq(settings.orgId, org.id));

	// Get all datasets for the create context dialog
	const allDatasets = await db
		.select({
			id: datasets.id,
			name: datasets.name,
			rowCount: datasets.rowCount,
		})
		.from(datasets)
		.where(eq(datasets.orgId, org.id));

	return {
		totalDatasets: datasetStats.count,
		totalContexts: orgContexts.length,
		contexts: contextsWithStats,
		allDatasets,
		hasApiKey: isDemoActive() || hasLlmConfig(orgSettings),
	};
};
