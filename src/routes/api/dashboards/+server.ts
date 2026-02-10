import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, dashboards, contexts } from '$lib/server/db';
import { getUserOrganizations } from '$lib/server/auth';
import { eq, desc, and } from 'drizzle-orm';
import type {
	AnalyticalPlan,
	PanelSpec,
	DashboardNodeContext,
	QueryResult,
} from '$lib/server/db/schema';
import { recordLiveWorkspaceDashboard } from '$lib/server/demo/config';
import { isDemoActive, isDemoBuild, getDataMode } from '$lib/server/demo/runtime';

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
	const dataMode = getDataMode();

	const orgDashboards = await db
		.select({
			id: dashboards.id,
			name: dashboards.name,
			question: dashboards.question,
			description: dashboards.description,
			createdAt: dashboards.createdAt,
		})
		.from(dashboards)
		.where(and(eq(dashboards.orgId, orgId), eq(dashboards.mode, dataMode)))
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
	const dataMode = getDataMode();

	const body = await request.json();
	const {
		name,
		question,
		description,
		plan,
		panels,
		results,
		contextId,
		parentDashboardId,
		nodeContext,
	} = body as {
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
	const shouldCaptureLiveToDemoFile = isDemoBuild && !isDemoActive();

	if (!name || !question || !panels) {
		error(400, 'Name, question, and panels are required');
	}

	if (contextId) {
		const [context] = await db
			.select({ id: contexts.id })
			.from(contexts)
			.where(
				and(eq(contexts.id, contextId), eq(contexts.orgId, orgId), eq(contexts.mode, dataMode)),
			);
		if (!context) {
			error(404, 'Context not found');
		}
	}

	let rootDashboardId: string | undefined;

	if (parentDashboardId) {
		const [parent] = await db
			.select({ id: dashboards.id, rootDashboardId: dashboards.rootDashboardId })
			.from(dashboards)
			.where(
				and(
					eq(dashboards.id, parentDashboardId),
					eq(dashboards.orgId, orgId),
					eq(dashboards.mode, dataMode),
				),
			);

		if (!parent) {
			error(404, 'Parent dashboard not found');
		}

		rootDashboardId = parent.rootDashboardId ?? parent.id;
	}

	const [dashboard] = await db
		.insert(dashboards)
		.values({
			orgId,
			mode: dataMode,
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
			createdBy: locals.user.id,
		})
		.returning();

	if (shouldCaptureLiveToDemoFile) {
		await recordLiveWorkspaceDashboard({
			id: dashboard.id,
			name: dashboard.name,
			question: dashboard.question,
			description: dashboard.description,
			contextId: dashboard.contextId,
			parentDashboardId: dashboard.parentDashboardId,
			rootDashboardId: dashboard.rootDashboardId,
			plan: dashboard.plan || undefined,
			panels: dashboard.panels,
			results: dashboard.results || undefined,
			nodeContext: dashboard.nodeContext,
			createdAt: dashboard.createdAt.toISOString(),
		});
	}

	return json({ dashboard }, { status: 201 });
};
