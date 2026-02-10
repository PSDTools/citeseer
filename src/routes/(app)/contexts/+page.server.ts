import { db } from '$lib/server/db';
import { contextDatasets, contexts, dashboards, datasets } from '$lib/server/db/schema';
import { count, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { org } = await parent();

	const orgContexts = await db
		.select({
			id: contexts.id,
			name: contexts.name,
			description: contexts.description,
			createdAt: contexts.createdAt,
		})
		.from(contexts)
		.where(eq(contexts.orgId, org.id))
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
				.where(eq(dashboards.contextId, ctx.id));

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
