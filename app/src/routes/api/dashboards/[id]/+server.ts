import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, dashboards } from '$lib/server/db';
import { getUserOrganizations } from '$lib/server/auth';
import { eq, and } from 'drizzle-orm';

// GET - Get a single dashboard
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}

	const orgId = orgs[0].id;

	const [dashboard] = await db
		.select()
		.from(dashboards)
		.where(and(eq(dashboards.id, params.id), eq(dashboards.orgId, orgId)));

	if (!dashboard) {
		error(404, 'Dashboard not found');
	}

	return json({ dashboard });
};

// DELETE - Delete a dashboard
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
		.delete(dashboards)
		.where(and(eq(dashboards.id, params.id), eq(dashboards.orgId, orgId)))
		.returning();

	if (!deleted) {
		error(404, 'Dashboard not found');
	}

	return json({ success: true });
};
