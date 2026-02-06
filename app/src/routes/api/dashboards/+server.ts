import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, dashboards } from '$lib/server/db';
import { getUserOrganizations } from '$lib/server/auth';
import { eq, desc, and } from 'drizzle-orm';
import type { AnalyticalPlan, PanelSpec, DashboardNodeContext, QueryResult } from '$lib/server/db/schema';

// GET - List all dashboards for the org
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const orgs = await getUserOrganizations(locals.user.id);
	if (orgs.length === 0) {
		error(403, 'No organization');
	}

	const orgId = orgs[0].id;

	const orgDashboards = await db
		.select({
			id: dashboards.id,
			name: dashboards.name,
			question: dashboards.question,
			description: dashboards.description,
			createdAt: dashboards.createdAt
		})
		.from(dashboards)
		.where(eq(dashboards.orgId, orgId))
		.orderBy(desc(dashboards.createdAt));

	return json({ dashboards: orgDashboards });
};

// POST - Create a new dashboard
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
	const { name, question, description, plan, panels, results, contextId, parentDashboardId, nodeContext } = body as {
		name: string;
		question: string;
		description?: string;
		plan?: AnalyticalPlan;
		panels: PanelSpec[];
		results?: Record<number, QueryResult>;
		contextId?: string;
		parentDashboardId?: string;
		nodeContext?: DashboardNodeContext;
	};

	if (!name || !question || !panels) {
		error(400, 'Name, question, and panels are required');
	}

	let rootDashboardId: string | undefined;

	if (parentDashboardId) {
		const [parent] = await db
			.select({ id: dashboards.id, rootDashboardId: dashboards.rootDashboardId })
			.from(dashboards)
			.where(and(eq(dashboards.id, parentDashboardId), eq(dashboards.orgId, orgId)));

		if (!parent) {
			error(404, 'Parent dashboard not found');
		}

		rootDashboardId = parent.rootDashboardId ?? parent.id;
	}

	const [dashboard] = await db
		.insert(dashboards)
		.values({
			orgId,
			contextId,
			parentDashboardId,
			rootDashboardId,
			name,
			question,
			description,
			plan,
			panels,
			results,
			nodeContext,
			createdBy: locals.user.id
		})
		.returning();

	return json({ dashboard }, { status: 201 });
};
