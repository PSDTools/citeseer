import { db } from '$lib/server/db';
import type { ColumnSchema } from '$lib/server/db/schema';
import { datasets } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { org } = await parent();

	const orgDatasets = await db
		.select({
			id: datasets.id,
			name: datasets.name,
			fileName: datasets.fileName,
			rowCount: datasets.rowCount,
			schema: datasets.schema,
			createdAt: datasets.createdAt,
		})
		.from(datasets)
		.where(eq(datasets.orgId, org.id))
		.orderBy(datasets.createdAt);

	return {
		datasets: orgDatasets.map((d) => ({
			...d,
			columnCount: (d.schema as ColumnSchema[]).length,
		})),
	};
};
