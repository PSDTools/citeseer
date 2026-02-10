import { db } from '$lib/server/db';
import { contextDatasets, contexts, dashboards, datasets, settings } from '$lib/server/db/schema';
import { count, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

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
			createdAt: contexts.createdAt,
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

			const [questionCount] = await db
				.select({ count: count() })
				.from(dashboards)
				.where(eq(dashboards.contextId, ctx.id));

			return {
				...ctx,
				datasetCount: datasetCount.count,
				questionCount: questionCount.count,
			};
		}),
	);

	// Check if org has API key configured
	const [orgSettings] = await db
		.select({ geminiApiKey: settings.geminiApiKey })
		.from(settings)
		.where(eq(settings.orgId, org.id));

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
		hasApiKey: !!orgSettings?.geminiApiKey,
	};
};
