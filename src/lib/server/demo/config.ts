import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalyticalPlan, QueryResult } from '$lib/types/toon';

const DEMO_CONFIG_PATH = join(process.cwd(), 'data', 'demo.json');
const DEMO_CONFIG_BACKUP_PATH = join(process.cwd(), 'data', 'demo.json.bak');
const DEMO_CONFIG_TMP_PATH = join(process.cwd(), 'data', 'demo.json.tmp');

export interface DemoQueryResponse {
	plan: AnalyticalPlan;
	results: Record<number, QueryResult>;
	errorExplanation?: {
		explanation: string;
		suggestions: string[];
		retryInfo?: string;
	} | null;
}

export interface DemoResponse {
	query?: DemoQueryResponse;
	realign?: {
		suggestions: string[];
	};
	contextName?: {
		name: string;
	};
}

interface DemoConfigDataset {
	name: string;
	fileName: string;
	table: string;
}

interface DemoPattern {
	regex: string;
	flags?: string;
	response: DemoResponse;
}

export interface DemoWorkspaceData {
	contexts: Array<{
		id: string;
		name: string;
		description?: string | null;
		datasetIds?: string[];
		createdAt: string;
	}>;
	dashboards: Array<{
		id: string;
		name: string;
		question: string;
		description?: string | null;
		contextId?: string | null;
		parentDashboardId?: string | null;
		rootDashboardId?: string | null;
		plan?: AnalyticalPlan;
		panels?: unknown;
		results?: Record<number, QueryResult>;
		nodeContext?: unknown;
		createdAt: string;
	}>;
	updatedAt?: string;
}

interface RawDemoConfig {
	dataset: DemoConfigDataset;
	patterns: DemoPattern[];
	defaultResponse: {
		query: DemoQueryResponse;
		realign: { suggestions: string[] };
		contextName: { name: string };
	};
	workspace?: DemoWorkspaceData;
}

interface CompiledDemoPattern {
	regex: RegExp;
	response: DemoResponse;
}

export interface DemoConfig {
	dataset: DemoConfigDataset;
	patterns: CompiledDemoPattern[];
	defaultResponse: Required<DemoResponse>;
	workspace?: DemoWorkspaceData;
}

let demoConfigPromise: Promise<DemoConfig> | null = null;
let mutationQueue: Promise<void> = Promise.resolve();

export async function getDemoConfig(): Promise<DemoConfig> {
	if (!demoConfigPromise) {
		demoConfigPromise = loadDemoConfig();
	}
	return demoConfigPromise;
}

export async function matchDemoResponse(question: string): Promise<Required<DemoResponse>> {
	const config = await getDemoConfig();
	const normalizedQuestion = normalizeText(question);
	const feasibleFallback = findFeasibleFallbackPattern(config.patterns);

	const matchedPattern = config.patterns.find((pattern) => {
		pattern.regex.lastIndex = 0;
		return pattern.regex.test(question);
	});
	if (matchedPattern) {
		return buildResolvedResponse(matchedPattern, config.defaultResponse, feasibleFallback);
	}

	const similarPattern = findMostSimilarPattern(normalizedQuestion, config.patterns);
	if (similarPattern) {
		return buildResolvedResponse(similarPattern, config.defaultResponse, feasibleFallback);
	}

	if (feasibleFallback) {
		return buildResolvedResponse(feasibleFallback, config.defaultResponse, feasibleFallback);
	}

	return config.defaultResponse;
}

function buildResolvedResponse(
	pattern: CompiledDemoPattern,
	defaultResponse: Required<DemoResponse>,
	feasibleFallback: CompiledDemoPattern | null,
): Required<DemoResponse> {
	const query = pattern.response.query ?? defaultResponse.query;
	const safeQuery =
		!query.plan.feasible && feasibleFallback?.response.query
			? feasibleFallback.response.query
			: query;

	return {
		query: safeQuery,
		realign: pattern.response.realign ?? defaultResponse.realign,
		contextName: pattern.response.contextName ?? defaultResponse.contextName,
	};
}

function findMostSimilarPattern(
	normalizedQuestion: string,
	patterns: CompiledDemoPattern[],
): CompiledDemoPattern | null {
	let best: CompiledDemoPattern | null = null;
	let bestScore = 0;

	for (const pattern of patterns) {
		const candidates = getPatternCandidates(pattern);
		if (candidates.length === 0) continue;

		const score = Math.max(
			...candidates.map((candidate) => similarity(normalizedQuestion, candidate)),
		);
		if (score > bestScore) {
			bestScore = score;
			best = pattern;
		}
	}

	return best;
}

function findFeasibleFallbackPattern(patterns: CompiledDemoPattern[]): CompiledDemoPattern | null {
	return (
		patterns.find(
			(pattern) =>
				Boolean(pattern.response.query?.plan?.feasible) &&
				Object.keys(pattern.response.query?.results || {}).length > 0,
		) ?? null
	);
}

function regexToComparableText(regex: RegExp): string {
	const source = regex.source
		.replace(/^\^/, '')
		.replace(/\$$/, '')
		.replace(/\\(.)/g, '$1')
		.replace(/[()[\]{}|.*+?]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	return normalizeText(source);
}

function getPatternCandidates(pattern: CompiledDemoPattern): string[] {
	const candidates = new Set<string>();
	const fromRegex = regexToComparableText(pattern.regex);
	if (fromRegex) {
		candidates.add(fromRegex);
	}

	const fromPlanQuestion = pattern.response.query?.plan?.q;
	if (typeof fromPlanQuestion === 'string') {
		const normalized = normalizeText(fromPlanQuestion);
		if (normalized) {
			candidates.add(normalized);
		}
	}

	return [...candidates];
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

	const aTokensArr = a.split(' ').filter(Boolean);
	const bTokensArr = b.split(' ').filter(Boolean);
	const aTokens = new Set(aTokensArr);
	const bTokens = new Set(bTokensArr);

	const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
	const union = new Set([...aTokens, ...bTokens]).size;
	const jaccard = union > 0 ? intersection / union : 0;

	const minSize = Math.min(aTokens.size, bTokens.size);
	const overlap = minSize > 0 ? intersection / minSize : 0;
	const dice =
		aTokens.size + bTokens.size > 0 ? (2 * intersection) / (aTokens.size + bTokens.size) : 0;

	// Reward near-phrase containment while still using token metrics as primary signal.
	const containsBoost = a.includes(b) || b.includes(a) ? 0.12 : 0;
	const score = overlap * 0.45 + dice * 0.35 + jaccard * 0.2 + containsBoost;
	return Math.min(1, score);
}

export async function recordLiveDemoPattern(
	question: string,
	response: DemoResponse,
): Promise<void> {
	const trimmedQuestion = question.trim();
	if (!trimmedQuestion) {
		return;
	}

	const regex = `^${escapeRegex(trimmedQuestion)}$`;

	await mutateDemoConfig(async (config) => {
		const existing = config.patterns.find(
			(pattern) => pattern.regex === regex && pattern.flags === 'i',
		);
		if (existing) {
			existing.response = {
				...existing.response,
				...serializeResponse(response),
			};
			return;
		}

		config.patterns.unshift({
			regex,
			flags: 'i',
			response: serializeResponse(response),
		});
	});
}

export async function saveDemoPattern(params: {
	question: string;
	response: DemoResponse;
	regex?: string;
	flags?: string;
	replace?: boolean;
}): Promise<void> {
	const trimmedQuestion = params.question.trim();
	if (!trimmedQuestion) {
		throw new Error('Question is required');
	}

	const regex = params.regex?.trim() || `^${escapeRegex(trimmedQuestion)}$`;
	const flags = params.flags?.trim() || 'i';
	try {
		new RegExp(regex, flags);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'invalid regex';
		throw new Error(`Invalid regex: ${message}`);
	}

	await mutateDemoConfig(async (config) => {
		const serialized = serializeResponse(params.response);
		const existing = config.patterns.find(
			(pattern) => pattern.regex === regex && pattern.flags === flags,
		);

		if (existing) {
			existing.response =
				params.replace === false ? { ...existing.response, ...serialized } : serialized;
			return;
		}

		config.patterns.unshift({
			regex,
			flags,
			response: serialized,
		});
	});
}

export async function recordLiveWorkspaceContext(context: {
	id: string;
	name: string;
	description?: string | null;
	datasetIds?: string[];
	createdAt: string;
}): Promise<void> {
	await mutateDemoConfig(async (config) => {
		if (!config.workspace) {
			config.workspace = { contexts: [], dashboards: [] };
		}

		const idx = config.workspace.contexts.findIndex((item) => item.id === context.id);
		if (idx >= 0) {
			config.workspace.contexts[idx] = context;
		} else {
			config.workspace.contexts.unshift(context);
		}
		config.workspace.updatedAt = new Date().toISOString();
	});
}

export async function recordLiveWorkspaceDashboard(dashboard: {
	id: string;
	name: string;
	question: string;
	description?: string | null;
	contextId?: string | null;
	parentDashboardId?: string | null;
	rootDashboardId?: string | null;
	plan?: AnalyticalPlan;
	panels?: unknown;
	results?: Record<number, QueryResult>;
	nodeContext?: unknown;
	createdAt: string;
}): Promise<void> {
	await mutateDemoConfig(async (config) => {
		if (!config.workspace) {
			config.workspace = { contexts: [], dashboards: [] };
		}

		const idx = config.workspace.dashboards.findIndex((item) => item.id === dashboard.id);
		if (idx >= 0) {
			config.workspace.dashboards[idx] = dashboard;
		} else {
			config.workspace.dashboards.unshift(dashboard);
		}
		config.workspace.updatedAt = new Date().toISOString();
	});
}

async function loadDemoConfig(): Promise<DemoConfig> {
	const parsed = await readRawConfig();

	return {
		dataset: parsed.dataset,
		patterns: parsed.patterns.map((pattern) => ({
			regex: new RegExp(pattern.regex, pattern.flags),
			response: {
				query: pattern.response.query ? normalizeQueryResponse(pattern.response.query) : undefined,
				realign: pattern.response.realign,
				contextName: pattern.response.contextName,
			},
		})),
		defaultResponse: {
			query: normalizeQueryResponse(parsed.defaultResponse.query),
			realign: parsed.defaultResponse.realign,
			contextName: parsed.defaultResponse.contextName,
		},
		workspace: parsed.workspace,
	};
}

async function readRawConfig(): Promise<RawDemoConfig> {
	let parsed: RawDemoConfig | null = null;
	try {
		const file = await readFile(DEMO_CONFIG_PATH, 'utf8');
		parsed = JSON.parse(file) as RawDemoConfig;
	} catch (err) {
		try {
			const backupFile = await readFile(DEMO_CONFIG_BACKUP_PATH, 'utf8');
			parsed = JSON.parse(backupFile) as RawDemoConfig;
			await atomicWriteConfig(parsed);
		} catch {
			parsed = null;
		}
	}

	parsed = ensureRawConfigDefaults(parsed);
	validateRawConfig(parsed);
	return parsed;
}

function validateRawConfig(config: RawDemoConfig): void {
	if (!config || typeof config !== 'object') {
		throw new Error('Demo config must be an object');
	}

	if (!config.dataset || typeof config.dataset !== 'object') {
		throw new Error('demo.json must include dataset metadata');
	}

	if (!config.dataset.name || !config.dataset.fileName || !config.dataset.table) {
		throw new Error('dataset must include name, fileName, and table');
	}

	if (!Array.isArray(config.patterns)) {
		throw new Error('patterns must be an array');
	}

	for (const pattern of config.patterns) {
		if (!pattern.regex || typeof pattern.regex !== 'string') {
			throw new Error('each pattern must include a regex string');
		}
		try {
			new RegExp(pattern.regex, pattern.flags);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'invalid regex';
			throw new Error(`Invalid regex in patterns: ${pattern.regex} (${message})`);
		}
	}

	if (!config.defaultResponse || typeof config.defaultResponse !== 'object') {
		throw new Error('defaultResponse must be defined');
	}

	if (
		!config.defaultResponse.query ||
		!config.defaultResponse.realign ||
		!config.defaultResponse.contextName
	) {
		throw new Error('defaultResponse must include query, realign, and contextName');
	}

	if (config.workspace) {
		if (!Array.isArray(config.workspace.contexts) || !Array.isArray(config.workspace.dashboards)) {
			throw new Error('workspace must include contexts[] and dashboards[] when present');
		}
	}
}

function normalizeQueryResponse(response: DemoQueryResponse | undefined): DemoQueryResponse {
	if (!response) {
		throw new Error('query response is missing');
	}

	const normalizedResults: Record<number, QueryResult> = {};
	for (const [key, value] of Object.entries(response.results || {})) {
		const numericKey = Number(key);
		if (!Number.isNaN(numericKey)) {
			normalizedResults[numericKey] = value;
		}
	}

	return {
		plan: {
			...response.plan,
			executiveSummary: sanitizeExecutiveSummary(response.plan.executiveSummary),
		},
		results: normalizedResults,
		errorExplanation: response.errorExplanation ?? null,
	};
}

function sanitizeExecutiveSummary(summary: string | undefined): string | undefined {
	if (!summary) return summary;

	return summary
		.replace(/\b(therefore|thus|so),?\s+we\s+(should|must|need to)\b/gi, 'This suggests')
		.replace(/\bwe\s+(should|must|need to)\b/gi, 'it may be useful to')
		.replace(/\bimmediately\b/gi, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

async function mutateDemoConfig(
	mutator: (config: RawDemoConfig) => void | Promise<void>,
): Promise<void> {
	mutationQueue = mutationQueue.then(async () => {
		const config = await readRawConfig();
		await mutator(config);
		await atomicWriteConfig(config);
		demoConfigPromise = null;
	});

	return mutationQueue;
}

export async function replaceWorkspaceSnapshot(workspace: DemoWorkspaceData): Promise<void> {
	await mutateDemoConfig(async (config) => {
		config.workspace = {
			contexts: workspace.contexts,
			dashboards: workspace.dashboards,
			updatedAt: workspace.updatedAt || new Date().toISOString(),
		};
	});
}

async function atomicWriteConfig(config: RawDemoConfig): Promise<void> {
	const serialized = `${JSON.stringify(config, null, 2)}\n`;
	await writeFile(DEMO_CONFIG_TMP_PATH, serialized, 'utf8');
	await rename(DEMO_CONFIG_TMP_PATH, DEMO_CONFIG_PATH);
	await writeFile(DEMO_CONFIG_BACKUP_PATH, serialized, 'utf8');
}

function ensureRawConfigDefaults(config: RawDemoConfig | null): RawDemoConfig {
	if (config && typeof config === 'object') {
		return {
			dataset:
				config.dataset && config.dataset.name && config.dataset.fileName && config.dataset.table
					? config.dataset
					: {
							name: 'Demo Dataset',
							fileName: 'demo.csv',
							table: 'demo_data',
						},
			patterns: Array.isArray(config.patterns) ? config.patterns : [],
			defaultResponse:
				config.defaultResponse?.query &&
				config.defaultResponse?.realign &&
				config.defaultResponse?.contextName
					? config.defaultResponse
					: buildDefaultResponse(),
			workspace:
				config.workspace &&
				Array.isArray(config.workspace.contexts) &&
				Array.isArray(config.workspace.dashboards)
					? config.workspace
					: { contexts: [], dashboards: [], updatedAt: new Date().toISOString() },
		};
	}

	return {
		dataset: {
			name: 'Demo Dataset',
			fileName: 'demo.csv',
			table: 'demo_data',
		},
		patterns: [],
		defaultResponse: buildDefaultResponse(),
		workspace: { contexts: [], dashboards: [], updatedAt: new Date().toISOString() },
	};
}

function buildDefaultResponse(): RawDemoConfig['defaultResponse'] {
	return {
		query: {
			plan: {
				_type: 'plan',
				q: 'default',
				feasible: false,
				reason: 'No demo response matched.',
				tables: [],
				suggestedInvestigations: ['Ask a question to capture a live demo response'],
			},
			results: {},
			errorExplanation: null,
		},
		realign: { suggestions: [] },
		contextName: { name: 'New Context' },
	};
}

function serializeResponse(response: DemoResponse): DemoResponse {
	return {
		query: response.query
			? {
					...response.query,
					results: Object.fromEntries(
						Object.entries(response.query.results).map(([key, value]) => [String(key), value]),
					),
				}
			: undefined,
		realign: response.realign,
		contextName: response.contextName,
	};
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
