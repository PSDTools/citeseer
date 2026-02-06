/**
 * Gemini compiler service - compiles natural language questions to analytical plans.
 */

import { GoogleGenAI } from '@google/genai';
import { parseToon, extractToon, ToonParseError } from './toon-parser';
import { getSystemPrompt, getOverviewPrompt } from './prompts';
import type { AnalyticalPlan, BranchContext, DashboardSpec, DatasetProfile } from '$lib/types/toon';
import type { ForecastSelectionContext, ForecastStrategyDecision } from '$lib/server/forecast';

const MAX_RETRIES = 3;

export interface CompilerConfig {
	apiKey: string;
	model?: string;
}

export class GeminiCompiler {
	private client: GoogleGenAI;
	private model: string;

	constructor(config: CompilerConfig) {
		this.client = new GoogleGenAI({ apiKey: config.apiKey });
		this.model = config.model || 'gemini-2.0-flash';
	}

	/**
	 * Generate schema context string for the LLM from dataset profiles.
	 */
	static generateSchemaContext(datasets: DatasetProfile[]): string {
		if (datasets.length === 0) {
			return 'No datasets available.';
		}

		const lines: string[] = [];

		for (const dataset of datasets) {
			lines.push(`### Dataset: ${dataset.name} (${dataset.rowCount} rows)`);
			lines.push(`Dataset ID: ${dataset.id}`);
			lines.push('');
			lines.push('| Column | Type | Role | Sample Values | Notes |');
			lines.push('|--------|------|------|---------------|-------|');

			for (const col of dataset.columns) {
				const role = col.isTimestamp
					? 'timestamp'
					: col.isMetric
						? 'metric'
						: col.isEntityId
							? 'entity_id'
							: col.isCategorical
								? 'categorical'
								: 'text';
				const samples = col.sampleValues?.slice(0, 3).join(', ') || '';

				// Add notes for timestamp columns about their format
				let notes = '';
				if (col.isTimestamp && samples) {
					if (/^\d{4}-\d{2}$/.test(String(col.sampleValues?.[0] || ''))) {
						notes = 'YYYY-MM format, USE THIS for monthly time series';
					} else if (/^\d{4}-\d{2}-\d{2}/.test(String(col.sampleValues?.[0] || ''))) {
						notes = 'ISO date format';
					}
				}

				lines.push(`| ${col.name} | ${col.dtype} | ${role} | ${samples} | ${notes} |`);
			}

			lines.push('');
		}

		return lines.join('\n');
	}

	/**
	 * Compile a natural language question into an analytical plan.
	 */
	async compileQuestion(
		question: string,
		datasets: DatasetProfile[],
		branchContext?: BranchContext
	): Promise<AnalyticalPlan> {
		const schemaContext = GeminiCompiler.generateSchemaContext(datasets);
		const systemPrompt = getSystemPrompt(schemaContext, branchContext);

		let lastError: Error | null = null;
		let formatHint = '';

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				const response = await this.client.models.generateContent({
					model: this.model,
					contents: [
						{
							role: 'user',
							parts: [{ text: systemPrompt + '\n\nQuestion: ' + question + formatHint }]
						}
					],
					config: {
						temperature: 0.3,
						maxOutputTokens: 4096
					}
				});

				const text = response.text || '';
				const toonText = extractToon(text);
				const parsed = parseToon(toonText);

				// Validate it's a plan
				if (parsed._type !== 'plan') {
					throw new Error(`Expected @plan but got @${parsed._type || 'unknown'}`);
				}

				return parsed as unknown as AnalyticalPlan;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				console.error(`Attempt ${attempt + 1} failed:`, lastError.message);

				// Don't retry on parse errors - the model needs different prompting
				if (error instanceof ToonParseError) {
					break;
				}

				// Add format hint for next retry
				formatHint =
					'\n\nIMPORTANT: You MUST respond with a @plan{...} object in TOON format. Do not use JSON or any other format.';
			}
		}

		// Return a refusal plan on failure
		return {
			_type: 'plan',
			q: question,
			feasible: false,
			reason: `Failed to compile question: ${lastError?.message || 'Unknown error'}`,
			tables: [],
			suggestedInvestigations: [
				'Try rephrasing your question',
				'Check if the required data is available'
			]
		};
	}

	/**
	 * Select a forecasting strategy based on time series characteristics.
	 */
	async selectForecastStrategy(
		context: ForecastSelectionContext
	): Promise<ForecastStrategyDecision | null> {
		const prompt = `You are a time series forecasting strategist.

Choose the best forecasting approach for the given series and question.
You must pick ONE strategy from:
linear, drift, moving_average, exp_smoothing, seasonal_naive

Return ONLY a JSON object with:
{
  "strategy": "linear|drift|moving_average|exp_smoothing|seasonal_naive",
  "horizon": <integer>,
  "window": <integer optional>,
  "alpha": <number 0-1 optional>,
  "seasonLength": <integer optional>,
  "confidence": "high|medium|low"
}

Question: ${context.question}
Panel: ${context.panelTitle}
Cadence: ${context.cadence}
Default horizon: ${context.defaultHorizon}

Stats:
- points: ${context.stats.points}
- mean: ${context.stats.mean}
- stdDev: ${context.stats.stdDev}
- cv: ${context.stats.cv}
- slope: ${context.stats.slope}
- r2: ${context.stats.r2}
- lastValue: ${context.stats.lastValue}
- min: ${context.stats.min}
- max: ${context.stats.max}
- seasonLength: ${context.stats.seasonLength ?? 'none'}
- seasonStrength: ${context.stats.seasonStrength ?? 'none'}

Recent points (tail):
${context.sampleTail.map((p) => `- ${p.x}: ${p.y}`).join('\n')}

Guidelines:
- Prefer seasonal_naive only if seasonLength is present and seasonStrength >= 0.4.
- Prefer linear or drift if there is a strong trend (r2 >= 0.5).
- Prefer exp_smoothing for noisy series with weak trend.
- Use moving_average for short or stable series.
- Horizon should align with the question; otherwise use Default horizon.
`;

		try {
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				config: { temperature: 0.2, maxOutputTokens: 512 }
			});

			const text = response.text || '';
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (!jsonMatch) return null;

			const parsed = JSON.parse(jsonMatch[0]) as ForecastStrategyDecision;
			const allowed = new Set([
				'linear',
				'drift',
				'moving_average',
				'exp_smoothing',
				'seasonal_naive'
			]);
			if (!parsed?.strategy || !allowed.has(parsed.strategy)) return null;

			const horizon = Number(parsed.horizon);
			if (!Number.isFinite(horizon) || horizon <= 0) return null;

			return {
				strategy: parsed.strategy,
				horizon,
				window: parsed.window ? Number(parsed.window) : undefined,
				alpha: parsed.alpha ? Number(parsed.alpha) : undefined,
				seasonLength: parsed.seasonLength ? Number(parsed.seasonLength) : undefined,
				confidence: parsed.confidence
			};
		} catch (error) {
			console.error('Failed to select forecast strategy:', error);
		}

		return null;
	}

	/**
	 * Fix a SQL query that resulted in an error.
	 */
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
-- Clean currency like "$1,234.56" or percentages like "25%"
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
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				config: { temperature: 0.2, maxOutputTokens: 2048 }
			});

			const text = response.text || '';
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				if (parsed.sql && typeof parsed.sql === 'string') {
					return {
						sql: parsed.sql,
						explanation: parsed.explanation || 'SQL corrected'
					};
				}
			}
		} catch (error) {
			console.error('Failed to fix SQL:', error);
		}

		return null;
	}

	/**
	 * Generate an overview dashboard for the available datasets.
	 */
	async generateOverview(datasets: DatasetProfile[]): Promise<DashboardSpec> {
		const schemaContext = GeminiCompiler.generateSchemaContext(datasets);
		const prompt = getOverviewPrompt(schemaContext);

		try {
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: [
					{
						role: 'user',
						parts: [{ text: prompt }]
					}
				],
				config: {
					temperature: 0.3,
					maxOutputTokens: 4096
				}
			});

			const text = response.text || '';
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
				panels: []
			};
		}
	}

	/**
	 * Explain a query error and suggest fixes.
	 */
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
}

Be helpful and specific. Reference actual column names and values from the schema when possible.`;

		try {
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				config: { temperature: 0.3, maxOutputTokens: 1024 }
			});

			const text = response.text || '';
			// Extract JSON from response (may be wrapped in markdown)
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				return {
					explanation: parsed.explanation || 'Unable to determine the cause.',
					suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
				};
			}
		} catch (error) {
			console.error('Failed to explain error:', error);
		}

		return {
			explanation: 'The query did not return the expected results.',
			suggestions: [
				'Try rephrasing your question',
				'Ask about available categories or values first'
			]
		};
	}

	/**
	 * Suggest alternative questions when the original question is infeasible.
	 */
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
5. Are written in plain, conversational English — like a human would naturally ask (e.g., "What are the top 10 industries by emissions?" not "SELECT NAICS_code GROUP BY emissions ORDER BY DESC LIMIT 10")

Respond in this exact JSON format:
{
  "suggestions": ["Question 1", "Question 2", "Question 3"]
}`;

		try {
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				config: { temperature: 0.5, maxOutputTokens: 1024 }
			});

			const text = response.text || '';
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				if (Array.isArray(parsed.suggestions)) {
					return { suggestions: parsed.suggestions };
				}
			}
		} catch (error) {
			console.error('Failed to realign question:', error);
		}

		return { suggestions: [] };
	}

	/**
	 * Generate executive summaries for dashboard panels based on actual query results.
	 * This analyzes the real data to produce actionable insights.
	 */
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
		// Format panel data for the prompt
		const hasInsightPanels = context.panels.some((p) => p.type === 'insight');

		const panelDataSummaries = context.panels
			.map((panel, i) => {
				const sampleRows = panel.data.slice(0, 10);
				const dataPreview = sampleRows.length > 0 ? JSON.stringify(sampleRows, null, 2) : 'No data';
				let section = `### Panel ${i + 1}: ${panel.title} (${panel.type})
Columns: ${panel.columns.join(', ')}
Row count: ${panel.data.length}
Data sample:
\`\`\`json
${dataPreview}
\`\`\``;
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
			? `\n3. For each insight panel (type "insight"), write an enriched narrative that incorporates the ACTUAL numbers from the query results. Replace vague language with specific data points. Include the enriched narratives in the "insightNarratives" field keyed by panel index (e.g., "0", "1").`
			: '';

		const insightFormat = hasInsightPanels
			? `,\n  "insightNarratives": {"<panel_index>": "Enriched narrative with real numbers..."}`
			: '';

		const prompt = `You are a senior data analyst writing executive summaries for business stakeholders.

## User's Question
"${context.question}"

## Query Results
${panelDataSummaries}

## Your Task
Analyze the actual data and write:
1. An overall executive summary (2-3 sentences) that directly answers the user's question with specific numbers and key insights. After stating what happened, project forward: what does this trend suggest? What risks exist?
2. A brief summary for each panel (1 sentence each) highlighting the most important finding${insightInstructions}

**Guidelines:**
- Use specific numbers from the data (e.g., "Revenue increased 23% from $1.2M to $1.48M")
- Highlight trends, outliers, or notable patterns
- Be direct and actionable - what should the reader take away?
- If data shows concerning trends, mention them
- After stating what happened, project forward: what is the likely trajectory?
- Identify risks or opportunities the data suggests
- End the dashboard summary with one clear action item or recommendation
- Keep language business-focused, not technical
- For confidence qualifiers: use "strongly suggests" for 100+ data points with clear trends, "indicates" for 30-100 points, "preliminary data suggests" for fewer points

Respond in this exact JSON format:
{
  "dashboardSummary": "Overall executive summary with key numbers, forward projection, and one action item",
  "panelSummaries": ["Summary for panel 1", "Summary for panel 2", ...]${insightFormat}
}`;

		try {
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				config: { temperature: 0.4, maxOutputTokens: 2048 }
			});

			const text = response.text || '';
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				return {
					dashboardSummary: parsed.dashboardSummary || '',
					panelSummaries: Array.isArray(parsed.panelSummaries) ? parsed.panelSummaries : [],
					insightNarratives: parsed.insightNarratives || undefined
				};
			}
		} catch (error) {
			console.error('Failed to generate executive summary:', error);
		}

		return {
			dashboardSummary: '',
			panelSummaries: []
		};
	}
}
