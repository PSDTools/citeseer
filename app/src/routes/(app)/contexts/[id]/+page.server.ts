import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, contexts, contextDatasets, datasets, dashboards, settings } from '$lib/server/db';
import { eq, and, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { org } = await parent();

	// Get the context
	const [context] = await db
		.select()
		.from(contexts)
		.where(and(eq(contexts.id, params.id), eq(contexts.orgId, org.id)));

	if (!context) {
		error(404, 'Context not found');
	}

	// Get datasets in this context
	const datasetLinks = await db
		.select({
			dataset: {
				id: datasets.id,
				name: datasets.name,
				rowCount: datasets.rowCount,
				schema: datasets.schema
			}
		})
		.from(contextDatasets)
		.innerJoin(datasets, eq(contextDatasets.datasetId, datasets.id))
		.where(eq(contextDatasets.contextId, params.id));

	// Get dashboards for this context (with full data for graph reconstruction)
	const contextDashboards = await db
		.select({
			id: dashboards.id,
			name: dashboards.name,
			question: dashboards.question,
			plan: dashboards.plan,
			results: dashboards.results,
			parentDashboardId: dashboards.parentDashboardId,
			nodeContext: dashboards.nodeContext,
			createdAt: dashboards.createdAt
		})
		.from(dashboards)
		.where(eq(dashboards.contextId, params.id))
		.orderBy(desc(dashboards.createdAt));

	// Get all org datasets for the "add datasets" picker
	const allDatasets = await db
		.select({
			id: datasets.id,
			name: datasets.name,
			rowCount: datasets.rowCount
		})
		.from(datasets)
		.where(eq(datasets.orgId, org.id));

	// Check if org has API key
	const [orgSettings] = await db
		.select({ geminiApiKey: settings.geminiApiKey })
		.from(settings)
		.where(eq(settings.orgId, org.id));

	return {
		context,
		datasets: datasetLinks.map((l) => l.dataset),
		dashboards: contextDashboards,
		allDatasets,
		hasApiKey: !!orgSettings?.geminiApiKey
	};
};
