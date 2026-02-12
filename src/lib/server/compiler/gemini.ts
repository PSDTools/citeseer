/**
 * Gemini compiler service - compiles natural language questions to analytical plans.
 */

import { GoogleGenAI } from '@google/genai';
import { BaseCompiler, extractJsonObject } from './base-compiler';
import type { ForecastSelectionContext, ForecastStrategyDecision } from '$lib/server/forecast';

interface CompilerConfig {
	apiKey: string;
	model?: string;
}

export class GeminiCompiler extends BaseCompiler {
	private client: GoogleGenAI;
	private model: string;

	constructor(config: CompilerConfig) {
		super();
		this.client = new GoogleGenAI({ apiKey: config.apiKey });
		this.model = config.model || 'gemini-2.0-flash';
	}

	protected async generateText(options: {
		prompt: string;
		temperature?: number;
		maxOutputTokens?: number;
	}): Promise<string> {
		const response = await this.client.models.generateContent({
			model: this.model,
			contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
			config: {
				temperature: options.temperature,
				maxOutputTokens: options.maxOutputTokens,
			},
		});

		return response.text || '';
	}

	/**
	 * Select a forecasting strategy based on time series characteristics.
	 */
	async selectForecastStrategy(
		context: ForecastSelectionContext,
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
			const text = await this.generateText({
				prompt,
				temperature: 0.2,
				maxOutputTokens: 512,
			});

			const parsed = extractJsonObject(text) as unknown as ForecastStrategyDecision | null;
			if (!parsed) return null;

			const allowed = new Set([
				'linear',
				'drift',
				'moving_average',
				'exp_smoothing',
				'seasonal_naive',
			]);
			if (!parsed.strategy || !allowed.has(parsed.strategy)) return null;

			const horizon = Number(parsed.horizon);
			if (!Number.isFinite(horizon) || horizon <= 0) return null;

			return {
				strategy: parsed.strategy,
				horizon,
				window: parsed.window ? Number(parsed.window) : undefined,
				alpha: parsed.alpha ? Number(parsed.alpha) : undefined,
				seasonLength: parsed.seasonLength ? Number(parsed.seasonLength) : undefined,
				confidence: parsed.confidence,
			};
		} catch (error) {
			console.error('Failed to select forecast strategy:', error);
		}

		return null;
	}
}
