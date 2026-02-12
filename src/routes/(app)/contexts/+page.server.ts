import { contextDatasets, contexts, dashboards, datasets, db } from '$lib/server/db';
import { getDataMode } from '$lib/server/demo/runtime';
import { and, count, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { org } = await parent();
	const dataMode = getDataMode();

	// Single query with joins and aggregations to avoid N+1
	const orgContexts = await db
		.select({
			id: contexts.id,
			name: contexts.name,
			description: contexts.description,
			createdAt: contexts.createdAt,
			datasetCount: count(contextDatasets.id),
			questionCount: count(dashboards.id),
		})
		.from(contexts)
		.leftJoin(contextDatasets, eq(contextDatasets.contextId, contexts.id))
		.leftJoin(dashboards, and(eq(dashboards.contextId, contexts.id), eq(dashboards.mode, dataMode)))
		.where(and(eq(contexts.orgId, org.id), eq(contexts.mode, dataMode)))
		.groupBy(contexts.id, contexts.name, contexts.description, contexts.createdAt)
		.orderBy(desc(contexts.createdAt));

	const pageDatasets = await db
		.select({
			id: datasets.id,
			name: datasets.name,
			rowCount: datasets.rowCount,
		})
		.from(datasets)
		.where(eq(datasets.orgId, org.id));

	return {
		pageContexts: orgContexts,
		pageDatasets,
	};
};
