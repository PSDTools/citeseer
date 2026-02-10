import { db } from '$lib/server/db';
import { contextDatasets, contexts } from '$lib/server/db/schema';
import { getUserOrganizations } from '$lib/server/orgs';
import { error, json } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// GET - List all contexts for the org
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}

	const orgId = orgs[0].id;

	const orgContexts = await db
		.select({
			id: contexts.id,
			name: contexts.name,
			description: contexts.description,
			createdAt: contexts.createdAt,
		})
		.from(contexts)
		.where(eq(contexts.orgId, orgId))
		.orderBy(desc(contexts.createdAt));

	// Get dataset counts for each context
	const contextsWithCounts = await Promise.all(
		orgContexts.map(async (ctx) => {
			const datasetLinks = await db
				.select({ datasetId: contextDatasets.datasetId })
				.from(contextDatasets)
				.where(eq(contextDatasets.contextId, ctx.id));
			return {
				...ctx,
				datasetCount: datasetLinks.length,
			};
		}),
	);

	return json({ contexts: contextsWithCounts });
};

// POST - Create a new context
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}

	const orgId = orgs[0].id;

	const body = await request.json();
	const { name, description, datasetIds } = body as {
		name: string;
		description?: string;
		datasetIds?: string[];
	};

	if (!name?.trim()) {
		error(400, 'Name is required');
	}

	const [context] = await db
		.insert(contexts)
		.values({
			orgId,
			name: name.trim(),
			description: description?.trim(),
			createdBy: locals.user.id,
		})
		.returning();

	// Add datasets if provided
	if (datasetIds && datasetIds.length > 0) {
		await db.insert(contextDatasets).values(
			datasetIds.map((datasetId) => ({
				contextId: context.id,
				datasetId,
			})),
		);
	}

	return json({ context }, { status: 201 });
};
