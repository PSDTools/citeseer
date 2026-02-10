import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, dashboards } from '$lib/server/db';
import { getUserOrganizations } from '$lib/server/auth';
import { eq, and } from 'drizzle-orm';
import type { AnalyticalPlan, PanelSpec, QueryResult } from '$lib/server/db/schema';
import { getDataMode, isDemoActive, isDemoBuild } from '$lib/server/demo/runtime';
import { mirrorLiveWorkspaceToDemo } from '$lib/server/demo/mirror';

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
	const dataMode = getDataMode();

	const [dashboard] = await db
		.select()
		.from(dashboards)
		.where(
			and(eq(dashboards.id, params.id), eq(dashboards.orgId, orgId), eq(dashboards.mode, dataMode)),
		);

	if (!dashboard) {
		error(404, 'Dashboard not found');
	}

	return json({ dashboard });
};

// PATCH - Update a dashboard
export const PATCH: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}

	const orgId = orgs[0].id;
	const dataMode = getDataMode();
	const shouldMirrorLiveToDemoFile = isDemoBuild && !isDemoActive();

	// Verify dashboard exists and belongs to org
	const [existing] = await db
		.select({ id: dashboards.id })
		.from(dashboards)
		.where(
			and(eq(dashboards.id, params.id), eq(dashboards.orgId, orgId), eq(dashboards.mode, dataMode)),
		);

	if (!existing) {
		error(404, 'Dashboard not found');
	}

	const body = await request.json();
	const { name, description, plan, panels, results } = body as {
		name?: string;
		description?: string;
		plan?: AnalyticalPlan;
		panels?: PanelSpec[];
		results?: Record<number, QueryResult>;
	};

	const updateData: Record<string, unknown> = {
		updatedAt: new Date(),
	};

	if (name !== undefined) updateData.name = name;
	if (description !== undefined) updateData.description = description;
	if (plan !== undefined) updateData.plan = plan;
	if (panels !== undefined) updateData.panels = panels;
	if (results !== undefined) updateData.results = results;

	const [dashboard] = await db
		.update(dashboards)
		.set(updateData)
		.where(eq(dashboards.id, params.id))
		.returning();

	if (shouldMirrorLiveToDemoFile) {
		await mirrorLiveWorkspaceToDemo(orgId);
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
	const dataMode = getDataMode();
	const shouldMirrorLiveToDemoFile = isDemoBuild && !isDemoActive();

	const [deleted] = await db
		.delete(dashboards)
		.where(
			and(eq(dashboards.id, params.id), eq(dashboards.orgId, orgId), eq(dashboards.mode, dataMode)),
		)
		.returning();

	if (!deleted) {
		error(404, 'Dashboard not found');
	}

	if (shouldMirrorLiveToDemoFile) {
		await mirrorLiveWorkspaceToDemo(orgId);
	}

	return json({ success: true });
};
