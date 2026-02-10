import { parseToon, extractToon, ToonParseError } from './toon-parser';
import { getOverviewPrompt, getSystemPrompt } from './prompts';
import { GeminiCompiler } from './gemini';
import type { QueryCompiler } from './types';
import type { LlmConfig } from '$lib/server/llm/config';
import type { AnalyticalPlan, BranchContext, DashboardSpec, DatasetProfile } from '$lib/types/toon';

const MAX_RETRIES = 3;
const FORECAST_QUESTION_REGEX =
	/\b(forecast|predict|projection|project|projected|future|next\s+(month|quarter|year|week)|run[\s-]?rate|trend)\b/i;
const FORECAST_REFUSAL_REGEX =
	/\b(cannot|can't|unable|lack|no ability|not able)\b[\s\S]{0,120}\b(forecast|predict|projection|future|time series)\b/i;

function isForecastQuestion(question: string): boolean {
	return FORECAST_QUESTION_REGEX.test(question);
}

function isForecastRefusal(plan: AnalyticalPlan): boolean {
	if (plan.feasible) return false;
	const reason = plan.reason ?? '';
	return FORECAST_REFUSAL_REGEX.test(reason);
}

export class HttpLLMCompiler implements QueryCompiler {
	private config: LlmConfig;

	constructor(config: LlmConfig) {
		this.config = config;
	}

	async compileQuestion(
		question: string,
		datasets: DatasetProfile[],
		branchContext?: BranchContext,
	): Promise<AnalyticalPlan> {
		const schemaContext = GeminiCompiler.generateSchemaContext(datasets);
		const systemPrompt = getSystemPrompt(schemaContext, branchContext);

		let lastError: Error | null = null;
		let formatHint = '';

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				const text = await this.generateText({
					prompt: `${systemPrompt}\n\nQuestion: ${question}${formatHint}`,
					temperature: 0.3,
					maxOutputTokens: 4096,
				});

				const toonText = extractToon(text);
				const parsed = parseToon(toonText);

				if (parsed._type !== 'plan') {
					throw new Error(`Expected @plan but got @${parsed._type || 'unknown'}`);
				}

				const plan = parsed as unknown as AnalyticalPlan;
				if (isForecastQuestion(question) && isForecastRefusal(plan) && attempt < MAX_RETRIES - 1) {
					formatHint =
						'\n\nIMPORTANT FORECAST OVERRIDE: Forecasting IS supported in this product. Do NOT refuse forecasting requests. Produce a feasible:true plan using available historical data and provide an estimate/projection chart. If uncertainty exists, include caveats in panel description, but still return a working plan.';
					continue;
				}

				return plan;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				console.error(`Attempt ${attempt + 1} failed:`, lastError.message);

				if (error instanceof ToonParseError) {
					break;
				}

				formatHint =
					'\n\nIMPORTANT: You MUST respond with a @plan{...} object in TOON format. Do not use JSON or any other format.';
			}
		}

		return {
			_type: 'plan',
			q: question,
			feasible: false,
			reason: `Failed to compile question: ${lastError?.message || 'Unknown error'}`,
			tables: [],
			suggestedInvestigations: [
				'Try rephrasing your question',
				'Check if the required data is available',
			],
		};
	}

	async fixSQL(context: {
		question: string;
		originalSQL: string;
		error: string;
		datasets: DatasetProfile[];
	}): Promise<{ sql: string; explanation: string } | null> {
		const schemaContext = GeminiCompiler.generateSchemaContext(context.datasets);

		const prompt = `You are a SQL expert. Fix this PostgreSQL query that resulted in an error.

## Original Question
"${context.question}"

## Broken SQL
\`\`\`sql
${context.originalSQL}
\`\`\`

## Error Message
${context.error}

## Database Schema
All data is in \`dataset_rows\` table:
- \`dataset_id\` (UUID) - the only real column
- \`data\` (JSONB) - contains ALL row values, access via \`data->>'Column Name'\`

**CRITICAL RULES:**
- EVERY column value MUST use \`data->>'column_name'\` syntax
- Column names with spaces need quotes: \`data->>'Column Name'\`
- For numeric: \`(data->>'column')::numeric\`
- Use \`WHERE dataset_id = 'DATASET_ID'\`

**COMMON FIX 1: Text values with currency/percentage symbols**
If you see "invalid input syntax for type numeric" errors, the text contains $, commas, or % signs.
Clean the text BEFORE casting using REGEXP_REPLACE:
\`\`\`sql
REGEXP_REPLACE(data->>'Column Name', '[^0-9.-]', '', 'g')::numeric
\`\`\`

**COMMON FIX 2: YearMonth columns (YYYY-MM format)**
If you see "invalid input syntax for type timestamp" with columns like "Order YearMonth" or "YearMonth":
- These columns already contain YYYY-MM format strings like "2024-01"
- DO NOT cast them to timestamp or date - just use them directly!
\`\`\`sql
-- WRONG: to_char((data->>'Order YearMonth')::timestamp, 'YYYY-MM')
-- CORRECT: data->>'Order YearMonth' as year_month
\`\`\`

## Available Columns
${schemaContext}

## Your Task
Fix the SQL to correct the error. Respond with ONLY a JSON object:
{
  "sql": "the corrected SQL query",
  "explanation": "brief explanation of what was wrong and how you fixed it"
}`;

		try {
			const text = await this.generateText({ prompt, temperature: 0.2, maxOutputTokens: 2048 });
			const parsed = extractJsonObject(text);
			if (parsed && typeof parsed.sql === 'string') {
				return {
					sql: parsed.sql,
					explanation:
						typeof parsed.explanation === 'string' ? parsed.explanation : 'SQL corrected',
				};
			}
		} catch (error) {
			console.error('Failed to fix SQL:', error);
		}

		return null;
	}

	async generateOverview(datasets: DatasetProfile[]): Promise<DashboardSpec> {
		const schemaContext = GeminiCompiler.generateSchemaContext(datasets);
		const prompt = getOverviewPrompt(schemaContext);

		try {
			const text = await this.generateText({ prompt, temperature: 0.3, maxOutputTokens: 4096 });
			const toonText = extractToon(text);
			const parsed = parseToon(toonText);

			if (parsed._type !== 'dashboard') {
				throw new Error(`Expected @dashboard but got @${parsed._type || 'unknown'}`);
			}

			return parsed as unknown as DashboardSpec;
		} catch (error) {
			console.error('Failed to generate overview:', error);
			return {
				_type: 'dashboard',
				title: 'Data Overview',
				panels: [],
			};
		}
	}

	async explainError(context: {
		question: string;
		sql: string;
		error?: string;
		rowCount?: number;
		datasets: DatasetProfile[];
	}): Promise<{ explanation: string; suggestions: string[] }> {
		const schemaContext = GeminiCompiler.generateSchemaContext(context.datasets);

		const prompt = `You are a helpful data analyst assistant. A user asked a question that resulted in an issue.

## User's Question
"${context.question}"

## Generated SQL
\`\`\`sql
${context.sql}
\`\`\`

## Issue
${context.error ? `SQL Error: ${context.error}` : `The query returned ${context.rowCount ?? 0} rows (no data).`}

## Available Data Schema
${schemaContext}

## Your Task
1. Briefly explain WHY this happened (1-2 sentences, be specific about likely causes)
2. Suggest 2-3 alternative questions the user could ask that WOULD work with this data

Respond in this exact JSON format:
{
  "explanation": "Brief explanation of why the query failed or returned no data",
  "suggestions": ["Alternative question 1", "Alternative question 2", "Alternative question 3"]
}`;

		try {
			const text = await this.generateText({ prompt, temperature: 0.3, maxOutputTokens: 1024 });
			const parsed = extractJsonObject(text);
			if (parsed) {
				return {
					explanation:
						typeof parsed.explanation === 'string'
							? parsed.explanation
							: 'Unable to determine the cause.',
					suggestions: Array.isArray(parsed.suggestions)
						? parsed.suggestions.filter((value): value is string => typeof value === 'string')
						: [],
				};
			}
		} catch (error) {
			console.error('Failed to explain error:', error);
		}

		return {
			explanation: 'The query did not return the expected results.',
			suggestions: [
				'Try rephrasing your question',
				'Ask about available categories or values first',
			],
		};
	}

	async realignQuestion(context: {
		question: string;
		reason: string;
		datasets: DatasetProfile[];
	}): Promise<{ suggestions: string[] }> {
		const schemaContext = GeminiCompiler.generateSchemaContext(context.datasets);

		const prompt = `You are a helpful data analyst. A user asked a question that cannot be answered with the available data.

## Original Question
"${context.question}"

## Reason It Cannot Be Answered
${context.reason}

## Available Data Schema
${schemaContext}

## Your Task
Suggest 3-5 alternative questions that:
1. Stay as close to the user's original intent as possible
2. Reference REAL columns and values from the schema above
3. Span different analysis angles (e.g., trends, comparisons, distributions, top-N)
4. Are specific enough to produce useful visualizations
5. Are written in plain, conversational English.

Respond in this exact JSON format:
{
  "suggestions": ["Question 1", "Question 2", "Question 3"]
}`;

		try {
			const text = await this.generateText({ prompt, temperature: 0.5, maxOutputTokens: 1024 });
			const parsed = extractJsonObject(text);
			if (parsed && Array.isArray(parsed.suggestions)) {
				return {
					suggestions: parsed.suggestions.filter(
						(value): value is string => typeof value === 'string',
					),
				};
			}
		} catch (error) {
			console.error('Failed to realign question:', error);
		}

		return { suggestions: [] };
	}

	async generateExecutiveSummary(context: {
		question: string;
		panels: Array<{
			title: string;
			type: string;
			data: Record<string, unknown>[];
			columns: string[];
			narrative?: string;
			recommendations?: string[];
		}>;
	}): Promise<{
		dashboardSummary: string;
		panelSummaries: string[];
		insightNarratives?: Record<string, string>;
	}> {
		const hasInsightPanels = context.panels.some((panel) => panel.type === 'insight');

		const panelDataSummaries = context.panels
			.map((panel, i) => {
				const sampleRows = panel.data.slice(0, 10);
				const dataPreview = sampleRows.length > 0 ? JSON.stringify(sampleRows, null, 2) : 'No data';
				let section = `### Panel ${i + 1}: ${panel.title} (${panel.type})\nColumns: ${panel.columns.join(', ')}\nRow count: ${panel.data.length}\nData sample:\n\`\`\`json\n${dataPreview}\n\`\`\``;
				if (panel.type === 'insight' && panel.narrative) {
					section += `\nDraft narrative: ${panel.narrative}`;
					if (panel.recommendations?.length) {
						section += `\nDraft recommendations: ${panel.recommendations.join('; ')}`;
					}
				}
				return section;
			})
			.join('\n\n');

		const insightInstructions = hasInsightPanels
			? '\n3. For each insight panel (type "insight"), write an enriched narrative that incorporates actual numbers from query results. Add them in "insightNarratives" keyed by panel index.'
			: '';
		const insightFormat = hasInsightPanels
			? ',\n  "insightNarratives": {"<panel_index>": "Enriched narrative with real numbers..."}'
			: '';

		const prompt = `You are a senior data analyst writing executive summaries for business stakeholders.

## User's Question
"${context.question}"

## Query Results
${panelDataSummaries}

## Your Task
Analyze the actual data and write:
1. An overall executive summary (2-3 sentences) that directly answers the user's question with specific numbers and key insights.
2. A brief summary for each panel (1 sentence each)${insightInstructions}

Respond in this exact JSON format:
{
  "dashboardSummary": "Overall executive summary",
  "panelSummaries": ["Summary for panel 1", "Summary for panel 2"]${insightFormat}
}`;

		try {
			const text = await this.generateText({ prompt, temperature: 0.4, maxOutputTokens: 2048 });
			const parsed = extractJsonObject(text);
			if (parsed) {
				const insightNarratives =
					parsed.insightNarratives && typeof parsed.insightNarratives === 'object'
						? Object.fromEntries(
								Object.entries(parsed.insightNarratives).filter(
									([, value]) => typeof value === 'string',
								),
							)
						: undefined;
				return {
					dashboardSummary:
						typeof parsed.dashboardSummary === 'string' ? parsed.dashboardSummary : '',
					panelSummaries: Array.isArray(parsed.panelSummaries)
						? parsed.panelSummaries.filter((value): value is string => typeof value === 'string')
						: [],
					insightNarratives,
				};
			}
		} catch (error) {
			console.error('Failed to generate executive summary:', error);
		}

		return {
			dashboardSummary: '',
			panelSummaries: [],
		};
	}

	private async generateText(options: {
		prompt: string;
		temperature?: number;
		maxOutputTokens?: number;
	}): Promise<string> {
		if (this.config.provider === 'claude') {
			return this.generateTextWithClaude(options);
		}
		return this.generateTextWithOpenAICompat(options);
	}

	private async generateTextWithOpenAICompat(options: {
		prompt: string;
		temperature?: number;
		maxOutputTokens?: number;
	}): Promise<string> {
		const defaultBaseUrl = this.config.provider === 'openai' ? 'https://api.openai.com/v1' : '';
		const baseUrl = (this.config.baseUrl || defaultBaseUrl).trim();
		if (!baseUrl) {
			throw new Error('Base URL is required for custom OpenAI-compatible providers.');
		}

		const response = await fetch(joinUrl(baseUrl, 'chat/completions'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.config.apiKey}`,
			},
			body: JSON.stringify({
				model: this.config.model,
				messages: [{ role: 'user', content: options.prompt }],
				temperature: options.temperature,
				max_tokens: options.maxOutputTokens,
			}),
		});

		if (!response.ok) {
			const details = await response.text();
			throw new Error(`LLM request failed (${response.status}): ${details.slice(0, 300)}`);
		}

		const payload = (await response.json()) as {
			choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
		};
		const content = payload.choices?.[0]?.message?.content;
		if (typeof content === 'string') return content;
		if (Array.isArray(content)) {
			return content
				.filter((part) => part?.type === 'text' && typeof part.text === 'string')
				.map((part) => part.text)
				.join('\n');
		}
		return '';
	}

	private async generateTextWithClaude(options: {
		prompt: string;
		temperature?: number;
		maxOutputTokens?: number;
	}): Promise<string> {
		const baseUrl = (this.config.baseUrl || 'https://api.anthropic.com').trim();

		const response = await fetch(joinUrl(baseUrl, 'v1/messages'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.config.apiKey,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: this.config.model,
				temperature: options.temperature,
				max_tokens: options.maxOutputTokens ?? 2048,
				messages: [{ role: 'user', content: options.prompt }],
			}),
		});

		if (!response.ok) {
			const details = await response.text();
			throw new Error(`Claude request failed (${response.status}): ${details.slice(0, 300)}`);
		}

		const payload = (await response.json()) as {
			content?: Array<{ type?: string; text?: string }>;
		};
		return (payload.content || [])
			.filter((part) => part?.type === 'text' && typeof part.text === 'string')
			.map((part) => part.text)
			.join('\n');
	}
}

function joinUrl(base: string, path: string): string {
	const normalizedBase = base.replace(/\/+$/, '');
	const normalizedPath = path.replace(/^\/+/, '');
	return `${normalizedBase}/${normalizedPath}`;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return null;
	try {
		const parsed = JSON.parse(match[0]);
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}
