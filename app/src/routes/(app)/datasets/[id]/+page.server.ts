import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, datasets, datasetRows } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { org } = await parent();

	const [dataset] = await db
		.select()
		.from(datasets)
		.where(and(eq(datasets.id, params.id), eq(datasets.orgId, org.id)));

	if (!dataset) {
		error(404, 'Dataset not found');
	}

	// Get sample rows
	const rows = await db
		.select()
		.from(datasetRows)
		.where(eq(datasetRows.datasetId, params.id))
		.limit(100);

	return {
		dataset,
		sampleRows: rows.map(r => r.data)
	};
};
