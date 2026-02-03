import { error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db, dashboards, datasets, contextDatasets } from '$lib/server/db';
import { eq, and, sql, inArray } from 'drizzle-orm';
import type { QueryResult } from '$lib/types/toon';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { org } = await parent();

	const [dashboard] = await db
		.select()
		.from(dashboards)
		.where(and(eq(dashboards.id, params.id), eq(dashboards.orgId, org.id)));

	if (!dashboard) {
		error(404, 'Dashboard not found');
	}

	// Re-execute the queries to get fresh data
	const results: Record<number, QueryResult> = {};

	if (dashboard.plan?.viz) {
		// Get datasets - either from context or all org datasets
		let datasetIds: string[] = [];

		if (dashboard.contextId) {
			const ctxLinks = await db
				.select({ datasetId: contextDatasets.datasetId })
				.from(contextDatasets)
				.where(eq(contextDatasets.contextId, dashboard.contextId));
			datasetIds = ctxLinks.map((l) => l.datasetId);
		} else {
			const orgDatasets = await db
				.select({ id: datasets.id })
				.from(datasets)
				.where(eq(datasets.orgId, org.id));
			datasetIds = orgDatasets.map((d) => d.id);
		}

		if (datasetIds.length > 0) {
			for (let i = 0; i < dashboard.plan.viz.length; i++) {
				const panel = dashboard.plan.viz[i];
				const panelSql = panel.sql || dashboard.plan.sql;

				if (panelSql) {
					try {
						// Replace DATASET_ID with actual dataset ID
						let finalSql = panelSql;
						finalSql = finalSql.replace(/'DATASET_ID'/g, `'${datasetIds[0]}'`);
						finalSql = finalSql.replace(/DATASET_ID/g, `'${datasetIds[0]}'`);

						const queryResult = await db.execute(sql.raw(finalSql));
						const rows = Array.isArray(queryResult) ? queryResult : [];

						results[i] = {
							success: true,
							data: rows as Record<string, unknown>[],
							columns: rows.length > 0 ? Object.keys(rows[0]) : [],
							rowCount: rows.length
						};
					} catch (e) {
						results[i] = {
							success: false,
							data: [],
							columns: [],
							rowCount: 0,
							error: e instanceof Error ? e.message : 'Query execution failed'
						};
					}
				}
			}
		}
	}

	return {
		dashboard,
		results
	};
};

export const actions: Actions = {
	delete: async ({ params, locals }) => {
		if (!locals.user) {
			error(401, 'Unauthorized');
		}

		const { org } = await (await import('$lib/server/auth')).getUserOrganizations(locals.user.id).then(orgs => ({ org: orgs[0] }));

		if (!org) {
			error(403, 'No organization');
		}

		await db
			.delete(dashboards)
			.where(and(eq(dashboards.id, params.id), eq(dashboards.orgId, org.id)));

		return { success: true };
	}
};
