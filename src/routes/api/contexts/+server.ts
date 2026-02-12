import { getUserOrganizations } from '$lib/server/auth';
import { contextDatasets, contexts, db } from '$lib/server/db';
import { mirrorLiveWorkspaceToDemo } from '$lib/server/demo/mirror';
import { getDataMode, isDemoActive, isDemoBuild } from '$lib/server/demo/runtime';
import { error, json } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
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
	const dataMode = getDataMode();

	const orgContexts = await db
		.select({
			id: contexts.id,
			name: contexts.name,
			description: contexts.description,
			createdAt: contexts.createdAt,
		})
		.from(contexts)
		.where(and(eq(contexts.orgId, orgId), eq(contexts.mode, dataMode)))
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
	const userId = locals.user.id;

	const orgs = await getUserOrganizations(userId);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}

	const orgId = orgs[0].id;
	const dataMode = getDataMode();

	let body;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}
	const { name, description, datasetIds } = body as {
		name: string;
		description?: string;
		datasetIds?: string[];
	};
	const shouldMirrorLiveToDemoFile = isDemoBuild && !isDemoActive();

	if (!name?.trim()) {
		error(400, 'Name is required');
	}

	// Create context and link datasets in a single transaction
	const context = await db.transaction(async (tx) => {
		const [ctx] = await tx
			.insert(contexts)
			.values({
				orgId,
				name: name.trim(),
				mode: dataMode,
				description: description?.trim(),
				createdBy: userId,
			})
			.returning();

		if (datasetIds && datasetIds.length > 0) {
			await tx.insert(contextDatasets).values(
				datasetIds.map((datasetId) => ({
					contextId: ctx.id,
					datasetId,
				})),
			);
		}

		return ctx;
	});

	if (shouldMirrorLiveToDemoFile) {
		await mirrorLiveWorkspaceToDemo(orgId);
	}

	return json({ context }, { status: 201 });
};
