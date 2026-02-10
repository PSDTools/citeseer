import type { PageServerLoad } from './$types';
import { db, contexts, contextDatasets, datasets, dashboards } from '$lib/server/db';
import { eq, desc, count, and } from 'drizzle-orm';
import { getDataMode } from '$lib/server/demo/runtime';

export const load: PageServerLoad = async ({ parent }) => {
	const { org } = await parent();
	const dataMode = getDataMode();

	const orgContexts = await db
		.select({
			id: contexts.id,
			name: contexts.name,
			description: contexts.description,
			createdAt: contexts.createdAt,
		})
		.from(contexts)
		.where(and(eq(contexts.orgId, org.id), eq(contexts.mode, dataMode)))
		.orderBy(desc(contexts.createdAt));

	const pageContexts = await Promise.all(
		orgContexts.map(async (ctx) => {
			const [ds] = await db
				.select({ count: count() })
				.from(contextDatasets)
				.where(eq(contextDatasets.contextId, ctx.id));

			const [qs] = await db
				.select({ count: count() })
				.from(dashboards)
				.where(and(eq(dashboards.contextId, ctx.id), eq(dashboards.mode, dataMode)));

			return {
				...ctx,
				datasetCount: ds.count,
				questionCount: qs.count,
			};
		}),
	);

	const pageDatasets = await db
		.select({
			id: datasets.id,
			name: datasets.name,
			rowCount: datasets.rowCount,
		})
		.from(datasets)
		.where(eq(datasets.orgId, org.id));

	return {
		pageContexts,
		pageDatasets,
	};
};
