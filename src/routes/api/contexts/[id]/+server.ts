import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, contexts, contextDatasets, datasets } from '$lib/server/db';
import { getUserOrganizations } from '$lib/server/auth';
import { eq, and } from 'drizzle-orm';

// GET - Get a single context with its datasets
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}

	const orgId = orgs[0].id;

	const [context] = await db
		.select()
		.from(contexts)
		.where(and(eq(contexts.id, params.id), eq(contexts.orgId, orgId)));

	if (!context) {
		error(404, 'Context not found');
	}

	// Get datasets in this context
	const datasetLinks = await db
		.select({
			dataset: {
				id: datasets.id,
				name: datasets.name,
				rowCount: datasets.rowCount
			}
		})
		.from(contextDatasets)
		.innerJoin(datasets, eq(contextDatasets.datasetId, datasets.id))
		.where(eq(contextDatasets.contextId, params.id));

	return json({
		context,
		datasets: datasetLinks.map((l) => l.dataset)
	});
};

// DELETE - Delete a context
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}

	const orgId = orgs[0].id;

	const [deleted] = await db
		.delete(contexts)
		.where(and(eq(contexts.id, params.id), eq(contexts.orgId, orgId)))
		.returning();

	if (!deleted) {
		error(404, 'Context not found');
	}

	return json({ success: true });
};

// PATCH - Update a context
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}

	const orgId = orgs[0].id;

	const body = await request.json();
	const { name, description } = body as { name?: string; description?: string };

	const [updated] = await db
		.update(contexts)
		.set({
			...(name && { name: name.trim() }),
			...(description !== undefined && { description: description?.trim() || null })
		})
		.where(and(eq(contexts.id, params.id), eq(contexts.orgId, orgId)))
		.returning();

	if (!updated) {
		error(404, 'Context not found');
	}

	return json({ context: updated });
};
