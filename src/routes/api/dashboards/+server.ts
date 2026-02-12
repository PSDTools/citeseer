import { getUserOrganizations } from '$lib/server/auth';
import { contexts, dashboards, db } from '$lib/server/db';
import type {
	AnalyticalPlan,
	DashboardNodeContext,
	PanelSpec,
	QueryResult,
} from '$lib/server/db/schema';
import { mirrorLiveWorkspaceToDemo } from '$lib/server/demo/mirror';
import { getDataMode, isDemoActive, isDemoBuild } from '$lib/server/demo/runtime';
import { error, json } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const DEMO_SIMULATED_MIN_MS = 1_200;
const DEMO_SIMULATED_JITTER_MS = 1_200;
const DASHBOARD_MATCH_THRESHOLD = 0.52;

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

	let body;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}
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
	const shouldMirrorLiveToDemoFile = isDemoBuild && !isDemoActive();

	if (!name || !question || !panels) {
		error(400, 'Name, question, and panels are required');
	}

	if (isDemoActive()) {
		// Keep demo UX realistic and avoid duplicate dashboards for similar prompts.
		const simulatedDelay =
			DEMO_SIMULATED_MIN_MS + Math.floor(Math.random() * DEMO_SIMULATED_JITTER_MS);
		await new Promise((resolve) => setTimeout(resolve, simulatedDelay));

		const baseFilter = and(eq(dashboards.orgId, orgId), eq(dashboards.mode, dataMode));
		const contextFilter = contextId
			? and(baseFilter, eq(dashboards.contextId, contextId))
			: baseFilter;

		const existingDashboards = await db.select().from(dashboards).where(contextFilter);

		const bestMatch = findMostSimilarDashboard(question, existingDashboards);
		if (bestMatch && bestMatch.score >= DASHBOARD_MATCH_THRESHOLD) {
			return json({ dashboard: bestMatch.dashboard, reused: true, similarity: bestMatch.score });
		}
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

	if (shouldMirrorLiveToDemoFile) {
		await mirrorLiveWorkspaceToDemo(orgId);
	}

	return json({ dashboard }, { status: 201 });
};

function findMostSimilarDashboard(
	question: string,
	existing: Array<typeof dashboards.$inferSelect>,
): { dashboard: typeof dashboards.$inferSelect; score: number } | null {
	const normalized = normalizeText(question);
	let best: { dashboard: typeof dashboards.$inferSelect; score: number } | null = null;

	for (const dashboard of existing) {
		const score = similarity(normalized, normalizeText(dashboard.question || ''));
		if (!best || score > best.score) {
			best = { dashboard, score };
		}
	}

	return best;
}

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function similarity(a: string, b: string): number {
	if (!a || !b) return 0;
	if (a === b) return 1;

	const aTokens = new Set(a.split(' ').filter(Boolean));
	const bTokens = new Set(b.split(' ').filter(Boolean));
	if (aTokens.size === 0 || bTokens.size === 0) return 0;

	const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
	const union = new Set([...aTokens, ...bTokens]).size;
	const jaccard = union > 0 ? intersection / union : 0;
	const overlap = intersection / Math.min(aTokens.size, bTokens.size);
	const containsBoost = a.includes(b) || b.includes(a) ? 0.12 : 0;

	return Math.min(1, overlap * 0.55 + jaccard * 0.45 + containsBoost);
}
