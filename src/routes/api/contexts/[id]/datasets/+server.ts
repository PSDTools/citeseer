import { db } from '$lib/server/db';
import { contextDatasets, contexts, datasets } from '$lib/server/db/schema';
import { getUserOrganizations } from '$lib/server/orgs';
import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// POST - Add datasets to a context
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}

	const orgId = orgs[0].id;

	// Verify context belongs to org
	const [context] = await db
		.select()
		.from(contexts)
		.where(and(eq(contexts.id, params.id), eq(contexts.orgId, orgId)));

	if (!context) {
		error(404, 'Context not found');
	}

	const body = await request.json();
	const { datasetIds } = body as { datasetIds: string[] };

	if (!datasetIds || datasetIds.length === 0) {
		error(400, 'datasetIds is required');
	}

	// Verify datasets belong to org and add them
	for (const datasetId of datasetIds) {
		const [dataset] = await db
			.select()
			.from(datasets)
			.where(and(eq(datasets.id, datasetId), eq(datasets.orgId, orgId)));

		if (!dataset) {
			continue; // Skip invalid datasets
		}

		// Check if already linked
		const [existing] = await db
			.select()
			.from(contextDatasets)
			.where(
				and(eq(contextDatasets.contextId, params.id), eq(contextDatasets.datasetId, datasetId)),
			);

		if (!existing) {
			await db.insert(contextDatasets).values({
				contextId: params.id,
				datasetId,
			});
		}
	}

	return json({ success: true });
};

// DELETE - Remove a dataset from a context
export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}

	const orgId = orgs[0].id;

	// Verify context belongs to org
	const [context] = await db
		.select()
		.from(contexts)
		.where(and(eq(contexts.id, params.id), eq(contexts.orgId, orgId)));

	if (!context) {
		error(404, 'Context not found');
	}

	const body = await request.json();
	const { datasetId } = body as { datasetId: string };

	if (!datasetId) {
		error(400, 'datasetId is required');
	}

	await db
		.delete(contextDatasets)
		.where(and(eq(contextDatasets.contextId, params.id), eq(contextDatasets.datasetId, datasetId)));

	return json({ success: true });
};
